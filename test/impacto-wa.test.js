// Impacto de los mensajes del grupo de WhatsApp: regla de atribución (último mensaje en las 3 h anteriores) y salidas.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mensajesEnviados, mensajeDe, impactoMensajes, horaVenta } from '../public/js/impacto-wa.js';
import { compactarSerie } from '../lib/vigia-grupos.js';

const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 10, 8); // 10 oct, 10:00 en Madrid

test('impacto: cada acción va al último mensaje de las 3 h anteriores; fuera de esa ventana, a ninguno', () => {
  const ms = mensajesEnviados([{ t: T0, titulo: 'Buenos días' }, { t: T0 + 4 * H, titulo: 'Carrito abierto' }, { t: T0 + 4 * H + 20_000, titulo: '' }, { t: T0 + 99 * H, titulo: 'futuro' }], T0 + 10 * H);
  assert.deepEqual(ms.map((m) => m.titulo), ['Buenos días', 'Carrito abierto']); // sin duplicado ni futuro
  assert.equal(mensajeDe(ms, T0 + 2 * H), 0);
  assert.equal(mensajeDe(ms, T0 + 3.5 * H), -1); // más de 3 h y antes del siguiente
  assert.equal(mensajeDe(ms, T0 + 5 * H), 1); // el último antes, no el primero
  assert.equal(mensajeDe(ms, T0 - H), -1);
  const r = impactoMensajes(ms, [
    { tipo: 'venta', t: T0 + 0.5 * H, importe: 497 }, { tipo: 'venta', t: T0 + 5 * H, importe: 300 }, { tipo: 'venta', t: T0 + 3.5 * H },
    { tipo: 'venta', t: null }, { tipo: 'reserva', t: T0 + H }, { tipo: 'pago', t: T0 + 6.9 * H }, { tipo: 'pago', t: T0 + 7.1 * H },
  ]);
  assert.deepEqual(r.filas.map((f) => [f.ventas, f.importe, f.reservas, f.pagos]), [[1, 497, 1, 0], [1, 300, 0, 1]]);
  assert.deepEqual(r.sinMensaje, { ventas: 1, reservas: 0, pagos: 1 });
  assert.deepEqual(r.total, { ventas: 3, reservas: 1, pagos: 2, sinHora: 1 });
  assert.equal(r.conSalidas, false);
});

test('impacto: salidas de la primera hora frente a lo normal (media por hora de las 24 h anteriores) y fugas', () => {
  // 2 salidas por hora durante el día anterior; tras el mensaje de las 10:00, 12 en una hora.
  const serie = [];
  for (let h = -26; h <= 0; h++) serie.push({ t: T0 + h * H, s: 100 + (h + 26) * 2 });
  serie.push({ t: T0 + 0.5 * H, s: serie.at(-1).s + 6 }, { t: T0 + H, s: serie.at(-1).s + 12 }, { t: T0 + 2 * H, s: serie.at(-1).s + 14 });
  const r = impactoMensajes([{ t: T0, titulo: 'Oferta' }], [], serie);
  assert.equal(r.filas[0].salidas, 12);
  assert.equal(r.filas[0].normal, 2);
  assert.equal(r.filas[0].extra, 10);
  assert.equal(r.filas[0].fuga, true);
  assert.equal(r.conSalidas, true);
});

test('impacto: hora de la venta = llegada a la página de pago ese mismo día', () => {
  const dia = (t) => new Date(t).toISOString().slice(0, 10);
  assert.equal(horaVenta('2026-10-10', { primera: T0 - 30 * H, ultima: T0 }, dia), T0);
  assert.equal(horaVenta('2026-10-10', { primera: T0, ultima: T0 + 40 * H }, dia), T0);
  assert.equal(horaVenta('2026-10-12', { primera: T0, ultima: T0 }, dia), null);
  assert.equal(horaVenta('2026-10-10', null, dia), null);
});

test('vigilancia: la serie se guarda 30 días (cada 15 min los 3 últimos, una por hora antes)', () => {
  const ahora = T0;
  const serie = [];
  for (let m = 40 * 24 * 4; m >= 0; m--) serie.push({ t: ahora - m * 15 * 60_000, s: 0 });
  const c = compactarSerie(serie, ahora);
  assert.ok(c.every((f) => f.t > ahora - 30 * 24 * H));
  assert.equal(c.filter((f) => f.t > ahora - 3 * 24 * H).length, 3 * 24 * 4);
  assert.ok(Math.abs(c.filter((f) => f.t <= ahora - 3 * 24 * H).length - 27 * 24) <= 2);
});

// Servidor: mensajes del dashboard + los enviados desde SendFlow (sin duplicar) y la serie.
const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret', SENDFLOW_API_KEY: 'sk_test' };
let route;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
});
test('impacto: el servidor junta los mensajes del dashboard y los de SendFlow', async () => {
  const call = async (path, { method = 'GET', body, cookie } = {}) => { const r = await route(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'text/plain' }, body: body ? JSON.stringify(body) : undefined }), ENV); return { status: r.status, data: await r.json().catch(() => null), res: r }; };
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const { data: cur } = await call('/api/config', { cookie: admin });
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...cur.config, _version: cur.version, launches: { ...cur.config.launches, 'imp-26': { name: 'Impacto', registroTag: 'registro-imp', sendflowId: 'rel-imp' } } } });
  const r = await call('/api/sendflow?op=impacto&l=imp-26', { cookie: admin });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(Array.isArray(r.data.serie));
  // Del mock de SendFlow: 2 enviados con éxito (el fallido no cuenta)
  assert.equal(r.data.mensajes.filter((m) => m.origen === 'sendflow').length, 2);
  const setter = (await call('/api/login', { method: 'POST', body: { password: 'setter' } })).res.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/sendflow?op=impacto&l=imp-26', { cookie: setter })).status, 403);
});
