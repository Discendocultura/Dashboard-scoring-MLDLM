// Pestaña «Publicidad» de cada embudo y avisos de anuncios nuevos (también en el Inicio).
// Las campañas de cada embudo son las que llevan su filtro en el nombre (el mismo que la inversión):
// lanzamiento → su código o «Filtro de campañas»; VSL, venta directa y meteórico → su código de Meta.
import { cacheCompartida } from './store.js';
import { publicidadMeta, estadosMeta, tendenciaAnuncios, metaConfigured, cuentaMeta } from './meta.js';
import { nextLaunchStart } from '../public/js/metrics.js';
import { arbolPublicidad, avisosAnuncios, filtrarCampanas, resultadoDe } from '../public/js/publicidad.js';
import { dayInMadrid } from '../public/js/scoring.js';

const hoyMadrid = () => dayInMadrid(new Date().toISOString());
const restar = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });

// ¿Tiene el embudo la pestaña Publicidad? Sí por defecto (también los creados antes); se quita desde su ⚙️.
export const conPublicidad = (e) => Boolean(e) && e.publicidad !== false;

// Qué campañas son de este embudo. `code`: el lanzamiento o meteórico abierto (si no, el más reciente).
export function campanasDeEmbudo(config, embudoId, code = '', hoy = hoyMadrid()) {
  const e = config.embudos.find((x) => x.id === embudoId);
  if (!e) throw bad('Embudo no encontrado', 404);
  const base = { embudo: e.id, nombre: e.nombre, tipo: e.tipo, resultado: resultadoDe(e.tipo), objetivoCoste: 0 };
  if (e.tipo === 'lanzamientos') {
    const lanz = Object.entries(config.launches).filter(([, l]) => (l.embudo || config.embudos.find((x) => x.tipo === 'lanzamientos')?.id) === e.id);
    const elegido = lanz.find(([c]) => c === code) || lanz.filter(([, l]) => l.inicioCaptacion && l.inicioCaptacion <= hoy).sort((a, b) => b[1].inicioCaptacion.localeCompare(a[1].inicioCaptacion))[0] || lanz[0];
    if (!elegido) return { ...base, filtro: '', sinCampanas: 'Este embudo aún no tiene lanzamientos.' };
    const [c, l] = elegido;
    const next = nextLaunchStart(config, c);
    const hasta = next ? restar(next, 1) : hoy;
    return { ...base, code: c, nombreCode: l.name, filtro: l.metaFiltro || c, lanzamiento: l.inicioCaptacion ? { desde: l.inicioCaptacion, hasta: hasta < l.inicioCaptacion ? l.inicioCaptacion : hasta > hoy ? hoy : hasta } : null };
  }
  if (e.tipo === 'vsl') {
    const v = config.vsls?.[e.id] || {};
    return { ...base, filtro: v.metaFiltro || '', ...(v.metaFiltro ? {} : { sinFiltro: true }) };
  }
  if (e.tipo === 'directa') {
    const d = config.directas?.[e.id] || {};
    return { ...base, filtro: d.metaFiltro || e.id, objetivoCoste: Number(d.objetivoCpa) || 0 };
  }
  const metas = Object.entries(config.meteoricos || {}).filter(([, m]) => m.embudo === e.id).sort((a, b) => String(b[1].apertura).localeCompare(String(a[1].apertura)));
  const elegido = metas.find(([c]) => c === code) || metas[0];
  if (!elegido) return { ...base, filtro: '', sinCampanas: 'Este embudo aún no tiene meteóricos.' };
  return { ...base, code: elegido[0], nombreCode: elegido[1].name, filtro: elegido[1].metaFiltro || elegido[0] };
}

// Avisos de un filtro (última semana frente a la anterior). La tendencia de la cuenta se guarda 30 min.
async function tendenciaCuenta(fresh) {
  return cacheCompartida('publi-tendencia', 30 * 60_000, () => tendenciaAnuncios({ filter: '' }), { fresh });
}
async function avisosDe(info, fresh) {
  const t = await tendenciaCuenta(fresh);
  const actual = filtrarCampanas(t.actual, info.filtro);
  const anterior = filtrarCampanas(t.anterior, info.filtro);
  const estados = await cacheCompartida(`publi-estados|${info.filtro}`, 30 * 60_000, () => estadosMeta(actual.map((r) => r.ad_id)), { fresh });
  return { ...avisosAnuncios({ actual, anterior, estados, tipo: info.tipo, objetivoCoste: info.objetivoCoste, hoy: t.hoy }), semana: { desde: t.corte, hasta: t.hoy } };
}

// Todo lo de la pestaña: árbol del periodo, totales y avisos.
export async function publicidadEmbudo(config, { embudo, code = '', rango, fresh = false }) {
  if (!metaConfigured()) return { configured: false };
  const info = campanasDeEmbudo(config, embudo, code);
  if (info.sinCampanas) return { configured: true, ...info, rango };
  const valor = await cacheCompartida(`publi|${info.filtro}|${rango.desde}|${rango.hasta}`, 10 * 60_000, async () => {
    const filas = await publicidadMeta({ since: rango.desde, until: rango.hasta, filter: info.filtro });
    // Estado de lo que ha gastado: campañas, conjuntos y anuncios (de más a menos gasto).
    const ids = [...filas.campaigns.map((r) => [r.campaign_id, r.spend]), ...filas.adsets.map((r) => [r.adset_id, r.spend]), ...filas.ads.map((r) => [r.ad_id, r.spend])]
      .sort((a, b) => Number(b[1]) - Number(a[1])).map(([id]) => id);
    let estados = {};
    try { estados = await estadosMeta(ids); } catch (e) { console.error('Meta estados', e.message); }
    return arbolPublicidad(filas, estados);
  }, { fresh });
  let avisos = null;
  try { avisos = await avisosDe(info, fresh); } catch (e) { avisos = { error: e.publicMessage || e.message }; }
  return { configured: true, ...info, rango, cuenta: cuentaMeta(), ...valor, avisos };
}

// Inicio: avisos de todos los embudos con Publicidad (una sola consulta de tendencia para toda la cuenta).
export async function avisosTodosLosEmbudos(config, { fresh = false } = {}) {
  if (!metaConfigured()) return { configured: false, embudos: [] };
  const out = [];
  for (const e of config.embudos.filter(conPublicidad)) {
    let info;
    try { info = campanasDeEmbudo(config, e.id); } catch { continue; }
    if (info.sinCampanas || info.sinFiltro) continue;
    try {
      const a = await avisosDe(info, fresh);
      if (a.nivel !== 'sindatos') out.push({ embudo: e.id, nombre: e.nombre, tipo: e.tipo, code: info.code || '', nivel: a.nivel, titulo: a.titulo, avisos: a.avisos.filter((x) => x.nivel !== 'info').slice(0, 3), total: a.avisos.length });
    } catch (err) {
      out.push({ embudo: e.id, nombre: e.nombre, tipo: e.tipo, error: err.publicMessage || err.message });
    }
  }
  const orden = { urgente: 0, pronto: 1, ok: 2 };
  return { configured: true, embudos: out.sort((a, b) => (orden[a.nivel] ?? 3) - (orden[b.nivel] ?? 3)) };
}
