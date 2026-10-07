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

test('portal del cliente: elige embudo, lanzamiento y periodo (solo lectura)', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const cfg = (await call('/api/config', { cookie: admin })).data.config;
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...cfg, launches: {
    oct: { name: 'Octubre', registroTag: 'registro-webinar-demo', compraTag: 'clienta-raices', inicioCaptacion: '2026-09-28', fechaDirecto: '2026-10-20' },
    jun: { name: 'Junio', registroTag: 'registro-webinar-demo', compraTag: 'clienta-raices', inicioCaptacion: '2026-06-01', fechaDirecto: '2026-06-20' },
  } } });
  // Usuario con rol Cliente
  const u = await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'crear', nombre: 'Cliente', email: 'cli@ejemplo.com', rol: 'cliente', enviar: false } });
  const cli = (await call('/api/login', { method: 'POST', body: { email: 'cli@ejemplo.com', password: u.data.password } })).res.headers.get('set-cookie').split(';')[0];
  const r = (await call('/api/resumen', { cookie: cli })).data;
  const lanz = r.catalogo.find((e) => e.tipo === 'lanzamientos');
  assert.deepEqual(lanz.lanzamientos.map((l) => l.code), ['oct', 'jun']); // del más reciente al más antiguo
  assert.ok(r.catalogo.some((e) => e.tipo === 'vsl'));
  // Un lanzamiento anterior de ese embudo
  const jun = (await call(`/api/resumen?embudo=${lanz.id}&l=jun`, { cookie: cli })).data.detalle;
  assert.equal(jun.code, 'jun');
  assert.equal(jun.nombre, 'Junio');
  // Por defecto, el último
  assert.equal((await call(`/api/resumen?embudo=${lanz.id}`, { cookie: cli })).data.detalle.code, 'oct');
  // Una VSL en otro periodo
  const vsl = r.catalogo.find((e) => e.tipo === 'vsl');
  const v = (await call(`/api/resumen?embudo=${vsl.id}&periodo=7d`, { cookie: cli })).data.detalle;
  assert.equal(v.tipo, 'vsl');
  assert.equal(v.preset, '7d');
  assert.equal((await call('/api/resumen?embudo=noexiste', { cookie: cli })).status, 404);
  // Sigue sin poder ver nada interno
  assert.equal((await call('/api/tareas?l=oct', { cookie: cli })).status, 403);
});
