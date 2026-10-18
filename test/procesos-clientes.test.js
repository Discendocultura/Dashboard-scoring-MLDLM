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

test('procesos: la agencia comparte con los clientes y cada cliente tiene los suyos', async () => {
  const admin = cookieDe(await call('/api/login', { method: 'POST', body: { password: 'admin' } }));
  const nuevoUsuario = async (nombre, email, rol) => {
    const u = await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'crear', nombre, email, rol, enviar: false } });
    return cookieDe(await call('/api/login', { method: 'POST', body: { email, password: u.data.password } }));
  };
  const cli = await nuevoUsuario('Clienta', 'cli@ejemplo.com', 'cliente');
  const eq = await nuevoUsuario('Ana Equipo', 'ana@ejemplo.com', 'equipo');

  // La agencia crea dos procesos y comparte uno (con comentario interno que no debe verse)
  const a = (await call('/api/procesos', { method: 'POST', cookie: admin, body: { op: 'nuevo', titulo: 'Cómo pedir las facturas' } })).data.proceso;
  const b = (await call('/api/procesos', { method: 'POST', cookie: admin, body: { op: 'nuevo', titulo: 'Interno de la agencia' } })).data.proceso;
  await call('/api/procesos', { method: 'POST', cookie: admin, body: { op: 'comentar', id: a.id, texto: 'nota interna' } });
  const comp = (await call('/api/procesos', { method: 'POST', cookie: admin, body: { op: 'campos', id: a.id, campos: { compartido: true, fecha: '2026-11-02' } } })).data.proceso;
  assert.equal(comp.compartido, true);
  assert.ok(comp.actividad.some((x) => /compartió con todos los clientes/.test(x.txt)));

  // El cliente ve solo el compartido, en solo consulta y sin lo interno
  for (const ck of [cli, eq]) {
    const r = (await call('/api/procesos?ambito=agencia', { cookie: ck })).data;
    assert.equal(r.lectura, true);
    assert.deepEqual(r.procesos.map((p) => p.id), [a.id]);
    assert.equal(r.procesos[0].comentarios.length, 0);
    assert.equal(r.procesos[0].fecha, '');
    assert.ok(!r.procesos.some((p) => p.id === b.id));
  }
  // Y no puede cambiar la de la agencia
  assert.equal((await call('/api/procesos', { method: 'POST', cookie: cli, body: { op: 'nuevo', titulo: 'x' } })).status, 403);
  assert.equal((await call('/api/procesos', { method: 'POST', cookie: eq, body: { op: 'campos', id: a.id, campos: { compartido: false } } })).status, 403);

  // Los procesos internos del cliente: su equipo los crea y los edita; separados de los de la agencia
  const vacio = (await call('/api/procesos?ambito=cliente', { cookie: cli })).data;
  assert.equal(vacio.procesos.length, 0);
  assert.equal(vacio.ambito, 'cliente');
  assert.ok(!vacio.lectura);
  const mio = (await call('/api/procesos', { method: 'POST', cookie: cli, body: { ambito: 'cliente', op: 'nuevo', titulo: 'Cómo atendemos a las alumnas' } })).data.proceso;
  const ana = vacio.equipo.find((u) => u.nombre === 'Ana Equipo');
  assert.ok(ana && !vacio.equipo.some((u) => u.nombre === 'Admin'));
  // «compartido» y los proyectos no existen en la del cliente
  const ed = (await call('/api/procesos', { method: 'POST', cookie: eq, body: { ambito: 'cliente', op: 'campos', id: mio.id, campos: { responsable: ana.id, compartido: true, proyectos: ['mldlm'] } } })).data.proceso;
  assert.equal(ed.responsable, ana.id);
  assert.equal(ed.compartido, false);
  assert.deepEqual(ed.proyectos, []);
  assert.equal((await call('/api/procesos', { method: 'POST', cookie: eq, body: { ambito: 'cliente', op: 'campos', id: mio.id, campos: { responsable: 'uextrano123' } } })).status, 400);
  assert.equal((await call('/api/procesos', { method: 'POST', cookie: cli, body: { ambito: 'cliente', op: 'vaciar', confirmar: 'VACIAR' } })).status, 400);
  // Cada uno borra sus comentarios
  const conCom = (await call('/api/procesos', { method: 'POST', cookie: cli, body: { ambito: 'cliente', op: 'comentar', id: mio.id, texto: 'ojo con esto' } })).data.proceso;
  assert.equal((await call('/api/procesos', { method: 'POST', cookie: eq, body: { ambito: 'cliente', op: 'comentario-borrar', id: mio.id, cid: conCom.comentarios[0].id } })).status, 403);
  // La biblioteca de la agencia no ha cambiado y la del cliente la ve también el superadmin
  const ag = (await call('/api/procesos', { cookie: admin })).data;
  assert.deepEqual(ag.procesos.map((p) => p.id).sort(), [a.id, b.id].sort());
  assert.deepEqual((await call('/api/procesos?ambito=cliente', { cookie: admin })).data.procesos.map((p) => p.id), [mio.id]);
  // Sin sesión, nada
  assert.equal((await call('/api/procesos?ambito=cliente')).status, 401);
  assert.equal((await call('/api/procesos')).status, 401);
});
