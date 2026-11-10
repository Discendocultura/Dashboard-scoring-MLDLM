// Histórico de lanzamientos (menú lateral, debajo de Inteligencia de negocio): todos los lanzamientos del cliente,
// de todos sus embudos, con su embudo completo (captación → calentamiento → directo → venta → economía) para
// compararlos uno a uno. Las mismas cifras que Métricas (computeMetrics sobre los leads de cada lanzamiento).
// Una «foto» por lanzamiento en lsd_historico_<código>: los cerrados se calculan una vez (y otra si cambia su
// configuración); los que siguen en curso, como mucho cada hora. Cada visita calcula como mucho uno que falte
// (descargar los leads de un lanzamiento ya son muchas peticiones a GHL); el navegador vuelve a pedir mientras queden.
import { getConfig } from './config-store.js';
import { storeGetPrefijo, guardarJSON } from './store.js';
import { metricasLanzamiento, estadoLanzamiento } from './resumen.js';
import { clasesDe, conVip, FORMATOS } from '../public/js/videos.js';
import { dayInMadrid } from '../public/js/scoring.js';

const PREFIJO = 'lsd_historico_';
const EN_CURSO = 60 * 60_000;
const REINTENTO = 3 * 3_600_000;
const clave = (code) => `${PREFIJO}${String(code).replace(/[^a-z0-9_-]/gi, '_')}`;
const r2 = (x) => (x == null || !Number.isFinite(Number(x)) ? null : Math.round(Number(x) * 100) / 100);
export function firmaLanzamiento(l) {
  const txt = JSON.stringify(l || {});
  let h = 0;
  for (let i = 0; i < txt.length; i++) h = (h * 31 + txt.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Los lanzamientos que ya empezaron la captación, con su embudo (los de `embudos`, si se limita).
export function lanzamientosDelHistorico(config, hoy, embudos = null) {
  const primero = config.embudos.find((e) => e.tipo === 'lanzamientos')?.id || '';
  return Object.entries(config.launches || {})
    .filter(([, l]) => l.inicioCaptacion && l.inicioCaptacion <= hoy)
    .map(([code, l]) => {
      const embudo = l.embudo || primero;
      return { code, l, embudo, embudoNombre: config.embudos.find((e) => e.id === embudo)?.nombre || '', firma: firmaLanzamiento(l), cerrado: estadoLanzamiento(l, hoy) === 'cerrado' };
    })
    .filter((x) => !embudos || embudos.includes(x.embudo))
    .sort((a, b) => b.l.inicioCaptacion.localeCompare(a.l.inicioCaptacion));
}

// La foto de un lanzamiento a partir de sus métricas (m = computeMetrics).
export function fotoDeMetricas(code, l, m, { embudo = '', embudoNombre = '', hoy = '', firma = '' } = {}) {
  const e = m.eco || {};
  const cierre = String(l.cierreCarrito || '').slice(0, 10);
  const clases = clasesDe(l);
  return {
    code, nombre: l.name || code, embudo, embudoNombre, formato: FORMATOS[l.formato || 'webinar']?.label || 'Webinar',
    estado: estadoLanzamiento(l, hoy), firma, at: new Date().toISOString(),
    fechas: { inicio: l.inicioCaptacion || '', directo: l.fechaDirecto || '', cierre },
    conVip: conVip(l), clases: clases.length, encuesta: Boolean(l.encuestaTag),
    fases: {
      registros: m.total, frio: m.frio, templado: m.templado, encuesta: m.encuestaActiva ? m.encuesta : null,
      vip: conVip(l) ? m.vip : null,
      clase1: clases.length >= 1 ? m.clase1 : null, clase2: clases.length >= 2 ? m.clase2 : null, clase3: clases.length >= 3 ? m.clase3 : null,
      click: m.click, live: m.live, liveFinal: m.liveFinal, replay: m.replay, llamada: m.llamada,
      inicioPago: m.inicioPago, compra: m.compra, unico: m.compraUnico, fraccionado: m.compraFraccionado,
      compraLive: m.compraLive, compraVip: conVip(l) ? m.compraVip : null,
    },
    eco: {
      inversion: r2(e.inversion) || null, facturacion: r2(e.facturacion), programa: r2(e.facturacionPrograma), vip: conVip(l) ? r2(e.facturacionVip) : null,
      bumps: r2(e.facturacionBumps) || null, entradas: r2(e.facturacionEntradas) || null, beneficio: e.inversion ? r2(e.beneficio) : null,
      roas: r2(e.roas), cpl: r2(e.cpl), cpVip: conVip(l) ? r2(e.cpVip) : null, cac: r2(e.cac), ticket: m.compra ? r2((e.facturacionPrograma || 0) / m.compra) : null,
    },
    ...(m.parcial ? { parcial: true } : {}),
  };
}

export function pendienteHistorico(x, guardada, ahora = Date.now()) {
  if (!guardada) return true;
  if (guardada.error) return ahora - Date.parse(guardada.at) > REINTENTO;
  if (guardada.firma !== x.firma) return true; // cambió su configuración (precios, etiquetas…)
  if (guardada.estado !== 'cerrado') return x.cerrado || ahora - Date.parse(guardada.at) > EN_CURSO; // al cerrarse, una última
  return false;
}

export async function historicoLanzamientos({ embudos = null, calcular = true, fresh = '' } = {}) {
  const config = await getConfig();
  const hoy = dayInMadrid(new Date().toISOString());
  const lista = lanzamientosDelHistorico(config, hoy, embudos);
  const guardadas = {};
  for (const txt of Object.values(await storeGetPrefijo(PREFIJO))) { try { const f = JSON.parse(txt); if (f?.code) guardadas[f.code] = f; } catch { /* corrupta: se recalcula */ } }
  // «Actualizar» uno: se recalcula aunque esté guardado.
  const pend = lista.filter((x) => x.code === fresh || pendienteHistorico(x, guardadas[x.code]));
  if (calcular && pend.length) {
    const x = pend[0];
    let f;
    try {
      const { m } = await metricasLanzamiento(config, x.code);
      f = fotoDeMetricas(x.code, x.l, m, { embudo: x.embudo, embudoNombre: x.embudoNombre, hoy, firma: x.firma });
    } catch (err) {
      console.error('Histórico de lanzamientos', x.code, err.message);
      f = { code: x.code, nombre: x.l.name || x.code, embudo: x.embudo, embudoNombre: x.embudoNombre, firma: x.firma, at: new Date().toISOString(), error: String(err.publicMessage || err.message).slice(0, 200) };
    }
    await guardarJSON(clave(x.code), f, { version: null, motivo: 'Histórico de lanzamientos' });
    guardadas[x.code] = f;
  }
  const quedan = lista.filter((x) => pendienteHistorico(x, guardadas[x.code])).length;
  // El orden y el nombre, los de la configuración de hoy (por si se renombró).
  const lanzamientos = lista.map((x) => {
    const f = guardadas[x.code];
    if (!f) return { code: x.code, nombre: x.l.name || x.code, embudo: x.embudo, embudoNombre: x.embudoNombre, fechas: { inicio: x.l.inicioCaptacion }, pendiente: true };
    return { ...f, nombre: x.l.name || x.code, embudo: x.embudo, embudoNombre: x.embudoNombre };
  });
  const embudosLista = config.embudos.filter((e) => e.tipo === 'lanzamientos' && (!embudos || embudos.includes(e.id))).map((e) => ({ id: e.id, nombre: e.nombre }));
  return { hoy, lanzamientos, embudos: embudosLista, pendientes: quedan, total: lista.length };
}
