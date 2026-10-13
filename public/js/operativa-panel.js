// Panel «🗂️ Operativa» (Inicio de la agencia y Cuenta; solo el equipo de la agencia): todas las tareas de todos
// los proyectos. Vistas: ☀️ Mi día (lo mío por cuándo toca), 📁 Por proyecto (semáforo de cada cliente), 🗂️ Tablero
// (por estado, arrastrando) y 👥 Por persona (solo superadmin). Cada tarea se cambia aquí mismo (estado, fecha,
// responsable, comentarios) y se guarda en su proyecto. Cada persona ve solo lo que tiene asignado.
//   abrirOperativa({ api, dialog })
import { ESTADOS_OP, estadoOp, estaBloqueada, agruparPorFecha, resumenProyecto, cargaPorPersona, diasDeRetraso, PROYECTO_AGENCIA, CODIGO_AGENCIA, asignadaA } from './operativa.js';
import { richToHtml, richToText } from './richtext.js';
import { montarEditor, montarVideos } from './editor-rico.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const fechaCorta = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
const cuando = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '');
const iniciales = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';
const LS_VISTA = 'lsd_op_vista';
const leerLs = (k, def) => { try { return localStorage.getItem(k) || def; } catch { return def; } };
const ponerLs = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
const ESTADO = Object.fromEntries(ESTADOS_OP.map((e) => [e.id, e]));

let ctx = null;
let d = { tareas: [], equipo: [], proyectos: [], yo: '', superadmin: false };
let vista = 'dia';
let fProy = '';
let fPersona = '';
let q = '';
let abierta = null; // { cliente, code, id }
let creando = false;
let editandoDesc = false;
let editor = null; // el editor abierto (descripción o tarea nueva)

const body = () => ctx.dialog.querySelector('#op-body');
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
    dlg.addEventListener('dragend', (e) => e.target.closest?.('[data-op-k]')?.classList.remove('arrastrando'));
    dlg.addEventListener('dragover', (e) => { const col = e.target.closest('[data-op-col]'); if (col) { e.preventDefault(); col.classList.add('sobre'); } });
    dlg.addEventListener('dragleave', (e) => e.target.closest('[data-op-col]')?.classList.remove('sobre'));
    dlg.addEventListener('drop', (e) => {
      const col = e.target.closest('[data-op-col]');
      if (!col) return;
      e.preventDefault();
      col.classList.remove('sobre');
      const t = buscarT(e.dataTransfer.getData('text/plain'));
      if (t && t.estado !== col.dataset.opCol) cambiarEstado(t, col.dataset.opCol);
    });
  }
  vista = leerLs(LS_VISTA, 'dia');
  body().innerHTML = '<p class="muted">Cargando las tareas de todos los proyectos…</p>';
  if (!dlg.open) dlg.showModal();
  await cargar();
}

async function cargar() {
  try {
    d = await ctx.api('/api/operativa');
  } catch (e) { body().innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  if (vista === 'personas' && !d.superadmin) vista = 'dia';
  pintar();
}

// Lo que se ve con los filtros de arriba.
function filtradas() {
  const t = q.trim().toLowerCase();
  return d.tareas.filter((x) => (!fProy || x.cliente === fProy)
    && (!fPersona || (fPersona === '_sin' ? !x.asignado : x.asignado?.tipo === 'persona' && x.asignado.id === fPersona))
    && (!t || `${x.titulo} ${x.clienteNombre} ${x.embudo}`.toLowerCase().includes(t)));
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
    <nav class="op-tabs">${tab('dia', `☀️ Mi día${venc ? ` <b>${venc}</b>` : ''}`)}${tab('proyectos', '📁 Por proyecto')}${tab('tablero', '🗂️ Tablero')}${d.superadmin ? tab('personas', '👥 Por persona') : ''}</nav>
    <div class="op-filtros">
      <select id="op-proyecto" aria-label="Proyecto"><option value="">Todos los proyectos</option>${d.proyectos.map((p) => `<option value="${esc(p.id)}"${fProy === p.id ? ' selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select>
      ${d.superadmin ? `<select id="op-persona" aria-label="Persona"><option value="">Todo el equipo</option>${d.equipo.map((u) => `<option value="${esc(u.id)}"${fPersona === u.id ? ' selected' : ''}>${esc(u.nombre)}</option>`).join('')}<option value="_sin"${fPersona === '_sin' ? ' selected' : ''}>Sin asignar</option></select>` : ''}
      <label class="pr-buscar op-buscar"><span aria-hidden="true">🔎</span><input id="op-buscar" type="search" placeholder="Buscar…" value="${esc(q)}" autocomplete="off"></label>
    </div>
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
  else box.innerHTML = vistaPersonas(lista, hoy);
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

function vistaTablero(lista, hoy) {
  return `<p class="muted small op-ayuda">Arrastra las tarjetas de una columna a otra para cambiar su estado (o ábrelas y elige el estado).</p>
  <div class="op-tablero">${ESTADOS_OP.map((e) => {
    const ts = lista.filter((t) => estadoOp(t) === e.id).sort((a, b) => String(a.fecha || '9').localeCompare(String(b.fecha || '9')));
    return `<section class="op-col e-${e.id}" data-op-col="${e.id}"><header><span>${e.icon} ${esc(e.label)}</span><b>${ts.length}</b></header>
      <div class="op-col-lista">${ts.map((t) => `<article class="op-card${estaBloqueada(t) ? ' is-bloq' : ''}" draggable="true" data-op-k="${esc(clave(t))}" data-op-abrir="${esc(clave(t))}">
        <span class="op-card-proy">${chipProyecto(t)}</span>
        <div class="op-card-t"><button type="button" class="op-check${estadoOp(t) === 'hecha' ? ' on' : ''}" data-op-hecha="${esc(clave(t))}" title="${estadoOp(t) === 'hecha' ? 'Reabrir' : 'Marcar como hecha'}" aria-label="${estadoOp(t) === 'hecha' ? 'Reabrir' : 'Marcar como hecha'}">✓</button><strong>${esc(t.titulo)}</strong></div>
        ${t.notas ? `<p class="op-card-desc">${esc(richToText(t.notas).replace(/🎬/g, '🎬 vídeo').replace(/\s*•\s*/g, ' · ').replace(/\s*\n+\s*/g, ' · ').replace(/^ · /, '').slice(0, 140))}</p>` : ''}
        ${estaBloqueada(t) ? `<span class="op-bloq">⛔ Bloqueada: ${esc(t.bloqueo)}</span>` : ''}
        <footer>${chipFecha(t, hoy)}${t.comentarios?.length ? `<span class="op-com">💬 ${t.comentarios.length}</span>` : ''}${avatar(t)}</footer>
      </article>`).join('') || '<p class="op-col-vacia">—</p>'}</div></section>`;
  }).join('')}</div>`;
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

// ---- Ficha de una tarea (o nueva del proyecto Agencia) ----
function pintarFicha() {
  const box = body().querySelector('#op-ficha');
  if (!box) return;
  if (creando) {
    box.innerHTML = `<form class="op-form" data-op-form="crear">
      <header class="op-ficha-h"><h3>＋ Tarea de la agencia</h3><button type="button" class="btn ghost small" data-op="cerrar-ficha" aria-label="Cerrar">✕</button></header>
      <p class="muted small">Lo interno que no es de ningún cliente (facturas, contenidos, equipo…). Va al proyecto «Agencia».</p>
      <label class="field"><span>Qué hay que hacer</span><input name="titulo" required maxlength="200" autocomplete="off"></label>
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
  const deAgencia = t.cliente === PROYECTO_AGENCIA;
  box.innerHTML = `<header class="op-ficha-h"><span class="op-fila-meta">${chipProyecto(t)}</span><button type="button" class="btn ghost small" data-op="cerrar-ficha" aria-label="Cerrar">✕</button></header>
    <h3 class="op-ficha-t">${esc(t.titulo)}</h3>
    <div class="pr-campos">
      <div class="pr-campo"><span class="pr-campo-l">Estado</span><div class="pr-campo-v"><div class="op-estados">${ESTADOS_OP.map((x) => `<button type="button" class="op-est e-${x.id}${x.id === e ? ' on' : ''}" data-op-estado="${x.id}">${x.icon} ${esc(x.label)}</button>`).join('')}</div></div></div>
      ${e === 'hecha' ? '' : `<div class="pr-campo"><span class="pr-campo-l">Bloqueo</span><div class="pr-campo-v">${estaBloqueada(t) ? `<span class="op-bloq">⛔ ${esc(t.bloqueo)}</span><button type="button" class="btn ghost small" data-op="desbloquear">Desbloquear</button>` : '<button type="button" class="btn ghost small op-bloquear" data-op="bloquear">⛔ Marcar como bloqueada</button>'}</div></div>`}
      <div class="pr-campo"><span class="pr-campo-l">Fecha</span><div class="pr-campo-v"><input type="date" data-op-campo="fecha" value="${esc(t.fecha)}">${chipFecha(t, hoyMadrid())}</div></div>
      <div class="pr-campo"><span class="pr-campo-l">Responsable</span><div class="pr-campo-v">${d.superadmin ? `<select data-op-campo="uid"><option value="">Sin asignar</option>${d.equipo.map((u) => `<option value="${esc(u.id)}"${t.asignado?.tipo === 'persona' && t.asignado.id === u.id ? ' selected' : ''}>${esc(u.nombre)}</option>`).join('')}${t.asignado?.tipo === 'rol' ? `<option selected>Rol ${esc(t.asignado.rol)}</option>` : ''}</select>` : `${avatar(t)} ${esc(quienTxt(t))}`}</div></div>
      ${t.embudo && !deAgencia ? `<div class="pr-campo"><span class="pr-campo-l">Embudo</span><div class="pr-campo-v">${esc(t.embudo)}</div></div>` : ''}
    </div>
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
  Object.assign(t, { titulo: n.titulo, notas: n.notas || '', fecha: n.fecha || '', estado: estadoOp(n), hecha: Boolean(n.hecha), hechaEn: n.hechaEn || '', bloqueo: n.bloqueo || '', asignado: n.asignado || null, comentarios: (n.comentarios || []).map((c) => ({ id: c.id, uid: c.uid || '', nombre: c.nombre, texto: c.texto, en: c.en })) });
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
  if (v) { vista = v.dataset.opVista; ponerLs(LS_VISTA, vista); pintar(); return; }
  const hecha = e.target.closest('[data-op-hecha]');
  if (hecha) {
    const t = buscarT(hecha.dataset.opHecha);
    if (!t) return;
    const completar = estadoOp(t) !== 'hecha';
    hecha.classList.toggle('on', completar); // se ve al instante; al guardar, la tarjeta pasa a su columna
    hecha.classList.add('hecho-anim');
    cambiarEstado(t, completar ? 'hecha' : 'pendiente');
    return;
  }
  const est = e.target.closest('[data-op-estado]');
  if (est) { const t = buscarT(abierta); if (t && est.dataset.opEstado !== estadoOp(t)) cambiarEstado(t, est.dataset.opEstado); return; }
  const ab = e.target.closest('[data-op-abrir]');
  if (ab && !e.target.closest('a')) { abierta = ab.dataset.opAbrir; creando = false; editandoDesc = false; pintar(); return; }
  const vp = e.target.closest('[data-op-ver-proy]');
  if (vp) { fProy = vp.dataset.opVerProy; vista = 'tablero'; pintar(); return; }
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
  if (b.dataset.op === 'bloquear' || b.dataset.op === 'desbloquear') { const t = buscarT(abierta); if (t) ponerBloqueo(t, b.dataset.op === 'bloquear'); return; }
  if (b.dataset.op === 'cerrar-ficha') { abierta = null; creando = false; editandoDesc = false; pintar(); return; }
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

async function onChange(e) {
  const t0 = e.target;
  if (t0.id === 'op-proyecto') { fProy = t0.value; pintarVista(); return; }
  if (t0.id === 'op-persona') { fPersona = t0.value; pintarVista(); return; }
  const c = t0.dataset.opCampo;
  if (!c) return;
  const t = buscarT(abierta);
  try {
    if (c === 'fecha') await op(t, { op: 'fecha', fecha: t0.value });
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
    if (f.dataset.opForm === 'comentar') {
      const texto = f.texto.value.trim();
      if (!texto) { btn?.removeAttribute('disabled'); return; }
      await op(buscarT(abierta), { op: 'comentar', texto });
      pintarFicha();
      pintarVista();
    } else {
      const notas = editor ? editor.leer() : '';
      const r = await ctx.api('/api/operativa', { method: 'POST', body: { op: 'crear', tarea: { titulo: f.titulo.value, fecha: f.fecha.value, notas, asignado: f.uid.value ? { tipo: 'persona', id: f.uid.value } : null } } });
      creando = false;
      await cargar();
      abierta = `${PROYECTO_AGENCIA}|${CODIGO_AGENCIA}|${r.tarea.id}`;
      pintar();
    }
  } catch (err) { window.alert(err.message); btn?.removeAttribute('disabled'); }
}
