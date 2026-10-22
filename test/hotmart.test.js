import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ventasDeApi, ventaDeAvisoHotmart, plegarBumps, guardarVentaHm, netoProductora } from '../public/js/hotmart.js';
import { resumenThrivecart } from '../public/js/thrivecart.js';

const T = Date.parse('2026-10-21T10:00:00Z');
const compra = (tx, email, prod, precio, estado = 'APPROVED', extra = {}) => ({
  product: { id: prod, name: `Producto ${prod}` }, buyer: { email, name: 'Ana' },
  purchase: { transaction: tx, approved_date: T, order_date: T, status: estado, price: { value: precio, currency_code: 'EUR' }, payment: { type: 'SEQURA', installments_number: 1 }, ...extra },
});
const com = (v) => [{ source: 'PRODUCER', commission: { value: v, currency_code: 'EUR' } }, { source: 'AFFILIATE', commission: { value: 5 } }];

test('hotmart: de la API a ventas con lo que paga (bruto) y lo neto exacto de la productora', () => {
  assert.equal(netoProductora(com(86.4)), 86.4);
  assert.equal(netoProductora([{ source: 'AFFILIATE', commission: { value: 3 } }]), null, 'sin comisión de productora no se inventa');
  const [v] = ventasDeApi(compra('HP1', 'ANA@x.com', 15, 997), com(877.36));
  assert.deepEqual([v.tipo, v.email, v.importe, v.neto, v.productoId, v.fuente, v.metodo], ['cobro', 'ana@x.com', 997, 877.36, 'hm:15', 'hotmart', 'SEQURA']);
  // Devuelta: el cobro y su reembolso (los dos restan bien)
  const dev = ventasDeApi(compra('HP2', 'b@x.com', 15, 997, 'REFUNDED'), com(877.36));
  assert.deepEqual(dev.map((x) => [x.tipo, x.importe, x.neto]), [['cobro', 997, 877.36], ['reembolso', -997, -877.36]]);
  assert.deepEqual(ventasDeApi(compra('HP3', 'c@x.com', 15, 997, 'WAITING_PAYMENT'), []), [], 'pendiente: nada');
});

test('hotmart: el aviso (Postback 2.0), sin repetir con la API, y los bumps dentro de su compra', () => {
  const aviso = (event, tx, prod, precio, extra = {}) => ({ event, version: '2.0.0', creation_date: T, data: { product: { id: prod, name: `P${prod}` }, buyer: { email: 'a@x.com' }, purchase: { transaction: tx, approved_date: T, price: { value: precio, currency_value: 'EUR' }, ...extra }, commissions: [{ source: 'PRODUCER', value: precio * 0.88 }] } });
  const v = ventaDeAvisoHotmart(aviso('PURCHASE_APPROVED', 'HP9', 15, 997));
  assert.equal(v.neto, 877.36);
  assert.equal(ventaDeAvisoHotmart(aviso('PURCHASE_OUT_OF_SHOPPING_CART', 'HP9', 15, 997)), null);
  const r = ventaDeAvisoHotmart(aviso('PURCHASE_REFUNDED', 'HP9', 15, 997));
  assert.deepEqual([r.tipo, r.importe], ['reembolso', -997]);
  // El aprobado y el completo de la misma compra son la misma venta
  let lista = guardarVentaHm([], v).lista;
  assert.equal(guardarVentaHm(lista, ventaDeAvisoHotmart(aviso('PURCHASE_COMPLETE', 'HP9', 15, 997))).cambio, false);
  // La API trae la misma con el neto: se completa sin duplicar
  lista = guardarVentaHm([], { ...v, neto: null }).lista;
  lista = guardarVentaHm(lista, ventasDeApi(compra('HP9', 'a@x.com', 15, 997), com(877.36))[0]).lista;
  assert.equal(lista.length, 1);
  assert.equal(lista[0].neto, 877.36);
  // Bump: compra aparte con su madre → una venta con su línea de bump
  const bump = ventaDeAvisoHotmart(aviso('PURCHASE_APPROVED', 'HP10', 77, 27, { order_bump: { is_order_bump: true, parent_purchase_transaction: 'HP9' } }));
  const pl = plegarBumps([lista[0], bump]);
  assert.equal(pl.length, 1);
  assert.equal(pl[0].importe, 1024);
  assert.deepEqual(pl[0].lineas.map((l) => l.tipo), ['producto', 'bump']);
  const res = resumenThrivecart(pl, new Set(), { productos: ['hm:15'] });
  assert.equal(res.cobrado, 1024);
  assert.equal(res.extras[0].n, 1);
  assert.equal(res.porFuente.hotmart.cobros, 1);
  assert.equal(res.netoExacto, Math.round((877.36 + 27 * 0.88) * 100) / 100);
});

// Servidor: credenciales (comprobadas con Hotmart y cifradas), sincronización por la API y el aviso firmado.
const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
let route;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
});
test('hotmart: conectar la API, sincronizar y recibir avisos', async () => {
  const fetchReal = globalThis.fetch;
  const pedidas = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    pedidas.push(u);
    if (u.startsWith('https://api-sec-vlc.hotmart.com')) {
      return new Response(JSON.stringify(opts.headers?.Authorization === 'Basic QkFTSUM=' ? { access_token: 'tk', expires_in: 3600 } : { error: 'invalid' }), { status: opts.headers?.Authorization === 'Basic QkFTSUM=' ? 200 : 401 });
    }
    if (u.includes('/sales/history')) {
      const estado = new URL(u).searchParams.get('transaction_status');
      const items = estado === 'REFUNDED' ? [compra('HP2', 'b@x.com', 15, 997, 'REFUNDED')] : estado ? [] : [compra('HP1', 'a@x.com', 15, 997, 'APPROVED')];
      return new Response(JSON.stringify({ items, page_info: {} }));
    }
    if (u.includes('/sales/commissions')) return new Response(JSON.stringify({ items: [{ transaction: 'HP1', commissions: com(877.36) }, { transaction: 'HP2', commissions: com(877.36) }], page_info: {} }));
    return fetchReal(url, opts);
  };
  try {
    const call = async (path, { method = 'GET', body, cookie } = {}) => {
      const r = await route(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'text/plain' }, body: body ? JSON.stringify(body) : undefined }), ENV);
      return { status: r.status, data: await r.json().catch(() => null) };
    };
    const login = await route(new Request('http://localhost/api/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password: 'admin' }) }), ENV);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const mal = await call('/api/hotmart?op=credenciales', { method: 'POST', cookie, body: { clientId: 'cid-1234', clientSecret: 'sec', basic: 'Basic OTRO=' } });
    assert.equal(mal.status, 400, 'credencial que Hotmart no acepta');
    const ok = await call('/api/hotmart?op=credenciales', { method: 'POST', cookie, body: { clientId: 'cid-1234', clientSecret: 'sec', basic: 'Basic QkFTSUM=' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.nuevas, 3, 'HP1 cobrada + HP2 cobro y reembolso');
    const est = await call('/api/hotmart', { cookie });
    assert.equal(est.data.credencial.clientId, '…1234');
    assert.ok(!JSON.stringify(est.data).includes('sec"'), 'el secreto nunca vuelve al navegador');
    const { data } = await call('/api/hotmart?op=ventas&desde=0', { cookie });
    assert.deepEqual(data.ventas.map((v) => [v.pedido, v.tipo, v.neto]), [['HP1', 'cobro', 877.36], ['HP2', 'cobro', 877.36], ['HP2', 'reembolso', -877.36]]);
    // Aviso firmado: el bump de HP1 llega y se pliega en su compra
    const path = est.data.url.replace(/^https?:\/\/[^/]+/, '');
    assert.equal((await call(path.replace(/k=[^&]+/, 'k=malo'), { method: 'POST', body: {} })).status, 403);
    const av = await call(path, { method: 'POST', body: { event: 'PURCHASE_APPROVED', data: { product: { id: 77, name: 'Bump' }, buyer: { email: 'a@x.com' }, purchase: { transaction: 'HP5', approved_date: T, price: { value: 27 }, order_bump: { is_order_bump: true, parent_purchase_transaction: 'HP1' } }, commissions: [{ source: 'PRODUCER', value: 23.76 }] } } });
    assert.equal(av.data.guardada, true);
    const d2 = (await call('/api/hotmart?op=ventas&desde=0', { cookie })).data;
    const hp1 = d2.ventas.find((v) => v.pedido === 'HP1');
    assert.equal(hp1.importe, 1024);
    assert.equal(hp1.neto, 901.12);
    assert.equal((await call('/api/hotmart?op=ventas')).status, 401);
  } finally {
    globalThis.fetch = fetchReal;
  }
});

test('hotmart: si Hotmart rechaza el tamaño de página o un filtro opcional, se sigue sin él', async () => {
  const { ventasApi } = await import('../lib/hotmart-api.js');
  const pedidas = [];
  const fetchFn = async (url) => {
    const u = new URL(String(url));
    pedidas.push(u.pathname + u.search);
    if (u.hostname === 'api-sec-vlc.hotmart.com') return new Response(JSON.stringify({ access_token: 'tk2', expires_in: 3600 }));
    const p = u.searchParams;
    if (p.get('max_results') === '500') return new Response('{"error":"invalid max_results"}', { status: 400 });
    if (p.get('transaction_status') === 'PARTIALLY_REFUNDED' || p.get('commission_as')) return new Response('{"error":"invalid parameter"}', { status: 400 });
    if (u.pathname.endsWith('/sales/history')) return new Response(JSON.stringify({ items: p.get('transaction_status') ? [] : [compra('HPX', 'x@x.com', 15, 997)], page_info: {} }));
    return new Response(JSON.stringify({ items: [{ transaction: 'HPX', commissions: com(877.36) }], page_info: {} }));
  };
  const r = await ventasApi({ clientId: 'otro-cliente', secreto: 's', basic: 'b' }, { desde: 0, hasta: Date.now(), fetchFn });
  assert.equal(r.compras.length, 1);
  assert.equal(r.compras[0].comisiones.find((c) => c.source === 'PRODUCER').commission.value, 877.36);
  assert.ok(pedidas.some((x) => x.includes('max_results=50&') || x.endsWith('max_results=50')), 'reintenta con páginas de 50');
});

test('hotmart: si rechaza hasta las fechas, pide sin ellas y filtra aquí por la fecha de cada compra', async () => {
  const { ventasApi } = await import('../lib/hotmart-api.js');
  const vieja = { ...compra('HPV', 'v@x.com', 15, 997), purchase: { ...compra('HPV', 'v@x.com', 15, 997).purchase, approved_date: T - 90 * 86_400_000 } };
  const fetchFn = async (url) => {
    const u = new URL(String(url));
    if (u.hostname === 'api-sec-vlc.hotmart.com') return new Response(JSON.stringify({ access_token: 'tk3', expires_in: 3600 }));
    if (u.searchParams.get('start_date') || u.searchParams.get('transaction_status') || u.searchParams.get('commission_as')) return new Response('{"error":"invalid_parameter"}', { status: 400 });
    if (u.pathname.endsWith('/sales/history')) return new Response(JSON.stringify({ items: [compra('HPN', 'n@x.com', 15, 997), vieja], page_info: {} }));
    return new Response(JSON.stringify({ items: [{ transaction: 'HPN', commissions: com(877.36) }], page_info: {} }));
  };
  const r = await ventasApi({ clientId: 'sin-fechas', secreto: 's', basic: 'b' }, { desde: T - 30 * 86_400_000, hasta: T + 86_400_000, fetchFn });
  assert.deepEqual(r.compras.map((c) => c.item.purchase.transaction), ['HPN'], 'la de hace 90 días queda fuera');
  assert.equal(r.compras[0].comisiones[0].commission.value, 877.36);
});
