// Agente de lanzamientos (servidor): junta los datos del lanzamiento (registros, ventas, inversión, piezas, tareas,
// reglas) y aplica public/js/agente.js. Para la pantalla del agente y para el pilotaje diario, que deja sus
// propuestas en la bandeja de decisiones y avisa por Telegram. Unas 6-8 peticiones (GHL, Meta, D1).
import { getConfig } from './config-store.js';
import { currentLaunch } from './digest.js';
import { countByTag } from './ghl.js';
import { adSpend, metaConfigured } from './meta.js';
import { getTareas } from './tareas.js';
import { leerSecuencia } from './calentamiento.js';
import { leerReglas, anadirPropuestasAgente } from './reglas.js';
import { avisarTelegram } from './telegram.js';
import { clienteActual } from './cliente.js';
import { escapeHtml } from './http.js';
import { tagFor, dayInMadrid } from '../public/js/scoring.js';
import { piezasLanzamiento, propuestasAgente, ritmoRegistros } from '../public/js/agente.js';
import { hitosAuditor } from '../public/js/auditor.js';
import { diagnosticoDelDia, propuestasDeDiagnostico } from './agente-ia.js';
import { referenciaAgencia, ratiosActuales } from './cerebro.js';
import { metricasLanzamiento } from './resumen.js';
import { referenciaDe, prediccion, comparar, propiosDe, textoPrediccion, textoComparativa, ratiosDeResultados } from '../public/js/cerebro.js';
import { claudeConfigurado } from './directo-ia.js';
import { leerCompartida } from './store.js';

const sumar = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const contar = (t) => (t ? countByTag(t).catch(() => null) : Promise.resolve(null));

export async function estadoAgente({ code: pedido = '', hoy = dayInMadrid(new Date().toISOString()) } = {}) {
  const config = await getConfig({ fresh: true });
  const code = pedido && config.launches[pedido] ? pedido : currentLaunch(config, hoy);
  const l = code ? config.launches[code] : null;
  if (!l) return { code: null };
  let [registros, compraTotal, compraPrevio, tareas, secuencia, reglas] = await Promise.all([
    contar(l.registroTag), contar(l.compraTag), contar(l.compraTag ? tagFor(code, 'compra_previo') : ''),
    getTareas(code).catch(() => []), leerSecuencia(code).catch(() => null), leerReglas().catch(() => []),
  ]);
  let ventas = compraTotal != null ? Math.max(0, compraTotal - (compraPrevio || 0)) : null;
  // Las cifras de Métricas (solo los leads del lanzamiento): las etiquetas de compra suelen ser las mismas en todos
  // los lanzamientos y su recuento sumaba a quien compró en otros. Si fallan, los recuentos de arriba.
  let m = null;
  try { m = (await metricasLanzamiento(config, code)).m; } catch (err) { console.error('Métricas del agente', err.message); }
  if (m?.total) { registros = m.total; ventas = m.compra; }
  let inversion = m?.eco?.inversion || Number(l.inversion) || null;
  if (!m && metaConfigured() && l.inicioCaptacion && l.inicioCaptacion <= hoy) {
    try { inversion = (await adSpend({ since: l.inicioCaptacion, until: hoy, filter: l.metaFiltro || code })).total || inversion; } catch { /* sin Meta: la manual */ }
  }
  const piezas = piezasLanzamiento(l, { tareas: tareas.length, mensajesGrupo: secuencia ? secuencia.mensajes.length : null, reglasActivas: reglas.filter((r) => r.activa).length });
  const H = hitosAuditor(l);
  const ritmo = l.objetivos?.registros && registros != null && H.captacion.d && H.directo.d
    ? ritmoRegistros({ registros, objetivo: l.objetivos.registros, inicio: H.captacion.d, fin: sumar(H.directo.d, -1), hoy }) : null;
  const propuestas = propuestasAgente({ l, hoy, registros, ventas, inversion, piezas, reglas });
  // Cerebro: predicción y comparativa con los anteriores del cliente y con la referencia de la agencia.
  let cerebro = null;
  try {
    const ref = referenciaDe(await referenciaAgencia(), l.formato || 'webinar');
    const anteriores = Object.entries(config.launches).filter(([c, x]) => c !== code && x.embudo === l.embudo && x.resultados?.registros).map(([, x]) => ratiosDeResultados(x.resultados));
    const actual = await ratiosActuales(code, l, { registros, ventas, inversion, m });
    const pred = prediccion({ registros, ritmo, objetivo: l.objetivos || {}, inversion, convPropia: propiosDe(anteriores, 'convVenta'), convRef: ref?.convVenta });
    const comp = comparar(actual, anteriores, ref);
    cerebro = { prediccion: pred, comparativa: comp, texto: textoPrediccion(pred, l.objetivos || {}), textoFase: textoComparativa(comp), anteriores: anteriores.length, referencia: ref ? { lanzamientos: ref.lanzamientos, formato: ref.formato } : null };
    if (comp.peor) {
      propuestas.push({
        clave: `fase|${comp.peor.id}`, titulo: `🧠 ${comp.peor.fase}: es donde más se pierde ahora`, detalle: `${cerebro.textoFase} Propongo una tarea para revisarlo.`,
        accion: { tipo: 'tareas', tareas: [{ titulo: `Mejorar «${comp.peor.label}» (${comp.peor.fase.toLowerCase()})`, rol: 'admin', fecha: hoy, notas: cerebro.textoFase }] },
      });
    }
  } catch (err) { console.error('Cerebro', err.message); }
  // El diagnóstico de Claude de hoy, si ya está hecho (no se pide aquí: cuesta; lo pide el pilotaje o el botón).
  const ia = await leerCompartida(`agente-ia|${code}|${hoy}`, 26 * 3_600_000).catch(() => null);
  return { code, nombre: l.name, hoy, objetivos: l.objetivos || {}, registros, ventas, inversion, ritmo, piezas, propuestas, cerebro, ia, claude: claudeConfigurado() && l.agenteIa !== false, _l: l, _config: config };
}
const publico = ({ _l, _config, ...resto }) => resto;
export const estadoPublico = async (opts) => publico(await estadoAgente(opts));

// Diagnóstico de Claude (botón «Pedir diagnóstico» o pilotaje). → { ia, propuestasIa }
export async function diagnosticar({ code = '', forzar = false } = {}) {
  const e = await estadoAgente({ code });
  if (!e.code) return { ia: null, propuestasIa: [] };
  const ia = await diagnosticoDelDia({ estado: e, l: e._l, config: e._config, forzar });
  return { ia, propuestasIa: propuestasDeDiagnostico(ia, e.hoy) };
}

// Pilotaje diario (tarea programada): las propuestas nuevas, a la bandeja; aviso por Telegram.
export async function pilotar({ url = '', avisar = true } = {}) {
  const e = await estadoAgente();
  if (!e.code) return { code: null, nuevas: 0, motivo: 'Sin lanzamiento en curso' };
  // Con Claude: su diagnóstico de hoy (una vez al día) y sus propuestas, también a la bandeja.
  let iaProps = [];
  if (e.claude) {
    try { iaProps = propuestasDeDiagnostico(await diagnosticoDelDia({ estado: e, l: e._l, config: e._config }), e.hoy); } catch (err) { console.error('Agente con Claude', err.message); }
  }
  const nuevas = await anadirPropuestasAgente(e.code, [...e.propuestas, ...iaProps]);
  let avisado = 0;
  if (avisar && nuevas.length) {
    const c = clienteActual();
    const enlace = url ? `${url}${c.principal ? '' : `?c=${encodeURIComponent(c.id)}`}#bandeja` : '';
    avisado = await avisarTelegram([`🧭 <b>Agente · ${escapeHtml(c.nombre)}</b> · ${escapeHtml(e.nombre)}`, ...nuevas.map((x) => `🟡 ${escapeHtml(x.titulo)}`), enlace ? `\n<a href="${escapeHtml(enlace)}">Aprobar o descartar en la bandeja</a>` : ''].filter(Boolean).join('\n'));
  }
  return { code: e.code, nuevas: nuevas.length, avisado, propuestas: e.propuestas.length };
}
