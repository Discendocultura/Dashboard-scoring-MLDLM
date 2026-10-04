import { test, before } from 'node:test';
import assert from 'node:assert/strict';

before(async () => {
  const { setEnv } = await import('../lib/env.js');
  setEnv({ GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' });
});

const req = (path, { method = 'GET', body, cookie } = {}) => new Request(`http://localhost${path}`, {
  method,
  headers: { ...(cookie ? { cookie } : {}), 'content-type': 'text/plain' },
  body: body ? JSON.stringify(body) : undefined,
});

async function login(password) {
  const { POST } = await import('../handlers/login.js');
  const res = await POST(req('/api/login', { method: 'POST', body: { password } }));
  return res.headers.get('set-cookie')?.split(';')[0];
}

test('login y permisos por rol', async () => {
  const { POST: badLogin } = await import('../handlers/login.js');
  assert.equal((await badLogin(req('/api/login', { method: 'POST', body: { password: 'x' } }))).status, 401);
  const setter = await login('setter');
  const admin = await login('admin');
  const config = await import('../handlers/config.js');
  assert.equal((await config.GET(req('/api/config'))).status, 401);
  assert.equal((await config.GET(req('/api/config', { cookie: setter }))).status, 200);
  const body = { launches: { demo: { name: 'Demo', registroTag: 'registro-webinar-demo', vipTag: 'compra-vip-demo', zoomMeetingId: '812 345 6789', replayUrl: 'https://ejemplo.com/replay' } } };
  assert.equal((await config.POST(req('/api/config', { method: 'POST', body, cookie: setter }))).status, 403);
  const saved = await (await config.POST(req('/api/config', { method: 'POST', body, cookie: admin }))).json();
  assert.equal(saved.config.launches.demo.zoomMeetingId, '8123456789');
});

test('leads paginados y tracking de vídeo', async () => {
  const admin = await login('admin');
  const leads = await import('../handlers/leads.js');
  const p1 = await (await leads.GET(req('/api/leads?tag=registro-webinar-demo', { cookie: admin }))).json();
  assert.equal(p1.contacts.length, 100);
  assert.equal(p1.total, 1850);
  const p2 = await (await leads.GET(req(`/api/leads?tag=registro-webinar-demo&cursor=${encodeURIComponent(JSON.stringify(p1.cursor))}`, { cookie: admin }))).json();
  assert.notEqual(p2.contacts[0].id, p1.contacts[0].id);

  const target = p1.contacts.find((c) => !c.tags.includes('demo_replay_90'));
  const track = await import('../handlers/track.js');
  const r = await (await track.POST(req('/api/track', { method: 'POST', body: { launch: 'demo', video: 'replay', pct: 90, cid: target.id } }))).json();
  assert.equal(r.ok, true);
  const { getContact } = await import('../lib/ghl.js');
  const after = await getContact(target.id);
  assert.ok(after.tags.includes('demo_replay_50') && after.tags.includes('demo_replay_90'));

  assert.equal((await track.POST(req('/api/track', { method: 'POST', body: { launch: 'otro', video: 'replay', pct: 90, cid: target.id } }))).status, 404);
  assert.equal((await track.POST(req('/api/track', { method: 'POST', body: { launch: 'demo', video: 'x', pct: 90, cid: target.id } }))).status, 400);
});

test('apply-tags rechaza etiquetas arbitrarias', async () => {
  const setter = await login('setter');
  const { POST } = await import('../handlers/apply-tags.js');
  const bad = await POST(req('/api/apply-tags', { method: 'POST', cookie: setter, body: { items: [{ id: 'mock00001', tags: ['clienta-raices'] }] } }));
  assert.equal(bad.status, 400);
  const ok = await POST(req('/api/apply-tags', { method: 'POST', cookie: setter, body: { items: [{ id: 'mock00001', tags: ['demo_wa_enviado'] }] } }));
  assert.equal(ok.status, 200);
});

test('puente al directo: pide email, etiqueta y redirige a Zoom', async () => {
  const { GET } = await import('../handlers/directo.js');
  const form = await GET(req('/directo?l=demo'));
  assert.match(await form.text(), /type="email"/);
  const res = await GET(req('/directo?l=demo&cid=mock00002'));
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /^https:\/\/zoom\.us\/w\/8123456789/);
  const { getContact } = await import('../lib/ghl.js');
  assert.ok((await getContact('mock00002')).tags.includes('demo_directo_click'));
});

test('informe de Zoom agrega asistencia por email', async () => {
  const admin = await login('admin');
  const { GET } = await import('../handlers/zoom-report.js');
  const data = await (await GET(req('/api/zoom-report?launch=demo', { cookie: admin }))).json();
  assert.ok(data.attendees.length > 100);
  assert.ok(data.attendees.some((a) => a.final) && data.attendees.some((a) => !a.final));
});

test('router: rutas de la API y del directo', async () => {
  const { route } = await import('../lib/router.js');
  const env = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
  assert.equal((await route(req('/api/me'), env)).status, 401);
  assert.equal((await route(req('/api/nada'), env)).status, 404);
  assert.equal((await route(req('/api/login'), env)).status, 405);
  assert.equal((await route(req('/directo?l=demo&cid=mock00003'), env)).status, 302);
});

test('login ignora espacios y health no revela valores', async () => {
  const { setEnv, env } = await import('../lib/env.js');
  setEnv({ ADMIN_PASSWORD: ' admin ' });
  assert.ok(await login(' admin'));
  setEnv({ ADMIN_PASSWORD: 'admin' });
  const { GET } = await import('../handlers/health.js');
  const body = await (await GET()).json();
  assert.equal(body.vars.ADMIN_PASSWORD, true);
  assert.ok(!JSON.stringify(body).includes(env.SESSION_SECRET));
});

test('identify comprueba el registro en el lanzamiento', async () => {
  const { POST } = await import('../handlers/identify.js');
  const { getContact } = await import('../lib/ghl.js');
  const registrada = await getContact('mock00005');
  const ok = await (await POST(req('/api/identify', { method: 'POST', body: { email: registrada.email, launch: 'demo' } }))).json();
  assert.deepEqual(ok, { found: true, registered: true });
  const nadie = await (await POST(req('/api/identify', { method: 'POST', body: { email: 'nadie@example.com', launch: 'demo' } }))).json();
  assert.deepEqual(nadie, { found: false, registered: false });
});

test('el directo recuerda a la lead en ese navegador', async () => {
  const { GET } = await import('../handlers/directo.js');
  const first = await GET(req('/directo?l=demo&cid=mock00007'));
  assert.equal(first.status, 302);
  const cookie = first.headers.get('set-cookie');
  assert.match(cookie, /lsd_who=cid%3Amock00007; Path=\/directo/);
  // segunda vez, desde el grupo de WhatsApp (sin cid): entra directa sin formulario
  const again = await GET(req('/directo?l=demo', { cookie: cookie.split(';')[0] }));
  assert.equal(again.status, 302);
  // sin cookie: formulario de email
  assert.equal((await GET(req('/directo?l=demo'))).status, 200);
});
