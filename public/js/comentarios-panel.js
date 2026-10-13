// Leads → Comentarios: el muro de comentarios de la preclase de cada clase, para moderarlo y contestar.
// Cada comentario: ⭐ destacar (sale el primero en la página), 🙈 ocultar (deja de verse), 💬 responder (sale
// debajo firmado por la marca) y 🗑️ borrar (solo admin). Filtros: clase, sin responder, destacados, ocultos.
//   pintarComentariosLeads(box, { api, code, nombreDe, esAdmin, botonConfig })
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cuando = (iso) => (iso ? new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '');

// Resumen de los comentarios (también para las pruebas).
export function resumenComentarios(lista) {
  const visibles = lista.filter((c) => !c.oculto);
  return {
    total: visibles.length,
    personas: new Set(lista.map((c) => c.contacto)).size,
    sinResponder: visibles.filter((c) => !c.respuesta).length,
    ocultos: lista.length - visibles.length,
    destacados: visibles.filter((c) => c.destacado).length,
  };
}
export function filtrarComentarios(lista, { clase = '', filtro = '', q = '' } = {}) {
  const t = q.trim().toLowerCase();
  return lista.filter((c) => (!clase || c.clase === clase)
    && (filtro === 'ocultos' ? c.oculto : filtro === 'sin' ? !c.oculto && !c.respuesta : filtro === 'destacados' ? c.destacado && !c.oculto : true)
    && (!t || `${c.nombre} ${c.texto} ${c.respuesta}`.toLowerCase().includes(t)));
}

let st = { clase: '', filtro: 'sin', q: '', respondiendo: '' };
let datos = null;
let opts = null;

export async function pintarComentariosLeads(box, o) {
  opts = o;
  box.innerHTML = '<p class="muted">Cargando comentarios…</p>';
  try {
    datos = await o.api(`/api/comentarios?l=${encodeURIComponent(o.code)}&todo=1`);
  } catch (e) { box.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  if (!box.dataset.listo) {
    box.dataset.listo = '1';
    box.addEventListener('click', (e) => onClick(e, box));
    box.addEventListener('input', (e) => { if (e.target.matches('[data-com-q]')) { st.q = e.target.value; pintarLista(box); } });
  }
  pintar(box);
}

const clasesDe = () => Object.keys(datos?.clases || {}).filter((k) => datos.clases[k].preguntas?.length);
const preguntaDe = (c) => {
  const ps = datos.clases?.[c.clase]?.preguntas || [];
  const i = ps.findIndex((p) => p.id === c.pregunta);
  return i >= 0 ? `P${i + 1} · ${ps[i].texto}` : '';
};

function pintar(box) {
  if (!datos.activa && !datos.comentarios.length) {
    box.innerHTML = `<div class="empty-state"><p><strong>💬 Comentarios de la preclase</strong></p><p class="muted">Debajo de cada clase, las leads responden a las preguntas que haces en ella y se leen entre sí. Actívalo y escribe las preguntas en Configuración → Preclase → Recursos.</p>${opts.botonConfig || ''}</div>`;
    return;
  }
  const r = resumenComentarios(datos.comentarios);
  const tab = (id, txt) => `<button type="button" class="seg-btn${st.clase === id ? ' on' : ''}" data-com-clase="${id}">${txt}</button>`;
  const fil = (id, txt, n) => `<button type="button" class="seg-btn${st.filtro === id ? ' on' : ''}" data-com-filtro="${id}">${txt}${n != null ? ` <b>${n}</b>` : ''}</button>`;
  box.innerHTML = `<div class="com-mod">
    <div class="kpis com-kpis">
      <div class="kpi static"><span class="kpi-label">Comentarios</span><span class="kpi-value">${r.total}</span></div>
      <div class="kpi static"><span class="kpi-label">Personas que comentaron</span><span class="kpi-value">${r.personas}</span></div>
      <div class="kpi static ${r.sinResponder ? 'tone-accent' : ''}"><span class="kpi-label">Sin responder</span><span class="kpi-value">${r.sinResponder}</span></div>
      <div class="kpi static"><span class="kpi-label">Destacados</span><span class="kpi-value">${r.destacados}</span></div>
    </div>
    <p class="muted small">Se publican al momento en la página. ⭐ Destacar lo pone el primero · 🙈 Ocultar lo quita de la página · 💬 Responder sale debajo firmado como <strong>${esc(datos.firma)}</strong>.</p>
    <div class="com-filtros">
      <div class="seg">${tab('', 'Todas las clases')}${clasesDe().map((k) => tab(k, `Clase ${k.replace('clase', '')}`)).join('')}</div>
      <div class="seg">${fil('sin', 'Sin responder', r.sinResponder)}${fil('', 'Todos')}${fil('destacados', '⭐ Destacados', r.destacados)}${fil('ocultos', '🙈 Ocultos', r.ocultos)}</div>
      <input type="search" data-com-q placeholder="Buscar en los comentarios…" value="${esc(st.q)}">
    </div>
    <ol class="com-lista" id="com-lista"></ol>
  </div>`;
  pintarLista(box);
}

function pintarLista(box) {
  const ol = box.querySelector('#com-lista');
  if (!ol) return;
  const lista = filtrarComentarios(datos.comentarios, st);
  ol.innerHTML = lista.map((c) => {
    const nombre = opts.nombreDe?.(c.contacto) || c.nombre;
    return `<li class="com-item${c.oculto ? ' oculto' : ''}${c.destacado ? ' destacado' : ''}" data-com-id="${esc(c.id)}">
      <header><strong>${esc(nombre)}</strong><span class="com-chip">Clase ${esc(c.clase.replace('clase', ''))}</span>${c.destacado ? '<span class="com-chip dest">⭐ Destacado</span>' : ''}${c.oculto ? '<span class="com-chip oc">🙈 Oculto</span>' : ''}<span class="muted small">${esc(cuando(c.en))}</span></header>
      <p class="com-preg muted small">${esc(preguntaDe(c))}</p>
      <p class="com-texto">${esc(c.texto)}</p>
      ${c.respuesta && st.respondiendo !== c.id ? `<div class="com-resp"><strong>${esc(datos.firma)}</strong><p>${esc(c.respuesta)}</p></div>` : ''}
      ${st.respondiendo === c.id ? `<div class="com-responder"><textarea rows="3" maxlength="1500" placeholder="Tu respuesta (sale debajo, firmada como ${esc(datos.firma)})">${esc(c.respuesta)}</textarea><div class="row"><button type="button" class="btn ghost small" data-com="cancelar">Cancelar</button>${c.respuesta ? '<button type="button" class="btn ghost small" data-com="quitar-resp">Quitar respuesta</button>' : ''}<button type="button" class="btn primary small" data-com="guardar-resp">Publicar respuesta</button></div></div>` : ''}
      <footer class="row com-acc">
        <button type="button" class="btn small" data-com="responder">💬 ${c.respuesta ? 'Editar respuesta' : 'Responder'}</button>
        <button type="button" class="btn ghost small" data-com="${c.destacado ? 'quitar-destacado' : 'destacar'}">${c.destacado ? '☆ Quitar destacado' : '⭐ Destacar'}</button>
        <button type="button" class="btn ghost small" data-com="${c.oculto ? 'mostrar' : 'ocultar'}">${c.oculto ? '👁️ Volver a mostrar' : '🙈 Ocultar'}</button>
        ${opts.esAdmin ? '<button type="button" class="btn ghost small danger" data-com="borrar">🗑️</button>' : ''}
      </footer></li>`;
  }).join('') || `<li class="muted">${st.filtro === 'sin' ? '✓ Todo respondido.' : 'No hay comentarios con este filtro.'}</li>`;
}

async function onClick(e, box) {
  const cl = e.target.closest('[data-com-clase]');
  if (cl) { st.clase = cl.dataset.comClase; pintar(box); return; }
  const fi = e.target.closest('[data-com-filtro]');
  if (fi) { st.filtro = fi.dataset.comFiltro; pintar(box); return; }
  const b = e.target.closest('[data-com]');
  if (!b) return;
  const accion = b.dataset.com;
  const li = b.closest('[data-com-id]');
  const c = datos.comentarios.find((x) => x.id === li?.dataset.comId);
  if (!c) return;
  if (accion === 'responder') { st.respondiendo = c.id; pintarLista(box); li.parentElement.querySelector(`[data-com-id="${CSS.escape(c.id)}"] textarea`)?.focus(); return; }
  if (accion === 'cancelar') { st.respondiendo = ''; pintarLista(box); return; }
  if (accion === 'borrar' && !window.confirm('¿Borrar este comentario para siempre? (Ocultarlo lo quita de la página sin borrarlo.)')) return;
  const body = { l: opts.code, id: c.id, op: accion === 'guardar-resp' || accion === 'quitar-resp' ? 'responder' : accion };
  if (accion === 'guardar-resp') body.texto = li.querySelector('textarea').value;
  if (accion === 'quitar-resp') body.texto = '';
  b.disabled = true;
  try {
    const r = await opts.api('/api/comentarios', { method: 'POST', body });
    if (accion === 'borrar') datos.comentarios = datos.comentarios.filter((x) => x !== c);
    else Object.assign(c, r.comentario);
    st.respondiendo = '';
  } catch (err) { window.alert(err.message); }
  pintar(box);
}
