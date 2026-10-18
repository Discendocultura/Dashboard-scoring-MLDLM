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

test('onboarding: quien ya estaba lo tiene hecho; quien es nueva lo empieza y se guarda en su usuario', async () => {
  const { onboardingDe, cambiarOnboarding } = await import('../lib/users.js');
  assert.deepEqual(onboardingDe({ createdAt: '2026-01-01T00:00:00Z' }), { hecho: true });
  const u = { createdAt: '2026-11-01T00:00:00Z' };
  assert.equal(onboardingDe(u).hecho, undefined);
  cambiarOnboarding(u, { tour: 'principal', paso: 'recorrido', todo: true });
  cambiarOnboarding(u, { tour: '<script>', paso: 'x'.repeat(40) }); // ids raros: se ignoran
  assert.deepEqual(Object.keys(u.onboarding.tours), ['principal']);
  assert.deepEqual(Object.keys(u.onboarding.pasos), ['recorrido']);
  assert.equal(u.onboarding.todo, true);

  const admin = cookieDe(await call('/api/login', { method: 'POST', body: { password: 'admin' } }));
  const nueva = await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'crear', nombre: 'Laura Setter', email: 'laura@ejemplo.com', rol: 'setter', enviar: false } });
  const laura = cookieDe(await call('/api/login', { method: 'POST', body: { email: 'laura@ejemplo.com', password: nueva.data.password } }));
  const me = (await call('/api/me', { cookie: laura })).data.user;
  assert.deepEqual(me.onboarding.tours, {});
  // Guarda lo que va viendo y haciendo
  await call('/api/usuarios', { method: 'POST', cookie: laura, body: { op: 'onboarding', cambio: { tour: 'principal', paso: 'hoy' } } });
  const r = (await call('/api/usuarios', { method: 'POST', cookie: laura, body: { op: 'onboarding', cambio: { paso: 'wa', cerrado: true } } })).data.onboarding;
  assert.ok(r.tours.principal && r.pasos.hoy && r.pasos.wa && r.cerrado);
  assert.ok((await call('/api/me', { cookie: laura })).data.user.onboarding.pasos.wa);
  // El admin lo ve en el Equipo y se lo reinicia; Laura no puede reiniciar a nadie
  const eq = (await call('/api/usuarios', { cookie: admin })).data.users.find((x) => x.email === 'laura@ejemplo.com');
  assert.ok(eq.onboarding.pasos.hoy);
  assert.equal((await call('/api/usuarios', { method: 'POST', cookie: laura, body: { op: 'onboarding-reiniciar', id: eq.id } })).status, 403);
  assert.equal((await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'onboarding-reiniciar', id: eq.id } })).status, 200);
  assert.deepEqual((await call('/api/me', { cookie: laura })).data.user.onboarding.pasos, {});
  // Con la contraseña general (sin usuario) no hay onboarding
  assert.deepEqual((await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'onboarding', cambio: { tour: 'principal' } } })).data.onboarding, { hecho: true });
});

test('onboarding: primeros pasos por rol y progreso', async () => {
  const { PASOS, TOURS, progresoDe } = await import('../public/js/onboarding.js');
  for (const r of ['admin', 'setter', 'cliente', 'operativa']) { assert.ok(PASOS[r].length >= 3); assert.ok(TOURS[r].length >= 3); }
  assert.deepEqual(progresoDe({ hecho: true }, 'setter'), { hechos: 5, total: 5, hecho: true });
  const p = progresoDe({ tours: { principal: 'x' }, pasos: { hoy: 'x' } }, 'setter');
  assert.equal(p.hechos, 2); // el recorrido cuenta al hacer el tour principal
  assert.equal(p.hecho, false);
});
