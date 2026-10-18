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
const cookieDe = (r) => r.res.headers.get('set-cookie').split(';')[0];

test('embudos por persona: el setter solo ve (y solo puede pedir) los embudos que tiene asignados', async () => {
  const admin = cookieDe(await call('/api/login', { method: 'POST', body: { password: 'admin' } }));
  const c = (await call('/api/config', { cookie: admin })).data;
  const g = await call('/api/config', { method: 'POST', cookie: admin, body: { ...c.config, _version: c.version, launches: { oct: { name: 'Octubre', embudo: 'lanz', registroTag: 'registrado-webinar-201026', vipTag: 'vip-oct', compraTag: 'compra-oct', inicioCaptacion: '2026-09-28', fechaDirecto: '2026-10-20' } } } });
  assert.equal(g.status, 200, JSON.stringify(g.data));

  // Al crearla se le asigna solo la VSL (un id que no existe se ignora)
  const u = (await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'crear', nombre: 'Sara Setter', email: 'sara@ejemplo.com', rol: 'setter', enviar: false, embudos: ['vsl', 'no-existe'] } })).data;
  assert.deepEqual(u.user.embudos, ['vsl']);
  let sara = cookieDe(await call('/api/login', { method: 'POST', body: { email: 'sara@ejemplo.com', password: u.password } }));

  // Lo que lee el cuerpo antes de comprobar la sesión sigue funcionando (p. ej. elegir su contraseña)
  const clave = await call('/api/usuarios', { method: 'POST', cookie: sara, body: { op: 'mi-clave-inicial', nueva: 'MiClave1234' } });
  assert.equal(clave.status, 200);
  sara = cookieDe(clave); // al poner su contraseña se cierran las sesiones de antes: entra con la nueva
  const suya = (await call('/api/config', { cookie: sara })).data.config;
  assert.deepEqual(suya.embudos.map((e) => e.id), ['vsl']);
  assert.deepEqual(Object.keys(suya.launches), []);
  assert.equal((await call('/api/tareas?l=oct', { cookie: sara })).status, 403);
  assert.equal((await call('/api/tareas?l=vsl', { cookie: sara })).status, 200);
  assert.equal((await call('/api/tareas', { method: 'POST', cookie: sara, body: { l: 'oct', op: 'crear', tarea: { titulo: 'x' } } })).status, 403);
  const lista = (await call('/api/inicio?parte=lista', { cookie: sara })).data;
  if (lista.embudos) assert.ok(!lista.embudos.some((e) => e.id === 'lanz'));
  // El admin los sigue viendo todos
  assert.equal((await call('/api/tareas?l=oct', { cookie: admin })).status, 200);

  // Con todos marcados vuelve a verlos todos
  const ed = (await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'editar', id: u.user.id, embudos: ['vsl', 'lanz'] } })).data;
  assert.deepEqual(ed.user.embudos, []);
  assert.equal((await call('/api/tareas?l=oct', { cookie: sara })).status, 200);
  assert.deepEqual(Object.keys((await call('/api/config', { cookie: sara })).data.config.launches), ['oct']);
});
