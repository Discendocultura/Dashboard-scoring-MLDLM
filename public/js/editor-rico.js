// Editor de texto con formato (negrita, cursiva, títulos, listas, pasos numerados, enlaces y vídeos) para
// descripciones: Operativa y lo que lo necesite. Guarda HTML limpio (richtext.js). Con `enlaces`, «@» enlaza tareas y tableros.
//   const ed = montarEditor(contenedor, html, { placeholder })  →  ed.leer() devuelve el HTML limpio
//   montarVideos(raiz)  →  pone el reproductor a los vídeos y abre los enlaces en otra pestaña (para mostrar)
import { richToHtml, sanitizeRich, safeHref, videoEmbed } from './richtext.js';
import { activarArroba } from './enlaces.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function montarVideos(root, editable = false) {
  if (!root) return;
  root.querySelectorAll('[data-video]').forEach((el) => {
    const src = videoEmbed(el.dataset.video);
    if (!src) { el.remove(); return; }
    el.className = 'rt-video';
    if (editable) el.contentEditable = 'false';
    el.innerHTML = `<div class="rt-frame"><iframe src="${esc(src)}" title="Vídeo" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; fullscreen; picture-in-picture"></iframe></div>
      ${editable ? `<div class="rt-video-bar"><span>🎬 ${esc(el.dataset.video)}</span><button type="button" class="btn ghost" data-er-quitar-video>Quitar vídeo</button></div>` : ''}`;
  });
  if (!editable) root.querySelectorAll('a[href]:not(.enlace-int)').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
}

export function montarEditor(cont, html = '', { placeholder = 'Escribe aquí: pasos, enlaces, vídeos…', enlaces = null } = {}) {
  cont.innerHTML = `<div class="er">
    <div class="rt-toolbar er-toolbar" role="toolbar" aria-label="Formato">
      <button type="button" data-er="bold" title="Negrita (Ctrl+B)"><b>B</b></button>
      <button type="button" data-er="italic" title="Cursiva (Ctrl+I)"><i>I</i></button>
      <button type="button" data-er="underline" title="Subrayado"><u>S</u></button>
      <button type="button" data-er="h2" title="Título">T</button>
      <button type="button" data-er="insertUnorderedList" title="Lista con viñetas">• Lista</button>
      <button type="button" data-er="insertOrderedList" title="Pasos numerados">1. Pasos</button>
      <button type="button" data-er="link" title="Enlace">🔗 Enlace</button>
      <button type="button" data-er="video" title="Vídeo de Vimeo, Bunny, YouTube o Loom">🎬 Vídeo</button>
    </div>
    <div class="rt-area rich er-area" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="${esc(placeholder)}"></div>
  </div>`;
  const area = cont.querySelector('.er-area');
  area.innerHTML = richToHtml(html);
  montarVideos(area, true);
  const bar = cont.querySelector('.er-toolbar');
  bar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); }); // no perder la selección
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-er]');
    if (!b) return;
    area.focus();
    const cmd = b.dataset.er;
    if (cmd === 'h2') document.execCommand('formatBlock', false, 'h2');
    else if (cmd === 'link') {
      const url = safeHref((window.prompt('Pega el enlace (https://…)', 'https://') || '').trim());
      if (!url) return;
      if (window.getSelection().toString()) document.execCommand('createLink', false, url);
      else document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(url)}</a>&nbsp;`);
    } else if (cmd === 'video') {
      const url = (window.prompt('Pega el enlace del vídeo (Vimeo, Bunny, YouTube o Loom)', 'https://') || '').trim();
      if (!url) return;
      if (!videoEmbed(url)) { window.alert('No es un enlace de vídeo reconocido (Vimeo, Bunny, YouTube o Loom).'); return; }
      document.execCommand('insertHTML', false, `<div data-video="${esc(url)}"></div><p><br></p>`);
      montarVideos(area, true);
    } else document.execCommand(cmd);
  });
  area.addEventListener('click', (e) => { if (e.target.closest('[data-er-quitar-video]')) e.target.closest('[data-video]').remove(); });
  // Pegar enlaces sueltos: se convierten en enlace.
  area.addEventListener('paste', (e) => {
    const t = e.clipboardData?.getData('text/plain') || '';
    const url = safeHref(t.trim());
    if (url && !/\s/.test(t.trim()) && !e.clipboardData.getData('text/html')) {
      e.preventDefault();
      document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(url)}</a>&nbsp;`);
    }
  });
  if (enlaces) activarArroba(area, enlaces); // «@» para enlazar otra tarea o un tablero
  return {
    area,
    leer() {
      const clone = area.cloneNode(true);
      clone.querySelectorAll('[data-video]').forEach((el) => { el.innerHTML = ''; });
      return sanitizeRich(clone.innerHTML);
    },
  };
}
