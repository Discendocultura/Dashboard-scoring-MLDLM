// Panel «🎨 Marca y avatar» del dashboard (Cuenta → Marca y avatar): el cuestionario del cliente, sus
// productos, documentos, la ficha de cada producto y qué producto vende cada embudo. Además, la caché
// que usan los prompts (WhatsApp, páginas) para leer la marca.
import { SECCIONES_MARCA, SECCIONES_PRODUCTO, MAX_PRODUCTOS, MAX_DOCS, nombreDeProducto, progreso, promptFicha, productoDeEmbudo } from './marca.js';
import { pintarSecciones, autoguardado, destinoDeBase, extraerTexto, extDe, ACCEPT_DOCS } from './marca-form.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

// ---- Caché para los prompts ----
const cache = new Map(); // cliente → { m, en }
export async function cargarMarca(api, cliente, { fresh = false } = {}) {
  const c = cache.get(cliente);
  if (!fresh && c && Date.now() - c.en < 5 * 60_000) return c.m;
  try {
    const d = await api('/api/marca');
    cache.set(cliente, { m: d.marca, en: Date.now() });
    return d.marca;
  } catch { return c?.m || null; }
}
// Lo que necesita un prompt: { m, producto } del embudo (o null si aún no hay nada).
export async function marcaDeEmbudo(api, cliente, embudoId) {
  const m = await cargarMarca(api, cliente);
  if (!m) return { m: null, producto: null };
  return { m, producto: productoDeEmbudo(m, embudoId) };
}

// ---- Panel ----
let ctx = null; // { api, cliente, clienteNombre, embudos, puedeEditar, dialog }
let m = null;
let prog = null;
let docsActivos = true;
let tab = 'marca';
let saver = null;

const raiz = () => ctx.dialog.querySelector('#mk-body');
const estado = (txt, error = false) => { const el = ctx.dialog.querySelector('#mk-estado'); el.textContent = txt; el.classList.toggle('error', error); };

async function post(body) {
  const d = await ctx.api('/api/marca', { method: 'POST', body });
  m = d.marca;
  prog = d.progreso;
  cache.set(ctx.cliente, { m, en: Date.now() });
  return d;
}

export async function abrirPanelMarca(opts) {
  ctx = opts;
  const dlg = ctx.dialog;
  dlg.querySelector('#mk-cliente').textContent = ctx.clienteNombre ? `· ${ctx.clienteNombre}` : '';
  raiz().innerHTML = '<p class="muted">Cargando…</p>';
  if (!dlg.open) dlg.showModal();
  try {
    const d = await ctx.api('/api/marca');
    m = d.marca; prog = d.progreso; docsActivos = d.docsActivos;
    cache.set(ctx.cliente, { m, en: Date.now() });
  } catch (e) { raiz().innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  if (!saver) {
    saver = autoguardado(raiz(), async ({ base, campos }) => {
      await post({ op: 'campos', ...destinoDeBase(base), campos });
      pintarCabecera();
      actualizarContadores();
    }, estado);
    dlg.addEventListener('close', () => saver.vaciar());
    dlg.addEventListener('click', onClick);
    dlg.addEventListener('change', onChange);
    dlg.addEventListener('submit', onSubmit);
  }
  if (tab.startsWith('p:') && !m.productos.some((p) => `p:${p.id}` === tab)) tab = 'marca';
  pintar();
}

function pintarCabecera() {
  ctx.dialog.querySelector('#mk-prog-bar').style.width = `${prog.pct}%`;
  ctx.dialog.querySelector('#mk-prog-txt').textContent = `${prog.pct} % completado`;
}

function enlaceHtml() {
  const url = m.token ? `${location.origin}/marca.html?c=${encodeURIComponent(ctx.cliente)}&t=${m.token}` : '';
  if (!ctx.puedeEditar) return '';
  return `<section class="mk-enlace"><div><strong>🔗 Enlace para el cliente</strong><span class="muted small">Lo rellena sin cuenta y se guarda solo. Lo que escribáis vosotros aquí también lo verá.</span></div>
    ${url ? `<div class="copy-row"><code>${esc(url)}</code><button type="button" class="btn primary" data-copy-text="${esc(url)}">Copiar</button></div>
      <div class="mk-enlace-acc"><button type="button" class="btn ghost" data-mk="enlace-nuevo">Crear otro (el actual deja de valer)</button><button type="button" class="btn ghost" data-mk="enlace-off">Desactivar</button></div>`
    : '<button type="button" class="btn primary" data-mk="enlace-nuevo">Crear enlace para el cliente</button>'}
  </section>`;
}

function tabsHtml() {
  const t = (id, txt) => `<button type="button" class="mk-tab${tab === id ? ' active' : ''}" data-mk-tab="${esc(id)}">${txt}</button>`;
  return `<nav class="mk-tabs" role="tablist">${t('marca', '🏷️ Marca')}${m.productos.map((p, i) => t(`p:${p.id}`, `📦 ${esc(nombreDeProducto(p, i))}${p.ficha ? ' <span class="mk-ok" title="Con ficha">✓</span>' : ''}`)).join('')}${ctx.puedeEditar && m.productos.length < MAX_PRODUCTOS ? t('nuevo', '＋ Producto') : ''}${t('docs', `📄 Documentos (${m.docs.length})`)}${t('embudos', '🧭 Embudos')}</nav>`;
}

function pintar() {
  pintarCabecera();
  ctx.dialog.querySelector('#mk-enlace').innerHTML = enlaceHtml();
  let cuerpo = '';
  if (tab === 'marca') cuerpo = pintarSecciones(SECCIONES_MARCA, m.respuestas, 'marca', { abiertas: true });
  else if (tab === 'nuevo') cuerpo = `<form class="mk-nuevo" data-mk-form="producto"><label class="field"><span>Nombre del producto</span><input name="nombre" required maxlength="120" placeholder="Raíces"></label><button class="btn primary">Añadir producto</button><p class="muted small">Uno por cada producto con su propia oferta o su propio cliente ideal. Cada embudo elige el suyo en «🧭 Embudos».</p></form>`;
  else if (tab === 'docs') cuerpo = docsHtml();
  else if (tab === 'embudos') cuerpo = embudosHtml();
  else {
    const i = m.productos.findIndex((p) => `p:${p.id}` === tab);
    const p = m.productos[i];
    cuerpo = `${fichaHtml(p, i)}${pintarSecciones(SECCIONES_PRODUCTO, p.respuestas, `producto:${p.id}`, { abiertas: true })}
      ${ctx.puedeEditar ? `<p class="mk-borrar"><button type="button" class="btn ghost danger" data-mk="producto-borrar" data-id="${esc(p.id)}">Borrar este producto</button></p>` : ''}`;
  }
  raiz().innerHTML = `${tabsHtml()}<div class="mk-panel${ctx.puedeEditar ? '' : ' mk-solo-leer'}">${cuerpo}</div>`;
  if (!ctx.puedeEditar) raiz().querySelectorAll('input, textarea, select').forEach((el) => { if (!el.closest('.mk-tabs')) el.disabled = true; });
}

function fichaHtml(p, i) {
  const pr = progreso(SECCIONES_PRODUCTO, p.respuestas);
  return `<section class="mk-ficha">
    <h3>✨ Ficha de marca y avatar de «${esc(nombreDeProducto(p, i))}»</h3>
    <p class="muted small">Es el resumen que usan <strong>todos los prompts</strong> (páginas, WhatsApp…). Mientras no exista, los prompts llevan las respuestas tal cual. Hazla cuando el cuestionario esté bastante completo (este producto: ${pr.pct} %) y rehazla si cambia algo importante.</p>
    <ol class="small">
      <li><button type="button" class="btn primary" data-mk="ficha-prompt" data-id="${esc(p.id)}">📋 Copiar el prompt de la ficha</button> y pégalo en Claude (lleva las respuestas de la marca, de este producto y el texto de sus documentos).</li>
      <li>Pega aquí lo que te devuelva y guarda:</li>
    </ol>
    <textarea id="mk-ficha-txt" rows="${p.ficha ? 12 : 5}" placeholder="# Ficha de marca y avatar…">${esc(p.ficha)}</textarea>
    <p class="mk-ficha-acc"><button type="button" class="btn primary" data-mk="ficha-guardar" data-id="${esc(p.id)}">Guardar la ficha</button><span class="muted small" id="mk-ficha-st">${p.fichaEn ? `Guardada el ${esc(fecha(p.fichaEn))}` : 'Aún sin ficha'}</span></p>
  </section>`;
}

function docsHtml() {
  const nombreProd = (id) => (id ? nombreDeProducto(m.productos.find((p) => p.id === id)) : 'General (la marca)');
  if (!docsActivos) return '<p class="notice warn">Los documentos necesitan la base de datos D1 de Cloudflare.</p>';
  return `<p class="muted small">Estudios del avatar, encuestas, transcripciones de llamadas, testimonios… (PDF, Word, TXT, MD o CSV). Se guarda solo el texto, que entra en el prompt de la ficha. Los PDF escaneados (fotos) no se pueden leer.</p>
    <ul class="mq-docs">${m.docs.map((d) => `<li><span>📄 ${esc(d.nombre)}</span><small class="muted">${esc(nombreProd(d.productoId))} · ${Math.max(1, Math.round(d.chars / 1000))} mil caracteres · ${esc(fecha(d.en))}${d.por ? ` · ${esc(d.por)}` : ''}</small>${ctx.puedeEditar ? `<button type="button" class="btn ghost" data-mk="doc-borrar" data-id="${esc(d.id)}">Quitar</button>` : ''}</li>`).join('') || '<li class="muted">Aún no hay documentos.</li>'}</ul>
    ${ctx.puedeEditar && m.docs.length < MAX_DOCS ? `<div class="mq-subir"><label class="field inline"><span>Es sobre</span><select id="mk-doc-prod"><option value="">General (la marca)</option>${m.productos.map((p, i) => `<option value="${esc(p.id)}">${esc(nombreDeProducto(p, i))}</option>`).join('')}</select></label>
      <label class="btn primary">Subir documentos<input type="file" id="mk-doc-file" accept="${ACCEPT_DOCS}" multiple hidden></label><span id="mk-doc-st" class="small" role="status"></span></div>` : ''}`;
}

function embudosHtml() {
  if (!m.productos.length) return '<p class="muted">Añade primero un producto (＋ Producto).</p>';
  return `<p class="muted small">Qué producto vende cada embudo: sus prompts usarán la ficha de ese producto. Sin elegir, el primero.</p>
    <div class="mk-embudos">${ctx.embudos.map((e) => `<label class="field inline"><span>${esc(e.nombre)}</span><select data-mk-embudo="${esc(e.id)}">${m.productos.map((p, i) => `<option value="${esc(p.id)}"${productoDeEmbudo(m, e.id)?.id === p.id ? ' selected' : ''}>${esc(nombreDeProducto(p, i))}</option>`).join('')}</select></label>`).join('') || '<p class="muted">Este cliente aún no tiene embudos.</p>'}</div>`;
}

function actualizarContadores() {
  for (const det of raiz().querySelectorAll('.mq-sec')) {
    const campos = [...det.querySelectorAll('[data-mq]')];
    const hechas = campos.filter((el) => (el.matches('fieldset') ? el.querySelector('input:checked') : el.value.trim())).length;
    const pr = det.querySelector('.mq-sec-prog');
    pr.textContent = `${hechas}/${campos.length}`;
    pr.classList.toggle('ok', hechas === campos.length);
  }
}

async function onClick(e) {
  const tb = e.target.closest('[data-mk-tab]');
  if (tb) { await saver.vaciar(); tab = tb.dataset.mkTab; pintar(); return; }
  const b = e.target.closest('[data-mk]');
  if (!b) return;
  const acc = b.dataset.mk;
  try {
    if (acc === 'enlace-nuevo') {
      if (m.token && !window.confirm('El enlace actual dejará de funcionar. ¿Crear otro?')) return;
      await post({ op: 'enlace', activar: true }); pintar();
    } else if (acc === 'enlace-off') {
      if (!window.confirm('El cliente ya no podrá entrar con su enlace. ¿Desactivarlo?')) return;
      await post({ op: 'enlace', activar: false }); pintar();
    } else if (acc === 'producto-borrar') {
      if (!window.confirm('Se borran sus respuestas y su ficha (los documentos pasan a «General»). ¿Seguro?')) return;
      await saver.vaciar();
      await post({ op: 'producto-borrar', id: b.dataset.id }); tab = 'marca'; pintar();
    } else if (acc === 'doc-borrar') {
      if (!window.confirm('¿Quitar este documento?')) return;
      await post({ op: 'doc-borrar', id: b.dataset.id }); pintar();
    } else if (acc === 'ficha-guardar') {
      await post({ op: 'ficha', productoId: b.dataset.id, ficha: raiz().querySelector('#mk-ficha-txt').value });
      raiz().querySelector('#mk-ficha-st').textContent = '✓ Guardada';
      raiz().querySelector('.mk-tabs').outerHTML = tabsHtml();
    } else if (acc === 'ficha-prompt') {
      await saver.vaciar();
      b.textContent = 'Preparando…';
      const { textos } = m.docs.length ? await ctx.api('/api/marca?textos=1') : { textos: {} };
      const p = m.productos.find((x) => x.id === b.dataset.id);
      const txt = promptFicha(m, p, textos);
      try {
        await navigator.clipboard.writeText(txt);
      } catch {
        // Sin permiso para copiar (p. ej. el navegador lo bloquea tras esperar a los documentos): a la vista.
        b.insertAdjacentHTML('afterend', `<textarea class="mk-prompt-a-mano" rows="6" readonly>${esc(txt)}</textarea><span class="small muted">Selecciónalo todo y cópialo.</span>`);
        b.textContent = '📋 Copiar el prompt de la ficha';
        return;
      }
      b.textContent = 'Copiado ✓ · pégalo en Claude';
      setTimeout(() => { b.textContent = '📋 Copiar el prompt de la ficha'; }, 3000);
    }
  } catch (err) { window.alert(err.message); }
}

async function onChange(e) {
  const sel = e.target.closest('[data-mk-embudo]');
  if (sel) {
    try { await post({ op: 'embudo', embudo: sel.dataset.mkEmbudo, productoId: sel.value }); estado('✓ Guardado'); } catch (err) { window.alert(err.message); }
    return;
  }
  if (e.target.id !== 'mk-doc-file') return;
  const st = raiz().querySelector('#mk-doc-st');
  const productoId = raiz().querySelector('#mk-doc-prod').value;
  for (const f of [...e.target.files]) {
    st.textContent = `Leyendo «${f.name}»…`;
    try {
      const texto = await extraerTexto(f);
      st.textContent = `Subiendo «${f.name}»…`;
      const d = await post({ op: 'doc-subir', nombre: f.name, tipo: extDe(f.name), productoId, texto });
      if (d.recortado) window.alert(`«${f.name}» es muy largo: se ha guardado el principio.`);
    } catch (err) { window.alert(`«${f.name}»: ${err.message}`); }
  }
  pintar();
}

async function onSubmit(e) {
  const f = e.target.closest('[data-mk-form="producto"]');
  if (!f) return;
  e.preventDefault();
  try {
    const d = await post({ op: 'producto-nuevo', nombre: f.nombre.value.trim() });
    tab = `p:${d.producto.id}`;
    pintar();
  } catch (err) { window.alert(err.message); }
}
