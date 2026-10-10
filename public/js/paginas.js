// Páginas del embudo con IA (pestaña Plan → Páginas): por cada página, un prompt para Claude con la marca
// y el avatar (Marca y avatar), el estilo visual, los datos del embudo y los códigos del dashboard que
// tiene que llevar. Claude devuelve un único bloque HTML que se pega en un elemento «Código personalizado» de GHL.
//   buscar: textos del título de los códigos de «Códigos para GHL» que van en esa página (lanzamientos)
//   formulario: 'registro' | 'pago' → hueco para el formulario de GHL

export const PAGINAS = {
  lanzamientos: [
    { id: 'registro', nombre: 'Página de registro', formulario: 'registro', buscar: ['REGISTRO ·'],
      objetivo: 'Que se registre a las clases / webinar gratis. Una sola acción en toda la página: el formulario.',
      secciones: ['Arriba del todo: titular con la gran promesa, subtítulo, fecha y hora del directo y el formulario (o un botón que baja a él)', 'Para quién es (y para quién no)', 'Qué va a descubrir: 3-5 puntos con beneficio, no temario', 'Quién lo imparte: autoridad e historia breve', 'Prueba social: testimonios, cifras', 'Preguntas frecuentes (gratis, horario, grabación…)', 'Repetir el formulario al final'] },
    { id: 'gracias', nombre: 'Página de gracias (tras el registro)', buscar: ['botón del grupo de WhatsApp', 'añadir el directo al calendario', 'oferta VIP'],
      extra: ({ script }) => [['GRACIAS · bloque base de la página (pinta fecha, hora, cuentas atrás y enlaces)', `<div data-lsd-page="gracias" data-launch="auto"></div>\n${script}`], ['GRACIAS · vídeo de la página de gracias (se oculta si no hay)', '<div data-lsd-embed="gracias"></div>']],
      objetivo: 'Confirmar la plaza y conseguir 3 acciones por orden: unirse al grupo de WhatsApp, añadir el directo al calendario y (si hay entrada VIP) comprarla.',
      secciones: ['«¡Ya tienes tu plaza!» con fecha y hora', 'Paso 1: unirse al grupo de WhatsApp (botón grande; es donde se avisa de todo)', 'Paso 2: añadir el directo al calendario', 'Vídeo corto de bienvenida (si hay)', 'Entrada VIP: qué incluye, precio y cuenta atrás (si la hay)'] },
    { id: 'login', nombre: 'Página de acceso a las clases (login)', buscar: ['LOGIN ·'],
      objetivo: 'Que entre a las clases con el email del registro, sin fricción.',
      secciones: ['Titular corto de bienvenida', 'El bloque de acceso (pide el email)', 'Ayuda: «¿no te llega? usa el email con el que te registraste»'] },
    { id: 'preclase', nombre: 'Página preclase (clases y recursos)', buscar: ['RECURSOS ·'],
      objetivo: 'Que consuma cada clase y recurso según se desbloquea, participe y llegue con ganas al directo (y compre la VIP si la hay).',
      secciones: ['Barra de urgencia arriba', 'Bienvenida y cómo funciona (las etapas se van abriendo)', 'Una caja por etapa con su imagen, su vídeo o recurso y su estado (bloqueada / disponible / hecha)', 'Encuesta para desbloquear las clases', 'Grupo de WhatsApp y añadir el directo al calendario', 'Oferta VIP (si la hay)', 'Botón al directo (se activa a su hora)'] },
    { id: 'venta', nombre: 'Página de venta', buscar: ['VENTA ·', 'WHATSAPP · botón flotante', 'INSCRIBIRME ·'],
      objetivo: 'Que se inscriba en el programa: llevarla a la página de pago.',
      secciones: ['Titular con la transformación y botón de inscripción', 'El problema y lo que ya ha probado (con sus palabras)', 'La solución y el método', 'Qué incluye (módulos, sesiones, comunidad…)', 'Bonus (con su valor) y cuenta atrás', 'Testimonios y casos', 'Para quién es / para quién no', 'Precio y formas de pago (con anclaje de valor)', 'Garantía', 'Quién lo imparte', 'Preguntas frecuentes (respondiendo las objeciones)', 'Cierre con urgencia y botón'] },
    { id: 'pago', nombre: 'Página de pago', formulario: 'pago', buscar: ['PAGO ·'],
      objetivo: 'Que complete el pago sin dudas.',
      secciones: ['Resumen de lo que se lleva y del precio (pago único o plazos)', 'Formulario de pago de GHL', 'Garantía y pago seguro', '2-3 testimonios cortos', 'Preguntas frecuentes de pago', 'WhatsApp para dudas'] },
    { id: 'grabacion', nombre: 'Página de la grabación (replay)', buscar: ['GRABACIÓN ·', 'INSCRIBIRME ·', 'WHATSAPP · botón flotante'],
      objetivo: 'Que vea la grabación antes de que caduque y se inscriba.',
      secciones: ['Barra con la cuenta atrás de la grabación', 'El vídeo', 'Resumen de la oferta con botón de inscripción', 'Testimonios', 'Preguntas frecuentes', 'WhatsApp para dudas'] },
  ],
  vsl: [
    { id: 'registro', nombre: 'Página de registro', formulario: 'registro', objetivo: 'Que deje sus datos para ver el contenido.',
      secciones: ['Titular con la promesa del contenido y formulario', 'Qué va a ver / conseguir (3 puntos)', 'Quién lo imparte', 'Prueba social'], buscar: ['Al final de la URL'] },
    { id: 'vsl', nombre: 'Página del contenido (VSL)', buscar: ['PÁGINA DE LA VSL'], objetivo: 'Que vea el vídeo y pulse comprar o agendar la llamada.',
      secciones: ['Titular corto y el vídeo arriba del todo', 'Los botones de compra / llamada (aparecen con el vídeo)', 'Resumen de la oferta', 'Testimonios', 'Preguntas frecuentes'] },
    { id: 'gracias', nombre: 'Página de gracias del registro', buscar: ['GRACIAS DEL REGISTRO'], objetivo: 'Confirmar y llevarla a ver el contenido ya.',
      secciones: ['Confirmación', 'Vídeo corto (si hay)', 'Botón para ver el contenido'] },
    { id: 'gracias-llamada', nombre: 'Página de gracias de la llamada', buscar: ['GRACIAS DE LA LLAMADA'], soloLlamadas: true, objetivo: 'Que se presente a la llamada preparada.',
      secciones: ['Confirmación de la cita', 'Vídeo: qué pasará en la llamada (si hay)', 'Qué preparar antes', 'Testimonios para llegar convencida'] },
  ],
  meteorico: [
    { id: 'oferta', nombre: 'Página de la oferta (meteórico)', buscar: ['OFERTA ·'], objetivo: 'Que compre la oferta flash antes de que se cierre.',
      secciones: ['Cuenta atrás y titular de la oferta', 'Qué incluye y su valor', 'Bonus por tiempo', 'Precio y botón de compra', 'Testimonios', 'Preguntas frecuentes', 'Cierre con urgencia'] },
  ],
  directa: [
    { id: 'venta', nombre: 'Página de venta', buscar: ['Página de venta'], objetivo: 'Que pulse «Comprar» (anuncio → venta directa de un producto de entrada).',
      secciones: ['Titular con el resultado y botón', 'El problema con sus palabras', 'Qué es el producto y qué consigue', 'Qué incluye', 'Testimonios', 'Precio con anclaje (low ticket)', 'Garantía', 'Preguntas frecuentes', 'Botón final'] },
    { id: 'checkout', nombre: 'Checkout (formulario de pago con bumps)', formulario: 'pago', buscar: ['Checkout'], objetivo: 'Que pague y añada los bump offers.',
      secciones: ['Resumen del producto y precio', 'Formulario de pago de GHL con los bump offers (presentados como «añade por solo…»)', 'Garantía y pago seguro', 'Testimonios cortos'] },
    { id: 'upsell', nombre: 'Página del upsell', buscar: ['upsell'], parte: 'upsell', objetivo: 'Que añada el upsell con un clic justo después de comprar.',
      secciones: ['«¡Espera! Tu pedido casi está»', 'Por qué el upsell completa lo que ha comprado', 'Qué incluye y precio especial solo ahora', 'Botón «Sí, lo añado» y enlace «No, gracias»'] },
    { id: 'downsell', nombre: 'Página del downsell', buscar: ['downsell'], parte: 'downsell', objetivo: 'Que se lleve la versión reducida si dijo que no al upsell.',
      secciones: ['«Entendido, ¿y si…?»', 'La versión reducida y su precio', 'Botón sí / no'] },
    { id: 'gracias', nombre: 'Página de gracias / acceso', buscar: ['gracias'], objetivo: 'Confirmar la compra, dar el acceso y abrir la puerta al siguiente paso.',
      secciones: ['Confirmación y cómo acceder', 'Primeros pasos', 'Invitación al siguiente paso (grupo, comunidad o programa principal)'] },
  ],
};

export const paginasDe = (tipo, { partes = null, sinLlamadas = false } = {}) => (PAGINAS[tipo] || [])
  .filter((p) => (!p.parte || !partes || partes[p.parte]) && !(p.soloLlamadas && sinLlamadas));

// Códigos de una página entre todos los del embudo ([[título, código]]): los que casan con `buscar` + los extra.
export function codigosDePagina(pagina, todos, ctx = {}) {
  const b = (pagina.buscar || []).map((x) => x.toLowerCase());
  const elegidos = todos.filter(([t]) => b.some((x) => t.toLowerCase().includes(x)));
  return [...(pagina.extra ? pagina.extra(ctx) : []), ...elegidos];
}

const FORMULARIO = {
  registro: 'El formulario de registro es de GHL (no lo hagas tú): deja el comentario <!-- FORMULARIO DE REGISTRO DE GHL --> donde vaya y dale espacio en el diseño.',
  pago: 'El formulario de pago es de GHL (no lo hagas tú): deja el comentario <!-- FORMULARIO DE PAGO DE GHL --> donde vaya y dale espacio en el diseño.',
};

// El prompt de una página.
export function promptPagina({ pagina, nombreEmbudo = '', marca = '', datos = [], contexto = '', diseno = '', codigos = [], notas = '', urls = {} }) {
  const cods = codigos.map(([t, c]) => `<!-- ${t} -->\n${c}`).join('\n\n');
  const enlaces = Object.entries(urls).filter(([, u]) => u).map(([k, u]) => `- ${k}: ${u}`).join('\n');
  return `Eres diseñador web de conversión y copywriter de respuesta directa (usa tu skill de copy de venta si la tienes). Crea la ${pagina.nombre.toLowerCase()} de ${nombreEmbudo ? `«${nombreEmbudo}»` : 'este embudo'}${marca ? ` de ${marca}` : ''}.

OBJETIVO DE LA PÁGINA: ${pagina.objetivo}

ESTRUCTURA RECOMENDADA (adáptala si ves algo mejor):
${pagina.secciones.map((x, i) => `${i + 1}. ${x}`).join('\n')}

DATOS DEL EMBUDO:
${datos.join('\n') || '(sin datos: usa [FALTA: …] donde haga falta)'}
${enlaces ? `\nENLACES:\n${enlaces}\n` : ''}
${contexto ? `MARCA Y AVATAR (la fuente de verdad: tono, palabras, dolores, deseos y objeciones del avatar):\n<marca>\n${contexto}\n</marca>\n` : ''}
${diseno ? `ESTILO VISUAL DE LA MARCA:\n${diseno}\n` : 'ESTILO VISUAL: no hay guía de marca; propón un diseño limpio, cálido y profesional.\n'}
${codigos.length ? `CÓDIGOS DEL DASHBOARD (OBLIGATORIOS): ponen fechas, cuentas atrás, vídeos, enlaces y miden las visitas. Inclúyelos TAL CUAL en su sitio: no cambies ni quites sus atributos data-lsd-* ni el <script>; puedes envolverlos en tu HTML y darles estilo con CSS (los enlaces data-lsd-link reciben su URL solos: no les pongas href). Los que no se vean (bloques base) ponlos al final.\n${cods}\n` : ''}
${pagina.formulario ? `${FORMULARIO[pagina.formulario]}\n` : ''}${notas ? `\nINDICACIONES PARA ESTA PÁGINA:\n${notas}\n` : ''}
CÓMO LO QUIERO:
- UN ÚNICO bloque HTML autocontenido para pegarlo en un elemento «Código personalizado» (Custom HTML) de GoHighLevel: el HTML y un <style> con todo el CSS. Sin JavaScript propio.
- Todas las clases con un prefijo propio (p. ej. .lp-) para no chocar con los estilos de GHL. Nada de estilos sobre body, html ni etiquetas sueltas.
- Mobile-first (la mayoría entra desde el móvil), ancho máximo ~1100 px, botones grandes y visibles, buen contraste, imágenes con alt.
- Tipografías de Google Fonts con <link>. Imágenes: usa los enlaces que te doy; si falta alguna, deja el hueco con <!-- IMAGEN: qué debería ser -->.
- Copy en español de España, con el tono de la marca y las palabras del avatar: titulares concretos, beneficios antes que características, sin promesas que la marca no pueda cumplir.
- Si falta un dato, no lo inventes: pon [FALTA: …].
- Responde solo con el código, sin explicaciones antes ni después.`.replace(/\n{3,}/g, '\n\n');
}
