// Embudo de ventas cruzadas en el navegador: su configuración (los productos con su etiqueta) y la pestaña
// «Alumnos» (quién tiene qué, qué le falta y filtros «lo tiene / no lo tiene» para que closers y setters llamen
// con contexto). Los contactos salen de GHL por la etiqueta de cada producto (/api/leads, de 100 en 100).
import { sanitizeCruzada, productosListos, etiquetasX, pendientesCruzada, productosDe, pasaFiltro, oportunidades, nuevoIdX, MAX_PRODUCTOS_X } from './cruzadas.js';
import { waPhone } from './scoring.js';

const POR_PAGINA = 50;
const FRESCOS_MS = 10 * 60 * 1000;

export function montarCruzadas({ api, state, esc, notice, progress, ls, guardar, eliminar, abrirCatalogo }) {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const datos = { id: '', clave: '', at: 0, alumnos: null, error: '', cargando: false };
  const vista = { filtro: {}, texto: '', max: POR_PAGINA };
  const cfgDe = (id) => sanitizeCruzada(state.config?.cruzadas?.[id] || {});
  const lsFiltro = (id) => `lsd_xfiltro_${id}`;

  // ---------- Alumnos ----------
  async function cargar(id, { fresh = false } = {}) {
    const cfg = cfgDe(id);
    const productos = productosListos(cfg);
    const tags = [...new Set(productos.flatMap(etiquetasX))];
    const clave = `${id}|${tags.join(',')}`;
    if (datos.id !== id) {
      try { vista.filtro = JSON.parse(ls.get(lsFiltro(id)) || '{}') || {}; } catch { vista.filtro = {}; }
      vista.texto = '';
      vista.max = POR_PAGINA;
    }
    if (!fresh && datos.clave === clave && datos.alumnos && Date.now() - datos.at < FRESCOS_MS) { pintar(id); return; }
    Object.assign(datos, { id, clave, alumnos: null, error: '', cargando: Boolean(tags.length) });
    pintar(id);
    if (!tags.length) return;
    const porId = new Map();
    try {
      for (const tag of tags) {
        let cursor = null;
        do {
          const qs = new URLSearchParams({ tag });
          if (cursor) qs.set('cursor', JSON.stringify(cursor));
          const page = await api(`/api/leads?${qs}`);
          if (datos.clave !== clave) return; // se cambió de embudo o de productos
          for (const c of page.contacts) if (!porId.has(c.id)) porId.set(c.id, c);
          cursor = page.cursor;
          progress(porId.size, null, `Cargando alumnos… ${porId.size} (etiqueta «${tag}»)`);
        } while (cursor);
      }
      const pais = state.config?.defaultCountryCode || '34';
      datos.alumnos = [...porId.values()].map((c) => ({
        id: c.id, name: c.name || c.email || '(sin nombre)', email: c.email || '', phone: c.phone || '',
        phoneWa: waPhone(c.phone, pais), tiene: productosDe(c, productos), dateAdded: c.dateAdded || '',
      })).sort((a, b) => b.tiene.length - a.tiene.length || String(a.name).localeCompare(String(b.name), 'es'));
      datos.at = Date.now();
    } catch (e) {
      datos.error = e.message;
    } finally {
      if (datos.clave === clave) { datos.cargando = false; progress(null); pintar(id); }
    }
  }

  const guardarFiltro = (id) => { try { ls.set(lsFiltro(id), JSON.stringify(vista.filtro)); } catch { /* sin almacenamiento */ } };

  function pintar(id = datos.id) {
    const caja = $('#xalumnos-body');
    if (!caja || !id) return;
    const cfg = cfgDe(id);
    const productos = productosListos(cfg);
    const pend = pendientesCruzada(cfg);
    const puede = state.role === 'admin' || state.permisos?.includes('config');
    const cab = `<div class="xa-cab card">
      <div><h2>🎓 Alumnos</h2><p class="muted">Quién tiene cada producto y qué le falta: filtra y llama con contexto.</p></div>
      <div class="xa-cab-acc">${puede ? '<button type="button" class="btn ghost" data-x-config>⚙️ Productos y etiquetas</button>' : ''}<button type="button" class="btn ghost" data-x-recargar ${datos.cargando ? 'disabled' : ''}>↻ Actualizar</button></div>
      ${cfg.notas ? `<details class="xa-notas"><summary>📝 Notas para el equipo</summary><p>${esc(cfg.notas).replace(/\n/g, '<br>')}</p></details>` : ''}</div>`;
    if (productos.length < 2) {
      caja.innerHTML = `${cab}<div class="card xa-vacio"><div class="xa-vacio-ico">🔁</div><h3>Elige los productos y su etiqueta</h3>
        <p class="muted">Para saber qué tiene cada alumno y a quién ofrecerle el siguiente, dinos qué productos vendes y qué etiqueta de GHL lleva quien compra cada uno (al menos 2).</p>
        ${pend.length ? `<ul class="xa-pend">${pend.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
        ${puede ? '<button type="button" class="btn primary" data-x-config>⚙️ Configurar los productos</button>' : '<p class="muted small">Pídeselo a quien configura AlquimIA.</p>'}</div>`;
      return;
    }
    if (datos.error) { caja.innerHTML = `${cab}<div class="card"><p class="error">No se pudieron cargar los alumnos: ${esc(datos.error)}</p></div>`; return; }
    if (!datos.alumnos) { caja.innerHTML = `${cab}<div class="card"><p class="muted">Cargando alumnos de GHL…</p></div>`; return; }
    const todos = datos.alumnos;
    const nombre = Object.fromEntries(productos.map((p) => [p.id, p.nombre]));
    // Filtros que ya no son de ningún producto (se quitó): fuera.
    for (const k of Object.keys(vista.filtro)) if (!nombre[k]) delete vista.filtro[k];
    const filtrados = todos.filter((a) => pasaFiltro(a, vista.filtro, vista.texto));
    const cuenta = (pid) => todos.filter((a) => a.tiene.includes(pid)).length;
    const ops = oportunidades(todos, productos).slice(0, 6);
    const hayFiltro = Object.keys(vista.filtro).length || vista.texto;
    const resumen = `<div class="xa-kpis">
      <div class="xa-kpi"><strong>${todos.length.toLocaleString('es-ES')}</strong><span>alumnos con algún producto</span></div>
      ${productos.map((p) => `<div class="xa-kpi"><strong>${cuenta(p.id).toLocaleString('es-ES')}</strong><span>tienen ${esc(p.nombre)}</span></div>`).join('')}
      <div class="xa-kpi"><strong>${todos.filter((a) => a.tiene.length >= 2).length.toLocaleString('es-ES')}</strong><span>tienen 2 o más</span></div></div>`;
    const opsHtml = ops.length ? `<section class="card xa-ops"><h3>💡 A quién ofrecer qué</h3><p class="muted small">Tienen uno y no el otro: pulsa para ver la lista.</p>
      <div class="xa-ops-grid">${ops.map((o) => `<button type="button" class="xa-op" data-x-op="${esc(o.tiene)}|${esc(o.falta)}"><span class="xa-op-n">${o.n.toLocaleString('es-ES')}</span><span>Tienen <b>${esc(nombre[o.tiene])}</b><br>y no <b>${esc(nombre[o.falta])}</b></span><span class="xa-op-ir" aria-hidden="true">→</span></button>`).join('')}</div></section>` : '';
    const seg = (p) => {
      const v = vista.filtro[p.id] || '';
      const b = (val, txt) => `<button type="button" class="${v === val ? 'on' : ''}" data-x-f="${esc(p.id)}" data-x-v="${val}" aria-pressed="${v === val}">${txt}</button>`;
      return `<div class="xa-f"><span class="xa-f-n">${esc(p.nombre)} <small>(${cuenta(p.id)})</small></span><div class="xa-seg" role="group" aria-label="${esc(p.nombre)}">${b('', 'Da igual')}${b('si', '✓ Lo tiene')}${b('no', '✗ No lo tiene')}</div></div>`;
    };
    const filtros = `<div class="xa-filtros card">
      <div class="xa-f-top"><input type="search" class="xa-buscar" data-x-buscar placeholder="Buscar nombre, email o teléfono" value="${esc(vista.texto)}" aria-label="Buscar">
        <span class="xa-cuenta"><strong>${filtrados.length.toLocaleString('es-ES')}</strong> de ${todos.length.toLocaleString('es-ES')}</span>
        ${hayFiltro ? '<button type="button" class="btn ghost small" data-x-limpiar>Quitar filtros</button>' : ''}</div>
      <div class="xa-f-lista">${productos.map(seg).join('')}</div></div>`;
    const fila = (a) => {
      const falta = productos.filter((p) => !a.tiene.includes(p.id));
      const wa = a.phoneWa ? `<a class="btn small wa-btn" href="https://wa.me/${esc(a.phoneWa)}" target="_blank" rel="noopener" title="Abrir su WhatsApp">💬 WhatsApp</a>` : '';
      const tel = a.phone ? `<a class="btn small ghost" href="tel:${esc(a.phone.replace(/[^\d+]/g, ''))}" title="Llamar">📞 Llamar</a>` : '';
      return `<li class="xa-al">
        <div class="xa-al-q"><button type="button" class="lead-ficha" data-ficha-lead="${esc(a.id)}" title="Ver la ficha completa">${esc(a.name)}</button>
          <span class="muted small">${esc(a.email)}${a.phone ? ` · ${esc(a.phone)}` : ''}</span></div>
        <div class="xa-chips">${productos.map((p) => `<span class="xa-chip ${a.tiene.includes(p.id) ? 'si' : 'no'}" title="${a.tiene.includes(p.id) ? 'Lo tiene' : 'No lo tiene'}">${a.tiene.includes(p.id) ? '✓' : '○'} ${esc(p.nombre)}</span>`).join('')}</div>
        <div class="xa-al-pie">${falta.length ? `<span class="xa-ofrece">💡 Ofrécele: <b>${falta.map((p) => esc(p.nombre)).join(' · ')}</b></span>` : '<span class="xa-ofrece todo">⭐ Ya tiene todos</span>'}<span class="xa-acc">${tel}${wa}</span></div></li>`;
    };
    const lista = filtrados.length
      ? `<ol class="xa-lista">${filtrados.slice(0, vista.max).map(fila).join('')}</ol>${filtrados.length > vista.max ? `<div class="xa-mas"><button type="button" class="btn" data-x-mas>Ver ${Math.min(POR_PAGINA, filtrados.length - vista.max)} más</button></div>` : ''}`
      : '<div class="card"><p class="muted">Nadie cumple estos filtros.</p></div>';
    const foco = document.activeElement?.matches?.('[data-x-buscar]') ? document.activeElement.selectionStart : null;
    caja.innerHTML = `${cab}${resumen}${opsHtml}${filtros}${lista}`;
    if (foco != null) { const i = $('[data-x-buscar]', caja); i.focus(); i.setSelectionRange(foco, foco); }
  }

  document.addEventListener('click', (e) => {
    const caja = e.target.closest('#xalumnos-body');
    if (!caja) return;
    const id = datos.id;
    if (e.target.closest('[data-x-config]')) return abrirConfig(state.embudo);
    if (e.target.closest('[data-x-recargar]')) return cargar(id, { fresh: true });
    if (e.target.closest('[data-x-mas]')) { vista.max += POR_PAGINA; return pintar(); }
    if (e.target.closest('[data-x-limpiar]')) { vista.filtro = {}; vista.texto = ''; vista.max = POR_PAGINA; guardarFiltro(id); return pintar(); }
    const op = e.target.closest('[data-x-op]');
    if (op) {
      const [tiene, falta] = op.dataset.xOp.split('|');
      vista.filtro = { [tiene]: 'si', [falta]: 'no' };
      vista.max = POR_PAGINA;
      guardarFiltro(id);
      pintar();
      $('.xa-filtros')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const f = e.target.closest('[data-x-f]');
    if (f) {
      if (f.dataset.xV) vista.filtro[f.dataset.xF] = f.dataset.xV; else delete vista.filtro[f.dataset.xF];
      vista.max = POR_PAGINA;
      guardarFiltro(id);
      pintar();
    }
  });
  document.addEventListener('input', (e) => {
    if (!e.target.matches('#xalumnos-body [data-x-buscar]')) return;
    vista.texto = e.target.value;
    vista.max = POR_PAGINA;
    clearTimeout(vista.t);
    vista.t = setTimeout(() => pintar(), 180);
  });

  // ---------- Configuración: los productos con su etiqueta ----------
  const dlg = $('#cruzadas-dialog');
  let borrador = null;
  let editId = '';

  function abrirConfig(id = state.embudo) {
    editId = id;
    borrador = cfgDe(id);
    if (!borrador.productos.length) borrador.productos.push({ id: nuevoIdX(), nombre: '', tag: '', otras: [] }, { id: nuevoIdX(), nombre: '', tag: '', otras: [] });
    $('#xc-status', dlg).textContent = '';
    $('#xc-catalogo', dlg).hidden = true;
    pintarConfig();
    if (!dlg.open) dlg.showModal();
  }

  function pintarConfig() {
    $('#xc-titulo', dlg).textContent = `🔁 ${borrador.name || 'Ventas cruzadas'}`;
    $('#xc-nombre', dlg).value = borrador.name;
    $('#xc-notas', dlg).value = borrador.notas || '';
    const tarjeta = (p, i) => `<li class="xc-prod" data-xc-prod="${esc(p.id)}">
      <div class="xc-prod-cab"><span class="xc-num">${i + 1}</span><input class="xc-in-nombre" data-xc-campo="nombre" value="${esc(p.nombre)}" maxlength="60" placeholder="Nombre del producto (p. ej. Reto ovulación)" aria-label="Nombre del producto">
        <button type="button" class="btn ghost small xc-quitar" data-xc-quitar title="Quitar este producto" aria-label="Quitar este producto">✕</button></div>
      <label class="field"><span>🏷️ Etiqueta de compra <small>(la que pone GHL a quien lo compra)</small></span><input data-xc-campo="tag" list="tag-list" value="${esc(p.tag)}" maxlength="100" placeholder="Busca la etiqueta…"></label>
      <div class="xc-otras"><span class="xc-otras-t">Otras etiquetas que también cuentan <small>(ofertas, ediciones…)</small></span>
        <div class="xc-chips">${p.otras.map((o, j) => `<span class="xc-chip">${esc(o.tag)}<button type="button" data-xc-otra-quitar="${j}" aria-label="Quitar ${esc(o.tag)}">×</button></span>`).join('')}
          <span class="xc-otra-add"><input data-xc-otra list="tag-list" maxlength="100" placeholder="＋ otra etiqueta"><button type="button" class="btn small" data-xc-otra-add>Añadir</button></span></div></div></li>`;
    $('#xc-productos', dlg).innerHTML = borrador.productos.map(tarjeta).join('');
    $('#xc-anadir', dlg).disabled = borrador.productos.length >= MAX_PRODUCTOS_X;
    pintarPendientes();
  }
  function pintarPendientes() {
    const pend = pendientesCruzada(sanitizeCruzada(borrador));
    const box = $('#xc-pend', dlg);
    box.hidden = !pend.length;
    box.innerHTML = pend.length ? `<strong>⚠️ Falta</strong><ul>${pend.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '';
    const ok = $('#xc-ok', dlg);
    const n = productosListos(sanitizeCruzada(borrador)).length;
    ok.hidden = Boolean(pend.length);
    ok.textContent = `✓ ${n} productos listos: en «Alumnos» verás quién tiene cada uno.`;
  }
  const prodDe = (el) => borrador.productos.find((p) => p.id === el.closest('[data-xc-prod]')?.dataset.xcProd);

  dlg.addEventListener('input', (e) => {
    if (e.target.id === 'xc-nombre') { borrador.name = e.target.value; $('#xc-titulo', dlg).textContent = `🔁 ${borrador.name || 'Ventas cruzadas'}`; return; }
    if (e.target.id === 'xc-notas') { borrador.notas = e.target.value; return; }
    const campo = e.target.dataset.xcCampo;
    const p = campo && prodDe(e.target);
    if (p) { p[campo] = campo === 'tag' ? e.target.value.trim().toLowerCase() : e.target.value; pintarPendientes(); }
  });
  function anadirOtra(el) {
    const p = prodDe(el);
    const inp = $('[data-xc-otra]', el.closest('[data-xc-prod]'));
    const t = inp.value.trim().toLowerCase();
    if (!p || !t) return;
    if (t !== p.tag && !p.otras.some((o) => o.tag === t)) p.otras.push({ tag: t });
    pintarConfig();
    $(`[data-xc-prod="${p.id}"] [data-xc-otra]`, dlg)?.focus();
  }
  dlg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-xc-otra]')) { e.preventDefault(); anadirOtra(e.target); } });
  dlg.addEventListener('click', async (e) => {
    if (e.target.closest('[data-xc-otra-add]')) return anadirOtra(e.target);
    const q = e.target.closest('[data-xc-otra-quitar]');
    if (q) { const p = prodDe(q); p.otras.splice(Number(q.dataset.xcOtraQuitar), 1); return pintarConfig(); }
    if (e.target.closest('[data-xc-quitar]')) { const p = prodDe(e.target); borrador.productos = borrador.productos.filter((x) => x !== p); return pintarConfig(); }
    if (e.target.closest('#xc-anadir')) {
      borrador.productos.push({ id: nuevoIdX(), nombre: '', tag: '', otras: [] });
      pintarConfig();
      $$('.xc-in-nombre', dlg).at(-1)?.focus();
      return;
    }
    if (e.target.closest('#xc-traer')) return pintarCatalogo();
    if (e.target.closest('#xc-cat-cerrar')) { $('#xc-catalogo', dlg).hidden = true; return; }
    if (e.target.closest('#xc-cat-anadir')) {
      const elegidos = $$('#xc-catalogo input[data-cat]:checked', dlg).map((i) => catalogo.find((p) => p.id === i.dataset.cat)).filter(Boolean);
      for (const cp of elegidos) {
        const tags = [cp.etiqueta, ...(cp.ofertas || []).map((o) => o.etiqueta)].filter(Boolean);
        if (!tags.length) continue;
        const vacio = borrador.productos.find((p) => !p.nombre && !p.tag && !p.otras.length);
        const nuevo = { id: nuevoIdX(), nombre: cp.nombre, tag: tags[0], otras: tags.slice(1).map((t) => ({ tag: t })) };
        if (vacio) Object.assign(vacio, { ...nuevo, id: vacio.id }); else if (borrador.productos.length < MAX_PRODUCTOS_X) borrador.productos.push(nuevo);
      }
      $('#xc-catalogo', dlg).hidden = true;
      return pintarConfig();
    }
    if (e.target.closest('#xc-guardar')) return guardarConfig();
    if (e.target.closest('#xc-borrar')) { try { if (await eliminar(editId)) dlg.close(); } catch (err) { $('#xc-status', dlg).textContent = err.message; } }
  });

  let catalogo = [];
  async function pintarCatalogo() {
    const box = $('#xc-catalogo', dlg);
    box.hidden = false;
    box.innerHTML = '<p class="muted">Cargando tus productos…</p>';
    try {
      catalogo = await abrirCatalogo();
    } catch (err) {
      box.innerHTML = `<p class="error">${esc(err.message)}</p>`;
      return;
    }
    const ya = new Set(borrador.productos.flatMap((p) => [p.tag, ...p.otras.map((o) => o.tag)]).filter(Boolean));
    const conTag = catalogo.filter((p) => p.etiqueta || p.ofertas?.some((o) => o.etiqueta));
    box.innerHTML = conTag.length
      ? `<p class="xc-cat-t"><strong>📦 Tus productos</strong> <span class="muted small">(Mi negocio → Productos). Marca los que quieras usar:</span></p>
        <div class="xc-cat-lista">${conTag.map((p) => { const tags = [p.etiqueta, ...(p.ofertas || []).map((o) => o.etiqueta)].filter(Boolean); const esta = tags.some((t) => ya.has(t)); return `<label class="xc-cat-op ${esta ? 'ya' : ''}"><input type="checkbox" data-cat="${esc(p.id)}" ${esta ? 'disabled' : ''}><span><strong>${esc(p.nombre)}</strong><small>${esc(tags.join(' · '))}${esta ? ' · ya está' : ''}</small></span></label>`; }).join('')}</div>
        <div class="row"><button type="button" class="btn primary small" id="xc-cat-anadir">Añadir los marcados</button><button type="button" class="btn ghost small" id="xc-cat-cerrar">Cerrar</button></div>`
      : '<p class="muted">Aún no tienes productos con etiqueta en <strong>Mi negocio → Productos</strong>. Escríbelos aquí abajo con su etiqueta.</p><div class="row"><button type="button" class="btn ghost small" id="xc-cat-cerrar">Cerrar</button></div>';
  }

  async function guardarConfig() {
    const limpio = sanitizeCruzada({ ...borrador, productos: borrador.productos.filter((p) => p.nombre.trim() || p.tag || p.otras.length) });
    const b = $('#xc-guardar', dlg);
    b.disabled = true;
    $('#xc-status', dlg).textContent = 'Guardando…';
    try {
      await guardar(editId, limpio);
      dlg.close();
      notice(`✓ «${limpio.name}» guardado: ${productosListos(limpio).length} productos.`);
      if (state.embudo === editId) cargar(editId, { fresh: true });
    } catch (err) {
      $('#xc-status', dlg).textContent = err.message;
    } finally {
      b.disabled = false;
    }
  }

  return { cargar, pintar, abrirConfig, datos };
}
