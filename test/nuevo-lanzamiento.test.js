// Asistente «Nuevo lanzamiento» completo: objetivo de facturación, precios y bonus, captación, tareas y mensajes
// copiados, etiqueta en GHL y campaña de SendFlow.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { objetivosDesdeMeta, aplicarOferta, fijarCaptacion, diasCaptacionDe, copiarTareas, copiarMensajes, cambiosEnlaces, desplazamiento } from '../public/js/lanzamiento-rapido.js';

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
const login = async (password) => (await call('/api/login', { method: 'POST', body: { password } })).res.headers.get('set-cookie').split(';')[0];

test('objetivo de facturación → registros, ventas, VIP e inversión', () => {
  const o = objetivosDesdeMeta(30000, { cpl: 2, convVip: 0.1, convVenta: 0.02, ticket: 1000 }, { precioVip: 30, diasCaptacion: 14 });
  // Cada registro deja 0,1·30 + 0,02·1000 = 23 € → 1305 registros
  assert.equal(o.registros, 1305);
  assert.equal(o.vip, 131);
  assert.equal(o.ventas, 27);
  assert.equal(o.inversion, 2610);
  assert.equal(o.inversionDia, 186);
  assert.ok(o.roas > 11);
  assert.equal(objetivosDesdeMeta(0, { convVenta: 0.02, ticket: 1000 }), null);
  assert.equal(objetivosDesdeMeta(1000, { convVenta: 0 }), null);
  assert.equal(objetivosDesdeMeta(1000, { convVenta: 0.02, ticket: 500 }).inversion, null); // sin CPL
});

test('precios, bonus y captación', () => {
  const l = { precioVip: 27, precioPrograma: 997, oferta: { precio: 997, bonus: [{ id: 'a', nombre: 'A' }, { id: 'b', nombre: 'B' }, { nombre: 'Sin id' }] } };
  aplicarOferta(l, { vip: '37', programa: '1097', bonus: ['a', 'b2'] });
  assert.equal(l.precioVip, 37);
  assert.equal(l.precioPrograma, 1097);
  assert.equal(l.oferta.precio, 1097);
  assert.deepEqual(l.oferta.bonus.map((b) => b.nombre), ['A', 'Sin id']);
  aplicarOferta(l, { vip: '', programa: '' });
  assert.equal(l.precioVip, 37);
  const c = fijarCaptacion({ fechaDirecto: '2026-11-17' }, 21);
  assert.equal(c.inicioCaptacion, '2026-10-27');
  assert.equal(c.finCaptacion, '2026-11-17');
  assert.equal(diasCaptacionDe({ inicioCaptacion: '2026-10-06', fechaDirecto: '2026-10-20' }), 14);
  assert.equal(diasCaptacionDe(null), 14);
});

test('copia de tareas y de mensajes: fechas movidas, sin hacer y con los enlaces del nuevo', () => {
  const m = desplazamiento({ fechaDirecto: '2026-10-20', horaDirecto: '19:00' }, '2026-11-17', '19:00');
  assert.equal(m.dias, 28);
  const t = copiarTareas([{ id: 't1', titulo: 'Grabar anuncios', fase: 'captacion', fecha: '2026-10-01', hecha: true, comentarios: [{ texto: 'x' }], asignado: { tipo: 'rol', rol: 'admin' } }], m);
  assert.deepEqual(t, [{ titulo: 'Grabar anuncios', notas: '', fase: 'captacion', sub: '', fecha: '2026-10-29', asignado: { tipo: 'rol', rol: 'admin' } }]);
  const cambios = cambiosEnlaces({ zoomJoinUrl: 'https://zoom.us/j/1', replayUrl: 'https://a.com/replay', name: 'x' }, { zoomJoinUrl: 'https://zoom.us/j/2', replayUrl: 'https://a.com/replay' }, 'oct', 'nov');
  assert.deepEqual(cambios, [['https://zoom.us/j/1', 'https://zoom.us/j/2'], ['l=oct', 'l=nov']]);
  const msgs = copiarMensajes([
    { id: 'm1', at: '2026-10-20T18:30', tipo: 'texto', texto: 'Entra: https://zoom.us/j/1 o https://dash.com/directo?l=oct&c=x (no l=octubre)', estado: 'programado', actionId: 'a1' },
    { id: 'm2', at: '2026-10-19T10:00', tipo: 'texto', texto: 'cancelado', estado: 'cancelado' },
  ], m, cambios);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].at, '2026-11-17T18:30');
  assert.equal(msgs[0].estado, 'borrador');
  assert.equal(msgs[0].actionId, undefined);
  assert.equal(msgs[0].texto, 'Entra: https://zoom.us/j/2 o https://dash.com/directo?l=nov&c=x (no l=octubre)');
});

test('POST /api/nuevo-lanzamiento: tareas, mensajes, etiqueta y SendFlow', async () => {
  const admin = await login('admin');
  const cfg = (await call('/api/config', { cookie: admin })).data.config;
  const oct = { name: 'Octubre', embudo: 'camino', registroTag: 'registro-camino-oct26', fechaDirecto: '2026-10-20', horaDirecto: '19:00', zoomJoinUrl: 'https://zoom.us/j/1' };
  const nov = { name: 'Noviembre', embudo: 'camino', registroTag: 'registro-camino-nov26', fechaDirecto: '2026-11-17', horaDirecto: '19:00', zoomJoinUrl: 'https://zoom.us/j/2' };
  const g = await call('/api/config', { method: 'POST', cookie: admin, body: { ...cfg, embudos: [...cfg.embudos, { id: 'camino', tipo: 'lanzamientos', nombre: 'El Camino', formato: 'webinar' }], launches: { ...cfg.launches, 'camino-oct26': oct, 'camino-nov26': nov } } });
  assert.equal(g.status, 200, JSON.stringify(g.data));
  const { saveTareas, getTareas } = await import('../lib/tareas.js');
  const { guardarSecuencia, leerSecuencia } = await import('../lib/calentamiento.js');
  await saveTareas('camino-oct26', [{ id: 't1', titulo: 'Grabar anuncios', fase: 'preparacion', fecha: '2026-10-01', hecha: true, estado: 'hecha', comentarios: [{ texto: 'ok' }], asignado: null }]);
  await guardarSecuencia('camino-oct26', [{ id: 'msg1', at: '2026-10-20T18:30', tipo: 'texto', texto: 'Entra ya: https://zoom.us/j/1' }]);

  const t = await call('/api/nuevo-lanzamiento', { method: 'POST', cookie: admin, body: { op: 'tareas', l: 'camino-nov26', de: 'camino-oct26' } });
  assert.equal(t.data.copiadas, 1, JSON.stringify(t.data));
  const tn = await getTareas('camino-nov26');
  assert.equal(tn[0].fecha, '2026-10-29');
  assert.equal(tn[0].hecha, false);
  assert.equal(tn[0].comentarios, undefined);
  // Repetir no duplica.
  assert.equal((await call('/api/nuevo-lanzamiento', { method: 'POST', cookie: admin, body: { op: 'tareas', l: 'camino-nov26', de: 'camino-oct26' } })).data.copiadas, 0);

  const w = await call('/api/nuevo-lanzamiento', { method: 'POST', cookie: admin, body: { op: 'whatsapp', l: 'camino-nov26', de: 'camino-oct26' } });
  assert.equal(w.data.copiados, 1, JSON.stringify(w.data));
  const sec = await leerSecuencia('camino-nov26');
  assert.equal(sec.mensajes[0].at, '2026-11-17T18:30');
  assert.equal(sec.mensajes[0].texto, 'Entra ya: https://zoom.us/j/2');
  assert.equal(sec.mensajes[0].estado, 'borrador');
  assert.equal((await call('/api/nuevo-lanzamiento', { method: 'POST', cookie: admin, body: { op: 'whatsapp', l: 'camino-nov26', de: 'camino-oct26' } })).data.copiados, 0);

  const e1 = await call('/api/nuevo-lanzamiento', { method: 'POST', cookie: admin, body: { op: 'etiqueta', tag: 'registro-camino-nov26' } });
  assert.deepEqual(e1.data, { creada: true, existia: false, tag: 'registro-camino-nov26' });
  const e2 = await call('/api/nuevo-lanzamiento', { method: 'POST', cookie: admin, body: { op: 'etiqueta', tag: 'registro-camino-nov26' } });
  assert.equal(e2.data.existia, true);
  assert.equal((await call('/api/nuevo-lanzamiento', { method: 'POST', cookie: admin, body: { op: 'etiqueta', tag: '<script>' } })).status, 400);

  const sf = await call('/api/nuevo-lanzamiento', { method: 'POST', cookie: admin, body: { op: 'sendflow', nombre: 'MLDLM · Noviembre' } });
  assert.equal(sf.status, 200, JSON.stringify(sf.data));
  assert.match(sf.data.id, /^rel-/);

  assert.equal((await call('/api/nuevo-lanzamiento', { method: 'POST', cookie: admin, body: { op: 'tareas', l: 'no', de: 'camino-oct26' } })).status, 404);
  const setter = await login('setter');
  assert.equal((await call('/api/nuevo-lanzamiento', { method: 'POST', cookie: setter, body: { op: 'etiqueta', tag: 'x-y' } })).status, 403);
});

test('copia: filtros de Meta y emails con el código nuevo (o quitados) y sin los objetivos del anterior', async () => {
  const { nuevoLanzamiento } = await import('../public/js/lanzamiento-rapido.js');
  const prev = { name: 'Oct', fechaDirecto: '2026-10-20', horaDirecto: '19:00', metaFiltro: 'camino-oct26', emailFiltro: 'webinar octubre', objetivos: { ventas: 50 }, inversion: 3000, calculadora: { presupuesto: 3000, roasObjetivo: 3, diasCaptacion: 14 } };
  const r = nuevoLanzamiento({ code: 'camino-nov26', fecha: '2026-11-17', hora: '19:00', prev, prevCode: 'camino-oct26' });
  assert.equal(r.launch.metaFiltro, 'camino-nov26');
  assert.equal(r.launch.emailFiltro, '');
  assert.ok(r.avisos.some((a) => /filtro de emails.*webinar octubre/.test(a)));
  assert.equal(r.launch.objetivos, undefined);
  assert.equal(r.launch.inversion, undefined);
  assert.deepEqual(r.launch.calculadora, { roasObjetivo: 3 });
});

test('fechas escritas en los mensajes, comprobaciones de fechas y emails a reprogramar', async () => {
  const { moverFechasTexto, comprobarFechas, emailsAReprogramar } = await import('../public/js/lanzamiento-rapido.js');
  const m = desplazamiento({ fechaDirecto: '2026-10-20', horaDirecto: '19:00' }, '2026-11-17', '18:00');
  assert.deepEqual(moverFechasTexto('El martes 20 de octubre a las 19:00, cierra el 25/10', m, '2026-10-20'), { texto: 'El martes 17 de noviembre a las 18:00, cierra el 22/11', n: 3 });
  assert.equal(moverFechasTexto('3 de cada 10 y v2/3', m, '2026-10-20').n, 0);
  assert.equal(moverFechasTexto('Navidad: 28 de diciembre', m, '2026-10-20').texto, 'Navidad: 25 de enero');
  const msgs = copiarMensajes([{ at: '2026-10-19T10:00', texto: 'Mañana, martes 20 de octubre', estado: 'borrador' }], m, []);
  assert.equal(msgs[0].texto, 'Mañana, martes 17 de noviembre');
  assert.equal(msgs[0].fechasCambiadas, 1);
  const l = { fechaDirecto: '2026-11-17', inicioCaptacion: '2026-11-03', diasCarrito: 5 };
  assert.deepEqual(comprobarFechas(l, [], '2026-10-01'), []);
  assert.equal(comprobarFechas(l, [], '2026-11-20')[0].nivel, 'error');
  assert.match(comprobarFechas(l, [], '2026-11-10')[0].texto, /ya ha pasado: quedan 7 días/);
  const sol = comprobarFechas(l, [['Octubre', { inicioCaptacion: '2026-10-01', fechaDirecto: '2026-10-30', diasCarrito: 7 }], ['Sept', { inicioCaptacion: '2026-09-01', fechaDirecto: '2026-09-20', diasCarrito: 5 }]], '2026-10-01');
  assert.equal(sol.length, 1);
  assert.match(sol[0].texto, /Se solapa con «Octubre»/);
  const e = emailsAReprogramar([{ tipo: 'campana', nombre: 'Recordatorio', asunto: 'Hoy a las 19h', fecha: '2026-10-20' }, { tipo: 'campana', nombre: 'Aviso', fecha: '2026-10-18' }, { tipo: 'workflow', nombre: 'Bienvenida' }], m);
  assert.deepEqual(e.campanas.map((c) => [c.antes, c.despues]), [['2026-10-18', '2026-11-15'], ['2026-10-20', '2026-11-17']]);
  assert.equal(e.workflows, 1);
});

test('deshacer (24 h): borra el lanzamiento, su Zoom, tareas y mensajes; resultados guardados en el servidor', async () => {
  const admin = await login('admin');
  const cfg = (await call('/api/config', { cookie: admin })).data.config;
  const nuevo = { name: 'Diciembre', embudo: 'camino', registroTag: 'registro-camino-dic26', fechaDirecto: '2026-12-15', horaDirecto: '19:00', zoomMeetingId: '81111111111', sendflowId: 'rel-dic' };
  const viejo = { name: 'Viejo', embudo: 'camino', registroTag: 'registro-viejo', fechaDirecto: '2026-06-15', createdAt: '2026-05-01T10:00:00.000Z' };
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...cfg, launches: { ...cfg.launches, 'camino-dic26': nuevo, viejo } } });
  const { saveTareas, getTareas } = await import('../lib/tareas.js');
  await saveTareas('camino-dic26', [{ id: 't1', titulo: 'X', fase: 'preparacion' }]);
  const r = await call('/api/nuevo-lanzamiento', { method: 'POST', cookie: admin, body: { op: 'deshacer', l: 'camino-dic26', sendflow: true } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.hecho.includes('Lanzamiento borrado') && r.data.hecho.includes('Campaña de SendFlow borrada'));
  const { zoomBorradas } = await import('../lib/mock.js');
  assert.ok(zoomBorradas.includes('81111111111'));
  assert.equal((await getTareas('camino-dic26')).length, 0);
  assert.equal((await call('/api/config', { cookie: admin })).data.config.launches['camino-dic26'], undefined);
  assert.match(r.data.avisos.join(' '), /registro-camino-dic26/);
  // Más de 24 h: no.
  const v = await call('/api/nuevo-lanzamiento', { method: 'POST', cookie: admin, body: { op: 'deshacer', l: 'viejo' } });
  assert.equal(v.status, 400);
  // Resultados del Planificador guardados con el lanzamiento.
  const res = await call('/api/config', { method: 'POST', cookie: admin, body: { op: 'resultados', l: 'viejo', resultados: { registros: 1500, ventas: 30, inversion: 2000, facturacionPrograma: 29910, hack: 'x', fecha: '2026-06-01' } } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const g = res.data.config.launches.viejo.resultados;
  assert.equal(g.registros, 1500);
  assert.equal(g.hack, undefined);
  assert.match(g.at, /^\d{4}-/);
});
