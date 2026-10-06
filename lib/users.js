// Usuarios del equipo (login con email + contraseña). Se guardan en un "Custom Value" de GHL
// como JSON; la contraseña nunca se guarda: solo su hash PBKDF2 con sal propia.
import { getCustomValue, saveCustomValue, upsertContact, addTags, sendEmail } from './ghl.js';
import { escapeHtml } from './http.js';
import { getRoles } from './roles.js';
import { labelRol } from '../public/js/roles.js';

const NAME = 'lsd_usuarios';
// Los roles (y sus permisos) son configurables: ver lib/roles.js.
export const TEAM_TAG = 'equipo-dashboard';
const ITERATIONS = 100_000; // máximo que admite PBKDF2 en Cloudflare Workers
const enc = new TextEncoder();
let cache = null;

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

async function pbkdf2(password, salt) {
  const k = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, k, 256));
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  return { salt: b64(salt), hash: b64(await pbkdf2(String(password), salt)) };
}

export async function checkPassword(user, password) {
  if (!user?.salt || !user?.hash) return false;
  const got = await pbkdf2(String(password), unb64(user.salt));
  const want = unb64(user.hash);
  let diff = got.length ^ want.length;
  for (let i = 0; i < Math.max(got.length, want.length); i++) diff |= (got[i] ?? 0) ^ (want[i] ?? 0);
  return diff === 0;
}

// Contraseña legible (sin 0/O ni 1/l/I para que no haya confusiones al copiarla).
export function generatePassword(len = 12) {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const out = [];
  for (const b of randomBytes(len * 2)) {
    if (b < 248) out.push(abc[b % abc.length]); // 248 = múltiplo de 62 cercano: sin sesgo apreciable
    if (out.length === len) break;
  }
  return out.join('');
}

// Foto de perfil: data URL de imagen (máx. ~60 KB), guardada aparte en lsd_foto_<id>.
export const FOTO_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/;
export const FOTO_MAX = 60_000;
export const fotoKey = (uid) => `lsd_foto_${uid}`;

export const newId = (prefix = 'u') => prefix + hex(randomBytes(6));
export const normEmail = (e) => String(e || '').trim().toLowerCase();

export async function listUsers({ fresh = false } = {}) {
  if (!fresh && cache && cache.at > Date.now() - 30_000) return cache.value;
  const cv = await getCustomValue(NAME);
  let value = [];
  if (cv?.value) {
    try {
      const parsed = JSON.parse(cv.value);
      if (Array.isArray(parsed)) value = parsed;
    } catch {
      console.error('Usuarios de GHL corruptos, se ignoran');
    }
  }
  cache = { at: Date.now(), value };
  return value;
}

export async function saveUsers(users) {
  await saveCustomValue(NAME, JSON.stringify(users));
  cache = { at: Date.now(), value: users };
}

export async function findUser(id) {
  return (await listUsers()).find((u) => u.id === id) || null;
}

// Lo que se puede enseñar en el navegador (nunca sal ni hash).
export const publicUser = (u) => ({
  id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, activo: u.activo !== false,
  createdAt: u.createdAt || null, lastLogin: u.lastLogin || null, accesoEnviado: u.accesoEnviado || null, foto: u.foto || null, notifVisto: u.notifVisto || null,
});

const firstName = (nombre) => String(nombre || '').trim().split(/\s+/)[0] || '';

// Contacto de GHL del usuario (para mandarle emails). Lo crea si hace falta y le pone la etiqueta del equipo.
export async function ensureContact(user) {
  if (user.contactId) return user.contactId;
  const parts = String(user.nombre || '').trim().split(/\s+/);
  const c = await upsertContact({ email: user.email, firstName: parts[0] || '', lastName: parts.slice(1).join(' '), source: 'Dashboard Lanzamientos MLDLM' });
  if (!c?.id) throw new Error('GHL no ha devuelto el contacto');
  await addTags(c.id, [TEAM_TAG]);
  user.contactId = c.id;
  return c.id;
}

// Plantilla sencilla de email con los colores de la marca.
export function emailLayout(title, bodyHtml, { url, button } = {}) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#3a2a24;line-height:1.5">
  <div style="background:#860d0e;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold">Lanzamientos MLDLM</div>
  <div style="background:#fbf6f1;padding:22px;border:1px solid #e2d3c5;border-top:0;border-radius:0 0 12px 12px">
    <h2 style="margin:0 0 12px;color:#4a2c20;font-size:20px">${escapeHtml(title)}</h2>
    ${bodyHtml}
    ${url ? `<p style="margin:22px 0 4px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#c49b79;color:#3a2a24;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">${escapeHtml(button || 'Abrir el dashboard')}</a></p>` : ''}
  </div>
</div>`;
}

export async function sendAccessEmail(user, password, dashboardUrl, { nuevo = true } = {}) {
  const contactId = await ensureContact(user);
  const body = `<p>Hola ${escapeHtml(firstName(user.nombre))},</p>
    <p>${nuevo ? 'Te hemos dado acceso' : 'Te hemos generado una contraseña nueva para'} el dashboard de lanzamientos de <strong>Me lo dijo la matrona</strong>. Allí verás las tareas que tienes asignadas y podrás marcarlas como hechas.</p>
    <table cellpadding="6" style="border-collapse:collapse;background:#fff;border:1px solid #e2d3c5;border-radius:8px">
      <tr><td>Enlace</td><td><a href="${escapeHtml(dashboardUrl)}">${escapeHtml(dashboardUrl)}</a></td></tr>
      <tr><td>Email</td><td><strong>${escapeHtml(user.email)}</strong></td></tr>
      <tr><td>Contraseña</td><td><strong style="font-family:monospace;font-size:16px">${escapeHtml(password)}</strong></td></tr>
      <tr><td>Rol</td><td>${escapeHtml(labelRol(user.rol, await getRoles()))}</td></tr>
    </table>
    <p style="font-size:13px;color:#7a6458">Puedes cambiar la contraseña desde el propio dashboard (botón «Mi cuenta»). No compartas este email.</p>`;
  await sendEmail(contactId, { subject: nuevo ? 'Tu acceso al dashboard de lanzamientos' : 'Tu nueva contraseña del dashboard', html: emailLayout(nuevo ? 'Tu acceso al dashboard' : 'Nueva contraseña', body, { url: dashboardUrl, button: 'Entrar al dashboard' }) });
}
