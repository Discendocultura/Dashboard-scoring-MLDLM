import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeColumnas, sanitizeConfigTableros, tablerosDe, tableroDeTarea, columnaDeTarea, colocar, GENERAL, sanitizeEtiquetas, etiquetasDeTarea, ordenTarjetas, ordenColumna, recolocar, ordenarTableros, alFinal, sanitizeTablero, sanitizeChecklist, progresoChecklist, copiaRecurrente, tableroPorDefecto } from '../public/js/tableros.js';

test('tableros: columnas (siempre una «hecha»), General de serie y columna de cada tarea', () => {
  const cols = sanitizeColumnas([{ nombre: 'Idea' }, { nombre: 'Guion' }, { nombre: '' }, { nombre: 'Publicado' }]);
  assert.deepEqual(cols.map((c) => [c.nombre, c.hecha]), [['Idea', false], ['Guion', false], ['Publicado', true]]);
  assert.equal(sanitizeColumnas([]).length, 3); // vacío → las de serie
  const cfg = sanitizeConfigTableros({ tableros: [{ id: 'cont', proyecto: 'mldlm', nombre: 'Contenido', columnas: cols }] });
  const tabs = tablerosDe(cfg, 'mldlm');
  assert.deepEqual(tabs.map((b) => b.id), [GENERAL, 'cont']);
  assert.equal(tablerosDe(cfg, 'otro').length, 1);
  const cont = tabs[1];
  assert.equal(tableroDeTarea({ opTablero: 'cont' }, tabs).id, 'cont');
  assert.equal(tableroDeTarea({ opTablero: 'borrado' }, tabs).id, GENERAL);
  assert.equal(columnaDeTarea({ hecha: true }, cont), cols[2].id);
  assert.equal(columnaDeTarea({}, cont), cols[0].id);
  assert.equal(columnaDeTarea({ opColumna: cols[1].id }, cont), cols[1].id);
  assert.equal(columnaDeTarea({ estado: 'revision' }, tabs[0]), 'revision');
  // Hecha pero guardada en una columna que no es de hecha (p. ej. la marcó desde su lanzamiento) → la de hecha.
  assert.equal(columnaDeTarea({ opColumna: cols[0].id, hecha: true }, cont), cols[2].id);
  assert.deepEqual(colocar({}, cont, cols[2].id), { opTablero: 'cont', opColumna: cols[2].id, hecha: true, estado: 'hecha' });
  assert.equal(colocar({}, tabs[0], 'revision').estado, 'revision');
});

const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
let route;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
});
async function call(path, { method = 'GET', body, cookie } = {}) {
  const res = await route(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'text/plain' }, body: body ? JSON.stringify(body) : undefined }), ENV);
  return { status: res.status, data: await res.json().catch(() => null), res };
}

test('tableros (API): el superadmin crea un tablero con plantilla, crea tareas en él y las mueve de columna', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const post = (body) => call('/api/operativa', { method: 'POST', cookie: admin, body });
  let r = await post({ op: 'plantilla-guardar', plantilla: { nombre: 'Contenido', columnas: [{ nombre: 'Idea' }, { nombre: 'Edición' }, { nombre: 'Publicado', hecha: true }] } });
  assert.equal(r.data.plantillas.length, 1);
  r = await post({ op: 'tablero-guardar', tablero: { proyecto: 'mldlm', nombre: 'Contenido', columnas: r.data.plantillas[0].columnas } });
  const tab = r.data.tableros.find((b) => b.nombre === 'Contenido');
  assert.ok(tab);
  // Tarea nueva en ese tablero del cliente
  r = await post({ op: 'crear', tarea: { titulo: 'Reel de la clase 1', proyecto: 'mldlm', opTablero: tab.id } });
  const id = r.data.tarea.id;
  let g = (await call('/api/operativa', { cookie: admin })).data;
  let t = g.tareas.find((x) => x.id === id);
  assert.equal(t.cliente, 'mldlm');
  assert.equal(t.opTablero, tab.id);
  assert.ok(g.tableros.some((b) => b.id === tab.id));
  // A «Edición» y después a «Publicado» (cuenta como hecha)
  r = await post({ op: 'columna', cliente: 'mldlm', code: t.code, id, columna: tab.columnas[1].id });
  assert.equal(r.data.tarea.hecha, false);
  r = await post({ op: 'columna', cliente: 'mldlm', code: t.code, id, columna: tab.columnas[2].id });
  assert.equal(r.data.tarea.hecha, true);
  assert.equal(r.data.tarea.estado, 'hecha');
  // Al General (de vuelta sin hacer)
  r = await post({ op: 'columna', cliente: 'mldlm', code: t.code, id, tablero: GENERAL, columna: 'pendiente' });
  assert.equal(r.data.tarea.opTablero, GENERAL);
  assert.equal(r.data.tarea.hecha, false);
  // El General no se borra; el creado, sí (sus tareas vuelven al General)
  assert.equal((await post({ op: 'tablero-borrar', proyecto: 'mldlm', tableroId: GENERAL })).status, 400);
  r = await post({ op: 'tablero-borrar', proyecto: 'mldlm', tableroId: tab.id });
  assert.ok(!r.data.tableros.some((b) => b.id === tab.id));
  // Quien no es de la agencia no entra
  const setter = (await call('/api/login', { method: 'POST', body: { password: 'setter' } })).res.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/operativa', { method: 'POST', cookie: setter, body: { op: 'tablero-guardar', tablero: { proyecto: 'mldlm', nombre: 'X' } } })).status, 403);
});

test('tableros (API): el ancho de las columnas se guarda en la cuenta de cada persona', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const r = await call('/api/operativa', { method: 'POST', cookie: admin, body: { op: 'mis-anchos', anchos: { 'mldlm|general': { pendiente: 420, hecha: 99999, mal: 'x' } } } });
  assert.deepEqual(r.data.misAnchos, { 'mldlm|general': { pendiente: 420 } });
  // Otra sesión de la misma persona los recibe
  const otra = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  assert.deepEqual((await call('/api/operativa', { cookie: otra })).data.misAnchos, { 'mldlm|general': { pendiente: 420 } });
});

test('tableros: etiquetas, orden por prioridad, checklist y copia de una tarea que se repite', () => {
  const cat = sanitizeEtiquetas([{ id: 'urg', nombre: 'Urgente', color: 'rojo' }, { nombre: 'Diseño', color: 'fucsia' }, { nombre: '' }]);
  assert.equal(cat.length, 2);
  assert.equal(cat[1].color, 'gris'); // color desconocido → gris
  assert.deepEqual(etiquetasDeTarea({ etiquetas: ['urg', 'borrada'] }, cat).map((e) => e.nombre), ['Urgente']);
  const ts = [{ id: 'a', fecha: '2030-01-05' }, { id: 'b', prioridad: 'baja', fecha: '2030-01-01' }, { id: 'c', prioridad: 'alta' }, { id: 'd', fecha: '2030-01-02' }];
  assert.deepEqual([...ts].sort(ordenTarjetas).map((t) => t.id), ['c', 'b', 'd', 'a']);
  const ck = sanitizeChecklist([{ texto: 'Grabar' , hecho: true }, { texto: '' }, { texto: 'Editar' }]);
  assert.equal(ck.length, 2);
  assert.deepEqual(progresoChecklist({ checklist: ck }), { hechos: 1, total: 2 });
  const t = { id: 't1', titulo: 'Informe semanal', notas: '<p>Paso a paso</p>', fecha: '2030-01-06', asignado: { tipo: 'persona', id: 'u1' }, etiquetas: ['urg'], prioridad: 'alta',
    checklist: ck, repetir: { tipo: 'semanal' }, proyecto: 'mldlm', opTablero: 'cont', opColumna: 'fin', hecha: true, estado: 'hecha', hechaEn: 'x', comentarios: [{ texto: 'hola' }] };
  const n = copiaRecurrente(t, { hoy: '2030-01-06', id: 't2', siguiente: '2030-01-13' });
  assert.equal(n.fecha, '2030-01-13');
  assert.equal(n.repiteDe, 't1');
  assert.equal(n.hecha, false);
  assert.equal(n.estado, 'pendiente');
  assert.equal(n.opColumna, undefined); // vuelve a la primera columna de su tablero
  assert.equal(n.opTablero, 'cont');
  assert.deepEqual(n.etiquetas, ['urg']);
  assert.deepEqual(n.asignado, t.asignado);
  assert.equal(n.notas, t.notas);
  assert.ok(n.checklist.every((c) => !c.hecho));
  assert.equal(t.checklist[0].hecho, true); // la original no cambia
  assert.deepEqual(n.comentarios, []);
});

test('tableros (API): etiquetas comunes, prioridad, checklist y al completar una que se repite se crea la siguiente', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const post = (body) => call('/api/operativa', { method: 'POST', cookie: admin, body });
  let r = await post({ op: 'etiqueta-crear', nombre: 'Urgente', color: 'rojo' });
  const urg = r.data.nueva;
  assert.ok(r.data.etiquetas.some((e) => e.id === urg && e.color === 'rojo'));
  r = await post({ op: 'etiqueta-crear', nombre: 'urgente', color: 'azul' }); // mismo nombre → la misma
  assert.equal(r.data.nueva, urg);
  assert.equal(r.data.etiquetas.filter((e) => e.nombre.toLowerCase() === 'urgente').length, 1);
  r = await post({ op: 'crear', tarea: { titulo: 'Informe semanal de anuncios', proyecto: 'mldlm', fecha: '2030-01-06' } });
  const id = r.data.tarea.id;
  const t = (await call('/api/operativa', { cookie: admin })).data.tareas.find((x) => x.id === id);
  const ref = { cliente: t.cliente, code: t.code, id };
  r = await post({ ...ref, op: 'etiquetas', etiquetas: [urg, 'no-existe'] });
  assert.deepEqual(r.data.tarea.etiquetas, [urg]);
  r = await post({ ...ref, op: 'prioridad', prioridad: 'alta' });
  assert.equal(r.data.tarea.prioridad, 'alta');
  assert.equal((await post({ ...ref, op: 'prioridad', prioridad: 'altísima' })).data.tarea.prioridad, '');
  await post({ ...ref, op: 'prioridad', prioridad: 'alta' });
  r = await post({ ...ref, op: 'checklist', checklist: [{ texto: 'Exportar datos', hecho: true }, { texto: 'Enviar al cliente' }] });
  assert.equal(r.data.tarea.checklist.length, 2);
  r = await post({ ...ref, op: 'repetir', repetir: { tipo: 'semanal' } });
  assert.equal(r.data.tarea.repetir.tipo, 'semanal');
  // Completar → la siguiente, igual, para dentro de una semana
  r = await post({ ...ref, op: 'estado', estado: 'hecha' });
  assert.equal(r.data.tarea.hecha, true);
  const nueva = r.data.nueva;
  assert.ok(nueva);
  assert.equal(nueva.fecha, '2030-01-13');
  assert.equal(nueva.titulo, 'Informe semanal de anuncios');
  assert.deepEqual(nueva.etiquetas, [urg]);
  assert.equal(nueva.prioridad, 'alta');
  assert.equal(nueva.hecha, false);
  assert.ok(nueva.checklist.every((c) => !c.hecho));
  // Reabrir y volver a completar no crea otra
  await post({ ...ref, op: 'estado', estado: 'pendiente' });
  r = await post({ ...ref, op: 'estado', estado: 'hecha' });
  assert.equal(r.data.nueva, undefined);
  const todas = (await call('/api/operativa', { cookie: admin })).data.tareas.filter((x) => x.titulo === 'Informe semanal de anuncios');
  assert.equal(todas.length, 2);
  // Borrar etiquetas: solo el superadmin
  const setter = (await call('/api/login', { method: 'POST', body: { password: 'setter' } })).res.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/operativa', { method: 'POST', cookie: setter, body: { op: 'etiqueta-borrar', id: urg } })).status, 403);
});

test('tableros (API): se repite cada mes el día 5 → la siguiente cae el día 5', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const post = (body) => call('/api/operativa', { method: 'POST', cookie: admin, body });
  let r = await post({ op: 'crear', tarea: { titulo: 'Facturas del mes', proyecto: 'mldlm', fecha: '2030-03-05' } });
  const t = (await call('/api/operativa', { cookie: admin })).data.tareas.find((x) => x.id === r.data.tarea.id);
  const ref = { cliente: t.cliente, code: t.code, id: t.id };
  r = await post({ ...ref, op: 'repetir', repetir: { tipo: 'mensual', dia: 5, dias: [1] } });
  assert.deepEqual(r.data.tarea.repetir, { tipo: 'mensual', n: 0, dia: 5 });
  r = await post({ ...ref, op: 'estado', estado: 'hecha' });
  assert.equal(r.data.nueva.fecha, '2030-04-05');
  assert.deepEqual(r.data.nueva.repetir, { tipo: 'mensual', n: 0, dia: 5 });
});

test('tableros: importar desde archivo (formato propio y export de Asana) y a quién se asigna', async () => {
  const { normalizarImportacion, personaDe } = await import('../public/js/tableros-import.js');
  const propio = normalizarImportacion({ formato: 'tablero-operativa', nombre: 'Diario', columnas: [{ nombre: 'Ideas' }, { nombre: 'Esta semana' }, { nombre: 'Hecho', hecha: true }],
    tareas: [{ titulo: 'Uno', columna: 'Esta semana', checklist: ['a', { texto: 'b', hecho: true }, ''] }, { titulo: 'Dos', columna: 7 }, { titulo: '' }] });
  assert.equal(propio.nombre, 'Diario');
  assert.deepEqual(propio.tareas.map((t) => [t.titulo, t.columna]), [['Uno', 1], ['Dos', 0]]);
  assert.deepEqual(propio.tareas[0].checklist, [{ texto: 'a', hecho: false }, { texto: 'b', hecho: true }]);
  const asana = normalizarImportacion({ data: [
    { name: 'A', notes: 'línea <1>', due_on: '2030-01-02', assignee: { name: 'Ana Pérez' }, memberships: [{ section: { name: 'Pendiente' } }], subtasks: [{ name: 'sub', completed: true }] },
    { name: 'B', completed: true, memberships: [{ section: { name: 'Cerrado' } }] },
    { name: 'sub', parent: { gid: '1' }, memberships: [{ section: { name: 'Pendiente' } }] },
  ] });
  assert.deepEqual(asana.columnas, [{ nombre: 'Pendiente', hecha: false }, { nombre: 'Cerrado', hecha: true }]);
  assert.equal(asana.tareas.length, 1); // sin las completadas ni las subtareas sueltas
  assert.equal(asana.tareas[0].notas, '<p>línea &lt;1&gt;</p>');
  assert.equal(normalizarImportacion({ data: [{ name: 'B', completed: true, memberships: [{ section: { name: 'Cerrado' } }] }] }, { incluirCompletadas: true }).tareas[0].columna, 0);
  assert.throws(() => normalizarImportacion({ tareas: [] }), /columnas/);
  assert.throws(() => normalizarImportacion({ secciones: [], procesos: [] }), /Biblioteca de procesos/);
  const equipo = [{ id: 'u1', nombre: 'Ana Pérez', email: 'ana@x.es' }, { id: 'u2', nombre: 'Luis Gómez', email: '' }];
  assert.equal(personaDe('ana perez', equipo).id, 'u1');
  assert.equal(personaDe('ANA@x.es', equipo).id, 'u1');
  assert.equal(personaDe('luisgomez99@gmail.com', equipo).id, 'u2'); // por el nombre de pila del email
  assert.equal(personaDe('Marta', equipo), null);
});

test('tableros (API): importar un tablero crea sus columnas y sus tareas en el proyecto', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const post = (body) => call('/api/operativa', { method: 'POST', cookie: admin, body });
  const archivo = { columnas: [{ nombre: 'Foco' }, { nombre: 'Próximo' }, { nombre: 'Cerrado', hecha: true }],
    tareas: [{ titulo: 'Tarea foco', columna: 0, notas: '<h1>Paso</h1><script>x</script>', fecha: '2030-02-01', asignado: 'Nadie Conocido', checklist: ['uno', 'dos'] }, { titulo: 'Tarea cerrada', columna: 2 }] };
  assert.equal((await post({ op: 'importar-tablero', proyecto: 'no-existe', nombre: 'X', archivo })).status, 400);
  const r = await post({ op: 'importar-tablero', proyecto: 'mldlm', nombre: 'Operativa diaria', archivo });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.tareas, 2);
  assert.deepEqual(r.data.sinAsignar, ['Nadie Conocido']);
  assert.deepEqual(r.data.tablero.columnas.map((c) => c.nombre), ['Foco', 'Próximo', 'Cerrado']);
  const g = (await call('/api/operativa', { cookie: admin })).data;
  const foco = g.tareas.find((t) => t.titulo === 'Tarea foco');
  assert.equal(foco.cliente, 'mldlm');
  assert.equal(foco.opTablero, r.data.tablero.id);
  assert.equal(foco.opColumna, r.data.tablero.columnas[0].id);
  assert.equal(foco.checklist.length, 2);
  assert.match(foco.notas, /<h2>Paso<\/h2>/);
  assert.doesNotMatch(foco.notas, /script/);
  assert.equal(g.tareas.find((t) => t.titulo === 'Tarea cerrada').hecha, true);
  const setter = (await call('/api/login', { method: 'POST', body: { password: 'setter' } })).res.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/operativa', { method: 'POST', cookie: setter, body: { op: 'importar-tablero', proyecto: 'mldlm', archivo } })).status, 403);
});

test('orden a mano: las colocadas primero (por opOrden) y las demás con el orden automático', () => {
  const ts = [{ id: 'a', prioridad: 'alta' }, { id: 'b', opOrden: 2 }, { id: 'c', opOrden: 1 }, { id: 'd', fecha: '2026-01-01' }];
  assert.deepEqual([...ts].sort(ordenColumna).map((t) => t.id), ['c', 'b', 'a', 'd']);
});

test('recolocar: pone la tarea en la posición pedida (y al final si se pasa)', () => {
  const [a, b, c] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(recolocar([a, b, c], c, 0).map((t) => t.id), ['c', 'a', 'b']);
  assert.deepEqual(recolocar([a, b, c], a, 1).map((t) => t.id), ['b', 'a', 'c']);
  assert.deepEqual(recolocar([a, b, c], a, Infinity).map((t) => t.id), ['b', 'c', 'a']);
  assert.deepEqual(recolocar([a, b], c, 1).map((t) => t.id), ['a', 'c', 'b']); // llega de otra columna
});

test('tableros: el General se puede renombrar y las pestañas se ordenan a mano', () => {
  assert.equal(sanitizeTablero({ id: GENERAL, proyecto: 'p', nombre: 'Día a día', columnas: [] }).nombre, 'Día a día');
  let cfg = { tableros: [{ id: 'ta', proyecto: 'p', nombre: 'A', columnas: [] }, { id: 'tb', proyecto: 'p', nombre: 'B', columnas: [] }, { id: 'tx', proyecto: 'q', nombre: 'X', columnas: [] }], plantillas: [] };
  assert.deepEqual(tablerosDe(cfg, 'p').map((t) => t.id), [GENERAL, 'ta', 'tb']);
  cfg = ordenarTableros(cfg, 'p', ['tb', GENERAL, 'ta']);
  assert.deepEqual(tablerosDe(cfg, 'p').map((t) => t.id), ['tb', GENERAL, 'ta']);
  assert.deepEqual(tablerosDe(cfg, 'q').map((t) => t.id), [GENERAL, 'tx']); // los de otro proyecto, igual
  const nuevo = alFinal(cfg.tableros, { id: 'tc', proyecto: 'p', nombre: 'C', columnas: [] });
  assert.deepEqual(tablerosDe({ ...cfg, tableros: [...cfg.tableros, nuevo] }, 'p').map((t) => t.id), ['tb', GENERAL, 'ta', 'tc']);
});

test('tableros: uno por defecto por proyecto (si existe); si no, el General', () => {
  const cfg = sanitizeConfigTableros({ tableros: [{ id: 'tcont', proyecto: 'p1', nombre: 'Contenido' }], porDefecto: { p1: 'tcont', p2: 'noexiste', p3: GENERAL } });
  assert.deepEqual(cfg.porDefecto, { p1: 'tcont' });
  assert.equal(tableroPorDefecto(cfg, 'p1'), 'tcont');
  assert.equal(tableroPorDefecto(cfg, 'p2'), GENERAL);
  assert.equal(tableroPorDefecto({}, 'p1'), GENERAL);
});

test('tableros: el de un embudo tiene las columnas de Plan → Tareas (fases, extra y Completadas)', async () => {
  const { columnasEmbudo, colocarPorFase } = await import('../public/js/tableros.js');
  const tab = { id: 'e-lanz', columnas: columnasEmbudo('lanz', [{ id: 'cabc1', label: 'Esperando', icon: '⏳' }]) };
  assert.deepEqual(tab.columnas.map((c) => c.id), ['preparacion', 'captacion', 'clases', 'directo', 'carrito', 'cierre', 'cabc1', 'completadas']);
  assert.deepEqual(columnasEmbudo('vsl').map((c) => c.id), ['preparacion', 'captacion', 'seguimiento', 'optimizacion', 'completadas']);
  // La columna de cada tarea sale de su fase (como en Plan → Tareas).
  assert.equal(columnaDeTarea({ fase: 'directo', opColumna: 'pendiente' }, tab), 'directo');
  assert.equal(columnaDeTarea({ fase: 'directo', columna: 'cabc1' }, tab), 'cabc1');
  assert.equal(columnaDeTarea({ fase: 'directo', hecha: true }, tab), 'completadas');
  assert.equal(columnaDeTarea({ fase: 'rara' }, tab), 'preparacion');
  // Moverla a otra fase cambia su fase; a «Completadas», hecha; sacarla de ahí, pendiente.
  assert.deepEqual(colocar({ fase: 'preparacion', columna: 'cabc1' }, tab, 'carrito'), { opTablero: 'e-lanz', opColumna: '', fase: 'carrito', columna: '', hecha: false, estado: 'pendiente' });
  assert.equal(colocar({ fase: 'carrito' }, tab, 'completadas').hecha, true);
  assert.equal(colocarPorFase({ hecha: true, estado: 'hecha' }, 'e-lanz', 'cierre').estado, 'pendiente');
  assert.equal(colocarPorFase({ estado: 'revision' }, 'e-lanz', 'cierre').estado, 'revision');
  // Un tablero normal sigue igual.
  assert.equal(colocar({}, { id: GENERAL, columnas: sanitizeColumnas([]) }, 'hecha').hecha, true);
});

test('tableros (API): el tablero del lanzamiento en la Operativa es el de Plan → Tareas (por fases)', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  await call('/api/config', { method: 'POST', cookie: admin, body: { launches: { fases1: { name: 'Fases 1', registroTag: 'registro-fases1' } } } });
  const r0 = await call('/api/tareas', { method: 'POST', cookie: admin, body: { l: 'fases1', op: 'crear', tarea: { titulo: 'Grabar anuncios', fase: 'captacion' } } });
  assert.equal(r0.status, 200);
  let g = (await call('/api/operativa', { cookie: admin })).data;
  const t = g.tareas.find((x) => x.code === 'fases1');
  const tab = g.tablerosEmbudo.find((b) => b.id === t.opTablero);
  assert.ok(tab && !('tableroEmbudo' in t));
  assert.deepEqual(tab.columnas.map((c) => c.id), ['preparacion', 'captacion', 'clases', 'directo', 'carrito', 'cierre', 'completadas']);
  assert.equal(columnaDeTarea(t, tab), 'captacion');
  // Arrastrarla a «Webinar en directo» le cambia la fase (y en Plan → Tareas se ve ahí).
  const post = (body) => call('/api/operativa', { method: 'POST', cookie: admin, body });
  let r = await post({ op: 'columna', cliente: t.cliente, code: 'fases1', id: t.id, columna: 'directo' });
  assert.equal(r.data.tarea.fase, 'directo');
  assert.equal(r.data.tarea.hecha, false);
  r = await post({ op: 'columna', cliente: t.cliente, code: 'fases1', id: t.id, columna: 'completadas' });
  assert.equal(r.data.tarea.hecha, true);
  assert.equal((await post({ op: 'columna', cliente: t.cliente, code: 'fases1', id: t.id, columna: 'inventada' })).status, 400);
  const plan = (await call('/api/tareas?l=fases1', { cookie: admin })).data;
  assert.ok(plan.tareas.find((x) => x.id === t.id).hecha);
  // «＋ Añadir tarea» en una fase del tablero: va al lanzamiento, en esa fase.
  r = await post({ op: 'crear', tarea: { titulo: 'Abrir carrito', proyecto: t.cliente, opTablero: tab.id, code: 'fases1', columna: 'carrito' } });
  assert.equal(r.status, 200);
  const plan2 = (await call('/api/tareas?l=fases1', { cookie: admin })).data;
  assert.equal(plan2.tareas.find((x) => x.titulo === 'Abrir carrito').fase, 'carrito');
  // Con un tablero que no es el de ese lanzamiento, no.
  assert.equal((await post({ op: 'crear', tarea: { titulo: 'x', proyecto: t.cliente, opTablero: 'e-otro', code: 'fases1', columna: 'carrito' } })).status, 400);
});
