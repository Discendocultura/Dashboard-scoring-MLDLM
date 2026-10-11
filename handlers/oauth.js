// OAuth del conector de Claude (ver lib/oauth.js).
//   GET  /.well-known/oauth-protected-resource[/api/mcp]   → metadatos del recurso (RFC 9728)
//   GET  /.well-known/oauth-authorization-server[/…]       → metadatos del servidor de autorización (RFC 8414)
//   POST /api/oauth/register    → registro dinámico del cliente (RFC 7591)
//   GET  /api/oauth/authorize   → pantalla «¿Permitir a Claude…?» (o «entra primero en el dashboard»)
//   POST /api/oauth/authorize   → permitir / cancelar → vuelve a Claude con ?code o ?error
//   POST /api/oauth/token       → authorization_code (con PKCE) o refresh_token
//   GET  /api/oauth/conexiones  → conexiones de Claude (las tuyas; el superadmin, todas) y la URL del conector
//   POST /api/oauth/conexiones { op: 'revocar', id }
import { getSession, signToken, verifyToken } from '../lib/auth.js';
import {
  registrarCliente, validarAutorizacion, urlVuelta, crearGrant, canjearCodigo, refrescar, leerGrants, revocarGrant, grantPublico,
} from '../lib/oauth.js';
import { clienteActual } from '../lib/cliente.js';
import { json, html, readBody, errorResponse, escapeHtml } from '../lib/http.js';

const origen = (request) => new URL(request.url).origin;
export const urlMcp = (request) => `${origen(request)}/api/mcp`;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version' };
const errOauth = (e, status = 400) => (e.oauth ? json({ error: e.oauth, error_description: e.detalle || '' }, status, CORS) : errorResponse(e));

export function metadatosRecurso(request) {
  return json({ resource: urlMcp(request), authorization_servers: [origen(request)], bearer_methods_supported: ['header'], resource_name: 'Dashboard Datos' }, 200, CORS);
}
export function metadatosServidor(request) {
  const o = origen(request);
  return json({
    issuer: o, authorization_endpoint: `${o}/api/oauth/authorize`, token_endpoint: `${o}/api/oauth/token`, registration_endpoint: `${o}/api/oauth/register`,
    response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'], scopes_supported: ['dashboard'],
  }, 200, CORS);
}

// ---- Pantallas ----
function pagina(titulo, cuerpo) {
  const r = html(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${escapeHtml(titulo)}</title><style>
:root{--bg:#f6f4f1;--card:#fff;--text:#1c1917;--muted:#6b645d;--accent:#b4552d;--border:#e6e2dc}
@media (prefers-color-scheme:dark){:root{--bg:#141210;--card:#1f1c19;--text:#f2eee9;--muted:#a59d94;--border:#34302b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;display:grid;place-items:center;min-height:100vh;padding:16px}
.card{background:var(--card);border:1px solid var(--border);border-radius:16px;max-width:460px;width:100%;padding:28px}
h1{font-size:21px;margin:0 0 6px}p{margin:8px 0}.muted{color:var(--muted);font-size:14px}ul{padding-left:20px;margin:10px 0}li{margin:4px 0}
.acc{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}button,.btn{font:inherit;font-weight:600;border-radius:10px;padding:10px 18px;border:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer;text-decoration:none}
.prim{background:var(--accent);border-color:var(--accent);color:#fff}code{font-size:13px}
</style></head><body><main class="card">${cuerpo}</main></body></html>`);
  r.headers.set('x-frame-options', 'DENY');
  r.headers.set('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https: http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'");
  r.headers.set('referrer-policy', 'no-referrer');
  return r;
}
const paginaError = (msg) => pagina('No se puede conectar', `<h1>No se puede conectar</h1><p>${escapeHtml(msg)}</p><p class="muted">Vuelve a Claude y prueba a conectar el conector otra vez.</p>`);

async function autorizarGet(request) {
  const url = new URL(request.url);
  let a;
  try { a = await validarAutorizacion(url.searchParams); } catch (e) {
    if (e.redirect) return Response.redirect(urlVuelta(e.redirect, { error: e.oauth, error_description: e.detalle, state: url.searchParams.get('state') }), 302);
    return paginaError(e.detalle || 'Petición no válida.');
  }
  const s = await getSession(request);
  if (!s?.role) {
    const volver = `/?oauth=${encodeURIComponent(url.pathname + url.search)}`;
    return pagina('Entra en el dashboard', `<h1>Conectar ${escapeHtml(a.cliente.n)} con el dashboard</h1>
      <p>${s ? `Tu usuario no tiene acceso a «${escapeHtml(clienteActual().nombre)}».` : 'Primero entra en el dashboard con tu usuario. Después volverás aquí para dar permiso.'}</p>
      <div class="acc"><a class="btn prim" href="${escapeHtml(volver)}">Entrar en el dashboard</a></div>`);
  }
  const csrf = await signToken(`oauthcsrf:${s.uid || s.role}:${Date.now() + 15 * 60_000}`);
  const ocultos = ['client_id', 'redirect_uri', 'response_type', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource']
    .map((k) => (url.searchParams.has(k) ? `<input type="hidden" name="${k}" value="${escapeHtml(url.searchParams.get(k))}">` : '')).join('');
  const quien = s.user?.nombre || (s.role === 'admin' ? 'la contraseña general de admin' : 'la contraseña general');
  return pagina('Conectar Claude', `<h1>¿Conectar ${escapeHtml(a.cliente.n)} con tu dashboard?</h1>
    <p>Claude entrará como <strong>${escapeHtml(quien)}</strong>, con tus mismos permisos y clientes.</p>
    <p>Podrá <strong>consultar</strong> (sin cambiar nada):</p>
    <ul><li>Embudos, lanzamientos y sus fechas</li><li>Métricas (registros, ventas, ROAS…)</li><li>La encuesta, anónima (sin nombres, emails ni teléfonos)</li><li>La ficha de marca y avatar y la narrativa</li><li>Tareas y el calendario y resultados de los emails</li></ul>
    <p class="muted">Lo puedes desconectar cuando quieras en el dashboard (Agencia → Claude) o en los ajustes de conectores de Claude. Volverás a <code>${escapeHtml(new URL(a.redirect).host)}</code>.</p>
    <form method="post" action="/api/oauth/authorize">${ocultos}<input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
      <div class="acc"><button class="prim" name="decision" value="permitir">Permitir</button><button name="decision" value="cancelar">Cancelar</button></div></form>`);
}

async function autorizarPost(request) {
  const body = await readBody(request);
  const p = new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
  let a;
  try { a = await validarAutorizacion(p); } catch (e) { return paginaError(e.detalle || 'Petición no válida.'); }
  const s = await getSession(request);
  if (!s?.role) return paginaError('Tu sesión del dashboard ha caducado. Entra de nuevo y vuelve a conectar.');
  const v = await verifyToken(p.get('csrf') || '');
  const m = v && v.match(/^oauthcsrf:(.+):(\d+)$/);
  if (!m || m[1] !== (s.uid || s.role) || Number(m[2]) < Date.now()) return paginaError('El formulario ha caducado. Vuelve a conectar desde Claude.');
  if (p.get('decision') !== 'permitir') return Response.redirect(urlVuelta(a.redirect, { error: 'access_denied', state: a.state }), 302);
  const { code } = await crearGrant({ s, clientId: a.clientId, cliente: a.cliente, redirect: a.redirect, challenge: a.challenge });
  return Response.redirect(urlVuelta(a.redirect, { code, state: a.state }), 302);
}

async function token(request) {
  const b = await readBody(request);
  try {
    if (b.grant_type === 'authorization_code') {
      return json(await canjearCodigo({ code: b.code, clientId: b.client_id, redirect: b.redirect_uri, verifier: b.code_verifier }), 200, CORS);
    }
    if (b.grant_type === 'refresh_token') return json(await refrescar(b.refresh_token), 200, CORS);
    return json({ error: 'unsupported_grant_type' }, 400, CORS);
  } catch (e) {
    return errOauth(e);
  }
}

async function conexiones(request) {
  const s = await getSession(request);
  if (!s?.role) return json({ error: 'No autorizado' }, 401);
  if (request.method === 'POST') {
    const b = await readBody(request);
    if (b.op !== 'revocar') return json({ error: 'Operación no válida' }, 400);
    await revocarGrant(String(b.id || ''), s);
  }
  const { grants = [] } = await leerGrants();
  const mias = grants.filter((g) => g.codigoUsado && !g.revocado && (s.superadmin || (s.uid && g.uid === s.uid)));
  return json({ url: urlMcp(request), conexiones: mias.map(grantPublico).sort((x, y) => String(y.ultimoUso || y.creado).localeCompare(String(x.ultimoUso || x.creado))) });
}

// Sub-rutas de /api/oauth/*
export async function oauth(request) {
  try {
    const sub = new URL(request.url).pathname.replace(/^\/api\/oauth\/?/, '').replace(/\/$/, '');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, 'access-control-allow-methods': 'GET, POST, OPTIONS' } });
    if (sub === 'register' && request.method === 'POST') {
      try {
        const c = await registrarCliente(await readBody(request));
        return json({ ...c, client_id_issued_at: Math.floor(Date.now() / 1000), token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }, 201, CORS);
      } catch (e) { return errOauth(e); }
    }
    if (sub === 'authorize' && request.method === 'GET') return await autorizarGet(request);
    if (sub === 'authorize' && request.method === 'POST') return await autorizarPost(request);
    if (sub === 'token' && request.method === 'POST') return await token(request);
    if (sub === 'conexiones' && ['GET', 'POST'].includes(request.method)) return await conexiones(request);
    return json({ error: 'No encontrado' }, 404);
  } catch (e) {
    return errorResponse(e);
  }
}
