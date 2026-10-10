// Marca y avatar de cada cliente: el cuestionario que se rellena al darlo de alta (el cliente desde su
// enlace y el equipo desde el dashboard) y que alimenta todos los prompts (páginas, WhatsApp…).
//   · Marca (una por cliente): identidad, tono y estilo visual.
//   · Productos (uno o varios): la oferta y su avatar. Cada embudo elige su producto.
//   · Documentos: el texto de PDF, Word, TXT… sobre el avatar (se guarda solo el texto).
//   · Ficha: el resumen que hace Claude de todo lo anterior (se pega en el dashboard) y que va en los prompts.
// Lo usan el navegador (dashboard y página pública) y el servidor (para limpiar lo que llega).

export const TONOS = ['Cercano', 'Cálido', 'Profesional', 'Directo', 'Divertido', 'Inspirador', 'Empático', 'Científico y riguroso', 'Provocador', 'Elegante', 'Tranquilizador', 'Motivador'];
export const ESTILOS = ['Minimalista', 'Cálido y natural', 'Elegante', 'Moderno', 'Colorido', 'Femenino', 'Limpio y clínico', 'Divertido', 'Premium', 'Orgánico', 'Editorial'];

// Tipos: texto (una línea), largo (párrafo), opciones (una), varias (varias), color, url, urls (una por línea).
export const SECCIONES_MARCA = [
  { id: 'identidad', icono: '🏷️', titulo: 'La marca', intro: 'Quién eres y por qué existe tu marca. Escribe como hablarías: no hace falta que quede bonito.', preguntas: [
    { id: 'nombre', tipo: 'texto', label: 'Nombre de la marca', ej: 'Me lo dijo la matrona' },
    { id: 'persona', tipo: 'texto', label: '¿Quién está detrás? Nombre y a qué se dedica', ej: 'Laura García, matrona' },
    { id: 'credenciales', tipo: 'largo', label: 'Formación, experiencia y logros que te dan autoridad', ej: 'Años de experiencia, títulos, hospitales, premios, apariciones en medios…' },
    { id: 'historia', tipo: 'largo', label: 'Tu historia: por qué empezaste con esto', ej: 'El momento clave que te llevó a crear la marca.' },
    { id: 'mision', tipo: 'largo', label: '¿Qué quieres cambiar en la vida de tus clientes? (tu misión)' },
    { id: 'valores', tipo: 'largo', label: 'Valores y creencias de la marca: lo que defiendes y lo que no' },
    { id: 'enemigo', tipo: 'largo', label: '¿Contra qué luchas? Mitos, malas prácticas del sector, lo que te indigna' },
    { id: 'cifras', tipo: 'largo', label: 'Números que dan confianza', ej: 'Alumnas, seguidoras, años, familias ayudadas, valoraciones…' },
    { id: 'redes', tipo: 'urls', opcional: true, label: 'Web y redes sociales (un enlace por línea)', ej: 'https://instagram.com/…' },
    { id: 'referentes', tipo: 'largo', opcional: true, label: 'Referentes y competencia: qué te gusta de ellos y en qué te diferencias' },
  ] },
  { id: 'tono', icono: '🗣️', titulo: 'Tono y forma de hablar', intro: 'Cómo suenan tus textos. Los ejemplos reales son lo que más ayuda.', preguntas: [
    { id: 'tono', tipo: 'varias', label: '¿Cómo es tu tono? (elige varios)', opciones: TONOS },
    { id: 'trato', tipo: 'opciones', label: '¿Cómo tratas a tu audiencia?', opciones: ['De tú', 'De usted'] },
    { id: 'genero', tipo: 'opciones', label: '¿A quién te diriges?', opciones: ['En femenino (ellas)', 'En masculino (ellos)', 'Mixto o neutro'] },
    { id: 'voz', tipo: 'opciones', label: '¿Quién habla en los textos?', opciones: ['Yo (en primera persona)', 'Nosotros (el equipo o la marca)'] },
    { id: 'emojis', tipo: 'opciones', label: 'Emojis', opciones: ['Muchos', 'Algunos', 'Pocos', 'Ninguno'] },
    { id: 'expresiones', tipo: 'largo', label: 'Expresiones, muletillas o palabras que usas mucho' },
    { id: 'prohibidas', tipo: 'largo', label: 'Palabras, temas o promesas que NUNCA se deben usar' },
    { id: 'ejemplos', tipo: 'largo', label: 'Pega textos tuyos que te representen (posts, emails, mensajes…)', max: 8000 },
    { id: 'antiejemplos', tipo: 'largo', opcional: true, label: 'Textos o estilos que NO van contigo (y por qué)' },
  ] },
  { id: 'diseno', icono: '🎨', titulo: 'Estilo visual', intro: 'Para que las páginas salgan con tu imagen. Los colores en formato #RRGGBB.', preguntas: [
    { id: 'color1', tipo: 'color', label: 'Color principal' },
    { id: 'color2', tipo: 'color', label: 'Color secundario' },
    { id: 'color3', tipo: 'color', opcional: true, label: 'Color de los botones (acento)' },
    { id: 'colorFondo', tipo: 'color', opcional: true, label: 'Color de fondo' },
    { id: 'colorTexto', tipo: 'color', opcional: true, label: 'Color del texto' },
    { id: 'fuenteTitulos', tipo: 'texto', opcional: true, label: 'Tipografía de los titulares', ej: 'Playfair Display' },
    { id: 'fuenteTexto', tipo: 'texto', opcional: true, label: 'Tipografía del texto', ej: 'Lato' },
    { id: 'estilo', tipo: 'varias', label: '¿Cómo es tu estilo? (elige varios)', opciones: ESTILOS },
    { id: 'logo', tipo: 'url', opcional: true, label: 'Enlace al logo (PNG con fondo transparente)', ej: 'GHL → Sitios → Medios → ⋯ → Copiar enlace' },
    { id: 'fotos', tipo: 'urls', opcional: true, label: 'Fotos tuyas o de la marca (un enlace por línea)' },
    { id: 'websRef', tipo: 'largo', opcional: true, label: 'Páginas o webs cuyo diseño te guste (enlace y qué te gusta)' },
    { id: 'evitar', tipo: 'largo', opcional: true, label: 'Lo que NO quieres ver en el diseño' },
    { id: 'notas', tipo: 'largo', opcional: true, label: 'Cualquier otra cosa que debamos saber de tu marca' },
  ] },
];

export const SECCIONES_PRODUCTO = [
  { id: 'oferta', icono: '📦', titulo: 'El producto', intro: 'Lo que vendes en este embudo.', preguntas: [
    { id: 'nombre', tipo: 'texto', label: 'Nombre del producto', ej: 'Raíces' },
    { id: 'tipo', tipo: 'opciones', label: 'Tipo de producto', opciones: ['Programa o curso online', 'Membresía', 'Mentoría o acompañamiento', 'Producto de entrada (low ticket)', 'Servicio o consulta', 'Taller o evento', 'Producto físico'] },
    { id: 'promesa', tipo: 'largo', label: 'La gran promesa: de dónde a dónde lleva (en una frase)', ej: 'De noches sin dormir a un bebé que duerme del tirón en 21 días.' },
    { id: 'resultados', tipo: 'largo', label: 'Resultados concretos que se consiguen y en cuánto tiempo' },
    { id: 'mecanismo', tipo: 'largo', label: 'Tu método: cómo lo consigue y por qué es distinto a lo demás' },
    { id: 'incluye', tipo: 'largo', label: 'Qué incluye: módulos, sesiones, materiales, comunidad, soporte…' },
    { id: 'formato', tipo: 'largo', label: 'Formato y duración (online, directos, acceso…)' },
    { id: 'precio', tipo: 'texto', label: 'Precio y formas de pago', ej: '497 € o 3 plazos de 175 €' },
    { id: 'bonus', tipo: 'largo', opcional: true, label: 'Bonus habituales' },
    { id: 'garantia', tipo: 'largo', opcional: true, label: 'Garantía' },
    { id: 'paraQuien', tipo: 'largo', label: 'Para quién SÍ es' },
    { id: 'paraQuienNo', tipo: 'largo', label: 'Para quién NO es' },
    { id: 'testimonios', tipo: 'largo', opcional: true, label: 'Testimonios y casos de éxito (literal, con nombre y resultado; enlaces a vídeos)', max: 8000 },
    { id: 'faq', tipo: 'largo', opcional: true, label: 'Preguntas frecuentes antes de comprar, con su respuesta', max: 8000 },
  ] },
  { id: 'avatar', icono: '👩', titulo: 'El avatar (cliente ideal)', intro: 'Cuanto más con sus palabras, mejor saldrán los textos.', preguntas: [
    { id: 'quien', tipo: 'largo', label: '¿Quién es? Edad, situación, momento vital', ej: 'Mamá primeriza de 30-38 años con bebé de 4 a 12 meses, trabaja fuera…' },
    { id: 'diaADia', tipo: 'largo', label: '¿Cómo es su día a día con este problema?' },
    { id: 'dolores', tipo: 'largo', label: 'Sus problemas y dolores principales (lo que le quita el sueño)' },
    { id: 'deseos', tipo: 'largo', label: 'Lo que más desea conseguir (su situación soñada)' },
    { id: 'miedos', tipo: 'largo', label: 'Sus miedos y frustraciones' },
    { id: 'probado', tipo: 'largo', label: 'Lo que ya ha probado sin éxito (y por qué no le funcionó)' },
    { id: 'objeciones', tipo: 'largo', label: 'Lo que le frena para comprar (precio, tiempo, «no es para mí»…)' },
    { id: 'frases', tipo: 'largo', label: 'Frases literales que dice (de comentarios, mensajes, encuestas)', max: 8000 },
    { id: 'creencias', tipo: 'largo', label: 'Creencias que hay que romper' },
    { id: 'decide', tipo: 'largo', label: '¿Quién decide la compra? ¿Con quién lo consulta?' },
    { id: 'donde', tipo: 'largo', label: '¿Dónde está? Redes, contenidos que consume, a quién sigue' },
    { id: 'consciencia', tipo: 'opciones', label: '¿Cuánto sabe de su problema cuando te conoce?', opciones: ['No sabe que tiene el problema', 'Conoce el problema, no la solución', 'Conoce soluciones, pero no la tuya', 'Conoce tu producto', 'Está lista para comprar'] },
  ] },
];

export const MAX_PRODUCTOS = 8;
export const MAX_DOCS = 15;
export const MAX_DOC_CHARS = 300_000;
export const MAX_FICHA = 30_000;
export const DOC_EXT = ['pdf', 'docx', 'txt', 'md', 'csv'];
const MAX_POR_TIPO = { texto: 200, largo: 4000, opciones: 80, varias: 400, color: 7, url: 600, urls: 3000 };
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const PRODUCTO_ID_RE = /^p[a-z0-9]{2,12}$/;

const preguntasDe = (secciones) => secciones.flatMap((s) => s.preguntas);
const PREG_MARCA = new Map(preguntasDe(SECCIONES_MARCA).map((q) => [q.id, q]));
const PREG_PRODUCTO = new Map(preguntasDe(SECCIONES_PRODUCTO).map((q) => [q.id, q]));

// Un valor según su pregunta: '' (o []) si no vale.
export function limpiarRespuesta(q, v) {
  const max = q.max || MAX_POR_TIPO[q.tipo] || 200;
  if (q.tipo === 'varias') return [...new Set((Array.isArray(v) ? v : []).map(String).filter((x) => q.opciones.includes(x)))];
  const s = String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
  if (q.tipo === 'opciones') return q.opciones.includes(s) ? s : '';
  if (q.tipo === 'color') return COLOR_RE.test(s) ? s.toLowerCase() : '';
  if (q.tipo === 'url') return /^https?:\/\/\S+$/i.test(s) ? s : '';
  if (q.tipo === 'urls') return s.split('\n').map((x) => x.trim()).filter((x) => /^https?:\/\/\S+$/i.test(x)).slice(0, 20).join('\n');
  if (q.tipo === 'texto') return s.replace(/\n+/g, ' ');
  return s;
}
const vacia = (v) => (Array.isArray(v) ? !v.length : !v);

// Solo las preguntas que existen y con algo dentro.
export function limpiarRespuestas(r, ambito = 'marca') {
  const preg = ambito === 'producto' ? PREG_PRODUCTO : PREG_MARCA;
  const out = {};
  for (const [k, v] of Object.entries(r || {})) {
    const q = preg.get(k);
    if (!q) continue;
    const limpio = limpiarRespuesta(q, v);
    if (!vacia(limpio)) out[k] = limpio;
  }
  return out;
}

export const nuevoIdProducto = () => `p${Math.random().toString(36).slice(2, 9)}`;

export function sanitizeProducto(p) {
  const id = PRODUCTO_ID_RE.test(String(p?.id || '')) ? p.id : nuevoIdProducto();
  return {
    id,
    respuestas: limpiarRespuestas(p?.respuestas, 'producto'),
    ficha: String(p?.ficha || '').trim().slice(0, MAX_FICHA),
    fichaEn: String(p?.fichaEn || '').slice(0, 30),
  };
}

export function sanitizeDocMeta(d) {
  const ext = String(d?.tipo || '').toLowerCase();
  return {
    id: /^d[a-z0-9]{4,14}$/.test(String(d?.id || '')) ? d.id : '',
    nombre: String(d?.nombre || 'Documento').replace(/[<>]/g, '').trim().slice(0, 120) || 'Documento',
    tipo: DOC_EXT.includes(ext) ? ext : 'txt',
    productoId: PRODUCTO_ID_RE.test(String(d?.productoId || '')) ? d.productoId : '',
    chars: Math.max(0, Math.min(MAX_DOC_CHARS, Math.floor(Number(d?.chars) || 0))),
    en: String(d?.en || '').slice(0, 30),
    por: String(d?.por || '').slice(0, 60),
  };
}

// Todo el dato de marca de un cliente.
export function sanitizeMarcaCliente(m) {
  const productos = (Array.isArray(m?.productos) ? m.productos : []).slice(0, MAX_PRODUCTOS).map(sanitizeProducto);
  const ids = new Set();
  const unicos = productos.filter((p) => !ids.has(p.id) && ids.add(p.id));
  const embudos = {};
  for (const [e, p] of Object.entries(m?.embudos || {}).slice(0, 40)) if (/^[a-z0-9-]{1,24}$/.test(e) && ids.has(p)) embudos[e] = p;
  return {
    respuestas: limpiarRespuestas(m?.respuestas, 'marca'),
    productos: unicos,
    docs: (Array.isArray(m?.docs) ? m.docs : []).slice(0, MAX_DOCS).map(sanitizeDocMeta).filter((d) => d.id),
    embudos,
    token: /^[A-Za-z0-9]{24,48}$/.test(String(m?.token || '')) ? m.token : '',
    // Asistente del cliente: en qué paso va y cuándo lo terminó.
    asistente: {
      paso: String(m?.asistente?.paso || '').replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 40),
      completado: String(m?.asistente?.completado || '').slice(0, 30),
      completadoPor: String(m?.asistente?.completadoPor || '').slice(0, 60),
    },
    actualizado: String(m?.actualizado || '').slice(0, 30),
    actualizadoPor: String(m?.actualizadoPor || '').slice(0, 60),
  };
}

// % respondido (de una lista de secciones y sus respuestas).
export function progreso(secciones, r) {
  const qs = preguntasDe(secciones);
  const hechas = qs.filter((q) => !vacia(r?.[q.id])).length;
  return { hechas, total: qs.length, pct: qs.length ? Math.round((hechas / qs.length) * 100) : 0 };
}
export function progresoTotal(m) {
  const partes = [progreso(SECCIONES_MARCA, m?.respuestas), ...(m?.productos || []).map((p) => progreso(SECCIONES_PRODUCTO, p.respuestas))];
  const hechas = partes.reduce((a, x) => a + x.hechas, 0);
  const total = partes.reduce((a, x) => a + x.total, 0) || 1;
  return { hechas, total, pct: Math.round((hechas / total) * 100) };
}

export const nombreDeProducto = (p, i = 0) => p?.respuestas?.nombre || `Producto ${i + 1}`;

// Producto de un embudo: el elegido o, si no, el primero.
export function productoDeEmbudo(m, embudoId) {
  const ps = m?.productos || [];
  return ps.find((p) => p.id === m?.embudos?.[embudoId]) || ps[0] || null;
}

// Respuestas en texto (para los prompts): «Pregunta: respuesta», por secciones.
function respuestasTexto(secciones, r) {
  const out = [];
  for (const s of secciones) {
    const lineas = s.preguntas.filter((q) => !vacia(r?.[q.id])).map((q) => {
      const v = Array.isArray(r[q.id]) ? r[q.id].join(', ') : r[q.id];
      return String(v).includes('\n') ? `- ${q.label}:\n${String(v).split('\n').map((l) => `  ${l}`).join('\n')}` : `- ${q.label}: ${v}`;
    });
    if (lineas.length) out.push(`${s.titulo.toUpperCase()}\n${lineas.join('\n')}`);
  }
  return out.join('\n\n');
}

// Estilo visual (para los prompts de páginas): siempre las respuestas, aunque haya ficha.
export function disenoTexto(m) {
  return respuestasTexto(SECCIONES_MARCA.filter((s) => s.id === 'diseno'), m?.respuestas);
}

// El contexto que llevan todos los prompts: la ficha del producto si ya está hecha; si no, las respuestas.
// '' si no hay nada.
export function contextoMarca(m, producto) {
  if (!m) return '';
  if (producto?.ficha) return producto.ficha;
  const partes = [respuestasTexto(SECCIONES_MARCA.filter((s) => s.id !== 'diseno'), m.respuestas)];
  if (producto) partes.push(respuestasTexto(SECCIONES_PRODUCTO, producto.respuestas));
  return partes.filter(Boolean).join('\n\n');
}

// Prompt para que Claude haga la ficha de marca y avatar de un producto, con todas las respuestas y
// el texto de los documentos (los de la marca y los de ese producto).
export function promptFicha(m, producto, textos = {}) {
  const docs = (m?.docs || []).filter((d) => !d.productoId || d.productoId === producto?.id).filter((d) => textos[d.id]);
  const docsTxt = docs.map((d) => `<documento nombre="${d.nombre}">\n${textos[d.id]}\n</documento>`).join('\n\n');
  return `Eres estratega de marca y copywriter de respuesta directa. Con todo lo de abajo, escribe la FICHA DE MARCA Y AVATAR de «${nombreDeProducto(producto)}», que usaremos como fuente de verdad para escribir páginas de venta, emails y mensajes de WhatsApp.

RESPUESTAS DEL CUESTIONARIO:

${respuestasTexto(SECCIONES_MARCA, m?.respuestas) || '(sin respuestas de la marca)'}

${producto ? respuestasTexto(SECCIONES_PRODUCTO, producto.respuestas) || '(sin respuestas del producto)' : ''}
${docs.length ? `\nDOCUMENTOS (estudios del avatar, transcripciones, encuestas…). Sácales lo más valioso, sobre todo las palabras literales del avatar:\n\n${docsTxt}\n` : ''}
CÓMO LA QUIERO:
- En español de España, en Markdown, entre 1.000 y 2.000 palabras. Concreta y accionable; nada de relleno.
- Secciones, en este orden:
  1. Marca en una frase y quién está detrás (autoridad y su historia en 3-4 líneas).
  2. Tono de voz: cómo suena, reglas (tú/usted, género, emojis), expresiones que sí y palabras prohibidas, y 2-3 frases de ejemplo con su estilo.
  3. Producto: promesa, mecanismo único, qué incluye, precio, bonus, garantía, para quién sí y para quién no.
  4. Avatar: quién es, su día a día, dolores, deseos, miedos, lo que ya probó, creencias a romper y nivel de consciencia.
  5. Objeciones de compra y cómo responder a cada una.
  6. Frases literales del avatar (las más potentes, tal cual).
  7. Ángulos y ganchos de venta que mejor encajan (8-10).
  8. Pruebas: cifras, testimonios y casos.
- Si falta algo importante, no lo inventes: escribe «[FALTA: …]» para que lo completemos.
- Solo la ficha, sin explicaciones antes ni después.`.replace(/\n{3,}/g, '\n\n');
}

// ---- Asistente paso a paso (lo primero que ve el cliente) ----
// Por orden de importancia y en etapas cortas (que quepan en la pantalla). `campos`: ids de preguntas.
// Los pasos de producto se repiten por cada producto («p:<id>:<n>»).
const PASOS_INICIO = [
  { id: 'bienvenida', tipo: 'bienvenida', titulo: 'Bienvenida' },
  { id: 'm1', ambito: 'marca', titulo: 'Empecemos por ti', intro: 'Quién está detrás de la marca y por qué confiar en ti.', campos: ['nombre', 'persona', 'credenciales'] },
  { id: 'm2', ambito: 'marca', titulo: 'Tu historia', intro: 'Las historias venden: cuéntala como se la contarías a una amiga.', campos: ['historia', 'mision'] },
  { id: 'productos', tipo: 'productos', titulo: '¿Qué vendes?', intro: 'Pon el nombre de cada producto o programa que vendes. Después te preguntaremos por cada uno.' },
];
const PASOS_PRODUCTO = [
  { titulo: 'La oferta', campos: ['nombre', 'tipo', 'precio'] },
  { titulo: 'La gran promesa', campos: ['promesa', 'resultados'] },
  { titulo: 'Tu método', campos: ['mecanismo', 'incluye'] },
  { titulo: 'Formato, bonus y garantía', campos: ['formato', 'bonus', 'garantia'] },
  { titulo: 'Para quién es', campos: ['paraQuien', 'paraQuienNo'] },
  { titulo: 'Tu cliente ideal', intro: 'Ahora piensa en la persona que compra este producto.', campos: ['quien', 'diaADia'] },
  { titulo: 'Lo que le duele y lo que sueña', campos: ['dolores', 'deseos'] },
  { titulo: 'Sus miedos', campos: ['miedos', 'probado'] },
  { titulo: 'Lo que le frena', campos: ['objeciones', 'creencias'] },
  { titulo: 'Sus palabras', intro: 'Copia frases tal cual las dice (comentarios, mensajes, encuestas): es oro para los textos.', campos: ['frases', 'consciencia'] },
  { titulo: 'Cómo decide y dónde está', campos: ['decide', 'donde'] },
  { titulo: 'Pruebas y dudas', campos: ['testimonios', 'faq'] },
];
const PASOS_FIN = [
  { id: 't1', ambito: 'marca', titulo: 'Tu tono', intro: 'Cómo suenan tus textos.', campos: ['tono', 'trato', 'genero'] },
  { id: 't2', ambito: 'marca', titulo: 'Tu forma de escribir', campos: ['voz', 'emojis', 'expresiones'] },
  { id: 't3', ambito: 'marca', titulo: 'Ejemplos de tu estilo', campos: ['prohibidas', 'ejemplos', 'antiejemplos'] },
  { id: 'v1', ambito: 'marca', titulo: 'Tus colores', intro: 'Si no los sabes, pon los de tu logo o tu Instagram. Los dos primeros son obligatorios.', campos: ['color1', 'color2', 'color3', 'colorFondo', 'colorTexto'] },
  { id: 'v2', ambito: 'marca', titulo: 'Tu estilo visual', campos: ['estilo', 'fuenteTitulos', 'fuenteTexto'] },
  { id: 'v3', ambito: 'marca', titulo: 'Logo y fotos', campos: ['logo', 'fotos'] },
  { id: 'v4', ambito: 'marca', titulo: 'Referencias de diseño', campos: ['websRef', 'evitar'] },
  { id: 'm3', ambito: 'marca', titulo: 'Lo que defiendes', campos: ['valores', 'enemigo'] },
  { id: 'm4', ambito: 'marca', titulo: 'Confianza y redes', campos: ['cifras', 'redes', 'referentes'] },
  { id: 'docs', tipo: 'docs', titulo: 'Documentos (opcional)', intro: '¿Tienes estudios de tu cliente ideal, encuestas, transcripciones o testimonios? Súbelos aquí.' },
  { id: 'fin', tipo: 'fin', ambito: 'marca', titulo: 'Último paso', campos: ['notas'] },
];
export const PASOS_POR_PRODUCTO = PASOS_PRODUCTO.length;
export const preguntaDe = (ambito, id) => (ambito === 'producto' ? PREG_PRODUCTO : PREG_MARCA).get(id);

// Los pasos del asistente para estas respuestas (con los de cada producto).
export function pasosAsistente(m) {
  const prods = (m?.productos || []).flatMap((p, i) => PASOS_PRODUCTO.map((x, n) => ({
    ...x, id: `p:${p.id}:${n + 1}`, ambito: 'producto', productoId: p.id,
    titulo: `${nombreDeProducto(p, i)} · ${x.titulo}`,
  })));
  return [...PASOS_INICIO, ...prods, ...PASOS_FIN];
}
const respuestasDe = (m, paso) => (paso.ambito === 'producto' ? m?.productos?.find((p) => p.id === paso.productoId)?.respuestas : m?.respuestas) || {};
// Obligatorias sin responder de un paso: [pregunta].
export function faltanEnPaso(m, paso) {
  if (paso.tipo === 'productos') return m?.productos?.length ? [] : [{ id: 'productos', label: 'Al menos un producto' }];
  const r = respuestasDe(m, paso);
  return (paso.campos || []).map((id) => preguntaDe(paso.ambito, id)).filter((q) => q && !q.opcional && vacia(r[q.id]));
}
// Lo que falta en todo el asistente: [{ paso, pregunta }].
export function faltanObligatorias(m) {
  return pasosAsistente(m).flatMap((paso) => faltanEnPaso(m, paso).map((q) => ({ paso: paso.id, titulo: paso.titulo, label: q.label })));
}
export const asistenteCompleto = (m) => Boolean(m?.asistente?.completado);
