// Afinar los prompts de copy (WhatsApp, emails, anuncios y páginas) con lo que no sale de la ficha de marca:
//   1. La VOZ REAL del público: sus respuestas libres de la encuesta (las de quien compró, primero), los comentarios de
//      la preclase y por qué no compraron quienes llamaron. Literal, anónimo y sin repetidas.
//   2. La REVISIÓN antes de entregar: versiones con ángulos distintos y una lista de comprobación por canal (y lo que
//      nunca debe decir: las muletillas que delatan un texto hecho con IA).
//   3. LO QUE FUNCIONÓ: lo que el equipo marcó al cerrar los lanzamientos anteriores (Plan → «🏆 Qué funcionó»).
import { libresAgrupadas, anonimizar } from './encuesta-ia.js';

const corta = (t, n) => { const s = String(t || '').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

// encuesta: resumenEncuesta() · comentarios: [{ texto, oculto? }] · motivos: [[motivo, veces]] (llamadas perdidas)
// → { preguntas: [{ pregunta, frases: [{ texto, n, compras }] }], comentarios: [texto], motivos, total }
export function recogerVoz({ encuesta = null, comentarios = [], motivos = [] } = {}, { maxPorPregunta = 15, maxComentarios = 20 } = {}) {
  const preguntas = (encuesta?.preguntas || [])
    .filter((q) => q.p?.tipo === 'texto' && q.libres?.length)
    .map((q) => ({ pregunta: q.p.name || q.p.id, frases: libresAgrupadas(q.libres).slice(0, maxPorPregunta).map((x) => ({ ...x, texto: corta(x.texto, 280) })) }))
    .filter((q) => q.frases.length);
  const vistos = new Set();
  const coms = [];
  for (const c of comentarios) {
    if (c?.oculto) continue;
    const t = corta(anonimizar(c?.texto), 280);
    const k = t.toLowerCase();
    if (t.length < 12 || vistos.has(k)) continue;
    vistos.add(k);
    coms.push(t);
    if (coms.length >= maxComentarios) break;
  }
  const mot = (motivos || []).filter(([m, n]) => m && n > 0).slice(0, 8);
  return { preguntas, comentarios: coms, motivos: mot, total: preguntas.reduce((n, q) => n + q.frases.length, 0) + coms.length + mot.length };
}

// Bloque para el prompt (o '' si no hay nada que contar).
export function bloqueVoz(v, { origen = '' } = {}) {
  if (!v?.total) return '';
  const partes = ['', `LA VOZ REAL DE SU PÚBLICO${origen ? ` (${origen})` : ''}: frases literales de su gente, sin nombres. Escribe con SUS palabras y desde SUS preocupaciones (no las cites entre comillas ni las copies tal cual: que se reconozcan al leerte). Las marcadas [COMPRÓ] son de quien acabó comprando: pesan más.`];
  for (const q of v.preguntas) {
    partes.push(`\n«${q.pregunta}»:`);
    for (const f of q.frases) partes.push(`- ${f.texto}${f.n > 1 ? ` (×${f.n})` : ''}${f.compras ? ' [COMPRÓ]' : ''}`);
  }
  if (v.comentarios.length) {
    partes.push('\nComentarios que dejaron en la preclase:');
    for (const c of v.comentarios) partes.push(`- ${c}`);
  }
  if (v.motivos.length) partes.push(`\nPor qué no compraron quienes llamaron (resultado de las llamadas): ${v.motivos.map(([m, n]) => `${m} (${n})`).join(' · ')}. Respóndelo sin nombrarlo como objeción.`);
  return partes.join('\n');
}

// Lo que delata un texto hecho con IA (o que suena a plantilla): no debe aparecer.
export const NUNCA_DIGAS = ['descubre', 'transforma tu vida', 'viaje', 'desbloquea', 'potencia', 'sumérgete', 'en el mundo actual', 'no es solo… es…', '¿Te imaginas…?', 'revolucionario', 'mágico', 'increíble oportunidad', 'sin precedentes', 'cambia las reglas del juego'];

const LISTAS = {
  whatsapp: [
    'La primera línea engancha sola (se lee en la notificación).',
    'Corto: de 2 a 6 líneas, como escribe una persona; nada de bloques de texto.',
    'Una sola idea y una sola acción (un enlace o una respuesta, no las dos).',
    'Sin formato de email ni listas largas; como mucho 1 o 2 emojis con sentido.',
    'Suena a la persona de la marca hablando a una amiga, no a una empresa.',
  ],
  email: [
    'Asunto: 3 alternativas con ángulos distintos (curiosidad, beneficio, historia) y una línea de preheader que lo complete.',
    'La primera frase del cuerpo continúa el asunto: nada de «Hola, ¿qué tal?».',
    'Una sola idea por email y una sola llamada a la acción (repetida si hace falta).',
    'Párrafos de 1 a 3 líneas; se lee en el móvil.',
    'Cuenta algo concreto (una escena, un caso, un dato) antes de pedir nada.',
  ],
  anuncios: [
    '3 versiones de cada anuncio con ángulos distintos: dolor, deseo e historia/prueba.',
    'El gancho en los 3 primeros segundos (o la primera línea): para el scroll de SU avatar, no de cualquiera.',
    'Habla a una persona y de una situación concreta; nada de beneficios genéricos.',
    'Una sola acción clara al final.',
    'Cumple las políticas de Meta: sin «¿Tienes X?» que señale características personales, sin promesas de resultados.',
  ],
  pagina: [
    '3 titulares alternativos para la parte de arriba (lo que se ve sin bajar), y recomienda uno.',
    'Lo de arriba responde en 5 segundos: qué es, para quién y qué consigo.',
    'Las objeciones reales (las de su voz) se responden en la página, en sus palabras.',
    'Una sola acción en toda la página, repetida en los sitios clave.',
    'Prueba concreta (testimonios con nombre y situación) cerca de cada llamada a la acción.',
  ],
};

// Instrucciones finales: versiones, revisión contra la lista y entrega.
export function bloqueRevision(canal) {
  const lista = LISTAS[canal];
  if (!lista) return '';
  return ['', 'ANTES DE ENTREGAR, REVISA CADA PIEZA (y reescribe la que no lo cumpla; no me enseñes la revisión, solo el resultado):',
    ...lista.map((x) => `- ${x}`),
    `- Nada de estas palabras o fórmulas (suenan a plantilla o a IA): ${NUNCA_DIGAS.map((x) => `«${x}»`).join(', ')}.`,
    '- Nada inventado: ni cifras, ni testimonios, ni escasez que no esté en los datos.',
    'Al final, en una línea por pieza, dime cuál de las versiones recomiendas y por qué.',
  ].join('\n');
}

// Lo que funcionó (marcado por el equipo al cerrar cada lanzamiento). aprendizajes: { email, whatsapp, anuncio,
// pagina, angulo, nofunciono }.
export const CAMPOS_APRENDIZAJE = [
  { id: 'angulo', label: 'El ángulo o la idea que más vendió', ph: 'Ej.: «el miedo a no tener leche» funcionó mucho más que «lactancia feliz»' },
  { id: 'email', label: 'El email que mejor funcionó', ph: 'Asunto y de qué iba (o pégalo entero)' },
  { id: 'whatsapp', label: 'El mensaje de WhatsApp que mejor funcionó', ph: 'Pégalo o resume de qué iba y por qué funcionó' },
  { id: 'anuncio', label: 'El anuncio ganador', ph: 'Gancho, formato y por qué crees que funcionó' },
  { id: 'pagina', label: 'De las páginas, lo que mejor funcionó', ph: 'Titular, sección, testimonio…' },
  { id: 'nofunciono', label: 'Lo que NO funcionó (para no repetirlo)', ph: 'Ej.: los emails largos de historia en el carrito no se abrieron' },
];
const CANAL_APRENDIZAJE = { email: ['angulo', 'email', 'nofunciono'], whatsapp: ['angulo', 'whatsapp', 'nofunciono'], anuncios: ['angulo', 'anuncio', 'nofunciono'], pagina: ['angulo', 'pagina', 'nofunciono'] };
export function sanitizeAprendizajes(a) {
  if (!a || typeof a !== 'object') return null;
  const out = {};
  for (const c of CAMPOS_APRENDIZAJE) { const v = String(a[c.id] ?? '').trim().slice(0, 2000); if (v) out[c.id] = v; }
  if (!Object.keys(out).length) return null;
  const en = String(a.en || '').slice(0, 30);
  const por = String(a.por || '').slice(0, 80);
  return { ...out, ...(en ? { en } : {}), ...(por ? { por } : {}) };
}
// lista: [{ nombre (del lanzamiento), aprendizajes }] de los anteriores, el más reciente primero.
export function bloqueAprendizajes(lista = [], canal = '') {
  const ids = CANAL_APRENDIZAJE[canal] || CAMPOS_APRENDIZAJE.map((c) => c.id);
  const bloques = [];
  for (const x of lista.slice(0, 3)) {
    const lineas = ids.filter((id) => x.aprendizajes?.[id]).map((id) => `- ${CAMPOS_APRENDIZAJE.find((c) => c.id === id).label}: ${corta(x.aprendizajes[id], 900)}`);
    if (lineas.length) bloques.push(`«${x.nombre}»:\n${lineas.join('\n')}`);
  }
  return bloques.length ? `\nLO QUE FUNCIONÓ EN LANZAMIENTOS ANTERIORES (lo apuntó el equipo al cerrarlos): parte de aquí; repite lo que funcionó con otras palabras y evita lo que no.\n${bloques.join('\n\n')}` : '';
}

// Añade al prompt la voz real, lo que funcionó y la revisión final (en ese orden: contexto primero, instrucciones al final).
export function afilar(prompt, { canal, voz = '', aprendizajes = '' } = {}) {
  const extra = [voz, aprendizajes, bloqueRevision(canal)].filter(Boolean).join('\n');
  return extra ? `${String(prompt).trimEnd()}\n${extra}\n` : prompt;
}
