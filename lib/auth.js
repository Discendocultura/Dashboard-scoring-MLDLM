import { createHmac, timingSafeEqual } from 'node:crypto';
import { json } from './http.js';

const COOKIE = 'lsd_session';
const TTL_SECONDS = 7 * 24 * 3600;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('Falta SESSION_SECRET (mínimo 16 caracteres) en las variables de entorno');
  return s;
}

const sign = (value) => createHmac('sha256', secret()).update(value).digest('base64url');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function roleForPassword(password) {
  if (!password) return null;
  if (process.env.ADMIN_PASSWORD && safeEqual(password, process.env.ADMIN_PASSWORD)) return 'admin';
  if (process.env.SETTER_PASSWORD && safeEqual(password, process.env.SETTER_PASSWORD)) return 'setter';
  return null;
}

export function sessionCookie(role) {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const value = `${role}.${exp}`;
  return `${COOKIE}=${value}.${sign(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_SECONDS}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function getRole(request) {
  const cookies = Object.fromEntries(
    (request.headers.get('cookie') || '').split(';').map((c) => c.trim().split('=')).filter((p) => p.length >= 2).map(([k, ...v]) => [k, v.join('=')]),
  );
  const raw = cookies[COOKIE];
  if (!raw) return null;
  const [role, exp, sig] = raw.split('.');
  if (!role || !exp || !sig) return null;
  if (!safeEqual(sig, sign(`${role}.${exp}`))) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return role === 'admin' || role === 'setter' ? role : null;
}

// Lanza una Response 401/403 si no hay sesión válida (o si se exige admin).
export function requireRole(request, { admin = false } = {}) {
  const role = getRole(request);
  if (!role) throw json({ error: 'No autorizado' }, 401);
  if (admin && role !== 'admin') throw json({ error: 'Solo el administrador puede hacer esto' }, 403);
  return role;
}
