// Texto con formato de las tareas (títulos, negrita, listas, enlaces y vídeos embebidos).
// Se guarda como HTML limpio: solo pasan las etiquetas de la lista y nunca atributos peligrosos.
// Lo usan el navegador (editor y vista) y el servidor (que limpia SIEMPRE antes de guardar).

const MAX = 20000;
const TAGS = { p: 'p', div: 'div', br: 'br', strong: 'strong', b: 'strong', em: 'em', i: 'em', u: 'u', s: 's', strike: 's', h2: 'h2', h3: 'h3', ul: 'ul', ol: 'ol', li: 'li', a: 'a', blockquote: 'blockquote' };
const VOID = new Set(['br']);
const BLOCK = new Set(['p', 'div', 'h2', 'h3', 'ul', 'ol', 'blockquote']);
// Etiquetas cuyo contenido se descarta entero.
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'textarea', 'noscript', 'select', 'head', 'title']);

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escText = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function attr(raw, name) {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(raw);
  return m ? decode(m[1] ?? m[2] ?? m[3] ?? '').trim() : null;
}

export const safeHref = (url) => (/^(https?:\/\/|mailto:)[^\s<>"]+$/i.test(String(url || '').trim()) ? String(url).trim() : '');

// URL de reproductor para Vimeo, YouTube o Loom (o '' si no es un vídeo reconocido).
export function videoEmbed(url) {
  const u = String(url || '').trim();
  let m = /^https?:\/\/(?:www\.)?(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)(?:\/([a-f0-9]+))?(?:[/?#][^\s]*)?$/i.exec(u);
  if (m) {
    const h = m[2] || /[?&]h=([a-f0-9]+)/i.exec(u)?.[1];
    return `https://player.vimeo.com/video/${m[1]}${h ? `?h=${h}` : ''}`;
  }
  m = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^\s]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i.exec(u);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
  m = /^https?:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/([a-f0-9]{20,40})/i.exec(u);
  if (m) return `https://www.loom.com/embed/${m[1]}`;
  return '';
}

export function sanitizeRich(input) {
  const html = String(input ?? '').slice(0, MAX * 2);
  const out = [];
  const stack = [];
  let skip = null; // { tag, depth } mientras se descarta contenido
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|[^<]+|</g;
  let m;
  while ((m = re.exec(html))) {
    const tok = m[0];
    if (tok.startsWith('<!--')) continue;
    if (!m[1]) { // texto
      if (!skip) out.push(tok === '<' ? '&lt;' : tok.replace(/>/g, '&gt;'));
      continue;
    }
    const name = m[1].toLowerCase();
    const closing = tok.startsWith('</');
    if (skip) {
      if (name === skip.tag) skip.depth += closing ? -1 : (/\/>$/.test(tok) ? 0 : 1);
      if (skip.depth <= 0) skip = null;
      continue;
    }
    if (DROP.has(name)) { if (!closing && !/\/>$/.test(tok)) skip = { tag: name, depth: 1 }; continue; }
    // Vídeo: <div data-video="url"> → se guarda vacío (el reproductor se monta al mostrarlo).
    if (name === 'div' && !closing && attr(m[2], 'data-video') != null) {
      const url = attr(m[2], 'data-video');
      if (videoEmbed(url)) out.push(`<div data-video="${escAttr(url)}"></div>`);
      if (!/\/>$/.test(tok)) skip = { tag: 'div', depth: 1 };
      continue;
    }
    const tag = TAGS[name];
    if (!tag) continue; // etiqueta no permitida: se quita y se queda su texto
    if (closing) {
      const i = stack.lastIndexOf(tag);
      if (i === -1) continue;
      while (stack.length > i) out.push(`</${stack.pop()}>`);
      continue;
    }
    if (VOID.has(tag)) { out.push(`<${tag}>`); continue; }
    // Un bloque no puede ir dentro de un párrafo ni de un título: se cierran antes.
    if (BLOCK.has(tag)) {
      const i = Math.max(stack.lastIndexOf('p'), stack.lastIndexOf('h2'), stack.lastIndexOf('h3'));
      if (i !== -1) while (stack.length > i) out.push(`</${stack.pop()}>`);
    }
    if (tag === 'a') {
      const href = safeHref(attr(m[2], 'href'));
      if (!href) continue; // enlace no seguro: se queda solo el texto
      out.push(`<a href="${escAttr(href)}" target="_blank" rel="noopener noreferrer">`);
    } else {
      out.push(`<${tag}>`);
    }
    stack.push(tag);
  }
  while (stack.length) out.push(`</${stack.pop()}>`);
  let joined = out.join('');
  for (let k = 0; k < 3; k++) joined = joined.replace(/<(strong|em|u|s|a)\b[^>]*><\/\1>/g, '');
  const clean = joined.replace(/^(\s|<br>|<p><\/p>|<div><\/div>|<p><br><\/p>|<div><br><\/div>)+|(\s|<br>|<p><\/p>|<div><\/div>|<p><br><\/p>|<div><br><\/div>)+$/g, '');
  return clean.length > MAX ? clean.slice(0, MAX) : clean;
}

// Notas antiguas en texto plano → HTML; las nuevas se limpian igualmente al mostrarlas.
export function richToHtml(notas) {
  const s = String(notas ?? '');
  if (!s.trim()) return '';
  if (!/<[a-z][\s\S]*>/i.test(s)) return escText(s).replace(/\n/g, '<br>');
  return sanitizeRich(s);
}

export function richToText(notas) {
  return decode(richToHtml(notas)
    .replace(/<div data-video="([^"]*)"><\/div>/g, ' 🎬 ')
    .replace(/<(br|\/p|\/div|\/li|\/h2|\/h3)>/g, '\n')
    .replace(/<li>/g, '• ')
    .replace(/<[^>]+>/g, ''))
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export const richTieneVideo = (notas) => /data-video=/.test(String(notas || ''));
export const richTieneEnlace = (notas) => /<a\s/i.test(String(notas || ''));

// Para emails: los vídeos pasan a ser un enlace.
export function richToEmail(notas) {
  return richToHtml(notas).replace(/<div data-video="([^"]*)"><\/div>/g, (_, u) => `<p>🎬 <a href="${u}">Ver el vídeo</a></p>`);
}
