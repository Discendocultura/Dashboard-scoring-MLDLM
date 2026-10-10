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

test('SendFlow: si bloquea la clave por exceso de peticiones, el dashboard deja de llamarle', async () => {
  const { setEnv } = await import('../lib/env.js');
  setEnv({ ...ENV, GHL_MOCK: '0', SENDFLOW_API_KEY: '  "Bearer send_api-abc123clave456"\n' });
  const real = globalThis.fetch;
  const llamadas = [];
  globalThis.fetch = async (url, opts) => {
    llamadas.push([url, opts.headers.authorization]);
    return new Response('{"message":"Chave temporariamente bloqueada: rate limit"}', { status: 403 });
  };
  try {
    const { formatoClave, campanasSendflow, frenoSendflow } = await import('../lib/sendflow.js');
    const f = formatoClave();
    assert.deepEqual([f.conBearer, f.comillas, f.prefijo, f.largo], [true, true, true, 23]);
    await assert.rejects(campanasSendflow(), (e) => /bloqueado/.test(e.publicMessage));
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0][0], 'https://sendflow.pro/sendapi/releases');
    assert.equal(llamadas[0][1], 'Bearer send_api-abc123clave456'); // clave limpia, sin comillas ni «Bearer» doble
    const freno = await frenoSendflow();
    assert.ok(freno.bloqueo && freno.hasta > Date.now() + 30 * 60_000);
    // Mientras dure el freno, ni una petición más (aunque se pulse «Probar»)
    await assert.rejects(campanasSendflow({ fresh: true }), (e) => e.status === 503);
    assert.equal(llamadas.length, 1);
    // Con una clave nueva, el freno de la anterior no cuenta
    setEnv({ ...ENV, GHL_MOCK: '0', SENDFLOW_API_KEY: 'send_api-claveNueva789' });
    assert.equal(await frenoSendflow(), null);
    setEnv({ ...ENV, GHL_MOCK: '0', SENDFLOW_API_KEY: '  "Bearer send_api-abc123clave456"\n' });
  } finally {
    globalThis.fetch = real;
    const { quitarFreno } = await import('../lib/sendflow.js');
    await quitarFreno();
    setEnv(ENV);
  }
});

test('SendFlow: grupos de la campaña vinculada a un lanzamiento (y sin vincular)', async () => {
  const { setEnv } = await import('../lib/env.js');
  setEnv(ENV);
  const admin = await login('admin');
  const cfg = (await route(new Request('http://localhost/api/config', { headers: { cookie: admin } }), ENV).then((r) => r.json())).config;
  const body = { ...cfg, launches: { oct: { name: 'Octubre', registroTag: 'r', sendflowId: 'rel-demo' }, nov: { name: 'Nov', registroTag: 'r2' } } };
  const r = await route(new Request('http://localhost/api/config', { method: 'POST', headers: { cookie: admin, 'content-type': 'text/plain' }, body: JSON.stringify(body) }), ENV);
  assert.equal(r.status, 200);
  const d = (await call('/api/sendflow?op=grupos&l=oct', admin)).data;
  assert.equal(d.vinculada, true);
  assert.ok(d.entradas > 0 && d.salidas > 0);
  assert.ok(d.porDia.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.dia)));
  assert.equal(d.grupos.length, 4);
  assert.equal(d.grupos.filter((g) => g.lleno).length, 3);
  assert.equal((await call('/api/sendflow?op=grupos&l=nov', admin)).data.vinculada, false);
  assert.equal((await call('/api/sendflow?op=grupos&l=nada', admin)).status, 404);
  assert.equal((await call('/api/sendflow?op=campanas', admin)).data.campanas.length, 2);
});
