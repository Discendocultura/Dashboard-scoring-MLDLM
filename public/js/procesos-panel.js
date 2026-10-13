// Panel «📚 Biblioteca de procesos» (Cuenta → Biblioteca de procesos; solo la agencia): secciones a la izquierda,
// buscador, tarjetas de cada proceso y su ficha con los pasos, los vídeos (Vimeo, Bunny, YouTube, Loom) y los
// enlaces. Se edita aquí mismo y se importa desde un archivo .json (por ejemplo, el «Sistema Operativo» de Asana).
//   abrirProcesos({ api, dialog })
import { richToHtml, sanitizeRich, safeHref, videoEmbed, richToText } from './richtext.js';
import { buscarProcesos, documentado, tieneVideo, nuevoIdProceso } from './procesos.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' }) : '');
// El emoji del título de la sección (si lo lleva), para las tarjetas.
const emojiDe = (t) => /^\p{Extended_Pictographic}/u.exec(String(t || ''))?.[0] || '📁';
const sinEmoji = (t) => String(t || '').replace(/^\p{Extended_Pictographic}️?\s*/u, '');

let ctx = null;
let bib = { secciones: [], procesos: [] };
let sec = ''; // sección elegida ('' = todas)
let q = '';
let abierto = ''; // id del proceso abierto
let editando = null; // copia del proceso que se edita

const body = () => ctx.dialog.querySelector('#pr-body');

export async function abrirProcesos(opts) {
  ctx = opts;
  const dlg = ctx.dialog;
  if (!dlg.dataset.listo) {
    dlg.dataset.listo = '1';
    dlg.querySelector('#pr-cerrar').addEventListener('click', () => dlg.close());
    dlg.querySelector('#pr-nuevo').addEventListener('click', () => editar(null));
    dlg.addEventListener('change', (e) => { if (e.target.matches('#pr-importar, [data-pr-importar]')) importar(e); });
    dlg.addEventListener('click', onClick);
    dlg.addEventListener('input', (e) => {
      if (e.target.id === 'pr-buscar') { q = e.target.value; abierto = ''; pintarLista(); }
    });
  }
  body().innerHTML = '<p class="muted">Cargando…</p>';
  if (!dlg.open) dlg.showModal();
  try {
    bib = await ctx.api('/api/procesos');
  } catch (e) { body().innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  pintar();
}

// ---- Vista ----
function pintar() {
  if (editando) { pintarEditor(); return; }
  body().innerHTML = `<div class="pr">
    <aside class="pr-side">
      <label class="pr-buscar"><span aria-hidden="true">🔎</span><input id="pr-buscar" type="search" placeholder="Buscar un proceso…" value="${esc(q)}" autocomplete="off"></label>
      <nav class="pr-secs" aria-label="Secciones">${seccionesHtml()}</nav>
      <button type="button" class="btn ghost small pr-sec-nueva" data-pr="seccion">＋ Sección</button>
    </aside>
    <section class="pr-main" id="pr-main"></section>
  </div>`;
  pintarLista();
}

function seccionesHtml() {
  const n = (id) => bib.procesos.filter((p) => !id || p.seccion === id).length;
  const b = (id, ico, txt) => `<button type="button" class="pr-sec${sec === id ? ' on' : ''}" data-pr-sec="${esc(id)}"><span class="pr-sec-ico">${ico}</span><span class="pr-sec-t">${esc(txt)}</span><span class="pr-sec-n">${n(id)}</span></button>`;
  return b('', '📚', 'Todos') + bib.secciones.map((s) => b(s.id, emojiDe(s.titulo), sinEmoji(s.titulo))).join('');
}

function pintarLista() {
  const main = body().querySelector('#pr-main');
  if (!main) return;
  if (abierto) { pintarProceso(main); return; }
  if (!bib.procesos.length) {
    main.innerHTML = `<div class="pr-vacio">
      <div class="pr-vacio-ico" aria-hidden="true">📚</div>
      <h3>Tu biblioteca de procesos está vacía</h3>
      <p>Aquí estará el «cómo se hace» de todo: pasos, vídeos y enlaces, a mano para todo el equipo de la agencia.</p>
      <p><label class="btn primary">⤓ Importar el archivo de Asana<input type="file" accept=".json,application/json" data-pr-importar hidden></label> <button type="button" class="btn" data-pr="nuevo">＋ Escribir el primero</button></p>
    </div>`;
    return;
  }
  const lista = buscarProcesos(bib.procesos.filter((p) => !sec || p.seccion === sec), q);
  const s = bib.secciones.find((x) => x.id === sec);
  const porDoc = lista.filter((p) => !documentado(p)).length;
  main.innerHTML = `<header class="pr-main-head"><div><h3>${s ? esc(s.titulo) : '📚 Todos los procesos'}</h3><p class="muted small">${lista.length} proceso${lista.length === 1 ? '' : 's'}${porDoc ? ` · ${porDoc} por documentar` : ''}${q ? ` · buscando «${esc(q)}»` : ''}</p></div></header>
    ${lista.length ? `<div class="pr-grid">${lista.map(tarjeta).join('')}</div>` : '<p class="muted">No hay procesos que coincidan.</p>'}`;
}

function tarjeta(p, i) {
  const s = bib.secciones.find((x) => x.id === p.seccion);
  const txt = richToText(p.html).replace(/🎬/g, '').replace(/\s+/g, ' ').trim();
  const doc = documentado(p);
  // Si el título ya lleva emoji, ese es el icono de la tarjeta; si no, el de la sección.
  const propio = /^\p{Extended_Pictographic}/u.test(p.titulo);
  return `<button type="button" class="pr-card${doc ? '' : ' vacio'}" data-pr-abrir="${esc(p.id)}" style="--i:${Math.min(i, 12)}">
    <span class="pr-card-ico" aria-hidden="true">${propio ? emojiDe(p.titulo) : emojiDe(s?.titulo)}</span>
    <strong>${esc(propio ? sinEmoji(p.titulo) : p.titulo)}</strong>
    <span class="pr-card-txt">${doc ? esc(txt.slice(0, 140)) || 'Vídeo explicativo' : 'Por documentar'}</span>
    <span class="pr-badges">${tieneVideo(p) ? '<span class="pr-badge v">🎬 Vídeo</span>' : ''}${/<a\s/.test(p.html) ? '<span class="pr-badge">🔗 Enlaces</span>' : ''}${!doc ? '<span class="pr-badge pend">✍️ Por documentar</span>' : ''}${!sec && s ? `<span class="pr-badge s">${esc(sinEmoji(s.titulo))}</span>` : ''}</span>
  </button>`;
}

function pintarProceso(main) {
  const p = bib.procesos.find((x) => x.id === abierto);
  if (!p) { abierto = ''; pintarLista(); return; }
  const s = bib.secciones.find((x) => x.id === p.seccion);
  main.innerHTML = `<article class="pr-ficha">
    <nav class="pr-migas"><button type="button" class="link" data-pr="volver">← ${s ? esc(sinEmoji(s.titulo)) : 'Procesos'}</button></nav>
    <header class="pr-ficha-head"><span class="pr-ficha-ico" aria-hidden="true">${emojiDe(/^\p{Extended_Pictographic}/u.test(p.titulo) ? p.titulo : s?.titulo)}</span><div><h3>${esc(sinEmoji(p.titulo))}</h3>
      <p class="muted small">${p.actualizado ? `Actualizado el ${esc(fecha(p.actualizado))}${p.por ? ` por ${esc(p.por)}` : ''}` : 'Importado de Asana'}</p></div>
      <div class="pr-ficha-acc">${p.asana ? `<a class="btn ghost small" href="${esc(p.asana)}" target="_blank" rel="noopener">Abrir en Asana ↗</a>` : ''}<button type="button" class="btn small" data-pr="editar">✏️ Editar</button></div></header>
    <div class="pr-contenido rich">${documentado(p) ? richToHtml(p.html) : '<p class="muted">Este proceso aún no tiene pasos. Pulsa «Editar» para escribirlos o pegar el vídeo.</p>'}</div>
  </article>`;
  montarContenido(main.querySelector('.pr-contenido'));
}

// Vídeos con su reproductor y enlaces en otra pestaña.
function montarContenido(root, editable = false) {
  root.querySelectorAll('[data-video]').forEach((el) => {
    const src = videoEmbed(el.dataset.video);
    if (!src) { el.remove(); return; }
    el.className = 'rt-video';
    if (editable) el.contentEditable = 'false';
    el.innerHTML = `<div class="rt-frame"><iframe src="${esc(src)}" title="Vídeo" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>
      ${editable ? `<div class="rt-video-bar"><span>🎬 ${esc(el.dataset.video)}</span><button type="button" class="btn ghost" data-pr-quitar-video>Quitar vídeo</button></div>` : ''}`;
  });
  if (!editable) root.querySelectorAll('a[href]').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
}

// ---- Editar ----
function editar(id) {
  const p = id ? bib.procesos.find((x) => x.id === id) : null;
  editando = p ? { ...p } : { id: nuevoIdProceso(), seccion: sec || bib.secciones[0]?.id || 'general', titulo: '', html: '', nuevo: true };
  pintarEditor();
}

function pintarEditor() {
  const p = editando;
  body().innerHTML = `<form class="pr-editor" data-pr-form>
    <div class="pr-editor-fila"><label class="field"><span>Título</span><input name="titulo" required maxlength="160" value="${esc(p.titulo)}" placeholder="Cómo crear un evento en el calendario de Skool"></label>
      <label class="field"><span>Sección</span><select name="seccion">${bib.secciones.map((s) => `<option value="${esc(s.id)}"${s.id === p.seccion ? ' selected' : ''}>${esc(s.titulo)}</option>`).join('')}</select></label></div>
    <div class="rt-toolbar pr-toolbar" role="toolbar" aria-label="Formato">
      <button type="button" data-prt="bold" title="Negrita"><b>B</b></button><button type="button" data-prt="italic" title="Cursiva"><i>I</i></button>
      <button type="button" data-prt="h2" title="Título">T</button><button type="button" data-prt="insertUnorderedList" title="Lista">• Lista</button><button type="button" data-prt="insertOrderedList" title="Pasos numerados">1. Pasos</button>
      <button type="button" data-prt="link" title="Enlace">🔗 Enlace</button><button type="button" data-prt="video" title="Vídeo de Vimeo, Bunny, YouTube o Loom">🎬 Vídeo</button>
    </div>
    <div class="rt-area rich pr-area" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Paso a paso, enlaces y vídeos…"></div>
    <footer class="pr-editor-acc">${p.nuevo ? '' : `<button type="button" class="btn ghost danger" data-pr="borrar">Borrar proceso</button>`}<span class="pr-editor-st small muted" role="status"></span><button type="button" class="btn ghost" data-pr="cancelar">Cancelar</button><button class="btn primary">Guardar</button></footer>
  </form>`;
  const area = body().querySelector('.pr-area');
  area.innerHTML = richToHtml(p.html);
  montarContenido(area, true);
  const form = body().querySelector('[data-pr-form]');
  form.addEventListener('submit', guardar);
  const bar = body().querySelector('.pr-toolbar');
  bar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-prt]');
    if (!b) return;
    area.focus();
    const cmd = b.dataset.prt;
    if (cmd === 'h2') document.execCommand('formatBlock', false, 'h2');
    else if (cmd === 'link') {
      const url = safeHref((window.prompt('Pega el enlace (https://…)', 'https://') || '').trim());
      if (!url) return;
      if (window.getSelection().toString()) document.execCommand('createLink', false, url);
      else document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(url)}</a>&nbsp;`);
    } else if (cmd === 'video') {
      const url = (window.prompt('Pega el enlace del vídeo (Vimeo, Bunny, YouTube o Loom)', 'https://') || '').trim();
      if (!url) return;
      if (!videoEmbed(url)) { window.alert('No es un enlace de vídeo reconocido. Prueba con el de Vimeo (https://vimeo.com/123…) o el de Bunny (https://iframe.mediadelivery.net/play/…).'); return; }
      document.execCommand('insertHTML', false, `<div data-video="${esc(url)}"></div><p><br></p>`);
      montarContenido(area, true);
    } else document.execCommand(cmd);
  });
  area.addEventListener('click', (e) => { if (e.target.closest('[data-pr-quitar-video]')) e.target.closest('[data-video]').remove(); });
  form.titulo.focus();
}

function leerEditor() {
  const area = body().querySelector('.pr-area');
  const clone = area.cloneNode(true);
  clone.querySelectorAll('[data-video]').forEach((el) => { el.innerHTML = ''; });
  return sanitizeRich(clone.innerHTML);
}

async function guardar(e) {
  e.preventDefault();
  const f = e.target;
  const st = f.querySelector('.pr-editor-st');
  st.textContent = 'Guardando…';
  try {
    const { nuevo, ...p } = editando;
    const d = await ctx.api('/api/procesos', { method: 'POST', body: { op: 'guardar', proceso: { ...p, titulo: f.titulo.value, seccion: f.seccion.value, html: leerEditor() } } });
    bib = { secciones: d.secciones, procesos: d.procesos };
    abierto = d.proceso.id;
    sec = d.proceso.seccion;
    editando = null;
    pintar();
  } catch (err) { st.textContent = err.message; st.classList.add('error'); }
}

// ---- Importar ----
async function importar(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  let datos;
  try { datos = JSON.parse(await file.text()); } catch { window.alert('El archivo no es un .json válido.'); return; }
  const n = datos?.procesos?.length || 0;
  if (!n) { window.alert('El archivo no trae procesos.'); return; }
  if (!window.confirm(`Se importarán ${n} procesos${datos.origen ? ` de «${datos.origen}»` : ''}. Los que ya estén (mismo proceso) se sustituyen por los del archivo; el resto se queda. ¿Seguir?`)) return;
  try {
    const d = await ctx.api('/api/procesos', { method: 'POST', body: { op: 'importar', biblioteca: datos } });
    bib = { secciones: d.secciones, procesos: d.procesos };
    abierto = ''; sec = '';
    pintar();
    window.alert(`✓ Importados: ${d.nuevos} nuevos y ${d.actualizados} actualizados.`);
  } catch (err) { window.alert(err.message); }
}

// Al cambiar de vista, arriba del todo (el diálogo o su cuerpo, el que tenga el scroll).
const arriba = () => { body().scrollTop = 0; ctx.dialog.scrollTop = 0; };

async function onClick(e) {
  const sb = e.target.closest('[data-pr-sec]');
  if (sb) { sec = sb.dataset.prSec; abierto = ''; pintar(); return; }
  const ab = e.target.closest('[data-pr-abrir]');
  if (ab) { abierto = ab.dataset.prAbrir; pintarLista(); arriba(); return; }
  const b = e.target.closest('[data-pr]');
  if (!b) return;
  const a = b.dataset.pr;
  if (a === 'volver') { abierto = ''; pintarLista(); arriba(); } else if (a === 'editar') editar(abierto);
  else if (a === 'nuevo') editar(null);
  else if (a === 'cancelar') { editando = null; pintar(); } else if (a === 'borrar') {
    if (!window.confirm('¿Borrar este proceso de la biblioteca?')) return;
    try {
      const d = await ctx.api('/api/procesos', { method: 'POST', body: { op: 'borrar', id: editando.id } });
      bib = { secciones: d.secciones, procesos: d.procesos };
      editando = null; abierto = '';
      pintar();
    } catch (err) { window.alert(err.message); }
  } else if (a === 'seccion') {
    const titulo = (window.prompt('Nombre de la sección (puedes empezar con un emoji, p. ej. «📣 Marketing»)') || '').trim();
    if (!titulo) return;
    try {
      const d = await ctx.api('/api/procesos', { method: 'POST', body: { op: 'seccion', titulo } });
      bib = { secciones: d.secciones, procesos: d.procesos };
      sec = d.seccion; abierto = '';
      pintar();
    } catch (err) { window.alert(err.message); }
  }
}
