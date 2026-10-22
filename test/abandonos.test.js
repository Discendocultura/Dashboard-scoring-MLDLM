import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { abandonoDeWebhook } from '../public/js/thrivecart.js';
import { abandonoDeAvisoHotmart } from '../public/js/hotmart.js';
import { productosDeEmbudos } from '../lib/abandonos.js';

test('carrito abandonado: se entiende el aviso de ThriveCart y el de Hotmart', () => {
  const tc = abandonoDeWebhook({ event: 'cart.abandoned', 'customer[email]': 'Ana@X.com', 'customer[name]': 'Ana Pérez', 'customer[contactno]': '+34600111222', base_product: '15', base_product_name: 'Raíces' });
  assert.deepEqual([tc.fuente, tc.email, tc.telefono, tc.productoId], ['thrivecart', 'ana@x.com', '+34600111222', '15']);
  assert.equal(abandonoDeWebhook({ event: 'order.success', 'customer[email]': 'a@x.com' }), null);
  const hm = abandonoDeAvisoHotmart({ event: 'PURCHASE_OUT_OF_SHOPPING_CART', data: { buyer: { email: 'b@x.com', name: 'Bea', phone: '600222333' }, product: { id: 900, name: 'Raíces SeQura' } } });
  assert.deepEqual([hm.fuente, hm.email, hm.productoId], ['hotmart', 'b@x.com', 'hm:900']);
  assert.deepEqual(productosDeEmbudos({ launches: { a: { tcPrograma: ['15'], hmPrograma: ['900'] } }, cruzadas: { x: { productos: [{ hmId: '7' }] } } }).sort(), ['15', 'hm:7', 'hm:900']);
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
test('carrito abandonado: etiqueta en GHL al abandonar y se quita al comprar (recuperado)', async () => {
  const call = async (path, { method = 'GET', body, cookie } = {}) => {
    const r = await route(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'text/plain' }, body: body ? JSON.stringify(body) : undefined }), ENV);
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const login = await route(new Request('http://localhost/api/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password: 'admin' }) }), ENV);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const path = (await call('/api/hotmart', { cookie })).data.url.replace(/^https?:\/\/[^/]+/, '');
  const aviso = { event: 'PURCHASE_OUT_OF_SHOPPING_CART', data: { buyer: { email: 'nueva-abandono@x.com', name: 'Nora Gil', phone: '+34611000999' }, product: { id: 900, name: 'Raíces' } } };
  // Desactivado: no hace nada
  assert.equal((await call(path, { method: 'POST', body: aviso })).data.ignorado, 'desactivado');
  const g = await call('/api/config', { method: 'POST', cookie, body: { op: 'carritoAbandonado', datos: { activo: true, plantilla: 'setter-ia-enviar-carrito', esperaMin: 45 } } });
  assert.equal(g.status, 200);
  assert.equal(g.data.config.carritoAbandonado.esperaMin, 45);
  const r = await call(path, { method: 'POST', body: aviso });
  assert.equal(r.data.etiquetado, true);
  const { findContactByEmail } = await import('../lib/mock.js');
  const c = findContactByEmail('nueva-abandono@x.com');
  assert.ok(c.tags.includes('carrito-abandonado'));
  assert.equal(c.phone, '+34611000999', 'contacto nuevo: con su teléfono');
  // Compra: se quita la etiqueta y cuenta como recuperado
  await call(path, { method: 'POST', body: { event: 'PURCHASE_APPROVED', data: { product: { id: 900, name: 'Raíces' }, buyer: { email: 'nueva-abandono@x.com' }, purchase: { transaction: 'HPAB1', approved_date: Date.now(), price: { value: 1164 } }, commissions: [{ source: 'PRODUCER', value: 1024 }] } } });
  assert.ok(!findContactByEmail('nueva-abandono@x.com').tags.includes('carrito-abandonado'));
  const res = (await call('/api/thrivecart?op=abandonos', { cookie })).data;
  assert.deepEqual([res.total, res.recuperados], [1, 1]);
});
