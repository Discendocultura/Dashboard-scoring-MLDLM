// Mi negocio → 📦 Productos: la ventana para poner cada producto con su precio, la etiqueta de GHL de quien lo
// compra y sus ofertas (el mismo producto a otro precio, con su propia etiqueta). Todo paso a paso y explicado.
// De aquí bebe la Inteligencia de negocio (cuánto factura cada producto y oferta, y qué compran después).
//   abrirProductos({ api, dialog, cliente, embudos, tags, pintarSelectFecha, onGuardado })
import { TIPOS_PRODUCTO, MODOS_IVA, IVA_DEF, MAX_OFERTAS, sanitizeCatalogo, sanitizeProducto, nuevoId, sinIva, faltasProducto } from './productos.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: Number(n) % 1 ? 2 : 0 });
const icoTipo = (t) => TIPOS_PRODUCTO.find((x) => x.id === t)?.ico || '📦';
const TIPO_EMB = { lanzamientos: '🚀', vsl: '🎬', directa: '🛒' };

let ctx = null;
let cat = null; // el catálogo guardado
let puedeEditar = false;
let borrador = null; // el producto que se edita (copia)
let esNuevo = false;
const body = () => ctx.dialog.querySelector('#pd-body');

export async function abrirProductos(opts) {
  ctx = opts;
  const dlg = ctx.dialog;
  if (!dlg.dataset.listo) {
    dlg.dataset.listo = '1';
    dlg.querySelector('#pd-cerrar').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', onClick);
    dlg.addEventListener('input', onInput);
    dlg.addEventListener('change', onInput);
  }
  dlg.querySelector('#pd-titulo').innerHTML = `📦 Productos <span class="muted">· ${esc(ctx.cliente || '')}</span>`;
  borrador = null;
  body().innerHTML = '<p class="muted">Cargando…</p>';
  if (!dlg.open) dlg.showModal();
  try { const d = await ctx.api('/api/productos'); cat = d.catalogo; puedeEditar = d.puedeEditar; } catch (e) { body().innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  pintarLista();
}

// ---------- La lista ----------
function pintarLista(aviso = '') {
  const ps = cat.productos;
  const nombreDe = (id) => ps.find((p) => p.id === id)?.nombre || '';
  const tarjeta = (p) => {
    const faltan = faltasProducto(p);
    return `<article class="pd-card${faltan.length ? ' falta' : ''}">
      <span class="pd-card-ico" aria-hidden="true">${icoTipo(p.tipo)}</span>
      <div class="pd-card-t"><strong>${esc(p.nombre)}</strong>
        <span class="pd-card-precio">${p.precio ? `${eur(p.precio)} <small>${esc(MODOS_IVA.find((m) => m.id === p.iva)?.nombre || '')}</small>` : '<small class="pd-falta">Sin precio</small>'}</span>
        <span class="pd-chips">${p.etiqueta ? `<span class="pd-tag" title="Etiqueta de quien lo compra">🏷️ ${esc(p.etiqueta)}</span>` : ''}${p.ofertas.length ? `<span class="pd-chip">🎟️ ${p.ofertas.length} ${p.ofertas.length === 1 ? 'oferta' : 'ofertas'}</span>` : ''}${p.siguiente && nombreDe(p.siguiente) ? `<span class="pd-chip">🎯 Lleva a ${esc(nombreDe(p.siguiente))}</span>` : ''}</span>
        ${faltan.length ? `<small class="pd-falta">⚠️ Falta ${esc(faltan.join(', '))}</small>` : '<small class="pd-ok">✓ Listo: ya cuenta en la Inteligencia de negocio</small>'}</div>
      ${puedeEditar ? `<button type="button" class="btn" data-pd-editar="${esc(p.id)}">✏️ Editar</button>` : ''}
    </article>`;
  };
  body().innerHTML = `
    <section class="pd-intro">
      <div class="pd-intro-t"><h3>Lo que vendes, a qué precio y quién lo ha comprado</h3>
        <p>Con esto, la <b>Inteligencia de negocio</b> sabe cuánto factura cada producto, a qué precio se vende de verdad y qué compran después tus clientes.</p></div>
      <ol class="pd-pasos">
        <li><b>1</b><span>📝</span><strong>Nombre y precio</strong><small>El precio normal, sin descuentos</small></li>
        <li><b>2</b><span>🏷️</span><strong>La etiqueta de compra</strong><small>La que GHL pone a quien lo paga</small></li>
        <li><b>3</b><span>🎟️</span><strong>Sus ofertas</strong><small>Si a veces lo vendes a otro precio</small></li>
      </ol>
    </section>
    ${aviso ? `<p class="pd-aviso-ok" role="status">${aviso}</p>` : ''}
    ${ps.length ? `<div class="pd-lista">${ps.map(tarjeta).join('')}</div>` : `<div class="pd-vacio"><span aria-hidden="true">📦</span><h3>Aún no has puesto ningún producto</h3><p class="muted">Empieza por el que más vendes. En 1 minuto está.</p></div>`}
    ${puedeEditar ? `<button type="button" class="pd-nuevo" data-pd-nuevo><span aria-hidden="true">＋</span> Añadir ${ps.length ? 'otro producto' : 'tu primer producto'}</button>` : '<p class="muted small">Solo quien configura AlquimIA puede cambiar los productos.</p>'}`;
}

// ---------- El editor, paso a paso ----------
function pintarEditor(error = '') {
  const p = borrador;
  const otros = cat.productos.filter((x) => x.id !== p.id);
  const estadoTag = (t) => `<span class="pd-tag-estado">${textoTag(t)}</span>`;
  const hecho = hechos(p);
  const paso = (n, titulo, sub, contenido, opcional = false) => `<section class="pd-paso${hecho[n] ? ' hecho' : ''}" data-paso="${n}" data-opcional="${opcional ? 1 : ''}">
      <header><span class="pd-num">${hecho[n] && !opcional ? '✓' : n}</span><div><h4>${titulo}${opcional ? ' <small>(opcional)</small>' : ''}</h4><p>${sub}</p></div></header>
      <div class="pd-paso-c">${contenido}</div></section>`;
  body().innerHTML = `
    <div class="pd-ed-cab"><button type="button" class="btn ghost" data-pd-volver>← Tus productos</button><h3>${esNuevo ? '＋ Nuevo producto' : `✏️ ${esc(p.nombre)}`}</h3></div>
    ${paso(1, '¿Cómo se llama?', 'El nombre con el que lo conoces (así saldrá en la Inteligencia de negocio).', `
      <input class="pd-in" data-f="nombre" maxlength="60" placeholder="Raíces, Reto Ovulación, Mentoría…" value="${esc(p.nombre)}">
      <div class="pd-tipos" role="radiogroup" aria-label="Qué tipo de producto es">${TIPOS_PRODUCTO.map((t) => `<button type="button" role="radio" aria-checked="${p.tipo === t.id}" class="pd-tipo${p.tipo === t.id ? ' on' : ''}" data-pd-tipo="${t.id}"><span>${t.ico}</span><strong>${t.nombre}</strong><small>${t.texto}</small></button>`).join('')}</div>`)}
    ${paso(2, '¿Cuánto cuesta?', 'El precio normal, sin descuentos. Si se paga a plazos, el total.', `
      <div class="pd-precio"><label class="pd-eur"><input class="pd-in" data-f="precio" inputmode="decimal" placeholder="997" value="${p.precio || ''}"><span>€</span></label>
        <div class="pd-seg" role="radiogroup" aria-label="IVA">${MODOS_IVA.map((m) => `<button type="button" role="radio" aria-checked="${p.iva === m.id}" class="${p.iva === m.id ? 'on' : ''}" data-pd-iva="${m.id}" title="${esc(m.texto)}">${m.nombre}</button>`).join('')}</div></div>
      <p class="pd-nota pd-nota-precio">${notaPrecio(p)}</p>`)}
    ${paso(3, '¿Qué etiqueta pone GHL a quien lo compra?', 'La que añade tu workflow de compra al pagar (en GHL: Automatización → el workflow que salta con el pago → acción «Añadir etiqueta»). Así sabemos quién lo ha comprado.', `
      <input class="pd-in" data-f="etiqueta" list="tag-list" maxlength="100" placeholder="p. ej. clienta-raices" value="${esc(p.etiqueta)}" autocomplete="off">
      ${estadoTag(p.etiqueta)}
      <p class="pd-nota">💡 Escribe y elige de la lista: salen las etiquetas que ya tienes en GHL. Si quien compra con oferta recibe otra etiqueta, va en el paso 4.</p>`)}
    ${paso(4, '¿Lo vendes a veces a otro precio?', 'Una <b>oferta</b> es este mismo producto a un precio distinto: precio de lanzamiento, Black Friday, precio para alumnas… Si quien compra con oferta lleva <b>otra etiqueta</b>, añádela: así sabremos cuánto se vendió a cada precio.', `
      ${p.ofertas.length ? `<div class="pd-ofertas">${p.ofertas.map((o, i) => `<div class="pd-oferta" data-of="${i}">
          <span class="pd-oferta-ico" aria-hidden="true">🎟️</span>
          <label><small>Nombre de la oferta</small><input class="pd-in" data-of-f="nombre" maxlength="60" placeholder="Black Friday" value="${esc(o.nombre)}"></label>
          <label class="pd-of-precio"><small>Precio</small><span class="pd-eur"><input class="pd-in" data-of-f="precio" inputmode="decimal" placeholder="697" value="${o.precio || ''}"><span>€</span></span></label>
          <label class="pd-of-tag"><small>Etiqueta de quien compra con esta oferta</small><input class="pd-in" data-of-f="etiqueta" list="tag-list" maxlength="100" placeholder="raices-black-friday" value="${esc(o.etiqueta)}" autocomplete="off">${estadoTag(o.etiqueta)}</label>
          <button type="button" class="btn ghost small" data-pd-quitar-oferta="${i}" aria-label="Quitar esta oferta">✕</button></div>`).join('')}</div>`
        : '<p class="pd-nota">Sin ofertas: siempre se vende al mismo precio.</p>'}
      ${p.ofertas.length < MAX_OFERTAS ? '<button type="button" class="btn" data-pd-oferta>＋ Añadir una oferta</button>' : ''}`)}
    ${paso(5, '¿Dónde se vende?', 'Los embudos que venden este producto: de ellos sacamos su coste por lead, el ROAS y la conversión.', ctx.embudos.length
      ? `<div class="pd-embs">${ctx.embudos.map((e) => `<button type="button" class="pd-emb${p.embudos.includes(e.id) ? ' on' : ''}" data-pd-emb="${esc(e.id)}" aria-pressed="${p.embudos.includes(e.id)}">${TIPO_EMB[e.tipo] || '🧩'} ${esc(e.nombre)}${p.embudos.includes(e.id) ? ' ✓' : ''}</button>`).join('')}</div>`
      : '<p class="pd-nota">Aún no hay embudos en este cliente.</p>')}
    ${paso(6, '¿Qué quieres que compren después?', 'Si este producto es un paso hacia otro (p. ej. el reto → tu programa), elígelo: verás cuántos de sus compradores dan el salto.', otros.length
      ? `<select class="pd-in" data-f="siguiente"><option value="">— Ninguno —</option>${otros.map((o) => `<option value="${esc(o.id)}"${p.siguiente === o.id ? ' selected' : ''}>${icoTipo(o.tipo)} ${esc(o.nombre)}</option>`).join('')}</select>`
      : '<p class="pd-nota">Cuando añadas otro producto, podrás elegirlo aquí.</p>', true)}
    ${paso(7, '¿Cuándo lo compró cada persona?', 'Si tu workflow de compra guarda la fecha en un campo de GHL, elígelo: así se ve por meses y en qué orden compran. Si no, usamos la fecha de su compra en el embudo.', '<select class="pd-in" data-f="fechaCampo" id="pd-fecha"></select>', true)}
    ${error ? `<p class="pd-error" role="alert">${error}</p>` : ''}
    <div class="pd-pie">
      ${esNuevo ? '' : '<button type="button" class="btn ghost danger" data-pd-borrar>Borrar producto</button>'}
      <span class="spacer"></span>
      <button type="button" class="btn ghost" data-pd-volver>Cancelar</button>
      <button type="button" class="btn primary" data-pd-guardar>💾 Guardar producto</button>
    </div>`;
  ctx.pintarSelectFecha?.(body().querySelector('#pd-fecha'), p.fechaCampo, { vacio: '— Sin campo de fecha —' });
}

const hechos = (p) => ({ 1: Boolean(p.nombre), 2: p.precio > 0, 3: Boolean(p.etiqueta), 4: true, 5: p.embudos.length > 0, 6: true, 7: Boolean(p.fechaCampo) });
// Si la etiqueta existe en GHL (con la lista de etiquetas cargada).
function textoTag(t) {
  const tags = ctx.tags?.() || null;
  return !t || !tags?.length ? '' : tags.includes(t) ? '<small class="pd-ok">✓ Existe en GHL</small>' : '<small class="pd-aviso">⚠️ No la encuentro en GHL: revisa que esté bien escrita</small>';
}
const notaPrecio = (p) => (p.precio ? `💶 Cuenta como <b>${eur(sinIva(p.precio, p.iva, cat.ivaPct || IVA_DEF))}</b> facturados por venta (sin IVA${p.iva === 'incluido' ? `, al ${cat.ivaPct || IVA_DEF} %` : ''}).` : '');

// Lo que se escribe va al borrador y se actualiza solo lo que cambia (sin repintar: no se pierde el foco ni el clic).
function onInput(e) {
  if (!borrador) return;
  const t = e.target;
  const f = t.dataset.f;
  const ofi = t.closest('[data-of]');
  const valor = (k) => (k === 'precio' ? Number(String(t.value).replace(',', '.')) || 0 : k === 'etiqueta' ? t.value.trim().toLowerCase() : t.value);
  if (ofi && t.dataset.ofF) {
    borrador.ofertas[Number(ofi.dataset.of)][t.dataset.ofF] = valor(t.dataset.ofF);
    if (t.dataset.ofF === 'etiqueta') t.closest('label').querySelector('.pd-tag-estado').innerHTML = textoTag(borrador.ofertas[Number(ofi.dataset.of)].etiqueta);
    return;
  }
  if (!f) return;
  borrador[f] = valor(f);
  if (f === 'precio') body().querySelector('.pd-nota-precio').innerHTML = notaPrecio(borrador);
  if (f === 'etiqueta') t.parentElement.querySelector('.pd-tag-estado').innerHTML = textoTag(borrador.etiqueta);
  refrescarHechos();
}

// Los pasos que ya están puestos, con su ✓.
function refrescarHechos() {
  const h = hechos(borrador);
  for (const sec of body().querySelectorAll('.pd-paso[data-paso]')) {
    const n = sec.dataset.paso;
    sec.classList.toggle('hecho', h[n]);
    if (!sec.dataset.opcional) sec.querySelector('.pd-num').textContent = h[n] ? '✓' : n;
  }
}

// Repinta el editor conservando dónde estaba la persona.
function repintar(error) {
  const y = body().scrollTop;
  pintarEditor(error);
  body().scrollTop = y;
}

async function onClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.pdNuevo != null) { esNuevo = true; borrador = { ...sanitizeProducto({ nombre: 'x' }), nombre: '', tipo: cat.productos.length ? 'otro' : 'principal' }; pintarEditor(); body().scrollTop = 0; return; }
  if (b.dataset.pdEditar) { esNuevo = false; borrador = structuredClone(cat.productos.find((p) => p.id === b.dataset.pdEditar)); pintarEditor(); body().scrollTop = 0; return; }
  if (b.dataset.pdVolver != null) { borrador = null; pintarLista(); return; }
  if (!borrador) return;
  if (b.dataset.pdTipo) {
    borrador.tipo = b.dataset.pdTipo;
    for (const x of b.parentElement.children) { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }
    return;
  }
  if (b.dataset.pdIva) {
    borrador.iva = b.dataset.pdIva;
    for (const x of b.parentElement.children) { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }
    body().querySelector('.pd-nota-precio').innerHTML = notaPrecio(borrador);
    return;
  }
  if (b.dataset.pdEmb) {
    const id = b.dataset.pdEmb;
    const on = !borrador.embudos.includes(id);
    borrador.embudos = on ? [...borrador.embudos, id] : borrador.embudos.filter((x) => x !== id);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
    b.textContent = `${b.textContent.replace(/ ✓$/, '')}${on ? ' ✓' : ''}`;
    refrescarHechos();
    return;
  }
  if (b.dataset.pdOferta != null) { borrador.ofertas.push({ id: nuevoId('o'), nombre: '', precio: 0, etiqueta: '' }); repintar(); body().querySelector('.pd-oferta:last-child input')?.focus(); return; }
  if (b.dataset.pdQuitarOferta) { borrador.ofertas.splice(Number(b.dataset.pdQuitarOferta), 1); repintar(); return; }
  if (b.dataset.pdBorrar != null) {
    if (!window.confirm(`¿Borrar «${borrador.nombre}»? Dejará de salir en la Inteligencia de negocio (no se borra nada de GHL).`)) return;
    await guardar(cat.productos.filter((p) => p.id !== borrador.id), `🗑️ «${esc(borrador.nombre)}» borrado.`);
    return;
  }
  if (b.dataset.pdGuardar != null) {
    const p = sanitizeProducto({ ...borrador, ofertas: borrador.ofertas.filter((o) => o.nombre || o.precio || o.etiqueta) });
    if (!p.nombre) { repintar('Ponle un nombre (paso 1).'); return; }
    if (!p.etiqueta && !p.ofertas.some((o) => o.etiqueta)) { repintar('Falta la etiqueta de quien lo compra (paso 3): sin ella no sabemos quién lo ha comprado.'); return; }
    const lista = esNuevo ? [...cat.productos, p] : cat.productos.map((x) => (x.id === p.id ? p : x));
    b.disabled = true;
    await guardar(lista, `✓ «${esc(p.nombre)}» guardado. La Inteligencia de negocio lo cuenta en unos segundos.`);
  }
}

async function guardar(productos, aviso) {
  try {
    const d = await ctx.api('/api/productos', { method: 'POST', body: { catalogo: sanitizeCatalogo({ ...cat, productos }) } });
    cat = d.catalogo;
    borrador = null;
    pintarLista(aviso);
    body().scrollTop = 0;
    ctx.onGuardado?.(cat);
  } catch (err) { repintar(esc(err.message)); }
}
