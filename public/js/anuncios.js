// Anuncios con IA (pestaña Plan → Anuncios): por cada objetivo del embudo (captación, retargeting de
// consumo, venta), prompts para Claude basados en los anuncios ganadores (si hay histórico) y en la ficha
// de marca, avatar y producto:
//   · guiones de vídeo
//   · creación de los anuncios en Magnific (conector MCP de Claude): kit de marca, imágenes y vídeos
//   · copys para Meta (2-3 generales, con emojis)
// El dashboard no llama a ninguna IA: prepara el prompt con todo y se pega en Claude.

// Objetivos de cada tipo de embudo. `publico`: a quién va; `meta`: qué tiene que conseguir; `cta`: botón.
export const OBJETIVOS = {
  lanzamientos: [
    { id: 'captacion', icono: '🧲', titulo: 'Captación al directo', publico: 'Público frío (no nos conoce) y templado (nos sigue, aún no está registrado).',
      meta: 'Que se registre GRATIS al directo / a las clases. El anuncio vende el evento gratuito (la promesa de lo que va a descubrir), no el producto de pago.', cta: 'Registrarte gratis' },
    { id: 'consumo', icono: '🔁', titulo: 'Retargeting de consumo', publico: 'Personas ya registradas (y quien visitó la página de registro sin registrarse).',
      meta: 'Que consuman: vean las clases de la preclase, rellenen la encuesta, se unan al grupo de WhatsApp y, sobre todo, que ASISTAN al directo en vivo (recordatorio, curiosidad por lo que verán, urgencia por la hora).', cta: 'Ver la clase / Apuntarte al directo' },
    { id: 'venta', icono: '💳', titulo: 'Venta del producto', publico: 'Registradas que vieron el directo o la grabación y no han comprado (carrito abierto).',
      meta: 'Que compren el programa antes del cierre del carrito: transformación, prueba social, objeciones resueltas, bonus y urgencia real (fecha de cierre).', cta: 'Inscribirte ahora' },
  ],
  vsl: [
    { id: 'captacion', icono: '🧲', titulo: 'Captación', publico: 'Público frío y templado.',
      meta: 'Que deje sus datos para ver el contenido gratuito (VSL, lead magnet, webinar grabado o aplicación).', cta: 'Verlo gratis' },
    { id: 'consumo', icono: '🔁', titulo: 'Retargeting de consumo', publico: 'Registradas que aún no han visto el contenido entero.',
      meta: 'Que vuelvan y vean el contenido completo (o agenden la llamada).', cta: 'Ver ahora' },
    { id: 'venta', icono: '💳', titulo: 'Venta', publico: 'Quien vio el contenido y no ha comprado.',
      meta: 'Que compre (o reserve la llamada): resultados, prueba social y objeciones.', cta: 'Quiero empezar' },
  ],
  meteorico: [
    { id: 'consumo', icono: '🔁', titulo: 'Calentamiento', publico: 'Base caliente: registradas y compradoras anteriores.',
      meta: 'Generar expectación por la oferta flash antes de que se abra (que estén atentas al día y la hora).', cta: 'Avisarme' },
    { id: 'venta', icono: '💳', titulo: 'Venta de la oferta', publico: 'Base caliente durante la oferta.',
      meta: 'Que compren la oferta flash antes de que se cierre: qué incluye, precio especial, bonus por tiempo y cuenta atrás.', cta: 'Lo quiero' },
  ],
  directa: [
    { id: 'venta', icono: '💳', titulo: 'Venta directa (frío)', publico: 'Público frío.',
      meta: 'Que compre el producto de entrada directamente desde el anuncio (low ticket): problema concreto, solución rápida, precio irresistible.', cta: 'Comprar ahora' },
    { id: 'consumo', icono: '🔁', titulo: 'Retargeting', publico: 'Quien visitó la página de venta o el checkout y no compró.',
      meta: 'Que vuelva y termine la compra: objeciones, garantía, prueba social y recordatorio del precio.', cta: 'Terminar mi compra' },
  ],
};
export const objetivosDe = (tipo) => OBJETIVOS[tipo] || OBJETIVOS.lanzamientos;

const pct = (x) => `${Math.round((x || 0) * 1000) / 10}`.replace('.', ',') + ' %';
const eur = (x) => (x == null ? '' : `${Math.round(x)} €`);

// Los mejores anuncios en texto (de rankingGanadores o historicoAnuncios): por ventas y por leads.
export function ganadoresTexto(filas = [], { max = 6 } = {}) {
  const linea = (r) => `- «${r.label}»: ${r.leads} leads${r.compras ? `, ${r.compras} ventas (${pct(r.conversion)})` : ''}${r.spend ? ` · inversión ${eur(r.spend)}${r.cac ? ` · coste por venta ${eur(r.cac)}` : ''}${r.roas != null ? ` · ROAS ${r.roas.toFixed(1).replace('.', ',')}x` : ''}` : ''}${r.campaign ? ` · campaña «${r.campaign}»` : ''}`;
  const orden = [...filas].sort((a, b) => (b.compras - a.compras) || ((b.ingresos || 0) - (a.ingresos || 0)) || (b.leads - a.leads));
  const porVentas = orden.filter((r) => r.compras > 0).slice(0, max);
  const porLeads = orden.filter((r) => !porVentas.includes(r)).sort((a, b) => b.leads - a.leads).slice(0, Math.max(0, max - porVentas.length)).filter((r) => r.leads >= 5);
  return [
    porVentas.length ? `Los que más VENDEN:\n${porVentas.map(linea).join('\n')}` : '',
    porLeads.length ? `Los que más LEADS traen (sin ventas todavía):\n${porLeads.map(linea).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

const POLITICAS = `- Cumple las políticas de Meta: nada de aludir a atributos personales de quien lo lee («¿Estás embarazada?», «¿Tienes ansiedad?» → mejor «Para mamás que…», «Muchas mujeres…»), nada de antes/después, ni promesas de resultados de salud o garantizados, ni lenguaje alarmista.`;

function base({ objetivo, tipoTexto, nombreEmbudo, marca, datos, urls, contexto, diseno, ganadores, notas }) {
  const enlaces = Object.entries(urls || {}).filter(([, u]) => u).map(([k, u]) => `- ${k}: ${u}`).join('\n');
  return `CONTEXTO
- Cliente: ${marca || '(sin nombre)'} · Embudo: ${tipoTexto}${nombreEmbudo ? ` «${nombreEmbudo}»` : ''}.
- OBJETIVO DE ESTOS ANUNCIOS: ${objetivo.titulo}. ${objetivo.meta}
- A quién van: ${objetivo.publico}
- Llamada a la acción: «${objetivo.cta}».

DATOS DEL EMBUDO:
${datos.join('\n') || '(sin datos)'}
${enlaces ? `\nENLACES:\n${enlaces}\n` : ''}
${contexto ? `MARCA, AVATAR Y PRODUCTO (la fuente de verdad: usa sus palabras, dolores, deseos y objeciones):\n<marca>\n${contexto}\n</marca>\n` : 'MARCA Y AVATAR: aún no hay ficha; pregunta lo imprescindible antes de inventar.\n'}
${diseno ? `ESTILO VISUAL DE LA MARCA:\n${diseno}\n` : ''}
${ganadores ? `ANUNCIOS GANADORES (de los datos reales del dashboard; replica lo que funciona: ángulo, gancho, formato y mensaje, sin copiarlos literalmente):\n${ganadores}\nSi tienes el conector de Meta, búscalos por su nombre en la cuenta publicitaria y mira su creativo (texto, titular, imagen o vídeo) antes de empezar.\n` : 'ANUNCIOS GANADORES: aún no hay histórico. Basa los ángulos en la ficha (dolores, deseos, objeciones y frases literales del avatar) y propón ángulos distintos para testear.\n'}
${notas ? `NOTAS SOBRE LOS ANUNCIOS QUE HAN FUNCIONADO:\n${notas}\n` : ''}`;
}

// Lo que se pide en cada parte (se reutiliza en «Todo en uno»).
const reqGuiones = (ctx) => `- 5 guiones, cada uno con un ángulo distinto (dolor, deseo, objeción, historia, prueba social…), en español de España y con el tono de la marca.
- Cada guion: título del ángulo · duración (15-45 s) · formato (a cámara / UGC / voz en off con imágenes) y, por escenas: [segundo] lo que se VE · lo que se DICE · el TEXTO en pantalla.
- Gancho potente en los 3 primeros segundos (visual y hablado) y la llamada a la acción del final: «${ctx.objetivo.cta}».
- Subtítulos siempre (la mayoría lo ve sin sonido) y frases cortas.`;
const reqCopys = (ctx) => `Generales (valen para todos los creativos de este objetivo; no uno por anuncio):
- 3 TEXTOS PRINCIPALES con emojis (con medida, en el tono de la marca): uno corto (2-3 líneas), uno medio y uno largo tipo historia. El gancho en la primera línea (es lo único que se ve sin «ver más»).
- 5 TITULARES (máx. 40 caracteres) y 3 DESCRIPCIONES (máx. 30 caracteres).
- La llamada a la acción: «${ctx.objetivo.cta}» (y qué botón de Meta elegir).
- Listo para copiar y pegar.`;
const carpetaDe = (ctx) => `${ctx.marca || 'Cliente'} · ${ctx.nombreEmbudo || ctx.tipoTexto} · ${ctx.objetivo.titulo}`;
const reqMagnific = (ctx) => `1. Kit de marca: busca uno de «${ctx.marca || 'la marca'}» (brand_kit_list); si no hay, créalo con los colores, las tipografías y el logo del estilo visual de arriba. Úsalo en todo.
2. Antes de generar nada, enséñame el PLAN: 6 anuncios de imagen (ángulos distintos, basados en los ganadores o en la ficha) y 3 vídeos cortos (a partir de los mejores ganchos), con el texto que llevará cada uno, y el COSTE ESTIMADO en créditos (simulate_cost). Espera a que te diga «adelante».
3. Imágenes: cada anuncio en 1:1 (1080×1080, feed), 4:5 (1080×1350) y 9:16 (1080×1920, Stories/Reels; deja libres los 250 px de arriba y de abajo). Texto en pantalla corto y legible (máx. 6-8 palabras), con contraste y en los colores de la marca. Si hay fotos de la marca, úsalas como referencia; si no, fotografía realista que represente al avatar (no ilustraciones genéricas de stock).
4. Vídeos: 9:16, 15-30 s, gancho visual en el primer segundo, subtítulos grandes y voz en off en español de España (elige una voz acorde a la marca). Cierra con la llamada a la acción: «${ctx.objetivo.cta}».
5. Guárdalo todo en una carpeta «${carpetaDe(ctx)}» y al terminar dame la lista: nombre de cada anuncio (ponlo igual en Meta: así el dashboard sabrá cuál gana), formato y enlace.
- Nada de logos ni marcas de terceros, ni personas famosas.`;
const fin = (s) => s.replace(/\n{3,}/g, '\n\n');

// Guiones de vídeo.
export const promptGuiones = (ctx) => fin(`Usa tu skill de copy de venta si la tienes. Escribe GUIONES DE VÍDEO para anuncios de Meta (Reels, Stories y feed).

${base(ctx)}
QUÉ QUIERO:
${reqGuiones(ctx)}
${POLITICAS}
- Si falta un dato, pon [FALTA: …].`);

// Copys para Meta.
export const promptCopys = (ctx) => fin(`Usa tu skill de copy de venta si la tienes. Escribe los TEXTOS para los anuncios de Meta (Ads Manager).

${base(ctx)}
QUÉ QUIERO:
${reqCopys(ctx)}
${POLITICAS}
- Español de España. Si falta un dato, pon [FALTA: …]. Sin explicaciones.`);

// Crear los anuncios en Magnific (conector MCP): kit de marca, imágenes y vídeos.
export const promptMagnific = (ctx) => fin(`Crea los ANUNCIOS (imágenes y vídeos) para Meta con el conector de MAGNIFIC.

${base(ctx)}
CÓMO HACERLO CON MAGNIFIC:
${reqMagnific(ctx)}
${POLITICAS}`);

// Todo seguido: guiones, copys y creación en Magnific (parando en cada paso).
export const promptTodo = (ctx) => fin(`Vamos a preparar la tanda completa de anuncios de Meta para este objetivo, en 3 pasos. Usa tu skill de copy de venta si la tienes. Al terminar cada paso, para y espera mi OK.

${base(ctx)}
PASO 1 · GUIONES DE VÍDEO:
${reqGuiones(ctx)}

PASO 2 · TEXTOS PARA META:
${reqCopys(ctx)}

PASO 3 · CREAR LOS ANUNCIOS CON EL CONECTOR DE MAGNIFIC (con los mejores guiones y textos de los pasos 1 y 2):
${reqMagnific(ctx)}

EN TODO:
${POLITICAS}
- Español de España. Si falta un dato, pon [FALTA: …].`);

export const PROMPTS_ANUNCIOS = [
  { id: 'todo', icono: '⚡', titulo: 'Todo en uno', desc: 'Guiones → textos → creación en Magnific, paso a paso', fn: promptTodo },
  { id: 'guiones', icono: '🎬', titulo: 'Guiones de vídeo', desc: '5 guiones con gancho, escenas y texto en pantalla', fn: promptGuiones },
  { id: 'magnific', icono: '🖼️', titulo: 'Crear en Magnific', desc: 'Imágenes 1:1, 4:5, 9:16 y vídeos con el kit de marca', fn: promptMagnific },
  { id: 'copys', icono: '✍️', titulo: 'Copys para Meta', desc: '3 textos con emojis, titulares y descripciones', fn: promptCopys },
];
