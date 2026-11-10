// Pestaña Crear → Anuncios → 🏭 Fábrica de variaciones (en el navegador). Ver public/js/fabrica.js.
//  1. Ganadores del embudo (Meta + ventas reales), con su imagen o vídeo.  2. Eliges cuáles, cuántas variaciones y qué
//  cambiar.  3. «Preparar el lote»: AlquimIA escribe el prompt de cada uno y lo guarda.  4-5. En Claude, con Magnific y
//  Google Drive conectados, la frase del lote: Claude crea las variaciones y las guarda en Drive.
import { ganadoresDe, cambiosPara, promptVariacion, fraseClaude, instruccionesLote, carpetaLote } from './fabrica.js';

const eur = (n) => (n == null || !Number.isFinite(Number(n)) ? '–' : Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2 }));
const PRESETS = [['lanzamiento', 'Este lanzamiento'], ['30d', '30 días'], ['90d', '90 días']];

export function montarFabrica({ api, esc, notice, ls, puedeConfig, ctx }) {
  // ctx(): { embudo, embudoNombre, code, cliente, clienteNombre, lanz, marca: { nombre, producto } }
  const st = { cargando: false, error: '', ganadores: null, crea: {}, sel: {}, lotes: [], preset: ls.get('lsd_fab_preset') || '90d', listo: null, clave: '' };

  async function cargar(box, { fresh = false } = {}) {
    const c = ctx();
    const preset = !c.lanz && st.preset === 'lanzamiento' ? '90d' : st.preset;
    const clave = `${c.cliente}|${c.embudo}|${c.code}|${preset}`;
    if (!fresh && st.clave === clave && st.ganadores) { pintar(box); return; }
    st.clave = clave; st.cargando = true; st.error = ''; st.ganadores = null; pintar(box);
    try {
      const qs = new URLSearchParams({ embudo: c.embudo, code: c.code, preset, ...(fresh ? { fresh: '1' } : {}) });
      const [d, lotes] = await Promise.all([api(`/api/publicidad?${qs}`), api('/api/fabrica').catch(() => ({ lotes: [] }))]);
      st.lotes = (lotes.lotes || []).filter((l) => !l.embudo || l.embudo === c.embudo);
      if (!d.configured) throw new Error('Meta no está conectado en este cliente (Conexiones → Anuncios).');
      if (d.sinCampanas) throw new Error('Este embudo no tiene campañas de Meta (revisa el código de campaña en su configuración).');
      const v = await api(`/api/publicidad?${qs}&parte=ventas`).catch(() => ({ ventas: [] }));
      const g = ganadoresDe(d, v.ventas || [], { desde: d.rango?.desde || '', hasta: d.rango?.hasta || '9999' }).slice(0, 24);
      const ids = g.map((x) => x.id).filter((id) => !st.crea[id]);
      st.avisoCrea = '';
      // De 12 en 12: si un trozo falla, el resto se ve igual.
      for (let i = 0; i < ids.length; i += 12) {
        const r = await api(`/api/fabrica?creatividades=${ids.slice(i, i + 12).join(',')}`).catch((e) => ({ creatividades: {}, aviso: e.message }));
        Object.assign(st.crea, r.creatividades || {});
        if (r.aviso && !st.avisoCrea.includes(r.aviso)) st.avisoCrea = [st.avisoCrea, r.aviso].filter(Boolean).join(' · ');
      }
      st.ganadores = g.map((x) => ({ ...x, ...(st.crea[x.id] || {}) }));
    } catch (e) { st.error = e.message; }
    st.cargando = false;
    pintar(box);
  }

  const elegidos = () => (st.ganadores || []).filter((g) => st.sel[g.id]);
  const num = (n, d = 0) => Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: d });
  const roasTxt = (r) => (r != null ? `${num(r, 2)}x` : '–');
  const roasCls = (r) => (r == null ? '' : r >= 2 ? 'bueno' : r >= 1 ? 'medio' : 'malo');
  const tono = (id) => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const icoTipo = (t) => (t === 'video' ? '🎬' : t === 'carrusel' ? '🎠' : '🖼️');
  const nomTipo = (t) => (t === 'video' ? 'Vídeo' : t === 'carrusel' ? 'Carrusel' : 'Imagen');
  const MEDALLAS = ['oro', 'plata', 'bronce'];
  function media(g, i) {
    const img = g.imagen || g.miniatura;
    return `<span class="fb-m"${img ? '' : ` style="--h:${tono(g.id)}"`}>
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-fb-img>` : ''}
      <span class="fb-m-vacia"${img ? ' hidden' : ''}><span>${icoTipo(g.tipo)}</span><small>Vista previa no disponible</small></span>
      ${g.video ? `<video muted loop playsinline preload="none" src="${esc(g.video)}"${img ? ` poster="${esc(img)}"` : ''}></video>` : ''}
      ${g.tipo === 'video' ? '<span class="fb-play" aria-hidden="true">▶</span>' : ''}
      <span class="fb-m-tipo">${icoTipo(g.tipo)} ${nomTipo(g.tipo)}${g.duracion ? ` · ${g.duracion} s` : ''}</span>
      <span class="fb-m-rank${i < 3 ? ` medalla ${MEDALLAS[i]}` : ''}" title="Puesto ${i + 1} en ventas reales">${i < 3 ? i + 1 : `#${i + 1}`}</span>
      <span class="fb-m-pie"><strong title="${esc(g.nombre)}">${esc(g.nombre)}</strong>${g.conjunto ? `<small title="${esc(g.campana)} · ${esc(g.conjunto)}">${esc(g.conjunto)}</small>` : ''}</span>
      <span class="fb-m-check" aria-hidden="true">${st.sel[g.id] ? '✓' : '+'}</span>
    </span>`;
  }
  function tarjeta(g, i) {
    const sel = st.sel[g.id];
    return `<article class="fb-g${sel ? ' on' : ''}${i < 3 ? ' podio' : ''}" data-fb-g="${esc(g.id)}">
      <button type="button" class="fb-g-sel" data-fb-sel="${esc(g.id)}" aria-pressed="${sel ? 'true' : 'false'}" title="${sel ? 'Quitar del lote' : 'Añadir al lote para variarlo'}">${media(g, i)}</button>
      <div class="fb-g-c">
        <div class="fb-kpis">
          <span class="fb-kpi fb-kpi-v" title="Ventas reales (primeras compras) de quien llegó por este anuncio"><b>${num(g.ventas)}</b><small>${g.ventas === 1 ? 'venta' : 'ventas'}</small></span>
          <span class="fb-kpi fb-roas ${roasCls(g.roasReal)}" title="ROAS real: lo cobrado de verdad ÷ lo invertido"><b>${roasTxt(g.roasReal)}</b><small>ROAS real</small></span>
          <span class="fb-kpi" title="Invertido en el periodo"><b>${eur(g.gasto)}</b><small>invertido</small></span>
        </div>
        <div class="fb-g-m">${g.ctr != null ? `<span>👆 CTR ${num(Number(g.ctr) * 100, 2)} %</span>` : ''}${g.registros ? `<span>📝 ${num(g.registros)} registros</span>` : ''}${g.ingresos ? `<span>💶 ${eur(g.ingresos)} cobrados</span>` : ''}</div>
        ${g.texto ? `<p class="fb-g-t">${esc(g.texto.slice(0, 160))}${g.texto.length > 160 ? '…' : ''}</p>` : ''}
        ${sel ? `<div class="fb-g-opc"><div class="fb-n"><span>Variaciones</span><span class="fb-n-ctl"><button type="button" data-fb-mas="${esc(g.id)}|-1" aria-label="Una menos">−</button><b>${sel.n}</b><button type="button" data-fb-mas="${esc(g.id)}|1" aria-label="Una más">+</button></span></div>
          <span class="fb-opc-t">Qué cambiar</span>
          <div class="fb-cambios">${cambiosPara(g.tipo).map((c) => `<button type="button" class="fb-cambio${sel.cambios.includes(c.id) ? ' on' : ''}" data-fb-cambio="${esc(g.id)}|${c.id}">${c.ico} ${esc(c.label)}</button>`).join('')}</div></div>`
          : `<button type="button" class="fb-g-add" data-fb-sel="${esc(g.id)}">＋ Variar este anuncio</button>`}
      </div></article>`;
  }
  function esqueleto() {
    return `<div class="fb-grid fb-cargando">${Array.from({ length: 6 }, () => '<div class="fb-g fb-skel"><span class="fb-m"></span><div class="fb-g-c"><i></i><i></i><i></i></div></div>').join('')}</div>`;
  }
  function pintarLotes() {
    if (!st.lotes.length) return '';
    return `<section class="fb-lotes"><h4>📦 Lotes de este embudo <span class="st-chip">${st.lotes.length}</span></h4><ul>${st.lotes.map((l) => `<li class="fb-lote ${l.estado}">
      <span class="fb-lote-mini">${l.items.slice(0, 3).map((it) => (it.imagen || it.miniatura ? `<img src="${esc(it.imagen || it.miniatura)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span style="--h:${tono(it.id)}">${icoTipo(it.tipo)}</span>`)).join('')}</span>
      <div><strong>${esc(l.nombre)}</strong><span class="muted small">${new Date(l.creado).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · ${l.items.length} ${l.items.length === 1 ? 'anuncio' : 'anuncios'} · ${l.items.reduce((t, x) => t + x.n, 0)} variaciones</span></div>
      <span class="fb-estado ${l.estado}">${l.estado === 'hecho' ? '✅ Hecho' : '⏳ Pendiente'}</span>
      <span class="fb-lote-acc">${l.drive ? `<a class="btn small" href="${esc(l.drive)}" target="_blank" rel="noopener">📁 Abrir en Drive</a>` : ''}
      <button type="button" class="btn small" data-fb-frase="${esc(l.id)}">📋 Frase para Claude</button>
      ${puedeConfig() ? `<button type="button" class="btn ghost small" data-fb-estado="${esc(l.id)}">${l.estado === 'hecho' ? 'Reabrir' : 'Marcar hecho'}</button><button type="button" class="btn ghost small" data-fb-borrar="${esc(l.id)}" aria-label="Borrar el lote">🗑️</button>` : ''}</span>
    </li>`).join('')}</ul></section>`;
  }
  function pintar(box) {
    if (!box) return;
    const c = ctx();
    const sel = elegidos();
    const nVar = sel.reduce((t, g) => t + st.sel[g.id].n, 0);
    const gs = st.ganadores || [];
    const tot = { gasto: gs.reduce((t, g) => t + (g.gasto || 0), 0), ventas: gs.reduce((t, g) => t + (g.ventas || 0), 0), ingresos: gs.reduce((t, g) => t + (g.ingresos || 0), 0) };
    const mejor = gs.filter((g) => g.ventas && g.roasReal != null).sort((a, b) => b.roasReal - a.roasReal)[0];
    const paso = st.listo ? 4 : sel.length ? 3 : gs.length ? 2 : 1;
    const pasos = ['Ganadores', 'Elige y qué cambiar', 'Prepara el lote', 'Claude + Magnific → Drive'];
    box.innerHTML = `<section class="fb">
      <header class="fb-hero">
        <div class="fb-hero-top">
          <div><span class="fb-eyebrow">🏭 Fábrica de variaciones</span>
            <h3>Multiplica los anuncios que <em>ya venden</em></h3>
            <p>Elige los ganadores y Claude crea variaciones nuevas con <b>Magnific</b> (imágenes, vídeos con IA o de stock) y las deja en <b>Google Drive</b>. Con tus créditos de Magnific, sin API de pago.</p></div>
          <div class="fb-periodo">${PRESETS.filter(([id]) => c.lanz || id !== 'lanzamiento').map(([id, l]) => `<button type="button" class="fb-p${st.preset === id ? ' on' : ''}" data-fb-preset="${id}">${l}</button>`).join('')}<button type="button" class="fb-p" data-fb="recargar" title="Volver a leer Meta" aria-label="Volver a leer Meta">↻</button></div>
        </div>
        ${gs.length ? `<div class="fb-stats">
          <div><small>Anuncios con gasto</small><b>${num(gs.length)}</b></div>
          <div><small>Ventas reales</small><b>${num(tot.ventas)}</b></div>
          <div><small>Cobrado</small><b>${eur(tot.ingresos)}</b></div>
          <div><small>Mejor ROAS real</small><b>${mejor ? roasTxt(mejor.roasReal) : '–'}</b></div>
        </div>` : ''}
        <ol class="fb-pasos">${pasos.map((t, i) => `<li class="${i + 1 < paso ? 'hecho' : i + 1 === paso ? 'on' : ''}"><b>${i + 1 < paso ? '✓' : i + 1}</b><span>${t}</span></li>`).join('')}</ol>
      </header>
      <div class="fb-cuerpo">
      ${st.avisoCrea && (st.ganadores || []).some((g) => !g.imagen && !g.miniatura) ? `<p class="fb-aviso">🖼️ Algunas imágenes no han llegado de Meta: ${esc(st.avisoCrea)}</p>` : ''}
      ${st.cargando ? `<p class="fb-leyendo"><span class="fb-spin" aria-hidden="true"></span> Leyendo los anuncios de Meta y sus ventas reales…</p>${esqueleto()}`
        : st.error ? `<p class="fb-error">⚠️ ${esc(st.error)}</p>`
        : !st.ganadores ? '' : !gs.length ? '<p class="muted">No hay anuncios con gasto en este periodo.</p>' : `
        <div class="fb-sec"><h4>🏆 El podio</h4><span class="muted small">Ordenados por <strong>ventas reales</strong> (a igualdad: lo cobrado, compras, registros y CTR). Pulsa un anuncio para añadirlo al lote.</span></div>
        <div class="fb-grid fb-grid-podio">${gs.slice(0, 3).map(tarjeta).join('')}</div>
        ${gs.length > 3 ? `<div class="fb-sec"><h4>El resto de anuncios</h4><span class="muted small">${gs.length - 3} más</span></div>
        <div class="fb-grid">${gs.slice(3).map((g, i) => tarjeta(g, i + 3)).join('')}</div>` : ''}`}
      ${st.listo ? `<div class="fb-listo"><div class="fb-listo-ico" aria-hidden="true">🚀</div><div>
        <h4>Lote «${esc(st.listo.nombre)}» listo</h4>
        <p>Abre <strong>Claude</strong> con los conectores de <strong>AlquimIA</strong>, <strong>Magnific</strong> y <strong>Google Drive</strong> y pega esta frase:</p>
        <pre class="snippet fb-frase">${esc(fraseClaude(st.listo, c.cliente))}</pre>
        <p class="fb-listo-acc"><button type="button" class="btn primary" data-fb-frase="${esc(st.listo.id)}">📋 Copiar la frase</button> <button type="button" class="btn" data-fb-todo="${esc(st.listo.id)}" title="Si en ese Claude no tienes el conector de AlquimIA: las instrucciones y los prompts, todo junto">📄 Copiar todo (sin conector)</button></p>
        <p class="muted small">📁 Se guardará en Drive en «${esc(carpetaLote(st.listo).join(' / '))}». Al acabar, Claude marcará el lote como hecho con el enlace de la carpeta.</p></div></div>` : ''}
      ${pintarLotes()}
      </div>
      ${sel.length && puedeConfig() ? `<div class="fb-dock">
        <span class="fb-dock-mini">${sel.slice(0, 4).map((g) => (g.imagen || g.miniatura ? `<img src="${esc(g.imagen || g.miniatura)}" alt="" referrerpolicy="no-referrer">` : `<span style="--h:${tono(g.id)}">${icoTipo(g.tipo)}</span>`)).join('')}</span>
        <span class="fb-dock-txt"><b>${sel.length} ${sel.length === 1 ? 'anuncio' : 'anuncios'}</b><small>${nVar} variaciones</small></span>
        <input id="fb-nombre" maxlength="80" aria-label="Nombre del lote" value="${esc(st.nombre || `Variaciones ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`)}">
        <input id="fb-notas" maxlength="600" aria-label="Indicaciones para todas" value="${esc(st.notas || '')}" placeholder="Indicaciones (opcional): más testimonios, sin precios…">
        <button type="button" class="btn primary" data-fb="preparar">⚡ Preparar el lote</button>
      </div>` : ''}
    </section>`;
    // Si una imagen de Meta caduca o no carga: la tarjeta de color.
    box.querySelectorAll('img[data-fb-img]').forEach((im) => im.addEventListener('error', () => { im.remove(); im.parentElement?.querySelector('.fb-m-vacia')?.removeAttribute('hidden'); }, { once: true }));
  }

  const loteDe = (id) => (st.listo?.id === id ? st.listo : st.lotes.find((l) => l.id === id));
  const copiar = async (t, msg) => { try { await navigator.clipboard.writeText(t); notice(msg); } catch { window.prompt('Copia esto:', t); } };
  function enlazar(box) {
    box.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-fb],[data-fb-mas],[data-fb-sel],[data-fb-cambio],[data-fb-preset],[data-fb-frase],[data-fb-todo],[data-fb-estado],[data-fb-borrar]');
      if (!t) return;
      if (t.dataset.fbMas) { const [id, d] = t.dataset.fbMas.split('|'); const x = st.sel[id]; if (x) { x.n = Math.min(Math.max(x.n + Number(d), 1), 10); pintar(box); } return; }
      if (t.dataset.fbPreset) { st.preset = t.dataset.fbPreset; ls.set('lsd_fab_preset', st.preset); cargar(box); return; }
      if (t.dataset.fbSel) { const id = t.dataset.fbSel; if (st.sel[id]) delete st.sel[id]; else st.sel[id] = { n: 3, cambios: cambiosPara((st.ganadores || []).find((g) => g.id === id)?.tipo).slice(0, 2).map((c) => c.id) }; st.listo = null; pintar(box); return; }
      if (t.dataset.fbCambio) { const [id, c] = t.dataset.fbCambio.split('|'); const s = st.sel[id]; if (s) s.cambios = s.cambios.includes(c) ? s.cambios.filter((x) => x !== c) : [...s.cambios, c]; pintar(box); return; }
      if (t.dataset.fbFrase) { const l = loteDe(t.dataset.fbFrase); if (l) copiar(fraseClaude(l, ctx().cliente), 'Frase copiada: pégala en Claude.'); return; }
      if (t.dataset.fbTodo) {
        const l = loteDe(t.dataset.fbTodo);
        if (l) copiar(`${instruccionesLote(l)}\n\nCarpeta de Drive: ${carpetaLote(l).join(' / ')}\n\n${l.items.map((it, i) => `=== ANUNCIO ${i + 1} DE ${l.items.length} ===\n${it.prompt}`).join('\n\n')}`, 'Instrucciones y prompts copiados: pégalos en Claude.');
        return;
      }
      if (t.dataset.fbEstado) {
        const l = loteDe(t.dataset.fbEstado);
        if (!l) return;
        const drive = l.estado === 'hecho' ? l.drive : (window.prompt('Enlace de la carpeta de Drive (opcional):', l.drive || '') ?? null);
        if (drive === null) return;
        try { const r = await api('/api/fabrica', { method: 'POST', body: { op: 'estado', id: l.id, estado: l.estado === 'hecho' ? 'pendiente' : 'hecho', drive } }); Object.assign(l, r.lote); pintar(box); } catch (err) { notice(err.message, true); }
        return;
      }
      if (t.dataset.fbBorrar) {
        if (!window.confirm('¿Borrar este lote? (las variaciones que ya estén en Drive no se tocan)')) return;
        try { await api('/api/fabrica', { method: 'POST', body: { op: 'borrar', id: t.dataset.fbBorrar } }); st.lotes = st.lotes.filter((l) => l.id !== t.dataset.fbBorrar); if (st.listo?.id === t.dataset.fbBorrar) st.listo = null; pintar(box); } catch (err) { notice(err.message, true); }
        return;
      }
      if (t.dataset.fb === 'recargar') { cargar(box, { fresh: true }); return; }
      if (t.dataset.fb === 'preparar') {
        const c = ctx();
        st.nombre = box.querySelector('#fb-nombre')?.value.trim();
        t.textContent = 'Preparando…';
        st.notas = box.querySelector('#fb-notas')?.value.trim();
        const items = elegidos().map((g) => ({ ...g, n: st.sel[g.id].n, cambios: st.sel[g.id].cambios, prompt: promptVariacion(g, { marca: c.marca, n: st.sel[g.id].n, cambios: st.sel[g.id].cambios, notas: st.notas }) }));
        t.disabled = true;
        try {
          const r = await api('/api/fabrica', { method: 'POST', body: { op: 'guardar', lote: { nombre: st.nombre, notas: st.notas, embudo: c.embudo, embudoNombre: c.embudoNombre, code: c.code, cliente: c.cliente, clienteNombre: c.clienteNombre, items } } });
          st.listo = r.lote;
          st.lotes = [r.lote, ...st.lotes.filter((l) => l.id !== r.lote.id)];
          st.sel = {};
          pintar(box);
          box.querySelector('.fb-listo')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (err) { notice(err.message, true); t.disabled = false; }
      }
    });
    box.addEventListener('input', (e) => {
      if (e.target.id === 'fb-nombre') st.nombre = e.target.value;
      if (e.target.id === 'fb-notas') st.notas = e.target.value;
    });
    box.addEventListener('mouseover', (e) => {
      const v = e.target.closest('.fb-g')?.querySelector('video');
      if (v && v.paused) v.play().catch(() => {});
    });
    box.addEventListener('mouseout', (e) => {
      const g = e.target.closest('.fb-g');
      if (g && !g.contains(e.relatedTarget)) g.querySelector('video')?.pause();
    });
    box.addEventListener('change', (e) => {
      const id = e.target.dataset.fbN;
      if (id && st.sel[id]) { st.sel[id].n = Math.min(Math.max(Math.round(Number(e.target.value) || 1), 1), 10); pintar(box); }
    });
  }

  return {
    // Se llama cada vez que se pinta la pestaña Anuncios.
    montar(box) {
      if (!box) return;
      if (!box.dataset.fbEnlazado) { enlazar(box); box.dataset.fbEnlazado = '1'; }
      cargar(box);
    },
  };
}
