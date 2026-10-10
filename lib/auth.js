// Sesión firmada con HMAC (Web Crypto: funciona en Cloudflare y en Node).
import { json } from './http.js';
import { env } from './env.js';
import { findUser } from './users.js';
import { getRoles } from './roles.js';
import { permisosDeRol, ROL_ID_RE, ROL_CLIENTE } from '../public/js/roles.js';
import { clienteActual, setActor } from './cliente.js';
import { contrasenaGeneralActiva } from './seguridad.js';

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

export function safeEqual(a, b) {
  const ba = enc.encode(String(a));
  const bb = enc.encode(String(b));
  let diff = ba.length ^ bb.length;
  for (let i = 0; i < Math.max(ba.length, bb.length); i++) diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

// Clave de las tareas programadas (cron-job.org): null si vale; si no, un motivo claro que no revela la clave.
export function fallaClaveTarea(key, clave) {
  // Espacios o saltos de línea colados al pegar, y el «+» que llega como espacio en la URL, no cuentan.
  const c = String(clave || '').trim();
  if (!c) return 'Falta DIGEST_KEY en Cloudflare (o falta «Retry deployment» después de añadirla).';
  if (c.length < 16) return 'La DIGEST_KEY de Cloudflare es demasiado corta: mínimo 16 caracteres.';
  const k = String(key || '').trim();
  if (!k) return 'Falta la clave en la URL: …&key=<tu DIGEST_KEY>.';
  if (/[<>]|%3C|%3E/i.test(k) || /DIGEST_KEY/.test(k)) return 'La URL aún tiene el texto <DIGEST_KEY>: cámbialo por tu clave de Cloudflare, sin los signos < >.';
  if (safeEqual(k, c) || safeEqual(k.replace(/ /g, '+'), c)) return null;
  if (/[^A-Za-z0-9_-]/.test(c)) return 'La clave no coincide. Tu DIGEST_KEY de Cloudflare tiene símbolos (&, #, %, ?, /…) que se rompen en una URL: cámbiala por una de solo letras y números, haz «Retry deployment» y ponla igual en la URL.';
  return 'La clave de la URL no coincide con la DIGEST_KEY de Cloudflare. Revisa que sea idéntica (mayúsculas incluidas) y, si la cambiaste en Cloudflare, haz «Retry deployment».';
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

// { role, uid, user, permisos, superadmin } o null. Con usuario, el rol es el que tenga AHORA en el
// cliente de la petición (si se desactiva, pierde el acceso). Sin acceso a este cliente: role null.
export async function getSession(request) {
  const s = await leerSesion(request);
  // Quién hace la petición: queda en el historial de cambios.
  if (s) setActor(s.user?.nombre || (s.role === 'admin' ? 'Contraseña general (admin)' : s.role === 'setter' ? 'Contraseña general (setter)' : ''));
  return s;
}

async function leerSesion(request) {
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
  // Contraseña general: la de admin es superadmin (todos los clientes); la de setter, solo el principal.
  if (!uid) {
    if (!(await contrasenaGeneralActiva())) return null; // el superadmin la ha desactivado
    if (role === 'admin') return { role, uid: '', user: null, permisos: permisosDeRol(role, []), superadmin: true };
    if (role !== 'setter') return null;
    if (!clienteActual().principal) return { role: null, uid: '', user: null, permisos: [], superadmin: false };
    return { role, uid: '', user: null, permisos: permisosDeRol(role, await getRoles()), superadmin: false };
  }
  const user = await findUser(uid);
  if (!user || user.activo === false) return null;
  // Sesión abierta antes del último cambio de contraseña: ya no vale.
  if (user.sesionesDesde && Number(exp) - TTL_SECONDS < user.sesionesDesde) return null;
  const superadmin = Boolean(user.superadmin);
  if (!user.rol || (!ROL_ID_RE.test(user.rol) && user.rol !== 'admin')) return { role: null, uid, user, permisos: [], superadmin };
  // Rol que ya no existe (se borró): entra solo a Tareas y Calendario.
  return { role: user.rol, uid, user, permisos: permisosDeRol(user.rol, await getRoles()), superadmin };
}

export async function getRole(request) {
  return (await getSession(request))?.role || null;
}

export const tienePermiso = (s, permiso) => s.role === 'admin' || [].concat(permiso).some((p) => s.permisos?.includes(p));

// Lanza una Response 401/403 si no hay sesión válida. Sin opciones basta con haber entrado
// (Tareas y Calendario son de todos). `permiso`: uno o varios (vale cualquiera); `admin`: solo admin.
// `tecnico: true` (antiguo) equivale a permiso «config».
// `cliente: true`: también vale el rol «Cliente» (solo lectura); sin él, ese rol no pasa (no ve tareas,
// calendario, leads… solo su resumen y su cuenta).
export async function requireSession(request, { admin = false, permiso = null, tecnico = false, cliente = false } = {}) {
  const s = await getSession(request);
  if (!s) throw json({ error: 'No autorizado' }, 401);
  if (!s.role) throw json({ error: `No tienes acceso a «${clienteActual().nombre}»`, sinAcceso: true }, 403);
  if (s.role === ROL_CLIENTE && !cliente) throw json({ error: 'Tu acceso es de solo lectura: solo puedes ver el resumen' }, 403);
  if (admin && s.role !== 'admin') throw json({ error: 'Solo el administrador puede hacer esto' }, 403);
  const need = permiso || (tecnico ? 'config' : null);
  if (need && !tienePermiso(s, need)) throw json({ error: 'Tu rol no tiene acceso a esto. Pide a la administradora que te lo active en Equipo → Roles y permisos.' }, 403);
  return s;
}

// Solo superadmin (gestión de clientes y accesos a varios clientes).
export async function requireSuperadmin(request) {
  const s = await getSession(request);
  if (!s) throw json({ error: 'No autorizado' }, 401);
  if (!s.superadmin) throw json({ error: 'Solo el superadmin puede hacer esto' }, 403);
  return s;
}

export async function requireRole(request, opts) {
  return (await requireSession(request, opts)).role;
}
