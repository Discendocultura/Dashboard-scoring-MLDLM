// /marca.html?c=<cliente>&t=<enlace>: el cliente rellena su cuestionario de marca y avatar sin cuenta.
import { SECCIONES_MARCA, SECCIONES_PRODUCTO, MAX_PRODUCTOS, MAX_DOCS, nombreDeProducto } from './marca.js';
import { pintarSecciones, autoguardado, destinoDeBase, extraerTexto, extDe, ACCEPT_DOCS } from './marca-form.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const t = params.get('t') || '';
const c = params.get('c') || '';
const qs = c ? `?c=${encodeURIComponent(c)}` : '';
let datos = null;
let saver = null; // autoguardado: antes de repintar se guarda lo pendiente (si no, se perdería)
const guardarPendiente = () => saver?.vaciar();

async function api(body) {
  const res = await fetch(`/api/marca${qs}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify({ ...body, t }) : undefined });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
  return d;
}
const leer = async () => {
  const res = await fetch(`/api/marca?${c ? `c=${encodeURIComponent(c)}&` : ''}t=${encodeURIComponent(t)}`);
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
  return d;
};

function progreso(p) {
  $('#mq-prog-bar').style.width = `${p.pct}%`;
  $('#mq-prog-txt').textContent = `${p.pct} % completado`;
}

function pintar() {
  $('#mq-cliente').textContent = datos.cliente ? `· ${datos.cliente}` : '';
  progreso(datos.progreso);
  const productos = datos.productos.map((p, i) => `<section class="card mq-bloque"><h2>📦 ${esc(nombreDeProducto(p, i))}</h2>${pintarSecciones(SECCIONES_PRODUCTO, p.respuestas, `producto:${p.id}`)}</section>`).join('');
  $('#mq-body').innerHTML = `
    <section class="card mq-bloque"><h2>Tu marca</h2>${pintarSecciones(SECCIONES_MARCA, datos.respuestas, 'marca', { abiertas: false })}</section>
    ${productos}
    <section class="card mq-bloque">
      ${datos.productos.length ? '' : '<p>Añade el producto que vendes (y su cliente ideal):</p>'}
      ${datos.productos.length < MAX_PRODUCTOS ? '<form id="mq-nuevo" class="mq-nuevo"><input id="mq-nuevo-nombre" placeholder="Nombre del producto" maxlength="120" required><button class="btn">＋ Añadir producto</button></form>' : ''}
      <p class="muted small">Si vendes varios productos con un cliente ideal distinto, añade uno por cada uno.</p>
    </section>
    ${docsHtml()}`;
}

function docsHtml() {
  if (!datos.docsActivos) return '';
  const nombreProd = (id) => (id ? nombreDeProducto(datos.productos.find((p) => p.id === id)) : 'General');
  return `<section class="card mq-bloque"><h2>📄 Documentos</h2>
    <p class="muted small">¿Tienes estudios de tu cliente ideal, encuestas, transcripciones de llamadas, testimonios…? Súbelos aquí (PDF, Word, TXT, MD o CSV). Guardamos solo el texto. Los PDF escaneados (fotos) no se pueden leer.</p>
    <ul class="mq-docs">${datos.docs.map((d) => `<li><span>📄 ${esc(d.nombre)}</span><small class="muted">${esc(nombreProd(d.productoId))} · ${Math.round(d.chars / 1000)} mil caracteres</small><button type="button" class="btn ghost" data-borrar-doc="${esc(d.id)}">Quitar</button></li>`).join('') || '<li class="muted">Aún no hay documentos.</li>'}</ul>
    ${datos.docs.length < MAX_DOCS ? `<div class="mq-subir"><label class="field inline"><span>Es sobre</span><select id="mq-doc-prod"><option value="">General (la marca)</option>${datos.productos.map((p, i) => `<option value="${esc(p.id)}">${esc(nombreDeProducto(p, i))}</option>`).join('')}</select></label>
      <label class="btn primary">Subir documentos<input type="file" id="mq-doc-file" accept="${ACCEPT_DOCS}" multiple hidden></label><span id="mq-doc-st" class="small" role="status"></span></div>` : `<p class="muted small">Máximo ${MAX_DOCS} documentos.</p>`}
  </section>`;
}

async function iniciar() {
  if (!t) { $('#mq-body').innerHTML = '<p class="error">Falta la clave del enlace. Ábrelo tal cual te lo enviamos.</p>'; return; }
  try { datos = await leer(); } catch (e) { $('#mq-body').innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  pintar();
  saver = autoguardado($('#mq-body'), async ({ base, campos }) => {
    const d = await api({ op: 'campos', ...destinoDeBase(base), campos });
    datos = { ...datos, respuestas: d.respuestas, productos: d.productos, docs: d.docs, progreso: d.progreso };
    progreso(d.progreso);
    // Contadores de cada sección (sin repintar: no se pierde lo que se está escribiendo)
    actualizarContadores();
  }, (txt, error) => { const el = $('#mq-estado'); el.textContent = txt; el.classList.toggle('error', Boolean(error)); });
}

function actualizarContadores() {
  for (const det of document.querySelectorAll('.mq-sec')) {
    const campos = [...det.querySelectorAll('[data-mq]')];
    const hechas = campos.filter((el) => (el.matches('fieldset') ? el.querySelector('input:checked') : el.value.trim())).length;
    const prog = det.querySelector('.mq-sec-prog');
    prog.textContent = `${hechas}/${campos.length}`;
    prog.classList.toggle('ok', hechas === campos.length);
  }
}

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'mq-nuevo') return;
  e.preventDefault();
  const nombre = $('#mq-nuevo-nombre').value.trim();
  if (!nombre) return;
  await guardarPendiente();
  try {
    const d = await api({ op: 'producto-nuevo', nombre });
    datos = { ...datos, ...d };
    pintar();
    document.querySelector(`[data-mq^="producto:${d.producto.id}"]`)?.closest('details')?.setAttribute('open', '');
  } catch (err) { window.alert(err.message); }
});

document.addEventListener('change', async (e) => {
  if (e.target.id !== 'mq-doc-file') return;
  const files = [...e.target.files];
  const st = $('#mq-doc-st');
  const productoId = $('#mq-doc-prod').value;
  await guardarPendiente();
  for (const f of files) {
    st.textContent = `Leyendo «${f.name}»…`;
    try {
      const texto = await extraerTexto(f);
      st.textContent = `Subiendo «${f.name}»…`;
      const d = await api({ op: 'doc-subir', nombre: f.name, tipo: extDe(f.name), productoId, texto });
      datos = { ...datos, ...d };
    } catch (err) { window.alert(`«${f.name}»: ${err.message}`); }
  }
  pintar();
});

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-borrar-doc]');
  if (!b || !window.confirm('¿Quitar este documento?')) return;
  await guardarPendiente();
  try { datos = { ...datos, ...(await api({ op: 'doc-borrar', id: b.dataset.borrarDoc })) }; pintar(); } catch (err) { window.alert(err.message); }
});

iniciar();
