// Embudo de ventas cruzadas en el navegador:
//  · Configuración: los productos con su etiqueta, «Hoy y Llamadas» (sí / no, calendario y pipeline de GHL con las
//    fases recomendadas) y notas para el equipo. Al guardar, los productos nuevos se vuelcan en Mi negocio → Productos.
//  · Alumnos: quién tiene qué. Se elige a quién llamar con un «puente»: lo que YA TIENE → lo que quieres OFRECERLE.
//  · Hoy: el pipeline de GHL del embudo en columnas (con lo que tiene cada alumno y qué ofrecerle).
// Los contactos salen de GHL por la etiqueta de cada producto (/api/leads, de 100 en 100).
import {
  sanitizeCruzada, productosListos, etiquetasX, pendientesCruzada, productosDe, pasaFiltro, nuevoIdX, cruces, combinaciones,
  MAX_PRODUCTOS_X, MAX_OFERTAS_X, ETAPAS_CRUZADAS, PIPELINE_CRUZADAS, ofertaPara, ofertasPropuestas,
} from './cruzadas.js';
import { waPhone } from './scoring.js';

const POR_PAGINA = 40;
const FRESCOS_MS = 10 * 60 * 1000;
// Un color por producto (los del logo de AlquimIA): pastillas, rutas y tarjetas.
const COLORES = ['#ff7a00', '#06b6d4', '#7c3aed', '#3b6ff5', '#ec4899', '#10b981', '#f59e0b', '#a540f5', '#0ea5e9', '#ef4444', '#84cc16', '#14b8a6'];
// (si el nombre de la fase en GHL ya empieza por un emoji, no se pone otro)
const ICO_ETAPA = (nombre) => (/^\s*\p{Extended_Pictographic}/u.test(nombre || '') ? '' : ETAPAS_CRUZADAS.find((e) => e.nombre.toLowerCase() === String(nombre || '').trim().toLowerCase())?.ico
  || (/venta|ganad/i.test(nombre) ? '✅' : /perdid/i.test(nombre) ? '❌' : /no contesta/i.test(nombre) ? '📵' : /agenda/i.test(nombre) ? '📅' : /seguim/i.test(nombre) ? '🔁' : /contact/i.test(nombre) ? '💬' : '📌'));
const cerrada = (nombre) => /venta|ganad|perdid/i.test(nombre || '');
// El mensaje de la oferta con su nombre de pila ({nombre}) y el producto ({producto}).
const mensajeDe = (o, nombre, producto) => String(o?.mensaje || '').replace(/\{nombre\}/g, String(nombre || '').trim().split(/\s+/)[0] || '').replace(/\{producto\}/g, producto || '');

export function montarCruzadas({ api, state, esc, notice, progress, ls, guardar, eliminar, abrirCatalogo, sincronizarCatalogo, irAlumnos }) {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const datos = { id: '', clave: '', at: 0, alumnos: null, error: '', cargando: false };
  const vista = { filtro: {}, texto: '', max: POR_PAGINA, ultimo: 0 };
  const hoy = { id: '', datos: null, error: '', cargando: false, cerradas: false };
  const cfgDe = (id) => sanitizeCruzada(state.config?.cruzadas?.[id] || {});
  const lsFiltro = (id) => `lsd_xfiltro_${id}`;
  const puedeConfig = () => state.role === 'admin' || state.permisos?.includes('config');
  const colorDe = (productos, pid) => COLORES[Math.max(0, productos.findIndex((p) => p.id === pid)) % COLORES.length];
  const ini = (nombre) => String(nombre || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0] || '').join('').toUpperCase() || '?';
  const tonoDe = (txt) => { let h = 0; for (const ch of String(txt)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORES[h % COLORES.length]; };
  const num = (n) => Number(n || 0).toLocaleString('es-ES');

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
    if (!fresh && datos.clave === clave && (datos.alumnos || datos.cargando) && Date.now() - datos.at < FRESCOS_MS) { pintar(id); return; }
    Object.assign(datos, { id, clave, alumnos: null, error: '', cargando: Boolean(tags.length), at: Date.now() });
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
          progress(porId.size, null, `Cargando alumnos… ${num(porId.size)}`);
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
      if (datos.clave === clave) {
        datos.cargando = false;
        progress(null);
        pintar(id);
        if (hoy.id === id && hoy.datos && !$('#view-xhoy')?.hidden) pintarHoy(); // las tarjetas de Hoy, con lo que tiene cada uno
      }
    }
  }
  const alumnoDe = (contactId) => datos.alumnos?.find((a) => a.id === contactId) || null;
  const guardarFiltro = (id) => { try { ls.set(lsFiltro(id), JSON.stringify(vista.filtro)); } catch { /* sin almacenamiento */ } };

  // Frase del filtro: «tienen Reto y no tienen Raíces».
  function frase(productos) {
    const n = (pid) => `<b style="--c:${colorDe(productos, pid)}">${esc(productos.find((p) => p.id === pid)?.nombre || '')}</b>`;
    const si = Object.keys(vista.filtro).filter((k) => vista.filtro[k] === 'si');
    const no = Object.keys(vista.filtro).filter((k) => vista.filtro[k] === 'no');
    const lista = (ids) => ids.map(n).join(ids.length > 1 ? ' y ' : '');
    if (!si.length && !no.length) return 'todos los alumnos';
    return [si.length ? `tienen ${lista(si)}` : '', no.length ? `aún no tienen ${lista(no)}` : ''].filter(Boolean).join(' · ');
  }

  // Porcentaje redondeado («37 %»; «<1 %» si hay alguno pero no llega al 1 %).
  const pctTxt = (n, de) => { if (!de) return '–'; const v = (n / de) * 100; return n && v < 1 ? '<1 %' : `${Math.round(v)} %`; };

  function animarNumero(el, hasta) {
    const desde = vista.ultimo;
    vista.ultimo = hasta;
    if (!el || desde === hasta || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { if (el) el.textContent = num(hasta); return; }
    const t0 = performance.now();
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / 450);
      el.textContent = num(Math.round(desde + (hasta - desde) * (1 - (1 - k) ** 3)));
      if (k < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }

  function pintar(id = datos.id) {
    const caja = $('#xalumnos-body');
    if (!caja || !id) return;
    const cfg = cfgDe(id);
    const productos = productosListos(cfg);
    const pend = pendientesCruzada(cfg);
    const total = datos.alumnos?.length ?? null;
    const cuenta = (pid) => (datos.alumnos || []).filter((a) => a.tiene.includes(pid)).length;
    const hero = `<header class="xa-hero">
      <div class="xa-hero-ico" aria-hidden="true">🎓</div>
      <div class="xa-hero-txt"><h2>Alumnos</h2><p>${total == null ? 'Quién tiene cada producto y qué le falta.' : `<strong>${num(total)}</strong> personas tienen alguno de tus productos`}</p></div>
      <div class="xa-hero-acc">${puedeConfig() ? '<button type="button" class="xa-ibtn" data-x-config title="Productos y etiquetas"><span aria-hidden="true">⚙️</span><span>Productos</span></button>' : ''}<button type="button" class="xa-ibtn" data-x-recargar ${datos.cargando ? 'disabled' : ''} title="Volver a leer de GHL"><span aria-hidden="true" class="${datos.cargando ? 'xa-gira' : ''}">↻</span><span>Actualizar</span></button></div>
      ${total != null && productos.length ? `<div class="xa-hero-prods">${productos.map((p) => { const n = cuenta(p.id); return `<div class="xa-hp" style="--c:${colorDe(productos, p.id)}"><span class="xa-hp-n">${num(n)}<small>${pctTxt(n, total)}</small></span><span class="xa-hp-t">${esc(p.nombre)}</span><i style="--w:${total ? Math.round((n / total) * 100) : 0}%"></i></div>`; }).join('')}</div>` : ''}
      </header>
      ${cfg.notas ? `<details class="xa-guion"><summary><span aria-hidden="true">📝</span> Guion para el equipo</summary><p>${esc(cfg.notas).replace(/\n/g, '<br>')}</p></details>` : ''}`;
    if (productos.length < 2) {
      caja.innerHTML = `${hero}<div class="xa-vacio"><div class="xa-vacio-ico" aria-hidden="true">🔁</div><h3>Elige tus productos y su etiqueta</h3>
        <p class="muted">Dinos qué productos vendes y qué etiqueta de GHL lleva quien compra cada uno (al menos 2): así verás quién tiene cada uno y a quién ofrecerle el siguiente.</p>
        ${pend.length ? `<ul class="xa-pend">${pend.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
        ${puedeConfig() ? '<button type="button" class="btn primary" data-x-config>⚙️ Configurar los productos</button>' : '<p class="muted small">Pídeselo a quien configura AlquimIA.</p>'}</div>`;
      return;
    }
    if (datos.error) { caja.innerHTML = `${hero}<div class="xa-vacio"><div class="xa-vacio-ico">⚠️</div><p class="error">No se pudieron cargar los alumnos: ${esc(datos.error)}</p><button type="button" class="btn" data-x-recargar>Reintentar</button></div>`; return; }
    if (!datos.alumnos) { caja.innerHTML = `${hero}<div class="xa-cargando"><span class="xa-pulso" aria-hidden="true"></span><p>Leyendo tus alumnos de GHL…</p></div>`; return; }
    const todos = datos.alumnos;
    for (const k of Object.keys(vista.filtro)) if (!productos.some((p) => p.id === k)) delete vista.filtro[k];
    const filtrados = todos.filter((a) => pasaFiltro(a, vista.filtro, vista.texto));
    // Rutas: de quien tiene A, cuántos aún no tienen B (y qué % ya dio el salto).
    const rutas = cruces(todos, productos).filter((r) => r.faltan).slice(0, 8);
    const esRuta = (r) => vista.filtro[r.de] === 'si' && vista.filtro[r.a] === 'no' && Object.keys(vista.filtro).length === 2;
    const rutasHtml = rutas.length ? `<section class="xa-rutas"><h3><span aria-hidden="true">💡</span> Tus mejores oportunidades <small>tienen uno y les falta el otro · pulsa para verlos</small></h3>
      <div class="xa-rutas-fila">${rutas.map((r, i) => {
        const a = productos.find((p) => p.id === r.de);
        const b = productos.find((p) => p.id === r.a);
        return `<button type="button" class="xa-ruta ${esRuta(r) ? 'on' : ''}" data-x-ruta="${esc(r.de)}|${esc(r.a)}" style="--i:${i};--a:${colorDe(productos, a.id)};--b:${colorDe(productos, b.id)}">
          <span class="xa-ruta-n">${num(r.faltan)} <small>${pctTxt(r.faltan, r.base)}</small></span>
          <span class="xa-ruta-camino"><span class="xa-ruta-p a">${esc(a.nombre)}</span><span class="xa-ruta-flecha" aria-hidden="true"><i></i></span><span class="xa-ruta-p b">${esc(b.nombre)}</span></span>
          <span class="xa-ruta-txt">de quien tiene <b>${esc(a.nombre)}</b> aún no tiene <b>${esc(b.nombre)}</b></span>
          <span class="xa-ruta-paso" title="${pctTxt(r.tienen, r.base)} ya ha dado el salto"><i style="--w:${Math.round(r.pct * 100)}%"></i></span>
          <span class="xa-ruta-ya">✅ ${pctTxt(r.tienen, r.base)} ya lo tiene (${num(r.tienen)} de ${num(r.base)})</span></button>`;
      }).join('')}</div></section>` : '';
    // Combinaciones exactas: qué % de alumnos tiene justo esos productos (pulsa para ver a esas personas).
    const combs = combinaciones(todos, productos, 8);
    const esComb = (c) => productos.every((p) => vista.filtro[p.id] === (c.ids.includes(p.id) ? 'si' : 'no'));
    const maxC = Math.max(...combs.map((c) => c.pct), 0.01);
    const combHtml = combs.length > 1 ? `<section class="xa-combs"><h3><span aria-hidden="true">🧩</span> Qué combinación tiene cada alumno <small>% de tus ${num(total)} alumnos · pulsa para verlos</small></h3>
      <div class="xa-combs-l">${combs.map((c, i) => `<button type="button" class="xa-comb ${esComb(c) ? 'on' : ''}" data-x-comb="${esc(c.ids.join('|'))}" style="--i:${i}">
        <span class="xa-comb-p">${c.ids.map((pid) => { const pr = productos.find((p) => p.id === pid); return `<span class="xa-chip si" style="--c:${colorDe(productos, pid)}">${esc(pr?.nombre || '')}</span>`; }).join('<i aria-hidden="true">+</i>')}${c.ids.length === 1 ? '<small>solo este</small>' : c.ids.length === productos.length ? '<small>⭐ todos</small>' : ''}</span>
        <span class="xa-comb-b"><i style="--w:${Math.round((c.pct / maxC) * 100)}%"></i></span>
        <span class="xa-comb-n"><b>${pctTxt(c.n, total)}</b><small>${num(c.n)}</small></span></button>`).join('')}</div></section>` : '';
    const pill = (p, lado) => {
      const on = vista.filtro[p.id] === lado;
      const bloqueado = vista.filtro[p.id] && !on;
      return `<button type="button" class="xa-pill ${on ? 'on' : ''} ${bloqueado ? 'otro' : ''}" data-x-lado="${lado}" data-x-p="${esc(p.id)}" aria-pressed="${on}" style="--c:${colorDe(productos, p.id)}">
        <span class="xa-pill-ini" aria-hidden="true">${on ? (lado === 'si' ? '✓' : '🎁') : esc(ini(p.nombre))}</span><span class="xa-pill-t">${esc(p.nombre)}</span><span class="xa-pill-n">${num(lado === 'si' ? cuenta(p.id) : total - cuenta(p.id))}<small>${pctTxt(lado === 'si' ? cuenta(p.id) : total - cuenta(p.id), total)}</small></span></button>`;
    };
    const hay = Object.keys(vista.filtro).length || vista.texto;
    const puente = `<section class="xa-puente">
      <div class="xa-puente-cab"><h3><span aria-hidden="true">🎯</span> ¿A quién quieres llamar?</h3><p>Toca lo que <b>ya tienen</b> y lo que les quieres <b>ofrecer</b>.</p></div>
      <div class="xa-puente-cols">
        <div class="xa-lado si"><span class="xa-lado-t"><span aria-hidden="true">✅</span> Ya tienen</span><div class="xa-pills">${productos.map((p) => pill(p, 'si')).join('')}</div></div>
        <div class="xa-puente-flecha" aria-hidden="true"><span>➜</span></div>
        <div class="xa-lado no"><span class="xa-lado-t"><span aria-hidden="true">🎁</span> Ofrécele <small>(aún no lo tienen)</small></span><div class="xa-pills">${productos.map((p) => pill(p, 'no')).join('')}</div></div>
      </div></section>`;
    const barra = `<div class="xa-barra" role="status">
      <span class="xa-barra-n" data-x-num>${num(vista.ultimo)}</span>
      <span class="xa-barra-t"><span>personas <em class="xa-barra-pct">${pctTxt(filtrados.length, total)} del total</em></span><small>${frase(productos)}</small></span>
      <label class="xa-buscar"><span aria-hidden="true">🔎</span><input type="search" data-x-buscar placeholder="Buscar nombre, email o teléfono" value="${esc(vista.texto)}" aria-label="Buscar"></label>
      ${hay ? '<button type="button" class="xa-limpiar" data-x-limpiar title="Quitar los filtros"><span aria-hidden="true">✕</span> Ver todos</button>' : ''}</div>`;
    const tarjeta = (a, i) => {
      const falta = productos.filter((p) => !a.tiene.includes(p.id));
      const of = ofertaPara(a, cfg.ofertas);
      const pOf = of && productos.find((p) => p.id === of.ofrece);
      const tel = a.phone ? `<a class="xa-act tel" href="tel:${esc(a.phone.replace(/[^\d+]/g, ''))}" title="Llamar" aria-label="Llamar a ${esc(a.name)}">📞</a>` : '';
      const txt = of ? mensajeDe(of, a.name, pOf?.nombre) : '';
      const wa = a.phoneWa ? `<a class="xa-act wa" href="https://wa.me/${esc(a.phoneWa)}${txt ? `?text=${encodeURIComponent(txt)}` : ''}" target="_blank" rel="noopener" title="${txt ? 'WhatsApp con el mensaje de su oferta' : 'WhatsApp'}" aria-label="WhatsApp de ${esc(a.name)}">💬</a>` : '';
      return `<li class="xa-al" style="--i:${Math.min(i, 14)}">
        <span class="xa-av" style="--c:${tonoDe(a.name)}" aria-hidden="true">${esc(ini(a.name))}</span>
        <div class="xa-al-c">
          <div class="xa-al-q"><button type="button" class="lead-ficha" data-ficha-lead="${esc(a.id)}" title="Ver la ficha completa">${esc(a.name)}</button><span class="xa-al-m">${esc(a.phone || a.email)}</span></div>
          <div class="xa-chips">${productos.map((p) => { const lo = a.tiene.includes(p.id); return `<span class="xa-chip ${lo ? 'si' : 'no'}" style="--c:${colorDe(productos, p.id)}" title="${lo ? 'Lo tiene' : 'No lo tiene'}">${lo ? '✓' : '+'} ${esc(p.nombre)}</span>`; }).join('')}</div>
        </div>
        <div class="xa-al-d">${pOf ? `<span class="xa-oferta" style="--c:${colorDe(productos, pOf.id)}" title="${esc(of.mensaje || '')}"><span aria-hidden="true">🎁</span> <b>${esc(pOf.nombre)}</b>${of.precio ? `<small>${esc(of.precio)}</small>` : ''}</span>` : falta.length ? `<span class="xa-ofrece"><span aria-hidden="true">🎁</span> ${falta.slice(0, 2).map((p) => esc(p.nombre)).join(' · ')}${falta.length > 2 ? ` +${falta.length - 2}` : ''}</span>` : '<span class="xa-ofrece todo">⭐ Lo tiene todo</span>'}<span class="xa-acts">${tel}${wa}</span></div></li>`;
    };
    const lista = filtrados.length
      ? `<ol class="xa-lista">${filtrados.slice(0, vista.max).map(tarjeta).join('')}</ol>${filtrados.length > vista.max ? `<div class="xa-mas"><button type="button" class="btn" data-x-mas>Ver ${num(Math.min(POR_PAGINA, filtrados.length - vista.max))} más</button></div>` : ''}`
      : '<div class="xa-vacio pequeno"><div class="xa-vacio-ico" aria-hidden="true">🫥</div><p class="muted">Nadie cumple esto. Prueba a quitar algún producto.</p></div>';
    const enfocado = document.activeElement?.matches?.('[data-x-buscar]') ? document.activeElement.selectionStart : null;
    caja.innerHTML = `${hero}${rutasHtml}${combHtml}${puente}${barra}${lista}`;
    animarNumero($('[data-x-num]', caja), filtrados.length);
    if (enfocado != null) { const inp = $('[data-x-buscar]', caja); inp.focus(); inp.setSelectionRange(enfocado, enfocado); }
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#xalumnos-body, #xhoy-body, #xofertas-body')) return;
    const cf = e.target.closest('[data-x-config]');
    if (cf) { abrirConfig(state.embudo); if (cf.dataset.xIr) setTimeout(() => $(`#xc-${cf.dataset.xIr}`, dlg)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120); return; }
    if (e.target.closest('#xhoy-body [data-x-recargar]')) return cargarHoy(state.embudo, { fresh: true });
    if (e.target.closest('[data-x-cerradas]')) { hoy.cerradas = !hoy.cerradas; return pintarHoy(); }
    if (!e.target.closest('#xalumnos-body')) return;
    const id = datos.id;
    if (e.target.closest('[data-x-recargar]')) return cargar(id, { fresh: true });
    if (e.target.closest('[data-x-mas]')) { vista.max += POR_PAGINA; return pintar(); }
    if (e.target.closest('[data-x-limpiar]')) { vista.filtro = {}; vista.texto = ''; vista.max = POR_PAGINA; guardarFiltro(id); return pintar(); }
    const ruta = e.target.closest('[data-x-ruta]');
    if (ruta) {
      const [tiene, falta] = ruta.dataset.xRuta.split('|');
      const ya = vista.filtro[tiene] === 'si' && vista.filtro[falta] === 'no' && Object.keys(vista.filtro).length === 2;
      vista.filtro = ya ? {} : { [tiene]: 'si', [falta]: 'no' };
      vista.max = POR_PAGINA;
      guardarFiltro(id);
      pintar();
      if (!ya) $('.xa-barra')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const comb = e.target.closest('[data-x-comb]');
    if (comb) {
      const ids = comb.dataset.xComb.split('|');
      const prods = productosListos(cfgDe(id));
      const filtro = Object.fromEntries(prods.map((pr) => [pr.id, ids.includes(pr.id) ? 'si' : 'no']));
      const ya = prods.every((pr) => vista.filtro[pr.id] === filtro[pr.id]);
      vista.filtro = ya ? {} : filtro;
      vista.max = POR_PAGINA;
      guardarFiltro(id);
      pintar();
      if (!ya) $('.xa-barra')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const p = e.target.closest('[data-x-p]');
    if (p) {
      const pid = p.dataset.xP;
      const lado = p.dataset.xLado;
      if (vista.filtro[pid] === lado) delete vista.filtro[pid]; else vista.filtro[pid] = lado; // en un lado o en el otro
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

  // ---------- Hoy: el pipeline de GHL en columnas ----------
  async function cargarHoy(id, { fresh = false } = {}) {
    if (!datos.alumnos && !datos.cargando) cargar(id); // para saber qué tiene cada uno
    if (!fresh && hoy.id === id && hoy.datos && Date.now() - hoy.at < 2 * 60_000) { pintarHoy(); return; }
    Object.assign(hoy, { id, datos: null, error: '', cargando: true });
    pintarHoy();
    try {
      const d = await api(`/api/cruzadas?x=${encodeURIComponent(id)}${fresh ? '&fresh=1' : ''}`);
      if (hoy.id !== id) return;
      Object.assign(hoy, { datos: d, at: Date.now() });
    } catch (e) {
      hoy.error = e.message;
    } finally {
      if (hoy.id === id) { hoy.cargando = false; pintarHoy(); }
    }
  }

  const etapasRecomendadas = (animadas = true) => `<div class="xp-flujo ${animadas ? 'anim' : ''}">${ETAPAS_CRUZADAS.map((e, i) => `<span class="xp-etapa" style="--i:${i}" title="${esc(e.desc)}"><span class="xp-etapa-ico" aria-hidden="true">${e.ico}</span>${esc(e.nombre)}</span>`).join('<span class="xp-flujo-f" aria-hidden="true">›</span>')}</div>`;
  const guiaPipeline = () => `<div class="xp-guia">
    <div class="xp-guia-cab"><span class="xp-guia-ico" aria-hidden="true">🧭</span><div><strong>Te recomiendo crear en GHL un pipeline nuevo: «${esc(PIPELINE_CRUZADAS)}»</strong><small>Así cada alumno al que llamas está en su fase y lo ves aquí, en «Hoy», sin mezclarlo con los lanzamientos.</small></div></div>
    ${etapasRecomendadas()}
    <ol class="xp-pasos">
      <li>En GHL: <b>Oportunidades → Pipelines → «＋ Crear pipeline»</b>.</li>
      <li>Ponle de nombre <b>${esc(PIPELINE_CRUZADAS)}</b> (o el que quieras, y elígelo aquí).</li>
      <li>Crea estas <b>${ETAPAS_CRUZADAS.length} fases en este orden</b> <button type="button" class="btn small ghost" data-xp-copiar>📋 Copiar los nombres</button></li>
      <li>Mete a los alumnos a los que vais a llamar en <b>«Por contactar»</b> (desde GHL o con un workflow por etiqueta). Al anotar el resultado en <b>Llamadas</b>, AlquimIA los mueve de fase solo.</li>
    </ol></div>`;

  function pintarHoy() {
    const caja = $('#xhoy-body');
    if (!caja) return;
    const id = hoy.id || state.embudo;
    const cfg = cfgDe(id);
    const productos = productosListos(cfg);
    const d = hoy.datos;
    const cab = `<header class="xa-hero hoy">
      <div class="xa-hero-ico" aria-hidden="true">📞</div>
      <div class="xa-hero-txt"><h2>A quién llamar</h2><p>${d?.pipeline ? `Pipeline <strong>«${esc(d.pipeline.nombre)}»</strong> de GHL · ${num(d.total)} alumnos` : 'Tu pipeline de ventas cruzadas en GHL, fase a fase.'}</p></div>
      <div class="xa-hero-acc">${puedeConfig() ? '<button type="button" class="xa-ibtn" data-x-config><span aria-hidden="true">⚙️</span><span>Configurar</span></button>' : ''}<button type="button" class="xa-ibtn" data-x-recargar ${hoy.cargando ? 'disabled' : ''}><span aria-hidden="true" class="${hoy.cargando ? 'xa-gira' : ''}">↻</span><span>Actualizar</span></button></div></header>`;
    if (hoy.error) { caja.innerHTML = `${cab}<div class="xa-vacio"><div class="xa-vacio-ico">⚠️</div><p class="error">${esc(hoy.error)}</p></div>`; return; }
    if (!d) { caja.innerHTML = `${cab}<div class="xa-cargando"><span class="xa-pulso" aria-hidden="true"></span><p>Leyendo el pipeline de GHL…</p></div>`; return; }
    if (d.motivo === 'sin_pipeline') {
      caja.innerHTML = `${cab}<div class="xa-vacio xp-sin"><div class="xa-vacio-ico" aria-hidden="true">🧭</div><h3>No encuentro el pipeline «${esc(d.buscado)}» en GHL</h3>
        <p class="muted">Créalo con estas fases (o elige otro en la configuración) y aquí verás a cada alumno en su fase.</p>${guiaPipeline()}
        ${puedeConfig() ? '<button type="button" class="btn primary" data-x-config>⚙️ Elegir el pipeline</button>' : ''}</div>`;
      return;
    }
    const abiertas = d.etapas.filter((e) => !cerrada(e.nombre));
    const cerradas = d.etapas.filter((e) => cerrada(e.nombre));
    const resumen = `<div class="xp-resumen">${d.etapas.map((e, i) => `<span class="xp-res ${cerrada(e.nombre) ? 'cerr' : ''}" style="--c:${e.color || COLORES[i % COLORES.length]};--i:${i}"><span aria-hidden="true">${ICO_ETAPA(e.nombre)}</span><b>${num(e.n)}</b><small>${esc(e.nombre)}</small></span>`).join('')}</div>`;
    const tarjeta = (it, i) => {
      const a = alumnoDe(it.contactId);
      const falta = a ? productos.filter((p) => !a.tiene.includes(p.id)) : [];
      const of = a ? ofertaPara(a, cfg.ofertas) : null;
      const pOf = of && productos.find((p) => p.id === of.ofrece);
      const tel = it.telefono || a?.phone || '';
      const wa = a?.phoneWa || waPhone(tel, state.config?.defaultCountryCode || '34');
      const dias = it.desde ? Math.max(0, Math.round((Date.now() - Date.parse(it.desde)) / 86_400_000)) : null;
      return `<li class="xp-card" style="--i:${Math.min(i, 10)}">
        <div class="xp-card-q"><span class="xa-av peq" style="--c:${tonoDe(it.nombre)}" aria-hidden="true">${esc(ini(it.nombre))}</span><button type="button" class="lead-ficha" ${it.contactId ? `data-ficha-lead="${esc(it.contactId)}"` : 'disabled'}>${esc(it.nombre || '(sin nombre)')}</button></div>
        ${a ? `<div class="xa-chips mini">${productos.filter((p) => a.tiene.includes(p.id)).map((p) => `<span class="xa-chip si" style="--c:${colorDe(productos, p.id)}">✓ ${esc(p.nombre)}</span>`).join('')}</div>` : ''}
        ${pOf ? `<span class="xa-oferta" style="--c:${colorDe(productos, pOf.id)}"><span aria-hidden="true">🎁</span> <b>${esc(pOf.nombre)}</b>${of.precio ? `<small>${esc(of.precio)}</small>` : ''}</span>` : falta.length ? `<span class="xa-ofrece"><span aria-hidden="true">🎁</span> ${falta.slice(0, 2).map((p) => esc(p.nombre)).join(' · ')}</span>` : ''}
        <div class="xp-card-pie"><span class="muted small">${dias == null ? '' : dias === 0 ? 'hoy en esta fase' : `${dias} día${dias === 1 ? '' : 's'} en esta fase`}</span><span class="xa-acts">${tel ? `<a class="xa-act tel" href="tel:${esc(tel.replace(/[^\d+]/g, ''))}" title="Llamar">📞</a>` : ''}${wa ? `<a class="xa-act wa" href="https://wa.me/${esc(wa)}${of?.mensaje ? `?text=${encodeURIComponent(mensajeDe(of, it.nombre, pOf?.nombre))}` : ''}" target="_blank" rel="noopener" title="WhatsApp">💬</a>` : ''}</span></div></li>`;
    };
    const columna = (e, i) => `<section class="xp-col ${cerrada(e.nombre) ? 'cerr' : ''}" style="--c:${e.color || COLORES[i % COLORES.length]};--i:${i}">
      <header><span class="xp-col-ico" aria-hidden="true">${ICO_ETAPA(e.nombre)}</span><strong>${esc(e.nombre)}</strong><span class="xp-col-n">${num(e.n)}</span></header>
      ${e.items.length ? `<ol>${e.items.map(tarjeta).join('')}</ol>${e.n > e.items.length ? `<p class="muted small xp-col-mas">Y ${num(e.n - e.items.length)} más en GHL</p>` : ''}` : '<p class="xp-col-vacia">Nadie en esta fase</p>'}</section>`;
    caja.innerHTML = `${cab}${resumen}<div class="xp-tablero">${abiertas.map(columna).join('')}${hoy.cerradas ? cerradas.map((e) => columna(e, d.etapas.indexOf(e))).join('') : ''}</div>
      ${cerradas.length ? `<div class="xa-mas"><button type="button" class="btn ghost" data-x-cerradas>${hoy.cerradas ? 'Ocultar las cerradas' : `Ver las cerradas (${cerradas.map((e) => `${ICO_ETAPA(e.nombre)} ${num(e.n)}`).join(' · ')})`}</button></div>` : ''}`;
  }

  // ---------- Ofertas: qué ofrecer a cada tipo de alumno ----------
  function pintarOfertas(id = state.embudo) {
    const caja = $('#xofertas-body');
    if (!caja || !id) return;
    if (!datos.alumnos && !datos.cargando && datos.id !== id) cargar(id);
    const cfg = cfgDe(id);
    const productos = productosListos(cfg);
    const nombre = (pid) => productos.find((p) => p.id === pid)?.nombre || '';
    const cab = `<header class="xa-hero ofertas">
      <div class="xa-hero-ico" aria-hidden="true">🎁</div>
      <div class="xa-hero-txt"><h2>Ofertas</h2><p>Qué ofrecer a cada tipo de alumno según lo que ya tiene.</p></div>
      <div class="xa-hero-acc">${puedeConfig() ? '<button type="button" class="xa-ibtn" data-x-config data-x-ir="ofertas"><span aria-hidden="true">✏️</span><span>Editar ofertas</span></button>' : ''}</div></header>`;
    if (!cfg.ofertas.length) {
      caja.innerHTML = `${cab}<div class="xa-vacio"><div class="xa-vacio-ico" aria-hidden="true">🎁</div><h3>Aún no hay ofertas</h3>
        <p class="muted">Decide qué ofrecer a quien tiene cada producto (y a qué precio, con qué mensaje). Saldrá en la tarjeta de cada alumno y en su WhatsApp.</p>
        ${puedeConfig() ? '<button type="button" class="btn primary" data-x-config data-x-ir="ofertas">✨ Crear las ofertas</button>' : '<p class="muted small">Pídeselo a quien configura AlquimIA.</p>'}</div>`;
      return;
    }
    const cuantos = (o) => (datos.alumnos ? datos.alumnos.filter((a) => ofertaPara(a, cfg.ofertas) === o).length : null);
    caja.innerHTML = `${cab}<div class="xo-lista">${cfg.ofertas.map((o, i) => {
      const n = cuantos(o);
      return `<article class="xo-card" style="--i:${i};--a:${colorDe(productos, o.tiene)};--b:${colorDe(productos, o.ofrece)}">
        <div class="xo-tipo"><span class="xo-lbl">Si ya tiene</span><span class="xo-prod a">${esc(nombre(o.tiene))}</span></div>
        <div class="xo-flecha" aria-hidden="true"><i></i><span>➜</span></div>
        <div class="xo-tipo"><span class="xo-lbl">Ofrécele</span><span class="xo-prod b">🎁 ${esc(nombre(o.ofrece))}</span>${o.precio ? `<span class="xo-precio">${esc(o.precio)}</span>` : ''}</div>
        ${o.mensaje ? `<blockquote class="xo-msg"><span aria-hidden="true">💬</span> ${esc(o.mensaje)}</blockquote>` : ''}
        <div class="xo-pie"><span class="xo-n">${n == null ? '…' : `<b>${num(n)}</b> alumnos`}</span><button type="button" class="btn small primary" data-x-verofer="${esc(o.tiene)}|${esc(o.ofrece)}">Ver a quién →</button></div>
      </article>`;
    }).join('')}</div>`;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#xofertas-body [data-x-verofer]');
    if (!b) return;
    const [tiene, ofrece] = b.dataset.xVerofer.split('|');
    vista.filtro = { [tiene]: 'si', [ofrece]: 'no' };
    vista.max = POR_PAGINA;
    guardarFiltro(state.embudo);
    irAlumnos?.();
  });

  // ---------- Configuración ----------
  const dlg = $('#cruzadas-dialog');
  let borrador = null;
  let editId = '';
  let pipelines = null;

  function abrirConfig(id = state.embudo) {
    editId = id;
    borrador = cfgDe(id);
    if (!borrador.productos.length) borrador.productos.push({ id: nuevoIdX(), nombre: '', tag: '', otras: [] }, { id: nuevoIdX(), nombre: '', tag: '', otras: [] });
    $('#xc-status', dlg).textContent = '';
    $('#xc-catalogo', dlg).hidden = true;
    pintarConfig();
    pintarOfertasCfg();
    pintarLlamadas();
    if (!dlg.open) dlg.showModal();
    if (borrador.llamadas && !pipelines) cargarPipelines();
  }

  function pintarConfig() {
    $('#xc-titulo', dlg).textContent = `🔁 ${borrador.name || 'Ventas cruzadas'}`;
    $('#xc-nombre', dlg).value = borrador.name;
    $('#xc-notas', dlg).value = borrador.notas || '';
    const tarjeta = (p, i) => `<li class="xc-prod" data-xc-prod="${esc(p.id)}" style="--c:${COLORES[i % COLORES.length]}">
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
    const limpio = sanitizeCruzada(borrador);
    const pend = pendientesCruzada(limpio);
    const box = $('#xc-pend', dlg);
    box.hidden = !pend.length;
    box.innerHTML = pend.length ? `<strong>⚠️ Falta</strong><ul>${pend.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '';
    const ok = $('#xc-ok', dlg);
    ok.hidden = Boolean(pend.length);
    ok.textContent = `✓ ${productosListos(limpio).length} productos listos: en «Alumnos» verás quién tiene cada uno.`;
  }

  function pintarOfertasCfg() {
    const box = $('#xc-ofertas', dlg);
    const prods = sanitizeCruzada(borrador).productos.filter((p) => p.nombre);
    const opt = (sel) => prods.map((p) => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('');
    const fila = (o, i) => `<li class="xc-of" data-xc-of="${esc(o.id)}" style="--i:${i}">
      <div class="xc-of-camino">
        <label><span>✅ Si ya tiene</span><select data-xc-ofc="tiene">${opt(o.tiene)}</select></label>
        <span class="xc-of-f" aria-hidden="true">➜</span>
        <label><span>🎁 Ofrécele</span><select data-xc-ofc="ofrece">${opt(o.ofrece)}</select></label>
        <button type="button" class="btn ghost small xc-quitar" data-xc-of-quitar aria-label="Quitar esta oferta">✕</button>
      </div>
      <label class="field"><span>💶 Precio o condición <small>(p. ej. «797 € en vez de 997 € por ser alumna»)</small></span><input data-xc-ofc="precio" maxlength="80" value="${esc(o.precio)}"></label>
      <label class="field"><span>💬 Mensaje para WhatsApp <small>({nombre} y {producto} se cambian solos)</small></span><textarea data-xc-ofc="mensaje" rows="2" maxlength="600" placeholder="Hola {nombre}, como ya hiciste el Reto, tengo algo para ti: {producto}…">${esc(o.mensaje)}</textarea></label></li>`;
    box.innerHTML = `<h3 class="cfg-h3">2 · Ofertas por tipo de alumno</h3>
      <p class="muted small">Qué ofrecer a quien ya tiene cada producto. Sale en la tarjeta de cada alumno y en su WhatsApp. Si encaja en varias, cuenta la primera.</p>
      ${prods.length < 2 ? '<p class="muted">Primero pon al menos 2 productos con su nombre.</p>' : `
      <ol class="xc-ofs">${(borrador.ofertas || []).map(fila).join('')}</ol>
      <div class="xc-barra"><button type="button" class="btn" data-xc-of-nueva ${(borrador.ofertas || []).length >= MAX_OFERTAS_X ? 'disabled' : ''}>＋ Añadir oferta</button>${datos.alumnos && datos.id === editId ? '<button type="button" class="btn ghost" data-xc-of-proponer>✨ Propónmelas según mis alumnos</button>' : ''}</div>`}`;
  }

  async function cargarPipelines() {
    try {
      pipelines = (await api('/api/cruzadas?parte=pipelines')).pipelines;
    } catch (e) {
      pipelines = [];
      notice(`No se pudieron leer los pipelines de GHL: ${e.message}`, true);
    }
    if (dlg.open) pintarLlamadas();
  }
  function pintarLlamadas() {
    const box = $('#xc-llamadas', dlg);
    const si = borrador.llamadas;
    const elegido = borrador.llamadasPipeline || PIPELINE_CRUZADAS;
    const existe = pipelines?.find((p) => p.nombre.trim().toLowerCase() === elegido.trim().toLowerCase());
    const opciones = pipelines ? [...pipelines] : [];
    if (!existe) opciones.unshift({ nombre: elegido, falta: true });
    box.innerHTML = `<h3 class="cfg-h3">3 · Hoy y Llamadas</h3>
      <p class="muted small">¿Vais a llamar a los alumnos desde AlquimIA? Con «Sí» salen las pestañas <b>Hoy</b> (el pipeline de GHL, fase a fase) y <b>Llamadas</b> (las reservas del calendario y su resultado), como en los lanzamientos.</p>
      <div class="xc-sino" role="radiogroup" aria-label="Hoy y Llamadas">
        <button type="button" class="xc-opcion ${si ? '' : 'on'}" data-xc-llamadas="no" role="radio" aria-checked="${!si}"><span class="xc-opcion-ico" aria-hidden="true">📋</span><strong>No, solo la lista</strong><small>Alumnos con sus filtros</small></button>
        <button type="button" class="xc-opcion ${si ? 'on' : ''}" data-xc-llamadas="si" role="radio" aria-checked="${si}"><span class="xc-opcion-ico" aria-hidden="true">📞</span><strong>Sí, vamos a llamarles</strong><small>Hoy + Llamadas</small></button>
      </div>
      ${si ? `<div class="xc-llam">
        <label class="field"><span>📅 Enlace del calendario de reservas de GHL <small>(para «Llamadas»: el de la llamada de venta)</small></span><input id="xc-cal" type="url" value="${esc(borrador.llamadaUrl || '')}" placeholder="https://…/widget/booking/…"></label>
        <label class="field"><span>🧭 Pipeline de GHL de estas llamadas</span>
          <select id="xc-pipe">${pipelines ? opciones.map((p) => `<option value="${esc(p.nombre)}" ${p.nombre.trim().toLowerCase() === elegido.trim().toLowerCase() ? 'selected' : ''}>${p.falta ? `⚠️ ${esc(p.nombre)} (aún no existe en GHL)` : `${esc(p.nombre)} · ${p.etapas.length} fases`}</option>`).join('') : '<option>Cargando los pipelines de GHL…</option>'}</select></label>
        ${existe ? `<div class="xc-pipe-ok"><span aria-hidden="true">✅</span> Lo tienes en GHL con ${existe.etapas.length} fases: <span class="xc-pipe-fases">${existe.etapas.map((n) => `<span>${ICO_ETAPA(n)} ${esc(n)}</span>`).join('')}</span></div>` : pipelines ? guiaPipeline() : ''}
      </div>` : ''}`;
  }

  const prodDe = (el) => borrador.productos.find((p) => p.id === el.closest('[data-xc-prod]')?.dataset.xcProd);
  dlg.addEventListener('input', (e) => {
    if (e.target.id === 'xc-nombre') { borrador.name = e.target.value; $('#xc-titulo', dlg).textContent = `🔁 ${borrador.name || 'Ventas cruzadas'}`; return; }
    if (e.target.id === 'xc-notas') { borrador.notas = e.target.value; return; }
    if (e.target.id === 'xc-cal') { borrador.llamadaUrl = e.target.value.trim(); return; }
    const ofc = e.target.dataset.xcOfc;
    if (ofc) { const o = ofDe(e.target); if (o) o[ofc] = e.target.value; return; }
    const campo = e.target.dataset.xcCampo;
    const p = campo && prodDe(e.target);
    if (p) { p[campo] = campo === 'tag' ? e.target.value.trim().toLowerCase() : e.target.value; pintarPendientes(); }
  });
  const ofDe = (el) => (borrador.ofertas || []).find((o) => o.id === el.closest('[data-xc-of]')?.dataset.xcOf);
  // Al cambiar los productos (nombres, quitar…), las ofertas se vuelven a pintar con la lista nueva.
  dlg.addEventListener('focusout', (e) => { if (e.target.matches('.xc-in-nombre')) pintarOfertasCfg(); });
  dlg.addEventListener('change', (e) => {
    if (e.target.id === 'xc-pipe') { borrador.llamadasPipeline = e.target.value; pintarLlamadas(); }
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
    const ll = e.target.closest('[data-xc-llamadas]');
    if (ll) { borrador.llamadas = ll.dataset.xcLlamadas === 'si'; pintarLlamadas(); if (borrador.llamadas && !pipelines) cargarPipelines(); return; }
    if (e.target.closest('[data-xp-copiar]')) return copiarFases(e.target.closest('[data-xp-copiar]'));
    if (e.target.closest('[data-xc-of-nueva]')) {
      const prods = sanitizeCruzada(borrador).productos.filter((p) => p.nombre);
      borrador.ofertas = [...(borrador.ofertas || []), { id: nuevoIdX(), tiene: prods[0]?.id || '', ofrece: prods[1]?.id || '', precio: '', mensaje: '' }];
      return pintarOfertasCfg();
    }
    if (e.target.closest('[data-xc-of-quitar]')) { const o = ofDe(e.target); borrador.ofertas = borrador.ofertas.filter((x) => x !== o); return pintarOfertasCfg(); }
    if (e.target.closest('[data-xc-of-proponer]')) {
      const nuevas = ofertasPropuestas(datos.alumnos || [], productosListos(sanitizeCruzada(borrador)), borrador.ofertas || []);
      borrador.ofertas = [...(borrador.ofertas || []), ...nuevas].slice(0, MAX_OFERTAS_X);
      pintarOfertasCfg();
      if (!nuevas.length) notice('Ya tienes una oferta para cada producto.');
      return;
    }
    if (e.target.closest('[data-xc-otra-add]')) return anadirOtra(e.target);
    const q = e.target.closest('[data-xc-otra-quitar]');
    if (q) { const p = prodDe(q); p.otras.splice(Number(q.dataset.xcOtraQuitar), 1); return pintarConfig(); }
    if (e.target.closest('[data-xc-quitar]') && !e.target.closest('[data-xc-of]')) { const p = prodDe(e.target); borrador.productos = borrador.productos.filter((x) => x !== p); pintarConfig(); return pintarOfertasCfg(); }
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
      pintarConfig();
      return pintarOfertasCfg();
    }
    if (e.target.closest('#xc-guardar')) return guardarConfig();
    if (e.target.closest('#xc-borrar')) { try { if (await eliminar(editId)) dlg.close(); } catch (err) { $('#xc-status', dlg).textContent = err.message; } }
  });
  // También en la pestaña Hoy (sin pipeline todavía).
  document.addEventListener('click', (e) => { const b = e.target.closest('#xhoy-body [data-xp-copiar]'); if (b) copiarFases(b); });
  async function copiarFases(b) {
    try {
      await navigator.clipboard.writeText(ETAPAS_CRUZADAS.map((x) => x.nombre).join('\n'));
      const antes = b.textContent;
      b.textContent = '✓ Copiadas';
      setTimeout(() => { b.textContent = antes; }, 1600);
    } catch { notice(`Fases: ${ETAPAS_CRUZADAS.map((x) => x.nombre).join(' · ')}`); }
  }

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
      : '<p class="muted">Aún no tienes productos con etiqueta en <strong>Mi negocio → Productos</strong>. Escríbelos aquí abajo con su etiqueta: al guardar se añaden allí también.</p><div class="row"><button type="button" class="btn ghost small" id="xc-cat-cerrar">Cerrar</button></div>';
  }

  async function guardarConfig() {
    const limpio = sanitizeCruzada({ ...borrador, productos: borrador.productos.filter((p) => p.nombre.trim() || p.tag || p.otras.length) });
    if (limpio.llamadas && !limpio.llamadasPipeline) limpio.llamadasPipeline = PIPELINE_CRUZADAS;
    const b = $('#xc-guardar', dlg);
    b.disabled = true;
    $('#xc-status', dlg).textContent = 'Guardando…';
    try {
      await guardar(editId, limpio);
      // Los productos nuevos (o sus etiquetas) también van a Mi negocio → Productos.
      let volcados = 0;
      try { volcados = await sincronizarCatalogo(limpio, editId); } catch (err) { notice(`Guardado, pero no se pudo añadir a Mi negocio → Productos: ${err.message}`, true); }
      dlg.close();
      notice(`✓ «${limpio.name}» guardado: ${productosListos(limpio).length} productos${volcados ? ` · ${volcados} cambio${volcados === 1 ? '' : 's'} en Mi negocio → Productos (pon allí su precio)` : ''}${limpio.llamadas ? ' · con Hoy y Llamadas' : ''}.`);
      if (state.embudo === editId) { cargar(editId, { fresh: true }); hoy.datos = null; }
    } catch (err) {
      $('#xc-status', dlg).textContent = err.message;
    } finally {
      b.disabled = false;
    }
  }

  return { cargar, pintar, cargarHoy, pintarHoy, pintarOfertas, abrirConfig, datos, alumnoDe };
}
