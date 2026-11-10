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
      if (ids.length) Object.assign(st.crea, (await api(`/api/fabrica?creatividades=${ids.join(',')}`).catch(() => ({ creatividades: {} }))).creatividades || {});
      st.ganadores = g.map((x) => ({ ...x, ...(st.crea[x.id] || {}) }));
    } catch (e) { st.error = e.message; }
    st.cargando = false;
    pintar(box);
  }

  const elegidos = () => (st.ganadores || []).filter((g) => st.sel[g.id]);
  function tarjeta(g, i) {
    const sel = st.sel[g.id];
    const img = g.imagen || g.miniatura;
    return `<article class="fb-g${sel ? ' on' : ''}" data-fb-g="${esc(g.id)}">
      <button type="button" class="fb-g-sel" data-fb-sel="${esc(g.id)}" aria-pressed="${sel ? 'true' : 'false'}" title="${sel ? 'Quitar del lote' : 'Variar este anuncio'}">
        <span class="fb-g-img">${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="fb-g-sinimg">Sin imagen</span>'}<span class="fb-g-tipo">${g.tipo === 'video' ? '▶ Vídeo' : g.tipo === 'carrusel' ? '▦ Carrusel' : '🖼 Imagen'}</span>${i < 3 ? `<span class="fb-g-top">#${i + 1}</span>` : ''}<span class="fb-g-check" aria-hidden="true">${sel ? '✓' : '+'}</span></span>
      </button>
      <div class="fb-g-c"><strong title="${esc(g.nombre)}">${esc(g.nombre)}</strong>
        <div class="fb-g-m"><span title="Ventas reales (primeras compras) de quien llegó por este anuncio"><b>${g.ventas}</b> ventas</span><span title="ROAS real: lo cobrado de verdad ÷ lo invertido">ROAS <b>${g.roasReal != null ? `${String(g.roasReal).replace('.', ',')}x` : '–'}</b></span><span title="Invertido">${eur(g.gasto)}</span>${g.ctr != null ? `<span title="CTR de enlace">CTR ${(Number(g.ctr) * 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })} %</span>` : ''}${g.registros ? `<span>${g.registros} registros</span>` : ''}</div>
        ${g.texto ? `<p class="fb-g-t">${esc(g.texto.slice(0, 140))}${g.texto.length > 140 ? '…' : ''}</p>` : ''}
        ${sel ? `<div class="fb-g-opc"><label class="fb-n">Variaciones <input type="number" min="1" max="10" value="${sel.n}" data-fb-n="${esc(g.id)}"></label>
          <div class="fb-cambios">${cambiosPara(g.tipo).map((c) => `<button type="button" class="fb-cambio${sel.cambios.includes(c.id) ? ' on' : ''}" data-fb-cambio="${esc(g.id)}|${c.id}">${c.ico} ${esc(c.label)}</button>`).join('')}</div></div>` : ''}
      </div></article>`;
  }
  function pintarLotes() {
    if (!st.lotes.length) return '';
    return `<details class="fb-lotes" open><summary>📦 Lotes de este embudo <span class="st-chip">${st.lotes.length}</span></summary><ul>${st.lotes.map((l) => `<li class="fb-lote ${l.estado}">
      <div><strong>${esc(l.nombre)}</strong> <span class="muted small">${new Date(l.creado).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · ${l.items.length} ${l.items.length === 1 ? 'anuncio' : 'anuncios'} · ${l.items.reduce((t, x) => t + x.n, 0)} variaciones</span></div>
      <span class="fb-estado ${l.estado}">${l.estado === 'hecho' ? '✅ Hecho' : '⏳ Pendiente'}</span>
      ${l.drive ? `<a class="btn small" href="${esc(l.drive)}" target="_blank" rel="noopener">📁 Drive</a>` : ''}
      <button type="button" class="btn small" data-fb-frase="${esc(l.id)}">📋 Frase para Claude</button>
      ${puedeConfig() ? `<button type="button" class="btn ghost small" data-fb-estado="${esc(l.id)}">${l.estado === 'hecho' ? 'Reabrir' : 'Marcar hecho'}</button><button type="button" class="btn ghost small" data-fb-borrar="${esc(l.id)}" aria-label="Borrar el lote">🗑️</button>` : ''}
    </li>`).join('')}</ul></details>`;
  }
  function pintar(box) {
    if (!box) return;
    const c = ctx();
    const sel = elegidos();
    const nVar = sel.reduce((t, g) => t + st.sel[g.id].n, 0);
    box.innerHTML = `<section class="card fb">
      <header class="fb-cab"><div><h3>🏭 Fábrica de variaciones</h3><p class="muted small">De los anuncios que <strong>venden de verdad</strong>, variaciones nuevas con <strong>Magnific</strong> (imágenes, vídeos con IA o de stock), guardadas en <strong>Google Drive</strong>. Con tus créditos de Magnific: sin API de pago.</p></div>
        <div class="fb-periodo">${PRESETS.filter(([id]) => c.lanz || id !== 'lanzamiento').map(([id, l]) => `<button type="button" class="fb-p${st.preset === id ? ' on' : ''}" data-fb-preset="${id}">${l}</button>`).join('')}<button type="button" class="btn ghost small" data-fb="recargar" title="Volver a leer Meta">↻</button></div></header>
      <ol class="fb-pasos"><li class="${(st.ganadores || []).length ? 'hecho' : 'on'}"><b>1</b> Ganadores</li><li class="${sel.length ? 'hecho' : (st.ganadores || []).length ? 'on' : ''}"><b>2</b> Elige y qué cambiar</li><li class="${st.listo ? 'hecho' : sel.length ? 'on' : ''}"><b>3</b> Preparar el lote</li><li class="${st.listo ? 'on' : ''}"><b>4</b> Claude + Magnific → Drive</li></ol>
      ${st.cargando ? '<p class="muted">Leyendo los anuncios de Meta y sus ventas reales…</p>' : st.error ? `<p class="fb-error">⚠️ ${esc(st.error)}</p>` : !st.ganadores ? '' : !st.ganadores.length ? '<p class="muted">No hay anuncios con gasto en este periodo.</p>' : `
        <p class="muted small">Ordenados por <strong>ventas reales</strong> (y, a igualdad, por lo cobrado, compras, registros y CTR). Pulsa la imagen para añadirlo al lote.</p>
        <div class="fb-grid">${st.ganadores.map(tarjeta).join('')}</div>`}
      ${sel.length && puedeConfig() ? `<div class="fb-lote-form">
        <label class="field"><span>Nombre del lote</span><input id="fb-nombre" maxlength="80" value="${esc(st.nombre || `Variaciones ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`)}"></label>
        <label class="field fb-ancho"><span>Indicaciones para todas <small>(opcional)</small></span><input id="fb-notas" maxlength="600" value="${esc(st.notas || '')}" placeholder="Ej.: más testimonios; evitar fondos oscuros; nada de precios en la imagen"></label>
        <button type="button" class="btn primary" data-fb="preparar">⚡ Preparar el lote · ${sel.length} ${sel.length === 1 ? 'anuncio' : 'anuncios'}, ${nVar} variaciones</button>
      </div>` : ''}
      ${st.listo ? `<div class="fb-listo"><h4>✅ Lote «${esc(st.listo.nombre)}» listo</h4>
        <p>Abre <strong>Claude</strong> (con los conectores de <strong>AlquimIA</strong>, <strong>Magnific</strong> y <strong>Google Drive</strong>) y pega esta frase:</p>
        <pre class="snippet fb-frase">${esc(fraseClaude(st.listo, c.cliente))}</pre>
        <p><button type="button" class="btn primary" data-fb-frase="${esc(st.listo.id)}">📋 Copiar la frase</button> <button type="button" class="btn" data-fb-todo="${esc(st.listo.id)}" title="Si en ese Claude no tienes el conector de AlquimIA: las instrucciones y los prompts, todo junto">📄 Copiar todo (sin conector)</button></p>
        <p class="muted small">Claude creará las variaciones en Magnific y las guardará en Drive en «${esc(carpetaLote(st.listo).join(' / '))}». Al acabar, marcará el lote como hecho con el enlace de la carpeta.</p></div>` : ''}
      ${pintarLotes()}
    </section>`;
  }

  const loteDe = (id) => (st.listo?.id === id ? st.listo : st.lotes.find((l) => l.id === id));
  const copiar = async (t, msg) => { try { await navigator.clipboard.writeText(t); notice(msg); } catch { window.prompt('Copia esto:', t); } };
  function enlazar(box) {
    box.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-fb],[data-fb-sel],[data-fb-cambio],[data-fb-preset],[data-fb-frase],[data-fb-todo],[data-fb-estado],[data-fb-borrar]');
      if (!t) return;
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
