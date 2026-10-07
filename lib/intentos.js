// Bloqueo por intentos fallidos de entrar (contraseña o código de verificación).
// Con D1 se cuenta en la tabla «intentos» (lo comparten todos los servidores de Cloudflare);
// sin D1, en memoria de cada servidor (protege menos, pero algo).
import { db, esquema } from './store.js';

export const MAX_FALLOS = 5; // por email (o por usuario en el código de verificación)
export const MAX_FALLOS_IP = 20; // por conexión, sume los emails que sume
export const VENTANA_MS = 15 * 60_000; // los fallos cuentan durante 15 min…
export const BLOQUEO_MS = 15 * 60_000; // …y al pasarse, 15 min sin poder intentarlo

const memoria = new Map();
const limiteDe = (clave) => (clave.startsWith('ip:') ? MAX_FALLOS_IP : MAX_FALLOS);

async function leer(clave) {
  const d = db();
  if (!d) return memoria.get(clave) || null;
  await esquema(d);
  return d.prepare('SELECT n, desde, bloqueo FROM intentos WHERE clave = ?').bind(clave).first();
}
async function escribir(clave, fila) {
  const d = db();
  if (!d) {
    if (fila) memoria.set(clave, fila); else memoria.delete(clave);
    if (memoria.size > 5000) memoria.delete(memoria.keys().next().value);
    return;
  }
  if (!fila) await d.prepare('DELETE FROM intentos WHERE clave = ?').bind(clave).run();
  else await d.prepare('INSERT INTO intentos (clave, n, desde, bloqueo) VALUES (?, ?, ?, ?) ON CONFLICT (clave) DO UPDATE SET n = excluded.n, desde = excluded.desde, bloqueo = excluded.bloqueo')
    .bind(clave, fila.n, fila.desde, fila.bloqueo).run();
}

// Segundos que faltan de bloqueo (0 = puede intentarlo).
export async function bloqueado(claves, ahora = Date.now()) {
  let max = 0;
  for (const c of claves.filter(Boolean)) {
    const f = await leer(c);
    if (f?.bloqueo > ahora) max = Math.max(max, Math.ceil((f.bloqueo - ahora) / 1000));
  }
  return max;
}

export async function fallo(claves, ahora = Date.now()) {
  for (const c of claves.filter(Boolean)) {
    const f = await leer(c);
    const vigente = f && ahora - f.desde < VENTANA_MS && !(f.bloqueo && f.bloqueo <= ahora);
    const n = vigente ? f.n + 1 : 1;
    await escribir(c, { n, desde: vigente ? f.desde : ahora, bloqueo: n >= limiteDe(c) ? ahora + BLOQUEO_MS : 0 });
  }
}

// Al entrar bien se olvidan los fallos de ese email/usuario (los de la IP siguen contando).
export async function acierto(claves) {
  for (const c of claves.filter((x) => x && !x.startsWith('ip:'))) await escribir(c, null);
}

export const ipDe = (request) => request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '';

export const mensajeBloqueo = (seg) => `Demasiados intentos fallidos. Espera ${Math.max(1, Math.ceil(seg / 60))} min y vuelve a probar (o pide a un admin que te cambie la contraseña).`;
