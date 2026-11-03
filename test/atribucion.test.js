import { test, before } from 'node:test';
import assert from 'node:assert/strict';

before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  setEnv({ GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret', DB: crearD1Local() });
});

test('Origen: toques limpios, id de Meta y plantillas sin sustituir', async () => {
  const { limpiarToque, esDeMeta } = await import('../public/js/origen.js');
  assert.equal(limpiarToque({ source: 'facebook', adId: '{{ad.id}}' }).adId, undefined);
  assert.equal(limpiarToque({}), null);
  const t = limpiarToque({ source: 'facebook', medium: 'paid', campaign: 'Webinar · Frío', content: '23851234567', en: 5 });
  assert.equal(t.adId, '23851234567'); // utm_content={{ad.id}}
  assert.ok(esDeMeta(t));
  assert.ok(!esDeMeta(limpiarToque({ source: 'newsletter', medium: 'email', campaign: 'x' })));
});

test('Origen: API pública guarda primer y último toque; el primero no se pisa', async () => {
  const { POST } = await import('../handlers/origen.js');
  const post = (b) => POST(new Request('http://localhost/api/origen', { method: 'POST', body: JSON.stringify(b) }));
  assert.equal((await post({ email: 'ana@x.es' })).status, 400);
  await post({ email: 'Ana@X.es', cid: 'abc123', p: { source: 'facebook', adId: '23850000331', en: 1000 }, u: { source: 'facebook', adId: '23850000331', en: 1000 } });
  await post({ email: 'ana@x.es', p: { source: 'facebook', adId: '23850000999', en: 5000 }, u: { source: 'facebook', adId: '23850000999', en: 5000 } });
  const { origenesPorEmail, resolverOrigen } = await import('../lib/origen.js');
  const o = (await origenesPorEmail(['ana@x.es'])).get('ana@x.es');
  assert.deepEqual([o.primero.adId, o.ultimo.adId], ['23850000331', '23850000999']);
  assert.equal(resolverOrigen({ propio: o }).toque.adId, '23850000331');
  assert.equal(resolverOrigen({ propio: o, modelo: 'ultimo' }).toque.adId, '23850000999');
  assert.equal(resolverOrigen({ ghl: { source: 'facebook', campaign: 'Webinar · Frío' } }).fuente, 'ghl');
});

test('Ventas reales en el árbol: directas, indirectas, reembolsos, ROAS y 7-3-1', async () => {
  const { ventasEnArbol, vista731 } = await import('../public/js/origen.js');
  const arbol = () => ({ total: { gasto: 300 }, campanas: [{ id: '1201', nombre: 'Webinar · Frío', m: { gasto: 300 }, hijos: [
    { id: '220', nombre: 'Conjunto 1', m: { gasto: 200 }, hijos: [{ id: '330', nombre: 'Anuncio 1', m: { gasto: 200 }, hijos: [] }] },
    { id: '221', nombre: 'Conjunto 2', m: { gasto: 100 }, hijos: [{ id: '331', nombre: 'Anuncio 2', m: { gasto: 100 }, hijos: [] }] }] }] });
  const A = arbol();
  const ventas = [
    { dia: '2026-11-01', importe: 497, tipo: 'directa', toque: { adId: '330' } },
    { dia: '2026-11-02', importe: 97, tipo: 'indirecta', toque: { adId: '330' } },
    { dia: '2026-11-02', importe: -97, tipo: 'indirecta', reembolso: true, toque: { adId: '330' } },
    { dia: '2026-11-02', importe: 300, tipo: 'directa', toque: { source: 'facebook', medium: 'paid', term: 'Conjunto 2' } }, // por nombre del conjunto
    { dia: '2026-11-02', importe: 50, tipo: 'directa', toque: { adId: '999' } }, // otra campaña
    { dia: '2026-11-02', importe: 40, tipo: 'directa' }, // sin origen
  ];
  const r = ventasEnArbol(A, ventas, { desde: '2026-11-01', hasta: '2026-11-03' });
  assert.deepEqual([r.atribuidas, r.otras, r.sinOrigen], [4, 1, 1]);
  const ad1 = A.campanas[0].hijos[0].hijos[0].real;
  assert.deepEqual([ad1.ventas, ad1.directos, ad1.indirectos, ad1.ingresos, ad1.reembolsos], [1, 497, 97, 497, 97]);
  assert.equal(ad1.roas, 497 / 200);
  assert.equal(A.campanas[0].hijos[1].real.ventas, 1);
  assert.deepEqual([A.totalReal.ventas, A.totalReal.ingresos], [2, 797]);
  const v = vista731(arbol(), { hoy: '2026-11-02', g7: [{ campaign_id: '1201', adset_id: '220', ad_id: '330', spend: 100 }], g3: [{ campaign_id: '1201', adset_id: '220', ad_id: '330', spend: 50 }], g1: [] }, ventas);
  assert.equal(v.get('330').r7, 497 / 100);
  assert.equal(v.get('330').g1, 0);
  assert.equal(v.get('330').r1, null);
});

test('Ventas atribuidas (servidor): rescate por tracker y directa/indirecta', async () => {
  const { guardarJSON } = await import('../lib/store.js');
  const ahora = Date.now();
  await guardarJSON('lsd_hotmart_ventas', { ventas: [
    { id: 'hm1', email: 'ana@x.es', tipo: 'cobro', importe: 497, fecha: ahora - 2 * 86_400_000, producto: 'Raíces' },
    { id: 'hm2', email: 'ana@x.es', tipo: 'cobro', importe: 97, fecha: ahora - 3_600_000, producto: 'Upsell' },
    { id: 'hm3', email: 'otro@x.es', tipo: 'cobro', importe: 47, fecha: ahora - 3_600_000, producto: 'VIP' },
  ] });
  const { getConfig } = await import('../lib/config-store.js');
  const { ventasAtribuidas } = await import('../lib/ventas-reales.js');
  const config = await getConfig({ fresh: true });
  const embudo = config.embudos[0].id;
  const r = await ventasAtribuidas(config, { embudo, rango: { desde: '2000-01-01', hasta: '2999-01-01' }, fresh: true });
  const ana = r.ventas.filter((x) => x.toque?.adId === '23850000331');
  assert.deepEqual(ana.map((x) => x.tipo).sort(), ['directa', 'indirecta']);
  assert.ok(r.ventas.some((x) => !x.toque)); // otro@x.es: sin origen
});

test('CAPI: compra posterior con el clic del anuncio original; Lead e InitiateCheckout', async () => {
  const { POST } = await import('../handlers/origen.js');
  await POST(new Request('http://localhost/api/origen', { method: 'POST', body: JSON.stringify({ email: 'bea@x.es', p: { source: 'facebook', adId: '330', campaign: 'Webinar · Frío', fbclid: 'IwAR123', en: 1700000000000 } }) }));
  const { enviarEventoMeta, enviados } = await import('../lib/meta-capi.js');
  const config = { metaCapi: { activo: true, pixelId: '1234567890' } };
  await enviarEventoMeta({ tipo: 'compras', eventId: 'hm-ren', config, datos: { email: 'bea@x.es' }, custom: { value: 47 } });
  const e = enviados.at(-1).data[0];
  assert.equal(e.user_data.fbc, 'fb.1.1700000000000.IwAR123');
  assert.equal(e.custom_data.origen_campana, 'Webinar · Frío');
  const { senalesDe } = await import('../lib/meta-capi-senales.js');
  const ahora = Date.now();
  const s = senalesDe([{ id: 'n1', email: 'n@x.es', score: 0, s: {}, dateAdded: new Date(ahora - 86_400_000).toISOString() }, { id: 'v1', email: 'v@x.es', score: 0, s: {}, dateAdded: '2020-01-01T00:00:00Z' }], 'nov', new Set(), ahora);
  assert.deepEqual(s.map((x) => x.eventId), ['lead-nov-n1']);
  const { sanitizeMetaCapi } = await import('../public/js/meta-capi.js');
  assert.deepEqual([sanitizeMetaCapi({}).eventos.lead, sanitizeMetaCapi({}).eventos.pago], [false, false]);
  const { calidadDatos } = await import('../lib/meta-capi.js');
  assert.deepEqual(calidadDatos([{ user_data: { em: ['x'], fbc: 'y' } }, { user_data: { em: ['x'] } }]), { email: 100, telefono: 0, clic: 50, cookie: 0, ip: 0 });
});
