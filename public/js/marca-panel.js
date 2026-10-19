// Panel «🎨 Marca y avatar» del dashboard (Cuenta → Marca y avatar), como un proceso por etapas (igual que la
// configuración de los embudos): 1 la marca, 2 cada producto con su avatar, 3 documentos, 4 la ficha de cada
// producto con Claude y 5 qué vende cada embudo; al terminar, confeti. Además, la caché que usan los prompts
// (WhatsApp, páginas) para leer la marca.
import { paraChatGPT } from './chatgpt.js';
import { SECCIONES_MARCA, SECCIONES_PRODUCTO, MAX_PRODUCTOS, MAX_DOCS, nombreDeProducto, progreso, promptFicha, productoDeEmbudo, pasosAsistente, pasosEquipo, estadoProceso, ETAPAS_MARCA } from './marca.js';
import { pintarCampos, autoguardado, destinoDeBase, extraerTexto, extDe, ACCEPT_DOCS } from './marca-form.js';
import { lanzarConfeti } from './confeti.js';

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
let ctx = null; // { api, cliente, clienteNombre, clientes (superadmin: todos), embudos, puedeEditar, dialog }
// Todas las llamadas, al cliente elegido en el panel (el superadmin puede cambiarlo sin salir).
const llamarApi = (path, opts = {}) => ctx.api(path, { ...opts, cliente: ctx.cliente });
let m = null;
let prog = null;
let docsActivos = true;
let paso = ''; // id del paso abierto ('fin' = el final)
let dir = 1; // hacia dónde se mueve (para la animación)
let saver = null;
let listaAntes = false;

const raiz = () => ctx.dialog.querySelector('#mk-body');
const estado = (txt, error = false) => { const el = ctx.dialog.querySelector('#mk-estado'); el.textContent = txt; el.classList.toggle('error', error); };

async function post(body) {
  const d = await llamarApi('/api/marca', { method: 'POST', body });
  m = d.marca;
  prog = d.progreso;
  cache.set(ctx.cliente, { m, en: Date.now() });
  return d;
}

export async function abrirPanelMarca(opts) {
  ctx = opts;
  const dlg = ctx.dialog;
  // Superadmin: selector con todos los clientes; el resto, el nombre del suyo.
  const sel = dlg.querySelector('#mk-cliente-sel');
  const varios = (ctx.clientes || []).length > 1;
  sel.hidden = !varios;
  dlg.querySelector('#mk-cliente').hidden = varios;
  if (varios) sel.innerHTML = ctx.clientes.map((c) => `<option value="${esc(c.id)}"${c.id === ctx.cliente ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('');
  if (varios && !sel.dataset.listo) {
    sel.dataset.listo = '1';
    sel.addEventListener('change', async () => {
      await saver?.vaciar();
      const c = ctx.clientes.find((x) => x.id === sel.value);
      paso = '';
      abrirPanelMarca({ ...ctx, cliente: c.id, clienteNombre: c.nombre, embudos: c.id === ctx.clienteInicial ? ctx.embudosInicial : [] });
    });
  }
  ctx.clienteInicial ??= ctx.cliente;
  ctx.embudosInicial ??= ctx.embudos;
  dlg.querySelector('#mk-cliente').textContent = ctx.clienteNombre ? `· ${ctx.clienteNombre}` : '';
  raiz().innerHTML = '<p class="muted">Cargando…</p>';
  dlg.querySelector('#mk-enlace').innerHTML = '';
  if (!dlg.open) dlg.showModal();
  try {
    const d = await llamarApi('/api/marca');
    m = d.marca; prog = d.progreso; docsActivos = d.docsActivos;
    cache.set(ctx.cliente, { m, en: Date.now() });
  } catch (e) { raiz().innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  if (!saver) {
    saver = autoguardado(raiz(), async ({ base, campos }) => {
      await post({ op: 'campos', ...destinoDeBase(base), campos });
      refrescar();
    }, estado);
    dlg.addEventListener('close', () => saver.vaciar());
    dlg.addEventListener('click', onClick);
    dlg.addEventListener('change', onChange);
    dlg.addEventListener('submit', onSubmit);
  }
  // Se abre por el primer paso sin terminar (o en el final si ya está todo).
  const ps = pasos();
  const est = estadoProceso(ps);
  listaAntes = est.lista;
  if (!paso || (paso !== 'fin' && !ps.some((p) => p.id === paso))) paso = est.lista ? 'fin' : (est.faltan[0] || ps[0]).id;
  pintar();
}

const pasos = () => pasosEquipo(m, ctx.embudos || []);
const orden = () => [...pasos().map((p) => p.id), 'fin'];

function pintarCabecera() {
  const est = estadoProceso(pasos());
  ctx.dialog.querySelector('#mk-prog-bar').style.width = `${est.pct}%`;
  ctx.dialog.querySelector('#mk-prog-txt').textContent = est.lista ? '🎉 ¡Todo listo!' : `${est.hechos} de ${est.total} pasos · ${prog.pct} % de las preguntas respondidas`;
}

function asistenteHtml() {
  const a = m.asistente || {};
  if (a.completado) return `<p class="mk-as ok">✅ <strong>Cuestionario terminado</strong> el ${esc(fecha(a.completado))}${a.completadoPor ? ` · ${esc(a.completadoPor)}` : ''}.${ctx.puedeEditar ? ' <button type="button" class="btn small ghost" data-mk="reabrir">Reabrir para el cliente</button>' : ''}</p>`;
  const pasos = pasosAsistente(m);
  const n = pasos.findIndex((p) => p.id === a.paso);
  return `<p class="mk-as">⏳ <strong>El cliente aún no lo ha terminado</strong>: ${n > 0 ? `va por «${esc(pasos[n].titulo)}» (paso ${n + 1} de ${pasos.length})` : 'sin empezar'} · ${prog.pct} % respondido. Hasta terminarlo, al entrar a AlquimIA con su acceso de cliente solo verá el cuestionario.</p>`;
}

function enlaceHtml() {
  const url = m.token ? `${location.origin}/marca.html?c=${encodeURIComponent(ctx.cliente)}&t=${m.token}` : '';
  if (!ctx.puedeEditar) return asistenteHtml();
  const a = m.asistente || {};
  return `<details class="mp-cliente"><summary><span>🔗 Que lo rellene el cliente</span><small class="muted">${a.completado ? '✅ Lo terminó' : url ? '⏳ Enlace activo' : 'Sin enlace'}</small></summary>${asistenteHtml()}<section class="mk-enlace"><div><strong>🔗 Enlace para el cliente</strong><span class="muted small">Lo rellena sin cuenta y se guarda solo. Lo que escribáis vosotros aquí también lo verá.</span></div>
    ${url ? `<div class="copy-row"><code>${esc(url)}</code><button type="button" class="btn primary" data-copy-text="${esc(url)}">Copiar</button></div>
      <div class="mk-enlace-acc"><button type="button" class="btn ghost" data-mk="enlace-nuevo">Crear otro (el actual deja de valer)</button><button type="button" class="btn ghost" data-mk="enlace-off">Desactivar</button></div>`
    : '<button type="button" class="btn primary" data-mk="enlace-nuevo">Crear enlace para el cliente</button>'}
  </section></details>`;
}

// ---- El proceso ----
const anillo = (pct, txt = '') => `<span class="mp-anillo" style="--p:${Math.max(0, Math.min(100, pct))}"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5" class="f"/><circle cx="18" cy="18" r="15.5" class="v" pathLength="100" style="stroke-dashoffset:${100 - Math.max(0, Math.min(100, pct))}"/></svg><b>${txt}</b></span>`;
const marcaNombre = () => m.respuestas?.nombre || ctx.clienteNombre || 'tu marca';

function railHtml() {
  const ps = pasos();
  const est = estadoProceso(ps);
  const grupos = ETAPAS_MARCA.map((e) => {
    const de = ps.filter((p) => p.etapa === e.id);
    const ok = de.every((p) => p.estado === 'hecho' || p.opcional);
    return `<li class="mp-etapa${ok ? ' ok' : ''}">
      <p class="mp-etapa-t"><span class="mp-etapa-n">${ok ? '✓' : e.n}</span>${esc(e.titulo)}${e.id === 'docs' ? ' <small>opcional</small>' : ''}</p>
      <ol>${de.map((p) => `<li><button type="button" class="mp-paso-btn est-${p.estado}${p.id === paso ? ' on' : ''}" data-mp-ir="${esc(p.id)}">
        <span class="mp-dot">${p.estado === 'hecho' ? '✓' : p.icono}</span><span class="mp-paso-t">${esc(p.titulo)}<small>${p.estado === 'hecho' ? 'Hecho' : p.estado === 'opcional' ? 'Opcional' : p.tipo === 'seccion' ? `${p.hechas} de ${p.total} respondidas` : 'Pendiente'}</small></span></button></li>`).join('')}
        ${e.id === 'productos' && ctx.puedeEditar && m.productos.length && m.productos.length < MAX_PRODUCTOS ? `<li><button type="button" class="mp-paso-btn mp-add" data-mp-ir="p:nuevo"><span class="mp-dot">＋</span><span class="mp-paso-t">Añadir otro producto<small>Con su propia oferta y avatar</small></span></button></li>` : ''}
      </ol></li>`;
  }).join('');
  return `<div class="mp-rail-top">${anillo(est.pct, `${est.pct}%`)}<div><strong>${est.lista ? '¡Marca lista!' : 'Tu progreso'}</strong><span>${est.hechos} de ${est.total} pasos</span></div></div>
    <ol class="mp-etapas">${grupos}
      <li class="mp-etapa mp-etapa-fin${est.lista ? ' ok' : ''}"><button type="button" class="mp-paso-btn mp-fin-btn${paso === 'fin' ? ' on' : ''}${est.lista ? ' listo' : ''}" data-mp-ir="fin"><span class="mp-dot">🎉</span><span class="mp-paso-t">${est.lista ? '¡Todo listo!' : 'El final'}<small>${est.lista ? 'Ver el resumen' : `Faltan ${est.total - est.hechos}`}</small></span></button></li>
    </ol>`;
}

function heroHtml(p, i, n) {
  const pct = p.tipo === 'seccion' ? Math.round((p.hechas / Math.max(1, p.total)) * 100) : p.estado === 'hecho' ? 100 : 0;
  const intro = p.tipo === 'seccion' ? (p.ambito === 'marca' ? SECCIONES_MARCA : SECCIONES_PRODUCTO).find((s) => s.id === p.seccion)?.intro : '';
  return `<header class="mp-hero">
    <span class="mp-hero-ico" aria-hidden="true">${p.icono}</span>
    <div class="mp-hero-t"><span class="mp-kicker">Etapa ${p.etapaN} · ${esc(p.etapaTitulo)} — paso ${i + 1} de ${n}</span><h3>${esc(p.titulo)}</h3><p>${esc(intro || p.sub)}</p></div>
    ${p.tipo === 'seccion' ? anillo(pct, `${p.hechas}/${p.total}`) : `<span class="mp-estado est-${p.estado}">${p.estado === 'hecho' ? '✓ Hecho' : p.estado === 'opcional' ? 'Opcional' : 'Pendiente'}</span>`}
  </header>`;
}

function cuerpoPaso(p) {
  if (p.tipo === 'seccion') {
    const prod = p.ambito === 'producto' ? m.productos.find((x) => x.id === p.productoId) : null;
    const sec = (p.ambito === 'marca' ? SECCIONES_MARCA : SECCIONES_PRODUCTO).find((s) => s.id === p.seccion);
    const base = prod ? `producto:${prod.id}` : 'marca';
    return `${pintarCampos(sec.preguntas, prod ? prod.respuestas : m.respuestas, base, { filas: 3 })}
      ${prod && p.seccion === 'oferta' && ctx.puedeEditar ? `<p class="mk-borrar"><button type="button" class="btn ghost danger" data-mk="producto-borrar" data-id="${esc(prod.id)}">Borrar este producto</button></p>` : ''}`;
  }
  if (p.tipo === 'producto-nuevo') {
    return `<form class="mk-nuevo mp-nuevo" data-mk-form="producto"><label class="field"><span>Nombre del producto</span><input name="nombre" required maxlength="120" placeholder="Raíces"></label><button class="btn primary">＋ Añadir producto</button></form>
      <p class="muted small">Uno por cada producto con su propia oferta o su propio cliente ideal. Después rellenarás su oferta y su avatar.</p>`;
  }
  if (p.tipo === 'docs') return docsHtml();
  if (p.tipo === 'ficha') {
    const i = m.productos.findIndex((x) => x.id === p.productoId);
    return i < 0 ? '<p class="muted">Añade primero un producto en la etapa 2.</p>' : fichaHtml(m.productos[i], i);
  }
  if (p.tipo === 'embudos') return embudosHtml();
  return '';
}

function finHtml() {
  const ps = pasos();
  const est = estadoProceso(ps);
  if (!est.lista) {
    return `<section class="mp-fin pendiente">
      <div class="mp-fin-emoji" aria-hidden="true">🧩</div>
      <h3>Ya casi está: ${est.hechos} de ${est.total} pasos</h3>
      <p>Te ${est.faltan.length === 1 ? 'queda' : 'quedan'} ${est.faltan.length} para que «${esc(marcaNombre())}» esté lista. Pulsa cada uno para ir directo:</p>
      <ul class="mp-faltan">${est.faltan.map((p) => `<li><button type="button" data-mp-ir="${esc(p.id)}"><span>${p.icono}</span><span><strong>${esc(p.titulo)}</strong><small>Etapa ${p.etapaN} · ${esc(p.etapaTitulo)}${p.tipo === 'seccion' ? ` · ${p.hechas} de ${p.total} respondidas` : ''}</small></span><span aria-hidden="true">→</span></button></li>`).join('')}</ul>
    </section>`;
  }
  const nP = m.productos.length;
  return `<section class="mp-fin">
    <div class="mp-fin-emoji" aria-hidden="true">🎉</div>
    <p class="mp-kicker">Marca, producto y avatar completos</p>
    <h3>¡«${esc(marcaNombre())}» ya tiene voz, oferta y cliente ideal!</h3>
    <p class="mp-fin-sub">Has hecho la parte que más se nota. Desde ahora, <strong>cada página, email, WhatsApp y anuncio</strong> que prepares en AlquimIA sonará a ${esc(marcaNombre())} y le hablará directamente a quien de verdad compra. Menos reescribir, más vender.</p>
    <ul class="mp-fin-chips"><li>🏷️ Marca y tono</li><li>📦 ${nP} producto${nP === 1 ? '' : 's'} con su avatar</li><li>✨ ${nP} ficha${nP === 1 ? '' : 's'} para los prompts</li>${m.docs.length ? `<li>📄 ${m.docs.length} documento${m.docs.length === 1 ? '' : 's'}</li>` : ''}</ul>
    <h4>Lo que ya sale con tu voz</h4>
    <div class="mp-fin-usos">
      <div><span>🧱</span><strong>Páginas del embudo</strong><small>Crear → Páginas</small></div>
      <div><span>✉️</span><strong>Emails</strong><small>Crear → Emails</small></div>
      <div><span>💬</span><strong>WhatsApp</strong><small>Crear → Grupo de WhatsApp</small></div>
      <div><span>🎯</span><strong>Anuncios</strong><small>Anuncios → Crear con IA</small></div>
    </div>
    <p class="muted small">¿Cambia algo (un precio, un bonus, frases nuevas de tus clientas)? Vuelve a su paso: se guarda solo. Si cambia algo importante, rehaz la ficha en la etapa 4.</p>
    <p><button type="button" class="btn primary" data-mp-fiesta>🎊 Celebrarlo otra vez</button></p>
  </section>`;
}

function navHtml(i, ids) {
  const ps = pasos();
  const ant = ids[i - 1];
  const sig = ids[i + 1];
  const titulo = (id) => (id === 'fin' ? (estadoProceso(ps).lista ? '🎉 ¡Terminar!' : 'Ver lo que falta') : ps.find((p) => p.id === id)?.titulo || '');
  return `<footer class="mp-nav">
    ${ant ? `<button type="button" class="btn ghost" data-mp-ir="${esc(ant)}">← ${esc(titulo(ant))}</button>` : '<span></span>'}
    ${sig ? `<button type="button" class="btn primary${sig === 'fin' && estadoProceso(ps).lista ? ' mp-brilla' : ''}" data-mp-ir="${esc(sig)}">${sig === 'fin' ? esc(titulo(sig)) : `Siguiente: ${esc(titulo(sig))} →`}</button>` : ''}
  </footer>`;
}

function pintar() {
  pintarCabecera();
  ctx.dialog.querySelector('#mk-enlace').innerHTML = enlaceHtml();
  const ps = pasos();
  const ids = orden();
  if (!ids.includes(paso)) paso = ids[0];
  const i = ids.indexOf(paso);
  const p = ps.find((x) => x.id === paso);
  const contenido = paso === 'fin' ? finHtml() : `${heroHtml(p, i, ps.length)}<div class="mp-cuerpo${ctx.puedeEditar ? '' : ' mk-solo-leer'}">${cuerpoPaso(p)}</div>`;
  raiz().innerHTML = `<div class="mp">
    <aside class="mp-rail" aria-label="Pasos">${railHtml()}</aside>
    <section class="mp-main"><div class="mp-paso ${dir < 0 ? 'mp-entra-izq' : 'mp-entra-der'}" data-mp-paso="${esc(paso)}">${contenido}</div>${navHtml(i, ids)}</section>
  </div>`;
  if (!ctx.puedeEditar) raiz().querySelectorAll('.mp-cuerpo input, .mp-cuerpo textarea, .mp-cuerpo select').forEach((el) => { el.disabled = true; });
  centrarPasoActivo();
  if (paso === 'fin' && estadoProceso(ps).lista) fiesta();
}

// Tras guardar: el carril, la barra y el anillo del paso (sin repintar lo que se está escribiendo).
function refrescar() {
  pintarCabecera();
  const ps = pasos();
  const est = estadoProceso(ps);
  const rail = raiz().querySelector('.mp-rail');
  if (rail) {
    const antes = new Map([...rail.querySelectorAll('[data-mp-ir]')].map((b) => [b.dataset.mpIr, b.className]));
    rail.innerHTML = railHtml();
    // El paso que se acaba de completar hace «pop».
    for (const b of rail.querySelectorAll('.est-hecho')) if (antes.has(b.dataset.mpIr) && !antes.get(b.dataset.mpIr).includes('est-hecho')) b.classList.add('mp-pop');
  }
  const p = ps.find((x) => x.id === paso);
  const hero = raiz().querySelector('.mp-hero');
  if (p && hero) hero.outerHTML = heroHtml(p, orden().indexOf(paso), ps.length);
  const nav = raiz().querySelector('.mp-nav');
  if (nav) nav.outerHTML = navHtml(orden().indexOf(paso), orden());
  // Justo se ha completado lo último: aviso con brillo en «Terminar».
  if (est.lista && !listaAntes) estado('🎉 ¡Todo completo! Pulsa «Terminar»');
  listaAntes = est.lista;
}

// El paso abierto, a la vista en el carril (sin mover el resto de la pantalla).
function centrarPasoActivo() {
  const rail = raiz().querySelector('.mp-rail');
  const on = rail?.querySelector('.on');
  if (!on) return;
  const tira = rail.querySelector('.mp-etapas');
  if (tira.scrollWidth > tira.clientWidth + 2) tira.scrollLeft = on.getBoundingClientRect().left - tira.getBoundingClientRect().left + tira.scrollLeft - (tira.clientWidth - on.offsetWidth) / 2;
  else if (rail.scrollHeight > rail.clientHeight + 2) rail.scrollTop = on.getBoundingClientRect().top - rail.getBoundingClientRect().top + rail.scrollTop - rail.clientHeight / 2;
}

async function ir(id) {
  await saver?.vaciar();
  const ids = orden();
  dir = ids.indexOf(id) >= ids.indexOf(paso) ? 1 : -1;
  paso = id;
  pintar();
  ctx.dialog.querySelector('.dialog-body')?.scrollTo?.({ top: 0, behavior: 'smooth' });
}

function fiesta() {
  const c = ctx.dialog.querySelector('#mk-confeti');
  if (c) lanzarConfeti(c, { sigue: () => ctx.dialog.open });
}

function fichaHtml(p, i) {
  const pr = progreso(SECCIONES_PRODUCTO, p.respuestas);
  return `<section class="mk-ficha">
    <h3>✨ Ficha de marca y avatar de «${esc(nombreDeProducto(p, i))}»</h3>
    <p class="muted small">Es el resumen que usan <strong>todos los prompts</strong> (páginas, WhatsApp…). Mientras no exista, los prompts llevan las respuestas tal cual. Hazla cuando el cuestionario esté bastante completo (este producto: ${pr.pct} %) y rehazla si cambia algo importante.</p>
    <ol class="small">
      <li><button type="button" class="btn primary" data-mk="ficha-prompt" data-id="${esc(p.id)}">📋 Copiar el prompt de la ficha</button> y pégalo en Claude (lleva las respuestas de la marca, de este producto y el texto de sus documentos).
        <div class="ia-gpt"><span class="ia-gpt-q">💬 ¿Usas ChatGPT?</span><button type="button" class="btn small btn-gpt" data-mk="ficha-prompt" data-ia="chatgpt" data-id="${esc(p.id)}">📋 Copiar el prompt para ChatGPT</button><a class="btn small ghost" href="https://chatgpt.com/" target="_blank" rel="noopener">Abrir ChatGPT ↗</a></div></li>
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
  if (!ctx.embudos.length) return '<p class="muted">Para elegir el producto de cada embudo, entra en este cliente desde el selector de arriba de AlquimIA.</p>';
  return `<p class="muted small">Qué producto vende cada embudo: sus prompts usarán la ficha de ese producto. Sin elegir, el primero.</p>
    <div class="mk-embudos">${ctx.embudos.map((e) => `<label class="field inline"><span>${esc(e.nombre)}</span><select data-mk-embudo="${esc(e.id)}">${m.productos.map((p, i) => `<option value="${esc(p.id)}"${productoDeEmbudo(m, e.id)?.id === p.id ? ' selected' : ''}>${esc(nombreDeProducto(p, i))}</option>`).join('')}</select></label>`).join('') || '<p class="muted">Este cliente aún no tiene embudos.</p>'}</div>`;
}

async function onClick(e) {
  const irA = e.target.closest('[data-mp-ir]');
  if (irA) { ir(irA.dataset.mpIr); return; }
  if (e.target.closest('[data-mp-fiesta]')) { fiesta(); return; }
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
    } else if (acc === 'reabrir') {
      if (!window.confirm('El cliente volverá a ver el cuestionario al entrar (con sus respuestas) hasta que lo termine otra vez. ¿Reabrir?')) return;
      await post({ op: 'reabrir' }); pintar();
    } else if (acc === 'producto-borrar') {
      if (!window.confirm('Se borran sus respuestas y su ficha (los documentos pasan a «General»). ¿Seguro?')) return;
      await saver.vaciar();
      await post({ op: 'producto-borrar', id: b.dataset.id }); paso = ''; paso = estadoProceso(pasos()).faltan[0]?.id || 'fin'; pintar();
    } else if (acc === 'doc-borrar') {
      if (!window.confirm('¿Quitar este documento?')) return;
      await post({ op: 'doc-borrar', id: b.dataset.id }); pintar();
    } else if (acc === 'ficha-guardar') {
      await post({ op: 'ficha', productoId: b.dataset.id, ficha: raiz().querySelector('#mk-ficha-txt').value });
      raiz().querySelector('#mk-ficha-st').textContent = '✓ Guardada';
      refrescar();
    } else if (acc === 'ficha-prompt') {
      await saver.vaciar();
      b.textContent = 'Preparando…';
      const { textos } = m.docs.length ? await llamarApi('/api/marca?textos=1') : { textos: {} };
      const p = m.productos.find((x) => x.id === b.dataset.id);
      const gpt = b.dataset.ia === 'chatgpt';
      const antes = gpt ? '📋 Copiar el prompt para ChatGPT' : '📋 Copiar el prompt de la ficha';
      const txt = gpt ? paraChatGPT(promptFicha(m, p, textos)) : promptFicha(m, p, textos);
      try {
        await navigator.clipboard.writeText(txt);
      } catch {
        // Sin permiso para copiar (p. ej. el navegador lo bloquea tras esperar a los documentos): a la vista.
        b.insertAdjacentHTML('afterend', `<textarea class="mk-prompt-a-mano" rows="6" readonly>${esc(txt)}</textarea><span class="small muted">Selecciónalo todo y cópialo.</span>`);
        b.textContent = antes;
        return;
      }
      b.textContent = `Copiado ✓ · pégalo en ${gpt ? 'ChatGPT' : 'Claude'}`;
      setTimeout(() => { b.textContent = antes; }, 3000);
    }
  } catch (err) { window.alert(err.message); }
}

async function onChange(e) {
  const sel = e.target.closest('[data-mk-embudo]');
  if (sel) {
    try { await post({ op: 'embudo', embudo: sel.dataset.mkEmbudo, productoId: sel.value }); estado('✓ Guardado'); refrescar(); } catch (err) { window.alert(err.message); }
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
    dir = 1;
    paso = `p:${d.producto.id}:oferta`;
    pintar();
  } catch (err) { window.alert(err.message); }
}
