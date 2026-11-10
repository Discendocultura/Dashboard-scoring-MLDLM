// Panel de la membresía de Skool (Configuración → 🎓 Membresía), en el navegador:
//  · «Actualizar alumnos»: abre la página de Miembros de Skool y, con el marcador «AlquimIA · Skool» (skool-lector.js),
//    los miembros vuelven aquí. Antes de guardar se ve qué es cada dato y qué cambia (altas, bajas, cambios de plan).
//  · Cifras de negocio: MRR, ARR, ARPU, churn de 30 días (total y por plan), MRR perdido, LTV medio y esperado, vida
//    media, antigüedad, más activos, en riesgo y bajas recientes.
//  · Etiquetas de GHL por plan (y de baja): se sincronizan desde aquí y disparan los flujos de GHL (venta cruzada…).
//  · Alumnos, como una pestaña de setter: segmentos, búsqueda, y a cada uno WhatsApp o email (desde GHL).
import { CAMPOS, clavesDe, adivinarMapa, normalizar, metricasMembresia, tagDePlan, etiquetasPendientes, SEGMENTOS, rellenar, waDe, precioMes, EMAIL_RE, resumenGhl, conMembresia, candidatosPlan, repartoPlan, diagnosticoSkool, esCodigo, codigosSinNombre } from './membresia.js';
import { enlaceLector, esDatosSkool, ORIGEN_SKOOL, VERSION_LECTOR } from './skool-lector.js';
import { limpiarNombre, pareceSlug } from './membresia.js';

const DIA = 86_400_000;
// Moneda del panel: la que cobra Skool (si casi todos pagan en dólares, en dólares).
let MONEDA = 'EUR';
const eur = (n) => (n == null || !Number.isFinite(n) ? '–' : n.toLocaleString('es-ES', { style: 'currency', currency: MONEDA, maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2 }));
const pct = (x) => (x == null || !Number.isFinite(x) ? '–' : `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`);
const num = (n) => (n == null || !Number.isFinite(n) ? '–' : n.toLocaleString('es-ES'));
const fecha = (t) => (t ? new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' }) : '–');
function hace(t, ahora = Date.now()) {
  if (!t) return '–';
  const d = Math.floor((ahora - t) / DIA);
  if (d <= 0) return 'hoy';
  if (d === 1) return 'ayer';
  if (d < 31) return `hace ${d} días`;
  const m = Math.round(d / 30.44);
  return m < 12 ? `hace ${m} ${m === 1 ? 'mes' : 'meses'}` : `hace ${Math.round(m / 12)} ${Math.round(m / 12) === 1 ? 'año' : 'años'}`;
}
// Nombre para mostrar (sin el usuario de Skool «nombre-apellido-1234»).
const nom = (a) => limpiarNombre(a.nombre || '') || a.email;
// «en 12 días», «en 3 meses», «hoy».
function dentroDe(t, ahora = Date.now()) {
  const d = Math.round((t - ahora) / DIA);
  if (d <= 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d < 45) return `en ${d} días`;
  const m = Math.round(d / 30.44);
  return m < 12 ? `en ${m} meses` : `en ${Math.round(m / 12)} ${Math.round(m / 12) === 1 ? 'año' : 'años'}`;
}
const antig = (t, ahora = Date.now()) => { if (!t) return '–'; const m = (ahora - t) / (30.44 * DIA); return m < 1 ? `${Math.max(1, Math.round((ahora - t) / DIA))} d` : m < 12 ? `${Math.round(m)} m` : `${(m / 12).toLocaleString('es-ES', { maximumFractionDigits: 1 })} a`; };

export function montarMembresia({ api, esc, notice, progress, ls, puedeConfig, cliente, abrir }) {
  const body = document.getElementById('ms-body');
  const st = { datos: null, cargando: false, vista: ls.get('lsd_ms_vista') || 'resumen', seg: 'todos', plan: '', q: '', importacion: null, skoolTab: null };

  async function cargar() {
    if (!conMembresia(cliente())) { pintar(); return; }
    st.cargando = true;
    try { st.datos = await api('/api/membresia'); } catch (e) { notice(e.message, true); st.datos = st.datos || { alumnos: [], eventos: [], cfg: {}, ltvExtra: {} }; }
    st.cargando = false;
    pintar();
  }
  const cfg = () => st.datos?.cfg || {};
  const estado = () => ({ alumnos: Object.fromEntries((st.datos?.alumnos || []).map((a) => [a.email, a])), eventos: st.datos?.eventos || [] });
  const metricas = () => metricasMembresia(estado(), { precios: cfg().precios || {}, ltvExtra: st.datos?.ltvExtra || {} });
  const ltvDe = (a) => Math.round(((a.ltv ?? 0) + (st.datos?.ltvExtra?.[a.email] || 0)) * 100) / 100;

  // ---------- Recibir los datos del lector de Skool ----------
  function recibir(d) {
    if (!esDatosSkool(d)) return notice('Eso no son datos del lector de Skool.', true);
    const mapa = { ...adivinarMapa(d.filas), ...(cfg().mapa || {}) };
    // Un mapa guardado de otra lectura con claves que ya no vienen: se vuelve a adivinar ese dato.
    const claves = new Set(clavesDe(d.filas).map((c) => c.clave));
    const adiv = adivinarMapa(d.filas);
    for (const k of Object.keys(mapa)) if (typeof mapa[k] === 'string' && !claves.has(mapa[k])) { if (adiv[k]) mapa[k] = adiv[k]; else delete mapa[k]; }
    // Nombre: si el dato guardado es el usuario de Skool (slug) y hay nombre de pila, se usa el nombre de pila.
    if (mapa.nombre && adiv.nombre && mapa.nombre !== adiv.nombre && pareceSlug(d.filas, mapa.nombre) && !pareceSlug(d.filas, adiv.nombre)) { mapa.nombre = adiv.nombre; if (adiv.apellido) mapa.apellido = adiv.apellido; }
    // Plan: si el guardado deja a muchos «Sin plan» y hay una clave que cubre más, se usa esa.
    let planCambiado = '';
    const cands = candidatosPlan(d.filas);
    const cob = (k) => cands.find((c) => c.clave === k)?.cobertura ?? 0;
    const mejor = cands.find((c) => c.pista) || null;
    if (mejor && mapa.plan !== mejor.clave && cob(mapa.plan) < mejor.cobertura - 0.05) { planCambiado = mapa.plan || ''; mapa.plan = mejor.clave; }
    st.importacion = { datos: d, mapa, preview: null, completa: true, planCambiado, opts: { nombres: { ...(cfg().nombres || {}) }, catalogo: d.catalogo && typeof d.catalogo === 'object' ? d.catalogo : {} } };
    st.vista = 'importar';
    abrir();
    pintar();
    previsualizar();
  }
  async function previsualizar() {
    const imp = st.importacion;
    if (!imp || !puedeConfig()) return;
    const alumnos = imp.datos.filas.map((f) => normalizar(f, imp.mapa, imp.opts)).filter(Boolean);
    imp.alumnos = alumnos;
    if (!alumnos.length) { imp.preview = null; pintar(); return; }
    try { imp.preview = await api('/api/membresia', { method: 'POST', body: { op: 'foto', alumnos, completa: imp.completa } }); } catch (e) { imp.preview = { error: e.message }; }
    // Por defecto, «trae a todos» solo si no faltan muchos de los activos (una lectura a medias daría de baja a media comunidad).
    if (imp.preview && imp.completa && !imp.tocadoCompleta && imp.preview.activosAntes && imp.preview.bajas > Math.max(5, imp.preview.activosAntes * 0.2)) {
      imp.completa = false;
      imp.aviso = true;
      return previsualizar();
    }
    pintar();
  }
  window.addEventListener('message', (e) => {
    if (!ORIGEN_SKOOL.test(e.origin) || !esDatosSkool(e.data) || !conMembresia(cliente())) return;
    try { e.source?.postMessage({ tipo: 'alquimia-skool-ok' }, e.origin); } catch { /* la pestaña de Skool ya no está */ }
    if (st.importacion?.datos?.at === e.data.at) return; // el lector lo repite hasta que contestamos
    if (e.data.cliente && cliente() && e.data.cliente !== cliente()) return notice('Esos alumnos de Skool son de otro cliente: cambia de cliente y vuelve a pulsar el marcador.', true);
    if (!st.datos) cargar().then(() => recibir(e.data)); else recibir(e.data);
  });

  // ---------- Pintar ----------
  // Iconos de línea (los mismos trazos que el resto de AlquimIA) y colores fijos por plan.
  const I = {
    users: '<path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19"/><circle cx="10" cy="7.5" r="3.5"/><path d="M20 19v-1.3a3.3 3.3 0 0 0-2.5-3.2M15.5 4.3a3.5 3.5 0 0 1 0 6.4"/>',
    euro: '<path d="M17.5 6.5A7 7 0 1 0 17.5 17.5"/><path d="M4 10h10M4 14h9"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    down: '<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    tag: '<path d="M3.5 12.5V4.5h8l9 9-8 8z"/><circle cx="8" cy="8.5" r="1.4"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.6L4 8"/><path d="M4 4v4h4M4 13a8 8 0 0 0 14.3 4.6L20 16"/><path d="M20 20v-4h-4"/>',
    clip: '<rect x="6" y="4.5" width="12" height="16" rx="2"/><path d="M9 4.5V3.5h6v1"/><path d="M9 10h6M9 14h4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
    bookmark: '<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    crown: '<path d="M4 18h16M4.5 15.5L3 7l5 4 4-6 4 6 5-4-1.5 8.5z"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.01"/>',
    wave: '<path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11M10 10V5a1.5 1.5 0 0 1 3 0v5M13 10V6a1.5 1.5 0 0 1 3 0v6M16 10.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5A6.5 6.5 0 0 1 5 15.5L4 12a1.5 1.5 0 0 1 2.7-1.2L7 11.5"/>',
    seed: '<path d="M12 20v-8M12 12C12 7 8 5 4 5c0 4 3 7 8 7zM12 14c0-4 3-6 7-6 0 4-3 6-7 6z"/>',
  };
  const ico = (n, cls = '') => `<svg class="ms-i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || ''}</svg>`;
  const WA = '<svg class="ms-i" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.2A9.7 9.7 0 0 0 3.6 16.8L2.3 21.7l5-1.3A9.7 9.7 0 1 0 12 2.2zm0 17.7a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 19.9zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8.9c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.7-1.8c-.2-.5-.4-.4-.5-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>';
  const PALETA = ['#6d4aff', '#f97316', '#0ea5e9', '#16a34a', '#e11d48', '#ca8a04', '#0891b2', '#9333ea'];
  const planesOrden = () => [...new Set((st.datos?.alumnos || []).map((a) => a.plan))].sort((a, b) => a.localeCompare(b, 'es'));
  const colorPlan = (p) => { if (p === 'Sin plan') return '#9ca3af'; const l = planesOrden().filter((x) => x !== 'Sin plan'); const i = l.indexOf(p); return PALETA[(i < 0 ? 0 : i) % PALETA.length]; };
  const chipPlan = (p) => `<span class="ms-plan" style="--c:${colorPlan(p)}"><i></i>${esc(p)}</span>`;
  const iniciales = (a) => (String(nom(a)).trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('') || '?').toUpperCase();
  const avatar = (a) => `<span class="ms-av" style="--c:${colorPlan(a.plan)}" aria-hidden="true">${esc(iniciales(a))}</span>`;
  // Punto de actividad: verde (entró esta semana), ámbar (hace 1-2 semanas), rojo (más).
  const tonoUltima = (t) => (!t ? '' : Date.now() - t < 7 * DIA ? 'ok' : Date.now() - t < 14 * DIA ? 'med' : 'mal');
  const ayuda = (t) => `<span class="ms-ayuda" tabindex="0" title="${esc(t)}" aria-label="${esc(t)}">${ico('info')}</span>`;

  function kpi(icono, tono, label, valor, sub = '', def = '', extra = '') {
    return `<div class="ms-kpi" style="--t:${tono}"><span class="ms-kpi-ico">${ico(icono)}</span><div class="ms-kpi-c"><span class="ms-kpi-l">${esc(label)}${def ? ayuda(def) : ''}</span><strong class="ms-kpi-v">${valor}</strong>${sub ? `<span class="ms-kpi-s">${sub}</span>` : ''}${extra}</div></div>`;
  }
  function pestanas() {
    const v = st.vista === 'importar' ? 'resumen' : st.vista;
    const n = (st.datos?.alumnos || []).filter((a) => a.activo !== false).length;
    const tabs = [['resumen', 'chart', 'Resumen', ''], ['alumnos', 'users', 'Alumnos', n ? num(n) : ''], ...(puedeConfig() ? [['planes', 'tag', 'Planes y etiquetas', '']] : [])];
    return `<div class="ms-tabs" role="tablist">${tabs.map(([id, ic, l, c]) => `<button type="button" role="tab" class="ms-tab${v === id ? ' activa' : ''}" aria-selected="${v === id}" data-ms-vista="${id}">${ico(ic)}<span>${l}</span>${c ? `<em>${c}</em>` : ''}</button>`).join('')}</div>`;
  }
  function barra() {
    const d = st.datos || {};
    const fresca = d.ultimaLectura && Date.now() - d.ultimaLectura < 2 * DIA;
    return `<div class="ms-barra">
      <div class="ms-lectura ${d.ultimaLectura ? (fresca ? 'ok' : 'vieja') : ''}">${ico(d.ultimaLectura ? (fresca ? 'check' : 'clock') : 'info')}<div><strong>${d.ultimaLectura ? `Datos de Skool de ${hace(d.ultimaLectura)}` : 'Aún no se ha leído Skool'}</strong><span>${d.ultimaLectura ? `${fecha(d.ultimaLectura)}${d.comunidad ? ` · comunidad «${esc(d.comunidad)}»` : ''}${fresca ? '' : ' · conviene actualizar'}` : 'Sigue los 3 pasos de abajo'}</span></div></div>
      ${puedeConfig() ? `<div class="ms-barra-bts"><button type="button" class="btn primary" data-ms="actualizar">${ico('refresh')} Actualizar alumnos</button><button type="button" class="btn" data-ms="pegar" title="Si el marcador te dio el botón «Copiar»">${ico('clip')} Pegar datos</button></div>` : ''}
    </div>`;
  }
  // Los 3 pasos para leer Skool, como tarjetas (abiertos hasta la primera lectura; luego, plegados).
  function guia() {
    const c = cfg();
    const href = enlaceLector(location.origin, cliente() || '');
    const leido = Boolean(st.datos?.lecturas);
    const paso = (n, icono, titulo, cuerpo, hecho) => `<li class="ms-paso${hecho ? ' hecho' : ''}"><span class="ms-paso-n">${hecho ? ico('check') : n}</span><div><strong>${ico(icono)} ${titulo}</strong>${cuerpo}</div></li>`;
    return `<details class="ms-guia"${leido ? '' : ' open'}><summary>${ico('sparkle')} <strong>Cómo actualizar los alumnos</strong> <span class="muted small">Skool no tiene conexión directa: se leen desde tu navegador, con tu sesión</span></summary>
      <ol class="ms-pasos">
        ${paso(1, 'bookmark', 'Guarda el marcador (una vez)', `<p>Arrástralo a tu barra de marcadores:</p><a class="ms-marcador" href="${esc(href)}" title="Arrástralo a la barra de marcadores (aquí no hace nada)" onclick="event.preventDefault()">${ico('bookmark')} AlquimIA · Skool</a><p class="muted small">¿No ves la barra? Ctrl/Cmd + Mayús + B</p>`, leido)}
        ${paso(2, 'link', 'Tu página de Miembros', `<p>La dirección de Miembros de tu comunidad:</p><input id="ms-url" type="url" placeholder="https://www.skool.com/tu-comunidad/-/members" value="${esc(c.urlSkool || '')}" aria-label="Dirección de Miembros en Skool">`, Boolean(c.urlSkool))}
        ${paso(3, 'refresh', 'Actualiza', '<p>Pulsa <strong>Actualizar alumnos</strong> y, en la pestaña de Skool que se abre, el marcador. Los alumnos vuelven aquí y revisas qué cambia antes de guardar.</p>', leido)}
      </ol>
      <p class="muted small ms-seguro">${ico('check')} No se guarda tu contraseña de Skool ni se toca nada allí: solo se lee lo que ves como administrador.</p>
    </details>`;
  }

  function vistaImportar() {
    const imp = st.importacion;
    const d = imp.datos;
    const claves = clavesDe(d.filas);
    const opt = (sel) => `<option value="">— No viene —</option>${claves.map((c) => `<option value="${esc(c.clave)}"${c.clave === sel ? ' selected' : ''}>${esc(c.clave)} · ${esc(c.ejemplos.join(' | ').slice(0, 60))}</option>`).join('')}`;
    const p = imp.preview;
    const muestra = (imp.alumnos || []).slice(0, 5);
    const lista = (icono, tono, titulo, items) => (items?.length ? `<div class="ms-cambio" style="--t:${tono}"><strong>${ico(icono)} ${titulo}</strong><span>${items}</span></div>` : '');
    const resumen = !p ? '<p class="muted">Calculando qué cambia…</p>' : p.error ? `<p class="ms-error">${esc(p.error)}</p>` : `
      <div class="ms-kpis ms-kpis-imp">
        ${kpi('users', '#6d4aff', 'Leídos de Skool', num(p.leidos), `${num(d.paginas)} ${d.paginas === 1 ? 'página' : 'páginas'}`)}
        ${kpi('plus', '#16a34a', p.primera ? 'Alumnos de partida' : 'Altas', num(p.altas), p.primera ? 'primera lectura' : 'nuevos desde la anterior')}
        ${p.primera ? '' : kpi('minus', '#e11d48', 'Bajas', num(p.bajas), imp.completa ? 'no salen o Skool las marca' : 'solo las que Skool marca')}
        ${p.primera ? '' : kpi('swap', '#0ea5e9', 'Cambian de plan', num(p.cambios))}
        ${p.vuelven ? kpi('wave', '#16a34a', 'Vuelven', num(p.vuelven)) : ''}
      </div>
      ${lista('swap', '#0ea5e9', 'Cambios de plan', (p.muestra?.cambios || []).slice(0, 8).map((c) => `${esc(c.email)}: ${esc(c.de)} → ${esc(c.a)}`).join(' · '))}
      ${lista('minus', '#e11d48', 'Bajas', `${(p.muestra?.bajas || []).slice(0, 12).map(esc).join(' · ')}${p.bajas > 12 ? '…' : ''}`)}`;
    return `<section class="ms-imp">
      <header class="ms-imp-h"><span class="ms-kpi-ico" style="--t:#6d4aff">${ico('search')}</span><div><h3>Revisa la lectura antes de guardarla</h3><p class="muted small">${num(d.filas.length)} miembros de «${esc(d.comunidad || 'Skool')}». <strong>Comprueba que coincide con el número que marca Skool.</strong></p></div></header>
      ${(Number(d.version) || 1) < VERSION_LECTOR ? `<p class="ms-aviso">${ico('alert')} <span><strong>Tu marcador de Skool es antiguo</strong> (no abre la ficha de cada alumno). Borra el de tu barra de marcadores y arrastra de nuevo el botón <strong>«AlquimIA · Skool»</strong> de «Cómo actualizar los alumnos». El nuevo se actualiza solo a partir de ahora.</span></p>` : ''}
      ${d.fichas ? `<p class="ms-aviso ${d.fichas.conFicha ? 'ms-aviso-verde' : ''}">${ico(d.fichas.conFicha ? 'check' : 'alert')} <span>${d.fichas.conFicha ? `Fichas abiertas: <strong>${num(d.fichas.conFicha)} de ${num(d.filas.length)}</strong> alumnos con sus datos completos (plan, precio…).` : 'No se pudo leer la ficha de ningún alumno: se usan los datos de la lista.'}${d.fichas.sinPagina ? ` ${num(d.fichas.sinPagina)} no se abrieron (estaban en otra página de Skool).` : ''}${d.fichas.parado ? ' (Lectura parada a mano.)' : ''}</span></p>` : ''}
      ${imp.aviso ? `<p class="ms-aviso">${ico('alert')} Faltan muchos de los alumnos activos: puede que la lectura esté a medias (por ejemplo, Skool tenía un filtro puesto). Por seguridad, nadie se da de baja por no salir. Si de verdad están todos, marca la casilla.</p>` : ''}
      <label class="ms-check"><input type="checkbox" id="ms-completa"${imp.completa ? ' checked' : ''}><span>Esta lectura trae <strong>a todos los alumnos activos</strong>: quien no salga, se da de baja.</span></label>
      ${resumen}
      ${seccionPlan(imp)}
      <details class="ms-mapa"${imp.alumnos?.length ? '' : ' open'}><summary>${ico('swap')} Qué dato de Skool es cada cosa <span class="muted small">(AlquimIA lo adivina; corrígelo si algo no cuadra, se recuerda)</span></summary>
        <div class="ms-mapa-grid">${CAMPOS.filter((c) => c.id !== 'plan' && c.id !== 'planAlt').map((c) => `<label class="field"><span>${esc(c.label)}${c.obligatorio ? ' *' : ''}</span><select data-ms-mapa="${c.id}">${opt(imp.mapa[c.id])}</select></label>`).join('')}</div>
        <label class="ms-check"><input type="checkbox" id="ms-centimos"${imp.mapa.centimos ? ' checked' : ''}><span>Los importes vienen en céntimos (2900 = 29 €)</span></label>
      </details>
      ${muestra.length ? `<p class="ms-sub">Así quedan los 5 primeros:</p><ul class="ms-muestra">${muestra.map((a) => `<li>${avatar(a)}<div><strong>${esc(nom(a))}</strong><span class="muted small">${esc(a.email)}</span></div>${chipPlan(a.plan)}<span>${a.precio != null ? `${eur(a.precio)}/${a.intervalo}` : '<span class="muted">sin precio</span>'}</span><span title="Lo cobrado">${ico('heart')} ${eur(a.ltv)}</span><span title="Alta">${ico('calendar')} ${fecha(a.alta)}</span>${a.puntos != null ? `<span title="Puntos">${ico('star')} ${num(a.puntos)}</span>` : ''}</li>`).join('')}</ul>` : `<p class="ms-error">${ico('alert')} Sin el email no se puede guardar: elige arriba qué dato es el email.</p>`}
      <div class="ms-imp-bts"><button type="button" class="btn primary" data-ms="guardar-foto"${imp.alumnos?.length && p && !p.error ? '' : ' disabled'}>${ico('check')} Guardar ${num(imp.alumnos?.length || 0)} alumnos</button><button type="button" class="btn ghost" data-ms="cancelar-foto">Cancelar</button></div>
    </section>`;
  }

  // El plan de cada alumno, antes de guardar: cómo se reparten con el dato elegido y otras claves que podrían ser.
  function seccionPlan(imp) {
    const filas = imp.datos.filas;
    const rep = repartoPlan(filas, imp.mapa, imp.opts);
    const total = rep.reduce((t, x) => t + x.n, 0) || 1;
    const sin = rep.find((x) => x.valor === 'Sin plan')?.n || 0;
    const cands = candidatosPlan(filas).filter((c) => c.clave !== imp.mapa.plan).slice(0, 6);
    const opt = (sel) => `<option value="">— Ninguno —</option>${clavesDe(filas, 5000).map((c) => `<option value="${esc(c.clave)}"${c.clave === sel ? ' selected' : ''}>${esc(c.clave)} · ${esc(c.ejemplos.join(' | ').slice(0, 50))}</option>`).join('')}`;
    const colores = ['#6d4aff', '#f97316', '#0ea5e9', '#16a34a', '#e11d48', '#ca8a04', '#0891b2', '#9333ea'];
    return `<section class="ms-planrev${sin ? ' aviso' : ''}">
      <header><span class="ms-kpi-ico" style="--t:${sin ? '#e11d48' : '#16a34a'}">${ico(sin ? 'alert' : 'crown')}</span><div><strong>Plan de cada alumno</strong><span class="muted small">${sin ? `<strong class="ms-mal-t">${num(sin)} alumnos sin plan</strong> con este dato: elige abajo el que lo trae para todos (o uno de respaldo).` : 'Todos los alumnos tienen plan. Comprueba que los nombres y las cifras son las de Skool.'}</span></div></header>
      ${imp.planCambiado ? `<p class="ms-aviso ms-aviso-azul">${ico('info')} El dato del plan que se usó la otra vez (<code>${esc(imp.planCambiado)}</code>) no venía en muchos alumnos: ahora uso <code>${esc(imp.mapa.plan)}</code>.</p>` : ''}
      ${codigosSinNombre(imp.alumnos || [], { todos: true }).some((c) => !c.nombre) || Object.keys(imp.opts?.nombres || {}).length ? tarjetaNombres(codigosSinNombre(imp.alumnos || [], { todos: true }), 'imp') : ''}
      <div class="ms-reparto">${rep.map((x, i) => `<div class="ms-reparto-f${x.valor === 'Sin plan' ? ' sin' : ''}"><span class="ms-plan" style="--c:${x.valor === 'Sin plan' ? '#9ca3af' : colores[i % colores.length]}"><i></i>${esc(x.valor)}</span><span class="ms-barrita"><span style="width:${Math.round((x.n / total) * 100)}%;${x.valor === 'Sin plan' ? 'background:#9ca3af' : `background:${colores[i % colores.length]}`}"></span></span><strong>${num(x.n)}</strong></div>`).join('')}</div>
      <div class="ms-grid2"><label class="field"><span>Dato de Skool con el plan</span><select data-ms-mapa="plan">${opt(imp.mapa.plan)}</select></label><label class="field"><span>Si no viene, usar este otro</span><select data-ms-mapa="planAlt">${opt(imp.mapa.planAlt)}</select></label></div>
      ${cands.length ? `<p class="ms-sub">Otros datos que podrían ser el plan (pulsa para usarlo):</p><div class="ms-cands">${cands.map((c) => `<button type="button" class="ms-cand" data-ms-usar-plan="${esc(c.clave)}"><code>${esc(c.clave)}</code><span class="muted small">${pct(c.cobertura)} de los alumnos</span><span class="ms-cand-v">${c.valores.slice(0, 5).map((v) => `${esc(v.valor)} (${num(v.n)})`).join(' · ')}${c.valores.length > 5 ? ' …' : ''}</span></button>`).join('')}</div>` : ''}
      <p class="muted small">¿No encuentras el plan? <button type="button" class="link-btn" data-ms="diagnostico">Copiar un resumen de los datos de Skool sin datos personales</button> y pégaselo a Claude para ajustarlo.</p>
    </section>`;
  }

  // «Ponle nombre a tus planes»: Skool da un código por plan (o por precio). Con cuántos alumnos tiene y lo que pagan
  // al mes se reconoce cuál es; varios códigos pueden ir al mismo nombre (precio mensual y anual del mismo plan).
  // `donde`: 'imp' (al revisar una lectura; se guarda al guardar) o 'ya' (lo ya guardado: se guarda con su botón).
  function tarjetaNombres(cods, donde) {
    if (!cods.length || !puedeConfig()) return '';
    const usados = [...new Set([...Object.values(cfg().nombres || {}), ...planesOrden().filter((p) => !esCodigo(p) && p !== 'Sin plan')])];
    const nombres = donde === 'imp' ? st.importacion?.opts?.nombres || {} : cfg().nombres || {};
    return `<section class="ms-nombres"><header><span class="ms-kpi-ico" style="--t:#e11d48">${ico('tag')}</span><div><strong>Ponle nombre a tus planes</strong><span class="muted small">Skool da cada plan como un código. Por cuántos alumnos tiene y lo que pagan, escribe cuál es (VIP, Estándar…). Si dos códigos son el mismo plan (mensual y anual), ponles el mismo nombre.</span></div></header>
      <datalist id="ms-nombres-dl">${usados.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
      <div class="ms-nombres-l">${cods.map((c) => `<label class="ms-nombre-f"><code title="${esc(c.codigo)}">${esc(c.codigo.slice(0, 10))}…</code><span><strong>${num(c.n)}</strong> ${c.n === 1 ? 'alumno' : 'alumnos'}${c.precio != null ? ` · pagan <strong>${eur(c.precio)}</strong> al ${c.intervalo === 'año' ? 'año' : 'mes'}${c.intervalo === 'año' && c.mes ? ` (${eur(c.mes)}/mes)` : ''}` : c.mes ? ` · <strong>${eur(c.mes)}</strong>/mes` : ''}</span><input data-ms-nombre="${esc(c.codigo)}" data-ms-donde="${donde}" list="ms-nombres-dl" maxlength="60" placeholder="Nombre del plan" value="${esc(nombres[c.codigo] || c.nombre || '')}"></label>`).join('')}</div>
      ${donde === 'ya' ? `<p><button type="button" class="btn primary" data-ms="guardar-nombres">${ico('check')} Guardar los nombres</button> <span class="muted small">Se renombran al momento: no hace falta volver a leer Skool.</span></p>` : '<p class="muted small">Se guardan con la lectura.</p>'}
    </section>`;
  }

  // Dónut del MRR por plan (SVG).
  function donut(filas, total) {
    if (!total) return '';
    const R = 42; const C = 2 * Math.PI * R;
    let acc = 0;
    const arcos = filas.filter((f) => f.mrr > 0).map((f) => {
      const largo = (f.mrr / total) * C;
      const s = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${colorPlan(f.plan)}" stroke-width="16" stroke-dasharray="${largo.toFixed(2)} ${(C - largo).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}"><title>${esc(f.plan)}: ${eur(f.mrr)} (${pct(f.mrr / total)})</title></circle>`;
      acc += largo;
      return s;
    }).join('');
    return `<div class="ms-donut"><svg viewBox="0 0 120 120" role="img" aria-label="MRR por plan"><g transform="rotate(-90 60 60)"><circle r="${R}" cx="60" cy="60" fill="none" stroke="var(--surface-3)" stroke-width="16"/>${arcos}</g></svg>
      <ul>${filas.filter((f) => f.mrr > 0).map((f) => `<li><i style="background:${colorPlan(f.plan)}"></i><span>${esc(f.plan)}</span><strong>${pct(f.mrr / total)}</strong></li>`).join('')}</ul></div>`;
  }
  // Altas (arriba, verde) y bajas (abajo, rojo) de las últimas 12 semanas.
  function evolucion(semanas) {
    const max = Math.max(1, ...semanas.map((s) => Math.max(s.altas, s.bajas)));
    const W = 24; const H = 56;
    const barras = semanas.map((s, i) => {
      const x = i * (W + 6);
      const ha = (s.altas / max) * H; const hb = (s.bajas / max) * H;
      const t = `Semana del ${fecha(s.ini + DIA)}: ${s.altas} altas, ${s.bajas} bajas`;
      return `<g><title>${t}</title><rect x="${x}" y="${H - ha}" width="${W}" height="${Math.max(ha, s.altas ? 2 : 0)}" rx="4" fill="#16a34a"/><rect x="${x}" y="${H + 2}" width="${W}" height="${Math.max(hb, s.bajas ? 2 : 0)}" rx="4" fill="#e11d48"/>${s.altas ? `<text x="${x + W / 2}" y="${H - ha - 4}" text-anchor="middle">${s.altas}</text>` : ''}${s.bajas ? `<text x="${x + W / 2}" y="${H + hb + 13}" text-anchor="middle">${s.bajas}</text>` : ''}</g>`;
    }).join('');
    return `<svg class="ms-evo" viewBox="-2 -14 ${12 * (W + 6)} ${2 * H + 30}" preserveAspectRatio="none" role="img" aria-label="Altas y bajas por semana"><line x1="0" x2="${12 * (W + 6) - 6}" y1="${H + 1}" y2="${H + 1}" stroke="var(--border-strong)"/>${barras}</svg>`;
  }

  function vistaResumen() {
    const al = st.datos?.alumnos || [];
    if (!al.length) {
      return `<div class="ms-vacio"><span class="ms-vacio-ico">${ico('users')}</span><div><strong>Tu membresía de Skool, de un vistazo</strong><p class="muted">Lee tus alumnos y verás tu MRR, el churn de cada plan, quién está más activo, quién se está enfriando y a quién escribir.${puedeConfig() ? ' Sigue los 3 pasos de arriba.' : ' Pídele a quien configura AlquimIA que lea los alumnos.'}</p></div></div>`;
    }
    const m = metricas();
    const c = cfg();
    const pend = etiquetasPendientes(estado(), c);
    const una = (st.datos?.lecturas || 0) < 2;
    const sinDato = 'sale desde la 2.ª lectura';
    const maxAnt = Math.max(1, ...m.antiguedad.map((x) => x.n));
    const crec = m.crecimiento;
    const chipCrec = una || crec == null ? '' : `<span class="ms-crec ${crec >= 0 ? 'ok' : 'mal'}">${ico(crec >= 0 ? 'trend' : 'down')} ${crec >= 0 ? '+' : ''}${pct(crec)} <small>vs hace 30 días</small></span>`;
    const fila = (a, extra, tono = '') => `<li><button type="button" class="ms-mini" data-ms-ver="${esc(a.email)}">${avatar(a)}<span class="ms-mini-t"><span class="ms-mini-n">${esc(nom(a))}</span><span class="ms-mini-x">${esc(a.plan)}</span></span><span class="ms-pill ${tono}">${extra}</span></button></li>`;
    const maxPts = Math.max(1, ...m.masActivos.map((a) => a.puntos || 0));
    const tonoChurn = (x) => (x > 0.1 ? 'mal' : x > 0.05 ? 'med' : 'ok');
    return `
      ${codigosSinNombre(al).length ? tarjetaNombres(codigosSinNombre(al, { todos: true }), 'ya') : ''}
      <section class="ms-hero">
        <div class="ms-hero-mrr"><span class="ms-hero-l">${ico('euro')} Ingresos recurrentes al mes (MRR) ${ayuda('Lo que pagan al mes los alumnos activos (los anuales, entre 12)')}</span><strong>${eur(m.mrr)}</strong>${chipCrec}<span class="muted small">ARR ${eur(m.arr)} · ${num(m.activos)} alumnos activos · ${eur(m.arpu)} de media al mes</span></div>
        ${donut(m.filas, m.mrr)}
      </section>
      <div class="ms-kpis">
        ${kpi('users', '#6d4aff', 'Alumnos activos', num(m.activos), `${num(m.total - m.activos)} bajas en total`)}
        ${kpi('down', m.churn > 0.08 ? '#e11d48' : '#ca8a04', `Churn ${m.ventana} días`, una ? '–' : pct(m.churn), una ? sinDato : `${num(m.bajas)} bajas · −${eur(m.mrrPerdido)}/mes`, '% de alumnos que se dieron de baja en los últimos 30 días')}
        ${kpi('seed', '#16a34a', `Altas ${m.ventana} días`, una ? '–' : num(m.altas), una ? sinDato : `neto ${m.neto >= 0 ? '+' : ''}${num(m.neto)} alumnos`)}
        ${kpi('heart', '#e11d48', 'LTV medio', eur(m.ltvMedio), `${eur(m.ltvTotal)} cobrado en total`, 'Lo que ha pagado de media cada alumno (Skool + Hotmart + ThriveCart)')}
      </div>
      ${(() => { const sin = al.filter((a) => a.activo !== false && a.plan === 'Sin plan').length; return sin && puedeConfig() ? `<p class="ms-aviso">${ico('alert')} <span><strong>${num(sin)} alumnos activos sin plan.</strong> El dato de Skool que se tomó como plan no viene en todos. Pulsa <strong>Actualizar alumnos</strong> y, al revisar la lectura, elige en «Plan de cada alumno» el dato que lo trae para todos.</span></p>` : ''; })()}
      ${m.sinPrecio ? `<p class="ms-aviso">${ico('alert')} ${num(m.sinPrecio)} alumnos activos sin precio: Skool no lo trae para su plan. Ponlo en <button type="button" class="link-btn" data-ms-vista="planes">Planes y etiquetas</button> para que cuenten en el MRR.</p>` : ''}
      <h3 class="ms-h">${ico('crown')} Tus planes</h3>
      <div class="ms-planes-g">${m.filas.map((f) => `<article class="ms-pcard" style="--c:${colorPlan(f.plan)}">
        <header><span class="ms-pcard-n">${esc(f.plan)}</span><span class="ms-pill ${una ? '' : tonoChurn(f.churn)}" title="Churn de los últimos 30 días">${una ? 'churn: 2.ª lectura' : `churn ${pct(f.churn)}`}</span></header>
        <div class="ms-pcard-big"><strong>${num(f.activos)}</strong><span>alumnos</span><strong class="ms-pcard-mrr">${eur(f.mrr)}</strong><span>/mes</span></div>
        <div class="ms-share" title="${m.mrr ? pct(f.mrr / m.mrr) : '–'} del MRR"><span style="width:${m.mrr ? Math.round((f.mrr / m.mrr) * 100) : 0}%"></span></div>
        <dl>
          <div><dt>Media al mes</dt><dd>${eur(f.arpu)}</dd></div>
          <div><dt>LTV medio</dt><dd>${eur(f.ltvMedio)}</dd></div>
          <div><dt>LTV esperado ${ayuda('Lo que paga al mes ÷ churn mensual: lo que dejará de media un alumno nuevo de este plan')}</dt><dd>${f.ltvEsperado != null ? eur(f.ltvEsperado) : '–'}</dd></div>
          <div><dt>Se quedan</dt><dd>${f.vidaMeses ? `${f.vidaMeses.toLocaleString('es-ES')} meses` : '–'}</dd></div>
          ${una ? '' : `<div><dt>Altas / bajas</dt><dd><span class="ms-ok-t">+${num(f.altas)}</span> / <span class="ms-mal-t">−${num(f.bajas)}</span></dd></div>`}
        </dl>
        <footer>${ico('tag')} <code>${esc(tagDePlan(c, f.plan) || 'sin etiqueta')}</code></footer>
      </article>`).join('')}</div>
      <div class="ms-dos">
        ${bloqueGhl()}
        ${puedeConfig() ? `<section class="ms-accion"><header><span class="ms-kpi-ico" style="--t:#f97316">${ico('tag')}</span><div><strong>Etiquetas de GHL</strong><span class="muted small">Cada alumno, la de su plan; las bajas, ${c.tagBaja ? `<code>${esc(c.tagBaja)}</code>` : 'la de baja (ponla en Planes)'}. Disparan tus flujos de GHL.</span></div></header>
          ${pend.length ? `<button type="button" class="btn primary" data-ms="sincronizar">${ico('tag')} Poner etiquetas a ${num(pend.length)} ${pend.length === 1 ? 'alumno' : 'alumnos'}</button>` : `<p class="ms-ok-t">${ico('check')} Todas al día</p>`}</section>` : ''}
      </div>
      <div class="ms-cols">
        <section class="ms-card ms-card-evo"><h3 class="ms-h">${ico('chart')} Altas y bajas por semana</h3>${una ? `<p class="muted small">${sinDato}: con cada lectura de Skool se ven las altas y bajas de cada semana.</p>` : `${evolucion(m.semanas)}<p class="ms-leyenda"><span><i style="background:#16a34a"></i>Altas</span><span><i style="background:#e11d48"></i>Bajas</span><span class="muted">últimas 12 semanas</span></p>`}</section>
        <section class="ms-card"><h3 class="ms-h">${ico('calendar')} Antigüedad</h3><ul class="ms-barras">${m.antiguedad.map((x) => `<li><span>${esc(x.label)}</span><span class="ms-barrita"><span style="width:${Math.round((x.n / maxAnt) * 100)}%"></span></span><strong>${num(x.n)}</strong></li>`).join('')}</ul></section>
      </div>
      ${(() => {
        const ahora = Date.now();
        const act = al.filter((a) => a.activo !== false);
        if (!act.some((a) => a.renueva || a.noRenueva)) return '';
        const pronto = act.filter((a) => !a.noRenueva && a.renueva && a.renueva >= ahora && a.renueva - ahora <= 30 * DIA);
        const noR = act.filter((a) => a.noRenueva);
        const mrrNoR = noR.reduce((t, a) => t + precioMes(a, c.precios || {}), 0);
        const cobroPronto = pronto.reduce((t, a) => t + (a.precio ?? 0), 0);
        return `<div class="ms-dos"><section class="ms-accion"><header><span class="ms-kpi-ico" style="--t:#0ea5e9">${ico('refresh')}</span><div><strong>Renuevan en los próximos 30 días</strong><span class="muted small">${num(pronto.length)} ${pronto.length === 1 ? 'alumno' : 'alumnos'} · ${eur(cobroPronto)} por cobrar. Buen momento para escribirles antes del cobro.</span></div></header>${pronto.length ? `<button type="button" class="btn" data-ms-seg="renuevan">${ico('users')} Ver quiénes</button>` : ''}</section>
          <section class="ms-accion"><header><span class="ms-kpi-ico" style="--t:#e11d48">${ico('clock')}</span><div><strong>Han cancelado la renovación</strong><span class="muted small">${num(noR.length)} ${noR.length === 1 ? 'alumno sigue' : 'alumnos siguen'} dentro hasta que acabe lo pagado · ${eur(mrrNoR)}/mes que se van a perder si no se les recupera.</span></div></header>${noR.length ? `<button type="button" class="btn primary" data-ms-seg="norenuevan">${ico('mail')} Escribirles</button>` : `<p class="ms-ok-t">${ico('check')} Nadie</p>`}</section></div>`;
      })()}
      <div class="ms-cols ms-cols-3">
        <section class="ms-card"><h3 class="ms-h">${ico('star', 'ms-t-amar')} Más activos</h3>${m.conActividad ? `<ol class="ms-lista">${m.masActivos.map((a) => `<li><button type="button" class="ms-mini" data-ms-ver="${esc(a.email)}">${avatar(a)}<span class="ms-mini-t"><span class="ms-mini-n">${esc(nom(a))}</span>${a.puntos != null ? `<span class="ms-meter"><span style="width:${Math.round(((a.puntos || 0) / maxPts) * 100)}%"></span></span>` : `<span class="ms-mini-x">${esc(a.plan)}</span>`}</span><span class="ms-pill ${a.puntos != null ? '' : tonoUltima(a.ultima)}">${a.puntos != null ? `${num(a.puntos)} pts` : hace(a.ultima)}</span></button></li>`).join('')}</ol>` : '<p class="muted small">Skool no ha traído puntos ni última conexión: elígelos al revisar la próxima lectura.</p>'}</section>
        <section class="ms-card"><h3 class="ms-h">${ico('alert', 'ms-t-mal')} En riesgo <span class="muted small">14+ días sin entrar</span></h3>${m.enRiesgo.length ? `<ol class="ms-lista">${m.enRiesgo.slice(0, 8).map((a) => fila(a, hace(a.ultima), 'mal')).join('')}</ol>${m.enRiesgo.length > 8 ? `<button type="button" class="link-btn ms-ver-todos" data-ms-seg="riesgo">Ver los ${num(m.enRiesgo.length)} y escribirles →</button>` : ''}` : `<p class="ms-ok-t small">${m.conActividad ? `${ico('check')} Nadie: todos han entrado en las últimas 2 semanas.` : 'Hace falta la última conexión de Skool.'}</p>`}</section>
        <section class="ms-card"><h3 class="ms-h">${ico('wave', 'ms-t-azul')} Bajas recientes <span class="muted small">para recuperar</span></h3>${m.bajasRecientes.length ? `<ol class="ms-lista">${m.bajasRecientes.slice(0, 8).map((a) => fila(a, `${eur(ltvDe(a))} · ${hace(a.bajaEn)}`)).join('')}</ol>${m.bajasRecientes.length > 8 ? `<button type="button" class="link-btn ms-ver-todos" data-ms-seg="bajas">Ver las ${num(m.bajasRecientes.length)} →</button>` : ''}` : `<p class="muted small">Ninguna en los últimos 30 días.</p>`}</section>
      </div>`;
  }

  // Cruce con GHL por el email de Skool: quién tiene ficha (y su móvil y etiquetas), quién no, y los botones.
  function bloqueGhl() {
    const g = resumenGhl(st.datos?.alumnos || []);
    if (!g.total) return '';
    const cruzados = g.enGhl + g.noEsta;
    const pctGhl = g.total ? g.enGhl / g.total : 0;
    const R = 20; const C = 2 * Math.PI * R;
    const bts = puedeConfig() ? [
      g.sinCruzar ? `<button type="button" class="btn primary" data-ms="cruzar">${ico('link')} Cruzar ${num(g.sinCruzar)} con GHL</button>` : '',
      g.noEsta ? `<button type="button" class="btn" data-ms="crear-ghl">${ico('plus')} Crear en GHL ${g.noEsta === 1 ? 'el que falta' : `los ${num(g.noEsta)} que faltan`}</button>` : '',
      cruzados ? `<button type="button" class="btn ghost" data-ms="recruzar">${ico('refresh')} Volver a cruzar</button>` : '',
    ].join('') : '';
    return `<section class="ms-accion ms-ghl"><header><svg class="ms-anillo" viewBox="0 0 50 50" aria-hidden="true"><circle cx="25" cy="25" r="${R}" fill="none" stroke="var(--surface-3)" stroke-width="6"/><circle cx="25" cy="25" r="${R}" fill="none" stroke="#16a34a" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(pctGhl * C).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 25 25)"/><text x="25" y="29" text-anchor="middle">${Math.round(pctGhl * 100)}%</text></svg><div><strong>Cruce con GHL</strong><span class="muted small">Por su email de Skool: su ficha, su móvil y sus etiquetas.</span></div></header>
      <div class="ms-ghl-n"><span class="ms-pill ok">${ico('check')} ${num(g.enGhl)} en GHL</span>${g.noEsta ? `<button type="button" class="ms-pill mal" data-ms-seg="singhl" title="Ver quiénes">${ico('x')} ${num(g.noEsta)} no están</button>` : ''}${g.sinCruzar ? `<span class="ms-pill">${ico('clock')} ${num(g.sinCruzar)} sin cruzar</span>` : ''}<span class="ms-pill">${ico('phone')} ${num(g.conMovil)} con móvil</span></div>
      ${bts ? `<div class="ms-barra-bts">${bts}</div>` : ''}</section>`;
  }
  // Cruza (o crea, o etiqueta) en tandas de 10 y vuelve a cargar. → resultados
  async function cruzar(emails, op = 'contacto', etiqueta = 'Cruzando con GHL') {
    if (!emails.length) return [];
    const res = await enLotes(emails, op, etiqueta);
    await cargar();
    return res;
  }

  function filtrados() {
    const ahora = Date.now();
    const seg = SEGMENTOS.find((s) => s.id === st.seg) || SEGMENTOS[0];
    const q = st.q.trim().toLowerCase();
    let l = (st.datos?.alumnos || []).filter((a) => seg.f(a, ahora) && (!st.plan || a.plan === st.plan) && (!q || `${a.nombre} ${a.email}`.toLowerCase().includes(q)));
    l = l.sort(seg.orden || ((a, b) => (b.alta || 0) - (a.alta || 0)));
    return l;
  }
  const ICO_SEG = { todos: 'users', nuevos: 'seed', activos: 'star', riesgo: 'alert', ltv: 'heart', singhl: 'link', renuevan: 'refresh', norenuevan: 'clock', bajas: 'wave' };
  function vistaAlumnos() {
    const al = st.datos?.alumnos || [];
    if (!al.length) return vistaResumen();
    const ahora = Date.now();
    const l = filtrados();
    const c = cfg();
    const pagina = l.slice(0, st.limite || 60);
    return `
      ${codigosSinNombre(al).length ? tarjetaNombres(codigosSinNombre(al, { todos: true }), 'ya') : ''}
      <div class="ms-segs" role="tablist" aria-label="Segmentos">${SEGMENTOS.map((s) => { const n = al.filter((a) => s.f(a, ahora)).length; if (!n && s.id !== 'todos' && st.seg !== s.id) return ''; return `<button type="button" class="ms-seg${st.seg === s.id ? ' activa' : ''}" data-ms-seg="${s.id}">${ico(ICO_SEG[s.id] || 'users')}<span>${esc(s.label)}</span><em>${num(n)}</em></button>`; }).join('')}</div>
      <div class="ms-filtros"><label class="ms-buscar">${ico('search')}<input type="search" id="ms-q" placeholder="Buscar por nombre o email" value="${esc(st.q)}"></label>
        <div class="ms-planchips">${(() => { const enSeg = al.filter((a) => (SEGMENTOS.find((s) => s.id === st.seg) || SEGMENTOS[0]).f(a, ahora)); const n = (p) => enSeg.filter((a) => a.plan === p).length; return `<button type="button" class="ms-planf${st.plan ? '' : ' activa'}" data-ms-planf="">Todos <em>${num(enSeg.length)}</em></button>${planesOrden().filter((p) => n(p) || st.plan === p).map((p) => `<button type="button" class="ms-planf${st.plan === p ? ' activa' : ''}${p === 'Sin plan' ? ' sin' : ''}" data-ms-planf="${esc(p)}" style="--c:${p === 'Sin plan' ? '#9ca3af' : colorPlan(p)}"><i></i>${esc(p)} <em>${num(n(p))}</em></button>`).join('')}`; })()}</div>
        <span class="muted small">${num(l.length)} ${l.length === 1 ? 'alumno' : 'alumnos'}</span></div>
      ${l.length ? '' : '<p class="muted">Nadie en este segmento.</p>'}
      <ul class="ms-alumnos">${pagina.map((a) => {
        const wa = waDe(a.telefono);
        const ult = (a.contactos || []).at(-1);
        const mes = precioMes(a, c.precios || {});
        const tono = tonoUltima(a.ultima);
        const estadoGhl = a.enGhl === true ? `<span class="ms-ghlst ok" title="${esc((a.ghlTags || []).length ? `En GHL · etiquetas: ${(a.ghlTags || []).join(', ')}` : 'En GHL')}">${ico('link')} GHL</span>` : a.enGhl === false ? '<span class="ms-ghlst mal" title="Su email de Skool no está en GHL">' + ico('x') + ' sin GHL</span>' : '';
        return `<li class="ms-al${a.activo === false ? ' baja' : ''}" data-email="${esc(a.email)}" style="--c:${colorPlan(a.plan)}">
          <div class="ms-al-q">${avatar(a)}<div><div class="ms-al-n"><strong>${esc(nom(a))}</strong>${chipPlan(a.plan)}${a.activo === false ? `<span class="ms-pill mal">Baja ${hace(a.bajaEn)}</span>` : ''}</div><span class="muted small">${esc(a.email)}${a.telefono ? ` · ${esc(a.telefono)}` : ''}</span> ${estadoGhl}</div></div>
          <div class="ms-al-d">
            <span title="Antigüedad">${ico('calendar')}${antig(a.alta)}</span>
            <span title="Lo que ha pagado en total">${ico('heart')}${eur(ltvDe(a))}</span>
            ${mes ? `<span title="Lo que paga al mes">${ico('euro')}${eur(mes)}/mes</span>` : ''}
            ${a.puntos != null ? `<span title="Puntos en Skool">${ico('star')}${num(a.puntos)}</span>` : ''}
            ${a.ultima ? `<span class="ms-ult ${tono}" title="Última conexión en Skool"><i></i>${hace(a.ultima)}</span>` : ''}
            ${a.activo !== false && a.noRenueva ? `<span class="ms-pill mal" title="Ha cancelado la renovación: sigue dentro hasta ${fecha(a.renueva)}">${ico('clock')} No renueva${a.renueva ? ` · sale ${dentroDe(a.renueva)}` : ''}</span>` : a.activo !== false && a.renueva ? `<span class="${a.renueva - Date.now() < 15 * DIA ? 'ms-pill med' : ''}" title="Próxima renovación: ${fecha(a.renueva)}">${ico('refresh')}renueva ${dentroDe(a.renueva)}</span>` : ''}
            ${ult ? `<span class="muted" title="Último mensaje desde aquí">${ult.canal === 'wa' ? WA : ico('mail')}${hace(ult.t)}</span>` : ''}
          </div>
          <div class="ms-al-a">${wa ? `<a class="btn small wa" href="https://wa.me/${esc(wa)}?text=${encodeURIComponent(rellenar(c.mensajeWa || 'Hola {nombre}, ', a))}" target="_blank" rel="noopener" data-ms-wa="${esc(a.email)}" aria-label="WhatsApp a ${esc(nom(a))}">${WA} WhatsApp</a>` : a.enGhl === false ? '<span class="ms-sinmovil" title="Su email de Skool no está en GHL: créalo con «Crear en GHL»">' + ico('phone') + ' sin móvil</span>' : a.enGhl === true ? '<span class="ms-sinmovil" title="Su ficha de GHL no tiene móvil. Si se lo pones, pulsa «Volver a cruzar».">' + ico('phone') + ' sin móvil</span>' : `<button type="button" class="btn small" data-ms-tel="${esc(a.email)}" title="Busca su ficha en GHL por su email y trae su móvil">${ico('phone')} Buscar móvil</button>`}<button type="button" class="btn small" data-ms-email="${esc(a.email)}" aria-label="Email a ${esc(nom(a))}">${ico('mail')} Email</button></div>
        </li>`;
      }).join('')}</ul>
      ${l.length > pagina.length ? `<p class="ms-mas"><button type="button" class="btn" data-ms="mas">Ver más (${num(l.length - pagina.length)})</button></p>` : ''}
      ${l.some((a) => !a.telefono && a.enGhl == null) ? `<p class="ms-aviso ms-aviso-azul">${ico('phone')} Skool no da el móvil: se trae de su ficha de GHL por su email. <button type="button" class="link-btn" data-ms="moviles">Cruzar los ${num(l.filter((a) => !a.telefono && a.enGhl == null).length)} de esta lista</button></p>` : ''}`;
  }

  function vistaPlanes() {
    const c = cfg();
    const planes = planesOrden();
    return `<section class="ms-planes-cfg">
      <div class="ms-grid2">
        <label class="field"><span>${ico('tag')} Prefijo de las etiquetas</span><input id="ms-prefijo" value="${esc(c.prefijo || 'alumno')}" maxlength="40"><small class="muted">Sin etiqueta propia, cada plan lleva <code>${esc(c.prefijo || 'alumno')}-&lt;plan&gt;</code></small></label>
        <label class="field"><span>${ico('wave')} Etiqueta de las bajas</span><input id="ms-tagbaja" value="${esc(c.tagBaja || '')}" placeholder="membresia-baja" maxlength="80"><small class="muted">Dispara tu flujo de recuperación en GHL</small></label>
      </div>
      <h3 class="ms-h">${ico('crown')} Cada plan</h3>
      ${planes.length ? `<div class="ms-plancfg">${planes.map((p) => `<div class="ms-plancfg-f" data-ms-plan="${esc(p)}" style="--c:${colorPlan(p)}">
        <div class="ms-plancfg-n">${chipPlan(p)}</div>
        <label class="field"><span>Etiqueta de GHL</span><input class="ms-in-tag" value="${esc(c.etiquetas?.[p] || '')}" placeholder="${esc(tagDePlan({ prefijo: c.prefijo }, p))}" maxlength="80"></label>
        <label class="field"><span>Precio <small>(si Skool no lo trae)</small></span><span class="ms-precio"><input class="ms-in-precio" type="number" min="0" step="0.01" value="${c.precios?.[p]?.importe ?? ''}" placeholder="–"> € / <select class="ms-in-int"><option value="mes"${c.precios?.[p]?.intervalo === 'año' ? '' : ' selected'}>mes</option><option value="año"${c.precios?.[p]?.intervalo === 'año' ? ' selected' : ''}>año</option></select></span></label>
      </div>`).join('')}</div>` : '<p class="muted">Los planes aparecen aquí cuando leas los alumnos de Skool.</p>'}
      <h3 class="ms-h">${ico('mail')} Mensajes por defecto</h3>
      <p class="muted small">Con <code>{nombre}</code> (nombre de pila) y <code>{plan}</code>. Antes de enviar cada uno se pueden cambiar.</p>
      <label class="field"><span>${WA} WhatsApp</span><textarea id="ms-msg-wa" rows="2" maxlength="1000" placeholder="Hola {nombre}, ">${esc(c.mensajeWa || '')}</textarea></label>
      <div class="ms-grid2"><label class="field"><span>${ico('mail')} Asunto del email</span><input id="ms-asunto" maxlength="150" value="${esc(c.asunto || '')}"></label></div>
      <label class="field"><span>Texto del email</span><textarea id="ms-cuerpo" rows="5" maxlength="5000">${esc(c.cuerpo || '')}</textarea></label>
      <p><button type="button" class="btn primary" data-ms="guardar-cfg">${ico('check')} Guardar</button></p>
    </section>`;
  }

  function pintar() {
    if (!body) return;
    if (!conMembresia(cliente())) { body.innerHTML = '<p class="muted">La membresía de Skool es de Discendo: entra en Discendo para verla.</p>'; return; }
    if (!st.datos) { body.innerHTML = '<p class="muted">Cargando la membresía…</p>'; return; }
    const v = st.importacion ? 'importar' : st.vista;
    { const l = st.datos.alumnos || []; const usd = l.filter((a) => a.moneda === 'USD').length; const eu = l.filter((a) => a.moneda === 'EUR').length; MONEDA = usd > eu ? 'USD' : 'EUR'; }
    body.innerHTML = `${barra()}${puedeConfig() && !st.importacion ? guia() : ''}${st.importacion ? '' : pestanas()}<div class="ms-vista">${v === 'importar' ? vistaImportar() : v === 'alumnos' ? vistaAlumnos() : v === 'planes' && puedeConfig() ? vistaPlanes() : vistaResumen()}</div>`;
  }

  // ---------- Acciones ----------
  async function guardarCfg(parcial) {
    const r = await api('/api/membresia', { method: 'POST', body: { op: 'cfg', cfg: parcial } });
    st.datos.cfg = r.cfg;
    return r.cfg;
  }
  async function enLotes(emails, op, etiqueta) {
    const res = [];
    for (let i = 0; i < emails.length; i += 10) {
      progress?.(i, emails.length, etiqueta);
      const { results } = await api('/api/membresia', { method: 'POST', body: { op, emails: emails.slice(i, i + 10) } });
      res.push(...results);
    }
    progress?.(emails.length, emails.length, etiqueta);
    return res;
  }
  function correo(email) {
    const a = (st.datos?.alumnos || []).find((x) => x.email === email);
    if (!a) return;
    const c = cfg();
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog ms-email-dlg';
    dlg.innerHTML = `<form method="dialog"><header class="dialog-head"><h2>✉️ Email a ${esc(nom(a))}</h2><button class="btn ghost" value="cancel" aria-label="Cerrar">✕</button></header>
      <div class="dialog-body"><p class="muted small">Se envía desde GHL (su conversación queda en la ficha del contacto) a <strong>${esc(a.email)}</strong>.</p>
      <label class="field"><span>Asunto</span><input name="asunto" required maxlength="150" value="${esc(rellenar(c.asunto || '', a))}"></label>
      <label class="field"><span>Texto</span><textarea name="texto" rows="8" required maxlength="5000">${esc(rellenar(c.cuerpo || `Hola {nombre},\n\n`, a))}</textarea></label></div>
      <footer class="dialog-foot"><button class="btn ghost" value="cancel">Cancelar</button><button class="btn primary" value="enviar">Enviar</button></footer></form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', async () => {
      const f = dlg.querySelector('form');
      const asunto = f.asunto.value.trim();
      const texto = f.texto.value.trim();
      const enviar = dlg.returnValue === 'enviar';
      dlg.remove();
      if (!enviar) return;
      try {
        const r = await api('/api/membresia', { method: 'POST', body: { op: 'email', email, asunto, texto } });
        a.contactos = r.contactos;
        notice(`Email enviado a ${nom(a)}.`);
        pintar();
      } catch (e) { notice(e.message, true); }
    });
    dlg.showModal();
  }

  body?.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-ms],[data-ms-vista],[data-ms-seg],[data-ms-email],[data-ms-tel],[data-ms-wa],[data-ms-ver],[data-ms-planf],[data-ms-usar-plan]');
    if (!t) return;
    if (t.dataset.msUsarPlan && st.importacion) { st.importacion.mapa.plan = t.dataset.msUsarPlan; st.importacion.planCambiado = ''; previsualizar(); pintar(); return; }
    if (t.dataset.msPlanf != null) { st.plan = t.dataset.msPlanf; st.limite = 60; pintar(); return; }
    if (t.dataset.msVista) { st.vista = t.dataset.msVista; ls.set('lsd_ms_vista', st.vista); pintar(); return; }
    if (t.dataset.msSeg) { st.seg = t.dataset.msSeg; st.vista = 'alumnos'; st.limite = 60; pintar(); return; }
    if (t.dataset.msVer) { st.vista = 'alumnos'; st.seg = SEGMENTOS.some((s) => s.id === 'bajas') && (st.datos.alumnos.find((a) => a.email === t.dataset.msVer)?.activo === false) ? 'bajas' : 'todos'; st.q = t.dataset.msVer; pintar(); return; }
    if (t.dataset.msEmail) { correo(t.dataset.msEmail); return; }
    if (t.dataset.msWa) {
      const a = st.datos.alumnos.find((x) => x.email === t.dataset.msWa);
      api('/api/membresia', { method: 'POST', body: { op: 'apuntar', email: t.dataset.msWa, canal: 'wa' } }).then((r) => { if (a) a.contactos = r.contactos; }).catch(() => {});
      return; // el enlace abre WhatsApp
    }
    if (t.dataset.msTel) {
      t.disabled = true;
      try {
        const [r] = await enLotes([t.dataset.msTel], 'contacto', 'Buscando en GHL');
        const a = st.datos.alumnos.find((x) => x.email === t.dataset.msTel);
        if (a && r) { a.enGhl = r.enGhl ?? a.enGhl; if (r.telefono) a.telefono = r.telefono; if (r.ghlTags) a.ghlTags = r.ghlTags; pintar(); }
        if (!r?.ok || !r.telefono) notice(r?.ok ? 'Su ficha de GHL no tiene móvil.' : r?.motivo === 'no está en GHL' ? 'Su email de Skool no está en GHL.' : `No se ha podido: ${r?.motivo || 'error'}.`, !r?.ok && r?.motivo !== 'no está en GHL');
      } catch (err) { notice(err.message, true); }
      t.disabled = false;
      return;
    }
    const op = t.dataset.ms;
    if (op === 'actualizar') {
      const url = document.getElementById('ms-url')?.value.trim() || cfg().urlSkool;
      if (!/^https:\/\/([a-z0-9-]+\.)*skool\.com\//i.test(url || '')) { notice('Pon primero la dirección de Miembros de tu comunidad en Skool (https://www.skool.com/…/-/members).', true); document.getElementById('ms-url')?.focus(); return; }
      if (url !== cfg().urlSkool) guardarCfg({ urlSkool: url }).catch(() => {});
      st.skoolTab = window.open(url, 'skool-miembros');
      notice('En la pestaña de Skool, pulsa el marcador «📥 AlquimIA · Skool».');
      return;
    }
    if (op === 'pegar') {
      let txt = '';
      try { txt = await navigator.clipboard.readText(); } catch { txt = window.prompt('Pega aquí lo que copió el marcador de Skool:') || ''; }
      let d = null;
      try { d = JSON.parse(txt); } catch { /* no es JSON */ }
      if (!esDatosSkool(d)) { notice('En el portapapeles no hay datos del marcador de Skool. Pulsa «Copiar para AlquimIA» en Skool y vuelve a probar.', true); return; }
      recibir(d);
      return;
    }
    if (op === 'guardar-nombres') {
      const nombres = { ...(cfg().nombres || {}) };
      for (const i of body.querySelectorAll('[data-ms-nombre][data-ms-donde="ya"]')) { const v = i.value.trim(); if (v) nombres[i.dataset.msNombre] = v; else delete nombres[i.dataset.msNombre]; }
      t.disabled = true;
      try {
        const r = await api('/api/membresia', { method: 'POST', body: { op: 'cfg', cfg: { nombres } } });
        notice(`Planes con nombre: ${num(r.renombrados || 0)} alumnos actualizados. Las etiquetas de GHL ya usan el nombre.`);
        await cargar();
      } catch (err) { notice(err.message, true); t.disabled = false; }
      return;
    }
    if (op === 'diagnostico' && st.importacion) {
      const texto = diagnosticoSkool(st.importacion.datos.filas);
      try { await navigator.clipboard.writeText(texto); notice('Resumen copiado (sin emails, nombres ni teléfonos). Pégaselo a Claude.'); } catch { window.prompt('Copia este resumen:', texto); }
      return;
    }
    if (op === 'cancelar-foto') { st.importacion = null; pintar(); return; }
    if (op === 'guardar-foto') {
      const imp = st.importacion;
      t.disabled = true;
      try {
        await guardarCfg({ mapa: imp.mapa, nombres: imp.opts?.nombres || {} });
        const r = await api('/api/membresia', { method: 'POST', body: { op: 'foto', alumnos: imp.alumnos, completa: imp.completa, confirmar: true, comunidad: imp.datos.comunidad } });
        notice(r.primera ? `Membresía lista: ${r.altas} alumnos.` : `Membresía actualizada: ${r.altas} altas, ${r.bajas} bajas y ${r.cambios} cambios de plan.`);
        st.importacion = null;
        st.vista = 'resumen';
        await cargar();
        // Los alumnos nuevos se cruzan solos con GHL (móvil, etiquetas, si están).
        const nuevos = (st.datos?.alumnos || []).filter((a) => a.enGhl == null).map((a) => a.email);
        if (nuevos.length) {
          const res = await cruzar(nuevos);
          notice(`Cruce con GHL: ${res.filter((x) => x.enGhl).length} de ${res.length} están en GHL${res.some((x) => x.enGhl === false) ? ` · ${res.filter((x) => x.enGhl === false).length} no` : ''}.`);
        }
      } catch (err) { notice(err.message, true); t.disabled = false; }
      return;
    }
    if (op === 'cruzar' || op === 'recruzar') {
      const l = (st.datos?.alumnos || []).filter((a) => op === 'recruzar' || a.enGhl == null).map((a) => a.email);
      t.disabled = true;
      try {
        const res = await cruzar(l);
        notice(`Cruce con GHL: ${res.filter((x) => x.enGhl).length} de ${res.length} están en GHL${res.some((x) => x.enGhl === false) ? `, ${res.filter((x) => x.enGhl === false).length} no` : ''}${res.some((x) => x.motivo === 'error de GHL') ? ` (${res.filter((x) => x.motivo === 'error de GHL').length} con error: vuelve a probar)` : ''}.`);
      } catch (err) { notice(err.message, true); t.disabled = false; }
      return;
    }
    if (op === 'crear-ghl') {
      const l = (st.datos?.alumnos || []).filter((a) => a.enGhl === false).map((a) => a.email);
      if (!l.length || !window.confirm(`Se creará en GHL la ficha de ${l.length} ${l.length === 1 ? 'alumno' : 'alumnos'} (email, nombre y, si lo hay, móvil de Skool). Si tienes flujos que se disparan con contactos nuevos, se dispararán. ¿Seguimos?`)) return;
      t.disabled = true;
      try {
        const res = await cruzar(l, 'crear', 'Creando fichas en GHL');
        notice(`Creados en GHL: ${res.filter((x) => x.ok).length} de ${res.length}.`, res.some((x) => !x.ok));
      } catch (err) { notice(err.message, true); t.disabled = false; }
      return;
    }
    if (op === 'sincronizar') {
      const pend = etiquetasPendientes(estado(), cfg());
      if (!pend.length) return;
      if (!window.confirm(`Se pondrá en GHL la etiqueta de su plan a ${pend.length} alumnos (y la de baja a las bajas). Eso dispara los flujos de GHL que tengas con esas etiquetas. ¿Seguimos?`)) return;
      t.disabled = true;
      try {
        const res = await enLotes(pend.map((p) => p.email), 'etiquetar', 'Poniendo etiquetas en GHL');
        const ok = res.filter((r) => r.ok).length;
        const noGhl = res.filter((r) => r.motivo === 'no está en GHL').length;
        notice(`Etiquetas puestas a ${ok} alumnos${noGhl ? ` · ${noGhl} no están en GHL (créalos con «➕ Crear en GHL»)` : ''}${res.length - ok - noGhl ? ` · ${res.length - ok - noGhl} con error` : ''}.`, ok < res.length && !noGhl);
        await cargar();
      } catch (err) { notice(err.message, true); t.disabled = false; }
      return;
    }
    if (op === 'moviles') {
      const emails = filtrados().filter((a) => !a.telefono && a.enGhl == null).map((a) => a.email);
      try {
        const res = await cruzar(emails, 'contacto', 'Buscando sus fichas en GHL');
        notice(`Móvil encontrado para ${res.filter((r) => r.telefono).length} de ${res.length}${res.some((r) => r.enGhl === false) ? ` · ${res.filter((r) => r.enGhl === false).length} no están en GHL` : ''}.`);
      } catch (err) { notice(err.message, true); }
      return;
    }
    if (op === 'mas') { st.limite = (st.limite || 60) + 60; pintar(); return; }
    if (op === 'guardar-cfg') {
      const etiquetas = {}; const precios = {};
      for (const tr of body.querySelectorAll('[data-ms-plan]')) {
        const p = tr.dataset.msPlan;
        const tag = tr.querySelector('.ms-in-tag').value.trim().toLowerCase();
        if (tag) etiquetas[p] = tag;
        const imp = tr.querySelector('.ms-in-precio').value;
        if (imp !== '') precios[p] = { importe: Number(imp), intervalo: tr.querySelector('.ms-in-int').value };
      }
      try {
        await guardarCfg({ prefijo: document.getElementById('ms-prefijo').value.trim(), tagBaja: document.getElementById('ms-tagbaja').value.trim().toLowerCase(), etiquetas, precios, mensajeWa: document.getElementById('ms-msg-wa').value, asunto: document.getElementById('ms-asunto').value, cuerpo: document.getElementById('ms-cuerpo').value });
        notice('Planes y etiquetas guardados.');
        pintar();
      } catch (err) { notice(err.message, true); }
    }
  });
  body?.addEventListener('change', (e) => {
    const imp = st.importacion;
    if (e.target.dataset.msMapa && imp) { if (e.target.value) imp.mapa[e.target.dataset.msMapa] = e.target.value; else delete imp.mapa[e.target.dataset.msMapa]; previsualizar(); pintar(); return; }
    if (e.target.dataset.msNombre && e.target.dataset.msDonde === 'imp' && imp) { const v = e.target.value.trim(); if (v) imp.opts.nombres[e.target.dataset.msNombre] = v; else delete imp.opts.nombres[e.target.dataset.msNombre]; previsualizar(); pintar(); return; }
    if (e.target.id === 'ms-centimos' && imp) { imp.mapa.centimos = e.target.checked; previsualizar(); return; }
    if (e.target.id === 'ms-completa' && imp) { imp.completa = e.target.checked; imp.tocadoCompleta = true; imp.aviso = false; previsualizar(); return; }
    if (e.target.id === 'ms-plan') { st.plan = e.target.value; pintar(); }
    if (e.target.id === 'ms-url') { const u = e.target.value.trim(); if (!u || /^https:\/\/([a-z0-9-]+\.)*skool\.com\//i.test(u)) guardarCfg({ urlSkool: u }).catch(() => {}); }
  });
  let tq = null;
  body?.addEventListener('input', (e) => {
    if (e.target.id !== 'ms-q') return;
    clearTimeout(tq);
    tq = setTimeout(() => { st.q = e.target.value; const pos = e.target.selectionStart; pintar(); const q = document.getElementById('ms-q'); q?.focus(); q?.setSelectionRange(pos, pos); }, 250);
  });

  return {
    abrir: () => { pintar(); cargar(); },
    recibir,
    _st: st,
    EMAIL_RE,
  };
}
