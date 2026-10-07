// Asistente de IA: preguntas en lenguaje natural sobre los datos, resumen de un lanzamiento y
// borradores de WhatsApp para un lead.
// Privacidad: a Claude solo se le mandan cifras agregadas (registros, ventas, conversiones,
// inversión…). Nunca emails, teléfonos, apellidos ni respuestas de la encuesta (pueden ser datos
// de salud). Para un borrador de WhatsApp, solo el nombre de pila y lo que ha hecho en el embudo.
import { getConfig } from './config-store.js';
import { cachePorCliente, clienteActual } from './cliente.js';
import { metricasLanzamiento, resumenParaCliente, resumenDeLanzamiento } from './resumen.js';
import { aprendizajesLanzamiento } from './informe.js';
import { preguntarClaude } from './claude.js';
import { indicadoresLanzamiento, INDICADORES } from '../public/js/comparar.js';
import { dayInMadrid } from '../public/js/scoring.js';
import { FORMATOS } from '../public/js/videos.js';
import { nombreProducto } from '../public/js/producto.js';

const hoyMadrid = () => dayInMadrid(new Date().toISOString());
const MAX_HISTORIAL = 5; // lanzamientos anteriores por embudo
const redondear = (o) => JSON.parse(JSON.stringify(o, (_, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v)));

// Lanzamientos anteriores de cada embudo con sus indicadores (para comparar y proyectar).
const cacheHistorial = cachePorCliente();
async function historial(config) {
  const hit = cacheHistorial.get();
  if (hit && hit.at > Date.now() - 30 * 60_000) return hit.value;
  const hoy = hoyMadrid();
  const out = [];
  for (const e of config.embudos.filter((x) => x.tipo === 'lanzamientos')) {
    const lanz = Object.entries(config.launches).filter(([, l]) => l.embudo === e.id && l.inicioCaptacion && l.inicioCaptacion <= hoy)
      .sort((a, b) => b[1].inicioCaptacion.localeCompare(a[1].inicioCaptacion)).slice(1, MAX_HISTORIAL + 1);
    for (const [code, l] of lanz) {
      try {
        const { m } = await metricasLanzamiento(config, code);
        out.push({ embudo: e.nombre, codigo: code, nombre: l.name, formato: FORMATOS[l.formato || 'webinar']?.label, inicio: l.inicioCaptacion, cierre: String(l.cierreCarrito || '').slice(0, 10), indicadores: indicadoresLanzamiento(m, l) });
      } catch { /* sin datos de ese lanzamiento */ }
    }
  }
  cacheHistorial.set({ at: Date.now(), value: out });
  return out;
}

// Todo lo que el asistente puede saber, agregado.
export async function contextoDatos() {
  const config = await getConfig();
  const [actual, anteriores] = await Promise.all([resumenParaCliente(), historial(config)]);
  return redondear({
    cliente: clienteActual().nombre, producto: nombreProducto(config), hoy: actual.hoy,
    embudosActuales: actual.embudos,
    lanzamientosAnteriores: anteriores,
    leyendaIndicadores: Object.fromEntries(INDICADORES.map((i) => [i.id, `${i.label} (${i.fmt === 'pct' ? 'proporción 0-1' : i.fmt === 'eur' ? '€' : i.fmt === 'x' ? 'veces' : 'número'}; mejor si ${i.mejor === 'mas' ? 'sube' : 'baja'})`])),
  });
}

const SISTEMA = (producto) => `Eres el asistente de análisis de un dashboard de embudos de venta (lanzamientos con webinar o vídeos, retos y embudos siempre abiertos como VSL) de una agencia de marketing. El producto que se vende se llama «${producto}».
Respondes al equipo de la agencia y del cliente, en español de España, claro y directo, como un analista de marketing con experiencia en lanzamientos.
- Básate solo en los datos que se te dan (en JSON). Si un dato no está, dilo y explica qué haría falta para saberlo; no te lo inventes.
- Da cifras concretas (con € y %), compara con ediciones anteriores cuando las haya y termina con 1-3 acciones concretas si tiene sentido.
- Respuestas breves: unas pocas frases o una lista corta. Usa **negrita** para lo importante y listas con guiones. Sin tablas largas ni encabezados.
- Los porcentajes del JSON marcados como «proporción 0-1» muéstralos como %.
- No des consejos médicos ni hagas afirmaciones de salud: hablas de marketing y ventas.`;

// Pregunta libre (con las preguntas y respuestas anteriores de la conversación, como mucho 6).
export async function preguntar(pregunta, anteriores = []) {
  const datos = await contextoDatos();
  const historialChat = anteriores.slice(-6).flatMap((x) => [
    { role: 'user', content: String(x.pregunta || '').slice(0, 1000) },
    { role: 'assistant', content: String(x.respuesta || '').slice(0, 4000) },
  ]).filter((m) => m.content);
  const messages = [
    { role: 'user', content: `Datos del dashboard (JSON):\n${JSON.stringify(datos)}` },
    { role: 'assistant', content: 'Datos recibidos. ¿Qué quieres saber?' },
    ...historialChat,
    { role: 'user', content: String(pregunta).slice(0, 1000) },
  ];
  return preguntarClaude({ system: SISTEMA(datos.producto), messages, effort: 'medium' });
}

// Resumen narrado de un lanzamiento (cómo va o cómo ha ido, frente a los anteriores).
export async function resumenLanzamiento(code) {
  const config = await getConfig();
  const l = config.launches[code];
  if (!l) throw Object.assign(new Error('Lanzamiento no encontrado'), { status: 404, publicMessage: 'Lanzamiento no encontrado' });
  const { m } = await metricasLanzamiento(config, code);
  const emb = config.embudos.find((e) => e.id === l.embudo);
  const anteriores = (await historial(config)).filter((x) => x.embudo === emb?.nombre && x.codigo !== code);
  const datos = redondear({
    lanzamiento: resumenDeLanzamiento(code, l, m, hoyMadrid(), emb),
    indicadores: indicadoresLanzamiento(m, l),
    datosCalculados: aprendizajesLanzamiento(m, [], '', l),
    lanzamientosAnteriores: anteriores,
    hoy: hoyMadrid(),
  });
  const messages = [{ role: 'user', content: `Datos del lanzamiento (JSON):\n${JSON.stringify(datos)}\n\nEscribe un resumen del lanzamiento para el equipo: en qué punto está (o cómo terminó), qué va bien, qué va mal frente a los objetivos y a las ediciones anteriores, y las 3 acciones más útiles${datos.lanzamiento.estado === 'cerrado' ? ' para la próxima edición' : ' para lo que queda de lanzamiento'}. Máximo 200 palabras.` }];
  return preguntarClaude({ system: SISTEMA(nombreProducto(config)), messages, effort: 'medium' });
}

// Borrador de WhatsApp para un lead. `perfil`: solo nombre de pila y comportamiento (lo filtra aquí).
const corto = (v, n) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, n);
export function perfilSeguro(p = {}) {
  return {
    nombre: corto(p.nombre, 30).split(/\s+/)[0] || '',
    estado: corto(p.estado, 40),
    siguientePaso: corto(p.siguientePaso, 60),
    comportamiento: (Array.isArray(p.comportamiento) ? p.comportamiento : []).slice(0, 12).map((x) => corto(x, 80)),
    diasDesdeRegistro: Number.isFinite(Number(p.diasDesdeRegistro)) ? Math.max(0, Math.round(Number(p.diasDesdeRegistro))) : null,
    resultadoAnterior: corto(p.resultadoAnterior, 40),
    yaContactada: Boolean(p.yaContactada),
  };
}

export async function borradorWhatsapp({ perfil, plantilla, fase }) {
  const config = await getConfig();
  const p = perfilSeguro(perfil);
  const variables = (String(plantilla || '').match(/\{[a-z_]+\}/g) || []).filter((v, i, a) => a.indexOf(v) === i);
  const messages = [{ role: 'user', content: `BORRADOR_WHATSAPP
Escribe un mensaje de WhatsApp para esta persona, de parte del equipo, cercano y natural (como lo escribiría una persona, no un anuncio), de 2 a 4 frases, con 1 emoji como mucho. Que tenga en cuenta lo que ha hecho y lleve al siguiente paso.
Mensaje habitual para este paso (úsalo de base y mantén su intención y sus enlaces):
"""${corto(plantilla, 1500)}"""
Variables que debes conservar tal cual, con llaves, donde corresponda: ${variables.join(' ') || '{nombre}'} (se sustituyen solas al enviarlo). Empieza saludando con {nombre}.
Momento del lanzamiento: ${corto(fase, 80) || 'no indicado'}.
Datos de la persona (JSON): ${JSON.stringify(p)}
Devuelve solo el texto del mensaje, sin comillas ni explicaciones.` }];
  const texto = await preguntarClaude({
    system: `Redactas mensajes de WhatsApp de seguimiento para el equipo de ventas de «${nombreProducto(config)}». Español de España, tono cálido y respetuoso, sin presión agresiva, sin promesas de resultados de salud y sin inventar datos ni enlaces.`,
    messages, effort: 'low', maxTokens: 4000,
  });
  return texto.replace(/^["“«]+|["”»]+$/g, '').trim();
}
