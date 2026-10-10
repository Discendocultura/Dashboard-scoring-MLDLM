import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeDirecta, metricasDirecta, pendientesDirecta, extrasActivos, tareasDirecta, guiaDirecta, diaCompra } from '../public/js/directa.js';
import { pestanaIds, guiaEmbudo } from '../public/js/embudos-def.js';

const D = sanitizeDirecta({
  name: 'Guía del sueño', precio: 27, iva: { pct: 21, producto: 'incluido' }, compraTag: 'compra-guia', compraDateField: 'fc',
  partes: { bumps: true, upsell: true, downsell: true, visitas: true, meta: true }, metaFiltro: 'LT-guia', ventaUrl: 'https://a.com/v',
  bumps: [{ id: 'b1', nombre: 'Audios', precio: 9, iva: 'mas', tag: 'bump-audios' }, { id: 'b2', nombre: 'Apagado', precio: 5, iva: 'incluido', tag: 'bump-off', activo: false }],
  upsells: [{ id: 'u1', nombre: 'Curso', precio: 121, iva: 'incluido', tag: 'upsell-curso', url: 'https://a.com/up' }],
  downsells: [{ id: 'd1', nombre: 'Mini', precio: 30, iva: 'exento', tag: 'downsell-mini', url: 'javascript:alert(1)' }],
  objetivoCpa: 15, objetivoRoas: '1,5',
});

test('venta directa: limpia la configuración', () => {
  assert.equal(D.precio, 27);
  assert.equal(D.iva.producto, 'incluido');
  assert.deepEqual(D.partes, { bumps: true, upsell: true, downsell: true, visitas: true, meta: true });
  assert.equal(D.upsells[0].url, 'https://a.com/up');
  assert.equal(D.downsells[0].url, ''); // solo http(s)
  assert.equal(D.objetivoRoas, 1.5);
  // Sin partes: las de por defecto (sin downsell)
  assert.equal(sanitizeDirecta({}).partes.downsell, false);
  assert.equal(sanitizeDirecta({}).partes.bumps, true);
  // Extras que cuentan: activos, con etiqueta y con su parte encendida
  assert.deepEqual(extrasActivos(D).map((o) => o.id), ['b1', 'u1', 'd1']);
  assert.deepEqual(extrasActivos({ ...D, partes: { ...D.partes, upsell: false } }).map((o) => o.id), ['b1', 'd1']);
});

test('venta directa: ventas, extras (sin IVA), downsell sobre quien no cogió el upsell, CPA y ROAS', () => {
  const c = (id, tags, fc, dateAdded = '2026-01-01T10:00:00Z') => ({ id, name: id, tags, dateAdded, cf: fc ? { fc } : {} });
  const contactos = [
    c('a', ['compra-guia', 'bump-audios', 'upsell-curso'], '2026-10-05T10:00:00Z'),
    c('b', ['compra-guia', 'downsell-mini'], '2026-10-05T12:00:00Z'),
    c('c', ['compra-guia', 'bump-audios', 'bump-off'], '2026-10-06T09:00:00Z'),
    c('d', ['compra-guia'], '2026-10-07T09:00:00Z'),
    c('e', ['compra-guia'], '2026-09-01T09:00:00Z'), // fuera del rango
    c('f', ['otra'], '2026-10-05T09:00:00Z'),
  ];
  const visitas = { total: { venta: 100, checkout: 20 }, porDia: { '2026-10-05': { venta: 60, checkout: 12 } } };
  const m = metricasDirecta(contactos, D, { desde: '2026-10-01', hasta: '2026-10-10' }, { visitas, inversion: 60 });
  assert.equal(m.ventas, 4);
  const prod = 27 / 1.21;
  const fila = (id) => m.extras.find((x) => x.id === id);
  assert.equal(fila('b1').n, 2);
  assert.equal(fila('b1').pct, 0.5);
  assert.ok(Math.abs(fila('b1').precio - 9) < 1e-9); // «+ IVA»: el precio es sin IVA
  assert.equal(fila('u1').pct, 0.25);
  // Downsell: 1 de las 3 que no cogieron el upsell
  assert.equal(fila('d1').base, 3);
  assert.ok(Math.abs(fila('d1').pct - 1 / 3) < 1e-9);
  assert.equal(fila('d1').precio, 30); // exento: tal cual
  assert.equal(m.extras.some((x) => x.id === 'b2'), false); // el apagado no cuenta
  const total = 4 * prod + 2 * 9 + 121 / 1.21 + 30;
  assert.ok(Math.abs(m.facturacion - total) < 1e-6);
  assert.ok(Math.abs(m.ticket - total / 4) < 1e-6);
  assert.equal(m.cpa, 15);
  assert.ok(Math.abs(m.roas - total / 60) < 1e-9);
  assert.ok(Math.abs(m.beneficio - (total - 60)) < 1e-6);
  assert.equal(m.conversion.ventaCheckout, 0.2);
  assert.equal(m.conversion.checkoutCompra, 0.2);
  assert.equal(m.conversion.ventaCompra, 0.04);
  assert.equal(m.porDia.length, 10);
  assert.equal(m.porDia.find((x) => x.dia === '2026-10-05').ventas, 2);
  assert.equal(m.porDia.find((x) => x.dia === '2026-10-05').venta, 60);
  assert.equal(m.compradores[0].dia, '2026-10-07'); // más reciente primero
  assert.deepEqual(m.compradores.find((x) => x.id === 'a').extras, ['b1', 'u1']);
  const cpa = m.objetivos.find((o) => o.id === 'cpa');
  assert.equal(cpa.actual, 15);
  // Sin Meta: inversión a mano (€ al día × días)
  const manual = metricasDirecta(contactos, { ...D, inversionDia: 10 }, { desde: '2026-10-01', hasta: '2026-10-10' });
  assert.equal(manual.inversion, 100);
  assert.equal(manual.inversionFuente, 'manual');
});

test('venta directa: sin campo de fecha, el día es el de alta del contacto', () => {
  assert.equal(diaCompra({ dateAdded: '2026-10-05T23:30:00Z', cf: {} }, { compraDateField: '' }), '2026-10-06'); // hora de España
  assert.equal(diaCompra({ dateAdded: '2026-10-05T10:00:00Z', cf: { fc: '2026-10-08T10:00:00Z' } }, { compraDateField: 'fc' }), '2026-10-08');
});

test('venta directa: lo que falta, tareas, guía y pestañas', () => {
  assert.deepEqual(pendientesDirecta(D), []);
  const vacia = sanitizeDirecta({ partes: { bumps: true, upsell: false, downsell: false, visitas: false, meta: true } });
  const txt = pendientesDirecta(vacia).map((x) => x.txt).join(' | ');
  assert.match(txt, /etiqueta de compra/);
  assert.match(txt, /precio del producto/);
  assert.match(txt, /Bump offer/);
  assert.match(txt, /campañas de Meta/);
  assert.doesNotMatch(txt, /Upsell/);
  const t = tareasDirecta(vacia, { hoy: '2026-10-01' });
  assert.ok(t.some((x) => x.clave === 'directa:bumps'));
  assert.ok(!t.some((x) => x.clave === 'directa:upsell'));
  assert.equal(t[0].fecha, '2026-10-01');
  assert.equal(guiaDirecta({ bumps: true }).some((s) => /Upsell y downsell/.test(s.titulo)), false);
  assert.equal(guiaEmbudo('directa', undefined, undefined, undefined, { partes: { upsell: true } }).some((s) => /Upsell/.test(s.titulo)), true);
  assert.deepEqual(pestanaIds('directa'), ['dmetricas', 'dclientes', 'paginas', 'tareas', 'calendario']);
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
  return { status: res.status, data: await res.json().catch(() => null) };
}

test('venta directa: guardar el embudo, visitas públicas, métricas, tareas y permisos', async () => {
  const login = async (password) => {
    const res = await route(new Request('http://localhost/api/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password }) }), ENV);
    return res.headers.get('set-cookie').split(';')[0];
  };
  const admin = await login('admin');
  const cfg = (await call('/api/config', { cookie: admin })).data.config;
  const body = {
    ...cfg,
    embudos: [...cfg.embudos, { id: 'guia', tipo: 'directa', nombre: 'Guía' }, { id: 'huerfano', tipo: 'directa', nombre: 'Sin config' }],
    directas: { guia: { name: 'Guía', precio: 27, iva: { producto: 'incluido' }, compraTag: 'compra-guia-sueno', partes: { bumps: true, upsell: true, downsell: true, visitas: true, meta: true }, metaFiltro: 'LT-guia', bumps: [{ id: 'b1', nombre: 'Audios', precio: 9, iva: 'mas', tag: 'bump-audios-guia' }], upsells: [{ id: 'u1', nombre: 'Curso', precio: 97, iva: 'incluido', tag: 'upsell-curso-sueno' }], downsells: [{ id: 'd1', nombre: 'Mini', precio: 37, iva: 'incluido', tag: 'downsell-minicurso' }] } },
  };
  const saved = (await call('/api/config', { method: 'POST', cookie: admin, body })).data.config;
  assert.ok(saved.embudos.some((e) => e.id === 'guia' && e.tipo === 'directa'));
  assert.ok(!saved.embudos.some((e) => e.id === 'huerfano')); // sin configuración no existe
  assert.equal(saved.directas.guia.bumps[0].tag, 'bump-audios-guia');
  // Un lanzamiento no puede usar el id de un embudo de venta directa
  const choque = await call('/api/config', { method: 'POST', cookie: admin, body: { ...saved, launches: { ...saved.launches, guia: { name: 'X', registroTag: 'r' } } } });
  assert.equal(choque.status, 400);
  // Visitas públicas (únicas por visitante y página)
  for (const [v, p] of [['visit0001', 'venta'], ['visit0001', 'venta'], ['visit0002', 'venta'], ['visit0001', 'checkout']]) {
    assert.equal((await call('/api/directa', { method: 'POST', body: { op: 'visita', d: 'guia', pagina: p, v } })).status, 200);
  }
  assert.equal((await call('/api/directa', { method: 'POST', body: { op: 'visita', d: 'guia', pagina: 'otra', v: 'visit0001' } })).status, 400);
  // Métricas (solo con sesión)
  assert.equal((await call('/api/directa?d=guia')).status, 401);
  const m = (await call('/api/directa?d=guia&preset=90d&fresh=1', { cookie: admin })).data;
  assert.equal(m.ventas, 300);
  assert.deepEqual([m.visitas.venta, m.visitas.checkout], [2, 1]);
  assert.equal(m.inversionFuente, 'meta');
  assert.equal(m.extras.find((x) => x.id === 'b1').n, 100);
  assert.equal((await call('/api/directa?d=nada', { cookie: admin })).status, 404);
  // Tareas: la planificación propia del embudo
  const t = await call('/api/tareas', { method: 'POST', cookie: admin, body: { l: 'guia', op: 'plantilla' } });
  assert.equal(t.status, 200, JSON.stringify(t.data));
  assert.ok(t.data.tareas.some((x) => x.clave === 'directa:upsell'));
  // Inicio: la tarjeta del embudo
  const ini = (await call('/api/inicio?parte=lista', { cookie: admin })).data;
  assert.ok(ini.embudos.some((e) => e.id === 'guia' && e.tipo === 'directa'));
  const card = (await call('/api/inicio?parte=embudo&id=guia', { cookie: admin })).data.embudo;
  assert.equal(card.tipo, 'directa');
  assert.ok(card.kpis.ventas > 0);
});
