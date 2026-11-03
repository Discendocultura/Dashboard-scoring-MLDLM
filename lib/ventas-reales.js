// Ventas reales por anuncio (Publicidad): las ventas que guarda AlquimIA (Hotmart, ThriveCart, Skool), cada una con el
// anuncio que trajo a esa persona (atribución propia de lib/origen.js y, si no hay, lo que GHL apuntó del lead al
// registrarse). La pantalla las cruza con el árbol de campañas (public/js/origen.js → ventasEnArbol).
//   · directa: la primera compra de esa persona · indirecta: lo que compra después (upsell, renovación, otro producto)
//   · reembolso: resta (importe negativo)
// Y el gasto de los últimos 7 días, 3 días y hoy por anuncio, para la vista 7-3-1.
import { leerJSON, cacheCompartida } from './store.js';
import { origenesPorEmail, resolverOrigen } from './origen.js';
import { allLeads } from './digest.js';
import { gastoPorAnuncio } from './meta.js';
import { campanasDeEmbudo } from './publicidad.js';
import { dayInMadrid } from '../public/js/scoring.js';

const CLAVES_VENTAS = ['lsd_hotmart_ventas', 'lsd_thrivecart_ventas', 'lsd_skool_miembros'];
const restar = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

export async function todasLasVentas() {
  const datos = await Promise.all(CLAVES_VENTAS.map((k) => leerJSON(k, () => ({ ventas: [] })).catch(() => ({ ventas: [] }))));
  const vistos = new Set();
  const out = [];
  for (const d of datos) for (const v of d?.ventas || []) {
    if (!v || v.prueba || !v.email || vistos.has(v.id) || !['cobro', 'reembolso'].includes(v.tipo)) continue;
    vistos.add(v.id);
    out.push(v);
  }
  return out;
}

// Puro: ventas del periodo [desde, hasta] (días de Madrid) con si son directas o indirectas.
export function ventasDelPeriodo(ventas, desde, hasta) {
  const primera = new Map(); // email → fecha de su primera compra (de siempre)
  for (const v of ventas) if (v.tipo === 'cobro') { const e = v.email.toLowerCase(); if (!primera.has(e) || v.fecha < primera.get(e)) primera.set(e, v.fecha); }
  return ventas.map((v) => ({ v, dia: dayInMadrid(new Date(Number(v.fecha)).toISOString()) }))
    .filter(({ dia }) => dia >= desde && dia <= hasta)
    .map(({ v, dia }) => {
      const email = v.email.toLowerCase();
      const imp = Math.abs(Number(v.importe) || 0);
      return { email, dia, importe: v.tipo === 'reembolso' ? -imp : imp, reembolso: v.tipo === 'reembolso', tipo: v.tipo === 'cobro' && primera.get(email) === v.fecha ? 'directa' : 'indirecta', producto: String(v.producto || '').slice(0, 80) };
    });
}

// Origen del registro según GHL (para el rescate): email → src, de los leads del lanzamiento. Guardado 30 min.
async function srcDeLeads(config, info) {
  const l = info.tipo === 'lanzamientos' && info.code ? config.launches[info.code] : null;
  if (!l?.registroTag) return new Map();
  const pares = await cacheCompartida(`publi-src|${info.code}`, 30 * 60_000, async () => (await allLeads(l.registroTag, []))
    .filter((c) => c.email && c.src && (c.src.campaign || c.src.content || c.src.term)).map((c) => [String(c.email).toLowerCase(), c.src]));
  return new Map(pares);
}

// GET /api/publicidad?parte=ventas → { ventas: [{ dia, importe, tipo, reembolso, toque, fuente }], sinOrigen, total, modelo }
export async function ventasAtribuidas(config, { embudo, code = '', rango, modelo = 'primero', fresh = false }) {
  const info = campanasDeEmbudo(config, embudo, code);
  const hoy = dayInMadrid(new Date().toISOString());
  const desde = [rango.desde, restar(hoy, 6)].sort()[0];
  return cacheCompartida(`publi-ventas|${embudo}|${info.code || ''}|${desde}|${hoy}|${modelo}`, 10 * 60_000, async () => {
    const lista = ventasDelPeriodo(await todasLasVentas(), desde, hoy);
    const emails = [...new Set(lista.map((x) => x.email))];
    const propios = await origenesPorEmail(emails);
    const faltan = emails.filter((e) => !propios.has(e));
    const ghl = faltan.length ? await srcDeLeads(config, info).catch(() => new Map()) : new Map();
    let sinOrigen = 0;
    const ventas = lista.map(({ email, ...x }) => {
      const o = resolverOrigen({ propio: propios.get(email), ghl: ghl.get(email), modelo });
      if (!o) sinOrigen++;
      return { ...x, ...(o ? { toque: o.toque, fuente: o.fuente } : {}) };
    });
    return { ventas, sinOrigen, total: ventas.length, desde, hasta: hoy, modelo };
  }, { fresh });
}

// GET /api/publicidad?parte=731 → gasto por anuncio de los últimos 7 días, 3 días y hoy: { g7: [...], g3: [...], g1: [...] }
export async function gasto731(config, { embudo, code = '', fresh = false }) {
  const info = campanasDeEmbudo(config, embudo, code);
  const hoy = dayInMadrid(new Date().toISOString());
  return cacheCompartida(`publi-731|${info.filtro}|${hoy}`, 15 * 60_000, async () => {
    const [g7, g3, g1] = await Promise.all([6, 2, 0].map((n) => gastoPorAnuncio({ since: restar(hoy, n), until: hoy, filter: info.filtro })));
    return { hoy, g7, g3, g1 };
  }, { fresh });
}
