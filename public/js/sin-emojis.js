// AlquimIA sin emojis: los emojis de la interfaz (títulos, botones, avisos, chips…) se pintan como iconos de línea
// (los de icons.js, del color del texto), y los que no tienen un icono que les corresponda se quitan. Así se escribe
// el código con emojis (más rápido de leer) y la pantalla queda sobria y coherente.
// Se respetan los textos que son de la clienta o van a sus leads (mensajes, plantillas, vistas previas): ahí los
// emojis son parte del mensaje. Para que una zona nueva los conserve, ponle la clase «con-emojis».
import { icon } from './icons.js';

// emoji → [icono, tono]  ·  tonos: ok (verde), err (rojo), warn (ámbar), star (ámbar relleno), dot-* (punto de color)
const G = (icono, ...emojis) => emojis.map((e) => [e, icono]);
const MAPA = new Map([
  ...G('check', '✅', '☑', '✔'), ...G('chat', '💬', '🗣'), ...G('clipboard', '📋', '🗒'), ...G('alert', '⚠', '🚨', '🧯'),
  ...G('cart', '🛒', '🛍', '🧺'), ...G('gear', '⚙', '🛠', '🔧', '🧰'), ...G('video', '🎬', '📼', '🎥', '🎞', '📽', '⏯', '⏸', '⏩', '⏭'),
  ...G('calendar', '📅', '🗓', '📆'), ...G('star', '⭐', '☆', '🌟'), ...G('compass', '🧭'), ...G('target', '🎯', '🧲'),
  ...G('zap', '⚡'), ...G('refresh', '🔁', '🔄', '🔀', '♾', '🧹'), ...G('clock', '⏳', '⏰', '⏱', '🕖'), ...G('sparkle', '✨', '🎉', '🎊', '🔮', '🧬'),
  ...G('megaphone', '📣', '📢'), ...G('rocket', '🚀', '🧗'), ...G('box', '📦'), ...G('gift', '🎁'), ...G('euro', '💶', '💰', '💸'),
  ...G('link', '🔗', '📎', '☁'), ...G('bot', '🤖'), ...G('phone', '📞', '☎', '📲', '📱'), ...G('mail', '📨', '✉', '📧', '📭', '📤'),
  ...G('inbox', '📥'), ...G('card', '💳', '🪪'), ...G('puzzle', '🧩', '🧱'), ...G('bulb', '🧠', '💡'), ...G('book', '🎓', '📚', '📜'),
  ...G('tag', '🏷', '🎟'), ...G('users', '👥', '🫂', '🤝'), ...G('user', '👤', '👩', '🧑', '👨', '🙋', '🩺'), ...G('pencil', '📝', '✏', '🖌'),
  ...G('leaf', '🌱'), ...G('file', '📄', '🧾'), ...G('flask', '🧪'), ...G('building', '🏢', '🏠', '💼'), ...G('palette', '🎨'),
  ...G('image', '🖼', '📸'), ...G('trend', '📈', '🪜'), ...G('chart', '📊', '📉', '📐'), ...G('flame', '🔥'), ...G('folder', '🗂', '📁', '📂'),
  ...G('eye', '👀', '👁', '🪞'), ...G('pin', '📍', '📌'), ...G('lock', '🔒', '🔐'), ...G('key', '🔑', '🗝'), ...G('plus', '➕'),
  ...G('x', '❌', '✖'), ...G('crown', '🏆', '🥇', '🥈', '🥉', '👑', '💎'), ...G('plug', '🔌'), ...G('flag', '🏁', '🚦', '⚑'),
  ...G('ban', '🚫', '⛔', '🛑', '📵', '🔕'), ...G('search', '🔎', '🔍'), ...G('survey', '🗳'), ...G('eyeoff', '🙈', '🫥'),
  ...G('music', '🎵', '🎧', '🎙'), ...G('sun', '☀'), ...G('moon', '🌙'), ...G('compare', '⚖'), ...G('heart', '💛'), ...G('globe', '🌐'),
  ...G('save', '💾'), ...G('trash', '🗑'), ...G('bell', '🔔', '🛎'), ...G('help', '❓', '❔', 'ℹ', '🤷', '🛟'), ...G('logout', '🚪'),
  ...G('thermo', '🌡'), ...G('shield', '🛡'), ...G('arrow', '➡', '👉', '👆', '👇'),
  ...[['🔴', 'dot-red'], ['🟢', 'dot-green'], ['🟠', 'dot-orange'], ['🟡', 'dot-yellow'], ['🔵', 'dot-blue'], ['🟦', 'dot-blue'], ['🟪', 'dot-purple'], ['⚪', 'dot-grey']],
]);
const TONO = { '✅': 'ok', '☑': 'ok', '✔': 'ok', '❌': 'err', '✖': 'err', '🚫': 'err', '⛔': 'err', '🛑': 'err', '⚠': 'warn', '🚨': 'warn', '⭐': 'star', '🌟': 'star' };

// Cualquier emoji (con sus variantes y uniones), para quitar los que no tienen icono.
const EMOJI = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2})(?:️|\p{Emoji_Modifier})*(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})*)*/gu;
// Signos tipográficos que no son emojis de verdad y se quedan (flechas, ✓, ✕, ☰, casillas…).
const SE_QUEDAN = new Set(['↗', '↘', '←', '→', '↑', '↓', '↔', '↕', '✓', '✕', '☰', '☐', '©', '®', '™', '‼', '⁉', '〰', '↩', '↪', '▶', '◀', '⏏', '▪', '▫', '◻', '◼', '◽', '◾', '⬆', '⬇', '⬅', '↖', '↙', '⤴', '⤵', '#', '*']);
const base = (e) => e.replace(/[️‍]|\p{Emoji_Modifier}/gu, '');
const esEmoji = (e) => !SE_QUEDAN.has(base(e)) && !/^[0-9#*]$/.test(base(e));

// El menú lateral, la Operativa y los Procesos se quedan con sus emojis (así gustan).
const RESPETAR = '#sidebar, #operativa-dialog, #procesos-dialog, .con-emojis, textarea, input, pre, code, script, style, svg, [contenteditable=""], [contenteditable="true"], .gw-msg, .xo-msg, .seg-msg, .nl-preview, .wa-pl-body, .cc-prev, .ll-notas, .rich';
const svgDe = (e) => {
  const b = base(e);
  const k = MAPA.get(b) || MAPA.get(e);
  if (!k) return '';
  if (k.startsWith('dot-')) return `<span class="emo-dot ${k}" aria-hidden="true"></span>`;
  return icon(k, `ico-emo${TONO[b] ? ` ico-${TONO[b]}` : ''}`);
};

const plantilla = document.createElement('template');
function cambiarTexto(nodo) {
  const t = nodo.nodeValue;
  EMOJI.lastIndex = 0;
  if (!EMOJI.test(t)) return;
  let html = '';
  let ultimo = 0;
  let cambia = false;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  t.replace(EMOJI, (e, i) => {
    if (!esEmoji(e)) return e;
    cambia = true;
    // Con texto detrás, el icono lleva su propio margen (y se come el espacio, para que todos queden igual de separados).
    const fin = i + e.length;
    const detras = /\S/.test(t.slice(fin));
    const svg = svgDe(e).replace(/class="(ico |emo-dot )/, detras ? 'class="$1ico-sep ' : 'class="$1');
    html += esc(t.slice(ultimo, i)) + svg;
    // Sin icono: fuera el emoji y el espacio que lo separaba del texto.
    ultimo = fin + (t[fin] === ' ' && (detras || !svg) ? 1 : 0);
    return e;
  });
  if (!cambia) return;
  html += esc(t.slice(ultimo));
  plantilla.innerHTML = html;
  nodo.replaceWith(plantilla.content);
}
const limpio = (s) => s.replace(EMOJI, (e) => (esEmoji(e) ? '' : e)).replace(/\s{2,}/g, ' ').trim();
const ATRIBUTOS = ['title', 'placeholder', 'aria-label'];

function repasar(raiz) {
  if (raiz.nodeType === 3) { if (!raiz.parentElement?.closest(RESPETAR) && raiz.parentElement?.tagName !== 'OPTION') cambiarTexto(raiz); return; }
  if (raiz.nodeType !== 1 || raiz.closest?.(RESPETAR)) return;
  const textos = [];
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(RESPETAR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = w.nextNode(); n; n = w.nextNode()) textos.push(n);
  for (const n of textos) {
    if (n.parentElement?.tagName === 'OPTION') { const v = limpio(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; } else cambiarTexto(n);
  }
  for (const el of [raiz, ...raiz.querySelectorAll('[title], [placeholder], [aria-label]')]) {
    for (const a of ATRIBUTOS) { const v = el.getAttribute?.(a); if (v && EMOJI.test(v)) { EMOJI.lastIndex = 0; const l = limpio(v); if (l !== v) el.setAttribute(a, l); } EMOJI.lastIndex = 0; }
  }
}

// Al cargar y cada vez que algo se pinta (en el siguiente fotograma, todo junto).
export function sinEmojis(raiz = document.body) {
  repasar(raiz);
  const pendientes = new Set();
  let programado = false;
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'characterData') pendientes.add(m.target);
      else if (m.type === 'attributes') pendientes.add(m.target);
      else for (const n of m.addedNodes) pendientes.add(n);
    }
    if (programado) return;
    programado = true;
    requestAnimationFrame(() => {
      programado = false;
      const lista = [...pendientes];
      pendientes.clear();
      for (const n of lista) if (n.isConnected) repasar(n);
    });
  }).observe(raiz, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
}
