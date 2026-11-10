// 🚀 Montaje con IA: fases en orden, piezas que hacen falta, la IA guarda (nunca aprueba), solo admin aprueba y reabre,
// pedir cambios, la narrativa aprobada pasa al lanzamiento, el encargo de cada fase y la etiqueta del menú.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { FASES, estadosFases, faseActual, faltanPiezas, piezaCompleta, coloresDe, svgLimpio, limpiarPieza, resumenMontaje, briefFase, promptArranque, piezasDe } from '../public/js/montaje.js';

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
  return { status: res.status, data: await res.json().catch(() => null) };
}
const login = async (password) => {
  const res = await route(new Request('http://localhost/api/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password }) }), ENV);
  return res.headers.get('set-cookie')?.split(';')[0];
};

test('las 6 fases, en orden: solo se abre la siguiente cuando se aprueba la anterior', () => {
  assert.deepEqual(FASES.map((f) => f.id), ['identidad', 'contenido', 'copy', 'paginas', 'mensajes', 'automatizaciones']);
  assert.deepEqual(estadosFases({}).map((x) => x.estado), ['pendiente', 'bloqueada', 'bloqueada', 'bloqueada', 'bloqueada', 'bloqueada']);
  const m = { fases: { identidad: { estado: 'aprobada' }, contenido: { estado: 'revisar' } } };
  assert.deepEqual(estadosFases(m).map((x) => x.estado).slice(0, 3), ['aprobada', 'revisar', 'bloqueada']);
  assert.equal(faseActual(m), 'contenido');
  assert.equal(resumenMontaje(m).texto, 'Fase 2/6 · espera tu aprobado');
  assert.equal(resumenMontaje({}), null);
  // Las páginas son las 4 que se montan en GHL.
  assert.deepEqual(piezasDe('paginas').map((p) => p.id), ['registro', 'gracias', 'grabacion', 'venta']);
});

test('piezas completas: textos, colores, logo y lo montado en GHL (URL y hecho)', () => {
  assert.deepEqual(faltanPiezas('identidad', { piezas: {} }), ['Narrativa', 'Colores', 'Símbolos', 'Logo del lanzamiento']); // tipografías es opcional
  assert.equal(piezaCompleta({ tipo: 'colores' }, { texto: 'Azul #1F4E79 y crema #f5efe6' }), true);
  assert.deepEqual(coloresDe('Azul #1F4E79, crema #f5efe6, otra vez #1f4e79, mal #12'), ['#1f4e79', '#f5efe6']);
  assert.equal(piezaCompleta({ tipo: 'ghl' }, { url: 'https://app.gohighlevel.com/x' }), false);
  assert.equal(piezaCompleta({ tipo: 'ghl' }, { url: 'https://app.gohighlevel.com/x', hecho: true }), true);
  assert.equal(piezaCompleta({ tipo: 'logo' }, { texto: '<svg viewBox="0 0 10 10"></svg>' }), true);
  // El SVG se guarda sin scripts ni eventos, y una URL que no es http(s) no vale.
  assert.doesNotMatch(svgLimpio('<svg onload="x()"><script>alert(1)</script><a href="javascript:x">'), /script|onload|javascript:/i);
  assert.equal(limpiarPieza({ url: 'javascript:alert(1)' }, 'ghl').url, '');
});

test('el encargo de cada fase: pasos, piezas, reglas, cambios pedidos y lo ya aprobado', () => {
  const m = { fases: { identidad: { estado: 'aprobada', piezas: { narrativa: { texto: 'TÍTULO: «La Ruta de la Seda»' }, paleta: { texto: '#112233 #445566' } } }, contenido: { estado: 'cambios', cambios: 'Más clases prácticas.' } } };
  const b = briefFase('contenido', m, { l: { name: 'Enero', precioPrograma: 497 }, code: 'ene', cliente: 'Discendo', ficha: 'FICHA DE PRUEBA' });
  assert.match(b, /Fase 2 de 6: Contenido y producto/);
  assert.match(b, /CAMBIOS PEDIDOS[^]*Más clases prácticas/);
  assert.match(b, /«clases»[^]*«producto»[^]*«oferta»/);
  assert.match(b, /La Ruta de la Seda/); // lo aprobado de la fase 1
  assert.match(b, /Programa: 497 €/);
  assert.match(b, /FICHA DE PRUEBA/);
  assert.match(b, /Nunca publiques, envíes ni programes/);
  assert.match(briefFase('paginas', {}, { l: { name: 'Enero' }, code: 'ene' }), /API de GHL no crea páginas/);
  assert.match(promptArranque({ code: 'ene', nombre: 'Enero', clienteId: 'discendo' }), /montaje_lanzamiento[^]*"discendo"[^]*"ene"/);
});

test('flujo completo: la IA entrega, se piden cambios, solo admin aprueba, la narrativa pasa al lanzamiento', async () => {
  const admin = await login('admin');
  const setter = await login('setter');
  const cfg = await call('/api/config', { cookie: admin });
  const launches = { ...cfg.data.config.launches, ene: { name: 'Enero', fechaDirecto: '2027-01-20', horaDirecto: '19:00', precioPrograma: 497 } };
  assert.equal((await call('/api/config', { method: 'POST', cookie: admin, body: { ...cfg.data.config, launches, _version: cfg.data.version } })).status, 200);

  // Sin permiso de configuración (setter) no entra.
  assert.equal((await call('/api/montaje?l=ene', { cookie: setter })).status, 403);
  const g = await call('/api/montaje?l=ene', { cookie: admin });
  assert.equal(g.status, 200);
  assert.equal(g.data.admin, true);
  assert.match(g.data.brief.identidad, /Prompt de narrativa/);
  assert.deepEqual(g.data.piezas.automatizaciones.map((p) => p.id), ['wf-registro', 'wf-carrito-abandonado', 'wf-compra', 'wf-bonus']); // los workflows del lanzamiento
  assert.equal((await call('/api/montaje?l=no-existe', { cookie: admin })).status, 404);

  const { TOOLS } = await import('../lib/mcp-tools.js');
  const tool = (n) => TOOLS.find((t) => t.name === n);
  const s = { role: 'admin' };
  const ctx = await tool('montaje_lanzamiento').run({ lanzamiento: 'ene' }, { s });
  assert.equal(ctx.fase, 'identidad');
  assert.match(ctx.encargo, /Narrativa e identidad visual/);

  // La IA no puede saltarse fases ni aprobar.
  await assert.rejects(tool('guardar_fase_montaje').run({ lanzamiento: 'ene', fase: 'contenido', piezas: { clases: { texto: 'x' } } }, { s }), /bloqueada/);
  await assert.rejects(tool('guardar_fase_montaje').run({ lanzamiento: 'ene', fase: 'identidad', piezas: { inventada: { texto: 'x' } } }, { s }), /no son de esta fase/);
  const medio = await tool('guardar_fase_montaje').run({ lanzamiento: 'ene', fase: 'identidad', piezas: { narrativa: { texto: 'TÍTULO: «La Ruta de la Seda»\nIDEA CENTRAL: un viaje.' } }, listo: true }, { s });
  assert.equal(medio.estado, 'trabajando'); // faltan piezas: aunque diga listo, no queda para revisar
  assert.deepEqual(medio.faltan, ['Colores', 'Símbolos', 'Logo del lanzamiento']);
  const lista = await tool('guardar_fase_montaje').run({ lanzamiento: 'ene', fase: 'identidad', piezas: { paleta: { texto: 'Arena #d9b38c, noche #1b2440', colores: ['#d9b38c', '#1b2440'] }, simbolos: { texto: 'Caravana y estrella.' }, logo: { texto: '<svg viewBox="0 0 10 10"><circle r="4"/></svg>' } }, nota: 'Elegí la Ruta de la Seda.', listo: true }, { s });
  assert.equal(lista.estado, 'revisar');
  assert.match(lista.siguiente, /PARA aquí/);

  // El setter no aprueba (ni entra); se piden cambios y la IA los ve.
  assert.notEqual((await call('/api/montaje', { method: 'POST', cookie: setter, body: { op: 'aprobar', l: 'ene', fase: 'identidad' } })).status, 200);
  assert.equal((await call('/api/montaje', { method: 'POST', cookie: admin, body: { op: 'cambios', l: 'ene', fase: 'identidad', texto: 'Logo más sencillo.' } })).status, 200);
  assert.equal((await tool('montaje_lanzamiento').run({ lanzamiento: 'ene' }, { s })).cambiosPedidos, 'Logo más sencillo.');
  const otra = await tool('guardar_fase_montaje').run({ lanzamiento: 'ene', fase: 'identidad', piezas: { logo: { url: 'https://example.com/logo.png' } }, listo: true }, { s });
  assert.equal(otra.estado, 'revisar');

  // Admin aprueba: la fase 2 se abre y la narrativa pasa al lanzamiento.
  const ap = await call('/api/montaje', { method: 'POST', cookie: admin, body: { op: 'aprobar', l: 'ene', fase: 'identidad' } });
  assert.equal(ap.status, 200, JSON.stringify(ap.data));
  assert.equal(faseActual(ap.data.montaje), 'contenido');
  const cfg2 = await call('/api/config', { cookie: admin });
  assert.equal(cfg2.data.config.launches.ene.narrativa.titulo, 'La Ruta de la Seda');
  // Una fase aprobada no la toca la IA; una persona sí (y vuelve a revisar).
  await assert.rejects(tool('guardar_fase_montaje').run({ lanzamiento: 'ene', fase: 'identidad', piezas: { simbolos: { texto: 'otro' } } }, { s }), /ya está aprobada/);
  const ed = await call('/api/montaje', { method: 'POST', cookie: admin, body: { op: 'guardar', l: 'ene', fase: 'identidad', piezas: { simbolos: { texto: 'Caravana, estrella y brújula.' } } } });
  assert.equal(ed.data.estado, 'revisar');
  assert.equal(faseActual(ed.data.montaje), 'identidad');
  assert.equal((await call('/api/montaje', { method: 'POST', cookie: admin, body: { op: 'aprobar', l: 'ene', fase: 'identidad' } })).status, 200);
  // Reabrir (admin) la vuelve a revisar.
  const re = await call('/api/montaje', { method: 'POST', cookie: admin, body: { op: 'reabrir', l: 'ene', fase: 'identidad' } });
  assert.equal(estadosFases(re.data.montaje)[0].estado, 'revisar');
  assert.equal((await call('/api/montaje', { method: 'POST', cookie: admin, body: { op: 'aprobar', l: 'ene', fase: 'identidad' } })).status, 200);

  // Etiqueta del menú.
  const r = await call('/api/montaje?resumen=ene,otro', { cookie: admin });
  assert.deepEqual(Object.keys(r.data.resumenes), ['ene']);
  assert.equal(r.data.resumenes.ene.texto, 'Fase 2/6 · lista para la IA');
});

test('«Móntalo con IA» se guarda en el embudo de lanzamientos (y no en otros tipos)', async () => {
  const admin = await login('admin');
  const cfg = await call('/api/config', { cookie: admin });
  const embudos = [...cfg.data.config.embudos, { id: 'ia', tipo: 'lanzamientos', nombre: 'Con IA', montajeIa: true }];
  const g = await call('/api/config', { method: 'POST', cookie: admin, body: { ...cfg.data.config, embudos, _version: cfg.data.version } });
  assert.equal(g.status, 200);
  const e = (await call('/api/config', { cookie: admin })).data.config.embudos.find((x) => x.id === 'ia');
  assert.equal(e.montajeIa, true);
  assert.equal(e.paginasOrigen, undefined);
});

test('encargos «Crear con IA»: se encargan, Claude los coge y los cierra, y la automatización queda creada', async () => {
  const admin = await login('admin');
  const cfg = await call('/api/config', { cookie: admin });
  const launches = { ...cfg.data.config.launches, abr: { name: 'Abril', fechaDirecto: '2027-04-20', horaDirecto: '19:00', compraTag: 'compra-abr' } };
  assert.equal((await call('/api/config', { method: 'POST', cookie: admin, body: { ...cfg.data.config, launches, _version: cfg.data.version } })).status, 200);
  const prompt = 'Vas a crear un workflow en GoHighLevel para el lanzamiento «Abril»: registro completado, con su etiqueta y su email.';
  const e = await call('/api/encargos', { method: 'POST', cookie: admin, body: { op: 'encargar', tipo: 'lanzamientos', l: 'abr', ref: 'registro', titulo: '[abr] 01 · Registro completado', prompt } });
  assert.equal(e.status, 200, JSON.stringify(e.data));
  // Pedirla otra vez no duplica.
  await call('/api/encargos', { method: 'POST', cookie: admin, body: { op: 'encargar', tipo: 'lanzamientos', l: 'abr', ref: 'registro', titulo: '[abr] 01 · Registro completado', prompt } });
  const lista = await call('/api/encargos?l=abr', { cookie: admin });
  assert.equal(lista.data.items.length, 1);

  const { TOOLS } = await import('../lib/mcp-tools.js');
  const tool = (n) => TOOLS.find((t) => t.name === n);
  const s = { role: 'admin' };
  const tp = await tool('trabajo_pendiente').run({}, { s });
  assert.equal(tp.encargos.length, 1);
  assert.match(tp.encargos[0].prompt, /registro completado/);
  const id = tp.encargos[0].id;
  await tool('actualizar_encargo').run({ id, estado: 'haciendo' }, { s });
  assert.equal((await tool('trabajo_pendiente').run({}, { s })).encargos.length, 0); // ya lo tiene Claude
  await assert.rejects(tool('actualizar_encargo').run({ id, estado: 'hecho' }, { s }), /URL del workflow/);
  const h = await tool('actualizar_encargo').run({ id, estado: 'hecho', url: 'https://app.gohighlevel.com/v2/location/x/workflow/123' }, { s });
  assert.equal(h.estado, 'hecho');
  const cfg2 = await call('/api/config', { cookie: admin });
  assert.deepEqual(cfg2.data.config.launches.abr.automatizaciones.items.registro, { estado: 'creada', url: 'https://app.gohighlevel.com/v2/location/x/workflow/123' });
  // Cancelado: Claude no lo hace.
  const e2 = await call('/api/encargos', { method: 'POST', cookie: admin, body: { op: 'encargar', tipo: 'lanzamientos', l: 'abr', ref: 'bonus', titulo: '[abr] 04 · Asignación de bonus', prompt } });
  await call('/api/encargos', { method: 'POST', cookie: admin, body: { op: 'cancelar', id: e2.data.encargo.id } });
  await assert.rejects(tool('actualizar_encargo').run({ id: e2.data.encargo.id, estado: 'haciendo' }, { s }), /cancelaron/);
  // Sin permiso de configuración no se encarga.
  const setter = await login('setter');
  assert.equal((await call('/api/encargos', { method: 'POST', cookie: setter, body: { op: 'encargar', tipo: 'lanzamientos', l: 'abr', ref: 'registro', titulo: 'x', prompt } })).status, 403);
});

test('Marca y avatar: guías de emails y automatizaciones en el encargo; montajes que esperan a Claude', async () => {
  const admin = await login('admin');
  const sube = (nombre, uso, texto) => call('/api/marca', { method: 'POST', cookie: admin, body: { op: 'doc-subir', nombre, tipo: 'txt', uso, texto } });
  assert.equal((await sube('Estudio avatar.txt', '', 'Las madres dicen literalmente: «no llego a todo», y eso les pesa mucho.')).status, 200);
  assert.equal((await sube('Guía emails.txt', 'emails', 'ESTRUCTURA: gancho, historia, lección y una sola llamada a la acción. Máximo 250 palabras.')).status, 200);
  assert.equal((await sube('Guía workflows.txt', 'automatizaciones', 'Todo workflow lleva SIEMPRE una nota interna con el código del lanzamiento y un Wait de 1 minuto al empezar.')).status, 200);

  const { ctxBrief } = await import('../lib/montaje.js');
  const ctx = await ctxBrief('ene');
  const emails = briefFase('mensajes', {}, ctx);
  assert.match(emails, /GUÍA DE EMAILS[^]*gancho, historia, lección/);
  assert.match(emails, /Estudio avatar\.txt/); // la lista de documentos
  assert.doesNotMatch(briefFase('copy', {}, ctx), /gancho, historia/); // la de emails no va en el copy
  assert.match(briefFase('automatizaciones', {}, { ...ctx }), /GUÍA DE AUTOMATIZACIONES[^]*nota interna/);

  const { TOOLS } = await import('../lib/mcp-tools.js');
  const tool = (n) => TOOLS.find((t) => t.name === n);
  const s = { role: 'admin' };
  const docs = await tool('documentos_marca').run({}, { s });
  const est = docs.documentos.find((d) => d.nombre === 'Estudio avatar.txt');
  assert.equal(docs.documentos.find((d) => d.nombre === 'Guía emails.txt').que, 'Guía de emails');
  assert.match((await tool('documentos_marca').run({ id: est.id }, { s })).texto, /no llego a todo/);

  // Hay un encargo pendiente: la guía de automatizaciones viene con él.
  const prompt = 'Vas a crear un workflow en GoHighLevel para el lanzamiento «Abril»: carrito abandonado con su espera.';
  await call('/api/encargos', { method: 'POST', cookie: admin, body: { op: 'encargar', tipo: 'lanzamientos', l: 'abr', ref: 'carrito-abandonado', titulo: '[abr] 02 · Carrito abandonado', prompt } });
  const tp = await tool('trabajo_pendiente').run({}, { s });
  assert.match(tp.guiaAutomatizaciones, /nota interna/);
  // El montaje de «ene» tiene la fase 2 por empezar: espera a Claude. Si se apaga «Claude lo avanza solo», no.
  assert.ok(tp.montajes.some((x) => x.lanzamiento === 'ene' && x.fase === 'contenido'));
  await call('/api/montaje', { method: 'POST', cookie: admin, body: { op: 'auto', l: 'ene', valor: false } });
  assert.ok(!(await tool('trabajo_pendiente').run({}, { s })).montajes.some((x) => x.lanzamiento === 'ene'));
});
