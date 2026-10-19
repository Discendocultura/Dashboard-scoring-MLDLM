// Panel «🔗 Accesos rápidos» (menú lateral de cada cliente): los enlaces que se añaden a mano (Drive, GHL,
// Canva…) en tarjetas; un clic abre el enlace en otra pestaña. Buscador (Intro abre el primero). Quien puede
// configurar los añade («Pega un enlace»), los ordena, los agrupa y los quita.
//   abrirAtajos({ api, dialog, cliente })
import { servicioDe, agruparAtajos, buscarAtajos, urlValida, MAX_ATAJOS } from './atajos.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let ctx = null;
let d = { enlaces: [], puedeEditar: false, esAdmin: false };
let editando = null; // copia de los enlaces mientras se editan
let q = '';

const body = () => ctx.dialog.querySelector('#at-body');

export async function abrirAtajos(opts) {
  ctx = opts;
  const dlg = ctx.dialog;
  if (!dlg.dataset.listo) {
    dlg.dataset.listo = '1';
    dlg.querySelector('#at-cerrar').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', onClick);
    dlg.addEventListener('input', (e) => { if (e.target.id === 'at-buscar') { q = e.target.value; pintarLista(); } });
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.id === 'at-buscar') { e.preventDefault(); body().querySelector('.at-card')?.click(); }
      if (e.key === 'Enter' && e.target.closest('#at-rapido')) { e.preventDefault(); anadirRapido(); }
    });
  }
  dlg.querySelector('#at-titulo').innerHTML = `🔗 Tus atajos <span class="muted">· ${esc(ctx.cliente || '')}</span>`;
  editando = null;
  q = '';
  body().innerHTML = '<p class="muted">Cargando…</p>';
  if (!dlg.open) dlg.showModal();
  try { d = await ctx.api('/api/atajos'); } catch (e) { body().innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  pintar();
}

function tarjeta(a) {
  const s = servicioDe(a.url);
  return `<a class="at-card" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" title="${esc(a.url)}">
    <span class="at-ico" aria-hidden="true">${s.icono}</span>
    <span class="at-txt"><strong>${esc(a.nombre)}</strong><small>${esc(a.nota || s.servicio)}</small></span>
    ${a.soloAdmin ? '<span class="at-lock" title="Solo lo ve el admin">🔒</span>' : ''}<span class="at-ir" aria-hidden="true">↗</span></a>`;
}

function pintar() {
  if (editando) { pintarEdicion(); return; }
  const vacio = !d.enlaces.length;
  body().innerHTML = `
    ${vacio ? '' : '<label class="pr-buscar at-buscar"><span aria-hidden="true">🔎</span><input id="at-buscar" type="search" placeholder="Busca y pulsa Intro para abrirlo…" autocomplete="off"></label>'}
    <div id="at-lista"></div>
    ${d.puedeEditar ? `<div class="at-rapido" id="at-rapido">
      <span class="at-rapido-t">＋ Añadir un enlace</span>
      <input name="url" type="url" placeholder="Pega aquí el enlace (Drive, GHL, Canva…)" aria-label="Enlace">
      <input name="nombre" maxlength="60" placeholder="Nombre (p. ej. Carpeta de diseños)" aria-label="Nombre">
      <button type="button" class="btn primary" data-at="anadir">Añadir</button>
      ${d.enlaces.length ? '<button type="button" class="btn ghost" data-at="editar">✏️ Ordenar y editar</button>' : ''}
      <p class="error small" id="at-err" hidden></p>
    </div>` : ''}`;
  pintarLista();
  // En el ordenador, el cursor ya en el buscador (escribir + Intro). En el móvil no, para que no salte el teclado.
  if (window.matchMedia?.('(min-width: 700px)').matches) (body().querySelector('#at-buscar') || body().querySelector('#at-rapido input'))?.focus();
}

function pintarLista() {
  const box = body().querySelector('#at-lista');
  if (!box) return;
  if (!d.enlaces.length) {
    box.innerHTML = `<div class="at-vacio"><p class="at-vacio-ico">🔗</p><p><strong>Tus enlaces de este proyecto, a dos clics.</strong></p><p class="muted">${d.puedeEditar ? 'Pega abajo el enlace de la carpeta de Drive, la subcuenta de GHL, Canva, el Administrador de anuncios… y aparecerán aquí como tarjetas.' : 'Todavía no hay enlaces. Pide a la administradora que los añada.'}</p></div>`;
    return;
  }
  const lista = buscarAtajos(d.enlaces, q);
  box.innerHTML = lista.length
    ? agruparAtajos(lista).map((g) => `<section class="at-grupo">${g.grupo ? `<h3>${esc(g.grupo)}</h3>` : ''}<div class="at-grid">${g.enlaces.map(tarjeta).join('')}</div></section>`).join('')
    : '<p class="muted">Ningún enlace coincide con la búsqueda.</p>';
}

function pintarEdicion() {
  body().innerHTML = `<p class="muted small">Ordena con ↑ ↓, ponles un grupo (p. ej. «Diseño», «Publicidad») para agruparlos y una nota corta si quieres. ${d.esAdmin ? '«Solo admin» lo oculta al resto del equipo.' : ''}</p>
    <ol class="at-edit">${editando.map((a, i) => `<li class="at-edit-fila" data-i="${i}">
      <span class="at-ico" aria-hidden="true">${servicioDe(a.url).icono}</span>
      <div class="at-edit-campos">
        <input data-c="nombre" maxlength="60" value="${esc(a.nombre)}" placeholder="Nombre" aria-label="Nombre">
        <input data-c="url" type="url" value="${esc(a.url)}" placeholder="https://…" aria-label="Enlace">
        <input data-c="grupo" maxlength="40" value="${esc(a.grupo)}" placeholder="Grupo (opcional)" aria-label="Grupo" list="at-grupos">
        <input data-c="nota" maxlength="140" value="${esc(a.nota)}" placeholder="Nota (opcional)" aria-label="Nota">
        ${d.esAdmin ? `<label class="chk small"><input type="checkbox" data-c="soloAdmin" ${a.soloAdmin ? 'checked' : ''}> Solo admin</label>` : ''}
      </div>
      <div class="at-edit-acc"><button type="button" class="btn ghost small" data-at="subir" ${i ? '' : 'disabled'} aria-label="Subir">↑</button><button type="button" class="btn ghost small" data-at="bajar" ${i < editando.length - 1 ? '' : 'disabled'} aria-label="Bajar">↓</button><button type="button" class="btn ghost small danger" data-at="quitar" aria-label="Quitar">✕</button></div>
    </li>`).join('')}</ol>
    <datalist id="at-grupos">${[...new Set(editando.map((a) => a.grupo).filter(Boolean))].map((g) => `<option value="${esc(g)}">`).join('')}</datalist>
    <footer class="row at-edit-pie"><button type="button" class="btn ghost" data-at="cancelar">Cancelar</button><button type="button" class="btn primary" data-at="guardar">Guardar cambios</button><span class="error small" id="at-err" hidden></span></footer>`;
}

function leerEdicion() {
  for (const li of body().querySelectorAll('.at-edit-fila')) {
    const a = editando[Number(li.dataset.i)];
    li.querySelectorAll('[data-c]').forEach((el) => { a[el.dataset.c] = el.type === 'checkbox' ? el.checked : el.value; });
  }
}

async function guardar(enlaces) {
  const r = await ctx.api('/api/atajos', { method: 'POST', body: { enlaces } });
  d.enlaces = r.enlaces;
}
const error = (t) => { const e = body().querySelector('#at-err'); if (e) { e.textContent = t; e.hidden = !t; } };

async function anadirRapido() {
  const f = body().querySelector('#at-rapido');
  const inUrl = f.querySelector('[name=url]');
  const inNombre = f.querySelector('[name=nombre]');
  const url = urlValida(inUrl.value);
  if (!url) { error('Pega un enlace completo (que empiece por https://).'); inUrl.focus(); return; }
  if (d.enlaces.length >= MAX_ATAJOS) { error(`Máximo ${MAX_ATAJOS} enlaces.`); return; }
  try {
    await guardar([...d.enlaces, { url, nombre: inNombre.value.trim() || servicioDe(url).servicio }]);
    pintar();
  } catch (e) { error(e.message); }
}

async function onClick(e) {
  const b = e.target.closest('[data-at]');
  if (!b) return;
  const a = b.dataset.at;
  if (a === 'anadir') return anadirRapido();
  if (a === 'editar') { editando = d.enlaces.map((x) => ({ ...x })); pintar(); return; }
  if (a === 'cancelar') { editando = null; pintar(); return; }
  if (!editando) return;
  leerEdicion();
  const i = Number(b.closest('[data-i]')?.dataset.i);
  if (a === 'subir' && i > 0) [editando[i - 1], editando[i]] = [editando[i], editando[i - 1]];
  else if (a === 'bajar' && i < editando.length - 1) [editando[i + 1], editando[i]] = [editando[i], editando[i + 1]];
  else if (a === 'quitar') editando.splice(i, 1);
  else if (a === 'guardar') {
    const mal = editando.find((x) => !urlValida(x.url));
    if (mal) { error(`El enlace de «${mal.nombre || 'sin nombre'}» no es válido (debe empezar por https://).`); return; }
    b.disabled = true;
    try { await guardar(editando); editando = null; } catch (err) { error(err.message); b.disabled = false; return; }
  }
  pintar();
}
