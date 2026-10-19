// Conector de Claude: OAuth (registro, permiso, PKCE, código de un solo uso, renovación, revocar) y servidor MCP.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { dayInMadrid } from '../public/js/scoring.js';

const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
const CB = 'https://claude.ai/api/mcp/auth_callback';
let route;
let retoPkce;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
  ({ retoPkce } = await import('../lib/oauth.js'));
});
async function call(path, { method = 'GET', body, cookie, headers = {}, form = false } = {}) {
  const res = await route(new Request(`https://dash.example${path}`, {
    method, redirect: 'manual',
    headers: { ...(cookie ? { cookie } : {}), 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json', ...headers },
    body: body ? (form ? new URLSearchParams(body).toString() : JSON.stringify(body)) : undefined,
  }), ENV);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, data, text, res };
}
const login = async (password) => (await call('/api/login', { method: 'POST', body: { password } })).res.headers.get('set-cookie').split(';')[0];
const mcp = (token, method, params, id = 1) => call('/api/mcp', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: { jsonrpc: '2.0', id, method, params } });

// Registro + permiso + código: devuelve { clientId, code, verifier }.
async function autorizar(cookie, { decision = 'permitir' } = {}) {
  const reg = await call('/api/oauth/register', { method: 'POST', body: { client_name: 'Claude', redirect_uris: [CB] } });
  const clientId = reg.data.client_id;
  const verifier = 'v'.repeat(20) + Math.random().toString(36).slice(2) + 'x'.repeat(30);
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: CB, code_challenge: await retoPkce(verifier), code_challenge_method: 'S256', state: 'st4te', scope: 'dashboard' });
  const pag = await call(`/api/oauth/authorize?${q}`, { cookie });
  const csrf = pag.text.match(/name="csrf" value="([^"]+)"/)?.[1];
  const r = await call('/api/oauth/authorize', { method: 'POST', cookie, form: true, body: { ...Object.fromEntries(q), csrf, decision } });
  const loc = new URL(r.res.headers.get('location'));
  return { clientId, verifier, code: loc.searchParams.get('code'), loc, pag };
}
const canjear = (a, verifier = a.verifier) => call('/api/oauth/token', { method: 'POST', form: true, body: { grant_type: 'authorization_code', code: a.code, client_id: a.clientId, redirect_uri: CB, code_verifier: verifier } });

test('sin token: 401 con dónde autorizarse, y metadatos OAuth', async () => {
  const r = await call('/api/mcp', { method: 'POST', body: { jsonrpc: '2.0', id: 1, method: 'initialize' } });
  assert.equal(r.status, 401);
  assert.match(r.res.headers.get('www-authenticate'), /resource_metadata="https:\/\/dash\.example\/\.well-known\/oauth-protected-resource\/api\/mcp"/);
  const pr = await call('/.well-known/oauth-protected-resource/api/mcp');
  assert.equal(pr.data.resource, 'https://dash.example/api/mcp');
  assert.deepEqual(pr.data.authorization_servers, ['https://dash.example']);
  const as = await call('/.well-known/oauth-authorization-server');
  assert.equal(as.data.token_endpoint, 'https://dash.example/api/oauth/token');
  assert.deepEqual(as.data.code_challenge_methods_supported, ['S256']);
  assert.equal((await mcp('basura.firma', 'initialize', {})).status, 401);
});

test('registro: solo redirecciones a Claude (o localhost)', async () => {
  assert.equal((await call('/api/oauth/register', { method: 'POST', body: { redirect_uris: ['https://malo.example/cb'] } })).status, 400);
  assert.equal((await call('/api/oauth/register', { method: 'POST', body: { redirect_uris: ['http://claude.ai/cb'] } })).status, 400);
  const ok = await call('/api/oauth/register', { method: 'POST', body: { client_name: 'Claude', redirect_uris: [CB] } });
  assert.equal(ok.status, 201);
  assert.ok(ok.data.client_id);
  assert.equal((await call('/api/oauth/register', { method: 'POST', body: { redirect_uris: ['http://localhost:6274/oauth/callback'] } })).status, 201);
});

test('permiso: sin sesión pide entrar; con otra redirección no vuelve; cancelar vuelve con access_denied', async () => {
  const reg = await call('/api/oauth/register', { method: 'POST', body: { redirect_uris: [CB] } });
  const q = (extra = {}) => new URLSearchParams({ response_type: 'code', client_id: reg.data.client_id, redirect_uri: CB, code_challenge: 'a'.repeat(43), code_challenge_method: 'S256', state: 's', ...extra });
  const sin = await call(`/api/oauth/authorize?${q()}`);
  assert.match(sin.text, /Entrar en AlquimIA/);
  assert.match(sin.text, /href="\/\?oauth=%2Fapi%2Foauth%2Fauthorize%3F/);
  assert.equal(sin.res.headers.get('x-frame-options'), 'DENY');
  const admin = await login('admin');
  const otra = await call(`/api/oauth/authorize?${q({ redirect_uri: 'https://claude.ai/otra' })}`, { cookie: admin });
  assert.equal(otra.status, 200);
  assert.match(otra.text, /no coincide/);
  const sinPkce = await call(`/api/oauth/authorize?${q({ code_challenge_method: 'plain' })}`, { cookie: admin });
  assert.equal(sinPkce.status, 302);
  assert.match(sinPkce.res.headers.get('location'), /error=invalid_request/);
  const c = await autorizar(admin, { decision: 'cancelar' });
  assert.equal(c.loc.searchParams.get('error'), 'access_denied');
  assert.equal(c.code, null);
  // Formulario sin csrf válido: no.
  const sinCsrf = await call('/api/oauth/authorize', { method: 'POST', cookie: admin, form: true, body: { ...Object.fromEntries(q()), csrf: 'x.y', decision: 'permitir' } });
  assert.match(sinCsrf.text, /caducado/);
});

test('flujo completo: código con PKCE, herramientas, renovación, código reusado y revocar', async () => {
  const admin = await login('admin');
  // Lanzamiento con fechas para el resto de herramientas.
  const cfg = await call('/api/config', { cookie: admin });
  const hoy = dayInMadrid(new Date().toISOString()) // el día en Madrid, como la herramienta;
  const d = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const launches = { ...cfg.data.config.launches, oct: { name: 'Octubre', registroTag: 'registro-webinar-demo', compraTag: 'clienta-raices', inicioCaptacion: d(-10), finCaptacion: d(2), fechaDirecto: d(2), horaDirecto: '18:00', aperturaCarrito: `${d(2)}T19:30`, cierreCarrito: `${d(7)}T23:59`, precioPrograma: 997, narrativa: { titulo: 'El Camino', texto: 'TÍTULO: «El Camino»\nIDEA CENTRAL: etapas.' } } };
  const g = await call('/api/config', { method: 'POST', cookie: admin, body: { ...cfg.data.config, launches, _version: cfg.data.version } });
  assert.equal(g.status, 200, g.text);

  const a = await autorizar(admin);
  assert.match(a.pag.text, /Permitir/);
  assert.equal(a.loc.origin + a.loc.pathname, CB);
  assert.equal(a.loc.searchParams.get('state'), 'st4te');
  assert.ok(a.code);
  assert.equal((await canjear(a, 'otro-verificador-que-no-es-el-bueno-xxxxxxxxxxxxxxxxxx')).data.error, 'invalid_grant');
  const t = await canjear(a);
  assert.equal(t.status, 200, t.text);
  assert.equal(t.data.token_type, 'Bearer');

  const ini = await mcp(t.data.access_token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(ini.data.result.protocolVersion, '2025-06-18');
  assert.ok(ini.data.result.capabilities.tools);
  const noti = await call('/api/mcp', { method: 'POST', headers: { authorization: `Bearer ${t.data.access_token}` }, body: { jsonrpc: '2.0', method: 'notifications/initialized' } });
  assert.equal(noti.status, 202);
  const lista = await mcp(t.data.access_token, 'tools/list', {});
  const nombres = lista.data.result.tools.map((x) => x.name);
  for (const n of ['ver_embudos', 'metricas_embudo', 'encuesta_para_copy', 'marca_y_narrativa', 'datos_informe', 'tareas_lanzamiento', 'emails_lanzamiento']) assert.ok(nombres.includes(n), n);
  assert.ok(lista.data.result.tools.every((x) => x.annotations.readOnlyHint));

  const ve = await mcp(t.data.access_token, 'tools/call', { name: 'ver_embudos', arguments: {} });
  assert.ok(!ve.data.result.isError, ve.text);
  const vj = JSON.parse(ve.data.result.content[0].text);
  assert.equal(vj.hoy, hoy);
  assert.ok(vj.lanzamientos.some((l) => l.code === 'oct' && l.estado === 'captación' && l.narrativa === 'El Camino'));

  const enc = await mcp(t.data.access_token, 'tools/call', { name: 'encuesta_para_copy', arguments: { lanzamiento: 'oct' } });
  const et = enc.data.result.content[0].text;
  assert.ok(!enc.data.result.isError, et);
  assert.match(et, /RESPUESTAS DE TEXTO LIBRE/);
  assert.match(et, /«El Camino»/);
  assert.doesNotMatch(et, /@example\.com|\+346/); // sin emails ni teléfonos de los leads

  const mn = await mcp(t.data.access_token, 'tools/call', { name: 'marca_y_narrativa', arguments: { lanzamiento: 'oct' } });
  assert.match(mn.data.result.content[0].text, /## Narrativa del lanzamiento\n«El Camino»/);
  const ta = await mcp(t.data.access_token, 'tools/call', { name: 'tareas_lanzamiento', arguments: { lanzamiento: 'oct' } });
  assert.ok(!ta.data.result.isError, ta.text);
  const em = await mcp(t.data.access_token, 'tools/call', { name: 'emails_lanzamiento', arguments: { lanzamiento: 'oct' } });
  assert.ok(JSON.parse(em.data.result.content[0].text).calendario.length > 3);
  const me = await mcp(t.data.access_token, 'tools/call', { name: 'metricas_embudo', arguments: { lanzamiento: 'oct' } });
  assert.ok(!me.data.result.isError, me.text);
  assert.ok('registros' in JSON.parse(me.data.result.content[0].text).kpis);
  // Datos del informe: destinatarios (los añadidos, sin repetir y con email válido), colores, fases y llamadas.
  const dg = await call('/api/informe', { method: 'POST', cookie: admin, body: { op: 'destinatarios-guardar', texto: 'Laura García <Laura@Ejemplo.com>\nmal-email\nlaura@ejemplo.com\nGestoría, gestoria@ejemplo.com' } });
  assert.equal(dg.status, 200, dg.text);
  assert.deepEqual(dg.data.adicionales, [{ nombre: 'Laura García', email: 'laura@ejemplo.com' }, { nombre: 'Gestoría', email: 'gestoria@ejemplo.com' }]);
  const di = await mcp(t.data.access_token, 'tools/call', { name: 'datos_informe', arguments: { lanzamiento: 'oct' } });
  assert.ok(!di.data.result.isError, di.text);
  const dj = JSON.parse(di.data.result.content[0].text);
  assert.deepEqual(dj.destinatarios.adicionales.map((x) => x.email), ['laura@ejemplo.com', 'gestoria@ejemplo.com']);
  assert.match(dj.marca.colores.principal, /^#[0-9a-f]{6}$/i);
  assert.equal(dj.lanzamiento.fases.directo.dia, d(2));
  assert.match(dj.lanzamiento.informeWeb.enlace, /^https:\/\/dash\.example\/api\/informe\?l=oct&t=/);
  assert.equal(typeof dj.llamadas.total, 'number');
  const mal = await mcp(t.data.access_token, 'tools/call', { name: 'tareas_lanzamiento', arguments: { lanzamiento: 'no-existe' } });
  assert.equal(mal.data.result.isError, true);
  const otroCliente = await mcp(t.data.access_token, 'tools/call', { name: 'ver_embudos', arguments: { cliente: 'no-existe' } });
  assert.equal(otroCliente.data.result.isError, true);
  assert.equal((await mcp(t.data.access_token, 'tools/call', { name: 'borrar_todo', arguments: {} })).data.error.code, -32602);

  // Renovar: el refresh y el access anteriores dejan de valer.
  const r2 = await call('/api/oauth/token', { method: 'POST', form: true, body: { grant_type: 'refresh_token', refresh_token: t.data.refresh_token } });
  assert.equal(r2.status, 200);
  assert.equal((await call('/api/oauth/token', { method: 'POST', form: true, body: { grant_type: 'refresh_token', refresh_token: t.data.refresh_token } })).data.error, 'invalid_grant');
  assert.equal((await mcp(t.data.access_token, 'ping', {})).status, 401);
  assert.equal((await mcp(r2.data.access_token, 'ping', {})).status, 200);

  // El código solo vale una vez: si se repite, se revoca esa conexión.
  assert.equal((await canjear(a)).data.error, 'invalid_grant');
  assert.equal((await mcp(r2.data.access_token, 'ping', {})).status, 401);

  // Revocar desde el dashboard.
  const b = await autorizar(admin);
  const tb = await canjear(b);
  const con = await call('/api/oauth/conexiones', { cookie: admin });
  assert.equal(con.data.url, 'https://dash.example/api/mcp');
  const mia = con.data.conexiones.find((x) => x.activa);
  assert.ok(mia);
  await call('/api/oauth/conexiones', { method: 'POST', cookie: admin, body: { op: 'revocar', id: mia.id } });
  assert.equal((await mcp(tb.data.access_token, 'ping', {})).status, 401);
});

test('permisos: la setter (contraseña general) no ve métricas ni la encuesta', async () => {
  const setter = await login('setter');
  const a = await autorizar(setter);
  const t = await canjear(a);
  assert.equal(t.status, 200, t.text);
  const m = await mcp(t.data.access_token, 'tools/call', { name: 'metricas_embudo', arguments: {} });
  assert.equal(m.data.result.isError, true);
  assert.match(m.data.result.content[0].text, /no tiene acceso/);
  const e = await mcp(t.data.access_token, 'tools/call', { name: 'emails_lanzamiento', arguments: {} });
  assert.equal(e.data.result.isError, true);
  const di = await mcp(t.data.access_token, 'tools/call', { name: 'datos_informe', arguments: {} });
  assert.equal(di.data.result.isError, true); // los emails de los destinatarios, solo con permiso de configuración
  // Las suyas no las puede revocar otra persona sin ser superadmin; el superadmin sí.
  const con = await call('/api/oauth/conexiones', { cookie: setter });
  assert.equal(con.data.conexiones.length, 0); // contraseña general sin usuario: no tiene «suyas»
});
