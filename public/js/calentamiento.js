// Calentamiento del grupo de WhatsApp (SendFlow): la secuencia de mensajes de un lanzamiento o meteórico.
// Flujo (opción A): el dashboard prepara un prompt con los datos del lanzamiento → se pega en Claude (con la
// skill de copy) → Claude devuelve los mensajes en un formato fijo → se pegan aquí, se revisan y se programan
// en SendFlow (POST /actions/send-message con `scheduledTo`). Lo usan el navegador, el servidor y los tests.
import { madridToEpoch } from './page.js';

export const TIPOS_MSG = [
  { id: 'texto', label: 'Texto', ico: '✍️', sf: 'extendedTextMessage' },
  { id: 'imagen', label: 'Imagen', ico: '🖼️', sf: 'imageMessage', archivo: true },
  { id: 'video', label: 'Vídeo', ico: '🎬', sf: 'videoMessage', archivo: true },
  { id: 'audio', label: 'Audio', ico: '🎧', sf: 'audioMessage', archivo: true },
  { id: 'nota', label: 'Nota de voz', ico: '🎙️', sf: 'audioMessage', archivo: true },
  { id: 'encuesta', label: 'Encuesta', ico: '📊', sf: 'pollMessage' },
  { id: 'documento', label: 'Documento (PDF…)', ico: '📄', sf: 'documentMessage', archivo: true },
];
export const TIPO_IDS = TIPOS_MSG.map((t) => t.id);
const tipoDe = (id) => TIPOS_MSG.find((t) => t.id === id) || TIPOS_MSG[0];
export const ESTADOS_MSG = { borrador: 'Borrador', programado: 'Programado en SendFlow', error: 'Error al programar', cancelado: 'Cancelado' };
// Cómo subir los archivos (SendFlow no recibe el archivo, sino un enlace público al archivo).
export const GUIA_ARCHIVOS = [
  { tipo: 'imagen', formato: '.jpg o .png', consejo: 'Vertical (1080×1350) o cuadrada; menos de 5 MB.' },
  { tipo: 'video', formato: '.mp4 (H.264)', consejo: 'Vertical 9:16, menos de 16 MB (≈ 1-2 min en 720p). Vimeo y YouTube NO sirven: hace falta el archivo.' },
  { tipo: 'audio', formato: '.mp3 o .m4a', consejo: 'Menos de 16 MB. Se ve como archivo de audio con su nombre.' },
  { tipo: 'nota', formato: '.ogg (opus) o .mp3', consejo: 'Se oye como nota de voz grabada en el momento (la que más se escucha). Mejor .ogg; menos de 16 MB.' },
  { tipo: 'documento', formato: '.pdf', consejo: 'Menos de 16 MB; el nombre del archivo es lo que verán.' },
];

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const url = (v) => (/^https:\/\/\S+$/i.test(str(v, 1000)) ? str(v, 1000) : '');
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
let n = 0;
export const nuevoIdMsg = () => `m${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// Limpia un mensaje (lo que llega del navegador). Lo ya programado lo decide el servidor, no el navegador.
export function sanitizeMensaje(m) {
  const tipo = TIPO_IDS.includes(m?.tipo) ? m.tipo : 'texto';
  const opciones = (Array.isArray(m?.encuesta?.opciones) ? m.encuesta.opciones : []).map((o) => str(o, 100)).filter(Boolean).slice(0, 12);
  return {
    id: /^[a-z0-9]{4,40}$/i.test(String(m?.id || '')) ? String(m.id) : nuevoIdMsg(),
    at: LOCAL.test(String(m?.at || '')) ? m.at : '',
    tipo,
    texto: str(m?.texto, 4000),
    url: url(m?.url),
    nombreArchivo: str(m?.nombreArchivo, 120),
    guion: str(m?.guion, 4000), // para audios y notas de voz: lo que hay que grabar (no se envía)
    encuesta: tipo === 'encuesta' ? { pregunta: str(m?.encuesta?.pregunta, 255), opciones, multiple: Boolean(m?.encuesta?.multiple) } : null,
    mencionar: Boolean(m?.mencionar),
  };
}

// Lo que falta para poder programarlo ([] = listo).
export function faltaMensaje(m, ahora = Date.now()) {
  const out = [];
  const t = madridToEpoch(m.at);
  if (!m.at || t == null) out.push('día y hora');
  else if (t < ahora + 2 * 60_000) out.push('una hora futura');
  const tp = tipoDe(m.tipo);
  if (tp.archivo && !m.url) out.push('el enlace del archivo');
  if (m.tipo === 'texto' && !m.texto) out.push('el texto');
  if (m.tipo === 'encuesta') {
    if (!m.encuesta?.pregunta) out.push('la pregunta');
    if ((m.encuesta?.opciones || []).length < 2) out.push('al menos 2 opciones');
    if (new Set(m.encuesta?.opciones || []).size !== (m.encuesta?.opciones || []).length) out.push('opciones sin repetir');
  }
  return out;
}

// Cuerpo de POST /actions/send-message para SendFlow (a todos los grupos de la campaña).
export function cuerpoSendflow(m, releaseId) {
  const tp = tipoDe(m.tipo);
  const t = madridToEpoch(m.at);
  const body = { releaseId, type: tp.sf, scheduledTo: new Date(t).toISOString() };
  if (m.tipo === 'texto') Object.assign(body, { text: m.texto, linkPreview: true });
  else if (m.tipo === 'encuesta') Object.assign(body, { pollName: m.encuesta.pregunta, values: m.encuesta.opciones, selectableCount: m.encuesta.multiple ? 0 : 1 });
  else Object.assign(body, { url: m.url, ...(m.texto ? { caption: m.texto, text: m.texto } : {}), ...(m.tipo === 'nota' ? { ptt: true } : m.tipo === 'audio' ? { ptt: false } : {}), ...(m.tipo === 'documento' && m.nombreArchivo ? { fileName: m.nombreArchivo } : {}) });
  if (m.mencionar && ['texto', 'imagen', 'video'].includes(m.tipo)) body.options = { mentionAllParticipants: true, mentionAllSkipAdmins: true };
  return body;
}

// ---------- Formato para pegar (lo que devuelve Claude) ----------
//   ### 2026-11-03 19:00 | texto | mencionar
//   El texto del mensaje (varias líneas)
//
//   ### 2026-11-04 10:00 | encuesta | varias
//   ¿La pregunta?
//   - Opción 1
//   - Opción 2
//
//   ### 2026-11-04 20:00 | nota
//   Archivo: (pon aquí el enlace)
//   Guion: lo que hay que grabar…
//   Texto: (opcional, texto que acompaña)
const ALIAS_TIPO = { texto: 'texto', text: 'texto', imagen: 'imagen', image: 'imagen', foto: 'imagen', video: 'video', vídeo: 'video', audio: 'audio', nota: 'nota', 'nota de voz': 'nota', voz: 'nota', encuesta: 'encuesta', poll: 'encuesta', documento: 'documento', pdf: 'documento' };
export function parsearSecuencia(txt) {
  const bloques = String(txt || '').replace(/\r/g, '').split(/^#{2,4}\s+/m).slice(1);
  const out = [];
  for (const b of bloques) {
    const [cab, ...resto] = b.split('\n');
    const partes = cab.split('|').map((p) => p.trim()).filter(Boolean);
    const fh = (partes[0] || '').match(/(\d{4})-(\d{2})-(\d{2})[ T]+(\d{1,2}):(\d{2})/);
    const tipo = ALIAS_TIPO[String(partes[1] || 'texto').toLowerCase().normalize('NFC')] || 'texto';
    const flags = partes.slice(2).map((p) => p.toLowerCase());
    const lineas = resto.join('\n').trim().split('\n');
    const campo = (re) => { const i = lineas.findIndex((l) => re.test(l)); if (i < 0) return ''; const v = lineas[i].replace(re, '').trim(); lineas.splice(i, 1); return v; };
    let archivo = campo(/^\s*archivo\s*:/i);
    if (!/^https:\/\//i.test(archivo)) archivo = '';
    const nombreArchivo = campo(/^\s*nombre(?: del archivo)?\s*:/i);
    let guion = '';
    let texto = '';
    // «Guion:» y «Texto:» pueden ocupar varias líneas: hasta la siguiente etiqueta.
    const cuerpo = lineas.join('\n');
    const g = cuerpo.match(/^\s*guion\s*:\s*([\s\S]*?)(?=^\s*texto\s*:|$(?![\s\S]))/im);
    const t = cuerpo.match(/^\s*texto\s*:\s*([\s\S]*?)(?=^\s*guion\s*:|$(?![\s\S]))/im);
    if (g) guion = g[1].trim();
    if (t) texto = t[1].trim();
    if (!g && !t) texto = cuerpo.trim();
    const m = { at: fh ? `${fh[1]}-${fh[2]}-${fh[3]}T${fh[4].padStart(2, '0')}:${fh[5]}` : '', tipo, url: archivo, nombreArchivo, guion, mencionar: flags.some((f) => f.startsWith('menc')) };
    if (tipo === 'encuesta') {
      const ls = texto.split('\n').map((l) => l.trim()).filter(Boolean);
      const opciones = ls.filter((l) => /^[-*•]\s+/.test(l)).map((l) => l.replace(/^[-*•]\s+/, ''));
      m.encuesta = { pregunta: ls.find((l) => !/^[-*•]\s+/.test(l)) || '', opciones, multiple: flags.some((f) => f.startsWith('varia') || f.startsWith('multi')) };
      m.texto = '';
    } else m.texto = texto;
    out.push(sanitizeMensaje(m));
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

// ---------- Prompt para Claude, con los datos del lanzamiento o meteórico ----------
const fechaLarga = (local) => {
  const t = madridToEpoch(local);
  return t == null ? '' : new Date(t).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
};
const diaLargo = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) : '');
const eur = (n) => (Number(n) ? `${Number(n).toLocaleString('es-ES')} €` : '');

export function promptCalentamiento(emb, { esMeteo = false, producto = '', marca = '', desde = '', hasta = '', ya = [] } = {}) {
  const d = [];
  if (esMeteo) {
    d.push(`- Acción: meteórico (oferta flash) «${emb.name || ''}»${emb.oferta ? `: ${emb.oferta}` : ''}.`);
    if (emb.producto || producto) d.push(`- Producto: ${emb.producto || producto}${eur(emb.precio) ? ` · precio de la oferta ${eur(emb.precio)}` : ''}.`);
    if (emb.calentamiento) d.push(`- Calentamiento desde el ${diaLargo(emb.calentamiento)}.`);
    if (emb.apertura) d.push(`- La oferta abre el ${fechaLarga(emb.apertura)}${emb.cierre ? ` y cierra el ${fechaLarga(emb.cierre)}` : ''}.`);
    if (emb.ofertaUrl) d.push(`- Página de la oferta: ${emb.ofertaUrl}`);
    for (const b of emb.paquete?.bonus || []) d.push(`- Bonus: ${b.nombre}${b.detalle ? ` (${b.detalle})` : ''}.`);
  } else {
    d.push(`- Lanzamiento: «${emb.name || ''}» de ${producto || 'el programa'}${marca ? ` (${marca})` : ''}.`);
    if (emb.inicioCaptacion) d.push(`- Captación desde el ${diaLargo(emb.inicioCaptacion)}${emb.finCaptacion ? ` hasta el ${diaLargo(emb.finCaptacion)}` : ''}.`);
    for (const k of [1, 2, 3]) if (emb[`clase${k}At`]) d.push(`- Clase ${k} disponible el ${fechaLarga(emb[`clase${k}At`])}.`);
    if (emb.fechaDirecto) d.push(`- Webinar / clase en directo: ${fechaLarga(`${emb.fechaDirecto}T${emb.horaDirecto || '19:00'}`)}.`);
    if (emb.precioVip) d.push(`- Entrada VIP: ${eur(emb.precioVip)}${emb.enlaces?.vip || emb.vipUrl ? ` (${emb.enlaces?.vip || emb.vipUrl})` : ''}.`);
    if (emb.aperturaCarrito) d.push(`- Abre el carrito: ${fechaLarga(emb.aperturaCarrito)}.`);
    if (emb.cierreCarrito) d.push(`- Cierra el carrito: ${fechaLarga(emb.cierreCarrito)}.`);
    if (emb.precioPrograma) d.push(`- Precio: ${eur(emb.precioPrograma)}${emb.precioFraccionado ? ` · a plazos ${eur(emb.precioFraccionado)}` : ''}.`);
    for (const e of emb.oferta?.entregables || []) d.push(`- Incluye: ${e.nombre}${e.detalle ? ` (${e.detalle})` : ''}.`);
    for (const b of emb.oferta?.bonus || []) d.push(`- Bonus: ${b.nombre}${b.detalle ? ` (${b.detalle})` : ''}.`);
    if (emb.recursosUrl) d.push(`- Área de recursos (preclase): ${emb.recursosUrl}`);
  }
  const yaTxt = ya.length ? `\nYa hay estos mensajes programados (no los repitas ni pongas otro a la misma hora):\n${ya.map((m) => `- ${m.at.replace('T', ' ')} · ${m.tipo}${m.texto ? ` · «${m.texto.slice(0, 60)}…»` : ''}`).join('\n')}\n` : '';
  return `Usa tu skill de copy de venta (copy de calentamiento y carrito para grupos de WhatsApp) para escribir la secuencia de mensajes del GRUPO DE WHATSAPP de este ${esMeteo ? 'meteórico' : 'lanzamiento'}.

DATOS:
${d.join('\n')}
${desde || hasta ? `- La secuencia va del ${diaLargo(desde)} al ${diaLargo(hasta)} (hora de España).` : ''}
${yaTxt}
QUÉ QUIERO:
- Mensajes cortos, de grupo (no 1:1), en español de España y en el tono de la marca. Que generen conversación y expectación, y que lleven a la acción en cada fase (clases, directo, VIP, carrito, últimas horas).
- Mezcla formatos: texto, encuestas para que participen, notas de voz (con su GUION para grabarlas), y algún vídeo o imagen si aporta.
- Como mucho 2-3 mensajes al día (y más en los momentos clave: el día del directo y las últimas horas del carrito). Nada entre las 23:00 y las 8:00.
- Usa «mencionar» solo en los avisos importantes (empieza el directo, abre / cierra el carrito): menciona a todo el grupo.

DEVUÉLVEMELO EXACTAMENTE EN ESTE FORMATO (lo pego tal cual en mi dashboard, que lo programa en SendFlow):

### AAAA-MM-DD HH:MM | texto
El texto del mensaje (puede tener varias líneas y emojis).

### AAAA-MM-DD HH:MM | texto | mencionar
Aviso importante para todo el grupo.

### AAAA-MM-DD HH:MM | encuesta
¿La pregunta de la encuesta?
- Opción 1
- Opción 2
- Opción 3

### AAAA-MM-DD HH:MM | nota
Archivo: (pon aquí el enlace)
Guion: lo que hay que grabar, palabra por palabra.

### AAAA-MM-DD HH:MM | video
Archivo: (pon aquí el enlace)
Guion: qué se ve y qué se dice en el vídeo.
Texto: el texto que acompaña al vídeo.

### AAAA-MM-DD HH:MM | imagen
Archivo: (pon aquí el enlace)
Guion: cómo es la imagen.
Texto: el texto que acompaña a la imagen.

Tipos posibles: texto, encuesta (de 2 a 12 opciones; añade «| varias» si se puede marcar más de una), nota (nota de voz), audio, video, imagen, documento. Deja «Archivo: (pon aquí el enlace)» en los que lleven archivo: lo pondré yo al subirlos. Solo la lista de mensajes, sin explicaciones antes ni después.`.replace(/\n{3,}/g, '\n\n');
}
