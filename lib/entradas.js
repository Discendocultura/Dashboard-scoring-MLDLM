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

// ---------- Pantalla de espera (panel «En directo») ----------
const esperaMem = new Map();
export async function marcarEspera(code, k, cid) {
  const d = db();
  if (!d) { const key = claveMem(code, k, cid); if (!esperaMem.has(key)) esperaMem.set(key, Date.now()); return; }
  await esquema(d);
  await d.prepare('INSERT OR IGNORE INTO espera_directo (cliente, lanzamiento, video, contacto, en) VALUES (?, ?, ?, ?, ?)')
    .bind(clienteActual().id, code, k, cid, Date.now()).run();
}

// Recuentos para el panel «En directo» (solo D1: no cuesta llamadas a GHL ni a Zoom).
// porMinuto: entradas al directo de los últimos 60 minutos, minuto a minuto (para la gráfica).
export async function resumenDirecto(code, k, ahora = Date.now()) {
  const desde = ahora - 60 * 60_000;
  const d = db();
  if (!d) {
    const pre = `${clienteActual().id}|${code}|${k}|`;
    const filas = [...enMemoria].filter(([key]) => key.startsWith(pre)).map(([, e]) => e);
    return {
      esperando: [...esperaMem.keys()].filter((key) => key.startsWith(pre)).length,
      inscritas: filas.filter((e) => e.join_url).length,
      entraron: filas.filter((e) => e.click_en).length,
      entradas: filas.filter((e) => e.click_en >= desde).map((e) => e.click_en),
    };
  }
  await esquema(d);
  const id = clienteActual().id;
  const [esp, ent, ult] = await Promise.all([
    d.prepare('SELECT COUNT(*) AS n FROM espera_directo WHERE cliente = ? AND lanzamiento = ? AND video = ?').bind(id, code, k).all(),
    d.prepare('SELECT SUM(join_url IS NOT NULL) AS inscritas, SUM(click_en IS NOT NULL) AS entraron FROM entradas_directo WHERE cliente = ? AND lanzamiento = ? AND video = ?').bind(id, code, k).all(),
    d.prepare('SELECT click_en FROM entradas_directo WHERE cliente = ? AND lanzamiento = ? AND video = ? AND click_en >= ?').bind(id, code, k, desde).all(),
  ]);
  return {
    esperando: esp.results?.[0]?.n || 0,
    inscritas: ent.results?.[0]?.inscritas || 0,
    entraron: ent.results?.[0]?.entraron || 0,
    entradas: (ult.results || []).map((r) => r.click_en),
  };
}

// ---------- Visitas a la página de venta ----------
const visitasMem = new Map();
// `pagina`: «venta» (página de venta) o «pago» (página de pago intermedia: pulsó «Quiero inscribirme», es
// decir, inició el pago). Cada una en su tabla.
const TABLA_VISITAS = { venta: 'visitas_venta', pago: 'visitas_pago' };
export async function marcarVisita(code, cid, ahora = Date.now(), pagina = 'venta') {
  const t = TABLA_VISITAS[pagina] || TABLA_VISITAS.venta;
  const d = db();
  if (!d) {
    const key = `${t}|${clienteActual().id}|${code}|${cid}`;
    const v = visitasMem.get(key);
    const n = v ? { ...v, ultima: ahora, veces: v.veces + 1 } : { primera: ahora, ultima: ahora, veces: 1 };
    visitasMem.set(key, n);
    return n.veces;
  }
  await esquema(d);
  // Devuelve cuántas veces la ha visitado (1 = la primera).
  const r = await d.prepare(`INSERT INTO ${t} (cliente, lanzamiento, contacto, primera, ultima, veces) VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT (cliente, lanzamiento, contacto) DO UPDATE SET ultima = excluded.ultima, veces = ${t}.veces + 1 RETURNING veces`)
    .bind(clienteActual().id, code, cid, ahora, ahora).first();
  return r?.veces ?? 1;
}

// { contacto → { primera, ultima, veces } } de un lanzamiento.
export async function visitasDe(code, pagina = 'venta') {
  const t = TABLA_VISITAS[pagina] || TABLA_VISITAS.venta;
  const d = db();
  if (!d) {
    const pre = `${t}|${clienteActual().id}|${code}|`;
    return Object.fromEntries([...visitasMem].filter(([key]) => key.startsWith(pre)).map(([key, v]) => [key.slice(pre.length), v]));
  }
  await esquema(d);
  const { results } = await d.prepare(`SELECT contacto, primera, ultima, veces FROM ${t} WHERE cliente = ? AND lanzamiento = ? ORDER BY ultima DESC LIMIT 20000`)
    .bind(clienteActual().id, code).all();
  return Object.fromEntries((results || []).map((r) => [r.contacto, { primera: r.primera, ultima: r.ultima, veces: r.veces }]));
}
