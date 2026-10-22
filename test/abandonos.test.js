import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// La etiqueta de carrito abandonado la pone la página de pago (visita.js); al comprar por ThriveCart o Hotmart se quita.
const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
let route;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
});
test('carrito abandonado: al comprar por Hotmart o ThriveCart se le quita la etiqueta de la página de pago', async () => {
  const call = async (path, { method = 'GET', body, cookie, form } = {}) => {
    const r = await route(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), 'content-type': form ? 'application/x-www-form-urlencoded' : 'text/plain' }, body: form ? new URLSearchParams(form).toString() : body ? JSON.stringify(body) : undefined }), ENV);
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const login = await route(new Request('http://localhost/api/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password: 'admin' }) }), ENV);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const cur = (await call('/api/config', { cookie })).data;
  const cfg = cur.config;
  cfg.launches = { ...cfg.launches, ca1: { name: 'Carrito', registroTag: 'registro-ca1', carritoAbandonadoTag: 'el-camino-carrito-abandonado' } };
  cfg._version = cur.version;
  assert.equal((await call('/api/config', { method: 'POST', cookie, body: cfg })).status, 200);
  const mock = await import('../lib/mock.js');
  const a = mock.upsertContact({ email: 'carrito-hm@x.com', firstName: 'Ana' });
  const b = mock.upsertContact({ email: 'carrito-tc@x.com', firstName: 'Bea' });
  mock.addTags(a.id, ['el-camino-carrito-abandonado']);
  mock.addTags(b.id, ['el-camino-carrito-abandonado', 'otra']);
  const hm = (await call('/api/hotmart', { cookie })).data.url.replace(/^https?:\/\/[^/]+/, '');
  await call(hm, { method: 'POST', body: { event: 'PURCHASE_APPROVED', data: { product: { id: 900, name: 'Raíces' }, buyer: { email: 'carrito-hm@x.com' }, purchase: { transaction: 'HPCA1', approved_date: Date.now(), price: { value: 1164 } }, commissions: [{ source: 'PRODUCER', value: 1024 }] } } });
  assert.ok(!mock.findContactByEmail('carrito-hm@x.com').tags.includes('el-camino-carrito-abandonado'));
  const tc = (await call('/api/thrivecart', { cookie })).data.url.replace(/^https?:\/\/[^/]+/, '');
  await call(tc, { method: 'POST', form: { event: 'order.success', mode: 'live', order_id: 'CA9', order_timestamp: String(Math.floor(Date.now() / 1000)), base_product: '15', base_product_name: 'Raíces', 'customer[email]': 'carrito-tc@x.com', 'order[total_str]': '997.00' } });
  assert.deepEqual(mock.findContactByEmail('carrito-tc@x.com').tags, ['otra'], 'solo se quita la de carrito abandonado');
});
