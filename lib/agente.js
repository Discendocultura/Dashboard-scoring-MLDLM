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

const sumar = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const contar = (t) => (t ? countByTag(t).catch(() => null) : Promise.resolve(null));

export async function estadoAgente({ code: pedido = '', hoy = dayInMadrid(new Date().toISOString()) } = {}) {
  const config = await getConfig({ fresh: true });
  const code = pedido && config.launches[pedido] ? pedido : currentLaunch(config, hoy);
  const l = code ? config.launches[code] : null;
  if (!l) return { code: null };
  const [registros, compraTotal, compraPrevio, tareas, secuencia, reglas] = await Promise.all([
    contar(l.registroTag), contar(l.compraTag), contar(l.compraTag ? tagFor(code, 'compra_previo') : ''),
    getTareas(code).catch(() => []), leerSecuencia(code).catch(() => null), leerReglas().catch(() => []),
  ]);
  const ventas = compraTotal != null ? Math.max(0, compraTotal - (compraPrevio || 0)) : null;
  let inversion = Number(l.inversion) || null;
  if (metaConfigured() && l.inicioCaptacion && l.inicioCaptacion <= hoy) {
    try { inversion = (await adSpend({ since: l.inicioCaptacion, until: hoy, filter: l.metaFiltro || code })).total || inversion; } catch { /* sin Meta: la manual */ }
  }
  const piezas = piezasLanzamiento(l, { tareas: tareas.length, mensajesGrupo: secuencia ? secuencia.mensajes.length : null, reglasActivas: reglas.filter((r) => r.activa).length });
  const H = hitosAuditor(l);
  const ritmo = l.objetivos?.registros && registros != null && H.captacion.d && H.directo.d
    ? ritmoRegistros({ registros, objetivo: l.objetivos.registros, inicio: H.captacion.d, fin: sumar(H.directo.d, -1), hoy }) : null;
  const propuestas = propuestasAgente({ l, hoy, registros, ventas, inversion, piezas, reglas });
  return { code, nombre: l.name, hoy, objetivos: l.objetivos || {}, registros, ventas, inversion, ritmo, piezas, propuestas };
}

// Pilotaje diario (tarea programada): las propuestas nuevas, a la bandeja; aviso por Telegram.
export async function pilotar({ url = '', avisar = true } = {}) {
  const e = await estadoAgente();
  if (!e.code) return { code: null, nuevas: 0, motivo: 'Sin lanzamiento en curso' };
  const nuevas = await anadirPropuestasAgente(e.code, e.propuestas);
  let avisado = 0;
  if (avisar && nuevas.length) {
    const c = clienteActual();
    const enlace = url ? `${url}${c.principal ? '' : `?c=${encodeURIComponent(c.id)}`}#bandeja` : '';
    avisado = await avisarTelegram([`🧭 <b>Agente · ${escapeHtml(c.nombre)}</b> · ${escapeHtml(e.nombre)}`, ...nuevas.map((x) => `🟡 ${escapeHtml(x.titulo)}`), enlace ? `\n<a href="${escapeHtml(enlace)}">Aprobar o descartar en la bandeja</a>` : ''].filter(Boolean).join('\n'));
  }
  return { code: e.code, nuevas: nuevas.length, avisado, propuestas: e.propuestas.length };
}
