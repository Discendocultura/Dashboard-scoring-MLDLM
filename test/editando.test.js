import { test, before } from 'node:test';
import assert from 'node:assert/strict';

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
  return { status: res.status, data: await res.json().catch(() => null), res };
}
const login = async (password) => (await call('/api/login', { method: 'POST', body: { password } })).res.headers.get('set-cookie').split(';')[0];

test('editando (API): avisa de que otra persona edita, «Tomar el control» la echa y al salir queda libre', async () => {
  const a = await login('admin');
  const b = await login('admin');
  const ed = (cookie, op, sesion) => call('/api/editando', { method: 'POST', cookie, body: { op, sesion, que: 'el lanzamiento «Reto»' } });

  let r = await ed(a, 'entrar', 'pestana-uno');
  assert.equal(r.data.ok, true);
  assert.ok('version' in r.data);
  // La segunda pestaña ve quién está y desde cuándo
  r = await ed(b, 'entrar', 'pestana-dos');
  assert.equal(r.data.ocupado.nombre, 'Admin');
  assert.equal(r.data.ocupado.que, 'el lanzamiento «Reto»');
  assert.ok(r.data.ocupado.desde > 0);
  // La primera sigue con su turno
  assert.equal((await ed(a, 'latido', 'pestana-uno')).data.ok, true);
  // Toma el control: a la primera, en su siguiente latido, le dice quién la ha echado
  assert.equal((await ed(b, 'tomar', 'pestana-dos')).data.ok, true);
  assert.equal((await ed(a, 'latido', 'pestana-uno')).data.expulsado.nombre, 'Admin');
  assert.ok((await ed(a, 'entrar', 'pestana-uno')).data.ocupado);
  // Quien no lo tiene no puede liberarlo; quien lo tiene, sí
  await ed(a, 'salir', 'pestana-uno');
  assert.ok((await ed(a, 'entrar', 'pestana-uno')).data.ocupado);
  await ed(b, 'salir', 'pestana-dos');
  assert.equal((await ed(a, 'entrar', 'pestana-uno')).data.ok, true);
});

test('editando (API): hace falta poder configurar y una sesión de pestaña válida', async () => {
  const setter = await login('setter');
  assert.equal((await call('/api/editando', { method: 'POST', cookie: setter, body: { op: 'entrar', sesion: 'pestana-tres' } })).status, 403);
  const a = await login('admin');
  assert.equal((await call('/api/editando', { method: 'POST', cookie: a, body: { op: 'entrar', sesion: 'x' } })).status, 400);
  assert.equal((await call('/api/editando', { method: 'POST', cookie: a, body: { op: 'otra', sesion: 'pestana-tres' } })).status, 400);
  assert.equal((await call('/api/editando', { method: 'POST' })).status, 401);
});
