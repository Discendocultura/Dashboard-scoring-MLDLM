// Origen de una persona (atribución propia, lib/origen.js): un «toque» es una visita con datos de anuncio.
//   { source, medium, campaign, term, content, campaignId, adsetId, adId, fbclid, url, en }
// tracker.js lo saca de la URL: utm_source, utm_medium, utm_campaign, utm_term, utm_content y, mejor aún, los id de Meta
// (campaign_id, adset_id, ad_id), que no cambian aunque se renombre el anuncio. Parámetros recomendados en los anuncios:
export const PARAMS_ANUNCIO = 'utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}';

const txt = (v, n = 150) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, n) : '');
const id = (v) => (/^\d{5,30}$/.test(String(v ?? '').trim()) ? String(v).trim() : '');
const plantilla = (v) => /\{\{.*\}\}/.test(String(v || '')); // «{{ad.id}}» sin sustituir: no vale

export function limpiarToque(t) {
  if (!t || typeof t !== 'object') return null;
  const o = {
    source: txt(t.source), medium: txt(t.medium), campaign: txt(t.campaign), term: txt(t.term), content: txt(t.content),
    campaignId: id(t.campaignId), adsetId: id(t.adsetId), adId: id(t.adId), fbclid: txt(t.fbclid, 300), url: txt(t.url, 300),
    en: Number.isFinite(Number(t.en)) ? Number(t.en) : 0,
  };
  for (const k of Object.keys(o)) if (typeof o[k] === 'string' && plantilla(o[k])) o[k] = '';
  // Los id de Meta también pueden venir en las UTM (p. ej. utm_content={{ad.id}}).
  if (!o.adId && id(o.content)) o.adId = o.content;
  if (!o.adsetId && id(o.term)) o.adsetId = o.term;
  if (!o.campaignId && id(o.campaign)) o.campaignId = o.campaign;
  const util = o.campaign || o.content || o.term || o.adId || o.adsetId || o.campaignId || o.fbclid || o.source;
  if (!util) return null;
  for (const k of Object.keys(o)) if (o[k] === '' ) delete o[k];
  return o;
}

// ¿Este toque es de Meta (de pago)? Las orgánicas (instagram bio, email…) no se asignan a anuncios.
export const esDeMeta = (t) => Boolean(t && (t.adId || t.adsetId || t.campaignId || t.fbclid || /^(fb|facebook|meta|ig|instagram)/i.test(t.source || '') && /paid|cpc|ads?|pago/i.test(t.medium || '')));

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
// A qué fila de Meta (campaña, conjunto o anuncio) pertenece un toque: primero por id; si no, por nombre.
//   fila: { id, name } · nivel: 'campaign' | 'adset' | 'ad'
export function coincide(t, fila, nivel) {
  if (!t || !fila) return false;
  const tid = nivel === 'ad' ? t.adId : nivel === 'adset' ? t.adsetId : t.campaignId;
  if (tid) return String(fila.id) === tid;
  const tn = nivel === 'ad' ? t.content : nivel === 'adset' ? t.term : t.campaign;
  return Boolean(tn) && norm(fila.name) === norm(tn);
}

// ---- Ventas reales en el árbol de Publicidad (campañas → conjuntos → anuncios) ----
// Índices del árbol por id y por nombre, para encontrar la ruta (campaña, conjunto, anuncio) de un toque.
function indice(campanas = []) {
  const ix = { ad: new Map(), adset: new Map(), campaign: new Map(), nAd: new Map(), nAdset: new Map(), nCampaign: new Map() };
  for (const c of campanas) {
    ix.campaign.set(String(c.id), [c]); ix.nCampaign.set(norm(c.nombre), [c]);
    for (const s of c.hijos || []) {
      ix.adset.set(String(s.id), [c, s]); ix.nAdset.set(norm(s.nombre), [c, s]);
      for (const a of s.hijos || []) { ix.ad.set(String(a.id), [c, s, a]); ix.nAd.set(norm(a.nombre), [c, s, a]); }
    }
  }
  return ix;
}
// La ruta más concreta que se pueda: anuncio (por id o nombre) → conjunto → campaña. [] si no es de este embudo.
export function rutaDe(t, ix) {
  if (!t || !esDeMeta(t) && !t.campaign) return [];
  return (t.adId && ix.ad.get(t.adId)) || (t.content && ix.nAd.get(norm(t.content)))
    || (t.adsetId && ix.adset.get(t.adsetId)) || (t.term && ix.nAdset.get(norm(t.term)))
    || (t.campaignId && ix.campaign.get(t.campaignId)) || (t.campaign && ix.nCampaign.get(norm(t.campaign))) || [];
}

const real0 = () => ({ ventas: 0, directos: 0, indirectos: 0, ingresos: 0, reembolsos: 0 });
// Pone en cada nodo `real` = { ventas (primeras compras), directos €, indirectos €, ingresos €, reembolsos €, roas, cpa }
// con las ventas del periodo [desde, hasta]. Devuelve el resumen: atribuidas, de otros embudos y sin origen.
export function ventasEnArbol(arbol, ventas = [], { desde = '', hasta = '9999' } = {}) {
  const campanas = arbol?.campanas || [];
  const todos = [];
  const recorrer = (n) => { n.real = real0(); todos.push(n); (n.hijos || []).forEach(recorrer); };
  campanas.forEach(recorrer);
  const total = real0();
  const ix = indice(campanas);
  let atribuidas = 0; let otras = 0; let sinOrigen = 0;
  for (const v of ventas) {
    if (v.dia < desde || v.dia > hasta) continue;
    if (!v.toque) { sinOrigen++; continue; }
    const ruta = rutaDe(v.toque, ix);
    if (!ruta.length) { otras++; continue; }
    atribuidas++;
    for (const r of [...ruta.map((n) => n.real), total]) {
      if (v.reembolso) { r.reembolsos += -v.importe; r.ingresos += v.importe; continue; }
      r.ingresos += v.importe;
      if (v.tipo === 'directa') { r.ventas++; r.directos += v.importe; } else r.indirectos += v.importe;
    }
  }
  const cerrar = (r, gasto) => Object.assign(r, { roas: gasto ? r.ingresos / gasto : null, cpa: r.ventas ? gasto / r.ventas : null });
  for (const n of todos) cerrar(n.real, n.m?.gasto || 0);
  if (arbol?.total) arbol.totalReal = cerrar(total, arbol.total.gasto || 0);
  return { atribuidas, otras, sinOrigen, total };
}

// Vista 7-3-1: ROAS real de los últimos 7 días, 3 días y hoy por campaña, conjunto y anuncio.
//   gasto: { hoy, g7, g3, g1 } (filas por anuncio: campaign_id, adset_id, ad_id, spend) · ventas: las de ventasAtribuidas
// → Map id → { r7, r3, r1, g7, g3, g1, i7, i3, i1 } (r = ROAS; null sin gasto)
export function vista731(arbol, gasto, ventas = []) {
  const out = new Map();
  if (!gasto?.hoy) return out;
  const ix = indice(arbol?.campanas || []);
  const resta = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  const vent = { 7: resta(gasto.hoy, 6), 3: resta(gasto.hoy, 2), 1: gasto.hoy };
  const sum = (id, k, v) => { const o = out.get(id) || { g7: 0, g3: 0, g1: 0, i7: 0, i3: 0, i1: 0 }; o[k] += v; out.set(id, o); };
  for (const [k, filas] of [['g7', gasto.g7], ['g3', gasto.g3], ['g1', gasto.g1]]) {
    for (const f of filas || []) for (const id of [f.campaign_id, f.adset_id, f.ad_id]) if (id) sum(String(id), k, Number(f.spend) || 0);
  }
  for (const v of ventas) {
    if (!v.toque) continue;
    const ruta = rutaDe(v.toque, ix);
    for (const n of [7, 3, 1]) if (v.dia >= vent[n] && v.dia <= gasto.hoy) for (const nodo of ruta) sum(String(nodo.id), `i${n}`, v.importe);
  }
  for (const o of out.values()) for (const n of [7, 3, 1]) o[`r${n}`] = o[`g${n}`] ? o[`i${n}`] / o[`g${n}`] : null;
  return out;
}
