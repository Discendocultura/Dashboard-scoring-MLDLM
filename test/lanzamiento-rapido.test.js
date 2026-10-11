// Nuevo lanzamiento rápido: copia del anterior con las fechas movidas, plantilla estándar y la sala de Zoom.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { nuevoLanzamiento, moverValor, codigoPropuesto, etiquetaRegistro, plantillaEstandar, resumenFechas } from '../public/js/lanzamiento-rapido.js';

const prev = {
  name: 'Octubre', createdAt: '2026-09-01T10:00:00.000Z', registroTag: 'registro-camino-oct26', vipTag: 'vip-camino', compraTag: 'compra-camino',
  fechaDirecto: '2026-10-20', horaDirecto: '19:00', inicioCaptacion: '2026-10-06', finCaptacion: '2026-10-20',
  clase1At: '2026-10-15T10:00', clase2At: '2026-10-17T10:00', aperturaCarrito: '2026-10-20T20:30', replayAt: '2026-10-21T10:00', diasCarrito: 5,
  zoomMeetingId: '81234567890', zoomJoinUrl: 'https://zoom.us/j/81234567890', sendflowId: 'rel-1', whatsappUrl: 'https://chat.whatsapp.com/x', replayVideoUrl: 'https://vimeo.com/1',
  precioPrograma: 497, oferta: { bonus: [{ id: 'b1', nombre: 'Bonus directo', hasta: '2026-10-20T23:59' }] },
  carritoNotas: { '2026-10-22': 'Testimonios' }, ventaBarra: { activa: true, tramos: [{ hasta: '2026-10-23T23:59', texto: 'Quedan {cuenta}' }] },
  snapshot: { at: 'x' }, recursosUrl: 'https://a.com/preclase',
};

test('copia: mueve todas las fechas los días del cambio y vacía lo de cada edición', () => {
  const r = nuevoLanzamiento({ code: 'camino-nov26', nombre: 'Noviembre', fecha: '2026-11-17', hora: '19:00', prev, prevCode: 'camino-oct26', embudo: { id: 'camino' } });
  const l = r.launch;
  assert.equal(r.origen, 'copia');
  assert.equal(r.dias, 28);
  assert.equal(l.inicioCaptacion, '2026-11-03');
  assert.equal(l.clase1At, '2026-11-12T10:00');
  assert.equal(l.aperturaCarrito, '2026-11-17T20:30');
  assert.equal(l.replayAt, '2026-11-18T10:00');
  assert.equal(l.oferta.bonus[0].hasta, '2026-11-17T23:59');
  assert.deepEqual(l.carritoNotas, { '2026-11-19': 'Testimonios' });
  assert.equal(l.ventaBarra.tramos[0].hasta, '2026-11-20T23:59');
  assert.equal(l.registroTag, 'registro-camino-nov26');
  assert.equal(l.vipTag, 'vip-camino');
  assert.equal(l.precioPrograma, 497);
  assert.equal(l.recursosUrl, 'https://a.com/preclase');
  assert.equal(l.embudo, 'camino');
  for (const k of ['zoomMeetingId', 'zoomJoinUrl', 'sendflowId', 'whatsappUrl', 'replayVideoUrl', 'snapshot', 'createdAt']) assert.equal(l[k], undefined, k);
  assert.equal(prev.fechaDirecto, '2026-10-20'); // no toca el original
});

test('copia: si cambia la hora del directo, lo de ese día a partir de esa hora se mueve también', () => {
  const l = nuevoLanzamiento({ code: 'c', nombre: 'x', fecha: '2026-11-17', hora: '18:30', prev, prevCode: 'camino-oct26' }).launch;
  assert.equal(l.horaDirecto, '18:30');
  assert.equal(l.aperturaCarrito, '2026-11-17T20:00');
  assert.equal(l.clase1At, '2026-11-12T10:00'); // otro día: igual
  assert.equal(moverValor('2026-10-20T23:45', { dias: 0, diaAnt: '2026-10-20', horaAnt: 19 * 60, minutos: 30 }), '2026-10-21T00:15');
  assert.equal(moverValor('texto 2026', { dias: 3 }), 'texto 2026');
});

test('plantilla estándar (primer lanzamiento): captación, clases, carrito y vídeos', () => {
  const p = plantillaEstandar({ fecha: '2026-11-17', hora: '19:00', formato: 'webinar', nClases: 2 });
  assert.equal(p.inicioCaptacion, '2026-11-03');
  assert.equal(p.clase1At, '2026-11-12T10:00');
  assert.equal(p.clase2At, '2026-11-14T10:00');
  assert.equal(p.aperturaCarrito, '2026-11-17T20:30');
  assert.equal(p.diasCarrito, 5);
  const reto = plantillaEstandar({ fecha: '2026-11-17', hora: '19:00', formato: 'reto3', preclase: false });
  assert.deepEqual(reto.videos.map((v) => v.fecha), ['2026-11-18', '2026-11-19']);
  assert.equal(reto.aperturaCarrito, '2026-11-19T20:30');
  assert.equal(reto.clase1At, undefined);
  const r = nuevoLanzamiento({ code: 'nuevo-nov26', nombre: 'Nov', fecha: '2026-11-17', hora: '19:00', base: { precioPrograma: 297 } });
  assert.equal(r.origen, 'plantilla');
  assert.equal(r.launch.precioPrograma, 297);
  assert.equal(r.launch.registroTag, 'registro-nuevo-nov26');
  assert.throws(() => nuevoLanzamiento({ code: 'x', fecha: '', hora: '19:00' }), /día del directo/);
  assert.ok(resumenFechas(r.launch).some(([a]) => a === 'Abre el carrito'));
});

test('código y etiqueta de registro propuestos', () => {
  assert.equal(codigoPropuesto('Webinar «El Camino»', '2026-11-17'), 'camino-nov26');
  assert.equal(codigoPropuesto('El Camino', '2026-11-17', ['camino-nov26']), 'camino-nov26-2');
  assert.equal(etiquetaRegistro('registro-webinar-demo', 'demo', 'demo-nov'), 'registro-webinar-demo-nov');
  assert.equal(etiquetaRegistro('registro-general', 'oct', 'nov'), 'registro-nov');
});

// Servidor: crear la sala de Zoom (mock) con permiso de configuración.
const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
let route;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
});
test('zoom-sala: crea la reunión (admin) y la rechaza sin permiso o sin fecha', async () => {
  const call = async (path, { method = 'GET', body, cookie } = {}) => { const r = await route(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'text/plain' }, body: body ? JSON.stringify(body) : undefined }), ENV); return { status: r.status, data: await r.json().catch(() => null), res: r }; };
  const login = async (password) => (await call('/api/login', { method: 'POST', body: { password } })).res.headers.get('set-cookie').split(';')[0];
  const admin = await login('admin');
  const ok = await call('/api/zoom-sala', { method: 'POST', cookie: admin, body: { topic: 'MLDLM · Noviembre', fecha: '2026-11-17', hora: '19:00' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.match(ok.data.id, /^\d{10,}$/);
  assert.match(ok.data.joinUrl, /^https:\/\/zoom\.us\/j\//);
  assert.equal((await call('/api/zoom-sala', { method: 'POST', cookie: admin, body: { fecha: '', hora: '19:00' } })).status, 400);
  const setter = await login('setter');
  assert.equal((await call('/api/zoom-sala', { method: 'POST', cookie: setter, body: { fecha: '2026-11-17', hora: '19:00' } })).status, 403);
});
