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

test('LabIA: solo en los clientes que lo tienen contratado, con su pipeline por etapas', async () => {
  const admin = cookieDe(await call('/api/login', { method: 'POST', body: { password: 'admin' } }));
  const principal = (await call('/api/clientes', { cookie: admin })).data.clientes.find((c) => c.principal);
  // Sin marcar y sin setter conectado: no lo tiene
  assert.equal((await call('/api/me', { cookie: admin })).data.labia, false);
  assert.equal((await call('/api/labia', { cookie: admin })).data.motivo, 'sin_labia');

  // Se marca como contratado
  const g = await call('/api/clientes', { method: 'POST', cookie: admin, body: { op: 'guardar', cliente: { ...principal, labia: true } } });
  assert.equal(g.data.clientes.find((c) => c.principal).labiaActiva, true);
  const me = (await call('/api/me', { cookie: admin })).data;
  assert.equal(me.labia, true);
  assert.equal(me.cliente.labia, true);

  // El pipeline con etapas 🤖 se elige solo; quién lo lleva sale del icono de la etapa (o de la etiqueta «pide persona»)
  const d = (await call('/api/labia', { cookie: admin })).data;
  assert.equal(d.pipeline.id, 'pipeLabia');
  assert.equal(d.etapas.find((e) => e.nombre === '🤖 Conversando').tipo, 'ia');
  assert.equal(d.etapas.find((e) => e.nombre === '👩 Pide persona').tipo, 'equipo');
  assert.equal(d.etapas.find((e) => e.nombre === '🤖 Conversando').n, 14);
  assert.equal(d.totales.ganadas, 7);
  assert.equal(d.etapas.find((e) => e.nombre === '✅ Venta').n, 7); // en las etapas sin icono de IA ni equipo, todos (no solo los abiertos)
  assert.equal(d.ahora.equipo, 5 + 6 + 2); // dos de «Cualificando» piden persona
  assert.equal(d.ahora.ia, 14 + 11 - 2 + 4);
  assert.ok(d.teTocan.some((l) => l.pide));
  assert.ok(d.teTocan.every((l) => l.contactId && !('email' in l)));

  // La lista de pipelines (Conexiones) y elegir otro
  const pl = (await call('/api/labia?parte=pipelines', { cookie: admin })).data.pipelines;
  assert.ok(pl.some((p) => p.id === 'pipeLabia'));

  // Se quita: ni pipeline ni cifras del setter
  await call('/api/clientes', { method: 'POST', cookie: admin, body: { op: 'guardar', cliente: { ...principal, labia: false } } });
  assert.equal((await call('/api/me', { cookie: admin })).data.labia, false);
  assert.equal((await call('/api/labia', { cookie: admin })).data.motivo, 'sin_labia');
  assert.equal((await call('/api/setter-ia?desde=2026-10-01&hasta=2026-10-18', { cookie: admin })).data.sinLabia, true);
});
