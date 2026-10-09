// Entradas al directo: el enlace personal de Zoom de cada lead (se la inscribe mientras espera en la
// pantalla de espera, repartido en el tiempo) y si llegó a entrar. Así, a la hora exacta, entrar no
// cuesta ninguna llamada a GHL ni a Zoom, y la marca «pulsó el enlace» (<código>_directo_click) se
// pasa a GHL después, al sincronizar Zoom en el dashboard. Con D1, en la tabla entradas_directo;
// sin D1 (desarrollo local), en memoria.
import { db, esquema } from './store.js';
import { clienteActual } from './cliente.js';

const enMemoria = new Map();
const claveMem = (code, k, cid) => `${clienteActual().id}|${code}|${k}|${cid}`;

export async function entradaDe(code, k, cid) {
  const d = db();
  if (!d) return enMemoria.get(claveMem(code, k, cid)) || null;
  await esquema(d);
  return (await d.prepare('SELECT join_url, registrado_en, click_en FROM entradas_directo WHERE cliente = ? AND lanzamiento = ? AND video = ? AND contacto = ?')
    .bind(clienteActual().id, code, k, cid).first()) || null;
}

export async function guardarInscripcion(code, k, cid, joinUrl) {
  const d = db();
  if (!d) { enMemoria.set(claveMem(code, k, cid), { ...(enMemoria.get(claveMem(code, k, cid)) || {}), join_url: joinUrl, registrado_en: Date.now() }); return; }
  await esquema(d);
  await d.prepare('INSERT INTO entradas_directo (cliente, lanzamiento, video, contacto, join_url, registrado_en) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (cliente, lanzamiento, video, contacto) DO UPDATE SET join_url = excluded.join_url, registrado_en = excluded.registrado_en')
    .bind(clienteActual().id, code, k, cid, joinUrl, Date.now()).run();
}

export async function marcarEntrada(code, k, cid) {
  const d = db();
  if (!d) { const e = enMemoria.get(claveMem(code, k, cid)) || {}; if (!e.click_en) enMemoria.set(claveMem(code, k, cid), { ...e, click_en: Date.now() }); return; }
  await esquema(d);
  await d.prepare('INSERT INTO entradas_directo (cliente, lanzamiento, video, contacto, click_en) VALUES (?, ?, ?, ?, ?) ON CONFLICT (cliente, lanzamiento, video, contacto) DO UPDATE SET click_en = COALESCE(entradas_directo.click_en, excluded.click_en)')
    .bind(clienteActual().id, code, k, cid, Date.now()).run();
}

// Contactos que entraron (o pulsaron el enlace) al directo k de un lanzamiento.
export async function entraronAlDirecto(code, k) {
  const d = db();
  if (!d) {
    const pre = `${clienteActual().id}|${code}|${k}|`;
    return [...enMemoria].filter(([key, e]) => key.startsWith(pre) && e.click_en).map(([key]) => key.slice(pre.length));
  }
  await esquema(d);
  const { results } = await d.prepare('SELECT contacto FROM entradas_directo WHERE cliente = ? AND lanzamiento = ? AND video = ? AND click_en IS NOT NULL')
    .bind(clienteActual().id, code, k).all();
  return (results || []).map((r) => r.contacto);
}
