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
