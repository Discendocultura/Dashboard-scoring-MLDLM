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
async function call(path, { method = 'GET', body, cookie, cliente } = {}) {
  const res = await route(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(cliente ? { 'x-cliente': cliente } : {}), 'content-type': 'text/plain' }, body: body ? JSON.stringify(body) : undefined }), ENV);
  return { status: res.status, data: await res.json().catch(() => null), res };
}
const login = async (body) => (await call('/api/login', { method: 'POST', body })).res.headers.get('set-cookie')?.split(';')[0];

test('equipo de la agencia: alta con acceso a varios clientes, separado del equipo de cada cliente', async () => {
  const admin = await login({ password: 'admin' });
  await call('/api/clientes', { method: 'POST', cookie: admin, body: { op: 'guardar', cliente: { id: 'clinica-sol', nombre: 'Clínica Sol', locationId: 'LOC123abc' } } });
  // Lista: clientes y roles de cada uno
  const lista = (await call('/api/usuarios?agencia=1', { cookie: admin })).data;
  assert.ok(lista.clientes.some((c) => c.id === 'clinica-sol'));
  assert.ok(lista.roles['clinica-sol'].some((r) => r.id === 'tecnico'));
  // Alta: técnica en los dos clientes
  const r = await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'agencia-guardar', nombre: 'Ana Agencia', email: 'ana@agencia.es', accesos: { mldlm: 'tecnico', 'clinica-sol': 'admin' }, enviar: false } });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.agencia, true);
  assert.ok(r.data.password);
  const eq = (await call('/api/usuarios?agencia=1', { cookie: admin })).data.equipo;
  assert.ok(eq.some((u) => u.email === 'ana@agencia.es' && u.accesos['clinica-sol'] === 'admin'));
  // En el equipo de Clínica Sol aparece como de la agencia
  const sol = (await call('/api/usuarios', { cookie: admin, cliente: 'clinica-sol' })).data.users;
  assert.equal(sol.find((u) => u.email === 'ana@agencia.es').agencia, true);
  // Puede entrar con su usuario y es admin en Clínica Sol
  const ana = await login({ email: 'ana@agencia.es', password: r.data.password });
  assert.equal((await call('/api/me', { cookie: ana, cliente: 'clinica-sol' })).data.role, 'admin');
  // Cambiar accesos: quitarle Clínica Sol
  const id = r.data.user.id;
  await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'agencia-guardar', id, accesos: { mldlm: 'tecnico' } } });
  assert.equal((await call('/api/me', { cookie: ana, cliente: 'clinica-sol' })).data.role, null);
  // Sin acceso a ningún cliente no se puede dar de alta
  assert.equal((await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'agencia-guardar', nombre: 'X', email: 'x@agencia.es', accesos: {}, enviar: false } })).status, 400);
  // Solo el superadmin
  const setter = await login({ password: 'setter' });
  assert.equal((await call('/api/usuarios?agencia=1', { cookie: setter })).status, 403);
  // Baja del equipo de la agencia
  assert.equal((await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'agencia-quitar', id } })).status, 200);
  assert.ok(!(await call('/api/usuarios?agencia=1', { cookie: admin })).data.equipo.some((u) => u.id === id));
});
