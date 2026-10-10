import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
let route; let sentEmails;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
  ({ sentEmails } = await import('../lib/mock.js'));
});
async function call(body, cookie) {
  const res = await route(new Request('http://localhost/api/login' + (cookie === 'usuarios' ? '' : ''), { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(body) }), ENV);
  return { status: res.status, data: await res.json().catch(() => null), cookie: res.headers.get('set-cookie') };
}

test('¿Olvidaste tu contraseña?: email con enlace de un solo uso, contraseña nueva y entrar con ella', async () => {
  const admin = (await call({ password: 'admin' })).cookie.split(';')[0];
  const u = await route(new Request('http://localhost/api/usuarios', { method: 'POST', headers: { cookie: admin, 'content-type': 'text/plain' }, body: JSON.stringify({ op: 'crear', nombre: 'Laura Pérez', email: 'laura@ejemplo.com', rol: 'setter', enviar: false }) }), ENV);
  assert.equal(u.status, 200);
  // Un email que no existe responde igual (no se puede saber quién tiene acceso)
  const antes = sentEmails.length;
  const nadie = await call({ op: 'recuperar', email: 'nadie@ejemplo.com' });
  assert.equal(nadie.status, 200);
  assert.equal(sentEmails.length, antes);
  const r = await call({ op: 'recuperar', email: 'Laura@Ejemplo.com ' });
  assert.equal(r.status, 200);
  assert.equal(r.data.mensaje, nadie.data.mensaje);
  const mail = sentEmails.at(-1);
  assert.equal(mail.subject, 'Crea tu contraseña nueva');
  assert.match(mail.html, /Hola Laura 👋/);
  const token = mail.html.match(/\?reset=([A-Za-z0-9.]+)/)[1];
  // Enlace malo, contraseña corta
  assert.equal((await call({ op: 'restablecer', token: token.replace(/.$/, (c) => (c === '0' ? '1' : '0')), nueva: 'nuevaClave123' })).status, 400);
  assert.equal((await call({ op: 'restablecer', token, nueva: 'corta' })).status, 400);
  // Bien: cambia la contraseña y el enlace ya no vale
  assert.equal((await call({ op: 'restablecer', token, nueva: 'nuevaClave123' })).status, 200);
  assert.equal((await call({ op: 'restablecer', token, nueva: 'otraClave456' })).status, 400);
  const login = await call({ email: 'laura@ejemplo.com', password: 'nuevaClave123' });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  assert.equal(login.data.user.email, 'laura@ejemplo.com');
});
