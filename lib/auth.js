// Sesión firmada con HMAC (Web Crypto: funciona en Cloudflare y en Node).
import { json } from './http.js';
import { env } from './env.js';

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
export function roleForPassword(password) {
  const pw = String(password || '').trim();
  if (!pw) return null;
  const admin = (env.ADMIN_PASSWORD || '').trim();
  const setter = (env.SETTER_PASSWORD || '').trim();
  if (admin && safeEqual(pw, admin)) return 'admin';
  if (setter && safeEqual(pw, setter)) return 'setter';
  return null;
}

export async function sessionCookie(role) {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const value = `${role}.${exp}`;
  return `${COOKIE}=${value}.${await sign(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_SECONDS}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function getRole(request) {
  const cookies = Object.fromEntries(
    (request.headers.get('cookie') || '').split(';').map((c) => c.trim().split('=')).filter((p) => p.length >= 2).map(([k, ...v]) => [k, v.join('=')]),
  );
  const raw = cookies[COOKIE];
  if (!raw) return null;
  const [role, exp, sig] = raw.split('.');
  if (!role || !exp || !sig) return null;
  if (!safeEqual(sig, await sign(`${role}.${exp}`))) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return role === 'admin' || role === 'setter' ? role : null;
}

// Lanza una Response 401/403 si no hay sesión válida (o si se exige admin).
export async function requireRole(request, { admin = false } = {}) {
  const role = await getRole(request);
  if (!role) throw json({ error: 'No autorizado' }, 401);
  if (admin && role !== 'admin') throw json({ error: 'Solo el administrador puede hacer esto' }, 403);
  return role;
}
