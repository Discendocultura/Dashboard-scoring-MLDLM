// Gasto total en publicidad (Meta) de un periodo, desglosado por embudo: para la tarjeta del Inicio.
// Una sola consulta a Meta con todas las campañas del periodo; cada campaña va al embudo cuyo filtro
// (parte del nombre de la campaña: el de cada lanzamiento, VSL, venta directa o meteórico) encaja.
// Si encajan varios, gana el filtro más largo (el más concreto): así una campaña no se cuenta dos veces.
import { getConfig } from './config-store.js';
import { configDeEmbudos } from './embudos.js';
import { adSpend, metaConfigured } from './meta.js';
import { dayInMadrid } from '../public/js/scoring.js';
import { rangoDe } from '../public/js/embudo-vsl.js';

export const PERIODOS_GASTO = ['mes-pasado', 'mes-actual', '7d', 'personalizado'];
const esDia = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const ICONO = { lanzamientos: '🚀', vsl: '🎬', directa: '🛒', meteoricos: '⚡' };

// Los grupos (embudos) con sus filtros. Filtro vacío = «todas las campañas» (una VSL sin filtro): solo se le dan
// las campañas que no encajan en ningún otro embudo.
export function gruposDeGasto(config) {
  const primerLanz = config.embudos.find((e) => e.tipo === 'lanzamientos')?.id;
  const grupos = [];
  for (const e of config.embudos) {
    const filtros = [];
    if (e.tipo === 'lanzamientos') {
      for (const [code, l] of Object.entries(config.launches || {})) if ((l.embudo || primerLanz) === e.id) filtros.push(l.metaFiltro || code);
    } else if (e.tipo === 'vsl' && config.vsls?.[e.id]) filtros.push(config.vsls[e.id].metaFiltro || '');
    else if (e.tipo === 'directa' && config.directas?.[e.id]) filtros.push(config.directas[e.id].metaFiltro || e.id);
    else continue;
    grupos.push({ id: e.id, nombre: e.nombre, tipo: e.tipo, filtros });
  }
  // Meteóricos (los que buscan sus campañas en Meta): con su embudo si lo tiene; si no, juntos.
  for (const [code, m] of Object.entries(config.meteoricos || {})) {
    if (!(m.metaFiltro || m.calentamiento)) continue;
    const f = m.metaFiltro || code;
    const g = grupos.find((x) => x.id === (m.embudo || m.lanzamiento));
    if (g) g.filtros.push(f);
    else {
      let gm = grupos.find((x) => x.id === '_meteoricos');
      if (!gm) grupos.push((gm = { id: '_meteoricos', nombre: 'Meteóricos', tipo: 'meteoricos', filtros: [] }));
      gm.filtros.push(f);
    }
  }
  return grupos;
}

// campaigns: [{ id, name, spend }] → { total, embudos: [{ id, nombre, tipo, gasto, campanas }], otras }
export function repartirGasto(campaigns, grupos) {
  const conFiltro = grupos.map((g) => ({ ...g, fs: [...new Set(g.filtros.map(norm))].filter(Boolean) }));
  const comodines = grupos.filter((g) => g.filtros.some((f) => !norm(f)));
  const suma = new Map(grupos.map((g) => [g.id, { gasto: 0, campanas: 0 }]));
  let otras = 0; let otrasN = 0;
  for (const c of campaigns) {
    const s = Number(c.spend) || 0;
    if (!s) continue;
    const n = norm(c.name);
    let mejor = null; let largo = 0;
    for (const g of conFiltro) for (const f of g.fs) if (f.length > largo && n.includes(f)) { mejor = g; largo = f.length; }
    if (!mejor && comodines.length === 1) mejor = comodines[0];
    if (mejor) { const x = suma.get(mejor.id); x.gasto += s; x.campanas++; } else { otras += s; otrasN++; }
  }
  const r2 = (v) => Math.round(v * 100) / 100;
  const embudos = grupos.map((g) => ({ id: g.id, nombre: g.nombre, tipo: g.tipo, icono: ICONO[g.tipo] || '📣', gasto: r2(suma.get(g.id).gasto), campanas: suma.get(g.id).campanas }))
    .sort((a, b) => b.gasto - a.gasto);
  const total = r2(embudos.reduce((t, e) => t + e.gasto, 0) + otras);
  return { total, embudos, otras: { gasto: r2(otras), campanas: otrasN } };
}

// `embudos`: los que puede ver quien lo pide (null = todos). Con embudos limitados, sin «otras campañas» y el total es el de los suyos.
export async function gastoPorEmbudo({ periodo = 'mes-actual', desde = '', hasta = '', fresh = false, embudos = null } = {}) {
  const hoy = dayInMadrid(new Date().toISOString());
  const p = PERIODOS_GASTO.includes(periodo) && (periodo !== 'personalizado' || (esDia(desde) && esDia(hasta))) ? periodo : 'mes-actual';
  const rango = rangoDe({ preset: p, desde, hasta }, hoy);
  if (!metaConfigured()) return { periodo: p, rango, configured: false };
  const completa = await getConfig();
  const config = embudos ? configDeEmbudos(completa, embudos) : completa;
  // Los filtros se buscan entre todas las campañas (también las de los embudos que no ve): una campaña de otro embudo no cae en el suyo.
  const grupos = gruposDeGasto(completa);
  const { campaigns = [] } = await adSpend({ since: rango.desde, until: rango.hasta, filter: '', fresh });
  const r = repartirGasto(campaigns, grupos);
  if (!embudos) return { periodo: p, rango, configured: true, ...r };
  const ver = new Set(config.embudos.map((e) => e.id));
  const suyos = r.embudos.filter((e) => ver.has(e.id));
  return { periodo: p, rango, configured: true, total: Math.round(suyos.reduce((t, e) => t + e.gasto, 0) * 100) / 100, embudos: suyos, otras: null };
}
