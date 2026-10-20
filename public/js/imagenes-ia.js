// Imágenes con IA para un lanzamiento (WhatsApp, stories, emails): las piezas de cada momento con su texto exacto y
// un prompt completo por imagen (estilo de la marca, logo, su mockup y el texto): se copia, se pega y sale la imagen.
import { milestones } from './page.js';
import { momentosCarrito, ventanaBonus, tipoBonus } from './oferta.js';

const HORA = 3_600_000;
const MADRID = 'Europe/Madrid';

// «21.00h» (hora de Madrid). La medianoche se dice «23.59h» del día anterior (se entiende mejor).
const ajusta = (ms) => (ms != null && horaCruda(ms) === '00:00' ? ms - 60_000 : ms);
const horaCruda = (ms) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: MADRID });
export function horaTxt(ms) {
  if (ms == null) return '';
  ms = ajusta(ms);
  const s = new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: MADRID });
  return `${s.replace(':', '.')}h`;
}
// «el jueves 16 a las 21.00h»
export function cuandoTxt(ms) {
  if (ms == null) return '';
  ms = ajusta(ms);
  const d = new Date(ms).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', timeZone: MADRID });
  return `el ${d.replace(',', '')} a las ${horaTxt(ms)}`;
}

// Cuándo se abre la grabación y cuándo deja de verse: 48 h después, o al cerrar el carrito si es antes.
// horas48: si la ventana es de 48 h de verdad (si no, no sale la pieza «solo 48 horas»).
export function ventanaGrabacion(launch = {}) {
  const desde = milestones(launch).videos?.at(-1)?.replay ?? null;
  if (desde == null) return { desde, hasta: null, horas48: false };
  const cierre = momentosCarrito(launch).cierre;
  const hasta = cierre != null && cierre > desde ? Math.min(desde + 48 * HORA, cierre) : desde + 48 * HORA;
  return { desde, hasta, horas48: hasta === desde + 48 * HORA };
}

// Las piezas del lanzamiento: { id, grupo, titular, destacado, subtitulo, mockup: 'grabacion' | 'producto' | 'bonus:<id>' }.
// titular: lo que va arriba en grande; destacado: la parte de urgencia (en el trazo de color).
export function piezasImagenes(launch = {}, { producto = '' } = {}) {
  const prod = producto || 'el programa';
  const out = [];
  const g = ventanaGrabacion(launch);
  out.push({ id: 'grabacion', grupo: 'Grabación', titular: 'Grabación', destacado: 'disponible', subtitulo: g.hasta ? `Hasta ${cuandoTxt(g.hasta)}` : '', mockup: 'grabacion' });
  if (g.horas48) out.push({ id: 'grabacion-48', grupo: 'Grabación', titular: 'Grabación disponible', destacado: 'solo 48 horas', subtitulo: g.hasta ? `Hasta ${cuandoTxt(g.hasta)}` : '', mockup: 'grabacion' });
  out.push({ id: 'grabacion-ultimo', grupo: 'Grabación', titular: 'Último día para ver', destacado: 'la grabación', subtitulo: g.hasta ? `Solo hasta las ${horaTxt(g.hasta)}` : '', mockup: 'grabacion' });
  out.push({ id: 'abiertas', grupo: 'Carrito', titular: 'Plazas abiertas', destacado: prod, subtitulo: '', mockup: 'producto' });
  for (const b of launch.oferta?.bonus || []) {
    if (!String(b.tipo || '').startsWith('bar_')) continue;
    const fin = ventanaBonus(b, launch).hasta;
    const hasta = fin ? `Solo hasta las ${horaTxt(fin)}` : '';
    out.push({ id: `bonus-${b.id}-dia`, grupo: `Bonus · ${b.nombre}`, titular: 'Último día para conseguir', destacado: b.nombre, subtitulo: hasta, mockup: `bonus:${b.id}`, bonus: b });
    out.push({ id: `bonus-${b.id}-horas`, grupo: `Bonus · ${b.nombre}`, titular: 'Últimas horas para conseguir', destacado: b.nombre, subtitulo: hasta, mockup: `bonus:${b.id}`, bonus: b });
  }
  const cierre = momentosCarrito(launch).cierre;
  const hasta = cierre ? `Solo hasta las ${horaTxt(cierre)}` : '';
  out.push({ id: 'producto-dia', grupo: 'Cierre', titular: `Último día para entrar en ${prod}`, destacado: 'Último día', subtitulo: hasta, mockup: 'producto' });
  out.push({ id: 'producto-horas', grupo: 'Cierre', titular: `Últimas horas para entrar en ${prod}`, destacado: 'Últimas horas', subtitulo: hasta, mockup: 'producto' });
  out.push({ id: 'producto-hora', grupo: 'Cierre', titular: `Última hora para entrar en ${prod}`, destacado: 'Última hora', subtitulo: hasta, mockup: 'producto' });
  return out;
}

const textoExacto = (p) => [
  `- Titular: «${p.titular}»`,
  p.destacado && !p.titular.includes(p.destacado) ? `- Destacado (sobre un trazo de pincel o bloque de color de acento, en grande): «${p.destacado}»` : p.destacado ? `- Resalta «${p.destacado}» dentro del titular (más grande, sobre un trazo de pincel o bloque de color de acento).` : '',
  p.subtitulo ? `- Subtítulo pequeño abajo: «${p.subtitulo}»` : '',
].filter(Boolean).join('\n');

// Colores y tipografías del panel de Marca (Estilo visual), con su papel en la imagen. r: respuestas de la marca.
const HEX = /^#[0-9a-f]{6}$/i;
export function paletaMarca(r = {}) {
  const c = (k) => (HEX.test(String(r?.[k] || '')) ? r[k] : '');
  const p = { principal: c('color1'), secundario: c('color2'), acento: c('color3'), fondo: c('colorFondo'), texto: c('colorTexto'),
    fuenteTitulos: String(r?.fuenteTitulos || '').trim(), fuenteTexto: String(r?.fuenteTexto || '').trim() };
  return Object.values(p).some(Boolean) ? p : null;
}
export function bloqueVisual(p) {
  if (!p) return '';
  const l = ['COLORES Y TIPOGRAFÍAS DE LA MARCA (obligatorios: usa estos códigos exactos, no otros):'];
  if (p.fondo || p.principal) l.push(`- Fondo: ${p.fondo || p.principal}${p.fondo && p.principal ? ` (con toques del color principal ${p.principal})` : ''}.`);
  if (p.texto) l.push(`- Titular y textos: ${p.texto}.`);
  if (p.acento || p.secundario) l.push(`- Trazo de pincel / bloque del destacado y detalles de urgencia: ${p.acento || p.secundario}.`);
  if (p.secundario && p.acento) l.push(`- Líneas finas y adornos: ${p.secundario}.`);
  if (p.fuenteTitulos) l.push(`- Tipografía del titular: ${p.fuenteTitulos} (o la más parecida si no la tienes).`);
  if (p.fuenteTexto) l.push(`- Tipografía del subtítulo: ${p.fuenteTexto}.`);
  l.push('- Garantiza buen contraste entre el texto y el fondo.');
  return l.join('\n');
}

// Del «Estilo visual», lo que no está ya arriba (colores, tipografías y logo van aparte).
const restoDiseno = (ctx) => String(ctx.diseno || '').split('\n')
  .filter((l) => !/^ESTILO VISUAL$/i.test(l.trim()) && !(ctx.paleta && /^- (Color |Tipografía )/.test(l)) && !(ctx.logo && /^- Enlace al logo/.test(l)))
  .join('\n').trim();
const estilo = (ctx) => [
  ctx.marca ? `Marca: ${ctx.marca}.` : '',
  ctx.producto ? `Producto: ${ctx.producto}.` : '',
  bloqueVisual(ctx.paleta),
  restoDiseno(ctx) ? `ESTILO VISUAL DE LA MARCA (respétalo: ambiente y lo que no quiere ver):\n${restoDiseno(ctx)}` : (ctx.paleta ? '' : 'Estilo visual: elegante y sobrio, fondo oscuro con un color de acento cálido (si tienes el kit de marca, úsalo).'),
  ctx.logo ? `${ctx.logoDeMarca ? 'Logo de la marca' : 'LOGO DEL LANZAMIENTO'}: ${ctx.logo} (descárgalo de ese enlace; va en todas las imágenes, pequeño arriba y centrado, tal cual: sin redibujarlo, deformarlo ni cambiarle los colores).` : '',
  ctx.logoProducto ? `LOGO DEL PRODUCTO «${ctx.producto || 'el programa'}»: ${ctx.logoProducto} (descárgalo de ese enlace; va en las imágenes de venta —carrito abierto, bonus y cierre—, en la portada del producto y junto al titular, tal cual: sin redibujarlo, deformarlo ni cambiarle los colores).` : '',
].filter(Boolean).join('\n');

const REGLAS = `REGLAS DEL TEXTO:
- Escribe el texto EXACTAMENTE como está entre comillas: en español de España, con tildes y signos, sin añadir ni cambiar palabras.
- Nada más de texto en la imagen (ni precios, ni fechas inventadas, ni marcas de terceros).
- Que se lea en el móvil: titular grande, máximo 3 tamaños de letra, buen contraste.`;

// Qué mockup lleva cada imagen (descrito dentro de su prompt: se genera junto con la imagen, sin pasos aparte).
export function describirMockup(id, ctx = {}, bonus = null) {
  if (id === 'grabacion') return `un portátil y un móvil que muestran la GRABACIÓN de la clase en vídeo: reproductor con el botón de play y la barra de progreso, y en pantalla ${ctx.persona ? `a ${ctx.persona}` : 'a la persona que imparte la clase'} hablando a cámara. Etiqueta pequeña «GRABACIÓN» en el reproductor`;
  if (id === 'producto') return `el programa «${ctx.producto || 'el producto'}» como un pack premium: un portátil, una tablet y un móvil con el área de alumnos (portada con ${ctx.logoProducto ? `el LOGO DEL PRODUCTO (el enlace de arriba)` : `el nombre «${ctx.producto || 'el producto'}»${ctx.logo ? ' y el logo' : ''}`}, módulos en miniatura)`;
  return `el bonus «${bonus?.nombre || ''}»${bonus?.detalle ? ` (${bonus.detalle})` : ''} como un objeto tangible y valioso (cuaderno, guía, tarjeta de acceso o pantalla, según lo que sea), con su nombre «${bonus?.nombre || ''}» bien legible`;
}

// El prompt de UNA imagen, completo: estilo de la marca, logo, mockup y texto exacto. Se copia, se pega y sale la imagen.
// Todas comparten el mismo estilo y la misma composición, así que la serie sale coherente.
export function promptImagen(p, ctx = {}) {
  return `Crea una imagen para WhatsApp y redes sociales (formato cuadrado 1:1, 1080×1080) para un lanzamiento.

${estilo(ctx)}

COMPOSICIÓN (como un cartel editorial, limpio y elegante):
- Arriba: ${ctx.logo ? `el ${ctx.logoDeMarca ? 'logo de la marca' : 'logo del lanzamiento'} (el enlace de arriba), pequeño y centrado, con líneas finas decorativas a los lados` : `el nombre del lanzamiento${ctx.lanzamiento ? ` («${ctx.lanzamiento}»)` : ''}, pequeño, con líneas finas decorativas a los lados`}.
- Centro: el titular grande, en una tipografía con carácter; la parte destacada sobre un trazo de pincel del color de acento.
- Un lado o abajo: un MOCKUP realista en 3D: ${describirMockup(p.mockup, ctx, p.bonus)}. Grande, con sombra suave e iluminación de estudio.
${ctx.logoProducto && p.grupo !== 'Grabación' ? '- Junto al titular (o sobre el mockup): el LOGO DEL PRODUCTO (el enlace de arriba), mediano y bien visible: es una imagen de venta.\n' : ''}- Un detalle de urgencia sutil y coherente con el estilo (un reloj de arena, un reloj o una cuenta atrás), sin recargar.
- Abajo: el subtítulo pequeño.
- Deja aire alrededor; que se entienda en 2 segundos en el móvil.

TEXTO:
${textoExacto(p)}

${REGLAS}
- Nada de logos ni marcas de terceros (ni la manzana de Apple ni similares).`;
}

// Versión vertical (stories/estados) de una imagen ya hecha.
export const PROMPT_VERTICAL = 'Adapta esta imagen a formato vertical 9:16 (1080×1920) para stories y estados: amplía el fondo arriba y abajo con el mismo estilo, sin deformar nada, y deja libres los 250 px de arriba y de abajo. Mismo texto, exactamente igual.';

// Todas de una vez con el conector de Magnific (para Claude): plan y coste antes de generar.
export function promptMagnificImagenes(piezas, ctx = {}) {
  return `Crea las ${piezas.length} IMÁGENES del lanzamiento${ctx.lanzamiento ? ` «${ctx.lanzamiento}»` : ''} con el conector de MAGNIFIC.

${estilo(ctx)}

CÓMO HACERLO:
1. Kit de marca: busca uno de «${ctx.marca || 'la marca'}» (brand_kit_list); si no hay, créalo con el estilo de arriba.${ctx.logo ? ` Sube el logo desde ${ctx.logo} (creations_upload_image).` : ''}${ctx.logoProducto ? ` Sube también el logo del producto desde ${ctx.logoProducto} (creations_upload_image): va en las imágenes de venta (carrito, bonus y cierre).` : ''}
2. Antes de generar nada, enséñame el PLAN y el COSTE ESTIMADO en créditos (simulate_cost). Espera a que te diga «adelante».
3. Todas con el mismo estilo y la misma composición: cuadradas 1:1, logo arriba, titular en el centro con el destacado sobre un trazo de pincel del color de acento, el mockup de cada una y el subtítulo abajo.
4. Guárdalas en una carpeta «Imágenes ${ctx.lanzamiento || 'lanzamiento'}» y dame la lista con el enlace de cada una.

LAS IMÁGENES (texto exacto, con tildes, y su mockup):
${piezas.map((p, i) => `${i + 1}. ${[p.titular, p.destacado && !p.titular.includes(p.destacado) ? p.destacado : '', p.subtitulo].filter(Boolean).join(' · ')}\n   Mockup: ${describirMockup(p.mockup, ctx, p.bonus)}.`).join('\n')}

${REGLAS}`;
}

export const tipoDeBonus = (b) => tipoBonus(b?.tipo).label;
