// Conector de Claude (Cowork / claude.ai): OAuth 2.1 con PKCE y registro dinámico de clientes, para que Claude
// entre en el dashboard con el usuario de quien lo conecta (sus mismos permisos y clientes).
//   · client_id: firmado (lleva sus redirect_uri), sin guardar nada. Solo se aceptan redirecciones a Claude
//     (claude.ai / claude.com) y, para pruebas, a localhost; MCP_REDIRECTS (Cloudflare) añade otros dominios.
//   · Cada conexión es una «autorización» (grant) guardada en lsd_mcp (común a todos los clientes): se ve y se
//     revoca en el dashboard. El código de autorización es de un solo uso y dura 5 minutos.
//   · access_token (1 h) y refresh_token (rota en cada uso) van firmados con SESSION_SECRET y apuntan al grant.
import { signToken, verifyToken, sessionCookie, getSession } from './auth.js';
import { leerJSON, guardarJSON, reintentando } from './store.js';
import { enPrincipal } from './cliente.js';
import { env } from './env.js';

const CLAVE = 'lsd_mcp';
export const CODE_MS = 5 * 60_000;
export const ACCESS_S = 3600;
export const REFRESH_MS = 60 * 86_400_000; // sin usarse 60 días, caduca
export const MAX_GRANTS = 100;
const USO_CADA_MS = 3600_000; // «último uso»: como mucho una escritura por hora

const b64u = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
const str = (v, max) => String(v ?? '').trim().slice(0, max);

async function firmado(prefijo, obj) { return signToken(`${prefijo}:${b64u(JSON.stringify(obj))}`); }
async function leerFirmado(prefijo, token) {
  const v = await verifyToken(token);
  if (!v || !v.startsWith(`${prefijo}:`)) return null;
  try { return JSON.parse(deB64u(v.slice(prefijo.length + 1))); } catch { return null; }
}

// ---- Clientes (registro dinámico, RFC 7591) ----
export function redireccionValida(uri) {
  let u;
  try { u = new URL(String(uri)); } catch { return false; }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === 'http:') return ['localhost', '127.0.0.1'].includes(u.hostname);
  if (u.protocol !== 'https:') return false;
  const extra = String(env.MCP_REDIRECTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return ['claude.ai', 'claude.com', ...extra].some((d) => u.hostname === d || u.hostname.endsWith(`.${d}`));
}

export async function registrarCliente(body = {}) {
  const r = [].concat(body.redirect_uris || []).map((x) => str(x, 500)).filter(Boolean).slice(0, 5);
  if (!r.length) throw Object.assign(new Error('invalid_redirect_uri'), { oauth: 'invalid_redirect_uri', detalle: 'Falta redirect_uris' });
  const malas = r.filter((x) => !redireccionValida(x));
  if (malas.length) throw Object.assign(new Error('invalid_redirect_uri'), { oauth: 'invalid_redirect_uri', detalle: `Redirección no permitida: ${malas[0]}` });
  const n = str(body.client_name, 80) || 'Claude';
  return { client_id: await firmado('mcpc', { n, r }), client_name: n, redirect_uris: r };
}
export const leerCliente = (clientId) => leerFirmado('mcpc', clientId);

// ---- PKCE ----
export async function retoPkce(verifier) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(verifier))));
  return btoa(String.fromCharCode(...h)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Parámetros de /authorize: { cliente, redirect, state, challenge, scope } o lanza { oauth, detalle, redirigible }.
export async function validarAutorizacion(p) {
  // Sin cliente o redirección válidos no se vuelve a Claude (se enseña el error); con ellos, sí (con ?error=…).
  const fallo = (oauth, detalle, redirect = '') => Object.assign(new Error(oauth), { oauth, detalle, redirect });
  const cliente = await leerCliente(p.get('client_id') || '');
  if (!cliente) throw fallo('invalid_client', 'Esta conexión no es válida. Vuelve a añadir el conector en Claude.');
  const redirect = p.get('redirect_uri') || (cliente.r.length === 1 ? cliente.r[0] : '');
  if (!cliente.r.includes(redirect)) throw fallo('invalid_request', 'La dirección de vuelta no coincide con la registrada.');
  if (p.get('response_type') !== 'code') throw fallo('unsupported_response_type', 'Solo response_type=code.', redirect);
  const challenge = p.get('code_challenge') || '';
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(challenge) || (p.get('code_challenge_method') || 'plain') !== 'S256') throw fallo('invalid_request', 'Falta PKCE (S256).', redirect);
  return { clientId: p.get('client_id'), cliente, redirect, state: str(p.get('state'), 500), challenge, scope: str(p.get('scope'), 200) };
}

export function urlVuelta(redirect, params) {
  const u = new URL(redirect);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

// ---- Autorizaciones (lsd_mcp) ----
const vacio = () => ({ grants: [] });
let memGrants = { at: 0, v: null };
export const leerGrants = () => enPrincipal(() => leerJSON(CLAVE, vacio));
const cambiarGrants = (fn, motivo) => enPrincipal(() => reintentando(async () => {
  const v = await leerJSON(CLAVE, vacio);
  if (!Array.isArray(v.grants)) v.grants = [];
  const r = await fn(v);
  // Fuera las revocadas o caducadas hace más de 30 días, y como mucho MAX_GRANTS.
  const limite = Date.now() - 30 * 86_400_000;
  v.grants = v.grants.filter((g) => !((g.revocado || g.caduca < Date.now()) && Date.parse(g.revocado || new Date(g.caduca).toISOString()) < limite)).slice(-MAX_GRANTS);
  await guardarJSON(CLAVE, v, { motivo });
  memGrants = { at: 0, v: null }; // en este servidor, al momento (en los demás, como mucho 30 s)
  return r;
}));

// Quién autoriza: { uid, role, nombre } desde su sesión del dashboard.
export async function crearGrant({ s, clientId, cliente, redirect, challenge }) {
  const g = {
    id: hex(12), uid: s.uid || '', role: s.uid ? '' : s.role, nombre: s.user?.nombre || (s.role === 'admin' ? 'Contraseña general (admin)' : 'Contraseña general (setter)'),
    app: cliente.n, creado: new Date().toISOString(), caduca: Date.now() + CODE_MS, // hasta canjear el código ultimoUso: '', gen: 0, codigo: hex(16), codigoUsado: false, revocado: '',
  };
  await cambiarGrants((v) => { v.grants.push(g); }, `Conectar ${cliente.n} (${g.nombre})`);
  const code = await firmado('mcpk', { g: g.id, k: g.codigo, c: clientId.slice(-24), r: redirect, ch: challenge, e: Date.now() + CODE_MS });
  return { grant: g, code };
}

const activo = (g) => g && !g.revocado && g.caduca > Date.now();
const tokens = async (g) => ({
  access_token: await signToken(`mcpa:${g.id}:${g.gen}:${Math.floor(Date.now() / 1000) + ACCESS_S}`),
  token_type: 'Bearer', expires_in: ACCESS_S,
  refresh_token: await signToken(`mcpr:${g.id}:${g.gen}`),
});

// grant_type=authorization_code → tokens (el código solo vale una vez; si se repite, se revoca la conexión).
export async function canjearCodigo({ code, clientId, redirect, verifier }) {
  const c = await leerFirmado('mcpk', code || '');
  const malo = (d) => Object.assign(new Error('invalid_grant'), { oauth: 'invalid_grant', detalle: d });
  if (!c || c.e < Date.now()) throw malo('Código caducado o no válido');
  if (c.c !== String(clientId || '').slice(-24) || (c.r && c.r !== redirect)) throw malo('El código es de otra conexión');
  if (!verifier || (await retoPkce(verifier)) !== c.ch) throw malo('PKCE no coincide');
  const r = await cambiarGrants(async (v) => {
    const g = v.grants.find((x) => x.id === c.g);
    if (!activo(g) || g.codigo !== c.k) throw malo('Conexión revocada');
    // Código repetido: alguien lo ha copiado. Se revoca (y se guarda) antes de responder que no.
    if (g.codigoUsado) { g.revocado = new Date().toISOString(); return { error: 'Código ya usado' }; }
    g.codigoUsado = true;
    g.gen = 1;
    g.caduca = Date.now() + REFRESH_MS;
    return tokens(g);
  }, 'Conexión de Claude: primer token');
  if (r.error) throw malo(r.error);
  return r;
}

// grant_type=refresh_token → tokens nuevos (el refresh anterior deja de valer).
export async function refrescar(refresh) {
  const v = await verifyToken(refresh || '');
  const m = v && v.match(/^mcpr:([0-9a-f]{24}):(\d+)$/);
  const malo = () => Object.assign(new Error('invalid_grant'), { oauth: 'invalid_grant', detalle: 'Refresh no válido' });
  if (!m) throw malo();
  return cambiarGrants(async (st) => {
    const g = st.grants.find((x) => x.id === m[1]);
    if (!activo(g) || String(g.gen) !== m[2]) throw malo();
    g.gen++;
    g.caduca = Date.now() + REFRESH_MS;
    return tokens(g);
  }, 'Conexión de Claude: token renovado');
}

// Bearer → { grant, s } (la sesión del dashboard de esa persona en el cliente actual) o null.
export async function sesionDeToken(bearer, origin) {
  const v = await verifyToken(bearer || '');
  const m = v && v.match(/^mcpa:([0-9a-f]{24}):(\d+):(\d+)$/);
  if (!m || Number(m[3]) < Date.now() / 1000) return null;
  if (!memGrants.v || memGrants.at < Date.now() - 30_000) memGrants = { at: Date.now(), v: await leerGrants() };
  let g = memGrants.v.grants?.find((x) => x.id === m[1]);
  // Recién creada o cambiada en otro servidor: se lee de nuevo antes de decir que no.
  if (!activo(g) || String(g.gen) !== m[2]) {
    memGrants = { at: Date.now(), v: await leerGrants() };
    g = memGrants.v.grants?.find((x) => x.id === m[1]);
  }
  if (!activo(g) || String(g.gen) !== m[2]) return null;
  const s = await sesionDeGrant(g, origin);
  if (!s) return null;
  if (!g.ultimoUso || Date.parse(g.ultimoUso) < Date.now() - USO_CADA_MS) {
    const ahora = new Date().toISOString();
    g.ultimoUso = ahora;
    cambiarGrants((st) => { const x = st.grants.find((y) => y.id === g.id); if (x) x.ultimoUso = ahora; }, 'Conexión de Claude: uso').catch(() => {});
  }
  return { grant: g, s };
}

// La misma comprobación que una cookie de sesión del dashboard: si a la persona la desactivan, le cambian el rol
// o le quitan el acceso a un cliente, Claude deja de ver lo que ella ya no ve.
export async function sesionDeGrant(g, origin = 'https://dashboard.local') {
  const cookie = (await sessionCookie(g.uid ? 'u' : g.role, g.uid)).split(';')[0];
  const s = await getSession(new Request(`${origin}/`, { headers: { cookie } }));
  // Si cambió su contraseña (o se cerraron sus sesiones) después de conectar, la conexión ya no vale.
  if (s?.user?.sesionesDesde && Number(s.user.sesionesDesde) > Date.parse(g.creado) / 1000) return null;
  return s;
}

export async function revocarGrant(id, s) {
  return cambiarGrants((v) => {
    const g = v.grants.find((x) => x.id === id);
    if (!g) throw Object.assign(new Error('No encontrada'), { status: 404, publicMessage: 'Conexión no encontrada' });
    if (!s.superadmin && g.uid !== s.uid) throw Object.assign(new Error('No es tuya'), { status: 403, publicMessage: 'Solo puedes desconectar tus conexiones' });
    g.revocado = new Date().toISOString();
  }, 'Desconectar Claude');
}

export const grantPublico = (g) => ({ id: g.id, nombre: g.nombre, app: g.app, creado: g.creado, ultimoUso: g.ultimoUso || '', activa: activo(g) && g.codigoUsado, revocado: g.revocado || '' });
