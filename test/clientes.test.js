import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
let route;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
});

// Petición a través del router (que es quien fija el cliente de cada petición).
async function call(path, { method = 'GET', body, cookie, cliente } = {}) {
  const res = await route(new Request(`http://localhost${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(cliente ? { 'x-cliente': cliente } : {}), 'content-type': 'text/plain' },
    body: body ? JSON.stringify(body) : undefined,
  }), ENV);
  return { status: res.status, data: await res.json().catch(() => null), res };
}
const login = async (body, cliente) => (await call('/api/login', { method: 'POST', body, cliente })).res.headers.get('set-cookie')?.split(';')[0];

test('varios clientes: registro, datos separados, equipo por cliente y accesos de la agencia', async () => {
  const admin = await login({ password: 'admin' }); // contraseña general de admin = superadmin
  const setter = await login({ password: 'setter' });

  // Solo el superadmin gestiona clientes
  assert.equal((await call('/api/clientes', { cookie: setter })).status, 403);
  let r = await call('/api/clientes', { cookie: admin });
  assert.equal(r.data.clientes.length, 1);
  assert.equal(r.data.clientes[0].principal, true);
  assert.equal((await call('/api/clientes', { method: 'POST', cookie: admin, body: { op: 'guardar', cliente: { id: 'Mal Id', nombre: 'X', locationId: 'abc' } } })).status, 400);
  r = await call('/api/clientes', { method: 'POST', cookie: admin, body: { op: 'guardar', cliente: { id: 'clinica-sol', nombre: 'Clínica Sol', locationId: 'LOC123abc', color: '#2266aa' } } });
  assert.equal(r.status, 200);
  const sol = r.data.clientes.find((c) => c.id === 'clinica-sol');
  assert.deepEqual(sol.variables, ['GHL_TOKEN_CLINICA_SOL']);
  assert.equal((await call('/api/clientes', { method: 'POST', cookie: admin, body: { op: 'probar', id: 'clinica-sol' } })).data.ok, true);

  // Cliente desconocido
  assert.equal((await call('/api/me', { cookie: admin, cliente: 'no-existe' })).status, 404);

  // /api/me: el superadmin ve los dos clientes
  const me = (await call('/api/me', { cookie: admin, cliente: 'clinica-sol' })).data;
  assert.equal(me.cliente.id, 'clinica-sol');
  assert.equal(me.superadmin, true);
  assert.deepEqual(me.clientes.map((c) => c.id), ['mldlm', 'clinica-sol']);

  // Configuración y tareas separadas por cliente
  const cfgSol = (await call('/api/config', { cookie: admin, cliente: 'clinica-sol' })).data.config;
  assert.deepEqual(cfgSol.launches, {});
  await call('/api/config', { method: 'POST', cookie: admin, cliente: 'clinica-sol', body: { ...cfgSol, launches: { 'sol-nov': { name: 'Sol noviembre', registroTag: 'registro-sol' } } } });
  assert.ok((await call('/api/config', { cookie: admin, cliente: 'clinica-sol' })).data.config.launches['sol-nov']);
  assert.equal((await call('/api/config', { cookie: admin })).data.config.launches['sol-nov'], undefined);
  await call('/api/tareas', { method: 'POST', cookie: admin, cliente: 'clinica-sol', body: { l: 'sol-nov', op: 'crear', avisar: false, tarea: { titulo: 'Tarea de Sol' } } });
  assert.equal((await call('/api/tareas?l=sol-nov', { cookie: admin, cliente: 'clinica-sol' })).data.tareas.length, 1);
  assert.equal((await call('/api/tareas?l=sol-nov', { cookie: admin })).status, 404); // en el principal no existe

  // La setter de la contraseña general solo entra en el principal
  assert.equal((await call('/api/tareas?l=sol-nov', { cookie: setter, cliente: 'clinica-sol' })).status, 403);
  assert.deepEqual((await call('/api/me', { cookie: setter, cliente: 'clinica-sol' })).data.clientes.map((c) => c.id), ['mldlm']);

  // Equipo de Clínica Sol: su admin solo ve a su gente
  const alta = (await call('/api/usuarios', { method: 'POST', cookie: admin, cliente: 'clinica-sol', body: { op: 'crear', nombre: 'Lucía Sol', email: 'lucia@sol.example.com', rol: 'admin' } })).data;
  assert.ok(alta.password);
  assert.deepEqual(alta.user.accesos, { 'clinica-sol': 'admin' });
  const lucia = await login({ email: 'lucia@sol.example.com', password: alta.password }, 'clinica-sol');
  assert.equal((await call('/api/tareas?l=sol-nov', { cookie: lucia, cliente: 'clinica-sol' })).status, 200);
  const meLucia = (await call('/api/me', { cookie: lucia })).data; // en el principal no tiene rol
  assert.equal(meLucia.role, null);
  assert.deepEqual(meLucia.clientes.map((c) => c.id), ['clinica-sol']);
  assert.equal((await call('/api/config', { cookie: lucia })).status, 403);
  assert.equal((await call('/api/clientes', { cookie: lucia, cliente: 'clinica-sol' })).status, 403);

  // Alguien de la agencia que ya existe en el principal: Lucía lo añade a su equipo (sin nueva contraseña)
  const ana = (await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'crear', nombre: 'Ana Agencia', email: 'ana@agencia.example.com', rol: 'setter' } })).data;
  const anadida = (await call('/api/usuarios', { method: 'POST', cookie: lucia, cliente: 'clinica-sol', body: { op: 'crear', nombre: 'Ana', email: 'ana@agencia.example.com', rol: 'setter' } })).data;
  assert.equal(anadida.anadido, true);
  assert.equal(anadida.password, undefined);
  const equipoSol = (await call('/api/usuarios', { cookie: lucia, cliente: 'clinica-sol' })).data;
  assert.deepEqual(equipoSol.users.map((u) => u.email).sort(), ['ana@agencia.example.com', 'lucia@sol.example.com']);
  assert.equal(equipoSol.todos, undefined); // solo el superadmin ve a todo el mundo
  // Lucía no puede cambiar la contraseña de Ana (trabaja en varios clientes); al quitarla, solo sale de Sol
  assert.equal((await call('/api/usuarios', { method: 'POST', cookie: lucia, cliente: 'clinica-sol', body: { op: 'regenerar', id: ana.user.id } })).status, 403);
  const quitada = (await call('/api/usuarios', { method: 'POST', cookie: lucia, cliente: 'clinica-sol', body: { op: 'borrar', id: ana.user.id } })).data;
  assert.equal(quitada.quitadoDeCliente, true);
  const anaCookie = await login({ email: 'ana@agencia.example.com', password: ana.password });
  assert.equal((await call('/api/me', { cookie: anaCookie })).data.role, 'setter');

  // El superadmin da accesos a varios clientes y puede nombrar otro superadmin
  const todos = (await call('/api/usuarios', { cookie: admin, cliente: 'clinica-sol' })).data.todos;
  assert.ok(todos.length >= 2);
  assert.equal((await call('/api/usuarios', { method: 'POST', cookie: lucia, cliente: 'clinica-sol', body: { op: 'accesos', id: ana.user.id, accesos: { mldlm: 'setter', 'clinica-sol': 'admin' } } })).status, 403);
  const acc = (await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'accesos', id: ana.user.id, accesos: { mldlm: 'setter', 'clinica-sol': 'tecnico', inventado: 'admin' } } })).data;
  assert.deepEqual(acc.user.accesos, { mldlm: 'setter', 'clinica-sol': 'tecnico' });
  assert.deepEqual((await call('/api/me', { cookie: anaCookie, cliente: 'clinica-sol' })).data.clientes.map((c) => c.id), ['mldlm', 'clinica-sol']);
  assert.equal((await call('/api/me', { cookie: anaCookie, cliente: 'clinica-sol' })).data.role, 'tecnico');

  // Las páginas públicas eligen el cliente con ?c= (sin él, el principal)
  assert.equal((await call('/api/vsl?c=clinica-sol')).data.error, 'VSL no encontrada'); // un cliente nuevo no tiene VSL
  assert.equal((await call('/api/vsl?c=nadie')).data.error, 'Cliente no encontrado');
  assert.deepEqual(cfgSol.embudos, []); // ni embudos: los crea con «+»
  assert.deepEqual(cfgSol.vsls, {});

  // Quitar el cliente: sus accesos desaparecen
  await call('/api/clientes', { method: 'POST', cookie: admin, body: { op: 'borrar', id: 'clinica-sol' } });
  assert.deepEqual((await call('/api/me', { cookie: anaCookie })).data.clientes.map((c) => c.id), ['mldlm']);
  assert.equal((await call('/api/clientes', { method: 'POST', cookie: admin, body: { op: 'borrar', id: 'mldlm' } })).status, 400);
});
