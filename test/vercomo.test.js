import { test, before } from 'node:test';
import assert from 'node:assert/strict';

before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  setEnv({ GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret', DB: crearD1Local() });
});

const req = (path, { method = 'GET', body, cookie } = {}) => new Request(`http://localhost${path}`, {
  method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'text/plain' }, body: body ? JSON.stringify(body) : undefined,
});

test('«Ver como»: cookie firmada; con ella el servidor no deja cambiar nada', async () => {
  const { verComoCookie, verComoUid } = await import('../lib/auth.js');
  const { route } = await import('../lib/router.js');
  const { getEnv } = await import('../lib/env.js').then((m) => ({ getEnv: () => m.env }));
  const vc = (await verComoCookie('u_ana')).split(';')[0];
  assert.equal(await verComoUid(req('/', { cookie: vc })), 'u_ana');
  assert.equal(await verComoUid(req('/', { cookie: 'lsd_vercomo=u_ana.9999999999.falsa' })), ''); // firma inventada
  assert.equal(await verComoUid(req('/', { cookie: vc.replace('u_ana', 'u_otro') })), ''); // otra persona con la firma de Ana
  // Con «Ver como» puesto, cualquier cambio se rechaza (salvo salir de ahí).
  const r = await route(req('/api/operativa', { method: 'POST', body: { op: 'crear' }, cookie: vc }), getEnv());
  assert.equal(r.status, 403);
  assert.equal((await r.json()).verComo, true);
  const salir = await route(req('/api/vercomo', { method: 'POST', body: { op: 'salir' }, cookie: vc }), getEnv());
  assert.equal(salir.status, 200);
  assert.match(salir.headers.get('set-cookie'), /lsd_vercomo=;/);
});
