// Métricas de un embudo de venta directa (low ticket) en un rango de días: compras de GHL (etiqueta de
// compra y de cada extra), visitas de D1 e inversión de Meta. Las usan /api/directa, el Inicio y el portal.
import { cacheCompartida } from './store.js';
import { todosLosLeads } from './resumen.js';
import { adSpend, metaConfigured } from './meta.js';
import { visitasDirectaPorHora } from './entradas.js';
import { metricasDirecta, conParte } from '../public/js/directa.js';
import { addDay } from '../public/js/embudo-vsl.js';
import { dayInMadrid } from '../public/js/scoring.js';
import { madridToEpoch } from '../public/js/page.js';

async function visitasDelRango(id, rango) {
  const desde = madridToEpoch(`${rango.desde}T00:00`);
  const hasta = madridToEpoch(`${addDay(rango.hasta, 1)}T00:00`);
  const filas = await visitasDirectaPorHora(id, desde, hasta);
  const total = {};
  const porDia = {};
  for (const f of filas) {
    const dia = dayInMadrid(new Date(f.hora).toISOString());
    total[f.pagina] = (total[f.pagina] || 0) + f.n;
    porDia[dia] = { ...(porDia[dia] || {}), [f.pagina]: (porDia[dia]?.[f.pagina] || 0) + f.n };
  }
  return { total, porDia };
}

async function inversionDelRango(d, id, rango) {
  if (!conParte(d, 'meta') || !metaConfigured()) return { inversion: null, metaError: '' };
  try {
    return { inversion: (await adSpend({ since: rango.desde, until: rango.hasta, filter: d.metaFiltro || id })).total || 0, metaError: '' };
  } catch (e) {
    return { inversion: null, metaError: e.publicMessage || e.message };
  }
}

// La configuración entra en la clave de la caché: si cambian precios o etiquetas, se recalcula al momento.
function firma(d) {
  const txt = JSON.stringify([d.compraTag, d.compraDateField, d.precio, d.iva, d.partes, d.bumps, d.upsells, d.downsells, d.metaFiltro, d.inversionDia, d.objetivoCpa, d.objetivoRoas, d.objetivoVentasMes]);
  let h = 0;
  for (let i = 0; i < txt.length; i++) h = (h * 31 + txt.charCodeAt(i)) | 0;
  return h;
}

// Compartido 5 minutos por todo el equipo (descarga todas las compradoras de GHL).
export function metricasDirectaRango(id, d, rango, { fresh = false } = {}) {
  return cacheCompartida(`directa|${id}|${rango.desde}|${rango.hasta}|${firma(d)}`, 5 * 60_000, async () => {
    // Sin campo de fecha de compra, la fecha es la de alta del contacto: se puede cortar la descarga ahí.
    const [contactos, visitas, inv] = await Promise.all([
      d.compraTag ? todosLosLeads(d.compraTag, [d.compraDateField].filter(Boolean), d.compraDateField ? {} : { desde: rango.desde }) : [],
      conParte(d, 'visitas') ? visitasDelRango(id, rango) : null,
      inversionDelRango(d, id, rango),
    ]);
    const m = metricasDirecta(contactos, d, rango, { visitas, inversion: inv.inversion });
    return { ...m, compradores: m.compradores.slice(0, 3000), metaError: inv.metaError };
  }, { fresh });
}

// Para el Inicio y el portal del cliente: cifras clave y el embudo paso a paso.
export async function resumenDeDirecta(id, d, rango, opciones) {
  const m = await metricasDirectaRango(id, d, rango, opciones);
  const extras = m.extras.map((x) => [`${x.tipo === 'bump' ? 'Bump' : x.tipo === 'upsell' ? 'Upsell' : 'Downsell'} · ${x.nombre}`, x.n]);
  return {
    tipo: 'directa', code: id, nombre: d.name, periodo: rango,
    kpis: { ventas: m.ventas, facturacion: m.facturacion, inversion: m.inversion, roas: m.roas, cac: m.cpa, ticket: m.ticket },
    extras: m.extras.map((x) => ({ tipo: x.tipo, nombre: x.nombre, n: x.n, pct: x.pct })),
    funnel: [
      ...(conParte(d, 'visitas') && m.visitas.venta ? [['Visitaron la página de venta', m.visitas.venta], ['Llegaron al checkout', m.visitas.checkout]] : []),
      ['Compraron', m.ventas], ...extras,
    ],
  };
}
