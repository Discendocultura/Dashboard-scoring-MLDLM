// Panel «📚 Biblioteca de procesos» (Inicio de la agencia y Cuenta; solo la agencia). Secciones a la izquierda,
// buscador y filtros, tarjetas y la ficha de cada proceso con el formato de una tarea de Asana: título, responsable,
// fecha (que puede repetirse), sección, descripción con enlaces y vídeos, subtareas, comentarios y actividad.
// Todo se guarda al momento. Se importa desde un archivo .json (por ejemplo, el «Sistema Operativo» de Asana).
// «＋ Nuevo» pregunta si se crea desde cero o copiando una tarea del tablero de algún cliente (siempre general).
//   abrirProcesos({ api, dialog })
import { richToHtml, sanitizeRich, safeHref, videoEmbed, richToText } from './richtext.js';
import { buscarProcesos, documentado, tieneVideo, estadoFecha, proximaTrasHecho, enProyecto, encajaEnRepetir, primeraFechaRepetir } from './procesos.js';
import { editorRepetir, leerRepetir, pulsarDsem } from './repetir-ui.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const fechaCorta = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
const cuando = (iso) => {
  if (!iso) return '';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`;
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
};
// El emoji del título (de la sección o del proceso), para los iconos.
const emojiDe = (t) => /^\p{Extended_Pictographic}/u.exec(String(t || ''))?.[0] || '';
const sinEmoji = (t) => String(t || '').replace(/^\p{Extended_Pictographic}️?\s*/u, '');
const iniciales = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';
const avatar = (nombre, cls = '') => `<span class="pr-av ${cls}" title="${esc(nombre)}">${esc(iniciales(nombre))}</span>`;
// Texto de un comentario: saltos de línea y enlaces.
const textoComentario = (t) => esc(t).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`).replace(/\n/g, '<br>');
const FECHA_TXT = { vencida: 'Vencido', hoy: 'Hoy', manana: 'Mañana' };

let ctx = null;
let bib = { secciones: [], procesos: [], equipo: [], yo: '', proyectos: [] };
// Proyecto elegido arriba a la izquierda ('' = todos · '_general' = solo los generales · id de un cliente). Se recuerda.
const LS_PROY = 'lsd_pr_proyecto';
let proy = (() => { try { return localStorage.getItem(LS_PROY) || ''; } catch { return ''; } })();
let lote = false; // abierto el «asignar estos a un proyecto»
let sec = ''; // sección elegida ('' = todas)
let q = '';
let filtro = ''; // '' | 'mios' | 'fecha' | 'vencidos'
let abierto = ''; // id del proceso abierto
let editandoDesc = false;
let pestanaAct = 'comentarios';
// Crear un proceso: '' | 'elegir' (desde cero o desde un tablero) | 'tablero' (elegir la tarea que se copia).
let creando = '';
let origen = { proyecto: '', tablero: '', q: '' };
let operativa = null; // tareas y tableros de la Operativa (para copiar una tarea), se cargan al pedirlos

const body = () => ctx.dialog.querySelector('#pr-body');
const proc = (id = abierto) => bib.procesos.find((x) => x.id === id);
const nombreDe = (uid) => bib.equipo.find((u) => u.id === uid)?.nombre || '';
const proyDe = (id) => bib.proyectos.find((x) => x.id === id);
const chipProy = (id) => { const x = proyDe(id); return `<span class="pr-proy" style="--cl:${esc(x?.color || 'var(--accent)')}">${esc(x?.nombre || id)}</span>`; };
const proyectosHtml = (p) => (p.proyectos.length ? p.proyectos.map(chipProy).join('') : '<span class="pr-proy general">🌐 General</span>');

async function enviar(cuerpo) {
  const d = await ctx.api('/api/procesos', { method: 'POST', body: cuerpo });
  bib = { ...bib, secciones: d.secciones, procesos: d.procesos };
  return d;
}

export async function abrirProcesos(opts) {
  ctx = opts;
  const dlg = ctx.dialog;
  if (!dlg.dataset.listo) {
    dlg.dataset.listo = '1';
    dlg.querySelector('#pr-cerrar').addEventListener('click', () => dlg.close());
    dlg.querySelector('#pr-nuevo').addEventListener('click', nuevo);
    dlg.addEventListener('change', onChange);
    dlg.addEventListener('click', onClick);
    dlg.addEventListener('submit', onSubmit);
    dlg.addEventListener('input', (e) => {
      if (e.target.id === 'pr-buscar') { q = e.target.value; abierto = ''; creando = ''; pintarLista(); }
      if (e.target.dataset.prOrigen === 'q') {
        origen.q = e.target.value;
        pintarLista();
        const i = body().querySelector('[data-pr-origen="q"]');
        i?.focus(); i?.setSelectionRange(origen.q.length, origen.q.length);
      }
    });
    dlg.addEventListener('keydown', onKey);
  }
  body().innerHTML = '<p class="muted">Cargando…</p>';
  creando = '';
  operativa = null;
  if (!dlg.open) dlg.showModal();
  try {
    bib = await ctx.api('/api/procesos');
    bib.proyectos ||= [];
    bib.equipo ||= [];
    if (proy && proy !== '_general' && !bib.proyectos.some((x) => x.id === proy)) proy = '';
  } catch (e) { body().innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  // Solo lectura (perfil «Solo Operativa»): se consulta, no se cambia nada.
  dlg.classList.toggle('pr-lectura', Boolean(bib.lectura));
  const sub = dlg.querySelector('.pr-sub');
  if (sub) sub.textContent = bib.lectura ? '· solo consulta' : '· solo la agencia';
  pintar();
}

// ---- Estructura ----
function pintar() {
  body().innerHTML = `<div class="pr">
    <aside class="pr-side">
      <label class="pr-proy-sel"><span>Proyecto</span><select id="pr-proyecto"><option value="">Todos los proyectos</option><option value="_general"${proy === '_general' ? ' selected' : ''}>🌐 Solo los generales</option>${bib.proyectos.map((x) => `<option value="${esc(x.id)}"${proy === x.id ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></label>
      <label class="pr-buscar"><span aria-hidden="true">🔎</span><input id="pr-buscar" type="search" placeholder="Buscar un proceso…" value="${esc(q)}" autocomplete="off"></label>
      <nav class="pr-secs" aria-label="Secciones">${seccionesHtml()}</nav>
      <button type="button" class="btn ghost small pr-sec-nueva" data-pr="seccion">＋ Sección</button>
    </aside>
    <section class="pr-main" id="pr-main"></section>
  </div>`;
  pintarLista();
}

function seccionesHtml() {
  const n = (id) => bib.procesos.filter((p) => (!id || p.seccion === id) && enProyecto(p, proy)).length;
  const b = (id, ico, txt) => `<button type="button" class="pr-sec${sec === id ? ' on' : ''}" data-pr-sec="${esc(id)}"><span class="pr-sec-ico">${ico}</span><span class="pr-sec-t">${esc(txt)}</span><span class="pr-sec-n">${n(id)}</span></button>`;
  return b('', '📚', 'Todos') + bib.secciones.map((s) => b(s.id, emojiDe(s.titulo) || '📁', sinEmoji(s.titulo))).join('');
}

function pintarLista() {
  const main = body().querySelector('#pr-main');
  if (!main) return;
  if (creando) { main.innerHTML = crearHtml(); return; }
  if (abierto && proc()) { pintarProceso(main); return; }
  abierto = '';
  if (!bib.procesos.length) {
    main.innerHTML = `<div class="pr-vacio">
      <div class="pr-vacio-ico" aria-hidden="true">📚</div>
      <h3>Tu biblioteca de procesos está vacía</h3>
      <p>Aquí estará el «cómo se hace» de los procesos <strong>generales</strong> de la agencia: pasos, vídeos y enlaces, a mano para todo el equipo. Lo propio de cada cliente vive en sus tableros.</p>
      <p><button type="button" class="btn primary" data-pr="nuevo">＋ Crear el primero</button></p>
    </div>`;
    return;
  }
  const hoy = hoyMadrid();
  let lista = buscarProcesos(bib.procesos.filter((p) => (!sec || p.seccion === sec) && enProyecto(p, proy)), q);
  if (filtro === 'mios') lista = lista.filter((p) => p.responsable && p.responsable === bib.yo);
  if (filtro === 'fecha') lista = lista.filter((p) => p.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (filtro === 'vencidos') lista = lista.filter((p) => estadoFecha(p, hoy) === 'vencida');
  const s = bib.secciones.find((x) => x.id === sec);
  const porDoc = lista.filter((p) => !documentado(p)).length;
  const vencidos = bib.procesos.filter((p) => estadoFecha(p, hoy) === 'vencida').length;
  const chip = (id, txt) => `<button type="button" class="pr-filtro${filtro === id ? ' on' : ''}" data-pr-filtro="${id}">${txt}</button>`;
  const pNombre = proy === '_general' ? 'generales' : proyDe(proy)?.nombre;
  main.innerHTML = `<header class="pr-main-head"><div><h3>${s ? esc(s.titulo) : '📚 Todos los procesos'}</h3><p class="muted small">${lista.length} proceso${lista.length === 1 ? '' : 's'}${pNombre ? ` · ${proy === '_general' ? 'solo los generales' : `de ${esc(pNombre)} y los generales`}` : ''}${porDoc ? ` · ${porDoc} por documentar` : ''}${q ? ` · buscando «${esc(q)}»` : ''}</p></div>
      <div class="pr-filtros">${chip('', 'Todos')}${bib.yo ? chip('mios', '👤 Míos') : ''}${chip('fecha', '📅 Con fecha')}${chip('vencidos', `⏰ Vencidos${vencidos ? ` <b>${vencidos}</b>` : ''}`)}<button type="button" class="pr-filtro pr-vaciar" data-pr="vaciar" title="Borrar todos los procesos de la biblioteca">🗑️ Vaciar biblioteca</button></div></header>
    ${lista.length && bib.proyectos.length ? loteHtml(lista) : ''}
    ${lista.length ? `<div class="pr-grid">${lista.map((p, i) => tarjeta(p, i, hoy)).join('')}</div>` : '<p class="muted">No hay procesos que coincidan.</p>'}`;
}

function tarjeta(p, i, hoy) {
  const s = bib.secciones.find((x) => x.id === p.seccion);
  const txt = richToText(p.html).replace(/🎬/g, '').replace(/\s+/g, ' ').trim();
  const doc = documentado(p);
  const ef = estadoFecha(p, hoy);
  const subHechas = p.subtareas.filter((x) => x.hecha).length;
  const hecho = p.hecho && !p.repetir.tipo;
  return `<button type="button" class="pr-card${doc ? '' : ' vacio'}${hecho ? ' hecho' : ''}" data-pr-abrir="${esc(p.id)}" style="--i:${Math.min(i, 12)}">
    <span class="pr-card-ico" aria-hidden="true">${hecho ? '✅' : emojiDe(p.titulo) || emojiDe(s?.titulo) || '📄'}</span>
    <strong>${esc(sinEmoji(p.titulo))}</strong>
    <span class="pr-card-txt">${doc ? esc(txt.slice(0, 140)) || 'Vídeo explicativo' : 'Por documentar'}</span>
    <span class="pr-badges">${p.fecha ? `<span class="pr-badge f-${ef || 'futura'}">${p.repetir.tipo ? '🔁' : '📅'} ${esc(FECHA_TXT[ef] || fechaCorta(p.fecha))}</span>` : ''}${p.subtareas.length ? `<span class="pr-badge">☑️ ${subHechas}/${p.subtareas.length}</span>` : ''}${p.comentarios.length ? `<span class="pr-badge">💬 ${p.comentarios.length}</span>` : ''}${tieneVideo(p) ? '<span class="pr-badge v">🎬 Vídeo</span>' : ''}${!doc ? '<span class="pr-badge pend">✍️ Por documentar</span>' : ''}${!sec && s ? `<span class="pr-badge s">${esc(sinEmoji(s.titulo))}</span>` : ''}</span>
    ${bib.proyectos.length ? `<span class="pr-card-proys">${proyectosHtml(p)}</span>` : ''}
    ${p.responsable ? `<span class="pr-card-resp">${avatar(nombreDe(p.responsable))}</span>` : ''}
  </button>`;
}

// «Asignar estos N a un proyecto»: los que se ven ahora (sección, búsqueda y filtros), de una vez.
function loteHtml(lista) {
  if (!lote) return `<p class="pr-lote-abrir"><button type="button" class="btn ghost small" data-pr="lote">🏷️ Asignar ${lista.length === 1 ? 'este proceso' : `estos ${lista.length} procesos`} a un proyecto…</button></p>`;
  return `<div class="pr-lote" data-pr-lote-ids="${esc(lista.map((p) => p.id).join(','))}">
    <strong>¿De qué proyecto son ${lista.length === 1 ? 'este proceso' : `estos ${lista.length} procesos`}?</strong>
    <div class="pr-proy-chips">${bib.proyectos.map((x) => `<label class="pr-pchip pr-pchip-check" style="--cl:${esc(x.color || 'var(--accent)')}"><input type="checkbox" value="${esc(x.id)}"> ${esc(x.nombre)}</label>`).join('')}</div>
    <div class="pr-lote-acc"><button type="button" class="btn primary small" data-pr="lote-aplicar">Asignar</button><button type="button" class="btn ghost small" data-pr="lote-general">🌐 Hacerlos generales</button><button type="button" class="btn ghost small" data-pr="lote-cerrar">Cancelar</button></div>
  </div>`;
}

// ---- La ficha (como una tarea de Asana) ----
function pintarProceso(main) {
  const p = proc();
  const s = bib.secciones.find((x) => x.id === p.seccion);
  const hoy = hoyMadrid();
  const ef = estadoFecha(p, hoy);
  const hecho = p.hecho && !p.repetir.tipo;
  const subHechas = p.subtareas.filter((x) => x.hecha).length;
  const fila = (label, html) => `<div class="pr-campo"><span class="pr-campo-l">${label}</span><div class="pr-campo-v">${html}</div></div>`;
  main.innerHTML = `<article class="pr-tarea">
    <div class="pr-tarea-barra">
      <button type="button" class="link pr-volver" data-pr="volver">← ${s ? esc(sinEmoji(s.titulo)) : 'Procesos'}</button>
      <div class="pr-tarea-acc">
        <button type="button" class="btn small pr-hecho${hecho ? ' on' : ''}" data-pr="hecho">${hecho ? '✓ Hecho' : p.repetir.tipo && p.fecha ? '✓ Hecho · siguiente' : '✓ Marcar como hecho'}</button>
        ${p.asana ? `<a class="btn ghost small" href="${esc(p.asana)}" target="_blank" rel="noopener">Asana ↗</a>` : ''}
        <button type="button" class="btn ghost small" data-pr="borrar" title="Borrar proceso" aria-label="Borrar proceso">🗑️</button>
      </div>
    </div>
    ${hecho ? `<p class="pr-hecho-aviso">✅ Hecho ${esc(cuando(p.hechoEn))}</p>` : ''}
    <textarea class="pr-titulo" data-pr-campo="titulo" rows="1" maxlength="160" aria-label="Título">${esc(p.titulo)}</textarea>
    <div class="pr-campos">
      ${fila('Responsable', `<span class="pr-resp">${p.responsable ? avatar(nombreDe(p.responsable)) : '<span class="pr-av vacio">?</span>'}<select data-pr-campo="responsable" aria-label="Responsable"><option value="">Sin asignar</option>${bib.equipo.map((u) => `<option value="${esc(u.id)}"${u.id === p.responsable ? ' selected' : ''}>${esc(u.nombre)}</option>`).join('')}</select></span>`)}
      ${fila('Fecha', `<span class="pr-fecha"><input type="date" data-pr-campo="fecha" value="${esc(p.fecha)}" aria-label="Fecha">${ef && FECHA_TXT[ef] ? `<span class="pr-badge f-${ef}">${FECHA_TXT[ef]}</span>` : ''}${p.fecha ? '<button type="button" class="link small" data-pr="sin-fecha">Quitar</button>' : ''}</span>`)}
      ${fila('Se repite', `<span class="pr-rep">${editorRepetir(p.repetir)}${p.repetir.tipo && p.fecha && !encajaEnRepetir(p.fecha, p.repetir) ? `<span class="muted small">Su fecha no cae en el día elegido.</span><button type="button" class="btn small" data-pr="rep-alinear">📅 Pasarlo al ${esc(fechaCorta(primeraFechaRepetir(p.fecha < hoy ? hoy : p.fecha, p.repetir)))}</button>` : p.repetir.tipo && p.fecha ? `<span class="muted small">🔁 Al marcarlo como hecho pasa al ${esc(fechaCorta(proximaTrasHecho(p.fecha, p.repetir, hoy)))}</span>` : p.repetir.tipo ? '<span class="muted small">Pon una fecha para que se repita</span>' : ''}</span>`)}
      ${bib.proyectos.length ? fila('Proyecto', `<span class="pr-proy-chips"><button type="button" class="pr-pchip${p.proyectos.length ? '' : ' on'}" data-pr-proy="">🌐 General (todos)</button>${bib.proyectos.map((x) => `<button type="button" class="pr-pchip${p.proyectos.includes(x.id) ? ' on' : ''}" data-pr-proy="${esc(x.id)}" style="--cl:${esc(x.color || 'var(--accent)')}">${esc(x.nombre)}</button>`).join('')}</span>`) : ''}
      ${fila('Sección', `<select data-pr-campo="seccion" aria-label="Sección">${bib.secciones.map((x) => `<option value="${esc(x.id)}"${x.id === p.seccion ? ' selected' : ''}>${esc(x.titulo)}</option>`).join('')}</select>`)}
    </div>
    <section class="pr-bloque">
      <header class="pr-bloque-h"><h4>Descripción</h4>${editandoDesc ? '' : '<button type="button" class="btn ghost small" data-pr="editar-desc">✏️ Editar</button>'}</header>
      ${editandoDesc ? editorHtml() : `<div class="pr-contenido rich" data-pr="editar-desc-click">${documentado(p) ? richToHtml(p.html) : '<p class="muted">Sin descripción. Pulsa «Editar» para escribir los pasos, pegar enlaces o añadir un vídeo.</p>'}</div>`}
    </section>
    <section class="pr-bloque">
      <header class="pr-bloque-h"><h4>Subtareas ${p.subtareas.length ? `<span class="muted">${subHechas}/${p.subtareas.length}</span>` : ''}</h4></header>
      ${p.subtareas.length ? `<div class="pr-sub-barra"><span style="width:${(subHechas / p.subtareas.length) * 100}%"></span></div>` : ''}
      <ul class="pr-subs">${p.subtareas.map((x) => `<li class="${x.hecha ? 'ok' : ''}"><label><input type="checkbox" data-pr-sub="${esc(x.id)}"${x.hecha ? ' checked' : ''}><span>${esc(x.texto)}</span></label><button type="button" class="pr-x" data-pr-sub-borrar="${esc(x.id)}" aria-label="Quitar subtarea">✕</button></li>`).join('')}</ul>
      <form class="pr-sub-nueva" data-pr-form="sub"><input name="texto" maxlength="300" placeholder="＋ Añadir subtarea (Enter)" autocomplete="off"></form>
    </section>
    <section class="pr-bloque pr-conv">
      <nav class="pr-tabs"><button type="button" class="${pestanaAct === 'comentarios' ? 'on' : ''}" data-pr-tab="comentarios">Comentarios ${p.comentarios.length ? `<b>${p.comentarios.length}</b>` : ''}</button><button type="button" class="${pestanaAct === 'actividad' ? 'on' : ''}" data-pr-tab="actividad">Toda la actividad</button></nav>
      <ol class="pr-hilo">${hiloHtml(p)}</ol>
      <form class="pr-comentar" data-pr-form="comentar">${avatar(nombreDe(bib.yo) || 'Yo', 'yo')}<textarea name="texto" rows="2" maxlength="4000" placeholder="Escribe un comentario… (Ctrl + Enter para enviar)"></textarea><button class="btn primary small">Comentar</button></form>
    </section>
  </article>`;
  ajustarTitulo();
  if (editandoDesc) prepararEditor();
  else montarContenido(main.querySelector('.pr-contenido'));
}

function hiloHtml(p) {
  const com = p.comentarios.map((c) => ({ ...c, tipo: 'c' }));
  const items = pestanaAct === 'actividad' ? [...com, ...p.actividad.map((a) => ({ ...a, tipo: 'a' }))].sort((a, b) => String(a.en).localeCompare(String(b.en))) : com;
  if (!items.length) return `<li class="pr-hilo-vacio muted">${pestanaAct === 'actividad' ? 'Aún no hay actividad.' : 'Sin comentarios todavía. Escribe el primero abajo.'}</li>`;
  return items.map((x) => (x.tipo === 'a'
    ? `<li class="pr-act"><span class="pr-act-dot"></span><span><strong>${esc(x.por)}</strong> ${esc(x.txt)} · <span class="muted">${esc(cuando(x.en))}</span></span></li>`
    : `<li class="pr-com">${avatar(x.por)}<div class="pr-com-c"><header><strong>${esc(x.por)}</strong><span class="muted small">${esc(cuando(x.en))}</span><button type="button" class="pr-x" data-pr-com-borrar="${esc(x.id)}" aria-label="Borrar comentario">✕</button></header><div class="pr-com-t">${textoComentario(x.texto)}</div></div></li>`)).join('');
}

function ajustarTitulo() {
  const t = body().querySelector('.pr-titulo');
  if (!t) return;
  t.style.height = 'auto';
  t.style.height = `${t.scrollHeight}px`;
}

// Vídeos con su reproductor y enlaces en otra pestaña.
function montarContenido(root, editable = false) {
  if (!root) return;
  root.querySelectorAll('[data-video]').forEach((el) => {
    const src = videoEmbed(el.dataset.video);
    if (!src) { el.remove(); return; }
    el.className = 'rt-video';
    if (editable) el.contentEditable = 'false';
    el.innerHTML = `<div class="rt-frame"><iframe src="${esc(src)}" title="Vídeo" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; fullscreen; picture-in-picture"></iframe></div>
      ${editable ? `<div class="rt-video-bar"><span>🎬 ${esc(el.dataset.video)}</span><button type="button" class="btn ghost" data-pr-quitar-video>Quitar vídeo</button></div>` : ''}`;
  });
  if (!editable) root.querySelectorAll('a[href]').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
}

// ---- Descripción (editor) ----
const editorHtml = () => `<div class="pr-editor">
  <div class="rt-toolbar pr-toolbar" role="toolbar" aria-label="Formato">
    <button type="button" data-prt="bold" title="Negrita"><b>B</b></button><button type="button" data-prt="italic" title="Cursiva"><i>I</i></button>
    <button type="button" data-prt="h2" title="Título">T</button><button type="button" data-prt="insertUnorderedList" title="Lista">• Lista</button><button type="button" data-prt="insertOrderedList" title="Pasos numerados">1. Pasos</button>
    <button type="button" data-prt="link" title="Enlace">🔗 Enlace</button><button type="button" data-prt="video" title="Vídeo de Vimeo, Bunny, YouTube o Loom">🎬 Vídeo</button>
  </div>
  <div class="rt-area rich pr-area" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Paso a paso, enlaces y vídeos…"></div>
  <footer class="pr-editor-acc"><span class="pr-editor-st small muted" role="status"></span><button type="button" class="btn ghost small" data-pr="cancelar-desc">Cancelar</button><button type="button" class="btn primary small" data-pr="guardar-desc">Guardar</button></footer>
</div>`;

function prepararEditor() {
  const area = body().querySelector('.pr-area');
  area.innerHTML = richToHtml(proc().html);
  montarContenido(area, true);
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
  area.focus();
}

function leerEditor() {
  const clone = body().querySelector('.pr-area').cloneNode(true);
  clone.querySelectorAll('[data-video]').forEach((el) => { el.innerHTML = ''; });
  return sanitizeRich(clone.innerHTML);
}

// ---- Guardar ----
async function guardarCampos(campos) {
  try {
    await enviar({ op: 'campos', id: abierto, campos });
  } catch (err) { window.alert(err.message); }
  pintarLista();
}

// «＋ Nuevo»: primero se elige cómo (desde cero o copiando una tarea de un tablero de algún cliente).
function nuevo() {
  creando = 'elegir';
  abierto = '';
  pintarLista();
  arriba();
}

async function cargarOperativa() {
  if (operativa) return operativa;
  const d = await ctx.api('/api/operativa');
  operativa = { tareas: d.tareas || [], tableros: d.tableros || [], proyectos: (d.proyectos || []).filter((x) => x.id !== '_agencia') };
  return operativa;
}
const tablerosDeProy = (id) => [{ id: 'general', nombre: 'General' }, ...operativa.tableros.filter((b) => b.proyecto === id && b.id !== 'general')]
  .map((b) => ({ ...b, nombre: operativa.tableros.find((x) => x.proyecto === id && x.id === b.id)?.nombre || b.nombre }));
const tableroDe = (t) => (operativa.tableros.some((b) => b.proyecto === t.cliente && b.id === t.opTablero) ? t.opTablero : 'general');

function crearHtml() {
  if (creando === 'elegir') {
    return `<section class="pr-crear">
      <header class="pr-crear-h"><button type="button" class="btn ghost small" data-pr="crear-cancelar">← Volver</button><h3>Nuevo proceso</h3></header>
      <p class="muted">Aquí van los procesos <strong>generales</strong> de la agencia (los que sirven para cualquier cliente). ¿Cómo quieres crearlo?</p>
      <div class="pr-crear-ops">
        <button type="button" class="pr-crear-op" data-pr="crear-cero"><span class="pr-crear-ico">✍️</span><strong>Desde cero</strong><span class="muted small">Escribe el título, los pasos, los vídeos y las subtareas.</span></button>
        <button type="button" class="pr-crear-op" data-pr="crear-tablero"><span class="pr-crear-ico">📥</span><strong>Importar de un tablero</strong><span class="muted small">Copia una tarea que ya tengas en el tablero de algún cliente: su descripción y su checklist (como subtareas).</span></button>
      </div>
    </section>`;
  }
  if (!operativa) return '<p class="muted">Cargando los tableros…</p>';
  const proys = operativa.proyectos;
  const tabs = origen.proyecto ? tablerosDeProy(origen.proyecto) : [];
  const nq = origen.q.trim().toLowerCase();
  const lista = origen.proyecto ? operativa.tareas.filter((t) => t.cliente === origen.proyecto && (!origen.tablero || tableroDe(t) === origen.tablero) && (!nq || t.titulo.toLowerCase().includes(nq))).slice(0, 80) : [];
  return `<section class="pr-crear">
    <header class="pr-crear-h"><button type="button" class="btn ghost small" data-pr="crear-volver">← Volver</button><h3>📥 Importar de un tablero</h3></header>
    <div class="pr-crear-fila">
      <label class="field"><span>Cliente</span><select data-pr-origen="proyecto"><option value="">— Elige el cliente —</option>${proys.map((x) => `<option value="${esc(x.id)}"${origen.proyecto === x.id ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></label>
      <label class="field"><span>Tablero</span><select data-pr-origen="tablero" ${origen.proyecto ? '' : 'disabled'}><option value="">Todos los tableros</option>${tabs.map((b) => `<option value="${esc(b.id)}"${origen.tablero === b.id ? ' selected' : ''}>${esc(b.nombre)}</option>`).join('')}</select></label>
      <label class="field"><span>Buscar</span><input type="search" data-pr-origen="q" value="${esc(origen.q)}" placeholder="Nombre de la tarea…" ${origen.proyecto ? '' : 'disabled'}></label>
    </div>
    ${!origen.proyecto ? '<p class="muted">Elige el cliente para ver las tareas de sus tableros.</p>'
    : lista.length ? `<ul class="pr-crear-lista">${lista.map((t) => `<li><button type="button" class="pr-crear-t" data-pr-copiar="${esc(`${t.cliente}|${t.code}|${t.id}`)}"><strong>${esc(t.titulo)}</strong><span class="muted small">${esc(tabs.find((b) => b.id === tableroDe(t))?.nombre || 'General')}${t.embudo ? ` · ${esc(t.embudo)}` : ''}${t.checklist?.length ? ` · ☑ ${t.checklist.length} pasos` : ''}${richToText(t.notas).trim() ? ' · 📝 con descripción' : ''}</span></button></li>`).join('')}</ul>`
    : '<p class="muted">No hay tareas que coincidan.</p>'}
  </section>`;
}

async function crearProceso(extra = {}) {
  try {
    const d = await enviar({ op: 'nuevo', seccion: sec || bib.secciones[0]?.id, titulo: 'Proceso nuevo', ...extra });
    creando = '';
    abierto = d.proceso.id;
    q = ''; filtro = '';
    editandoDesc = false;
    pintar();
    const t = body().querySelector('.pr-titulo');
    t?.focus(); t?.select();
  } catch (err) { window.alert(err.message); }
}

async function importar(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  let datos;
  try { datos = JSON.parse(await file.text()); } catch { window.alert('El archivo no es un .json válido.'); return; }
  const n = datos?.procesos?.length || 0;
  if (!n) { window.alert('El archivo no trae procesos.'); return; }
  if (!window.confirm(`Se importarán ${n} procesos${datos.origen ? ` de «${datos.origen}»` : ''}. Los que ya estén se actualizan (título, sección y descripción; sus fechas, subtareas y comentarios se quedan). ¿Seguir?`)) return;
  try {
    const d = await enviar({ op: 'importar', biblioteca: datos });
    abierto = ''; sec = '';
    pintar();
    window.alert(`✓ Importados: ${d.nuevos} nuevos y ${d.actualizados} actualizados.`);
  } catch (err) { window.alert(err.message); }
}

// ---- Eventos ----
const arriba = () => { body().scrollTop = 0; ctx.dialog.scrollTop = 0; };

// En solo lectura no se envía ningún cambio (los controles de edición están ocultos o desactivados).
const soloLeer = (el) => bib.lectura && el?.closest?.('.pr-tarea, [data-pr-form], #pr-importar, [data-pr-importar]');
async function onChange(e) {
  const t = e.target;
  if (soloLeer(t)) return;
  if (t.dataset.rep && abierto) { guardarCampos({ repetir: leerRepetir(t.closest('[data-rep-ed]'), proc().fecha) }); return; }
  if (t.matches('#pr-importar, [data-pr-importar]')) { importar(e); return; }
  if (t.dataset.prOrigen === 'proyecto' || t.dataset.prOrigen === 'tablero') {
    origen = t.dataset.prOrigen === 'proyecto' ? { proyecto: t.value, tablero: '', q: '' } : { ...origen, tablero: t.value };
    pintarLista();
    return;
  }
  if (t.id === 'pr-proyecto') {
    proy = t.value;
    try { localStorage.setItem(LS_PROY, proy); } catch { /* sin almacenamiento */ }
    abierto = ''; lote = false;
    pintar();
    return;
  }
  if (t.matches('[data-pr-sub]')) {
    try { await enviar({ op: 'subtarea', id: abierto, sid: t.dataset.prSub, hecha: t.checked }); } catch (err) { window.alert(err.message); }
    pintarLista();
    return;
  }
  const c = t.dataset.prCampo;
  if (!c || !abierto) return;
  const p = proc();
  if (c === 'titulo') { if (t.value.trim() && t.value.trim() !== p.titulo) guardarCampos({ titulo: t.value }); return; }
  guardarCampos({ [c]: t.value });
}

function onKey(e) {
  if (e.target.matches('.pr-titulo')) {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } else requestAnimationFrame(ajustarTitulo);
  }
  if (e.target.matches('.pr-comentar textarea') && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.target.form.requestSubmit(); }
}

async function onSubmit(e) {
  const f = e.target.closest('[data-pr-form]');
  if (!f) return;
  e.preventDefault();
  if (bib.lectura) return;
  const texto = f.texto.value.trim();
  if (!texto) return;
  const sub = f.dataset.prForm === 'sub';
  f.querySelector('button')?.setAttribute('disabled', '');
  try {
    if (sub) await enviar({ op: 'subtarea', id: abierto, texto });
    else { await enviar({ op: 'comentar', id: abierto, texto }); pestanaAct = 'comentarios'; }
    pintarLista();
    body().querySelector(sub ? '.pr-sub-nueva input' : '.pr-comentar textarea')?.focus();
    if (!sub) body().querySelector('.pr-hilo li:last-child')?.scrollIntoView({ block: 'nearest' });
  } catch (err) { window.alert(err.message); f.querySelector('button')?.removeAttribute('disabled'); }
}

async function onClick(e) {
  if (bib.lectura) {
    const a = e.target.closest('[data-pr], [data-pr-proy], [data-pr-sub-borrar], [data-pr-copiar]');
    if (a && !['volver'].includes(a.dataset.pr)) return;
  }
  const cp = e.target.closest('[data-pr-copiar]');
  if (cp) {
    const [cli, code, id] = cp.dataset.prCopiar.split('|');
    const t = operativa?.tareas.find((x) => x.cliente === cli && x.code === code && x.id === id);
    if (!t) return;
    const cliente = operativa.proyectos.find((x) => x.id === cli)?.nombre || cli;
    cp.disabled = true;
    await crearProceso({ titulo: t.titulo, html: t.notas || '', subtareas: (t.checklist || []).map((c) => c.texto), origen: `la tarea «${t.titulo}» (${cliente})` });
    return;
  }
  const ds = e.target.closest('[data-rep-dsem]');
  if (ds && abierto) { pulsarDsem(ds); guardarCampos({ repetir: leerRepetir(ds.closest('[data-rep-ed]'), proc().fecha) }); return; }
  if (e.target.closest('[data-pr="rep-alinear"]') && abierto) { const p = proc(); const hoy = hoyMadrid(); guardarCampos({ fecha: primeraFechaRepetir(p.fecha < hoy ? hoy : p.fecha, p.repetir) }); return; }
  const sb = e.target.closest('[data-pr-sec]');
  if (sb) { sec = sb.dataset.prSec; abierto = ''; creando = ''; pintar(); return; }
  const fl = e.target.closest('[data-pr-filtro]');
  if (fl) { filtro = fl.dataset.prFiltro; pintarLista(); return; }
  const ab = e.target.closest('[data-pr-abrir]');
  if (ab) { abierto = ab.dataset.prAbrir; editandoDesc = false; pestanaAct = 'comentarios'; pintarLista(); arriba(); return; }
  const pc = e.target.closest('[data-pr-proy]');
  if (pc) {
    const p = proc();
    const id = pc.dataset.prProy;
    guardarCampos({ proyectos: !id ? [] : p.proyectos.includes(id) ? p.proyectos.filter((x) => x !== id) : [...p.proyectos, id] });
    return;
  }
  const tb = e.target.closest('[data-pr-tab]');
  if (tb) { pestanaAct = tb.dataset.prTab; pintarLista(); return; }
  const sbor = e.target.closest('[data-pr-sub-borrar]');
  if (sbor) { try { await enviar({ op: 'subtarea', id: abierto, sid: sbor.dataset.prSubBorrar, borrar: true }); } catch (err) { window.alert(err.message); } pintarLista(); return; }
  const cbor = e.target.closest('[data-pr-com-borrar]');
  if (cbor) {
    if (!window.confirm('¿Borrar este comentario?')) return;
    try { await enviar({ op: 'comentario-borrar', id: abierto, cid: cbor.dataset.prComBorrar }); } catch (err) { window.alert(err.message); }
    pintarLista();
    return;
  }
  if (e.target.closest('a[href]')) return;
  const b = e.target.closest('[data-pr]');
  if (!b) return;
  const a = b.dataset.pr;
  if (a === 'lote' || a === 'lote-cerrar') { lote = a === 'lote'; pintarLista(); return; }
  if (a === 'lote-aplicar' || a === 'lote-general') {
    const box = body().querySelector('.pr-lote');
    const ids = box.dataset.prLoteIds.split(',').filter(Boolean);
    const elegidos = a === 'lote-general' ? [] : [...box.querySelectorAll('input:checked')].map((i) => i.value);
    if (a === 'lote-aplicar' && !elegidos.length) { window.alert('Elige al menos un proyecto (o pulsa «Hacerlos generales»).'); return; }
    try {
      const d = await enviar({ op: 'proyectos-lote', ids, proyectos: elegidos });
      lote = false;
      pintar();
      window.alert(elegidos.length ? `✓ ${d.cambiados} de ${ids.length} asignados a ${elegidos.map((x) => proyDe(x)?.nombre || x).join(', ')}.` : `✓ ${d.cambiados} de ${ids.length} ahora son generales (para todos los proyectos).`);
    } catch (err) { window.alert(err.message); }
    return;
  }
  if (a === 'crear-cancelar') { creando = ''; pintarLista(); return; }
  if (a === 'crear-cero') { crearProceso(); return; }
  if (a === 'crear-volver') { creando = 'elegir'; pintarLista(); return; }
  if (a === 'crear-tablero') {
    creando = 'tablero';
    pintarLista();
    try { await cargarOperativa(); } catch (err) { window.alert(err.message); creando = 'elegir'; }
    pintarLista();
    return;
  }
  if (a === 'vaciar') {
    const n = bib.procesos.length;
    const r = window.prompt(`Se borrarán los ${n} procesos y las secciones de la biblioteca (quedan en el historial de cambios por si hay que recuperarlos).\n\nEscribe VACIAR para confirmar:`);
    if (r == null) return;
    if (r.trim().toUpperCase() !== 'VACIAR') { window.alert('No se ha borrado nada (había que escribir VACIAR).'); return; }
    try { await enviar({ op: 'vaciar', confirmar: 'VACIAR' }); sec = ''; abierto = ''; pintar(); } catch (err) { window.alert(err.message); }
    return;
  }
  if (a === 'volver') { abierto = ''; editandoDesc = false; pintarLista(); arriba(); } else if (a === 'nuevo') nuevo();
  else if (a === 'editar-desc' || (a === 'editar-desc-click' && !documentado(proc()))) { editandoDesc = true; pintarLista(); } else if (a === 'cancelar-desc') { editandoDesc = false; pintarLista(); } else if (a === 'guardar-desc') {
    const st = body().querySelector('.pr-editor-st');
    st.textContent = 'Guardando…';
    try { await enviar({ op: 'campos', id: abierto, campos: { html: leerEditor() } }); editandoDesc = false; pintarLista(); } catch (err) { st.textContent = err.message; }
  } else if (a === 'sin-fecha') guardarCampos({ fecha: '' });
  else if (a === 'hecho') {
    const p = proc();
    try {
      await enviar({ op: 'hecho', id: abierto, hecho: !(p.hecho && !p.repetir.tipo) });
      pintarLista();
      body().querySelector('.pr-hecho')?.classList.add('mp-pop');
    } catch (err) { window.alert(err.message); }
  } else if (a === 'borrar') {
    if (!window.confirm('¿Borrar este proceso de la biblioteca (con sus subtareas y comentarios)?')) return;
    try { await enviar({ op: 'borrar', id: abierto }); abierto = ''; pintar(); } catch (err) { window.alert(err.message); }
  } else if (a === 'seccion') {
    const titulo = (window.prompt('Nombre de la sección (puedes empezar con un emoji, p. ej. «📣 Marketing»)') || '').trim();
    if (!titulo) return;
    try { const d = await enviar({ op: 'seccion', titulo }); sec = d.seccion; abierto = ''; pintar(); } catch (err) { window.alert(err.message); }
  }
}
