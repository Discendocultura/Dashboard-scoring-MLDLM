// Panel «🗂️ Operativa» (Inicio de la agencia y Cuenta; solo el equipo de la agencia): todas las tareas de todos
// los proyectos. Vistas: 🗂️ Tablero (por estado, arrastrando; la de entrada), 🗓️ Calendario (por fecha, arrastrando
// a otro día), ☀️ Mi día (lo mío por cuándo toca), 📁 Por proyecto (semáforo de cada cliente) y 👥 Por persona (solo
// superadmin). Filtros: cliente → embudo (lanzamientos, VSL…), persona y búsqueda. Cada tarea se cambia aquí mismo (estado, fecha,
// responsable, comentarios) y se guarda en su proyecto. Cada persona ve solo lo que tiene asignado.
//   abrirOperativa({ api, dialog })
import { ESTADOS_OP, estadoOp, estaBloqueada, embudosDe, ICONO_EMBUDO, semanasDelMes, mesMas, agruparPorFecha, resumenProyecto, cargaPorPersona, diasDeRetraso, PROYECTO_AGENCIA, CODIGO_AGENCIA, asignadaA } from './operativa.js';
import { richToHtml, richToText } from './richtext.js';
import { tablerosDe, tableroDeTarea, columnaDeTarea, columnaHecha, COLUMNAS_SERIE, GENERAL, MAX_COLUMNAS, COLORES_ETIQUETA, etiquetasDeTarea, PRIORIDADES, ordenTarjetas, progresoChecklist, MAX_ETIQUETAS_TAREA } from './tableros.js';
import { textoRepetir, proximaTrasHecho, encajaEnRepetir, primeraFechaRepetir } from './procesos.js';
import { editorRepetir, leerRepetir, pulsarDsem } from './repetir-ui.js';
import { montarEditor, montarVideos } from './editor-rico.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const fechaCorta = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
const cuando = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '');
const iniciales = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';
const ESTADO = Object.fromEntries(ESTADOS_OP.map((e) => [e.id, e]));

let ctx = null;
let d = { tareas: [], equipo: [], proyectos: [], yo: '', superadmin: false, tableros: [], plantillas: [], etiquetas: [] };
let fEtq = ''; // filtro por etiqueta ('' = todas; '_alta' = prioridad alta)
let pickerEtq = false; // el selector de etiquetas de la ficha, abierto
let colorNueva = 'azul';
let recienCreada = ''; // la siguiente de una que se repite (se resalta al aparecer)
let vista = 'tablero';
let fProy = '';
let fEmb = ''; // embudo dentro del cliente elegido
let fTab = GENERAL; // tablero del cliente elegido (vista Tablero)
let editTab = null; // borrador del tablero que se está creando o cuyas columnas se editan
let calMes = '';
let fPersona = '';
let q = '';
let abierta = null; // { cliente, code, id }
let creando = false;
let editandoDesc = false;
let editor = null; // el editor abierto (descripción o tarea nueva)

const body = () => ctx.dialog.querySelector('#op-body');
const tabsDe = (proyecto) => tablerosDe({ tableros: d.tableros }, proyecto);
const tabDeT = (t) => tableroDeTarea(t, tabsDe(t.cliente));
const modoTableros = () => vista === 'tablero' && Boolean(fProy);
const clave = (t) => `${t.cliente}|${t.code}|${t.id}`;
const buscarT = (k) => d.tareas.find((t) => clave(t) === k);
const nombreDe = (uid) => d.equipo.find((u) => u.id === uid)?.nombre || '';
const quienTxt = (t) => (!t.asignado ? 'Sin asignar' : t.asignado.tipo === 'persona' ? nombreDe(t.asignado.id) || 'Otra persona' : `Rol ${t.asignado.rol}`);
const avatar = (t) => (t.asignado ? `<span class="pr-av" title="${esc(quienTxt(t))}">${esc(t.asignado.tipo === 'persona' ? iniciales(nombreDe(t.asignado.id)) : '👥')}</span>` : '<span class="pr-av vacio" title="Sin asignar">?</span>');
const chipProyecto = (t) => `<span class="pr-proy" style="--cl:${esc(t.color || 'var(--accent)')}">${esc(t.clienteNombre)}</span>${t.embudo && t.cliente !== PROYECTO_AGENCIA ? `<span class="op-emb">${esc(t.embudo)}</span>` : ''}`;
function chipFecha(t, hoy) {
  if (!t.fecha) return '';
  if (estadoOp(t) === 'hecha') return `<span class="op-fecha">${esc(fechaCorta(t.fecha))}</span>`;
  if (t.fecha < hoy) { const n = diasDeRetraso(t.fecha, hoy); return `<span class="op-fecha vencida">⏰ hace ${n} día${n === 1 ? '' : 's'}</span>`; }
  if (t.fecha === hoy) return '<span class="op-fecha hoy">Hoy</span>';
  return `<span class="op-fecha">${esc(fechaCorta(t.fecha))}</span>`;
}

export async function abrirOperativa(opts) {
  ctx = opts;
  const dlg = ctx.dialog;
  if (!dlg.dataset.listo) {
    dlg.dataset.listo = '1';
    dlg.querySelector('#op-cerrar').addEventListener('click', () => dlg.close());
    dlg.querySelector('#op-nueva').addEventListener('click', () => { creando = true; abierta = null; pintar(); });
    dlg.addEventListener('click', onClick);
    dlg.addEventListener('change', onChange);
    dlg.addEventListener('submit', onSubmit);
    dlg.addEventListener('input', (e) => { if (e.target.id === 'op-buscar') { q = e.target.value; pintarVista(); } });
    dlg.addEventListener('dragstart', (e) => { const c = e.target.closest?.('[data-op-k]'); if (c) { e.dataTransfer.setData('text/plain', c.dataset.opK); c.classList.add('arrastrando'); } });
    // Las tareas del calendario se abren también con el teclado (Intro / espacio).
    dlg.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.op-cal-t')) { e.preventDefault(); e.target.click(); } });
    dlg.addEventListener('dragend', (e) => e.target.closest?.('[data-op-k]')?.classList.remove('arrastrando'));
    // Tablero: soltar en otra columna cambia el estado. Calendario: soltar en otro día cambia la fecha.
    dlg.addEventListener('dragover', (e) => { const col = e.target.closest('[data-op-col], [data-op-dia]'); if (col) { e.preventDefault(); col.classList.add('sobre'); } });
    dlg.addEventListener('dragleave', (e) => e.target.closest('[data-op-col], [data-op-dia]')?.classList.remove('sobre'));
    dlg.addEventListener('drop', (e) => {
      const col = e.target.closest('[data-op-col], [data-op-dia]');
      if (!col) return;
      e.preventDefault();
      col.classList.remove('sobre');
      const t = buscarT(e.dataTransfer.getData('text/plain'));
      if (!t) return;
      if (col.dataset.opCol && modoTableros()) { if (columnaDeTarea(t, tabDeT(t)) !== col.dataset.opCol) moverColumna(t, col.dataset.opCol); } else if (col.dataset.opCol && t.estado !== col.dataset.opCol) cambiarEstado(t, col.dataset.opCol);
      if (col.dataset.opDia != null && (t.fecha || '') !== col.dataset.opDia) cambiarFecha(t, col.dataset.opDia);
    });
  }
  vista = 'tablero'; // siempre se entra por el tablero
  ultimoTablero = '';
  calMes = hoyMadrid().slice(0, 7);
  body().innerHTML = '<p class="muted">Cargando las tareas de todos los proyectos…</p>';
  if (!dlg.open) dlg.showModal();
  await cargar();
}

async function cargar() {
  try {
    d = await ctx.api('/api/operativa');
  } catch (e) { body().innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  if (vista === 'personas' && !d.superadmin) vista = 'tablero';
  if (fProy && !d.proyectos.some((p) => p.id === fProy)) { fProy = ''; fEmb = ''; }
  if (!tabsDe(fProy).some((b) => b.id === fTab)) fTab = GENERAL;
  pintar();
}

// Lo que se ve con los filtros de arriba.
function filtradas() {
  const t = q.trim().toLowerCase();
  return d.tareas.filter((x) => (!fProy || x.cliente === fProy) && (!fEmb || x.embudoId === fEmb)
    && (!fPersona || (fPersona === '_sin' ? !x.asignado : x.asignado?.tipo === 'persona' && x.asignado.id === fPersona))
    && (!fEtq || (fEtq === '_alta' ? x.prioridad === 'alta' : (x.etiquetas || []).includes(fEtq)))
    && (!t || `${x.titulo} ${x.clienteNombre} ${x.embudo} ${etiquetasDeTarea(x, d.etiquetas).map((e) => e.nombre).join(' ')}`.toLowerCase().includes(t)));
}

function pintar() {
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
    + `<span class="op-sub-txt">${d.superadmin ? 'Todo el equipo y todos los proyectos' : 'Lo que tienes asignado en todos los proyectos'}</span>`;
  body().innerHTML = `<div class="op">
    <nav class="op-tabs">${tab('tablero', '🗂️ Tablero')}${tab('calendario', '🗓️ Calendario')}${tab('dia', `☀️ Mi día${venc ? ` <b>${venc}</b>` : ''}`)}${tab('proyectos', '📁 Por proyecto')}${d.superadmin ? tab('personas', '👥 Por persona') : ''}</nav>
    <div class="op-filtros">
      <select id="op-proyecto" aria-label="Cliente"><option value="">Todos los clientes</option>${d.proyectos.map((p) => `<option value="${esc(p.id)}"${fProy === p.id ? ' selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select>
      ${fProy && fProy !== PROYECTO_AGENCIA ? (() => { const embs = embudosDe(d.tareas, fProy); return embs.length ? `<select id="op-embudo" aria-label="Embudo"><option value="">Todos los proyectos</option>${embs.map((e) => `<option value="${esc(e.id)}"${fEmb === e.id ? ' selected' : ''}>${ICONO_EMBUDO[e.tipo] || '📁'} ${esc(e.nombre)}${e.n ? ` (${e.n})` : ''}</option>`).join('')}</select>` : ''; })() : ''}
      ${d.superadmin ? `<select id="op-persona" aria-label="Persona"><option value="">Todo el equipo</option>${d.equipo.map((u) => `<option value="${esc(u.id)}"${fPersona === u.id ? ' selected' : ''}>${esc(u.nombre)}</option>`).join('')}<option value="_sin"${fPersona === '_sin' ? ' selected' : ''}>Sin asignar</option></select>` : ''}
      <label class="pr-buscar op-buscar"><span aria-hidden="true">🔎</span><input id="op-buscar" type="search" placeholder="Buscar…" value="${esc(q)}" autocomplete="off"></label>
    </div>
    ${barraEtiquetas()}
    <section id="op-vista"></section>
    ${abierta || creando ? '<div class="op-ficha-fondo" data-op="cerrar-ficha"></div><aside class="op-ficha" id="op-ficha"></aside>' : ''}
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
    <button type="button" class="op-check${e === 'hecha' ? ' on' : ''}" data-op-hecha="${esc(clave(t))}" aria-label="${e === 'hecha' ? 'Reabrir' : 'Marcar como hecha'}">✓</button>
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
function tarjetaTablero(t, hoy) {
  const etqs = etiquetasDeTarea(t, d.etiquetas);
  const pr = prioDe(t);
  const ck = progresoChecklist(t);
  const hecha = estadoOp(t) === 'hecha';
  const portada = etqs[0] ? COLORES_ETIQUETA[etqs[0].color] : pr ? pr.color : '';
  return `<article class="op-card op-card2${estaBloqueada(t) ? ' is-bloq' : ''}${hecha ? ' es-hecha' : ''}${portada ? ' con-portada' : ''}${recienCreada && t.id === recienCreada ? ' recien' : ''}" style="--i:${nCard++ % 12};${portada ? `--portada:${portada}` : ''}" draggable="true" data-op-k="${esc(clave(t))}" data-op-abrir="${esc(clave(t))}">
        ${etqs.length || pr ? `<div class="op-card-etqs">${pr ? `<span class="op-prio p-${pr.id}" title="Prioridad ${esc(pr.label.toLowerCase())}">${pr.id === 'alta' ? '🔥' : '⚑'} ${esc(pr.label)}</span>` : ''}${etqs.map((e) => pildoraEtq(e)).join('')}</div>` : ''}
        <div class="op-card-t"><button type="button" class="op-check${hecha ? ' on' : ''}" data-op-hecha="${esc(clave(t))}" title="${hecha ? 'Reabrir' : 'Marcar como hecha'}" aria-label="${hecha ? 'Reabrir' : 'Marcar como hecha'}">✓</button><strong>${esc(t.titulo)}</strong></div>
        ${t.notas ? `<p class="op-card-desc">${esc(richToText(t.notas).replace(/🎬/g, '🎬 vídeo').replace(/\s*•\s*/g, ' · ').replace(/\s*\n+\s*/g, ' · ').replace(/^ · /, '').slice(0, 120))}</p>` : ''}
        ${estaBloqueada(t) ? `<span class="op-bloq">⛔ ${esc(t.bloqueo)}</span>` : ''}
        ${ck.total ? `<div class="op-ck-mini${ck.hechos === ck.total ? ' completa' : ''}" title="Checklist: ${ck.hechos} de ${ck.total}"><span class="op-ck-barra"><i style="width:${Math.round((ck.hechos / ck.total) * 100)}%"></i></span><b>☑ ${ck.hechos}/${ck.total}</b></div>` : ''}
        <footer>${chipFecha(t, hoy)}${t.repetir?.tipo ? `<span class="op-rep" title="${esc(textoRepetir(t.repetir))}">🔁</span>` : ''}${t.comentarios?.length ? `<span class="op-com">💬 ${t.comentarios.length}</span>` : ''}<span class="op-card-proy">${fProy ? '' : chipProyecto(t)}</span>${avatar(t)}</footer>
      </article>`;
}
const porFecha = ordenTarjetas; // prioridad alta primero y después por fecha

// Tablero: con «Todos los clientes», por estado (Pendiente · Para revisar · Hecho). Con un cliente elegido, sus
// tableros (General y los creados) con sus propias columnas; el superadmin crea tableros y edita columnas.
let ultimoTablero = '';
function vistaTablero(lista, hoy) {
  // Las tarjetas entran con animación al abrir o cambiar de tablero; al repintar tras un cambio, no.
  const k = `${fProy}|${fTab}|${fEmb}|${fEtq}`;
  const quieto = k === ultimoTablero ? ' quieto' : '';
  ultimoTablero = k;
  if (!fProy) {
    return `<p class="muted small op-ayuda">Arrastra las tarjetas de una columna a otra para cambiar su estado. <strong>Elige un cliente arriba</strong> para ver sus tableros, cada uno con sus columnas.</p>
  <div class="op-tablero${quieto}">${ESTADOS_OP.map((e) => {
    const ts = lista.filter((t) => estadoOp(t) === e.id).sort(porFecha);
    return `<section class="op-col e-${e.id}" data-op-col="${e.id}"><header><span class="op-col-dot"></span><span class="op-col-nom">${e.icon} ${esc(e.label)}</span><b>${ts.length}</b></header>
      <div class="op-col-lista">${ts.map((t) => tarjetaTablero(t, hoy)).join('') || '<p class="op-col-vacia">Suelta aquí una tarea</p>'}</div></section>`;
  }).join('')}</div>`;
  }
  const tabs = tabsDe(fProy);
  const tab = tabs.find((b) => b.id === fTab) || tabs[0];
  const abiertasDe = (b) => lista.filter((t) => tabDeT(t).id === b.id && estadoOp(t) !== 'hecha').length;
  const barra = `<nav class="op-tabs-tab" aria-label="Tableros">${tabs.map((b) => `<button type="button" class="op-tab-b${b.id === tab.id ? ' on' : ''}" data-op-tab="${esc(b.id)}">${b.id === GENERAL ? '🗂️' : '📋'} ${esc(b.nombre)} <b>${abiertasDe(b)}</b></button>`).join('')}
    ${d.superadmin ? `<button type="button" class="op-tab-b op-tab-nuevo" data-op="tab-nuevo">＋ Nuevo tablero</button><button type="button" class="btn ghost small op-tab-cfg" data-op="tab-editar">⚙️ Columnas de «${esc(tab.nombre)}»</button>` : ''}</nav>`;
  if (editTab) return barra + editorTablero();
  const suyas = lista.filter((t) => tabDeT(t).id === tab.id);
  return `${barra}<p class="muted small op-ayuda">Arrastra las tarjetas de una columna a otra. Al llevarlas a ${tab.columnas.filter((c) => c.hecha).map((c) => `«${esc(c.nombre)}»`).join(' o ')} se marcan como hechas.</p>
  <div class="op-tablero${quieto}" style="--op-ncol:${tab.columnas.length}">${tab.columnas.map((c, i) => {
    const ts = suyas.filter((t) => columnaDeTarea(t, tab) === c.id).sort(porFecha);
    return `<section class="op-col${c.hecha ? ' e-hecha' : ` e-c${i % 6}`}" data-op-col="${esc(c.id)}"><header><span class="op-col-dot"></span><span class="op-col-nom">${c.hecha ? '✅ ' : ''}${esc(c.nombre)}</span><b>${ts.length}</b></header>
      <div class="op-col-lista">${ts.map((t) => tarjetaTablero(t, hoy)).join('') || '<p class="op-col-vacia">Suelta aquí una tarea</p>'}</div></section>`;
  }).join('')}</div>`;
}

// Crear un tablero o editar sus columnas (solo superadmin). Plantillas: empezar con unas columnas guardadas o
// guardar las de este tablero para otros proyectos.
function editorTablero() {
  const e = editTab;
  return `<section class="op-te">
    <header class="op-te-h"><h3>${e.nuevo ? '＋ Nuevo tablero' : `⚙️ Columnas de «${esc(e.nombre)}»`}</h3><span class="muted small">${esc(d.proyectos.find((p) => p.id === e.proyecto)?.nombre || '')}</span></header>
    <div class="op-te-fila">
      <label class="field"><span>Nombre del tablero</span><input data-te="nombre" maxlength="40" value="${esc(e.nombre)}" placeholder="Contenido, Anuncios, Lanzamiento octubre…" ${e.id === GENERAL ? 'disabled' : ''}></label>
      ${e.nuevo && d.plantillas.length ? `<label class="field"><span>Empezar con</span><select data-te="plantilla"><option value="">Columnas de serie</option>${d.plantillas.map((p) => `<option value="${esc(p.id)}"${e.plantilla === p.id ? ' selected' : ''}>📐 ${esc(p.nombre)}</option>`).join('')}</select></label>` : ''}
    </div>
    <ol class="op-te-cols">${e.columnas.map((c, i) => `<li data-ci="${i}"><span class="op-te-n">${i + 1}</span><input data-tc="nombre" maxlength="40" value="${esc(c.nombre)}" placeholder="Nombre de la columna" aria-label="Columna ${i + 1}">
      <label class="chk small" title="Al llevar una tarea aquí, se marca como hecha"><input type="checkbox" data-tc="hecha" ${c.hecha ? 'checked' : ''}> Cuenta como hecha</label>
      <button type="button" class="btn ghost small" data-op="te-subir" ${i ? '' : 'disabled'} aria-label="Subir">↑</button><button type="button" class="btn ghost small" data-op="te-bajar" ${i < e.columnas.length - 1 ? '' : 'disabled'} aria-label="Bajar">↓</button><button type="button" class="btn ghost small danger" data-op="te-quitar" ${e.columnas.length > 1 ? '' : 'disabled'} aria-label="Quitar columna">✕</button></li>`).join('')}</ol>
    <button type="button" class="btn small" data-op="te-add" ${e.columnas.length >= MAX_COLUMNAS ? 'disabled' : ''}>＋ Añadir columna</button>
    <p class="muted small">Las tareas de una columna que quites pasan a la primera (o a la de hecha, si estaban hechas). Tiene que haber al menos una columna «cuenta como hecha».</p>
    <footer class="op-te-pie">
      ${!e.nuevo && e.id !== GENERAL ? '<button type="button" class="btn ghost small danger" data-op="te-borrar">🗑️ Borrar tablero</button>' : ''}
      <button type="button" class="btn ghost small" data-op="te-plantilla">📐 Guardar como plantilla</button>
      ${e.nuevo && e.plantilla ? '<button type="button" class="btn ghost small" data-op="te-plantilla-borrar">Borrar esta plantilla</button>' : ''}
      <span class="spacer"></span>
      <button type="button" class="btn ghost" data-op="te-cancelar">Cancelar</button><button type="button" class="btn primary" data-op="te-guardar">${e.nuevo ? 'Crear tablero' : 'Guardar columnas'}</button>
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
async function guardarTableros(cuerpo) {
  const r = await ctx.api('/api/operativa', { method: 'POST', body: cuerpo });
  d.tableros = r.tableros;
  d.plantillas = r.plantillas;
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
  if (creando) {
    box.innerHTML = `<form class="op-form" data-op-form="crear">
      <header class="op-ficha-h"><h3>＋ Nueva tarea</h3><button type="button" class="btn ghost small" data-op="cerrar-ficha" aria-label="Cerrar">✕</button></header>
      <p class="muted small">Elige el proyecto y su tablero. Lo interno que no es de ningún cliente (facturas, equipo…) va a «Agencia».</p>
      <label class="field"><span>Qué hay que hacer</span><input name="titulo" required maxlength="200" autocomplete="off"></label>
      <div class="op-form-fila"><label class="field"><span>Proyecto</span><select name="proyecto">${d.proyectos.map((p) => `<option value="${esc(p.id)}"${p.id === (fProy || PROYECTO_AGENCIA) ? ' selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
      <label class="field"><span>Tablero</span><select name="tablero">${tabsDe(fProy || PROYECTO_AGENCIA).map((b) => `<option value="${esc(b.id)}"${b.id === fTab ? ' selected' : ''}>${esc(b.nombre)}</option>`).join('')}</select></label></div>
      <div class="op-form-fila"><label class="field"><span>Para cuándo</span><input type="date" name="fecha"></label>
      <label class="field"><span>Responsable</span><select name="uid"><option value="">Sin asignar</option>${d.equipo.map((u) => `<option value="${esc(u.id)}"${u.id === d.yo ? ' selected' : ''}>${esc(u.nombre)}</option>`).join('')}</select></label></div>
      <div class="field"><span>Descripción</span><div class="op-editor" data-op-editor></div></div>
      <footer class="op-form-acc"><button type="button" class="btn ghost" data-op="cerrar-ficha">Cancelar</button><button class="btn primary">Crear tarea</button></footer>
    </form>`;
    editor = montarEditor(box.querySelector('[data-op-editor]'), '', { placeholder: 'Pasos, enlaces, listas, vídeos…' });
    box.querySelector('input[name=titulo]').focus();
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
    <h3 class="op-ficha-t">${esc(t.titulo)}</h3>
    <div class="pr-campos">
      <div class="pr-campo"><span class="pr-campo-l">Columna</span><div class="pr-campo-v"><div class="op-estados">${tabT.columnas.map((c) => `<button type="button" class="op-est ${c.hecha ? 'e-hecha' : c.id === 'revision' ? 'e-revision' : 'e-pendiente'}${c.id === colT ? ' on' : ''}" data-op-col-set="${esc(c.id)}">${c.hecha ? '✅ ' : ''}${esc(c.nombre)}</button>`).join('')}</div></div></div>
      ${d.superadmin && tabsT.length > 1 ? `<div class="pr-campo"><span class="pr-campo-l">Tablero</span><div class="pr-campo-v"><select data-op-campo="tablero">${tabsT.map((b) => `<option value="${esc(b.id)}"${b.id === tabT.id ? ' selected' : ''}>${esc(b.nombre)}</option>`).join('')}</select></div></div>` : ''}
      <div class="pr-campo"><span class="pr-campo-l">Prioridad</span><div class="pr-campo-v"><div class="op-prios">${[{ id: '', label: 'Sin prioridad' }, ...PRIORIDADES].map((pp) => `<button type="button" class="op-prio-b${pp.id ? ` p-${pp.id}` : ''}${(t.prioridad || '') === pp.id ? ' on' : ''}" data-op-prio="${pp.id}">${pp.id === 'alta' ? '🔥 ' : pp.id ? '⚑ ' : ''}${esc(pp.label)}</button>`).join('')}</div></div></div>
      <div class="pr-campo"><span class="pr-campo-l">Etiquetas</span><div class="pr-campo-v op-etqs-v">${etiquetasDeTarea(t, d.etiquetas).map((x) => pildoraEtq(x, ` data-op-etq-toggle="${esc(x.id)}" role="button" tabindex="0" title="Quitar"`)).join('')}<button type="button" class="op-etq-add" data-op="etq-abrir">${pickerEtq ? 'Cerrar' : '＋ Etiqueta'}</button>
        ${pickerEtq ? selectorEtiquetas(t) : ''}</div></div>
      <div class="pr-campo"><span class="pr-campo-l">Se repite</span><div class="pr-campo-v op-rep-v">${editorRepetir(t.repetir)}${bloqueRepetir(t)}</div></div>
      ${e === 'hecha' ? '' : `<div class="pr-campo"><span class="pr-campo-l">Bloqueo</span><div class="pr-campo-v">${estaBloqueada(t) ? `<span class="op-bloq">⛔ ${esc(t.bloqueo)}</span><button type="button" class="btn ghost small" data-op="desbloquear">Desbloquear</button>` : '<button type="button" class="btn ghost small op-bloquear" data-op="bloquear">⛔ Marcar como bloqueada</button>'}</div></div>`}
      <div class="pr-campo"><span class="pr-campo-l">Fecha</span><div class="pr-campo-v"><input type="date" data-op-campo="fecha" value="${esc(t.fecha)}">${chipFecha(t, hoyMadrid())}</div></div>
      <div class="pr-campo"><span class="pr-campo-l">Responsable</span><div class="pr-campo-v">${d.superadmin ? `<select data-op-campo="uid"><option value="">Sin asignar</option>${d.equipo.map((u) => `<option value="${esc(u.id)}"${t.asignado?.tipo === 'persona' && t.asignado.id === u.id ? ' selected' : ''}>${esc(u.nombre)}</option>`).join('')}${t.asignado?.tipo === 'rol' ? `<option selected>Rol ${esc(t.asignado.rol)}</option>` : ''}</select>` : `${avatar(t)} ${esc(quienTxt(t))}`}</div></div>
      ${t.embudo && !deAgencia ? `<div class="pr-campo"><span class="pr-campo-l">Embudo</span><div class="pr-campo-v">${esc(t.embudo)}</div></div>` : ''}
    </div>
    ${bloqueChecklist(t)}
    <section class="pr-bloque op-desc"><header class="pr-bloque-h"><h4>Descripción</h4>${editandoDesc ? '' : `<button type="button" class="btn ghost small" data-op="editar-desc">✏️ ${t.notas ? 'Editar' : 'Añadir'}</button>`}</header>
      ${editandoDesc ? '<div class="op-editor" data-op-editor></div><footer class="op-form-acc"><button type="button" class="btn ghost small" data-op="cancelar-desc">Cancelar</button><button type="button" class="btn primary small" data-op="guardar-desc">Guardar</button></footer>'
        : t.notas ? `<div class="rich op-notas">${richToHtml(t.notas)}</div>` : '<button type="button" class="op-desc-vacia" data-op="editar-desc">Añade la descripción: pasos, enlaces, listas, negritas o un vídeo…</button>'}
    </section>
    <section class="pr-bloque"><h4>Comentarios ${t.comentarios?.length ? `<span class="muted">${t.comentarios.length}</span>` : ''}</h4>
      <ol class="pr-hilo">${(t.comentarios || []).map((c) => `<li class="pr-com"><span class="pr-av">${esc(iniciales(c.nombre))}</span><div class="pr-com-c"><header><strong>${esc(c.nombre)}</strong><span class="muted small">${esc(cuando(c.en))}</span>${d.superadmin || c.uid === d.yo ? `<button type="button" class="pr-x" data-op-com-borrar="${esc(c.id)}" aria-label="Borrar comentario">✕</button>` : ''}</header><div class="pr-com-t">${esc(c.texto).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`).replace(/\n/g, '<br>')}</div></div></li>`).join('') || '<li class="muted small">Sin comentarios.</li>'}</ol>
      <form class="pr-comentar" data-op-form="comentar"><textarea name="texto" rows="2" maxlength="2000" placeholder="Escribe un comentario…"></textarea><button class="btn primary small">Comentar</button></form>
    </section>
    ${''}${deAgencia ? '<p class="op-ficha-pie"><button type="button" class="btn ghost small danger" data-op="borrar">🗑️ Borrar tarea</button></p>' : '<p class="muted small op-ficha-pie">Esta tarea vive en el proyecto del cliente: lo que cambies aquí se guarda allí.</p>'}`;
  if (editandoDesc) editor = montarEditor(box.querySelector('[data-op-editor]'), t.notas, { placeholder: 'Pasos, enlaces, listas, vídeos…' });
  else montarVideos(box.querySelector('.op-notas'));
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
  Object.assign(t, { etiquetas: n.etiquetas || [], prioridad: n.prioridad || '', checklist: n.checklist || [], repetir: n.repetir?.tipo ? n.repetir : null, opTablero: n.opTablero || '', opColumna: n.opColumna || '', titulo: n.titulo, notas: n.notas || '', fecha: n.fecha || '', estado: estadoOp(n), hecha: Boolean(n.hecha), hechaEn: n.hechaEn || '', bloqueo: n.bloqueo || '', asignado: n.asignado || null, comentarios: (n.comentarios || []).map((c) => ({ id: c.id, uid: c.uid || '', nombre: c.nombre, texto: c.texto, en: c.en })) });
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
  try { await op(t, { op: 'columna', columna, ...(tablero ? { tablero } : {}) }); } catch (err) { window.alert(err.message); }
  pintarVista();
  if (abierta) pintarFicha();
}

async function cambiarFecha(t, fecha) {
  try { await op(t, { op: 'fecha', fecha }); } catch (err) { window.alert(err.message); }
  pintarVista();
  if (abierta) pintarFicha();
}

async function cambiarEstado(t, estado) {
  try { await op(t, { op: 'estado', estado }); } catch (err) { window.alert(err.message); }
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

async function onClick(e) {
  const v = e.target.closest('[data-op-vista]');
  if (v) { vista = v.dataset.opVista; pintar(); return; }
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
  if (tb) { fTab = tb.dataset.opTab; editTab = null; pintarVista(); return; }
  const cs = e.target.closest('[data-op-col-set]');
  if (cs) { const t = buscarT(abierta); if (t && cs.dataset.opColSet !== columnaDeTarea(t, tabDeT(t))) moverColumna(t, cs.dataset.opColSet, tabDeT(t).id); return; }
  const cal = e.target.closest('[data-op-cal]');
  if (cal) { calMes = cal.dataset.opCal === 'hoy' ? hoyMadrid().slice(0, 7) : mesMas(calMes, Number(cal.dataset.opCal)); pintarVista(); return; }
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
      await Promise.all([new Promise((ok) => setTimeout(ok, 420)), op(t, { op: 'estado', estado: 'hecha' }).catch((err) => window.alert(err.message))]);
      pintarVista();
      if (abierta) pintarFicha();
      return;
    }
    cambiarEstado(t, completar ? 'hecha' : 'pendiente');
    return;
  }
  const est = e.target.closest('[data-op-estado]');
  if (est) { const t = buscarT(abierta); if (t && est.dataset.opEstado !== estadoOp(t)) cambiarEstado(t, est.dataset.opEstado); return; }
  const ab = e.target.closest('[data-op-abrir]');
  if (ab && !e.target.closest('a')) { creando = false; editandoDesc = false; if (abierta !== ab.dataset.opAbrir) pickerEtq = false; abierta = ab.dataset.opAbrir; pintar(); return; }
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
  if (b.dataset.op.startsWith('te-') || b.dataset.op.startsWith('tab-')) { await opEditor(b); return; }
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
  if (b.dataset.op === 'cerrar-ficha') { abierta = null; creando = false; editandoDesc = false; pickerEtq = false; pintar(); return; }
  if (b.dataset.op === 'editar-desc') { editandoDesc = true; pintarFicha(); editor?.area.focus(); return; }
  if (b.dataset.op === 'cancelar-desc') { editandoDesc = false; pintarFicha(); return; }
  if (b.dataset.op === 'guardar-desc') {
    b.disabled = true;
    try { await op(buscarT(abierta), { op: 'descripcion', notas: editor.leer() }); editandoDesc = false; } catch (err) { window.alert(err.message); b.disabled = false; return; }
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
  if (a === 'tab-nuevo') { editTab = { nuevo: true, proyecto: fProy, nombre: '', plantilla: '', columnas: COLUMNAS_SERIE.map((c) => ({ ...c })) }; pintarVista(); body().querySelector('[data-te="nombre"]')?.focus(); return; }
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
    if (editTab.id !== GENERAL && !editTab.nombre.trim()) { window.alert('Ponle un nombre al tablero.'); return; }
    if (!limpias.some((c) => c.hecha) && !window.confirm('Ninguna columna «cuenta como hecha»: se usará la última. ¿Seguir?')) return;
    const antes = new Set(tabsDe(editTab.proyecto).map((x) => x.id));
    try {
      await guardarTableros({ op: 'tablero-guardar', tablero: { id: editTab.nuevo ? undefined : editTab.id, proyecto: editTab.proyecto, nombre: editTab.nombre, columnas: limpias } });
      if (editTab.nuevo) fTab = tabsDe(editTab.proyecto).find((x) => !antes.has(x.id))?.id || fTab;
      editTab = null;
    } catch (err) { window.alert(err.message); return; }
  } else if (a === 'te-borrar') {
    if (!window.confirm(`¿Borrar el tablero «${editTab.nombre}»? Sus tareas no se borran: pasan al tablero General.`)) return;
    try { await guardarTableros({ op: 'tablero-borrar', proyecto: editTab.proyecto, tableroId: editTab.id }); fTab = GENERAL; editTab = null; } catch (err) { window.alert(err.message); return; }
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
  if (t0.dataset.rep) { guardarRepetir(t0.closest('[data-rep-ed]')); return; }
  if (t0.id === 'op-proyecto') { fProy = t0.value; fEmb = ''; fTab = GENERAL; editTab = null; pintar(); return; }
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
    if (f.dataset.opForm === 'ck') {
      const texto = f.texto.value.trim();
      if (!texto) { btn?.removeAttribute('disabled'); return; }
      const t = buscarT(abierta);
      await op(t, { op: 'checklist', checklist: [...(t.checklist || []), { texto, hecho: false }] });
      pintarVista(); pintarFicha();
      body().querySelector('[data-op-form="ck"] input')?.focus();
      return;
    }
    if (f.dataset.opForm === 'comentar') {
      const texto = f.texto.value.trim();
      if (!texto) { btn?.removeAttribute('disabled'); return; }
      await op(buscarT(abierta), { op: 'comentar', texto });
      pintarFicha();
      pintarVista();
    } else {
      const notas = editor ? editor.leer() : '';
      const proyecto = f.proyecto.value;
      const r = await ctx.api('/api/operativa', { method: 'POST', body: { op: 'crear', tarea: { titulo: f.titulo.value, fecha: f.fecha.value, notas, proyecto, opTablero: f.tablero.value, asignado: f.uid.value ? { tipo: 'persona', id: f.uid.value } : null } } });
      creando = false;
      await cargar();
      abierta = `${proyecto}|${CODIGO_AGENCIA}|${r.tarea.id}`;
      pintar();
    }
  } catch (err) { window.alert(err.message); btn?.removeAttribute('disabled'); }
}
