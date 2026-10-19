// Narrativa del lanzamiento: la gran idea (metáfora + referente reconocible + estética) de la que beben el copy,
// los anuncios, el diseño de las páginas y los mensajes del grupo. Ej.: «El Camino hacia tu embarazo natural»,
// con el Camino de Santiago como referente (etapas, credencial con sellos, flechas amarillas, la concha…).
//   · promptNarrativa(): el prompt para que Claude proponga narrativas y desarrolle la elegida en un formato fijo.
//   · bloqueNarrativa(): lo que se añade a cada prompt (anuncios, páginas, WhatsApp) para que todo la siga.
// Se guarda en el lanzamiento: narrativa = { titulo, texto } (texto: lo que devuelve Claude, entre las marcas).

export const MAX_NARRATIVA = 12000;
export const INICIO = '===NARRATIVA===';
export const FIN = '===FIN NARRATIVA===';

const limpio = (s, max) => String(s ?? '').replace(/\r/g, '').trim().slice(0, max);
export function sanitizeNarrativa(n) {
  if (!n || typeof n !== 'object') return null;
  const texto = limpio(n.texto, MAX_NARRATIVA);
  const titulo = limpio(n.titulo, 120) || tituloDe(texto);
  return texto || titulo ? { titulo, texto } : null;
}

// Lo que se pega de Claude: si trae las marcas, lo de dentro; si no, todo. El título sale de «TÍTULO: …».
export function extraerNarrativa(pegado) {
  const t = String(pegado || '').replace(/\r/g, '');
  const i = t.indexOf(INICIO);
  const j = t.indexOf(FIN, i + 1);
  const texto = (i >= 0 ? t.slice(i + INICIO.length, j > i ? j : undefined) : t).trim().slice(0, MAX_NARRATIVA);
  return { titulo: tituloDe(texto), texto };
}
export function tituloDe(texto) {
  const m = String(texto || '').match(/^\s*(?:#+\s*)?(?:\d+\.\s*)?(?:\*\*)?T[ÍI]TULO(?:\s+DE\s+LA\s+NARRATIVA)?(?:\*\*)?\s*:\s*(?:\*\*)?\s*«?([^\n»*]+)/im);
  return m ? m[1].trim().slice(0, 120) : '';
}

// Etapas del embudo según el tipo de lanzamiento (para que la narrativa las cubra todas).
function etapas({ formato = 'webinar', preclase = true, vip = false } = {}) {
  const directo = { webinar: 'el webinar en directo', v2: 'los 2 vídeos', v3: 'los 3 vídeos', plf: 'los 4 vídeos (PLC 1-4)', reto: 'los días del reto' }[formato] || 'el evento en directo';
  return [
    'Captación: anuncios y página de registro (orgánico y publicidad)',
    'Gracias por registrarte y grupo de WhatsApp',
    ...(preclase ? ['Preclase: clases grabadas y recursos antes del directo'] : []),
    ...(vip ? ['Entrada VIP (upsell tras el registro)'] : []),
    `El evento: ${directo}`,
    'Grabación (replay)',
    'Carrito abierto: página de venta, pago, bonus y cuenta atrás',
    'Cierre del carrito y últimas horas',
  ];
}

// Prompt para Claude: con la ficha de marca/producto/avatar y los datos del lanzamiento, proponer narrativas y
// desarrollar la elegida en el formato que usa el dashboard.
//   ctx: { marca, producto, contexto (ficha), diseno, lanzamiento, fechas, oferta, formato, preclase, vip, anterior, notas }
export function promptNarrativa(ctx = {}) {
  const lineas = (arr) => arr.filter(Boolean).join('\n');
  return lineas([
    `Eres director creativo y estratega de lanzamientos digitales (estilo Product Launch Formula) y copywriter de respuesta directa. Vamos a crear la NARRATIVA del próximo lanzamiento de «${ctx.producto || ctx.marca || 'la marca'}»${ctx.lanzamiento ? ` (${ctx.lanzamiento})` : ''}: la gran idea creativa de la que saldrá TODO el embudo (anuncios, páginas, mensajes de WhatsApp, emails, nombres y diseño).`,
    '',
    'QUÉ ES UNA BUENA NARRATIVA (cómo pensarla):',
    '- Una metáfora central que traduce la transformación del avatar (de dónde parte → a dónde llega) en un viaje o una historia que se entiende sin explicar.',
    '- Apoyada en un REFERENTE CULTURAL MUY RECONOCIBLE en España (un lugar, un ritual, una tradición, un oficio, una obra…), que dé estética visual, vocabulario y símbolos «gratis».',
    '- Ejemplo de referencia: para un programa de fertilidad natural, «El Camino hacia tu embarazo natural», inspirado en el Camino de Santiago: cada clase es una etapa, la alumna recibe su credencial y la sella en cada clase, las flechas amarillas guían, la concha es el símbolo, el directo es la llegada a la catedral y el programa es el camino acompañado. De ahí salen el copy, los anuncios y el diseño de las páginas.',
    '- Tiene que encajar con la marca, el tono y el avatar (nada que choque con sus valores o que pueda ofender o trivializar su dolor), ser fácil de llevar a imagen y dar juego en TODAS las etapas del embudo.',
    '- Diferente de lo que hace la competencia y de la narrativa anterior.',
    '',
    'FICHA DE MARCA, PRODUCTO Y AVATAR:',
    ctx.contexto || '(sin ficha: pídeme lo que te falte antes de empezar)',
    ctx.diseno ? `\nESTILO VISUAL DE LA MARCA (la narrativa lo adapta, no lo sustituye: colores y tipografías de la marca mandan):\n${ctx.diseno}` : '',
    '',
    'EL LANZAMIENTO:',
    lineas([
      ctx.formato ? `- Formato: ${ctx.formato}` : '',
      ctx.fechas ? `- Fechas: ${ctx.fechas}` : '',
      ctx.oferta ? `- Oferta: ${ctx.oferta}` : '',
      ctx.anterior ? `- Narrativa del lanzamiento anterior (no la repitas): ${ctx.anterior}` : '',
      ctx.notas ? `- Notas: ${ctx.notas}` : '',
    ]) || '- (sin datos)',
    '',
    'ETAPAS DEL EMBUDO QUE TIENE QUE CUBRIR:',
    ...etapas(ctx).map((e, i) => `${i + 1}. ${e}`),
    '',
    'CÓMO LO HACEMOS (dos pasos; para al acabar el primero):',
    '',
    'PASO 1 · Propón 5 narrativas muy distintas entre sí. Para cada una, en pocas líneas:',
    '- Título (como lo leería el avatar) y la idea en una frase.',
    '- Referente cultural y por qué lo reconoce el avatar.',
    '- Cómo se ve (2-3 imágenes clave) y su símbolo.',
    '- Por qué conecta con el dolor y el deseo del avatar (con sus palabras).',
    '- Riesgo o punto débil.',
    'Termina recomendando una y explicando por qué, y ESPERA a que yo elija (o mezcle).',
    '',
    `PASO 2 · Cuando elija, desarrolla la narrativa completa EXACTAMENTE con este formato, entre las líneas ${INICIO} y ${FIN} (las copiaré tal cual a AlquimIA, que la meterá en todos los prompts del embudo):`,
    '',
    INICIO,
    'TÍTULO: «…»',
    'IDEA CENTRAL: (2-3 frases: la metáfora y la transformación)',
    'REFERENTE: (qué es y qué elementos tomamos de él)',
    'PROMESA EN CLAVE DE NARRATIVA: (una frase)',
    'EL VIAJE · ETAPA A ETAPA: (una línea por cada etapa del embudo de arriba: cómo se llama dentro de la narrativa y qué siente/consigue el avatar)',
    'NOMBRES: evento gratuito · cada clase o vídeo · grupo de WhatsApp · bonus · programa (si encaja) · la comunidad',
    'SÍMBOLOS Y RITUALES: (objetos, gestos, hitos que usaremos: p. ej. sellos, mapa, credencial…)',
    'VOCABULARIO: (20-30 palabras y expresiones de la narrativa para el copy)',
    'PALABRAS A EVITAR: (las que rompen la narrativa o chocan con el avatar)',
    'TONO DENTRO DE LA NARRATIVA: (cómo se aplica el tono de la marca a esta historia)',
    'DIRECCIÓN VISUAL: paleta (con hex, compatible con los colores de la marca) · texturas · fotografía/ilustración · iconos · tipografía de apoyo · composición de las páginas · qué NO hacer',
    'ESCENAS PARA ANUNCIOS E IMÁGENES: (8-10 escenas concretas, listas para pedir a una IA de imagen o vídeo)',
    'GANCHOS PARA ANUNCIOS: (10, con la narrativa y el dolor del avatar)',
    'TITULARES: página de registro (5) · página de venta (5)',
    'MENSAJES CLAVE POR CANAL: anuncios · páginas · emails · WhatsApp (2-3 líneas cada uno: cómo se usa la narrativa en ese canal)',
    'FRASE FIRMA Y CTA: (la frase que se repite en todo el lanzamiento y la llamada a la acción)',
    FIN,
    '',
    'Reglas: español de España; si falta un dato importante, escribe «[FALTA: …]» en vez de inventarlo; nada de explicaciones fuera de las marcas en el paso 2.',
  ]).replace(/\n{3,}/g, '\n\n');
}

// Lo que se añade a cada prompt para que siga la narrativa (canal: 'anuncios' | 'pagina' | 'whatsapp' | 'email').
const COMO = {
  anuncios: [
    'Los ganchos, guiones y copys nacen de la narrativa: usa su vocabulario, sus símbolos y su viaje (sin explicarla: que se sienta).',
    'Las imágenes y vídeos siguen su DIRECCIÓN VISUAL y sus ESCENAS; los colores y tipografías de la marca siguen mandando.',
    'El nombre del evento gratuito y la frase firma, los de la narrativa.',
  ],
  pagina: [
    'El diseño sigue la DIRECCIÓN VISUAL de la narrativa (paleta de apoyo, texturas, iconos, imágenes y composición), integrada con la marca.',
    'Titulares, subtítulos y nombres de secciones salen de su vocabulario y de la etapa del viaje que corresponde a esta página.',
    'Usa sus símbolos como elementos gráficos (iconos, separadores, sellos, mapas…) y su frase firma y CTA.',
  ],
  whatsapp: [
    'Cada mensaje es un momento del viaje: usa la etapa que toca según la fecha, su vocabulario y sus símbolos (sin forzarlos en todos).',
    'El grupo, las clases y el evento se llaman como en la narrativa; la frase firma aparece en los momentos clave.',
  ],
  email: [
    'Asuntos y textos con el vocabulario de la narrativa y la etapa del viaje que toca; misma frase firma y CTA.',
  ],
};
export function bloqueNarrativa(n, canal = 'anuncios') {
  const x = sanitizeNarrativa(n);
  if (!x?.texto) return '';
  return [
    `NARRATIVA DEL LANZAMIENTO${x.titulo ? `: «${x.titulo}»` : ''} — OBLIGATORIA: todo lo que hagas tiene que salir de aquí, de forma coherente con el resto del embudo.`,
    x.texto,
    'CÓMO APLICARLA AQUÍ:',
    ...(COMO[canal] || COMO.anuncios).map((l) => `- ${l}`),
  ].join('\n');
}
