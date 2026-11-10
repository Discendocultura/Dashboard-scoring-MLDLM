// 🚀 Montaje con IA (Crear → Montaje): la operativa de un lanzamiento nuevo por fases, para que Claude haga sola todo lo
// posible y una persona admin apruebe cada fase antes de pasar a la siguiente. Para todos los clientes.
//   1 Narrativa e identidad visual · 2 Contenido y producto · 3 Copy de las páginas · 4 Páginas en GHL
//   5 Emails y WhatsApp · 6 Automatizaciones en GHL
// Claude trabaja con el conector de AlquimIA («montaje_lanzamiento» para leer qué toca y «guardar_fase_montaje» para
// dejar lo hecho) y, en las fases de GHL (páginas y automatizaciones), desde el navegador (Claude in Chrome o Cowork):
// la API pública de GHL no crea páginas de embudo ni workflows.
// Se guarda por lanzamiento: montaje = { fases: { [id]: { estado, piezas: { [id]: { texto, url, colores, hecho } },
//   nota, cambios, aprobada: { por, at }, actualizado: { por, at, origen } } }, registro: [...] }
// Lo usan el navegador (la pestaña), el servidor (lib/montaje.js) y el conector (lib/mcp-tools.js).
import { paginasDe } from './paginas.js';
import { automatizacionesDe, autoCtx, promptAutomatizacion } from './automatizaciones.js';
import { calendarioEmails, calendarioWhatsapp } from './emails-ia.js';

export const ESTADOS_FASE = {
  bloqueada: { label: 'Bloqueada', corto: 'Esperando la anterior', color: 'gris', icono: 'lock' },
  pendiente: { label: 'Por empezar', corto: 'Lista para la IA', color: 'gris', icono: 'clock' },
  trabajando: { label: 'La IA está en ello', corto: 'En curso', color: 'azul', icono: 'sparkle' },
  revisar: { label: 'Para revisar', corto: 'Espera tu aprobado', color: 'ambar', icono: 'eye' },
  cambios: { label: 'Cambios pedidos', corto: 'Vuelve a la IA', color: 'rojo', icono: 'pencil' },
  aprobada: { label: 'Aprobada', corto: 'Hecha', color: 'verde', icono: 'check' },
};
const GUARDADOS = new Set(['pendiente', 'trabajando', 'revisar', 'cambios', 'aprobada']);

// Las 4 páginas que se montan (de las del embudo de lanzamientos, en public/js/paginas.js).
export const PAGINAS_MONTAJE = ['registro', 'gracias', 'grabacion', 'venta'];
const NOMBRE_PAGINA = { registro: 'Registro', gracias: 'Gracias', grabacion: 'Replay', venta: 'Venta' };
const paginasMontaje = () => {
  const todas = paginasDe('lanzamientos');
  return PAGINAS_MONTAJE.map((id) => todas.find((p) => p.id === id)).filter(Boolean);
};

// tipo de pieza: 'texto' (lo escribe la IA) · 'ghl' (se monta en GHL: URL y «hecho») · 'logo' (URL de imagen o SVG)
// · 'colores' (texto + lista de colores en hexadecimal).
export const FASES = [
  {
    id: 'identidad', n: 1, titulo: 'Narrativa e identidad visual', corto: 'Narrativa', icono: 'sparkle', emoji: '🧭',
    objetivo: 'La gran idea del lanzamiento y cómo se ve: de aquí beben el copy, las páginas, los anuncios y los mensajes.',
    piezas: () => [
      { id: 'narrativa', titulo: 'Narrativa', tipo: 'texto', que: 'La metáfora central con su referente reconocible: el viaje del avatar, el nombre de cada clase o etapa, el vocabulario y lo que la hace distinta. Al aprobar la fase, se guarda como la narrativa del lanzamiento.' },
      { id: 'paleta', titulo: 'Colores', tipo: 'colores', que: 'De 3 a 6 colores (con su código #RRGGBB) y para qué se usa cada uno. Parte de los colores de la marca.' },
      { id: 'simbolos', titulo: 'Símbolos', tipo: 'texto', que: 'Los símbolos e iconos de la narrativa (como la concha y las flechas amarillas del Camino de Santiago) y dónde va cada uno.' },
      { id: 'tipografias', titulo: 'Tipografías', tipo: 'texto', opcional: true, que: 'Las tipografías de títulos y textos (de Google Fonts), si cambian respecto a las de la marca.' },
      { id: 'logo', titulo: 'Logo del lanzamiento', tipo: 'logo', que: 'El logo del lanzamiento: un SVG o la URL de la imagen (por ejemplo, hecha en Canva).' },
    ],
  },
  {
    id: 'contenido', n: 2, titulo: 'Contenido y producto', corto: 'Contenido', icono: 'book', emoji: '🎓',
    objetivo: 'Qué se enseña gratis (clases o webinar) y qué se vende al final, con su oferta.',
    piezas: () => [
      { id: 'clases', titulo: 'Contenido gratuito', tipo: 'texto', que: 'Cada clase o el webinar: título dentro de la narrativa, la idea clave, lo que descubre el avatar, la creencia que rompe y cómo lleva a la siguiente.' },
      { id: 'producto', titulo: 'Producto', tipo: 'texto', que: 'Nombre, promesa, para quién es, entregables (módulos, sesiones, comunidad…), duración y formato.' },
      { id: 'oferta', titulo: 'Oferta', tipo: 'texto', que: 'Precio (y fraccionado), bonus con su ventana (en directo, 24 h, 48 h, todo el carrito), garantía y entrada VIP si la hay.' },
    ],
  },
  {
    id: 'copy', n: 3, titulo: 'Copy de las páginas', corto: 'Copy', icono: 'pencil', emoji: '✍️',
    objetivo: 'Los textos definitivos de cada página (registro, gracias, replay y venta), sección a sección. Se revisan y se editan aquí antes de aprobar: las páginas se montan ya con este copy.',
    piezas: () => paginasMontaje().map((p) => ({ id: p.id, titulo: `Copy de ${NOMBRE_PAGINA[p.id].toLowerCase()}`, tipo: 'texto', que: `El texto de cada sección de la página de ${NOMBRE_PAGINA[p.id].toLowerCase()}, en orden (${(p.secciones || []).join(' · ')}), con titulares, subtítulos y botones.` })),
  },
  {
    id: 'paginas', n: 4, titulo: 'Páginas del embudo en GHL', corto: 'Páginas', icono: 'layout', emoji: '🧱',
    objetivo: 'Montar en GoHighLevel las páginas de registro, gracias, replay y venta con el copy aprobado, el diseño de la fase 1 y los códigos de AlquimIA.',
    piezas: () => paginasMontaje().map((p) => ({ id: p.id, titulo: NOMBRE_PAGINA[p.id], tipo: 'ghl', que: `${p.objetivo} Secciones: ${(p.secciones || []).join(' · ')}.` })),
  },
  {
    id: 'mensajes', n: 5, titulo: 'Emails y WhatsApp', corto: 'Mensajes', icono: 'mail', emoji: '💬',
    objetivo: 'La secuencia de emails y los mensajes del grupo de WhatsApp de todo el lanzamiento, siguiendo el calendario y lo que funcionó en los anteriores.',
    piezas: () => [
      { id: 'emails', titulo: 'Emails', tipo: 'texto', que: 'Cada email con cuándo sale (día y hora), a quién, asunto, preheader y cuerpo. En el orden del calendario.' },
      { id: 'whatsapp', titulo: 'WhatsApp', tipo: 'texto', que: 'Cada mensaje del grupo con cuándo sale (día y hora) y su texto, en el orden del calendario.' },
    ],
  },
  {
    id: 'automatizaciones', n: 6, titulo: 'Automatizaciones en GHL', corto: 'Automatizaciones', icono: 'gear', emoji: '⚙️',
    objetivo: 'Crear en GoHighLevel, desde el navegador, los workflows del lanzamiento, en su carpeta y en borrador.',
    piezas: (ctx) => automatizacionesDe(ctx.auto || autoCtx('lanzamientos', {}, { code: ctx.code || '' })).map((a) => ({ id: `wf-${a.id}`, titulo: a.nombre, tipo: 'ghl', que: a.para, faltan: a.faltan })),
  },
];
// Guías que se suben en Marca y avatar → Documentos («Qué es»): entran tal cual en la fase que toca.
export const GUIAS = {
  emails: { titulo: 'Guía de emails', fase: 'mensajes', desc: 'estructura, persuasión, tono y longitud de los emails' },
  copy: { titulo: 'Guía de copy', fase: 'copy', desc: 'cómo se escribe el copy de las páginas' },
  automatizaciones: { titulo: 'Guía de automatizaciones', fase: 'automatizaciones', desc: 'lo que lleva siempre cada workflow de GHL' },
};
export const FASE = Object.fromEntries(FASES.map((f) => [f.id, f]));
export const esFase = (id) => Boolean(FASE[id]);

export const MAX_TEXTO = 60_000;
const MAX_URL = 2000;
const MAX_NOTA = 4000;
const HEX = /^#[0-9a-f]{6}$/i;
const limpiarTexto = (v, max = MAX_TEXTO) => String(v ?? '').replace(/\r\n/g, '\n').slice(0, max);
const limpiarUrl = (v) => {
  const u = String(v ?? '').trim().slice(0, MAX_URL);
  return /^https?:\/\/[^\s<>"']+$/i.test(u) ? u : '';
};
export const coloresDe = (v) => [...new Set((Array.isArray(v) ? v : String(v || '').match(/#[0-9a-f]{6}\b/gi) || [])
  .map((c) => String(c).trim().toLowerCase()).filter((c) => HEX.test(c)))].slice(0, 12);
// Un SVG se guarda como texto, sin scripts ni eventos (se pinta siempre como imagen, nunca dentro de la página).
export const esSvg = (t) => /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(String(t || ''));
export const svgLimpio = (t) => String(t || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/javascript:/gi, '');

export function limpiarPieza(p = {}, tipo = 'texto') {
  const o = {};
  if (p.texto != null) o.texto = tipo === 'logo' && esSvg(p.texto) ? svgLimpio(limpiarTexto(p.texto, 200_000)) : limpiarTexto(p.texto);
  if (p.url != null) o.url = limpiarUrl(p.url);
  if (tipo === 'colores' && (p.colores != null || p.texto != null)) o.colores = coloresDe(p.colores ?? p.texto);
  if (p.hecho != null) o.hecho = Boolean(p.hecho);
  return o;
}

// Piezas de una fase para este lanzamiento. ctx: { code, auto } (auto = autoCtx del lanzamiento).
export const piezasDe = (faseId, ctx = {}) => FASE[faseId]?.piezas(ctx) || [];

export function piezaCompleta(def, p = {}) {
  if (def.tipo === 'ghl') return Boolean(p.url && p.hecho);
  if (def.tipo === 'logo') return Boolean(p.url || esSvg(p.texto));
  if (def.tipo === 'colores') return coloresDe(p.colores ?? p.texto).length >= 2;
  return Boolean(String(p.texto || '').trim());
}
// Lo que falta para poder aprobar una fase: [títulos].
export const faltanPiezas = (faseId, fase = {}, ctx = {}) => piezasDe(faseId, ctx)
  .filter((d) => !d.opcional && !piezaCompleta(d, fase.piezas?.[d.id])).map((d) => d.titulo);

export function limpiarMontaje(m = {}) {
  const fases = {};
  for (const f of FASES) {
    const x = m?.fases?.[f.id];
    if (!x || typeof x !== 'object') continue;
    const piezas = {};
    for (const [id, p] of Object.entries(x.piezas || {})) {
      if (!/^[\w-]{1,40}$/.test(id) || !p || typeof p !== 'object') continue;
      piezas[id] = { ...(p.texto != null ? { texto: limpiarTexto(p.texto, 200_000) } : {}), ...(p.url ? { url: limpiarUrl(p.url) } : {}), ...(Array.isArray(p.colores) ? { colores: coloresDe(p.colores) } : {}), ...(p.hecho ? { hecho: true } : {}) };
    }
    fases[f.id] = {
      estado: GUARDADOS.has(x.estado) ? x.estado : 'pendiente', piezas,
      ...(x.nota ? { nota: limpiarTexto(x.nota, MAX_NOTA) } : {}), ...(x.cambios ? { cambios: limpiarTexto(x.cambios, MAX_NOTA) } : {}),
      ...(x.aprobada?.at ? { aprobada: { por: String(x.aprobada.por || ''), at: String(x.aprobada.at) } } : {}),
      ...(x.actualizado?.at ? { actualizado: { por: String(x.actualizado.por || ''), at: String(x.actualizado.at), origen: x.actualizado.origen === 'ia' ? 'ia' : 'persona' } } : {}),
    };
  }
  const registro = (Array.isArray(m?.registro) ? m.registro : []).slice(0, 80).map((r) => ({ at: String(r.at || ''), fase: String(r.fase || ''), accion: String(r.accion || ''), quien: String(r.quien || ''), detalle: limpiarTexto(r.detalle, 600) }));
  // auto: false → la tarea de Cowork no lo avanza sola (por defecto sí).
  return { fases, registro, ...(m?.creado?.at ? { creado: { por: String(m.creado.por || ''), at: String(m.creado.at) } } : {}), ...(m?.auto === false ? { auto: false } : {}) };
}

// Estado de cada fase, con las bloqueadas (la anterior no está aprobada): [{ id, estado }]
export function estadosFases(m = {}) {
  let abierta = true;
  return FASES.map((f) => {
    const guardado = m.fases?.[f.id]?.estado || 'pendiente';
    const estado = guardado === 'aprobada' ? 'aprobada' : abierta ? guardado : 'bloqueada';
    if (guardado !== 'aprobada') abierta = false;
    return { id: f.id, estado };
  });
}
// La fase en la que se trabaja ahora (la primera sin aprobar) o null si están todas.
export const faseActual = (m = {}) => estadosFases(m).find((x) => x.estado !== 'aprobada')?.id || null;
export const aprobadas = (m = {}) => estadosFases(m).filter((x) => x.estado === 'aprobada').length;
export const empezado = (m = {}) => Object.keys(m.fases || {}).length > 0 || Boolean(m.creado);

// Resumen para la etiqueta del menú: «Fase 3/6 · para revisar», o null si no hay montaje o ya está todo aprobado.
export function resumenMontaje(m = {}) {
  if (!empezado(m)) return null;
  const actual = faseActual(m);
  if (!actual) return { hecho: true, aprobadas: FASES.length, total: FASES.length, texto: 'Montaje terminado' };
  const est = estadosFases(m).find((x) => x.id === actual).estado;
  return { hecho: false, fase: actual, n: FASE[actual].n, total: FASES.length, aprobadas: aprobadas(m), estado: est, texto: `Fase ${FASE[actual].n}/${FASES.length} · ${ESTADOS_FASE[est].corto.charAt(0).toLowerCase()}${ESTADOS_FASE[est].corto.slice(1)}` };
}

// Lo que Claude ya tiene aprobado, para que lo siga en las fases siguientes (recortado).
export function aprobadoHasta(m, faseId, ctx = {}, max = 6000) {
  const out = [];
  for (const f of FASES) {
    if (f.id === faseId) break;
    const x = m.fases?.[f.id];
    if (x?.estado !== 'aprobada') continue;
    const piezas = piezasDe(f.id, ctx).map((d) => {
      const p = x.piezas?.[d.id] || {};
      const v = d.tipo === 'ghl' ? (p.url ? `${p.url}${p.hecho ? ' (montada)' : ''}` : '') : d.tipo === 'logo' ? (p.url || (esSvg(p.texto) ? '(SVG guardado en AlquimIA)' : ''))
        : d.tipo === 'colores' ? `${coloresDe(p.colores ?? p.texto).join(' ')}${p.texto ? `\n${p.texto}` : ''}` : p.texto || '';
      return v ? `### ${d.titulo}\n${String(v).slice(0, max)}${String(v).length > max ? '\n…(recortado)' : ''}` : '';
    }).filter(Boolean);
    if (piezas.length) out.push(`## Fase ${f.n}: ${f.titulo}\n${piezas.join('\n\n')}`);
  }
  return out.join('\n\n');
}

// Instrucciones de cada fase para Claude: qué hacer, cómo y dónde dejarlo. ctx: { l, code, cliente, producto, ficha,
// diseno, narrativaPrompt, auto, urlApp }
function pasosFase(faseId, ctx) {
  const l = ctx.l || {};
  const app = ctx.urlApp || 'AlquimIA';
  switch (faseId) {
    case 'identidad': return [
      'Lee la ficha de marca y avatar de abajo. Si hay lanzamientos anteriores, no repitas su narrativa.',
      'Piensa 3 narrativas posibles, elige la más fuerte para este avatar (explica por qué en la nota) y desarróllala con el formato del prompt de narrativa de abajo.',
      'Propón la paleta (de 3 a 6 colores con su #RRGGBB, partiendo de los de la marca), los símbolos y, si hace falta, las tipografías.',
      'Haz el logo del lanzamiento: un SVG limpio (texto + símbolo, que se lea pequeño) o, si tienes Canva, hazlo allí y guarda la URL de la imagen.',
    ];
    case 'contenido': return [
      'Con la narrativa aprobada, diseña el contenido gratuito: cada clase (o el webinar) con su título dentro de la narrativa, su idea clave, la creencia que rompe y cómo engancha con la siguiente. Que lleve de forma natural a querer el producto.',
      'Define el producto y la oferta. Si el lanzamiento ya tiene oferta o precios en AlquimIA (abajo), respétalos y complétalos; si no, propón y explica el porqué en la nota.',
      'No inventes testimonios ni cifras: si faltan, pon [PENDIENTE: …].',
    ];
    case 'copy': return [
      'Escribe el copy definitivo de cada página, sección por sección, en el orden de su estructura (abajo), con la voz de la marca y la narrativa aprobada.',
      'Básate en la ficha y las respuestas de Marca y avatar y en sus documentos («documentos_marca»): usa las palabras literales del avatar, sus dolores, deseos y objeciones. Si hay guía de copy, síguela al pie de la letra.',
      'Mira también lo que más vendió antes («perfil_comprador», «anuncios_que_venden») y, si hay encuestas, «encuesta_para_copy».',
      'Testimonios: solo los reales y con el nombre de pila. Nada de jerga interna («carrito», «BAR», «lanzamiento») en textos para leads. Si falta un dato, pon [PENDIENTE: …].',
      'Solo texto: todavía no toques GHL. El equipo lo revisa y lo puede editar aquí antes de aprobarlo.',
    ];
    case 'paginas': return [
      'Abre GoHighLevel en el navegador (Claude in Chrome o Cowork). La API de GHL no crea páginas de embudo: hazlo en Sites → Funnels.',
      `Crea (o usa, si ya existe) el embudo «${l.name || ctx.code}» y dentro una página por cada pieza: registro, gracias, replay y venta.`,
      'Monta cada página con el COPY APROBADO de la fase 3 (abajo), tal cual, y con los colores, tipografías, símbolos y logo de la fase 1. No reescribas el copy.',
      `Los códigos de AlquimIA de cada página (formulario, cuentas atrás, barra, grabación…) están en ${app} → Crear → Páginas («Copiar el prompt» de cada página): pégalos en un elemento «Código personalizado».`,
      'No publiques el embudo ni cambies dominios. Al terminar cada página, guarda su URL (la de vista previa vale) y márcala como hecha. Si algo no se puede, dilo en la nota.',
    ];
    case 'mensajes': return [
      'Si hay GUÍA DE EMAILS (abajo), es la norma: estructura, persuasión, longitud y tono de cada email salen de ahí. Si choca con otra instrucción, manda la guía.',
      'Usa «emails_lanzamiento» para ver los emails de lanzamientos anteriores y sus asuntos ganadores, y sigue el calendario de abajo (fechas y horas reales).',
      'Escribe TODOS los emails y TODOS los mensajes del grupo de WhatsApp con la voz de la marca, la narrativa y lo que sabes del avatar (Marca y avatar y sus documentos). Cada uno con su día y hora.',
      'Los recordatorios del directo, el aviso de la grabación y los emails de venta del carrito van como CAMPAÑAS DE EMAIL independientes (no dentro de los workflows): escríbelos todos aquí con su día y hora.',
      'No los programes ni los envíes: quedan en AlquimIA para revisar.',
    ];
    case 'automatizaciones': return [
      'Abre GoHighLevel en el navegador: Automatización → Workflows. La API de GHL no crea workflows.',
      `Crea la carpeta «${l.name || ctx.code}» y dentro cada workflow de la lista, en orden, con su prompt de abajo. Déjalos en BORRADOR (sin publicar).`,
      'Después de cada uno, guarda su URL y márcalo como hecho (puedes guardar la fase a medias con listo: false). Si un dato falta, dilo en la nota y sigue con el siguiente.',
      'Para los textos de emails y WhatsApp, usa los aprobados en la fase 5.',
      'Si hay GUÍA DE AUTOMATIZACIONES (abajo), lo que dice que lleva cada workflow se monta SIEMPRE, además de lo que trae su prompt.',
    ];
    default: return [];
  }
}

// El encargo completo de una fase para Claude (lo devuelve «montaje_lanzamiento» y lo copia el botón de la pestaña).
export function briefFase(faseId, m = {}, ctx = {}) {
  const f = FASE[faseId];
  if (!f) return '';
  const x = m.fases?.[faseId] || {};
  const l = ctx.l || {};
  const piezas = piezasDe(faseId, ctx);
  const lineas = [
    `# Montaje de «${l.name || ctx.code}» (${ctx.cliente || 'cliente'}) · Fase ${f.n} de ${FASES.length}: ${f.titulo}`,
    '', `OBJETIVO: ${f.objetivo}`,
    x.cambios ? `\n⚠️ CAMBIOS PEDIDOS POR EL EQUIPO (lo primero):\n${x.cambios}` : '',
    '', 'CÓMO HACERLO:', ...pasosFase(faseId, ctx).map((p, i) => `${i + 1}. ${p}`),
    '', 'QUÉ TIENES QUE ENTREGAR (cada pieza, con «guardar_fase_montaje»):',
    ...piezas.map((d) => `- «${d.id}» · ${d.titulo}${d.opcional ? ' (opcional)' : ''}: ${d.que}${d.tipo === 'ghl' ? ' → url + hecho: true' : d.tipo === 'logo' ? ' → texto (SVG) o url' : d.tipo === 'colores' ? ' → texto + colores ["#rrggbb", …]' : ' → texto'}${d.faltan?.length ? ` (faltan en AlquimIA: ${d.faltan.join(', ')})` : ''}`),
    '', 'REGLAS:',
    '- Guarda lo que vayas haciendo con «guardar_fase_montaje» (listo: false) y, cuando esté todo, con listo: true. Entonces PARA: una persona admin la revisa y la aprueba en AlquimIA. No pases a la fase siguiente hasta que esté aprobada.',
    '- Nunca publiques, envíes ni programes nada a leads. Nunca crees etiquetas de GHL que no estén en las instrucciones.',
    '- En la nota, explica en 3-6 líneas qué has hecho, qué has decidido y qué necesita revisar una persona.',
    '- Todo sale de Marca y avatar (ficha, respuestas y documentos) y de lo ya aprobado: no inventes datos del cliente.',
  ];
  // Marca y avatar: la ficha, las respuestas del cuestionario y los documentos (base de todo lo que se escribe).
  if (ctx.ficha) lineas.push('', '## Ficha de marca, producto y avatar', ctx.ficha);
  if (ctx.respuestas && ctx.respuestas !== ctx.ficha) lineas.push('', '## Respuestas de Marca y avatar', ctx.respuestas);
  if (ctx.docs?.length) lineas.push('', '## Documentos de Marca y avatar (léelos con «documentos_marca»)', ...ctx.docs.map((d) => `- ${d.id} · ${d.nombre}${GUIAS[d.uso] ? ` (${GUIAS[d.uso].titulo.toLowerCase()})` : ''} · ${Math.max(1, Math.round((d.chars || 0) / 1000))} mil caracteres`));
  if (!ctx.ficha && !ctx.respuestas) lineas.push('', '## Marca y avatar', '(Este cliente aún no tiene rellenado Marca y avatar: pídeselo al equipo antes de escribir nada.)');
  const guia = { mensajes: ctx.guias?.emails, copy: ctx.guias?.copy, automatizaciones: ctx.guias?.automatizaciones }[faseId];
  if (guia) lineas.push('', `## ${GUIAS[{ mensajes: 'emails', copy: 'copy', automatizaciones: 'automatizaciones' }[faseId]].titulo.toUpperCase()} (síguela: manda sobre lo de arriba)`, guia);
  if (ctx.diseno && ['identidad', 'paginas'].includes(faseId)) lineas.push('', '## Estilo visual de la marca', ctx.diseno);
  const previo = aprobadoHasta(m, faseId, ctx);
  if (previo) lineas.push('', '# LO YA APROBADO (síguelo)', previo);
  if (faseId === 'identidad' && ctx.narrativaPrompt) lineas.push('', '## Prompt de narrativa (formato de la pieza «narrativa»)', ctx.narrativaPrompt);
  if (faseId === 'contenido') {
    const of = [l.precioPrograma ? `Programa: ${l.precioPrograma} €` : '', Number(l.precioVip) > 0 ? `Entrada VIP: ${l.precioVip} €` : '', (l.oferta?.bonus || []).map((b) => b?.nombre).filter(Boolean).length ? `Bonus: ${(l.oferta.bonus || []).map((b) => b?.nombre).filter(Boolean).join(', ')}` : ''].filter(Boolean);
    lineas.push('', '## Lo que ya tiene el lanzamiento en AlquimIA', of.length ? of.join('\n') : '(Sin oferta ni precios todavía.)', l.fechaDirecto ? `Directo: ${l.fechaDirecto} ${l.horaDirecto || ''}`.trim() : '');
  }
  if (faseId === 'paginas') {
    lineas.push('', '## Páginas', ...paginasMontaje().map((p) => `### ${NOMBRE_PAGINA[p.id]} (${p.nombre})\nObjetivo: ${p.objetivo}\nSecciones:\n${(p.secciones || []).map((s) => `- ${s}`).join('\n')}${x.piezas?.[p.id]?.url ? `\nYa guardada: ${x.piezas[p.id].url}` : ''}`));
  }
  if (faseId === 'mensajes') {
    const cal = (lista) => lista.map((c) => `- ${c.at ? c.at.replace('T', ' ') : 'inmediato'} · ${c.fase} · ${c.titulo}${c.que ? `: ${c.que}` : ''}`).join('\n');
    let emails = '';
    let wa = '';
    try { emails = cal(calendarioEmails(l)); wa = cal(calendarioWhatsapp(l)); } catch { /* sin fechas */ }
    lineas.push('', '## Calendario de emails', emails || '(Faltan las fechas del lanzamiento en AlquimIA: propón un calendario.)', '', '## Calendario de WhatsApp', wa || '(Faltan las fechas del lanzamiento en AlquimIA: propón un calendario.)');
  }
  if (faseId === 'automatizaciones' && ctx.auto) {
    lineas.push('', '## Workflows', ...automatizacionesDe(ctx.auto).map((a) => `### wf-${a.id} · ${a.nombre}${x.piezas?.[`wf-${a.id}`]?.hecho ? ' ✓ (ya hecho)' : ''}\n${promptAutomatizacion(a, ctx.auto)}`));
  }
  return lineas.filter((v) => v !== '').join('\n');
}

// El prompt que se pega en Claude (Cowork o Claude Code con Chrome) para que monte el lanzamiento solo, fase a fase.
export function promptArranque({ code, nombre, clienteId = '', cliente = '' }) {
  return [
    `Vas a montar el lanzamiento «${nombre || code}»${cliente ? ` de ${cliente}` : ''} con el conector de AlquimIA, fase a fase, haciendo tú todo lo posible sin ayuda.`,
    '',
    `1. Llama a «montaje_lanzamiento» con cliente: "${clienteId}" y lanzamiento: "${code}". Te dice la fase que toca, qué entregar, las reglas y lo ya aprobado.`,
    '2. Haz esa fase entera. Para las páginas y las automatizaciones, usa el navegador (GoHighLevel).',
    '3. Guarda con «guardar_fase_montaje» mientras avanzas (listo: false) y al terminar (listo: true).',
    '4. PARA y avísame: una persona admin la aprueba o pide cambios en AlquimIA → Crear → Montaje.',
    '5. Cuando te diga «sigue», vuelve al paso 1: si hay cambios pedidos, haz esos primero.',
    '',
    'Nunca publiques, envíes ni programes nada a leads.',
  ].join('\n');
}

// Tarea programada de Cowork (una vez): recoge los encargos de «Crear con IA» y avanza los montajes que esperan a la
// IA, con la suscripción de Claude. Mismo texto en Crear → Automatizaciones y en Crear → Montaje.
export const FRECUENCIA_COWORK = 'cada 30 minutos (o cada hora)';
export function promptTareaCowork() {
  return [
    'Eres quien monta los lanzamientos de la agencia en GoHighLevel con el conector de AlquimIA. Cada vez que se ejecute esta tarea:',
    '',
    '1. Llama a «ver_embudos» para saber los clientes a los que tienes acceso.',
    '2. Para cada cliente, llama a «trabajo_pendiente» (con su id de cliente).',
    '3. ENCARGOS (automatizaciones de «Crear con IA»), uno a uno:',
    '   a. «actualizar_encargo» con estado «haciendo».',
    '   b. Abre GoHighLevel en el navegador (la subcuenta de ese cliente) y monta el workflow siguiendo su prompt y, si la hay, la guía de automatizaciones. En BORRADOR: nunca lo publiques.',
    '   c. «actualizar_encargo» con estado «hecho» y la URL del workflow; si no se puede, «error» con el motivo.',
    '4. MONTAJES: para cada uno, «montaje_lanzamiento» con su lanzamiento, haz esa fase entera siguiendo el encargo (Marca y avatar, guías y lo aprobado) y guárdala con «guardar_fase_montaje» (listo: true). Solo una fase por montaje: la siguiente espera el aprobado de una persona.',
    '5. Si no hay nada pendiente, termina sin hacer nada.',
    '',
    'Reglas: nunca publiques, envíes ni programes nada a leads; nunca crees etiquetas que no estén en las instrucciones; no toques workflows ni páginas de otros lanzamientos. Al terminar, resume en 2-3 líneas qué has hecho.',
  ].join('\n');
}
