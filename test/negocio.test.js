import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { agregar, recomendaciones, rangosNegocio } from '../lib/negocio-calc.js';

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

test('inteligencia de negocio: sin datos, vacío', () => {
  assert.deepEqual(agregar([], { hoy: '2026-10-18' }), { vacio: true });
});

test('inteligencia de negocio: LTV, CAC, ciclo, recompra, camino y recomendaciones', () => {
  const hoy = '2026-10-18';
  const P = (o) => ({ cerrada: true, registros: 0, ventas: 0, facturacion: 0, inversion: null, compras: [], ...o });
  const piezas = [
    P({ id: 'l-may', tipo: 'lanzamiento', embudo: 'lanz', embudoNombre: 'Lanzamientos', nombre: 'Mayo', desde: '2026-05-01', hasta: '2026-05-20', registros: 1000, ventas: 20, facturacion: 20000, inversion: 4000,
      compras: Array.from({ length: 20 }, (_, i) => [`c${i}`, 1000, '2026-05-18', i % 5, i < 8 ? 'ultimo' : 'directo']) }),
    P({ id: 'v-vsl-2026-09', tipo: 'vsl', embudo: 'vsl', embudoNombre: 'VSL', nombre: 'VSL · 2026-09', desde: '2026-09-01', hasta: '2026-09-30', registros: 200, ventas: 6, facturacion: 3000, inversion: 2000,
      compras: [['c1', 500, '2026-09-10', 40, null], ['c2', 500, '2026-09-11', 2, null], ['x1', 500, '2026-09-12', 1, null], ['x2', 500, '2026-09-12', 1, null], ['x3', 500, '2026-09-13', 0, null], ['x4', 500, '2026-09-14', 0, null]] }),
  ];
  const a = agregar(piezas, { hoy, embudos: [{ id: 'lanz', tipo: 'lanzamientos', nombre: 'Lanzamientos' }, { id: 'vsl', tipo: 'vsl', nombre: 'VSL' }] });
  assert.equal(a.vacio, false);
  assert.equal(a.numeros.facturacion, 23000);
  assert.equal(a.numeros.clientes, 24);
  assert.equal(a.numeros.nuevos, 24);
  assert.equal(a.numeros.cac, 6000 / 24);
  assert.equal(Math.round(a.numeros.ltv), Math.round(23000 / 24));
  assert.equal(a.numeros.roas, 23000 / 6000);
  assert.equal(a.recompra.repiten, 2);
  assert.deepEqual(a.recompra.caminos[0], { camino: 'Lanzamientos → VSL', n: 2 });
  assert.equal(a.ciclo.n, 26);
  assert.equal(a.ciclo.momentos.find((m) => m.id === 'ultimo').n, 8);
  const mejor = a.embudos.find((e) => e.mejor);
  assert.equal(mejor.id, 'lanz');
  assert.ok(a.recomendaciones.length >= 1 && a.recomendaciones.length <= 3);
  assert.ok(a.recomendaciones.some((r) => /Pasa presupuesto a «Lanzamientos»/.test(r.titulo)));
  // El periodo anterior (12 meses antes) no tiene nada
  assert.equal(a.previo.facturacion, 0);
  assert.deepEqual(rangosNegocio('ano', hoy).actual, { desde: '2026-01-01', hasta: hoy });
  assert.equal(recomendaciones({ ...a, embudos: [] }, []).every((r) => r.titulo && r.texto), true);
});

test('inteligencia de negocio: la API calcula pieza a pieza hasta completar el histórico', async () => {
  const admin = cookieDe(await call('/api/login', { method: 'POST', body: { password: 'admin' } }));
  const c = (await call('/api/config', { cookie: admin })).data;
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...c.config, _version: c.version, launches: { demo: { name: 'Octubre', embudo: 'lanz', registroTag: 'registro-webinar-demo', vipTag: 'compra-vip-demo', compraTag: 'clienta-raices', precioVip: 27, precioPrograma: 997, inicioCaptacion: '2026-09-28', fechaDirecto: '2026-10-20' } } } });
  let d;
  let vueltas = 0;
  do { d = (await call('/api/negocio?periodo=12m', { cookie: admin })).data; vueltas++; } while (d.pendientes > 0 && vueltas < 30);
  assert.equal(d.pendientes, 0, JSON.stringify(d).slice(0, 300));
  assert.ok(d.total >= 2);
  assert.equal(d.vacio, false);
  assert.ok(d.numeros.facturacion > 0);
  assert.ok(d.embudos.length >= 1);
  // La siguiente visita ya no recalcula nada
  const otra = (await call('/api/negocio?periodo=todo', { cookie: admin })).data;
  assert.equal(otra.pendientes, 0);
  // Sin sesión, no; el rol Cliente sí (solo mirar); un setter (sin Métricas), no
  assert.equal((await call('/api/negocio')).status, 401);
  const entra = async (email, rol) => {
    const u = (await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'crear', nombre: rol, email, rol, enviar: false } })).data;
    return cookieDe(await call('/api/login', { method: 'POST', body: { email, password: u.password } }));
  };
  assert.equal((await call('/api/negocio', { cookie: await entra('cli@ejemplo.com', 'cliente') })).status, 200);
  assert.equal((await call('/api/negocio', { cookie: await entra('set@ejemplo.com', 'setter') })).status, 403);
});
