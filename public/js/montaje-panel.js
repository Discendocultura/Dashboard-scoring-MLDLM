// 🚀 Montaje con IA (Crear → Montaje): las 6 fases del lanzamiento en fila, lo que ha hecho la IA en cada una con su
// vista previa, editar, aprobar (admin), pedir cambios y reabrir (admin), y los prompts para que Claude lo haga solo.
// Datos: /api/montaje. Lógica común: montaje.js. Iconos: los de línea de icons.js.
import { FASES, FASE, ESTADOS_FASE, estadosFases, faseActual, aprobadas, empezado, piezasDe, piezaCompleta, coloresDe, esSvg, svgLimpio, promptArranque } from './montaje.js';
import { icon } from './icons.js';

const i = (n, cls = '') => icon(n, cls);
const fechaHora = (iso) => { try { return new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }); } catch { return ''; } };
const ACCIONES = { empezado: 'Empezó el montaje', 'ia-avance': 'La IA guardó avances', 'ia-lista': 'La IA la entregó para revisar', editada: 'La editó', aprobada: 'La aprobó', cambios: 'Pidió cambios', reabierta: 'La reabrió' };

export function montarMontaje({ api, esc, cliente, clienteNombre, alCambiar = () => {}, root = () => document.getElementById('montaje-body') }) {
  const st = { code: '', datos: null, fase: '', editando: new Set(), pidiendo: false, msg: '', error: '', ocupado: false, cargando: false };

  async function abrir(code) {
    const box = root();
    if (!box) return;
    if (!code) { box.innerHTML = '<div class="card empty"><p class="muted">Elige un lanzamiento para montarlo con IA.</p></div>'; return; }
    if (code !== st.code) { st.code = code; st.datos = null; st.fase = ''; st.editando.clear(); st.pidiendo = false; st.msg = ''; st.error = ''; }
    if (!st.datos) box.innerHTML = '<div class="mj-cargando">Cargando el montaje…</div>';
    st.cargando = true;
    try { st.datos = await api(`/api/montaje?l=${encodeURIComponent(code)}`); st.error = ''; } catch (e) { st.error = e.message; }
    st.cargando = false;
    if (st.code === code) pintar();
  }
  async function post(op, datos = {}, ok = '') {
    st.ocupado = true; st.error = ''; st.msg = ''; pintar();
    try {
      const r = await api('/api/montaje', { method: 'POST', body: { op, l: st.code, fase: st.fase, ...datos } });
      if (r.montaje) st.datos.montaje = r.montaje;
      st.msg = ok;
      alCambiar();
      await abrir(st.code); // el encargo de cada fase cambia con lo aprobado
      return r;
    } catch (e) { st.error = e.message; return null; } finally { st.ocupado = false; pintar(); }
  }
  async function copiar(texto, ok) {
    try { await navigator.clipboard.writeText(texto); st.msg = ok; } catch { st.error = 'No se pudo copiar: selecciona el texto y cópialo a mano.'; }
    pintar();
  }

  // ---- Piezas ----
  const vistaLogo = (p) => {
    if (p.url) return `<img class="mj-logo-img" src="${esc(p.url)}" alt="Logo del lanzamiento" loading="lazy">`;
    if (esSvg(p.texto)) return `<img class="mj-logo-img" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgLimpio(p.texto))}" alt="Logo del lanzamiento">`;
    return '';
  };
  function pieza(d, p = {}, puede) {
    const ok = piezaCompleta(d, p);
    const edit = puede && st.editando.has(d.id);
    let cuerpo = '';
    if (d.tipo === 'ghl') {
      cuerpo = `<div class="mj-ghl">
        <input type="url" class="mj-input" data-mj-url="${esc(d.id)}" value="${esc(p.url || '')}" placeholder="URL en GHL (la pone la IA al montarla)" ${puede ? '' : 'disabled'} aria-label="URL de ${esc(d.titulo)}">
        ${p.url ? `<a class="btn ghost small" href="${esc(p.url)}" target="_blank" rel="noopener">${i('link')} Abrir</a>` : ''}
        <label class="mj-check"><input type="checkbox" data-mj-hecho="${esc(d.id)}" ${p.hecho ? 'checked' : ''} ${puede ? '' : 'disabled'}> Montada</label>
      </div>${d.faltan?.length ? `<p class="mj-falta">${i('alert')} Falta en AlquimIA: ${esc(d.faltan.join(', '))}</p>` : ''}`;
    } else if (edit) {
      cuerpo = `<textarea class="mj-area" data-mj-texto="${esc(d.id)}" rows="${d.tipo === 'logo' ? 6 : 12}" placeholder="${d.tipo === 'logo' ? 'Pega el SVG del logo…' : 'Escribe aquí…'}">${esc(p.texto || '')}</textarea>
        ${d.tipo === 'logo' ? `<input type="url" class="mj-input" data-mj-url="${esc(d.id)}" value="${esc(p.url || '')}" placeholder="…o la URL de la imagen (Canva, Drive…)">` : ''}
        ${d.tipo === 'colores' ? '<p class="muted small">Pon cada color con su código, por ejemplo <code>#1f4e79</code>: salen como muestras.</p>' : ''}`;
    } else {
      const colores = d.tipo === 'colores' ? coloresDe(p.colores?.length ? p.colores : p.texto) : [];
      cuerpo = [
        colores.length ? `<div class="mj-colores">${colores.map((c) => `<span class="mj-color" style="--c:${esc(c)}"><span class="mj-color-m"></span><code>${esc(c)}</code></span>`).join('')}</div>` : '',
        d.tipo === 'logo' ? (vistaLogo(p) ? `<div class="mj-logo">${vistaLogo(p)}</div>` : '') : '',
        p.texto && !(d.tipo === 'logo' && esSvg(p.texto)) ? `<div class="mj-texto">${esc(p.texto)}</div>` : '',
        !ok && !p.texto ? '<p class="mj-vacio">Aún sin hacer.</p>' : '',
      ].join('');
    }
    return `<article class="mj-pieza${ok ? ' ok' : ''}" data-mj-pieza="${esc(d.id)}">
      <header class="mj-pieza-h"><span class="mj-pieza-ico">${i(ok ? 'check' : 'clock')}</span><div><h4>${esc(d.titulo)}${d.opcional ? ' <small class="muted">(opcional)</small>' : ''}</h4><p class="muted small">${esc(d.que)}</p></div>
        ${puede && d.tipo !== 'ghl' ? `<button type="button" class="btn ghost small" data-mj-editar="${esc(d.id)}">${i('pencil')} ${edit ? 'Cerrar' : 'Editar'}</button>` : ''}</header>
      <div class="mj-pieza-c">${cuerpo}</div></article>`;
  }

  function pintar() {
    const box = root();
    if (!box) return;
    if (!st.datos) { box.innerHTML = st.error ? `<div class="card empty"><p class="mj-err">${esc(st.error)}</p></div>` : '<div class="mj-cargando">Cargando el montaje…</div>'; return; }
    const { montaje: m, admin, brief, nombre } = st.datos;
    const puede = true; // la pestaña ya pide el permiso de configuración
    const arranque = promptArranque({ code: st.code, nombre, clienteId: cliente(), cliente: clienteNombre() });
    const avisos = `${st.msg ? `<p class="mj-ok" role="status">${esc(st.msg)}</p>` : ''}${st.error ? `<p class="mj-err" role="alert">${esc(st.error)}</p>` : ''}`;

    if (!empezado(m)) {
      box.innerHTML = `<section class="mj mj-vacio-wrap">
        <div class="mj-hero"><div class="mj-hero-t"><span class="mj-kicker">${i('rocket')} Montaje con IA</span>
          <h2>Monta «${esc(nombre)}» <span class="mj-grad">fase a fase</span></h2>
          <p>Claude hace sola todo lo que puede: la narrativa, el contenido, las páginas en GHL, el copy, los mensajes y las automatizaciones. Tú solo apruebas cada fase.</p>
          <div class="mj-hero-acc"><button type="button" class="btn primary" data-mj-empezar ${st.ocupado ? 'disabled' : ''}>${i('rocket')} Empezar el montaje</button></div></div></div>
        ${avisos}
        <ol class="mj-intro">${FASES.map((f) => `<li><span class="mj-intro-n">${f.n}</span><span class="mj-intro-ico">${i(f.icono)}</span><div><strong>${esc(f.titulo)}</strong><small>${esc(f.objetivo)}</small></div></li>`).join('')}</ol>
      </section>`;
      return;
    }

    const estados = estadosFases(m);
    const actual = faseActual(m);
    if (!st.fase || !FASE[st.fase]) st.fase = actual || FASES[FASES.length - 1].id;
    const f = FASE[st.fase];
    const est = estados.find((x) => x.id === f.id).estado;
    const x = m.fases?.[f.id] || {};
    // Las piezas las manda el servidor (las de la fase 6 dependen del lanzamiento: sus workflows).
    const lista = st.datos.piezas?.[f.id] || piezasDe(f.id);
    const faltan = lista.filter((d) => !d.opcional && !piezaCompleta(d, x.piezas?.[d.id])).map((d) => d.titulo);
    const n = aprobadas(m);
    const pct = Math.round((n / FASES.length) * 100);
    const bloq = est === 'bloqueada';

    box.innerHTML = `<section class="mj">
      <div class="mj-hero">
        <div class="mj-hero-t"><span class="mj-kicker">${i('rocket')} Montaje con IA</span>
          <h2>«${esc(nombre)}» <span class="mj-grad">${actual ? `fase ${FASE[actual].n} de ${FASES.length}` : 'montado'}</span></h2>
          <p>${actual ? `Ahora toca <strong>${esc(FASE[actual].titulo.toLowerCase())}</strong>: ${esc(ESTADOS_FASE[estados.find((e) => e.id === actual).estado].label.toLowerCase())}.` : 'Las 6 fases están aprobadas. Ya puedes revisar el embudo en GHL y publicarlo.'}</p>
          <div class="mj-hero-acc">
            <button type="button" class="btn primary" data-mj-copiar="arranque">${i('claude')} Copiar instrucciones para Claude</button>
            <details class="mj-como"><summary>${i('help')} Cómo se usa</summary><ol>
              <li>Abre Claude (Cowork, o Claude Code con Chrome) con el conector de AlquimIA y pega las instrucciones.</li>
              <li>Claude hace la fase que toca y la deja aquí «para revisar». En páginas y automatizaciones, trabaja en GHL desde el navegador.</li>
              <li>Revisa y pulsa <strong>Aprobar</strong> o <strong>Pedir cambios</strong>. Después dile «sigue».</li></ol></details>
          </div></div>
        <div class="mj-anillo" style="--p:${pct}" role="img" aria-label="${n} de ${FASES.length} fases aprobadas"><span><strong>${n}</strong>/${FASES.length}</span><small>aprobadas</small></div>
      </div>
      ${avisos}
      <nav class="mj-pasos" aria-label="Fases del montaje">${FASES.map((g) => {
        const e = estados.find((y) => y.id === g.id).estado;
        return `<button type="button" class="mj-paso mj-${e}${g.id === f.id ? ' on' : ''}" data-mj-fase="${g.id}" aria-current="${g.id === f.id ? 'step' : 'false'}">
          <span class="mj-paso-n">${e === 'aprobada' ? i('check') : g.n}</span><span class="mj-paso-ico">${i(g.icono)}</span>
          <span class="mj-paso-t"><strong>${esc(g.corto)}</strong><small>${esc(ESTADOS_FASE[e].corto)}</small></span></button>`;
      }).join('<span class="mj-raya" aria-hidden="true"></span>')}</nav>

      <article class="mj-fase mj-${est}">
        <header class="mj-fase-h"><span class="mj-fase-emo" aria-hidden="true">${f.emoji}</span>
          <div><span class="mj-fase-k">Fase ${f.n} de ${FASES.length}</span><h3>${esc(f.titulo)}</h3><p class="muted">${esc(f.objetivo)}</p></div>
          <span class="mj-chip mj-chip-${ESTADOS_FASE[est].color}">${i(ESTADOS_FASE[est].icono)} ${esc(ESTADOS_FASE[est].label)}</span></header>
        ${bloq ? `<p class="mj-banda mj-banda-gris">${i('lock')} Se abre cuando se apruebe la fase ${f.n - 1}. Puedes ver lo que se pedirá a la IA.</p>` : ''}
        ${x.cambios ? `<div class="mj-banda mj-banda-rojo">${i('pencil')} <div><strong>Cambios pedidos</strong><p>${esc(x.cambios)}</p></div></div>` : ''}
        ${x.nota ? `<div class="mj-banda mj-banda-azul">${i('claude')} <div><strong>Nota de la IA</strong><p>${esc(x.nota)}</p></div></div>` : ''}
        ${x.aprobada ? `<p class="mj-banda mj-banda-verde">${i('check')} Aprobada por ${esc(x.aprobada.por)} · ${esc(fechaHora(x.aprobada.at))}</p>` : ''}
        <div class="mj-piezas">${lista.map((d) => pieza(d, x.piezas?.[d.id], puede && !bloq)).join('')}</div>
        ${!bloq ? `<div class="mj-barra">
          ${faltan.length && est !== 'aprobada' ? `<span class="mj-faltan">${i('clock')} Falta: ${esc(faltan.join(', '))}</span>` : '<span></span>'}
          <div class="mj-barra-acc">
            <button type="button" class="btn ghost small" data-mj-copiar="fase" title="El encargo de esta fase, por si quieres pegárselo a Claude a mano">${i('clipboard')} Copiar el encargo</button>
            <button type="button" class="btn small" data-mj-guardar ${st.ocupado ? 'disabled' : ''}>${i('save')} Guardar</button>
            ${est !== 'aprobada' ? `<button type="button" class="btn small" data-mj-pedir ${st.ocupado ? 'disabled' : ''}>${i('pencil')} Pedir cambios</button>` : ''}
            ${admin && est !== 'aprobada' ? `<button type="button" class="btn primary small" data-mj-aprobar ${st.ocupado || faltan.length ? 'disabled' : ''} title="${faltan.length ? 'Faltan piezas por hacer' : 'Aprobar y abrir la fase siguiente'}">${i('check')} Aprobar fase</button>` : ''}
            ${admin && est === 'aprobada' ? `<button type="button" class="btn ghost small" data-mj-reabrir ${st.ocupado ? 'disabled' : ''}>${i('refresh')} Reabrir</button>` : ''}
            ${!admin && est !== 'aprobada' ? '<span class="muted small">Solo una persona admin puede aprobar.</span>' : ''}
          </div></div>
          ${st.pidiendo ? `<div class="mj-pedir"><label for="mj-cambios">¿Qué tiene que cambiar la IA?</label><textarea id="mj-cambios" rows="3" placeholder="Por ejemplo: la narrativa es demasiado seria, busca un referente más cálido."></textarea><div><button type="button" class="btn primary small" data-mj-enviar-cambios>Enviar a la IA</button> <button type="button" class="btn ghost small" data-mj-pedir>Cancelar</button></div></div>` : ''}` : ''}
        <details class="mj-encargo"><summary>${i('eye')} Ver lo que se le pide a la IA en esta fase</summary><pre>${esc(brief[f.id] || '')}</pre></details>
      </article>

      ${m.registro?.length ? `<details class="mj-registro"><summary>${i('history')} Registro</summary><ul>${m.registro.slice(0, 30).map((r) => `<li><time>${esc(fechaHora(r.at))}</time> <strong>${esc(r.quien)}</strong> · ${esc(ACCIONES[r.accion] || r.accion)}${r.fase ? ` · ${esc(FASE[r.fase]?.corto || r.fase)}` : ''}${r.accion === 'cambios' && r.detalle ? `: «${esc(r.detalle)}»` : ''}</li>`).join('')}</ul></details>` : ''}
    </section>`;
    box.dataset.arranque = arranque;
  }

  // Lo que hay en pantalla de la fase abierta (para Guardar).
  function recoger() {
    const box = root();
    const piezas = {};
    box.querySelectorAll('[data-mj-texto]').forEach((t) => { (piezas[t.dataset.mjTexto] ||= {}).texto = t.value; });
    box.querySelectorAll('[data-mj-url]').forEach((t) => { (piezas[t.dataset.mjUrl] ||= {}).url = t.value.trim(); });
    box.querySelectorAll('[data-mj-hecho]').forEach((t) => { (piezas[t.dataset.mjHecho] ||= {}).hecho = t.checked; });
    return piezas;
  }

  document.addEventListener('click', async (e) => {
    const box = root();
    if (!box || !box.contains(e.target)) return;
    const b = e.target.closest('button, summary');
    if (!b) return;
    if (b.matches('[data-mj-empezar]')) { await post('empezar', {}, 'Montaje empezado: copia las instrucciones y pégaselas a Claude.'); return; }
    if (b.dataset.mjFase) { st.fase = b.dataset.mjFase; st.editando.clear(); st.pidiendo = false; st.msg = ''; st.error = ''; pintar(); return; }
    if (b.dataset.mjCopiar === 'arranque') { copiar(box.dataset.arranque || '', 'Instrucciones copiadas: pégalas en Claude (Cowork o Claude Code con Chrome).'); return; }
    if (b.dataset.mjCopiar === 'fase') { copiar(st.datos?.brief?.[st.fase] || '', 'Encargo de la fase copiado.'); return; }
    if (b.dataset.mjEditar) { const id = b.dataset.mjEditar; if (st.editando.has(id)) st.editando.delete(id); else st.editando.add(id); pintar(); return; }
    if (b.matches('[data-mj-guardar]')) { const piezas = recoger(); const r = await post('guardar', { piezas }, 'Guardado.'); if (r) st.editando.clear(); pintar(); return; }
    if (b.matches('[data-mj-pedir]')) { st.pidiendo = !st.pidiendo; pintar(); if (st.pidiendo) root().querySelector('#mj-cambios')?.focus(); return; }
    if (b.matches('[data-mj-enviar-cambios]')) {
      const texto = root().querySelector('#mj-cambios')?.value.trim();
      if (!texto) { st.error = 'Escribe qué hay que cambiar.'; pintar(); return; }
      const r = await post('cambios', { texto }, 'Cambios enviados: dile a Claude «sigue» y empezará por ellos.');
      if (r) st.pidiendo = false;
      pintar();
      return;
    }
    if (b.matches('[data-mj-aprobar]')) {
      const f = FASE[st.fase];
      const r = await post('aprobar', {}, f.n < FASES.length ? `Fase ${f.n} aprobada. Dile a Claude «sigue» para la fase ${f.n + 1}.` : '¡Montaje terminado! Las 6 fases están aprobadas.');
      if (r) { const sig = faseActual(st.datos.montaje); if (sig) st.fase = sig; pintar(); }
      return;
    }
    if (b.matches('[data-mj-reabrir]')) { if (confirm('¿Reabrir esta fase? Las siguientes se bloquean hasta que se vuelva a aprobar.')) await post('reabrir', {}, 'Fase reabierta.'); }
  });

  return { abrir, recargar: () => st.code && abrir(st.code) };
}
