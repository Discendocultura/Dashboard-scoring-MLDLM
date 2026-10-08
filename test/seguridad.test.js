import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
let route;
let totp;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
  totp = await import('../lib/totp.js');
});

async function call(path, { method = 'GET', body, cookie, ip = '10.0.0.1' } = {}) {
  const res = await route(new Request(`http://localhost${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), 'cf-connecting-ip': ip, 'content-type': 'text/plain' },
    body: body ? JSON.stringify(body) : undefined,
  }), ENV);
  return { status: res.status, data: await res.json().catch(() => null), cookie: res.headers.get('set-cookie')?.split(';')[0] };
}
const codigoAhora = async (secreto, desfase = 0) => totp.codigoTotp(secreto.replace(/\s/g, ''), Math.floor(Date.now() / 30_000) + desfase);

test('totp: vectores del RFC 6238 y códigos de recuperación', async () => {
  const s = totp.base32(new TextEncoder().encode('12345678901234567890'));
  assert.equal(await totp.codigoTotp(s, 1), '287082');
  assert.equal(await totp.codigoTotp(s, Math.floor(1111111109 / 30)), '081804');
  const paso = await totp.verificarTotp(s, '081804', { ahora: 1111111109 * 1000 });
  assert.equal(paso, Math.floor(1111111109 / 30));
  assert.equal(await totp.verificarTotp(s, '081804', { ahora: 1111111109 * 1000, ultimo: paso }), null); // no vale dos veces
  const [c1, c2] = totp.nuevosCodigosRecuperacion(2);
  const hashes = await Promise.all([c1, c2].map(totp.hashRecuperacion));
  assert.deepEqual(await totp.usarRecuperacion(hashes, c1.toUpperCase()), [hashes[1]]);
  assert.equal(await totp.usarRecuperacion(hashes, 'zzzz-zzzz'), null);
  assert.equal(await totp.descifrar(await totp.cifrar('SECRETO')), 'SECRETO');
});

test('login: bloqueo tras 5 fallos con el mismo email', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).cookie;
  const nuevo = await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'crear', nombre: 'Lola Prueba', email: 'lola@ejemplo.com', rol: 'setter', enviar: false } });
  assert.equal(nuevo.status, 200);
  for (let i = 0; i < 5; i++) {
    assert.equal((await call('/api/login', { method: 'POST', ip: `10.1.0.${i}`, body: { email: 'lola@ejemplo.com', password: 'mal' } })).status, 401);
  }
  // Bloqueada aunque ahora acierte (y desde otra conexión)
  const r = await call('/api/login', { method: 'POST', ip: '10.2.0.1', body: { email: 'lola@ejemplo.com', password: nuevo.data.password } });
  assert.equal(r.status, 429);
  assert.match(r.data.error, /Demasiados intentos/);
  // Otro email no está bloqueado
  assert.equal((await call('/api/login', { method: 'POST', ip: '10.2.0.1', body: { email: 'otra@ejemplo.com', password: 'x' } })).status, 401);
});

test('verificación en dos pasos: activar en Mi cuenta, entrar con código o recuperación, quitar', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).cookie;
  const nuevo = await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'crear', nombre: 'Ana Admin', email: 'ana@ejemplo.com', rol: 'admin', enviar: false } });
  const pass = nuevo.data.password;
  const ana = (await call('/api/login', { method: 'POST', ip: '10.3.0.1', body: { email: 'ana@ejemplo.com', password: pass } })).cookie;
  assert.ok(ana);
  const ini = await call('/api/usuarios', { method: 'POST', cookie: ana, body: { op: 'mi-2fa-iniciar' } });
  assert.match(ini.data.uri, /^otpauth:\/\/totp\//);
  assert.equal((await call('/api/usuarios', { method: 'POST', cookie: ana, body: { op: 'mi-2fa-activar', codigo: '000000' } })).status, 400);
  const act = await call('/api/usuarios', { method: 'POST', cookie: ana, body: { op: 'mi-2fa-activar', codigo: await codigoAhora(ini.data.secreto) } });
  assert.equal(act.status, 200);
  assert.equal(act.data.codigosRecuperacion.length, 10);
  // El secreto nunca sale en la lista del equipo
  const lista = await call('/api/usuarios', { cookie: admin });
  assert.ok(!JSON.stringify(lista.data).includes('secreto'));
  assert.equal(lista.data.users.find((u) => u.email === 'ana@ejemplo.com').dosPasos, true);

  // Entrar: primero email y contraseña → ticket, sin cookie
  const p1 = await call('/api/login', { method: 'POST', ip: '10.3.0.2', body: { email: 'ana@ejemplo.com', password: pass } });
  assert.equal(p1.data.dosPasos, true);
  assert.equal(p1.data.alta, false);
  assert.equal(p1.cookie, undefined);
  assert.equal((await call('/api/login', { method: 'POST', ip: '10.3.0.2', body: { ticket: p1.data.ticket, codigo: '123456' } })).status, 401);
  assert.equal((await call('/api/login', { method: 'POST', ip: '10.3.0.2', body: { ticket: `${p1.data.ticket}x`, codigo: '123456' } })).data.caducado, true);
  // El código de la activación ya se usó: hace falta el siguiente (o uno de recuperación)
  const p2 = await call('/api/login', { method: 'POST', ip: '10.3.0.2', body: { ticket: p1.data.ticket, codigo: act.data.codigosRecuperacion[0] } });
  assert.equal(p2.status, 200);
  assert.ok(p2.cookie);
  assert.equal(p2.data.recuperacionQuedan, 9);
  // Un código de recuperación no vale dos veces
  assert.equal((await call('/api/login', { method: 'POST', ip: '10.3.0.2', body: { ticket: p1.data.ticket, codigo: act.data.codigosRecuperacion[0] } })).status, 401);
  const p3 = await call('/api/login', { method: 'POST', ip: '10.3.0.2', body: { ticket: p1.data.ticket, codigo: await codigoAhora(ini.data.secreto, 1) } });
  assert.equal(p3.status, 200);

  // Quitar: pide contraseña (y código); el admin puede quitársela a otra persona
  assert.equal((await call('/api/usuarios', { method: 'POST', cookie: p3.cookie, body: { op: 'mi-2fa-quitar', actual: 'mal', codigo: '1' } })).status, 403);
  const id = lista.data.users.find((u) => u.email === 'ana@ejemplo.com').id;
  assert.equal((await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'quitar-2fa', id } })).status, 200);
  const sin = await call('/api/login', { method: 'POST', ip: '10.3.0.3', body: { email: 'ana@ejemplo.com', password: pass } });
  assert.ok(sin.cookie);
});

test('seguridad: 2FA obligatoria para admins y desactivar la contraseña general', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).cookie;
  // La contraseña general no puede desactivarse a sí misma (podría dejar a todos fuera)
  assert.equal((await call('/api/seguridad', { method: 'POST', cookie: admin, body: { op: 'guardar', contrasenaGeneral: false } })).status, 400);
  const nuevo = await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'crear', nombre: 'Super Uno', email: 'super@ejemplo.com', rol: 'admin', enviar: false } });
  const id = nuevo.data.user.id;
  assert.equal((await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'accesos', id, accesos: { mldlm: 'admin' }, superadmin: true } })).status, 200);
  const sup = (await call('/api/login', { method: 'POST', ip: '10.4.0.1', body: { email: 'super@ejemplo.com', password: nuevo.data.password } })).cookie;
  // Para exigirla hay que tenerla uno mismo
  assert.equal((await call('/api/seguridad', { method: 'POST', cookie: sup, body: { op: 'guardar', exigir2fa: true } })).status, 400);
  // Un admin sin superadmin no cambia los ajustes
  const setterUser = await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'crear', nombre: 'Admin Normal', email: 'normal@ejemplo.com', rol: 'admin', enviar: false } });
  const normal = (await call('/api/login', { method: 'POST', ip: '10.4.0.2', body: { email: 'normal@ejemplo.com', password: setterUser.data.password } })).cookie;
  assert.equal((await call('/api/seguridad', { method: 'POST', cookie: normal, body: { op: 'guardar', exigir2fa: true } })).status, 403);
  const ini = await call('/api/usuarios', { method: 'POST', cookie: sup, body: { op: 'mi-2fa-iniciar' } });
  await call('/api/usuarios', { method: 'POST', cookie: sup, body: { op: 'mi-2fa-activar', codigo: await codigoAhora(ini.data.secreto) } });
  assert.equal((await call('/api/seguridad', { method: 'POST', cookie: sup, body: { op: 'guardar', exigir2fa: true, contrasenaGeneral: false } })).status, 200);

  // Admin sin 2FA: al entrar tiene que activarla
  const p1 = await call('/api/login', { method: 'POST', ip: '10.4.0.3', body: { email: 'normal@ejemplo.com', password: setterUser.data.password } });
  assert.equal(p1.data.alta, true);
  const alta = await call('/api/login', { method: 'POST', ip: '10.4.0.3', body: { ticket: p1.data.ticket, op: '2fa-iniciar' } });
  const dentro = await call('/api/login', { method: 'POST', ip: '10.4.0.3', body: { ticket: p1.data.ticket, codigo: await codigoAhora(alta.data.secreto) } });
  assert.equal(dentro.status, 200);
  assert.equal(dentro.data.codigosRecuperacion.length, 10);
  assert.equal(dentro.data.user.dosPasos, true);
  // Siendo obligatoria, no se la puede quitar ella misma
  assert.equal((await call('/api/usuarios', { method: 'POST', cookie: dentro.cookie, body: { op: 'mi-2fa-quitar', actual: setterUser.data.password, codigo: await codigoAhora(alta.data.secreto, 1) } })).status, 400);

  // Contraseña general desactivada: ni entra ni valen las cookies que ya había
  assert.equal((await call('/api/login', { method: 'POST', ip: '10.4.0.4', body: { password: 'admin' } })).status, 403);
  assert.equal((await call('/api/config', { cookie: admin })).status, 401);
  const g = await call('/api/seguridad', { cookie: sup });
  assert.equal(g.data.seguridad.contrasenaGeneral, false);
  assert.equal(g.data.usuarios.find((u) => u.email === 'normal@ejemplo.com').dosPasos, true);
  // Comprobar permisos del token (con el GHL de prueba, todo bien)
  const perm = await call('/api/seguridad', { method: 'POST', cookie: sup, body: { op: 'probar-token' } });
  assert.ok(perm.data.permisos.length >= 6 && perm.data.permisos.every((p) => p.ok));
  // Escape: la variable REACTIVAR_CONTRASENA_GENERAL=1 la vuelve a permitir
  ENV.REACTIVAR_CONTRASENA_GENERAL = '1';
  assert.equal((await call('/api/login', { method: 'POST', ip: '10.4.0.5', body: { password: 'admin' } })).status, 200);
  delete ENV.REACTIVAR_CONTRASENA_GENERAL;
});

test('acceso público: no cambia el nombre ni el móvil de un contacto que ya existe', async () => {
  const ghl = await import('../lib/ghl.js');
  await ghl.upsertContact({ email: 'victima@example.com', firstName: 'Ana', lastName: 'Real', phone: '+34600111222' });
  const { ensureRegistered } = await import('../lib/access.js');
  const r = await ensureRegistered({ registroTag: 'reg-prueba' }, { email: 'victima@example.com', name: 'Otro Nombre', phone: '699999999' });
  assert.equal(r.status, 'signed_up_existing');
  const c = await ghl.findContactByEmail('victima@example.com');
  assert.equal(c.phone, '+34600111222');
  assert.equal(c.firstName, 'Ana');
});

test('leads: solo etiquetas de los embudos configurados', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).cookie;
  assert.equal((await call('/api/leads?tag=equipo-dashboard', { cookie: admin })).status, 403);
  const cfg = (await call('/api/config', { cookie: admin })).data;
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...cfg.config, _version: cfg.version, launches: { ...cfg.config.launches, 'prueba-2610': { name: 'Prueba', registroTag: 'Registro-Prueba' } } } });
  assert.equal((await call('/api/leads?tag=registro-prueba', { cookie: admin })).status, 200);
});

test('errores de endpoints públicos sin detalle técnico', async () => {
  const r = await call('/api/meteorico?estado=1&m=noexiste');
  assert.equal(r.status, 404);
  assert.equal(r.data.detail, undefined);
});

test('errores de GHL en endpoints públicos: mensaje genérico, sin hablar de tokens', async () => {
  const { errorResponse, CORS_HEADERS } = await import('../lib/http.js');
  const { GhlError } = await import('../lib/ghl.js');
  const pub = await errorResponse(new GhlError(401, 'token caducado'), CORS_HEADERS).json();
  assert.doesNotMatch(pub.error, /GHL_TOKEN/);
  assert.equal(pub.detail, undefined);
  const priv = await errorResponse(new GhlError(401, 'token caducado')).json();
  assert.match(priv.error, /GHL_TOKEN/);
});
