// 📅 Membresía (Discendo): el aviso del día 1 «Sincroniza tus datos de Skool» sale cada mes hasta que alguien pulsa
// «Ya lo he hecho» (para todo el equipo) o se guarda una lectura de Skool ese mes.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { tocaAvisoSkool } from '../public/js/membresia.js';

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
  return { status: res.status, data: await res.json().catch(() => null) };
}
const login = async (password) => {
  const res = await route(new Request('http://localhost/api/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password }) }), ENV);
  return res.headers.get('set-cookie')?.split(';')[0];
};

test('regla: sale desde el día 1 hasta «Ya lo he hecho» o una lectura de ese mes', () => {
  assert.equal(tocaAvisoSkool({ hoy: '2026-12-01' }), true);
  assert.equal(tocaAvisoSkool({ hoy: '2026-12-15', hecho: '2026-11' }), true); // lo de noviembre no cuenta en diciembre
  assert.equal(tocaAvisoSkool({ hoy: '2026-12-15', hecho: '2026-12' }), false);
  assert.equal(tocaAvisoSkool({ hoy: '2026-12-03', mesLectura: '2026-12' }), false); // ya se leyó Skool este mes
  assert.equal(tocaAvisoSkool({ hoy: '2027-01-01', hecho: '2026-12', mesLectura: '2026-12' }), true); // y vuelve el día 1
  assert.equal(tocaAvisoSkool({ hoy: '' }), false);
});

test('API: toca, «Ya lo he hecho» lo quita para el equipo, solo en Discendo y solo con permiso de configuración', async () => {
  const admin = await login('admin');
  const setter = await login('setter');
  await call('/api/clientes', { method: 'POST', cookie: admin, body: { op: 'guardar', cliente: { id: 'discendo', nombre: 'Discendo', locationId: 'RXK123' } } });
  assert.notEqual((await call('/api/membresia?aviso=1', { cookie: admin })).status, 200); // en otro cliente no hay membresía
  const a = await call('/api/membresia?aviso=1', { cookie: admin, cliente: 'discendo' });
  assert.equal(a.status, 200);
  assert.equal(a.data.toca, true); // sin lectura de Skool este mes
  assert.notEqual((await call('/api/membresia', { method: 'POST', cookie: setter, cliente: 'discendo', body: { op: 'aviso-hecho' } })).status, 200);
  const h = await call('/api/membresia', { method: 'POST', cookie: admin, cliente: 'discendo', body: { op: 'aviso-hecho' } });
  assert.equal(h.status, 200);
  assert.match(h.data.mes, /^\d{4}-\d{2}$/);
  assert.equal((await call('/api/membresia?aviso=1', { cookie: admin, cliente: 'discendo' })).data.toca, false);
  // Guardar otra cosa de la configuración no lo vuelve a sacar.
  await call('/api/membresia', { method: 'POST', cookie: admin, cliente: 'discendo', body: { op: 'cfg', cfg: { prefijo: 'alumno' } } });
  assert.equal((await call('/api/membresia?aviso=1', { cookie: admin, cliente: 'discendo' })).data.toca, false);
});
