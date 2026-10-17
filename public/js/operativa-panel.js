// Panel «🗂️ Operativa» (Inicio de la agencia y Cuenta; solo el equipo de la agencia): todas las tareas de todos
// los proyectos. Vistas: 🗂️ Tablero (por estado, arrastrando; la de entrada), 🗓️ Calendario (por fecha, arrastrando
// a otro día), ☀️ Mi día (lo mío por cuándo toca), 📁 Por proyecto (semáforo de cada cliente) y 👥 Por persona (solo
// superadmin). Filtros: cliente → embudo (lanzamientos, VSL…), persona y búsqueda. Cada tarea se cambia aquí mismo (estado, fecha,
// responsable, comentarios) y se guarda en su proyecto. Cada persona ve solo lo que tiene asignado.
//   abrirOperativa({ api, dialog })
import { ESTADOS_OP, estadoOp, estaBloqueada, embudosDe, ICONO_EMBUDO, semanasDelMes, mesMas, agruparPorFecha, resumenProyecto, cargaPorPersona, diasDeRetraso, PROYECTO_AGENCIA, CODIGO_AGENCIA, asignadaA, RANGOS_OP, enRango } from './operativa.js';
import { richToHtml, richToText } from './richtext.js';
import { tablerosDe, tableroDeTarea, columnaDeTarea, columnaHecha, COLUMNAS_SERIE, GENERAL, MAX_COLUMNAS, COLORES_ETIQUETA, etiquetasDeTarea, PRIORIDADES, ordenColumna, recolocar, progresoChecklist, MAX_ETIQUETAS_TAREA, tableroPorDefecto } from './tableros.js';
import { textoRepetir, proximaTrasHecho, encajaEnRepetir, primeraFechaRepetir } from './procesos.js';
import { editorRepetir, leerRepetir, pulsarDsem } from './repetir-ui.js';
import { normalizarImportacion } from './tableros-import.js';
import { montarEditor, montarVideos } from './editor-rico.js';
import { activarArroba, enlacesEnTexto, filtrarEnlaces, leerRef, refTarea, refTablero, refPersona } from './enlaces.js';
import { CALENDARIOS, eventoDeTarea, enlaceCalendario, icsDeEvento } from './mi-calendario.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const fechaCorta = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
const cuando = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '');
const iniciales = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';
const ESTADO = Object.fromEntries(ESTADOS_OP.map((e) => [e.id, e]));

let ctx = null;
let d = { tareas: [], equipo: [], proyectos: [], yo: '', superadmin: false, agencia: false, gestiona: [], tableros: [], plantillas: [], etiquetas: [] };
// ¿Gestiona ese proyecto (crea tableros, reparte tareas…)? El superadmin, todos; el admin de un proyecto, los suyos.
const gestiona = (p) => Boolean(d.superadmin || (p && p !== PROYECTO_AGENCIA && d.gestiona?.includes(p)));
// Proyecto por defecto de una tarea nueva: el elegido arriba; si no, «Agencia» (o el primero suyo si no es de la agencia).
const proyectoDef = () => fProy || (d.agencia || d.superadmin ? PROYECTO_AGENCIA : d.proyectos[0]?.id || PROYECTO_AGENCIA);
let fEtq = ''; // filtro por etiqueta ('' = todas; '_alta' = prioridad alta)
// Filtro de tiempo del tablero ('' todas · hoy · semana · quincena · mes). Se recuerda en este navegador.
const LS_RANGO = 'lsd_op_rango';
let fRango = (() => { try { const v = localStorage.getItem(LS_RANGO) || ''; return RANGOS_OP.some((r) => r.id === v) ? v : ''; } catch { return ''; } })();
let entrando = false; // recién abierta la Operativa: se pone el proyecto por defecto de esta persona
let pickerEtq = false; // el selector de etiquetas de la ficha, abierto
let colorNueva = 'azul';
let recienCreada = ''; // la siguiente de una que se repite (se resalta al aparecer)
let vista = 'tablero';
let fProy = '';
let fEmb = ''; // embudo dentro del cliente elegido
let fTab = GENERAL; // tablero del cliente elegido (vista Tablero)
let editTab = null; // borrador del tablero que se está creando o cuyas columnas se editan
let addCol = '';
let creandoCol = ''; // la columna desde la que se abrió «Nueva tarea» (vista por estado) // columna con el «＋ Añadir tarea» abierto
let recienHecha = ''; // la que se acaba de completar: llega a «Hecho» con su animación
let movida = ''; // la que se acaba de recolocar en su columna (destello)
let importando = null; // { archivo, imp, asana, nombre, completadas } mientras se importa un tablero
let calMes = '';
let calPanel = null; // el panel «📅 Mi calendario» abierto: { url, webcal } cuando ya se ha pedido el enlace
let fPersona = '';
let q = '';
let abierta = null; // { cliente, code, id }
let creando = false;
let editandoDesc = false;
let editandoTitulo = false;
let tabArrastrada = ''; // pestaña de tablero que se está arrastrando
let colArrastrada = ''; // columna de un tablero que se está arrastrando (a izquierda o derecha)
let editor = null; // el editor abierto (descripción o tarea nueva)
// Lo que se está escribiendo en la ficha (descripción sin guardar, comentario, tarea nueva): se guarda antes de
// repintar para que no se pierda al cambiar otra cosa (fecha, repetición, prioridad…). { k, notas, comentario, campos }
let borrador = null;
const claveFicha = () => (creando ? '_nueva' : abierta || '');
function guardarBorrador() {
  const box = ctx?.dialog?.querySelector('#op-ficha');
  if (!box?.dataset.k) return;
  const k = box.dataset.k; // la tarea que se estaba viendo (no la que se va a abrir)
  const b = { k };
  if ((editandoDesc || creando) && editor?.area?.isConnected && box.contains(editor.area)) b.notas = editor.leer();
  const com = box.querySelector('.pr-comentar textarea');
  if (com?.value) b.comentario = com.value;
  const form = box.querySelector('form[data-op-form="crear"]');
  if (form) b.campos = Object.fromEntries(['titulo', 'fecha', 'proyecto', 'tablero', 'uid'].map((n) => [n, form.elements[n]?.value ?? '']));
  if (b.notas != null || b.comentario || b.campos) borrador = b;
  else if (borrador?.k === k) borrador = null;
}
const deBorrador = (campo) => (borrador && borrador.k === claveFicha() ? borrador[campo] : undefined);

const body = () => ctx.dialog.querySelector('#op-body');
// Los tableros del proyecto y, además, el de cada embudo (con el nombre de su lanzamiento en curso; no se guarda).
const tabsDe = (proyecto) => tablerosDe({ tableros: [...d.tableros, ...(d.tablerosEmbudo || [])] }, proyecto);
// El tablero con el que se abre un proyecto: el marcado «por defecto» (si sigue existiendo) o el General.
const tabInicial = (proyecto) => { const id = tableroPorDefecto(d, proyecto); return tabsDe(proyecto).some((b) => b.id === id) ? id : GENERAL; };
const tabDeT = (t) => tableroDeTarea(t, tabsDe(t.cliente));
const modoTableros = () => vista === 'tablero' && Boolean(fProy);
const clave = (t) => `${t.cliente}|${t.code}|${t.id}`;
const buscarT = (k) => d.tareas.find((t) => clave(t) === k);
const nombreDe = (uid) => d.equipo.find((u) => u.id === uid)?.nombre || '';
const quienTxt = (t) => (!t.asignado ? 'Sin asignar' : t.asignado.tipo === 'persona' ? nombreDe(t.asignado.id) || 'Otra persona' : `Rol ${t.asignado.rol}`);
// Responsables posibles de una tarea de ese proyecto: el equipo de la agencia y quien tiene acceso a ese proyecto.
const equipoDe = (cid) => d.equipo.filter((u) => u.agencia || (cid !== PROYECTO_AGENCIA && u.proyectos?.includes(cid)));
// <option>s del responsable, separando la agencia de la gente del proyecto. `actual`: el id asignado ahora.
function opcionesResp(cid, actual) {
  const lista = equipoDe(cid);
  const opt = (u) => `<option value="${esc(u.id)}"${u.id === actual ? ' selected' : ''}>${esc(u.nombre)}</option>`;
  const ag = lista.filter((u) => u.agencia);
  const pr = lista.filter((u) => !u.agencia);
  const fuera = actual && !lista.some((u) => u.id === actual) ? `<option value="${esc(actual)}" selected>${esc(nombreDe(actual) || 'Otra persona')}</option>` : '';
  return `<option value="">Sin asignar</option>${fuera}${pr.length && ag.length ? `<optgroup label="Agencia">${ag.map(opt).join('')}</optgroup><optgroup label="Del proyecto">${pr.map(opt).join('')}</optgroup>` : lista.map(opt).join('')}`;
}
const avatar = (t) => (t.asignado ? `<span class="pr-av" title="${esc(quienTxt(t))}">${esc(t.asignado.tipo === 'persona' ? iniciales(nombreDe(t.asignado.id)) : '👥')}</span>` : '<span class="pr-av vacio" title="Sin asignar">?</span>');
const chipProyecto = (t) => `<span class="pr-proy" style="--cl:${esc(t.color || 'var(--accent)')}">${esc(t.clienteNombre)}</span>${t.embudo && t.cliente !== PROYECTO_AGENCIA ? `<span class="op-emb">${esc(t.embudo)}</span>` : ''}`;
function chipFecha(t, hoy) {
  if (!t.fecha) return '';
  if (estadoOp(t) === 'hecha') return `<span class="op-fecha">${esc(fechaCorta(t.fecha))}</span>`;
  if (t.fecha < hoy) { const n = diasDeRetraso(t.fecha, hoy); return `<span class="op-fecha vencida">⏰ hace ${n} día${n === 1 ? '' : 's'}</span>`; }
  if (t.fecha === hoy) return '<span class="op-fecha hoy">Hoy</span>';
  return `<span class="op-fecha">${esc(fechaCorta(t.fecha))}</span>`;
}

// Arrastrar dentro de una columna: la raya marca dónde va a quedar (antes de qué tarjeta, o al final).
function huecoEn(col, y, sin) {
  const cards = [...col.querySelectorAll('.op-col-lista > .op-card')].filter((c) => !sin || c.dataset.opK !== clave(sin));
  const i = cards.findIndex((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
  return i === -1 ? cards.length : i;
}
function quitarHueco() { ctx.dialog.querySelectorAll('.hueco-antes, .hueco-final').forEach((x) => x.classList.remove('hueco-antes', 'hueco-final')); }
function marcarHueco(col, y) {
  const arr = ctx.dialog.querySelector('.op-card.arrastrando');
  const cards = [...col.querySelectorAll('.op-col-lista > .op-card')].filter((c) => c !== arr);
  const i = huecoEn(col, y, arr ? buscarT(arr.dataset.opK) : null);
  const el = cards[i] || col.querySelector('.op-col-lista');
  if (el?.classList.contains(cards[i] ? 'hueco-antes' : 'hueco-final')) return;
  quitarHueco();
  el?.classList.add(cards[i] ? 'hueco-antes' : 'hueco-final');
}
// Soltar en una columna: si es otra, se mueve allí; y queda en el sitio donde se ha soltado.
async function soltarEnColumna(t, colId, indice) {
  const misma = modoTableros() ? columnaDeTarea(t, tabDeT(t)) === colId : estadoOp(t) === colId;
  if (!misma) {
    const era = estadoOp(t) === 'hecha';
    if (modoTableros()) await moverColumna(t, colId); else await cambiarEstado(t, colId);
    const ahora = modoTableros() ? columnaDeTarea(t, tabDeT(t)) === colId : estadoOp(t) === colId;
    if (!ahora || (!era && estadoOp(t) === 'hecha')) return; // no se ha podido mover, o se ha completado (va con su animación)
  }
  const pos = hermanas(t).indexOf(t);
  if (indice >= 0 && indice !== pos) colocar(t, indice);
}

// Diseño propio de la Operativa (clásico o espacial), independiente del del dashboard: se aplica al abrirla y al
// cerrarla vuelve el de siempre. Sin elegir, el mismo que el dashboard. Se recuerda en este navegador.
const LS_ESTILO_OP = 'lsd_estilo_op';
const estiloOp = () => { try { const v = localStorage.getItem(LS_ESTILO_OP); return v === 'espacial' || v === 'clasico' ? v : ''; } catch { return ''; } };
function aplicarEstiloOp() {
  const api = window.LSD_ESTILO;
  const e = estiloOp() || api?.guardado?.() || 'clasico';
  api?.temporal?.(e);
  ctx.dialog.querySelectorAll('[data-op-estilo]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.opEstilo === e)));
  ctx.dialog.querySelector('.op-estilo')?.setAttribute('data-on', e);
}

export async function abrirOperativa(opts) {
  ctx = opts;
  const dlg = ctx.dialog;
  aplicarEstiloOp();
  calPanel = null;
  if (!dlg.dataset.listo) {
    dlg.dataset.listo = '1';
    dlg.addEventListener('close', () => window.LSD_ESTILO?.temporal?.(null));
    dlg.querySelector('.op-estilo')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-op-estilo]');
      const actual = estiloOp() || window.LSD_ESTILO?.guardado?.() || 'clasico';
      const nuevo = b ? b.dataset.opEstilo : actual === 'espacial' ? 'clasico' : 'espacial';
      try { localStorage.setItem(LS_ESTILO_OP, nuevo); } catch { /* sin almacenamiento */ }
      aplicarEstiloOp();
    });
    dlg.querySelector('#op-cerrar').addEventListener('click', () => dlg.close());
    dlg.querySelector('#op-nueva').addEventListener('click', () => { creando = true; abierta = null; pintar(); });
    dlg.querySelector('#op-importar-btn')?.addEventListener('click', () => dlg.querySelector('#op-importar').click());
    dlg.addEventListener('click', onClick);
    // Cambiar el nombre de una columna pulsando su título (Intro o al salir guarda; Esc lo deja como estaba).
    dlg.addEventListener('click', (e) => { const n = e.target.closest('[data-op-col-ren]'); if (n && !n.querySelector('input')) editarNombreColumna(n); });
    dlg.addEventListener('pointerdown', (e) => { const a = e.target.closest('[data-op-ancho]'); if (a && e.button === 0) empezarAncho(e, a); });
    dlg.addEventListener('dblclick', (e) => {
      const a = e.target.closest('[data-op-ancho]');
      if (!a) return;
      const k = claveAnchos();
      if (anchos[k]) { delete anchos[k][a.dataset.opAncho]; guardarAnchos(); }
      ultimoTablero = `${fProy}|${fTab}|${fEmb}|${fEtq}`;
      pintarVista();
    });
    dlg.addEventListener('change', onChange);
    dlg.addEventListener('submit', onSubmit);
    dlg.addEventListener('input', (e) => { if (e.target.id === 'op-buscar') { q = e.target.value; pintarVista(); } });
    dlg.addEventListener('dragstart', (e) => {
      const ca = e.target.closest?.('[data-op-col-arr]');
      if (ca) { colArrastrada = ca.dataset.opColArr; e.dataTransfer.setData('text/x-op-col', colArrastrada); e.dataTransfer.effectAllowed = 'move'; ca.closest('.op-col')?.classList.add('col-arrastrando'); return; }
      const tb = e.target.closest?.('[data-op-tab][draggable="true"]');
      if (tb) { tabArrastrada = tb.dataset.opTab; e.dataTransfer.setData('text/x-op-tab', tb.dataset.opTab); e.dataTransfer.effectAllowed = 'move'; tb.classList.add('arrastrando'); return; }
      const c = e.target.closest?.('[data-op-k]');
      if (c) { e.dataTransfer.setData('text/plain', c.dataset.opK); c.classList.add('arrastrando'); }
    });
    // Columnas de un tablero: arrastrando su cabecera se mueven a izquierda o derecha (quien gestiona el proyecto).
    const limpiarCol = () => dlg.querySelectorAll('.col-antes, .col-despues, .col-arrastrando').forEach((x) => x.classList.remove('col-antes', 'col-despues', 'col-arrastrando'));
    dlg.addEventListener('dragover', (e) => {
      if (!colArrastrada) return;
      const col = e.target.closest('.op-col[data-op-col]');
      if (!col) return;
      e.preventDefault();
      const r = col.getBoundingClientRect();
      const despues = e.clientX > r.left + r.width / 2;
      dlg.querySelectorAll('.col-antes, .col-despues').forEach((x) => x.classList.remove('col-antes', 'col-despues'));
      if (col.dataset.opCol !== colArrastrada) col.classList.add(despues ? 'col-despues' : 'col-antes');
    });
    dlg.addEventListener('drop', (e) => {
      if (!colArrastrada) return;
      const col = e.target.closest('.op-col[data-op-col]');
      const id = colArrastrada;
      const despues = col?.classList.contains('col-despues');
      limpiarCol();
      colArrastrada = '';
      e.preventDefault();
      if (!col || col.dataset.opCol === id) return;
      const tab = tabsDe(fProy).find((b) => b.id === fTab) || tabsDe(fProy)[0];
      const resto = tab.columnas.filter((c) => c.id !== id);
      const i = resto.findIndex((c) => c.id === col.dataset.opCol);
      if (i < 0) return;
      resto.splice(i + (despues ? 1 : 0), 0, tab.columnas.find((c) => c.id === id));
      moverColumnas(tab, resto);
    });
    // Pestañas de tableros: arrastrarlas cambia su orden (solo superadmin).
    dlg.addEventListener('dragover', (e) => {
      if (!tabArrastrada) return;
      const tb = e.target.closest('[data-op-tab]');
      if (!tb) return;
      e.preventDefault();
      const r = tb.getBoundingClientRect();
      const despues = e.clientX > r.left + r.width / 2;
      dlg.querySelectorAll('.tab-antes, .tab-despues').forEach((x) => x.classList.remove('tab-antes', 'tab-despues'));
      if (tb.dataset.opTab !== tabArrastrada) tb.classList.add(despues ? 'tab-despues' : 'tab-antes');
    });
    dlg.addEventListener('drop', (e) => {
      if (!tabArrastrada) return;
      const tb = e.target.closest('[data-op-tab]');
      const id = tabArrastrada;
      const despues = tb?.classList.contains('tab-despues');
      dlg.querySelectorAll('.tab-antes, .tab-despues, .op-tab-b.arrastrando').forEach((x) => x.classList.remove('tab-antes', 'tab-despues', 'arrastrando'));
      tabArrastrada = '';
      if (!tb || tb.dataset.opTab === id) return;
      e.preventDefault();
      const ids = tabsDe(fProy).map((x) => x.id).filter((x) => x !== id);
      ids.splice(ids.indexOf(tb.dataset.opTab) + (despues ? 1 : 0), 0, id);
      moverTableros(ids);
    });
    // Las tareas del calendario se abren también con el teclado (Intro / espacio).
    dlg.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.op-cal-t, [data-op-col-ren]')) { e.preventDefault(); e.target.click(); } });
    // «＋ Añadir tarea»: Intro añade (Mayús+Intro, salto de línea) y Esc cierra.
    dlg.addEventListener('keydown', (e) => {
      if (!e.target.matches?.('.op-add textarea')) return;
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.form.requestSubmit(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); addCol = ''; pintarVista(); }
    });
    dlg.addEventListener('dragend', (e) => { e.target.closest?.('[data-op-k], [data-op-tab]')?.classList.remove('arrastrando'); quitarHueco(); tabArrastrada = ''; colArrastrada = ''; limpiarCol(); dlg.querySelectorAll('.tab-antes, .tab-despues').forEach((x) => x.classList.remove('tab-antes', 'tab-despues')); });
    // Tablero: soltar en otra columna cambia el estado. Calendario: soltar en otro día cambia la fecha.
    dlg.addEventListener('dragover', (e) => {
      if (tabArrastrada || colArrastrada) return;
      const col = e.target.closest('[data-op-col], [data-op-dia]');
      if (!col) return;
      e.preventDefault();
      col.classList.add('sobre');
      if (col.dataset.opCol) marcarHueco(col, e.clientY);
    });
    dlg.addEventListener('dragleave', (e) => { const col = e.target.closest('[data-op-col], [data-op-dia]'); if (col && !col.contains(e.relatedTarget)) { col.classList.remove('sobre'); quitarHueco(); } });
    dlg.addEventListener('drop', (e) => {
      if (colArrastrada || e.dataTransfer.types.includes('text/x-op-col')) return;
      const col = e.target.closest('[data-op-col], [data-op-dia]');
      if (!col) return;
      e.preventDefault();
      col.classList.remove('sobre');
      const t = buscarT(e.dataTransfer.getData('text/plain'));
      const indice = col.dataset.opCol ? huecoEn(col, e.clientY, t) : -1;
      quitarHueco();
      if (!t) return;
      if (col.dataset.opCol) soltarEnColumna(t, col.dataset.opCol, indice);
      if (col.dataset.opDia != null && (t.fecha || '') !== col.dataset.opDia) cambiarFecha(t, col.dataset.opDia);
    });
  }
  vista = 'tablero'; // siempre se entra por el tablero
  ultimoTablero = '';
  calMes = hoyMadrid().slice(0, 7);
  body().innerHTML = '<p class="muted">Cargando las tareas de todos los proyectos…</p>';
  if (!dlg.open) dlg.showModal();
  fTab = ''; // al entrar, el tablero por defecto del proyecto (lo pone cargar)
  entrando = true;
  await cargar();
  if (opts.ir && d) irA(opts.ir); // abierta desde un enlace de otra tarea («@»)
}

async function cargar() {
  try {
    d = await ctx.api('/api/operativa');
  } catch (e) { body().innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  if (vista === 'personas' || vista === 'proyectos') vista = 'tablero';
  const imp = ctx.dialog.querySelector('#op-importar-btn');
  if (imp) imp.hidden = !d.superadmin; // ya no son pestañas: están en los filtros
  if (entrando) { // al entrar, su proyecto por defecto (si lo tiene)
    entrando = false;
    if (d.proyectoDefecto && d.proyectos.some((p) => p.id === d.proyectoDefecto)) { fProy = d.proyectoDefecto; fEmb = ''; }
  }
  if (fProy && !d.proyectos.some((p) => p.id === fProy)) { fProy = ''; fEmb = ''; }
  // Quien solo lleva un proyecto (y no es de la agencia) entra directamente en él, con su tablero por defecto.
  if (!fProy && !d.superadmin && !d.agencia && d.proyectos.length === 1) { fProy = d.proyectos[0].id; fTab = tabInicial(fProy); }
  if (!tabsDe(fProy).some((b) => b.id === fTab)) fTab = tabInicial(fProy);
  pintar();
}

// Lo que se ve con los filtros de arriba.
function filtradas() {
  const t = q.trim().toLowerCase();
  return d.tareas.filter((x) => (!fProy || x.cliente === fProy) && (!fEmb || x.embudoId === fEmb)
    && (!fPersona || (fPersona === '_sin' ? !x.asignado : x.asignado?.tipo === 'persona' && x.asignado.id === fPersona))
    && (vista !== 'tablero' || enRango(x, fRango, hoyMadrid()))
    && (!fEtq || (fEtq === '_alta' ? x.prioridad === 'alta' : (x.etiquetas || []).includes(fEtq)))
    && (!t || `${x.titulo} ${x.clienteNombre} ${x.embudo} ${etiquetasDeTarea(x, d.etiquetas).map((e) => e.nombre).join(' ')}`.toLowerCase().includes(t)));
}

// Desplegable con icono, en forma de píldora (resaltado si filtra algo).
const selector = (id, label, ico, valor, opciones, color) => `<label class="op-sel${valor ? ' activo' : ''}"${color ? ` style="--sel:${esc(color)}"` : ''}><span class="op-sel-ico" aria-hidden="true">${ico}</span><select id="${id}" aria-label="${label}">${opciones}</select><span class="op-sel-chev" aria-hidden="true">▾</span></label>`;

function pintar() {
  guardarBorrador(); // antes de rehacer la pantalla (y con ella la ficha)
  const tab = (id, txt) => `<button type="button" class="op-tab${vista === id ? ' on' : ''}" data-op-vista="${id}">${txt}</button>`;
  const hoy = hoyMadrid();
  const venc = d.tareas.filter((t) => estadoOp(t) !== 'hecha' && t.fecha && t.fecha < hoy && (d.superadmin && d.yo ? asignadaA(t, d.yo, '') : true)).length;
  // Resumen del día en la cabecera.
  const abiertas = d.tareas.filter((t) => estadoOp(t) !== 'hecha');
  const vencT = abiertas.filter((t) => t.fecha && t.fecha < hoy).length;
  const hoyT = abiertas.filter((t) => t.fecha === hoy).length;
  const bloqT = abiertas.filter(estaBloqueada).length;
  const fechaHoy = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
  ctx.dialog.querySelector('#op-sub').innerHTML = `<span class="op-sub-fecha">${esc(fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1))}</span>`
    + `<span class="op-sub-pill">${abiertas.length} abierta${abiertas.length === 1 ? '' : 's'}</span>`
    + (vencT ? `<span class="op-sub-pill rojo">${vencT} vencida${vencT === 1 ? '' : 's'}</span>` : '<span class="op-sub-pill verde">Nada vencido</span>')
    + (hoyT ? `<span class="op-sub-pill">${hoyT} para hoy</span>` : '')
    + (bloqT ? `<span class="op-sub-pill ambar">${bloqT} bloqueada${bloqT === 1 ? '' : 's'}</span>` : '')
    + `<span class="op-sub-txt">${d.superadmin ? 'Todo el equipo y todos los proyectos' : d.gestiona?.length ? (d.agencia ? 'Todo lo de los proyectos que llevas y lo que tienes asignado' : 'Todo lo de tus proyectos') : 'Lo que tienes asignado en todos los proyectos'}</span>`;
  body().innerHTML = `<div class="op">
    <nav class="op-tabs">${tab('tablero', '🗂️ Tablero')}${tab('calendario', '🗓️ Calendario')}${tab('dia', `☀️ Mi día${venc ? ` <b>${venc}</b>` : ''}`)}<button type="button" class="op-tab op-tab-cal${d.miCalendario ? ' conectado' : ''}" data-op="cal-panel" title="Conecta tu calendario (Google, Outlook o Apple) para añadir tareas con un clic">📅 Mi calendario${d.miCalendario ? ' <span class="op-cal-ok">✓</span>' : ''}</button></nav>
    <div class="op-filtros">
      ${selector('op-proyecto', 'Cliente', fProy ? '🏷️' : '🌐', fProy, `<option value="">Todos los clientes</option>${d.proyectos.map((p) => `<option value="${esc(p.id)}"${fProy === p.id ? ' selected' : ''}>${esc(p.nombre)}</option>`).join('')}`, d.proyectos.find((p) => p.id === fProy)?.color)}
      ${fProy ? `<button type="button" class="op-proy-def${d.proyectoDefecto === fProy ? ' on' : ''}" data-op="proy-defecto" title="${d.proyectoDefecto === fProy ? 'Es tu proyecto por defecto: la Operativa se te abre en él. Pulsa para quitarlo' : 'Que la Operativa se te abra siempre en este proyecto'}">${d.proyectoDefecto === fProy ? '⭐ Por defecto' : '☆ Por defecto'}</button>` : ''}
      ${fProy && fProy !== PROYECTO_AGENCIA ? (() => { const embs = embudosDe(d.tareas, fProy); return embs.length ? selector('op-embudo', 'Embudo', '🧭', fEmb, `<option value="">Todos los proyectos</option>${embs.map((e) => `<option value="${esc(e.id)}"${fEmb === e.id ? ' selected' : ''}>${ICONO_EMBUDO[e.tipo] || '📁'} ${esc(e.nombre)}${e.n ? ` (${e.n})` : ''}</option>`).join('')}`) : ''; })() : ''}
      ${d.superadmin || d.gestiona?.length ? selector('op-persona', 'Persona', fPersona ? '👤' : '👥', fPersona, `<option value="">Todo el equipo</option>${d.equipo.map((u) => `<option value="${esc(u.id)}"${fPersona === u.id ? ' selected' : ''}>${esc(u.nombre)}</option>`).join('')}<option value="_sin"${fPersona === '_sin' ? ' selected' : ''}>Sin asignar</option>`) : ''}
      <label class="pr-buscar op-buscar"><span aria-hidden="true">🔎</span><input id="op-buscar" type="search" placeholder="Buscar…" value="${esc(q)}" autocomplete="off"></label>
    </div>
    ${barraEtiquetas()}
    <section id="op-vista"></section>
    ${abierta || creando ? '<div class="op-ficha-fondo" data-op="cerrar-ficha"></div><aside class="op-ficha" id="op-ficha"></aside>' : ''}
    ${calPanel ? `<div class="op-ficha-fondo" data-op="cal-cerrar"></div><aside class="op-ficha op-cal-panel">${panelCalendario()}</aside>` : ''}
  </div>`;
  pintarVista();
  if (abierta || creando) pintarFicha();
}

function pintarVista() {
  const box = body().querySelector('#op-vista');
  if (!box) return;
  const hoy = hoyMadrid();
  const lista = filtradas();
  // «Mi día» del superadmin: lo suyo (o lo de la persona elegida). Sin usuario propio (contraseña general), todo.
  if (vista === 'dia') box.innerHTML = vistaDia(d.superadmin && !fPersona && d.yo ? lista.filter((t) => asignadaA(t, d.yo, '')) : lista, hoy);
  else if (vista === 'proyectos') box.innerHTML = vistaProyectos(lista, hoy);
  else if (vista === 'tablero') box.innerHTML = vistaTablero(lista, hoy);
  else if (vista === 'calendario') box.innerHTML = vistaCalendario(lista, hoy);
  else box.innerHTML = vistaPersonas(lista, hoy);
  if (vista !== 'tablero') ultimoTablero = '';
}

function fila(t, hoy) {
  const e = estadoOp(t);
  return `<li class="op-fila e-${e}${estaBloqueada(t) ? ' is-bloq' : ''}" data-op-k="${esc(clave(t))}" draggable="false">
    <button type="button" class="op-check${e === 'hecha' ? ' on' : ''}" data-op-hecha="${esc(clave(t))}" title="${e === 'hecha' ? 'Reabrir' : 'Marcar como hecha'}" aria-label="${e === 'hecha' ? 'Reabrir' : 'Marcar como hecha'}">${ICONO_CHECK}</button>
    <button type="button" class="op-fila-t" data-op-abrir="${esc(clave(t))}"><strong>${esc(t.titulo)}</strong><span class="op-fila-meta">${chipProyecto(t)}${estaBloqueada(t) ? `<span class="op-bloq">⛔ ${esc(t.bloqueo)}</span>` : ''}${t.notas ? '<span class="op-com" title="Tiene descripción">📝</span>' : ''}${t.comentarios?.length ? `<span class="op-com">💬 ${t.comentarios.length}</span>` : ''}</span></button>
    <span class="op-estado e-${e}">${ESTADO[e].icon} ${esc(ESTADO[e].label)}</span>
    ${chipFecha(t, hoy)}
    ${avatar(t)}
  </li>`;
}

function vistaDia(lista, hoy) {
  const g = agruparPorFecha(lista, hoy);
  const bloque = (id, titulo, items, abierto = true) => (items.length ? `<details class="op-grupo g-${id}"${abierto ? ' open' : ''}><summary><span>${titulo}</span><b>${items.length}</b></summary><ul class="op-lista">${items.map((t) => fila(t, hoy)).join('')}</ul></details>` : '');
  const hechas = lista.filter((t) => estadoOp(t) === 'hecha').sort((a, b) => String(b.hechaEn).localeCompare(String(a.hechaEn)));
  const total = g.vencidas.length + g.hoy.length + g.semana.length + g.despues.length + g.sinFecha.length;
  if (!total && !hechas.length) return '<div class="op-vacio"><span>🎉</span><h3>No tienes nada pendiente</h3><p>Cuando te asignen tareas en cualquier proyecto, aparecerán aquí.</p></div>';
  return `<div class="op-dia-cab">${g.vencidas.length ? `<span class="op-kpi rojo"><b>${g.vencidas.length}</b> vencida${g.vencidas.length === 1 ? '' : 's'}</span>` : '<span class="op-kpi verde">✓ Nada vencido</span>'}<span class="op-kpi"><b>${g.hoy.length}</b> para hoy</span><span class="op-kpi"><b>${g.semana.length}</b> esta semana</span>${lista.filter(estaBloqueada).length ? `<span class="op-kpi ambar"><b>${lista.filter(estaBloqueada).length}</b> bloqueada${lista.filter(estaBloqueada).length === 1 ? '' : 's'}</span>` : ''}</div>
    ${bloque('vencidas', '⏰ Vencidas', g.vencidas)}${bloque('hoy', '📅 Hoy', g.hoy)}${bloque('semana', '🗓️ Esta semana', g.semana)}${bloque('despues', '➡️ Más adelante', g.despues, false)}${bloque('sin', '📌 Sin fecha', g.sinFecha, false)}${bloque('hechas', '✅ Hechas (últimos días)', hechas, false)}`;
}

function vistaProyectos(lista, hoy) {
  const porProy = d.proyectos.map((p) => ({ p, ts: lista.filter((t) => t.cliente === p.id) })).filter((x) => x.ts.length || !fProy);
  const SEM = { ok: ['🟢', 'Al día'], retraso: ['🔴', 'Con retraso'], bloqueado: ['🟠', 'Algo bloqueado'], vacio: ['⚪', 'Sin tareas'] };
  const orden = { bloqueado: 0, retraso: 1, ok: 2, vacio: 3 };
  const cards = porProy.map(({ p, ts }) => ({ p, ts, r: resumenProyecto(ts, hoy) })).sort((a, b) => orden[a.r.semaforo] - orden[b.r.semaforo] || b.r.vencidas - a.r.vencidas);
  return `<div class="op-proys">${cards.map(({ p, ts, r }, i) => {
    const vencidas = ts.filter((t) => estadoOp(t) !== 'hecha' && t.fecha && t.fecha < hoy).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 3);
    return `<article class="op-proy s-${r.semaforo}" style="--cl:${esc(p.color || 'var(--accent)')};--i:${i}">
      <header><span class="op-proy-dot"></span><h3>${esc(p.nombre)}</h3><span class="op-sem">${SEM[r.semaforo][0]} ${SEM[r.semaforo][1]}</span></header>
      <div class="op-proy-nums"><div><b>${r.abiertas}</b><small>abiertas</small></div><div class="${r.vencidas ? 'rojo' : ''}"><b>${r.vencidas}</b><small>vencidas</small></div><div class="${r.bloqueadas ? 'ambar' : ''}"><b>${r.bloqueadas}</b><small>bloqueadas</small></div></div>
      ${r.total ? `<div class="op-barra">${ESTADOS_OP.map((e) => (r.porEstado[e.id] ? `<span class="e-${e.id}" style="flex:${r.porEstado[e.id]}" title="${esc(e.label)}: ${r.porEstado[e.id]}"></span>` : '')).join('')}</div>` : ''}
      ${vencidas.length ? `<ul class="op-proy-venc">${vencidas.map((t) => `<li><button type="button" class="link" data-op-abrir="${esc(clave(t))}">⏰ ${esc(t.titulo)}</button><small>${esc(quienTxt(t))} · hace ${diasDeRetraso(t.fecha, hoy)} d</small></li>`).join('')}</ul>` : ''}
      <button type="button" class="btn ghost small" data-op-ver-proy="${esc(p.id)}">Ver su tablero →</button>
    </article>`;
  }).join('')}</div>`;
}

// Pastilla de una etiqueta (color del catálogo).
const pildoraEtq = (e, extra = '') => `<span class="op-etq" style="--etq:${COLORES_ETIQUETA[e.color] || COLORES_ETIQUETA.gris}"${extra}>${esc(e.nombre)}</span>`;
const prioDe = (t) => PRIORIDADES.find((p) => p.id === t.prioridad);
// Filtro por etiqueta (y «🔥 Prioridad alta») encima de las vistas.
function barraEtiquetas() {
  const usadas = d.etiquetas.filter((e) => d.tareas.some((t) => (t.etiquetas || []).includes(e.id) && estadoOp(t) !== 'hecha'));
  const altas = d.tareas.filter((t) => t.prioridad === 'alta' && estadoOp(t) !== 'hecha').length;
  if (!usadas.length && !altas) return '';
  const chip = (id, html, n) => `<button type="button" class="op-fchip${fEtq === id ? ' on' : ''}" data-op-fetq="${esc(id)}">${html}${n != null ? ` <b>${n}</b>` : ''}</button>`;
  return `<div class="op-fetqs" role="group" aria-label="Filtrar por etiqueta">${chip('', 'Todas')}${altas ? chip('_alta', '🔥 Prioridad alta', altas) : ''}${usadas.map((e) => chip(e.id, pildoraEtq(e), d.tareas.filter((t) => (t.etiquetas || []).includes(e.id) && estadoOp(t) !== 'hecha').length)).join('')}</div>`;
}
let nCard = 0;
// Círculo de completar: se ve siempre (apagado) para que se entienda que al pulsarlo se completa.
const ICONO_CHECK = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5.5 12.5l4.2 4.2L18.5 7.8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function tarjetaTablero(t, hoy) {
  const etqs = etiquetasDeTarea(t, d.etiquetas);
  const pr = prioDe(t);
  const ck = progresoChecklist(t);
  const hecha = estadoOp(t) === 'hecha';
  const portada = etqs[0] ? COLORES_ETIQUETA[etqs[0].color] : pr ? pr.color : '';
  return `<article class="op-card op-card2${estaBloqueada(t) ? ' is-bloq' : ''}${hecha ? ' es-hecha' : ''}${portada ? ' con-portada' : ''}${recienCreada && t.id === recienCreada ? ' recien' : ''}${recienHecha && t.id === recienHecha ? ' llega' : ''}${movida && t.id === movida ? ' movida' : ''}" style="--i:${nCard++ % 12};${portada ? `--portada:${portada}` : ''}" draggable="true" data-op-k="${esc(clave(t))}" data-op-abrir="${esc(clave(t))}">
        ${etqs.length || pr ? `<div class="op-card-etqs">${pr ? `<span class="op-prio p-${pr.id}" title="Prioridad ${esc(pr.label.toLowerCase())}">${pr.id === 'alta' ? '🔥' : '⚑'} ${esc(pr.label)}</span>` : ''}${etqs.map((e) => pildoraEtq(e)).join('')}</div>` : ''}
        <div class="op-card-t"><button type="button" class="op-check${hecha ? ' on' : ''}" data-op-hecha="${esc(clave(t))}" title="${hecha ? 'Reabrir' : 'Marcar como hecha'}" aria-label="${hecha ? 'Reabrir' : 'Marcar como hecha'}">${ICONO_CHECK}</button><strong>${esc(t.titulo)}</strong></div>
        ${t.notas ? `<p class="op-card-desc">${esc(richToText(t.notas).replace(/🎬/g, '🎬 vídeo').replace(/\s*•\s*/g, ' · ').replace(/\s*\n+\s*/g, ' · ').replace(/^ · /, '').slice(0, 120))}</p>` : ''}
        ${estaBloqueada(t) ? `<span class="op-bloq">⛔ ${esc(t.bloqueo)}</span>` : ''}
        ${ck.total ? `<div class="op-ck-mini${ck.hechos === ck.total ? ' completa' : ''}" title="Checklist: ${ck.hechos} de ${ck.total}"><span class="op-ck-barra"><i style="width:${Math.round((ck.hechos / ck.total) * 100)}%"></i></span><b>☑ ${ck.hechos}/${ck.total}</b></div>` : ''}
        <footer><button type="button" class="op-fecha-b${t.fecha ? '' : ' vacia'}" data-op-fecha-k="${esc(clave(t))}" title="Fecha límite${t.fecha ? `: ${esc(fechaCorta(t.fecha))}` : ''} · pulsa para cambiarla" aria-label="Cambiar la fecha límite">${t.fecha ? chipFecha(t, hoy) : '<span class="op-fecha">📅 Fecha</span>'}</button>${t.repetir?.tipo ? `<span class="op-rep" title="${esc(textoRepetir(t.repetir))}">🔁</span>` : ''}${t.comentarios?.length ? `<span class="op-com">💬 ${t.comentarios.length}</span>` : ''}<button type="button" class="op-cal-b" data-op-cal="${esc(clave(t))}" title="Añadir a mi calendario" aria-label="Añadir a mi calendario">📆</button><span class="op-card-proy">${fProy ? '' : chipProyecto(t)}</span>${gestiona(t.cliente) ? `<button type="button" class="op-resp-b" data-op-resp="${esc(clave(t))}" title="Responsable: ${esc(quienTxt(t))} · pulsa para cambiarlo" aria-label="Cambiar responsable">${avatar(t)}</button>` : avatar(t)}</footer>
      </article>`;
}
// Orden de cada columna: el puesto a mano (arrastrando o con ↑/↓); si no, prioridad alta primero y después la fecha.
const porOrden = ordenColumna;
// Las tareas que se ven en la misma columna que `t`, de arriba abajo.
function hermanas(t) {
  const l = filtradas();
  if (fProy) { const tab = tabDeT(t); const col = columnaDeTarea(t, tab); return l.filter((x) => tabDeT(x).id === tab.id && columnaDeTarea(x, tab) === col).sort(porOrden); }
  const e = estadoOp(t);
  return l.filter((x) => estadoOp(x) === e).sort(porOrden);
}
// Pone `t` en la posición `indice` de su columna y guarda el orden de toda la columna (una sola petición).
async function colocar(t, indice) {
  const nueva = recolocar(hermanas(t), t, indice);
  const antes = nueva.map((x) => x.opOrden);
  nueva.forEach((x, i) => { x.opOrden = i + 1; });
  movida = t.id;
  pintarVista();
  if (abierta) pintarFicha();
  setTimeout(() => { if (movida === t.id) movida = ''; }, 700);
  try {
    await ctx.api('/api/operativa', { method: 'POST', body: { op: 'ordenar', orden: nueva.map((x) => ({ cliente: x.cliente, code: x.code, id: x.id })) } });
  } catch (err) {
    nueva.forEach((x, i) => { x.opOrden = antes[i]; });
    window.alert(err.message);
    pintarVista();
  }
}

// Tablero: con «Todos los clientes», por estado (Pendiente · Para revisar · Hecho). Con un cliente elegido, sus
// tableros (General y los creados) con sus propias columnas; el superadmin crea tableros y edita columnas.
let ultimoTablero = '';
// Abajo de cada columna: «＋ Añadir tarea» (se escribe el título y Intro; la tarea se crea ya en esa columna).
const pieColumna = (colId) => (addCol === colId
  ? `<form class="op-add" data-op-form="rapida" data-col="${esc(colId)}"><textarea name="titulo" rows="2" maxlength="200" placeholder="¿Qué hay que hacer? (Intro para añadir)" aria-label="Nueva tarea"></textarea><div class="op-add-acc"><button class="btn primary small">Añadir</button><button type="button" class="btn ghost small" data-op="add-cerrar" aria-label="Cancelar">✕</button><span class="muted small">${fProy ? '' : 'Se abrirá la ficha para elegir el proyecto'}</span></div></form>`
  : `<button type="button" class="op-add-b" data-op-add="${esc(colId)}">＋ Añadir tarea</button>`);
// Ancho de cada columna: se cambia arrastrando su borde derecho (doble clic, vuelve al de serie). Se recuerda en
// este navegador, por tablero. En el móvil no se usa (las columnas ocupan la pantalla).
const LS_ANCHOS = 'lsd_op_anchos';
let anchos = (() => { try { return JSON.parse(localStorage.getItem(LS_ANCHOS) || '{}') || {}; } catch { return {}; } })();
const guardarAnchos = () => { try { localStorage.setItem(LS_ANCHOS, JSON.stringify(anchos)); } catch { /* sin almacenamiento */ } };
const claveAnchos = () => (fProy ? `${fProy}|${(tabsDe(fProy).find((b) => b.id === fTab) || tabsDe(fProy)[0]).id}` : '_todos');
const plantillaAnchos = (k, ids) => ids.map((id) => (anchos[k]?.[id] ? `${anchos[k][id]}px` : 'minmax(260px, 1fr)')).join(' ');
function estiloAnchos(k, ids, enStyle = false) {
  if (!anchos[k] || !Object.keys(anchos[k]).length || window.matchMedia?.('(max-width: 760px)').matches) return '';
  const css = `grid-template-columns:${plantillaAnchos(k, ids)}`;
  return enStyle ? css : ` style="${css}"`;
}
const asaAncho = (colId) => `<span class="op-col-ancho" data-op-ancho="${esc(colId)}" title="Arrastra para cambiar el ancho (doble clic: el de serie)" aria-hidden="true"></span>`;
function empezarAncho(e, asa) {
  const col = asa.closest('.op-col');
  const tablero = asa.closest('.op-tablero');
  if (!col || !tablero) return;
  e.preventDefault();
  const k = claveAnchos();
  const ids = [...tablero.querySelectorAll(':scope > .op-col')].map((c) => c.dataset.opCol);
  const x0 = e.clientX;
  const w0 = col.getBoundingClientRect().width;
  const id = asa.dataset.opAncho;
  anchos[k] = { ...(anchos[k] || {}) };
  col.classList.add('ajustando');
  const mover = (ev) => {
    anchos[k][id] = Math.round(Math.max(200, Math.min(900, w0 + ev.clientX - x0)));
    tablero.style.gridTemplateColumns = plantillaAnchos(k, ids);
  };
  const soltar = () => {
    window.removeEventListener('pointermove', mover);
    window.removeEventListener('pointerup', soltar);
    col.classList.remove('ajustando');
    guardarAnchos();
  };
  window.addEventListener('pointermove', mover);
  window.addEventListener('pointerup', soltar);
}

function vistaTablero(lista, hoy) {
  if (importando) return vistaImportar();
  // Las tarjetas entran con animación al abrir o cambiar de tablero; al repintar tras un cambio, no.
  const k = `${fProy}|${fTab}|${fEmb}|${fEtq}`;
  const quieto = k === ultimoTablero ? ' quieto' : '';
  ultimoTablero = k;
  const rangos = `<div class="op-rangos" role="group" aria-label="Filtro de tiempo"><span class="op-rangos-l">📅</span>${RANGOS_OP.map((r) => `<button type="button" class="op-rango${fRango === r.id ? ' on' : ''}" data-op-rango="${r.id}">${r.label}</button>`).join('')}${fRango ? '<span class="muted small op-rangos-nota">Con fecha en ese plazo (las vencidas sin hacer, también)</span>' : ''}</div>`;
  if (!fProy) {
    return `${rangos}<p class="op-ayuda">Arrastra las tarjetas a otra columna para cambiar su estado, o arriba y abajo para ordenarlas. Pulsa el círculo ✓ para completarlas. <strong>Elige un cliente arriba</strong> para ver sus tableros, cada uno con sus columnas.</p>
  <div class="op-tablero${quieto}"${estiloAnchos('_todos', ESTADOS_OP.map((e) => e.id))}>${ESTADOS_OP.map((e) => {
    const ts = lista.filter((t) => estadoOp(t) === e.id).sort(porOrden);
    return `<section class="op-col e-${e.id}" data-op-col="${e.id}"><header><span class="op-col-dot"></span><span class="op-col-nom">${e.icon} ${esc(e.label)}</span><b>${ts.length}</b><button type="button" class="op-col-mas" data-op-add="${e.id}" title="Nueva tarea en «${esc(e.label)}»" aria-label="Nueva tarea en ${esc(e.label)}">＋</button></header>
      <div class="op-col-lista">${ts.map((t) => tarjetaTablero(t, hoy)).join('') || '<p class="op-col-vacia">Suelta aquí una tarea</p>'}</div>${pieColumna(e.id)}${asaAncho(e.id)}</section>`;
  }).join('')}</div>`;
  }
  const tabs = tabsDe(fProy);
  const tab = tabs.find((b) => b.id === fTab) || tabs[0];
  const abiertasDe = (b) => lista.filter((t) => tabDeT(t).id === b.id && estadoOp(t) !== 'hecha').length;
  const barra = `<nav class="op-tabs-tab" aria-label="Tableros">${tabs.map((b) => `<button type="button" class="op-tab-b${b.id === tab.id ? ' on' : ''}" data-op-tab="${esc(b.id)}"${gestiona(fProy) && !b.virtual ? ' draggable="true" title="Arrastra para cambiar el orden"' : b.virtual ? ' title="Las tareas del lanzamiento en curso de este embudo (Plan → Tareas)"' : ''}>${b.id === GENERAL ? '🗂️' : b.virtual ? '🚀' : '📋'} ${esc(b.nombre)}${b.id === tabInicial(fProy) && b.id !== GENERAL ? ' <span class="op-tab-def" title="Tablero por defecto: se abre al entrar en este proyecto">⭐</span>' : ''} <b>${abiertasDe(b)}</b></button>`).join('')}
    ${gestiona(fProy) ? `<button type="button" class="op-tab-b op-tab-nuevo" data-op="tab-nuevo">＋ Nuevo tablero</button>${d.superadmin ? '<button type="button" class="op-tab-b op-tab-nuevo" data-op="tab-importar" title="Desde un archivo .json (también el export de un proyecto de Asana)">⬆️ Importar tablero</button>' : ''}${tab.virtual ? '' : `<button type="button" class="btn ghost small op-tab-cfg" data-op="tab-editar" title="Cambiar el nombre del tablero y sus columnas">✏️ Editar «${esc(tab.nombre)}»</button>`}${tab.id === GENERAL && tabInicial(fProy) === GENERAL ? '' : `<button type="button" class="btn ghost small op-tab-defecto${tabInicial(fProy) === tab.id ? ' on' : ''}" data-op="tab-defecto" title="${tabInicial(fProy) === tab.id ? 'Quitar: al entrar se abrirá el General' : 'Que este tablero se abra siempre primero al entrar en el proyecto'}">${tabInicial(fProy) === tab.id ? '⭐ Por defecto' : '☆ Marcar por defecto'}</button>`}` : ''}</nav>`;
  if (editTab) return barra + editorTablero();
  const suyas = lista.filter((t) => tabDeT(t).id === tab.id);
  const ayuda = tab.virtual
    ? `🚀 <strong>Tablero de «${esc(tab.nombre)}»</strong>: son las tareas de ese lanzamiento (las de Plan → Tareas), con lo que hagas aquí guardado allí. Cuando crees otro lanzamiento en este mismo embudo, este tablero pasará a ser el del nuevo, con sus tareas.`
    : `Arrastra las tarjetas a otra columna, o arriba y abajo para ordenarlas. Pulsa el círculo ✓ de una tarjeta para completarla. Al llevarlas a ${tab.columnas.filter((c) => c.hecha).map((c) => `«${esc(c.nombre)}»`).join(' o ')} se marcan como hechas.${gestiona(fProy) ? ' Pulsa el título de una columna para cambiarle el nombre.' : ''}`;
  return `${barra}${rangos}<p class="op-ayuda">${ayuda}</p>
  <div class="op-tablero${quieto}${tab.virtual ? ' es-embudo' : ''}" style="--op-ncol:${tab.columnas.length};${estiloAnchos(`${fProy}|${tab.id}`, tab.columnas.map((c) => c.id), true)}">${tab.columnas.map((c, i) => {
    const ts = suyas.filter((t) => columnaDeTarea(t, tab) === c.id).sort(porOrden);
    return `<section class="op-col${c.hecha ? ' e-hecha' : ` e-c${i % 6}`}" data-op-col="${esc(c.id)}"><header${gestiona(fProy) && !tab.virtual ? ` class="op-col-arr" draggable="true" data-op-col-arr="${esc(c.id)}" title="Arrastra para mover la columna a un lado u otro"` : ''}><span class="op-col-dot"></span><span class="op-col-nom${gestiona(fProy) && !tab.virtual ? ' op-col-ren' : ''}" ${gestiona(fProy) && !tab.virtual ? `data-op-col-ren="${esc(c.id)}" role="button" tabindex="0" title="«${esc(c.nombre)}» · pulsa para cambiar el nombre"` : `title="${esc(c.nombre)}"`}>${c.hecha && !c.nombre.startsWith('✅') ? '✅ ' : ''}${esc(c.nombre)}</span><b>${ts.length}</b><button type="button" class="op-col-mas" data-op-add="${esc(c.id)}" title="Nueva tarea en «${esc(c.nombre)}»" aria-label="Nueva tarea en ${esc(c.nombre)}">＋</button></header>
      <div class="op-col-lista">${ts.map((t) => tarjetaTablero(t, hoy)).join('') || '<p class="op-col-vacia">Suelta aquí una tarea</p>'}</div>${pieColumna(c.id)}${asaAncho(c.id)}</section>`;
  }).join('')}</div>`;
}

// Crear un tablero o editar sus columnas (solo superadmin). Plantillas: empezar con unas columnas guardadas o
// guardar las de este tablero para otros proyectos.
// Vista previa de un tablero que se va a importar: nombre, columnas y cuántas tareas van a cada una.
function vistaImportar() {
  const { imp, asana } = importando;
  let n = imp;
  try { n = normalizarImportacion(importando.archivo, { incluirCompletadas: importando.completadas }); } catch { /* ya validado */ }
  const por = n.columnas.map((c, i) => n.tareas.filter((t) => t.columna === i).length);
  return `<section class="op-te op-imp">
    <header class="op-te-h"><h3>⬆️ Importar tablero</h3></header>
    <div class="op-te-fila"><label class="field"><span>Cliente (proyecto)</span><select data-imp="proyecto"><option value="">— Elige el cliente —</option>${d.proyectos.map((p) => `<option value="${esc(p.id)}"${(importando.proyecto || fProy) === p.id ? ' selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
    <label class="field"><span>Nombre del tablero</span><input data-imp="nombre" maxlength="40" value="${esc(importando.nombre)}" placeholder="Operativa diaria"></label></div>
    <div class="op-imp-cols">${n.columnas.map((c, i) => `<div class="op-imp-col${c.hecha ? ' hecha' : ''}"><strong>${c.hecha && !c.nombre.startsWith('✅') ? '✅ ' : ''}${esc(c.nombre)}</strong><span>${por[i]} tarea${por[i] === 1 ? '' : 's'}</span></div>`).join('')}</div>
    <p class="muted small">${n.tareas.length} tareas con su descripción, fecha, responsable (si está en el equipo de la agencia) y sus subtareas como checklist.</p>
    ${asana ? `<label class="chk small"><input type="checkbox" data-imp="completadas" ${importando.completadas ? 'checked' : ''}> Incluir también las tareas ya completadas (a la columna de hecho)</label>` : ''}
    <footer class="op-te-pie"><button type="button" class="btn ghost" data-op="imp-cancelar">Cancelar</button><span class="spacer"></span><button type="button" class="btn primary" data-op="imp-crear">Crear el tablero</button></footer>
  </section>`;
}

function editorTablero() {
  const e = editTab;
  return `<section class="op-te">
    <header class="op-te-h"><h3>${e.nuevo ? '＋ Nuevo tablero' : `✏️ Editar «${esc(e.nombre)}»`}</h3><span class="muted small">${esc(d.proyectos.find((p) => p.id === e.proyecto)?.nombre || '')}</span></header>
    <div class="op-te-fila">
      <label class="field"><span>Nombre del tablero</span><input data-te="nombre" maxlength="40" value="${esc(e.nombre)}" placeholder="Contenido, Anuncios, Lanzamiento octubre…"></label>
      ${e.nuevo && d.plantillas.length ? `<label class="field"><span>Empezar con</span><select data-te="plantilla"><option value="">Columnas de serie</option>${d.plantillas.map((p) => `<option value="${esc(p.id)}"${e.plantilla === p.id ? ' selected' : ''}>📐 ${esc(p.nombre)}</option>`).join('')}</select></label>` : ''}
    </div>
    <ol class="op-te-cols">${e.columnas.map((c, i) => `<li data-ci="${i}"><span class="op-te-n">${i + 1}</span><input data-tc="nombre" maxlength="40" value="${esc(c.nombre)}" placeholder="Nombre de la columna" aria-label="Columna ${i + 1}">
      <label class="chk small" title="Al llevar una tarea aquí, se marca como hecha"><input type="checkbox" data-tc="hecha" ${c.hecha ? 'checked' : ''}> Cuenta como hecha</label>
      <button type="button" class="btn ghost small" data-op="te-subir" ${i ? '' : 'disabled'} aria-label="Subir">↑</button><button type="button" class="btn ghost small" data-op="te-bajar" ${i < e.columnas.length - 1 ? '' : 'disabled'} aria-label="Bajar">↓</button><button type="button" class="btn ghost small danger" data-op="te-quitar" ${e.columnas.length > 1 ? '' : 'disabled'} aria-label="Quitar columna">✕</button></li>`).join('')}</ol>
    <button type="button" class="btn small" data-op="te-add" ${e.columnas.length >= MAX_COLUMNAS ? 'disabled' : ''}>＋ Añadir columna</button>
    <p class="muted small">Las tareas de una columna que quites pasan a la primera (o a la de hecha, si estaban hechas). Tiene que haber al menos una columna «cuenta como hecha».</p>
    <footer class="op-te-pie">
      ${!e.nuevo && e.id !== GENERAL ? '<button type="button" class="btn ghost small danger" data-op="te-borrar">🗑️ Borrar tablero</button>' : ''}
      ${d.superadmin ? '<button type="button" class="btn ghost small" data-op="te-plantilla">📐 Guardar como plantilla</button>' : ''}
      ${e.nuevo && e.plantilla ? '<button type="button" class="btn ghost small" data-op="te-plantilla-borrar">Borrar esta plantilla</button>' : ''}
      <span class="spacer"></span>
      <button type="button" class="btn ghost" data-op="te-cancelar">Cancelar</button><button type="button" class="btn primary" data-op="te-guardar">${e.nuevo ? 'Crear tablero' : 'Guardar cambios'}</button>
    </footer>
  </section>`;
}
function leerEditor() {
  const box = body().querySelector('.op-te');
  if (!box || !editTab) return;
  const nombre = box.querySelector('[data-te="nombre"]');
  if (nombre && !nombre.disabled) editTab.nombre = nombre.value;
  box.querySelectorAll('[data-ci]').forEach((li) => {
    const c = editTab.columnas[Number(li.dataset.ci)];
    c.nombre = li.querySelector('[data-tc="nombre"]').value;
    c.hecha = li.querySelector('[data-tc="hecha"]').checked;
  });
}
// Nuevo orden de las pestañas del cliente elegido (se ve al momento; si falla, vuelve el de antes).
async function moverTableros(ids) {
  const antes = d.tableros;
  const pos = new Map(ids.map((id, i) => [id, i]));
  const general = tabsDe(fProy).find((x) => x.id === GENERAL);
  const otros = d.tableros.filter((x) => x.proyecto !== fProy);
  const suyos = [...(d.tableros.some((x) => x.proyecto === fProy && x.id === GENERAL) ? [] : [general]), ...d.tableros.filter((x) => x.proyecto === fProy)];
  d.tableros = [...otros, ...suyos.map((x) => ({ ...x, orden: pos.get(x.id) ?? 999 }))];
  ultimoTablero = `${fProy}|${fTab}|${fEmb}|${fEtq}`; // sin la animación de entrada
  pintarVista();
  try { await guardarTableros({ op: 'tablero-orden', proyecto: fProy, ids }); } catch (err) { d.tableros = antes; window.alert(err.message); pintarVista(); }
}
// Título de columna editable en el sitio: un campo en lugar del nombre, sin poder arrastrar la columna mientras.
function editarNombreColumna(span) {
  const tab = tabsDe(fProy).find((b) => b.id === fTab) || tabsDe(fProy)[0];
  const id = span.dataset.opColRen;
  const col = tab?.columnas.find((c) => c.id === id);
  if (!col || tab.virtual || !gestiona(fProy)) return;
  span.closest('header')?.setAttribute('draggable', 'false');
  span.innerHTML = `<input class="op-col-input" maxlength="40" value="${esc(col.nombre)}" aria-label="Nombre de la columna">`;
  const inp = span.querySelector('input');
  inp.focus();
  inp.select();
  let hecho = false;
  const fin = (guardar) => {
    if (hecho) return;
    hecho = true;
    const nombre = inp.value.trim().slice(0, 40);
    if (!guardar || !nombre || nombre === col.nombre) { pintarVista(); return; }
    moverColumnas(tab, tab.columnas.map((c) => (c.id === id ? { ...c, nombre } : c)));
  };
  inp.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter') { ev.preventDefault(); fin(true); } else if (ev.key === 'Escape') { ev.preventDefault(); fin(false); }
  });
  inp.addEventListener('blur', () => fin(true));
  ['click', 'mousedown', 'dragstart'].forEach((t) => inp.addEventListener(t, (ev) => ev.stopPropagation()));
}
// Guarda el nuevo orden de las columnas de un tablero (se ve ya, antes de que conteste el servidor).
async function moverColumnas(tab, columnas) {
  const antes = d.tableros;
  const nuevo = { ...tab, proyecto: fProy, columnas };
  d.tableros = [...d.tableros.filter((b) => !(b.proyecto === fProy && b.id === tab.id)), nuevo];
  ultimoTablero = `${fProy}|${fTab}|${fEmb}|${fEtq}`; // sin la animación de entrada
  pintarVista();
  try {
    await guardarTableros({ op: 'tablero-guardar', tablero: { id: tab.id, proyecto: fProy, nombre: tab.nombre, columnas } });
  } catch (err) { d.tableros = antes; window.alert(err.message); }
  pintarVista();
}
async function guardarTableros(cuerpo) {
  const r = await ctx.api('/api/operativa', { method: 'POST', body: cuerpo });
  d.tableros = r.tableros;
  d.plantillas = r.plantillas;
  if (r.porDefecto) d.porDefecto = r.porDefecto;
  return r;
}

// Calendario del mes: cada tarea en su día (arrastrándola a otro día cambia la fecha). Las sin fecha, abajo,
// para arrastrarlas a su día. En el móvil se ve como agenda (solo los días con tareas).
function vistaCalendario(lista, hoy) {
  const semanas = semanasDelMes(calMes);
  const porDia = new Map();
  for (const t of lista) if (t.fecha) porDia.set(t.fecha, [...(porDia.get(t.fecha) || []), t]);
  const sinFecha = lista.filter((t) => !t.fecha && estadoOp(t) !== 'hecha');
  const titulo = new Date(`${calMes}-15T12:00:00Z`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const chip = (t) => {
    const e = estadoOp(t);
    const cls = [e === 'hecha' ? 'hecha' : '', e !== 'hecha' && t.fecha && t.fecha < hoy ? 'vencida' : '', e === 'revision' ? 'revision' : '', estaBloqueada(t) ? 'is-bloq' : ''].filter(Boolean).join(' ');
    return `<div role="button" tabindex="0" class="op-cal-t ${cls}" draggable="true" data-op-k="${esc(clave(t))}" data-op-abrir="${esc(clave(t))}" style="--cl:${esc(t.color || 'var(--accent)')}" title="${esc(`${t.titulo} · ${t.clienteNombre}${t.embudo ? ` · ${t.embudo}` : ''}`)}">${e === 'hecha' ? '✓ ' : estaBloqueada(t) ? '⛔ ' : e === 'revision' ? '👀 ' : ''}${esc(t.titulo)}</div>`;
  };
  const fechaLarga = (dia) => new Date(`${dia}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return `<div class="op-cal-cab"><button type="button" class="btn ghost small" data-op-cal="-1" aria-label="Mes anterior">‹</button><h3>${esc(titulo.charAt(0).toUpperCase() + titulo.slice(1))}</h3><button type="button" class="btn ghost small" data-op-cal="1" aria-label="Mes siguiente">›</button><button type="button" class="btn ghost small" data-op-cal="hoy">Hoy</button><span class="muted small op-cal-ayuda">Arrastra una tarea a otro día para cambiar su fecha.</span></div>
  <div class="op-cal">
    ${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((x) => `<div class="op-cal-dow">${x}</div>`).join('')}
    ${semanas.flat().map(({ dia, delMes }) => {
      const ts = (porDia.get(dia) || []).sort((a, b) => (estadoOp(a) === 'hecha') - (estadoOp(b) === 'hecha'));
      return `<div class="op-cal-dia${delMes ? '' : ' fuera'}${dia === hoy ? ' hoy' : ''}${ts.length ? ' con' : ''}" data-op-dia="${dia}">
        <span class="op-cal-n"><span class="op-cal-larga">${esc(fechaLarga(dia))}</span><span class="op-cal-corta">${Number(dia.slice(8))}</span></span>
        <div class="op-cal-ts">${ts.map(chip).join('')}</div></div>`;
    }).join('')}
  </div>
  ${sinFecha.length ? `<section class="op-cal-sin" data-op-dia=""><h4>📌 Sin fecha <span class="muted">${sinFecha.length}</span> <small class="muted">· arrástralas a su día</small></h4><div class="op-cal-ts">${sinFecha.map(chip).join('')}</div></section>` : ''}`;
}

function vistaPersonas(lista, hoy) {
  const carga = cargaPorPersona(lista, hoy);
  const max = Math.max(1, ...carga.map((x) => x.abiertas));
  const sin = lista.filter((t) => estadoOp(t) !== 'hecha' && !t.asignado).length;
  return `<div class="op-personas">${carga.map((x, i) => `<button type="button" class="op-persona" data-op-ver-persona="${esc(x.uid)}" style="--i:${i}">
      <span class="pr-av">${esc(iniciales(nombreDe(x.uid)))}</span>
      <span class="op-persona-t"><strong>${esc(nombreDe(x.uid) || 'Otra persona')}</strong><span class="op-barra-p"><span style="width:${(x.abiertas / max) * 100}%"></span><span class="v" style="width:${(x.vencidas / max) * 100}%"></span></span></span>
      <span class="op-persona-n"><b>${x.abiertas}</b> abiertas${x.vencidas ? ` · <b class="rojo">${x.vencidas}</b> vencidas` : ''}</span>
    </button>`).join('') || '<p class="muted">Nadie del equipo tiene tareas asignadas.</p>'}
    ${sin ? `<button type="button" class="op-persona sin" data-op-ver-persona="_sin"><span class="pr-av vacio">?</span><span class="op-persona-t"><strong>Sin asignar</strong></span><span class="op-persona-n"><b>${sin}</b> abiertas</span></button>` : ''}</div>`;
}

// Selector de etiquetas de la ficha: las del catálogo (pulsar = poner o quitar) y crear una nueva con su color.
function selectorEtiquetas(t) {
  const mias = t.etiquetas || [];
  return `<div class="op-etq-picker">
    <div class="op-etq-lista">${d.etiquetas.map((e) => `<span class="op-etq-opt${mias.includes(e.id) ? ' on' : ''}">${pildoraEtq(e, ` data-op-etq-toggle="${esc(e.id)}" role="button" tabindex="0"`)}${d.superadmin ? `<button type="button" class="op-etq-x" data-op-etq-borrar="${esc(e.id)}" title="Borrar la etiqueta de todas las tareas" aria-label="Borrar etiqueta">✕</button>` : ''}</span>`).join('') || '<span class="muted small">Aún no hay etiquetas: crea la primera.</span>'}</div>
    <div class="op-etq-nueva"><input data-op-etq-nombre maxlength="30" placeholder="Nueva etiqueta (p. ej. Urgente, Diseño…)"><div class="op-swatches">${Object.entries(COLORES_ETIQUETA).map(([k, v]) => `<button type="button" class="op-sw${k === colorNueva ? ' on' : ''}" style="--sw:${v}" data-op-color="${k}" aria-label="${k}"></button>`).join('')}</div><button type="button" class="btn small primary" data-op="etq-crear">Crear</button></div>
    ${mias.length >= MAX_ETIQUETAS_TAREA ? `<p class="muted small">Máximo ${MAX_ETIQUETAS_TAREA} etiquetas por tarea.</p>` : ''}
  </div>`;
}
function bloqueChecklist(t) {
  const l = t.checklist || [];
  const ck = progresoChecklist(t);
  return `<section class="pr-bloque op-ck"><header class="pr-bloque-h"><h4>Checklist ${ck.total ? `<span class="muted">${ck.hechos}/${ck.total}</span>` : ''}</h4></header>
    ${ck.total ? `<div class="op-ck-barra grande"><i style="width:${Math.round((ck.hechos / ck.total) * 100)}%"></i></div>` : ''}
    <ul class="op-ck-lista">${l.map((c) => `<li class="${c.hecho ? 'hecho' : ''}"><label><input type="checkbox" data-op-ck="${esc(c.id)}" ${c.hecho ? 'checked' : ''}><span>${esc(c.texto)}</span></label><button type="button" class="op-ck-x" data-op-ck-borrar="${esc(c.id)}" aria-label="Quitar">✕</button></li>`).join('')}</ul>
    <form class="op-ck-add" data-op-form="ck"><input name="texto" maxlength="200" placeholder="＋ Añadir un paso" autocomplete="off"><button class="btn small">Añadir</button></form>
  </section>`;
}

// Debajo del editor de «Se repite»: cuándo será la siguiente y, si su fecha no cae en el día elegido, moverla.
function bloqueRepetir(t) {
  if (!t.repetir?.tipo) return '';
  const hoy = hoyMadrid();
  const base = t.fecha || hoy;
  const fuera = !t.hecha && !encajaEnRepetir(base, t.repetir);
  const primera = fuera ? primeraFechaRepetir(base < hoy ? hoy : base, t.repetir) : '';
  return `<small class="op-rep-txt">🔁 <b>${esc(textoRepetir(t.repetir))}</b>. ${fuera ? `Esta tarea está para el ${esc(fechaCorta(base))}, que no es el día elegido.` : `Al completarla se crea la siguiente para el <b>${esc(fechaCorta(proximaTrasHecho(base, t.repetir, hoy)))}</b>${t.fecha ? '' : ' (desde hoy: ponle fecha para fijar el ritmo)'}.`}</small>
    ${fuera ? `<button type="button" class="btn small op-rep-alinear" data-op="rep-alinear" data-fecha="${esc(primera)}">📅 Pasarla al ${esc(fechaCorta(primera))}</button>` : ''}`;
}

// ---- Ficha de una tarea (o nueva del proyecto Agencia) ----
function pintarFicha() {
  const box = body().querySelector('#op-ficha');
  if (!box) return;
  guardarBorrador();
  box.dataset.k = claveFicha();
  if (creando) {
    box.innerHTML = `<form class="op-form" data-op-form="crear">
      <header class="op-ficha-h"><h3>＋ Nueva tarea</h3><button type="button" class="btn ghost small" data-op="cerrar-ficha" aria-label="Cerrar">✕</button></header>
      <p class="muted small">Elige el proyecto y su tablero. Lo interno que no es de ningún cliente (facturas, equipo…) va a «Agencia».</p>
      <label class="field"><span>Qué hay que hacer</span><input name="titulo" required maxlength="200" autocomplete="off"></label>
      <div class="op-form-fila"><label class="field"><span>Proyecto</span><select name="proyecto">${d.proyectos.map((p) => `<option value="${esc(p.id)}"${p.id === proyectoDef() ? ' selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
      <label class="field"><span>Tablero</span><select name="tablero">${tabsDe(proyectoDef()).map((b) => `<option value="${esc(b.id)}"${b.id === fTab ? ' selected' : ''}>${esc(b.nombre)}</option>`).join('')}</select></label></div>
      <div class="op-form-fila"><label class="field"><span>Para cuándo</span><input type="date" name="fecha"></label>
      <label class="field"><span>Responsable</span><select name="uid">${opcionesResp(proyectoDef(), d.equipo.some((u) => u.id === d.yo) ? d.yo : '')}</select></label></div>
      <div class="field"><span>Descripción</span><div class="op-editor" data-op-editor></div></div>
      <footer class="op-form-acc"><button type="button" class="btn ghost" data-op="cerrar-ficha">Cancelar</button><button class="btn primary">Crear tarea</button></footer>
    </form>`;
    editor = montarEditor(box.querySelector('[data-op-editor]'), deBorrador('notas') || '', { placeholder: 'Pasos, enlaces, listas, vídeos… (@ para enlazar otra tarea o un tablero)', enlaces: buscarEnlaces });
    const campos = deBorrador('campos');
    const form = box.querySelector('form');
    if (campos) for (const [n, v] of Object.entries(campos)) if (form.elements[n] && v && [...(form.elements[n].options || [{ value: v }])].some((o) => o.value === v)) form.elements[n].value = v;
    if (!campos) box.querySelector('input[name=titulo]').focus();
    return;
  }
  const t = buscarT(abierta);
  if (!t) { abierta = null; pintar(); return; }
  const e = estadoOp(t);
  const deAgencia = t.code === CODIGO_AGENCIA; // creada en la Operativa (se puede editar y borrar aquí)
  const tabsT = tabsDe(t.cliente);
  const tabT = tabDeT(t);
  const colT = columnaDeTarea(t, tabT);
  box.innerHTML = `<header class="op-ficha-h"><span class="op-fila-meta">${chipProyecto(t)}</span><button type="button" class="btn ghost small" data-op="cerrar-ficha" aria-label="Cerrar">✕</button></header>
    ${editandoTitulo ? `<form class="op-titulo-ed" data-op-form="titulo"><input name="titulo" maxlength="200" value="${esc(t.titulo)}" aria-label="Nombre de la tarea" required><button class="btn primary small">Guardar</button><button type="button" class="btn ghost small" data-op="titulo-cancelar">Cancelar</button></form>`
    : `<h3 class="op-ficha-t">${esc(t.titulo)}<button type="button" class="op-titulo-b" data-op="titulo-editar" title="Cambiar el nombre" aria-label="Cambiar el nombre de la tarea">✏️</button></h3>`}
    <div class="pr-campos">
      <div class="pr-campo"><span class="pr-campo-l">Columna</span><div class="pr-campo-v"><div class="op-estados">${tabT.columnas.map((c) => `<button type="button" class="op-est ${c.hecha ? 'e-hecha' : c.id === 'revision' ? 'e-revision' : 'e-pendiente'}${c.id === colT ? ' on' : ''}" data-op-col-set="${esc(c.id)}">${c.hecha && !c.nombre.startsWith('✅') ? '✅ ' : ''}${esc(c.nombre)}</button>`).join('')}</div>${posicionHtml(t)}</div></div>
      ${gestiona(t.cliente) && tabsT.length > 1 ? `<div class="pr-campo"><span class="pr-campo-l">Tablero</span><div class="pr-campo-v"><select data-op-campo="tablero">${tabsT.map((b) => `<option value="${esc(b.id)}"${b.id === tabT.id ? ' selected' : ''}>${esc(b.nombre)}</option>`).join('')}</select></div></div>` : ''}
      <div class="pr-campo"><span class="pr-campo-l">Prioridad</span><div class="pr-campo-v"><div class="op-prios">${[{ id: '', label: 'Sin prioridad' }, ...PRIORIDADES].map((pp) => `<button type="button" class="op-prio-b${pp.id ? ` p-${pp.id}` : ''}${(t.prioridad || '') === pp.id ? ' on' : ''}" data-op-prio="${pp.id}">${pp.id === 'alta' ? '🔥 ' : pp.id ? '⚑ ' : ''}${esc(pp.label)}</button>`).join('')}</div></div></div>
      <div class="pr-campo"><span class="pr-campo-l">Etiquetas</span><div class="pr-campo-v op-etqs-v">${etiquetasDeTarea(t, d.etiquetas).map((x) => pildoraEtq(x, ` data-op-etq-toggle="${esc(x.id)}" role="button" tabindex="0" title="Quitar"`)).join('')}<button type="button" class="op-etq-add" data-op="etq-abrir">${pickerEtq ? 'Cerrar' : '＋ Etiqueta'}</button>
        ${pickerEtq ? selectorEtiquetas(t) : ''}</div></div>
      <div class="pr-campo"><span class="pr-campo-l">Se repite</span><div class="pr-campo-v op-rep-v">${editorRepetir(t.repetir)}${bloqueRepetir(t)}</div></div>
      ${e === 'hecha' ? '' : `<div class="pr-campo"><span class="pr-campo-l">Bloqueo</span><div class="pr-campo-v">${estaBloqueada(t) ? `<span class="op-bloq">⛔ ${esc(t.bloqueo)}</span><button type="button" class="btn ghost small" data-op="desbloquear">Desbloquear</button>` : '<button type="button" class="btn ghost small op-bloquear" data-op="bloquear">⛔ Marcar como bloqueada</button>'}</div></div>`}
      <div class="pr-campo"><span class="pr-campo-l">Fecha</span><div class="pr-campo-v"><input type="date" data-op-campo="fecha" value="${esc(t.fecha)}">${chipFecha(t, hoyMadrid())}</div></div>
      <div class="pr-campo"><span class="pr-campo-l">Calendario</span><div class="pr-campo-v op-cal-v"><button type="button" class="btn small primary op-cal-add" data-op-cal="${esc(clave(t))}">📅 Añadir a ${esc(nombreCal(d.miCalendario) || 'mi calendario')}</button><label class="op-cal-hora" title="Opcional: sin hora, va como evento de todo el día"><span>a las</span><input type="time" data-op-cal-hora step="900"></label><button type="button" class="op-cal-cambiar" data-op="cal-panel">${d.miCalendario ? 'Cambiar' : 'Conectar'}</button></div></div>
      <div class="pr-campo"><span class="pr-campo-l">Responsable</span><div class="pr-campo-v">${gestiona(t.cliente) ? `<select data-op-campo="uid">${opcionesResp(t.cliente, t.asignado?.tipo === 'persona' ? t.asignado.id : '')}${t.asignado?.tipo === 'rol' ? `<option selected>Rol ${esc(t.asignado.rol)}</option>` : ''}</select>` : `${avatar(t)} ${esc(quienTxt(t))}`}</div></div>
      ${t.embudo && !deAgencia ? `<div class="pr-campo"><span class="pr-campo-l">Embudo</span><div class="pr-campo-v">${esc(t.embudo)}</div></div>` : ''}
    </div>
    <section class="pr-bloque op-desc"><header class="pr-bloque-h"><h4>Descripción</h4>${editandoDesc ? '' : `<button type="button" class="btn ghost small" data-op="editar-desc">✏️ ${t.notas ? 'Editar' : 'Añadir'}</button>`}</header>
      ${editandoDesc ? '<div class="op-editor" data-op-editor></div><footer class="op-form-acc"><button type="button" class="btn ghost small" data-op="cancelar-desc">Cancelar</button><button type="button" class="btn primary small" data-op="guardar-desc">Guardar</button></footer>'
        : t.notas ? `<div class="rich op-notas op-notas-caja" data-op="editar-desc" title="Pulsa para editar">${richToHtml(t.notas)}</div>` : '<button type="button" class="op-desc-vacia" data-op="editar-desc"><span class="op-desc-vacia-t">✍️ Escribe aquí la descripción…</span><span class="op-desc-vacia-s">Pasos, 🔗 enlaces, listas, negritas o un vídeo. Escribe @ para enlazar otra tarea o un tablero.</span></button>'}
    </section>
    ${bloqueChecklist(t)}
    <section class="pr-bloque"><h4>Comentarios ${t.comentarios?.length ? `<span class="muted">${t.comentarios.length}</span>` : ''}</h4>
      <ol class="pr-hilo">${(t.comentarios || []).map((c) => `<li class="pr-com"><span class="pr-av">${esc(iniciales(c.nombre))}</span><div class="pr-com-c"><header><strong>${esc(c.nombre)}</strong><span class="muted small">${esc(cuando(c.en))}</span>${gestiona(t.cliente) || c.uid === d.yo ? `<button type="button" class="pr-x" data-op-com-borrar="${esc(c.id)}" aria-label="Borrar comentario">✕</button>` : ''}</header><div class="pr-com-t">${enlacesEnTexto(esc(c.texto).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`)).replace(/\n/g, '<br>')}</div></div></li>`).join('') || '<li class="muted small">Sin comentarios.</li>'}</ol>
      <form class="pr-comentar" data-op-form="comentar"><textarea name="texto" rows="2" maxlength="2000" placeholder="Escribe un comentario… (@ para enlazar otra tarea o un tablero)"></textarea><button class="btn primary small">Comentar</button></form>
    </section>
    ${''}${deAgencia ? '<p class="op-ficha-pie"><button type="button" class="btn ghost small danger" data-op="borrar">🗑️ Borrar tarea</button></p>' : '<p class="muted small op-ficha-pie">Esta tarea vive en el proyecto del cliente: lo que cambies aquí se guarda allí.</p>'}`;
  const com = deBorrador('comentario');
  if (com) box.querySelector('.pr-comentar textarea').value = com;
  if (editandoDesc) editor = montarEditor(box.querySelector('[data-op-editor]'), deBorrador('notas') ?? t.notas, { placeholder: 'Pasos, enlaces, listas, vídeos… (@ para enlazar otra tarea o un tablero)', enlaces: buscarEnlaces });
  else montarVideos(box.querySelector('.op-notas'));
  activarArroba(box.querySelector('.pr-comentar textarea'), buscarEnlaces);
}

// ---- Enlaces con «@» ----
// Lo que se puede enlazar: las personas (las que pueden estar en esa tarea), las tareas que ves (de todos los
// proyectos) y los tableros de cada proyecto.
function buscarEnlaces(q) {
  const tAbierta = abierta && buscarT(abierta);
  const cid = tAbierta ? tAbierta.cliente : creando ? proyectoDef() : '';
  const personas = (cid ? equipoDe(cid) : d.equipo).map((u) => ({ ref: refPersona(u.id), titulo: u.nombre, sub: u.agencia ? 'Agencia' : 'Del proyecto', icono: '👤' }));
  const tableros = d.proyectos.flatMap((p) => tabsDe(p.id).map((b) => ({ ref: refTablero(p.id, b.id), titulo: b.nombre, sub: `Tablero · ${p.nombre}`, icono: '🗂️' })));
  const tareas = d.tareas.filter((t) => clave(t) !== abierta).map((t) => ({ ref: refTarea(t.cliente, t.code, t.id), titulo: t.titulo, sub: [t.clienteNombre, t.embudo].filter(Boolean).join(' · '), icono: estadoOp(t) === 'hecha' ? '✅' : '📝' }));
  return filtrarEnlaces([...personas, ...tareas, ...tableros], q);
}
// Ir a lo enlazado: la ficha de la tarea o el tablero (con su cliente elegido).
function irA(r) {
  if (!r) return;
  if (r.tipo === 'tablero') {
    if (!d.proyectos.some((p) => p.id === r.proyecto)) { aviso('No tienes acceso a ese tablero'); return; }
    fProy = r.proyecto; fEmb = ''; fTab = tabsDe(r.proyecto).some((b) => b.id === r.id) ? r.id : tabInicial(r.proyecto);
    vista = 'tablero'; abierta = null; creando = false; editTab = null; importando = null;
    pintar();
    return;
  }
  const k = `${r.cliente}|${r.code}|${r.id}`;
  if (!buscarT(k)) { aviso('Esa tarea ya no existe o no la tienes asignada'); return; }
  abierta = k; creando = false; editandoDesc = false; editandoTitulo = false; pickerEtq = false;
  pintar();
}

// ---- Cambios ----
async function op(t, cuerpo) {
  const r = await ctx.api('/api/operativa', { method: 'POST', body: { cliente: t.cliente, code: t.code, id: t.id, ...cuerpo } });
  if (cuerpo.op === 'borrar') { d.tareas = d.tareas.filter((x) => x !== t); return; }
  const n = r.tarea;
  if (r.nueva && !d.tareas.some((x) => x.id === r.nueva.id)) {
    d.tareas.push({ ...r.nueva, clienteNombre: t.clienteNombre, color: t.color, embudo: t.embudo, embudoId: t.embudoId, embudoNombre: t.embudoNombre, embudoTipo: t.embudoTipo });
    recienCreada = r.nueva.id; setTimeout(() => { if (recienCreada === r.nueva.id) recienCreada = ''; }, 3000);
    aviso(`🔁 Se ha creado la siguiente «${t.titulo}» para el ${fechaCorta(r.nueva.fecha)}`);
  }
  Object.assign(t, { etiquetas: n.etiquetas || [], prioridad: n.prioridad || '', checklist: n.checklist || [], repetir: n.repetir?.tipo ? n.repetir : null, opTablero: n.opTablero || '', opColumna: n.opColumna || '', opOrden: n.opOrden, titulo: n.titulo, notas: n.notas || '', fecha: n.fecha || '', estado: estadoOp(n), hecha: Boolean(n.hecha), hechaEn: n.hechaEn || '', bloqueo: n.bloqueo || '', asignado: n.asignado || null, comentarios: (n.comentarios || []).map((c) => ({ id: c.id, uid: c.uid || '', nombre: c.nombre, texto: c.texto, en: c.en })) });
}

// Aviso flotante (abajo) que se va solo.
function aviso(texto) {
  const el = document.createElement('div');
  el.className = 'op-toast';
  el.textContent = texto;
  ctx.dialog.appendChild(el);
  setTimeout(() => el.classList.add('fuera'), 3200);
  setTimeout(() => el.remove(), 3800);
}

async function moverColumna(t, columna, tablero) {
  const era = estadoOp(t) === 'hecha';
  try { await op(t, { op: 'columna', columna, ...(tablero ? { tablero } : {}) }); } catch (err) { window.alert(err.message); }
  if (!era && estadoOp(t) === 'hecha') { llegaAHecho(t); return; }
  pintarVista();
  if (abierta) pintarFicha();
}
// La tarea recién completada aparece en «Hecho» con su animación (y se ve aunque la columna sea larga).
function llegaAHecho(t) {
  recienHecha = t.id;
  pintarVista();
  if (abierta) pintarFicha();
  body().querySelector('.op-card.llega')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  setTimeout(() => { if (recienHecha === t.id) recienHecha = ''; }, 1600);
}

async function cambiarFecha(t, fecha) {
  try { await op(t, { op: 'fecha', fecha }); } catch (err) { window.alert(err.message); }
  pintarVista();
  if (abierta) pintarFicha();
}

async function cambiarEstado(t, estado) {
  const era = estadoOp(t) === 'hecha';
  try { await op(t, { op: 'estado', estado }); } catch (err) { window.alert(err.message); }
  if (!era && estadoOp(t) === 'hecha' && vista === 'tablero') { llegaAHecho(t); return; }
  pintarVista();
  if (abierta) pintarFicha();
}

// Marca de bloqueada (con su motivo) sin moverla de columna; sin motivo, la desbloquea.
async function ponerBloqueo(t, bloquear) {
  let motivo = '';
  if (bloquear) {
    motivo = (window.prompt('¿Por qué está bloqueada? (p. ej. «esperando al cliente», «falta el vídeo»)', t.bloqueo || '') || '').trim();
    if (!motivo) return;
  }
  try { await op(t, { op: 'bloqueo', motivo }); } catch (err) { window.alert(err.message); }
  pintarVista();
  if (abierta) pintarFicha();
}

// En la ficha: subir o bajar la tarea dentro de su columna (también sirve en el móvil, donde no se arrastra).
function posicionHtml(t) {
  const h = hermanas(t);
  const i = h.indexOf(t);
  if (i === -1 || h.length < 2) return '';
  return `<div class="op-pos" role="group" aria-label="Posición en la columna"><button type="button" class="op-pos-b" data-op-pos="arriba" ${i === 0 ? 'disabled' : ''} title="Arriba del todo">⤒</button><button type="button" class="op-pos-b" data-op-pos="-1" ${i === 0 ? 'disabled' : ''} title="Subir una">↑</button><span class="op-pos-n">${i + 1} de ${h.length}</span><button type="button" class="op-pos-b" data-op-pos="1" ${i === h.length - 1 ? 'disabled' : ''} title="Bajar una">↓</button><button type="button" class="op-pos-b" data-op-pos="abajo" ${i === h.length - 1 ? 'disabled' : ''} title="Abajo del todo">⤓</button></div>`;
}

// Menú rápido del responsable (pulsando el avatar de la tarjeta, sin abrir la tarea).
const cerrarMenuResp = () => ctx.dialog.querySelectorAll('.op-resp-menu').forEach((m) => m.remove());
function abrirMenuResp(b, t) {
  cerrarMenuResp();
  const actual = t.asignado?.tipo === 'persona' ? t.asignado.id : '';
  const lista = equipoDe(t.cliente);
  const fila = (u) => `<button type="button" role="menuitem" class="${u.id === actual ? 'on' : ''}" data-op-resp-uid="${esc(u.id)}"><span class="pr-av">${esc(iniciales(u.nombre))}</span>${esc(u.nombre)}</button>`;
  const ag = lista.filter((u) => u.agencia);
  const pr = lista.filter((u) => !u.agencia);
  const m = document.createElement('div');
  m.className = 'op-resp-menu';
  m.setAttribute('role', 'menu');
  m.dataset.k = clave(t);
  m.innerHTML = `<div class="op-resp-h">Responsable</div>${pr.length && ag.length ? `<div class="op-resp-g">Agencia</div>${ag.map(fila).join('')}<div class="op-resp-g">Del proyecto</div>${pr.map(fila).join('')}` : lista.map(fila).join('')}
    <button type="button" role="menuitem" class="op-resp-sin${actual ? '' : ' on'}" data-op-resp-uid=""><span class="pr-av vacio">?</span>Sin asignar</button>`;
  colocarMenu(m, b, 'derecha');
  m.querySelector('.on, button')?.focus();
}
// Pone un menú flotante junto al botón que lo abre (debajo; si no cabe, encima).
function colocarMenu(m, b, lado = 'izquierda') {
  ctx.dialog.appendChild(m);
  const r = b.getBoundingClientRect();
  const alto = m.offsetHeight;
  const ancho = m.offsetWidth;
  const x = lado === 'derecha' ? r.right - ancho : r.left;
  m.style.left = `${Math.max(8, Math.min(window.innerWidth - ancho - 8, x))}px`;
  m.style.top = `${r.bottom + 6 + alto > window.innerHeight ? Math.max(8, r.top - alto - 6) : r.bottom + 6}px`;
}
// Menú rápido de la fecha límite (pulsando la fecha de la tarjeta): atajos y un calendario.
const masDias = (f, n) => { const x = new Date(`${f}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
function abrirMenuFecha(b, t) {
  cerrarMenuResp();
  const hoy = hoyMadrid();
  const dow = new Date(`${hoy}T12:00:00Z`).getUTCDay(); // 0 domingo
  const atajos = [['Hoy', hoy], ['Mañana', masDias(hoy, 1)], ['Este viernes', masDias(hoy, (5 - dow + 7) % 7 || 7)], ['Próximo lunes', masDias(hoy, (8 - dow) % 7 || 7)], ['En una semana', masDias(hoy, 7)]];
  const m = document.createElement('div');
  m.className = 'op-resp-menu op-fecha-menu';
  m.setAttribute('role', 'menu');
  m.dataset.k = clave(t);
  m.innerHTML = `<div class="op-resp-h">Fecha límite</div>${atajos.map(([l, f]) => `<button type="button" role="menuitem" class="${f === t.fecha ? 'on' : ''}" data-op-fecha-set="${f}"><span>${l}</span><small>${esc(fechaCorta(f))}</small></button>`).join('')}
    <label class="op-fecha-otra"><span>Otra fecha</span><input type="date" data-op-fecha-input value="${esc(t.fecha || '')}"></label>
    ${t.fecha ? '<button type="button" role="menuitem" class="op-resp-sin" data-op-fecha-set="">✕ Quitar la fecha</button>' : ''}`;
  colocarMenu(m, b);
  m.querySelector('.on, button')?.focus();
}

// ---- «Añadir a mi calendario» ----
const nombreCal = (id) => CALENDARIOS.find((c) => c.id === id)?.nombre || '';
// Añade la tarea al calendario elegido: Google y Outlook abren el evento ya relleno; Apple/otro descarga un .ics.
function anadirACalendario(t, tipo, hora = '') {
  const hoy = hoyMadrid();
  const ev = eventoDeTarea({ ...t, notasTexto: richToText(t.notas || '') }, { hora, hoy, url: `${location.origin}/#operativa` });
  if (tipo === 'apple') {
    const blob = new Blob([icsDeEvento(ev, `op-${t.cliente}-${t.id}@lanzamientos`)], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${String(t.titulo).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'tarea'}.ics`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } else window.open(enlaceCalendario(tipo, ev), '_blank', 'noopener');
  aviso(t.fecha ? `📅 «${t.titulo}» → ${nombreCal(tipo)}${tipo === 'apple' ? ': abre el archivo descargado' : ': pulsa «Guardar» en la pestaña nueva'}` : '📅 La tarea no tiene fecha: la he puesto para hoy');
}
// Sin calendario elegido: un menú para elegirlo (se recuerda) y se añade.
function abrirMenuCal(b, t) {
  cerrarMenuResp();
  const m = document.createElement('div');
  m.className = 'op-resp-menu op-cal-menu';
  m.setAttribute('role', 'menu');
  m.dataset.k = clave(t);
  m.innerHTML = `<div class="op-resp-h">¿Qué calendario usas?</div>${CALENDARIOS.map((c) => `<button type="button" role="menuitem" data-op-cal-elegir="${c.id}"><span class="op-cal-ico">${c.ico}</span>${esc(c.nombre)}</button>`).join('')}<p class="op-cal-nota">Lo recordamos para la próxima vez (cámbialo en «📅 Mi calendario»).</p>`;
  colocarMenu(m, b, 'derecha');
  m.querySelector('button')?.focus();
}
async function guardarMiCalendario(tipo) {
  const r = await ctx.api('/api/operativa', { method: 'POST', body: { op: 'mi-calendario', calendario: tipo } });
  d.miCalendario = r.miCalendario;
}
// Panel «📅 Mi calendario»: elegir el calendario y la sincronización automática (suscripción).
const AYUDA_SUSCRIBIR = {
  google: { pasos: ['Copia tu enlace (botón de arriba).', 'Abre Google Calendar en el ordenador → «Otros calendarios» ＋ → «Desde URL».', 'Pega el enlace y pulsa «Añadir calendario».'], abrir: 'https://calendar.google.com/calendar/r/settings/addbyurl', abrirTxt: 'Abrir Google Calendar' },
  outlook: { pasos: ['Copia tu enlace (botón de arriba).', 'En Outlook (web) → «Añadir calendario» → «Suscribirse desde la web».', 'Pega el enlace, ponle nombre y pulsa «Importar».'], abrir: 'https://outlook.office.com/calendar/addcalendar', abrirTxt: 'Abrir Outlook' },
  apple: { pasos: ['Pulsa «Abrir en mi calendario» (en el iPhone o el Mac).', 'Confirma «Suscribirse».', 'Si no se abre: Calendario → Archivo → Nueva suscripción y pega el enlace.'], abrir: 'webcal', abrirTxt: 'Abrir en mi calendario' },
};
function panelCalendario() {
  const elegido = d.miCalendario;
  const ay = AYUDA_SUSCRIBIR[elegido];
  return `<header class="op-ficha-h"><h3>📅 Mi calendario</h3><button type="button" class="btn ghost small" data-op="cal-cerrar" aria-label="Cerrar">✕</button></header>
    <section class="op-cal-sec"><h4><span class="op-cal-n">1</span>¿Qué calendario usas?</h4>
      <div class="op-cal-opc">${CALENDARIOS.map((c) => `<button type="button" class="op-cal-opcion${c.id === elegido ? ' on' : ''}" data-op-cal-tipo="${c.id}"><span class="op-cal-ico">${c.ico}</span><b>${esc(c.nombre)}</b>${c.id === elegido ? '<small>✓ Conectado</small>' : ''}</button>`).join('')}</div>
      <p class="muted small">Con él, cada tarea tiene su botón «📅 Añadir a…»: se abre el evento ya relleno y solo hay que guardarlo.</p>
      ${d.yo ? '' : '<p class="op-cal-aviso">Has entrado con la contraseña general: este calendario lo comparten todas las personas que entran con ella. Para tener el tuyo, entra con tu usuario.</p>'}</section>
    <section class="op-cal-sec"><h4><span class="op-cal-n">2</span>Que tus tareas aparezcan solas <small>(opcional, recomendado)</small></h4>
      <p class="muted small">Todas las tareas con fecha que tienes asignadas, de todos los proyectos, en tu calendario. Se actualiza sola cada pocas horas. El enlace es personal: no lo compartas.</p>
      ${calPanel?.url ? `<div class="op-cal-enlace"><input readonly value="${esc(calPanel.url)}" aria-label="Tu enlace de calendario"><button type="button" class="btn small" data-op="cal-copiar">📋 Copiar</button></div>
        ${ay ? `<ol class="op-cal-pasos">${ay.pasos.map((x) => `<li>${esc(x)}</li>`).join('')}</ol><a class="btn small" href="${esc(ay.abrir === 'webcal' ? calPanel.webcal : ay.abrir)}" target="_blank" rel="noopener">${esc(ay.abrirTxt)}</a>` : '<p class="muted small">Elige arriba tu calendario y te digo dónde pegarlo.</p>'}`
      : d.yo ? '<button type="button" class="btn primary small" data-op="cal-enlace">🔗 Crear mi enlace</button>' : '<p class="op-cal-aviso">Para esto hay que entrar con tu usuario (no con la contraseña general): el enlace lleva solo tus tareas.</p>'}
    </section>`;
}

async function onClick(e) {
  const ce = e.target.closest('[data-op-cal-elegir]');
  if (ce) {
    const t = buscarT(ce.closest('.op-resp-menu').dataset.k);
    cerrarMenuResp();
    if (t) anadirACalendario(t, ce.dataset.opCalElegir, body().querySelector('[data-op-cal-hora]')?.value || '');
    try { await guardarMiCalendario(ce.dataset.opCalElegir); } catch { /* se pregunta otra vez la próxima */ }
    pintar();
    return;
  }
  const calB = e.target.closest('[data-op-cal]');
  if (calB) {
    e.stopPropagation();
    const t = buscarT(calB.dataset.opCal);
    if (!t) return;
    if (d.miCalendario) anadirACalendario(t, d.miCalendario, calB.closest('.op-cal-v')?.querySelector('[data-op-cal-hora]')?.value || '');
    else abrirMenuCal(calB, t);
    return;
  }
  const ct = e.target.closest('[data-op-cal-tipo]');
  if (ct) {
    try { await guardarMiCalendario(ct.dataset.opCalTipo); aviso(`✓ Calendario conectado: ${nombreCal(d.miCalendario)}`); } catch (err) { window.alert(err.message); }
    pintar();
    return;
  }
  const ru = e.target.closest('[data-op-resp-uid]');
  if (ru) {
    const m = ru.closest('.op-resp-menu');
    const t = buscarT(m.dataset.k);
    cerrarMenuResp();
    if (!t || ru.dataset.opRespUid === (t.asignado?.tipo === 'persona' ? t.asignado.id : '')) return;
    try {
      await op(t, { op: 'asignar', uid: ru.dataset.opRespUid });
      aviso(ru.dataset.opRespUid ? `👤 ${nombreDe(ru.dataset.opRespUid)} es ahora responsable de «${t.titulo}»` : `«${t.titulo}» queda sin asignar`);
    } catch (err) { window.alert(err.message); }
    pintar();
    return;
  }
  const fs = e.target.closest('[data-op-fecha-set]');
  if (fs) {
    const t = buscarT(fs.closest('.op-resp-menu').dataset.k);
    cerrarMenuResp();
    if (t && fs.dataset.opFechaSet !== (t.fecha || '')) cambiarFecha(t, fs.dataset.opFechaSet);
    return;
  }
  const fb = e.target.closest('[data-op-fecha-k]');
  if (fb) { e.stopPropagation(); const t = buscarT(fb.dataset.opFechaK); if (t) abrirMenuFecha(fb, t); return; }
  if (e.target.closest('.op-fecha-menu')) return; // dentro del menú de la fecha (el calendario) no se cierra
  const rb = e.target.closest('[data-op-resp]');
  if (rb) { e.stopPropagation(); const t = buscarT(rb.dataset.opResp); if (t) abrirMenuResp(rb, t); return; }
  if (!e.target.closest('.op-resp-menu')) cerrarMenuResp();
  const ei = e.target.closest('a.enlace-int');
  if (ei && !ei.closest('[contenteditable="true"]')) { e.preventDefault(); const r = leerRef(ei.getAttribute('href')); if (r?.tipo !== 'persona') irA(r); return; }
  const v = e.target.closest('[data-op-vista]');
  if (v) { vista = v.dataset.opVista; pintar(); return; }
  const rg = e.target.closest('[data-op-rango]');
  if (rg) { fRango = rg.dataset.opRango; try { localStorage.setItem(LS_RANGO, fRango); } catch { /* sin almacenamiento */ } pintarVista(); return; }
  const fe = e.target.closest('[data-op-fetq]');
  if (fe) { fEtq = fe.dataset.opFetq; pintar(); return; }
  const ds = e.target.closest('[data-rep-dsem]');
  if (ds) { pulsarDsem(ds); guardarRepetir(ds.closest('[data-rep-ed]')); return; }
  const al = e.target.closest('[data-op="rep-alinear"]');
  if (al) { const t = buscarT(abierta); try { await op(t, { op: 'fecha', fecha: al.dataset.fecha }); } catch (err) { window.alert(err.message); } pintarVista(); pintarFicha(); return; }
  const pr = e.target.closest('[data-op-prio]');
  if (pr) { const t = buscarT(abierta); if (t) { try { await op(t, { op: 'prioridad', prioridad: pr.dataset.opPrio }); } catch (err) { window.alert(err.message); } pintarVista(); pintarFicha(); } return; }
  const sw = e.target.closest('[data-op-color]');
  if (sw) { colorNueva = sw.dataset.opColor; body().querySelectorAll('.op-sw').forEach((x) => x.classList.toggle('on', x === sw)); return; }
  const eb = e.target.closest('[data-op-etq-borrar]');
  if (eb) {
    const et = d.etiquetas.find((x) => x.id === eb.dataset.opEtqBorrar);
    if (!et || !window.confirm(`¿Borrar la etiqueta «${et.nombre}»? Se quitará de todas las tareas.`)) return;
    try { const rr = await ctx.api('/api/operativa', { method: 'POST', body: { op: 'etiqueta-borrar', id: et.id } }); d.etiquetas = rr.etiquetas; } catch (err) { window.alert(err.message); }
    pintarVista(); pintarFicha(); return;
  }
  const et = e.target.closest('[data-op-etq-toggle]');
  if (et && abierta) {
    const t = buscarT(abierta);
    const id = et.dataset.opEtqToggle;
    const lista = (t.etiquetas || []).includes(id) ? t.etiquetas.filter((x) => x !== id) : [...(t.etiquetas || []), id];
    try { await op(t, { op: 'etiquetas', etiquetas: lista }); } catch (err) { window.alert(err.message); }
    pintarVista(); pintarFicha(); return;
  }
  const ckb = e.target.closest('[data-op-ck-borrar]');
  if (ckb) { const t = buscarT(abierta); try { await op(t, { op: 'checklist', checklist: (t.checklist || []).filter((c) => c.id !== ckb.dataset.opCkBorrar) }); } catch (err) { window.alert(err.message); } pintarVista(); pintarFicha(); return; }
  const tb = e.target.closest('[data-op-tab]');
  if (tb) { fTab = tb.dataset.opTab; editTab = null; importando = null; pintarVista(); return; }
  const ps = e.target.closest('[data-op-pos]');
  if (ps) {
    const t = buscarT(abierta);
    if (!t) return;
    const i = hermanas(t).indexOf(t);
    const v = ps.dataset.opPos;
    colocar(t, v === 'arriba' ? 0 : v === 'abajo' ? Infinity : i + Number(v));
    return;
  }
  const cs = e.target.closest('[data-op-col-set]');
  if (cs) { const t = buscarT(abierta); if (t && cs.dataset.opColSet !== columnaDeTarea(t, tabDeT(t))) moverColumna(t, cs.dataset.opColSet, tabDeT(t).id); return; }
  const cal = e.target.closest('[data-op-cal]');
  if (cal) { calMes = cal.dataset.opCal === 'hoy' ? hoyMadrid().slice(0, 7) : mesMas(calMes, Number(cal.dataset.opCal)); pintarVista(); return; }
  const add = e.target.closest('[data-op-add]');
  if (add) {
    if (!fProy) { creando = true; abierta = null; creandoCol = add.dataset.opAdd; pintar(); return; } // sin cliente elegido: la ficha pide el proyecto
    addCol = add.dataset.opAdd;
    pintarVista();
    body().querySelector('.op-add textarea')?.focus();
    return;
  }
  const hecha = e.target.closest('[data-op-hecha]');
  if (hecha) {
    const t = buscarT(hecha.dataset.opHecha);
    if (!t) return;
    const completar = estadoOp(t) !== 'hecha';
    hecha.classList.toggle('on', completar); // se ve al instante; al guardar, la tarjeta pasa a su columna
    hecha.classList.add('hecho-anim');
    const card = hecha.closest('.op-card');
    if (completar && card && vista === 'tablero') {
      card.classList.add('completando');
      card.insertAdjacentHTML('beforeend', `<span class="op-burst" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<i style="--a:${i * 30}deg;--d:${50 + (i % 3) * 14}px"></i>`).join('')}</span>`);
      await Promise.all([new Promise((ok) => setTimeout(ok, 700)), op(t, { op: 'estado', estado: 'hecha' }).catch((err) => window.alert(err.message))]);
      llegaAHecho(t);
      return;
    }
    cambiarEstado(t, completar ? 'hecha' : 'pendiente');
    return;
  }
  const est = e.target.closest('[data-op-estado]');
  if (est) { const t = buscarT(abierta); if (t && est.dataset.opEstado !== estadoOp(t)) cambiarEstado(t, est.dataset.opEstado); return; }
  const ab = e.target.closest('[data-op-abrir]');
  if (ab && !e.target.closest('a')) { creando = false; editandoDesc = false; editandoTitulo = false; if (abierta !== ab.dataset.opAbrir) pickerEtq = false; abierta = ab.dataset.opAbrir; pintar(); return; }
  const vp = e.target.closest('[data-op-ver-proy]');
  if (vp) { fProy = vp.dataset.opVerProy; fEmb = ''; vista = 'tablero'; pintar(); return; }
  const vpe = e.target.closest('[data-op-ver-persona]');
  if (vpe) { fPersona = vpe.dataset.opVerPersona; vista = 'tablero'; pintar(); return; }
  const cb = e.target.closest('[data-op-com-borrar]');
  if (cb) {
    if (!window.confirm('¿Borrar este comentario?')) return;
    try { await op(buscarT(abierta), { op: 'borrar-comentario', cid: cb.dataset.opComBorrar }); } catch (err) { window.alert(err.message); }
    pintarFicha();
    return;
  }
  const b = e.target.closest('[data-op]');
  if (!b) return;
  if (b.dataset.op.startsWith('te-') || b.dataset.op.startsWith('tab-') || b.dataset.op.startsWith('imp-')) { await opEditor(b); return; }
  if (b.dataset.op === 'etq-abrir') { pickerEtq = !pickerEtq; pintarFicha(); body().querySelector('[data-op-etq-nombre]')?.focus(); return; }
  if (b.dataset.op === 'etq-crear') {
    const inp = body().querySelector('[data-op-etq-nombre]');
    const nombre = inp?.value.trim();
    if (!nombre) { inp?.focus(); return; }
    const t = buscarT(abierta);
    try {
      const rr = await ctx.api('/api/operativa', { method: 'POST', body: { op: 'etiqueta-crear', nombre, color: colorNueva } });
      d.etiquetas = rr.etiquetas;
      if (t && rr.nueva && !(t.etiquetas || []).includes(rr.nueva)) await op(t, { op: 'etiquetas', etiquetas: [...(t.etiquetas || []), rr.nueva] });
    } catch (err) { window.alert(err.message); }
    pintarVista(); pintarFicha(); return;
  }
  if (b.dataset.op === 'bloquear' || b.dataset.op === 'desbloquear') { const t = buscarT(abierta); if (t) ponerBloqueo(t, b.dataset.op === 'bloquear'); return; }
  if (b.dataset.op === 'add-cerrar') { addCol = ''; pintarVista(); return; }
  if (b.dataset.op === 'cal-panel') { calPanel = calPanel || {}; cerrarMenuResp(); pintar(); return; }
  if (b.dataset.op === 'cal-cerrar') { calPanel = null; pintar(); return; }
  if (b.dataset.op === 'cal-enlace') {
    b.disabled = true; b.textContent = 'Creando…';
    try { calPanel = await ctx.api('/api/cal?op=1'); } catch (err) { window.alert(err.message); }
    pintar();
    return;
  }
  if (b.dataset.op === 'cal-copiar') {
    try { await navigator.clipboard.writeText(calPanel.url); b.textContent = '✓ Copiado'; } catch { body().querySelector('.op-cal-enlace input')?.select(); }
    return;
  }
  if (b.dataset.op === 'proy-defecto') {
    const quitar = d.proyectoDefecto === fProy;
    try {
      const r = await ctx.api('/api/operativa', { method: 'POST', body: { op: 'mi-proyecto-defecto', proyecto: quitar ? '' : fProy } });
      d.proyectoDefecto = r.proyectoDefecto;
      aviso(quitar ? 'Listo: la Operativa se abrirá con todos los clientes.' : `⭐ Listo: la Operativa se te abrirá siempre en «${d.proyectos.find((p) => p.id === fProy)?.nombre || fProy}».`);
    } catch (err) { window.alert(err.message); }
    pintar();
    return;
  }
  if (b.dataset.op === 'cerrar-ficha') {
    // Cerrar con la descripción a medias: se guarda sola (no se pierde lo escrito).
    const t = !creando && editandoDesc && abierta ? buscarT(abierta) : null;
    const notas = t && editor?.area?.isConnected ? editor.leer() : null;
    if (t && notas != null && notas !== (t.notas || '')) {
      try { await op(t, { op: 'descripcion', notas }); aviso('✓ Descripción guardada'); } catch (err) { window.alert(`No se pudo guardar la descripción: ${err.message}`); return; }
    }
    borrador = null; editor = null; abierta = null; creando = false; editandoDesc = false; editandoTitulo = false; pickerEtq = false; pintar(); return; }
  if (b.dataset.op === 'titulo-editar') { editandoTitulo = true; pintarFicha(); const i = body().querySelector('.op-titulo-ed input'); i?.focus(); i?.select(); return; }
  if (b.dataset.op === 'titulo-cancelar') { editandoTitulo = false; pintarFicha(); return; }
  if (b.dataset.op === 'editar-desc' && e.target.closest('a')) return; // un enlace de la descripción se abre, no edita
  if (b.dataset.op === 'editar-desc') { editandoDesc = true; pintarFicha(); editor?.area.focus(); return; }
  if (b.dataset.op === 'cancelar-desc') { editandoDesc = false; borrador = null; pintarFicha(); return; }
  if (b.dataset.op === 'guardar-desc') {
    b.disabled = true;
    try { await op(buscarT(abierta), { op: 'descripcion', notas: editor.leer() }); editandoDesc = false; borrador = null; } catch (err) { window.alert(err.message); b.disabled = false; return; }
    pintarFicha();
    pintarVista();
    return;
  }
  if (b.dataset.op === 'borrar') {
    if (!window.confirm('¿Borrar esta tarea de la agencia?')) return;
    try { await op(buscarT(abierta), { op: 'borrar' }); abierta = null; pintar(); } catch (err) { window.alert(err.message); }
  }
}

// Acciones del editor de tableros (superadmin).
async function opEditor(b) {
  const a = b.dataset.op;
  if (a === 'tab-importar') { ctx.dialog.querySelector('#op-importar')?.click(); return; }
  if (a === 'imp-cancelar') { importando = null; pintarVista(); return; }
  if (a === 'imp-crear' && importando) {
    const nombre = (body().querySelector('[data-imp="nombre"]')?.value || '').trim();
    const proyecto = body().querySelector('[data-imp="proyecto"]')?.value || '';
    if (!proyecto) { window.alert('Elige el cliente al que va el tablero.'); return; }
    if (!nombre) { window.alert('Ponle un nombre al tablero.'); return; }
    if (tabsDe(proyecto).some((x) => x.nombre.toLowerCase() === nombre.toLowerCase()) && !window.confirm(`Ya hay un tablero «${nombre}» en este cliente. ¿Crear otro con el mismo nombre?`)) return;
    b.disabled = true;
    b.textContent = 'Importando…';
    try {
      const n = normalizarImportacion(importando.archivo, { incluirCompletadas: importando.completadas });
      const r = await guardarTableros({ op: 'importar-tablero', proyecto, nombre, archivo: n });
      importando = null;
      fProy = proyecto;
      fEmb = '';
      fTab = r.tablero.id;
      await cargar();
      aviso(`✓ Tablero «${nombre}» creado con ${r.tareas} tareas${r.sinAsignar.length ? `. Sin responsable (no están en el equipo): ${r.sinAsignar.join(', ')}` : ''}`);
    } catch (err) { window.alert(err.message); b.disabled = false; b.textContent = 'Crear el tablero'; }
    return;
  }
  if (a === 'tab-nuevo') { editTab = { nuevo: true, proyecto: fProy, nombre: '', plantilla: '', columnas: COLUMNAS_SERIE.map((c) => ({ ...c })) }; pintarVista(); body().querySelector('[data-te="nombre"]')?.focus(); return; }
  if (a === 'tab-defecto') {
    const quitar = tabInicial(fProy) === fTab;
    try {
      await guardarTableros({ op: 'tablero-defecto', proyecto: fProy, tableroId: quitar ? '' : fTab });
      aviso(quitar ? 'Listo: al entrar en el proyecto se abrirá el tablero General.' : '⭐ Listo: este tablero se abrirá siempre primero al entrar en el proyecto.');
    } catch (err) { window.alert(err.message); return; }
    pintarVista();
    return;
  }
  if (a === 'tab-editar') { const tab = tabsDe(fProy).find((x) => x.id === fTab) || tabsDe(fProy)[0]; editTab = { ...tab, columnas: tab.columnas.map((c) => ({ ...c })), proyecto: fProy }; pintarVista(); return; }
  if (!editTab) return;
  leerEditor();
  const li = b.closest('[data-ci]');
  const i = li ? Number(li.dataset.ci) : -1;
  const cols = editTab.columnas;
  if (a === 'te-cancelar') editTab = null;
  else if (a === 'te-add') cols.push({ id: '', nombre: '', hecha: false });
  else if (a === 'te-quitar') cols.splice(i, 1);
  else if (a === 'te-subir' && i > 0) [cols[i - 1], cols[i]] = [cols[i], cols[i - 1]];
  else if (a === 'te-bajar' && i < cols.length - 1) [cols[i + 1], cols[i]] = [cols[i], cols[i + 1]];
  else if (a === 'te-guardar') {
    const limpias = cols.filter((c) => c.nombre.trim());
    if (!limpias.length) { window.alert('Pon al menos una columna.'); return; }
    if (!editTab.nombre.trim()) { window.alert('Ponle un nombre al tablero.'); return; }
    if (!limpias.some((c) => c.hecha) && !window.confirm('Ninguna columna «cuenta como hecha»: se usará la última. ¿Seguir?')) return;
    const antes = new Set(tabsDe(editTab.proyecto).map((x) => x.id));
    try {
      await guardarTableros({ op: 'tablero-guardar', tablero: { id: editTab.nuevo ? undefined : editTab.id, proyecto: editTab.proyecto, nombre: editTab.nombre, columnas: limpias } });
      if (editTab.nuevo) fTab = tabsDe(editTab.proyecto).find((x) => !antes.has(x.id))?.id || fTab;
      editTab = null;
    } catch (err) { window.alert(err.message); return; }
  } else if (a === 'te-borrar') {
    if (!window.confirm(`¿Borrar el tablero «${editTab.nombre}»? Sus tareas no se borran: pasan al tablero General.`)) return;
    try { await guardarTableros({ op: 'tablero-borrar', proyecto: editTab.proyecto, tableroId: editTab.id }); fTab = tabInicial(editTab.proyecto); editTab = null; } catch (err) { window.alert(err.message); return; }
  } else if (a === 'te-plantilla') {
    const nombre = (window.prompt('Nombre de la plantilla (p. ej. «Producción de contenido»):', editTab.nombre || '') || '').trim();
    if (!nombre) return;
    try { await guardarTableros({ op: 'plantilla-guardar', plantilla: { nombre, columnas: cols.filter((c) => c.nombre.trim()) } }); window.alert(`Plantilla «${nombre}» guardada: la puedes elegir al crear un tablero en cualquier proyecto.`); } catch (err) { window.alert(err.message); return; }
  } else if (a === 'te-plantilla-borrar') {
    const p = d.plantillas.find((x) => x.id === editTab.plantilla);
    if (!p || !window.confirm(`¿Borrar la plantilla «${p.nombre}»? Los tableros creados con ella no cambian.`)) return;
    try { await guardarTableros({ op: 'plantilla-borrar', plantillaId: p.id }); editTab.plantilla = ''; } catch (err) { window.alert(err.message); return; }
  }
  pintarVista();
}

async function guardarRepetir(box) {
  const t = buscarT(abierta);
  if (!t || !box) return;
  try { await op(t, { op: 'repetir', repetir: leerRepetir(box, t.fecha) }); } catch (err) { window.alert(err.message); }
  pintarVista();
  pintarFicha();
}

async function onChange(e) {
  const t0 = e.target;
  if (t0.matches?.('[data-op-fecha-input]')) {
    const t = buscarT(t0.closest('.op-resp-menu')?.dataset.k);
    if (!t || !t0.value || t0.value === t.fecha) return;
    cerrarMenuResp();
    cambiarFecha(t, t0.value);
    return;
  }
  if (t0.id === 'op-importar' && t0.files?.[0]) {
    const f = t0.files[0];
    t0.value = '';
    try {
      const archivo = JSON.parse(await f.text());
      const imp = normalizarImportacion(archivo);
      importando = { archivo, imp, asana: Array.isArray(archivo?.data), nombre: imp.nombre || f.name.replace(/\.json$/i, '').slice(0, 40), completadas: false, proyecto: fProy };
      editTab = null;
      vista = 'tablero';
      pintar();
    } catch (err) { window.alert(`No se ha podido leer el archivo: ${err.message}`); }
    return;
  }
  if (t0.dataset.imp === 'proyecto' && importando) { importando.proyecto = t0.value; return; }
  if (t0.dataset.imp === 'completadas' && importando) { importando.nombre = body().querySelector('[data-imp="nombre"]')?.value || importando.nombre; importando.completadas = t0.checked; pintarVista(); return; }
  if (t0.dataset.rep) { guardarRepetir(t0.closest('[data-rep-ed]')); return; }
  if (t0.id === 'op-proyecto') { fProy = t0.value; fEmb = ''; fTab = tabInicial(fProy); editTab = null; importando = null; pintar(); return; }
  if (t0.dataset.te === 'plantilla' && editTab) {
    leerEditor();
    editTab.plantilla = t0.value;
    const p = d.plantillas.find((x) => x.id === t0.value);
    editTab.columnas = (p ? p.columnas : COLUMNAS_SERIE).map((c) => ({ ...c, id: COLUMNAS_SERIE.some((x) => x.id === c.id) ? c.id : '' }));
    pintarVista();
    return;
  }
  if (t0.name === 'proyecto' && t0.closest('[data-op-form="crear"]')) {
    const sel = t0.closest('form').querySelector('[name=tablero]');
    sel.innerHTML = tabsDe(t0.value).map((b) => `<option value="${esc(b.id)}">${esc(b.nombre)}</option>`).join('');
    return;
  }
  if (t0.id === 'op-embudo') { fEmb = t0.value; pintarVista(); return; }
  if (t0.id === 'op-persona') { fPersona = t0.value; pintarVista(); return; }
  if (t0.dataset.opCk) {
    const t = buscarT(abierta);
    const li = t0.closest('li');
    li?.classList.toggle('hecho', t0.checked);
    try { await op(t, { op: 'checklist', checklist: (t.checklist || []).map((x) => (x.id === t0.dataset.opCk ? { ...x, hecho: t0.checked } : x)) }); } catch (err) { window.alert(err.message); }
    pintarVista(); pintarFicha(); return;
  }
  const c = t0.dataset.opCampo;
  if (!c) return;
  const t = buscarT(abierta);
  try {
    if (c === 'fecha') await op(t, { op: 'fecha', fecha: t0.value });
    if (c === 'tablero') { const nt = tabsDe(t.cliente).find((b) => b.id === t0.value); await op(t, { op: 'columna', tablero: t0.value, columna: t.hecha && nt ? columnaHecha(nt).id : '' }); }
    if (c === 'uid') await op(t, { op: 'asignar', uid: t0.value });
  } catch (err) { window.alert(err.message); }
  pintarVista();
  pintarFicha();
}

async function onSubmit(e) {
  const f = e.target.closest('[data-op-form]');
  if (!f) return;
  e.preventDefault();
  const btn = f.querySelector('button.primary');
  btn?.setAttribute('disabled', '');
  try {
    if (f.dataset.opForm === 'titulo') {
      const t = buscarT(abierta);
      const titulo = f.titulo.value.trim();
      if (t && titulo && titulo !== t.titulo) await op(t, { op: 'titulo', titulo });
      editandoTitulo = false;
      pintarVista();
      pintarFicha();
      return;
    }
    if (f.dataset.opForm === 'ck') {
      const texto = f.texto.value.trim();
      if (!texto) { btn?.removeAttribute('disabled'); return; }
      const t = buscarT(abierta);
      await op(t, { op: 'checklist', checklist: [...(t.checklist || []), { texto, hecho: false }] });
      pintarVista(); pintarFicha();
      body().querySelector('[data-op-form="ck"] input')?.focus();
      return;
    }
    if (f.dataset.opForm === 'rapida') {
      const titulo = f.titulo.value.trim();
      if (!titulo) { btn?.removeAttribute('disabled'); return; }
      const tab = tabsDe(fProy).find((x) => x.id === fTab) || tabsDe(fProy)[0];
      const r = await ctx.api('/api/operativa', { method: 'POST', body: { op: 'crear', tarea: { titulo, proyecto: fProy, opTablero: tab.id } } });
      await cargar();
      const t = d.tareas.find((x) => x.id === r.tarea.id);
      if (t && columnaDeTarea(t, tab) !== f.dataset.col) await op(t, { op: 'columna', columna: f.dataset.col });
      recienCreada = r.tarea.id;
      setTimeout(() => { if (recienCreada === r.tarea.id) recienCreada = ''; }, 3000);
      pintarVista();
      body().querySelector('.op-add textarea')?.focus(); // para seguir añadiendo
      return;
    }
    if (f.dataset.opForm === 'comentar') {
      const texto = f.texto.value.trim();
      if (!texto) { btn?.removeAttribute('disabled'); return; }
      await op(buscarT(abierta), { op: 'comentar', texto });
      f.texto.value = '';
      borrador = null;
      pintarFicha();
      pintarVista();
    } else {
      const notas = editor ? editor.leer() : '';
      const proyecto = f.proyecto.value;
      const r = await ctx.api('/api/operativa', { method: 'POST', body: { op: 'crear', tarea: { titulo: f.titulo.value, fecha: f.fecha.value, notas, proyecto, opTablero: f.tablero.value, asignado: f.uid.value ? { tipo: 'persona', id: f.uid.value } : null } } });
      creando = false;
      borrador = null;
      editor = null;
      await cargar();
      abierta = `${proyecto}|${CODIGO_AGENCIA}|${r.tarea.id}`;
      // Abierta desde una columna de la vista por estado: a esa columna.
      const nueva = buscarT(abierta);
      if (nueva && creandoCol && creandoCol !== 'pendiente') await op(nueva, { op: 'estado', estado: creandoCol }).catch(() => {});
      creandoCol = '';
      pintar();
    }
  } catch (err) { window.alert(err.message); btn?.removeAttribute('disabled'); }
}
