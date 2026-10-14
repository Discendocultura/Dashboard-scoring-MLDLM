// Enlaces entre tareas y tableros escribiendo «@» (en la descripción y en los comentarios), en la Operativa y en
// las tareas de cada proyecto.
//   Referencias: «#tarea:<cliente>|<código>|<id>» y «#tablero:<proyecto>|<id>».
//   Descripción (texto con formato): <a href="#tarea:…">Título</a> (richtext.js las deja pasar).
//   Comentarios (texto plano): «@[Título](#tarea:…)», que al mostrarse es un enlace.
//   activarArroba(campo, buscar)  →  lista de sugerencias al escribir «@» en un textarea o un editor (contenteditable).

const PARTE = '[A-Za-z0-9_.-]{1,60}';
export const RE_REF = new RegExp(`^#(tarea|tablero):(${PARTE}(?:\\|${PARTE}){1,2})$`);
export const refTarea = (cliente, code, id) => `#tarea:${cliente}|${code}|${id}`;
export const refTablero = (proyecto, id) => `#tablero:${proyecto}|${id}`;

// { tipo: 'tarea', cliente, code, id } · { tipo: 'tablero', proyecto, id } · o null.
export function leerRef(href) {
  const m = RE_REF.exec(String(href || '').trim());
  if (!m) return null;
  const p = m[2].split('|');
  if (m[1] === 'tarea') return p.length === 3 ? { tipo: 'tarea', cliente: p[0], code: p[1], id: p[2] } : null;
  return p.length === 2 ? { tipo: 'tablero', proyecto: p[0], id: p[1] } : null;
}

const limpiarTitulo = (s) => String(s || '').replace(/[[\]\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Sin título';
export const tokenComentario = (titulo, ref) => `@[${limpiarTitulo(titulo)}](${ref})`;

// En un texto YA escapado (HTML), los «@[Título](#ref)» pasan a ser enlaces.
const RE_TOKEN = /@\[([^\]\n]{1,200})\]\((#(?:tarea|tablero):[A-Za-z0-9_.|-]{3,200})\)/g;
export function enlacesEnTexto(html) {
  return String(html || '').replace(RE_TOKEN, (todo, titulo, ref) => {
    const r = leerRef(ref);
    return r ? `<a href="${ref}" class="enlace-int e-${r.tipo}">${titulo}</a>` : todo;
  });
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Filtra candidatos [{ ref, titulo, sub, icono }] por lo escrito tras la «@» (cada palabra tiene que aparecer).
export function filtrarEnlaces(items, q, max = 8) {
  const ps = norm(q).split(/\s+/).filter(Boolean);
  return items.filter((x) => { const t = norm(`${x.titulo} ${x.sub || ''}`); return ps.every((p) => t.includes(p)); }).slice(0, max);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RE_ARROBA = /(^|[\s(])@([^\s@[\]]{0,30})$/;

// Qué se está buscando ahora: { q, quitar() } con lo escrito tras la «@» antes del cursor (o null).
function consulta(el) {
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    const pre = el.value.slice(0, el.selectionStart);
    const m = RE_ARROBA.exec(pre);
    return m ? { q: m[2], tipo: 'texto', inicio: pre.length - m[2].length - 1 } : null;
  }
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed) return null;
  const nodo = sel.anchorNode;
  if (!nodo || nodo.nodeType !== 3 || !el.contains(nodo) || nodo.parentElement?.closest('a')) return null;
  const pre = nodo.data.slice(0, sel.anchorOffset);
  const m = RE_ARROBA.exec(pre);
  return m ? { q: m[2], tipo: 'rico', nodo, inicio: pre.length - m[2].length - 1, fin: sel.anchorOffset } : null;
}

function insertar(el, c, item) {
  if (c.tipo === 'texto') {
    const antes = el.value.slice(0, c.inicio);
    const despues = el.value.slice(el.selectionStart).replace(/^\s+/, '');
    const tok = `${tokenComentario(item.titulo, item.ref)} `;
    el.value = antes + tok + despues;
    const pos = antes.length + tok.length;
    el.focus();
    el.setSelectionRange(pos, pos);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  const r = document.createRange();
  r.setStart(c.nodo, c.inicio);
  r.setEnd(c.nodo, c.fin);
  r.deleteContents();
  const a = document.createElement('a');
  a.href = item.ref;
  a.className = `enlace-int e-${leerRef(item.ref)?.tipo || 'tarea'}`;
  a.textContent = limpiarTitulo(item.titulo);
  const esp = document.createTextNode(' ');
  r.insertNode(esp);
  r.insertNode(a);
  const s = window.getSelection();
  const fin = document.createRange();
  fin.setStart(esp, 1);
  fin.collapse(true);
  s.removeAllRanges();
  s.addRange(fin);
  el.focus();
}

// buscar(q) → [{ ref, titulo, sub, icono }] (o una promesa). Devuelve una función para quitarlo.
export function activarArroba(el, buscar) {
  if (!el || el.dataset.arroba) return () => {};
  el.dataset.arroba = '1';
  const caja = el.parentElement;
  if (getComputedStyle(caja).position === 'static') caja.style.position = 'relative';
  const lista = document.createElement('div');
  lista.className = 'arroba-lista';
  lista.setAttribute('role', 'listbox');
  lista.hidden = true;
  caja.appendChild(lista);
  let items = [];
  let activo = 0;
  let actual = null;
  let turno = 0;
  const cerrar = () => { lista.hidden = true; items = []; actual = null; };
  const pintar = () => {
    lista.innerHTML = items.length
      ? `<div class="arroba-h">Enlazar una tarea o un tablero</div>${items.map((x, i) => `<button type="button" role="option" class="${i === activo ? 'activo' : ''}" data-arroba-i="${i}"><span class="arroba-ico" aria-hidden="true">${esc(x.icono || '📝')}</span><span class="arroba-t">${esc(x.titulo)}</span>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</button>`).join('')}`
      : '<div class="arroba-h">Ninguna tarea ni tablero con ese nombre</div>';
    lista.style.top = `${el.offsetTop + el.offsetHeight + 4}px`;
    lista.style.left = `${el.offsetLeft}px`;
    lista.style.width = `${Math.min(420, Math.max(260, el.offsetWidth))}px`;
    lista.hidden = false;
  };
  const revisar = async () => {
    const c = consulta(el);
    if (!c) { cerrar(); return; }
    const t = ++turno;
    const r = await buscar(c.q);
    if (t !== turno) return;
    actual = c;
    items = Array.isArray(r) ? r : [];
    activo = 0;
    pintar();
  };
  const elegir = (i) => {
    const c = consulta(el) || actual;
    if (!c || !items[i]) return;
    insertar(el, c, items[i]);
    cerrar();
  };
  const onInput = () => { revisar(); };
  const onKey = (e) => {
    if (lista.hidden || !items.length) { if (e.key === 'Escape' && !lista.hidden) { e.preventDefault(); e.stopPropagation(); cerrar(); } return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); activo = (activo + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; pintar(); return; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); elegir(activo); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(); }
  };
  const onBlur = () => setTimeout(() => { if (!lista.contains(document.activeElement)) cerrar(); }, 150);
  lista.addEventListener('mousedown', (e) => e.preventDefault()); // no perder el cursor del campo
  lista.addEventListener('click', (e) => { const b = e.target.closest('[data-arroba-i]'); if (b) elegir(Number(b.dataset.arrobaI)); });
  el.addEventListener('input', onInput);
  el.addEventListener('keydown', onKey, true);
  el.addEventListener('blur', onBlur);
  return () => { el.removeEventListener('input', onInput); el.removeEventListener('keydown', onKey, true); el.removeEventListener('blur', onBlur); lista.remove(); delete el.dataset.arroba; };
}
