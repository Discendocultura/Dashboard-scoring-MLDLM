// Panel «📚 Biblioteca de procesos» (Inicio de la agencia y Cuenta; solo la agencia). Secciones a la izquierda,
// buscador y filtros, tarjetas y la ficha de cada proceso con el formato de una tarea de Asana: título, responsable,
// fecha (que puede repetirse), sección, descripción con enlaces y vídeos, subtareas, comentarios y actividad.
// Todo se guarda al momento. Se importa desde un archivo .json (por ejemplo, el «Sistema Operativo» de Asana).
// «＋ Nuevo» pregunta si se crea desde cero o copiando una tarea del tablero de algún cliente (siempre general).
// Dos pestañas arriba: «🏢 De la agencia» (la biblioteca de la agencia; los clientes ven solo los que la agencia
// comparte con ellos, en solo consulta) y «📁 De <cliente>» (los procesos internos de ese cliente, que lleva su equipo).
//   abrirProcesos({ api, dialog })
import { richToHtml, sanitizeRich, safeHref, videoEmbed, richToText } from './richtext.js';
import { buscarProcesos, documentado, tieneVideo, estadoFecha, proximaTrasHecho, enProyecto, encajaEnRepetir, primeraFechaRepetir, textoRepetir as REPETIR_TXT } from './procesos.js';
import { editorRepetir, leerRepetir, pulsarDsem } from './repetir-ui.js';
import { tablerosDe, columnaDeTarea, ordenColumna } from './tableros.js';
import { idSeccion } from './procesos.js';

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
// Biblioteca abierta: 'agencia' | 'cliente'. Se recuerda.
const LS_AMB = 'lsd_pr_ambito';
let ambito = (() => { try { return localStorage.getItem(LS_AMB) || ''; } catch { return ''; } })();
const delCliente = () => ambito === 'cliente';
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
// Crear un proceso: '' | 'elegir' (desde cero o desde un tablero) | 'tablero' (elegir la tarea que se copia) |
// 'asistente' (paso a paso, ver ASIS_PASOS: en los del cliente siempre; en los de la agencia, «desde cero»).
let creando = '';
let asis = null; // lo que se va rellenando en el asistente
let origen = { proyecto: '', tablero: '', q: '' };
let operativa = null; // tareas y tableros de la Operativa (para copiar una tarea), se cargan al pedirlos

const body = () => ctx.dialog.querySelector('#pr-body');
const proc = (id = abierto) => bib.procesos.find((x) => x.id === id);
const nombreDe = (uid) => bib.equipo.find((u) => u.id === uid)?.nombre || '';
const proyDe = (id) => bib.proyectos.find((x) => x.id === id);
const chipProy = (id) => { const x = proyDe(id); return `<span class="pr-proy" style="--cl:${esc(x?.color || 'var(--accent)')}">${esc(x?.nombre || id)}</span>`; };
const proyectosHtml = (p) => (p.proyectos.length ? p.proyectos.map(chipProy).join('') : '<span class="pr-proy general">🌐 General</span>');

async function enviar(cuerpo) {
  const d = await ctx.api('/api/procesos', { method: 'POST', body: { ...cuerpo, ambito } });
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
    dlg.querySelector('#pr-ambitos')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pr-ambito]');
      if (!b || b.dataset.prAmbito === ambito) return;
      ambito = b.dataset.prAmbito;
      try { localStorage.setItem(LS_AMB, ambito); } catch { /* sin almacenamiento */ }
      sec = ''; abierto = ''; filtro = ''; q = ''; lote = false;
      cargar();
    });
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
  // Por defecto: el superadmin, la de la agencia; el resto, la de su cliente.
  if (ambito !== 'agencia' && ambito !== 'cliente') ambito = document.body.classList.contains('is-superadmin') ? 'agencia' : 'cliente';
  if (!dlg.open) dlg.showModal();
  await cargar();
}

async function cargar() {
  const dlg = ctx.dialog;
  body().innerHTML = '<p class="muted">Cargando…</p>';
  creando = '';
  operativa = null;
  try {
    bib = await ctx.api(`/api/procesos?ambito=${ambito}`);
    bib.proyectos ||= [];
    bib.equipo ||= [];
    if (proy && proy !== '_general' && !bib.proyectos.some((x) => x.id === proy)) proy = '';
    if (!bib.proyectos.length && proy) proy = '';
  } catch (e) { body().innerHTML = `<p class="error">${esc(e.message)}</p>`; pintarAmbitos(); return; }
  // Solo lectura (los clientes en la de la agencia y el perfil «Solo Operativa»): se consulta, no se cambia nada.
  dlg.classList.toggle('pr-lectura', Boolean(bib.lectura));
  dlg.classList.toggle('pr-amb-cliente', delCliente());
  const sub = dlg.querySelector('.pr-sub');
  if (sub) sub.textContent = delCliente() ? `· los procesos internos de ${bib.cliente || 'tu negocio'}` : bib.lectura ? '· los que la agencia comparte contigo (solo consulta)' : '· de la agencia';
  pintarAmbitos();
  pintar();
}

function pintarAmbitos() {
  const nav = ctx.dialog.querySelector('#pr-ambitos');
  if (!nav) return;
  const b = (id, txt) => `<button type="button" class="pr-ambito${ambito === id ? ' on' : ''}" data-pr-ambito="${id}" aria-pressed="${ambito === id}">${txt}</button>`;
  nav.innerHTML = b('agencia', '🏢 De la agencia') + b('cliente', `📁 De ${esc(bib.cliente || 'tu negocio')}`);
}

// ---- Estructura ----
function pintar() {
  body().innerHTML = `<div class="pr">
    <aside class="pr-side">
      ${bib.proyectos.length ? `<label class="pr-proy-sel"><span>Proyecto</span><select id="pr-proyecto"><option value="">Todos los proyectos</option><option value="_general"${proy === '_general' ? ' selected' : ''}>🌐 Solo los generales</option>${bib.proyectos.map((x) => `<option value="${esc(x.id)}"${proy === x.id ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></label>` : ''}
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
  if (!bib.procesos.length && (delCliente() || bib.lectura)) {
    main.innerHTML = delCliente() ? `<div class="pr-vacio">
      <div class="pr-vacio-ico" aria-hidden="true">📁</div>
      <h3>Aún no hay procesos de ${esc(bib.cliente || 'tu negocio')}</h3>
      <p>Apunta aquí el «cómo se hace» de lo vuestro: los pasos, los vídeos y los enlaces de cada proceso interno. Así lo tenéis todo en un sitio y cualquiera del equipo lo encuentra. Solo lo ve tu equipo (y la agencia).</p>
      <p><button type="button" class="btn primary" data-pr="nuevo">＋ Añadir el primero</button></p>
    </div>` : `<div class="pr-vacio">
      <div class="pr-vacio-ico" aria-hidden="true">🏢</div>
      <h3>La agencia aún no ha compartido procesos</h3>
      <p>Cuando la agencia comparta contigo sus procesos (cómo se hace cada cosa, paso a paso), aparecerán aquí. Mientras, puedes apuntar los tuyos en la pestaña «📁 De ${esc(bib.cliente || 'tu negocio')}».</p>
    </div>`;
    return;
  }
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
      <div class="pr-filtros">${chip('', 'Todos')}${bib.yo ? chip('mios', '👤 Míos') : ''}${chip('fecha', '📅 Con fecha')}${chip('vencidos', `⏰ Vencidos${vencidos ? ` <b>${vencidos}</b>` : ''}`)}${delCliente() ? '' : '<button type="button" class="pr-filtro pr-vaciar" data-pr="vaciar" title="Borrar todos los procesos de la biblioteca">🗑️ Vaciar biblioteca</button>'}</div></header>
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
    <span class="pr-badges">${p.fecha ? `<span class="pr-badge f-${ef || 'futura'}">${p.repetir.tipo ? '🔁' : '📅'} ${esc(FECHA_TXT[ef] || fechaCorta(p.fecha))}</span>` : ''}${p.subtareas.length ? `<span class="pr-badge">☑️ ${subHechas}/${p.subtareas.length}</span>` : ''}${p.comentarios.length ? `<span class="pr-badge">💬 ${p.comentarios.length}</span>` : ''}${tieneVideo(p) ? '<span class="pr-badge v">🎬 Vídeo</span>' : ''}${!doc ? '<span class="pr-badge pend">✍️ Por documentar</span>' : ''}${!sec && s ? `<span class="pr-badge s">${esc(sinEmoji(s.titulo))}</span>` : ''}${p.compartido && !bib.lectura ? '<span class="pr-badge comp">🤝 Compartido</span>' : ''}</span>
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
  // En solo lectura no se enseñan los campos vacíos (los clientes no ven el trabajo interno de la agencia).
  const ver = (lleno) => !bib.lectura || lleno;
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
      ${!delCliente() && !bib.lectura ? fila('Clientes', `<button type="button" class="pr-compartir${p.compartido ? ' on' : ''}" data-pr="compartir" aria-pressed="${p.compartido}"><span class="pr-sw" aria-hidden="true"></span>${p.compartido ? '🤝 Compartido con todos los clientes' : 'Compartir con todos los clientes'}</button><span class="muted small">${p.compartido ? 'Lo ven en «🏢 De la agencia», solo para consultar (sin responsable, fechas ni comentarios).' : 'Si lo activas, todos los clientes podrán consultarlo.'}</span>`) : ''}
      ${!ver(p.responsable) ? '' : fila('Responsable', `<span class="pr-resp">${p.responsable ? avatar(nombreDe(p.responsable)) : '<span class="pr-av vacio">?</span>'}<select data-pr-campo="responsable" aria-label="Responsable"><option value="">Sin asignar</option>${bib.equipo.map((u) => `<option value="${esc(u.id)}"${u.id === p.responsable ? ' selected' : ''}>${esc(u.nombre)}</option>`).join('')}</select></span>`)}
      ${!ver(p.fecha) ? '' : fila('Fecha', `<span class="pr-fecha"><input type="date" data-pr-campo="fecha" value="${esc(p.fecha)}" aria-label="Fecha">${ef && FECHA_TXT[ef] ? `<span class="pr-badge f-${ef}">${FECHA_TXT[ef]}</span>` : ''}${p.fecha ? '<button type="button" class="link small" data-pr="sin-fecha">Quitar</button>' : ''}</span>`)}
      ${!ver(p.repetir.tipo) ? '' : fila('Se repite', `<span class="pr-rep">${editorRepetir(p.repetir)}${p.repetir.tipo && p.fecha && !encajaEnRepetir(p.fecha, p.repetir) ? `<span class="muted small">Su fecha no cae en el día elegido.</span><button type="button" class="btn small" data-pr="rep-alinear">📅 Pasarlo al ${esc(fechaCorta(primeraFechaRepetir(p.fecha < hoy ? hoy : p.fecha, p.repetir)))}</button>` : p.repetir.tipo && p.fecha ? `<span class="muted small">🔁 Al marcarlo como hecho pasa al ${esc(fechaCorta(proximaTrasHecho(p.fecha, p.repetir, hoy)))}</span>` : p.repetir.tipo ? '<span class="muted small">Pon una fecha para que se repita</span>' : ''}</span>`)}
      ${bib.proyectos.length ? fila('Proyecto', `<span class="pr-proy-chips"><button type="button" class="pr-pchip${p.proyectos.length ? '' : ' on'}" data-pr-proy="">🌐 General (todos)</button>${bib.proyectos.map((x) => `<button type="button" class="pr-pchip${p.proyectos.includes(x.id) ? ' on' : ''}" data-pr-proy="${esc(x.id)}" style="--cl:${esc(x.color || 'var(--accent)')}">${esc(x.nombre)}</button>`).join('')}</span>`) : ''}
      ${fila('Sección', `<select data-pr-campo="seccion" aria-label="Sección">${bib.secciones.map((x) => `<option value="${esc(x.id)}"${x.id === p.seccion ? ' selected' : ''}>${esc(x.titulo)}</option>`).join('')}</select>`)}
    </div>
    <section class="pr-bloque">
      <header class="pr-bloque-h"><h4>Descripción</h4>${editandoDesc ? '' : '<button type="button" class="btn ghost small" data-pr="editar-desc">✏️ Editar</button>'}</header>
      ${editandoDesc ? editorHtml() : `<div class="pr-contenido rich" data-pr="editar-desc-click">${documentado(p) ? richToHtml(p.html) : '<p class="muted">Sin descripción. Pulsa «Editar» para escribir los pasos, pegar enlaces o añadir un vídeo.</p>'}</div>`}
    </section>
    ${bib.lectura && !p.subtareas.length ? '' : `<section class="pr-bloque">
      <header class="pr-bloque-h"><h4>Subtareas ${p.subtareas.length ? `<span class="muted">${subHechas}/${p.subtareas.length}</span>` : ''}</h4></header>
      ${p.subtareas.length ? `<div class="pr-sub-barra"><span style="width:${(subHechas / p.subtareas.length) * 100}%"></span></div>` : ''}
      <ul class="pr-subs">${p.subtareas.map((x) => `<li class="${x.hecha ? 'ok' : ''}"><label><input type="checkbox" data-pr-sub="${esc(x.id)}"${x.hecha ? ' checked' : ''}><span>${esc(x.texto)}</span></label><button type="button" class="pr-x" data-pr-sub-borrar="${esc(x.id)}" aria-label="Quitar subtarea">✕</button></li>`).join('')}</ul>
      <form class="pr-sub-nueva" data-pr-form="sub"><input name="texto" maxlength="300" placeholder="＋ Añadir subtarea (Enter)" autocomplete="off"></form>
    </section>`}
    ${bib.lectura && !p.comentarios.length ? '' : `<section class="pr-bloque pr-conv">
      <nav class="pr-tabs"><button type="button" class="${pestanaAct === 'comentarios' ? 'on' : ''}" data-pr-tab="comentarios">Comentarios ${p.comentarios.length ? `<b>${p.comentarios.length}</b>` : ''}</button><button type="button" class="${pestanaAct === 'actividad' ? 'on' : ''}" data-pr-tab="actividad">Toda la actividad</button></nav>
      <ol class="pr-hilo">${hiloHtml(p)}</ol>
      <form class="pr-comentar" data-pr-form="comentar">${avatar(nombreDe(bib.yo) || 'Yo', 'yo')}<textarea name="texto" rows="2" maxlength="4000" placeholder="Escribe un comentario… (Ctrl + Enter para enviar)"></textarea><button class="btn primary small">Comentar</button></form>
    </section>`}
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
    : `<li class="pr-com">${avatar(x.por)}<div class="pr-com-c"><header><strong>${esc(x.por)}</strong><span class="muted small">${esc(cuando(x.en))}</span>${!delCliente() || bib.moderar || (x.porId && x.porId === bib.yo) ? `<button type="button" class="pr-x" data-pr-com-borrar="${esc(x.id)}" aria-label="Borrar comentario">✕</button>` : ''}</header><div class="pr-com-t">${textoComentario(x.texto)}</div></div></li>`)).join('');
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
  // En la del cliente, paso a paso (no hay tableros de otros clientes de donde copiar).
  if (delCliente()) { abrirAsistente(); return; }
  creando = 'elegir';
  abierto = '';
  pintarLista();
  arriba();
}

function abrirAsistente() {
  creando = 'asistente';
  abierto = '';
  asisNuevo();
  pintarLista();
  arriba();
}

async function cargarOperativa() {
  if (operativa) return operativa;
  const d = await ctx.api('/api/operativa');
  operativa = { tareas: d.tareas || [], tableros: d.tableros || [], proyectos: d.proyectos || [] };
  return operativa;
}
const tablerosDeProy = (id) => [{ id: 'general', nombre: 'General' }, ...operativa.tableros.filter((b) => b.proyecto === id && b.id !== 'general')]
  .map((b) => ({ ...b, nombre: operativa.tableros.find((x) => x.proyecto === id && x.id === b.id)?.nombre || b.nombre }));
const tableroDe = (t) => (operativa.tableros.some((b) => b.proyecto === t.cliente && b.id === t.opTablero) ? t.opTablero : 'general');

// ---- Asistente «Nuevo proceso»: un paso cada vez, con ejemplos, para que nadie se pierda ----
// 1 categoría (sección: las que hay, sugeridas o una nueva) · 2 responsable · 3 en qué consiste (nombre, para qué
// sirve y cuándo se hace) · 4 el paso a paso (uno por casilla) · 5 material · 6 cuándo (fecha y repetición) · 7 revisar.
const ASIS_PASOS = [
  { ico: '📁', t: 'Categoría', tit: '¿De qué área es este proceso?', sub: 'Elige la categoría donde guardarlo. Así, cuando haya muchos, cualquiera los encuentra en un segundo.', ej: 'Un proceso de cómo responder a una alumna va en «Atención al cliente»; cómo publicar un reel, en «Marketing».' },
  { ico: '👤', t: 'Responsable', tit: '¿Quién se encarga?', sub: 'La persona que se ocupa de que este proceso se haga (y a quien preguntar si hay dudas). Puedes cambiarla cuando quieras.', ej: 'Si lo hace siempre Andrea, elige a Andrea. Si aún no está claro, «Nadie todavía».' },
  { ico: '📝', t: 'En qué consiste', tit: '¿En qué consiste?', sub: 'Ponle un nombre claro y cuenta en una frase para qué sirve y cuándo hay que hacerlo.', ej: 'Nombre: «📦 Cómo enviamos los pedidos» · Para qué sirve: «Que cada pedido salga en 24 h y la clienta sepa cuándo le llega» · Cuándo: «Cada mañana, con los pedidos del día anterior».' },
  { ico: '🪜', t: 'Paso a paso', tit: '¿Cómo se hace, paso a paso?', sub: 'Escribe cada paso en su casilla, en orden. Empieza cada uno con lo que hay que hacer («Revisar…», «Enviar…»). Pulsa Enter para añadir el siguiente.', ej: '1. Revisar los pedidos nuevos en la tienda · 2. Preparar el paquete con la nota · 3. Imprimir la etiqueta · 4. Avisar a la clienta con el seguimiento.' },
  { ico: '🔗', t: 'Material', tit: 'Material de apoyo', sub: 'Opcional: trucos, errores típicos, enlaces (Drive, plantillas, accesos) y un vídeo explicativo. Lo que te habría gustado que te contaran la primera vez.', ej: '«La plantilla de la nota está en Drive: https://… · Ojo: los pedidos internacionales llevan aduanas.» + un Loom de 3 minutos haciéndolo.' },
  { ico: '📅', t: 'Cuándo', tit: '¿Tiene fecha o se repite?', sub: 'Opcional. Si se hace cada semana o cada mes, al marcarlo como hecho pasa solo a la siguiente fecha (y te avisa cuando toca).', ej: 'Envío de pedidos: «Cada día laborable». Cierre de mes: «Cada mes, el último día».' },
  { ico: '✅', t: 'Revisar', tit: 'Revisa y crea', sub: 'Así quedará. Si algo no está bien, vuelve atrás; luego también se puede cambiar todo desde su ficha.', ej: '' },
];
// Categorías sugeridas (se crean al elegirlas si aún no existen).
const CAT_SUGERIDAS = ['📣 Marketing', '💰 Ventas', '📦 Entrega', '💬 Atención al cliente', '🧾 Administración', '👥 Equipo'];
const normCat = (t) => sinEmoji(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const pasosLista = () => asis.pasos.map((x) => String(x || '').replace(/^\s*(?:\d+[.)-]|[-•*])\s*/, '').trim()).filter(Boolean);
const nombreCat = () => (asis.categoria.startsWith('id:') ? bib.secciones.find((x) => x.id === asis.categoria.slice(3))?.titulo || '' : asis.categoria.startsWith('sug:') ? asis.categoria.slice(4) : asis.catNueva.trim());

function asisNuevo() {
  const cat = sec && bib.secciones.some((x) => x.id === sec) ? `id:${sec}` : '';
  asis = { paso: 0, categoria: cat, catNueva: '', responsable: '', titulo: '', objetivo: '', disparador: '', pasos: [''], notas: '', video: '', fecha: '', repetir: { tipo: '' } };
}

function leerAsis() {
  const v = (k) => body().querySelector(`[data-asis="${k}"]`);
  for (const k of ['catNueva', 'titulo', 'objetivo', 'disparador', 'notas', 'video', 'fecha']) if (v(k)) asis[k] = v(k).value;
  const ps = [...body().querySelectorAll('[data-asis-paso]')];
  if (ps.length) asis.pasos = ps.map((i) => i.value);
  const ed = body().querySelector('.pr-asis [data-rep-ed]');
  if (ed) asis.repetir = leerRepetir(ed, asis.fecha);
}

function asistenteHtml() {
  const n = asis.paso;
  const P = ASIS_PASOS[n];
  const ultimo = n === ASIS_PASOS.length - 1;
  const campo = () => {
    if (n === 0) {
      const n0 = (id) => bib.procesos.filter((p) => p.seccion === id).length;
      const existen = bib.secciones.filter((x) => x.id !== 'general' || n0('general') || bib.secciones.length === 1);
      const sugeridas = CAT_SUGERIDAS.filter((t) => !bib.secciones.some((x) => normCat(x.titulo) === normCat(t)));
      const card = (val, ico, txt, sub) => `<button type="button" class="pr-asis-cat${asis.categoria === val ? ' on' : ''}" data-asis-cat="${esc(val)}" aria-pressed="${asis.categoria === val}"><span class="pr-asis-cat-ico" aria-hidden="true">${ico}</span><strong>${esc(txt)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
      return `<div class="pr-asis-cats">
          ${existen.map((x) => card(`id:${x.id}`, emojiDe(x.titulo) || '📁', sinEmoji(x.titulo), `${n0(x.id)} proceso${n0(x.id) === 1 ? '' : 's'}`)).join('')}
          ${sugeridas.map((t) => card(`sug:${t}`, emojiDe(t), sinEmoji(t), 'Nueva')).join('')}
          ${card('nueva', '＋', 'Otra categoría', 'Ponle tú el nombre')}
        </div>
        ${asis.categoria === 'nueva' ? `<label class="field"><span>Nombre de la categoría <small>(puedes empezar con un emoji)</small></span><input data-asis="catNueva" maxlength="60" value="${esc(asis.catNueva)}" placeholder="Ej.: 🎓 Formación" autocomplete="off"></label>` : ''}`;
    }
    if (n === 1) {
      const b = (id, nombre, txt) => `<button type="button" class="pr-asis-persona${asis.responsable === id ? ' on' : ''}" data-asis-resp="${esc(id)}" aria-pressed="${asis.responsable === id}">${id ? avatar(nombre) : '<span class="pr-av vacio">?</span>'}<span>${esc(txt)}</span></button>`;
      return `<div class="pr-asis-personas">${bib.equipo.map((u) => b(u.id, u.nombre, u.nombre)).join('')}${b('', '', 'Nadie todavía')}</div>
        ${bib.equipo.length ? '' : '<p class="muted small">Aún no hay nadie más en el equipo. Puedes añadir personas en Configuración → Equipo.</p>'}`;
    }
    if (n === 2) {
      return `<label class="field"><span>Nombre del proceso <b class="pr-asis-oblig">obligatorio</b></span><input data-asis="titulo" maxlength="160" value="${esc(asis.titulo)}" placeholder="Ej.: 📦 Cómo enviamos los pedidos" autocomplete="off"></label>
        <label class="field"><span>¿Para qué sirve? <small>(en una frase)</small></span><input data-asis="objetivo" maxlength="300" value="${esc(asis.objetivo)}" placeholder="Ej.: Que cada pedido salga en 24 h y la clienta sepa cuándo le llega" autocomplete="off"></label>
        <label class="field"><span>¿Cuándo hay que hacerlo? <small>(qué lo pone en marcha)</small></span><input data-asis="disparador" maxlength="300" value="${esc(asis.disparador)}" placeholder="Ej.: Cada mañana, con los pedidos del día anterior" autocomplete="off"></label>
        <p class="muted small">💡 Si empiezas el nombre con un emoji, saldrá como icono en la tarjeta.</p>`;
    }
    if (n === 3) {
      return `<ol class="pr-asis-lista">${asis.pasos.map((x, i) => `<li><span class="pr-asis-num">${i + 1}</span><input data-asis-paso="${i}" maxlength="300" value="${esc(x)}" placeholder="${i === 0 ? 'Ej.: Revisar los pedidos nuevos en la tienda' : 'Siguiente paso…'}" autocomplete="off" aria-label="Paso ${i + 1}">${asis.pasos.length > 1 ? `<button type="button" class="pr-x" data-asis-paso-quitar="${i}" aria-label="Quitar el paso ${i + 1}">✕</button>` : ''}</li>`).join('')}</ol>
        <button type="button" class="btn small" data-asis-paso-add>＋ Añadir otro paso</button>
        <p class="muted small">Saldrán en la descripción y como una lista para ir marcando cada vez que se haga. Si aún no los tienes claros, sigue y los añades después.</p>`;
    }
    if (n === 4) {
      return `<label class="field"><span>Trucos, errores típicos y enlaces <small>(opcional)</small></span><textarea data-asis="notas" rows="5" placeholder="Lo que conviene saber… Pega aquí los enlaces (Drive, plantillas, accesos)">${esc(asis.notas)}</textarea></label>
        <label class="field"><span>Vídeo explicativo <small>(opcional: Loom, YouTube, Vimeo o Bunny)</small></span><input data-asis="video" type="url" inputmode="url" value="${esc(asis.video)}" placeholder="https://www.loom.com/share/…"></label>`;
    }
    if (n === 5) {
      return `<label class="field"><span>Fecha <small>(opcional)</small></span><input data-asis="fecha" type="date" value="${esc(asis.fecha)}"></label>
        <div class="field"><span>¿Se repite?</span>${editorRepetir(asis.repetir)}</div>
        ${asis.repetir.tipo && !asis.fecha ? '<p class="muted small">Si no pones fecha, empezará el próximo día que toque.</p>' : ''}`;
    }
    const pasos = pasosLista();
    const fila = (ico, k, v) => `<li><span class="pr-asis-r-ico">${ico}</span><span class="pr-asis-r-k">${k}</span><span class="pr-asis-r-v">${v}</span></li>`;
    return `<ul class="pr-asis-resumen">
      ${fila('📁', 'Categoría', esc(nombreCat()) + (asis.categoria.startsWith('id:') ? '' : ' <span class="muted small">(nueva)</span>'))}
      ${fila('👤', 'Responsable', esc(nombreDe(asis.responsable) || 'Sin asignar'))}
      ${fila('📝', 'En qué consiste', `<strong>${esc(asis.titulo.trim())}</strong>${asis.objetivo.trim() ? `<br><span class="muted">🎯 ${esc(asis.objetivo.trim())}</span>` : ''}${asis.disparador.trim() ? `<br><span class="muted">⏰ ${esc(asis.disparador.trim())}</span>` : ''}`)}
      ${fila('🪜', 'Paso a paso', pasos.length ? `<ol>${pasos.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : '<span class="muted">Ninguno todavía</span>')}
      ${fila('🔗', 'Material', [asis.notas.trim() && 'trucos y enlaces', asis.video.trim() && 'vídeo'].filter(Boolean).join(' y ') || '<span class="muted">Nada</span>')}
      ${fila('📅', 'Cuándo', asis.repetir.tipo ? esc(textoRepetirUi(asis.repetir)) + (asis.fecha ? ` · desde el ${esc(fechaCorta(asis.fecha))}` : '') : asis.fecha ? esc(fechaCorta(asis.fecha)) : '<span class="muted">Sin fecha</span>')}
    </ul>`;
  };
  const opcional = n === 4 || n === 5;
  return `<section class="pr-crear pr-asis">
    <header class="pr-crear-h"><button type="button" class="btn ghost small" data-pr="crear-cancelar">✕ Cancelar</button><h3>Nuevo proceso</h3></header>
    <ol class="pr-asis-pasos" aria-label="Pasos">${ASIS_PASOS.map((x, i) => `<li class="${i < n ? 'hecho' : i === n ? 'on' : ''}"><span class="pr-asis-n">${i < n ? '✓' : i + 1}</span><span class="pr-asis-t">${esc(x.t)}</span></li>`).join('')}</ol>
    <div class="pr-asis-caja">
      <p class="pr-asis-paso">Paso ${n + 1} de ${ASIS_PASOS.length}${opcional ? ' · opcional' : ''}</p>
      <h3 class="pr-asis-tit"><span aria-hidden="true">${P.ico}</span> ${esc(P.tit)}</h3>
      <p class="muted">${esc(P.sub)}</p>
      <div class="pr-asis-campo">${campo()}</div>
      ${P.ej ? `<details class="pr-asis-ej"><summary>💡 Ver un ejemplo</summary><p>${esc(P.ej)}</p></details>` : ''}
      <p class="pr-asis-error error" hidden></p>
      <footer class="pr-asis-acc">${n ? '<button type="button" class="btn ghost" data-pr="asis-atras">← Atrás</button>' : '<span></span>'}${ultimo ? '<button type="button" class="btn primary" data-pr="asis-crear">✓ Crear el proceso</button>' : `<button type="button" class="btn primary" data-pr="asis-sig">${opcional ? 'Siguiente (o sáltalo) →' : 'Siguiente →'}</button>`}</footer>
    </div>
  </section>`;
}
const textoRepetirUi = (r) => REPETIR_TXT(r);

// La descripción: para qué sirve, cuándo se hace, el paso a paso, los trucos (con sus enlaces) y el vídeo.
function htmlAsis() {
  const parrafo = (t) => `<p>${esc(t.trim()).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`).replace(/\n/g, '<br>')}</p>`;
  const pasos = pasosLista();
  const partes = [
    asis.objetivo.trim() && `<h2>🎯 Para qué sirve</h2>${parrafo(asis.objetivo)}`,
    asis.disparador.trim() && `<h2>⏰ Cuándo se hace</h2>${parrafo(asis.disparador)}`,
    pasos.length && `<h2>🪜 Paso a paso</h2><ol>${pasos.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`,
    asis.notas.trim() && `<h2>💡 Trucos y enlaces</h2>${asis.notas.trim().split(/\n{2,}/).map(parrafo).join('')}`,
    asis.video.trim() && videoEmbed(asis.video.trim()) && `<div data-video="${esc(asis.video.trim())}"></div>`,
  ];
  return sanitizeRich(partes.filter(Boolean).join(''));
}

async function asisCrear(b) {
  b.disabled = true;
  b.textContent = 'Creando…';
  try {
    const hoy = hoyMadrid();
    let fecha = asis.fecha;
    if (asis.repetir.tipo && !fecha) fecha = primeraFechaRepetir(hoy, asis.repetir);
    // La categoría: la que hay o, si es nueva (sugerida o escrita), se crea antes.
    let seccion = asis.categoria.startsWith('id:') ? asis.categoria.slice(3) : '';
    if (!seccion) {
      const titulo = nombreCat();
      seccion = bib.secciones.find((x) => normCat(x.titulo) === normCat(titulo))?.id || (await enviar({ op: 'seccion', titulo })).seccion;
    }
    const d = await enviar({ op: 'nuevo', seccion, titulo: asis.titulo.trim(), html: htmlAsis(), subtareas: pasosLista() });
    const campos = {};
    if (asis.responsable) campos.responsable = asis.responsable;
    if (fecha) campos.fecha = fecha;
    if (asis.repetir.tipo) campos.repetir = asis.repetir;
    if (Object.keys(campos).length) await enviar({ op: 'campos', id: d.proceso.id, campos });
    creando = ''; asis = null;
    abierto = d.proceso.id;
    sec = seccion;
    q = ''; filtro = ''; editandoDesc = false;
    pintar();
    arriba();
  } catch (err) {
    b.disabled = false;
    b.textContent = '✓ Crear el proceso';
    const e = body().querySelector('.pr-asis-error');
    if (e) { e.textContent = err.message; e.hidden = false; }
  }
}

function asisError(txt, foco) {
  const e = body().querySelector('.pr-asis-error');
  e.textContent = txt;
  e.hidden = false;
  if (foco) body().querySelector(foco)?.focus();
}
function asisMover(delta) {
  leerAsis();
  if (delta > 0 && asis.paso === 0 && !asis.categoria) { asisError('Elige una categoría para seguir (o crea una nueva).'); return; }
  if (delta > 0 && asis.paso === 0 && asis.categoria === 'nueva' && !asis.catNueva.trim()) { asisError('Escribe el nombre de la categoría nueva.', '[data-asis="catNueva"]'); return; }
  if (delta > 0 && asis.paso === 2 && !asis.titulo.trim()) { asisError('Ponle un nombre al proceso para seguir.', '[data-asis="titulo"]'); return; }
  if (delta > 0 && asis.paso === 4 && asis.video.trim() && !videoEmbed(asis.video.trim())) { asisError('Ese enlace de vídeo no lo reconozco. Prueba con el de Loom, YouTube, Vimeo o Bunny, o déjalo vacío.', '[data-asis="video"]'); return; }
  asis.paso = Math.max(0, Math.min(ASIS_PASOS.length - 1, asis.paso + delta));
  pintarLista();
  arriba();
  body().querySelector('.pr-asis-campo :is(input:not([type="checkbox"]), textarea)')?.focus();
}
// Paso a paso: añadir (también con Enter en el último) y quitar casillas.
function asisPasoAnadir(tras = asis.pasos.length - 1) {
  leerAsis();
  asis.pasos.splice(tras + 1, 0, '');
  pintarLista();
  body().querySelector(`[data-asis-paso="${tras + 1}"]`)?.focus();
}

function crearHtml() {
  if (creando === 'asistente') return asistenteHtml();
  if (creando === 'elegir') {
    return `<section class="pr-crear">
      <header class="pr-crear-h"><button type="button" class="btn ghost small" data-pr="crear-cancelar">← Volver</button><h3>Nuevo proceso</h3></header>
      <p class="muted">Aquí van los procesos <strong>generales</strong> de la agencia (los que sirven para cualquier cliente). ¿Cómo quieres crearlo?</p>
      <div class="pr-crear-ops">
        <button type="button" class="pr-crear-op" data-pr="crear-cero"><span class="pr-crear-ico">✍️</span><strong>Desde cero</strong><span class="muted small">Escribe el título, los pasos, los vídeos y las subtareas.</span></button>
        <button type="button" class="pr-crear-op" data-pr="crear-tablero"><span class="pr-crear-ico">📥</span><strong>Importar de un tablero</strong><span class="muted small">Copia una tarea que ya tengas en un tablero de la Operativa (descripción y checklist como subtareas), o el tablero entero: cada columna, una categoría.</span></button>
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
    ${origen.proyecto && origen.tablero ? botonTableroEntero() : ''}
    ${!origen.proyecto ? '<p class="muted">Elige el cliente para ver las tareas de sus tableros.</p>'
    : lista.length ? `<ul class="pr-crear-lista">${lista.map((t) => `<li><button type="button" class="pr-crear-t" data-pr-copiar="${esc(`${t.cliente}|${t.code}|${t.id}`)}"><strong>${esc(t.titulo)}</strong><span class="muted small">${esc(tabs.find((b) => b.id === tableroDe(t))?.nombre || 'General')}${t.embudo ? ` · ${esc(t.embudo)}` : ''}${t.checklist?.length ? ` · ☑ ${t.checklist.length} pasos` : ''}${richToText(t.notas).trim() ? ' · 📝 con descripción' : ''}</span></button></li>`).join('')}</ul>`
    : '<p class="muted">No hay tareas que coincidan.</p>'}
  </section>`;
}

// «Importar el tablero entero»: cada columna del tablero es una categoría (en su orden) y cada tarjeta, un proceso
// de esa categoría (en su orden), con su descripción y su checklist como subtareas. Se puede repetir: los procesos
// llevan el id de su tarea, así que la segunda vez se actualizan en vez de duplicarse.
function tableroEntero() {
  const tab = tablerosDe({ tableros: operativa.tableros }, origen.proyecto).find((b) => b.id === origen.tablero);
  if (!tab) return null;
  const tareas = operativa.tareas.filter((t) => t.cliente === origen.proyecto && tableroDe(t) === tab.id);
  const procesos = tab.columnas.flatMap((c) => tareas.filter((t) => columnaDeTarea(t, tab) === c.id).sort(ordenColumna).map((t) => ({
    id: `op-${t.id}`.slice(0, 40), seccion: idSeccion(c.nombre), titulo: t.titulo, html: t.notas || '',
    subtareas: (t.checklist || []).map((x) => ({ texto: x.texto, hecha: false })),
  })));
  // Solo las columnas con tarjetas (una columna vacía, como «Hecho», no hace falta como categoría).
  const secciones = tab.columnas.filter((c) => procesos.some((p) => p.seccion === idSeccion(c.nombre))).map((c) => ({ id: idSeccion(c.nombre), titulo: c.nombre }));
  return { tab, secciones, procesos };
}
function botonTableroEntero() {
  const x = tableroEntero();
  if (!x || !x.procesos.length) return '';
  return `<div class="pr-tab-entero"><div><strong>📚 Importar el tablero «${esc(x.tab.nombre)}» entero</strong><span class="muted small">${x.procesos.length} procesos en ${x.secciones.length} categorías: ${x.secciones.map((s) => esc(s.titulo)).join(' · ')}</span></div><button type="button" class="btn primary" data-pr="importar-tablero">Importar todo</button></div>`;
}
async function importarTableroEntero() {
  const x = tableroEntero();
  if (!x?.procesos.length) return;
  if (!window.confirm(`Se crearán ${x.procesos.length} procesos en ${x.secciones.length} categorías (las columnas de «${x.tab.nombre}»). Si ya los importaste antes, se actualizan. ¿Seguir?`)) return;
  try {
    const d = await enviar({ op: 'importar', biblioteca: { secciones: x.secciones, procesos: x.procesos, origen: x.tab.nombre } });
    creando = ''; abierto = ''; sec = '';
    pintar();
    window.alert(`✓ Tablero «${x.tab.nombre}» importado: ${d.nuevos} procesos nuevos y ${d.actualizados} actualizados.`);
  } catch (err) { window.alert(err.message); }
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
  if (t.dataset.rep && creando === 'asistente') { leerAsis(); pintarLista(); return; }
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
  // En el asistente, Enter en un campo de una línea pasa al paso siguiente.
  if (creando === 'asistente' && e.key === 'Enter' && e.target.matches('input[data-asis-paso]')) { e.preventDefault(); asisPasoAnadir(Number(e.target.dataset.asisPaso)); return; }
  if (creando === 'asistente' && e.key === 'Enter' && e.target.matches('input[data-asis]')) { e.preventDefault(); asisMover(1); return; }
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
  if (ds && creando === 'asistente') { pulsarDsem(ds); leerAsis(); return; }
  const ct = e.target.closest('[data-asis-cat]');
  if (ct) { leerAsis(); asis.categoria = ct.dataset.asisCat; pintarLista(); if (asis.categoria === 'nueva') body().querySelector('[data-asis="catNueva"]')?.focus(); return; }
  if (e.target.closest('[data-asis-paso-add]')) { asisPasoAnadir(); return; }
  const pq = e.target.closest('[data-asis-paso-quitar]');
  if (pq) { leerAsis(); asis.pasos.splice(Number(pq.dataset.asisPasoQuitar), 1); pintarLista(); return; }
  const rp = e.target.closest('[data-asis-resp]');
  if (rp) { leerAsis(); asis.responsable = rp.dataset.asisResp; pintarLista(); return; }
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
  if (a === 'crear-cancelar') { creando = ''; asis = null; pintarLista(); return; }
  if (a === 'asis-sig' || a === 'asis-atras') { asisMover(a === 'asis-sig' ? 1 : -1); return; }
  if (a === 'asis-crear') { asisCrear(b); return; }
  if (a === 'crear-cero') { abrirAsistente(); return; }
  if (a === 'crear-volver') { creando = 'elegir'; pintarLista(); return; }
  if (a === 'importar-tablero') { b.disabled = true; await importarTableroEntero(); b.disabled = false; return; }
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
  else if (a === 'compartir') guardarCampos({ compartido: !proc().compartido });
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
