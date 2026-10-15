// Imágenes con IA para un lanzamiento (WhatsApp, stories, emails): las piezas de cada momento con su texto exacto y
// los prompts para generarlas gastando poco. El método:
//   1. Los MOCKUPS, una vez (la grabación, el producto y cada bonus que caduca).
//   2. UNA imagen maestra con el estilo de la marca.
//   3. El resto, como EDICIONES de la maestra: solo cambia el titular, el subtítulo y el mockup.
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

// Cuándo se abre la grabación y cuándo deja de verse (48 h después).
export function ventanaGrabacion(launch = {}) {
  const desde = milestones(launch).videos?.at(-1)?.replay ?? null;
  return { desde, hasta: desde != null ? desde + 48 * HORA : null };
}

// Las piezas del lanzamiento: { id, grupo, titular, destacado, subtitulo, mockup: 'grabacion' | 'producto' | 'bonus:<id>' }.
// titular: lo que va arriba en grande; destacado: la parte de urgencia (en el trazo de color).
export function piezasImagenes(launch = {}, { producto = '' } = {}) {
  const prod = producto || 'el programa';
  const out = [];
  const g = ventanaGrabacion(launch);
  out.push({ id: 'grabacion', grupo: 'Grabación', titular: 'Grabación', destacado: 'disponible', subtitulo: g.hasta ? `Hasta ${cuandoTxt(g.hasta)}` : '', mockup: 'grabacion' });
  out.push({ id: 'grabacion-48', grupo: 'Grabación', titular: 'Grabación disponible', destacado: 'solo 48 horas', subtitulo: g.hasta ? `Hasta ${cuandoTxt(g.hasta)}` : '', mockup: 'grabacion' });
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

// Los mockups que hacen falta (sin repetir), en orden.
export function mockupsDe(piezas) {
  const vistos = new Map();
  for (const p of piezas) if (!vistos.has(p.mockup)) vistos.set(p.mockup, p);
  return [...vistos.values()].map((p) => ({ id: p.mockup, nombre: nombreMockup(p.mockup, p.bonus) }));
}
const minus = (s) => s.charAt(0).toLowerCase() + s.slice(1);
export const mockupCorto = (id, bonus) => minus(nombreMockup(id, bonus));
export function nombreMockup(id, bonus) {
  if (id === 'grabacion') return 'Mockup de la grabación';
  if (id === 'producto') return 'Mockup del producto';
  return `Mockup del bonus «${bonus?.nombre || ''}»`;
}

const textoExacto = (p) => [
  `- Titular: «${p.titular}»`,
  p.destacado && !p.titular.includes(p.destacado) ? `- Destacado (sobre un trazo de pincel o bloque de color de acento, en grande): «${p.destacado}»` : p.destacado ? `- Resalta «${p.destacado}» dentro del titular (más grande, sobre un trazo de pincel o bloque de color de acento).` : '',
  p.subtitulo ? `- Subtítulo pequeño abajo: «${p.subtitulo}»` : '',
].filter(Boolean).join('\n');

const estilo = (ctx) => [
  ctx.marca ? `Marca: ${ctx.marca}.` : '',
  ctx.producto ? `Producto: ${ctx.producto}.` : '',
  ctx.diseno ? `ESTILO VISUAL DE LA MARCA (respétalo: colores, tipografías y ambiente):\n${ctx.diseno}` : 'Estilo visual: elegante y sobrio, fondo oscuro con un color de acento cálido (si tienes el kit de marca, úsalo).',
  ctx.logo ? `Logo del lanzamiento: ${ctx.logo} (ponlo pequeño arriba, centrado).` : '',
].filter(Boolean).join('\n');

const REGLAS = `REGLAS DEL TEXTO:
- Escribe el texto EXACTAMENTE como está entre comillas: en español de España, con tildes y signos, sin añadir ni cambiar palabras.
- Nada más de texto en la imagen (ni precios, ni fechas inventadas, ni marcas de terceros).
- Que se lea en el móvil: titular grande, máximo 3 tamaños de letra, buen contraste.`;

// Prompt de un mockup (se genera UNA vez y se reutiliza en todas sus piezas).
export function promptMockup(id, ctx = {}, bonus = null) {
  const qué = id === 'grabacion'
    ? `un portátil y un móvil que muestran la GRABACIÓN de una clase en vídeo: reproductor con el botón de play, la barra de progreso y en pantalla ${ctx.persona ? `a ${ctx.persona}` : 'a la persona que imparte la clase'} hablando a cámara en un espacio cuidado. Etiqueta pequeña «GRABACIÓN» en el reproductor.`
    : id === 'producto'
      ? `el programa «${ctx.producto || 'el producto'}»: un portátil, una tablet y un móvil con el área de alumnos (portada con el nombre «${ctx.producto || 'el producto'}», módulos en miniatura), como un pack premium.`
      : `el bonus «${bonus?.nombre || ''}»${bonus?.detalle ? ` (${bonus.detalle})` : ''}: preséntalo como un objeto tangible y valioso (cuaderno, guía, tarjeta de acceso o pantalla según lo que sea), con su nombre «${bonus?.nombre || ''}» bien legible.`;
  return `Crea un MOCKUP realista en 3D de ${qué}

${estilo(ctx)}

- Fondo transparente o liso de un solo color (lo voy a recortar y colocar en otras imágenes).
- Iluminación de estudio suave, sombras realistas, alta resolución, formato 1:1.
- Solo el texto indicado; nada de marcas de terceros (sin logos de Apple ni similares).`;
}

// La pieza maestra: la primera, con todo el diseño.
export function promptMaestra(p, ctx = {}) {
  return `Diseña una imagen para WhatsApp y redes (formato 1:1, 1080×1080) para un lanzamiento. Va a ser la PLANTILLA de toda la serie, así que cuida la composición: después solo cambiaré el texto y el mockup.

${estilo(ctx)}

COMPOSICIÓN (como un cartel editorial):
- Arriba: el logo o el nombre del lanzamiento, pequeño, con líneas finas decorativas.
- Centro: el titular grande en una tipografía con carácter; la palabra destacada sobre un trazo de pincel del color de acento.
- Un lado: el mockup adjunto (${mockupCorto(p.mockup, p.bonus)}), grande y con sombra; no lo redibujes, intégralo.
- Un elemento de urgencia sutil coherente con el estilo (un reloj de arena, un reloj o una cuenta atrás), sin recargar.
- Abajo: el subtítulo pequeño.
- Deja aire alrededor; que se entienda en 2 segundos en el móvil.

TEXTO:
${textoExacto(p)}

${REGLAS}`;
}

// Las demás: edición de la maestra (gasta mucho menos y la serie queda igual).
export function promptEdicion(p) {
  return `Edita la imagen maestra adjunta. Mantén TODO igual (fondo, colores, tipografías, logo, composición y tamaño). Cambia SOLO esto:
${textoExacto(p)}
- Mockup: sustitúyelo por el adjunto (${mockupCorto(p.mockup, p.bonus)}), en el mismo sitio y tamaño.${p.subtitulo ? '' : '\n- Si la maestra tenía subtítulo, quítalo.'}

${REGLAS}`;
}

// Versión vertical (stories/estados) a partir de la cuadrada: una edición barata.
export const PROMPT_VERTICAL = 'Adapta esta imagen a formato vertical 9:16 (1080×1920) para stories y estados: amplía el fondo arriba y abajo con el mismo estilo, sin deformar nada, y deja libres los 250 px de arriba y de abajo. Mismo texto, exactamente igual.';

// Todo de una vez con el conector de Magnific (para Claude): plan y coste antes de generar.
export function promptMagnificImagenes(piezas, ctx = {}) {
  const mocks = mockupsDe(piezas);
  return `Crea las IMÁGENES del lanzamiento${ctx.lanzamiento ? ` «${ctx.lanzamiento}»` : ''} con el conector de MAGNIFIC, gastando lo mínimo.

${estilo(ctx)}

CÓMO HACERLO:
1. Kit de marca: busca uno de «${ctx.marca || 'la marca'}» (brand_kit_list); si no hay, créalo con el estilo de arriba.${ctx.logo ? ` Sube el logo desde ${ctx.logo} (creations_upload_image).` : ''}
2. Antes de generar nada, enséñame el PLAN y el COSTE ESTIMADO en créditos (simulate_cost). Espera a que te diga «adelante».
3. Genera primero los ${mocks.length} mockups, una sola vez cada uno (fondo liso, para recortarlos):
${mocks.map((m) => `   - ${m.nombre}`).join('\n')}
4. Haz UNA imagen maestra (1:1) con la primera pieza y enséñamela. Cuando la apruebe, haz las demás EDITANDO la maestra (solo el texto y el mockup), no desde cero.
5. Si te lo pido, adapta las que quiera a 9:16 ampliando el fondo (no regenerando).
6. Guárdalo todo en una carpeta «Imágenes ${ctx.lanzamiento || 'lanzamiento'}» y dame la lista con el enlace de cada una.

LAS PIEZAS (texto exacto, con tildes):
${piezas.map((p, i) => `${i + 1}. ${[p.titular, p.destacado && !p.titular.includes(p.destacado) ? p.destacado : '', p.subtitulo].filter(Boolean).join(' · ')}  →  ${mockupCorto(p.mockup, p.bonus)}`).join('\n')}

${REGLAS}`;
}

export const tipoDeBonus = (b) => tipoBonus(b?.tipo).label;
