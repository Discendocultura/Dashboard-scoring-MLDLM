import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  setEnv({ GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret', DB: crearD1Local() });
});
const h = (t) => createHash('sha256').update(t).digest('hex');

test('CAPI: datos normalizados y cifrados como pide Meta', async () => {
  const { normalizar, userData } = await import('../lib/meta-capi.js');
  assert.deepEqual(normalizar({ email: ' Ana@Correo.ES ', telefono: '612 34 56 78', nombre: 'Ána María López' }),
    { em: 'ana@correo.es', ph: '34612345678', fn: 'ana', ln: 'marialopez', country: 'es', external_id: '' });
  const ud = await userData({ email: 'ana@correo.es', externalId: 'abc123', ip: '1.2.3.4', ua: 'Mozilla', fbp: 'fb.1.1700000000.123', fbc: 'malo' });
  assert.deepEqual(ud.em, [h('ana@correo.es')]);
  assert.deepEqual(ud.external_id, [h('abc123')]);
  assert.equal(ud.client_ip_address, '1.2.3.4');
  assert.equal(ud.fbp, 'fb.1.1700000000.123');
  assert.equal(ud.fbc, undefined); // formato no válido: no se manda
});

test('CAPI: configuración, eventos apagados y envío de compra / clase 1 / directo', async () => {
  const { sanitizeMetaCapi } = await import('../public/js/meta-capi.js');
  const { enviarEventoMeta, enviados } = await import('../lib/meta-capi.js');
  assert.deepEqual(sanitizeMetaCapi({ activo: true, pixelId: '12 34', eventos: { clase1: false } }), { pixelId: '1234', activo: false, eventos: { compras: true, clase1: false, directo: true } });
  const config = { metaCapi: { activo: true, pixelId: '1234567890', eventos: { clase1: false }, testCode: 'TEST99' } };
  assert.equal((await enviarEventoMeta({ tipo: 'clase1', eventId: 'x', config, datos: { email: 'a@b.es' } })).motivo, 'Ese evento está apagado');
  assert.equal((await enviarEventoMeta({ tipo: 'compras', eventId: 'x', config: { metaCapi: { ...config.metaCapi, activo: false } }, datos: { email: 'a@b.es' } })).motivo, 'Conversions API apagada');
  const r = await enviarEventoMeta({ tipo: 'compras', eventId: 'hm-123', config, datos: { email: 'a@b.es', nombre: 'Ana' }, custom: { value: 497, currency: 'EUR', content_name: 'Raíces' } });
  assert.equal(r.enviado, true);
  const e = enviados.at(-1);
  assert.equal(e.pixel, '1234567890');
  assert.equal(e.test_event_code, 'TEST99');
  assert.deepEqual([e.data[0].event_name, e.data[0].event_id, e.data[0].action_source, e.data[0].custom_data.value], ['Purchase', 'hm-123', 'system_generated', 497]);
  await enviarEventoMeta({ tipo: 'directo', eventId: 'directo1-nov-abc', config, datos: { externalId: 'abc', ip: '1.2.3.4', ua: 'Mozilla' } });
  assert.deepEqual([enviados.at(-1).data[0].event_name, enviados.at(-1).data[0].action_source], ['EntroAlDirecto', 'website']);
  assert.equal((await enviarEventoMeta({ tipo: 'directo', eventId: 'y', config, datos: {} })).motivo, 'Sin datos de la persona');
});

test('CAPI: la API de Conexiones guarda, prueba y pide sesión', async () => {
  const { POST: login } = await import('../handlers/login.js');
  const cookie = (await login(new Request('http://localhost/api/login', { method: 'POST', body: '{"password":"admin"}' }))).headers.get('set-cookie').split(';')[0];
  const { GET, POST } = await import('../handlers/meta-capi.js');
  const post = (b) => POST(new Request('http://localhost/api/meta-capi', { method: 'POST', headers: { cookie, 'user-agent': 'Mozilla/5.0' }, body: JSON.stringify(b) }));
  const g = await (await post({ op: 'guardar', metaCapi: { activo: true, pixelId: '998877665544', eventos: { compras: false } } })).json();
  assert.deepEqual([g.config.activo, g.config.eventos.compras], [true, false]);
  const p = await (await post({ op: 'prueba' })).json();
  assert.equal(p.enviado, true);
  const est = await (await GET(new Request('http://localhost/api/meta-capi', { headers: { cookie } }))).json();
  assert.ok(est.log.some((x) => x.evento === 'PruebaAlquimIA' && x.prueba));
  assert.equal((await GET(new Request('http://localhost/api/meta-capi'))).status, 401);
});

test('CAPI: el directo y la clase 1 mandan su evento con lo del navegador', async () => {
  const { getConfig, saveConfig } = await import('../lib/config-store.js');
  const { enviados } = await import('../lib/meta-capi.js');
  const actual = await getConfig({ fresh: true });
  // El directo, ahora mismo en hora de Madrid (la entrada solo se apunta cerca de la hora del directo).
  const [fecha, hora] = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 16).split(' ');
  await saveConfig({ ...actual, metaCapi: { activo: true, pixelId: '998877665544' }, launches: { ...actual.launches, capi: { name: 'Capi', registroTag: 'registro-webinar-demo', fechaDirecto: fecha, horaDirecto: hora, zoomMeetingId: '81234567890' } } });
  const antes = enviados.length;
  const { POST: track } = await import('../handlers/track.js');
  const { contactsByTag } = await import('../lib/ghl.js');
  const cid = (await contactsByTag('registro-webinar-demo', null, [])).contacts[0].id;
  await track(new Request('http://localhost/api/track', { method: 'POST', headers: { 'cf-connecting-ip': '5.6.7.8', 'user-agent': 'UA' }, body: JSON.stringify({ launch: 'capi', video: 'clase1', pct: 50, cid, fbp: 'fb.1.1700000000.9' }) }));
  const ev = enviados.slice(antes).find((x) => x.data[0].event_name === 'VioClase1');
  assert.ok(ev, 'VioClase1');
  assert.equal(ev.data[0].event_id, `clase1-capi-${cid}`);
  assert.equal(ev.data[0].user_data.fbp, 'fb.1.1700000000.9');
  assert.equal(ev.data[0].user_data.client_ip_address, '5.6.7.8');
  const { POST: dz } = await import('../handlers/directo-zoom.js');
  await dz(new Request('http://localhost/api/directo-zoom', { method: 'POST', headers: { 'user-agent': 'UA' }, body: JSON.stringify({ op: 'click', launch: 'capi', k: 1, cid, email: 'x@y.es' }) }));
  assert.ok(enviados.slice(antes).some((x) => x.data[0].event_name === 'EntroAlDirecto' && x.data[0].event_id === `directo1-capi-${cid}`));
});
