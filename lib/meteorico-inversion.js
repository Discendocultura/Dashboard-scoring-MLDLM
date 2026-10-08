// Inversión en Meta de un meteórico (del calentamiento al cierre; campañas con su filtro o su código).
// null si Meta no está conectado o no hay datos (entonces vale la inversión a mano).
import { adSpend, metaConfigured } from './meta.js';
import { dayInMadrid } from '../public/js/scoring.js';

export async function inversionMeteorico(m, code) {
  if (!metaConfigured() || !(m.metaFiltro || m.calentamiento)) return { inversion: null, metaError: '' };
  try {
    const desde = m.calentamiento || String(m.apertura).slice(0, 10);
    const hasta = String(m.cierre || m.apertura).slice(0, 10) || dayInMadrid(new Date().toISOString());
    if (!desde || hasta < desde) return { inversion: null, metaError: '' };
    return { inversion: (await adSpend({ since: desde, until: hasta, filter: m.metaFiltro || code })).total || null, metaError: '' };
  } catch (e) {
    return { inversion: null, metaError: e.publicMessage || e.message };
  }
}
