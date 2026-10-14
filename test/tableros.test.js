import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeColumnas, sanitizeConfigTableros, tablerosDe, tableroDeTarea, columnaDeTarea, colocar, GENERAL, sanitizeEtiquetas, etiquetasDeTarea, ordenTarjetas, sanitizeChecklist, progresoChecklist, copiaRecurrente } from '../public/js/tableros.js';

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
