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

test('acceso: registrada, existente sin etiqueta y email nuevo', async () => {
  const { POST } = await import('../handlers/access.js');
  const { getContact, findContactByEmail, upsertContact } = await import('../lib/ghl.js');
  const call = async (body) => (await POST(req('/api/access', { method: 'POST', body: { launch: 'demo', ...body } }))).json();
  const reg = await getContact('mock00011');
  assert.deepEqual(await call({ email: reg.email }), { ok: true, status: 'registered', cid: reg.id });
  // `auto` = el lanzamiento en curso (si la página no pudo averiguar el código)
  assert.equal((await call({ email: reg.email, launch: 'auto' })).ok, true);
  // existe en GHL (otro embudo) pero no en este lanzamiento → tiene que registrarse
  const otra = await upsertContact({ email: 'vsl@example.com', firstName: 'Vera' });
  assert.deepEqual(await call({ email: 'vsl@example.com' }), { ok: false, needs: 'signup', known: true, siteKey: '' });
  assert.ok(!(await getContact(otra.id)).tags.includes('registro-webinar-demo'));
  assert.deepEqual(await call({ email: 'vsl@example.com', name: 'Vera Ruiz', phone: '+34 655 44 33 22' }), { ok: true, status: 'signed_up_existing', cid: otra.id });
  assert.ok((await getContact(otra.id)).tags.includes('registro-webinar-demo'));
  // no existe → pide datos; con nombre y móvil se crea registrada
  assert.deepEqual(await call({ email: 'nueva@example.com' }), { ok: false, needs: 'signup', known: false, siteKey: '' });
  const creada = await call({ email: 'nueva@example.com', name: 'Nora Gil', phone: '600 11 22 33' });
  const nueva = await findContactByEmail('nueva@example.com');
  assert.deepEqual(creada, { ok: true, status: 'created', cid: nueva.id });
  assert.equal(nueva.phone, '+34600112233');
  assert.ok(nueva.tags.includes('registro-webinar-demo'));
  // bots (campo trampa) no crean nada
  assert.deepEqual(await call({ email: 'bot@example.com', name: 'Bot', phone: '600000000', hp: 'x' }), { ok: false, error: 'bot' });
  // El campo antiguo `website` (lo rellenaban algunos autorrellenos) ya no deja fuera a nadie.
  assert.equal((await call({ email: 'nueva-autofill@example.com', website: 'https://x.com' })).needs, 'signup');
  assert.equal(await findContactByEmail('bot@example.com'), null);
});

test('directo con email nuevo: pide datos, registra y entra', async () => {
  const { GET } = await import('../handlers/directo.js');
  const form = await GET(req('/directo?l=demo&email=directo-nueva@example.com'));
  assert.equal(form.status, 200);
  assert.match(await form.text(), /name="nombre"/);
  const ok = await GET(req('/directo?l=demo&email=directo-nueva@example.com&nombre=Ana&telefono=611223344'));
  assert.equal(ok.status, 302);
  const { findContactByEmail } = await import('../lib/ghl.js');
  const c = await findContactByEmail('directo-nueva@example.com');
  assert.ok(c.tags.includes('registro-webinar-demo') && c.tags.includes('demo_directo_click'));
});

test('directo con cid de alguien sin registro en el lanzamiento: pide registrarse', async () => {
  const { GET } = await import('../handlers/directo.js');
  const { upsertContact, findContactByEmail } = await import('../lib/ghl.js');
  const c = await upsertContact({ email: 'newsletter@example.com', firstName: 'Nel' });
  const form = await GET(req(`/directo?l=demo&cid=${c.id}`));
  assert.equal(form.status, 200);
  assert.match(await form.text(), /newsletter@example.com/);
  const ok = await GET(req('/directo?l=demo&email=newsletter@example.com&nombre=Nel&telefono=622334455'));
  assert.equal(ok.status, 302);
  assert.ok((await findContactByEmail('newsletter@example.com')).tags.includes('registro-webinar-demo'));
});

test('resumen diario: protegido por clave y enviado por GHL', async () => {
  const { setEnv } = await import('../lib/env.js');
  const { GET, POST } = await import('../handlers/digest.js');
  setEnv({ DIGEST_KEY: 'clave-larga-de-prueba-123' });
  assert.equal((await GET(req('/api/digest?key=mala'))).status, 401);
  // sin email configurado → error claro
  assert.equal((await GET(req('/api/digest?key=clave-larga-de-prueba-123'))).status, 400);
  const admin = await login('admin');
  const config = await import('../handlers/config.js');
  const cur = await (await config.GET(req('/api/config', { cookie: admin }))).json();
  const { getContact } = await import('../lib/ghl.js');
  const dest = await getContact('mock00001');
  await config.POST(req('/api/config', { method: 'POST', cookie: admin, body: { ...cur.config, digestEmail: dest.email } }));
  const r = await (await POST(req('/api/digest', { method: 'POST', cookie: admin }))).json();
  assert.equal(r.sent, true);
  const { sentEmails } = await import('../lib/mock.js');
  assert.match(sentEmails.at(-1).html, /Muy calientes sin contactar/);
});

test('apply-tags: la setter puede cambiar el resultado, pero no quitar otras etiquetas', async () => {
  const setter = await login('setter');
  const { POST } = await import('../handlers/apply-tags.js');
  const ok = await POST(req('/api/apply-tags', { method: 'POST', cookie: setter, body: { items: [{ id: 'mock00020', tags: ['demo_res_interesada'], remove: ['demo_res_respondio'] }] } }));
  assert.equal(ok.status, 200);
  const bad = await POST(req('/api/apply-tags', { method: 'POST', cookie: setter, body: { items: [{ id: 'mock00020', tags: [], remove: ['demo_vip_previo'] }] } }));
  assert.equal(bad.status, 400);
});

test('meta: inversión por campaña con filtro por nombre', async () => {
  const { adSpend } = await import('../lib/meta.js');
  const all = await adSpend({ since: '2026-10-01', until: '2026-10-20' });
  const retarg = await adSpend({ since: '2026-10-01', until: '2026-10-20', filter: 'retargeting' });
  assert.ok(all.total > retarg.total && retarg.total > 0);
  assert.equal(retarg.campaigns.length, 1);
  assert.equal((await adSpend({ since: '2026-10-01', until: '2026-10-20', filter: 'FRIO' })).campaigns.length, 1); // sin tildes
  assert.ok(all.names['331']);
});

test('página de recursos: fases, vídeos ocultos hasta su hora, VIP y vista previa firmada', async () => {
  const admin = await login('admin');
  const config = await import('../handlers/config.js');
  const cur = await (await config.GET(req('/api/config', { cookie: admin }))).json();
  await config.POST(req('/api/config', { method: 'POST', cookie: admin, body: { ...cur.config, launches: { ...cur.config.launches, 'pag-test': {
    name: 'Pág', registroTag: 'registro-webinar-demo', vipTag: 'compra-vip-demo', inicioCaptacion: '2026-10-01',
    fechaDirecto: '2026-10-29', horaDirecto: '19:00', clase1At: '2026-10-22T19:00', clase2At: '2026-10-25T19:00',
    clase1Url: 'https://vimeo.com/111/aaa', clase2Url: 'https://vimeo.com/222/bbb', vipUrl: 'https://pago.example.com/vip',
  } } } }));
  const page = await import('../handlers/page.js');
  const tok = async (at) => (await (await page.POST(req('/api/page', { method: 'POST', cookie: admin, body: { at } }))).json()).token;
  const get = async (at, extra = '') => (await page.GET(req(`/api/page?l=pag-test&preview=${encodeURIComponent(await tok(at))}${extra}`))).json();

  const pre = await get('2026-10-21T10:00');
  assert.equal(pre.phase, 'pre_c1');
  assert.equal(pre.videos.clase1.url, '');            // no se filtra antes de tiempo
  assert.ok(pre.links.vip);
  const c1 = await get('2026-10-23T10:00');
  assert.equal(c1.videos.clase1.url, 'https://vimeo.com/111/aaa');
  assert.equal(c1.videos.clase2.url, '');
  const live = await get('2026-10-29T19:01');
  assert.equal(live.redirectTo, 'directo');
  assert.equal(live.links.vip, '');                   // la VIP se cierra al empezar el directo
  assert.equal((await get('2026-10-30T00:00')).redirectTo, 'grabacion');
  // token manipulado → hora real (no se puede adelantar el desbloqueo)
  const fake = await (await page.GET(req('/api/page?l=pag-test&preview=1793300000000.falso'))).json();
  assert.equal(fake.preview, false);
  // con cid sabe si ya es VIP
  const { contactsByTag } = await import('../lib/ghl.js');
  const { contacts } = await contactsByTag('compra-vip-demo');
  const vip = await get('2026-10-23T10:00', `&cid=${contacts[0].id}`);
  assert.equal(typeof vip.vip.isVip, 'boolean');
  // contador de VIP: 41 + VIP vendidas en el lanzamiento (sin las anteriores)
  const { countByTag } = await import('../lib/ghl.js');
  const vendidas = await countByTag('compra-vip-demo');
  assert.equal(vip.vip.contador, 41 + vendidas);
  assert.equal(vip.texts.vipContador, String(41 + vendidas));
  // l=auto resuelve el lanzamiento en curso
  assert.ok((await (await page.GET(req('/api/page?l=auto'))).json()).code);
});

test('encuesta: sin la etiqueta no se entregan las clases 1 y 2', async () => {
  const admin = await login('admin');
  const config = await import('../handlers/config.js');
  const cur = await (await config.GET(req('/api/config', { cookie: admin }))).json();
  await config.POST(req('/api/config', { method: 'POST', cookie: admin, body: { ...cur.config, launches: { ...cur.config.launches, 'enc-test': {
    name: 'Enc', registroTag: 'registro-webinar-demo', inicioCaptacion: '2026-10-01', encuestaTag: 'Encuesta-Demo',
    encuestaUrl: 'https://forms.example.com/survey/abc', fechaDirecto: '2026-10-29', horaDirecto: '19:00',
    clase1At: '2026-10-22T19:00', clase2At: '2026-10-25T19:00',
    clase1Url: 'https://vimeo.com/111/aaa', clase2Url: 'https://vimeo.com/222/bbb', replayVideoUrl: 'https://vimeo.com/333/ccc',
  } } } }));
  const page = await import('../handlers/page.js');
  const tok = (await (await page.POST(req('/api/page', { method: 'POST', cookie: admin, body: { at: '2026-10-31T10:00' } }))).json()).token;
  const { contactsByTag, addTags } = await import('../lib/ghl.js');
  const { contacts } = await contactsByTag('registro-webinar-demo');
  const lead = contacts.find((c) => !c.tags.includes('encuesta-demo'));
  const get = async () => (await page.GET(req(`/api/page?l=enc-test&preview=${encodeURIComponent(tok)}&cid=${lead.id}`))).json();

  const before = await get();
  assert.deepEqual(before.encuesta, { required: true, done: false });
  assert.equal(before.videos.clase1.url, '');
  assert.equal(before.videos.clase1.needsEncuesta, true);
  assert.equal(before.videos.clase2.url, '');
  assert.equal(before.videos.replay.url, 'https://vimeo.com/333/ccc');   // la grabación no depende de la encuesta
  const enc = new URL(before.links.encuesta);
  assert.equal(enc.searchParams.get('email'), lead.email);              // encuesta rellena con su email

  await addTags(lead.id, ['encuesta-demo']);
  const after = await get();
  assert.equal(after.encuesta.done, true);
  assert.equal(after.videos.clase1.url, 'https://vimeo.com/111/aaa');
  assert.equal(after.videos.clase2.url, 'https://vimeo.com/222/bbb');

  const { signalsFor } = await import('../public/js/scoring.js');
  assert.equal(signalsFor(['Encuesta-Demo'], 'enc-test', { encuestaTag: 'encuesta-demo' }).encuesta, true);
  const { computeMetrics } = await import('../public/js/metrics.js');
  const mk = (encuesta, compra) => ({ s: { encuesta, compra }, estado: { id: 'frio' } });
  const m = computeMetrics([mk(true, true), mk(true, false), mk(false, false), mk(false, false)], { encuestaTag: 'x', inversion: 300 });
  assert.equal(m.encuesta, 2);
  assert.equal(m.eco.cac, 300);
});

test('precio VIP en formato español', async () => {
  const { euros } = await import('../handlers/page.js');
  assert.equal(euros(27), '27 €');
  assert.equal(euros(27.5), '27,50 €');
  assert.equal(euros(1997), '1997 €');
  assert.equal(euros(0), '');
});

test('enlaces personalizados para botones', async () => {
  const { sanitizeConfig } = await import('../lib/config-store.js');
  const c = sanitizeConfig({ launches: { x1: { registroTag: 'r', enlaces: { Guia: 'https://a.com/g', vip: 'https://hack', 'mal nombre': 'https://b.com', ig: 'javascript:alert(1)' } } } });
  assert.deepEqual(c.launches.x1.enlaces, { guia: 'https://a.com/g' });
  const t = sanitizeConfig({ launches: { x1: { registroTag: 'r', textos: { 'Clase1-Titulo': ' Hola ', clase1: 'pisa la fecha', 'mal nombre': 'x', vacio: '' } } } });
  assert.deepEqual(t.launches.x1.textos, { 'clase1-titulo': 'Hola' });
});

test('usuarios del equipo: alta con email de acceso, login con email y permisos del rol equipo', async () => {
  const admin = await login('admin');
  const usuarios = await import('../handlers/usuarios.js');
  const mock = await import('../lib/mock.js');
  const before = mock.sentEmails.length;
  const setterCookie = await login('setter');
  assert.equal((await usuarios.GET(req('/api/usuarios', { cookie: setterCookie }))).status, 403);

  const r = await (await usuarios.POST(req('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'crear', nombre: 'Quique de la Cierva', email: 'Quique@Example.com', rol: 'equipo' } }))).json();
  assert.equal(r.emailEnviado, true);
  assert.equal(r.user.email, 'quique@example.com');
  assert.equal(r.password.length, 12);
  const mail = mock.sentEmails.at(-1);
  assert.equal(mock.sentEmails.length, before + 1);
  assert.ok(mail.html.includes(r.password) && mail.html.includes('http://localhost/'));
  const { getContact } = await import('../lib/ghl.js');
  assert.ok((await getContact(mail.contactId)).tags.includes('equipo-dashboard'));
  assert.equal((await usuarios.POST(req('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'crear', nombre: 'Otra', email: 'quique@example.com' } }))).status, 400);
  const list = await (await usuarios.GET(req('/api/usuarios', { cookie: admin }))).json();
  assert.ok(!('hash' in list.users[0]) && !('salt' in list.users[0]));

  const { POST: doLogin } = await import('../handlers/login.js');
  assert.equal((await doLogin(req('/api/login', { method: 'POST', body: { email: 'quique@example.com', password: 'mala' } }))).status, 401);
  const ok = await doLogin(req('/api/login', { method: 'POST', body: { email: 'QUIQUE@example.com ', password: r.password } }));
  assert.equal(ok.status, 200);
  const equipo = ok.headers.get('set-cookie').split(';')[0];
  const me = await (await (await import('../handlers/me.js')).GET(req('/api/me', { cookie: equipo }))).json();
  assert.equal(me.role, 'equipo');
  assert.equal(me.user.nombre, 'Quique de la Cierva');
  const leads = await import('../handlers/leads.js');
  assert.equal((await leads.GET(req('/api/leads?tag=registro-webinar-demo', { cookie: equipo }))).status, 403);
  const cfg = await (await (await import('../handlers/config.js')).GET(req('/api/config', { cookie: equipo }))).json();
  assert.equal(cfg.config.launches.demo.registroTag, undefined);
  assert.equal(cfg.config.launches.demo.name, 'Demo');

  // Cambiar su contraseña
  assert.equal((await usuarios.POST(req('/api/usuarios', { method: 'POST', cookie: equipo, body: { op: 'mi-clave', actual: 'x', nueva: 'nuevaclave1' } }))).status, 403);
  assert.equal((await usuarios.POST(req('/api/usuarios', { method: 'POST', cookie: equipo, body: { op: 'mi-clave', actual: r.password, nueva: 'nuevaclave1' } }))).status, 200);
  assert.equal((await doLogin(req('/api/login', { method: 'POST', body: { email: 'quique@example.com', password: 'nuevaclave1' } }))).status, 200);

  // Desactivado: la sesión deja de valer
  await usuarios.POST(req('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'editar', id: r.user.id, activo: false } }));
  assert.equal((await (await import('../handlers/me.js')).GET(req('/api/me', { cookie: equipo }))).status, 401);
  await usuarios.POST(req('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'editar', id: r.user.id, activo: true } }));
});

test('tareas: plantilla, asignación con aviso por email y permisos para marcar', async () => {
  const admin = await login('admin');
  const setter = await login('setter');
  const tareas = await import('../handlers/tareas.js');
  const usuarios = await import('../handlers/usuarios.js');
  const mock = await import('../lib/mock.js');
  const sara = await (await usuarios.POST(req('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'crear', nombre: 'Sara Guzmán', email: 'sara@example.com', rol: 'equipo' } }))).json();
  const { POST: doLogin } = await import('../handlers/login.js');
  const saraCookie = (await doLogin(req('/api/login', { method: 'POST', body: { email: 'sara@example.com', password: sara.password } }))).headers.get('set-cookie').split(';')[0];

  const post = (cookie, body) => tareas.POST(req('/api/tareas', { method: 'POST', cookie, body: { l: 'demo', ...body } }));
  const pl = await (await post(admin, { op: 'plantilla' })).json();
  assert.ok(pl.tareas.length > 15);
  assert.equal((await (await post(admin, { op: 'plantilla' })).json()).tareas.length, pl.tareas.length); // no duplica
  assert.equal((await post(setter, { op: 'crear', tarea: { titulo: 'x' } })).status, 403);

  const before = mock.sentEmails.length;
  const c = await (await post(admin, { op: 'crear', tarea: { titulo: 'Grabar vídeo de bienvenida', fase: 'captacion', fecha: '2026-10-20', asignado: { tipo: 'persona', id: sara.user.id } } })).json();
  assert.equal(c.aviso.enviados, 1);
  assert.equal(mock.sentEmails.length, before + 1);
  assert.match(mock.sentEmails.at(-1).subject, /Grabar vídeo de bienvenida/);
  const mine = c.tareas.find((t) => t.titulo === 'Grabar vídeo de bienvenida');

  const setterTask = c.tareas.find((t) => t.asignado?.rol === 'setter');
  const adminTask = c.tareas.find((t) => t.asignado?.rol === 'admin');
  assert.equal((await post(saraCookie, { op: 'marcar', id: adminTask.id, hecha: true })).status, 403);
  assert.equal((await post(setter, { op: 'marcar', id: setterTask.id, hecha: true })).status, 200);
  const m = await (await post(saraCookie, { op: 'marcar', id: mine.id, hecha: true })).json();
  const done = m.tareas.find((t) => t.id === mine.id);
  assert.equal(done.hecha, true);
  assert.equal(done.hechaPor, 'Sara Guzmán');

  const list = await (await tareas.GET(req('/api/tareas?l=demo', { cookie: saraCookie }))).json();
  assert.equal(list.me.uid, sara.user.id);
  assert.ok(list.users.every((u) => !u.email));
  assert.equal((await post(admin, { op: 'borrar', id: mine.id })).status, 200);
  const dos = list.tareas.filter((t) => t.id !== mine.id).slice(0, 2).map((t) => t.id);
  assert.equal((await post(setter, { op: 'borrar-varias', ids: dos })).status, 403);
  const bv = await (await post(admin, { op: 'borrar-varias', ids: dos })).json();
  assert.equal(bv.tareas.length, list.tareas.length - 3);
  assert.ok(!bv.tareas.some((t) => dos.includes(t.id)));
  assert.equal((await post(saraCookie, { op: 'borrar-todas' })).status, 403);
  assert.equal((await (await post(admin, { op: 'borrar-todas' })).json()).tareas.length, 0);
  assert.equal((await post(saraCookie, { op: 'marcar', id: mine.id, hecha: false })).status, 404);
});
