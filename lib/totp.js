// Verificación en dos pasos (TOTP, RFC 6238): la de Google Authenticator, Authy, 1Password…
// El secreto se guarda cifrado (AES-GCM con una clave derivada de SESSION_SECRET) y los códigos
// de recuperación, solo como hash.
import { env } from './env.js';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PASO = 30;
const enc = new TextEncoder();

export function base32(bytes) {
  let bits = 0;
  let val = 0;
  let out = '';
  for (const b of bytes) {
    val = (val << 8) | b;
    bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
export function deBase32(s) {
  const limpio = String(s).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let val = 0;
  const out = [];
  for (const ch of limpio) {
    val = (val << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

export const nuevoSecreto = () => base32(crypto.getRandomValues(new Uint8Array(20)));

export async function codigoTotp(secreto, paso) {
  const k = await crypto.subtle.importKey('raw', deBase32(secreto), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setUint32(4, paso >>> 0);
  new DataView(msg.buffer).setUint32(0, Math.floor(paso / 2 ** 32));
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', k, msg));
  const o = h[19] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

// Paso (ventana de 30 s) del código si es válido (acepta ±1 por relojes desajustados), o null.
// `ultimo`: el último paso ya usado (un mismo código no vale dos veces).
export async function verificarTotp(secreto, codigo, { ultimo = -1, ahora = Date.now() } = {}) {
  const c = String(codigo || '').replace(/\D/g, '');
  if (c.length !== 6) return null;
  const actual = Math.floor(ahora / 1000 / PASO);
  for (const p of [actual, actual - 1, actual + 1]) {
    if (p > ultimo && (await codigoTotp(secreto, p)) === c) return p;
  }
  return null;
}

export const uriTotp = (secreto, cuenta, emisor = 'Dashboard') =>
  `otpauth://totp/${encodeURIComponent(`${emisor}:${cuenta}`)}?secret=${secreto}&issuer=${encodeURIComponent(emisor)}&digits=6&period=${PASO}`;

// ---- Cifrado del secreto ----
let claveCache = null;
async function clave() {
  const s = env.SESSION_SECRET || '';
  if (s.length < 16) throw new Error('Falta SESSION_SECRET');
  if (claveCache?.s !== s) {
    const h = await crypto.subtle.digest('SHA-256', enc.encode(`totp:${s}`));
    claveCache = { s, k: await crypto.subtle.importKey('raw', h, 'AES-GCM', false, ['encrypt', 'decrypt']) };
  }
  return claveCache.k;
}
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function cifrar(texto) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await clave(), enc.encode(texto)));
  return `${b64(iv)}.${b64(ct)}`;
}
export async function descifrar(cifrado) {
  const [iv, ct] = String(cifrado || '').split('.');
  if (!iv || !ct) return null;
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv) }, await clave(), deB64(ct)));
  } catch {
    return null; // p. ej. si se cambió SESSION_SECRET: habrá que volver a activar la verificación
  }
}

// ---- Códigos de recuperación (por si se pierde el móvil): 10 de un solo uso ----
const hashHex = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const normCodigo = (c) => String(c || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function nuevosCodigosRecuperacion(n = 10) {
  return Array.from({ length: n }, () => {
    const s = base32(crypto.getRandomValues(new Uint8Array(5))).toLowerCase(); // 8 caracteres
    return `${s.slice(0, 4)}-${s.slice(4, 8)}`;
  });
}
export const hashRecuperacion = (c) => hashHex(`rec:${normCodigo(c)}`);
// Devuelve la lista de hashes sin el usado, o null si el código no vale.
export async function usarRecuperacion(hashes, codigo) {
  if (normCodigo(codigo).length !== 8) return null;
  const h = await hashRecuperacion(codigo);
  return (hashes || []).includes(h) ? hashes.filter((x) => x !== h) : null;
}
