import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { faseMeteorico, metricasMeteorico, esVentaMeteorico, horasOferta, pendientesMeteorico } from '../public/js/meteorico.js';
import { madridToEpoch } from '../public/js/page.js';

const M = {
  name: 'Black Friday', compraTag: 'compra-bf', fraccionadoTag: 'bf-plazos', compraDateField: 'fc',
  precio: 97, precioFraccionado: 120, calentamiento: '2026-11-23', apertura: '2026-11-27T09:00', cierre: '2026-11-27T21:00',
  objetivoVentas: 4, inversion: 100,
};

test('meteórico: fases y horas de la oferta', () => {
  assert.equal(faseMeteorico(M, madridToEpoch('2026-11-20T10:00')).id, 'preparacion');
  assert.equal(faseMeteorico(M, madridToEpoch('2026-11-24T10:00')).id, 'calentamiento');
  assert.equal(faseMeteorico(M, madridToEpoch('2026-11-27T10:00')).id, 'abierta');
  assert.equal(faseMeteorico(M, madridToEpoch('2026-11-27T21:00')).id, 'cerrada');
  assert.equal(horasOferta(M), 12);
  assert.ok(pendientesMeteorico(M).some((t) => /enlace de pago/.test(t)));
});

test('meteórico: ventas por fecha de compra o por la foto de antes de abrir', () => {
  const c = (id, tags, fecha) => ({ id, tags, cf: fecha ? { fc: fecha } : {} });
  const contactos = [
    c('a', ['compra-bf'], '2026-11-27'),
    c('b', ['compra-bf', 'bf-plazos'], '2026-11-27'),
    c('c', ['compra-bf'], '2025-11-28'), // del Black Friday del año pasado
    c('d', ['otra'], '2026-11-27'),
  ];
  const r = metricasMeteorico(contactos, M, { visitas: { total: 50 } });
  assert.equal(r.ventas, 2);
  assert.equal(r.fraccionado, 1);
  assert.equal(r.facturacion, 97 + 120);
  assert.equal(r.conversion, 2 / 50);
  assert.equal(r.cac, 50);
  assert.equal(r.objetivos[0].pct, 0.5);
  assert.deepEqual(r.ventasPorDia, [['2026-11-27', 2]]);
  // Sin campo de fecha: cuenta quien no estaba en la foto
  const sinFecha = { ...M, compraDateField: '' };
  assert.equal(esVentaMeteorico(c('c', ['compra-bf']), sinFecha, new Set(['c'])), false);
  assert.equal(esVentaMeteorico(c('e', ['compra-bf']), sinFecha, new Set(['c'])), true);
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

test('meteórico: independiente y downsell, foto, visitas y estado público', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const cfg = (await call('/api/config', { cookie: admin })).data.config;
  const hoy = new Date();
  const d = (n) => new Date(hoy.getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const body = {
    ...cfg,
    embudos: [...cfg.embudos, { id: 'flash', tipo: 'meteorico', nombre: 'Meteóricos' }],
    launches: { oct: { name: 'Octubre', registroTag: 'registro-webinar-demo', compraTag: 'clienta-raices', inicioCaptacion: d(-20) } },
    meteoricos: {
      bf26: { name: 'Black Friday', embudo: 'flash', compraTag: 'clienta-raices', precio: 97, calentamiento: d(-2), apertura: `${d(-1)}T09:00`, cierre: `${d(1)}T21:00` },
      down: { name: 'Downsell octubre', lanzamiento: 'oct', compraTag: 'compra-vip-demo', precio: 47, calentamiento: d(1), apertura: `${d(3)}T09:00`, cierre: `${d(3)}T21:00` },
      suelto: { name: 'Sin sitio', compraTag: 'x' }, // ni embudo ni lanzamiento: se descarta
    },
  };
  const saved = (await call('/api/config', { method: 'POST', cookie: admin, body })).data.config;
  assert.deepEqual(Object.keys(saved.meteoricos).sort(), ['bf26', 'down']);
  assert.equal(saved.meteoricos.down.lanzamiento, 'oct');
  // Código repetido con un lanzamiento
  const choque = await call('/api/config', { method: 'POST', cookie: admin, body: { ...saved, meteoricos: { ...saved.meteoricos, oct: { name: 'X', embudo: 'flash' } } } });
  assert.equal(choque.status, 400);
  // Estado público (la página de la oferta)
  const est = (await call('/api/meteorico?m=bf26&estado=1')).data;
  assert.equal(est.fase, 'abierta');
  assert.ok(est.cierre > est.apertura);
  // Foto de quién ya tenía la etiqueta: con ella, nadie de antes cuenta como venta
  assert.equal((await call('/api/meteorico', { method: 'POST', body: { op: 'foto', m: 'bf26' } })).status, 401);
  const foto = (await call('/api/meteorico', { method: 'POST', cookie: admin, body: { op: 'foto', m: 'bf26' } })).data.foto;
  assert.ok(foto.n > 0);
  // Visitas (públicas)
  await call('/api/meteorico', { method: 'POST', body: { op: 'visita', m: 'bf26' } });
  await call('/api/meteorico', { method: 'POST', body: { op: 'visita', m: 'bf26' } });
  const r = (await call('/api/meteorico?m=bf26', { cookie: admin })).data;
  assert.equal(r.visitas, 2);
  assert.equal(r.ventas, 0);
  assert.equal(r.foto.n, foto.n);
  // Las tareas funcionan con el código del meteórico
  assert.equal((await call('/api/tareas?l=bf26', { cookie: admin })).status, 200);
  assert.equal((await call('/api/meteorico?m=bf26')).status, 401);
});
