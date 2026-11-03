// Conexiones propias de cada cliente (Zoom, SendFlow, Vimeo): pegadas en Conexiones, cifradas, y mandan sobre
// Cloudflare y la agencia. Los clientes de antes siguen con lo de antes; los nuevos no usan la agencia a escondidas.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret', SENDFLOW_API_KEY: 'send_api-agencia', ZOOM_ACCOUNT_ID: 'ag', ZOOM_CLIENT_ID: 'ag', ZOOM_CLIENT_SECRET: 'ag' };
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

test('conexiones propias: los clientes de antes siguen con la agencia; los nuevos, sin nada si no conectan lo suyo', async () => {
  const { zoomDeCliente } = await import('../lib/zoom.js');
  const { sendflowDeCliente } = await import('../lib/sendflow.js');
  const antiguo = { id: 'discendo', creado: '2026-05-01T10:00:00Z', zoom: '', sendflow: '' };
  const nuevo = { id: 'nuevo', creado: '2026-11-10T10:00:00Z', zoom: '', sendflow: '' };
  assert.equal(zoomDeCliente(antiguo).cual, 'agencia');
  assert.equal(sendflowDeCliente(antiguo).cual, 'agencia');
  assert.equal(zoomDeCliente({ id: 'sin-fecha' }).cual, 'agencia');
  assert.equal(zoomDeCliente(nuevo).cual, 'ninguno');
  assert.equal(sendflowDeCliente(nuevo).cual, 'ninguno');
  // Si el superadmin elige en el alta la cuenta de la agencia, la usa.
  assert.equal(zoomDeCliente({ ...nuevo, zoom: 'agencia' }).cual, 'agencia');
});

test('conexiones propias: se pegan en Conexiones, se guardan cifradas, mandan sobre lo demás y se pueden quitar', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/conexiones-propias')).status, 401);
  let e = (await call('/api/conexiones-propias', { cookie: admin })).data;
  assert.equal(e.zoom.conectada, false);
  assert.equal(e.zoom.usa, 'propio'); // principal: sus variables de siempre
  assert.equal((await call('/api/conexiones-propias', { method: 'POST', cookie: admin, body: { op: 'guardar', servicio: 'zoom', datos: { accountId: 'acc' } } })).status, 400);
  const r = await call('/api/conexiones-propias', { method: 'POST', cookie: admin, body: { op: 'guardar', servicio: 'zoom', datos: { accountId: ' acc-1 ', clientId: 'cid', clientSecret: 'secreto-zoom', hostEmail: 'sara@x.com' } } });
  assert.equal(r.status, 200);
  assert.equal(r.data.zoom.usa, 'alquimia');
  assert.match(r.data.zoom.resumen, /acc-1/);
  assert.ok(!JSON.stringify(r.data).includes('secreto-zoom'));
  await call('/api/conexiones-propias', { method: 'POST', cookie: admin, body: { op: 'guardar', servicio: 'sendflow', datos: { apiKey: 'Bearer send_api-del-cliente' } } });
  // Guardado cifrado (no en claro) y lo leen zoom.js y sendflow.js dentro de una petición.
  const { leerJSON } = await import('../lib/store.js');
  const { runCliente, principal } = await import('../lib/cliente.js');
  const { cargarConexiones } = await import('../lib/conexiones-propias.js');
  const { zoomDeCliente } = await import('../lib/zoom.js');
  const { sendflowDeCliente } = await import('../lib/sendflow.js');
  const crudo = await runCliente(principal(), () => leerJSON('lsd_conexiones_propias'));
  assert.ok(crudo.zoom.cifrado && !JSON.stringify(crudo).includes('secreto-zoom'));
  const [z, sf] = await runCliente(principal(), async () => { await cargarConexiones({ fresh: true }); return [zoomDeCliente(), sendflowDeCliente()]; });
  assert.deepEqual([z.desde, z.vars.ZOOM_CLIENT_SECRET, z.host], ['alquimia', 'secreto-zoom', 'sara@x.com']);
  assert.equal(sf.clave, 'send_api-del-cliente');
  e = (await call('/api/conexiones-propias', { method: 'POST', cookie: admin, body: { op: 'quitar', servicio: 'zoom' } })).data;
  assert.equal(e.zoom.conectada, false);
  assert.equal(e.sendflow.usa, 'alquimia');
});
