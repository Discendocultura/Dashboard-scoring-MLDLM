// Asistente de Marca y avatar: lo primero que ve el cliente (desde su enlace o al entrar al dashboard con su
// acceso «Cliente»). Paso a paso, por orden de importancia, en etapas que caben en la pantalla, con la barra de
// progreso siempre a la vista, botón de guardar y vuelta al mismo paso al volver a entrar.
//   montarAsistente(raiz, { llamar, clienteNombre, docsActivos, alTerminar, salir })
//     llamar(body | null) → datos (null = leer): { respuestas, productos, docs, asistente, progreso }
import { pasosAsistente, PASOS_POR_PRODUCTO, faltanEnPaso, faltanObligatorias, preguntaDe, nombreDeProducto, MAX_PRODUCTOS, MAX_DOCS } from './marca.js';
import { pintarCampos, autoguardado, destinoDeBase, extraerTexto, extDe, ACCEPT_DOCS } from './marca-form.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function montarAsistente(raiz, { llamar, clienteNombre = '', docsActivos = true, alTerminar = null, salir = null }) {
  let datos = await llamar(null);
  let pasos = pasosAsistente(datos);
  let i = Math.max(0, pasos.findIndex((p) => p.id === datos.asistente?.paso));
  if (datos.asistente?.completado) i = -1; // ya terminado: pantalla de gracias

  raiz.innerHTML = `<div class="as">
    <header class="as-head">
      <div class="as-tit"><strong>🎨 Cuestionario de marca</strong>${clienteNombre ? `<span class="muted">${esc(clienteNombre)}</span>` : ''}</div>
      <div class="as-prog"><div class="as-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span></span></div><span class="as-prog-txt small"></span></div>
      <div class="as-acc"><span class="as-estado small muted" role="status"></span><button type="button" class="btn" data-as="guardar">💾 Guardar</button>${salir ? '<button type="button" class="btn ghost" data-as="salir">Salir</button>' : ''}</div>
    </header>
    <main class="as-main"></main>
    <footer class="as-foot"><button type="button" class="btn ghost" data-as="atras">← Anterior</button><span class="as-aviso small" role="alert"></span><button type="button" class="btn primary" data-as="siguiente">Siguiente →</button></footer>
  </div>`;
  const $ = (s) => raiz.querySelector(s);
  const main = $('.as-main');
  const estado = (txt, error = false) => { const el = $('.as-estado'); el.textContent = txt; el.classList.toggle('error', error); };
  const aviso = (txt = '') => { $('.as-aviso').textContent = txt; };

  const saver = autoguardado(main, async ({ base, campos }) => {
    datos = await llamar({ op: 'campos', ...destinoDeBase(base), campos });
    progreso();
  }, estado);

  function progreso() {
    // Sin productos todavía se cuenta ya el primero, para que el total no salte al añadirlo.
    const total = pasos.length + (datos.productos.length ? 0 : PASOS_POR_PRODUCTO);
    const n = i < 0 ? total : i + 1;
    const pct = i < 0 ? 100 : Math.round((i / Math.max(1, total - 1)) * 100);
    const bar = $('.as-bar');
    bar.querySelector('span').style.width = `${pct}%`;
    bar.setAttribute('aria-valuenow', String(pct));
    $('.as-prog-txt').textContent = i < 0 ? '¡Completado!' : `Paso ${n} de ${total} · ${datos.progreso?.pct ?? 0} % respondido`;
  }

  const paso = () => pasos[i];
  function pintar() {
    aviso('');
    progreso();
    const atras = $('[data-as="atras"]');
    const sig = $('[data-as="siguiente"]');
    $('.as-foot').hidden = false;
    if (i < 0) {
      $('.as-foot').hidden = true;
      main.innerHTML = `<section class="as-paso as-centro"><h2>¡Gracias! 🎉</h2><p>Ya tenemos todo lo que necesitamos para que tus páginas, emails y mensajes suenen a ti y hablen a tu cliente ideal.</p><p class="muted">Si quieres cambiar algo más adelante, díselo a tu equipo.</p>${alTerminar ? '<p><button type="button" class="btn primary" data-as="entrar">Continuar →</button></p>' : '<p class="muted">Ya puedes cerrar esta página.</p>'}</section>`;
      return;
    }
    const p = paso();
    atras.hidden = i === 0;
    sig.textContent = p.tipo === 'bienvenida' ? 'Empezar →' : p.tipo === 'fin' ? '✓ Enviar y terminar' : 'Siguiente →';
    if (p.tipo === 'bienvenida') {
      main.innerHTML = `<section class="as-paso as-centro">
        <h2>¡Hola! 👋</h2>
        <p>Antes de empezar${clienteNombre ? ` con <strong>${esc(clienteNombre)}</strong>` : ''}, necesitamos conocerte bien: tu marca, cómo hablas, qué vendes y a quién.</p>
        <div class="as-nota">⏱️ <strong>Te llevará unos 15-20 minutos.</strong> Hazlo sin prisas: gracias a esto <strong>todo lo demás funcionará correctamente</strong> (tus páginas, emails y mensajes saldrán con tu voz y para tu cliente ideal).</div>
        <p class="muted small">Se guarda solo mientras escribes (y con el botón «Guardar»). Puedes parar cuando quieras: al volver, seguirás justo donde lo dejaste. Escribe como hablarías; no hace falta que quede bonito.</p>
      </section>`;
      return;
    }
    if (p.tipo === 'productos') {
      main.innerHTML = `<section class="as-paso"><h2>${esc(p.titulo)}</h2><p class="muted">${esc(p.intro)}</p>
        <ul class="as-prods">${datos.productos.map((x, n) => `<li>📦 ${esc(nombreDeProducto(x, n))}</li>`).join('') || '<li class="muted">Aún no hay ninguno.</li>'}</ul>
        ${datos.productos.length < MAX_PRODUCTOS ? `<form class="mq-nuevo" data-as-form="producto"><input name="nombre" placeholder="Nombre del producto (p. ej. tu programa principal)" maxlength="120" required><button class="btn">＋ Añadir</button></form>` : ''}
        <p class="muted small">Si solo vendes uno, pon ese. Si vendes varios con un cliente ideal distinto, añade uno por cada uno (te preguntaremos por cada uno).</p></section>`;
      return;
    }
    if (p.tipo === 'docs') {
      main.innerHTML = `<section class="as-paso"><h2>${esc(p.titulo)}</h2><p class="muted">${esc(p.intro)}</p>${docsActivos ? docsHtml() : '<p class="muted">No disponible.</p>'}<p class="muted small">Si no tienes ninguno, pulsa «Siguiente».</p></section>`;
      return;
    }
    const r = (p.ambito === 'producto' ? datos.productos.find((x) => x.id === p.productoId)?.respuestas : datos.respuestas) || {};
    const preguntas = (p.campos || []).map((id) => preguntaDe(p.ambito, id)).filter(Boolean);
    const base = p.ambito === 'producto' ? `producto:${p.productoId}` : 'marca';
    main.innerHTML = `<section class="as-paso"><h2>${esc(p.titulo)}</h2>${p.intro ? `<p class="muted">${esc(p.intro)}</p>` : ''}
      ${p.tipo === 'fin' ? '<p>¡Ya casi está! ¿Algo más que debamos saber?</p>' : ''}
      ${pintarCampos(preguntas, r, base, { filas: preguntas.length > 2 ? 2 : 3 })}
      ${p.tipo === 'fin' ? finHtml() : ''}</section>`;
    // Que el texto se vea entero al escribir (sin pasar del espacio que hay).
    main.querySelector('input:not([type=color]):not([type=radio]):not([type=checkbox]), textarea')?.focus({ preventScroll: true });
  }

  function finHtml() {
    const faltan = faltanObligatorias(datos);
    if (!faltan.length) return '<p class="as-ok">✓ Está todo. Pulsa «Enviar y terminar».</p>';
    return `<div class="as-faltan"><strong>Aún falta${faltan.length === 1 ? '' : 'n'} ${faltan.length} respuesta${faltan.length === 1 ? '' : 's'}:</strong><ul>${faltan.slice(0, 6).map((f) => `<li><button type="button" class="link" data-as-ir="${esc(f.paso)}">${esc(f.titulo)}: ${esc(f.label)}</button></li>`).join('')}</ul>${faltan.length > 6 ? `<p class="muted small">y ${faltan.length - 6} más.</p>` : ''}</div>`;
  }

  function docsHtml() {
    const nombreProd = (id) => (id ? nombreDeProducto(datos.productos.find((x) => x.id === id)) : 'General');
    return `<ul class="mq-docs">${datos.docs.map((d) => `<li><span>📄 ${esc(d.nombre)}</span><small class="muted">${esc(nombreProd(d.productoId))}</small><button type="button" class="btn ghost" data-as-borrar-doc="${esc(d.id)}">Quitar</button></li>`).join('') || '<li class="muted">Aún no hay documentos.</li>'}</ul>
      ${datos.docs.length < MAX_DOCS ? `<div class="mq-subir"><label class="field inline"><span>Es sobre</span><select data-as-doc-prod><option value="">General (la marca)</option>${datos.productos.map((x, n) => `<option value="${esc(x.id)}">${esc(nombreDeProducto(x, n))}</option>`).join('')}</select></label>
        <label class="btn primary">Subir documentos<input type="file" data-as-doc-file accept="${ACCEPT_DOCS}" multiple hidden></label><span class="small" data-as-doc-st role="status"></span></div>
        <p class="muted small">PDF, Word, TXT, MD o CSV. Guardamos solo el texto; los PDF escaneados (fotos) no se pueden leer.</p>` : ''}`;
  }

  async function ir(n) {
    await saver.vaciar();
    pasos = pasosAsistente(datos);
    i = Math.max(0, Math.min(pasos.length - 1, n));
    pintar();
    main.scrollTop = 0;
    llamar({ op: 'paso', paso: pasos[i].id }).then((d) => { datos = d; }).catch(() => {});
  }

  async function siguiente() {
    await saver.vaciar();
    if (saver.pendientes()) { aviso('No se ha podido guardar: revisa la conexión y vuelve a intentarlo.'); return; }
    const p = paso();
    const faltan = faltanEnPaso(datos, p);
    main.querySelectorAll('.as-falta').forEach((el) => el.classList.remove('as-falta'));
    if (faltan.length) {
      for (const q of faltan) main.querySelector(`[data-as-q="${q.id}"]`)?.classList.add('as-falta');
      aviso(p.tipo === 'productos' ? 'Añade al menos un producto para seguir.' : 'Completa lo marcado para seguir (si no lo sabes, escribe lo que se te ocurra).');
      return;
    }
    if (p.tipo === 'fin') {
      try {
        datos = await llamar({ op: 'terminar' });
        i = -1;
        pintar();
      } catch (e) {
        aviso(e.message);
        pintar();
      }
      return;
    }
    ir(i + 1);
  }

  raiz.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-as], [data-as-ir], [data-as-borrar-doc]');
    if (!b) return;
    if (b.dataset.asIr) { ir(pasos.findIndex((p) => p.id === b.dataset.asIr)); return; }
    if (b.dataset.asBorrarDoc) {
      if (!window.confirm('¿Quitar este documento?')) return;
      try { datos = await llamar({ op: 'doc-borrar', id: b.dataset.asBorrarDoc }); pintar(); } catch (err) { aviso(err.message); }
      return;
    }
    const a = b.dataset.as;
    if (a === 'siguiente') siguiente();
    else if (a === 'atras') ir(i - 1);
    else if (a === 'guardar') {
      await saver.vaciar();
      if (i >= 0) { try { datos = await llamar({ op: 'paso', paso: paso().id }); } catch { /* el estado ya lo dice */ } }
      if (!saver.pendientes()) estado('✓ Guardado');
    } else if (a === 'salir') { await saver.vaciar(); salir(); } else if (a === 'entrar') alTerminar();
  });
  raiz.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-as-form="producto"]');
    if (!f) return;
    e.preventDefault();
    const nombre = f.nombre.value.trim();
    if (!nombre) return;
    try { datos = await llamar({ op: 'producto-nuevo', nombre }); pasos = pasosAsistente(datos); pintar(); } catch (err) { aviso(err.message); }
  });
  raiz.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-as-doc-file]')) return;
    const st = main.querySelector('[data-as-doc-st]');
    const productoId = main.querySelector('[data-as-doc-prod]').value;
    for (const f of [...e.target.files]) {
      st.textContent = `Leyendo «${f.name}»…`;
      try {
        const texto = await extraerTexto(f);
        st.textContent = `Subiendo «${f.name}»…`;
        datos = await llamar({ op: 'doc-subir', nombre: f.name, tipo: extDe(f.name), productoId, texto });
      } catch (err) { window.alert(`«${f.name}»: ${err.message}`); }
    }
    pintar();
  });
  // Intro en un párrafo: Enter no envía nada (solo en los campos de una línea pasa al siguiente paso).
  raiz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.as-main input[type=text], .as-main input[type=url]') && !e.target.closest('form')) { e.preventDefault(); siguiente(); }
  });

  pintar();
  return { guardar: () => saver.vaciar() };
}
