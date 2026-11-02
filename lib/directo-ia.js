// Análisis del directo con Claude (Métricas → Consumo de vídeos → Retención → Directo → «🧠 Analizar con la
// transcripción»): junta la curva de Zoom (personas conectadas cada minuto) con lo que se decía en cada minuto (la
// transcripción de la grabación en la nube de Zoom, o la que se pega a mano) y pide a Claude los puntos interesantes
// —picos, tramos que enganchan y puntos de fuga—, cada uno con su cita, el porqué y una recomendación, y un resumen.
// Lo llama handlers/directo-ia.js; aquí, lo que no depende de la petición (y se prueba en test/directo-ia.test.js).
import { env } from './env.js';
import { envCliente, clienteActual } from './cliente.js';
import { analizarDirecto } from '../public/js/retencion.js';

export const MODELO = 'claude-opus-5-5';
export const TIPOS = ['pico', 'interes', 'fuga'];
const MAX_CARACTERES = 400_000; // un directo de 3 h son unos 180.000: con esto cabe casi siempre entero

// Clave de la API de Claude: ANTHROPIC_API_KEY_<CLIENTE> si el cliente tiene la suya; si no, la de la agencia.
export function claveClaude(c = clienteActual()) {
  return String(envCliente('ANTHROPIC_API_KEY', c) || env.ANTHROPIC_API_KEY || '').trim();
}
export const claudeConfigurado = () => Boolean(claveClaude()) || env.GHL_MOCK === '1';

// «01:02:03.456», «1:02:03», «02:03» → segundos (o null).
function segundos(t) {
  const m = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,]\d+)?$/.exec(String(t).trim());
  return m ? Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

// La transcripción, de un VTT de Zoom, un SRT o un texto con tiempos («[00:12:34] Ana: …», «00:12:34 Ana: …»).
// → [{ seg, texto }] en orden. Las líneas sin tiempo se juntan con la anterior. Sin ningún tiempo: [] (no se
// puede alinear con la curva).
export function leerTranscripcion(texto) {
  const lineas = String(texto || '').replace(/\r/g, '').split('\n');
  const out = [];
  let actual = null;
  const cerrar = () => { if (actual && actual.texto.trim()) out.push({ seg: actual.seg, texto: actual.texto.replace(/\s+/g, ' ').trim() }); actual = null; };
  for (const l of lineas) {
    const s = l.trim();
    if (!s || /^WEBVTT/.test(s) || /^NOTE\b/.test(s)) { if (!s) cerrar(); continue; }
    const cue = /^((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d+)?)\s*-->\s*\S+/.exec(s);
    if (cue) { cerrar(); actual = { seg: segundos(cue[1]), texto: '' }; continue; }
    if (/^\d+$/.test(s) && !actual) continue; // número de bloque del VTT o del SRT
    const conTiempo = /^\[?((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d+)?)\]?\s*[-–—]?\s*(.*)$/.exec(s);
    if (conTiempo && segundos(conTiempo[1]) != null) { cerrar(); actual = { seg: segundos(conTiempo[1]), texto: conTiempo[2] }; continue; }
    if (actual) actual.texto += ` ${s}`;
  }
  cerrar();
  return out.filter((x) => x.seg != null).sort((a, b) => a.seg - b.seg);
}

// Lo dicho en cada minuto de la curva. desfase: en qué minuto del directo empezó la grabación (0 = a la hora en
// punto; 5 = cinco minutos tarde; −3 = tres antes). → [[min, texto]] en orden.
export function porMinuto(segs = [], desfase = 0) {
  const m = new Map();
  for (const x of segs) {
    const min = Math.floor(x.seg / 60) + Math.round(Number(desfase) || 0);
    m.set(min, m.has(min) ? `${m.get(min)} ${x.texto}` : x.texto);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

// Cuánto ocupa cada minuto, para que todo quepa en el prompt: si sobra, se recorta por igual.
function ajustar(minutos, max = MAX_CARACTERES) {
  const total = minutos.reduce((a, [, t]) => a + t.length, 0);
  if (total <= max) return minutos;
  const cupo = Math.max(80, Math.floor(max / minutos.length));
  return minutos.map(([m, t]) => [m, t.length > cupo ? `${t.slice(0, cupo)}…` : t]);
}

// curva: la de Zoom (lsd_zoom_min_…) · minutos: porMinuto() · ctx: { nombre (del vídeo), lanzamiento, marca,
//   rol: rolDirecto() (qué vídeo es del embudo y si en él se vende; sin él, un webinar de venta) }
export function promptDirecto(curva, minutos, ctx = {}) {
  const an = analizarDirecto(curva);
  const serie = an.serie.map((p) => `min ${p.min}: ${p.n} (${Math.round(p.ret)}%)`).join('\n');
  const tx = ajustar(minutos).map(([m, t]) => `[min ${m}] ${t}`).join('\n');
  const pistas = [
    `Máximo: ${an.pico} personas a la vez en el minuto ${an.picoMin}.`,
    an.tarde ? `El 80% del máximo no se alcanzó hasta el minuto ${an.tarde}.` : '',
    ...an.fugas.map((f) => `Caída fuerte entre el minuto ${f.min0} y el ${f.min1}: unas ${f.personas} personas (${Math.round(f.caida)}% del máximo).`),
    `Al final quedaba el ${Math.round(an.final)}% del máximo.`,
  ].filter(Boolean).join('\n');
  const quien = [ctx.lanzamiento && `del lanzamiento «${ctx.lanzamiento}»`, ctx.marca && `de ${ctx.marca}`].filter(Boolean).join(' ');
  const venta = ctx.rol ? ctx.rol.venta : true;
  return [
    `Analiza ${ctx.nombre ? `«${ctx.nombre}»` : 'el webinar en directo'}${quien ? ` ${quien}` : ''}: ${ctx.rol ? `${ctx.rol.texto}, emitido en directo por Zoom` : 'un directo por Zoom que termina con la venta de un programa'}. Tienes la curva de asistencia (personas conectadas cada minuto; el minuto 0 es la hora a la que empezaba) y la transcripción alineada con esos mismos minutos. Quiero saber qué pasaba en la sala en cada punto interesante de la curva y qué cambiar en el próximo directo.`,
    '',
    `<curva>\n${serie}\n</curva>`,
    '',
    `Lo que ya se ve en la curva (puntos de partida, no tienen por qué ser los únicos):\n${pistas}`,
    '',
    `<transcripcion>\n${tx || '(vacía)'}\n</transcripcion>`,
    '',
    'QUÉ QUIERO:',
    '1. Entre 6 y 12 PUNTOS de la curva, en orden de minuto. Tres tipos:',
    '   - «pico»: la audiencia sube o llega a su máximo.',
    '   - «interes»: un tramo que engancha: la audiencia se mantiene (o casi no baja) donde lo normal sería perder gente.',
    '   - «fuga»: una caída clara de personas.',
    '   Para cada punto: min (y min1, el final del tramo; el mismo si es un solo minuto), un título corto, la cita LITERAL y breve (máx. 25 palabras) de lo que se estaba diciendo justo antes o durante, por qué crees que sube, se mantiene o cae (relaciona lo que se dice con lo que hace la curva; si es una hipótesis, dilo) y una recomendación concreta para el próximo directo (qué decir, qué cortar, qué adelantar, cuándo hacer la oferta…).',
    venta
      ? '   Incluye siempre el momento de la oferta (cuando se presenta el precio o el programa) si se ve en la transcripción, aunque no sea un pico ni una fuga.'
      : '   Incluye el cierre del directo: cómo se invita a volver al siguiente vídeo (y si se menciona ya el programa).',
    venta
      ? '2. Un RESUMEN con las conclusiones más útiles: dónde se pierde más gente, qué partes enganchan, cómo funcionó el momento de la oferta (cuánta gente quedaba y qué pasó después) y las 3 prioridades para el próximo directo.'
      : '2. Un RESUMEN con las conclusiones más útiles: dónde se pierde más gente, qué partes enganchan, cómo deja preparado el siguiente vídeo (en el campo «oferta»: la llamada a volver y si se adelanta algo de la venta) y las 3 prioridades para el próximo directo.',
    '',
    'Reglas: en español de España, claro y sin tecnicismos; las citas, tal cual aparecen en la transcripción; no inventes nada que no esté en la curva o en la transcripción; los minutos, de la curva; nada de datos personales de las asistentes (nombres que salgan en el chat o en preguntas: no los repitas).',
  ].join('\n');
}

const texto = (max) => ({ type: 'string', description: `Máximo ${max} caracteres` });
export const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['resumen', 'puntos'],
  properties: {
    resumen: {
      type: 'object',
      additionalProperties: false,
      required: ['titular', 'dondeSePierde', 'queEngancha', 'oferta', 'prioridades'],
      properties: {
        titular: texto(200),
        dondeSePierde: texto(600),
        queEngancha: texto(600),
        oferta: texto(600),
        prioridades: { type: 'array', items: { type: 'string' } },
      },
    },
    puntos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['min', 'min1', 'tipo', 'titulo', 'cita', 'porque', 'recomendacion'],
        properties: {
          min: { type: 'integer' },
          min1: { type: 'integer' },
          tipo: { type: 'string', enum: TIPOS },
          titulo: texto(90),
          cita: texto(300),
          porque: texto(600),
          recomendacion: texto(600),
        },
      },
    },
  },
};

const corta = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

// Lo que devuelve Claude, limpio y dentro de la curva: minutos entre el primero y el último, tipos conocidos, textos
// acotados y como mucho 14 puntos, en orden.
export function limpiarAnalisis(raw, curva) {
  const serie = analizarDirecto(curva).serie;
  const lo = serie[0]?.min ?? 0;
  const hi = serie.at(-1)?.min ?? 0;
  const dentro = (n) => Math.min(hi, Math.max(lo, Math.round(Number(n))));
  const puntos = (Array.isArray(raw?.puntos) ? raw.puntos : [])
    .filter((p) => p && TIPOS.includes(p.tipo) && Number.isFinite(Number(p.min)))
    .map((p) => {
      const min = dentro(p.min);
      const min1 = Number.isFinite(Number(p.min1)) ? Math.max(min, dentro(p.min1)) : min;
      return { min, min1, tipo: p.tipo, titulo: corta(p.titulo, 90), cita: corta(p.cita, 300), porque: corta(p.porque, 600), recomendacion: corta(p.recomendacion, 600) };
    })
    .sort((a, b) => a.min - b.min)
    .slice(0, 14);
  const r = raw?.resumen || {};
  return {
    puntos,
    resumen: {
      titular: corta(r.titular, 200),
      dondeSePierde: corta(r.dondeSePierde, 600),
      queEngancha: corta(r.queEngancha, 600),
      oferta: corta(r.oferta, 600),
      prioridades: (Array.isArray(r.prioridades) ? r.prioridades : []).map((x) => corta(x, 300)).filter(Boolean).slice(0, 5),
    },
  };
}

// Huella de lo analizado: si no cambian la curva, la transcripción, el desfase ni el modelo, se reutiliza lo guardado.
export function firma(curva, segs, desfase) {
  const s = JSON.stringify([MODELO, curva?.inicio, curva?.valores, Math.round(Number(desfase) || 0), segs.map((x) => [x.seg, x.texto])]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${(h >>> 0).toString(16)}-${s.length}`;
}

function errorClaude(status, cuerpo) {
  const e = new Error(`Claude ${status}: ${String(cuerpo).slice(0, 300)}`);
  e.status = 502;
  e.publicMessage = status === 401 || status === 403
    ? 'Claude no acepta la clave: revisa ANTHROPIC_API_KEY en Cloudflare y vuelve a desplegar.'
    : status === 429 || status === 529 || status >= 500
      ? 'Claude está saturado ahora mismo. Prueba otra vez en un par de minutos.'
      : 'Claude no ha podido hacer el análisis. Prueba otra vez en un momento.';
  return e;
}

// Una llamada a la API de Claude (HTTP, como el resto de APIs del proyecto) con la respuesta en el formato de ESQUEMA.
// Con fallbacks: si un filtro de seguridad la rechazara por error, la API la repite con otro modelo.
export async function pedirAClaude(prompt, { clave = claveClaude() } = {}) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': clave, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 32000,
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA } },
      system: 'Eres analista de webinars de venta en directo y experto en retención de audiencia. Respondes solo con el JSON pedido.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw errorClaude(res.status, await res.text().catch(() => ''));
  const data = await res.json();
  if (data.stop_reason === 'refusal') throw Object.assign(new Error('Claude: refusal'), { status: 502, publicMessage: 'Claude no ha querido analizar este directo. Revisa que la transcripción sea la del webinar.' });
  if (data.stop_reason === 'max_tokens') throw Object.assign(new Error('Claude: max_tokens'), { status: 502, publicMessage: 'La respuesta de Claude se ha cortado. Prueba otra vez.' });
  const txt = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { return { json: JSON.parse(txt), modelo: data.model || MODELO }; } catch { throw errorClaude(200, txt); }
}

// Modo de prueba sin clave: un análisis hecho con la curva y la transcripción (sin Claude), para ver cómo queda.
export function analisisDePrueba(curva, minutos) {
  const an = analizarDirecto(curva);
  const dicho = (min) => {
    const m = minutos.findLast(([x]) => x <= min) || minutos[0]; // lo último que se dijo hasta ese minuto
    return m ? corta(m[1].split(/(?<=[.!?])\s/)[0], 160) : '';
  };
  const puntos = [{ min: an.picoMin, min1: an.picoMin, tipo: 'pico', titulo: 'Máximo de asistencia', cita: dicho(an.picoMin), porque: 'Es cuando ya ha llegado casi todo el mundo y empieza el contenido fuerte.', recomendacion: 'Pon aquí la promesa más potente del directo y anuncia lo que viene al final.' }];
  // El tramo más estable después del pico (lo que menos cae en 10 minutos): «interes».
  const s = an.serie;
  const iPico = s.findIndex((p) => p.min === an.picoMin);
  let mejor = null;
  for (let i = iPico + 5; i + 10 < s.length * 0.8; i++) { const d = s[i].ret - s[i + 10].ret; if (!mejor || d < mejor.d) mejor = { i, d }; }
  if (mejor) puntos.push({ min: s[mejor.i].min, min1: s[mejor.i + 10].min, tipo: 'interes', titulo: 'Tramo que engancha', cita: dicho(s[mejor.i].min), porque: 'La audiencia casi no baja en estos 10 minutos.', recomendacion: 'Usa este tramo como clip para anuncios y el grupo de WhatsApp.' });
  for (const f of an.fugas) puntos.push({ min: f.min0, min1: f.min1, tipo: 'fuga', titulo: `Se van unas ${f.personas} personas`, cita: dicho(f.min0), porque: 'Caída fuerte respecto al ritmo normal del directo.', recomendacion: 'Revisa este tramo en la grabación y acórtalo en el próximo directo.' });
  return {
    puntos: puntos.sort((a, b) => a.min - b.min),
    resumen: {
      titular: `El máximo llega en el minuto ${an.picoMin} (${an.pico} personas) y al final queda el ${Math.round(an.final)}%.`,
      dondeSePierde: an.fugas.length ? `Sobre todo entre el minuto ${an.fugas[0].min0} y el ${an.fugas[0].min1}.` : 'No hay caídas bruscas.',
      queEngancha: mejor ? `El tramo del minuto ${s[mejor.i].min} al ${s[mejor.i + 10].min}.` : '—',
      oferta: `Al final quedaba el ${Math.round(an.final)}% del máximo.`,
      prioridades: ['Abrir con el gancho', 'Acortar los tramos de fuga', 'Adelantar la oferta'],
    },
  };
}
