import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
let route;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
});
const call = async (path, cookie) => {
  const res = await route(new Request(`http://localhost${path}`, { headers: cookie ? { cookie } : {} }), ENV);
  return { status: res.status, data: await res.json().catch(() => null) };
};
const login = async (password) => (await route(new Request('http://localhost/api/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password }) }), ENV)).headers.get('set-cookie').split(';')[0];

test('SendFlow: probar la conexión (solo quien configura) y analítica con fechas ddmmyyyy', async () => {
  assert.equal((await call('/api/sendflow?op=probar')).status, 401);
  assert.equal((await call('/api/sendflow?op=probar', await login('setter'))).status, 403);
  const d = (await call('/api/sendflow?op=probar', await login('admin'))).data;
  assert.equal(d.configurada, true);
  assert.equal(d.ok, true);
  assert.equal(d.variable, 'SENDFLOW_API_KEY');
  assert.ok(d.campanas.length >= 1);
  assert.equal(d.analitica.ok, true);
  const { analiticaSendflow } = await import('../lib/sendflow.js');
  const a = await analiticaSendflow('rel-demo');
  assert.ok(Object.keys(a.entradas.porDia).every((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)));
  assert.equal(a.entradas.total, Object.values(a.entradas.porDia).reduce((t, n) => t + n, 0));
});

test('SendFlow: sin clave (fuera del modo de prueba) avisa de la variable que falta', async () => {
  const { setEnv } = await import('../lib/env.js');
  setEnv({ ...ENV, GHL_MOCK: '0' });
  try {
    const { sendflowConfigurado, sendflow } = await import('../lib/sendflow.js');
    assert.equal(sendflowConfigurado(), false);
    await assert.rejects(sendflow('/releases'), (e) => /SENDFLOW_API_KEY/.test(e.publicMessage));
  } finally {
    setEnv(ENV);
  }
});
