import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { historicoHtml, mejorDe, cambio, lanzamientosVisibles, formato } from '../public/js/historico.js';
import { fotoDeMetricas, pendienteHistorico } from '../lib/historico.js';

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
const cookieDe = (r) => r.res.headers.get('set-cookie').split(';')[0];

const foto = (code, inicio, o = {}) => ({
  code, nombre: code, embudo: o.embudo || 'lanz', embudoNombre: o.embudo === 'otro' ? 'Otro' : 'Lanzamientos', estado: 'cerrado', fechas: { inicio, directo: inicio, cierre: '' },
  fases: { registros: 1000, vip: 50, clase1: 300, live: 150, liveFinal: 60, compra: 10, compraLive: 6, ...o.fases },
  eco: { inversion: 2000, facturacion: 10000, roas: 5, cpl: 2, cac: 200, ...o.eco },
});

test('histórico: el mejor de cada fila (más o menos) y sin ganador si empatan', () => {
  assert.equal(mejorDe([10, 30, 20], 'mas'), 1);
  assert.equal(mejorDe([3, 1, 2], 'menos'), 1);
  assert.equal(mejorDe([5, 5], 'mas'), -1);
  assert.equal(mejorDe([5, null], 'mas'), -1);
  assert.equal(mejorDe([1, 2], null), -1);
});

test('histórico: el cambio frente al anterior (relativo y, en porcentajes, en puntos)', () => {
  assert.deepEqual(cambio(150, 100, 'n'), { rel: 0.5 });
  assert.equal(Math.round(cambio(0.012, 0.008, 'pct').puntos * 10) / 10, 0.4);
  assert.equal(cambio(5, null, 'n'), null);
  assert.equal(formato(0.008, 'pct'), '0,80 %');
  assert.equal(formato(1234.5, 'eur'), '1.235 €');
});

test('histórico: tabla con todas las fases, el mejor marcado y filtro por embudo y por lanzamiento', () => {
  const d = { embudos: [{ id: 'lanz', nombre: 'Lanzamientos' }, { id: 'otro', nombre: 'Otro' }], lanzamientos: [
    foto('NOV', '2026-11-01', { fases: { compra: 8 }, eco: { facturacion: 8000, roas: 4 } }),
    foto('OCT', '2026-10-01'),
    foto('SEP', '2026-09-01', { embudo: 'otro', fases: { compra: 12 } }),
  ] };
  const html = historicoHtml(d, {});
  for (const t of ['Captación', 'Calentamiento', 'El directo', 'La venta', 'Economía', 'Conversión a venta', 'Compran la VIP', 'Se quedan hasta la oferta', 'Más facturación']) assert.ok(html.includes(t), t);
  assert.ok(html.includes('👑'));
  // NOV frente a OCT (su anterior): las ventas bajan un 20 % (en rojo)
  assert.ok(html.includes('hl-delta mal" title="Frente a OCT">▼ 20 %'), html.slice(0, 200));
  assert.deepEqual(lanzamientosVisibles(d, {}).map((f) => f.code), ['NOV', 'OCT', 'SEP']);
  assert.deepEqual(lanzamientosVisibles(d, { orden: 'antiguos' }).map((f) => f.code), ['SEP', 'OCT', 'NOV']);
  assert.deepEqual(lanzamientosVisibles(d, { embudo: 'otro' }).map((f) => f.code), ['SEP']);
  assert.deepEqual(lanzamientosVisibles(d, { ocultos: new Set(['OCT']) }).map((f) => f.code), ['NOV', 'SEP']);
  assert.ok(historicoHtml({ lanzamientos: [] }).includes('Aún no hay lanzamientos'));
});

test('histórico: la foto de un lanzamiento y cuándo se recalcula', () => {
  const m = { total: 1000, frio: 600, templado: 400, encuestaActiva: false, vip: 47, clase1: 300, clase2: 200, clase3: 0, click: 200, live: 160, liveFinal: 60, replay: 90, llamada: 0, inicioPago: 20, compra: 8, compraUnico: 6, compraFraccionado: 2, compraLive: 5, compraVip: 3,
    eco: { inversion: 1680, facturacion: 9000, facturacionPrograma: 7976, facturacionVip: 1000, facturacionBumps: 24, facturacionEntradas: 0, beneficio: 7320, roas: 9000 / 1680, cpl: 1.68, cpVip: 1680 / 47, cac: 210 } };
  const l = { name: 'Noviembre', inicioCaptacion: '2026-10-20', fechaDirecto: '2026-11-04', cierreCarrito: '2026-11-09', vipTag: 'vip', clases: 2 };
  const f = fotoDeMetricas('nov', l, m, { embudo: 'lanz', hoy: '2026-11-10', firma: 'a' });
  assert.equal(f.estado, 'cerrado');
  assert.equal(f.fases.registros, 1000);
  assert.equal(f.fases.vip, 47);
  assert.equal(f.fases.encuesta, null);
  assert.equal(f.eco.ticket, 997);
  assert.equal(f.eco.cpl, 1.68);
  const ahora = Date.parse('2026-11-10T12:00:00Z');
  assert.equal(pendienteHistorico({ firma: 'a', cerrado: true }, { ...f, at: '2026-11-10T10:00:00Z' }, ahora), false);
  assert.equal(pendienteHistorico({ firma: 'b', cerrado: true }, { ...f, at: '2026-11-10T10:00:00Z' }, ahora), true); // cambió su configuración
  assert.equal(pendienteHistorico({ firma: 'a', cerrado: false }, { ...f, estado: 'carrito', at: '2026-11-10T11:30:00Z' }, ahora), false);
  assert.equal(pendienteHistorico({ firma: 'a', cerrado: false }, { ...f, estado: 'carrito', at: '2026-11-10T10:30:00Z' }, ahora), true); // en curso: cada hora
});

test('histórico: la API calcula los lanzamientos uno a uno y lo ve quien tiene Métricas', async () => {
  const admin = cookieDe(await call('/api/login', { method: 'POST', body: { password: 'admin' } }));
  const c = (await call('/api/config', { cookie: admin })).data;
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...c.config, _version: c.version, launches: {
    sep: { name: 'Septiembre', embudo: 'lanz', registroTag: 'registro-webinar-demo', vipTag: 'compra-vip-demo', compraTag: 'clienta-raices', precioVip: 27, precioPrograma: 997, inicioCaptacion: '2026-08-28', fechaDirecto: '2026-09-20', cierreCarrito: '2026-09-25' },
    oct: { name: 'Octubre', embudo: 'lanz', registroTag: 'registro-webinar-demo', vipTag: 'compra-vip-demo', compraTag: 'clienta-raices', precioVip: 27, precioPrograma: 997, inicioCaptacion: '2026-09-28', fechaDirecto: '2026-10-20' },
    futuro: { name: 'Futuro', embudo: 'lanz', registroTag: 'x', inicioCaptacion: '2099-01-01' },
  } } });
  let d; let vueltas = 0;
  do { d = (await call('/api/historico', { cookie: admin })).data; vueltas++; } while (d.pendientes > 0 && vueltas < 10);
  assert.equal(d.pendientes, 0, JSON.stringify(d).slice(0, 300));
  assert.equal(vueltas, 2); // uno por visita
  assert.deepEqual(d.lanzamientos.map((f) => f.code), ['oct', 'sep']); // el que no ha empezado, no
  assert.ok(d.lanzamientos[0].fases.registros > 0);
  assert.equal((await call('/api/historico', { cookie: admin })).data.pendientes, 0);
  assert.equal((await call('/api/historico')).status, 401);
  const u = (await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'crear', nombre: 'S', email: 'hs@ejemplo.com', rol: 'setter', enviar: false } })).data;
  const setter = cookieDe(await call('/api/login', { method: 'POST', body: { email: 'hs@ejemplo.com', password: u.password } }));
  assert.equal((await call('/api/historico', { cookie: setter })).status, 403);
});
