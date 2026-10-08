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
async function call(path, { method = 'GET', body, cookie, ip } = {}) {
  const res = await route(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(ip ? { 'cf-connecting-ip': ip } : {}), 'content-type': 'text/plain' }, body: body ? JSON.stringify(body) : undefined }), ENV);
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
  await call('/api/meteorico', { method: 'POST', ip: '1.1.1.1', body: { op: 'visita', m: 'bf26' } });
  await call('/api/meteorico', { method: 'POST', ip: '2.2.2.2', body: { op: 'visita', m: 'bf26' } });
  await call('/api/meteorico', { method: 'POST', ip: '1.1.1.1', body: { op: 'visita', m: 'bf26' } }); // la misma conexión otra vez: no cuenta
  const r = (await call('/api/meteorico?m=bf26', { cookie: admin })).data;
  assert.equal(r.visitas, 2);
  assert.equal(r.ventas, 0);
  assert.equal(r.foto.n, foto.n);
  // Las tareas funcionan con el código del meteórico
  assert.equal((await call('/api/tareas?l=bf26', { cookie: admin })).status, 200);
  // Su planificación propia (no la del webinar), sin duplicar al repetir
  const plan = (await call('/api/tareas', { method: 'POST', cookie: admin, body: { l: 'bf26', op: 'plantilla' } })).data;
  assert.ok(plan.creadas > 10);
  assert.ok(plan.tareas.every((t) => ['preparacion', 'calentamiento', 'oferta', 'cierre'].includes(t.fase)));
  assert.ok(plan.tareas.some((t) => t.fase === 'calentamiento' && t.asignado?.tipo === 'rol'));
  assert.equal((await call('/api/tareas', { method: 'POST', cookie: admin, body: { l: 'bf26', op: 'plantilla' } })).data.creadas, 0);
  // Evento en el meteórico y calendario del cliente: tareas y eventos de todos los embudos
  assert.equal((await call('/api/eventos', { method: 'POST', cookie: admin, body: { l: 'bf26', op: 'crear', evento: { titulo: 'Email BF', tipo: 'email', fecha: '2026-11-20' } } })).status, 200);
  await call('/api/tareas', { method: 'POST', cookie: admin, body: { l: 'oct', op: 'crear', avisar: false, tarea: { titulo: 'Tarea del lanzamiento', fecha: '2026-11-01' } } });
  const calendario = (await call('/api/calendario', { cookie: admin })).data;
  assert.ok(calendario.tareas.some((t) => t.code === 'bf26'));
  assert.ok(calendario.tareas.some((t) => t.code === 'oct' && t.titulo === 'Tarea del lanzamiento'));
  assert.ok(calendario.eventos.some((e) => e.code === 'bf26' && e.titulo === 'Email BF'));
  assert.equal((await call('/api/calendario')).status, 401);
  assert.equal((await call('/api/meteorico?m=bf26')).status, 401);
});

test('planificación del meteórico: adaptada a su configuración y con acciones inmediatas para hoy', async () => {
  const { tareasMeteorico, fasesMeteoricoCal, hitosMeteorico } = await import('../public/js/meteorico.js');
  const { FASES_METEORICO_T } = await import('../public/js/tareas.js');
  const base = { name: 'BF', calentamiento: '2026-10-09', apertura: '2026-10-13T09:00', cierre: '2026-10-13T21:00', compraTag: 'compra-bf' };
  const t = tareasMeteorico(base, { hoy: '2026-10-07' });
  const ids = FASES_METEORICO_T.map((f) => f.id);
  assert.ok(t.every((x) => ids.includes(x.fase)));
  assert.ok(!t.some((x) => /webinar|directo|clase/i.test(x.titulo)));
  // Lo que debería estar hecho 4 días antes del calentamiento es para hoy
  assert.equal(t.find((x) => x.clave === 'meteo:oferta').fecha, '2026-10-07');
  assert.equal(t.find((x) => x.clave === 'meteo:apertura').fecha, '2026-10-13');
  assert.equal(t.find((x) => x.clave === 'meteo:analisis').fecha, '2026-10-14');
  assert.ok(t.some((x) => x.clave === 'meteo:foto')); // sin campo de fecha de compra
  assert.ok(!t.some((x) => x.clave === 'meteo:fechas')); // ya tiene fechas
  assert.ok(!t.some((x) => x.clave === 'meteo:anuncios')); // sin publicidad
  // Downsell con suscripción, anuncios y campo de fecha
  const d = tareasMeteorico({ ...base, compraDateField: 'f', metaFiltro: 'bf', pago: { tipo: 'suscripcion', planes: { mensual: { activo: true, precio: 9 } } } }, { hoy: '2026-10-07', lanzamiento: 'Octubre' });
  assert.match(d.find((x) => x.clave === 'meteo:segmento').titulo, /Octubre/);
  assert.match(d.find((x) => x.clave === 'meteo:pago').titulo, /suscripción \(mensual\)/);
  assert.ok(d.some((x) => x.clave === 'meteo:anuncios'));
  assert.ok(!d.some((x) => x.clave === 'meteo:foto'));
  // Sin fechas: la preparación, para hoy
  const s = tareasMeteorico({ name: 'X' }, { hoy: '2026-10-07' });
  assert.ok(s.filter((x) => x.fase === 'preparacion').every((x) => x.fecha === '2026-10-07'));
  assert.ok(s.some((x) => x.clave === 'meteo:fechas'));
  // Calendario
  assert.deepEqual(fasesMeteoricoCal(base).map((f) => [f.id, f.from, f.to]), [['calentamiento', '2026-10-09', '2026-10-12'], ['oferta', '2026-10-13', '2026-10-13']]);
  assert.deepEqual(hitosMeteorico(base).map((h) => h.id), ['calentamiento', 'apertura', 'cierre']);
});


test('inicio: lista, cada embudo, cada meteórico y agenda', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/inicio?parte=lista')).status, 401);
  const l = await call('/api/inicio?parte=lista', { cookie: admin });
  assert.equal(l.status, 200);
  assert.ok(l.data.embudos.length > 0);
  assert.ok(l.data.meteoricos.some((x) => x.code === 'bf26'));
  for (const e of l.data.embudos) assert.equal((await call(`/api/inicio?parte=embudo&id=${e.id}`, { cookie: admin })).status, 200);
  const m = await call('/api/inicio?parte=meteorico&id=bf26', { cookie: admin });
  assert.equal(m.data.meteorico.code, 'bf26');
  assert.equal((await call('/api/inicio?parte=meteorico&id=constructor', { cookie: admin })).status, 404);
  const a = await call('/api/inicio?parte=agenda', { cookie: admin });
  assert.ok(Array.isArray(a.data.hitos) && typeof a.data.vencidas.total === 'number');
  assert.equal((await call('/api/inicio?parte=otra', { cookie: admin })).status, 400);
});
