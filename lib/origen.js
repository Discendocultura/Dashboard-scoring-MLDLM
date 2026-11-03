// Atribución propia: de qué campaña, conjunto y anuncio viene cada persona, con lo que capta tracker.js en su primera
// y su última visita (UTM y los id de Meta de la URL del anuncio), aunque luego compre semanas después o por WhatsApp.
//   · Con D1, en la tabla `origenes` (una fila por persona: por email si se sabe, si no por el id del contacto de GHL).
//   · «Rescate de origen» (resolverOrigen): para una venta, primero lo captado por el tracker (por email o id) y, si no
//     hay, lo que GHL apuntó del contacto al registrarse (sus UTM). Así una venta sin clic se asigna a su anuncio.
// El toque (formato de public/js/origen.js): { source, medium, campaign, term, content, campaignId, adsetId, adId, fbclid, url, en }.
import { db, esquema } from './store.js';
import { clienteActual } from './cliente.js';
import { limpiarToque } from '../public/js/origen.js';

export { limpiarToque };

const enMemoria = new Map(); // sin D1 (desarrollo local y pruebas)
const claveDe = ({ email, cid }) => (email ? `e:${email}` : cid ? `c:${cid}` : '');
const normEmail = (e) => (typeof e === 'string' && /.+@.+\..+/.test(e) ? e.trim().toLowerCase().slice(0, 200) : '');
const normCid = (c) => (typeof c === 'string' && /^[A-Za-z0-9]{6,40}$/.test(c) ? c : '');

// Guarda (o completa) el origen de una persona. El primer toque no se pisa nunca; el último, si es más reciente.
export async function guardarOrigen({ email, cid, primero, ultimo }) {
  const em = normEmail(email);
  const id = normCid(cid);
  const clave = claveDe({ email: em, cid: id });
  const p = limpiarToque(primero);
  const u = limpiarToque(ultimo) || p;
  if (!clave || !p) return false;
  const d = db();
  if (!d) {
    const prev = enMemoria.get(`${clienteActual().id}|${clave}`);
    enMemoria.set(`${clienteActual().id}|${clave}`, {
      email: em || prev?.email || '', cid: id || prev?.cid || '',
      primero: prev?.primero && prev.primero.en <= p.en ? prev.primero : p,
      ultimo: prev?.ultimo && prev.ultimo.en > u.en ? prev.ultimo : u, en: Date.now(),
    });
    return true;
  }
  await esquema(d);
  const prev = await d.prepare('SELECT primero, ultimo FROM origenes WHERE cliente = ? AND clave = ?').bind(clienteActual().id, clave).first();
  const pp = prev ? JSON.parse(prev.primero) : null;
  const pu = prev ? JSON.parse(prev.ultimo) : null;
  const primeroF = pp && pp.en <= p.en ? pp : p;
  const ultimoF = pu && pu.en > u.en ? pu : u;
  await d.prepare('INSERT INTO origenes (cliente, clave, email, cid, primero, ultimo, en) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (cliente, clave) DO UPDATE SET email = CASE WHEN excluded.email != \'\' THEN excluded.email ELSE origenes.email END, cid = CASE WHEN excluded.cid != \'\' THEN excluded.cid ELSE origenes.cid END, primero = excluded.primero, ultimo = excluded.ultimo, en = excluded.en')
    .bind(clienteActual().id, clave, em, id, JSON.stringify(primeroF), JSON.stringify(ultimoF), Date.now()).run();
  return true;
}

// Orígenes de muchas personas de golpe (por email): Map email → { primero, ultimo }. En tandas, para no pasarse.
export async function origenesPorEmail(emails = []) {
  const lista = [...new Set(emails.map(normEmail).filter(Boolean))];
  const out = new Map();
  if (!lista.length) return out;
  const d = db();
  if (!d) {
    for (const v of enMemoria.values()) if (v.email && lista.includes(v.email)) out.set(v.email, { primero: v.primero, ultimo: v.ultimo });
    return out;
  }
  await esquema(d);
  for (let i = 0; i < lista.length; i += 90) {
    const parte = lista.slice(i, i + 90);
    const r = await d.prepare(`SELECT email, primero, ultimo FROM origenes WHERE cliente = ? AND email IN (${parte.map(() => '?').join(',')})`).bind(clienteActual().id, ...parte).all();
    for (const f of r.results || []) out.set(f.email, { primero: JSON.parse(f.primero), ultimo: JSON.parse(f.ultimo) });
  }
  return out;
}

// Rescate de origen de una persona (puro): lo del tracker y, si no hay, la atribución de GHL del lead.
//   propio: { primero, ultimo } | undefined · ghl: { source, medium, campaign, term, content } | undefined
//   modelo: 'primero' (por defecto: en lanzamientos el anuncio que trajo el registro) | 'ultimo'
// → { toque, fuente: 'tracker' | 'ghl' } | null
export function resolverOrigen({ propio, ghl, modelo = 'primero' } = {}) {
  const t = propio?.[modelo] || propio?.primero || propio?.ultimo;
  if (t) return { toque: t, fuente: 'tracker' };
  const g = limpiarToque(ghl ? { ...ghl, en: 0 } : null);
  return g ? { toque: g, fuente: 'ghl' } : null;
}

// Cuántas personas tienen origen (Conexiones → Atribución): { personas, conAnuncio, ultimos7 }.
export async function resumenOrigenes(ahora = Date.now()) {
  const d = db();
  const hace7 = ahora - 7 * 86_400_000;
  if (!d) {
    const mias = [...enMemoria.entries()].filter(([k]) => k.startsWith(`${clienteActual().id}|`)).map(([, v]) => v);
    return { personas: mias.length, conAnuncio: mias.filter((v) => v.primero?.adId || v.ultimo?.adId).length, ultimos7: mias.filter((v) => v.en >= hace7).length };
  }
  await esquema(d);
  const r = await d.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN primero LIKE '%\"adId\"%' OR ultimo LIKE '%\"adId\"%' THEN 1 ELSE 0 END) AS ad, SUM(CASE WHEN en >= ? THEN 1 ELSE 0 END) AS u7 FROM origenes WHERE cliente = ?").bind(hace7, clienteActual().id).first();
  return { personas: Number(r?.n) || 0, conAnuncio: Number(r?.ad) || 0, ultimos7: Number(r?.u7) || 0 };
}
