import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ventaDeWebhook, anadirVenta, resumenThrivecart, tipoEvento } from '../public/js/thrivecart.js';

// Aviso de ThriveCart tal como llega (formulario con claves planas).
const aviso = (extra = {}) => ({
  event: 'order.success', mode: 'live', order_id: '123', invoice_id: '9', currency: 'EUR', order_timestamp: '1792400000',
  base_product: '7', base_product_name: 'Entrada VIP El Camino', 'customer[email]': 'Ana@Ejemplo.com', 'customer[name]': 'Ana',
  'order[total]': '900', 'order[total_str]': '9.00', ...extra,
});

test('thrivecart: del aviso a una venta (importe, email, producto, fecha)', () => {
  const v = ventaDeWebhook(aviso());
  assert.equal(v.tipo, 'cobro');
  assert.equal(v.importe, 9);
  assert.equal(v.email, 'ana@ejemplo.com');
  assert.equal(v.producto, 'Entrada VIP El Camino');
  assert.equal(v.fecha, 1792400000 * 1000);
  assert.equal(ventaDeWebhook(aviso({ 'order[total_str]': '' })).importe, 9, 'sin total_str: céntimos / 100');
  const r = ventaDeWebhook(aviso({ event: 'order.refund', 'refund[amount]': '900', 'refund[amount_str]': '9.00' }));
  assert.equal(r.tipo, 'reembolso');
  assert.equal(r.importe, -9);
  assert.equal(ventaDeWebhook({ event: 'cart.abandoned', 'customer[email]': 'x@y.z' }), null);
  assert.equal(tipoEvento('order.subscription_payment'), 'cobro');
  assert.equal(ventaDeWebhook(aviso({ mode: 'test' })).prueba, true);
});

test('thrivecart: sin repetir avisos y resumen del lanzamiento (leads, reembolsos, fuera, pruebas)', () => {
  let lista = [];
  for (const b of [aviso(), aviso(), aviso({ order_id: '124', 'customer[email]': 'otra@x.com', 'order[total_str]': '97.00' }),
    aviso({ event: 'order.refund', 'refund[amount_str]': '9.00' }), aviso({ order_id: '125', mode: 'test', 'order[total_str]': '50.00' })]) {
    lista = anadirVenta(lista, ventaDeWebhook(b)).lista;
  }
  assert.equal(lista.length, 4, 'el aviso repetido no se guarda dos veces');
  const r = resumenThrivecart(lista, new Set(['ana@ejemplo.com']));
  assert.equal(r.cobros, 1);
  assert.equal(r.cobrado, 9);
  assert.equal(r.reembolsado, 9);
  assert.equal(r.neto, 0);
  assert.deepEqual(r.fuera, { cobros: 1, importe: 97 });
  assert.equal(r.emailsCompra.size, 0, 'con todo devuelto no cuenta como compradora');
  assert.equal(resumenThrivecart(lista, new Set(['ana@ejemplo.com']), { desde: Date.now() }).cobros, 0, 'fuera del periodo');
});

// Servidor: dirección firmada por cliente, HEAD, aviso y consulta.
const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
let route;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
});
test('thrivecart: la dirección de aviso guarda las ventas y AlquimIA las lee', async () => {
  const call = async (path, { method = 'GET', body, cookie, form } = {}) => {
    const headers = { ...(cookie ? { cookie } : {}), 'content-type': form ? 'application/x-www-form-urlencoded' : 'text/plain' };
    const r = await route(new Request(`http://localhost${path}`, { method, headers, body: form ? new URLSearchParams(form).toString() : body ? JSON.stringify(body) : undefined }), ENV);
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const login = await route(new Request('http://localhost/api/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password: 'admin' }) }), ENV);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const { data: cx } = await call('/api/thrivecart', { cookie });
  assert.match(cx.url, /\/api\/thrivecart\?c=[^&]+&k=thrivecart:/);
  const path = cx.url.replace(/^https?:\/\/[^/]+/, '');
  assert.equal((await route(new Request(`http://localhost${path}`, { method: 'HEAD' }), ENV)).status, 200);
  assert.equal((await call(path.replace(/k=[^&]+/, 'k=malo'), { method: 'POST', form: aviso() })).status, 403);
  const ok = await call(path, { method: 'POST', form: aviso() });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.guardada, true);
  assert.equal((await call(path, { method: 'POST', form: aviso() })).data.guardada, false, 'el mismo aviso dos veces no duplica');
  const { data } = await call('/api/thrivecart?op=ventas&desde=0', { cookie });
  assert.equal(data.ventas.length, 1);
  assert.equal(data.ventas[0].importe, 9);
  assert.equal((await call('/api/thrivecart?op=ventas')).status, 401, 'sin sesión no se leen las ventas');
});
