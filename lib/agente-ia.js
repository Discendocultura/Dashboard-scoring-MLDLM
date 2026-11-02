// El agente de lanzamientos con Claude: un diagnóstico escrito del lanzamiento en curso (qué pasa y por qué, comparado
// con los lanzamientos anteriores del mismo embudo y lo que se aprendió en ellos), propuestas concretas y borradores
// de las piezas que faltan (narrativa, mensajes del grupo, emails). Todo va a la bandeja: nada se hace sin tu OK.
// Una llamada a Claude al día por lanzamiento como mucho (se guarda): unos céntimos. Usa ANTHROPIC_API_KEY
// (o ANTHROPIC_API_KEY_<CLIENTE>). Sin clave y con GHL_MOCK, un diagnóstico de prueba.
import { env } from './env.js';
import { claveClaude, claudeConfigurado, MODELO, errorClaude } from './directo-ia.js';
import { leerCompartida, guardarCompartida } from './store.js';
import { contextoMarca } from '../public/js/marca.js';
import { leerMarca } from './marca.js';
import { elegirProducto } from './setter-api.js';

const TTL_DIA = 26 * 3_600_000;
const corta = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

const ESQUEMA = {
  type: 'object', additionalProperties: false, required: ['resumen', 'diagnostico', 'propuestas'],
  properties: {
    resumen: { type: 'string', description: 'Dos o tres frases: cómo va el lanzamiento y lo más importante de hoy.' },
    diagnostico: {
      type: 'array', description: 'De 2 a 5 observaciones, de la más a la menos importante.',
      items: { type: 'object', additionalProperties: false, required: ['titulo', 'detalle', 'gravedad'], properties: {
        titulo: { type: 'string' }, detalle: { type: 'string', description: 'Qué pasa y por qué (con los datos), comparado con los anteriores si se puede.' },
        gravedad: { type: 'string', enum: ['bien', 'atencion', 'urgente'] },
      } },
    },
    propuestas: {
      type: 'array', description: 'De 1 a 4 acciones concretas para hoy o mañana. Solo lo que de verdad mueve la aguja.',
      items: { type: 'object', additionalProperties: false, required: ['titulo', 'detalle', 'rol', 'borrador'], properties: {
        titulo: { type: 'string', description: 'La acción, en imperativo y corta.' },
        detalle: { type: 'string', description: 'Por qué y cómo, en 2-3 frases.' },
        rol: { type: 'string', enum: ['admin', 'setter', 'tecnico'], description: 'Quién la hace: admin (dirección, anuncios, copy), setter (llamadas y WhatsApp), tecnico (páginas, GHL, Zoom).' },
        borrador: { type: 'string', description: 'Si la acción es escribir algo (narrativa, mensaje del grupo, email, guion), el borrador listo para revisar; si no, cadena vacía.' },
      } },
    },
  },
};

const SISTEMA = 'Eres la directora de lanzamientos de una agencia de lanzamientos digitales (webinars y retos con venta en directo, en España). Analizas los datos reales del lanzamiento en curso, los comparas con los anteriores y dices qué hacer, en español de España, claro y sin jerga. No inventas datos: si algo no está, lo dices. Respondes solo con el JSON pedido.';

// El prompt: el estado del agente (public/js/agente.js) + el contexto (lanzamientos anteriores, aprendizajes, marca).
export function promptAgente({ estado, l, anteriores = [], marca = '' }) {
  const o = estado.objetivos || {};
  const r = estado.ritmo;
  const lineas = [
    `HOY: ${estado.hoy}`,
    `LANZAMIENTO: «${l.name}» · formato ${l.formato || 'webinar'}`,
    `FECHAS: captación desde ${l.inicioCaptacion || '?'} · directo ${l.fechaDirecto || '?'} ${l.horaDirecto || ''} · carrito ${String(l.aperturaCarrito || '').replace('T', ' ') || '?'} → ${String(l.cierreCarrito || '').replace('T', ' ') || '?'}`,
    `OBJETIVOS: ${o.ventas || '?'} ventas · ${o.registros || '?'} registros${o.inversion ? ` · ${o.inversion} € de inversión` : ''}`,
    `AHORA: ${estado.registros ?? '?'} registros · ${estado.ventas ?? '?'} ventas · ${estado.inversion ? `${Math.round(estado.inversion)} € invertidos` : 'inversión desconocida'}${estado.registros && estado.inversion ? ` · ${(estado.inversion / estado.registros).toFixed(2)} € por registro` : ''}`,
    r ? `RITMO DE REGISTROS: ${r.pct} % del previsto a día de hoy · ${r.actualDia}/día de media · hacen falta ${r.necesarioDia}/día en los ${r.quedan} días que quedan` : '',
    estado.cerebro?.texto ? `PREDICCIÓN: ${estado.cerebro.texto}` : '',
    estado.cerebro?.textoFase ? `COMPARATIVA POR FASES: ${estado.cerebro.textoFase}` : '',
    `PIEZAS SIN HACER: ${estado.piezas.filter((p) => !p.hecha).map((p) => `${p.titulo} (para ${p.para || 'sin fecha'})`).join('; ') || 'ninguna'}`,
    `ALARMAS DE LAS REGLAS FIJAS: ${estado.propuestas.map((p) => p.titulo).join('; ') || 'ninguna'}`,
    l.narrativa?.texto ? `NARRATIVA DEL LANZAMIENTO:\n${corta(l.narrativa.texto, 1500)}` : 'NARRATIVA: aún no hay.',
    marca ? `MARCA Y AVATAR:\n${corta(marca, 2500)}` : '',
    anteriores.length ? `LANZAMIENTOS ANTERIORES DEL MISMO EMBUDO:\n${anteriores.map((a) => `- «${a.name}» (directo ${a.fechaDirecto || '?'}): ${a.resultados ? corta(JSON.stringify(a.resultados), 700) : 'sin resultados guardados'}${a.aprendizajes ? `\n  Qué funcionó / qué no: ${corta(JSON.stringify(a.aprendizajes), 700)}` : ''}`).join('\n')}` : 'LANZAMIENTOS ANTERIORES: no hay datos.',
    '',
    'Haz el diagnóstico de hoy y propón lo que harías tú (1-4 acciones). Si una acción es escribir algo, deja el borrador hecho. No repitas las alarmas de las reglas fijas salvo para explicar por qué pasan.',
  ];
  return lineas.filter((x) => x !== '').join('\n');
}

function diagnosticoDePrueba(estado) {
  return {
    resumen: `Llevas ${estado.registros ?? 0} registros${estado.objetivos?.registros ? ` de ${estado.objetivos.registros}` : ''}. Diagnóstico de prueba (sin clave de Claude).`,
    diagnostico: [{ titulo: 'Diagnóstico de prueba', detalle: 'Pon ANTHROPIC_API_KEY en Cloudflare para el diagnóstico real.', gravedad: 'atencion' }],
    propuestas: [{ titulo: 'Escribir el mensaje de bienvenida del grupo', detalle: 'Para que quien entre sepa qué va a pasar y cuándo.', rol: 'admin', borrador: '¡Bienvenida! En este grupo te avisaremos de cada clase y del directo.' }],
  };
}

async function pedirJSON(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': claveClaude(), 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELO, max_tokens: 8000, fallbacks: 'default', output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA } }, system: SISTEMA, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw errorClaude(res.status, await res.text().catch(() => ''));
  const data = await res.json();
  if (data.stop_reason === 'refusal' || data.stop_reason === 'max_tokens') throw Object.assign(new Error(`Claude: ${data.stop_reason}`), { status: 502, publicMessage: 'Claude no ha podido hacer el diagnóstico. Prueba otra vez en un momento.' });
  const txt = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { return { json: JSON.parse(txt), modelo: data.model || MODELO }; } catch { throw errorClaude(200, txt); }
}

// Las propuestas de Claude, con la forma de las del agente (para la bandeja).
export const propuestasDeDiagnostico = (d, hoy) => (d?.propuestas || []).slice(0, 4).map((p, i) => ({
  clave: `ia|${hoy}|${i}`, titulo: `🧠 ${corta(p.titulo, 140)}`, detalle: corta(p.detalle, 600),
  accion: { tipo: 'tareas', tareas: [{ titulo: corta(p.titulo, 200), rol: p.rol, fecha: hoy, notas: `${corta(p.detalle, 800)}${p.borrador ? `\n\nBorrador de Claude para revisar:\n${String(p.borrador).slice(0, 4000)}` : ''}` }] },
  borrador: p.borrador ? String(p.borrador).slice(0, 4000) : '',
}));

// Diagnóstico del día (guardado): solo llama a Claude si no hay uno de hoy o si se fuerza.
export async function diagnosticoDelDia({ estado, l, config, forzar = false } = {}) {
  const CLAVE = `agente-ia|${estado.code}|${estado.hoy}`;
  if (!forzar) {
    const guardado = await leerCompartida(CLAVE, TTL_DIA).catch(() => null);
    if (guardado) return { ...guardado, guardado: true };
  }
  if (!claudeConfigurado()) return null;
  const anteriores = Object.entries(config.launches).filter(([c, x]) => c !== estado.code && x.embudo === l.embudo && (x.resultados || x.aprendizajes))
    .sort((a, b) => String(b[1].fechaDirecto || '').localeCompare(String(a[1].fechaDirecto || ''))).slice(0, 4).map(([, x]) => x);
  let marca = '';
  try { const m = await leerMarca(); marca = contextoMarca(m, elegirProducto(m, { embudo: l.embudo })) || ''; } catch { /* sin ficha de marca */ }
  let json;
  let modelo = MODELO;
  if (!claveClaude() && env.GHL_MOCK === '1') json = diagnosticoDePrueba(estado);
  else ({ json, modelo } = await pedirJSON(promptAgente({ estado, l, anteriores, marca })));
  const valor = { ...json, modelo, en: new Date().toISOString(), anteriores: anteriores.length };
  await guardarCompartida(CLAVE, valor).catch(() => {});
  return valor;
}
