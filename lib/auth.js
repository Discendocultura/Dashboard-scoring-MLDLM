// Sesión firmada con HMAC (Web Crypto: funciona en Cloudflare y en Node).
import { json } from './http.js';
import { env } from './env.js';
import { findUser } from './users.js';

const COOKIE = 'lsd_session';
const TTL_SECONDS = 7 * 24 * 3600;
const enc = new TextEncoder();
let keyCache = null;

async function key() {
  const s = env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('Falta SESSION_SECRET (mínimo 16 caracteres) en las variables de entorno');
  if (keyCache?.secret !== s) {
    keyCache = { secret: s, key: await crypto.subtle.importKey('raw', enc.encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']) };
  }
  return keyCache.key;
}

async function sign(value) {
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(), enc.encode(value)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function safeEqual(a, b) {
  const ba = enc.encode(String(a));
  const bb = enc.encode(String(b));
  let diff = ba.length ^ bb.length;
  for (let i = 0; i < Math.max(ba.length, bb.length); i++) diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

// Se ignoran los espacios al principio y al final (suelen colarse al copiar y pegar).
// Firma genérica (p. ej. enlaces de vista previa de la página de recursos).
export async function signToken(value) {
  return `${value}.${await sign(String(value))}`;
}

export async function verifyToken(token) {
  const s = String(token || '');
  const i = s.lastIndexOf('.');
  if (i <= 0) return null;
  const value = s.slice(0, i);
  return safeEqual(s.slice(i + 1), await sign(value)) ? value : null;
}

export function roleForPassword(password) {
  const pw = String(password || '').trim();
  if (!pw) return null;
  const admin = (env.ADMIN_PASSWORD || '').trim();
  const setter = (env.SETTER_PASSWORD || '').trim();
  if (admin && safeEqual(pw, admin)) return 'admin';
  if (setter && safeEqual(pw, setter)) return 'setter';
  return null;
}

// La cookie es `rol.caducidad.firma` (contraseña general) o `rol.caducidad.uid.firma` (usuario con email).
export async function sessionCookie(role, uid = '') {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const value = uid ? `${role}.${exp}.${uid}` : `${role}.${exp}`;
  return `${COOKIE}=${value}.${await sign(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_SECONDS}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

// { role, uid, user } o null. Con usuario, el rol es el que tenga AHORA (si se desactiva, pierde el acceso).
export async function getSession(request) {
  const cookies = Object.fromEntries(
    (request.headers.get('cookie') || '').split(';').map((c) => c.trim().split('=')).filter((p) => p.length >= 2).map(([k, ...v]) => [k, v.join('=')]),
  );
  const raw = cookies[COOKIE];
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 3 && parts.length !== 4) return null;
  const sig = parts.pop();
  const [role, exp, uid = ''] = parts;
  if (!role || !exp || !sig) return null;
  if (!safeEqual(sig, await sign(parts.join('.')))) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  if (!uid) return role === 'admin' || role === 'setter' ? { role, uid: '', user: null } : null;
  const user = await findUser(uid);
  if (!user || user.activo === false || !['admin', 'setter', 'equipo'].includes(user.rol)) return null;
  return { role: user.rol, uid, user };
}

export async function getRole(request) {
  return (await getSession(request))?.role || null;
}

// Lanza una Response 401/403 si no hay sesión válida. Por defecto entran admin y setter;
// `equipo: true` deja entrar también al rol equipo (solo ve las tareas); `admin: true` solo admin.
export async function requireSession(request, { admin = false, equipo = false } = {}) {
  const s = await getSession(request);
  if (!s) throw json({ error: 'No autorizado' }, 401);
  if (admin && s.role !== 'admin') throw json({ error: 'Solo el administrador puede hacer esto' }, 403);
  if (!equipo && s.role === 'equipo') throw json({ error: 'Tu usuario solo tiene acceso a las tareas' }, 403);
  return s;
}

export async function requireRole(request, opts) {
  return (await requireSession(request, opts)).role;
}
