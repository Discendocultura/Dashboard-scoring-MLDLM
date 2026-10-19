// Sesión firmada con HMAC (Web Crypto: funciona en Cloudflare y en Node).
import { json, cuerpoLeido } from './http.js';
import { env } from './env.js';
import { findUser } from './users.js';
import { getRoles } from './roles.js';
import { permisosDeRol, ROL_ID_RE, ROL_CLIENTE, ROL_OPERATIVA } from '../public/js/roles.js';
import { clienteActual, setActor } from './cliente.js';
import { contrasenaGeneralActiva } from './seguridad.js';
import { getConfig } from './config-store.js';
import { embudosPermitidos, puedeVerCodigo } from './embudos.js';

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

// «Ver como» (solo superadmin, solo para mirar): una segunda cookie firmada `uid.caducidad.firma` con la persona que
// se está mirando. Mientras está puesta, el dashboard se ve como lo ve esa persona y lib/router.js rechaza cualquier
// cambio (todo lo que no sea consultar). Dura 4 horas como mucho; «Volver a mi cuenta» la borra.
const COOKIE_VC = 'lsd_vercomo';
const TTL_VC = 4 * 3600;
const leerCookies = (request) => Object.fromEntries(
  (request.headers.get('cookie') || '').split(';').map((c) => c.trim().split('=')).filter((p) => p.length >= 2).map(([k, ...v]) => [k, v.join('=')]),
);
export async function verComoCookie(uid) {
  const value = `${uid}.${Math.floor(Date.now() / 1000) + TTL_VC}`;
  return `${COOKIE_VC}=${value}.${await sign(`vc:${value}`)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_VC}`;
}
export const clearVerComo = () => `${COOKIE_VC}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
// uid de la persona que se está mirando (firma y caducidad válidas), o ''.
export async function verComoUid(request) {
  const raw = leerCookies(request)[COOKIE_VC];
  if (!raw) return '';
  const parts = raw.split('.');
  if (parts.length !== 3) return '';
  const [uid, exp, sig] = parts;
  if (!uid || Number(exp) < Date.now() / 1000) return '';
  return safeEqual(sig, await sign(`vc:${uid}.${exp}`)) ? uid : '';
}

// { role, uid, user, permisos, superadmin } o null. Con usuario, el rol es el que tenga AHORA en el
// cliente de la petición (si se desactiva, pierde el acceso). Sin acceso a este cliente: role null.
// `real: true`: la sesión de quien está delante aunque esté usando «Ver como».
export async function getSession(request, { real = false } = {}) {
  let s = await leerSesion(request);
  // Solo un superadmin con su propio usuario puede «ver como»: la sesión pasa a ser la de esa persona, marcada.
  if (!real && s?.superadmin) {
    const vc = await verComoUid(request);
    if (vc && vc !== s.uid) {
      const otra = await sesionDeUsuario(vc);
      if (otra) s = { ...otra, verComo: { por: s.user?.nombre || 'Superadmin' } };
    }
  }
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
    // El ejemplo (solo lectura) también lo puede mirar quien entra con la contraseña general de setter.
    if (clienteActual().ejemplo) return { role: 'admin', uid: '', user: null, permisos: permisosDeRol('admin', []), superadmin: false };
    if (!clienteActual().principal) return { role: null, uid: '', user: null, permisos: [], superadmin: false };
    return { role, uid: '', user: null, permisos: permisosDeRol(role, await getRoles()), superadmin: false };
  }
  return sesionDeUsuario(uid, Number(exp));
}

// La sesión de una persona con usuario (su rol AHORA en el cliente de la petición). `exp`: caducidad de su cookie.
async function sesionDeUsuario(uid, exp = 0) {
  const user = await findUser(uid);
  if (!user || user.activo === false) return null;
  // Sesión abierta antes del último cambio de contraseña: ya no vale.
  if (exp && user.sesionesDesde && exp - TTL_SECONDS < user.sesionesDesde) return null;
  const superadmin = Boolean(user.superadmin);
  // El ejemplo (datos inventados): todos lo ven como admin para mirarlo todo (no se puede guardar nada en él).
  if (clienteActual().ejemplo) return { role: 'admin', uid, user, permisos: permisosDeRol('admin', []), superadmin };
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
// `operativa: true`: también vale el rol «Solo Operativa» (solo su cuenta; la Operativa y los procesos tienen su
// propia comprobación); sin él, ese rol no pasa: ni métricas, ni leads, ni configuración, ni tareas del embudo.
export async function requireSession(request, { admin = false, permiso = null, tecnico = false, cliente = false, operativa = false } = {}) {
  const s = await getSession(request);
  if (!s) throw json({ error: 'No autorizado' }, 401);
  if (!s.role) throw json({ error: `No tienes acceso a «${clienteActual().nombre}»`, sinAcceso: true }, 403);
  if (s.role === ROL_CLIENTE && !cliente) throw json({ error: 'Tu acceso es de solo lectura: solo puedes ver el resumen' }, 403);
  if (s.role === ROL_OPERATIVA && !operativa) throw json({ error: 'Tu acceso es solo a la Operativa y a la Biblioteca de procesos' }, 403);
  if (admin && s.role !== 'admin') throw json({ error: 'Solo el administrador puede hacer esto' }, 403);
  const need = permiso || (tecnico ? 'config' : null);
  if (need && !tienePermiso(s, need)) throw json({ error: 'Tu rol no tiene acceso a esto. Pide a la administradora que te lo active en Equipo → Roles y permisos.' }, 403);
  await comprobarEmbudos(request, s);
  return s;
}

// Embudos asignados (Equipo → «Embudos»): quien solo tiene algunos no puede pedir datos de los demás.
// `s.embudos`: la lista (o null si los ve todos), para que cada handler filtre sus listados.
const CODIGO_PARAMS = ['l', 'launch', 'v', 'e', 'embudo', 'code'];
async function comprobarEmbudos(request, s) {
  s.embudos = embudosPermitidos(s.user, clienteActual().id, s.role);
  if (!s.embudos) return;
  const url = new URL(request.url);
  const codes = CODIGO_PARAMS.map((k) => url.searchParams.get(k));
  if (!['GET', 'HEAD'].includes(request.method)) {
    let body = cuerpoLeido(request);
    if (!body && !request.bodyUsed) { try { body = await request.clone().json(); } catch { body = null; } }
    if (body && typeof body === 'object') codes.push(...CODIGO_PARAMS.map((k) => (typeof body[k] === 'string' ? body[k] : '')));
  }
  const pedidos = codes.filter(Boolean);
  if (!pedidos.length) return;
  const config = await getConfig();
  if (pedidos.some((c) => !puedeVerCodigo(config, c, s.embudos))) throw json({ error: 'Este embudo no lo tienes asignado. Si lo necesitas, pide al admin que te lo active en Equipo.', sinEmbudo: true }, 403);
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
