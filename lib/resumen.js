// Resumen para el propio cliente (rol «Cliente», solo lectura) y base del informe: cifras agregadas
// de cada embudo, sin datos personales de los leads ni la «cocina» interna (tareas, setteo, notas).
// Lanzamientos: el último que ya ha empezado de cada embudo. VSL: los últimos 30 días.
import { getConfig } from './config-store.js';
import { contactsByTag } from './ghl.js';
import { adSpend, metaConfigured } from './meta.js';
import { cachePorCliente } from './cliente.js';
import { enrichLead, computeMetrics, nextLaunchStart } from '../public/js/metrics.js';
import { enrichVsl, computeVsl, rangoDe } from '../public/js/embudo-vsl.js';
import { dayInMadrid } from '../public/js/scoring.js';
import { hitosLanzamiento } from '../public/js/calendario.js';
import { videosDe, clasesDe, conVip, FORMATOS } from '../public/js/videos.js';
import { nombreProducto } from '../public/js/producto.js';

const hoyMadrid = () => dayInMadrid(new Date().toISOString());
const restar = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

export async function todosLosLeads(tag, fields = []) {
  if (!tag) return [];
  const out = [];
  let cursor = null;
  do {
    const page = await contactsByTag(tag, cursor, fields.filter(Boolean));
    out.push(...page.contacts);
    cursor = page.cursor;
  } while (cursor && out.length < 50_000);
  return out;
}

// Inversión de Meta del lanzamiento (o la manual si Meta no está o da 0).
export async function inversionLanzamiento(config, code, hoy = hoyMadrid()) {
  const l = config.launches[code];
  if (metaConfigured() && l.inicioCaptacion) {
    try {
      const next = nextLaunchStart(config, code);
      const until = next ? restar(next, 1) : hoy;
      const t = (await adSpend({ since: l.inicioCaptacion, until: until < l.inicioCaptacion ? l.inicioCaptacion : until, filter: l.metaFiltro || code })).total;
      if (t) return t;
    } catch (e) { console.error('Meta', e.message); }
  }
  return Number(l.inversion) || 0;
}

// Métricas completas de un lanzamiento (las mismas que en Métricas), para el resumen y el informe.
export async function metricasLanzamiento(config, code) {
  const l = config.launches[code];
  const fields = [l.compraDateField, ...(config.encuesta || []).map((p) => p.id), config.formAds?.campaign, config.formAds?.adset, config.formAds?.ad];
  const leads = (await todosLosLeads(l.registroTag, fields)).map((c) => enrichLead(c, code, config));
  const inversion = await inversionLanzamiento(config, code);
  return { leads, m: computeMetrics(leads, l, { metaSpend: inversion }) };
}

function estadoLanzamiento(l, hoy) {
  const directo = l.fechaDirecto || '';
  const cierre = String(l.cierreCarrito || '').slice(0, 10);
  if (cierre && hoy > cierre) return 'cerrado';
  if (directo && hoy >= directo) return 'carrito';
  return 'captacion';
}

function resumenDeLanzamiento(code, l, m, hoy, embudo) {
  const vs = videosDe(l);
  const funnel = [
    ['Registros', m.total],
    ...clasesDe(l).map((c, i) => [`Vieron la clase ${i + 1}`, m[c]]),
    ...(conVip(l) ? [['Compraron la entrada VIP', m.vip]] : []),
    ...(vs.length > 1 ? (m.videos || []).map((v) => [`Vieron el ${v.nombre}`, v.vieron]) : [['Vieron el webinar (directo o grabación)', m.live + m.soloReplay]]),
    ['Compraron', m.compra],
  ];
  return {
    tipo: 'lanzamiento', code, nombre: l.name, embudo: embudo?.nombre || '', formato: FORMATOS[l.formato || 'webinar']?.label || 'Webinar',
    estado: estadoLanzamiento(l, hoy),
    fechas: { inicio: l.inicioCaptacion || '', directo: l.fechaDirecto || '', cierre: String(l.cierreCarrito || '').slice(0, 10) },
    kpis: {
      registros: m.total, vip: conVip(l) ? m.vip : null, ventas: m.compra,
      facturacion: m.eco.facturacion, inversion: m.eco.inversion || null,
      roas: m.eco.roas, cpl: m.eco.cpl, cac: m.eco.cac,
    },
    objetivos: m.objetivos.map((o) => ({ label: o.label, actual: o.actual, meta: o.meta, unit: o.unit || '', pct: o.pct })),
    funnel,
    hitos: hitosLanzamiento(l).filter((h) => h.day >= hoy).slice(0, 5).map((h) => ({ titulo: h.titulo, dia: h.day, hora: h.time })),
  };
}

async function resumenDeVsl(id, v, config, hoy) {
  const leads = (await todosLosLeads(v.registroTag, [v.compraDateField, v.registroDateField])).map((c) => enrichVsl(c, { ...v, id }, { pais: config.defaultCountryCode }));
  const rango = rangoDe({ preset: '30d' }, hoy);
  let inversion = null;
  if (metaConfigured()) {
    try { inversion = (await adSpend({ since: rango.desde, until: rango.hasta, filter: v.metaFiltro || '' })).total || null; } catch { /* sin Meta */ }
  }
  const m = computeVsl(leads, rango, v, { inversion });
  return {
    tipo: 'vsl', code: id, nombre: v.name, periodo: rango,
    kpis: { registros: m.registros, ventas: m.ventas, facturacion: m.ingresos, inversion: m.inversion, roas: m.roas, cpl: m.cpl, cac: m.cpa, llamadas: m.llamada },
    funnel: [['Registros', m.registros], ['Vieron el vídeo', m.vio], ['Lo vieron hasta el final', m.vio90], ['Agendaron llamada', m.llamada], ['Compraron', m.compraCohorte]],
  };
}

const cache = cachePorCliente();
export async function resumenParaCliente({ fresh = false } = {}) {
  const hit = cache.get();
  if (!fresh && hit && hit.at > Date.now() - 15 * 60_000) return hit.value;
  const config = await getConfig();
  const hoy = hoyMadrid();
  const embudos = [];
  for (const e of config.embudos) {
    try {
      if (e.tipo === 'lanzamientos') {
        const lanz = Object.entries(config.launches).filter(([, l]) => l.embudo === e.id && l.inicioCaptacion && l.inicioCaptacion <= hoy)
          .sort((a, b) => b[1].inicioCaptacion.localeCompare(a[1].inicioCaptacion));
        if (!lanz.length) continue;
        const [code, l] = lanz[0];
        const { m } = await metricasLanzamiento(config, code);
        embudos.push(resumenDeLanzamiento(code, l, m, hoy, e));
      } else if (config.vsls?.[e.id]) {
        embudos.push(await resumenDeVsl(e.id, config.vsls[e.id], config, hoy));
      }
    } catch (err) {
      embudos.push({ tipo: 'error', nombre: e.nombre, error: String(err.publicMessage || err.message).slice(0, 200) });
    }
  }
  const value = { producto: nombreProducto(config), hoy, generado: new Date().toISOString(), embudos };
  cache.set({ at: Date.now(), value });
  return value;
}
