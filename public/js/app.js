import {
  ESTADOS, NEXT_STEPS, buildMessage, waPhone, tagFor, LAUNCH_CODE_RE, THRESHOLDS, watched, SNAPSHOT_TAGS, fotosPendientes, OUTCOMES, dayInMadrid,
} from './scoring.js';
import { icon } from './icons.js';
import { nombreProducto, conProducto, PRODUCTO_MLDLM } from './producto.js';
import { asistenciaPorTrafico, resumenEncuesta, resumenTrafico, importeCompra, enrichLead, computeMetrics, bySource, rankingGanadores, historicoAnuncios, ventasPorDia, porRespuesta, avisosLanzamiento, perfilesCompradoras, describirAvatar, avatarDeLead } from './metrics.js';
import { LINK_KEYS, phaseAt, barFor, formatLong, phasesFor, madridToEpoch } from './page.js';
import { FORMATOS, videosDe, esEnDirecto, sigDirecto, sigReplay, nClases, clasesDe, conVip, esReto } from './videos.js';
import { ESCENARIOS, ROAS_OBJETIVO_DEF, escenarios, proyectar, noLlega, resumenLanzamiento, prevision } from './calculadora.js';
import { rendimientoEquipo } from './rendimiento.js';
import { FASES_METEORICO, faseMeteorico, horasOferta, pendientesMeteorico, hitosMeteorico, fasesMeteoricoCal } from './meteorico.js';
import { PLANES_SUSCRIPCION, esSuscripcion, planesActivos, pendientesPago } from './pago.js';
import { cicloDeContactos, textoDias } from './ciclo.js';
import { TIPOS_BONUS, TIPOS_BONUS_METEO, TIPOS_ENTREGABLE, tipoBonus, tipoBonusMeteo, tipoEntregable, ventanaBonus, valorOferta, analizarOferta, lecturaBonus, dinero } from './oferta.js';
import { ventanaBonusMeteo, analizarOfertaMeteo, lecturaBonusMeteo } from './oferta-meteo.js';
import { alertasCarrito } from './alertas.js';
import { BLOQUES, pesosDe, proponerPesos, pesosEfectivos } from './pesos.js';
import { tieneRecurso, recursosDe, sanitizeRecursos, etapasPreclase, TIPOS_RECURSO, RECURSOS_EXTRA } from './recursos.js';
import { retrospectiva } from './retrospectiva.js';
import { leerLeads, guardarLeads, borrarCopias } from './cache-leads.js';
import { INDICADORES, indicadoresLanzamiento, indicadoresVsl, mediaIndicadores, diferencias, alertas, ultimosMeses } from './comparar.js';
import { fasesDe, puedeMarcar, esMia, vencida, addDays, vencidasEquipo, SUBS_PREPARACION, subDe, columnaDe, COLUMNA_HECHAS, COLOR_COLUMNAS } from './tareas.js';
import { hitosLanzamiento, fasesLanzamiento, EVENTO_TIPOS } from './calendario.js';
import { RESULTADOS, MOTIVOS, metricasLlamadas, FASES_LLAMADA, fasesPorContacto } from './llamadas.js';
import { PERMISOS, PERMISOS_DATOS, idDeRol, ROL_CLIENTE } from './roles.js';
import { auditarLanzamiento, auditarVsl, proximoHito, diasHasta, cuando, fechaCortaAud } from './auditor.js';
import { PESTANAS, SUBTIPOS_VSL, SUBTIPO_IDS, conPrep, subtipoValido, textosVsl, pestanasSugeridas, guiaEmbudo, guiaCliente, guiaHtml as guiaPasosHtml } from './embudos-def.js';
import { rangoDe, semanasDelMes, enrichVsl, computeVsl, porSemanas, porDias, ESTADOS_VSL, importeVsl, addDay } from './embudo-vsl.js';
import { sanitizeRich, richToHtml, richToText, richTieneVideo, richTieneEnlace, videoEmbed, safeHref } from './richtext.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const PAGE_SIZE = 100;

const state = {
  meteo: { code: '', datos: {} }, // ⚡ meteóricos: el elegido y sus métricas
  vsl: { leads: null, raw: null, meta: null, ganLevel: 'ad', loadToken: 0, mostrar: 100 },
  role: null,
  permisos: [],
  roles: [],
  user: null,
  tareas: null, // { code, list, users }
  tFiltro: 'pendientes',
  tVista: 'lista', // 'lista' | 'tablero' (se recuerda en el navegador)
  tResp: '',
  tSel: null, // Set de ids seleccionados (modo selección del admin) o null
  equipo: [],
  config: null,
  zoomConfigured: false,
  tags: [],
  launchCode: null,
  embudo: '', // id del embudo activo (menú lateral)
  leads: [],
  filters: { search: '', estado: '', step: '', signal: '', pending: false },
  sort: { key: 'score', dir: 'desc' },
  page: 0,
  loadToken: 0,
};

// Preguntas de la encuesta del avatar de este cliente.
const preguntasEncuesta = () => state.config?.encuesta || [];

// Nombre del producto del cliente: los textos dicen «Raíces» (MLDLM) y en otro cliente se cambian
// por el suyo en todo lo que se pinta (textos, placeholders y títulos).
const producto = { nombre: PRODUCTO_MLDLM, obs: null };
function cambiarProductoEn(root) {
  const n = producto.nombre;
  if (n === PRODUCTO_MLDLM || !root) return;
  // «Ver como» otro cliente: su portal lleva ya el nombre de su producto.
  if (root.closest?.('[data-otro-cliente]') || root.parentElement?.closest('[data-otro-cliente]')) return;
  const re = new RegExp(PRODUCTO_MLDLM, 'g');
  if (root.nodeType === 3) { if (root.nodeValue.includes(PRODUCTO_MLDLM)) root.nodeValue = root.nodeValue.replace(re, n); return; }
  if (root.nodeType !== 1) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) if (t.nodeValue.includes(PRODUCTO_MLDLM)) t.nodeValue = t.nodeValue.replace(re, n);
  for (const el of [root, ...root.querySelectorAll('[placeholder],[title]')]) {
    for (const a of ['placeholder', 'title']) { const v = el.getAttribute?.(a); if (v && v.includes(PRODUCTO_MLDLM)) el.setAttribute(a, v.replace(re, n)); }
  }
}
function aplicarProducto() {
  producto.nombre = nombreProducto(state.config);
  producto.obs?.disconnect();
  producto.obs = null;
  if (producto.nombre === PRODUCTO_MLDLM) return;
  cambiarProductoEn(document.body);
  producto.obs = new MutationObserver((muts) => {
    for (const m of muts) for (const nd of m.addedNodes) cambiarProductoEn(nd);
  });
  producto.obs.observe(document.body, { childList: true, subtree: true });
}

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};
if (ls.get('lsd_tareas_vista') === 'tablero') state.tVista = 'tablero';
// Cliente (varios clientes en el mismo dashboard): el de la URL (?c=) o el último elegido.
state.cliente = new URLSearchParams(location.search).get('c') || ls.get('lsd_cliente') || '';
state.clientes = [];
state.superadmin = false;

// En los códigos para GHL: los clientes que no son el principal llevan ?c=<cliente>.
const esPrincipal = () => state.clientes.find((c) => c.id === state.cliente)?.principal !== false;
const cParam = (sep = '?') => (esPrincipal() ? '' : `${sep}c=${encodeURIComponent(state.cliente)}`);

function cambiarCliente(id) {
  const c = state.clientes.find((x) => x.id === id);
  ls.set('lsd_cliente', id);
  const u = new URL(location.href);
  if (c?.principal) u.searchParams.delete('c'); else u.searchParams.set('c', id);
  u.hash = '';
  location.href = u.toString();
}

// ---------- API ----------
async function api(path, { method = 'GET', body, cliente = state.cliente } = {}) {
  // Configuración: se manda la versión que se cargó; si otra persona guardó después, el servidor avisa (409).
  const esConfig = path.split('?')[0] === '/api/config';
  if (esConfig && method === 'POST' && body && !body.op && state.configVersion != null) body = { ...body, _version: state.configVersion };
  const res = await fetch(path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cliente ? { 'x-cliente': cliente } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (esConfig && res.ok && 'version' in data) state.configVersion = data.version;
  // Configuración cambiada (p. ej. qué emails son de cada embudo): los emails se vuelven a leer.
  if (esConfig && method === 'POST' && res.ok) for (const k of Object.keys(emailsCache)) delete emailsCache[k];
  if (res.status === 401 && path !== '/api/login') {
    showLogin();
    throw new Error('Sesión caducada');
  }
  // A la admin se le enseña el detalle técnico (p. ej. la respuesta de GHL) para poder diagnosticar.
  if (!res.ok) throw new Error(`${data.error || `Error ${res.status}`}${data.detail && data.detail !== data.error && state.role === 'admin' ? ` · Detalle: ${String(data.detail).slice(0, 300)}` : ''}`);
  return data;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function notice(msg, isError = false) {
  const el = $('#notice');
  if (!msg) { el.hidden = true; return; }
  el.textContent = msg;
  el.classList.toggle('err', isError);
  el.hidden = false;
}

function progress(done, total, label) {
  const el = $('#progress');
  if (done == null) { el.hidden = true; return; }
  el.hidden = false;
  const pct = total ? Math.min(100, (done / total) * 100) : 30;
  $('.progress-bar', el).style.width = `${pct}%`;
  $('.progress-text', el).textContent = label;
  const dialog = document.getElementById('config-dialog');
  if (dialog?.open && state.fotoEnCurso) $('#cfg-status').textContent = label; // solo el progreso de la foto, no el de recargar leads
}

// ---------- Login ----------
function showLogin() {
  borrarCopias(); // sin sesión, fuera la copia de los leads del navegador
  $('#app').hidden = true;
  $('#portal').hidden = true;
  $('#login').hidden = false;
  $('#login-password').focus();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#login-error');
  err.hidden = true;
  try {
    const d = await api('/api/login', { method: 'POST', body: { email: $('#login-email').value.trim(), password: $('#login-password').value } });
    $('#login-password').value = '';
    if (d.dosPasos) { segundoPaso(d); return; }
    await start();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

// ---------- Verificación en dos pasos (al entrar y en Mi cuenta) ----------
// QR con qrcodejs (cdnjs), cargado solo cuando hace falta; si no carga, queda la clave escrita.
let qrLib = null;
function pintarQr(el, uri) {
  el.innerHTML = '';
  qrLib ||= new Promise((ok, ko) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    sc.onload = ok;
    sc.onerror = () => { qrLib = null; ko(new Error('Sin QR')); };
    document.head.appendChild(sc);
  });
  qrLib.then(() => { el.innerHTML = ''; new window.QRCode(el, { text: uri, width: 176, height: 176, correctLevel: window.QRCode.CorrectLevel.M }); }).catch(() => { el.hidden = true; });
}
const secretoLegible = (s) => s.replace(/(.{4})/g, '$1 ').trim();
function codigosRecuperacionHtml(codigos) {
  return `<div class="notice warn recup"><strong>Guarda estos códigos de recuperación</strong> (cada uno vale una vez, por si pierdes el móvil). No se vuelven a mostrar.
    <ul class="recup-lista">${codigos.map((c) => `<li><code>${esc(c)}</code></li>`).join('')}</ul>
    <button type="button" class="btn" data-copiar-codigos="${esc(codigos.join('\n'))}">Copiar</button></div>`;
}
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-copiar-codigos]');
  if (!b) return;
  navigator.clipboard?.writeText(b.dataset.copiarCodigos).then(() => { b.textContent = 'Copiados ✓'; }).catch(() => {});
});

const l2 = { ticket: '', alta: false, listo: false };
async function segundoPaso(d) {
  Object.assign(l2, { ticket: d.ticket, alta: d.alta, listo: false });
  $('#login-form').hidden = true;
  $('#login-2fa').hidden = false;
  $('#l2-error').hidden = true;
  $('#l2-recup').hidden = true;
  $('#l2-codigo').hidden = false;
  $('#l2-codigo').value = '';
  $('#l2-btn').textContent = 'Verificar';
  $('#l2-alta').hidden = !d.alta;
  $('#l2-texto').textContent = d.alta
    ? 'Para los admins es obligatoria. Instala una app de códigos (Google Authenticator, Microsoft Authenticator, 1Password…), escanea el QR y escribe el código que te muestra.'
    : 'Escribe el código de 6 cifras de tu app de autenticación (o uno de tus códigos de recuperación).';
  if (d.alta) {
    try {
      const a = await api('/api/login', { method: 'POST', body: { ticket: l2.ticket, op: '2fa-iniciar' } });
      $('#l2-secreto').textContent = secretoLegible(a.secreto);
      pintarQr($('#l2-qr'), a.uri);
    } catch (ex) { $('#l2-error').textContent = ex.message; $('#l2-error').hidden = false; }
  }
  $('#l2-codigo').focus();
}
function salirSegundoPaso() {
  $('#login-2fa').hidden = true;
  $('#login-form').hidden = false;
  l2.ticket = '';
}
$('#l2-volver').addEventListener('click', salirSegundoPaso);
$('#login-2fa').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (l2.listo) { l2.listo = false; salirSegundoPaso(); await start(); return; }
  const err = $('#l2-error');
  err.hidden = true;
  try {
    const d = await api('/api/login', { method: 'POST', body: { ticket: l2.ticket, codigo: $('#l2-codigo').value.trim() } });
    if (d.codigosRecuperacion) {
      // Recién activada: primero que guarde los códigos de recuperación.
      $('#l2-alta').hidden = true;
      $('#l2-codigo').hidden = true;
      $('#l2-texto').textContent = 'Verificación activada ✓';
      $('#l2-recup').innerHTML = codigosRecuperacionHtml(d.codigosRecuperacion);
      $('#l2-recup').hidden = false;
      $('#l2-btn').textContent = 'Ya los he guardado → Entrar';
      l2.listo = true;
      return;
    }
    if (d.recuperacionQuedan != null) alert(`Has entrado con un código de recuperación. Te quedan ${d.recuperacionQuedan}. Si has perdido el móvil, en Mi cuenta puedes volver a activar la verificación con otro.`);
    salirSegundoPaso();
    await start();
  } catch (ex) {
    if (/caducado/.test(ex.message)) salirSegundoPaso();
    const box = $('#login-2fa').hidden ? $('#login-error') : err;
    box.textContent = ex.message;
    box.hidden = false;
  }
});

$('#btn-logout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  await borrarCopias(); // la copia de los leads del navegador no se queda tras cerrar sesión
  state.leads = [];
  state.tareas = null;
  showLogin();
});

// ---------- Arranque ----------
// Roles y permisos: vienen de /api/me (configurables en Equipo → Roles y permisos).
const roleLabel = (id) => (id === 'admin' ? 'Admin' : state.roles.find((r) => r.id === id)?.label || id);
const ROLE_LABEL = new Proxy({}, { get: (_, id) => roleLabel(String(id)) });
const rolesUI = () => ['admin', ...state.roles.map((r) => r.id)];
const tiene = (p) => state.role === 'admin' || [].concat(p).some((x) => state.permisos.includes(x));
const puedeConfig = () => tiene('config');
const puedeTareas = () => tiene('tareas_gestion');
const tieneDatos = () => tiene(PERMISOS_DATOS);
// Pestañas que ve cada rol (el servidor también impide al equipo leer leads y métricas).
// Pestañas: Tareas y Calendario para todos; el resto según los permisos del rol.
// Cada embudo tiene sus pestañas (Llamadas y Tareas están en los dos). Las de la VSL usan los permisos equivalentes.
// En qué embudos sale cada vista: 'lanz' (por defecto), 'vsl', 'meteorico', 'ambos' (lanzamientos y VSL) o 'todos'.
const VIEW_EMBUDO = { vmetricas: 'vsl', vleads: 'vsl', vanuncios: 'vsl', llamadas: 'ambos', tareas: 'todos', calendario: 'todos', comparar: 'ambos', rendimiento: 'ambos', meteoricos: 'meteorico', moferta: 'meteorico' };
const VIEW_PERMISO = { vmetricas: 'metricas', vleads: 'leads', vanuncios: 'avatar', meteoricos: 'metricas', moferta: 'metricas' };
const tiposVista = (v) => ({ ambos: ['lanz', 'vsl'], todos: ['lanz', 'vsl', 'meteorico'] }[VIEW_EMBUDO[v]] || [VIEW_EMBUDO[v] || 'lanz']);
// Embudos del cliente (menú lateral): { id, tipo: 'lanzamientos' | 'vsl', nombre }. state.embudo = id del activo.
const embudos = () => state.config?.embudos || [];
const embudoInfo = (id = state.embudo) => embudos().find((e) => e.id === id) || null;
const enVsl = () => embudoInfo()?.tipo === 'vsl';
const enMeteo = () => embudoInfo()?.tipo === 'meteorico';
const tipoActual = () => (enVsl() ? 'vsl' : enMeteo() ? 'meteorico' : 'lanz');
// Pestañas que el embudo tiene activadas (⚙️ del menú lateral; sin lista = todas).
const pestanasEmbudo = () => embudoInfo()?.pestanas || null;
const allowedViews = () => VIEWS.filter((v) => tiposVista(v).includes(tipoActual())
  // El calendario es el del cliente (todos sus embudos): está en todos.
  && (!pestanasEmbudo() || pestanasEmbudo().includes(v) || v === 'calendario'
    // «Oferta» es nueva: los embudos de meteóricos con pestañas elegidas antes la ven junto a «Meteóricos».
    || (v === 'moferta' && pestanasEmbudo().includes('meteoricos')))
  && (v === 'tareas' || v === 'calendario' || tiene(VIEW_PERMISO[v] || v)));
// Código del embudo activo para tareas y llamadas: el lanzamiento elegido o el id de la VSL.
const codigo = () => (enVsl() ? state.embudo : enMeteo() ? state.meteo.code : state.launchCode);
const vslCfg = (id = state.embudo) => ({ ...(state.config?.vsls?.[id] || {}), name: state.config?.vsls?.[id]?.name || 'VSL', id, esVsl: true });
const embudoActual = () => (enVsl() ? vslCfg() : state.config?.launches[state.launchCode]);
// Embudo de lanzamientos al que pertenece un lanzamiento.
const embudoDeLanz = (l) => l?.embudo || embudos().find((e) => e.tipo === 'lanzamientos')?.id || 'lanz';

async function start() {
  const me = await api('/api/me');
  state.clientes = me.clientes || [];
  state.superadmin = Boolean(me.superadmin);
  if (!me.role) {
    // Sin acceso a este cliente: a su primer cliente (o, si no tiene ninguno, a la pantalla de acceso).
    const otro = state.clientes.find((c) => c.id !== me.cliente?.id);
    if (otro) { cambiarCliente(otro.id); return; }
    showLogin();
    throw new Error('Tu usuario no tiene acceso a ningún cliente: habla con el superadmin');
  }
  state.cliente = me.cliente.id;
  ls.set('lsd_cliente', me.cliente.id);
  const { role, config, zoomConfigured } = await api('/api/config');
  state.role = role;
  state.user = me.user || null;
  state.permisos = me.permisos || [];
  state.roles = me.roles || [];
  state.config = config;
  state.zoomConfigured = zoomConfigured;
  aplicarProducto();
  document.body.classList.toggle('is-admin', role === 'admin');
  document.body.classList.toggle('can-config', puedeConfig());
  document.body.classList.toggle('can-zoom', tiene('zoom'));
  document.body.classList.toggle('can-tareas', puedeTareas());
  document.body.classList.toggle('is-equipo', role === 'equipo');
  document.body.classList.toggle('is-superadmin', state.superadmin);
  pintarCliente(me.cliente);
  // El cliente (solo lectura) ve únicamente su portal de resultados.
  if (role === ROL_CLIENTE) { pintarFotoCuenta(); await mostrarPortal(); return; }
  $('#portal').hidden = true;
  $('#role-badge').textContent = state.user ? `${state.user.nombre.split(' ')[0]} · ${ROLE_LABEL[role]}` : ROLE_LABEL[role] || role;
  $('#btn-cuenta').hidden = !state.user;
  pintarFotoCuenta();
  pintarAviso2fa();
  pintarPlantillas();
  $('#login').hidden = true;
  $('#app').hidden = false;
  fillRolSelects();
  const hash = window.location.hash.slice(1);
  const primero = (tipo) => embudos().find((e) => e.tipo === tipo)?.id;
  const guardado = ls.get('lsd_embudo');
  if (embudoInfo(hash)) state.embudo = hash;
  else if (VIEW_EMBUDO[hash] === 'vsl' && primero('vsl')) state.embudo = embudoInfo(guardado)?.tipo === 'vsl' ? guardado : primero('vsl');
  else if (VIEW_EMBUDO[hash] === 'meteorico' && primero('meteorico')) state.embudo = embudoInfo(guardado)?.tipo === 'meteorico' ? guardado : primero('meteorico');
  else if (VIEWS.includes(hash) && VIEW_EMBUDO[hash] !== 'ambos' && primero('lanzamientos')) state.embudo = embudoInfo(guardado)?.tipo === 'lanzamientos' ? guardado : primero('lanzamientos');
  else state.embudo = embudoInfo(guardado) ? guardado : embudos()[0]?.id || '';
  fillStaticSelects();
  renderLaunchSelect();
  if (puedeConfig()) api('/api/tags').then((d) => { state.tags = d.tags; fillTagList(); }).catch((e) => notice(e.message, true));
  state.launchCode = pickInitialLaunch();
  const abrirInicio = ls.get('lsd_inicio') === '1' && !hash;
  if (hash) ls.set('lsd_inicio', ''); // un enlace directo a una pestaña: lo último ya no es el Inicio
  await setEmbudo(state.embudo, { vista: VIEWS.includes(hash) ? hash : null });
  if (abrirInicio && tiene('metricas') && embudos().length) mostrarInicio();
  if (!$('#view-comparar').hidden) { renderCompareSelector(); renderComparativas(); }
  if (!$('#view-rendimiento').hidden) loadRendimiento();
}

function launchesSorted() {
  return Object.entries(state.config.launches)
    .filter(([, l]) => enVsl() || embudoDeLanz(l) === state.embudo)
    .sort((a, b) => String(b[1].createdAt).localeCompare(String(a[1].createdAt)));
}

function pickInitialLaunch() {
  const saved = ls.get('lsd_launch');
  if (saved && state.config.launches[saved] && embudoDeLanz(state.config.launches[saved]) === state.embudo) return saved;
  return launchesSorted()[0]?.[0] || null;
}

function renderLaunchSelect() {
  const sel = $('#launch-select');
  sel.innerHTML = launchesSorted().map(([code, l]) => `<option value="${esc(code)}">${esc(l.name)} (${esc(code)})</option>`).join('');
  if (state.launchCode) sel.value = state.launchCode;
}

function fillStaticSelects() {
  $('#f-estado').innerHTML = '<option value="">Todos los estados</option>'
    + ESTADOS.map((e) => `<option value="${e.id}">${e.label}</option>`).join('');
  $('#f-step').innerHTML = '<option value="">Todos los mensajes</option>'
    + Object.entries(NEXT_STEPS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
}

$('#launch-select').addEventListener('change', (e) => selectLaunch(e.target.value));
$('#btn-reload').addEventListener('click', () => {
  if (state.enInicio) return mostrarInicio({ fresh: true });
  if (enVsl()) return recargarVsl();
  if (enMeteo()) { renderMeteoView({ fresh: true }); if (codigo()) loadTareas(); return; }
  return selectLaunch(state.launchCode);
});

// ---------- Clientes (desplegable de arriba) ----------
function pintarCliente(c) {
  $('#brand-nombre').textContent = state.clientes.length > 1 ? 'Dashboard' : `Dashboard ${c.nombre}`;
  document.title = `Dashboard · ${c.nombre}`;
  const pick = $('#cliente-pick');
  pick.hidden = state.clientes.length < 2;
  $('#cliente-select').innerHTML = state.clientes.map((x) => `<option value="${esc(x.id)}" ${x.id === c.id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('');
  if (c.color) document.documentElement.style.setProperty('--cliente', c.color); else document.documentElement.style.removeProperty('--cliente');
}
$('#cliente-select').addEventListener('change', (e) => cambiarCliente(e.target.value));

// ---------- Embudos (menú lateral) ----------
function pintarSidebar() {
  $('#sb-items').innerHTML = embudos().map((e) => {
    const tv = e.tipo === 'vsl' ? textosVsl(state.config.vsls[e.id]) : null;
    const nMeteo = e.tipo === 'meteorico' ? Object.values(state.config.meteoricos || {}).filter((m) => m.embudo === e.id).length : 0;
    const sub = e.tipo === 'meteorico' ? `${nMeteo} meteórico${nMeteo === 1 ? '' : 's'}` : tv ? `${tv.corto} · siempre abierto`
      : (() => { const n = Object.values(state.config.launches).filter((l) => embudoDeLanz(l) === e.id).length; return `${n} lanzamiento${n === 1 ? '' : 's'}`; })();
    return `<div class="sb-row"><button type="button" class="sb-item ${e.id === state.embudo ? 'active' : ''}" data-embudo="${esc(e.id)}"><span class="sb-ico" aria-hidden="true">${e.tipo === 'meteorico' ? '⚡' : tv ? tv.ico : esReto(e.formato) ? '🏁' : '🚀'}</span><span class="sb-txt"><strong>${esc(e.nombre)}</strong><small>${esc(sub)}</small></span></button>${puedeConfig() ? `<button type="button" class="sb-edit" data-emb-edit="${esc(e.id)}" title="Pestañas, nombre y guía de «${esc(e.nombre)}»" aria-label="Ajustes del embudo">⚙️</button>` : ''}</div>`;
  }).join('');
  // «Inicio» (todos los embudos): para quien ve las métricas y si hay embudos.
  $('#sb-inicio').hidden = !tiene('metricas') || !embudos().length;
  $('#sb-inicio').classList.toggle('active', Boolean(state.enInicio));
  if (state.enInicio) $$('#sb-items .sb-item.active').forEach((b) => b.classList.remove('active'));
}

async function setEmbudo(e, { vista = null } = {}) {
  salirInicio();
  state.embudo = embudoInfo(e) ? e : embudos()[0]?.id || '';
  ls.set('lsd_embudo', state.embudo);
  $('#alertas-carrito').hidden = true;
  if (state.hist?.datos) { state.hist.datos = null; $('#hist-anuncios').innerHTML = '<p class="muted small">Pulsa «Cargar todos los lanzamientos» para ver los anuncios de este embudo.</p>'; $('#btn-hist-anuncios').textContent = 'Cargar todos los lanzamientos'; }
  document.body.classList.toggle('embudo-vsl', enVsl());
  document.body.classList.toggle('embudo-meteo', enMeteo());
  pintarSidebar();
  renderSnapshotWarning();
  // Cliente sin embudos todavía.
  const sin = !embudos().length;
  $('#sin-embudos').hidden = !sin;
  if (sin) { $('#dashboard').hidden = true; $('#empty-state').hidden = true; return; }
  // Cada embudo de lanzamientos enseña solo sus lanzamientos.
  if (!enVsl() && !enMeteo()) {
    renderLaunchSelect();
    if (!state.config.launches[state.launchCode] || embudoDeLanz(state.config.launches[state.launchCode]) !== state.embudo) state.launchCode = pickInitialLaunch();
  }
  if (enVsl() && state.vsl.code !== state.embudo) Object.assign(state.vsl, { code: state.embudo, leads: null, raw: null, meta: null });
  $$('.view-tab').forEach((t) => { t.hidden = t.dataset.viewGrupo ? !GRUPOS[t.dataset.viewGrupo].some((v) => allowedViews().includes(v)) : !allowedViews().includes(t.dataset.view); });
  $$('.subview-tab[data-view]').forEach((t) => { t.hidden = !allowedViews().includes(t.dataset.view); });
  const guardada = ls.get(`lsd_view_${state.embudo}`) || (enVsl() ? '' : ls.get('lsd_view'));
  const quiero = [vista, guardada].find((v) => v && allowedViews().includes(v));
  if (enMeteo()) pickMeteo();
  const porDefecto = enVsl() ? ['vmetricas', 'vleads', 'llamadas', 'tareas'] : enMeteo() ? ['meteoricos'] : ['leads', 'hoy', 'tareas'];
  showView(quiero || porDefecto.find((v) => allowedViews().includes(v)) || allowedViews()[0]);
  if (enVsl()) {
    $('#empty-state').hidden = true;
    $('#dashboard').hidden = false;
    notice('');
    await recargarVsl();
  } else if (enMeteo()) {
    $('#empty-state').hidden = true;
    $('#dashboard').hidden = false;
    notice('');
    renderMeteoView();
  } else {
    await selectLaunch(state.launchCode);
  }
}
// «Cambiar fecha» de un hito del calendario: si es de otro embudo, primero se va a él (para que al
// guardar no quede elegido un lanzamiento o meteórico que no es del embudo abierto).
async function cambiarFechaHito(code) {
  const m = state.config.meteoricos?.[code];
  const l = state.config.launches[code];
  const embudo = m ? m.embudo || (m.lanzamiento && embudoDeLanz(state.config.launches[m.lanzamiento] || {})) : l ? embudoDeLanz(l) : null;
  const esDeAqui = m ? (m.embudo ? m.embudo === state.embudo && state.meteo.code === code : embudo === state.embudo) : embudo === state.embudo;
  if (!esDeAqui && embudo) {
    await irAEmbudoDe(m && !m.embudo ? m.lanzamiento : code);
  }
  return m ? abrirMeteoDialog(code) : openConfig(code);
}

// Abre el embudo de un código (lanzamiento, VSL o meteórico) en su pestaña de tareas.
function irAEmbudoDe(code) {
  salirInicio();
  const l = state.config.launches[code];
  const m = state.config.meteoricos?.[code];
  if (state.config.vsls?.[code]) return setEmbudo(code, { vista: 'tareas' });
  if (m?.embudo) {
    state.meteo.code = code;
    ls.set(`lsd_meteo_${m.embudo}`, code);
    return setEmbudo(m.embudo, { vista: 'tareas' });
  }
  const lanz = l ? code : m?.lanzamiento;
  if (!lanz || !state.config.launches[lanz]) return;
  state.launchCode = lanz;
  const emb = embudoDeLanz(state.config.launches[lanz]);
  const vista = m ? 'metricas' : 'tareas';
  if (emb !== state.embudo) return setEmbudo(emb, { vista });
  if (allowedViews().includes(vista)) showView(vista);
  return selectLaunch(lanz);
}
$('#sidebar').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-embudo]');
  if (b && (b.dataset.embudo !== state.embudo || state.enInicio)) setEmbudo(b.dataset.embudo);
});

// ---------- Inicio: todos los embudos del cliente de un vistazo ----------
function salirInicio() {
  if (!state.enInicio) return;
  state.enInicio = false;
  ls.set('lsd_inicio', '');
  document.body.classList.remove('en-inicio');
  $('#sb-inicio').classList.remove('active');
}
async function mostrarInicio({ fresh = false } = {}) {
  state.enInicio = true;
  ls.set('lsd_inicio', '1');
  document.body.classList.add('en-inicio');
  pintarSidebar();
  $('#alertas-carrito').hidden = true;
  const token = (state.inicioToken = (state.inicioToken || 0) + 1);
  const q = (qs) => api(`/api/inicio?${qs}${fresh ? '&fresh=1' : ''}`);
  if (fresh || !state.inicio || state.inicio.cliente !== state.cliente) {
    state.inicio = { cliente: state.cliente, embudos: null, meteoricos: null, agenda: null };
    $('#inicio-embudos').innerHTML = '<p class="muted">Cargando…</p>';
    $('#inicio-total').innerHTML = '';
  }
  let lista;
  try { lista = await q('parte=lista'); } catch (e) { $('#inicio-embudos').innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  if (token !== state.inicioToken) return;
  // Cada embudo y cada meteórico en su propia petición (cada una con su límite de peticiones a GHL).
  state.inicio.embudos = lista.embudos.map((e) => ({ ...e, cargando: true }));
  state.inicio.meteoricos = lista.meteoricos.map((m) => ({ ...m, cargando: true }));
  pintarInicio();
  const tareas = [
    ...lista.embudos.map((e, i) => q(`parte=embudo&id=${encodeURIComponent(e.id)}`)
      .then((d) => { state.inicio.embudos[i] = d.embudo; }, (err) => { state.inicio.embudos[i] = { tipo: 'error', nombre: e.nombre, error: err.message }; })),
    ...lista.meteoricos.map((m, i) => q(`parte=meteorico&id=${encodeURIComponent(m.code)}`)
      .then((d) => { state.inicio.meteoricos[i] = d.meteorico; }, (err) => { state.inicio.meteoricos[i] = { code: m.code, nombre: m.nombre, error: err.message }; })),
    q('parte=agenda').then((d) => { state.inicio.agenda = d; }, (err) => { state.inicio.agenda = { error: err.message }; }),
  ].map((p) => p.then(() => { if (token === state.inicioToken) pintarInicio(); }));
  await Promise.all(tareas);
}
$('#sb-inicio').addEventListener('click', () => mostrarInicio());
$('#inicio-actualizar').addEventListener('click', () => mostrarInicio({ fresh: true }));

const ESTADO_LANZ = { captacion: ['Captación', 'info'], carrito: ['Carrito abierto', 'buy'], cerrado: ['Cerrado', 'muted'] };
const FASE_METEO_TXT = { calentamiento: ['Calentamiento', 'info'], abierta: ['Oferta abierta', 'buy'], cerrada: ['Cerrada', 'muted'] };
function pintarInicio() {
  if (!state.enInicio || !state.inicio) return;
  const { agenda: A } = state.inicio;
  const lista = (state.inicio.embudos || []).filter((e) => e.tipo !== 'vacio');
  const metas = state.inicio.meteoricos || [];
  const listos = lista.every((e) => !e.cargando) && metas.every((m) => !m.cargando);
  const sum = (k) => lista.reduce((t, e) => t + (e.kpis?.[k] || 0), 0) + metas.reduce((t, m) => t + (m[k] || 0), 0);
  const fact = sum('facturacion');
  const inv = sum('inversion');
  $('#inicio-sub').textContent = listos ? 'Todos los embudos de un vistazo · los datos se actualizan cada 15 min' : 'Cargando los embudos…';
  $('#inicio-total').innerHTML = [
    card('Facturación total', eur(fact), 'último lanzamiento de cada embudo · VSL (30 días) · meteóricos recientes', 'coins', 'money'),
    card('Ventas', sum('ventas').toLocaleString('es-ES'), `${lista.length} embudo${lista.length === 1 ? '' : 's'}${metas.length ? ` y ${metas.length} meteórico${metas.length === 1 ? '' : 's'}` : ''}`, 'cart', 'buy'),
    card('Inversión', inv ? eur(inv) : '–', inv ? `ROAS conjunto ${(fact / inv).toFixed(2).replace('.', ',')}x` : 'sin inversión registrada', 'megaphone', 'accent'),
  ].join('');
  const cifra = (label, v) => `<span>${label}<strong>${v}</strong></span>`;
  const obj = (o) => (o?.length ? `<div class="muted small">🎯 ${o.map((x) => `${esc(x.label)}: ${Math.round((x.pct || 0) * 100)}%`).join(' · ')}</div>` : '');
  const tarjetas = [
    ...lista.map((e) => {
      if (e.cargando) return `<div class="card inicio-emb"><h3>${e.tipo === 'vsl' ? '🎬' : '🚀'} ${esc(e.nombre)}</h3><p class="muted small">Cargando…</p></div>`;
      if (e.tipo === 'error') return `<div class="card inicio-emb"><h3>${esc(e.nombre)}</h3><p class="error small">${esc(e.error)}</p></div>`;
      const est = e.tipo === 'vsl' ? ['Últimos 30 días', 'info'] : ESTADO_LANZ[e.estado] || ['', 'muted'];
      return `<button type="button" class="card inicio-emb" data-ir-inicio="${e.tipo === 'vsl' ? 'vsl' : 'lanz'}" data-code="${esc(e.code)}" data-embudo="${esc(e.embudoId || '')}">
        <h3>${e.tipo === 'vsl' ? '🎬' : '🚀'} ${esc(e.nombre)} <span class="badge tone-${est[1]}">${est[0]}</span></h3>
        ${e.embudo ? `<span class="muted small">${esc(e.embudo)}</span>` : ''}
        <div class="ie-cifras">${cifra('Ventas', e.kpis.ventas)}${cifra('Facturación', eur(e.kpis.facturacion || 0))}${cifra('ROAS', e.kpis.roas != null ? `${e.kpis.roas.toFixed(2).replace('.', ',')}x` : '–')}</div>${obj(e.objetivos)}</button>`;
    }),
    ...metas.map((m) => {
      if (m.cargando) return `<div class="card inicio-emb"><h3>⚡ ${esc(m.nombre)}</h3><p class="muted small">Cargando…</p></div>`;
      if (m.error) return `<div class="card inicio-emb"><h3>⚡ ${esc(m.nombre)}</h3><p class="error small">${esc(m.error)}</p></div>`;
      const f = FASE_METEO_TXT[m.fase] || ['', 'muted'];
      return `<button type="button" class="card inicio-emb" data-ir-inicio="meteo" data-code="${esc(m.code)}">
        <h3>⚡ ${esc(m.nombre)} <span class="badge tone-${f[1]}">${f[0]}</span></h3>
        ${m.lanzamiento ? `<span class="muted small">Downsell de ${esc(state.config.launches[m.lanzamiento]?.name || m.lanzamiento)}</span>` : ''}
        <div class="ie-cifras">${cifra('Ventas', m.ventas)}${cifra('Facturación', eur(m.facturacion || 0))}${cifra('ROAS', m.roas != null ? `${m.roas.toFixed(2).replace('.', ',')}x` : '–')}</div>${obj(m.objetivos)}</button>`;
    }),
  ];
  $('#inicio-embudos').innerHTML = tarjetas.join('') || '<p class="muted">Aún no hay lanzamientos empezados, VSL ni meteóricos recientes.</p>';
  // Avisos del carrito de los lanzamientos con el carrito abierto (con sus ventas).
  const alertas = lista.filter((e) => e.tipo === 'lanzamiento' && e.estado === 'carrito')
    .flatMap((e) => alertasCarrito(state.config.launches[e.code], e.kpis.ventas).map((a) => ({ ...a, nombre: e.nombre })));
  $('#inicio-alertas').innerHTML = alertas.length ? `<div class="notice err alertas-carrito"><span><strong>🚨 Carrito abierto</strong><ul>${alertas.map((a) => `<li><strong>${esc(a.nombre)}:</strong> ${esc(a.texto)}</li>`).join('')}</ul></span></div>` : '';
  if (!A) return;
  const dia = (d) => esc(dayFmt.format(new Date(`${d}T12:00:00Z`)));
  $('#inicio-hitos').innerHTML = A.error ? `<p class="error">${esc(A.error)}</p>` : A.hitos?.length
    ? `<ul class="inicio-lista">${A.hitos.map((h) => `<li><button type="button" data-ir-code="${esc(h.code)}">${esc(h.icon)} ${esc(h.titulo)} · <strong>${esc(h.nombre)}</strong></button><span class="muted small">${dia(h.dia)}${h.hora ? ` ${esc(h.hora)}` : ''}</span></li>`).join('')}</ul>`
    : '<p class="muted">Nada en los próximos 14 días.</p>';
  $('#inicio-vencidas').innerHTML = A.error ? `<p class="error">${esc(A.error)}</p>` : A.vencidas?.total
    ? `<ul class="inicio-lista">${A.vencidas.lista.map((t) => `<li><button type="button" data-ir-code="${esc(t.code)}">${esc(t.titulo)} · <strong>${esc(t.nombre)}</strong></button><span class="muted small">${dia(t.fecha)}</span></li>`).join('')}</ul>${A.vencidas.total > A.vencidas.lista.length ? `<p class="muted small">…y ${A.vencidas.total - A.vencidas.lista.length} más.</p>` : ''}`
    : '<p class="muted">Ninguna 🎉</p>';
}
// Desde el inicio, a cada embudo (sus métricas) o a las tareas de un código.
$('#inicio').addEventListener('click', (e) => {
  const ir = e.target.closest('[data-ir-inicio]');
  if (ir) {
    const { code } = ir.dataset;
    if (ir.dataset.irInicio === 'vsl') return setEmbudo(code, { vista: 'vmetricas' });
    if (ir.dataset.irInicio === 'lanz') { state.launchCode = code; return setEmbudo(ir.dataset.embudo || embudoDeLanz(state.config.launches[code]), { vista: 'metricas' }); }
    const m = state.config.meteoricos?.[code];
    if (!m) return;
    if (m.embudo) { state.meteo.code = code; ls.set(`lsd_meteo_${m.embudo}`, code); return setEmbudo(m.embudo, { vista: 'meteoricos' }); }
    if (m.lanzamiento && state.config.launches[m.lanzamiento]) {
      state.launchCode = m.lanzamiento;
      return setEmbudo(embudoDeLanz(state.config.launches[m.lanzamiento]), { vista: 'metricas' }).then(() => pintarMsub($('#msub-metricas'), 'meteorico'));
    }
    return;
  }
  const t = e.target.closest('[data-ir-code]');
  if (t) irAEmbudoDe(t.dataset.irCode);
});

async function selectLaunch(code) {
  state.launchCode = code;
  if (enVsl() || enMeteo()) return; // se cargará al volver a Lanzamientos
  notice('');
  const hasLaunch = Boolean(code && state.config.launches[code]);
  $('#empty-state').hidden = hasLaunch;
  $('#dashboard').hidden = !hasLaunch;
  $('#btn-zoom').disabled = !hasLaunch;
  if (!hasLaunch) return;
  ls.set('lsd_launch', code);
  $('#launch-select').value = code;
  loadTareas();
  loadEventos();
  if (tiene('llamadas')) loadLlamadas();
  if (tieneDatos()) await loadLeads();
}

// ---------- Carga de leads (paginada contra GHL) ----------
async function loadLeads() {
  if (state.compare) delete state.compare.cache[state.launchCode];
  state.allAvatarLeads = null; // se vuelven a cargar con los datos nuevos
  const launch = state.config.launches[state.launchCode];
  const token = ++state.loadToken;
  const out = [];
  let cursor = null;
  let total = null;
  $('#btn-reload').disabled = true;
  // Copia de la última vez (navegador): se enseña al momento mientras se descargan los de ahora.
  const clave = `${state.cliente || ''}:${launch.registroTag}`;
  const copia = await leerLeads(clave);
  if (token !== state.loadToken) return;
  const hace = copia ? Math.max(1, Math.round((Date.now() - copia.at) / 60_000)) : 0;
  const haceTxt = hace < 60 ? `${hace} min` : `${Math.round(hace / 60)} h`;
  state.meta = null; // la inversión de Meta es la de este lanzamiento (se vuelve a pedir al terminar)
  if (copia?.contacts.length) {
    state.leads = copia.contacts.map((c) => enrich(c));
    state.leadsDe = state.launchCode;
    state.page = 0;
    render();
  } else if (state.leadsDe !== state.launchCode) {
    state.leads = []; // sin copia: no se quedan a la vista los de otro lanzamiento
    state.leadsDe = state.launchCode;
    state.page = 0;
    render();
  }
  try {
    do {
      const qs = new URLSearchParams({ tag: launch.registroTag });
      if (cursor) qs.set('cursor', JSON.stringify(cursor));
      const page = await api(`/api/leads?${qs}`);
      if (token !== state.loadToken) return; // se cambió de lanzamiento mientras cargaba
      out.push(...page.contacts);
      total = page.total ?? total;
      cursor = page.cursor;
      progress(out.length, total, copia?.contacts.length ? `Actualizando… ${out.length}${total ? ` de ${total}` : ''} (ves los datos de hace ${haceTxt})` : `Cargando leads… ${out.length}${total ? ` de ${total}` : ''}`);
    } while (cursor);
    guardarLeads(clave, out);
    state.leads = out.map((c) => enrich(c));
    state.leadsDe = state.launchCode; // para el auditor: los leads cargados son de este lanzamiento
    state.page = 0;
    render();
    loadMeta(token);
    cargarVotos();
    if (!out.length) notice(`No hay contactos con la etiqueta "${launch.registroTag}".`);
  } catch (e) {
    notice(copia?.contacts.length ? `No se pudieron actualizar los leads (${e.message}): ves los de hace ${haceTxt}.` : `No se pudieron cargar los leads: ${e.message}`, true);
  } finally {
    if (token === state.loadToken) {
      progress(null);
      $('#btn-reload').disabled = false;
    }
  }
}

// Inversión y nombres de anuncios de Meta (si está conectado). No bloquea la carga de leads.
async function loadMeta(token) {
  state.meta = null;
  try {
    const meta = await api(`/api/meta?launch=${encodeURIComponent(state.launchCode)}`);
    if (token !== state.loadToken) return;
    state.meta = meta.configured ? meta : null;
  } catch (e) {
    if (token !== state.loadToken) return;
    state.meta = { configured: true, error: e.message };
  }
  render();
}

function enrich(contact) {
  return enrichLead(contact, state.launchCode, state.config);
}

// ---------- Filtros y orden ----------
function filtered() {
  const f = state.filters;
  const q = f.search.trim().toLowerCase();
  let rows = state.leads.filter((l) => {
    if (q && !l.search.includes(q)) return false;
    if (f.estado && l.estado.id !== f.estado) return false;
    if (f.avatar && !(l.avatar >= 0)) return false;
    if (f.step && l.step !== f.step) return false;
    if (f.pending && l.s.wa_enviado) return false;
    if (f.llamada && state.llFases.get(l.id)?.fase !== f.llamada) return false;
    if (f.signal === 'sin_actividad') return l.score === 0 && !l.s.directo_click;
    if (f.signal === 'no_compra') return !l.s.compra;
    if (f.signal === 'sin_encuesta') return !l.s.encuesta;
    if (f.signal.startsWith('res_')) return l.outcome === f.signal.slice(4);
    if (f.signal === 'sin_resultado') return l.s.wa_enviado && !l.outcome;
    if (f.signal === 'vip_no_compra') return l.s.vip && !l.s.compra;
    if (f.signal === 'trafico_frio') return l.s.trafico === 'frio';
    if (f.signal === 'trafico_templado') return l.s.trafico === 'templado';
    if (f.signal === 'sin_clases') return !watched(l.s, 'clase1') && !watched(l.s, 'clase2');
    if (f.signal === 'replay_50') return grabVenta(l.s) >= 50;
    if (f.signal && !l.s[f.signal]) return false;
    return true;
  });
  const { key, dir } = state.sort;
  const mult = dir === 'asc' ? 1 : -1;
  rows = rows.sort((a, b) => {
    if (key === 'name') return mult * a.name.localeCompare(b.name, 'es');
    return mult * (a.score - b.score) || a.name.localeCompare(b.name, 'es');
  });
  return rows;
}

$('#f-search').addEventListener('input', (e) => { state.filters.search = e.target.value; state.page = 0; render(); });
$('#f-estado').addEventListener('change', (e) => { state.filters.estado = e.target.value; state.page = 0; render(); });
$('#f-step').addEventListener('change', (e) => { state.filters.step = e.target.value; state.page = 0; render(); });
$('#f-signal').addEventListener('change', (e) => { state.filters.signal = e.target.value; state.page = 0; render(); });
$('#f-pending').addEventListener('change', (e) => { state.filters.pending = e.target.checked; state.page = 0; render(); });
$('#f-avatar').addEventListener('change', (e) => { state.filters.avatar = e.target.checked; state.page = 0; render(); });
$('#page-prev').addEventListener('click', () => { state.page--; render(); window.scrollTo({ top: 0 }); });
$('#page-next').addEventListener('click', () => { state.page++; render(); window.scrollTo({ top: 0 }); });
$$('.leads th[data-sort]').forEach((th) => th.addEventListener('click', () => {
  const key = th.dataset.sort;
  state.sort = state.sort.key === key
    ? { key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: key === 'name' ? 'asc' : 'desc' };
  render();
}));

// ---------- Render ----------
// Cabecera de la tabla de leads: con varios vídeos, una columna «Vídeos del lanzamiento».
function pintarCabeceraVideos() {
  const launch = state.config?.launches?.[state.launchCode];
  const vs = videosDe(launch);
  const multi = vs.length > 1;
  $('#th-directo').textContent = multi ? `Vídeos (${vs.map(nombreCorto).join(', ')})` : 'Directo';
  $('#th-directo').colSpan = multi ? 2 : 1;
  $('#th-grabacion').hidden = multi;
  // Encuesta: solo si el lanzamiento tiene etiqueta de encuesta.
  $('#th-encuesta').hidden = !launch?.encuestaTag;
  // Prelanzamiento: columnas de las clases que haya y de la VIP (si la hay).
  const nc = nClases(launch);
  $('#th-c2').hidden = nc < 2;
  $('#th-c3').hidden = nc < 3;
  $('#th-vip').hidden = !conVip(launch);
}

function render() {
  pintarCabeceraVideos();
  actualizarAuditor();
  computeAvatares();
  renderKpis();
  renderHoy();
  renderMetrics();
  renderSnapshotWarning();
  if (state.llamadas?.data && state.llamadas.code === state.launchCode) renderLlamadas(); // con los datos del lead
  const rows = filtered();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.page = Math.min(Math.max(0, state.page), pages - 1);
  const slice = rows.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);
  $('#leads-body').innerHTML = slice.map(rowHtml).join('')
    || '<tr><td colspan="13" class="muted">No hay leads con estos filtros.</td></tr>';
  $('#page-info').textContent = rows.length
    ? `${state.page * PAGE_SIZE + 1}–${state.page * PAGE_SIZE + slice.length} de ${rows.length} leads`
    : '0 leads';
  $('#page-prev').disabled = state.page === 0;
  $('#page-next').disabled = state.page >= pages - 1;
  $$('.leads th[data-sort]').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.sort === state.sort.key);
    th.classList.toggle('asc', state.sort.dir === 'asc');
  });
  if (!$('#view-leads').hidden && !$('#enc-leads').parentElement.hidden) renderEncuestaLeads();
}

// ---------- Leads → Encuesta: % de cada respuesta y respuestas de texto libre ----------
const encLibreVer = new Map(); // pregunta → cuántas respuestas libres se enseñan
function renderEncuestaLeads() {
  const box = $('#enc-leads');
  const preguntas = preguntasEncuesta();
  const launch = state.config.launches[state.launchCode];
  if (!preguntas.length) { box.innerHTML = '<div class="card"><p class="muted">Este cliente no tiene preguntas de encuesta. Se configuran en <strong>Equipo → Marca</strong> (los campos de GHL de cada pregunta).</p></div>'; return; }
  const r = resumenEncuesta(state.leads, preguntas);
  const cab = `<div class="card enc-cab"><strong>${r.respondieron}</strong> de ${r.total} leads han respondido la encuesta (<strong>${pctOf(r.respondieron, r.total)}</strong>)${launch?.encuestaTag ? ` · con la etiqueta «${esc(launch.encuestaTag)}»: ${state.leads.filter((l) => l.s.encuesta).length}` : ''}.
    <span class="muted">Los % de cada pregunta son sobre quienes la contestaron; en las de varias respuestas pueden sumar más de 100%.</span></div>`;
  if (!r.respondieron) { box.innerHTML = `${cab}<div class="card"><p class="muted">Todavía no hay respuestas de la encuesta en este lanzamiento.</p></div>`; return; }
  const barras = (q) => `<div class="enc-opciones">${q.opciones.map((o) => `<div class="enc-op">
      <span class="enc-op-lbl">${esc(o.respuesta)}</span>
      <div class="enc-op-bar"><span style="width:${Math.max(1.5, o.pct * 100)}%"></span></div>
      <span class="enc-op-n"><strong>${Math.round(o.pct * 1000) / 10}%</strong> <span class="muted">${o.n}${o.compras ? ` · ${o.compras} compr${o.compras === 1 ? 'ó' : 'aron'}` : ''}</span></span></div>`).join('')}</div>`;
  box.innerHTML = cab + r.preguntas.map((q, i) => {
    const ver = encLibreVer.get(q.p.id) || 30;
    const libres = q.libres.length ? `<details class="enc-libres"${q.opciones.length ? '' : ' open'}><summary>Todas las respuestas (${q.libres.length})</summary>
        <input type="search" class="enc-buscar" data-enc-buscar="${i}" placeholder="Buscar en las respuestas…">
        <ul class="enc-lista" data-enc-lista="${i}">${q.libres.slice(0, ver).map((x) => `<li><span>${esc(x.texto)}</span> <span class="muted small">— ${esc(x.nombre)}${x.compra ? ' · ✅ compró' : ''}</span></li>`).join('')}</ul>
        ${q.libres.length > ver ? `<button type="button" class="btn ghost" data-enc-mas="${esc(q.p.id)}">Ver ${Math.min(100, q.libres.length - ver)} más</button>` : ''}</details>` : '';
    return `<section class="card enc-preg">
      <h3>${esc(q.p.name || q.p.id)} <span class="muted small">· ${q.respondieron} respuestas (${pctOf(q.respondieron, r.total)} de los leads)</span></h3>
      ${q.opciones.length ? `${q.p.tipo === 'texto' ? '<p class="muted small">Respuestas que más se repiten:</p>' : ''}${barras(q)}` : ''}
      ${libres}
    </section>`;
  }).join('');
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-enc-mas]');
  if (!b) return;
  encLibreVer.set(b.dataset.encMas, (encLibreVer.get(b.dataset.encMas) || 30) + 100);
  renderEncuestaLeads();
});
document.addEventListener('input', (e) => {
  const inp = e.target.closest('[data-enc-buscar]');
  if (!inp) return;
  const q = inp.value.trim().toLowerCase();
  const lista = $(`[data-enc-lista="${inp.dataset.encBuscar}"]`);
  const preguntas = preguntasEncuesta();
  const p = resumenEncuesta(state.leads, preguntas).preguntas[Number(inp.dataset.encBuscar)];
  const items = q ? p.libres.filter((x) => `${x.texto} ${x.nombre}`.toLowerCase().includes(q)) : p.libres.slice(0, encLibreVer.get(p.p.id) || 30);
  lista.innerHTML = items.map((x) => `<li><span>${esc(x.texto)}</span> <span class="muted small">— ${esc(x.nombre)}${x.compra ? ' · ✅ compró' : ''}</span></li>`).join('') || '<li class="muted">Ninguna respuesta coincide.</li>';
});

function renderConsumo() {
  const L = state.leads;
  const launch = state.config.launches[state.launchCode] || {};
  const pct = (n) => (L.length ? Math.round((n / L.length) * 100) : 0);
  const celda = (n, title = '') => `<td><div class="meter" title="${title || `${n} leads (${pct(n)}%)`}"><span style="width:${pct(n)}%"></span></div>
      <span class="meter-num">${n}</span> <span class="muted">${pct(n)}%</span></td>`;
  // Vídeos grabados: clases del prelanzamiento y grabación de cada vídeo del lanzamiento.
  const vids = videosDe(launch);
  const grabados = [
    ...clasesDe(launch).map((c, i) => [c, `Clase ${i + 1}`]),
    ...vids.map((v) => [v.replay, vids.length > 1 ? `${v.nombre} (grabado)` : 'Grabación']),
  ];
  const rows = grabados.map(([v, label]) => `<tr><th scope="row">${esc(label)}</th>${THRESHOLDS.map((t) => celda(L.filter((l) => watched(l.s, v) >= t).length)).join('')}</tr>`).join('');
  // Directo: cada paso incluye a quien llegó más lejos (quien estuvo hasta el final también entró).
  const pasoDirecto = (l, d) => (l.s[`${d}_final`] ? 4 : l.s[`${d}_60`] ? 3 : l.s[`${d}_asistio`] ? 2 : l.s[`${d}_click`] ? 1 : 0);
  const directos = vids.filter((v) => esEnDirecto(v) || L.some((l) => pasoDirecto(l, v.directo)));
  const rowsDirecto = directos.map((v) => {
    const n = [1, 2, 3, 4].map((k) => L.filter((l) => pasoDirecto(l, v.directo) >= k).length);
    const ret = n[1] ? `${Math.round((n[3] / n[1]) * 100)}%` : '–';
    return `<tr><th scope="row">${esc(vids.length > 1 ? v.nombre : 'Directo')}</th>${n.map((x) => celda(x)).join('')}<td class="num"><strong>${ret}</strong><br><span class="muted small">de los que entraron siguen al final</span></td></tr>`;
  }).join('');
  $('#consumo').innerHTML = `
    <h2>Consumo de vídeos <span class="muted">· leads que han visto al menos…</span></h2>
    <div class="table-scroll"><table class="consumo">
      <thead><tr><th></th>${THRESHOLDS.map((t) => `<th>${t === 90 ? '90% (completo)' : `${t}%`}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <h3 class="cfg-h3">En directo <span class="muted">· sobre el total de registros (Zoom: sincroniza la asistencia con «Sincronizar Zoom»)</span></h3>
    ${rowsDirecto ? `<div class="table-scroll"><table class="consumo">
      <thead><tr><th></th><th>Pulsaron el enlace</th><th>Entraron</th><th>Más de 60 min</th><th>Hasta el final</th><th>Retención</th></tr></thead>
      <tbody>${rowsDirecto}</tbody>
    </table></div>` : '<p class="muted">Este lanzamiento no tiene vídeos en directo (sin Zoom configurado) o aún no hay datos del directo.</p>'}`;
}

// ---------- Métricas del embudo ----------
const pctOf = (n, d) => (d ? `${Math.round((n / d) * 1000) / 10}%` : '–');
const eur = (n) => (n == null || !Number.isFinite(n) ? '–' : n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: n >= 100 ? 0 : 2 }));
// Tarjeta de métrica: icono con su tono (accent, vip, buy, live, info, warn, money), etiqueta, valor y contexto.
const card = (label, value, sub, ico = 'sparkle', tone = 'accent') => `<div class="kpi static tone-${tone}"><span class="kpi-label"><span class="kpi-ico">${icon(ico)}</span>${label}</span><span class="kpi-value">${value}</span><span class="kpi-sub">${sub}</span></div>`;

function currentMetrics() {
  const launch = state.config.launches[state.launchCode];
  return computeMetrics(state.leads, launch, { metaSpend: state.meta?.configured && !state.meta.error ? state.meta.total : null });
}

// Retrospectiva al cerrar el carrito: frente al lanzamiento anterior del embudo y con los bonus; sus
// aprendizajes se pueden pasar como tareas al siguiente lanzamiento.
const lanzDelEmbudo = (launch) => launchesSorted().filter(([, l]) => embudoDeLanz(l) === embudoDeLanz(launch) && l.inicioCaptacion).sort((a, b) => a[1].inicioCaptacion.localeCompare(b[1].inicioCaptacion));
async function renderRetrospectiva(m, launch) {
  const box = $('#retro-l');
  const code = state.launchCode;
  const cierre = String(launch.cierreCarrito || '').slice(0, 10);
  if (!cierre || cierre >= today()) { box.innerHTML = `<p class="muted">Aparecerá al cerrar el carrito${cierre ? ` (el ${esc(dayFmt.format(new Date(`${cierre}T12:00:00Z`)))})` : ''}: cómo fue frente al lanzamiento anterior y qué cambiar en el siguiente.</p>`; return; }
  const lista = lanzDelEmbudo(launch);
  const i = lista.findIndex(([c]) => c === code);
  const prev = i > 0 ? lista[i - 1] : null;
  const next = i >= 0 && i < lista.length - 1 ? lista[i + 1] : null;
  const vpd = launch.compraDateField ? ventasPorDia(state.leads, launch) : null;
  const bonus = launch.oferta?.bonus?.length && vpd ? analizarOferta(launch, vpd).bonus : [];
  const pintar = (mPrev) => {
    if (state.launchCode !== code) return;
    const r = retrospectiva(m, mPrev, { nombrePrev: prev?.[1].name || '', bonus });
    const fmt = (f, v) => (v == null ? '–' : f.tipo === 'eur' ? eur(v) : f.tipo === 'pct' ? pctE(v) : f.tipo === 'x' ? `${v.toFixed(2).replace('.', ',')}x` : v.toLocaleString('es-ES'));
    const icono = { mejor: '🟢', peor: '🔴', igual: '⚪' };
    const conTarea = r.aprendizajes.filter((a) => a.tarea);
    box.innerHTML = `${r.conAnterior ? `<div class="table-scroll"><table class="metric-table"><thead><tr><th></th><th class="num">Este</th><th class="num">${esc(prev[1].name)}</th><th class="num">Cambio</th></tr></thead><tbody>
      ${r.filas.map((f) => `<tr><td>${icono[f.tono]} ${esc(f.label)}</td><td class="num"><strong>${fmt(f, f.actual)}</strong></td><td class="num">${fmt(f, f.anterior)}</td><td class="num">${f.cambio == null ? '–' : `${f.cambio > 0 ? '+' : ''}${Math.round(f.cambio * 100)} %`}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted small">Es el primer lanzamiento de este embudo: sin uno anterior con el que comparar.</p>'}
      <h3 class="of-h3">Aprendizajes</h3>${r.aprendizajes.length ? `<ul class="retro-lista">${r.aprendizajes.map((a) => `<li>${icono[a.tono]} ${esc(a.texto)}${a.tarea ? `<br><span class="muted small">→ Tarea: ${esc(a.tarea.titulo)}</span>` : ''}</li>`).join('')}</ul>` : '<p class="muted small">Nada que destacar: resultados parecidos al anterior.</p>'}
      ${conTarea.length && puedeTareas() ? (next ? `<p class="row"><button type="button" class="btn primary" data-retro-pasar="${esc(next[0])}">Pasar ${conTarea.length} tarea${conTarea.length === 1 ? '' : 's'} a «${esc(next[1].name)}»</button> <span class="muted small" id="retro-estado"></span></p>` : '<p class="muted small">Cuando crees el siguiente lanzamiento de este embudo, vuelve aquí para pasarle estas tareas a su planificación.</p>') : ''}`;
    box.dataset.tareas = JSON.stringify(conTarea.map((a) => ({ ...a.tarea, clave: `retro:${code}:${a.id}` })));
  };
  pintar(null);
  if (!prev) return;
  try { pintar(await loadLaunchMetrics(prev[0])); } catch { /* sin el anterior: solo los bonus */ }
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-retro-pasar]');
  if (!b) return;
  const destino = b.dataset.retroPasar;
  const tareas = JSON.parse($('#retro-l').dataset.tareas || '[]');
  b.disabled = true;
  try {
    const existentes = new Set(((await api(`/api/tareas?l=${encodeURIComponent(destino)}`)).tareas || []).map((t) => t.clave).filter(Boolean));
    const nuevas = tareas.filter((t) => !existentes.has(t.clave));
    for (const t of nuevas) await api('/api/tareas', { method: 'POST', body: { l: destino, op: 'crear', avisar: false, tarea: t } });
    $('#retro-estado').textContent = nuevas.length ? `${nuevas.length} tarea${nuevas.length === 1 ? '' : 's'} creada${nuevas.length === 1 ? '' : 's'} en «${state.config.launches[destino]?.name || destino}» ✓` : 'Ya estaban todas en el siguiente lanzamiento.';
  } catch (ex) { $('#retro-estado').textContent = ex.message; b.disabled = false; }
});

// Casi compradoras: las que estuvieron cerca (muy calientes, calientes o VIP) y no compraron. Se pueden
// etiquetar en GHL (`<código>_casi_compra`) para lanzarles el downsell o avisarlas en el siguiente lanzamiento.
const esCasiCompradora = (l) => !l.s.compra && (l.s.vip || ['muy-caliente', 'caliente'].includes(l.estado?.id));
function renderCasiCompradoras(launch) {
  const box = $('#casi-compradoras');
  const casi = state.leads.filter(esCasiCompradora).sort((a, b) => b.score - a.score);
  const tag = tagFor(state.launchCode, 'casi_compra');
  const yaEtiquetadas = casi.filter((l) => l.s.casi_compra).length;
  const porTipo = [
    ['VIP sin comprar', casi.filter((l) => l.s.vip).length],
    ['Muy calientes', casi.filter((l) => l.estado?.id === 'muy-caliente').length],
    ['Calientes', casi.filter((l) => l.estado?.id === 'caliente').length],
  ];
  if (!casi.length) { box.innerHTML = '<p class="muted">Ninguna por ahora.</p>'; return; }
  box.innerHTML = `<div class="kpis">${porTipo.map(([k, n]) => card(k, n, `${pctOf(n, casi.length)} del segmento`, 'users', 'info')).join('')}${card('En el segmento', casi.length, `${yaEtiquetadas} ya etiquetadas en GHL`, 'tag', 'accent')}</div>
    <div class="table-scroll"><table class="metric-table"><thead><tr><th>Persona</th><th class="num">Puntos</th><th>Estado</th><th>VIP</th></tr></thead><tbody>
    ${casi.slice(0, 10).map((l) => `<tr><td><strong>${esc(l.name || l.email)}</strong></td><td class="num">${l.score}</td><td>${esc(l.estado?.label || '')}</td><td>${l.s.vip ? '⭐' : ''}</td></tr>`).join('')}
    </tbody></table></div>${casi.length > 10 ? `<p class="muted small">…y ${casi.length - 10} más.</p>` : ''}
    ${tiene('hoy') || tiene('leads') || tiene('llamadas') ? `<p class="row"><button type="button" class="btn primary" id="btn-casi-etiquetar" ${yaEtiquetadas === casi.length ? 'disabled' : ''}>Etiquetar en GHL (${casi.length - yaEtiquetadas})</button> <span class="muted small">Pone la etiqueta <code>${esc(tag)}</code>: úsala en GHL para el workflow del downsell o del siguiente lanzamiento.</span></p>` : ''}
    <p class="muted small" id="casi-estado"></p>`;
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('#btn-casi-etiquetar');
  if (!b) return;
  const code = state.launchCode;
  const tag = tagFor(code, 'casi_compra');
  const pendientes = state.leads.filter((l) => esCasiCompradora(l) && !l.s.casi_compra);
  if (!pendientes.length) return;
  if (!window.confirm(`Se va a poner la etiqueta «${tag}» a ${pendientes.length} contactos en GHL. Si un workflow de GHL empieza con esa etiqueta, se pondrá en marcha para ellas. ¿Continuar?`)) return;
  b.disabled = true;
  let hechas = 0;
  let fallos = 0;
  for (let i = 0; i < pendientes.length; i += 25) {
    const lote = pendientes.slice(i, i + 25);
    try {
      const { results } = await api('/api/apply-tags', { method: 'POST', body: { items: lote.map((l) => ({ id: l.id, tags: [tag] })) } });
      const ok = new Set(results.filter((r) => r.ok).map((r) => r.id));
      for (const l of lote) {
        if (!ok.has(l.id)) { fallos++; continue; }
        l.tags = [...(l.tags || []), tag];
        l.s.casi_compra = true;
        hechas++;
      }
    } catch { fallos += lote.length; }
    if (state.launchCode !== code) return;
    $('#casi-estado').textContent = `Etiquetando… ${hechas} de ${pendientes.length}`;
  }
  renderCasiCompradoras(state.config.launches[code]);
  $('#casi-estado').textContent = fallos ? `Etiquetadas ${hechas}; ${fallos} no se pudieron (vuelve a pulsar para reintentarlo).` : `Etiquetadas ${hechas} en GHL ✓`;
});

// Resumen: facturación del lanzamiento, de su meteórico posterior (downsell) y la suma de las dos.
async function renderFacturacionTotal(m) {
  const box = $('#fact-total-l');
  const code = state.launchCode;
  const eco = m.eco || {};
  const metas = meteoDeLanz(code);
  const pintar = (meteo) => {
    const fm = meteo?.facturacion ?? null;
    const total = (eco.facturacion || 0) + (fm || 0);
    const inv = (eco.inversion || 0) + (meteo?.inversion || 0);
    const subLanz = `${eur(eco.facturacionPrograma || 0)} del programa (${m.compra} ventas)${eco.facturacionVip ? ` + ${eur(eco.facturacionVip)} de VIP (${m.vip})` : ''}`;
    const subMeteo = !metas.length ? 'Sin meteórico posterior (créalo en Métricas → Downsell)'
      : meteo == null ? 'Cargando…'
        : meteo.error ? `No se pudo leer: ${esc(meteo.error)}`
          : `${meteo.ventas} ventas · ${metas.map(([, x]) => esc(x.name)).join(', ')}`;
    box.innerHTML = [
      card('Facturación del lanzamiento', eur(eco.facturacion || 0), subLanz, 'coins', 'money'),
      card('Facturación del meteórico', !metas.length || meteo?.error ? '–' : meteo == null ? '…' : eur(fm), subMeteo, 'zap', 'vip'),
      card('Facturación total', eur(total), `lanzamiento + meteórico${inv ? ` · ROAS ${(total / inv).toFixed(2).replace('.', ',')}x` : ''}`, 'trend', 'buy'),
    ].join('');
  };
  pintar(null);
  if (!metas.length || !tiene('metricas')) return;
  let meteo;
  try {
    const datos = await Promise.all(metas.map(([c]) => cargarMeteo(c)));
    meteo = { facturacion: datos.reduce((t, d) => t + (d.facturacion || 0), 0), ventas: datos.reduce((t, d) => t + (d.ventas || 0), 0), inversion: datos.reduce((t, d) => t + (d.inversion || 0), 0) };
  } catch (e) { meteo = { error: e.message, facturacion: 0, ventas: 0 }; }
  if (state.launchCode === code) pintar(meteo);
}

function renderMetrics() {
  const launch = state.config.launches[state.launchCode];
  const m = currentMetrics();
  m.launch = launch;
  // Varios vídeos: las ventas «en directo» son las del día del vídeo de venta.
  const vVenta = m.videos?.length > 1 ? m.videos.at(-1) : null;
  const tituloVentasDia = vVenta ? `Ventas el día del ${vVenta.nombre}` : 'Ventas en directo';
  const directoCard = launch.fechaDirecto && launch.compraDateField
    ? card(tituloVentasDia, m.compraDirecto, `${pctOf(m.compraDirecto, m.compra)} de las ventas${vVenta ? '' : ` · ${pctOf(m.compraDirecto, m.live)} de los asistentes`}`, 'live', 'buy')
    : card(tituloVentasDia, '–', 'Configura el día del directo y el campo de fecha de compra', 'live', 'buy');
  // Asistencia por tipo de tráfico (frío / templado), además del dato global.
  const conOrigen = Boolean(launch.publiTag || launch.organicoTag);
  const at = launch.inicioCaptacion || conOrigen ? asistenciaPorTrafico(state.leads, launch, { trafico: Boolean(launch.inicioCaptacion), origen: conOrigen }) : null;
  const atPaso = at?.pasos.find((p) => (vVenta ? p.label === `${vVenta.nombre} (directo o grabación)` : p.label === 'Asistieron al directo'));
  const atG = (id) => at?.grupos.find((g) => g.id === id);
  const porTrafico = atPaso && atG('frio') ? ` · frío ${pctOf(atPaso.n.frio, atG('frio').total)} · templado ${pctOf(atPaso.n.templado, atG('templado').total)}` : '';
  const asistenciaCard = vVenta
    ? card(`Vieron el ${vVenta.nombre}`, vVenta.vieron, `${pctOf(vVenta.vieron, m.total)} de los registros${porTrafico} · compra el ${pctOf(vVenta.compraron, vVenta.vieron)}`, 'live', 'live')
    : card('Asistencia al directo', m.live, `${pctOf(m.live, m.total)} de los registros${porTrafico} · ${pctOf(m.vipLive, m.vip)} de las VIP`, 'live', 'live');
  const tr = resumenTrafico(m, state.meta);
  const pct1 = (x) => (x == null ? '–' : `${(Math.round(x * 1000) / 10).toLocaleString('es-ES')}%`);
  $('#metric-cards').innerHTML = [
    card('Registros', m.total, m.clientaAnterior || m.vipAnterior ? `${m.vipAnterior} VIP y ${m.clientaAnterior} clientas de lanzamientos anteriores` : 'leads del lanzamiento', 'users', 'accent'),
    card('CPL medio', eur(tr.cpl), tr.cpl == null ? 'Conecta Meta o pon la inversión en Configuración' : `inversión / registros${tr.cplPubli != null ? ` · ${eur(tr.cplPubli)} por lead de publicidad` : ''}`, 'coins', 'money'),
    card('Conversión de la página de registro', pct1(tr.conversionPagina), tr.conversionPagina == null ? (state.meta ? 'Meta no da visitas a la página (landing page views)' : 'Conecta Meta para ver las visitas a la página') : `${tr.registrosPubli} registros${tr.conOrigen ? ' de publicidad' : ''} de ${tr.visitas.toLocaleString('es-ES')} visitas (Meta)`, 'funnel', 'info'),
    ...(m.encuestaActiva ? [card('Encuesta rellenada', `${m.encuesta} <small class="muted">de ${m.total}</small>`, `${pctOf(m.encuesta, m.total)} de los registros`, 'survey', 'info')] : []),
    ...(m.conVip ? [card('Entradas VIP', m.vip, `${pctOf(m.vip, m.total)} de los registros`, 'star', 'vip')] : []),
    asistenciaCard,
    card('Compras totales', m.compra, `${pctOf(m.compra, m.total)} de los registros`, 'cart', 'buy'),
    ...(!m.conVip ? [] : [card('Ventas de Raíces de VIP', `${m.compraVip} <small class="muted">de ${m.compra}</small>`, `${pctOf(m.compraVip, m.compra)} de las ventas · compra el ${pctOf(m.compraVip, m.vip)} de las VIP`, 'crown', 'vip')]),
    card('Llamadas agendadas', `${m.llamada} <small class="muted">de ${m.total}</small>`, `${pctOf(m.llamada, m.total)} de los registros · ${pctOf(m.compraLlamada, m.llamada)} compran`, 'phone', 'info'),
    directoCard,
  ].join('');

  renderEconomics(m, launch);
  renderFacturacionTotal(m);
  renderRetrospectiva(m, launch);
  renderCasiCompradoras(launch);
  // Métricas → Downsell abierta: el meteórico y su conversión de ESTE lanzamiento (y con sus leads).
  if (!$('#view-metricas [data-msub="meteorico"]').hidden) renderMeteoLanz();
  // Carrito abierto: ritmo frente al objetivo, bonus que caducan y cierre (visible en todas las pestañas).
  const alertas = alertasCarrito(launch, m.compra);
  $('#alertas-carrito').hidden = !alertas.length;
  $('#alertas-carrito').innerHTML = alertas.length ? `<span><strong>🚨 Carrito abierto</strong><ul>${alertas.map((a) => `<li>${esc(a.texto)}</li>`).join('')}</ul></span>` : '';
  renderOfertaAnalisis(launch);
  mostrarCiclo(state.launchCode, { kpi: '#ciclo-kpi-l', detalle: '#ciclo-l', propias: state.leads.filter((l) => l.s.compra), dateField: launch.compraDateField, nombre: 'este lanzamiento', porTrafico: Boolean(launch.inicioCaptacion) });
  mostrarEmails(state.launchCode, { kpis: '#em-kpis-l', tabla: '#em-l' });
  renderTrafico(m, launch, tr);
  renderVentasDia(launch);
  renderCarritoCompara(launch);
  renderPago(m, launch);
  renderOrigen(m, launch);
  renderEncuestaMetrics();
  renderGanadores();
  renderObjetivos(m);
  renderAvisos(m, launch);

  const steps = [
    ['Registros', m.total],
    ...(m.encuestaActiva ? [['Rellenaron la encuesta', m.encuesta, 'desbloquea las clases']] : []),
    ...m.clases.map((c, i) => [`Empezaron la clase ${i + 1}`, m[c], '≥25% visto']),
    ...(m.conVip ? [['Compraron entrada VIP', m.vip]] : []),
    ...(vVenta ? m.videos.map((v) => [`Vieron el ${v.nombre}`, v.vieron, `${v.asistio ? `${v.asistio} en directo · ` : ''}${v.grabacion} grabado (≥25%)`]) : [
      ['Pulsaron el enlace del directo', m.click],
      ['Asistieron al directo', m.live],
      ['Directo hasta el final', m.liveFinal],
      ['Vieron la grabación', m.replay, '≥25% visto'],
    ]),
    ['Agendaron llamada', m.llamada, 'etiqueta de llamada o marcada por la setter'],
    ['Compraron', m.compra, '', 'buy'],
  ];
  $('#funnel').innerHTML = steps.map(([label, n, hint, cls]) => `
    <div class="funnel-row">
      <div class="funnel-label">${label}${hint ? `<small>${hint}</small>` : ''}</div>
      <div class="funnel-bar ${cls || ''}"><span style="width:${m.total ? (n / m.total) * 100 : 0}%"></span></div>
      <div class="funnel-num"><strong>${n}</strong> <span class="muted">${pctOf(n, m.total)}</span></div>
    </div>`).join('');

  // Asistencia y consumo por tipo de tráfico: % de cada grupo en cada paso, y las diferencias frío − templado y publi − orgánico.
  const dif = (p, a, b) => {
    const ga = atG(a); const gb = atG(b);
    if (!ga?.total || !gb?.total) return '<td class="num">–</td>';
    const d = Math.round((p.n[a] / ga.total - p.n[b] / gb.total) * 1000) / 10;
    return `<td class="num ${!d ? '' : d > 0 ? 'dif-mas' : 'dif-menos'}">${d > 0 ? '+' : ''}${String(d).replace('.', ',')} pp</td>`;
  };
  const difs = [...(atG('frio') ? [['frio', 'templado', 'Frío vs templado']] : []), ...(atG('publi') ? [['publi', 'organico', 'Publi vs orgánico']] : [])];
  $('#asistencia-trafico').innerHTML = !at ? '<tbody><tr><td class="muted">Configura el <strong>inicio de captación</strong> (frío / templado) o las <strong>etiquetas de publicidad y orgánico</strong> del lanzamiento (Configuración → Etiquetas GHL) para separar el consumo por tipo de tráfico.</td></tr></tbody>' : `
    <thead><tr><th>Paso</th>${at.grupos.map((g) => `<th class="num">${g.label} <small class="muted">(${g.total})</small></th>`).join('')}${difs.map(([, , t]) => `<th class="num">${t}</th>`).join('')}</tr></thead>
    <tbody>${at.pasos.map((p) => `<tr><td>${esc(p.label)}</td>${at.grupos.map((g) => `<td class="num${g.id === 'global' ? ' big' : ''}">${pctOf(p.n[g.id], g.total)} <span class="muted">${p.n[g.id]}</span></td>`).join('')}${difs.map(([a, b]) => dif(p, a, b)).join('')}</tr>`).join('')}</tbody>`;

  const rows = [
    ['Todos los registrados', m.total, m.compra],
    ...(m.conVip ? [['Con entrada VIP', m.vip, m.compraVip], ['Sin entrada VIP', m.noVip, m.compraNoVip]] : []),
    ...(vVenta ? m.videos.map((v) => [`Vieron el ${v.nombre}`, v.vieron, v.compraron]) : [
      ['Asistieron al directo', m.live, m.compraLive],
      ['Asistieron hasta el final', m.liveFinal, m.compraFinal],
      ['No fueron al directo, vieron la grabación', m.soloReplay, m.compraSoloReplay],
      ['Ni directo ni grabación', m.nada, m.compraNada],
    ]),
    ['Agendaron llamada', m.llamada, m.compraLlamada],
  ];
  if (!vVenta && launch.fechaDirecto && launch.compraDateField) rows.splice(4, 0, ['Asistieron al directo y compraron ese mismo día', m.live, m.compraDirectoAsist]);
  renderTraffic(m);
  $('#conversion-table').innerHTML = `
    <thead><tr><th>Segmento</th><th class="num">Leads</th><th class="num">Compras</th><th class="num">Conversión</th></tr></thead>
    <tbody>${rows.map(([label, n, buy]) => `<tr><td>${label}</td><td class="num">${n}</td><td class="num">${buy}</td><td class="num big">${pctOf(buy, n)}</td></tr>`).join('')}</tbody>`;

  $('#estado-table').innerHTML = `
    <thead><tr><th>Estado</th><th class="num">Leads</th><th class="num">Compras</th><th class="num">Conversión</th></tr></thead>
    <tbody>${m.estados.map((e) => `<tr><td><span class="estado st-${e.id}"><span class="dot"></span>${e.label}</span></td><td class="num">${e.leads}</td><td class="num">${e.compras}</td><td class="num big">${pctOf(e.compras, e.leads)}</td></tr>`).join('')}</tbody>`;

  renderSources();
  renderSetterMetrics(m);
  renderVotacionMetric();
  renderLift(m);
}

// Votación de la preclase: % de cada opción y conversión a compra de quienes la votaron.
function renderVotacionMetric() {
  const v = state.votos;
  const launch = state.config.launches[state.launchCode];
  $('#votacion-card').hidden = !launch || !tieneRecurso(launch, 'votacion');
  if ($('#votacion-card').hidden) return;
  if (!v || v.code !== state.launchCode) { $('#votacion-metric').innerHTML = '<p class="muted">Cargando los votos…</p>'; return; }
  const porId = new Map(state.leads.map((l) => [l.id, l]));
  const filas = v.resultados.opciones.map((o) => {
    const votantes = Object.entries(v.votos || {}).filter(([, op]) => op === o.id).map(([cid]) => porId.get(cid)).filter(Boolean);
    return { ...o, leads: votantes.length, compras: votantes.filter((l) => l.s.compra).length };
  });
  const noVotaron = state.leads.filter((l) => !v.votos?.[l.id]);
  $('#votacion-metric').innerHTML = `<p><strong>${esc(v.pregunta)}</strong> <span class="muted">· ${v.resultados.total} voto${v.resultados.total === 1 ? '' : 's'} (${pctOf(v.resultados.total, state.leads.length)} de los registros)</span></p>
    ${votacionHtml(v.resultados)}
    <div class="table-scroll"><table class="metric-table"><thead><tr><th>Opción</th><th class="num">Votos</th><th class="num">%</th><th class="num">Compras</th><th class="num">Conversión</th></tr></thead>
    <tbody>${filas.map((f) => `<tr><td>${esc(f.texto)}</td><td class="num">${f.n}</td><td class="num">${Math.round(f.pct * 100)} %</td><td class="num">${f.compras}</td><td class="num big">${pctOf(f.compras, f.leads)}</td></tr>`).join('')}
    <tr class="muted"><td>No votaron</td><td class="num">${noVotaron.length}</td><td class="num">–</td><td class="num">${noVotaron.filter((l) => l.s.compra).length}</td><td class="num">${pctOf(noVotaron.filter((l) => l.s.compra).length, noVotaron.length)}</td></tr></tbody></table></div>`;
}

// Ventas de Raíces por día del carrito (fecha de compra de Raíces).
const dayFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
function renderVentasDia(launch) {
  const v = ventasPorDia(state.leads, launch);
  const box = $('#ventas-dia');
  if (!v) {
    box.innerHTML = '<p class="muted">Configura el <strong>día del directo</strong> y el <strong>campo de fecha de compra</strong> (Configuración → Lanzamiento) para ver las ventas de cada día.</p>';
    return;
  }
  const precio = Number(launch.precioPrograma) || Number(launch.precioFraccionado) || 0;
  const max = Math.max(1, ...v.days.map((d) => d.n));
  let acum = v.antes;
  const row = (label, hint, n, cls = '', importe = null) => {
    acum += cls === 'extra' ? 0 : n;
    return `<div class="funnel-row">
      <div class="funnel-label">${label}${hint ? `<small>${hint}</small>` : ''}</div>
      <div class="funnel-bar buy ${cls}"><span style="width:${(n / max) * 100}%"></span></div>
      <div class="funnel-num"><strong>${n}</strong> <span class="muted">${pctOf(n, v.total)}${precio && n && importe != null ? ` · ${eur(importe)}` : ''}</span></div>
    </div>`;
  };
  const cierre = (launch.cierreCarrito || '').slice(0, 10);
  box.innerHTML = `${v.antes ? row('Antes del directo', '', v.antes, 'extra') : ''}
    ${v.days.map((d, i) => row(`Día ${i + 1} · ${dayFmt.format(new Date(`${d.day}T12:00:00Z`))}`,
    [i === 0 ? 'día del directo' : '', d.day === cierre ? 'cierre del carrito' : '', (launch.fraccionadoTag || launch.unicoTag) && d.n ? `${d.unico} único · ${d.fracc} fraccionado` : '', `acumulado ${acum + d.n} de ${v.total}`].filter(Boolean).join(' · '), d.n, '', d.importe)).join('')}
    ${v.despues ? row('Después del cierre', '', v.despues, 'extra') : ''}
    ${v.sinFecha ? row('Sin fecha de compra', 'clientas con la etiqueta pero sin fecha', v.sinFecha, 'extra') : ''}
    <p class="muted">Total: <strong>${v.total}</strong> ventas de Raíces${precio ? ` · ${eur(v.importe)}` : ''}.</p>`;
}

// ---------- Carrito frente a un lanzamiento anterior, con previsión de cierre ----------
// Ventas acumuladas por día del carrito (Día 1 = día del directo), incluidas las de antes del directo.
function acumuladoCarrito(leads, launch) {
  const v = ventasPorDia(leads, launch);
  if (!v) return null;
  let acc = v.antes;
  return { cum: v.days.map((d) => (acc += d.n)), total: v.total, days: v.days, importeMedio: v.total ? v.importe / v.total : 0 };
}
// Lanzamientos con los que comparar: primero los anteriores a este (el más reciente, el primero).
function carritoCandidatos(launch) {
  const otros = launchesSorted().filter(([c, l]) => c !== state.launchCode && l.fechaDirecto && l.compraDateField);
  const antes = otros.filter(([, l]) => !launch.fechaDirecto || l.fechaDirecto < launch.fechaDirecto);
  return [...antes, ...otros.filter((x) => !antes.includes(x))];
}
function renderCarritoCompara(launch) {
  const box = $('#carrito-compara');
  const cands = carritoCandidatos(launch);
  if (!launch.fechaDirecto || !launch.compraDateField || !cands.length) {
    box.innerHTML = cands.length ? '' : '<p class="muted cc-nota">Cuando haya un lanzamiento anterior con día del directo y fecha de compra, aquí verás la comparación del carrito y una previsión de cierre.</p>';
    return;
  }
  const code = cands.some(([c]) => c === state.carritoRef) ? state.carritoRef : cands[0][0];
  const ref = state.config.launches[code];
  const select = `<label class="field inline cc-pick"><span>Comparar con</span><select id="cc-launch">${cands.map(([c, l]) => `<option value="${esc(c)}"${c === code ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>`;
  const prevLeads = state.launchLeads[code];
  if (!prevLeads) {
    box.innerHTML = `<div class="cc">${select}<p class="muted">Cargando las ventas de «${esc(ref.name)}»…</p></div>`;
    if (!state.carritoLoading) {
      state.carritoLoading = true;
      loadLaunchLeads(code, 'Carrito').then(() => renderCarritoCompara(launch))
        .catch((e) => { box.innerHTML = `<p class="muted">No se pudo cargar «${esc(ref.name)}»: ${esc(e.message)}</p>`; })
        .finally(() => { state.carritoLoading = false; });
    }
    return;
  }
  const cur = acumuladoCarrito(state.leads, launch);
  const prev = acumuladoCarrito(prevLeads, ref);
  if (!cur || !prev || !prev.total) {
    box.innerHTML = `<div class="cc">${select}<p class="muted">«${esc(ref.name)}» no tiene ventas con fecha de compra para comparar.</p></div>`;
    return;
  }
  // Día del carrito en el que estamos (1 = día del directo).
  const today = dayInMadrid(new Date().toISOString());
  const dia = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${launch.fechaDirecto}T12:00:00Z`)) / 86400_000) + 1;
  const D = Math.max(cur.cum.length, prev.cum.length);
  const hasta = Math.min(Math.max(dia, 0), cur.cum.length); // días del carrito actual ya vividos
  const curPts = cur.cum.slice(0, hasta);
  const prevAt = (d) => prev.cum[Math.min(d, prev.cum.length) - 1] ?? prev.total;

  // Resumen y previsión.
  let resumen;
  if (dia < 1) {
    const d1 = prev.cum[0] || 0;
    resumen = `<div class="cc-kpis"><div><span>El carrito empieza</span><strong>${esc(dayFmt.format(new Date(`${launch.fechaDirecto}T12:00:00Z`)))}</strong></div>
      <div><span>«${esc(ref.name)}» vendió el día 1</span><strong>${d1}</strong><em>${pct0(d1 / prev.total)} de su total</em></div>
      <div><span>«${esc(ref.name)}» vendió en total</span><strong>${prev.total}</strong></div></div>`;
  } else {
    const d = Math.min(dia, cur.cum.length);
    const llevas = cur.cum[d - 1];
    const antes = prevAt(d);
    const dif = antes ? (llevas - antes) / antes : null;
    const parte = antes / prev.total; // qué parte de sus ventas tenía el anterior a estas alturas
    const prevision = dia <= cur.cum.length && parte > 0 && llevas > 0 ? Math.round(llevas / parte) : null;
    const importeMedio = cur.importeMedio || prev.importeMedio;
    const terminado = dia > cur.cum.length;
    resumen = `<div class="cc-kpis">
      <div><span>${terminado ? 'Ventas del carrito' : `Llevas (día ${d})`}</span><strong>${llevas}</strong></div>
      <div><span>«${esc(ref.name)}» el día ${d}</span><strong>${antes}</strong>${dif != null ? `<em class="${dif >= 0 ? 'up' : 'down'}">${dif >= 0 ? '▲' : '▼'} ${pct0(Math.abs(dif))} ${dif >= 0 ? 'por delante' : 'por detrás'}</em>` : ''}</div>
      ${terminado ? `<div><span>«${esc(ref.name)}» en total</span><strong>${prev.total}</strong></div>`
    : `<div class="cc-prev"><span>Previsión de cierre</span><strong>${prevision != null ? `~${prevision}` : '–'}</strong><em>${prevision == null ? `Saldrá con las primeras ventas del carrito. «${esc(ref.name)}» llevaba a estas alturas el ${pct0(parte)} de sus ventas.` : `${importeMedio ? `≈ ${eur(prevision * importeMedio)} · ` : ''}si sigue el ritmo de «${esc(ref.name)}», que a estas alturas llevaba el ${pct0(parte)} de sus ventas`}</em></div>`}
    </div>`;
  }

  // Gráfica de ventas acumuladas: este carrito (hasta hoy) frente al de referencia.
  const W = 760; const H = 240; const pl = 40; const pr = 150; const pt = 16; const pb = 34;
  const corto = (t) => (t.length > 16 ? `${t.slice(0, 15)}…` : t);
  const paso = Math.ceil(D / 12); // como mucho ~12 etiquetas en el eje
  const maxY = Math.max(1, ...prev.cum, ...curPts) * 1.08;
  const x = (i) => pl + (D <= 1 ? 0 : (i * (W - pl - pr)) / (D - 1));
  const y = (v) => pt + (H - pt - pb) * (1 - v / maxY);
  const path = (pts) => pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * maxY / 1.08));
  const svg = `<svg class="cc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ventas acumuladas por día del carrito">
    ${ticks.map((t) => `<line x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}" class="cc-grid"/><text x="${pl - 6}" y="${y(t) + 4}" class="cc-ax" text-anchor="end">${t}</text>`).join('')}
    ${Array.from({ length: D }, (_, i) => (i % paso === 0 || i === D - 1 ? `<text x="${x(i)}" y="${H - 14}" class="cc-ax" text-anchor="middle">${i + 1}</text>` : '')).join('')}
    <text x="${(pl + W - pr) / 2}" y="${H - 1}" class="cc-ax" text-anchor="middle">día del carrito</text>
    <path d="${path(prev.cum)}" class="cc-line prev"/>
    ${prev.cum.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="4" class="cc-dot prev"><title>${esc(ref.name)} · día ${i + 1}: ${v} ventas acumuladas</title></circle>`).join('')}
    <text x="${x(prev.cum.length - 1) + 8}" y="${y(prev.cum.at(-1)) + 4}" class="cc-lbl prev">${esc(corto(ref.name))} · ${prev.cum.at(-1)}</text>
    ${curPts.length ? `<path d="${path(curPts)}" class="cc-line cur"/>
    ${curPts.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="4.5" class="cc-dot cur"><title>Este lanzamiento · día ${i + 1}: ${v} ventas acumuladas</title></circle>`).join('')}
    <text x="${x(curPts.length - 1) + 8}" y="${y(curPts.at(-1)) - 8}" class="cc-lbl cur">Este · ${curPts.at(-1)}</text>` : ''}
  </svg>`;
  box.innerHTML = `<div class="cc">
    <div class="cc-head"><h3>${icon('compare')} Este carrito frente a otro lanzamiento</h3>${select}</div>
    ${resumen}
    <p class="cc-leyenda"><span class="sw cur"></span> ${esc(launch.name)} (hasta hoy) <span class="sw prev"></span> ${esc(ref.name)}</p>
    <div class="cc-chart-wrap">${svg}</div>
  </div>`;
}
document.addEventListener('change', (e) => {
  if (e.target.id !== 'cc-launch') return;
  state.carritoRef = e.target.value;
  renderCarritoCompara(state.config.launches[state.launchCode]);
});

// Avisos: lo que falta configurar o los datos que no cuadran (lo mismo que llega en el resumen diario).
function renderAvisos(m, launch) {
  const avisos = avisosLanzamiento(state.leads, launch, m);
  const el = $('#avisos');
  el.hidden = !avisos.length;
  el.innerHTML = avisos.length ? `<strong>Revisa ${avisos.length === 1 ? 'esto' : `estas ${avisos.length} cosas`}:</strong><ul>${avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : '';
}

// Pestaña Objetivos: progreso hacia cada objetivo y ritmo necesario hasta su fecha límite.
const OBJ_INFO = {
  Registros: { ico: 'users', tone: 'accent', hasta: 'fechaDirecto', hastaTxt: 'el directo' },
  'Entradas VIP': { ico: 'star', tone: 'vip', hasta: 'fechaDirecto', hastaTxt: 'el directo (cierra la VIP)' },
  'Ventas de Raíces': { ico: 'cart', tone: 'buy', hasta: 'cierreCarrito', hastaTxt: 'el cierre del carrito' },
  Facturación: { ico: 'coins', tone: 'money', hasta: 'cierreCarrito', hastaTxt: 'el cierre del carrito' },
};
function renderObjetivos(m) {
  const launch = state.config.launches[state.launchCode];
  renderObjForm(launch);
  const box = $('#objetivos');
  if (!m.objetivos.length) {
    box.innerHTML = `<div class="card empty obj-empty">${icon('target', 'ico-xl')}<h2>Aún no hay objetivos para este lanzamiento</h2>
      <p class="muted">${puedeConfig() ? 'Pon arriba las metas de registros, entradas VIP, ventas y facturación' : 'Cuando se pongan las metas de registros, VIP, ventas y facturación'} y aquí verás cuánto llevas, cuánto falta y a qué ritmo hay que ir.</p></div>`;
  } else {
    const fmt = (o, n) => (o.unit === 'eur' ? eur(n) : Math.round(n).toLocaleString('es-ES'));
    // El ritmo diario lleva un decimal si es pequeño (1,3 al día mejor que 1).
    const fmtDia = (o, n) => (o.unit === 'eur' ? eur(n) : n.toLocaleString('es-ES', { maximumFractionDigits: n < 10 ? 1 : 0 }));
    const today = Date.parse(`${dayInMadrid(new Date().toISOString())}T12:00:00Z`);
    box.innerHTML = `<div class="obj-grid">${m.objetivos.map((o) => {
      const info = OBJ_INFO[o.label] || { ico: 'target', tone: 'accent' };
      const done = o.actual >= o.meta;
      const falta = Math.max(0, o.meta - o.actual);
      const limite = String(launch[info.hasta] || '').slice(0, 10);
      const dias = limite ? Math.round((Date.parse(`${limite}T12:00:00Z`) - today) / 86400_000) + 1 : null;
      const ritmo = done ? '¡Objetivo conseguido! 🎉'
        : dias == null ? `Faltan ${fmt(o, falta)}`
          : dias <= 0 ? `Faltaron ${fmt(o, falta)} · el plazo (${info.hastaTxt}) ya terminó`
            : `Faltan ${fmt(o, falta)} · ${fmtDia(o, falta / dias)} al día durante ${dias} ${dias === 1 ? 'día' : 'días'} hasta ${info.hastaTxt}`;
      return `<article class="obj-card tone-${info.tone}${done ? ' done' : ''}">
        <header><span class="kpi-ico">${icon(info.ico)}</span><h3>${o.label}</h3><span class="obj-pct">${Math.round(o.pct * 100)}%</span></header>
        <p class="obj-value"><strong>${fmt(o, o.actual)}</strong> <span class="muted">de ${fmt(o, o.meta)}</span></p>
        <div class="obj-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.min(1, o.pct) * 100)}"><span style="width:${Math.min(100, o.pct * 100)}%"></span></div>
        <p class="obj-ritmo">${ritmo}</p>
      </article>`;
    }).join('')}</div>`;
  }
  renderPrevision(m, launch);
  renderCalculadora(m, launch);
}

// Objetivos editables en la propia pestaña (quien puede configurar; el resto los ve).
const OBJ_CAMPOS = [['registros', 'Registros', '2000'], ['vip', 'Entradas VIP', '300'], ['ventas', 'Ventas de Raíces', '100'], ['facturacion', 'Facturación total (€) <small>(VIP + Raíces)</small>', '120000']];
function renderObjForm(launch) {
  const box = $('#obj-form');
  if (box.dataset.code === state.launchCode && box.contains(document.activeElement)) return; // no pisar lo que se escribe
  box.dataset.code = state.launchCode;
  const o = launch.objetivos || {};
  const editable = puedeConfig();
  box.innerHTML = `<form class="card obj-form" id="obj-form-el">
    <h3>${icon('target')} Objetivos de «${esc(launch.name)}»</h3>
    <div class="grid4">${OBJ_CAMPOS.filter(([k]) => k !== 'vip' || conVip(launch)).map(([k, label, ph]) => `<label class="field"><span>${label}</span><input data-obj="${k}" inputmode="decimal" value="${o[k] || ''}" placeholder="${ph}" ${editable ? '' : 'readonly'}></label>`).join('')}</div>
    ${editable ? '<div class="row"><button type="submit" class="btn primary">Guardar objetivos</button><span class="muted" id="obj-status" aria-live="polite"></span></div>' : '<p class="muted small">Solo quien puede configurar cambia los objetivos.</p>'}
  </form>`;
}
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'obj-form-el') return;
  e.preventDefault();
  const objetivos = Object.fromEntries($$('[data-obj]').map((i) => [i.dataset.obj, i.value.trim().replace(/\./g, '').replace(',', '.')]));
  await guardarObjetivos({ objetivos }, '#obj-status');
});
async function guardarObjetivos(cambio, statusSel) {
  const st = $(statusSel);
  st.textContent = 'Guardando…';
  try {
    const { config } = await api('/api/config', { method: 'POST', body: { op: 'objetivos', l: state.launchCode, ...cambio } });
    state.config = config;
    $('#obj-form').dataset.code = '';
    render();
    const st2 = $(statusSel);
    if (st2) st2.textContent = 'Guardado ✓';
  } catch (err) { st.textContent = err.message; }
}

// ---------- Calculadora: escenarios con el histórico, CPL máximo y recomendado, y proyector ----------
// Resumen de los lanzamientos anteriores (se guarda en este navegador para no recargar sus leads cada vez).
const CALC_KEY = () => `lsd_calc_hist_${state.cliente || 'principal'}`;
function histGuardado() {
  try { return JSON.parse(ls.get(CALC_KEY()) || '{}'); } catch { return {}; }
}
function lanzamientosHistorico() {
  const actual = state.config.launches[state.launchCode];
  const embudo = embudoDeLanz(actual);
  // Anteriores a este (por inicio de captación) del mismo embudo.
  return launchesSorted().filter(([c, l]) => c !== state.launchCode && embudoDeLanz(l) === embudo
    && (!actual.inicioCaptacion || !l.inicioCaptacion || l.inicioCaptacion < actual.inicioCaptacion));
}
function historico() {
  const g = histGuardado();
  return lanzamientosHistorico().map(([c]) => g[c]).filter(Boolean);
}
async function cargarHistorico() {
  const g = histGuardado();
  for (const [c, l] of lanzamientosHistorico()) {
    const m = await loadLaunchMetrics(c);
    g[c] = { ...resumenLanzamiento(c, l, m), at: new Date().toISOString() };
  }
  try { ls.set(CALC_KEY(), JSON.stringify(g)); } catch { /* sin almacenamiento */ }
}
const pctTxt = (x) => (x == null ? '–' : `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`);
const numTxt = (x) => (x == null ? '–' : Math.round(x).toLocaleString('es-ES'));

// Supuestos de la pantalla (lo escrito, sin guardar) o los guardados en el lanzamiento.
function supuestosCalc(launch) {
  const box = $('#calc-supuestos');
  const g = launch.calculadora || {};
  if (!box || box.dataset.code !== state.launchCode) return { ...g };
  return Object.fromEntries($$('[data-calc]', box).map((i) => [i.dataset.calc, i.value.trim().replace(',', '.')]));
}

function renderCalculadora(m, launch, { soloResultados = false } = {}) {
  const box = $('#calculadora');
  const hist = historico();
  const pendientes = lanzamientosHistorico().length - hist.length;
  const sup = supuestosCalc(launch);
  const manual = {
    cpl: sup.cpl, ticket: sup.ticket,
    convVip: sup.convVip ? Number(sup.convVip) / 100 : '', convVenta: sup.convVenta ? Number(sup.convVenta) / 100 : '',
  };
  const esc3 = escenarios(hist, manual);
  // Sin entrada VIP: ni conversión a VIP ni objetivo de VIP.
  if (!conVip(launch)) for (const e of ESCENARIOS) esc3[e.id].convVip = 0;
  const obj = conVip(launch) ? (launch.objetivos || {}) : { ...(launch.objetivos || {}), vip: 0 };
  const hayObj = ['registros', 'vip', 'ventas', 'facturacion'].some((k) => Number(obj[k]) > 0);
  // Días de captación que quedan y ritmo medio desde que empezó.
  const hoy = dayInMadrid(new Date().toISOString());
  const finCapt = launch.finCaptacion || (launch.fechaDirecto ? addDays(launch.fechaDirecto, -1) : '');
  const diasHasta = (d) => (d ? Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86400_000) + 1 : null);
  const quedan = diasHasta(finCapt);
  const llevaDias = launch.inicioCaptacion ? Math.max(1, -diasHasta(launch.inicioCaptacion) + 1) : null;
  const ritmo = llevaDias && launch.inicioCaptacion <= hoy ? m.total / llevaDias : null;
  const actual = { registros: m.total, vip: m.vip, ventas: m.compra, facturacion: m.eco.facturacion, inversion: m.eco.inversion || Number(launch.inversion) || 0 };
  const opts = {
    precioVip: Number(launch.precioVip) || 0, roasObjetivo: Number(sup.roasObjetivo) || ROAS_OBJETIVO_DEF,
    diasCaptacion: quedan > 0 ? quedan : null, ritmoDiario: ritmo, presupuesto: Number(sup.presupuesto) || 0,
  };
  const res = Object.fromEntries(ESCENARIOS.map((e) => [e.id, proyectar(obj, esc3[e.id], actual, opts)]));
  const cplActual = actual.inversion && m.total ? actual.inversion / m.total : null;

  const resultados = !hayObj
    ? '<p class="muted">Pon al menos un objetivo arriba para calcular lo que necesitas.</p>'
    : !res.neutro.calculable
      ? '<div class="notice warn">Faltan datos para calcular: la conversión a venta (y a VIP, si hay objetivo de VIP). Carga el histórico o escribe los supuestos.</div>'
      : `${esc3.neutro.cpl == null ? '<div class="notice warn">Sin CPL no se calcula la inversión: carga un histórico con inversión o escribe el CPL en los supuestos.</div>' : ''}<div class="calc-esc">${ESCENARIOS.map((e) => {
        const r = res[e.id];
        const s = esc3[e.id];
        const nec = r.necesario;
        const cplOk = cplActual != null && r.cplRecomendado != null ? (cplActual <= r.cplRecomendado ? 'ok' : cplActual <= r.cplMax ? 'warn' : 'mal') : '';
        return `<article class="calc-card tone-${e.tone}">
          <header><h4>${e.label}</h4><small class="muted">CPL ${eur(s.cpl)} · VIP ${pctTxt(s.convVip)} · venta ${pctTxt(s.convVenta)} · ticket ${eur(s.ticket)}</small></header>
          <dl>
            <div><dt>Registros necesarios</dt><dd><strong>${numTxt(nec.registros)}</strong><small>manda el objetivo de ${{ registros: 'registros', ventas: 'ventas', vip: 'VIP', facturacion: 'facturación' }[r.manda]}</small></dd></div>
            <div><dt>Inversión total</dt><dd><strong>${nec.inversion == null ? '–' : eur(nec.inversion)}</strong><small>${r.inversionPendiente != null && actual.inversion ? `faltan ${eur(r.inversionPendiente)}` : ''}</small></dd></div>
            <div><dt>CPL máximo</dt><dd><strong>${eur(r.cplMax)}</strong><small>con él, lo invertido = lo facturado</small></dd></div>
            <div><dt>CPL recomendado</dt><dd><strong class="${cplOk}">${eur(r.cplRecomendado)}</strong><small>para un ROAS de ${opts.roasObjetivo.toLocaleString('es-ES')}</small></dd></div>
            <div><dt>Resultado</dt><dd><strong>${numTxt(nec.ventas)} ventas · ${numTxt(nec.vip)} VIP</strong><small>${eur(nec.facturacion)} · ROAS ${nec.roas ? nec.roas.toLocaleString('es-ES', { maximumFractionDigits: 1 }) : '–'}</small></dd></div>
            ${r.porDia != null ? `<div><dt>Ritmo desde hoy</dt><dd><strong>${numTxt(r.porDia)} registros/día</strong><small>${r.inversionDia != null ? `${eur(r.inversionDia)}/día · ` : ''}${quedan} días de captación</small></dd></div>` : ''}
          </dl>
        </article>`;
      }).join('')}</div>`;

  // Proyector: a dónde se llega al ritmo actual y con el presupuesto.
  const fila = (titulo, clave) => {
    if (!ESCENARIOS.some((e) => res[e.id][clave])) return '';
    return `<tr><th>${titulo}</th>${ESCENARIOS.map((e) => {
      const r = res[e.id][clave];
      if (!r) return '<td>–</td>';
      const no = noLlega(obj, r);
      return `<td><strong>${numTxt(r.ventas)} ventas</strong> · ${numTxt(r.registros)} registros<br><small>${eur(r.facturacion)}${r.inversion != null ? ` · inversión ${eur(r.inversion)}` : ''}</small><br>${hayObj ? (no.length ? `<span class="error small">✗ no llega a ${no.join(', ')}</span>` : '<span class="ok-txt small">✓ llega a los objetivos</span>') : ''}</td>`;
    }).join('')}</tr>`;
  };
  const proyector = fila(`Al ritmo actual <small>(${ritmo != null ? `${ritmo.toLocaleString('es-ES', { maximumFractionDigits: 1 })} registros/día` : '–'}${quedan > 0 ? ` · ${quedan} días` : ''})</small>`, 'alRitmo')
    + fila(`Con tu presupuesto <small>(${eur(opts.presupuesto)})</small>`, 'conPresupuesto');

  // Sugerencias en claro.
  const sug = [];
  const n = res.neutro;
  if (hayObj && n.calculable && n.necesario) {
    sug.push(`En el escenario neutro necesitas <strong>${numTxt(n.necesario.registros)} registros</strong>${n.necesario.inversion != null ? ` e invertir <strong>${eur(n.necesario.inversion)}</strong> (entre ${eur(res.favorable.necesario?.inversion)} si va bien y ${eur(res.desfavorable.necesario?.inversion)} si va mal)` : ` (entre ${numTxt(res.favorable.necesario?.registros)} si va bien y ${numTxt(res.desfavorable.necesario?.registros)} si va mal)`}.`);
    if (n.faltan > 0 && n.porDia != null) sug.push(`Te faltan ${numTxt(n.faltan)} registros: unos <strong>${numTxt(n.porDia)} al día</strong>${n.inversionDia != null ? ` (≈ ${eur(n.inversionDia)}/día de publicidad)` : ''} hasta el fin de la captación.`);
    if (ritmo != null && n.porDia != null && ritmo < n.porDia) sug.push(`Vas a ${ritmo.toLocaleString('es-ES', { maximumFractionDigits: 1 })} registros al día: necesitas <strong>${numTxt(n.porDia - ritmo)} más al día</strong>. Sube presupuesto en los anuncios ganadores o abre nuevos públicos.`);
    if (cplActual != null && n.cplMax != null) {
      if (cplActual > n.cplMax) sug.push(`<span class="error">Tu CPL actual (${eur(cplActual)}) supera el máximo (${eur(n.cplMax)}): estás perdiendo dinero con cada registro. Para y revisa creatividades y públicos.</span>`);
      else if (cplActual > n.cplRecomendado) sug.push(`Tu CPL actual (${eur(cplActual)}) está entre el recomendado (${eur(n.cplRecomendado)}) y el máximo (${eur(n.cplMax)}): rentable pero justo. Apaga los anuncios con peor CPL.`);
      else sug.push(`Tu CPL actual (${eur(cplActual)}) está por debajo del recomendado (${eur(n.cplRecomendado)}): hay margen para <strong>escalar la inversión</strong>.`);
    }
    if (opts.presupuesto && n.conPresupuesto) {
      const noP = noLlega(obj, n.conPresupuesto);
      sug.push(noP.length
        ? `Con ${eur(opts.presupuesto)} llegarías a unas ${numTxt(n.conPresupuesto.ventas)} ventas (neutro). Para los objetivos el presupuesto debería ser de unos <strong>${eur(n.necesario.inversion)}</strong>.`
        : `Con ${eur(opts.presupuesto)} llegas a los objetivos en el escenario neutro (${numTxt(n.conPresupuesto.ventas)} ventas).`);
    }
  }
  if (esc3.n < 3) sug.push(`<span class="muted">Con ${esc3.n} lanzamiento${esc3.n === 1 ? '' : 's'} de histórico los escenarios favorable y desfavorable son ±20 % del neutro. Con 3 o más se usan los lanzamientos mejores y peores.</span>`);

  const resultadosHtml = `${resultados}
    ${proyector ? `<h4 class="calc-h">Proyector: a dónde llegas</h4><div class="table-scroll"><table class="metric-table calc-proy"><thead><tr><th></th>${ESCENARIOS.map((e) => `<th>${e.label}</th>`).join('')}</tr></thead><tbody>${proyector}</tbody></table></div>` : ''}
    ${sug.length ? `<h4 class="calc-h">Sugerencias</h4><ul class="calc-sug">${sug.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}`;
  if (soloResultados && $('#calc-resultados')) { $('#calc-resultados').innerHTML = resultadosHtml; return; }

  const g = launch.calculadora || {};
  const campo = (k, label, ph, extra = '') => `<label class="field"><span>${label}</span><input data-calc="${k}" inputmode="decimal" value="${g[k] ?? ''}" placeholder="${ph}" ${extra}></label>`;
  const editable = puedeConfig() ? '' : 'readonly';
  const neutro = esc3.neutro;
  const histTabla = hist.length ? `<details class="calc-hist"><summary>Histórico usado (${hist.length} lanzamiento${hist.length === 1 ? '' : 's'})</summary><div class="table-scroll"><table class="metric-table"><thead><tr><th>Lanzamiento</th><th class="num">Registros</th><th class="num">Inversión</th><th class="num">CPL</th><th class="num">% VIP</th><th class="num">% venta</th><th class="num">Ticket</th><th class="num">ROAS</th></tr></thead><tbody>${hist.map((h) => `<tr><td>${esc(h.name)}</td><td class="num">${numTxt(h.registros)}</td><td class="num">${eur(h.inversion)}</td><td class="num">${eur(h.cpl)}</td><td class="num">${pctTxt(h.convVip)}</td><td class="num">${pctTxt(h.convVenta)}</td><td class="num">${eur(h.ticket)}</td><td class="num">${h.roas ? h.roas.toLocaleString('es-ES', { maximumFractionDigits: 1 }) : '–'}</td></tr>`).join('')}</tbody></table></div></details>` : '';
  box.innerHTML = `<section class="card calc">
    <h3>${icon('trend')} Calculadora y proyector</h3>
    <p class="muted">Con los datos de los lanzamientos anteriores de este embudo (o los supuestos que escribas) calcula lo que necesitas para llegar a los objetivos en tres escenarios.</p>
    <div class="row calc-hist-bar">
      <button type="button" class="btn" id="calc-cargar">${hist.length ? 'Actualizar histórico' : 'Cargar histórico'}</button>
      <span class="muted">${lanzamientosHistorico().length ? `${hist.length} de ${lanzamientosHistorico().length} lanzamientos anteriores cargados${pendientes ? ' · pulsa para cargar el resto' : ''}` : 'No hay lanzamientos anteriores en este embudo: escribe los supuestos.'}</span>
    </div>
    ${histTabla}
    <div id="calc-supuestos" data-code="${esc(state.launchCode)}">
      <h4 class="calc-h">Supuestos <small class="muted">(vacío = el dato del histórico; escribe para simular)</small></h4>
      <div class="grid4">
        ${campo('cpl', 'CPL (€ por registro)', neutro.cpl != null && esc3.fuente.cpl !== 'manual' ? eur(neutro.cpl) : 'p. ej. 4', editable)}
        ${!conVip(launch) ? '' : campo('convVip', '% que compra la VIP', neutro.convVip != null && esc3.fuente.convVip !== 'manual' ? pctTxt(neutro.convVip) : 'p. ej. 10', editable)}
        ${campo('convVenta', '% que compra el programa', neutro.convVenta != null && esc3.fuente.convVenta !== 'manual' ? pctTxt(neutro.convVenta) : 'p. ej. 3', editable)}
        ${campo('ticket', 'Ticket medio del programa (€)', neutro.ticket != null && esc3.fuente.ticket !== 'manual' ? eur(neutro.ticket) : eur(Number(launch.precioPrograma) || 0), editable)}
        ${campo('roasObjetivo', 'ROAS objetivo <small>(facturación ÷ inversión)</small>', String(ROAS_OBJETIVO_DEF).replace('.', ','), editable)}
        ${campo('presupuesto', 'Presupuesto total de publicidad (€) <small>(opcional)</small>', 'p. ej. 15000', editable)}
      </div>
      <p class="muted small">Precio de la VIP: ${eur(Number(launch.precioVip) || 0)} (de Configuración). Llevas ${numTxt(m.total)} registros${actual.inversion ? `, ${eur(actual.inversion)} invertidos (CPL ${eur(cplActual)})` : ''}.</p>
      ${puedeConfig() ? '<div class="row"><button type="button" class="btn" id="calc-guardar">Guardar supuestos</button><span class="muted" id="calc-status" aria-live="polite"></span></div>' : ''}
    </div>
    <div id="calc-resultados">${resultadosHtml}</div>
  </section>`;
}
document.addEventListener('input', (e) => {
  if (!e.target.closest('#calc-supuestos')) return;
  const launch = state.config.launches[state.launchCode];
  renderCalculadora(currentMetrics(), launch, { soloResultados: true });
});
document.addEventListener('click', async (e) => {
  if (e.target.id === 'calc-guardar') {
    const sup = Object.fromEntries($$('#calc-supuestos [data-calc]').map((i) => [i.dataset.calc, i.value.trim().replace(/\.(?=\d{3})/g, '').replace(',', '.')]));
    await guardarObjetivos({ calculadora: sup }, '#calc-status');
    return;
  }
  if (e.target.id !== 'calc-cargar') return;
  e.target.disabled = true;
  try {
    await cargarHistorico();
    render();
  } catch (err) {
    notice(`No se pudo cargar el histórico: ${err.message}`, true);
  } finally {
    e.target.disabled = false;
  }
});

// Avatares de compradoras: perfiles sacados de la encuesta y de quién compra de verdad.
// Se calculan una vez por render (con este lanzamiento o con todos) y marcan a cada lead.
function avatarLeads() {
  return state.avatarScope === 'todos' && state.allAvatarLeads ? state.allAvatarLeads : state.leads;
}
function computeAvatares() {
  const leads = avatarLeads();
  const compras = leads.filter((l) => l.s.compra).length;
  const objetivo = state.avatarObj || (compras >= 10 ? 'compra' : 'vip');
  state.avatar = perfilesCompradoras(leads, preguntasEncuesta(), objetivo);
  for (const l of state.leads) l.avatar = avatarDeLead(l, state.avatar.avatares, preguntasEncuesta());
}
const avatarChip = (l) => (l.avatar >= 0
  ? `<span class="av-chip tone-${AV_TONES[l.avatar]}" title="${esc(describirAvatar(state.avatar.avatares[l.avatar].traits, preguntasEncuesta()))} Compra ${veces(state.avatar.avatares[l.avatar].indice)} respecto a la media.">${icon('users')} Avatar ${l.avatar + 1}</span>`
  : '');
const AV_TONES = ['buy', 'vip', 'live'];
const pct0 = (x) => `${Math.round(x * 100)}%`;
const veces = (x) => `×${x.toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}`;
function renderEncuestaMetrics() {
  const box = $('#encuesta-metrics');
  const todos = state.avatarScope === 'todos' && state.allAvatarLeads;
  const total = avatarLeads().length;
  // Antes del carrito aún no hay ventas: por defecto se analizan las VIP.
  const r = state.avatar;
  const { objetivo } = r;
  const que = objetivo === 'vip' ? 'compran la VIP' : 'compran Raíces';
  const quien = objetivo === 'vip' ? 'compradoras de VIP' : 'compradoras de Raíces';
  const toggle = `<div class="seg" role="tablist" aria-label="Qué analizar">
      <button type="button" class="seg-btn${objetivo === 'compra' ? ' on' : ''}" data-avatar-obj="compra">${icon('cart')} Ventas de Raíces</button>
      <button type="button" class="seg-btn${objetivo === 'vip' ? ' on' : ''}" data-avatar-obj="vip">${icon('star')} Entradas VIP</button></div>
    <div class="seg" role="tablist" aria-label="Con qué lanzamientos">
      <button type="button" class="seg-btn${todos ? '' : ' on'}" data-avatar-scope="este">Este lanzamiento</button>
      <button type="button" class="seg-btn${todos ? ' on' : ''}" data-avatar-scope="todos">Todos los lanzamientos</button></div>`;
  const resumen = `<p class="av-resumen">${toggle}<span>${todos ? `<strong>${Object.keys(state.config.launches).length}</strong> lanzamientos · ` : ''}<strong>${r.leads}</strong> de ${total} leads han respondido la encuesta (${pctOf(r.leads, total)}) · <strong>${r.compras}</strong> ${que} · conversión media <strong>${pctOf(r.compras, r.leads)}</strong></span></p>`;

  if (!r.leads) {
    box.innerHTML = `${resumen}<p class="muted">Aún no hay respuestas de la encuesta en este lanzamiento.</p>`;
    return;
  }
  const avatares = r.avatares.length
    ? `<div class="av-grid">${r.avatares.map((a, i) => `
        <article class="av-card tone-${AV_TONES[i]}">
          <header><span class="av-ico">${icon('users')}</span><div><span class="av-kicker">Avatar ${i + 1}</span><h3>${a.traits.map(([, v]) => esc(v)).join(' · ')}</h3></div></header>
          <p class="av-frase">${esc(describirAvatar(a.traits, preguntasEncuesta()))}</p>
          <div class="av-stats">
            <div title="Compra ${veces(a.indice)} veces más que la media"><strong>${veces(a.indice)}</strong><span>vs. la media</span></div>
            <div title="${a.compras} de tus ${r.compras} ${quien}"><strong>${pct0(a.pesoCompras)}</strong><span>${objetivo === 'vip' ? 'de las VIP' : 'de las ventas'}</span></div>
            <div title="${a.compras} de ${a.leads} leads con este perfil"><strong>${pctOf(a.compras, a.leads)}</strong><span>conversión</span></div>
          </div>
          <div class="av-bar" title="${pct0(a.pesoLeads)} de las leads, ${pct0(a.pesoCompras)} de las compradoras"><span class="l" style="width:${a.pesoLeads * 100}%"></span><span class="c" style="width:${a.pesoCompras * 100}%"></span></div>
          <p class="av-pie">Son el ${pct0(a.pesoLeads)} de las leads pero el ${pct0(a.pesoCompras)} de las ${quien}.</p>
        </article>`).join('')}
        ${r.anti ? `<article class="av-card av-anti">
          <header><span class="av-ico">${icon('alert')}</span><div><span class="av-kicker">Compra poco</span><h3>${r.anti.traits.map(([, v]) => esc(v)).join(' · ')}</h3></div></header>
          <p class="av-frase">${esc(describirAvatar(r.anti.traits, preguntasEncuesta()))}</p>
          <div class="av-stats"><div><strong>${veces(r.anti.indice)}</strong><span>vs. la media</span></div><div><strong>${pct0(r.anti.pesoLeads)}</strong><span>de las leads</span></div><div><strong>${pctOf(r.anti.compras, r.anti.leads)}</strong><span>conversión</span></div></div>
          <p class="av-pie">Mucho volumen y poca compra: revisa si los anuncios atraen a este perfil o si necesita otro mensaje.</p>
        </article>` : ''}</div>`
    : `<p class="av-vacio">${icon('sparkle')} Todavía no hay datos suficientes para sacar avatares fiables: hace falta que cada perfil tenga al menos ${r.minN} leads y ${r.minK} ${objetivo === 'vip' ? 'VIP' : 'ventas'}. ${objetivo === 'compra' ? 'Mientras, prueba con «Entradas VIP».' : ''}</p>`;

  const preguntas = r.preguntas.map(({ p, rows }) => {
    // Las barras se escalan a la respuesta más grande de cada pregunta para que se lean bien.
    const max = Math.max(0.01, ...rows.flatMap((x) => [x.pesoLeads, x.pesoCompras]));
    return `
    <section class="av-q">
      <h4>${esc(p.name)}</h4>
      ${rows.map((x) => `<div class="av-row${x.pocos ? ' pocos' : ''}" title="${x.leads} leads · ${x.compras} ${que} · conversión ${pctOf(x.compras, x.leads)}${x.pocos ? ' · pocos datos' : ''}">
        <span class="av-label">${esc(x.respuesta)}</span>
        <span class="av-bars"><span class="l" style="width:${(x.pesoLeads / max) * 100}%"></span><span class="c" style="width:${(x.pesoCompras / max) * 100}%"></span></span>
        <span class="av-idx ${x.indice >= 1.15 ? 'up' : x.indice <= 0.85 ? 'down' : ''}">${x.pocos ? 'pocos datos' : `${x.indice >= 1.15 ? '▲' : x.indice <= 0.85 ? '▼' : '•'} ${veces(x.indice || 0)}`}</span>
      </div>`).join('')}
    </section>`;
  }).join('');

  const tablas = preguntasEncuesta().map((p) => {
    const rows = porRespuesta(state.leads, p);
    return `<h4 class="cfg-h4">${esc(p.name)}</h4><div class="table-scroll"><table class="metric-table">
      <thead><tr><th>Respuesta</th><th class="num">Leads</th><th class="num">% de los leads</th><th class="num">VIP</th><th class="num">Ventas</th><th class="num">Conversión</th></tr></thead>
      <tbody>${rows.map((x) => `<tr><td>${x.respuesta ? (x.otras ? `<span class="muted">${esc(x.respuesta)}</span>` : esc(x.respuesta)) : '<span class="muted">Sin respuesta</span>'}</td><td class="num">${x.leads}</td><td class="num">${pctOf(x.leads, total)}</td><td class="num">${x.vip} <span class="muted">${pctOf(x.vip, x.leads)}</span></td><td class="num">${x.compras}</td><td class="num big">${pctOf(x.compras, x.leads)}</td></tr>`).join('')}</tbody></table></div>`;
  }).join('');

  box.innerHTML = `${resumen}${avatares}
    <h3 class="av-h">Qué respuestas compran más</h3>
    <p class="av-leyenda"><span class="sw l"></span> % de las leads <span class="sw c"></span> % de las ${quien} <span class="av-idx up">▲ ×1,5</span> compra 1,5 veces más que la media <span class="av-idx down">▼ ×0,6</span> compra menos</p>
    <div class="av-qs">${preguntas}</div>
    <details class="av-tablas"><summary>Ver las tablas con todos los datos</summary>${tablas}</details>`;
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-avatar-obj]');
  if (b) {
    state.avatarObj = b.dataset.avatarObj;
    render();
    return;
  }
  const sc = e.target.closest('[data-avatar-scope]');
  if (!sc) return;
  if (sc.dataset.avatarScope === 'todos' && !state.allAvatarLeads) {
    sc.disabled = true;
    try {
      const all = [];
      for (const [code] of launchesSorted()) all.push(...await loadLaunchLeads(code, 'Avatares'));
      state.allAvatarLeads = all;
    } catch (err) {
      notice(`No se pudieron cargar todos los lanzamientos: ${err.message}`, true);
      return;
    } finally {
      sc.disabled = false;
    }
  }
  state.avatarScope = sc.dataset.avatarScope;
  render();
});


// Informe del lanzamiento: las métricas en una página aparte, lista para guardar en PDF o compartir.
$('#btn-informe').addEventListener('click', () => {
  const launch = state.config.launches[state.launchCode];
  const view = $('#view-metricas').cloneNode(true);
  view.hidden = false;
  if (state.config.launches[state.launchCode]?.objetivos && $('#objetivos .obj-grid')) {
    view.insertAdjacentHTML('afterbegin', `<section class="card metric-card"><h2>Objetivos del lanzamiento</h2>${$('#objetivos').innerHTML}</section>`);
  }
  view.querySelectorAll('button, select, .metric-actions, [hidden]').forEach((el) => el.remove());
  const fecha = new Date().toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Informe · ${esc(launch.name)}</title><link rel="stylesheet" href="${location.origin}/styles.css">
    <style>body{padding:24px;max-width:1100px;margin:0 auto}.informe-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:16px}
    .informe-head h1{margin:0}@media print{body{padding:0}.no-print{display:none}.metric-card,.kpi{break-inside:avoid}}</style></head>
    <body><header class="informe-head"><div><h1>Informe · ${esc(launch.name)}</h1><p class="muted">${esc(state.launchCode)} · directo ${esc(launch.fechaDirecto || '–')} · generado el ${esc(fecha)} · ${state.leads.length} leads</p></div>
    <button class="btn no-print" onclick="window.print()">Guardar en PDF / imprimir</button></header>${view.innerHTML}</body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
});

// Leads de publicidad vs orgánicos (por sus etiquetas): leads, %, VIP, ventas, conversión y facturación.
function renderOrigen(m, launch) {
  const t = $('#origen-table');
  if (!launch.publiTag && !launch.organicoTag) {
    t.innerHTML = '<tbody><tr><td class="muted">Elige las etiquetas de leads de publicidad y orgánicos en Configuración → Lanzamiento → Etiquetas de GHL. Mientras, tienes el desglose por canal (utm_source) en «Canales y campañas».</td></tr></tbody>';
    return;
  }
  const o = m.origen;
  const rows = [['Publicidad', o.publi], ['Orgánico', o.organico]];
  if (o.sinEtiqueta.leads) rows.push(['Sin etiqueta de origen', o.sinEtiqueta]);
  const tr = (label, r, total = false) => `<tr${total ? ' class="total"' : ''}><td>${total ? `<strong>${label}</strong>` : label}</td><td class="num">${r.leads}</td><td class="num big">${pctOf(r.leads, o.total.leads)}</td><td class="num">${r.vip} <span class="muted">${pctOf(r.vip, r.leads)}</span></td><td class="num">${r.compras}</td><td class="num">${pctOf(r.compras, r.leads)}</td><td class="num">${pctOf(r.compras, o.total.compras)}</td><td class="num">${eur(r.importe)}</td></tr>`;
  t.innerHTML = `
    <thead><tr><th>Origen</th><th class="num">Leads</th><th class="num">% de los leads</th><th class="num">VIP</th><th class="num">Ventas</th><th class="num">Conversión</th><th class="num">% de las ventas</th><th class="num">Facturación Raíces</th></tr></thead>
    <tbody>${rows.map(([label, r]) => tr(label, r)).join('')}${tr('Total', o.total, true)}</tbody>`;
}

// Ventas de Raíces por tipo de pago: número, % (suma 100%) y facturación.
function renderPago(m, launch) {
  const t = $('#pago-table');
  const tit = $('#pago-titulo');
  tit.dataset.def ??= tit.innerHTML;
  if (esSuscripcion(launch)) {
    tit.innerHTML = 'Planes de la suscripción <span class="muted">· altas, facturación del primer cobro y MRR</span>';
    t.innerHTML = planesActivos(launch).length ? tablaPlanes(m.planes) : '<tbody><tr><td class="muted">Marca los planes de la suscripción en Configuración → Lanzamiento → Precios.</td></tr></tbody>';
    return;
  }
  tit.innerHTML = tit.dataset.def;
  if (!launch.unicoTag && !launch.fraccionadoTag) {
    t.innerHTML = '<tbody><tr><td class="muted">Elige las etiquetas de pago único y fraccionado en Configuración → Lanzamiento → Etiquetas de GHL.</td></tr></tbody>';
    return;
  }
  const p = m.pago;
  const rows = [['Pago único', p.unico], ['Pago fraccionado', p.fraccionado]];
  if (p.sinEtiqueta.n) rows.push(['Sin etiqueta de pago <small class="muted">(revisa sus workflows)</small>', p.sinEtiqueta]);
  t.innerHTML = `
    <thead><tr><th>Tipo de pago</th><th class="num">Ventas</th><th class="num">% de las ventas</th><th class="num">Facturación</th><th class="num">% de la facturación</th></tr></thead>
    <tbody>${rows.map(([label, r]) => `<tr><td>${label}</td><td class="num">${r.n}</td><td class="num big">${pctOf(r.n, p.total.n)}</td><td class="num">${eur(r.importe)}</td><td class="num">${pctOf(r.importe, p.total.importe)}</td></tr>`).join('')}
      <tr class="total"><td><strong>Total</strong></td><td class="num"><strong>${p.total.n}</strong></td><td class="num">${p.total.n ? '100%' : '–'}</td><td class="num"><strong>${eur(p.total.importe)}</strong></td><td class="num">${p.total.importe ? '100%' : '–'}</td></tr></tbody>`;
}

// Inversión, facturación y rentabilidad.
function renderEconomics(m, launch) {
  const e = m.eco;
  const hasPrices = launch.precioVip || launch.precioPrograma || launch.precioFraccionado;
  const fuente = e.inversionFuente === 'meta' ? `Meta Ads (${esc(state.meta.since)} → ${esc(state.meta.until)})` : 'introducida a mano';
  const metaWarn = state.meta?.error ? `<p class="muted">Meta: ${esc(state.meta.error)}</p>` : '';
  $('#eco-cards').innerHTML = `${[
    card('Inversión en anuncios', e.inversion ? eur(e.inversion) : '–', e.inversion ? fuente : 'Conecta Meta o introdúcela en Configuración', 'megaphone', 'accent'),
    card('Facturación', hasPrices ? eur(e.facturacion) : '–', hasPrices ? `VIP ${eur(e.facturacionVip)} · Raíces ${eur(e.facturacionPrograma)}${m.planes ? ` · MRR ${eur(m.planes.mrr)}` : launch.fraccionadoTag || launch.unicoTag ? ` (${m.compraUnico} único · ${m.compraFraccionado} fraccionado)` : ''}` : 'Añade los precios en Configuración', 'coins', 'money'),
    card('ROAS', e.roas != null && hasPrices ? `${e.roas.toFixed(2)}x` : '–', e.roas != null && hasPrices ? `Beneficio: ${eur(e.beneficio)}` : 'facturación / inversión', 'trend', 'money'),
    card('Coste por lead', eur(e.cpl), e.cplFrio != null ? `${eur(e.cplFrio)} por lead de tráfico frío` : 'inversión / registros', 'users', 'accent'),
    card('Coste por VIP', eur(e.cpVip), 'inversión / entradas VIP', 'star', 'vip'),
    card('CAC', eur(e.cac), 'coste por clienta nueva de Raíces (inversión / todas las ventas)', 'target', 'buy'),
    ...(e.publi ? [
      card('CAC de publicidad', eur(e.publi.cac), `inversión / ${e.publi.compras} ventas de leads de publicidad`, 'target', 'accent'),
      card('ROAS de publicidad', e.publi.roas != null && hasPrices ? `${e.publi.roas.toFixed(2)}x` : '–', `facturación de publicidad ${eur(e.publi.facturacion)} / inversión`, 'trend', 'accent'),
      card('Coste por lead de publicidad', eur(e.publi.cpl), `${e.publi.leads} leads de publicidad · ${eur(e.publi.cpVip)} por VIP`, 'megaphone', 'accent'),
    ] : []),
  ].join('')}${metaWarn ? `<div style="grid-column:1/-1">${metaWarn}</div>` : ''}`;
}

// Métricas → Tráfico: todo lo publicitario (Meta) del lanzamiento y el desglose por campaña.
function renderTrafico(m, launch, tr) {
  const n = (x) => (x == null ? '–' : Math.round(x).toLocaleString('es-ES'));
  const pct1 = (x) => (x == null ? '–' : `${(Math.round(x * 1000) / 10).toLocaleString('es-ES')}%`);
  const eur2 = (x) => (x == null ? '–' : x.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }));
  const sinMeta = !state.meta || state.meta.error;
  $('#trafico-cards').innerHTML = [
    card('Inversión', tr.inversion ? eur(tr.inversion) : '–', state.meta?.since ? `Meta Ads · ${esc(state.meta.since)} → ${esc(state.meta.until)}` : 'introducida a mano', 'megaphone', 'accent'),
    card('Impresiones', n(tr.impresiones), `CPM ${eur2(tr.cpm)} (coste por mil)`, 'eye', 'info'),
    card('Clics en el enlace', n(tr.clics), `CTR ${pct1(tr.ctr)} · CPC ${eur2(tr.cpc)}`, 'trend', 'info'),
    card('Visitas a la página de registro', n(tr.visitas), tr.visitas ? `${pct1(tr.cargan)} de los clics llegan a cargarla · ${eur2(tr.costeVisita)} por visita` : 'landing page views de Meta', 'play', 'info'),
    card('Conversión de la página', pct1(tr.conversionPagina), tr.conversionPagina != null ? `${n(tr.registrosPubli)} registros${tr.conOrigen ? ' de publicidad' : ''} / ${n(tr.visitas)} visitas${tr.registrosMeta ? ` · Meta cuenta ${n(tr.registrosMeta)}` : ''}` : 'registros / visitas a la página', 'funnel', 'buy'),
    card('CPL medio', eur2(tr.cpl), 'inversión / todos los registros', 'users', 'money'),
    card('CPL de publicidad', eur2(tr.cplPubli), tr.conOrigen ? `inversión / ${n(m.origen.publi.leads)} leads de publicidad` : 'Pon las etiquetas de publicidad y orgánico', 'megaphone', 'money'),
    card('CPL de tráfico frío', eur2(tr.cplFrio), 'inversión / leads nuevos en GHL', 'snow', 'money'),
    ...(conVip(launch) ? [card('Coste por VIP', eur2(tr.cpVip), 'inversión / entradas VIP', 'star', 'vip')] : []),
    card('Coste por venta', eur2(tr.cac), 'inversión / ventas', 'cart', 'buy'),
    card('ROAS', tr.roas != null ? `${tr.roas.toFixed(2)}x` : '–', 'facturación / inversión', 'trend', 'money'),
  ].join('');
  $('#trafico-nota').innerHTML = sinMeta
    ? (state.meta?.error ? `Meta: ${esc(state.meta.error)}` : 'Conecta Meta Ads para ver impresiones, clics y visitas (variables META_ACCESS_TOKEN y la cuenta publicitaria del cliente). Sin Meta solo se calculan los costes con la inversión puesta a mano.')
    : 'Visitas = «landing page views» de Meta (personas que hicieron clic y la página llegó a cargar). La conversión de la página usa los registros con etiqueta de publicidad (los orgánicos no pasan por los anuncios).';
  // Por campaña: lo de Meta (inversión, impresiones, clics, visitas) + lo de GHL (registros, VIP y ventas por UTM).
  const ghl = new Map(rankingGanadores(state.leads, launch, 'campaign', state.meta?.names || {}, state.meta?.spendBy || {}).map((r) => [r.id, r]));
  const camps = (state.meta?.campaigns || []).map((c) => ({ ...c, st: state.meta.statsBy?.[c.id] || {}, g: ghl.get(c.id) }));
  for (const [id, g] of ghl) if (!camps.some((c) => c.id === id)) camps.push({ id, name: g.label, spend: g.spend, st: {}, g });
  camps.sort((a, b) => (b.spend || 0) - (a.spend || 0));
  $('#trafico-campanas').innerHTML = !camps.length ? '<tbody><tr><td class="muted">Sin campañas: conecta Meta o revisa que los registros lleguen con UTM (utm_campaign).</td></tr></tbody>' : `
    <thead><tr><th>Campaña</th><th class="num">Inversión</th><th class="num">Impresiones</th><th class="num">CTR</th><th class="num">CPC</th><th class="num">Visitas</th><th class="num">Registros</th><th class="num">Conv. página</th><th class="num">CPL</th>${conVip(launch) ? '<th class="num">VIP</th>' : ''}<th class="num">Ventas</th><th class="num">Coste/venta</th></tr></thead>
    <tbody>${camps.map((c) => {
      const reg = c.g?.leads || 0;
      return `<tr><td>${esc(c.name || c.id)}</td><td class="num">${eur2(c.spend)}</td><td class="num">${n(c.st.impresiones)}</td><td class="num">${pct1(c.st.impresiones ? c.st.clics / c.st.impresiones : null)}</td><td class="num">${eur2(c.st.clics ? c.spend / c.st.clics : null)}</td><td class="num">${n(c.st.visitas)}</td><td class="num">${reg}</td><td class="num">${pct1(c.st.visitas ? reg / c.st.visitas : null)}</td><td class="num big">${eur2(reg && c.spend ? c.spend / reg : null)}</td>${conVip(launch) ? `<td class="num">${c.g?.vip || 0}</td>` : ''}<td class="num">${c.g?.compras || 0}</td><td class="num">${eur2(c.g?.compras && c.spend ? c.spend / c.g.compras : null)}</td></tr>`;
    }).join('')}</tbody>`;
}

// Registros, VIP y ventas por campaña / conjunto / anuncio (UTM de GHL + nombres e inversión de Meta).
function renderSources() {
  const level = $('#src-level').value;
  const names = state.meta?.names || {};
  const spendBy = state.meta?.spendBy || {};
  const groups = bySource(state.leads, level, names);
  const hasSpend = Object.keys(spendBy).length > 0;
  $('#source-table').innerHTML = `
    <thead><tr><th>${{ source: 'Canal (utm_source)', campaign: 'Campaña', adset: 'Conjunto de anuncios', ad: 'Anuncio' }[level]}</th><th class="num">Registros</th><th class="num">Frío</th><th class="num">VIP</th><th class="num">Ventas</th><th class="num">Conversión</th>${hasSpend ? '<th class="num">Inversión</th><th class="num">CPL</th><th class="num">Coste/venta</th>' : ''}</tr></thead>
    <tbody>${groups.map((g) => {
    const spend = spendBy[g.key];
    return `<tr><td>${esc(g.label)}</td><td class="num">${g.leads}</td><td class="num">${g.frio}</td><td class="num">${g.vip} <span class="muted">${pctOf(g.vip, g.leads)}</span></td><td class="num">${g.compras}</td><td class="num big">${pctOf(g.compras, g.leads)}</td>${hasSpend ? `<td class="num">${spend ? eur(spend) : '–'}</td><td class="num">${spend ? eur(spend / g.leads) : '–'}</td><td class="num">${spend && g.compras ? eur(spend / g.compras) : '–'}</td>` : ''}</tr>`;
  }).join('') || '<tr><td colspan="9" class="muted">Sin datos de origen.</td></tr>'}</tbody>`;
}

// Trabajo de la setter: contactadas y resultado.
function renderSetterMetrics(m) {
  const st = m.setter;
  $('#setter-table').innerHTML = `
    <thead><tr><th>Grupo</th><th class="num">Leads</th><th class="num">Compras</th><th class="num">Conversión</th></tr></thead>
    <tbody>
      <tr><td><strong>Contactadas por WhatsApp</strong></td><td class="num">${st.contactadas}</td><td class="num">${st.compraContactadas}</td><td class="num big">${pctOf(st.compraContactadas, st.contactadas)}</td></tr>
      <tr><td>No contactadas</td><td class="num">${st.noContactadas}</td><td class="num">${st.compraNoContactadas}</td><td class="num big">${pctOf(st.compraNoContactadas, st.noContactadas)}</td></tr>
      ${st.resultados.map((r) => `<tr><td>· ${r.label}</td><td class="num">${r.leads}</td><td class="num">${r.compras}</td><td class="num big">${pctOf(r.compras, r.leads)}</td></tr>`).join('')}
    </tbody>`;
}

// Qué señales predicen la compra (para afinar la puntuación con datos reales).
function renderLift(m) {
  const rows = [...m.lift].sort((a, b) => (b.veces ?? 0) - (a.veces ?? 0));
  $('#lift-table').innerHTML = `
    <thead><tr><th>Señal</th><th class="num">Conversión con la señal</th><th class="num">Sin la señal</th><th class="num">Multiplica por</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${r.label} <span class="muted">(${r.con})</span></td><td class="num">${pctOf(r.convCon * r.con, r.con)}</td><td class="num">${pctOf(r.convSin * r.sin, r.sin)}</td><td class="num big">${r.veces == null ? '–' : `${r.veces.toFixed(1)}x`}</td></tr>`).join('')}</tbody>`;
  renderPesos(m.launch);
}

// La puntuación aprende: reparto de los 100 puntos entre clases, VIP y vídeo según lo que de verdad
// separó a las que compraron de las que no en este lanzamiento.
function renderPesos(launch) {
  const box = $('#pesos-propuesta');
  const recursos = { musica: tieneRecurso(launch, 'musica'), test: tieneRecurso(launch, 'test'), votacion: tieneRecurso(launch, 'votacion') };
  const actuales = pesosEfectivos(pesosDe(state.config), recursos);
  const deSerie = !state.config.pesosScore;
  const conClases = (launch.nClases ?? 2) > 0 && launch.preclase !== false;
  const visibles = BLOQUES.filter((b) => (b.id !== 'clases' || conClases) && (b.id !== 'vip' || conVip(launch)) && (!['musica', 'test', 'votacion'].includes(b.id) || recursos[b.id]));
  const p = proponerPesos(state.leads, { conClases, conVip: conVip(launch), recursos });
  const cab = `<h3 class="of-h3">La puntuación aprende de tus ventas</h3><p class="muted small">Cada lead se puntúa sobre 100 repartidos entre lo que hizo. Pesos ${deSerie ? 'de serie' : 'aprendidos'}: ${visibles.map((b) => `${esc(b.label.toLowerCase())} <strong>${actuales[b.id]}</strong>`).join(' · ')}.</p>`;
  if (p.motivo) {
    box.innerHTML = `${cab}<p class="muted small">${esc(p.motivo)}</p>${!deSerie && puedeConfig() ? '<button type="button" class="btn ghost" data-pesos="serie">Volver a los de serie</button>' : ''}`;
    return;
  }
  const igual = p.detalle.every((d) => p.pesos[d.id] === actuales[d.id]);
  box.innerHTML = `${cab}
    <div class="table-scroll"><table class="metric-table"><thead><tr><th>Bloque</th><th class="num">Compran con la señal</th><th class="num">Sin ella</th><th class="num">Peso actual</th><th class="num">Propuesto</th></tr></thead><tbody>
    ${p.detalle.map((d) => `<tr><td>${esc(d.label)} <span class="muted small">· ${esc(d.senal)} (${d.con})</span>${d.poca ? ' <span class="muted small">· poca muestra: se queda igual</span>' : ''}</td><td class="num">${pctE(d.convCon)}</td><td class="num">${pctE(d.convSin)}</td><td class="num">${actuales[d.id]}</td><td class="num big">${p.pesos[d.id]}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted small">Con ${p.ventas} ventas de este lanzamiento. Al aplicarlos cambian la puntuación y el estado (muy caliente, caliente…) de los leads de todos los lanzamientos de este cliente, y así el Setting hoy prioriza mejor.</p>
    ${puedeConfig() ? `<div class="row">${igual ? '<span class="muted small">Ya usas estos pesos.</span>' : `<button type="button" class="btn primary" data-pesos="aplicar">Aplicar estos pesos</button>`}${!deSerie ? ' <button type="button" class="btn ghost" data-pesos="serie">Volver a los de serie</button>' : ''}</div>` : ''}`;
  box.dataset.propuesta = JSON.stringify(p.pesos);
}
$('#pesos-propuesta').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-pesos]');
  if (!b) return;
  const pesos = b.dataset.pesos === 'aplicar' ? JSON.parse($('#pesos-propuesta').dataset.propuesta || 'null') : null;
  if (!window.confirm(pesos ? '¿Aplicar los pesos propuestos? Cambia la puntuación de todos los leads de este cliente.' : '¿Volver a los pesos de serie?')) return;
  b.disabled = true;
  try {
    const { config } = await api('/api/config', { method: 'POST', body: { op: 'pesos', pesos } });
    state.config = config;
    state.leads = state.leads.map((l) => enrich(l));
    render();
    notice(pesos ? 'Pesos aplicados: la puntuación de los leads ya los usa.' : 'Vuelves a los pesos de serie.');
  } catch (ex) { notice(ex.message, true); b.disabled = false; }
});

// Reparto de las ventas entre tráfico frío y templado (suma 100%).
function renderTraffic(m) {
  if (!m.launch.inicioCaptacion) {
    $('#traffic-split').innerHTML = '<p class="muted">Configura el <strong>inicio de captación</strong> del lanzamiento para separar tráfico frío y templado.</p>';
    $('#traffic-table').innerHTML = '';
    return;
  }
  const buys = m.compraFrio + m.compraTemplado;
  const pf = buys ? Math.round((m.compraFrio / buys) * 1000) / 10 : 0;
  const pt = buys ? Math.round((100 - pf) * 10) / 10 : 0;
  $('#traffic-split').innerHTML = buys ? `
    <div class="split-bar" role="img" aria-label="Ventas: ${pf}% tráfico frío, ${pt}% tráfico templado">
      ${m.compraFrio ? `<span class="frio" style="flex:${m.compraFrio}">${pf}%</span>` : ''}
      ${m.compraTemplado ? `<span class="templado" style="flex:${m.compraTemplado}">${pt}%</span>` : ''}
    </div>
    <div class="split-legend">
      <span><span class="sw" style="background:var(--st-frio)"></span><strong>Frío:</strong> ${pf}% de las ventas (${m.compraFrio})</span>
      <span><span class="sw" style="background:var(--accent)"></span><strong>Templado:</strong> ${pt}% de las ventas (${m.compraTemplado})</span>
    </div>` : '<p class="muted">Todavía no hay ventas en este lanzamiento.</p>';
  const row = (label, n, buy) => `<tr><td>${label}</td><td class="num">${n} <span class="muted">${pctOf(n, m.total)}</span></td><td class="num">${buy}</td><td class="num">${pctOf(buy, buys)}</td><td class="num big">${pctOf(buy, n)}</td></tr>`;
  $('#traffic-table').innerHTML = `
    <thead><tr><th>Tráfico</th><th class="num">Registros</th><th class="num">Ventas</th><th class="num">% de las ventas</th><th class="num">Conversión</th></tr></thead>
    <tbody>${row('Frío (nuevo en GHL)', m.frio, m.compraFrio)}${row('Templado (ya estaba en GHL)', m.templado, m.compraTemplado)}</tbody>`;
}

$('#src-level').addEventListener('change', () => { if (state.leads.length) renderSources(); });

// ---------- Anuncios ganadores ----------
state.ganLevel = 'ad';
function renderGanadores() {
  $$('#gan-level .seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.gl === state.ganLevel));
  pintarGanadores($('#ganadores'), state.leads, state.config.launches[state.launchCode], state.ganLevel, state.meta);
}

// Ranking de anuncios / conjuntos / campañas por ventas (lanzamientos y VSL).
function pintarGanadores(box, leads, launch, level, meta, { vip = true, donde = 'en este lanzamiento' } = {}) {
  const names = meta?.names || {};
  const spendBy = meta?.spendBy || {};
  const all = rankingGanadores(leads, launch, level, names, spendBy);
  const conVentas = all.filter((r) => r.compras > 0);
  const que = { ad: 'anuncio', adset: 'conjunto', campaign: 'campaña' }[level];
  if (!all.length) {
    box.innerHTML = `<p class="muted">Ningún registro trae el ${que} en las UTM (utm_${{ ad: 'content', adset: 'term', campaign: 'campaign' }[level]}). Revisa que los anuncios de Meta lleven los parámetros de URL.</p>`;
    return;
  }
  if (!conVentas.length) {
    box.innerHTML = `<p class="muted">Todavía no hay ventas de Raíces atribuidas a anuncios ${donde}. Aquí aparecerá el ranking en cuanto entren las primeras.</p>`;
    return;
  }
  const max = conVentas[0].compras;
  const medal = ['🥇', '🥈', '🥉'];
  const ruta = (r) => [r.campaign, r.adset].filter(Boolean).map(esc).join(' › ');
  const extra = (r) => [
    r.ingresos ? `<span><strong>${eur(r.ingresos)}</strong> facturado</span>` : '',
    r.spend ? `<span>${eur(r.spend)} invertido</span>` : '',
    r.cac != null ? `<span>CAC <strong>${eur(r.cac)}</strong></span>` : '',
    r.roas != null ? `<span>ROAS <strong>${r.roas.toFixed(1)}x</strong></span>` : '',
  ].filter(Boolean).join('');
  const podio = conVentas.slice(0, 3).map((r, i) => `<article class="gan-podio p${i + 1}">
      <div class="gp-medal" aria-hidden="true">${medal[i]}</div>
      <div class="gp-main">
        <div class="gp-name" title="${esc(r.label)}">${esc(r.label)}</div>
        ${ruta(r) ? `<div class="gp-ruta">${ruta(r)}</div>` : ''}
        <div class="gp-nums"><span class="gp-ventas">${r.compras}</span><span class="gp-lbl">venta${r.compras === 1 ? '' : 's'}</span>
          <span class="gp-conv">${(r.conversion * 100).toFixed(1)}% conv.</span></div>
        <div class="gp-extra"><span>${r.leads} registros</span>${vip ? `<span>${r.vip} VIP</span>` : ''}${extra(r)}</div>
      </div>
    </article>`).join('');
  const hasSpend = conVentas.some((r) => r.spend);
  const resto = conVentas.slice(3);
  box.innerHTML = `<div class="gan-podios">${podio}</div>
    ${resto.length ? `<div class="table-scroll"><table class="metric-table gan-table">
      <thead><tr><th class="num">#</th><th>${que.charAt(0).toUpperCase() + que.slice(1)}</th><th>Ventas</th><th class="num">Conversión</th><th class="num">Registros</th>${vip ? '<th class="num">VIP</th>' : ''}<th class="num">Facturado</th>${hasSpend ? '<th class="num">CAC</th><th class="num">ROAS</th>' : ''}</tr></thead>
      <tbody>${resto.map((r, i) => `<tr><td class="num">${i + 4}</td><td><strong>${esc(r.label)}</strong>${ruta(r) ? `<br><span class="muted">${ruta(r)}</span>` : ''}</td>
        <td><div class="gan-bar"><span style="width:${(r.compras / max) * 100}%"></span><b>${r.compras}</b></div></td>
        <td class="num">${(r.conversion * 100).toFixed(1)}%</td><td class="num">${r.leads}</td>${vip ? `<td class="num">${r.vip}</td>` : ''}<td class="num">${r.ingresos ? eur(r.ingresos) : '–'}</td>
        ${hasSpend ? `<td class="num">${r.cac != null ? eur(r.cac) : '–'}</td><td class="num">${r.roas != null ? `${r.roas.toFixed(1)}x` : '–'}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : ''}
    <p class="muted gan-note">${all.length - conVentas.length ? `${all.length - conVentas.length} ${que}${all.length - conVentas.length === 1 ? '' : 's'} más con registros pero sin ventas todavía. ` : ''}Ventas = compras de Raíces de las personas que se registraron desde ese ${que} (UTM).${vip ? ' Facturado incluye la entrada VIP.' : ''}</p>`;
}
$('#gan-level').addEventListener('click', (e) => {
  const b = e.target.closest('[data-gl]');
  if (!b) return;
  state.ganLevel = b.dataset.gl;
  renderGanadores();
});

// ---------- Comparar lanzamientos ----------
state.compare = { selected: new Set(), cache: {} };

function renderCompareSelector() {
  const list = launchesSorted();
  if (!state.compare.selected.size) list.slice(0, 3).forEach(([c]) => state.compare.selected.add(c));
  $('#compare-pick').innerHTML = list.map(([c, l]) => `<label class="check"><input type="checkbox" value="${esc(c)}" ${state.compare.selected.has(c) ? 'checked' : ''}> ${esc(l.name)}</label>`).join('')
    || '<p class="muted">Todavía no hay lanzamientos.</p>';
}

$('#compare-pick').addEventListener('change', (e) => {
  if (e.target.checked) state.compare.selected.add(e.target.value);
  else state.compare.selected.delete(e.target.value);
});

// Leads (ya enriquecidos) de cualquier lanzamiento; el actual sale de lo ya cargado.
// Se guardan para no volver a pedirlos (Comparar, avatares de todos los lanzamientos, carrito).
state.launchLeads = {};
async function loadLaunchLeads(code, label = 'Cargando') {
  if (code === state.launchCode) return state.leads;
  if (state.launchLeads[code]) return state.launchLeads[code];
  const launch = state.config.launches[code];
  const raw = [];
  let cursor = null;
  try {
    do {
      const qs = new URLSearchParams({ tag: launch.registroTag });
      if (cursor) qs.set('cursor', JSON.stringify(cursor));
      const page = await api(`/api/leads?${qs}`);
      raw.push(...page.contacts);
      cursor = page.cursor;
      progress(raw.length, page.total, `${label} · ${launch.name}: ${raw.length}${page.total ? ` de ${page.total}` : ''} leads`);
    } while (cursor);
  } finally {
    progress(null);
  }
  state.launchLeads[code] = raw.map((c) => enrichLead(c, code, state.config));
  return state.launchLeads[code];
}

// Anuncios de todos los lanzamientos del embudo (Análisis → Avatar y anuncios).
state.hist = { level: 'ad', datos: null };
async function cargarHistoricoAnuncios() {
  const btn = $('#btn-hist-anuncios');
  const codes = launchesSorted().filter(([, l]) => embudoDeLanz(l) === state.embudo && l.registroTag && l.inicioCaptacion && l.inicioCaptacion <= today()).map(([c]) => c);
  if (!codes.length) { $('#hist-anuncios').innerHTML = '<p class="muted">Aún no hay lanzamientos empezados en este embudo.</p>'; return; }
  btn.disabled = true;
  const datos = [];
  try {
    for (const code of codes) {
      const leads = await loadLaunchLeads(code, 'Anuncios');
      let meta = null;
      try { const r = await api(`/api/meta?launch=${encodeURIComponent(code)}`); meta = r.configured && !r.error ? r : null; } catch { /* sin Meta */ }
      datos.push({ code, nombre: state.config.launches[code].name, leads, meta });
    }
    state.hist.datos = datos;
    pintarHistoricoAnuncios();
  } catch (e) {
    $('#hist-anuncios').innerHTML = `<p class="error">${esc(e.message)}</p>`;
  } finally { btn.disabled = false; btn.textContent = 'Volver a cargar'; }
}
function pintarHistoricoAnuncios() {
  $$('#hist-level .seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.hl === state.hist.level));
  if (!state.hist.datos) return;
  const lvl = state.hist.level;
  const h = historicoAnuncios(state.hist.datos.map((d) => ({ code: d.code, nombre: d.nombre, filas: rankingGanadores(d.leads, state.config.launches[d.code], lvl, d.meta?.names || {}, d.meta?.spendBy || {}) })));
  const que = { ad: 'anuncio', adset: 'conjunto', campaign: 'campaña' }[lvl];
  if (!h.filas.length) { $('#hist-anuncios').innerHTML = `<p class="muted">Ningún registro trae el ${que} en las UTM.</p>`; return; }
  const reco = { reutilizar: '<span class="em-niv alto">Reutilizar</span>', revisar: '<span class="em-niv bajo">Revisar</span>' };
  $('#hist-anuncios').innerHTML = `<p class="muted small">${h.lanzamientos} lanzamiento${h.lanzamientos === 1 ? '' : 's'} · ${h.roasMedio != null ? `ROAS medio ${h.roasMedio.toFixed(2).replace('.', ',')}x` : `conversión media ${pctE(h.convMedia)}`}. «Reutilizar»: vendió al menos 2 veces y rinde un 20 % más que la media; «Revisar»: no recupera la inversión o rinde la mitad que la media.</p>
    <div class="table-scroll"><table class="metric-table"><thead><tr><th>${que[0].toUpperCase()}${que.slice(1)}</th><th>Lanzamientos</th><th class="num">Leads</th><th class="num">Ventas</th><th class="num">Conversión</th><th class="num">Inversión</th><th class="num">Coste por venta</th><th class="num">ROAS</th><th></th></tr></thead><tbody>
    ${h.filas.slice(0, 60).map((f) => `<tr><td><strong>${esc(f.label)}</strong></td><td class="small">${f.lanzamientos.map((x) => `${esc(x.nombre)} <span class="muted">(${x.compras})</span>`).join(' · ')}</td>
      <td class="num">${f.leads}</td><td class="num"><strong>${f.compras}</strong></td><td class="num">${pctE(f.conversion)}</td>
      <td class="num">${f.spend != null ? eur(f.spend) : '–'}</td><td class="num">${f.cac != null ? eur(f.cac) : '–'}</td><td class="num">${f.roas != null ? `${f.roas.toFixed(1).replace('.', ',')}x` : '–'}</td><td>${reco[f.recomendacion] || ''}</td></tr>`).join('')}
    </tbody></table></div>${h.filas.length > 60 ? `<p class="muted small">…y ${h.filas.length - 60} más con menos ventas.</p>` : ''}`;
}
$('#btn-hist-anuncios').addEventListener('click', cargarHistoricoAnuncios);
$('#hist-level').addEventListener('click', (e) => { const b = e.target.closest('[data-hl]'); if (!b) return; state.hist.level = b.dataset.hl; pintarHistoricoAnuncios(); });

async function loadLaunchMetrics(code) {
  if (state.compare.cache[code]) return state.compare.cache[code];
  const launch = state.config.launches[code];
  const leads = await loadLaunchLeads(code, 'Comparar');
  let metaSpend = null;
  try {
    const meta = await api(`/api/meta?launch=${encodeURIComponent(code)}`);
    if (meta.configured && !meta.error) metaSpend = meta.total;
  } catch { /* sin Meta: se usa la inversión manual */ }
  const m = computeMetrics(leads, launch, { metaSpend });
  state.compare.cache[code] = m;
  return m;
}

$('#btn-compare').addEventListener('click', async () => {
  const codes = launchesSorted().map(([c]) => c).filter((c) => state.compare.selected.has(c)).reverse();
  if (!codes.length) return;
  const btn = $('#btn-compare');
  btn.disabled = true;
  try {
    const results = [];
    for (const c of codes) results.push([c, await loadLaunchMetrics(c)]);
    renderCompareTable(results);
  } catch (e) {
    notice(`No se pudo comparar: ${e.message}`, true);
  } finally {
    progress(null);
    btn.disabled = false;
  }
});

function renderCompareTable(results) {
  const L = state.config.launches;
  const rows = [
    ['Registros', (m) => m.total],
    ['Tráfico frío', (m) => pctOf(m.frio, m.total)],
    ['Encuesta rellenada', (m) => (m.encuestaActiva ? `${m.encuesta} · ${pctOf(m.encuesta, m.total)}` : '–')],
    ['Empezaron la clase 1', (m) => pctOf(m.clase1, m.total)],
    ['Empezaron la clase 2', (m) => pctOf(m.clase2, m.total)],
    ['Entradas VIP', (m) => `${m.vip} · ${pctOf(m.vip, m.total)}`],
    ['Asistencia al directo', (m) => `${m.live} · ${pctOf(m.live, m.total)}`],
    ['Directo hasta el final', (m) => pctOf(m.liveFinal, m.total)],
    ['Vieron la grabación', (m) => pctOf(m.replay, m.total)],
    ['Ventas', (m) => m.compra],
    ['Conversión total', (m) => pctOf(m.compra, m.total)],
    ['Conversión de las VIP', (m) => pctOf(m.compraVip, m.vip)],
    ['Ventas en directo', (m) => `${m.compraDirecto} · ${pctOf(m.compraDirecto, m.compra)}`],
    ['% ventas de tráfico frío', (m) => pctOf(m.compraFrio, m.compraFrio + m.compraTemplado)],
    ['Inversión', (m) => eur(m.eco.inversion || null)],
    ['Facturación', (m) => eur(m.eco.facturacion || null)],
    ['ROAS', (m) => (m.eco.roas != null && m.eco.facturacion ? `${m.eco.roas.toFixed(2)}x` : '–')],
    ['Coste por lead', (m) => eur(m.eco.cpl)],
    ['CAC (coste por clienta)', (m) => eur(m.eco.cac)],
  ];
  $('#compare-table').innerHTML = `
    <thead><tr><th></th>${results.map(([c]) => `<th class="num">${esc(L[c].name)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([label, fn]) => `<tr><td>${label}</td>${results.map(([, m]) => `<td class="num">${fn(m)}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

// ---------- Vistas ----------
const VIEWS = ['hoy', 'llamadas', 'leads', 'metricas', 'objetivos', 'avatar', 'comparar', 'tareas', 'calendario', 'vmetricas', 'vleads', 'vanuncios', 'rendimiento', 'meteoricos', 'moferta'];
// Iconos de las pestañas y de las cabeceras de sección (data-icon en el HTML).
// Pestañas que agrupan varias vistas en subpestañas:
// «Comercial» (Setting hoy y Llamadas), «Análisis» (Objetivos, Avatar y anuncios / Anuncios ganadores y
// Comparar) y «Planificación» (Calendario, Tareas y Rendimiento del equipo).
const GRUPOS = { comercial: ['hoy', 'llamadas'], analisis: ['objetivos', 'avatar', 'vanuncios', 'comparar'], planificacion: ['calendario', 'tareas', 'rendimiento'] };
const grupoDe = (view) => Object.keys(GRUPOS).find((g) => GRUPOS[g].includes(view)) || null;
const VIEW_ICONS = { meteoricos: 'zap', moferta: 'gift', comercial: 'phone', analisis: 'compare', planificacion: 'calendar', hoy: 'sun2', llamadas: 'phone', leads: 'users', metricas: 'trend', objetivos: 'target', avatar: 'crown', comparar: 'compare', tareas: 'list', calendario: 'calendar', vmetricas: 'trend', vleads: 'users', vanuncios: 'crown', rendimiento: 'users' };
$$('.view-tab, .subview-tab[data-view]').forEach((t) => t.insertAdjacentHTML('afterbegin', icon(VIEW_ICONS[t.dataset.view || t.dataset.viewGrupo])));
$$('[data-tab-icon]').forEach((b) => b.insertAdjacentHTML('afterbegin', `<span class="tab-ico">${icon(b.dataset.tabIcon)}</span>`));
$$('[data-tb-icon]').forEach((b) => b.insertAdjacentHTML('afterbegin', `<span class="tb-ico">${icon(b.dataset.tbIcon)}</span>`));

// ---------- Barras de pestañas que no caben (móvil): avisa de que hay más deslizando ----------
function marcarDesborde(el) {
  const hay = el.scrollWidth > el.clientWidth + 2;
  el.classList.toggle('mas-der', hay && el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  el.classList.toggle('mas-izq', hay && el.scrollLeft > 2);
}
const barrasPestanas = () => $$('.views, .subviews, .tabs');
for (const el of barrasPestanas()) el.addEventListener('scroll', () => marcarDesborde(el), { passive: true });
const revisarBarras = () => barrasPestanas().forEach(marcarDesborde);
window.addEventListener('resize', revisarBarras);
// Las pestañas cambian al cambiar de embudo, de vista o al abrir un diálogo: se revisa tras cada clic.
document.addEventListener('click', () => requestAnimationFrame(revisarBarras));
setTimeout(revisarBarras, 300);

// ---------- Modo día / noche ----------
// Automático según la hora (public/tema.js); el botón lo cambia a mano hasta el siguiente cambio automático.
$$('.tema-sol').forEach((x) => { x.innerHTML = icon('sun'); });
$$('.tema-luna').forEach((x) => { x.innerHTML = icon('moon'); });
const horaCorta = (d) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
function pintarTema() {
  const T = window.LSD_TEMA;
  if (!T) return;
  const noche = T.actual() === 'dark';
  const m = T.manual();
  const hasta = horaCorta(m ? new Date(m.hasta) : T.siguienteCambio());
  for (const b of $$('[data-tema-toggle]')) {
    b.setAttribute('aria-label', noche ? 'Cambiar a modo día' : 'Cambiar a modo noche');
    b.title = `${noche ? '🌙 Modo noche' : '☀️ Modo día'} · ${m ? `elegido a mano hasta las ${hasta}; después vuelve a ir según la hora` : `automático según la hora (cambia a las ${hasta})`}. Pulsa para cambiarlo.`;
    b.classList.toggle('manual', Boolean(m));
  }
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-tema-toggle]') || !window.LSD_TEMA) return;
  const t = window.LSD_TEMA.alternar();
  const m = window.LSD_TEMA.manual();
  pintarTema();
  const msg = m ? `${t === 'dark' ? '🌙 Modo noche' : '☀️ Modo día'} hasta las ${horaCorta(new Date(m.hasta))}; después vuelve a cambiar solo según la hora.` : 'Vuelve a ir solo según la hora: ☀️ de 8:00 a 20:00 y 🌙 el resto.';
  notice(msg);
  setTimeout(() => { if ($('#notice').textContent === msg) notice(''); }, 6000);
});
window.LSD_TEMA?.alCambiar(pintarTema);
pintarTema();
$$('[data-icon] > h2').forEach((h) => h.insertAdjacentHTML('afterbegin', `<span class="h-ico">${icon(h.parentElement.dataset.icon)}</span>`));
function showView(view) {
  if (state.role && !allowedViews().includes(view)) view = allowedViews()[0];
  const grupo = grupoDe(view);
  $$('.view-tab').forEach((x) => x.classList.toggle('active', x.dataset.viewGrupo ? x.dataset.viewGrupo === grupo : x.dataset.view === view));
  $$('.subview-tab[data-view]').forEach((x) => x.classList.toggle('active', x.dataset.view === view));
  // Las subpestañas de un grupo solo se enseñan si se puede ver más de una.
  for (const g of Object.keys(GRUPOS)) $(`#sub-${g}`).hidden = g !== grupo || !state.role || GRUPOS[g].filter((v) => allowedViews().includes(v)).length < 2;
  if (grupo) ls.set(`lsd_${grupo}_${state.embudo}`, view);
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== view;
  ls.set(`lsd_view_${state.embudo}`, view);
  if (!enVsl()) ls.set('lsd_view', view);
  $('#vsl-rango').hidden = !['vmetricas', 'vleads', 'vanuncios'].includes(view);
  if (enVsl() && state.vsl.leads) renderVsl();
  if (view === 'comparar' && state.config) { renderCompareSelector(); renderComparativas(); }
  if (view === 'rendimiento' && state.config) loadRendimiento();
  if (view === 'meteoricos' && state.config && enMeteo()) renderMeteoView();
  if (view === 'moferta' && state.config && enMeteo()) renderMOfertaView();
  if (view === 'calendario' && state.config) renderCalendario();
  // Tareas del embudo abierto (en meteóricos, del meteórico elegido).
  if (view === 'tareas' && state.config) { if (codigo() && state.tareas?.code !== codigo()) loadTareas(); else { pintarCabeceraTareas(); renderTareas(); } }
  if (view === 'llamadas' && state.config) { if (state.llamadas?.code !== codigo()) loadLlamadas(); else renderLlamadas(); }
  requestAnimationFrame(revisarBarras);
}
$$('.view-tab').forEach((t) => t.addEventListener('click', () => {
  if (!t.dataset.viewGrupo) { showView(t.dataset.view); return; }
  // Grupo: la última subpestaña usada en este embudo (o la primera que se pueda ver).
  const vistas = GRUPOS[t.dataset.viewGrupo];
  const ultima = ls.get(`lsd_${t.dataset.viewGrupo}_${state.embudo}`);
  showView(vistas.includes(ultima) && allowedViews().includes(ultima) ? ultima : vistas.find((v) => allowedViews().includes(v)));
}));
$$('.subview-tab[data-view]').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));

// Métricas por categorías (subpestañas dentro de Métricas): enseña solo los bloques de la elegida.
function pintarMsub(nav, cat) {
  const view = nav.closest('[id^="view-"]');
  const cats = $$('[data-msub-btn]', nav).map((b) => b.dataset.msubBtn);
  // Subpestañas que se juntaron (la última elegida puede ser una de antes).
  if (nav.id === 'msub-metricas') cat = { trafico: 'captacion', origen: 'captacion', consumo: 'conversion', oferta: 'ventas' }[cat] || cat;
  if (!cats.includes(cat)) cat = cats[0];
  $$('[data-msub-btn]', nav).forEach((b) => b.classList.toggle('active', b.dataset.msubBtn === cat));
  $$('[data-msub]', view).forEach((el) => { el.hidden = el.dataset.msub !== cat; });
  ls.set(`lsd_${nav.id}`, cat);
  if (nav.id === 'msub-leads' && cat === 'encuesta' && state.config && state.leads) renderEncuestaLeads();
  if (nav.id === 'msub-metricas' && cat === 'meteorico' && state.config) renderMeteoLanz();
}
$$('.msubs').forEach((nav) => {
  $$('[data-msub-btn]', nav).forEach((b) => {
    b.insertAdjacentHTML('afterbegin', icon(b.dataset.iconMsub));
    b.addEventListener('click', () => { pintarMsub(nav, b.dataset.msubBtn); nav.scrollIntoView({ block: 'nearest' }); });
  });
  pintarMsub(nav, ls.get(`lsd_${nav.id}`));
});
showView(VIEWS.includes(ls.get('lsd_view')) ? ls.get('lsd_view') : 'leads');

const ESTADO_ICONS = { 'muy-caliente': 'flame', caliente: 'sun', templado: 'thermo', frio: 'snow' };

function renderKpis() {
  renderConsumo();
  const L = state.leads;
  const counts = Object.fromEntries(ESTADOS.map((e) => [e.id, 0]));
  let vip = 0; let live = 0; let replay = 0; let sent = 0; let publi = 0; let organico = 0;
  for (const l of L) {
    counts[l.estado.id]++;
    if (l.s.origen === 'publi') publi++;
    else if (l.s.origen === 'organico') organico++;
    if (l.s.vip) vip++;
    if (directoVenta(l.s, 'asistio')) live++;
    if (grabVenta(l.s) >= 50) replay++;
    if (l.s.wa_enviado) sent++;
  }
  const pct = (n) => (L.length ? `${Math.round((n / L.length) * 100)}%` : '–');
  const f = state.filters.estado;
  const vV = videosDe(state.config.launches[state.launchCode]);
  const deVenta = vV.length > 1 ? ` el ${vV.at(-1).nombre}` : '';
  $('#kpis').innerHTML = `
    <div class="kpi static tone-accent"><span class="kpi-label"><span class="kpi-ico">${icon('users')}</span>Leads registrados</span><span class="kpi-value">${L.length}</span><span class="kpi-sub">${sent} contactados por WhatsApp</span></div>
    ${ESTADOS.map((e) => `
      <button type="button" class="kpi kpi-estado st-${e.id} ${f === e.id ? 'active' : ''}" data-estado="${e.id}" title="Filtrar por ${e.label}">
        <span class="kpi-label"><span class="kpi-ico">${icon(ESTADO_ICONS[e.id])}</span>${e.label}</span>
        <span class="kpi-value">${counts[e.id]}</span>
        <span class="kpi-sub">${pct(counts[e.id])} · ${e.min}+ puntos</span>
      </button>`).join('')}
    ${conVip(state.config.launches[state.launchCode]) ? `<div class="kpi static tone-vip"><span class="kpi-label"><span class="kpi-ico">${icon('star')}</span>Compraron VIP</span><span class="kpi-value">${vip}</span><span class="kpi-sub">${pct(vip)}</span></div>` : ''}
    <div class="kpi static tone-live"><span class="kpi-label"><span class="kpi-ico">${icon('live')}</span>${deVenta ? `En directo${deVenta}` : 'Asistieron al directo'}</span><span class="kpi-value">${live}</span><span class="kpi-sub">${pct(live)}</span></div>
    <div class="kpi static tone-info"><span class="kpi-label"><span class="kpi-ico">${icon('play')}</span>${deVenta ? `Vieron${deVenta} grabado` : 'Vieron la grabación'}</span><span class="kpi-value">${replay}</span><span class="kpi-sub">${pct(replay)} (≥50%)</span></div>
    ${publi + organico ? `<div class="kpi static tone-accent"><span class="kpi-label"><span class="kpi-ico">${icon('megaphone')}</span>De pago (publicidad)</span><span class="kpi-value">${pct(publi)}</span><span class="kpi-sub">${publi} leads</span></div>
    <div class="kpi static tone-buy"><span class="kpi-label"><span class="kpi-ico">${icon('compass')}</span>Orgánicos</span><span class="kpi-value">${pct(organico)}</span><span class="kpi-sub">${organico} leads${L.length - publi - organico ? ` · ${L.length - publi - organico} sin etiqueta` : ''}</span></div>` : ''}
    <div class="distribution" style="grid-column:1/-1" aria-hidden="true">
      ${ESTADOS.map((e) => (counts[e.id] ? `<span class="st-${e.id}" style="flex:${counts[e.id]}" title="${e.label}: ${counts[e.id]}"></span>` : '')).join('')}
    </div>`;
  $$('#kpis [data-estado]').forEach((b) => b.addEventListener('click', () => {
    state.filters.estado = state.filters.estado === b.dataset.estado ? '' : b.dataset.estado;
    $('#f-estado').value = state.filters.estado;
    state.page = 0;
    render();
  }));
}

// El vídeo de venta (el webinar, o el último vídeo del lanzamiento): lo visto de su grabación y su directo.
const grabVenta = (s) => watched(s, sigReplay(s.nVideos || 1));
const directoVenta = (s, que) => Boolean(s[`${sigDirecto(s.nVideos || 1)}_${que}`]);

const chip = (label, cls = '') => `<span class="chip ${cls}">${label}</span>`;

function videoChip(s, v) {
  const pct = watched(s, v);
  if (pct >= 90) return chip('Completo', 'on');
  if (pct) return chip(`${pct}%`, 'half');
  return chip('—');
}

function liveChip(s) {
  if (s.directo_final) return chip('Hasta el final', 'on');
  if (s.directo_60) return chip('+60 min', 'on');
  if (s.directo_asistio) return chip('Asistió', 'half');
  if (s.directo_click) return chip('Clic', 'half');
  return chip('—');
}

// Lanzamientos de varios vídeos: lo visto de cada vídeo (en directo o grabado), uno por línea.
const nombreCorto = (v) => v.nombre.replace('Vídeo ', 'V').replace('PLC ', 'PLC');
function videosChips(s, launch) {
  return videosDe(launch).map((v) => {
    const pct = watched(s, v.replay);
    const live = s[`${v.directo}_final`] ? 'final' : s[`${v.directo}_asistio`] ? 'directo' : '';
    const cls = live === 'final' || pct >= 90 ? 'on' : live || pct ? 'half' : '';
    const txt = live === 'final' ? 'hasta el final' : pct >= 90 ? 'completo' : live ? `directo${pct ? ` · ${pct}%` : ''}` : pct ? `${pct}%` : '—';
    return `<span class="chip ${cls}" title="${esc(v.nombre)}">${esc(nombreCorto(v))} ${txt}</span>`;
  }).join(' ');
}

function compraChip(s) {
  if (s.compra_directo) return chip('En directo', 'on');
  if (s.compra) return chip('Compró', 'on');
  if (s.clienta_anterior) return chip('Clienta anterior');
  return chip('—');
}

// Recursos de la preclase en la fila del lead: música, test y su voto.
function preclaseChips(l) {
  const r = l.s.recursos || {};
  const out = [];
  if (r.musica && (l.s.musica_play || l.s.musica_50 || l.s.musica_90)) out.push(`<span class="ll-chip" title="Música: ${l.s.musica_90 ? 'entera' : l.s.musica_50 ? 'más de la mitad' : 'le dio al play'}">🎵${l.s.musica_90 ? ' 90%' : l.s.musica_50 ? ' 50%' : ''}</span>`);
  if (r.test && l.s.test) out.push('<span class="ll-chip" title="Hizo el test">🧭 Test</span>');
  const v = r.votacion && votoTexto(l.id);
  if (v) out.push(`<span class="ll-chip" title="Su voto en la clase">🗳️ ${esc(v.length > 22 ? `${v.slice(0, 21)}…` : v)}</span>`);
  return out.join(' ');
}
function rowHtml(l) {
  const msgPreview = messageFor(l);
  const waBtn = l.step === 'comprado'
    ? '<span class="chip on">Ya compró ✓</span>'
    : l.phoneWa
    ? `<button type="button" class="btn wa ${l.s.wa_enviado ? 'sent' : ''}" data-wa="${esc(l.id)}" title="${esc(msgPreview)}">${l.s.wa_enviado ? 'Enviado ✓ · reenviar' : 'Enviar WhatsApp'}</button>`
    : '<span class="muted">Sin teléfono</span>';
  return `<tr>
    <td><div class="lead-name"><button type="button" class="lead-ficha" data-ficha-lead="${esc(l.id)}" title="Ver la ficha completa">${esc(l.name || '(sin nombre)')}</button> ${avatarChip(l)} ${faseChip(l.id)} ${preclaseChips(l)}</div><div class="lead-meta">${esc(l.email)}${l.phone ? ` · ${esc(l.phone)}` : ''}${l.s.trafico ? ` · ${l.s.trafico === 'frio' ? 'Tráfico frío' : 'Tráfico templado'}` : ''}</div></td>
    ${state.config.launches[state.launchCode]?.encuestaTag ? `<td>${l.s.encuesta ? '<span class="enc-si" title="Ha rellenado la encuesta">✓</span>' : l.s.encuesta_anterior ? '<span class="enc-ant" title="La rellenó en un lanzamiento anterior (ve las clases sin repetirla)">↺</span>' : '<span class="enc-no" title="No ha rellenado la encuesta">✗</span>'}</td>` : ''}
    ${(l.s.clases || ['clase1', 'clase2']).map((c) => `<td>${videoChip(l.s, c)}</td>`).join('')}
    ${l.s.conVip === false ? '' : `<td>${l.s.vip ? chip('VIP', 'on') : l.s.vip_anterior ? chip('VIP anterior') : chip('—')}</td>`}
    ${(l.s.nVideos || 1) > 1 ? `<td colspan="2"><div class="videos-chips">${videosChips(l.s, state.config.launches[state.launchCode])}</div></td>` : `<td>${liveChip(l.s)}</td>
    <td>${videoChip(l.s, 'replay')}</td>`}
    <td>${compraChip(l.s)}</td>
    <td class="num"><span class="score">${l.score}</span></td>
    <td><span class="estado st-${l.estado.id}"><span class="dot"></span>${l.estado.label}</span></td>
    <td><div class="wa-cell">${waBtn}${l.step === 'comprado' ? '' : `<span class="wa-step">${NEXT_STEPS[l.step]}</span>`}${outcomeSelect(l)}</div></td>
  </tr>`;
}

// Resultado del contacto de la setter (se guarda como etiqueta en GHL).
function outcomeSelect(l) {
  if (!l.s.wa_enviado && !l.outcome) return '';
  return `<select class="outcome" data-outcome="${esc(l.id)}" aria-label="Resultado del contacto">
    <option value="">Resultado…</option>
    ${OUTCOMES.map((o) => `<option value="${o.id}" ${l.outcome === o.id ? 'selected' : ''}>${o.label}</option>`).join('')}
  </select>`;
}

async function setOutcome(lead, outcome) {
  const prev = lead.outcome;
  const remove = OUTCOMES.filter((o) => o.id !== outcome && lead.s[`res_${o.id}`]).map((o) => tagFor(state.launchCode, `res_${o.id}`));
  const tags = outcome ? [tagFor(state.launchCode, `res_${outcome}`)] : [];
  for (const o of OUTCOMES) lead.s[`res_${o.id}`] = o.id === outcome;
  lead.outcome = outcome;
  render();
  try {
    if (tags.length || remove.length) await api('/api/apply-tags', { method: 'POST', body: { items: [{ id: lead.id, tags, remove }] } });
  } catch (ex) {
    for (const o of OUTCOMES) lead.s[`res_${o.id}`] = o.id === prev;
    lead.outcome = prev;
    render();
    notice(`No se pudo guardar el resultado en GHL: ${ex.message}`, true);
  }
}

document.addEventListener('change', (e) => {
  const sel = e.target.closest('[data-outcome]');
  if (!sel) return;
  const lead = state.leads.find((l) => l.id === sel.dataset.outcome);
  if (lead) setOutcome(lead, sel.value);
});

// ---------- Vista "Hoy" para la setter ----------
// Listas cortas y priorizadas: a quién escribir hoy.
function renderHoy() {
  const open = (l) => !l.s.compra && l.phoneWa;
  // Dentro de cada lista, primero las que encajan con un avatar comprador.
  const byScore = (a, b) => (b.avatar >= 0) - (a.avatar >= 0) || b.score - a.score;
  const buckets = [
    { id: 'calientes', title: '🔥 Muy calientes sin contactar', hint: 'Máxima prioridad', rows: state.leads.filter((l) => open(l) && !l.s.wa_enviado && l.estado.id === 'muy-caliente') },
    { id: 'vip', title: '⭐ VIP que no han comprado', hint: 'Pagaron la entrada: están cerca', rows: state.leads.filter((l) => open(l) && !l.s.wa_enviado && l.s.vip) },
    { id: 'grabacion', title: '🎬 Vieron la grabación y no han comprado', hint: '≥50% de la grabación', rows: state.leads.filter((l) => open(l) && !l.s.wa_enviado && !l.s.vip && l.estado.id !== 'muy-caliente' && grabVenta(l.s) >= 50) },
    { id: 'seguimiento', title: '💬 Seguimiento pendiente', hint: 'Respondieron, interesadas o no contestan', rows: state.leads.filter((l) => open(l) && ['respondio', 'interesada', 'no_contesta'].includes(l.outcome)) },
    { id: 'sinresultado', title: '📝 Contactadas sin resultado anotado', hint: 'Anota qué pasó', rows: state.leads.filter((l) => open(l) && l.s.wa_enviado && !l.outcome) },
  ];
  const seen = new Set();
  $('#hoy-lists').innerHTML = buckets.map((b) => {
    const rows = b.rows.filter((l) => !seen.has(l.id)).sort(byScore);
    rows.forEach((l) => seen.add(l.id));
    const shown = rows.slice(0, 30);
    return `<section class="card hoy-card">
      <h2>${b.title} <span class="badge">${rows.length}</span></h2>
      <p class="muted">${b.hint}</p>
      ${shown.length ? `<ul class="hoy-list">${shown.map(hoyItem).join('')}</ul>` : '<p class="muted">Nada pendiente aquí ✓</p>'}
      ${rows.length > shown.length ? `<p class="muted">…y ${rows.length - shown.length} más en la pestaña Leads.</p>` : ''}
    </section>`;
  }).join('');
}

function hoyItem(l) {
  const signals = [
    l.s.vip ? 'VIP' : '',
    directoVenta(l.s, 'final') ? 'Directo hasta el final' : directoVenta(l.s, 'asistio') ? 'Asistió al directo' : '',
    grabVenta(l.s) ? `Grabación ${grabVenta(l.s)}%` : '',
    watched(l.s, 'clase1') || watched(l.s, 'clase2') ? `Clases ${watched(l.s, 'clase1')}% / ${watched(l.s, 'clase2')}%` : '',
  ].filter(Boolean).join(' · ');
  return `<li class="hoy-item">
    <div class="hoy-main">
      <div><span class="lead-name">${esc(l.name || l.email)}</span> <span class="estado st-${l.estado.id}"><span class="dot"></span>${l.score}</span> ${avatarChip(l)}</div>
      <div class="lead-meta">${esc(signals || 'Sin actividad')} · ${NEXT_STEPS[l.step]}</div>
    </div>
    <div class="hoy-actions">
      <button type="button" class="btn wa ${l.s.wa_enviado ? 'sent' : ''}" data-wa="${esc(l.id)}">${l.s.wa_enviado ? 'Reenviar' : 'WhatsApp'}</button>
      ${outcomeSelect(l)}
    </div>
  </li>`;
}

function messageFor(l) {
  const launch = state.config.launches[state.launchCode];
  return buildMessage(state.config.templates[l.step], { nombre: l.firstName, contactId: l.id, launch, producto: nombreProducto(state.config) });
}

// Nombre del lead → su ficha completa (encuesta, voto, formulario y notas de GHL).
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ficha-lead]');
  if (b) abrirFichaLead(b.dataset.fichaLead);
});

// ---------- WhatsApp ----------
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-wa]');
  if (!btn) return;
  const lead = state.leads.find((l) => l.id === btn.dataset.wa);
  if (!lead) return;
  window.open(`https://wa.me/${lead.phoneWa}?text=${encodeURIComponent(messageFor(lead))}`, '_blank', 'noopener');
  if (lead.s.wa_enviado) return;
  lead.s.wa_enviado = true;
  render();
  try {
    await api('/api/apply-tags', { method: 'POST', body: { items: [{ id: lead.id, tags: [tagFor(state.launchCode, 'wa_enviado')] }] } });
  } catch (ex) {
    notice(`No se pudo marcar como contactado en GHL: ${ex.message}`, true);
  }
});

// ---------- CSV ----------
$('#btn-csv').addEventListener('click', () => {
  const head = ['Nombre', 'Email', 'Teléfono', 'Tráfico', 'Clase 1', 'Clase 2', 'VIP', 'Directo', 'Grabación', 'Compra', 'Fecha compra', 'Puntos', 'Estado', 'Siguiente mensaje', 'Contactado'];
  const v = (s, k) => (watched(s, k) ? `${watched(s, k)}%` : '');
  const live = (s) => (s.directo_final ? 'Hasta el final' : s.directo_60 ? '+60 min' : s.directo_asistio ? 'Asistió' : s.directo_click ? 'Clic' : '');
  const lines = filtered().map((l) => [l.name, l.email, l.phone, l.s.trafico, v(l.s, 'clase1'), v(l.s, 'clase2'), l.s.vip ? 'Sí' : '', live(l.s), v(l.s, 'replay'), l.s.compra_directo ? 'En directo' : l.s.compra ? 'Sí' : '', l.s.fecha_compra, l.score, l.estado.label, NEXT_STEPS[l.step], l.s.wa_enviado ? 'Sí' : '']);
  const csv = [head, ...lines].map((r) => r.map((x) => `"${String(x ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  a.download = `leads-${state.launchCode}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------- Sincronizar Zoom ----------
// Con varios vídeos en directo (lanzamientos de 2, 3 o 4 vídeos), se sincroniza cada uno ya celebrado.
$('#btn-zoom').addEventListener('click', async () => {
  const launch = state.config.launches[state.launchCode];
  if (!state.zoomConfigured) return notice('Zoom no está conectado todavía (faltan las variables ZOOM_* en Cloudflare).', true);
  const hoy = new Date().toISOString().slice(0, 10);
  const vids = videosDe(launch).filter((v) => v.zoomMeetingId && (!v.fecha || v.fecha <= hoy || v.k === 1));
  if (!vids.length) return notice('Añade el ID de la reunión de Zoom en la configuración del lanzamiento.', true);
  const btn = $('#btn-zoom');
  btn.disabled = true;
  const resumen = [];
  let failed = 0;
  try {
    const byEmail = new Map(state.leads.map((l) => [l.email, l]));
    const items = new Map(); // id → etiquetas
    for (const v of vids) {
      progress(0, 0, `Leyendo el informe de asistencia de Zoom${vids.length > 1 ? ` (${v.nombre})` : ''}…`);
      let report;
      try {
        report = await api(`/api/zoom-report?launch=${encodeURIComponent(state.launchCode)}${v.k > 1 ? `&v=${v.k}` : ''}`);
      } catch (e) {
        if (vids.length === 1) throw e;
        resumen.push(`${v.nombre}: ${e.message}`);
        continue;
      }
      let unmatched = 0;
      let n = 0;
      for (const a of report.attendees) {
        const lead = byEmail.get(a.email);
        if (!lead) { unmatched++; continue; }
        const sigs = [`${v.directo}_asistio`];
        if (a.minutes >= 60) sigs.push(`${v.directo}_60`);
        if (a.final) sigs.push(`${v.directo}_final`);
        const missing = sigs.filter((t) => !lead.s[t]).map((t) => tagFor(state.launchCode, t));
        if (missing.length) { items.set(lead.id, [...(items.get(lead.id) || []), ...missing]); n++; }
      }
      resumen.push(`${vids.length > 1 ? `${v.nombre}: ` : ''}${report.attendees.length} asistentes identificados, ${n} leads actualizados`
        + `${unmatched ? `, ${unmatched} emails que no están en este lanzamiento` : ''}`
        + `${report.anonymous ? `, ${report.anonymous} conexiones sin email` : ''}`);
    }
    const lista = [...items].map(([id, tags]) => ({ id, tags }));
    let done = 0;
    for (let i = 0; i < lista.length; i += 25) {
      const chunk = lista.slice(i, i + 25);
      const { results } = await api('/api/apply-tags', { method: 'POST', body: { items: chunk } });
      failed += results.filter((r) => !r.ok).length;
      done += chunk.length;
      progress(done, lista.length, `Etiquetando asistentes en GHL… ${done} de ${lista.length}`);
    }
    await loadLeads();
    notice(`Zoom: ${resumen.join(' · ')}${failed ? `. ${failed} no se pudieron etiquetar (vuelve a sincronizar)` : ''}.`, failed > 0);
  } catch (e) {
    notice(`No se pudo sincronizar Zoom: ${e.message}`, true);
  } finally {
    progress(null);
    btn.disabled = false;
  }
});

// ---------- Configuración ----------
const dlg = $('#config-dialog');
let editingCode = null; // null = lanzamiento nuevo

async function fillDateFields(selected) {
  const sel = $('#cfg-compra-fecha');
  if (!state.dateFields) {
    // Mientras llegan los campos de GHL, el guardado se queda como opción elegida (si se guarda antes, no se pierde).
    sel.innerHTML = selected ? `<option value="${esc(selected)}">Cargando campos de GHL…</option>` : '<option value="">Cargando campos de GHL…</option>';
    sel.value = selected || '';
    try {
      state.dateFields = (await api('/api/fields')).fields;
    } catch (e) {
      state.dateFields = null;
      sel.innerHTML = `<option value="${esc(selected || '')}">No se pudieron leer los campos de GHL (${esc(e.message)})</option>`;
      return;
    }
  }
  // Si no hay uno elegido, proponemos el que se llame "Fecha compra Raíces".
  const guess = selected || state.dateFields.find((f) => /fecha\s*compra\s*ra[ií]ces/i.test(f.name))?.id || '';
  sel.innerHTML = '<option value="">— Sin campo de fecha —</option>'
    + state.dateFields.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');
  sel.value = guess;
}

function fillTagList() {
  $('#tag-list').innerHTML = state.tags.map((t) => `<option value="${esc(t)}">`).join('');
  checkLaunchTags();
}

// Formato (cuántos vídeos) del lanzamiento que se edita: el de su embudo.
const formatoDeLanz = (l) => embudoInfo(l ? embudoDeLanz(l) : state.embudo)?.formato || 'webinar';
const V_CAMPOS = [
  ['fecha', 'Día', 'date'], ['hora', 'Hora (de España)', 'time'],
  ['zoomMeetingId', 'ID de Zoom <small>(solo si es en directo)</small>', 'text'], ['zoomJoinUrl', 'Enlace genérico de Zoom <small>(opcional)</small>', 'url'],
  ['replayUrl', 'Página del vídeo en GHL', 'url'], ['replayVideoUrl', 'Vídeo de Vimeo', 'url'],
  ['replayAt', 'Se ve desde <small>(vacío = 00:00 del día siguiente si es en directo)</small>', 'datetime-local'],
];
// Vídeos 2, 3 y 4 del lanzamiento (el 1 son los campos del directo de siempre).
function renderVideosCfg(l) {
  const formato = formatoDeLanz(editingCode ? l : null);
  const vs = videosDe({ ...l, formato });
  const sec = $('#cfg-videos-sec');
  sec.hidden = vs.length <= 1;
  sec.dataset.formato = formato;
  // El vídeo 1 usa las casillas del directo: con varios vídeos se llaman como él (PLC 1, Vídeo 1).
  const n1 = vs.length > 1 ? vs[0].nombre : '';
  const rotulo = (sel, multi) => { const el = $(sel)?.previousElementSibling; if (el) { el.dataset.def ??= el.innerHTML; el.innerHTML = n1 ? multi : el.dataset.def; } };
  rotulo('#cfg-directo-fecha', `Día del ${n1}`);
  rotulo('#cfg-directo-hora', `Hora del ${n1} <small>(hora de España)</small>`);
  const h3Zoom = $('#cfg-zoom-id').closest('.cfg-sec')?.querySelector('h3');
  if (h3Zoom) { h3Zoom.dataset.def ??= h3Zoom.textContent; h3Zoom.textContent = n1 ? `${n1} en Zoom (solo si es en directo)` : h3Zoom.dataset.def; }
  if (vs.length <= 1) { $('#cfg-videos').innerHTML = ''; return; }
  $('#cfg-videos-titulo').textContent = `${FORMATOS[formato].label}: ${vs.slice(1).map((v) => v.nombre).join(', ')}`;
  $('#cfg-videos-nota').textContent = `El ${vs[0].nombre} usa las casillas de arriba (fechas y Zoom) y su vídeo y su página van en la pestaña «Páginas» (Directo y grabación, Página de replay). Si un vídeo es grabado, deja vacío su Zoom. En el ${vs.at(-1).nombre} se hace la venta.`;
  $('#cfg-videos').innerHTML = vs.slice(1).map((v) => `<fieldset class="cfg-video" data-k="${v.k}"><legend>${esc(v.nombre)}${v.venta ? ' · vídeo de venta' : ''}</legend><div class="grid2">
    ${V_CAMPOS.map(([c, label, type]) => `<label class="field"><span>${label}</span><input id="cfg-v${v.k}-${c === 'replayUrl' ? 'replay' : c === 'replayVideoUrl' ? 'replay-video' : c === 'replayAt' ? 'replay-at' : c}" data-vc="${c}" type="${type}" value="${esc(v[c] || '')}"${c === 'zoomMeetingId' ? ' inputmode="numeric"' : ''}></label>`).join('')}
  </div></fieldset>`).join('');
}
function readVideosCfg() {
  return $$('#cfg-videos .cfg-video').map((fs) => Object.fromEntries($$('[data-vc]', fs).map((i) => [i.dataset.vc, i.value.trim()])));
}

// Prelanzamiento del embudo (clases y VIP): solo se ven las casillas que tocan.
function pintarPrelanzamientoCfg(l) {
  const emb = embudoInfo(editingCode ? embudoDeLanz(l) : state.embudo) || {};
  const preclase = emb.preclase !== false;
  const nc = !preclase ? 0 : [1, 2, 3].includes(emb.clases) ? emb.clases : 2;
  const vip = emb.vip !== false;
  $$('#config-dialog [data-clase]').forEach((el) => { el.hidden = Number(el.dataset.clase) > nc; });
  // Sin área de recursos preclase: fuera sus páginas, la encuesta de la página y las clases.
  $$('#config-dialog [data-preclase]').forEach((el) => { el.hidden = !preclase; });
  $('#tab-pagina-txt').textContent = preclase ? 'Preclase' : 'Directo y grabación';
  $$('#config-dialog [data-vip]').forEach((el) => { el.hidden = !vip; });
}

function openConfig(code) {
  if (!$('#config-dialog').open) $('.tab[data-tab="launch"]').click(); // al abrir, siempre en la primera pestaña
  editingCode = code && state.config.launches[code] ? code : null;
  const pick = $('#cfg-launch-pick');
  pick.innerHTML = '<option value="">— Nuevo lanzamiento —</option>'
    + launchesSorted().map(([c, l]) => `<option value="${esc(c)}">${esc(l.name)} (${esc(c)})</option>`).join('');
  pick.value = editingCode || '';
  // Las etiquetas de VIP y compra son fijas: un lanzamiento nuevo hereda las del último.
  // Del mismo embudo; si aún no tiene, la base de su plantilla de agencia (o el último de cualquiera).
  const base = embudoInfo(state.embudo)?.base;
  const last = launchesSorted().find(([, x]) => embudoDeLanz(x) === state.embudo)?.[1] || (base ? { ...base } : launchesSorted()[0]?.[1] || {});
  const l = editingCode ? state.config.launches[editingCode]
    : {
      vipTag: last.vipTag, compraTag: last.compraTag, llamadaTag: last.llamadaTag, compraDateField: last.compraDateField,
      // La encuesta es siempre la misma: misma URL y misma etiqueta.
      encuestaTag: last.encuestaTag, encuestaUrl: last.encuestaUrl,
      precioVip: last.precioVip, precioPrograma: last.precioPrograma, precioFraccionado: last.precioFraccionado, pago: last.pago, oferta: last.oferta, fraccionadoTag: last.fraccionadoTag, unicoTag: last.unicoTag, publiTag: last.publiTag, organicoTag: last.organicoTag,
      vipContadorBase: embudoInfo(state.embudo)?.vipContadorBase ?? last.vipContadorBase,
      // Las clases son las mismas en cada lanzamiento: se heredan sus vídeos y textos.
      clase1Url: last.clase1Url, clase2Url: last.clase2Url, clase3Url: last.clase3Url, textos: last.textos,
      // Los recursos de la preclase se heredan sin fechas; los que pidió el embudo al crearlo, activos.
      recursosPre: heredarRecursos(last.recursosPre, embudoInfo(state.embudo)?.recursos),
      ...(base && !launchesSorted().some(([, x]) => embudoDeLanz(x) === state.embudo) ? { barra: base.barra } : {}),
      inicioCaptacion: new Date().toISOString().slice(0, 10),
    };
  $('#cfg-code').value = editingCode || '';
  $('#cfg-code').readOnly = Boolean(editingCode);
  $('#cfg-name').value = l.name || '';
  $('#cfg-registro').value = l.registroTag || '';
  $('#cfg-vip').value = l.vipTag || '';
  $('#cfg-compra').value = l.compraTag || '';
  $('#cfg-encuesta-tag').value = l.encuestaTag || '';
  $('#cfg-llamada-tag').value = l.llamadaTag || '';
  $('#cfg-encuesta-url').value = l.encuestaUrl || '';
  $('#cfg-inicio').value = l.inicioCaptacion || '';
  $('#cfg-fin-captacion').value = l.finCaptacion || '';
  $('#cfg-apertura-carrito').value = l.aperturaCarrito || '';
  $('#cfg-directo-fecha').value = l.fechaDirecto || '';
  $('#cfg-directo-hora').value = l.horaDirecto || '';
  $('#cfg-login-url').value = l.loginUrl || '';
  $('#cfg-recursos-url').value = l.recursosUrl || '';
  $('#cfg-clase1-url').value = l.clase1Url || '';
  $('#cfg-clase1-at').value = l.clase1At || '';
  $('#cfg-clase2-url').value = l.clase2Url || '';
  $('#cfg-clase2-at').value = l.clase2At || '';
  $('#cfg-clase3-url').value = l.clase3Url || '';
  $('#cfg-clase3-at').value = l.clase3At || '';
  $('#cfg-replay-video').value = l.replayVideoUrl || '';
  $('#cfg-replay-at').value = l.replayAt || '';
  $('#cfg-vip-url').value = l.vipUrl || '';
  $('#cfg-vip-base').value = l.vipContadorBase ?? embudoInfo(embudoDeLanz(l))?.vipContadorBase ?? (esPrincipal() ? 41 : 0);
  $('#cfg-whatsapp-url').value = l.whatsappUrl || '';
  $('#cfg-gracias-video').value = l.graciasVideoUrl || '';
  $('#cfg-gracias-url').value = l.graciasUrl || '';
  $('#cfg-cierre').value = l.cierreCarrito || '';
  $('#cfg-calendario-url').value = l.calendarioUrl || '';
  renderBarraEditor(l.barra || {});
  renderEnlacesEditor(l.enlaces || {});
  renderTextosEditor(l.textos || {});
  renderPhaseNow(l);
  checkLaunchTags();
  fillDateFields(l.compraDateField);
  $('#cfg-zoom-id').value = l.zoomMeetingId || '';
  $('#cfg-zoom-url').value = l.zoomJoinUrl || '';
  $('#cfg-replay').value = l.replayUrl || '';
  $('#cfg-raices').value = l.raicesUrl || '';
  $('#cfg-venta').value = l.ventaUrl || '';
  $('#cfg-venta-fraccionado').value = l.ventaFraccionadoUrl || '';
  $('#cfg-llamada').value = l.llamadaUrl || '';
  $('#cfg-precio-vip').value = l.precioVip || '';
  $('#cfg-precio-programa').value = l.precioPrograma || '';
  $('#cfg-precio-fraccionado').value = l.precioFraccionado || '';
  $('#cfg-fraccionado-tag').value = l.fraccionadoTag || '';
  $('#cfg-unico-tag').value = l.unicoTag || '';
  pintarPago('cfg', l.pago);
  pintarOfertaEditor(l.oferta);
  $('#cfg-publi-tag').value = l.publiTag || '';
  $('#cfg-organico-tag').value = l.organicoTag || '';
  $('#cfg-inversion').value = l.inversion || '';
  $('#cfg-meta-filtro').value = l.metaFiltro || '';
  $('#cfg-email-filtro').value = l.emailFiltro || '';
  renderMetaNaming();
  $('#cfg-digest-email').value = state.config.digestEmail || '';
  fillFormAdsFields();
  renderAccesosEditor(state.config.accesos);
  $('#cfg-status').textContent = '';
  renderSnippets();
  renderSnapshotBox();
  renderVideosCfg(l);
  pintarPrelanzamientoCfg(l);
  pintarRecursosCfg(l.recursosPre);
  checkLaunchTags();
  renderGuia();
  if (!dlg.open) dlg.showModal();
}

$('#cfg-launch-pick').addEventListener('change', (e) => openConfig(e.target.value));
$('#btn-config').addEventListener('click', () => (enVsl() ? openVslConfig() : enMeteo() ? abrirMeteoDialog(state.meteo.code, { embudo: state.embudo }) : openConfig(state.launchCode)));
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="new-launch"]')) openConfig(null);
});
// Pestañas dentro de cada ventana (Configuración, Equipo): solo afectan a su ventana.
$$('.tab').forEach((t) => t.addEventListener('click', () => {
  const box = t.closest('dialog');
  $$('.tab', box).forEach((x) => x.classList.toggle('active', x === t));
  $$('.tab-panel', box).forEach((p) => { p.hidden = p.dataset.panel !== t.dataset.tab; });
}));

// ---------- Etiquetas que deben cambiar en cada lanzamiento ----------
// Registro: una nueva por lanzamiento. Encuesta, VIP y compra: siempre las mismas (con su «foto»).
function tagProblems() {
  const code = editingCode || $('#cfg-code').value.trim().toLowerCase();
  const others = Object.entries(state.config.launches).filter(([c]) => c !== code);
  const val = (sel) => $(sel).value.trim().toLowerCase();
  const reg = val('#cfg-registro');
  const enc = val('#cfg-encuesta-tag');
  const fixed = [val('#cfg-vip'), val('#cfg-compra'), val('#cfg-llamada-tag')].filter(Boolean);
  const usedBy = (tag, key) => others.filter(([, l]) => l[key] === tag).map(([, l]) => l.name || '');
  const out = { registro: '', encuesta: '' };
  if (reg) {
    const u = usedBy(reg, 'registroTag');
    if (u.length) out.registro = `Ya es la etiqueta de registro de «${u.join('», «')}». Crea una nueva para este lanzamiento.`;
    else if (fixed.includes(reg)) out.registro = 'Es la misma que la de VIP o compra. Elige la etiqueta del formulario de registro.';
  }
  if (enc) {
    // La encuesta puede repetirse en todos los lanzamientos (la «foto» separa a quien la hizo antes).
    if (enc === reg) out.encuesta = 'Es la misma que la de registro: todas verían las clases sin rellenar la encuesta.';
    else if (fixed.includes(enc)) out.encuesta = 'Es la misma que la de VIP o compra. Elige la etiqueta que añade la encuesta.';
  }
  return out;
}

// Campos de la pestaña «Etiquetas GHL».
const CAMPOS_ETIQUETA = ['cfg-registro', 'cfg-encuesta-tag', 'cfg-vip', 'cfg-compra', 'cfg-llamada-tag', 'cfg-publi-tag', 'cfg-organico-tag', 'cfg-unico-tag', 'cfg-fraccionado-tag'];
function checkLaunchTags() {
  const p = tagProblems();
  // Además de los avisos de registro y encuesta, cualquier etiqueta que no exista (aún) en el GHL del cliente.
  const existentes = state.tags?.length ? new Set(state.tags.map((t) => String(t).toLowerCase())) : null;
  for (const id of CAMPOS_ETIQUETA) {
    const input = document.getElementById(id);
    const v = input.value.trim().toLowerCase();
    const k = id === 'cfg-registro' ? 'registro' : id === 'cfg-encuesta-tag' ? 'encuesta' : '';
    const msg = (k && p[k]) || (v && existentes && !existentes.has(v) ? `«${v}» no existe en tu GHL: créala allí (o revisa que esté bien escrita).` : '');
    let el = k ? $(`#warn-${k}`) : input.parentElement.querySelector('.tag-warn');
    if (!el) { input.insertAdjacentHTML('afterend', '<small class="tag-warn" hidden></small>'); el = input.nextElementSibling; }
    el.textContent = msg ? `⚠ ${msg}` : '';
    el.hidden = !msg;
  }
  pintarEtiquetasAuto();
  const code = editingCode || $('#cfg-code').value.trim().toLowerCase();
  const prev = launchesSorted().filter(([c]) => c !== code).slice(0, 3);
  $('#tags-used').innerHTML = prev.length
    ? `Etiquetas de registro de lanzamientos anteriores (no las repitas): ${prev.map(([, l]) => `<span>${esc(l.name)}: <code>${esc(l.registroTag || '–')}</code></span>`).join(' · ')}`
    : '';
}
[...CAMPOS_ETIQUETA.map((id) => `#${id}`), '#cfg-code'].forEach((sel) => $(sel).addEventListener('input', checkLaunchTags));

// Etiquetas que pone el dashboard solo (con el código del lanzamiento delante), según sus clases, VIP y vídeos.
function pintarEtiquetasAuto() {
  const code = editingCode || $('#cfg-code').value.trim().toLowerCase() || '<código>';
  const l = { ...(state.config.launches[editingCode] || {}), formato: formatoDeLanz(editingCode ? state.config.launches[editingCode] : null) };
  const emb = embudoInfo(editingCode ? embudoDeLanz(state.config.launches[editingCode]) : state.embudo);
  if (!editingCode && emb) { l.nClases = emb.clases || 2; l.vip = emb.vip !== false; }
  const pct = '25 · 50 · 75 · 90';
  const filas = [
    ...clasesDe(l).map((c, i) => [`Clase ${i + 1} vista`, `${code}_${c}_…`, `% visto: ${pct}`]),
    ...videosDe(l).flatMap((v) => [
      [`${videosDe(l).length > 1 ? v.nombre : 'Directo'} en Zoom`, `${code}_${v.directo}_…`, 'click · asistio · 60 · final'],
      [`${videosDe(l).length > 1 ? `${v.nombre} grabado` : 'Grabación vista'}`, `${code}_${v.replay}_…`, `% visto: ${pct}`],
    ]),
    ['WhatsApp enviado', `${code}_wa_enviado`, 'al pulsar «WhatsApp» en Setting hoy'],
    ['Resultado del contacto', `${code}_res_…`, 'respondio · interesada · llamada · no_contesta · no_interesada'],
    ['«Foto» al crear el lanzamiento', `${code}_…_previo`, `${conVip(l) ? 'vip_previo · ' : ''}compra_previo · llamada_previo`],
  ];
  $('#cfg-tags-auto').innerHTML = `<div class="table-scroll"><table class="metric-table"><thead><tr><th>Qué marca</th><th>Etiqueta</th><th>Variantes</th></tr></thead>
    <tbody>${filas.map(([a, b, c]) => `<tr><td>${esc(a)}</td><td><code>${esc(b)}</code></td><td class="muted">${esc(c)}</td></tr>`).join('')}</tbody></table></div>`;
}

// ---------- Guía por colores: qué cambia en cada lanzamiento ----------
// nuevo = valor nuevo siempre · revisar = suele repetirse, pero hay que comprobarlo · fijo = no se toca.
// `key` es el campo del lanzamiento (para avisar si se repite el de otro lanzamiento); `opcional` no cuenta como «falta».
const CICLO = [
  { id: 'cfg-code', c: 'nuevo', label: 'Código' },
  { id: 'cfg-name', c: 'nuevo', label: 'Nombre', key: 'name' },
  { id: 'cfg-registro', c: 'nuevo', label: 'Etiqueta de registro' },
  { id: 'cfg-encuesta-tag', c: 'fijo', label: 'Etiqueta de encuesta', opcional: true },
  { id: 'cfg-encuesta-url', c: 'fijo', label: 'Enlace de la encuesta', key: 'encuestaUrl', opcional: true },
  { id: 'cfg-inicio', c: 'nuevo', label: 'Inicio de captación', key: 'inicioCaptacion' },
  { id: 'cfg-directo-fecha', c: 'nuevo', label: 'Día del directo', key: 'fechaDirecto' },
  { id: 'cfg-directo-hora', c: 'nuevo', label: 'Hora del directo' },
  { id: 'cfg-fin-captacion', c: 'nuevo', label: 'Fin de la publi', opcional: true },
  { id: 'cfg-apertura-carrito', c: 'nuevo', label: 'Apertura del carrito', opcional: true },
  { id: 'cfg-zoom-id', c: 'nuevo', label: 'ID de Zoom', key: 'zoomMeetingId' },
  { id: 'cfg-zoom-url', c: 'nuevo', label: 'Enlace genérico de Zoom', key: 'zoomJoinUrl', opcional: true },
  { id: 'cfg-inversion', c: 'nuevo', label: 'Inversión en anuncios', opcional: true },
  { id: 'cfg-meta-filtro', c: 'nuevo', label: 'Campañas de Meta', key: 'metaFiltro', opcional: true },
  { id: 'cfg-clase1-at', c: 'nuevo', label: 'Clase 1 · desbloqueo', key: 'clase1At' },
  { id: 'cfg-clase2-at', c: 'nuevo', label: 'Clase 2 · desbloqueo', key: 'clase2At' },
  { id: 'cfg-replay-video', c: 'nuevo', label: 'Vídeo de la grabación', key: 'replayVideoUrl', opcional: true },
  { id: 'cfg-whatsapp-url', c: 'nuevo', label: 'Grupo de WhatsApp', key: 'whatsappUrl' },
  { id: 'cfg-gracias-url', c: 'revisar', label: 'Página de gracias', opcional: true },
  { id: 'cfg-gracias-video', c: 'revisar', label: 'Vídeo de gracias', opcional: true },
  { id: 'cfg-cierre', c: 'nuevo', label: 'Cierre del carrito', key: 'cierreCarrito' },
  { id: 'cfg-replay', c: 'revisar', label: 'Página de replay' },
  { id: 'cfg-raices', c: 'revisar', label: 'Página de venta de Raíces' },
  { id: 'cfg-venta', c: 'revisar', label: 'Pago único (ThriveCart)' },
  { id: 'cfg-venta-fraccionado', c: 'revisar', label: 'Pago fraccionado (Hotmart)' },
  { id: 'cfg-llamada', c: 'revisar', label: 'Reservar llamada', opcional: true },
  { id: 'cfg-precio-vip', c: 'revisar', label: 'Precio VIP' },
  { id: 'cfg-precio-programa', c: 'revisar', label: 'Precio Raíces · único' },
  { id: 'cfg-precio-fraccionado', c: 'revisar', label: 'Precio Raíces · fraccionado', opcional: true },
  { id: 'cfg-login-url', c: 'revisar', label: 'Página de login' },
  { id: 'cfg-recursos-url', c: 'revisar', label: 'Página preclase' },
  { id: 'cfg-clase1-url', c: 'revisar', label: 'Clase 1 · vídeo' },
  { id: 'cfg-clase2-url', c: 'revisar', label: 'Clase 2 · vídeo' },
  { id: 'cfg-replay-at', c: 'revisar', label: 'Grabación · desbloqueo', opcional: true },
  { id: 'cfg-vip-url', c: 'revisar', label: 'Entrada VIP · pago' },
  { id: 'cfg-vip-base', c: 'revisar', label: 'Contador VIP' },
  { id: 'cfg-calendario-url', c: 'revisar', label: 'Añadir al calendario', opcional: true },
  { id: 'cfg-rec-musica-url', c: 'revisar', label: 'Música · MP3' },
  { id: 'cfg-rec-test-url', c: 'revisar', label: 'Test · enlace' },
  { id: 'cfg-rec-test-tag', c: 'revisar', label: 'Test · etiqueta al completarlo' },
  { id: 'cfg-rec-test-at', c: 'nuevo', label: 'Test · desbloqueo' },
  { id: 'cfg-rec-votacion-pregunta', c: 'revisar', label: 'Votación · pregunta' },
  { id: 'cfg-rec-votacion-opciones', c: 'revisar', label: 'Votación · opciones' },
  { id: 'cfg-rec-descargable-url', c: 'revisar', label: 'Descargable · enlace' },
  { id: 'cfg-vip', c: 'fijo' },
  { id: 'cfg-compra', c: 'fijo' },
  { id: 'cfg-llamada-tag', c: 'fijo' },
  { id: 'cfg-publi-tag', c: 'fijo' },
  { id: 'cfg-organico-tag', c: 'fijo' },
  { id: 'cfg-unico-tag', c: 'fijo' },
  { id: 'cfg-fraccionado-tag', c: 'fijo' },
  { id: 'cfg-compra-fecha', c: 'fijo' },
  { id: 'cfg-digest-email', c: 'fijo' },
];
const CICLO_BADGE = {
  nuevo: '<span class="badge-cambia">Nuevo en cada lanzamiento</span>',
  revisar: '<span class="badge-revisa">Revisar</span>',
  fijo: '<span class="badge-fija">Siempre igual</span>',
};

(function decorateCiclo() {
  for (const f of CICLO) {
    const field = document.getElementById(f.id)?.closest('.field');
    if (!field) continue;
    field.classList.add(`ciclo-${f.c}`);
    field.querySelector('span')?.insertAdjacentHTML('beforeend', ` ${CICLO_BADGE[f.c]}`);
    field.addEventListener('input', renderGuia);
    field.addEventListener('change', renderGuia);
  }
}());

function goToField(id) {
  const el = document.getElementById(id);
  const panel = el?.closest('.tab-panel')?.dataset.panel;
  if (panel) $(`.tab[data-tab="${panel}"]`)?.click();
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el?.focus({ preventScroll: true });
}

// Estado de cada campo que cambia o hay que revisar: falta, repetido de otro lanzamiento, o listo.
function fieldStatus(f, others, tagIssues) {
  const v = document.getElementById(f.id).value.trim();
  let issue = '';
  if (f.id === 'cfg-registro' && tagIssues.registro) issue = 'repetida';
  else if (f.id === 'cfg-encuesta-tag' && tagIssues.encuesta) issue = 'repetida';
  else if (v && f.key) {
    const same = others.find(([, l]) => String(l[f.key] ?? '').trim().toLowerCase() === v.toLowerCase());
    if (same) issue = `igual que en «${same[1].name || same[0]}»`;
  }
  // Con varios vídeos, el 1 puede ser grabado: su Zoom es opcional.
  const opcional = f.opcional || (f.id === 'cfg-zoom-id' && !$('#cfg-videos-sec').hidden)
    || Boolean(document.getElementById(f.id).closest('[data-clase][hidden], [data-vip][hidden], [data-preclase][hidden]'));
  const st = issue ? 'warn' : v ? 'ok' : opcional ? 'opt' : 'falta';
  return { st, txt: issue || (v ? 'listo' : opcional ? 'vacío (opcional)' : 'falta') };
}
const GUIA_ICON = { ok: '✓', warn: '⚠', opt: '○', falta: '✗' };

// Checklist de cada pestaña, agrupada por sus secciones, y el estado en la cabecera de cada sección.
let guiaHtml = {};
function renderGuia() {
  const code = editingCode || $('#cfg-code').value.trim().toLowerCase();
  const others = Object.entries(state.config.launches).filter(([c]) => c !== code);
  const tagIssues = tagProblems();
  for (const [panel, box] of [['launch', '#guia-check'], ['etiquetas', '#guia-check-etiquetas'], ['pagina', '#guia-check-pagina'], ['embudo', '#guia-check-embudo']]) {
    const groups = $$(`.tab-panel[data-panel="${panel}"] .cfg-sec`).filter((sec) => !sec.hidden).map((sec) => {
      const items = $$('.field', sec).filter((el) => !el.hidden).map((el) => CICLO.find((f) => f.id === $('input, select, textarea', el)?.id))
        .filter((f) => f && f.c !== 'fijo')
        .map((f) => ({ f, ...fieldStatus(f, others, tagIssues) }));
      const falta = items.filter((i) => i.st === 'falta').length;
      const warn = items.filter((i) => i.st === 'warn').length;
      const status = $('.cfg-sec-status', sec);
      if (status) {
        status.className = `cfg-sec-status ${falta ? 'guia-falta' : warn ? 'guia-warn' : items.length ? 'guia-ok' : ''}`;
        status.textContent = falta ? `Falta${falta > 1 ? 'n' : ''} ${falta}` : warn ? `Revisa ${warn}` : items.length ? '✓ Completo' : '';
      }
      return { title: $('h3', sec).textContent, items };
    }).filter((g) => g.items.length);
    const total = groups.flatMap((g) => g.items);
    const listos = total.filter((i) => i.st === 'ok' || i.st === 'opt').length;
    const html = `<p class="guia-sub"><strong>${listos} de ${total.length}</strong> listos · pulsa uno para ir a él</p>
      <div class="guia-groups">${groups.map((g) => `<div class="guia-group"><span class="guia-group-t">${esc(g.title)}</span><div class="guia-items">${g.items.map((i) => `<button type="button" class="guia-item guia-${i.st}" data-goto="${i.f.id}">${GUIA_ICON[i.st]} ${esc(i.f.label)} <small>${esc(i.txt)}</small></button>`).join('')}</div></div>`).join('')}</div>`;
    // Solo se repinta si algo cambió: el «change» al salir de un campo no debe borrar el botón que se está pulsando.
    if (html !== guiaHtml[panel]) $(box).innerHTML = guiaHtml[panel] = html;
  }
}
$('#guia-check-embudo').addEventListener('click', (e) => {
  const b = e.target.closest('[data-goto]');
  if (b) goToField(b.dataset.goto);
});
$('#guia-check-pagina').addEventListener('click', (e) => {
  const b = e.target.closest('[data-goto]');
  if (b) goToField(b.dataset.goto);
});
$('#guia-check-etiquetas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-goto]');
  if (b) goToField(b.dataset.goto);
});
$('#guia-check').addEventListener('click', (e) => {
  const b = e.target.closest('[data-goto]');
  if (b) goToField(b.dataset.goto);
});

// ---------- Recursos de la preclase (música, test, votación, descargable) ----------
function nClasesForm() {
  const emb = embudoInfo(editingCode ? embudoDeLanz(state.config.launches[editingCode]) : state.embudo) || {};
  return emb.preclase === false ? 0 : [1, 2, 3].includes(emb.clases) ? emb.clases : 2;
}
function heredarRecursos(prev, tipos) {
  const r = sanitizeRecursos(prev, 3);
  for (const t of tipos || []) if (r[t]) r[t].activo = true;
  r.test.at = '';
  r.descargable.at = '';
  return r;
}
function pintarRecursosCfg(recursosPre) {
  const nc = Math.max(1, nClasesForm());
  const r = sanitizeRecursos(recursosPre, nc);
  $$('#cfg-rec-sec [data-rec-clases]').forEach((sel) => { sel.innerHTML = Array.from({ length: nc }, (_, i) => `<option value="clase${i + 1}">Clase ${i + 1}</option>`).join(''); });
  for (const t of RECURSOS_EXTRA) $(`#cfg-rec-${t}-on`).checked = r[t].activo;
  $('#cfg-rec-musica-nombre').value = r.musica.nombre;
  $('#cfg-rec-musica-url').value = r.musica.url;
  $('#cfg-rec-musica-tras').value = r.musica.tras;
  $('#cfg-rec-musica-texto').value = r.musica.texto;
  $('#cfg-rec-test-nombre').value = r.test.nombre;
  $('#cfg-rec-test-url').value = r.test.url;
  $('#cfg-rec-test-tag').value = r.test.tag;
  $('#cfg-rec-test-at').value = r.test.at;
  $('#cfg-rec-votacion-pregunta').value = r.votacion.pregunta;
  $('#cfg-rec-votacion-tras').value = r.votacion.tras;
  $('#cfg-rec-votacion-opciones').value = r.votacion.opciones.map((o) => o.texto).join('\n');
  $('#cfg-rec-descargable-nombre').value = r.descargable.nombre;
  $('#cfg-rec-descargable-url').value = r.descargable.url;
  $('#cfg-rec-descargable-at').value = r.descargable.at;
  pintarRecursosVis();
}
// Las opciones de la votación van por posición (o1, o2…): los votos guardan esa posición.
function leerRecursosCfg() {
  return sanitizeRecursos({
    musica: { activo: $('#cfg-rec-musica-on').checked, nombre: $('#cfg-rec-musica-nombre').value, url: $('#cfg-rec-musica-url').value, tras: $('#cfg-rec-musica-tras').value, texto: $('#cfg-rec-musica-texto').value },
    test: { activo: $('#cfg-rec-test-on').checked, nombre: $('#cfg-rec-test-nombre').value, url: $('#cfg-rec-test-url').value, tag: $('#cfg-rec-test-tag').value, at: $('#cfg-rec-test-at').value },
    votacion: { activo: $('#cfg-rec-votacion-on').checked, pregunta: $('#cfg-rec-votacion-pregunta').value, opciones: $('#cfg-rec-votacion-opciones').value, tras: $('#cfg-rec-votacion-tras').value },
    descargable: { activo: $('#cfg-rec-descargable-on').checked, nombre: $('#cfg-rec-descargable-nombre').value, url: $('#cfg-rec-descargable-url').value, at: $('#cfg-rec-descargable-at').value },
  }, Math.max(1, nClasesForm()));
}
// Campos de cada recurso solo si está activo, y el orden de las etapas tal y como lo verá la lead.
function pintarRecursosVis() {
  for (const t of RECURSOS_EXTRA) $$(`#cfg-rec-sec [data-rec="${t}"] [data-rec-campo]`).forEach((el) => { el.hidden = !$(`#cfg-rec-${t}-on`).checked; });
  const nc = nClasesForm();
  const rec = leerRecursosCfg();
  const sim = { encuestaTag: $('#cfg-encuesta-tag').value.trim(), clase1At: $('#cfg-clase1-at').value, clase2At: $('#cfg-clase2-at').value, clase3At: $('#cfg-clase3-at').value, recursosPre: rec };
  const dentro = (id) => ['musica', 'votacion'].filter((t) => tieneRecurso(sim, t) && rec[t].tras === id).map((t) => (t === 'musica' ? '🎵' : '🗳️')).join('');
  const faltan = RECURSOS_EXTRA.filter((t) => rec[t].activo && !tieneRecurso(sim, t));
  $('#cfg-rec-etapas').innerHTML = `<strong>Etapas de la página:</strong> ${etapasPreclase(sim, nc).map((e) => `<span class="rec-etapa">${e.n} · ${esc(e.label)}${dentro(e.id) ? ` + ${dentro(e.id)}` : ''}</span>`).join('')}`
    + (faltan.length ? `<p class="muted small">Sin completar (no salen en la página): ${faltan.map((t) => TIPOS_RECURSO.find((x) => x.id === t).label).join(', ')}. ${faltan.includes('votacion') ? 'La votación necesita pregunta y al menos 2 opciones.' : ''}</p>` : '');
}
$('#cfg-rec-sec').addEventListener('input', pintarRecursosVis);
$('#cfg-rec-sec').addEventListener('change', () => { pintarRecursosVis(); renderGuia(); });
['#cfg-clase1-at', '#cfg-clase2-at', '#cfg-clase3-at', '#cfg-encuesta-tag'].forEach((sel) => $(sel).addEventListener('change', pintarRecursosVis));

function readForm() {
  const code = $('#cfg-code').value.trim().toLowerCase();
  if (!LAUNCH_CODE_RE.test(code)) throw new Error('El código solo puede tener minúsculas, números y guiones (2-24 caracteres).');
  const registroTag = $('#cfg-registro').value.trim().toLowerCase();
  if (!registroTag) throw new Error('Elige la etiqueta de registro.');
  if (!editingCode && state.config.launches[code]) throw new Error(`Ya existe un lanzamiento con el código "${code}".`);
  const prev = state.config.launches[code] || {};
  return {
    code,
    launch: {
      ...prev,
      name: $('#cfg-name').value.trim() || code,
      registroTag,
      vipTag: $('#cfg-vip').value.trim().toLowerCase(),
      compraTag: $('#cfg-compra').value.trim().toLowerCase(),
      encuestaTag: $('#cfg-encuesta-tag').value.trim().toLowerCase(),
      llamadaTag: $('#cfg-llamada-tag').value.trim().toLowerCase(),
      encuestaUrl: $('#cfg-encuesta-url').value.trim(),
      compraDateField: $('#cfg-compra-fecha').value,
      inicioCaptacion: $('#cfg-inicio').value,
      finCaptacion: $('#cfg-fin-captacion').value,
      aperturaCarrito: $('#cfg-apertura-carrito').value,
      fechaDirecto: $('#cfg-directo-fecha').value,
      horaDirecto: $('#cfg-directo-hora').value,
      loginUrl: $('#cfg-login-url').value.trim(),
      recursosUrl: $('#cfg-recursos-url').value.trim(),
      clase1Url: $('#cfg-clase1-url').value.trim(),
      clase1At: $('#cfg-clase1-at').value,
      clase2Url: $('#cfg-clase2-url').value.trim(),
      clase2At: $('#cfg-clase2-at').value,
      clase3Url: $('#cfg-clase3-url').value.trim(),
      clase3At: $('#cfg-clase3-at').value,
      replayVideoUrl: $('#cfg-replay-video').value.trim(),
      replayAt: $('#cfg-replay-at').value,
      vipUrl: $('#cfg-vip-url').value.trim(),
      vipContadorBase: $('#cfg-vip-base').value.trim(),
      whatsappUrl: $('#cfg-whatsapp-url').value.trim(),
      graciasVideoUrl: $('#cfg-gracias-video').value.trim(),
      graciasUrl: $('#cfg-gracias-url').value.trim(),
      cierreCarrito: $('#cfg-cierre').value,
      calendarioUrl: $('#cfg-calendario-url').value.trim(),
      barra: readBarraEditor(),
      enlaces: readEnlacesEditor(),
      textos: readTextosEditor(),
      zoomMeetingId: $('#cfg-zoom-id').value,
      zoomJoinUrl: $('#cfg-zoom-url').value.trim(),
      videos: readVideosCfg(),
      replayUrl: $('#cfg-replay').value.trim(),
      raicesUrl: $('#cfg-raices').value.trim(),
      ventaUrl: $('#cfg-venta').value.trim(),
      ventaFraccionadoUrl: $('#cfg-venta-fraccionado').value.trim(),
      llamadaUrl: $('#cfg-llamada').value.trim(),
      precioVip: $('#cfg-precio-vip').value,
      precioPrograma: $('#cfg-precio-programa').value,
      precioFraccionado: $('#cfg-precio-fraccionado').value,
      fraccionadoTag: $('#cfg-fraccionado-tag').value.trim().toLowerCase(),
      unicoTag: $('#cfg-unico-tag').value.trim().toLowerCase(),
      publiTag: $('#cfg-publi-tag').value.trim().toLowerCase(),
      organicoTag: $('#cfg-organico-tag').value.trim().toLowerCase(),
      inversion: $('#cfg-inversion').value,
      metaFiltro: $('#cfg-meta-filtro').value.trim(),
      emailFiltro: $('#cfg-email-filtro').value.trim(),
      pago: leerPago('cfg'),
      oferta: leerOfertaEditor(),
      recursosPre: leerRecursosCfg(),
    },
  };
}

$('#cfg-save').addEventListener('click', async () => {
  const status = $('#cfg-status');
  try {
    const { code, launch } = readForm();
    if (errorPago('cfg')) { status.textContent = errorPago('cfg'); return; }
    const probs = Object.values(tagProblems()).filter(Boolean);
    if (probs.length && !window.confirm(`Revisa las etiquetas:\n\n• ${probs.join('\n• ')}\n\n¿Guardar igualmente?`)) return;
    if (state.tags.length && !state.tags.map((t) => t.toLowerCase()).includes(launch.registroTag)) {
      if (!window.confirm(`La etiqueta "${launch.registroTag}" no existe en GHL todavía. ¿Guardar igualmente?`)) return;
    }
    const next = {
      ...state.config,
      digestEmail: $('#cfg-digest-email').value.trim(),
      accesos: readAccesosEditor(),
      formAds: { campaign: $('#cfg-fa-campaign').value, adset: $('#cfg-fa-adset').value, ad: $('#cfg-fa-ad').value },
      launches: { ...state.config.launches, [code]: { ...launch, embudo: state.config.launches[code]?.embudo || (enVsl() ? undefined : state.embudo) } },
    };
    status.textContent = 'Guardando…';
    $('#cfg-save').disabled = true;
    const isNew = !editingCode;
    const { config } = await api('/api/config', { method: 'POST', body: next });
    state.config = config;
    editingCode = code;
    $('#cfg-code').readOnly = true;
    status.textContent = 'Guardado ✓';
    renderLaunchSelect();
    renderSnippets();
    // Lanzamiento nuevo: foto automática de las VIP / clientas que ya existían.
    if (isNew && missingSnapshot(config.launches[code]).length) {
      await runSnapshot(code);
      status.textContent = 'Guardado ✓';
    }
    renderSnapshotBox();
    await selectLaunch(code);
    status.textContent = 'Guardado ✓';
  } catch (e) {
    status.textContent = '';
    window.alert(e.message);
    if (/etiqueta de registro/.test(e.message)) goToField('cfg-registro');
  } finally {
    $('#cfg-save').disabled = false;
  }
});

// ---------- Foto de VIP / clientas anteriores ----------
// Las etiquetas de VIP y compra no cambian entre lanzamientos y GHL no guarda cuándo se pusieron.
// Al crear el lanzamiento marcamos a quien ya las tenía (`<código>_vip_previo`…) para no contarlas.
function missingSnapshot(launch) {
  return fotosPendientes(launch);
}

async function fetchAllIds(tag, label) {
  const ids = [];
  let cursor = null;
  do {
    const qs = new URLSearchParams({ tag });
    if (cursor) qs.set('cursor', JSON.stringify(cursor));
    const page = await api(`/api/leads?${qs}`);
    ids.push(...page.contacts.map((c) => c.id));
    cursor = page.cursor;
    progress(ids.length, page.total, `Foto de ${label} anteriores: leyendo ${ids.length}${page.total ? ` de ${page.total}` : ''}…`);
  } while (cursor);
  return ids;
}

async function runSnapshot(code) {
  state.fotoEnCurso = true;
  try { return await hacerFoto(code); } finally { state.fotoEnCurso = false; }
}
async function hacerFoto(code) {
  const launch = state.config.launches[code];
  const fields = missingSnapshot(launch);
  if (!fields.length) return;
  const snapshot = { at: new Date().toISOString(), counts: {}, tags: {}, ...(launch.snapshot || {}) };
  snapshot.counts = { ...(launch.snapshot?.counts || {}) };
  snapshot.tags = { ...(launch.snapshot?.tags || {}) };
  try {
    for (const f of fields) {
      const ids = await fetchAllIds(launch[f.field], f.label);
      const tag = tagFor(code, f.signal);
      for (let i = 0; i < ids.length; i += 25) {
        const chunk = ids.slice(i, i + 25).map((id) => ({ id, tags: [tag] }));
        const { results } = await api('/api/apply-tags', { method: 'POST', body: { items: chunk } });
        if (results.some((r) => !r.ok)) throw new Error('GHL no aceptó algunas etiquetas; vuelve a intentarlo');
        progress(Math.min(i + 25, ids.length), ids.length, `Foto de ${f.label} anteriores: marcando ${Math.min(i + 25, ids.length)} de ${ids.length}…`);
      }
      snapshot.counts[f.field] = ids.length;
      snapshot.tags[f.field] = launch[f.field];
    }
    const next = { ...state.config, launches: { ...state.config.launches, [code]: { ...launch, snapshot } } };
    state.config = (await api('/api/config', { method: 'POST', body: next })).config;
  } catch (e) {
    notice(`No se pudo completar la foto de VIP/clientas/llamadas/encuesta anteriores: ${e.message}`, true);
  } finally {
    progress(null);
  }
}

function snapshotSummary(launch) {
  const s = launch.snapshot;
  if (!s) return '';
  const parts = SNAPSHOT_TAGS.filter((f) => s.tags?.[f.field]).map((f) => `${s.counts[f.field] ?? 0} con «${esc(s.tags[f.field])}»`);
  return `Foto hecha el ${new Date(s.at).toLocaleString('es-ES')}: ${parts.join(', ')}. No cuentan como VIP, compra, llamada ni encuesta de este lanzamiento.`;
}

function renderSnapshotBox() {
  const box = $('#cfg-snapshot');
  const launch = editingCode && state.config.launches[editingCode];
  if (!launch) {
    box.innerHTML = '<p class="muted">Al guardar se hará una «foto» de quién tiene ya las etiquetas de VIP, compra, llamada y encuesta (si es la de un lanzamiento anterior), para no contarlas como de este lanzamiento. Crea el lanzamiento <strong>antes de abrir la venta de la VIP</strong>.</p>';
    return;
  }
  const missing = missingSnapshot(launch);
  box.innerHTML = `${launch.snapshot ? `<p>${snapshotSummary(launch)}</p>` : ''}
    ${missing.length ? `<p><strong>Falta la foto de:</strong> ${missing.map((f) => `«${esc(launch[f.field])}»`).join(', ')}. Hazla solo si todavía no se ha vendido nada en este lanzamiento: quien tenga ya la etiqueta dejará de contar.</p>
    <button type="button" class="btn" data-action="snapshot">Hacer la foto ahora</button>` : ''}`;
}

function renderSnapshotWarning() {
  const el = $('#snapshot-warning');
  const launch = state.config.launches[state.launchCode];
  const missing = puedeConfig() && launch && !enVsl() && !enMeteo() ? missingSnapshot(launch) : []; // solo en los lanzamientos
  el.hidden = !missing.length;
  if (!missing.length) return;
  el.innerHTML = `<p><strong>Falta la foto de lanzamientos anteriores</strong> (${missing.map((f) => `«${esc(launch[f.field])}»`).join(', ')}). Mientras tanto, quien la tenía de lanzamientos anteriores cuenta como de este. Hazla antes de abrir la venta.</p>
    <button type="button" class="btn" data-action="snapshot">Hacer la foto ahora</button>`;
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-action="snapshot"]');
  if (!b) return;
  const code = dlg.open ? editingCode : state.launchCode;
  if (!code || !window.confirm('Se marcará como "anterior" a todo el que tenga ya estas etiquetas. ¿Continuar?')) return;
  b.disabled = true;
  await runSnapshot(code);
  if (dlg.open) renderSnapshotBox();
  await selectLaunch(state.launchCode);
});

$('#btn-digest-test').addEventListener('click', async () => {
  const b = $('#btn-digest-test');
  const email = $('#cfg-digest-email').value.trim();
  if (email !== (state.config.digestEmail || '')) return window.alert('Guarda primero la configuración con este email.');
  b.disabled = true;
  try {
    const r = await api('/api/digest', { method: 'POST' });
    window.alert(r.sent ? `Resumen enviado a ${email}: «${r.subject}»` : `No se envió: ${r.reason}`);
  } catch (e) {
    window.alert(`No se pudo enviar: ${e.message}`);
  } finally {
    b.disabled = false;
  }
});

// ---------- Página de recursos: barra de urgencia y vista previa ----------
function renderBarraEditor(barra) {
  const opts = (sel) => Object.entries(LINK_KEYS).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
  // Fases según los vídeos del lanzamiento (con varios, cada vídeo y el tiempo entre vídeos).
  const l = editingCode ? state.config.launches[editingCode] : null;
  const fases = phasesFor({ ...(l || {}), formato: formatoDeLanz(l) });
  $('#cfg-barra').innerHTML = fases.map((p) => {
    const b = barra[p.id] || {};
    return `<tr data-phase="${p.id}">
      <td>${esc(p.label)}</td>
      <td><input class="bar-text" value="${esc(b.text || '')}" placeholder="${esc(p.text)}"></td>
      <td><select class="bar-button">${opts(b.button != null ? b.button : p.button)}</select></td>
      <td><input class="bar-label" value="${esc(b.buttonLabel || '')}" placeholder="Texto del botón"></td>
    </tr>`;
  }).join('');
}

function enlaceRow(key = '', url = '') {
  return `<div class="enlace-row"><input class="enl-key" value="${esc(key)}" placeholder="nombre (p. ej. guia)"><input class="enl-url" type="url" value="${esc(url)}" placeholder="https://…"><button type="button" class="btn ghost enl-del" aria-label="Quitar">✕</button></div>`;
}

function renderEnlacesEditor(enlaces) {
  $('#cfg-enlaces').innerHTML = Object.entries(enlaces).map(([k, v]) => enlaceRow(k, v)).join('');
}

function readEnlacesEditor() {
  const out = {};
  $$('#cfg-enlaces .enlace-row').forEach((r) => {
    const k = $('.enl-key', r).value.trim().toLowerCase();
    const v = $('.enl-url', r).value.trim();
    if (k && v) out[k] = v;
  });
  return out;
}

$('#btn-add-enlace').addEventListener('click', () => $('#cfg-enlaces').insertAdjacentHTML('beforeend', enlaceRow()));
$('#cfg-enlaces').addEventListener('click', (e) => { if (e.target.closest('.enl-del')) e.target.closest('.enlace-row').remove(); });

// Accesos directos a GHL: tipo (con su icono), nombre y URL. Los habituales se proponen con la URL vacía.
const svgIco = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ACCESO_TIPOS = {
  workflow: { label: 'Workflow', plural: 'Workflows', uno: 'workflow', icon: svgIco('<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M6 8.5v1.5a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V8.5M12 13v2.5"/>') },
  pagina: { label: 'Página', plural: 'Páginas', uno: 'página', icon: svgIco('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>') },
  formulario: { label: 'Formulario', plural: 'Formularios', uno: 'formulario', icon: svgIco('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>') },
  encuesta: { label: 'Encuesta', plural: 'Encuestas', uno: 'encuesta', icon: svgIco('<path d="M9 11l2 2 4-4"/><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 17h8"/>') },
  calendario: { label: 'Calendario', plural: 'Calendarios', uno: 'calendario', icon: svgIco('<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>') },
  email: { label: 'Email / campaña', plural: 'Emails y campañas', uno: 'email o campaña', icon: svgIco('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>') },
  whatsapp: { label: 'WhatsApp', plural: 'WhatsApp', uno: 'enlace de WhatsApp', icon: svgIco('<path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.4-4.3a8.5 8.5 0 1 1 15.6-4.6Z"/><path d="M9 8.5c.2 2.6 2.4 5 5.2 5.6l1-1.1 1.8.8c-.2 1-1 1.7-2 1.7C11.6 15.5 8.5 12.4 8.5 9c0-1 .7-1.8 1.7-2l.8 1.8Z"/>') },
  pago: { label: 'Pago / producto', plural: 'Pagos y productos', uno: 'enlace de pago', icon: svgIco('<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6.5 15h4"/>') },
  otro: { label: 'Otro enlace', plural: 'Otros enlaces', uno: 'enlace', icon: svgIco('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>') },
};
const ACCESOS_SUGERIDOS = [
  ['workflow', 'Workflow · formulario de registro'], ['workflow', 'Workflow · encuesta rellenada'], ['workflow', 'Workflow · compra'],
  ['workflow', 'Workflow · bonus'], ['workflow', 'Workflow · llamada agendada'], ['encuesta', 'Encuesta del avatar'],
  ['formulario', 'Formulario de registro'], ['pagina', 'Página preclase (editor)'],
];
// Para accesos guardados antes de que hubiera tipo: se deduce del nombre.
const guessTipo = (nombre) => (/workflow/i.test(nombre) ? 'workflow' : /encuesta/i.test(nombre) ? 'encuesta' : /formulario/i.test(nombre) ? 'formulario'
  : /whatsapp|grupo de wa/i.test(nombre) ? 'whatsapp' : /p[aá]gina|landing|funnel|embudo/i.test(nombre) ? 'pagina' : /calendario|agenda/i.test(nombre) ? 'calendario' : /email|campa/i.test(nombre) ? 'email' : 'otro');

// Recursos del lanzamiento en dos niveles: primero las categorías y, al pulsar una, sus enlaces.
// Se editan sobre state.accesosEdit (lo que se guarda) y state.accesosCat (la categoría abierta).
const accesoRow = (a, i) => `<div class="acceso-row" data-i="${i}">
  <input class="acc-nombre" value="${esc(a.nombre)}" placeholder="Nombre (p. ej. ${esc(ACCESO_TIPOS[a.tipo].uno)} de registro)" maxlength="60" aria-label="Nombre">
  <input class="acc-url" type="url" value="${esc(a.url)}" placeholder="Pega aquí la URL" aria-label="URL">
  <a class="btn acc-open" target="_blank" rel="noopener"${/^https:\/\//i.test(a.url) ? ` href="${esc(a.url)}"` : ' aria-disabled="true"'}>Abrir ↗</a>
  <button type="button" class="btn acc-del" title="Quitar">✕</button></div>`;

const ACCESOS_SUGERIDOS_VSL = [
  ['workflow', 'Workflow · registro en la VSL'], ['workflow', 'Workflow · compra desde la VSL'], ['workflow', 'Workflow · llamada agendada'],
  ['pagina', 'Página de registro (editor)'], ['pagina', 'Página de la VSL (editor)'], ['pagina', 'Página de gracias (editor)'],
  ['formulario', 'Formulario de registro'], ['calendario', 'Calendario de llamadas'],
];

// box: el contenedor del editor (Recursos de los lanzamientos o de la VSL).
function renderAccesosEditor(accesos, { box = '#cfg-accesos', sugeridos = ACCESOS_SUGERIDOS } = {}) {
  // Los sugeridos solo se proponen la primera vez (lista vacía): después se respeta lo guardado
  // y nunca se añaden filas nuevas por su cuenta.
  const list = (accesos || []).map((a) => ({ ...a, tipo: ACCESO_TIPOS[a.tipo] ? a.tipo : guessTipo(a.nombre) }));
  if (!list.length) for (const [tipo, nombre] of sugeridos) list.push({ tipo, nombre, url: '', sugerido: true });
  state.accesosBox = box;
  state.accesosEdit = list;
  state.accesosCat = null;
  drawAccesos();
}

function drawAccesos(focusLast = false) {
  const box = $(state.accesosBox || '#cfg-accesos');
  const list = state.accesosEdit;
  const cat = state.accesosCat;
  if (!cat) {
    box.innerHTML = `<div class="acc-cats">${Object.entries(ACCESO_TIPOS).map(([k, t]) => {
      const items = list.filter((a) => a.tipo === k);
      const conUrl = items.filter((a) => /^https:\/\//i.test(a.url)).length;
      const faltan = items.length - conUrl;
      return `<button type="button" class="acc-cat" data-cat="${k}">
        <span class="acc-ico acc-${k}">${t.icon}</span>
        <span class="acc-cat-txt"><strong>${t.plural}</strong><small>${items.length ? `${items.length} ${items.length === 1 ? 'enlace' : 'enlaces'}${faltan ? ` · <em>${faltan} sin URL</em>` : ''}` : 'Vacía · añade el primero'}</small></span>
        <span class="acc-cat-go" aria-hidden="true">›</span></button>`;
    }).join('')}</div>`;
    return;
  }
  const t = ACCESO_TIPOS[cat];
  const rows = list.map((a, i) => [a, i]).filter(([a]) => a.tipo === cat);
  box.innerHTML = `<div class="acc-detail">
    <div class="acc-detail-head">
      <button type="button" class="btn acc-back">← Categorías</button>
      <span class="acc-ico acc-${cat}">${t.icon}</span><h3>${t.plural}</h3>
    </div>
    <div class="enlaces-list">${rows.map(([a, i]) => accesoRow(a, i)).join('') || `<p class="muted">Todavía no hay ${t.plural.toLowerCase()}. Añade el primero.</p>`}</div>
    <button type="button" class="btn acc-add">+ Añadir ${t.uno}</button>
  </div>`;
  if (focusLast) $('.acceso-row:last-child .acc-nombre', box)?.focus();
}

function readAccesosEditor() {
  // Los sugeridos que se quedan sin URL no se guardan (si no, se llenaba la lista de enlaces vacíos).
  return (state.accesosEdit || []).filter((a) => !a.sugerido || a.url.trim()).map((a) => ({ tipo: a.tipo, nombre: a.nombre.trim(), url: a.url.trim() })).filter((a) => a.nombre);
}

for (const accBox of ['#cfg-accesos', '#vc-accesos']) {
$(accBox).addEventListener('click', (e) => {
  const cat = e.target.closest('[data-cat]');
  if (cat) { state.accesosCat = cat.dataset.cat; drawAccesos(); return; }
  if (e.target.closest('.acc-back')) { state.accesosCat = null; drawAccesos(); return; }
  if (e.target.closest('.acc-add')) {
    state.accesosEdit.push({ tipo: state.accesosCat, nombre: '', url: '' });
    drawAccesos(true);
    return;
  }
  const del = e.target.closest('.acc-del');
  if (del) {
    state.accesosEdit.splice(Number(del.closest('.acceso-row').dataset.i), 1);
    drawAccesos();
  }
});
$(accBox).addEventListener('input', (e) => {
  const row = e.target.closest('.acceso-row');
  if (!row) return;
  const a = state.accesosEdit[Number(row.dataset.i)];
  if (e.target.classList.contains('acc-nombre')) a.nombre = e.target.value;
  if (!e.target.classList.contains('acc-url')) return;
  a.url = e.target.value;
  const open = $('.acc-open', row);
  const url = e.target.value.trim();
  if (/^https:\/\//i.test(url)) { open.href = url; open.removeAttribute('aria-disabled'); } else { open.removeAttribute('href'); open.setAttribute('aria-disabled', 'true'); }
});
}

// Textos de la página: los fijos (bloque de clases) + los que añada a mano.
const textoRow = (k = '', v = '') => `<div class="enlace-row texto-row">
  <input class="txt-key" value="${esc(k)}" placeholder="nombre-del-texto" pattern="[a-z0-9\\-]{2,40}">
  <textarea class="txt-val" rows="1" placeholder="Texto">${esc(v)}</textarea>
  <button type="button" class="btn txt-del" title="Quitar">✕</button></div>`;

function renderTextosEditor(textos) {
  const fixed = new Set();
  $$('.tab-panel[data-panel="pagina"] [data-texto]').forEach((el) => { fixed.add(el.dataset.texto); el.value = textos[el.dataset.texto] || ''; });
  $('#cfg-textos').innerHTML = Object.entries(textos).filter(([k]) => !fixed.has(k)).map(([k, v]) => textoRow(k, v)).join('');
}

function readTextosEditor() {
  const out = {};
  $$('#cfg-textos .texto-row').forEach((r) => {
    const k = $('.txt-key', r).value.trim().toLowerCase();
    const v = $('.txt-val', r).value.trim();
    if (k && v) out[k] = v;
  });
  $$('.tab-panel[data-panel="pagina"] [data-texto]').forEach((el) => { if (el.value.trim()) out[el.dataset.texto] = el.value.trim(); });
  return out;
}

$('#btn-add-texto').addEventListener('click', () => $('#cfg-textos').insertAdjacentHTML('beforeend', textoRow()));
$('#cfg-textos').addEventListener('click', (e) => { if (e.target.closest('.txt-del')) e.target.closest('.texto-row').remove(); });

function readBarraEditor() {
  const out = {};
  $$('#cfg-barra tr').forEach((tr) => {
    out[tr.dataset.phase] = { text: $('.bar-text', tr).value.trim(), button: $('.bar-button', tr).value, buttonLabel: $('.bar-label', tr).value.trim() };
  });
  return out;
}

function renderPhaseNow(l) {
  const box = $('#page-phase-now');
  if (!l || !editingCode) { box.innerHTML = '<p class="muted">Guarda el lanzamiento para ver en qué fase está la página.</p>'; return; }
  const p = phaseAt(l, Date.now());
  const label = phasesFor(l).find((x) => x.id === p.id)?.label || p.id;
  const bar = barFor(l, p.id);
  box.innerHTML = `<p><strong>Ahora mismo la página está en la fase:</strong> ${esc(label)}${p.changesAt ? ` · cambia el ${esc(formatLong(p.changesAt))}` : ''}</p>
    <p class="muted">Barra: «${esc(bar.text.replace('{cuenta}', '⏳'))}»${/^en_directo/.test(p.id) ? ' · la página preclase redirige al directo (o al vídeo, si es grabado)' : /^v\d$/.test(p.id) ? ' · la página preclase redirige a la página de ese vídeo' : (p.id === 'replay' || p.id === 'cerrado') ? ' · la página preclase redirige a la grabación' : ''}</p>`;
}

$('#btn-preview').addEventListener('click', async () => {
  const l = editingCode && state.config.launches[editingCode];
  const at = $('#cfg-preview-at').value;
  if (!l?.recursosUrl) return window.alert('Guarda primero la URL de la página preclase.');
  if (!at) return window.alert('Elige la fecha y hora que quieres simular.');
  try {
    const { token } = await api('/api/page', { method: 'POST', body: { at } });
    const u = new URL(l.recursosUrl);
    u.searchParams.set('lsd_preview', token);
    window.open(u.toString(), '_blank', 'noopener');
  } catch (e) {
    window.alert(e.message);
  }
});

// Nota fija: cómo nombrar las campañas de Meta para que el dashboard las reconozca.
const UTM_PARAMS = 'utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}';

function renderMetaNaming() {
  const code = ($('#cfg-code').value.trim().toLowerCase() || 'codigo');
  const filtro = $('#cfg-meta-filtro').value.trim() || code;
  const campaign = `Captación webinar ${code}`;
  $('#meta-naming').innerHTML = `
    <strong>📣 Antes de lanzar los anuncios en Meta</strong>
    <p>1. Nombra la campaña de captación de este lanzamiento con su código. El dashboard solo suma la inversión de las campañas cuyo nombre contiene <code>${esc(filtro)}</code>:</p>
    <div class="copy-row"><code>${esc(campaign)}</code><button type="button" class="btn" data-copy-text="${esc(campaign)}">Copiar</button></div>
    <p>2. En cada anuncio, en <em>Parámetros de URL</em>, pega esto (así cada lead llega con su campaña, conjunto y anuncio):</p>
    <div class="copy-row"><code>${esc(UTM_PARAMS)}</code><button type="button" class="btn" data-copy-text="${esc(UTM_PARAMS)}">Copiar</button></div>
    <p class="muted">Si duplicas una campaña de un lanzamiento anterior, cámbiale el código del nombre.</p>`;
}

$('#cfg-code').addEventListener('input', renderMetaNaming);
$('#cfg-meta-filtro').addEventListener('input', renderMetaNaming);
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy-text]');
  if (!b) return;
  await navigator.clipboard.writeText(b.dataset.copyText);
  b.textContent = 'Copiado ✓';
  setTimeout(() => { b.textContent = 'Copiar'; }, 1500);
});

function renderSnippets() {
  const code = editingCode;
  const box = $('#snippets');
  if (!code) { box.innerHTML = '<p class="muted">Guarda el lanzamiento para ver sus códigos.</p>'; return; }
  const origin = location.origin;
  const script = `<script src="${origin}/tracker.js${cParam()}" defer></script>`;
  const items = [
    ['LOGIN · bloque del formulario (no cambia entre lanzamientos)',
      `<div data-lsd-login data-launch="auto"\n     data-title="Accede a las clases con el email con el que te registraste"\n     data-button="Acceder a las clases"></div>\n${script}`],
    ['RECURSOS · bloque base (una vez por página, en cualquier sitio)', `<div data-lsd-page="recursos" data-launch="auto"></div>\n${script}`],
    ['RECURSOS · barra de urgencia (dale estilo de barra fija arriba)', '<div class="mi-barra" data-lsd-bar></div>'],
    ['RECURSOS · vídeo de la clase 1 (bloqueado con cuenta atrás hasta su hora)', '<div data-lsd-video="clase1"></div>'],
    ...(nClases(state.config.launches[code]) >= 2 ? [['RECURSOS · vídeo de la clase 2', '<div data-lsd-video="clase2"></div>']] : []),
    ...(nClases(state.config.launches[code]) >= 3 ? [['RECURSOS · vídeo de la clase 3', '<div data-lsd-video="clase3"></div>']] : []),
    ...(!conVip(state.config.launches[code]) ? [] : [['RECURSOS · oferta VIP (se oculta al empezar el directo y a quien ya es VIP)',
      '<div data-lsd-if="vip-abierta">\n  Entrada VIP por <span data-lsd-text="precioVip"></span> · se cierra en <span data-lsd-countdown="vip"></span>\n  <a data-lsd-link="vip">Quiero mi entrada VIP</a>\n</div>\n<div data-lsd-if="ya-vip">✓ Ya tienes tu entrada VIP</div>']]),
    ['RECURSOS · botón del grupo de WhatsApp', '<a data-lsd-link="whatsapp" target="_blank">Unirme al grupo de WhatsApp</a>'],
    ['RECURSOS · botón del directo', '<a data-lsd-link="directo">Entrar al directo</a>'],
    ['RECURSOS · encuesta (sin ella no se ven las clases 1 y 2)',
      '<div data-lsd-if="encuesta-pendiente">\n  Antes de ver las clases, cuéntanos un poco sobre ti\n  <a data-lsd-link="encuesta">Rellenar la encuesta</a>\n</div>\n<div data-lsd-if="encuesta-hecha">✓ ¡Gracias por rellenar la encuesta!</div>'],
    // Recursos de la preclase (pestaña Preclase): música, test, votación, descargable y etapas.
    ...(tieneRecurso(state.config.launches[code], 'musica') ? [['RECURSOS · música (debajo de su clase; se desbloquea al ver el 75 % de la clase)', '<div data-lsd-audio="musica"></div>']] : []),
    ...(tieneRecurso(state.config.launches[code], 'test') ? [['RECURSOS · test (botón; se desbloquea en su fecha)',
      '<div data-lsd-if="test-bloqueado">🔒 El test se abre en <span data-lsd-countdown="test"></span></div>\n<div data-lsd-if="test-disponible">\n  <a data-lsd-link="test">Hacer el test</a>\n</div>\n<div data-lsd-if="test-hecho">✓ ¡Test completado!</div>']] : []),
    ...(tieneRecurso(state.config.launches[code], 'votacion') ? [['RECURSOS · votación (debajo de su clase; se abre al ver el 75 % de la clase y enseña los % al votar)', '<div data-lsd-votacion></div>']] : []),
    ...(tieneRecurso(state.config.launches[code], 'descargable') ? [['RECURSOS · recurso descargable (se mide quién lo abre)', '<div data-lsd-if="descargable-bloqueado">🔒 Disponible en <span data-lsd-countdown="descargable"></span></div>\n<a data-lsd-if="descargable-disponible" data-lsd-link="descargable">Descargar</a>']] : []),
    ['RECURSOS · etapas (cada caja recibe data-lsd-estado="bloqueada | disponible | hecha" para el diseño)',
      etapasPreclase(state.config.launches[code], nClases(state.config.launches[code])).map((e) => `<div data-lsd-etapa="${e.id}">Etapa <span data-lsd-etapa-n="${e.id}"></span> · ${e.label}</div>`).join('\n')],
    ['RECURSOS · añadir el directo al calendario (Google y, opcional, Apple/Outlook)', '<a data-lsd-link="calendario" target="_blank">Añadir a Google Calendar</a>\n<a data-lsd-link="calendario-ics">Añadir a Apple / Outlook</a>'],
    ['GRABACIÓN · bloques de la página del replay', `<div data-lsd-page="grabacion" data-launch="auto"></div>\n<div class="mi-barra" data-lsd-bar></div>\n<div data-lsd-video="replay"></div>\n${script}`],
    ['Enlace al LOGIN o a los RECURSOS en emails de GHL (añádelo al final de la URL: entra directa)', '?cid={{contact.id}}'],
    ['Enlace al directo en emails de GHL', `${origin}/directo?l=auto&cid={{contact.id}}${cParam('&')}`],
    ['Enlace al directo para el grupo de WhatsApp (pide el email)', `${origin}/directo?l=auto${cParam('&')}`],
    // Lanzamientos de varios vídeos: una página por vídeo y su enlace al directo (si es en directo).
    ...videosDe(state.config.launches[code]).slice(1).flatMap((v) => [
      [`${v.nombre.toUpperCase()} · bloques de su página`, `<div data-lsd-page="grabacion" data-launch="auto"></div>\n<div class="mi-barra" data-lsd-bar></div>\n<div data-lsd-video="${v.replay}"></div>\n${script}`],
      [`${v.nombre} · enlace al directo en emails de GHL (solo si es en directo)`, `${origin}/directo?l=auto&v=${v.k}&cid={{contact.id}}${cParam('&')}`],
    ]),
  ];
  box.innerHTML = `<p class="muted">Con <code>data-launch="auto"</code> las páginas usan siempre el <strong>lanzamiento en curso</strong> (el último cuyo inicio de captación ya ha llegado): en el próximo lanzamiento no hay que tocar GHL, solo esta configuración.</p>` + items.map(([title, text], i) => `
    <div class="snippet">
      <h3>${esc(title)}</h3>
      <pre id="snip-${i}">${esc(text)}</pre>
      <button type="button" class="btn" data-copy="snip-${i}">Copiar</button>
    </div>`).join('');
}

$('#snippets').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  await navigator.clipboard.writeText($(`#${b.dataset.copy}`).textContent);
  b.textContent = 'Copiado ✓';
  setTimeout(() => { b.textContent = 'Copiar'; }, 1500);
});

// ---------- Tareas del lanzamiento ----------
const today = () => dayInMadrid(new Date().toISOString());
const meSess = () => ({ role: state.role, uid: state.user?.id || '' });
const fechaCorta = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const iniciales = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
const fotoUrl = (u) => (u?.foto ? `/api/foto?u=${encodeURIComponent(u.id)}&v=${encodeURIComponent(u.foto)}` : '');
// Círculo con la foto de perfil o, si no tiene, sus iniciales.
const avatarHtml = (u, nombre = u?.nombre) => `<span class="t-avatar">${u?.foto ? `<img src="${esc(fotoUrl(u))}" alt="" loading="lazy">` : esc(iniciales(nombre))}</span>`;

// Cabecera de Tareas según el embudo: botón de planificación y, en meteóricos, de cuál de ellos.
function pintarCabeceraTareas() {
  const b = $('#btn-tareas-plantilla');
  b.textContent = enMeteo() ? 'Crear tareas del meteórico' : enVsl() ? 'Crear tareas de la VSL' : 'Cargar tareas habituales';
  b.title = enMeteo() ? 'Añade las tareas del meteórico según su configuración, con fechas desde las suyas (no duplica las que ya estén)' : enVsl() ? 'Añade las tareas de la VSL según su configuración (no duplica las que ya estén)' : 'Añade las tareas de siempre con fechas calculadas a partir de las del lanzamiento (no duplica las que ya estén)';
  const sel = $('#t-meteo-select');
  const lista = enMeteo() ? meteoDeEmbudo(state.embudo) : [];
  sel.hidden = !lista.length;
  if (lista.length) sel.innerHTML = lista.map(([c, m]) => `<option value="${esc(c)}" ${c === state.meteo.code ? 'selected' : ''}>⚡ ${esc(m.name)}</option>`).join('');
}
// Fases de las tareas según el tipo de embudo abierto (lanzamiento, VSL o meteórico).
const fasesT = () => fasesDe(tipoActual());

// Dos cargas del mismo código casi a la vez (al abrir un embudo se pedían dos veces): se reutiliza la primera.
const enCurso = {};
function unaVez(tipo, code, fn) {
  const c = enCurso[tipo];
  if (c && c.code === code && Date.now() - c.at < 800) return c.p;
  const p = fn().finally(() => { if (enCurso[tipo]?.p === p) delete enCurso[tipo]; });
  enCurso[tipo] = { code, at: Date.now(), p };
  return p;
}

function loadTareas() {
  const code = codigo();
  if (!code) return Promise.resolve();
  return unaVez('tareas', code, () => cargarTareas(code));
}
async function cargarTareas(code) {
  try {
    const d = await api(`/api/tareas?l=${encodeURIComponent(code)}`);
    if (code !== codigo()) return;
    if (state.tareas?.code !== code) state.tSel = null;
    state.tareas = { code, list: d.tareas, users: d.users, columnas: d.columnas || [] };
  } catch (e) {
    state.tareas = { code, list: [], users: [], error: e.message };
  }
  renderTareas();
  cargarTareasOtro();
}

// Tareas del otro embudo (solo para la campanita: avisa de las de los dos).
// Códigos de los demás embudos (para la campanita): las VSL y el lanzamiento elegido de cada embudo de lanzamientos.
function otrosCodigos() {
  const out = [];
  for (const e of embudos()) {
    if (e.tipo === 'vsl') out.push(e.id);
    else {
      const ls_ = Object.entries(state.config.launches).filter(([, l]) => embudoDeLanz(l) === e.id).sort((a, b) => String(b[1].createdAt).localeCompare(String(a[1].createdAt)));
      const elegido = e.id === state.embudo || (embudoDeLanz(state.config.launches[state.launchCode]) === e.id) ? state.launchCode : ls_[0]?.[0];
      if (elegido) out.push(elegido);
    }
  }
  return [...new Set(out)].filter((c) => c && c !== codigo()).slice(0, 8);
}
async function cargarTareasOtro() {
  const codes = otrosCodigos();
  const res = await Promise.all(codes.map((code) => api(`/api/tareas?l=${encodeURIComponent(code)}`).then((d) => ({ code, list: d.tareas, users: d.users })).catch(() => null)));
  state.tareasOtros = res.filter(Boolean);
  renderNotif();
}
const nombreEmbudo = (code) => state.config?.vsls?.[code]?.name || state.config?.launches[code]?.name || state.config?.meteoricos?.[code]?.name || code;

function asignadoTexto(a) {
  if (!a) return 'Sin asignar';
  if (a.tipo === 'rol') return `Rol ${ROLE_LABEL[a.rol] || a.rol}`;
  return state.tareas.users.find((u) => u.id === a.id)?.nombre || 'Persona eliminada';
}

function filtroResp(t) {
  const r = state.tResp;
  if (!r) return true;
  const a = t.asignado;
  if (r === 'sin') return !a;
  if (r.startsWith('rol:')) return a?.tipo === 'rol' && a.rol === r.slice(4);
  const u = state.tareas.users.find((x) => x.id === r.slice(2));
  return Boolean(a) && ((a.tipo === 'persona' && a.id === u?.id) || (a.tipo === 'rol' && a.rol === u?.rol));
}

// Lunes y domingo de la semana actual (YYYY-MM-DD).
function semanaActual() {
  const hoy = today();
  const lunes = addDays(hoy, -((new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7));
  return [lunes, addDays(lunes, 6)];
}

function filtroEstado(t) {
  const f = state.tFiltro;
  // Por fecha: valen en la lista y en el tablero (se ven también las ya hechas, para ver el avance).
  if (f === 'hoy') return t.fecha === today();
  if (f === 'semana') { const [a, b] = semanaActual(); return Boolean(t.fecha) && t.fecha >= a && t.fecha <= b; }
  // En el tablero las columnas ya separan por estado: solo cuentan «Mías» y «Vencidas».
  if (state.tVista === 'tablero') return f === 'mias' ? esMia(t, meSess()) : f === 'vencidas' ? vencida(t, today()) : true;
  if (f === 'pendientes') return !t.hecha;
  if (f === 'hechas') return t.hecha;
  if (f === 'vencidas') return vencida(t, today());
  if (f === 'mias') return !t.hecha && esMia(t, meSess());
  return true;
}

function renderRespSelect() {
  const sel = $('#tareas-resp');
  const users = state.tareas?.users || [];
  sel.innerHTML = `<option value="">Todas las personas</option>
    <optgroup label="Roles">${rolesUI().map((r) => `<option value="rol:${r}">Rol ${ROLE_LABEL[r]}</option>`).join('')}<option value="sin">Sin asignar</option></optgroup>
    ${users.length ? `<optgroup label="Personas">${users.map((u) => `<option value="u:${esc(u.id)}">${esc(u.nombre)}</option>`).join('')}</optgroup>` : ''}`;
  sel.value = state.tResp;
  if (sel.value !== state.tResp) { state.tResp = ''; sel.value = ''; }
}

// Resumen de la descripción para listas y tarjetas (el contenido completo se ve al abrir la tarea).
function notasExtracto(t, cls = 't-notas', max = 160) {
  if (!t.notas) return '';
  const txt = richToText(t.notas).replace(/🎬/g, '').replace(/\s+/g, ' ').trim();
  const extras = `${richTieneVideo(t.notas) ? '<span class="t-media">🎬 vídeo</span>' : ''}${richTieneEnlace(t.notas) ? '<span class="t-media">🔗 enlaces</span>' : ''}`;
  return `<div class="${cls}">${esc(txt.length > max ? `${txt.slice(0, max)}…` : txt)}${extras ? ` ${extras}` : ''}</div>`;
}

function tareaRow(t) {
  const hoy = today();
  const venc = vencida(t, hoy);
  const puede = puedeMarcar(t, meSess());
  const a = t.asignado;
  const who = a?.tipo === 'persona'
    ? `<span class="t-who">${avatarHtml(state.tareas.users.find((u) => u.id === a.id), asignadoTexto(a))}${esc(asignadoTexto(a))}</span>`
    : `<span class="t-who ${a ? 't-rol' : 't-nadie'}">${a ? icon('users') : ''}${esc(asignadoTexto(a))}</span>`;
  const fecha = t.fecha
    ? `<span class="t-fecha ${!t.hecha && venc ? 'vencida' : !t.hecha && t.fecha === hoy ? 'hoy' : ''}">${icon('calendar')}${!t.hecha && venc ? 'Vencida · ' : !t.hecha && t.fecha === hoy ? 'Hoy · ' : ''}${esc(fechaCorta(t.fecha))}</span>`
    : '';
  const hecha = t.hecha ? `<span class="t-hecha">✓ ${esc(t.hechaPor || '')}${t.hechaEn ? ` · ${esc(new Date(t.hechaEn).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }))}` : ''}</span>` : '';
  const sel = state.tSel ? `<label class="t-sel" title="Seleccionar"><input type="checkbox" data-sel="${esc(t.id)}" ${state.tSel.has(t.id) ? 'checked' : ''} aria-label="Seleccionar tarea"></label>` : '';
  return `<li data-trow="${esc(t.id)}" class="tarea ${t.hecha ? 'done' : ''} ${venc ? 'is-vencida' : ''} ${esMia(t, meSess()) ? 'is-mia' : ''} ${state.tSel?.has(t.id) ? 'is-sel' : ''}">${sel}
    <label class="t-check" title="${puede ? (t.hecha ? 'Volver a pendiente' : 'Marcar como completada') : 'Solo puede marcarla su responsable'}">
      <input type="checkbox" data-tid="${esc(t.id)}" ${t.hecha ? 'checked' : ''} ${puede ? '' : 'disabled'}><span class="t-box" aria-hidden="true"></span>
    </label>
    <div class="t-main">
      <button type="button" class="t-titulo t-open" data-tver="${esc(t.id)}">${t.habitual ? '<span class="t-hab" title="Tarea habitual">🔁</span>' : ''}${esc(t.titulo)}</button>
      ${notasExtracto(t)}
      <div class="t-meta">${(() => { const c = !t.hecha && extraCols().find((x) => x.id === t.columna); return c ? `<span class="t-encurso">${c.icon} ${esc(c.label)}</span>` : ''; })()}${fecha}${who}${hecha}</div>
    </div>
    ${puedeTareas() ? `<div class="t-actions"><button type="button" class="btn ghost" data-tedit="${esc(t.id)}" title="Editar" aria-label="Editar">✎</button><button type="button" class="btn ghost" data-tdel="${esc(t.id)}" title="Borrar" aria-label="Borrar">✕</button></div>` : ''}
  </li>`;
}

// Aviso solo para admin: tareas de los demás que han pasado su fecha sin completarse.
function renderAvisosEquipo() {
  const el = $('#avisos-equipo');
  const T = state.tareas;
  const lista = state.role === 'admin' && T && T.code === codigo() ? vencidasEquipo(T.list, T.users, today(), state.roles) : [];
  const firma = `${today()}|${lista.map((r) => r.tarea.id).join(',')}`;
  if (!lista.length || ls.get('lsd_avisos_equipo_ok') === firma) { el.hidden = true; return; }
  const porQuien = new Map();
  for (const r of lista) porQuien.set(r.quien, [...(porQuien.get(r.quien) || []), r]);
  el.hidden = false;
  el.innerHTML = `<div class="ae-head"><span class="ae-ico" aria-hidden="true">⏰</span>
      <strong>${lista.length} tarea${lista.length === 1 ? '' : 's'} del equipo sin completar a tiempo</strong>
      <span class="spacer"></span>
      <button type="button" class="btn" data-ae="ver">Ver vencidas</button>
      <button type="button" class="btn ghost" data-ae="ok" title="Ocultar hasta que cambie algo o hasta mañana">Entendido</button></div>
    <ul class="ae-list">${[...porQuien.entries()].map(([quien, rs]) => `<li><span class="ae-quien">${esc(quien)}</span>
      ${rs.slice(0, 4).map((r) => `<button type="button" class="ae-task" data-tver="${esc(r.tarea.id)}">${esc(r.tarea.titulo)} <span class="ae-dias">${r.dias} día${r.dias === 1 ? '' : 's'} tarde</span></button>`).join('')}
      ${rs.length > 4 ? `<span class="muted">y ${rs.length - 4} más</span>` : ''}</li>`).join('')}</ul>`;
  el.dataset.firma = firma;
}
$('#avisos-equipo').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ae]');
  if (!b) return;
  if (b.dataset.ae === 'ok') { ls.set('lsd_avisos_equipo_ok', $('#avisos-equipo').dataset.firma); $('#avisos-equipo').hidden = true; return; }
  state.tFiltro = 'vencidas';
  state.tResp = '';
  if (state.tVista === 'tablero') state.tVista = 'lista';
  showView('tareas');
  renderTareas();
});

// Preparación es larga: se parte en subcategorías (con su propio contador).
function subgruposPreparacion(items, all) {
  return SUBS_PREPARACION.map((s) => {
    const its = items.filter((t) => subDe(t) === s.id);
    if (!its.length) return '';
    const tot = all.filter((t) => subDe(t) === s.id);
    const d = tot.filter((t) => t.hecha).length;
    return `<div class="tf-sub"><div class="tf-sub-head"><span aria-hidden="true">${s.icon}</span><h4>${esc(s.label)}</h4><span class="tf-count">${d}/${tot.length}</span></div>
      <ul class="tareas-ul">${its.map(tareaRow).join('')}</ul></div>`;
  }).join('');
}

function renderTareas() {
  const T = state.tareas;
  pintarCabeceraTareas();
  if (!T || T.code !== codigo()) {
    // Sin tareas de ESTE embudo (p. ej. meteóricos sin ninguno elegido): no se dejan a la vista las de otro.
    if (!codigo()) {
      $('#tareas-list').innerHTML = '';
      $('#tareas-resumen').innerHTML = '';
      $('#tareas-badge').hidden = true;
      $('#tareas-selbar').hidden = true;
      $('#btn-tareas-sel').hidden = true;
    }
    return;
  }
  renderAvisosEquipo();
  renderNotif();
  refrescarComentarios();
  actualizarAuditor();
  const list = T.list;
  const hoy = today();
  const done = list.filter((t) => t.hecha).length;
  const venc = list.filter((t) => vencida(t, hoy)).length;
  const paraHoy = list.filter((t) => !t.hecha && t.fecha === hoy).length;
  const mias = list.filter((t) => !t.hecha && esMia(t, meSess())).length;
  const pct = list.length ? Math.round((done / list.length) * 100) : 0;

  const badge = $('#tareas-badge');
  badge.hidden = !mias;
  badge.textContent = mias;
  badge.title = 'Tareas pendientes asignadas a ti o a tu rol';

  $('#tareas-resumen').innerHTML = T.error ? `<div class="notice err">No se pudieron cargar las tareas: ${esc(T.error)}</div>` : list.length ? `
    <div class="card tareas-progress">
      <div class="tp-head"><strong>${done} de ${list.length} tareas completadas</strong><span class="tp-pct">${pct}%</span></div>
      <div class="obj-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
      <div class="tp-chips">
        <button type="button" class="tp-chip ${venc ? 'bad' : ''}" data-tf="vencidas">${icon('alert')}${venc} vencida${venc === 1 ? '' : 's'}</button>
        <button type="button" class="tp-chip ${paraHoy ? 'warn' : ''}" data-tf="hoy">${icon('calendar')}${paraHoy} para hoy</button>
        <button type="button" class="tp-chip ${mias ? 'mine' : ''}" data-tf="mias">${icon('check')}${mias} pendiente${mias === 1 ? '' : 's'} tuya${mias === 1 ? '' : 's'}</button>
      </div>
    </div>` : `
    <div class="card empty tareas-empty">
      <h2>Aún no hay tareas ${enVsl() ? 'en la VSL' : enMeteo() ? 'en este meteórico' : 'en este lanzamiento'}</h2>
      ${puedeTareas() && enMeteo()
    ? '<p class="muted">Crea la planificación del meteórico: preparación de la oferta, pagos y páginas, calentamiento, apertura y cierre, con fechas a partir de las suyas (lo urgente, para hoy).</p><p><button type="button" class="btn primary" data-action="tareas-plantilla">Crear las tareas del meteórico</button> <button type="button" class="btn" data-action="tarea-nueva">+ Nueva tarea</button></p>'
    : puedeTareas() && enVsl()
    ? '<p class="muted">Crea la planificación de la VSL: revisión de etiquetas, página y pagos, anuncios, seguimiento y mejora, o crea las tuyas.</p><p><button type="button" class="btn primary" data-action="tareas-plantilla">Crear las tareas de la VSL</button> <button type="button" class="btn" data-action="tarea-nueva">+ Nueva tarea</button></p>'
    : puedeTareas()
    ? '<p class="muted">Empieza con las tareas habituales (con fechas calculadas a partir de las del lanzamiento) y ajústalas, o crea las tuyas.</p><p><button type="button" class="btn primary" data-action="tareas-plantilla">Cargar tareas habituales</button> <button type="button" class="btn" data-action="tarea-nueva">+ Nueva tarea</button></p>'
    : '<p class="muted">Cuando la administradora asigne tareas aparecerán aquí.</p>'}
    </div>`;

  $$('#tareas-filtro .seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.f === state.tFiltro));
  if (state.tSel) for (const id of [...state.tSel]) if (!list.some((t) => t.id === id)) state.tSel.delete(id);
  $('#tareas-selbar').hidden = !state.tSel;
  $('#btn-tareas-sel').hidden = Boolean(state.tSel) || !list.length;
  if (state.tSel) {
    $('#tareas-selcount').textContent = `${state.tSel.size} seleccionada${state.tSel.size === 1 ? '' : 's'}`;
    $('#btn-del-sel').disabled = !state.tSel.size;
    fillSelAsignar();
    $('#btn-del-todas').disabled = !list.length;
  }
  renderRespSelect();

  const shown = list.filter((t) => filtroEstado(t) && filtroResp(t));
  const order = (a, b) => (a.hecha - b.hecha) || (a.fecha || '9999').localeCompare(b.fecha || '9999') || a.titulo.localeCompare(b.titulo, 'es');
  const groups = fasesT().map((f) => ({ f, all: list.filter((t) => t.fase === f.id), items: shown.filter((t) => t.fase === f.id).sort(order) }))
    .filter((g) => g.items.length);
  if (!$('#view-calendario').hidden) renderCalendario();
  $$('#tareas-vista .seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.v === state.tVista));
  $$('#tareas-filtro [data-f="pendientes"], #tareas-filtro [data-f="hechas"]').forEach((b) => { b.hidden = state.tVista === 'tablero'; });
  if (state.tVista === 'tablero') {
    if (!['mias', 'vencidas', 'hoy', 'semana'].includes(state.tFiltro)) state.tFiltro = 'todas';
    $$('#tareas-filtro .seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.f === state.tFiltro));
    $('#tareas-list').innerHTML = list.length ? renderTablero(shown.sort(order)) : '';
    return;
  }
  // Lista: las pendientes por fase y las completadas aparte, en «✅ Completadas» al final.
  const f = state.tFiltro;
  const activeGroups = groups.map((g) => ({ ...g, items: g.items.filter((t) => !t.hecha) })).filter((g) => g.items.length);
  const hoyD = today();
  const [lunes, domingo] = semanaActual();
  const completadas = list.filter((t) => t.hecha && filtroResp(t) && (
    f === 'vencidas' ? false
      : f === 'hoy' ? t.fecha === hoyD
        : f === 'semana' ? Boolean(t.fecha) && t.fecha >= lunes && t.fecha <= domingo
          : f === 'mias' ? esMia(t, meSess()) : true))
    .sort((a, b) => String(b.hechaEn || '').localeCompare(String(a.hechaEn || '')));
  const vacio = f === 'vencidas' ? '¡Nada vencido! 🎉' : f === 'hoy' ? 'No hay tareas pendientes con fecha de hoy.' : f === 'semana' ? 'No hay tareas pendientes esta semana.' : f === 'mias' ? 'No tienes tareas pendientes. 🎉' : f === 'hechas' ? '' : 'No hay tareas pendientes con este filtro. 🎉';
  const fases = activeGroups.map(({ f: fase, all, items }) => {
    const d = all.filter((t) => t.hecha).length;
    return `<section class="card tarea-fase">
      <header class="tf-head"><span class="tf-ico" aria-hidden="true">${fase.icon}</span><h3>${esc(fase.label)}</h3><span class="tf-count">${d}/${all.length}</span>
        <span class="tf-bar"><span style="width:${all.length ? (d / all.length) * 100 : 0}%"></span></span></header>
      ${fase.id === 'preparacion' ? subgruposPreparacion(items, all) : `<ul class="tareas-ul">${items.map(tareaRow).join('')}</ul>`}
    </section>`;
  }).join('');
  const abierta = f === 'hechas' || state.tDoneOpen;
  const seccionHechas = completadas.length ? `<details class="card tarea-fase tareas-done" ${abierta ? 'open' : ''}>
      <summary class="tf-head"><span class="tf-ico" aria-hidden="true">✅</span><h3>Completadas</h3><span class="tf-count">${completadas.length}</span><span class="td-chev" aria-hidden="true">▾</span></summary>
      <ul class="tareas-ul">${completadas.map(tareaRow).join('')}</ul>
    </details>` : (f === 'hechas' ? '<p class="muted tareas-none">Aún no hay tareas completadas.</p>' : '');
  $('#tareas-list').innerHTML = !list.length ? '' : `${fases || (f === 'hechas' ? '' : `<p class="muted tareas-none">${vacio}</p>`)}${seccionHechas}`;
  $('.tareas-done')?.addEventListener('toggle', (e) => { if (f !== 'hechas') state.tDoneOpen = e.target.open; });
}

// ---------- Tablero kanban ----------
// Columnas: una por fase, las extra que cree la admin y «Completadas» al final.
const COLOR_HEX = { gris: '#8a817b', azul: '#2f6aa8', morado: '#6b4fc8', rojo: '#c0362c', naranja: '#e07a1f', amarillo: '#c9a227', verde: '#128c4a', rosa: '#c2457e' };
const FASE_COLOR = { preparacion: 'gris', captacion: 'azul', clases: 'morado', directo: 'rojo', carrito: 'verde', cierre: 'naranja', calentamiento: 'amarillo', oferta: 'rojo', seguimiento: 'verde', optimizacion: 'morado' };
const extraCols = () => state.tareas?.columnas || [];
function columnasTablero() {
  return [
    ...fasesT().map((f) => ({ id: f.id, label: f.label, icon: f.icon, color: FASE_COLOR[f.id], tipo: 'fase' })),
    ...extraCols().map((c) => ({ ...c, tipo: 'extra' })),
    { id: COLUMNA_HECHAS, label: 'Completadas', icon: '✅', color: 'verde', tipo: 'hechas' },
  ];
}

function tarjeta(t) {
  const hoy = today();
  const puede = puedeMarcar(t, meSess());
  const admin = puedeTareas();
  const fase = fasesT().find((f) => f.id === t.fase);
  const venc = vencida(t, hoy);
  const col = columnaDe(t, extraCols(), fasesT());
  const a = t.asignado;
  const who = a?.tipo === 'persona'
    ? `<span class="t-who">${avatarHtml(state.tareas.users.find((u) => u.id === a.id), asignadoTexto(a))}${esc(asignadoTexto(a))}</span>`
    : `<span class="t-who ${a ? 't-rol' : 't-nadie'}">${a ? icon('users') : ''}${esc(asignadoTexto(a))}</span>`;
  const fecha = t.fecha ? `<span class="t-fecha ${!t.hecha && venc ? 'vencida' : !t.hecha && t.fecha === hoy ? 'hoy' : ''}">${icon('calendar')}${esc(fechaCorta(t.fecha))}</span>` : '';
  // En su columna de fase no hace falta repetir la fase; en las demás sí.
  const chip = col === t.fase ? '' : `<span class="kb-fase">${fase?.icon || ''} ${esc(fase?.label || '')}</span>`;
  const arrastrable = admin || puede;
  return `<article class="kb-card ${t.hecha ? 'done' : ''} ${venc ? 'is-vencida' : ''} ${esMia(t, meSess()) ? 'is-mia' : ''} ${arrastrable ? '' : 'locked'}" ${arrastrable ? 'draggable="true"' : ''} data-kid="${esc(t.id)}">
    ${chip || admin ? `<div class="kb-top">${chip || '<span></span>'}${admin ? `<button type="button" class="kb-edit" data-tedit="${esc(t.id)}" title="Editar" aria-label="Editar">✎</button>` : ''}</div>` : ''}
    <div class="kb-row"><label class="t-check" title="${puede ? (t.hecha ? 'Volver a pendiente' : 'Marcar como completada') : 'Solo puede marcarla su responsable'}"><input type="checkbox" data-tid="${esc(t.id)}" ${t.hecha ? 'checked' : ''} ${puede ? '' : 'disabled'}><span class="t-box" aria-hidden="true"></span></label>
    <span class="kb-titulo t-open" role="button" tabindex="0" data-tver="${esc(t.id)}">${t.habitual ? '<span class="t-hab" title="Tarea habitual">🔁</span>' : ''}${esc(t.titulo)}</span></div>
    ${notasExtracto(t, 'kb-notas', 110)}
    <div class="t-meta">${fecha}${who}</div>
    ${t.hecha ? `<div class="t-hecha">✓ ${esc(t.hechaPor || '')}${t.hechaEn ? ` · ${esc(new Date(t.hechaEn).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }))}` : ''}</div>` : ''}
  </article>`;
}

function renderTablero(shown) {
  const admin = puedeTareas();
  const cols = columnasTablero();
  const extras = extraCols();
  const order = (a, b) => (a.fecha || '9999').localeCompare(b.fecha || '9999') || a.titulo.localeCompare(b.titulo, 'es');
  return `<div class="kanban" style="--kb-n:${cols.length + (admin ? 1 : 0)}">${cols.map((c) => {
    let items = shown.filter((t) => columnaDe(t, extras, fasesT()) === c.id);
    items = c.tipo === 'hechas' ? items.sort((a, b) => String(b.hechaEn || '').localeCompare(String(a.hechaEn || ''))) : items.sort(order);
    // Preparación: tarjetas agrupadas por subcategoría.
    const body = c.id === 'preparacion' && items.length
      ? SUBS_PREPARACION.map((s) => {
        const its = items.filter((t) => subDe(t) === s.id);
        return its.length ? `<div class="kb-subhead">${s.icon} ${esc(s.label)} <span>${its.length}</span></div>${its.map(tarjeta).join('')}` : '';
      }).join('')
      : items.map(tarjeta).join('');
    const tot = c.tipo === 'fase' ? state.tareas.list.filter((t) => t.fase === c.id) : null;
    const hechasFase = tot ? tot.filter((t) => t.hecha).length : 0;
    return `<section class="kb-col kbt-${c.tipo}" data-kcol="${esc(c.id)}" style="--kb:${COLOR_HEX[c.color] || COLOR_HEX.gris}">
      <header class="kb-head"><span aria-hidden="true">${c.icon}</span><h3>${esc(c.label)}</h3><span class="kb-count" title="${tot ? `${hechasFase} de ${tot.length} completadas` : ''}">${items.length}</span>
        ${admin && c.tipo === 'extra' ? `<button type="button" class="kb-coledit" data-colEdit="${esc(c.id)}" title="Editar columna" aria-label="Editar columna">⋯</button>` : ''}</header>
      ${tot && tot.length ? `<div class="kb-prog" title="${hechasFase} de ${tot.length} completadas"><span style="width:${(hechasFase / tot.length) * 100}%"></span></div>` : ''}
      <div class="kb-list">${body || `<p class="kb-empty">${c.tipo === 'hechas' ? 'Marca la casilla de una tarea y aparecerá aquí' : 'Sin tareas'}</p>`}</div>
    </section>`;
  }).join('')}${admin ? '<button type="button" class="kb-addcol" data-col-nueva><span>＋</span>Añadir columna</button>' : ''}</div>`;
}

// Soltar una tarjeta en una columna: «Completadas» la marca; una fase o columna extra la mueve (admin).
async function moverTarea(id, destino) {
  const t = state.tareas.list.find((x) => x.id === id);
  if (!t) return;
  const actual = columnaDe(t, extraCols(), fasesT());
  if (actual === destino) return;
  try {
    if (destino === COLUMNA_HECHAS) {
      if (!puedeMarcar(t, meSess())) throw new Error('Solo puede completarla su responsable');
      await tareasOp({ op: 'marcar', id, hecha: true });
    } else if (puedeTareas()) {
      await tareasOp({ op: 'mover', id, columna: destino });
    } else if (t.hecha && (destino === t.fase || destino === t.columna)) {
      await tareasOp({ op: 'marcar', id, hecha: false });
    } else {
      throw new Error('Solo la administradora puede cambiar una tarea de columna. Tú puedes marcarla como completada.');
    }
  } catch (ex) { notice(ex.message, true); renderTareas(); }
}

$('#tareas-vista').addEventListener('click', (e) => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  state.tVista = b.dataset.v;
  ls.set('lsd_tareas_vista', state.tVista);
  if (state.tVista === 'lista' && state.tFiltro === 'todas') state.tFiltro = 'pendientes';
  renderTareas();
});
let dragId = null;
$('#tareas-list').addEventListener('dragstart', (e) => {
  const c = e.target.closest('[data-kid]');
  if (!c) return;
  dragId = c.dataset.kid;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
  c.classList.add('dragging');
});
$('#tareas-list').addEventListener('dragend', (e) => {
  e.target.closest('[data-kid]')?.classList.remove('dragging');
  $$('.kb-col.over').forEach((c) => c.classList.remove('over'));
  dragId = null;
});
$('#tareas-list').addEventListener('dragover', (e) => {
  const col = e.target.closest('[data-kcol]');
  if (!col || !dragId) return;
  e.preventDefault();
  $$('.kb-col.over').forEach((c) => c !== col && c.classList.remove('over'));
  col.classList.add('over');
});
$('#tareas-list').addEventListener('drop', (e) => {
  const col = e.target.closest('[data-kcol]');
  if (!col || !dragId) return;
  e.preventDefault();
  col.classList.remove('over');
  moverTarea(dragId, col.dataset.kcol);
});

// Columnas extra (solo admin): crear, renombrar, icono, color, mover y borrar.
const coldlg = $('#col-dialog');
let editingCol = null;
const COL_ICONOS = ['📌', '⛔', '💡', '⏳', '👀', '🔁', '🚀', '🧩', '📦', '🗂️', '⭐', '❓'];
function openColumna(id) {
  const c = extraCols().find((x) => x.id === id) || null;
  editingCol = c;
  $('#col-title').textContent = c ? 'Editar columna' : 'Nueva columna';
  $('#col-nombre').value = c?.label || '';
  $('#col-iconos').innerHTML = COL_ICONOS.map((i) => `<button type="button" class="col-ico ${(c?.icon || '📌') === i ? 'on' : ''}" data-ci="${i}">${i}</button>`).join('');
  $('#col-colores').innerHTML = COLOR_COLUMNAS.map((k) => `<button type="button" class="col-color ${(c?.color || 'gris') === k ? 'on' : ''}" data-cc="${k}" style="--c:${COLOR_HEX[k]}" title="${k}" aria-label="Color ${k}"></button>`).join('');
  const i = c ? extraCols().indexOf(c) : -1;
  $('#col-izq').hidden = !c || i === 0;
  $('#col-der').hidden = !c || i === extraCols().length - 1;
  $('#col-del').hidden = !c;
  $('#col-status').textContent = '';
  coldlg.showModal();
  $('#col-nombre').focus();
}
$('#col-iconos').addEventListener('click', (e) => { const b = e.target.closest('[data-ci]'); if (b) $$('#col-iconos .col-ico').forEach((x) => x.classList.toggle('on', x === b)); });
$('#col-colores').addEventListener('click', (e) => { const b = e.target.closest('[data-cc]'); if (b) $$('#col-colores .col-color').forEach((x) => x.classList.toggle('on', x === b)); });
async function guardarColumnas(columnas, msg) {
  const d = await api('/api/tareas', { method: 'POST', body: { l: state.tareas.code, op: 'columnas', columnas } });
  state.tareas.columnas = d.columnas;
  renderTareas();
  if (msg) notice(msg);
}
$('#col-save').addEventListener('click', async () => {
  const label = $('#col-nombre').value.trim();
  if (!label) { $('#col-nombre').focus(); return; }
  const datos = { label, icon: $('#col-iconos .on')?.dataset.ci || '📌', color: $('#col-colores .on')?.dataset.cc || 'gris' };
  const list = extraCols().map((c) => ({ ...c }));
  if (editingCol) Object.assign(list.find((c) => c.id === editingCol.id), datos);
  else list.push({ id: `c${Math.random().toString(36).slice(2, 10)}`, ...datos });
  try { await guardarColumnas(list); coldlg.close(); } catch (ex) { $('#col-status').textContent = ex.message; }
});
$('#col-del').addEventListener('click', async () => {
  const n = state.tareas.list.filter((t) => !t.hecha && t.columna === editingCol.id).length;
  if (!window.confirm(`¿Borrar la columna «${editingCol.label}»?${n ? ` Sus ${n} tareas volverán a la columna de su fase.` : ''}`)) return;
  try { await guardarColumnas(extraCols().filter((c) => c.id !== editingCol.id), `Columna «${editingCol.label}» borrada.`); coldlg.close(); } catch (ex) { $('#col-status').textContent = ex.message; }
});
for (const [sel, dir] of [['#col-izq', -1], ['#col-der', 1]]) {
  $(sel).addEventListener('click', async () => {
    const list = extraCols().map((c) => ({ ...c }));
    const i = list.findIndex((c) => c.id === editingCol.id);
    [list[i], list[i + dir]] = [list[i + dir], list[i]];
    try { await guardarColumnas(list); openColumna(editingCol.id); } catch (ex) { $('#col-status').textContent = ex.message; }
  });
}
$('#tareas-list').addEventListener('click', (e) => {
  if (e.target.closest('[data-col-nueva]')) openColumna(null);
  const ed = e.target.closest('[data-coledit]');
  if (ed) openColumna(ed.dataset.coledit);
});

async function tareasOp(body) {
  const d = await api('/api/tareas', { method: 'POST', body: { l: state.tareas.code, ...body } });
  state.tareas.list = d.tareas;
  renderTareas();
  return d;
}

$('#tareas-filtro').addEventListener('click', (e) => {
  const b = e.target.closest('[data-f]');
  if (!b) return;
  state.tFiltro = b.dataset.f;
  renderTareas();
});
$('#tareas-resp').addEventListener('change', (e) => { state.tResp = e.target.value; renderTareas(); });
$('#tareas-resumen').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tf]');
  if (!b) return;
  state.tFiltro = b.dataset.tf;
  renderTareas();
});

$('#tareas-list').addEventListener('change', async (e) => {
  const cb = e.target.closest('input[data-tid]');
  if (!cb) return;
  cb.disabled = true;
  cb.closest('.tarea, .kb-card')?.classList.add(cb.checked ? 'completing' : 'uncompleting');
  try {
    await tareasOp({ op: 'marcar', id: cb.dataset.tid, hecha: cb.checked });
  } catch (ex) {
    cb.checked = !cb.checked;
    cb.disabled = false;
    notice(ex.message, true);
  }
});

$('#tareas-list').addEventListener('click', async (e) => {
  const ed = e.target.closest('[data-tedit]');
  if (ed) return openTarea(state.tareas.list.find((t) => t.id === ed.dataset.tedit));
  const del = e.target.closest('[data-tdel]');
  if (!del) return;
  const t = state.tareas.list.find((x) => x.id === del.dataset.tdel);
  if (!t || !window.confirm(`¿Borrar la tarea «${t.titulo}»?`)) return;
  try { await tareasOp({ op: 'borrar', id: t.id }); } catch (ex) { notice(ex.message, true); }
});

// Selección y borrado en bloque (solo admin)
const visiblesIds = () => $$('#tareas-list input[data-sel]').map((x) => x.dataset.sel);
$('#btn-tareas-sel').addEventListener('click', () => {
  state.tSel = new Set();
  if (state.tVista === 'tablero') { state.tVista = 'lista'; state.tFiltro = 'todas'; } // las casillas de selección están en la lista
  renderTareas();
});
$('#btn-sel-salir').addEventListener('click', () => { state.tSel = null; renderTareas(); });
$('#btn-sel-visibles').addEventListener('click', () => { visiblesIds().forEach((id) => state.tSel.add(id)); renderTareas(); });
$('#btn-sel-ninguna').addEventListener('click', () => { state.tSel.clear(); renderTareas(); });
$('#tareas-list').addEventListener('change', (e) => {
  const cb = e.target.closest('input[data-sel]');
  if (!cb || !state.tSel) return;
  if (cb.checked) state.tSel.add(cb.dataset.sel); else state.tSel.delete(cb.dataset.sel);
  renderTareas();
});
$('#btn-del-sel').addEventListener('click', async () => {
  const n = state.tSel.size;
  if (!n || !window.confirm(`¿Eliminar ${n} tarea${n === 1 ? '' : 's'}? No se puede deshacer.`)) return;
  try {
    await tareasOp({ op: 'borrar-varias', ids: [...state.tSel] });
    state.tSel = null;
    renderTareas();
    notice(`${n} tarea${n === 1 ? ' eliminada' : 's eliminadas'}.`);
  } catch (ex) { notice(ex.message, true); }
});
$('#btn-del-todas').addEventListener('click', async () => {
  const n = state.tareas.list.length;
  const name = nombreEmbudo(state.tareas.code);
  if (!window.confirm(`¿Eliminar TODAS las tareas (${n}) de «${name}»? No se puede deshacer.`)) return;
  if (window.prompt('Para confirmar, escribe ELIMINAR') !== 'ELIMINAR') return;
  try {
    await tareasOp({ op: 'borrar-todas' });
    state.tSel = null;
    renderTareas();
    notice(`Eliminadas las ${n} tareas de «${name}».`);
  } catch (ex) { notice(ex.message, true); }
});

async function cargarPlantilla() {
  if (enMeteo() || enVsl()) return crearPlanificacion();
  const l = state.config.launches[state.launchCode];
  const faltan = [['inicioCaptacion', 'inicio de captación'], ['fechaDirecto', 'fecha del directo']].filter(([k]) => !l[k]).map(([, v]) => v);
  if (faltan.length && !window.confirm(`Falta ${faltan.join(' y ')} en la configuración: algunas tareas se crearán sin fecha. ¿Continuar?`)) return;
  const antes = state.tareas.list.length;
  try {
    await tareasOp({ op: 'plantilla' });
    const n = state.tareas.list.length - antes;
    notice(n ? `Añadidas ${n} tareas habituales. Revísalas y asígnalas a quien corresponda.` : 'Ya estaban todas las tareas habituales.');
  } catch (ex) { notice(ex.message, true); }
}
// Meteóricos y VSL: su planificación propia (según su configuración). Lo que ya debería estar hecho, para hoy.
async function crearPlanificacion({ silencioso = false } = {}) {
  try {
    const d = await tareasOp({ op: 'plantilla' });
    if (!silencioso || d.creadas) notice(d.creadas ? `Creadas ${d.creadas} tareas de ${enMeteo() ? 'este meteórico' : 'la VSL'} (las urgentes, para hoy). Revísalas y asígnalas a quien corresponda.` : 'Ya estaban todas las tareas de la planificación.');
    loadEventos();
  } catch (ex) { notice(ex.message, true); }
}
$('#btn-tareas-plantilla').addEventListener('click', cargarPlantilla);
$('#t-meteo-select').addEventListener('change', (e) => {
  state.meteo.code = e.target.value;
  ls.set(`lsd_meteo_${state.embudo}`, state.meteo.code);
  loadTareas();
  if (!$('#view-calendario').hidden) renderCalendario();
});
$('#btn-tarea-nueva').addEventListener('click', () => openTarea(null));
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="tareas-plantilla"]')) cargarPlantilla();
  if (e.target.closest('[data-action="tarea-nueva"]')) openTarea(null);
});

// Diálogo de tarea
const tdlg = $('#tarea-dialog');
let editingTarea = null;
$('#t-sub').innerHTML = `<option value="">Automática (según el título)</option>${SUBS_PREPARACION.map((s) => `<option value="${s.id}">${s.icon} ${esc(s.label)}</option>`).join('')}`;
const syncSubField = () => { $('#t-sub-field').hidden = $('#t-fase').value !== 'preparacion'; };
$('#t-fase').addEventListener('change', syncSubField);

function fillAsignadoSelect(value) {
  const users = state.tareas?.users || [];
  $('#t-asignado').innerHTML = `<option value="">Sin asignar</option>
    <optgroup label="Todo un rol">${rolesUI().map((r) => `<option value="rol:${r}">Rol ${ROLE_LABEL[r]}</option>`).join('')}</optgroup>
    <optgroup label="Personas">${users.map((u) => `<option value="u:${esc(u.id)}">${esc(u.nombre)} · ${ROLE_LABEL[u.rol]}</option>`).join('')}
    <option value="nueva">+ Nueva persona (nombre + email)…</option></optgroup>`;
  $('#t-asignado').value = value;
  $('#t-nueva-persona').hidden = value !== 'nueva';
}

function openTarea(t) {
  editingTarea = t || null;
  $('#tarea-title').textContent = t ? 'Editar tarea' : 'Nueva tarea';
  $('#t-titulo').value = t?.titulo || '';
  setEditor(t?.notas || '');
  $('#t-habitual').checked = Boolean(t?.habitual);
  $('#t-fase').innerHTML = fasesT().map((f) => `<option value="${f.id}">${f.icon} ${esc(f.label)}</option>`).join('');
  $('#t-fase').value = fasesT().some((f) => f.id === t?.fase) ? t.fase : 'preparacion';
  $('#t-fecha').value = t?.fecha || '';
  $('#t-sub').value = t?.sub || '';
  syncSubField();
  const a = t?.asignado;
  fillAsignadoSelect(a ? (a.tipo === 'rol' ? `rol:${a.rol}` : `u:${a.id}`) : '');
  ['#t-np-nombre', '#t-np-email'].forEach((s) => { $(s).value = ''; });
  $('#t-np-rol').value = 'setter';
  $('#t-avisar').checked = true;
  $('#tarea-status').textContent = '';
  const cb = $('#t-coments');
  cb.hidden = !t;
  cb.dataset.tid = '';
  if (t) renderComentarios(cb, t);
  tdlg.showModal();
  $('#t-titulo').focus();
}
$('#t-asignado').addEventListener('change', (e) => {
  $('#t-nueva-persona').hidden = e.target.value !== 'nueva';
  if (e.target.value === 'nueva') $('#t-np-nombre').focus();
});

// Crea el usuario y explica qué ha pasado con el email de acceso.
async function crearUsuario({ nombre, email, rol }) {
  const r = await api('/api/usuarios', { method: 'POST', body: { op: 'crear', nombre, email, rol } });
  if (state.tareas) state.tareas.users.push({ id: r.user.id, nombre: r.user.nombre, rol: r.user.rol, email: r.user.email });
  state.equipo.push(r.user);
  return r;
}
const accesoMsg = (r) => (r.anadido ? `${r.user.nombre} ya tenía usuario (trabaja en otros clientes): ahora también tiene acceso aquí, con su misma contraseña.` : r.emailEnviado
  ? `Usuario creado: ${r.user.nombre} ya tiene en su email (${r.user.email}) el enlace y su contraseña.`
  : `Usuario creado, pero NO se pudo enviar el email${r.emailError ? ` (${r.emailError})` : ''}. Pásale tú estos datos: email ${r.user.email} · contraseña ${r.password}`);

$('#tarea-save').addEventListener('click', async () => {
  const titulo = $('#t-titulo').value.trim();
  if (!titulo) { $('#t-titulo').focus(); return; }
  const btn = $('#tarea-save');
  const status = $('#tarea-status');
  btn.disabled = true;
  try {
    let sel = $('#t-asignado').value;
    let creado = null;
    if (sel === 'nueva') {
      const nombre = $('#t-np-nombre').value.trim();
      const email = $('#t-np-email').value.trim();
      if (!nombre || !email) { status.textContent = 'Pon el nombre y el email de la persona.'; return; }
      status.textContent = 'Creando usuario y enviando su acceso…';
      creado = await crearUsuario({ nombre, email, rol: $('#t-np-rol').value });
      sel = `u:${creado.user.id}`;
      fillAsignadoSelect(sel);
    }
    const asignado = !sel ? null : sel.startsWith('rol:') ? { tipo: 'rol', rol: sel.slice(4) } : { tipo: 'persona', id: sel.slice(2) };
    const tarea = { titulo, notas: getEditor(), fase: $('#t-fase').value, sub: $('#t-fase').value === 'preparacion' ? $('#t-sub').value : '', fecha: $('#t-fecha').value, asignado, habitual: $('#t-habitual').checked };
    status.textContent = 'Guardando…';
    const d = await tareasOp(editingTarea ? { op: 'editar', id: editingTarea.id, tarea, avisar: $('#t-avisar').checked } : { op: 'crear', tarea, avisar: $('#t-avisar').checked });
    tdlg.close();
    const partes = [];
    if (creado) partes.push(accesoMsg(creado));
    if (d.aviso?.enviados) partes.push(`Aviso de la tarea enviado por email a ${d.aviso.enviados} persona${d.aviso.enviados === 1 ? '' : 's'}.`);
    if (d.aviso?.errores?.length) partes.push(`No se pudo avisar a: ${d.aviso.errores.join(', ')}.`);
    if (partes.length) notice(partes.join(' '), Boolean(creado && !creado.emailEnviado) || Boolean(d.aviso?.errores?.length));
  } catch (ex) {
    status.textContent = ex.message;
  } finally {
    btn.disabled = false;
  }
});

// ---------- Equipo (Configuración) ----------
async function loadEquipo() {
  const box = $('#equipo-list');
  box.innerHTML = '<p class="muted">Cargando…</p>';
  try {
    const d = await api('/api/usuarios');
    state.equipo = d.users;
    state.equipoTodos = d.todos || null; // solo superadmin: todo el mundo, para dar accesos a varios clientes
    state.clientesLista = d.clientes || [];
    renderEquipo();
  } catch (e) {
    box.innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
}

function renderEquipo() {
  // El equipo de este cliente; la gente de la agencia con acceso aquí se gestiona en Agencia → Equipo de la agencia.
  const users = state.equipo.filter((u) => !u.agencia);
  const deAgencia = state.equipo.filter((u) => u.agencia);
  const fmt = (d) => (d ? new Date(d).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Nunca');
  $('#equipo-list').innerHTML = users.length ? `<div class="table-scroll"><table class="metric-table equipo-table">
    <thead><tr><th>Persona</th><th>Rol</th><th>Último acceso</th><th></th></tr></thead>
    <tbody>${users.map((u) => `<tr class="${u.activo ? '' : 'inactivo'}" data-uid="${esc(u.id)}">
      <td><span class="t-who">${avatarHtml(u)}<span><strong>${esc(u.nombre)}</strong>${u.superadmin ? ' <span class="badge sa-badge">Superadmin</span>' : ''}<br><span class="muted">${esc(u.email)}</span>${u.activo ? '' : ' · <em>desactivada</em>'}${otrosClientes(u)}</span></span></td>
      <td><select class="eq-rol" ${u.id === state.user?.id ? 'disabled' : ''}>${[...rolesUI(), ...(rolesUI().includes(u.rol) ? [] : [u.rol])].map((r) => `<option value="${r}" ${r === u.rol ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select></td>
      <td class="muted">${fmt(u.lastLogin)}</td>
      <td class="eq-actions">
        <button type="button" class="btn" data-eq="regenerar" title="Genera una contraseña nueva y se la envía por email">Reenviar acceso</button>
        ${u.id === state.user?.id ? '' : `<button type="button" class="btn ghost" data-eq="${u.activo ? 'desactivar' : 'activar'}">${u.activo ? 'Desactivar' : 'Activar'}</button>
        <button type="button" class="btn ghost" data-eq="borrar" aria-label="Borrar">✕</button>`}
      </td></tr>`).join('')}</tbody></table></div>`
    : '<p class="muted">Todavía no hay nadie. Añade a las personas con su nombre y email: les llegará el acceso.</p>';
  if (deAgencia.length) {
    $('#equipo-list').insertAdjacentHTML('beforeend', `<p class="muted eq-agencia-nota">Del equipo de la agencia también entran aquí: ${deAgencia.map((u) => `<strong>${esc(u.nombre)}</strong> (${esc(ROLE_LABEL[u.rol] || u.rol)})`).join(', ')}.${state.superadmin ? ' Se gestionan en <strong>Agencia → Equipo de la agencia</strong>.' : ''}</p>`);
  }
  const fuera = [];
  if (fuera.length) {
    $('#equipo-list').insertAdjacentHTML('beforeend', `<details class="eq-fuera"><summary>Personas de otros clientes (${fuera.length}) · dales acceso aquí</summary>
      <div class="table-scroll"><table class="metric-table equipo-table"><tbody>${fuera.map((u) => `<tr data-uid="${esc(u.id)}" data-fuera="1">
        <td><span class="t-who">${avatarHtml(u)}<span><strong>${esc(u.nombre)}</strong><br><span class="muted">${esc(u.email)}</span>${otrosClientes(u)}</span></span></td>
        <td class="eq-actions"><button type="button" class="btn" data-eq="accesos">Dar acceso…</button></td></tr>`).join('')}</tbody></table></div></details>`);
  }
}

// Clientes en los que trabaja una persona (además de este), para el superadmin.
function otrosClientes(u) {
  if (!state.equipoTodos) return '';
  const nombres = Object.keys(u.accesos || {}).filter((k) => k !== state.cliente).map((k) => state.clientesLista.find((c) => c.id === k)?.nombre || k);
  return nombres.length ? `<br><span class="eq-clientes">${nombres.map((n) => `<span class="eq-cli">${esc(n)}</span>`).join('')}</span>` : '';
}

// Superadmin: accesos de una persona a cada cliente (rol en cada uno) y si es superadmin.
const ROLES_COMUNES = ['admin', 'tecnico', 'setter', 'equipo'];
function editorAccesos(u) {
  const roles = [...new Set([...ROLES_COMUNES, ...rolesUI()])];
  const fila = (c) => {
    const actual = u.accesos?.[c.id] || '';
    return `<label class="acc-cli"><span>${esc(c.nombre)}</span><select data-acc-cli="${esc(c.id)}"><option value="">Sin acceso</option>${[...roles, ...(actual && !roles.includes(actual) ? [actual] : [])].map((r) => `<option value="${esc(r)}" ${r === actual ? 'selected' : ''}>${esc(ROLE_LABEL[r] || r)}</option>`).join('')}</select></label>`;
  };
  return `<tr class="eq-accesos-row" data-uid="${esc(u.id)}"><td colspan="4">
    <div class="eq-accesos"><strong>Clientes de ${esc(u.nombre)}</strong>
      <div class="acc-clis">${state.clientesLista.map(fila).join('')}</div>
      <label class="check"><input type="checkbox" data-acc-sa ${u.superadmin ? 'checked' : ''}> Superadmin (entra en todos los clientes como admin y gestiona los clientes)</label>
      <div class="row"><button type="button" class="btn primary" data-eq="guardar-accesos">Guardar accesos</button><button type="button" class="btn ghost" data-eq="cerrar-accesos">Cancelar</button></div>
      <small class="muted">Los roles de cada cliente se configuran en su propio Equipo → Roles y permisos.</small>
    </div></td></tr>`;
}

function equipoResult(msg, isError = false) {
  const el = $('#equipo-result');
  el.textContent = msg;
  el.classList.toggle('err', isError);
  el.hidden = !msg;
}

$('#btn-eq-crear').addEventListener('click', async () => {
  const nombre = $('#eq-nombre').value.trim();
  const email = $('#eq-email').value.trim();
  if (!nombre || !email) return equipoResult('Pon el nombre y el email.', true);
  const b = $('#btn-eq-crear');
  b.disabled = true;
  equipoResult('Creando usuario y enviando su acceso…');
  try {
    const r = await crearUsuario({ nombre, email, rol: $('#eq-rol').value });
    $('#eq-nombre').value = '';
    $('#eq-email').value = '';
    renderEquipo();
    equipoResult(accesoMsg(r), !r.emailEnviado);
  } catch (e) {
    equipoResult(e.message, true);
  } finally {
    b.disabled = false;
  }
});

$('#equipo-list').addEventListener('change', async (e) => {
  const sel = e.target.closest('.eq-rol');
  if (!sel) return;
  const id = sel.closest('tr').dataset.uid;
  try {
    await api('/api/usuarios', { method: 'POST', body: { op: 'editar', id, rol: sel.value } });
    state.equipo.find((u) => u.id === id).rol = sel.value;
    equipoResult('Rol cambiado. Se aplica en su próxima acción.');
    if (state.tareas) loadTareas();
  } catch (ex) { equipoResult(ex.message, true); loadEquipo(); }
});

$('#equipo-list').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-eq]');
  if (!b) return;
  const id = b.closest('tr').dataset.uid;
  const u = state.equipo.find((x) => x.id === id) || state.equipoTodos?.find((x) => x.id === id);
  const op = b.dataset.eq;
  if (op === 'accesos') {
    $$('.eq-accesos-row').forEach((r) => r.remove());
    b.closest('tr').insertAdjacentHTML('afterend', editorAccesos(state.equipoTodos?.find((x) => x.id === id) || u));
    return;
  }
  if (op === 'cerrar-accesos') { b.closest('tr').remove(); return; }
  if (op === 'guardar-accesos') {
    const row = b.closest('tr');
    const accesos = Object.fromEntries($$('[data-acc-cli]', row).map((s) => [s.dataset.accCli, s.value]).filter(([, v]) => v));
    b.disabled = true;
    try {
      await api('/api/usuarios', { method: 'POST', body: { op: 'accesos', id, accesos, superadmin: $('[data-acc-sa]', row).checked } });
      equipoResult(`Accesos de ${u.nombre} guardados.`);
      await loadEquipo();
    } catch (ex) { equipoResult(ex.message, true); b.disabled = false; }
    return;
  }
  if (op === 'regenerar' && !window.confirm(`Se generará una contraseña nueva para ${u.nombre} y se le enviará por email. La anterior dejará de funcionar. ¿Continuar?`)) return;
  const multi = Object.keys(u.accesos || {}).some((k) => k !== state.cliente) || u.superadmin;
  if (op === 'borrar' && !window.confirm(multi ? `¿Quitar a ${u.nombre} del equipo de este cliente? Seguirá teniendo acceso a sus otros clientes.` : `¿Borrar a ${u.nombre}? Perderá el acceso y sus tareas quedarán como «Persona eliminada».`)) return;
  b.disabled = true;
  try {
    if (op === 'regenerar') {
      const r = await api('/api/usuarios', { method: 'POST', body: { op, id } });
      equipoResult(r.emailEnviado ? `Contraseña nueva enviada a ${u.email}.` : `No se pudo enviar el email${r.emailError ? ` (${r.emailError})` : ''}. Pásale tú la contraseña nueva: ${r.password}`, !r.emailEnviado);
    } else if (op === 'borrar') {
      const r = await api('/api/usuarios', { method: 'POST', body: { op, id } });
      equipoResult(r.quitadoDeCliente ? `${u.nombre} ya no está en el equipo de este cliente.` : `${u.nombre} borrada.`);
    } else {
      await api('/api/usuarios', { method: 'POST', body: { op: 'editar', id, activo: op === 'activar' } });
      equipoResult(op === 'activar' ? `${u.nombre} vuelve a tener acceso.` : `${u.nombre} ya no puede entrar.`);
    }
    await loadEquipo();
    if (state.tareas) loadTareas();
  } catch (ex) {
    equipoResult(ex.message, true);
    b.disabled = false;
  }
});

$('.tab[data-tab="equipo"]').addEventListener('click', () => { equipoResult(''); loadEquipo(); });

// ---------- Clientes (solo superadmin) ----------
const slugCliente = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^[^a-z]+/, '').slice(0, 24);
// ---------- Comparativas y alertas (Comparar): edición vs anteriores, mes a mes, VSL vs lanzamiento ----------
const CMP_MODOS = [
  { id: 'edicion', label: 'Esta edición frente a las anteriores', lanz: true },
  { id: 'meses', label: 'Mes a mes (VSL)' },
  { id: 'vsl-lanz', label: 'VSL frente a lanzamiento' },
];
state.cmp = { modo: '', vslLeads: {} };
const fmtInd = (fmt, v) => (v == null || !Number.isFinite(v) ? '–' : fmt === 'eur' ? eur(v) : fmt === 'pct' ? `${(v * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%` : fmt === 'x' ? `${v.toLocaleString('es-ES', { maximumFractionDigits: 1 })}x` : Math.round(v).toLocaleString('es-ES'));
const deltaHtml = (d) => (d ? `<span class="cmp-delta ${d.bueno ? 'up' : 'down'}">${d.pct > 0 ? '▲' : d.pct < 0 ? '▼' : ''} ${Math.round(Math.abs(d.pct) * 100)}%</span>` : '–');
const alertasHtml = (lista) => (lista.length ? `<ul class="cmp-alertas">${lista.map((a) => `<li class="${a.nivel}">${a.nivel === 'mal' ? '⚠️' : '✅'} ${esc(a.texto)}.</li>`).join('')}</ul>` : '<p class="muted">Sin diferencias de más del 20 %.</p>');
function tablaComparativa(columnas, filas = INDICADORES) {
  // columnas: [{ titulo, ind, delta? }]
  return `<div class="table-scroll"><table class="metric-table"><thead><tr><th></th>${columnas.map((c) => `<th class="num">${esc(c.titulo)}</th>`).join('')}</tr></thead>
    <tbody>${filas.filter((f) => columnas.some((c) => c.ind?.[f.id] != null)).map((f) => `<tr><td>${esc(f.label)}</td>${columnas.map((c) => `<td class="num">${c.delta ? deltaHtml(c.delta[f.id]) : fmtInd(f.fmt, c.ind?.[f.id])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function renderComparativas() {
  const modos = CMP_MODOS.filter((x) => !(x.lanz && enVsl()) && (x.id === 'edicion' || Object.keys(state.config.vsls || {}).length));
  if (!modos.some((x) => x.id === state.cmp.modo)) state.cmp.modo = modos[0]?.id || '';
  $('#cmp-modos').innerHTML = modos.map((x) => `<button type="button" class="seg-btn${x.id === state.cmp.modo ? ' on' : ''}" data-cmp-modo="${x.id}">${esc(x.label)}</button>`).join('');
  const box = $('#cmp-body');
  const vsls = Object.entries(state.config.vsls || {});
  const selVsl = () => `<select id="cmp-vsl">${vsls.map(([id, v]) => `<option value="${esc(id)}" ${id === (enVsl() ? state.embudo : vsls[0]?.[0]) ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>`;
  if (state.cmp.modo === 'edicion') {
    box.innerHTML = `<p class="muted">Compara «${esc(state.config.launches[state.launchCode]?.name || '')}» con la edición anterior y con la media de las anteriores de este embudo (carga los leads de cada una).</p><button type="button" class="btn primary" data-cmp-calc>Comparar</button><div id="cmp-res"></div>`;
  } else if (state.cmp.modo === 'meses') {
    box.innerHTML = `<div class="row"><label class="field narrow"><span>VSL</span>${selVsl()}</label><button type="button" class="btn primary" data-cmp-calc>Comparar los últimos 6 meses</button></div><div id="cmp-res"></div>`;
  } else if (state.cmp.modo === 'vsl-lanz') {
    box.innerHTML = `<div class="row"><label class="field narrow"><span>VSL (últimos 90 días)</span>${selVsl()}</label>
      <label class="field narrow"><span>Lanzamiento</span><select id="cmp-lanz">${launchesSorted().map(([c, l]) => `<option value="${esc(c)}">${esc(l.name)}</option>`).join('')}</select></label>
      <button type="button" class="btn primary" data-cmp-calc>Comparar</button></div><div id="cmp-res"></div>`;
  } else box.innerHTML = '<p class="muted">No hay nada que comparar todavía.</p>';
}
async function leadsVslDe(id) {
  if (state.cmp.vslLeads[id]) return state.cmp.vslLeads[id];
  const v = vslCfg(id);
  if (!v.registroTag) throw new Error(`Falta la etiqueta de registro de «${v.name}»`);
  const out = [];
  let cursor = null;
  try {
    do {
      const qs = new URLSearchParams({ tag: v.registroTag });
      if (cursor) qs.set('cursor', JSON.stringify(cursor));
      const page = await api(`/api/leads?${qs}`);
      out.push(...page.contacts);
      cursor = page.cursor;
      progress(out.length, page.total, `Cargando ${v.name}: ${out.length} leads`);
    } while (cursor);
  } finally { progress(null); }
  state.cmp.vslLeads[id] = out.map((c) => enrichVsl(c, v, { pais: state.config.defaultCountryCode, code: id }));
  return state.cmp.vslLeads[id];
}
async function indVslRango(id, rango) {
  const leads = await leadsVslDe(id);
  let inversion = null;
  try { const m = await api(`/api/meta?launch=${encodeURIComponent(id)}&since=${rango.desde}&until=${rango.hasta}`); if (m.configured && !m.error) inversion = m.total; } catch { /* sin Meta */ }
  return indicadoresVsl(computeVsl(leads, rango, vslCfg(id), { inversion }));
}
document.addEventListener('click', async (e) => {
  const mb = e.target.closest('[data-cmp-modo]');
  if (mb) { state.cmp.modo = mb.dataset.cmpModo; renderComparativas(); return; }
  const b = e.target.closest('[data-cmp-calc]');
  if (!b) return;
  const res = $('#cmp-res');
  b.disabled = true;
  res.innerHTML = '<p class="muted">Calculando…</p>';
  try {
    if (state.cmp.modo === 'edicion') {
      const actual = state.config.launches[state.launchCode];
      const emb = embudoDeLanz(actual);
      const anteriores = launchesSorted().filter(([c, l]) => c !== state.launchCode && embudoDeLanz(l) === emb && (!actual.inicioCaptacion || !l.inicioCaptacion || l.inicioCaptacion < actual.inicioCaptacion));
      if (!anteriores.length) { res.innerHTML = '<p class="muted">No hay ediciones anteriores en este embudo.</p>'; return; }
      const ia = indicadoresLanzamiento(currentMetrics(), actual);
      const prev = [];
      for (const [c, l] of anteriores) prev.push(indicadoresLanzamiento(await loadLaunchMetrics(c), l));
      const ultima = prev[0];
      const media = mediaIndicadores(prev);
      const enCurso = !actual.cierreCarrito || actual.cierreCarrito.slice(0, 10) >= dayInMadrid(new Date().toISOString());
      const omitir = enCurso ? ['registros', 'ventas', 'facturacion'] : [];
      res.innerHTML = `${tablaComparativa([
        { titulo: 'Esta edición', ind: ia }, { titulo: `Anterior (${anteriores[0][1].name})`, ind: ultima }, { titulo: `Media de ${prev.length}`, ind: media },
        { titulo: 'vs anterior', delta: diferencias(ia, ultima) }, { titulo: 'vs media', delta: diferencias(ia, media) },
      ])}${enCurso ? '<p class="muted small">El lanzamiento sigue en marcha: los totales (registros, ventas, facturación) aún no son comparables; las alertas miran los ratios.</p>' : ''}
      <h3 class="cfg-h3">Alertas</h3>${alertasHtml([...alertas(ia, ultima, 'la edición anterior', { omitir }), ...alertas(ia, media, 'la media de las anteriores', { omitir })])}`;
    } else if (state.cmp.modo === 'meses') {
      const id = $('#cmp-vsl').value;
      const hoy = dayInMadrid(new Date().toISOString());
      const meses = ultimosMeses(hoy, 6);
      const filas = [];
      for (const ym of meses) filas.push([ym, await indVslRango(id, rangoDe({ preset: 'mes', mes: ym }, hoy))]);
      const ult = filas.at(-1)[1];
      const antp = filas.at(-2)?.[1];
      const media = mediaIndicadores(filas.slice(0, -1).map((f) => f[1]));
      const mesTxt = (ym) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('es-ES', { month: 'short', year: '2-digit', timeZone: 'UTC' });
      res.innerHTML = `${tablaComparativa(filas.map(([ym, ind]) => ({ titulo: mesTxt(ym), ind })).concat(antp ? [{ titulo: 'vs mes anterior', delta: diferencias(ult, antp) }] : []), INDICADORES.filter((x) => !['convVip', 'convClase1'].includes(x.id)))}
        <p class="muted small">El mes en curso va hasta hoy: sus totales se comparan con los ratios en mente.</p>
        <h3 class="cfg-h3">Alertas</h3>${alertasHtml([...(antp ? alertas(ult, antp, 'el mes pasado', { omitir: ['registros', 'ventas', 'facturacion'] }) : []), ...alertas(ult, media, 'la media de los 5 meses anteriores', { omitir: ['registros', 'ventas', 'facturacion'] })])}`;
    } else {
      const id = $('#cmp-vsl').value;
      const code = $('#cmp-lanz').value;
      const hoy = dayInMadrid(new Date().toISOString());
      const iv = await indVslRango(id, { desde: addDay(hoy, -89), hasta: hoy });
      const il = indicadoresLanzamiento(await loadLaunchMetrics(code), state.config.launches[code]);
      const filas = INDICADORES.filter((x) => !['convVip', 'convClase1', 'registros', 'ventas', 'facturacion'].includes(x.id));
      res.innerHTML = `${tablaComparativa([{ titulo: `${vslCfg(id).name} (90 días)`, ind: iv }, { titulo: state.config.launches[code].name, ind: il }, { titulo: 'VSL vs lanzamiento', delta: diferencias(iv, il) }], filas)}
        <p class="muted small">Se comparan ratios (coste por lead, conversión, coste por venta, ticket, ROAS): los totales dependen de la duración de cada uno.</p>
        <h3 class="cfg-h3">Lectura</h3>${alertasHtml(alertas(iv, il, `«${state.config.launches[code].name}»`, { omitir: ['registros', 'ventas', 'facturacion', 'convVip', 'convClase1'] }).map((a) => ({ ...a, texto: `En la VSL, ${a.texto.charAt(0).toLowerCase()}${a.texto.slice(1)}` })))}`;
    }
  } catch (err) { res.innerHTML = `<p class="error">${esc(err.message)}</p>`; } finally { b.disabled = false; }
});

// ---------- Previsión durante el lanzamiento (pestaña Objetivos y calculadora) ----------
function renderPrevision(m, launch) {
  const box = $('#prevision');
  const hist = historico();
  const hoy = dayInMadrid(new Date().toISOString());
  const finCapt = launch.finCaptacion || (launch.fechaDirecto ? addDays(launch.fechaDirecto, -1) : '');
  const dias = finCapt ? Math.round((Date.parse(`${finCapt}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86400_000) + 1 : 0;
  const llevaDias = launch.inicioCaptacion && launch.inicioCaptacion <= hoy ? Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${launch.inicioCaptacion}T12:00:00Z`)) / 86400_000) + 1 : 0;
  const ritmo = llevaDias ? m.total / llevaDias : null;
  const objVentas = Number(launch.objetivos?.ventas) || 0;
  const cerrado = launch.cierreCarrito && launch.cierreCarrito.slice(0, 10) < hoy;
  if (cerrado) { box.innerHTML = ''; return; }
  const p = prevision({ registros: m.total, vip: m.vip, clase1: m.clase1, ventas: m.compra, carritoAbierto: Boolean(launch.fechaDirecto && launch.fechaDirecto <= hoy) }, hist,
    { diasCaptacion: Math.max(0, dias), ritmoDiario: ritmo, objetivoVentas: objVentas, conVip: conVip(launch) });
  if (!p.calculable) {
    box.innerHTML = `<section class="card prev"><h3>${icon('trend')} Previsión de ventas</h3><p class="muted">Para estimar las ventas finales hace falta el histórico: pulsa «Cargar histórico» en la calculadora de abajo.</p></section>`;
    return;
  }
  const ESTADOS_P = { 'no-llega': ['mal', 'Al ritmo actual no se llega al objetivo'], justo: ['warn', 'En el límite: puede no llegar'], probable: ['ok', 'Lo normal es llegar al objetivo'], sobrado: ['ok', 'Se llega con margen'] };
  const [tono, texto] = ESTADOS_P[p.estado] || ['', ''];
  const cplActual = m.eco.inversion && m.total ? m.eco.inversion / m.total : null;
  const sinContactar = state.leads.filter((l) => ['muy-caliente', 'caliente'].includes(l.estado.id) && !l.s.wa_enviado && !l.s.compra).length;
  const sug = [];
  if (p.estado === 'no-llega' || p.estado === 'justo') {
    if (p.registrosExtra && dias > 0) sug.push(`Faltan unos <strong>${p.registrosExtra.toLocaleString('es-ES')} registros más</strong> (≈ ${Math.ceil(p.registrosExtra / dias).toLocaleString('es-ES')} al día)${cplActual ? `: sube el presupuesto unos <strong>${eur((p.registrosExtra / dias) * cplActual)}/día</strong> a tu CPL actual` : ''}.`);
    if (sinContactar) sug.push(`Refuerza el setteo: hay <strong>${sinContactar} leads calientes o muy calientes sin contactar</strong> por WhatsApp.`);
    sug.push('Revisa los anuncios ganadores y apaga los que no traen ventas.');
  }
  box.innerHTML = `<section class="card prev">
    <h3>${icon('trend')} Previsión de ventas al final del lanzamiento</h3>
    <div class="prev-kpis">
      <div><span>Ventas previstas</span><strong>${p.ventas.toLocaleString('es-ES')}</strong><small>entre ${p.bajo.toLocaleString('es-ES')} y ${p.alto.toLocaleString('es-ES')}</small></div>
      <div><span>Registros al final de la captación</span><strong>${p.regFinal.toLocaleString('es-ES')}</strong><small>${ritmo ? `a ${ritmo.toLocaleString('es-ES', { maximumFractionDigits: 1 })} al día` : ''}${dias > 0 ? ` · quedan ${dias} días` : ''}</small></div>
      ${objVentas ? `<div><span>Objetivo de ventas</span><strong>${objVentas.toLocaleString('es-ES')}</strong><small class="prev-${tono}">${esc(texto)}</small></div>` : ''}
    </div>
    <p class="muted small">Conversión del ${esc(p.fuente)}${p.ratios.length ? ', ajustada por cómo va esta edición: ' + p.ratios.map((r) => `${esc(r.que)} ${r.v >= 1 ? '▲' : '▼'} ×${r.v.toLocaleString('es-ES', { maximumFractionDigits: 2 })} frente a lo normal`).join(' · ') : ''}.</p>
    ${sug.length ? `<ul class="calc-sug">${sug.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}
  </section>`;
}

// ---------- Rendimiento del equipo ----------
const horasTxt = (h) => (h == null ? '–' : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toLocaleString('es-ES', { maximumFractionDigits: 1 })} h` : `${Math.round(h / 24)} días`);
async function loadRendimiento() {
  const box = $('#rend-body');
  const code = codigo();
  if (!code) { box.innerHTML = '<p class="muted">Elige un lanzamiento.</p>'; return; }
  try {
    // Los datos del servidor se reutilizan unos segundos (render() se llama a menudo).
    if (!(state.rend?.code === code && state.rend.at > Date.now() - 15_000)) {
      box.innerHTML = '<p class="muted">Cargando…</p>';
      state.rend = { code, at: Date.now(), d: await api(`/api/rendimiento?l=${encodeURIComponent(code)}`) };
    }
    const { d } = state.rend;
    const vsl = enVsl();
    const fuente = vsl ? (state.vsl.leads || []) : state.leads;
    const launch = embudoActual();
    const leads = fuente.map((l) => ({ id: l.id, regAt: l.dateAdded, compra: l.s.compra, importe: vsl ? importeVsl(l, launch) : importeCompra(l, launch) }));
    const rango = vsl ? vslRango() : null;
    const r = rendimientoEquipo({ eventos: d.eventos, llamadas: d.llamadas, leads, rango });
    const pc = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
    const t = r.total;
    box.innerHTML = `<div class="prev-kpis">
        <div><span>WhatsApps enviados</span><strong>${t.wa}</strong><small>${t.contactados} leads contactados</small></div>
        <div><span>Sin contactar (y sin comprar)</span><strong>${t.sinContactar}</strong><small>de ${leads.length} leads${rango ? ' (todas las fechas)' : ''}</small></div>
        <div><span>Llamadas hechas</span><strong>${t.llamadas}</strong><small>${t.cierres} cierres</small></div>
        <div><span>Tiempo de respuesta (mediana)</span><strong>${horasTxt(t.respuestaMediana)}</strong><small>desde el registro hasta el primer WhatsApp</small></div>
      </div>
      ${r.personas.length ? `<div class="table-scroll"><table class="metric-table"><thead><tr><th>Persona</th><th class="num">WhatsApps</th><th class="num">Contactados</th><th class="num">Respuesta (mediana)</th><th class="num">En &lt;24 h</th><th class="num">Resultados</th><th class="num">Llamadas (shows)</th><th class="num">No shows</th><th class="num">Cierres</th><th class="num">% cierre</th><th class="num">Ventas de sus contactados</th><th class="num">Importe</th></tr></thead>
      <tbody>${r.personas.map((x) => `<tr><td><strong>${esc(x.nombre)}</strong></td><td class="num">${x.wa}</td><td class="num">${x.contactados}</td><td class="num">${horasTxt(x.respuestaMediana)}</td><td class="num">${pc(x.en24h)}</td>
        <td class="num" title="${esc(Object.entries(x.resultados).map(([k, n]) => `${k}: ${n}`).join(' · '))}">${Object.values(x.resultados).reduce((a, b) => a + b, 0)}</td>
        <td class="num">${x.shows}</td><td class="num">${x.noshows}</td><td class="num">${x.cierres}</td><td class="num">${pc(x.cierreRate)}</td><td class="num">${x.ventas} <small class="muted">${pc(x.conversion)}</small></td><td class="num">${eur(x.importe || null)}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted small">«Ventas de sus contactados»: compras de los leads a los que esa persona escribió primero (para comisiones). Los cierres son las llamadas con resultado «Venta».${rango ? ' Periodo: el elegido en Métricas de la VSL.' : ''}</p>` : '<p class="muted">Aún no hay actividad registrada: aparecerá en cuanto el equipo envíe WhatsApps o anote resultados desde el dashboard.</p>'}`;
  } catch (e) { box.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}

// ---------- Informe para el cliente (lanzamiento o VSL semanal) ----------
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-informe]');
  if (!b) return;
  const st = b.parentElement.querySelector('[data-informe-status]');
  const que = enVsl() ? { v: state.embudo } : { l: state.launchCode };
  const cq = state.cliente && !state.clientes.find((c) => c.id === state.cliente)?.principal ? `&c=${encodeURIComponent(state.cliente)}` : '';
  if (b.dataset.informe === 'ver') { window.open(`/api/informe?${new URLSearchParams(que)}${cq}`, '_blank', 'noopener'); return; }
  b.disabled = true;
  try {
    if (b.dataset.informe === 'enlace') {
      const { url } = await api('/api/informe', { method: 'POST', body: { op: 'enlace', ...que } });
      await navigator.clipboard?.writeText(url).catch(() => {});
      st.innerHTML = `Enlace copiado ✓ <a href="${esc(url)}" target="_blank" rel="noopener">abrir</a>`;
    } else {
      if (!window.confirm('¿Mandar ahora el informe por email a las personas con el rol Cliente?')) return;
      st.textContent = 'Preparando el informe…';
      const r = await api('/api/informe', { method: 'POST', body: { op: 'enviar', ...que } });
      st.textContent = r.destinatarios ? `Enviado a ${r.enviados} de ${r.destinatarios} ✓` : 'No hay nadie con el rol Cliente: créale un usuario en Equipo (o copia el enlace).';
    }
  } catch (err) { st.textContent = err.message; } finally { b.disabled = false; }
});

// ---------- Portal del cliente (rol «Cliente»: solo lectura) ----------
const fechaPortal = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '');
const ESTADO_PORTAL = { captacion: ['Captación', 'info'], carrito: ['Carrito abierto', 'buy'], cerrado: ['Cerrado', ''] };
function tarjetaPortal(e) {
  if (e.tipo === 'error') return `<article class="portal-card"><h2>${esc(e.nombre)}</h2><p class="error">No se pudieron leer los datos: ${esc(e.error)}</p></article>`;
  const k = e.kpis;
  const roas = (x) => (x ? x.toLocaleString('es-ES', { maximumFractionDigits: 1 }) : '–');
  const kpi = (label, v, sub = '') => `<div class="portal-kpi"><span>${label}</span><strong>${v}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const total = e.funnel[0]?.[1] || 0;
  const funnel = e.funnel.map(([label, n]) => `<div class="funnel-row"><div class="funnel-label">${esc(label)}</div>
    <div class="funnel-bar"><span style="width:${total ? (n / total) * 100 : 0}%"></span></div><div class="funnel-num"><strong>${(n ?? 0).toLocaleString('es-ES')}</strong> <span class="muted">${pctOf(n, total)}</span></div></div>`).join('');
  const objetivos = (e.objetivos || []).map((o) => `<div class="portal-obj"><div class="row"><strong>${esc(o.label)}</strong><span class="spacer"></span><span>${o.unit === 'eur' ? eur(o.actual) : Math.round(o.actual).toLocaleString('es-ES')} <span class="muted">de ${o.unit === 'eur' ? eur(o.meta) : o.meta.toLocaleString('es-ES')}</span> · <strong>${Math.round(o.pct * 100)}%</strong></span></div>
    <div class="obj-bar"><span style="width:${Math.min(100, o.pct * 100)}%"></span></div></div>`).join('');
  const hitos = (e.hitos || []).map((h) => `<li><strong>${esc(fechaPortal(h.dia))}</strong>${h.hora ? ` · ${esc(h.hora)}` : ''} — ${esc(h.titulo)}</li>`).join('');
  const [estado, tono] = ESTADO_PORTAL[e.estado] || ['', ''];
  const cabecera = e.tipo === 'vsl'
    ? `<h2>🎬 ${esc(e.nombre)}</h2><p class="muted">${esc(PERIODOS_PORTAL[e.preset || '30d'] || 'Últimos 30 días')} (${esc(fechaPortal(e.periodo.desde))} – ${esc(fechaPortal(e.periodo.hasta))})</p>`
    : `<h2>🚀 ${esc(e.nombre)} ${estado ? `<span class="badge tone-${tono}">${estado}</span>` : ''}</h2><p class="muted">${esc(e.embudo)} · ${esc(e.formato)}${e.fechas.directo ? ` · webinar el ${esc(fechaPortal(e.fechas.directo))}` : ''}${e.fechas.cierre ? ` · cierre ${esc(fechaPortal(e.fechas.cierre))}` : ''}</p>`;
  return `<article class="portal-card">${cabecera}
    <div class="portal-kpis">
      ${kpi('Registros', (k.registros ?? 0).toLocaleString('es-ES'))}
      ${k.vip != null ? kpi('Entradas VIP', k.vip.toLocaleString('es-ES')) : ''}
      ${kpi('Ventas', (k.ventas ?? 0).toLocaleString('es-ES'))}
      ${kpi('Facturación', eur(k.facturacion || 0))}
      ${kpi('Inversión en anuncios', eur(k.inversion))}
      ${kpi('ROAS', roas(k.roas), 'facturación ÷ inversión')}
      ${kpi('Coste por registro', eur(k.cpl))}
      ${kpi('Coste por venta', eur(k.cac))}
    </div>
    ${objetivos ? `<h3>Objetivos</h3>${objetivos}` : ''}
    <h3>Embudo</h3><div class="portal-funnel">${funnel}</div>
    ${hitos ? `<h3>Próximos hitos</h3><ul class="portal-hitos">${hitos}</ul>` : ''}
    <p><a class="btn" href="/api/informe?${e.tipo === 'vsl' ? 'v' : 'l'}=${encodeURIComponent(e.code)}${state.clientes.find((c) => c.id === portalCliente)?.principal ? '' : `&c=${encodeURIComponent(portalCliente)}`}" target="_blank" rel="noopener">${e.tipo === 'vsl' ? 'Informe de la semana pasada ↗' : 'Informe completo ↗'}</a></p>
  </article>`;
}
// Cliente cuyo portal se está viendo (el actual o, con «Ver como», otro cliente de la agencia).
let portalCliente = null;
// El cliente elige qué embudo ver (o todos), y en cada uno qué lanzamiento o qué periodo (VSL).
const PERIODOS_PORTAL = { '7d': 'Últimos 7 días', '30d': 'Últimos 30 días', '90d': 'Últimos 90 días', 'mes-actual': 'Este mes', 'mes-pasado': 'El mes pasado' };
const portal = { catalogo: [], resumen: null, sel: 'todos', l: '', periodo: '30d', vistaPrevia: false };
const portalHtml = (html, producto) => (portalCliente !== state.cliente ? conProducto(html, producto) : html);
function pintarPortalNav() {
  const chip = (id, txt) => `<button type="button" class="portal-chip ${portal.sel === id ? 'on' : ''}" data-portal-emb="${esc(id)}">${txt}</button>`;
  const e = portal.catalogo.find((x) => x.id === portal.sel);
  const extra = !e ? '' : e.tipo === 'lanzamientos'
    ? (e.lanzamientos.length > 1 ? `<label class="portal-pick"><span>Lanzamiento</span><select id="portal-lanz">${e.lanzamientos.map((x) => `<option value="${esc(x.code)}" ${x.code === portal.l ? 'selected' : ''}>${esc(x.nombre)}${x.inicio ? ` · ${esc(fechaPortal(x.inicio))}` : ''}</option>`).join('')}</select></label>` : '')
    : `<label class="portal-pick"><span>Periodo</span><select id="portal-periodo">${Object.entries(PERIODOS_PORTAL).map(([k, v]) => `<option value="${k}" ${k === portal.periodo ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`;
  $('#portal-nav').innerHTML = portal.catalogo.length > 1 || extra
    ? `<div class="portal-chips">${portal.catalogo.length > 1 ? chip('todos', 'Todos los embudos') : ''}${portal.catalogo.map((x) => chip(x.id, `${x.tipo === 'vsl' ? '🎬' : '🚀'} ${esc(x.nombre)}`)).join('')}</div>${extra}`
    : '';
}
async function pintarPortalCuerpo() {
  const body = $('#portal-body');
  if (portal.sel === 'todos' || !portal.catalogo.some((x) => x.id === portal.sel)) {
    const r = portal.resumen;
    body.innerHTML = portalHtml(r.embudos.length ? r.embudos.map(tarjetaPortal).join('') : '<p class="muted">Todavía no hay ningún lanzamiento en marcha.</p>', r.producto);
    return;
  }
  body.innerHTML = '<p class="muted">Cargando…</p>';
  try {
    const q = new URLSearchParams({ embudo: portal.sel, ...(portal.l ? { l: portal.l } : {}), periodo: portal.periodo, ...(portal.vistaPrevia ? { fresh: '1' } : {}) });
    const { detalle } = await api(`/api/resumen?${q}`, { cliente: portalCliente });
    body.innerHTML = detalle.tipo === 'vacio'
      ? `<div class="portal-card"><h2>🚀 ${esc(detalle.nombre)}</h2><p class="muted">Este embudo todavía no tiene ningún lanzamiento en marcha.</p></div>`
      : portalHtml(tarjetaPortal(detalle), portal.resumen?.producto);
  } catch (e) { body.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}
$('#portal-nav').addEventListener('click', (e) => {
  const b = e.target.closest('[data-portal-emb]');
  if (!b) return;
  portal.sel = b.dataset.portalEmb;
  const emb = portal.catalogo.find((x) => x.id === portal.sel);
  portal.l = emb?.lanzamientos?.[0]?.code || '';
  ls.set(`lsd_portal_${portalCliente}`, portal.sel);
  pintarPortalNav();
  pintarPortalCuerpo();
});
$('#portal-nav').addEventListener('change', (e) => {
  if (e.target.id === 'portal-lanz') portal.l = e.target.value;
  else if (e.target.id === 'portal-periodo') portal.periodo = e.target.value;
  else return;
  pintarPortalCuerpo();
});
async function mostrarPortal({ vistaPrevia = false, cliente = state.cliente } = {}) {
  portalCliente = cliente;
  $('#app').hidden = true;
  $('#login').hidden = true;
  $('#portal').hidden = false;
  $('#portal-volver').hidden = !vistaPrevia;
  $('#portal-cuenta').hidden = !state.user || vistaPrevia;
  $('#portal-salir').hidden = vistaPrevia;
  const cli = state.clientes.find((c) => c.id === cliente);
  $('#portal-titulo').textContent = `Resultados · ${cli?.nombre || ''}`;
  $('#portal-aviso').hidden = !vistaPrevia;
  $('#portal-aviso').innerHTML = vistaPrevia ? `👁 <strong>Vista «Ver como»:</strong> esto es exactamente lo que ve <strong>${esc(cli?.nombre || 'este cliente')}</strong> al entrar con su acceso de cliente. No le cambia nada ni le avisa.` : '';
  const body = $('#portal-body');
  body.innerHTML = '<p class="muted">Cargando los resultados…</p>';
  $('#portal-nav').innerHTML = '';
  // Viendo otro cliente: con el nombre de SU producto (no el del cliente en el que estás).
  if (cliente !== state.cliente) body.dataset.otroCliente = '1'; else delete body.dataset.otroCliente;
  try {
    const r = await api(`/api/resumen${vistaPrevia ? '?fresh=1' : ''}`, { cliente });
    $('#portal-sub').textContent = `Datos actualizados a las ${new Date(r.generado).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · ${r.producto}`;
    Object.assign(portal, { resumen: r, catalogo: r.catalogo || [], vistaPrevia, periodo: '30d' });
    const guardado = ls.get(`lsd_portal_${cliente}`);
    portal.sel = portal.catalogo.length === 1 ? portal.catalogo[0].id : portal.catalogo.some((x) => x.id === guardado) ? guardado : 'todos';
    portal.l = portal.catalogo.find((x) => x.id === portal.sel)?.lanzamientos?.[0]?.code || '';
    pintarPortalNav();
    await pintarPortalCuerpo();
  } catch (e) { body.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}
$('#portal-salir').addEventListener('click', () => $('#btn-logout').click());
$('#portal-cuenta').addEventListener('click', () => $('#btn-cuenta').click());
$('#portal-volver').addEventListener('click', () => {
  $('#portal').hidden = true;
  $('#app').hidden = false;
  // Si venía de «Ver como» en Agencia, vuelve ahí.
  if (vcVolverAgencia) { vcVolverAgencia = false; $('#agencia-dialog').showModal(); }
});

// «Ver como» (Agencia, superadmin): el portal de cualquier cliente tal y como lo ve él.
let vcVolverAgencia = false;
async function pintarVerComo() {
  const sel = $('#vc-cliente');
  const prev = sel.value || state.cliente;
  sel.innerHTML = state.clientes.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');
  sel.value = state.clientes.some((c) => c.id === prev) ? prev : state.clientes[0]?.id || '';
  pintarQuienVe();
}
async function pintarQuienVe() {
  const id = $('#vc-cliente').value;
  const box = $('#vc-quien');
  box.textContent = '';
  try {
    const { users } = await api('/api/usuarios', { cliente: id });
    const quien = users.filter((u) => u.rol === ROL_CLIENTE && u.activo !== false);
    if ($('#vc-cliente').value !== id) return;
    box.innerHTML = quien.length
      ? `Lo ven con su acceso de cliente: ${quien.map((u) => `<strong>${esc(u.nombre)}</strong> <span class="muted">(${esc(u.email)})</span>`).join(', ')}.`
      : 'Este cliente aún no tiene a nadie con acceso de «Cliente (solo lectura)». Se le da en Equipo → Miembros del equipo, entrando en el cliente.';
  } catch { /* sin datos del equipo: no pasa nada */ }
}
$('#vc-cliente').addEventListener('change', pintarQuienVe);
$('.tab[data-tab="ag-vercomo"]').addEventListener('click', pintarVerComo);
$('#vc-ver').addEventListener('click', () => {
  const id = $('#vc-cliente').value;
  if (!id) return;
  vcVolverAgencia = true;
  $('#agencia-dialog').close();
  mostrarPortal({ vistaPrevia: true, cliente: id });
});
$('#btn-ver-portal').addEventListener('click', () => { $('#equipo-dialog').close(); mostrarPortal({ vistaPrevia: true }); });

// ---------- Panel de agencia (superadmin): todos los clientes de un vistazo ----------
const fechaAg = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
function badgesAuditor(a, vencidas) {
  if (!a) return '';
  return `${a.critico ? `<span class="ag-badge crit">🔴 ${a.critico} crítico${a.critico === 1 ? '' : 's'}</span>` : ''}${a.importante ? `<span class="ag-badge imp">🟠 ${a.importante} importante${a.importante === 1 ? '' : 's'}</span>` : ''}${!a.critico && !a.importante ? '<span class="ag-badge ok">✓ Auditor sin pendientes graves</span>' : ''}${vencidas ? `<span class="ag-badge crit">${vencidas} tarea${vencidas === 1 ? '' : 's'} vencida${vencidas === 1 ? '' : 's'}</span>` : ''}`;
}
function tarjetaAgencia(c) {
  const entrar = c.id === state.cliente ? '<span class="muted small">(cliente actual)</span>' : `<button type="button" class="btn primary" data-ag-entrar="${esc(c.id)}">Entrar →</button>`;
  const alta = c.alta ? `<details class="ag-alta"${c.alta.hechos < c.alta.total ? ' open' : ''}><summary>Alta del cliente: <strong>${c.alta.hechos}/${c.alta.total}</strong> listo</summary>
      <div class="ag-alta-bar"><span style="width:${(c.alta.hechos / c.alta.total) * 100}%"></span></div>
      <ul>${c.alta.pasos.map((p) => `<li>${p.ok ? '✅' : '⬜'} ${esc(p.label)}${p.detalle ? ` <small class="muted">· ${esc(p.detalle)}</small>` : ''}</li>`).join('')}</ul></details>` : '';
  if (c.error || !c.conectado) {
    return `<article class="ag-card" style="--cl:${esc(c.color || 'var(--border)')}"><header><h3>${esc(c.nombre)}</h3><span class="spacer"></span>${entrar}</header>
      <p class="error">${esc(c.error || 'GHL sin conectar')}</p>${alta}</article>`;
  }
  const l = c.lanzamiento;
  const obj = l?.objetivos || {};
  const deObj = (v, k) => (Number(obj[k]) > 0 && v != null ? `<small class="muted"> / ${Number(obj[k]).toLocaleString('es-ES')}</small>` : '');
  const lanz = l ? `<div><strong>🚀 ${esc(l.nombre)}</strong> <span class="muted small">${esc(l.embudo)}${l.formato && l.formato !== 'webinar' ? ` · ${esc(FORMATOS[l.formato]?.label || '')}` : ''}</span>
      ${l.proximoHito ? `<div class="small">Próximo: <strong>${esc(l.proximoHito.label)}</strong> el ${esc(fechaAg(l.proximoHito.dia))}</div>` : ''}</div>
    <div class="ag-kpis">
      <div><span>Registros</span><strong>${l.registros ?? '–'}${deObj(l.registros, 'registros')}</strong></div>
      <div><span>VIP</span><strong>${l.vip ?? '–'}${deObj(l.vip, 'vip')}</strong></div>
      <div><span>Ventas</span><strong>${l.ventas ?? '–'}${deObj(l.ventas, 'ventas')}</strong></div>
      <div><span>Inversión</span><strong>${eur(l.inversion || null)}</strong></div>
      <div><span>CPL</span><strong>${eur(l.cpl)}</strong></div>
      <div><span>ROAS</span><strong>${l.roas ? l.roas.toLocaleString('es-ES', { maximumFractionDigits: 1 }) : '–'}</strong></div>
    </div>
    ${l.inversion7 != null ? `<div class="small muted">Inversión de los últimos 7 días: ${eur(l.inversion7)}</div>` : ''}
    <div class="ag-badges">${badgesAuditor(l.auditor, l.vencidas)}</div>
    ${l.auditor.criticos.length ? `<ul class="ag-crit">${l.auditor.criticos.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}` : '<p class="muted">Sin lanzamiento en curso.</p>';
  const vsls = (c.vsls || []).map((v) => `<div class="ag-vsl">🎬 <strong>${esc(v.nombre)}</strong> · ${v.registros ?? '–'} registros · ${v.ventas ?? '–'} ventas <div class="ag-badges">${badgesAuditor(v.auditor, v.vencidas)}</div></div>`).join('');
  return `<article class="ag-card" style="--cl:${esc(c.color || 'var(--accent)')}">
    <header><h3>${esc(c.nombre)}</h3>${c.producto ? `<span class="badge">${esc(c.producto)}</span>` : ''}<span class="spacer"></span>${entrar}</header>
    ${lanz}${vsls}${alta}</article>`;
}
async function loadAgencia(fresh = false) {
  const box = $('#ag-body');
  box.innerHTML = '<p class="muted">Revisando todos los clientes… (puede tardar unos segundos)</p>';
  try {
    const r = await api(`/api/agencia${fresh ? '?fresh=1' : ''}`);
    const crit = r.clientes.reduce((t, c) => t + (c.lanzamiento?.auditor.critico || 0) + (c.vsls || []).reduce((s, v) => s + v.auditor.critico, 0), 0);
    $('#ag-info').textContent = `${r.clientes.length} cliente${r.clientes.length === 1 ? '' : 's'} · ${crit} crítico${crit === 1 ? '' : 's'} · actualizado ${new Date(r.generado).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
    // Primero los que necesitan atención.
    const peso = (c) => (c.error || !c.conectado ? 1000 : 0) + (c.lanzamiento?.auditor.critico || 0) * 10 + (c.lanzamiento?.vencidas || 0) + (c.alta ? c.alta.total - c.alta.hechos : 0);
    box.innerHTML = `<div class="ag-grid">${[...r.clientes].sort((a, b) => peso(b) - peso(a)).map(tarjetaAgencia).join('')}</div>`;
  } catch (e) { box.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}
$('#btn-agencia').addEventListener('click', () => {
  $('#agencia-dialog .tab[data-tab="ag-panel"]').click();
  $('#ag-cron').textContent = `${location.origin}/api/agencia?key=<DIGEST_KEY>`;
  $('#ag-cron-clientes').textContent = state.clientes.map((c) => `${c.nombre}:\n${location.origin}/api/agencia?key=<DIGEST_KEY>&c=${encodeURIComponent(c.id)}`).join('\n\n');
  $('#agencia-dialog').showModal();
  loadAgencia();
});
$('#ag-actualizar').addEventListener('click', () => loadAgencia(true));
$('#btn-agencia .agencia-ico').innerHTML = icon('compass');

// ---------- Agencia → Equipo de la agencia: equipo interno y sus accesos a uno o más clientes ----------
let ageq = null; // { equipo, clientes, roles: { cliente: [{ id, label }] } }
const fechaAge = (d) => (d ? new Date(d).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Nunca');
function opcionesRol(cid, actual) {
  const roles = [{ id: 'admin', label: 'Admin' }, ...((ageq.roles[cid] || []).filter((r) => r.id !== 'admin'))];
  if (actual && !roles.some((r) => r.id === actual)) roles.push({ id: actual, label: actual });
  return `<option value="">Sin acceso</option>${roles.map((r) => `<option value="${esc(r.id)}" ${r.id === actual ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}`;
}
const gridAccesos = (accesos = {}) => ageq.clientes.map((c) => `<label><span>${esc(c.nombre)}</span><select data-age-cli="${esc(c.id)}">${opcionesRol(c.id, accesos[c.id] || '')}</select></label>`).join('');
const leerAccesos = (box) => Object.fromEntries($$('[data-age-cli]', box).map((s) => [s.dataset.ageCli, s.value]).filter(([, v]) => v));
function pintarAgenciaEquipo() {
  const nombreCli = (id) => ageq.clientes.find((c) => c.id === id)?.nombre || id;
  const rolLabel = (cid, r) => (r === 'admin' ? 'Admin' : (ageq.roles[cid] || []).find((x) => x.id === r)?.label || r);
  $('#age-lista').innerHTML = ageq.equipo.length ? `<div class="table-scroll"><table class="metric-table equipo-table">
    <thead><tr><th>Persona</th><th>Clientes y rol</th><th>Último acceso</th><th></th></tr></thead>
    <tbody>${ageq.equipo.map((u) => `<tr data-age-uid="${esc(u.id)}" class="${u.activo ? '' : 'inactivo'}">
      <td><span class="t-who">${avatarHtml(u)}<span><strong>${esc(u.nombre)}</strong>${u.superadmin ? ' <span class="badge sa-badge">Superadmin</span>' : ''}<br><span class="muted">${esc(u.email)}</span>${u.dosPasos ? ' · <span class="muted">🔐 2 pasos</span>' : ''}</span></span></td>
      <td>${u.superadmin ? '<span class="age-cli"><strong>Todos los clientes</strong> · Admin</span>' : Object.entries(u.accesos || {}).map(([cid, r]) => `<span class="age-cli"><strong>${esc(nombreCli(cid))}</strong> · ${esc(rolLabel(cid, r))}</span>`).join('') || '<span class="muted">Sin clientes</span>'}</td>
      <td class="muted">${fechaAge(u.lastLogin)}</td>
      <td class="eq-actions"><button type="button" class="btn" data-age="editar">Clientes y rol</button>
        <button type="button" class="btn ghost" data-age="regenerar" title="Genera una contraseña nueva y se la envía por email">Reenviar acceso</button>
        ${u.id === state.user?.id ? '' : '<button type="button" class="btn ghost" data-age="quitar" title="Quitar del equipo de la agencia (pierde el acceso a todos los clientes)">✕</button>'}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="muted">Todavía no hay nadie en el equipo de la agencia.</p>';
  $('#age-accesos-nuevo').innerHTML = gridAccesos();
}
async function loadAgenciaEquipo() {
  $('#age-lista').innerHTML = '<p class="muted">Cargando el equipo de la agencia…</p>';
  try {
    ageq = await api('/api/usuarios?agencia=1');
    pintarAgenciaEquipo();
  } catch (e) { $('#age-lista').innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}
$('.tab[data-tab="ag-equipo"]').addEventListener('click', loadAgenciaEquipo);
const ageResult = (t, err = false) => { $('#age-result').textContent = t; $('#age-result').classList.toggle('error', err); };
$('#age-crear').addEventListener('click', async () => {
  const nombre = $('#age-nombre').value.trim();
  const email = $('#age-email').value.trim();
  if (!nombre || !email) { ageResult('Pon el nombre y el email.', true); return; }
  const b = $('#age-crear');
  b.disabled = true;
  ageResult('Añadiendo y enviando su acceso…');
  try {
    const r = await api('/api/usuarios', { method: 'POST', body: { op: 'agencia-guardar', nombre, email, accesos: leerAccesos($('#age-accesos-nuevo')), superadmin: $('#age-sa').checked } });
    $('#age-nombre').value = ''; $('#age-email').value = ''; $('#age-sa').checked = false;
    ageResult(r.yaExistia ? `${r.user.nombre} ya tenía usuario: ahora es del equipo de la agencia con esos accesos.` : r.emailEnviado ? `${r.user.nombre} añadida. Le hemos enviado su acceso a ${r.user.email}.` : `${r.user.nombre} añadida, pero no se pudo enviar el email${r.emailError ? ` (${r.emailError})` : ''}. Pásale tú la contraseña: ${r.password}`, !r.yaExistia && !r.emailEnviado);
    await loadAgenciaEquipo();
  } catch (e) { ageResult(e.message, true); } finally { b.disabled = false; }
});
$('#age-lista').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-age]');
  if (!b) return;
  const tr = b.closest('tr');
  const id = tr.dataset.ageUid || tr.previousElementSibling?.dataset.ageUid;
  const u = ageq.equipo.find((x) => x.id === id);
  const op = b.dataset.age;
  if (op === 'editar') {
    $$('.age-editor').forEach((r) => r.remove());
    tr.insertAdjacentHTML('afterend', `<tr class="age-editor"><td colspan="4"><strong>Clientes de ${esc(u.nombre)} y su rol en cada uno</strong>
      <div class="age-accesos">${gridAccesos(u.accesos)}</div>
      <label class="check"><input type="checkbox" data-age-sa ${u.superadmin ? 'checked' : ''} ${u.id === state.user?.id ? 'disabled' : ''}> Superadmin (todos los clientes como admin)</label>
      <div class="row"><button type="button" class="btn primary" data-age="guardar">Guardar</button><button type="button" class="btn ghost" data-age="cerrar">Cancelar</button></div></td></tr>`);
    return;
  }
  if (op === 'cerrar') { tr.remove(); return; }
  if (op === 'guardar') {
    b.disabled = true;
    try {
      await api('/api/usuarios', { method: 'POST', body: { op: 'agencia-guardar', id, accesos: leerAccesos(tr), superadmin: $('[data-age-sa]', tr).checked } });
      ageResult(`Accesos de ${u.nombre} guardados.`);
      await loadAgenciaEquipo();
      if (state.equipo) loadEquipo();
    } catch (ex) { ageResult(ex.message, true); b.disabled = false; }
    return;
  }
  if (op === 'regenerar') {
    if (!window.confirm(`Se generará una contraseña nueva para ${u.nombre} y se le enviará por email. ¿Continuar?`)) return;
    try {
      const r = await api('/api/usuarios', { method: 'POST', body: { op: 'regenerar', id } });
      ageResult(r.emailEnviado ? `Contraseña nueva enviada a ${u.email}.` : `No se pudo enviar el email. Pásale tú la contraseña nueva: ${r.password}`, !r.emailEnviado);
    } catch (ex) { ageResult(ex.message, true); }
    return;
  }
  if (op === 'quitar') {
    if (!window.confirm(`¿Quitar a ${u.nombre} del equipo de la agencia? Perderá el acceso a todos los clientes.`)) return;
    try {
      await api('/api/usuarios', { method: 'POST', body: { op: 'agencia-quitar', id } });
      ageResult(`${u.nombre} ya no está en el equipo de la agencia.`);
      await loadAgenciaEquipo();
    } catch (ex) { ageResult(ex.message, true); }
  }
});
$('#ag-enviar').addEventListener('click', async (e) => {
  e.target.disabled = true;
  try {
    const r = await api('/api/agencia', { method: 'POST', body: { op: 'enviar' } });
    $('#ag-info').textContent = `Resumen enviado a ${r.enviados} de ${r.destinatarios} superadmin.`;
  } catch (err) { $('#ag-info').textContent = err.message; }
  e.target.disabled = false;
});
$('#ag-body').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ag-entrar]');
  if (b) cambiarCliente(b.dataset.agEntrar);
});

// ---------- Equipo → Marca (producto, colores de los emails y encuesta del avatar del cliente) ----------
const TIPO_PREGUNTA = { opciones: 'Opciones (una o varias)', texto: 'Texto libre', edad: 'Edad (se agrupa por tramos)' };
let marcaCampos = null; // campos de texto de GHL para la encuesta
async function loadMarca() {
  const box = $('#marca-body');
  const m = state.config.marca || {};
  const preguntas = preguntasEncuesta();
  box.innerHTML = '<p class="muted">Cargando…</p>';
  if (!marcaCampos) marcaCampos = await api('/api/fields?tipo=encuesta').then((d) => d.fields).catch(() => []);
  const opcionesCampo = (sel) => `<option value="">— Campo de GHL —</option>${marcaCampos.map((f) => `<option value="${esc(f.id)}" ${f.id === sel ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}${sel && !marcaCampos.some((f) => f.id === sel) ? `<option value="${esc(sel)}" selected>${esc(sel)}</option>` : ''}`;
  const fila = (p = {}) => `<div class="marca-preg row">
    <select class="mp-campo" aria-label="Campo de GHL">${opcionesCampo(p.id)}</select>
    <input class="mp-nombre" value="${esc(p.name || '')}" placeholder="Texto de la pregunta" maxlength="160">
    <select class="mp-tipo" aria-label="Tipo">${Object.entries(TIPO_PREGUNTA).map(([k, v]) => `<option value="${k}" ${k === (p.tipo || 'opciones') ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <button type="button" class="btn ghost mp-del" aria-label="Quitar">✕</button></div>`;
  box.innerHTML = `<div class="grid3">
      <label class="field"><span>Nombre del producto <small>(lo que se vende en el carrito)</small></span><input id="mc-producto" maxlength="40" value="${esc(m.producto || '')}" placeholder="Raíces, Método X…"></label>
      <label class="field narrow"><span>Color principal de los emails</span><input id="mc-color" type="color" value="${esc(m.color || '#860d0e')}"></label>
      <label class="field narrow"><span>Color de los botones</span><input id="mc-color2" type="color" value="${esc(m.color2 || '#c49b79')}"></label>
    </div>
    <h3 class="cfg-h3">Encuesta del avatar</h3>
    <p class="muted">Las preguntas de la encuesta de GHL (cada una guarda su respuesta en un campo personalizado del contacto). Se cruzan con las ventas en «Avatar y anuncios». Elige el campo de la lista de GHL: el tipo (opciones o texto) se pone solo; para la edad, elige «Edad».</p>
    <p class="muted small">ⓘ Si en GHL creas una pregunta nueva o duplicas una, GHL crea un campo nuevo: añádelo aquí (y quita el antiguo) para que el dashboard lea las respuestas nuevas. Si solo cambias el texto o las opciones de una pregunta, el campo es el mismo y no hay que tocar nada.</p>
    <div id="mc-preguntas">${preguntas.map(fila).join('')}</div>
    <button type="button" class="btn" id="mc-add">+ Añadir pregunta</button>
    <p class="muted small">Los mensajes de WhatsApp se cambian en <em>Setting hoy → Mensajes de WhatsApp</em> (pueden usar <code>{producto}</code>) y las tareas habituales, en <em>Tareas</em>.</p>
    <div class="row"><button type="button" class="btn primary" id="mc-guardar">Guardar marca</button><span class="muted" id="mc-status" aria-live="polite"></span></div>`;
  box.dataset.fila = '1';
  $('#mc-add').onclick = () => $('#mc-preguntas').insertAdjacentHTML('beforeend', fila());
  $('#mc-preguntas').onclick = (e) => { if (e.target.closest('.mp-del')) e.target.closest('.marca-preg').remove(); };
  // Al elegir el campo: el tipo y el texto de la pregunta salen de GHL (opciones / texto); se pueden cambiar.
  $('#mc-preguntas').onchange = (e) => {
    const sel = e.target.closest('.mp-campo');
    if (!sel) return;
    const f = marcaCampos.find((x) => x.id === sel.value);
    const fila_ = sel.closest('.marca-preg');
    if (f?.tipo && $('.mp-tipo', fila_).value !== 'edad') $('.mp-tipo', fila_).value = f.tipo;
    if (f && !$('.mp-nombre', fila_).value.trim()) $('.mp-nombre', fila_).value = f.name.replace(/\s*\*\s*$/, '');
  };
  $('#mc-guardar').onclick = async () => {
    const st = $('#mc-status');
    const encuesta = $$('#mc-preguntas .marca-preg').map((r) => ({ id: $('.mp-campo', r).value, name: $('.mp-nombre', r).value.trim() || $('.mp-campo', r).selectedOptions[0]?.textContent || '', tipo: $('.mp-tipo', r).value })).filter((p) => p.id);
    st.textContent = 'Guardando…';
    try {
      const { config } = await api('/api/config', { method: 'POST', body: { op: 'marca', marca: { producto: $('#mc-producto').value.trim(), color: $('#mc-color').value, color2: $('#mc-color2').value }, encuesta } });
      state.config = config;
      st.textContent = 'Guardado ✓ Recarga el dashboard para ver el nombre nuevo en todos los textos.';
    } catch (err) { st.textContent = err.message; }
  };
}
$('.tab[data-tab="marca"]').addEventListener('click', () => loadMarca().catch((e) => { $('#marca-body').innerHTML = `<p class="error">${esc(e.message)}</p>`; }));

// ---------- Equipo → Historial (cambios y copias de seguridad; necesita D1) ----------
const fechaHora = (iso) => new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const pesoKb = (b) => (b >= 1024 ? `${(b / 1024).toFixed(b >= 10240 ? 0 : 1)} KB` : `${b} B`);
const histAmbito = () => (state.superadmin ? $('#hist-ambito').value : 'cliente');
async function loadHistorial() {
  const box = $('#hist-body');
  const ambito = histAmbito();
  const q = new URLSearchParams({ ambito, ...(state.cliente ? { c: state.cliente } : {}) });
  $('#hist-exportar').href = `/api/historial?${q}&exportar=1`;
  box.innerHTML = '<p class="muted">Cargando…</p>';
  try {
    const d = await api(`/api/historial?ambito=${ambito}`);
    $('#hist-exportar').hidden = !d.disponible;
    if (!d.disponible) {
      box.innerHTML = `<div class="notice">El historial y las copias necesitan la base de datos propia del dashboard (Cloudflare D1), que aún no está conectada. Mientras tanto, los datos siguen guardándose en GHL como siempre.${state.superadmin ? ' <br><small>Cómo conectarla: README → «Base de datos (D1)».</small>' : ''}</div>`;
      return;
    }
    const cambios = d.cambios.length
      ? `<div class="table-scroll"><table class="metric-table hist-table"><thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Detalle</th></tr></thead><tbody>${d.cambios.map((c) => `<tr>
          <td title="${esc(c.en)}">${esc(fechaHora(c.en))}</td><td>${esc(c.por || '—')}</td><td>${esc(c.etiqueta)}</td><td class="muted">${esc([c.motivo, c.version ? `v${c.version}` : ''].filter(Boolean).join(' · '))}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted">Aún no hay cambios registrados.</p>';
    const grupos = new Map();
    for (const c of d.copias) {
      if (!grupos.has(c.clave)) grupos.set(c.clave, { etiqueta: c.etiqueta, lista: [] });
      grupos.get(c.clave).lista.push(c);
    }
    const copias = grupos.size
      ? [...grupos.values()].map((g) => `<details class="hist-copias"><summary><strong>${esc(g.etiqueta)}</strong> <span class="muted">· ${g.lista.length} copia${g.lista.length === 1 ? '' : 's'}</span></summary>
          <ul>${g.lista.map((c) => `<li><span>${esc(fechaHora(c.en))} <span class="muted">· versión ${c.version} · ${pesoKb(c.bytes)}</span></span><button type="button" class="btn" data-restaurar="${c.id}" data-etiqueta="${esc(g.etiqueta)}" data-en="${esc(fechaHora(c.en))}">Restaurar</button></li>`).join('')}</ul></details>`).join('')
      : '<p class="muted">Todavía no hay copias: se hace la primera cuando un dato cambia (y luego una al día como mucho).</p>';
    box.innerHTML = `<h3 class="cfg-h3">Últimos cambios</h3>${cambios}<h3 class="cfg-h3">Copias de seguridad</h3>${copias}
      <p class="muted small">Además, Cloudflare guarda la base de datos completa de los últimos 30 días («Time Travel»): si hiciera falta volver atrás todo a la vez, se puede desde Cloudflare.</p>`;
  } catch (e) { box.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}
$('.tab[data-tab="historial"]').addEventListener('click', loadHistorial);
$('#hist-ambito').addEventListener('change', loadHistorial);
$('#hist-body').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-restaurar]');
  if (!b) return;
  if (!confirm(`¿Restaurar «${b.dataset.etiqueta}» como estaba el ${b.dataset.en}?\n\nLo que hay ahora queda guardado como copia, así que se puede deshacer.`)) return;
  b.disabled = true;
  try {
    await api('/api/historial', { method: 'POST', body: { op: 'restaurar', id: Number(b.dataset.restaurar), ambito: histAmbito() } });
    alert('Restaurado ✓ Recarga el dashboard para ver los datos como estaban.');
    loadHistorial();
  } catch (e) { alert(e.message); b.disabled = false; }
});

// ---------- Equipo → Seguridad ----------
async function loadSeguridad() {
  const box = $('#seg-body');
  box.innerHTML = '<p class="muted">Cargando…</p>';
  try {
    const d = await api('/api/seguridad');
    const s = d.seguridad;
    const ajustes = state.superadmin ? `<h3 class="cfg-h3">Ajustes de la agencia <small class="muted">(todos los clientes)</small></h3>
      <label class="seg-ajuste"><input type="checkbox" id="seg-general" ${s.contrasenaGeneral ? 'checked' : ''}>
        <span><strong>Permitir entrar con la contraseña general</strong><br><small class="muted">La de las variables ADMIN_PASSWORD / SETTER_PASSWORD de Cloudflare. Es compartida y no deja rastro de quién entra: cuando todo el equipo tenga su usuario con email, desactívala. Si alguna vez os quedáis fuera, poniendo la variable REACTIVAR_CONTRASENA_GENERAL=1 en Cloudflare vuelve a funcionar.</small>
        ${d.reactivadaPorVariable ? '<br><small class="error">Ahora mismo está forzada por la variable REACTIVAR_CONTRASENA_GENERAL=1: quítala de Cloudflare cuando ya no haga falta.</small>' : ''}</span></label>
      <label class="seg-ajuste"><input type="checkbox" id="seg-2fa" ${s.exigir2fa ? 'checked' : ''}>
        <span><strong>Exigir la verificación en dos pasos a los admins</strong><br><small class="muted">Quien sea admin en algún cliente (y el superadmin) tendrá que activarla la próxima vez que entre.</small></span></label>
      <div class="row"><button type="button" class="btn primary" id="seg-guardar">Guardar ajustes</button><span id="seg-status" class="muted" aria-live="polite"></span></div>` : '';
    const filas = d.usuarios.map((u) => `<tr><td>${esc(u.nombre)}${u.superadmin ? ' <span class="badge">superadmin</span>' : ''}${u.activo ? '' : ' <span class="muted">(desactivado)</span>'}</td>
      <td>${esc(u.superadmin ? 'Admin' : ROLE_LABEL[u.rol] || u.rol)}</td>
      <td>${u.dosPasos ? '<span class="ok-txt">✓ Activada</span>' : u.esAdmin ? '<span class="error">No (es admin)</span>' : '<span class="muted">No</span>'}</td>
      <td>${u.dosPasos && u.id !== yoUid() ? `<button type="button" class="btn ghost" data-quitar-2fa="${esc(u.id)}" data-nombre="${esc(u.nombre)}" title="Si ha perdido el móvil: la vuelve a activar al entrar">Quitar</button>` : ''}</td></tr>`).join('');
    box.innerHTML = `${ajustes}
      <h3 class="cfg-h3">Verificación en dos pasos del equipo</h3>
      <p class="muted">Cada persona la activa en <strong>Mi cuenta</strong>. Si alguien pierde el móvil y no tiene sus códigos de recuperación, quítasela aquí y la vuelve a activar.</p>
      <div class="table-scroll"><table class="metric-table seg-tabla"><thead><tr><th>Persona</th><th>Rol</th><th>Dos pasos</th><th></th></tr></thead><tbody>${filas || '<tr><td colspan="4" class="muted">Nadie con usuario propio todavía.</td></tr>'}</tbody></table></div>
      <h3 class="cfg-h3">Intentos de entrar</h3>
      <p class="muted">Tras ${d.limites.fallos} intentos fallidos con un mismo email (o ${d.limites.fallosIp} desde una misma conexión) se bloquea ${d.limites.minutos} minutos. ${d.limites.compartido ? '' : 'Sin la base de datos D1, cada servidor de Cloudflare cuenta por su lado (protege menos).'}</p>
      <h3 class="cfg-h3">Permisos del token de GHL de este cliente</h3>
      <p class="muted">Comprueba, solo leyendo (no cambia nada), a qué partes de GHL llega el token. Lo que salga en rojo hay que marcarlo en GHL → Ajustes → Integraciones privadas → la del dashboard → permisos.</p>
      <div class="row"><button type="button" class="btn" id="seg-token">Comprobar permisos</button></div>
      <div id="seg-token-res"></div>`;
  } catch (e) { box.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}
$('.tab[data-tab="seguridad"]').addEventListener('click', loadSeguridad);
$('#seg-body').addEventListener('click', async (ev) => {
  const t = ev.target;
  if (t.id === 'seg-guardar') {
    const st = $('#seg-status');
    if (!$('#seg-general').checked && !confirm('¿Desactivar la contraseña general? Desde ahora solo se podrá entrar con email y contraseña propios.')) return;
    try {
      await api('/api/seguridad', { method: 'POST', body: { op: 'guardar', contrasenaGeneral: $('#seg-general').checked, exigir2fa: $('#seg-2fa').checked } });
      st.textContent = 'Guardado ✓';
    } catch (e) { st.textContent = e.message; }
    return;
  }
  if (t.id === 'seg-token') {
    const res = $('#seg-token-res');
    t.disabled = true;
    res.innerHTML = '<p class="muted">Comprobando…</p>';
    try {
      const { permisos } = await api('/api/seguridad', { method: 'POST', body: { op: 'probar-token' } });
      const mal = permisos.filter((p) => !p.ok).length;
      res.innerHTML = `<p class="${mal ? 'error' : 'ok-txt'}">${mal ? `Faltan ${mal} permiso${mal === 1 ? '' : 's'}` : 'El token llega a todo lo que usa el dashboard ✓'}</p>
        <ul class="perm-lista">${permisos.map((p) => `<li><span>${p.ok ? '✅' : '❌'}</span><span><strong>${esc(p.nombre)}</strong> <code class="small">${esc(p.scope)}</code></span>
          <small class="${p.ok ? 'muted' : 'error'}">${esc(p.ok ? `${p.para}${p.nota ? ` · ${p.nota}` : ''}` : `${p.error} · Se usa para: ${p.para}`)}</small></li>`).join('')}</ul>
        <p class="muted small">Los permisos de escritura (.write) no se pueden probar sin cambiar nada: márcalos también en la integración.</p>`;
    } catch (e) { res.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
    t.disabled = false;
    return;
  }
  const q = t.closest('[data-quitar-2fa]');
  if (q) {
    if (!confirm(`¿Quitar la verificación en dos pasos de ${q.dataset.nombre}? La tendrá que volver a activar.`)) return;
    try {
      await api('/api/usuarios', { method: 'POST', body: { op: 'quitar-2fa', id: q.dataset.quitar2fa } });
      loadSeguridad();
    } catch (e) { alert(e.message); }
  }
});

async function loadClientes() {
  const box = $('#clientes-list');
  box.innerHTML = '<p class="muted">Cargando…</p>';
  try {
    pintarClientes((await api('/api/clientes')).clientes);
  } catch (e) { box.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}
function pintarClientes(lista) {
  state.clientesAdmin = lista;
  $('#clientes-list').innerHTML = `<div class="cl-cards">${lista.map((c) => `<article class="cl-card ${c.id === state.cliente ? 'actual' : ''}" data-cl="${esc(c.id)}" style="--cl:${esc(c.color || 'var(--accent)')}">
    <header><span class="cl-dot"></span><input class="cl-nombre" value="${esc(c.nombre)}" maxlength="60" aria-label="Nombre">
      ${c.principal ? '<span class="badge">Principal</span>' : ''}${c.id === state.cliente ? '<span class="badge">Estás aquí</span>' : ''}</header>
    <div class="cl-datos">
      <span>Código <code>${esc(c.id)}</code></span>
      <span class="cl-estado ${c.conectado ? 'ok' : 'ko'}">${c.conectado ? '● GHL conectado' : `● Falta el token: añade <code>${esc(c.variables[0])}</code> en Cloudflare`}</span>
      ${c.principal ? '<span class="muted">Usa GHL_TOKEN y GHL_LOCATION_ID de Cloudflare</span>' : `
      <label class="field"><span>Location ID</span><input class="cl-location" value="${esc(c.locationId || '')}" maxlength="40"></label>
      <label class="field"><span>Cuenta de Meta</span><input class="cl-meta" value="${esc(c.metaAdAccount || '')}" maxlength="30" inputmode="numeric"></label>`}
      <label class="field narrow"><span>Color</span><input class="cl-color" type="color" value="${esc(c.color || '#b4552d')}"></label>
    </div>
    ${c.conectado ? '' : `<details class="emb-guia cl-card-guia" ${c.id === state.clienteNuevo ? 'open' : ''}><summary>📋 Cómo conectar su GHL</summary>${guiaPasosHtml(guiaCliente(c.variables[0], c.variables[0].replace(/^GHL_TOKEN_/, '')))}</details>`}
    <div class="row cl-acciones">
      <button type="button" class="btn" data-cl-op="probar">Probar conexión</button>
      <button type="button" class="btn" data-cl-op="guardar">Guardar</button>
      ${c.id === state.cliente ? '' : '<button type="button" class="btn primary" data-cl-op="entrar">Entrar →</button>'}
      ${c.principal ? '' : '<button type="button" class="btn ghost" data-cl-op="borrar" title="Quitar del dashboard (no borra nada de su GHL)">Quitar</button>'}
      <span class="muted cl-res" aria-live="polite"></span>
    </div></article>`).join('')}</div>`;
}
$('.tab[data-tab="clientes"]').addEventListener('click', () => {
  $('#cl-guia').innerHTML = guiaPasosHtml(guiaCliente());
  loadClientes();
});
$('#cl-nombre').addEventListener('input', () => { if (!$('#cl-id').dataset.tocado) $('#cl-id').value = slugCliente($('#cl-nombre').value); });
$('#cl-id').addEventListener('input', () => { $('#cl-id').dataset.tocado = '1'; });
$('#btn-cl-crear').addEventListener('click', async () => {
  const cliente = { nombre: $('#cl-nombre').value.trim(), id: slugCliente($('#cl-id').value), locationId: $('#cl-location').value.trim(), metaAdAccount: $('#cl-meta').value.trim(), color: $('#cl-color').value };
  if (!cliente.nombre || !cliente.id || !cliente.locationId) { $('#cl-status').textContent = 'Pon el nombre, el código y el ID de la subcuenta de GHL.'; return; }
  const b = $('#btn-cl-crear');
  b.disabled = true;
  try {
    const d = await api('/api/clientes', { method: 'POST', body: { op: 'guardar', cliente } });
    state.clienteNuevo = cliente.id;
    pintarClientes(d.clientes);
    $(`[data-cl="${CSS.escape(cliente.id)}"]`)?.scrollIntoView({ block: 'center' });
    state.clientes = d.clientes.map(({ id, nombre, color, principal: p }) => ({ id, nombre, color, principal: p }));
    pintarCliente(state.clientes.find((c) => c.id === state.cliente) || state.clientes[0]);
    for (const id of ['#cl-nombre', '#cl-id', '#cl-location', '#cl-meta']) $(id).value = '';
    delete $('#cl-id').dataset.tocado;
    $('#cl-status').textContent = `Cliente «${cliente.nombre}» añadido. Sigue los pasos de su tarjeta para conectar su GHL.`;
  } catch (e) { $('#cl-status').textContent = e.message; } finally { b.disabled = false; }
});
$('#clientes-list').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-cl-op]');
  if (!b) return;
  const card = b.closest('[data-cl]');
  const id = card.dataset.cl;
  const c = state.clientesAdmin.find((x) => x.id === id);
  const res = $('.cl-res', card);
  const op = b.dataset.clOp;
  if (op === 'entrar') { cambiarCliente(id); return; }
  if (op === 'borrar' && !window.confirm(`¿Quitar a «${c.nombre}» del dashboard? Su equipo perderá el acceso. No se borra nada de su GHL y puedes volver a añadirlo.`)) return;
  b.disabled = true;
  try {
    if (op === 'probar') {
      const r = await api('/api/clientes', { method: 'POST', body: { op, id } });
      res.textContent = r.ok ? `✓ Conectado (${r.etiquetas} etiquetas en su GHL)` : `✗ ${r.error}`;
    } else {
      const body = op === 'borrar' ? { op, id } : { op: 'guardar', cliente: { ...c, nombre: $('.cl-nombre', card).value.trim(), color: $('.cl-color', card).value, ...(c.principal ? {} : { locationId: $('.cl-location', card).value.trim(), metaAdAccount: $('.cl-meta', card).value.trim() }) } };
      const d = await api('/api/clientes', { method: 'POST', body });
      pintarClientes(d.clientes);
      state.clientes = d.clientes.map(({ id: i, nombre, color, principal: p }) => ({ id: i, nombre, color, principal: p }));
      pintarCliente(state.clientes.find((x) => x.id === state.cliente) || state.clientes[0]);
      if (op !== 'borrar') $('.cl-res', $(`[data-cl="${CSS.escape(id)}"]`)).textContent = 'Guardado ✓';
    }
  } catch (ex) { res.textContent = ex.message; } finally { b.disabled = false; }
});
$('#btn-equipo').addEventListener('click', () => {
  $('.tab[data-tab="equipo"]').click();
  $('#equipo-dialog').showModal();
});

// ---------- Mi cuenta ----------
// En la barra, el botón «Mi cuenta» lleva la foto de perfil en vez del icono.
function pintarFotoCuenta() {
  const ico = $('#btn-cuenta .tb-ico');
  if (!ico) return;
  const url = fotoUrl(state.user);
  ico.classList.toggle('tb-foto', Boolean(url));
  ico.innerHTML = url ? `<img src="${esc(url)}" alt="">` : icon('user');
  $('#cuenta-foto').innerHTML = url ? `<img src="${esc(url)}" alt="Tu foto de perfil">` : esc(iniciales(state.user?.nombre));
  $('#c-foto-quitar').hidden = !url;
}

// Recorta la imagen en cuadrado por el centro y la reduce a 160×160 (JPEG) para que pese poco.
function fotoReducida(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const lado = Math.min(img.naturalWidth, img.naturalHeight);
      const c = document.createElement('canvas');
      c.width = c.height = 160;
      c.getContext('2d').drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, 160, 160);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se ha podido leer la imagen. Prueba con una foto JPG o PNG.')); };
    img.src = url;
  });
}

async function guardarFoto(foto) {
  const status = $('#cuenta-foto-status');
  status.textContent = foto ? 'Subiendo foto…' : 'Quitando foto…';
  try {
    const d = await api('/api/usuarios', { method: 'POST', body: { op: 'mi-foto', foto } });
    state.user = d.user;
    const yo = state.tareas?.users?.find((u) => u.id === d.user.id);
    if (yo) { yo.foto = d.user.foto; renderTareas(); }
    pintarFotoCuenta();
    status.textContent = foto ? 'Foto guardada ✓' : 'Foto quitada ✓';
  } catch (e) {
    status.textContent = e.message;
  }
}
$('#c-foto').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { $('#cuenta-foto-status').textContent = 'Elige una imagen (JPG, PNG…).'; return; }
  try { await guardarFoto(await fotoReducida(file)); } catch (err) { $('#cuenta-foto-status').textContent = err.message; }
});
$('#c-foto-quitar').addEventListener('click', () => guardarFoto(''));

// Mi cuenta → verificación en dos pasos. c2.modo: '' | 'alta' | 'quitar'
const c2 = { modo: '' };
function pintarDosPasos() {
  const u = state.user;
  const activa = Boolean(u?.dosPasos);
  $('#c2-estado').innerHTML = activa
    ? `<span class="ok-txt">Activada</span>${u.dosPasosDesde ? ` desde el ${esc(new Date(u.dosPasosDesde).toLocaleDateString('es-ES'))}` : ''}. Al entrar te pedimos tu contraseña y un código de la app del móvil.`
    : 'Además de la contraseña, al entrar te pedimos un código que cambia cada 30 segundos en una app del móvil. Así nadie puede entrar aunque sepa tu contraseña.';
  $('#c2-alta').hidden = c2.modo !== 'alta';
  $('#c2-codigo-box').hidden = !c2.modo;
  $('#c2-codigo-label').textContent = c2.modo === 'quitar' ? 'Código de la app (y escribe tu contraseña actual abajo)' : 'Código de la app';
  $('#c2-cancelar').hidden = !c2.modo;
  $('#c2-btn').textContent = c2.modo === 'alta' ? 'Activar' : c2.modo === 'quitar' ? 'Desactivar' : activa ? 'Desactivar o cambiar de móvil' : 'Activar';
  $('#c2-btn').classList.toggle('primary', c2.modo === 'alta' || (!activa && !c2.modo));
}
$('#c2-cancelar').addEventListener('click', () => { c2.modo = ''; $('#c2-status').textContent = ''; pintarDosPasos(); });
$('#c2-btn').addEventListener('click', async () => {
  const st = $('#c2-status');
  st.textContent = '';
  const activa = Boolean(state.user?.dosPasos);
  try {
    if (!c2.modo && !activa) {
      const a = await api('/api/usuarios', { method: 'POST', body: { op: 'mi-2fa-iniciar' } });
      c2.modo = 'alta';
      $('#c2-recup').hidden = true;
      $('#c2-secreto').textContent = secretoLegible(a.secreto);
      pintarQr($('#c2-qr'), a.uri);
      $('#c2-codigo').value = '';
      pintarDosPasos();
      $('#c2-codigo').focus();
      return;
    }
    if (!c2.modo && activa) {
      c2.modo = 'quitar';
      $('#c2-codigo').value = '';
      pintarDosPasos();
      st.textContent = 'Para desactivarla (p. ej. para pasarla a otro móvil), escribe el código y tu contraseña actual. Luego puedes volver a activarla.';
      return;
    }
    if (c2.modo === 'alta') {
      const d = await api('/api/usuarios', { method: 'POST', body: { op: 'mi-2fa-activar', codigo: $('#c2-codigo').value.trim() } });
      state.user = { ...state.user, dosPasos: true, dosPasosDesde: new Date().toISOString() };
      c2.modo = '';
      $('#c2-recup').innerHTML = codigosRecuperacionHtml(d.codigosRecuperacion);
      $('#c2-recup').hidden = false;
      pintarDosPasos();
      pintarAviso2fa();
      st.textContent = 'Activada ✓ La próxima vez que entres te pediremos el código.';
      return;
    }
    await api('/api/usuarios', { method: 'POST', body: { op: 'mi-2fa-quitar', codigo: $('#c2-codigo').value.trim(), actual: $('#c-actual').value } });
    state.user = { ...state.user, dosPasos: false, dosPasosDesde: null };
    c2.modo = '';
    pintarDosPasos();
    pintarAviso2fa();
    st.textContent = 'Desactivada.';
  } catch (e) { st.textContent = e.message; }
});

// Aviso arriba para los admins sin verificación en dos pasos (se puede posponer en esta sesión).
function pintarAviso2fa() {
  const esAdmin = state.role === 'admin' || state.superadmin;
  let pospuesto = false;
  try { pospuesto = sessionStorage.getItem('lsd_aviso2fa') === '1'; } catch { /* sin almacenamiento */ }
  $('#aviso-2fa').hidden = !(state.user && esAdmin && !state.user.dosPasos && !pospuesto);
}
$('#aviso-2fa-cerrar').addEventListener('click', () => {
  try { sessionStorage.setItem('lsd_aviso2fa', '1'); } catch { /* sin almacenamiento */ }
  $('#aviso-2fa').hidden = true;
});
$('#aviso-2fa-ir').addEventListener('click', () => $('#btn-cuenta').click());

$('#btn-cuenta').addEventListener('click', () => {
  const u = state.user;
  c2.modo = '';
  $('#c2-status').textContent = '';
  $('#c2-recup').hidden = true;
  pintarDosPasos();
  $('#cuenta-info').textContent = `${u.nombre} · ${u.email} · Rol ${ROLE_LABEL[state.role]}`;
  $('#cuenta-foto-status').textContent = '';
  pintarFotoCuenta();
  $('#c-actual').value = '';
  $('#c-nueva').value = '';
  $('#cuenta-status').textContent = '';
  $('#cuenta-dialog').showModal();
});
$('#cuenta-save').addEventListener('click', async () => {
  const status = $('#cuenta-status');
  const nueva = $('#c-nueva').value.trim();
  if (nueva.length < 8) { status.textContent = 'La contraseña nueva debe tener al menos 8 caracteres.'; return; }
  try {
    await api('/api/usuarios', { method: 'POST', body: { op: 'mi-clave', actual: $('#c-actual').value, nueva } });
    status.textContent = 'Contraseña cambiada ✓';
    $('#c-actual').value = '';
    $('#c-nueva').value = '';
  } catch (e) {
    status.textContent = e.message;
  }
});

// ---------- Calendario ----------
const CAL_FASE_COLOR = { captacion: 'info', clases: 'live', directo: 'accent', carrito: 'buy', calentamiento: 'vip', oferta: 'buy' };
const DOW = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const cal = {
  modo: ls.get('lsd_cal_modo') === 'semana' ? 'semana' : 'mes',
  ref: null, // día de referencia (YYYY-MM-DD)
  refCode: null,
  sel: null,
  // Tareas con fecha y eventos de TODOS los embudos del cliente (el calendario es el mismo en todos).
  datos: { cliente: null, tareas: [], eventos: [] },
  show: (() => { try { return { tareas: true, eventos: true, solo: false, ...JSON.parse(ls.get('lsd_cal_show') || '{}') }; } catch { return { tareas: true, eventos: true, solo: false }; } })(),
};
const dow = (d) => (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = lunes
const monthStart = (d) => `${d.slice(0, 7)}-01`;
const addMonths = (d, n) => {
  const x = new Date(`${monthStart(d)}T12:00:00Z`);
  x.setUTCMonth(x.getUTCMonth() + n);
  return x.toISOString().slice(0, 10);
};
const fmtDay = (d, opts) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { timeZone: 'UTC', ...opts });

async function loadEventos() {
  const cliente = state.cliente;
  try {
    const d = await api('/api/calendario');
    if (cliente !== state.cliente) return;
    cal.datos = { cliente, tareas: d.tareas, eventos: d.eventos };
  } catch (e) {
    cal.datos = { cliente, tareas: [], eventos: [], error: e.message };
  }
  if (!$('#view-calendario').hidden) renderCalendario();
}

// Embudo «propio» del calendario (el que está abierto): sus hitos y fases se resaltan.
const calCodigo = () => codigo() || '';
// Hitos de cualquier embudo del cliente: lanzamientos y meteóricos (las VSL no tienen fechas).
function hitosDe(code) {
  const l = state.config.launches[code];
  if (l) return hitosLanzamiento(l);
  const m = state.config.meteoricos?.[code];
  return m ? hitosMeteorico(m) : [];
}
const fasesDe_ = (code) => (state.config.launches[code] ? fasesLanzamiento(state.config.launches[code]) : state.config.meteoricos?.[code] ? fasesMeteoricoCal(state.config.meteoricos[code]) : []);
const nombreCal = (code) => state.config.launches[code]?.name || (state.config.meteoricos?.[code] ? `⚡ ${state.config.meteoricos[code].name}` : '') || state.config.vsls?.[code]?.name || code;

// Día inicial: hoy si el embudo abierto está en marcha (o no tiene fechas); si no, el mes de su primer hito.
function calInitialRef() {
  const hoy = today();
  const days = hitosDe(calCodigo()).map((h) => h.day).sort();
  if (!days.length || (hoy >= addDays(days[0], -21) && hoy <= addDays(days[days.length - 1], 14))) return hoy;
  return state.config.launches[calCodigo()]?.fechaDirecto || days[0];
}

// Todo lo que cae en cada día: { 'YYYY-MM-DD': [item…] }
function calItems() {
  const map = {};
  const push = (d, it) => { (map[d] ||= []).push(it); };
  const code = calCodigo();
  const solo = cal.show.solo;
  const codes = solo ? [code] : [...Object.keys(state.config.launches), ...Object.keys(state.config.meteoricos || {})];
  for (const c of codes) {
    for (const h of hitosDe(c)) push(h.day, { kind: 'hito', code: c, own: c === code, icon: h.icon, titulo: h.titulo, time: h.time, launch: nombreCal(c), hid: h.id });
  }
  if (cal.show.eventos) {
    for (const e of cal.datos.eventos) {
      if (solo && e.code !== code) continue;
      const tipo = EVENTO_TIPOS.find((t) => t.id === e.tipo);
      for (let d = e.fecha; d && d <= (e.fin || e.fecha); d = addDays(d, 1)) push(d, { kind: 'evento', ev: e, code: e.code, own: e.code === code, launch: nombreCal(e.code), icon: tipo?.icon || '📌', titulo: e.titulo, time: d === e.fecha ? e.hora : '', cont: d !== e.fecha });
    }
  }
  if (cal.show.tareas) {
    // Las del embudo abierto, de su lista (al día); las de los demás, de la carga del calendario.
    const propias = state.tareas?.code === code ? state.tareas.list : cal.datos.tareas.filter((t) => t.code === code);
    for (const t of propias) if (t.fecha) push(t.fecha, { kind: 'tarea', t, code, own: true, titulo: t.titulo, time: '' });
    if (!solo) for (const t of cal.datos.tareas) if (t.code !== code) push(t.fecha, { kind: 'tarea', t, code: t.code, own: false, launch: nombreCal(t.code), titulo: t.titulo, time: '' });
  }
  const rank = { hito: 0, evento: 1, tarea: 2 };
  for (const list of Object.values(map)) list.sort((a, b) => (rank[a.kind] - rank[b.kind]) || (b.own === true) - (a.own === true) || (a.time || '').localeCompare(b.time || ''));
  return map;
}

function calChip(it, hoy) {
  if (it.kind === 'tarea') {
    const t = it.t;
    const cls = t.hecha ? 'done' : vencida(t, hoy) ? 'late' : esMia(t, meSess()) ? 'mine' : '';
    return `<span class="cal-chip k-tarea ${cls} ${it.own ? '' : 'other'}" title="${esc(t.titulo)} · ${esc(asignadoTexto(t.asignado))}${it.own ? '' : ` · ${esc(it.launch)}`}"><span class="cc-ico">${t.hecha ? '✓' : '☐'}</span><span class="cc-txt">${esc(t.titulo)}</span></span>`;
  }
  const other = !it.own;
  const tipo = it.kind === 'evento' ? ` t-${it.ev.tipo}` : it.kind === 'hito' && /^directo\d?$/.test(it.hid) ? ' h-webinar' : '';
  return `<span class="cal-chip k-${it.kind}${tipo} ${other ? 'other' : ''} ${it.cont ? 'cont' : ''}" title="${esc(it.titulo)}${other ? ` · ${esc(it.launch)}` : ''}"><span class="cc-ico">${it.icon}</span>${it.time ? `<span class="cc-time">${esc(it.time)}</span>` : ''}<span class="cc-txt">${esc(it.titulo)}${other ? ` · ${esc(it.launch)}` : ''}</span></span>`;
}

function renderCalendario() {
  if (!state.config) return;
  if (cal.datos.cliente !== state.cliente) { cal.datos.cliente = state.cliente; loadEventos(); }
  const code = calCodigo();
  if (cal.refCode !== code || !cal.ref) { cal.ref = calInitialRef(); cal.refCode = code; cal.sel = null; }
  const hoy = today();
  const fases = fasesDe_(code);
  const items = calItems();
  $$('#cal-modo .seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.m === cal.modo));
  $('#cal-show-tareas').checked = cal.show.tareas;
  $('#cal-show-eventos').checked = cal.show.eventos;
  $('#cal-show-solo').checked = cal.show.solo;

  let days;
  if (cal.modo === 'mes') {
    const first = monthStart(cal.ref);
    const start = addDays(first, -dow(first));
    const last = addDays(addMonths(first, 1), -1);
    const end = addDays(last, 6 - dow(last));
    days = [];
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
    const t = fmtDay(first, { month: 'long', year: 'numeric' });
    $('#cal-title').textContent = t.charAt(0).toUpperCase() + t.slice(1);
  } else {
    const start = addDays(cal.ref, -dow(cal.ref));
    days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const a = fmtDay(days[0], { day: 'numeric', month: 'short' });
    const b = fmtDay(days[6], { day: 'numeric', month: 'short', year: 'numeric' });
    $('#cal-title').textContent = `${a} – ${b}`;
  }

  const unknownDates = Boolean(code) && !enVsl() && !hitosDe(code).length;
  $('#cal-legend').innerHTML = `${fases.map((f) => `<span class="cal-leg tone-${CAL_FASE_COLOR[f.id]}"><i></i>${esc(f.label)}</span>`).join('')}
    <span class="cal-leg-sep"></span>
    <span class="cal-leg k"><span class="cal-chip k-hito">🔴 Hito</span></span>
    ${cal.show.eventos ? '<span class="cal-leg k"><span class="cal-chip k-evento">📌 Evento</span></span>' : ''}
    ${cal.show.tareas ? '<span class="cal-leg k"><span class="cal-chip k-tarea"><span class="cc-ico">☐</span>Tarea</span></span><span class="cal-leg k"><span class="cal-chip k-tarea late"><span class="cc-ico">☐</span>Vencida</span></span>' : ''}
    ${!cal.show.solo ? '<span class="cal-leg k"><span class="cal-chip other">De otro embudo</span></span>' : ''}
    ${unknownDates ? `<span class="muted">${enMeteo() ? 'Este meteórico' : 'Este lanzamiento'} aún no tiene fechas${puedeConfig() ? ': ponlas en Configuración.' : '.'}</span>` : ''}
    ${cal.datos.error ? `<span class="error">No se pudieron cargar las tareas y eventos del calendario: ${esc(cal.datos.error)}</span>` : ''}`;

  const month = cal.ref.slice(0, 7);
  const max = cal.modo === 'mes' ? 3 : 99;
  const cell = (d) => {
    const list = items[d] || [];
    const bands = fases.filter((f) => d >= f.from && d <= f.to);
    const more = list.length - max;
    // La fase colorea el día entero (una sola: la más importante si se solapan) y los hitos
    // del lanzamiento lo enmarcan; el del webinar, en rojo.
    const fase = ['directo', 'oferta', 'carrito', 'clases', 'calentamiento', 'captacion'].map((id) => bands.find((f) => f.id === id)).find(Boolean);
    const hito = list.find((it) => it.kind === 'hito' && it.own);
    const marca = `${fase ? `con-fase tone-${CAL_FASE_COLOR[fase.id]}` : ''} ${hito ? `dia-hito${/^directo\d?$/.test(hito.hid) ? ' dia-webinar' : ''}` : ''}`;
    return `<button type="button" class="cal-day ${marca} ${d.slice(0, 7) !== month && cal.modo === 'mes' ? 'out' : ''} ${d === hoy ? 'today' : ''} ${d === cal.sel ? 'sel' : ''} ${d < hoy ? 'past' : ''}" data-day="${d}" aria-label="${esc(fmtDay(d, { weekday: 'long', day: 'numeric', month: 'long' }))}${list.length ? `, ${list.length} elementos` : ''}">
      <span class="cal-bands">${fase ? `<i title="${esc(fase.label)}"></i>` : ''}</span>
      <span class="cal-num">${cal.modo === 'semana' ? `<span class="cal-dow">${DOW[dow(d)]}</span> ` : ''}${Number(d.slice(8))}${cal.modo === 'semana' ? ` <span class="cal-dow">${fmtDay(d, { month: 'short' })}</span>` : ''}</span>
      <span class="cal-chips">${list.slice(0, max).map((it) => calChip(it, hoy)).join('')}${more > 0 ? `<span class="cal-more">+${more} más</span>` : ''}</span>
      ${list.length ? `<span class="cal-dots">${list.slice(0, 5).map((it) => `<i class="d-${it.kind}${it.kind === 'tarea' && vencida(it.t, hoy) ? ' late' : ''}"></i>`).join('')}</span>` : ''}
    </button>`;
  };
  $('#cal-grid').innerHTML = `<div class="cal ${cal.modo === 'mes' ? 'cal-mes' : 'cal-semana'}">
    ${cal.modo === 'mes' ? `<div class="cal-head">${DOW.map((x) => `<span>${x}</span>`).join('')}</div>` : ''}
    <div class="cal-body">${days.map(cell).join('')}</div></div>`;
  renderCalDia(items);
}

// Panel del día seleccionado, con acciones.
function renderCalDia(items = calItems()) {
  const box = $('#cal-dia');
  const d = cal.sel;
  box.hidden = !d;
  if (!d) return;
  const hoy = today();
  const list = items[d] || [];
  const admin = puedeTareas();
  const row = (it) => {
    if (it.kind === 'tarea') {
      const t = it.t;
      const puede = it.own && puedeMarcar(t, meSess());
      return `<li class="cd-row k-tarea ${t.hecha ? 'done' : ''} ${vencida(t, hoy) ? 'late' : ''} ${it.own ? '' : 'other'}">
        <label class="t-check"><input type="checkbox" data-cal-tid="${esc(t.id)}" ${t.hecha ? 'checked' : ''} ${puede ? '' : 'disabled'}><span class="t-box" aria-hidden="true"></span></label>
        <div class="cd-main"><strong>${esc(t.titulo)}</strong><span class="muted">Tarea${it.own ? '' : ` de ${esc(it.launch)}`} · ${esc(asignadoTexto(t.asignado))}${t.hecha ? ` · completada por ${esc(t.hechaPor || '')}` : vencida(t, hoy) ? ' · vencida' : ''}</span>${notasExtracto(t, 'cd-notas')}</div>
        ${it.own ? `<button type="button" class="btn ghost" data-tver="${esc(t.id)}">Abrir</button>
        ${admin ? `<button type="button" class="btn ghost" data-cal-tedit="${esc(t.id)}">Editar</button>` : ''}` : `<button type="button" class="btn ghost" data-cal-ir="${esc(it.code)}">Ir al embudo</button>`}</li>`;
    }
    if (it.kind === 'evento') {
      const e = it.ev;
      const tipo = EVENTO_TIPOS.find((x) => x.id === e.tipo);
      return `<li class="cd-row k-evento"><span class="cd-ico">${it.icon}</span>
        <div class="cd-main"><strong>${esc(e.titulo)}</strong><span class="muted">${esc(tipo?.label || 'Evento')}${it.own ? '' : ` · ${esc(it.launch)}`}${e.hora ? ` · ${esc(e.hora)} h` : ''}${e.fin ? ` · del ${esc(fmtDay(e.fecha, { day: 'numeric', month: 'short' }))} al ${esc(fmtDay(e.fin, { day: 'numeric', month: 'short' }))}` : ''}</span>${e.notas ? `<span class="cd-notas">${esc(e.notas)}</span>` : ''}</div>
        ${admin && it.own ? `<button type="button" class="btn ghost" data-cal-eedit="${esc(e.id)}">Editar</button>` : ''}</li>`;
    }
    return `<li class="cd-row k-hito ${it.own ? '' : 'other'}"><span class="cd-ico">${it.icon}</span>
      <div class="cd-main"><strong>${esc(it.titulo)}</strong><span class="muted">${it.time ? `${esc(it.time)} h · ` : ''}${esc(it.launch)}</span></div>
      ${puedeConfig() ? `<button type="button" class="btn ghost" data-cal-hito="${esc(it.code)}" title="Las fechas se cambian en la configuración del embudo">Cambiar fecha</button>` : ''}</li>`;
  };
  const t = fmtDay(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  box.innerHTML = `<header class="cd-head"><h3>${esc(t.charAt(0).toUpperCase() + t.slice(1))}</h3>
      ${admin ? `<button type="button" class="btn" data-cal-new-evento="${d}">+ Evento</button><button type="button" class="btn" data-cal-new-tarea="${d}">+ Tarea</button>` : ''}
      <button type="button" class="btn ghost" data-cal-close aria-label="Cerrar">✕</button></header>
    ${list.length ? `<ul class="cd-list">${list.map(row).join('')}</ul>` : '<p class="muted">Nada este día.</p>'}`;
}

$('#cal-prev').addEventListener('click', () => { cal.ref = cal.modo === 'mes' ? addMonths(cal.ref, -1) : addDays(cal.ref, -7); renderCalendario(); });
$('#cal-next').addEventListener('click', () => { cal.ref = cal.modo === 'mes' ? addMonths(cal.ref, 1) : addDays(cal.ref, 7); renderCalendario(); });
$('#cal-hoy').addEventListener('click', () => { cal.ref = today(); cal.sel = today(); renderCalendario(); });
$('#cal-modo').addEventListener('click', (e) => {
  const b = e.target.closest('[data-m]');
  if (!b) return;
  cal.modo = b.dataset.m;
  if (cal.sel) cal.ref = cal.sel;
  ls.set('lsd_cal_modo', cal.modo);
  renderCalendario();
});
for (const k of ['tareas', 'eventos', 'solo']) {
  $(`#cal-show-${k}`).addEventListener('change', (e) => {
    cal.show[k] = e.target.checked;
    ls.set('lsd_cal_show', JSON.stringify(cal.show));
    renderCalendario();
  });
}
$('#cal-grid').addEventListener('click', (e) => {
  const c = e.target.closest('[data-day]');
  if (!c) return;
  cal.sel = cal.sel === c.dataset.day ? null : c.dataset.day;
  renderCalendario();
  if (cal.sel && window.innerWidth < 700) $('#cal-dia').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
$('#cal-dia').addEventListener('click', (e) => {
  if (e.target.closest('[data-cal-close]')) { cal.sel = null; renderCalendario(); return; }
  const te = e.target.closest('[data-cal-tedit]');
  if (te) return openTarea(state.tareas.list.find((t) => t.id === te.dataset.calTedit));
  const ee = e.target.closest('[data-cal-eedit]');
  if (ee) return openEvento(cal.datos.eventos.find((x) => x.id === ee.dataset.calEedit && x.code === calCodigo()));
  const h = e.target.closest('[data-cal-hito]');
  if (h) return cambiarFechaHito(h.dataset.calHito);
  const ir = e.target.closest('[data-cal-ir]');
  if (ir) return irAEmbudoDe(ir.dataset.calIr);
  const ne = e.target.closest('[data-cal-new-evento]');
  if (ne) return openEvento(null, ne.dataset.calNewEvento);
  const nt = e.target.closest('[data-cal-new-tarea]');
  if (nt) { openTarea(null); $('#t-fecha').value = nt.dataset.calNewTarea; }
});
$('#cal-dia').addEventListener('change', async (e) => {
  const cb = e.target.closest('input[data-cal-tid]');
  if (!cb) return;
  cb.disabled = true;
  try { await tareasOp({ op: 'marcar', id: cb.dataset.calTid, hecha: cb.checked }); } catch (ex) { cb.checked = !cb.checked; cb.disabled = false; notice(ex.message, true); }
});

// Diálogo de evento
const edlg = $('#evento-dialog');
let editingEvento = null;
$('#e-tipo').innerHTML = EVENTO_TIPOS.map((t) => `<option value="${t.id}">${t.icon} ${esc(t.label)}</option>`).join('');
function openEvento(ev, dia = '') {
  editingEvento = ev || null;
  $('#evento-title').textContent = ev ? 'Editar evento' : 'Nuevo evento';
  $('#e-titulo').value = ev?.titulo || '';
  $('#e-tipo').value = ev?.tipo || 'email';
  $('#e-fecha').value = ev?.fecha || dia || cal.sel || today();
  $('#e-hora').value = ev?.hora || '';
  $('#e-fin').value = ev?.fin || '';
  $('#e-notas').value = ev?.notas || '';
  $('#evento-del').hidden = !ev;
  $('#evento-status').textContent = '';
  edlg.showModal();
  $('#e-titulo').focus();
}
async function eventosOp(body) {
  const code = calCodigo();
  if (!code) throw new Error('Elige primero un embudo (lanzamiento, VSL o meteórico) para el evento.');
  const d = await api('/api/eventos', { method: 'POST', body: { l: code, ...body } });
  cal.datos.eventos = [...cal.datos.eventos.filter((x) => x.code !== code), ...d.eventos.map((x) => ({ ...x, code }))];
  renderCalendario();
}
$('#btn-evento-nuevo').addEventListener('click', () => openEvento(null));
$('#evento-save').addEventListener('click', async () => {
  const evento = { titulo: $('#e-titulo').value, tipo: $('#e-tipo').value, fecha: $('#e-fecha').value, hora: $('#e-hora').value, fin: $('#e-fin').value, notas: $('#e-notas').value };
  if (!evento.titulo.trim()) { $('#e-titulo').focus(); return; }
  try {
    await eventosOp(editingEvento ? { op: 'editar', id: editingEvento.id, evento } : { op: 'crear', evento });
    edlg.close();
  } catch (ex) { $('#evento-status').textContent = ex.message; }
});
$('#evento-del').addEventListener('click', async () => {
  if (!editingEvento || !window.confirm(`¿Eliminar el evento «${editingEvento.titulo}»?`)) return;
  try { await eventosOp({ op: 'borrar', id: editingEvento.id }); edlg.close(); } catch (ex) { $('#evento-status').textContent = ex.message; }
});

// Suscripción
$('#btn-cal-sync').addEventListener('click', async () => {
  try {
    const d = await api('/api/cal');
    $('#sync-url').value = d.url;
    $('#sync-webcal').href = d.webcal;
    $('#sync-dialog').showModal();
    $('#sync-url').select();
  } catch (e) { notice(e.message, true); }
});
$('#sync-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#sync-url').value); $('#sync-copy').textContent = 'Copiado ✓'; } catch { $('#sync-url').select(); }
  setTimeout(() => { $('#sync-copy').textContent = 'Copiar'; }, 1500);
});

// ---------- Descripción con formato (editor) y vista de la tarea ----------
// Monta los reproductores de vídeo dentro de un contenedor con HTML ya limpio.
function hydrateVideos(root, editable = false) {
  $$('[data-video]', root).forEach((el) => {
    const src = videoEmbed(el.dataset.video);
    if (!src) { el.remove(); return; }
    el.className = 'rt-video';
    if (editable) el.contentEditable = 'false';
    el.innerHTML = `<div class="rt-frame"><iframe src="${esc(src)}" title="Vídeo" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>
      ${editable ? `<div class="rt-video-bar"><span>🎬 ${esc(el.dataset.video)}</span><button type="button" class="btn ghost" data-rt-delvideo>Quitar vídeo</button></div>` : ''}`;
  });
}

const editor = $('#t-notas');
function setEditor(notas) {
  editor.innerHTML = richToHtml(notas);
  hydrateVideos(editor, true);
}
function getEditor() {
  const clone = editor.cloneNode(true);
  $$('[data-video]', clone).forEach((el) => { el.innerHTML = ''; });
  return sanitizeRich(clone.innerHTML);
}

let rtRange = null;
const saveRange = () => {
  const s = window.getSelection();
  if (s.rangeCount && editor.contains(s.anchorNode)) rtRange = s.getRangeAt(0).cloneRange();
};
const restoreRange = () => {
  editor.focus();
  if (!rtRange) return;
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(rtRange);
};
editor.addEventListener('keyup', saveRange);
editor.addEventListener('mouseup', saveRange);
editor.addEventListener('input', saveRange);

function insertVideo(url) {
  if (!videoEmbed(url)) { window.alert('Pega un enlace de un vídeo de Vimeo, YouTube o Loom (por ejemplo https://vimeo.com/123456789).'); return; }
  restoreRange();
  document.execCommand('insertHTML', false, `<div data-video="${esc(url)}"></div><p><br></p>`);
  hydrateVideos(editor, true);
  saveRange();
}

const rtToolbar = $('.rt-toolbar');
rtToolbar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); }); // no perder la selección
rtToolbar.addEventListener('click', (e) => {
  const b = e.target.closest('[data-rt]');
  if (!b) return;
  const cmd = b.dataset.rt;
  if (cmd === 'link') {
    const sel = rtRange && !rtRange.collapsed ? rtRange.toString() : '';
    const url = safeHref((window.prompt('Pega el enlace (https://…)', 'https://') || '').trim());
    if (!url) return;
    if (videoEmbed(url) && !sel && window.confirm('Es un vídeo. ¿Quieres que se vea reproducible dentro de la tarea?')) { insertVideo(url); return; }
    restoreRange();
    if (sel) document.execCommand('createLink', false, url);
    else document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(url)}</a>&nbsp;`);
    saveRange();
    return;
  }
  if (cmd === 'video') {
    const url = (window.prompt('Pega el enlace del vídeo (Vimeo, YouTube o Loom)') || '').trim();
    if (url) insertVideo(url);
    return;
  }
  restoreRange();
  document.execCommand(cmd, false, null);
  saveRange();
});
$('[data-rt-block]').addEventListener('change', (e) => {
  restoreRange();
  document.execCommand('formatBlock', false, `<${e.target.value}>`);
  e.target.value = 'p';
  saveRange();
});
editor.addEventListener('click', (e) => {
  const del = e.target.closest('[data-rt-delvideo]');
  if (del) { del.closest('.rt-video').remove(); return; }
  if (e.target.closest('a')) e.preventDefault(); // en el editor el enlace no se abre
});
// Al pegar: solo formato permitido. Un enlace de vídeo suelto se convierte en reproductor.
editor.addEventListener('paste', (e) => {
  const cd = e.clipboardData;
  if (!cd) return;
  e.preventDefault();
  const text = (cd.getData('text/plain') || '').trim();
  if (/^https?:\/\/\S+$/.test(text) && videoEmbed(text)) { saveRange(); insertVideo(text); return; }
  const html = cd.getData('text/html');
  const clean = html ? sanitizeRich(html) : esc(cd.getData('text/plain')).replace(/\n/g, '<br>');
  document.execCommand('insertHTML', false, clean);
  hydrateVideos(editor, true);
});

// Vista de una tarea (descripción completa con vídeos reproducibles).
const tvDlg = $('#tarea-ver');
let tvId = null;
function openTareaVer(id) {
  const t = state.tareas?.list.find((x) => x.id === id);
  if (!t) return;
  tvId = id;
  const hoy = today();
  const fase = fasesT().find((f) => f.id === t.fase);
  $('#tv-titulo').textContent = t.titulo;
  $('#tv-meta').innerHTML = `
    <span class="tv-chip">${fase ? `${fase.icon} ${esc(fase.label)}` : ''}</span>
    ${t.fecha ? `<span class="tv-chip ${vencida(t, hoy) ? 'late' : ''}">${icon('calendar')} ${esc(fechaCorta(t.fecha))}${vencida(t, hoy) ? ' · vencida' : ''}</span>` : ''}
    <span class="tv-chip">${icon('users')} ${esc(asignadoTexto(t.asignado))}</span>
    ${t.habitual ? '<span class="tv-chip">🔁 Habitual</span>' : ''}
    ${t.hecha ? `<span class="tv-chip ok">✓ Completada por ${esc(t.hechaPor || '')}</span>` : ''}`;
  renderComentarios($('#tv-coments'), t);
  const box = $('#tv-notas');
  box.innerHTML = richToHtml(t.notas) || '<p class="muted">Sin descripción.</p>';
  hydrateVideos(box);
  const puede = puedeMarcar(t, meSess());
  const cols = columnasTablero().filter((c) => c.tipo !== 'hechas');
  $('#tv-estado').innerHTML = `<button type="button" class="btn ${t.hecha ? '' : 'primary'}" data-tvdone ${puede ? '' : 'disabled'}>${t.hecha ? '↩︎ Volver a pendiente' : '✓ Marcar como completada'}</button>
    ${puedeTareas() && !t.hecha ? `<label class="field inline"><span>Columna</span><select data-tvcol>${cols.map((c) => `<option value="${esc(c.id)}" ${columnaDe(t, extraCols(), fasesT()) === c.id ? 'selected' : ''}>${c.icon} ${esc(c.label)}</option>`).join('')}</select></label>` : ''}`;
  if (!tvDlg.open) tvDlg.showModal();
}
$('#tv-estado').addEventListener('click', async (e) => {
  if (!e.target.closest('[data-tvdone]')) return;
  const t = state.tareas.list.find((x) => x.id === tvId);
  try { await tareasOp({ op: 'marcar', id: tvId, hecha: !t.hecha }); openTareaVer(tvId); } catch (ex) { notice(ex.message, true); }
});
$('#tv-estado').addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-tvcol]');
  if (!sel) return;
  try { await tareasOp({ op: 'mover', id: tvId, columna: sel.value }); openTareaVer(tvId); } catch (ex) { notice(ex.message, true); }
});
$('#tv-editar').addEventListener('click', () => {
  const t = state.tareas.list.find((x) => x.id === tvId);
  tvDlg.close();
  if (t) openTarea(t);
});
tvDlg.addEventListener('close', () => { $('#tv-notas').innerHTML = ''; }); // para el vídeo al cerrar
document.addEventListener('keydown', (e) => {
  const b = (e.key === 'Enter' || e.key === ' ') && e.target.closest?.('span[data-tver]');
  if (b) { e.preventDefault(); abrirTarea(b.dataset.tver); }
});
document.addEventListener('click', (e) => {
  if (e.target.closest('dialog')) return;
  // Se abre al pulsar en cualquier parte de la tarea (salvo casillas, botones y enlaces).
  const b = e.target.closest('[data-tver]') || (!e.target.closest('input, label, button, a, select, textarea, .t-actions') && e.target.closest('[data-trow], .kb-card[data-kid]'));
  if (b) abrirTarea(b.dataset.tver || b.dataset.trow || b.dataset.kid);
});

// ---------- Comentarios de las tareas (con @menciones) ----------
const normTxt = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const yoUid = () => state.user?.id || '';
const userDe = (uid) => (uid ? state.tareas?.users.find((u) => u.id === uid) : null);
function hace(iso) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(min)) return '';
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`;
  if (min < 7 * 24 * 60) return `hace ${Math.round(min / 1440)} d`;
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

// Texto del comentario: escapado, con enlaces y las menciones resaltadas.
function textoComentario(texto) {
  let h = esc(texto).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  const users = [...(state.tareas?.users || [])].filter((u) => u.nombre).sort((a, b) => b.nombre.length - a.nombre.length);
  if (users.length) {
    const re = new RegExp(users.map((u) => reEsc(esc(`@${u.nombre}`))).join('|'), 'gi');
    h = h.replace(re, (m) => {
      const u = users.find((x) => normTxt(esc(`@${x.nombre}`)) === normTxt(m));
      return `<span class="mention ${u && u.id === yoUid() ? 'me' : ''}">${m}</span>`;
    });
  }
  return h.replace(/\n/g, '<br>');
}

function renderComentarios(box, t) {
  const draft = box.dataset.tid === t.id ? $('.coment-new', box)?.value || '' : '';
  const cs = Array.isArray(t.comentarios) ? t.comentarios : [];
  box.dataset.tid = t.id;
  const puedeBorrar = (c) => state.role === 'admin' || (c.uid && c.uid === yoUid());
  box.innerHTML = `<h3 class="coments-h">${icon('chat')} Comentarios${cs.length ? ` <span class="muted">(${cs.length})</span>` : ''}</h3>
    ${cs.length ? `<ul class="coments-list">${cs.map((c) => `<li class="coment ${yoUid() && c.menciones?.includes(yoUid()) ? 'is-mencion' : ''}">
      ${avatarHtml(userDe(c.uid), c.nombre)}
      <div class="coment-body">
        <div class="coment-head"><strong>${esc(c.nombre)}</strong><span class="muted" title="${esc(new Date(c.en).toLocaleString('es-ES'))}">${esc(hace(c.en))}</span>
          ${puedeBorrar(c) ? `<button type="button" class="coment-del" data-cdel="${esc(c.id)}" title="Borrar comentario" aria-label="Borrar comentario">✕</button>` : ''}</div>
        <div class="coment-txt">${textoComentario(c.texto)}</div>
      </div></li>`).join('')}</ul>` : '<p class="muted coments-vacio">Todavía no hay comentarios. Escribe el primero: dudas, avances, enlaces…</p>'}
    <div class="coment-form">
      ${avatarHtml(state.user, state.user?.nombre || ROLE_LABEL[state.role])}
      <div class="coment-input">
        <textarea class="coment-new" rows="2" maxlength="2000" placeholder="Escribe un comentario… usa @ para mencionar a alguien" aria-label="Nuevo comentario"></textarea>
        <div class="mention-list" role="listbox" hidden></div>
      </div>
      <button type="button" class="btn primary" data-csend>Comentar</button>
    </div>
    <small class="muted coment-status" aria-live="polite"></small>`;
  $('.coment-new', box).value = draft;
  const ul = $('.coments-list', box);
  if (ul) ul.scrollTop = ul.scrollHeight;
}

// Vuelve a pintar los comentarios de las ventanas abiertas (tras comentar o recargar).
function refrescarComentarios() {
  for (const box of [$('#t-coments'), $('#tv-coments')]) {
    if (!box || box.hidden || !box.closest('dialog')?.open || !box.dataset.tid) continue;
    const t = state.tareas?.list.find((x) => x.id === box.dataset.tid);
    if (t) renderComentarios(box, t);
  }
}

async function enviarComentario(box) {
  const ta = $('.coment-new', box);
  const texto = ta.value.trim();
  if (!texto) { ta.focus(); return; }
  const btn = $('[data-csend]', box);
  btn.disabled = true;
  try {
    const d = await tareasOp({ op: 'comentar', id: box.dataset.tid, texto });
    refrescarComentarios();
    $('.coment-new', box).value = ''; // la caja se ha vuelto a pintar: se vacía la nueva
    const n = d.aviso?.menciones || 0;
    $('.coment-status', box).textContent = n ? `Comentario publicado ✓ · avisado por email a ${n} persona${n === 1 ? '' : 's'}` : 'Comentario publicado ✓';
  } catch (e) {
    $('.coment-status', box).textContent = e.message;
  } finally {
    btn.disabled = false;
  }
}

// Autocompletar de @menciones.
function mentionQuery(ta) {
  const pre = ta.value.slice(0, ta.selectionStart);
  const m = /(^|\s)@([^\s@]{0,30})$/.exec(pre);
  return m ? { q: m[2], start: pre.length - m[2].length - 1 } : null;
}
function updateMentionList(ta) {
  const list = ta.parentElement.querySelector('.mention-list');
  const mq = mentionQuery(ta);
  const q = normTxt(mq?.q);
  const cands = mq ? (state.tareas?.users || []).filter((u) => u.nombre && (normTxt(u.nombre).startsWith(q) || normTxt(u.nombre).split(/\s+/).some((w) => w.startsWith(q)))).slice(0, 6) : [];
  list.hidden = !cands.length;
  list.innerHTML = cands.map((u, i) => `<button type="button" role="option" class="${i === 0 ? 'active' : ''}" data-mention="${esc(u.id)}">${avatarHtml(u)}<span>${esc(u.nombre)}</span><small class="muted">${esc(ROLE_LABEL[u.rol] || u.rol || '')}</small></button>`).join('');
}
function insertMention(ta, uid) {
  const u = userDe(uid);
  const mq = mentionQuery(ta);
  if (!u || !mq) return;
  const before = ta.value.slice(0, mq.start);
  const after = ta.value.slice(ta.selectionStart);
  ta.value = `${before}@${u.nombre} ${after.replace(/^\s+/, '')}`;
  const pos = before.length + u.nombre.length + 2;
  ta.focus();
  ta.setSelectionRange(pos, pos);
  updateMentionList(ta);
}
document.addEventListener('input', (e) => { if (e.target.matches?.('.coment-new')) updateMentionList(e.target); });
document.addEventListener('mousedown', (e) => { if (e.target.closest('[data-mention]')) e.preventDefault(); }); // no perder el foco
document.addEventListener('keydown', (e) => {
  const ta = e.target.closest?.('.coment-new');
  if (!ta) return;
  const list = ta.parentElement.querySelector('.mention-list');
  if (!list.hidden) {
    const opts = $$('[data-mention]', list);
    const i = opts.findIndex((o) => o.classList.contains('active'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const j = (i + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
      opts.forEach((o, k) => o.classList.toggle('active', k === j));
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(ta, opts[Math.max(i, 0)].dataset.mention); return; }
    if (e.key === 'Escape') { e.preventDefault(); list.hidden = true; return; }
  }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviarComentario(ta.closest('.coments')); }
});
// Escape con la lista de menciones abierta la cierra a ella, no a la ventana.
$$('dialog').forEach((d) => d.addEventListener('cancel', (e) => {
  const l = $$('.mention-list', d).find((x) => !x.hidden);
  if (l) { e.preventDefault(); l.hidden = true; }
}));
document.addEventListener('click', async (e) => {
  const m = e.target.closest('[data-mention]');
  if (m) { insertMention(m.closest('.coment-input').querySelector('.coment-new'), m.dataset.mention); return; }
  const send = e.target.closest('[data-csend]');
  if (send) { enviarComentario(send.closest('.coments')); return; }
  const del = e.target.closest('[data-cdel]');
  if (del) {
    if (!confirm('¿Borrar este comentario?')) return;
    const box = del.closest('.coments');
    try { await tareasOp({ op: 'borrar-comentario', id: box.dataset.tid, cid: del.dataset.cdel }); refrescarComentarios(); } catch (ex) { $('.coment-status', box).textContent = ex.message; }
  }
});

// Abrir una tarea al pulsarla: quien puede editar la abre ya en edición; el resto, en vista. Las dos con comentarios.
function abrirTarea(id, { comentar = false } = {}) {
  const t = state.tareas?.list.find((x) => x.id === id);
  if (!t) return;
  if (puedeTareas()) openTarea(t); else openTareaVer(id);
  if (comentar) {
    const box = puedeTareas() ? $('#t-coments') : $('#tv-coments');
    requestAnimationFrame(() => { box.scrollIntoView({ block: 'end' }); $('.coment-new', box)?.focus(); });
  }
}

// Tarea de otro embudo (desde la campanita): se cambia de embudo y se abre.
async function abrirTareaEn(code, id, opts) {
  if (code && code !== codigo()) {
    if (state.config.vsls?.[code]) await setEmbudo(code);
    else { state.launchCode = code; await setEmbudo(embudoDeLanz(state.config.launches[code])); }
    if (state.tareas?.code !== code || !state.tareas.list.some((t) => t.id === id)) await loadTareas();
  }
  abrirTarea(id, opts);
}

// ---------- Campanita de notificaciones ----------
// Comentarios en mis tareas, menciones, mis tareas vencidas o a punto de vencer y (admin) las vencidas del equipo.
const NOTIF_DIAS = 2;
const notifQuien = () => yoUid() || state.role;
function notifVistas() {
  try { return new Set(JSON.parse(ls.get(`lsd_notif_vistas_${notifQuien()}`) || '[]')); } catch { return new Set(); }
}
const notifVistoEn = () => state.user?.notifVisto || ls.get(`lsd_notif_visto_${notifQuien()}`) || '';

function notifItems() {
  const yo = meSess();
  const hoy = today();
  const limite = addDays(hoy, NOTIF_DIAS);
  const out = [];
  const fuentes = [state.tareas, ...(state.tareasOtros || []).filter((T) => T.code !== codigo())].filter(Boolean);
  for (const T of fuentes) {
  const desde = out.length;
  for (const t of T.list) {
    const mia = esMia(t, yo);
    for (const c of t.comentarios || []) {
      if (yo.uid ? c.uid === yo.uid : !c.uid) continue; // los míos no
      const mencion = Boolean(yo.uid) && (c.menciones || []).includes(yo.uid);
      if (mencion || mia) out.push({ tipo: mencion ? 'mencion' : 'comentario', t, c, key: `c:${c.id}` });
    }
    if (mia && !t.hecha && t.fecha) {
      if (t.fecha < hoy) out.push({ tipo: 'vencida', t, key: `v:${t.id}:${t.fecha}` });
      else if (t.fecha <= limite) out.push({ tipo: 'pronto', t, key: `p:${t.id}:${t.fecha}` });
    }
  }
  if (state.role === 'admin') {
    for (const r of vencidasEquipo(T.list, T.users, hoy, state.roles)) out.push({ tipo: 'equipo', t: r.tarea, quien: r.quien, dias: r.dias, key: `e:${r.tarea.id}:${r.tarea.fecha}` });
  }
  for (const n of out.slice(desde)) n.code = T.code;
  }
  const visto = notifVistoEn();
  const vistas = notifVistas();
  for (const n of out) n.nueva = n.c ? n.c.en > visto : !vistas.has(n.key);
  return out;
}

const cuandoVence = (f) => {
  const hoy = today();
  if (f === hoy) return 'vence hoy';
  if (f === addDays(hoy, 1)) return 'vence mañana';
  return `vence el ${fechaCorta(f)}`;
};
function notifHtml(n) {
  const tit = `«${esc(n.t.titulo)}»`;
  const ico = { mencion: '@', comentario: '💬', vencida: '⏰', pronto: '📅', equipo: '👥' }[n.tipo];
  let txt = '';
  if (n.tipo === 'mencion') txt = `<strong>${esc(n.c.nombre)}</strong> te ha mencionado en ${tit}`;
  else if (n.tipo === 'comentario') txt = `<strong>${esc(n.c.nombre)}</strong> ha comentado en tu tarea ${tit}`;
  else if (n.tipo === 'vencida') txt = `${tit} venció el ${esc(fechaCorta(n.t.fecha))} y sigue sin completar`;
  else if (n.tipo === 'pronto') txt = `${tit} ${cuandoVence(n.t.fecha)}`;
  else txt = `${tit} de <strong>${esc(n.quien)}</strong>: ${n.dias} día${n.dias === 1 ? '' : 's'} de retraso`;
  const extra = n.c ? `<span class="notif-cita">${esc(n.c.texto.slice(0, 140))}${n.c.texto.length > 140 ? '…' : ''}</span><span class="notif-when">${esc(hace(n.c.en))}</span>` : '';
  return `<button type="button" class="notif-item t-${n.tipo} ${n.nueva ? 'nueva' : ''}" data-nt="${esc(n.t.id)}" data-ncode="${esc(n.code || '')}" ${n.c ? 'data-ntc="1"' : ''}>
    <span class="notif-ico" aria-hidden="true">${ico}</span><span class="notif-txt">${n.code && n.code !== codigo() ? `<span class="notif-emb">${state.config.vsls?.[n.code] ? '🎬' : '🚀'} ${esc(nombreEmbudo(n.code))}</span>` : ''}${txt}${extra}</span>${n.nueva ? '<span class="notif-dot" aria-label="Nueva"></span>' : ''}</button>`;
}

function renderNotif() {
  const items = notifItems();
  const nuevas = items.filter((n) => n.nueva).length;
  const count = $('#notif-count');
  count.hidden = !nuevas;
  count.textContent = nuevas > 99 ? '99+' : String(nuevas);
  $('#btn-notif').classList.toggle('has-new', nuevas > 0);
  const panel = $('#notif-panel');
  if (panel.hidden) return;
  const grupos = [
    ['Comentarios y menciones', items.filter((n) => n.c).sort((a, b) => b.c.en.localeCompare(a.c.en)).slice(0, 30)],
    ['Tus tareas vencidas', items.filter((n) => n.tipo === 'vencida').sort((a, b) => a.t.fecha.localeCompare(b.t.fecha))],
    [`Vencen en los próximos ${NOTIF_DIAS} días`, items.filter((n) => n.tipo === 'pronto').sort((a, b) => a.t.fecha.localeCompare(b.t.fecha))],
    ['Vencidas del equipo', items.filter((n) => n.tipo === 'equipo')],
  ].filter(([, l]) => l.length);
  panel.innerHTML = `<div class="notif-head"><strong>Notificaciones</strong><span class="muted">${esc(nombreEmbudo(codigo()))}${state.tareasOtros?.length ? ` y ${state.tareasOtros.length} embudo${state.tareasOtros.length === 1 ? '' : 's'} más` : ''}</span></div>
    ${grupos.length ? grupos.map(([g, l]) => `<div class="notif-grupo"><h4>${esc(g)}</h4>${l.map(notifHtml).join('')}</div>`).join('')
    : '<p class="muted notif-vacio">Todo al día: no tienes comentarios nuevos ni tareas vencidas o a punto de vencer. 🎉</p>'}`;
}

async function marcarNotifVistas() {
  const items = notifItems();
  try {
    const vistas = notifVistas();
    items.filter((n) => !n.c).forEach((n) => vistas.add(n.key));
    ls.set(`lsd_notif_vistas_${notifQuien()}`, JSON.stringify([...vistas].slice(-500)));
  } catch { /* sin almacenamiento: se volverán a contar */ }
  if (!items.some((n) => n.c && n.nueva)) return;
  const ahora = new Date().toISOString();
  if (state.user) {
    try { state.user.notifVisto = (await api('/api/usuarios', { method: 'POST', body: { op: 'notif-visto' } })).notifVisto; } catch { state.user.notifVisto = ahora; }
  } else ls.set(`lsd_notif_visto_${notifQuien()}`, ahora);
}

function cerrarNotif() {
  const panel = $('#notif-panel');
  if (panel.hidden) return;
  panel.hidden = true;
  $('#btn-notif').setAttribute('aria-expanded', 'false');
  renderNotif();
}
$('#btn-notif').addEventListener('click', async (e) => {
  e.stopPropagation();
  const panel = $('#notif-panel');
  if (!panel.hidden) { cerrarNotif(); return; }
  panel.hidden = false;
  $('#btn-notif').setAttribute('aria-expanded', 'true');
  renderNotif(); // se pintan ya las «nuevas» resaltadas; después se dan por vistas
  await marcarNotifVistas();
  $('#notif-count').hidden = true;
  $('#btn-notif').classList.remove('has-new');
});
$('#notif-panel').addEventListener('click', (e) => {
  const b = e.target.closest('[data-nt]');
  if (!b) return;
  cerrarNotif();
  abrirTareaEn(b.dataset.ncode, b.dataset.nt, { comentar: Boolean(b.dataset.ntc) });
});
document.addEventListener('click', (e) => { if (!e.target.closest('.notif-wrap')) cerrarNotif(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarNotif(); });
// Comentarios y avisos al día sin recargar: cada 2 minutos, si la pestaña está a la vista y no hay nada abierto.
setInterval(() => {
  if (document.hidden || !codigo() || $$('dialog').some((d) => d.open)) return;
  loadTareas();
}, 120_000);

// Reasignar las seleccionadas
function fillSelAsignar() {
  const users = state.tareas?.users || [];
  const sel = $('#sel-asignar');
  const v = sel.value;
  sel.innerHTML = `<option value="">Asignar a…</option><option value="ninguno">Sin asignar</option>
    <optgroup label="Todo un rol">${rolesUI().map((r) => `<option value="rol:${r}">Rol ${ROLE_LABEL[r]}</option>`).join('')}</optgroup>
    <optgroup label="Personas">${users.map((u) => `<option value="u:${esc(u.id)}">${esc(u.nombre)}</option>`).join('')}</optgroup>`;
  sel.value = v;
  $('#btn-sel-asignar').disabled = !state.tSel?.size || !sel.value;
}
$('#sel-asignar').addEventListener('change', fillSelAsignar);
$('#btn-sel-asignar').addEventListener('click', async () => {
  const v = $('#sel-asignar').value;
  const n = state.tSel.size;
  if (!v || !n) return;
  const asignado = v === 'ninguno' ? null : v.startsWith('rol:') ? { tipo: 'rol', rol: v.slice(4) } : { tipo: 'persona', id: v.slice(2) };
  const avisar = asignado ? window.confirm(`¿Enviar un email de aviso con las ${n} tareas a quien las recibe?\n(Aceptar = sí · Cancelar = asignar sin avisar)`) : false;
  try {
    const d = await tareasOp({ op: 'asignar', ids: [...state.tSel], asignado, avisar });
    state.tSel = null;
    renderTareas();
    notice(`${n} tarea${n === 1 ? ' asignada' : 's asignadas'} a ${asignadoTexto(asignado)}.${d.aviso?.enviados ? ' Aviso enviado por email.' : ''} Si eran habituales, en los próximos lanzamientos se cargarán ya con esta asignación.`);
  } catch (ex) { notice(ex.message, true); }
});

// ---------- Llamadas de valoración ----------
function loadLlamadas() {
  const code = codigo();
  if (!code) return Promise.resolve();
  return unaVez('llamadas', code, () => cargarLlamadas(code));
}
async function cargarLlamadas(code) {
  state.llamadas = { code, loading: true };
  if (!$('#view-llamadas').hidden) renderLlamadas();
  try {
    const d = await api(`/api/llamadas?l=${encodeURIComponent(code)}`);
    if (code !== codigo()) return;
    state.llamadas = { code, data: d };
    calcularFases();
    if (state.config.vsls?.[code]) { if (state.vsl.raw && state.vsl.code === code) { enriquecerVsl(); renderVsl(); } } else if (state.leads.length) render();
  } catch (e) {
    if (code !== codigo()) return;
    state.llamadas = { code, error: e.message };
  }
  renderLlamadas();
}

const llCancelada = (c) => ['cancelled', 'invalid'].includes(c.status) && c.resultado?.resultado !== 'reagendar';
const llStart = (c) => Date.parse(c.startTime);
const leadDe = (contactId) => (enVsl() ? state.vsl.leads || [] : state.leads).find((l) => l.id === contactId) || null;

function llamadaCard(c) {
  const ahora = Date.now();
  const lead = leadDe(c.contactId);
  const d = new Date(c.startTime);
  const hoyD = today();
  const dia = dayInMadrid(c.startTime);
  const etapa = state.llamadas.data.pipeline?.stages.find((s) => s.id === c.opp?.pipelineStageId);
  const r = c.resultado && RESULTADOS.find((x) => x.id === c.resultado.resultado);
  const pasada = llStart(c) < ahora;
  const cuando = dia === hoyD ? 'Hoy' : dia === addDays(hoyD, 1) ? 'Mañana' : dia === addDays(hoyD, -1) ? 'Ayer' : d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' });
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  const chips = lead ? [
    `<span class="ll-chip st-${lead.estado.id}" title="Puntuación del lead">${esc(lead.estado.label)} · ${lead.score} pts</span>`,
    lead.s.vip ? '<span class="ll-chip vip">⭐ VIP</span>' : '',
    directoVenta(lead.s, 'asistio') ? '<span class="ll-chip">🔴 Vio el directo</span>' : '',
    watched(lead.s, 'clase1') || watched(lead.s, 'clase2') ? `<span class="ll-chip">🎬 Clases: ${[watched(lead.s, 'clase1') ? 1 : 0, watched(lead.s, 'clase2') ? 2 : 0].filter(Boolean).join(' y ')}</span>` : '',
    grabVenta(lead.s) >= 25 ? `<span class="ll-chip">📼 Grabación ${grabVenta(lead.s)}%</span>` : '',
    lead.s.encuesta ? '<span class="ll-chip">📋 Encuesta</span>' : '',
    lead.s.compra ? '<span class="ll-chip buy">✅ Ya compró Raíces</span>' : '',
  ].filter(Boolean).join('') : '<span class="ll-chip muted">No está entre los registros de este lanzamiento</span>';
  const k = contactoDe(c);
  const phone = k.phone;
  const wa = k.phoneWa;
  return `<article data-ll-card="${esc(c.id)}" title="Pulsa para ver la ficha completa" class="ll-card ${pasada && !r && !llCancelada(c) ? 'pendiente' : ''} ${r ? `res-${r.id}` : ''} ${llCancelada(c) ? 'cancelada' : ''}">
    <div class="ll-when"><span class="ll-dia">${esc(cuando)}</span><span class="ll-hora">${esc(hora)}</span></div>
    <div class="ll-main">
      <div class="ll-name">${esc(lead?.name || c.title || 'Sin nombre')}
        ${etapa ? `<span class="ll-etapa" style="--c:${esc(etapa.color || '#8a817b')}" title="Etapa en el pipeline de GHL">${esc(etapa.name)}</span>` : '<span class="ll-etapa none" title="Aún no está en el pipeline: se añadirá al anotar el resultado">Sin etapa</span>'}
        ${llCancelada(c) ? '<span class="ll-etapa none">Cita cancelada</span>' : ''}</div>
      <div class="ll-contact">${phone ? `<a href="tel:${esc(phone)}">${icon('phone')}${esc(phone)}</a>` : ''}${wa ? `<a href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${k.email ? `<span class="muted">${esc(k.email)}</span>` : ''}${phone ? '' : '<span class="muted">Sin teléfono</span>'}</div>
      <div class="ll-chips">${origenChip(c)}${chips}</div>
      ${r ? `<div class="ll-res">${r.icon} <strong>${esc(r.label)}</strong>${c.resultado.motivo ? ` · ${esc(c.resultado.motivo)}` : ''} <span class="muted">· ${esc(c.resultado.por || '')}</span>${c.resultado.notas ? `<div class="ll-notas">${esc(c.resultado.notas)}</div>` : ''}</div>` : ''}
    </div>
    <div class="ll-actions">${llCancelada(c) ? '' : `<button type="button" class="btn ${pasada && !r ? 'primary' : ''}" data-ll="${esc(c.id)}">${r ? 'Cambiar resultado' : 'Anotar resultado'}</button>`}</div>
  </article>`;
}

function renderLlamadas() {
  const top = $('#llamadas-top');
  const box = $('#llamadas-list');
  const L = state.llamadas;
  const badge = $('#llamadas-badge');
  if (!L || L.code !== codigo() || L.loading) { top.innerHTML = '<p class="muted">Cargando llamadas de GHL…</p>'; box.innerHTML = ''; return; }
  if (L.error) { top.innerHTML = `<div class="notice err">No se pudieron cargar las llamadas: ${esc(L.error)}</div>`; box.innerHTML = ''; badge.hidden = true; return; }
  const d = L.data;
  if (!d.configurado) { top.innerHTML = `<div class="card empty"><h2>Llamadas de valoración</h2><p class="muted">${esc(d.motivo)}</p></div>`; box.innerHTML = ''; badge.hidden = true; return; }
  calcularFases();
  const ahora = Date.now();
  const list = d.llamadas;
  const m = metricasLlamadas(list.map((c) => ({ start: llStart(c), resultado: c.resultado, cancelada: llCancelada(c) })), ahora);
  badge.hidden = !m.sinResultado;
  badge.textContent = m.sinResultado;
  badge.title = 'Llamadas ya pasadas sin resultado anotado';
  $('#ll-fuente').innerHTML = `Calendario <strong>${esc(d.calendario.name)}</strong>${d.pipeline ? ` · pipeline <strong>${esc(d.pipeline.name)}</strong>` : ' · <span class="error">no encuentro el pipeline «Leads Lanzamientos» en GHL</span>'}`;
  const pct = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`);
  const maxMot = m.motivos[0]?.[1] || 1;
  top.innerHTML = `
    <div class="kpis ll-kpis">
      <div class="kpi static tone-info"><span class="kpi-label"><span class="kpi-ico">${icon('calendar')}</span>Reservadas</span><span class="kpi-value">${m.reservadas}</span><span class="kpi-sub">${m.proximas} próximas · ${m.pasadas} ya pasadas</span></div>
      <div class="kpi static tone-live"><span class="kpi-label"><span class="kpi-ico">${icon('phone')}</span>Shows</span><span class="kpi-value">${m.shows} <small class="ll-pct">${pct(m.pctShow)}</small></span><span class="kpi-sub">se presentaron y se hizo la llamada</span></div>
      <div class="kpi static tone-accent"><span class="kpi-label"><span class="kpi-ico">${icon('alert')}</span>No shows</span><span class="kpi-value">${m.noshow} <small class="ll-pct">${pct(m.pctNoshow)}</small></span><span class="kpi-sub">no se presentaron (sobre shows + no shows)</span></div>
      <div class="kpi static"><span class="kpi-label"><span class="kpi-ico">${icon('calendar')}</span>Canceladas</span><span class="kpi-value">${m.canceladas} <small class="ll-pct">${pct(m.pctCancel)}</small></span><span class="kpi-sub">de las reservadas${m.reagendadas ? ` · ${m.reagendadas} reagendadas` : ''}</span></div>
      <div class="kpi static tone-buy"><span class="kpi-label"><span class="kpi-ico">${icon('cart')}</span>Ventas · conversión</span><span class="kpi-value">${m.ventas} <small class="ll-pct">${pct(m.conversion)}</small></span><span class="kpi-sub">sobre shows · ${m.pendientesPago} pendientes de pago · ${m.seguimiento} en seguimiento · ${m.perdidas} no compran</span></div>
      <div class="kpi static ${m.sinResultado ? 'tone-accent' : ''}"><span class="kpi-label"><span class="kpi-ico">${icon('list')}</span>Sin anotar</span><span class="kpi-value">${m.sinResultado}</span><span class="kpi-sub">llamadas pasadas sin resultado</span></div>
    </div>
    ${d.pipeline ? `<div class="card ll-pipe"><h3>Pipeline · ${esc(d.pipeline.name)}</h3><div class="ll-stages">${d.pipeline.stages.map((s) => `<span class="ll-stage" style="--c:${esc(s.color || '#8a817b')}"><i></i>${esc(s.name)} <strong>${s.total ?? "–"}</strong></span>`).join('')}</div></div>` : ''}
    ${m.motivos.length ? `<div class="card ll-motivos"><h3>Por qué no compran</h3>${m.motivos.map(([k, v]) => `<div class="ll-mot"><span>${esc(k)}</span><div class="gan-bar"><span style="width:${(v / maxMot) * 100}%;background:var(--error)"></span><b>${v}</b></div></div>`).join('')}</div>` : ''}`;
  const hoyD = today();
  const pendientes = list.filter((c) => llStart(c) < ahora && !c.resultado && !llCancelada(c)).reverse();
  const deHoy = list.filter((c) => dayInMadrid(c.startTime) === hoyD && llStart(c) >= ahora);
  const proximas = list.filter((c) => llStart(c) >= ahora && dayInMadrid(c.startTime) !== hoyD);
  const anotadas = list.filter((c) => llStart(c) < ahora && (c.resultado || llCancelada(c))).reverse();
  const sec = (titulo, items, cls = '', vacio = '') => (items.length || vacio ? `<section class="ll-sec ${cls}"><h3>${titulo} <span class="muted">${items.length}</span></h3>${items.map(llamadaCard).join('') || `<p class="muted">${vacio}</p>`}</section>` : '');
  box.innerHTML = list.length ? `
    ${sec('⚠️ Pendientes de anotar', pendientes, 'warn')}
    ${sec('📞 Hoy', deHoy, '', 'No hay más llamadas hoy.')}
    ${sec('🗓️ Próximos días', proximas)}
    ${anotadas.length ? `<details class="ll-sec ll-done"><summary><h3>✅ Ya anotadas <span class="muted">${anotadas.length}</span></h3></summary>${anotadas.map(llamadaCard).join('')}</details>` : ''}`
    : '<div class="card empty"><p class="muted">Todavía no hay llamadas agendadas en el calendario para este lanzamiento.</p></div>';
  syncLlVista();
}

// ---------- Llamadas en calendario (semana / mes) ----------
const llc = {
  vista: ['calendario', 'fases'].includes(ls.get('lsd_ll_vista')) ? ls.get('lsd_ll_vista') : 'lista',
  modo: ls.get('lsd_llc_modo') === 'mes' ? 'mes' : 'semana',
  ref: null,
};
function llcChip(c) {
  const ahora = Date.now();
  const hora = new Date(c.startTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  const r = c.resultado?.resultado;
  const cls = llCancelada(c) ? 'cancel' : r ? `res-${r}` : llStart(c) < ahora ? 'pend' : 'prox';
  const k = contactoDe(c);
  const o = origenLlamada(c);
  const res = r ? RESULTADOS.find((x) => x.id === r) : null;
  return `<button type="button" class="llc-chip ${cls}" ${llCancelada(c) ? 'disabled' : `data-ll="${esc(c.id)}"`} title="${esc(`${hora} · ${k.nombre}${k.phone ? ` · ${k.phone}` : ''} · ${o.label.replace(/^\S+ /, '')}${res ? ` · ${res.label}` : ''}`)}">
    <span class="llc-hora">${esc(hora)}</span><span class="llc-nombre">${res ? `${res.icon} ` : ''}${esc(k.nombre)}${llc.modo === 'semana' ? `<small class="llc-extra">${o.tipo === 'publi' ? '📣' : o.tipo === 'organico' ? '🌱' : ''} ${esc(k.phone)}</small>` : ''}</span></button>`;
}
function renderLlCal() {
  const L = state.llamadas;
  if (!L?.data?.configurado) { $('#llc-grid').innerHTML = ''; return; }
  if (!llc.ref) llc.ref = today();
  const porDia = {};
  for (const c of L.data.llamadas) (porDia[dayInMadrid(c.startTime)] ||= []).push(c);
  for (const list of Object.values(porDia)) list.sort((a, b) => llStart(a) - llStart(b));
  $$('#llc-modo .seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.m === llc.modo));
  const hoy = today();
  let days;
  if (llc.modo === 'mes') {
    const first = monthStart(llc.ref);
    const start = addDays(first, -dow(first));
    const last = addDays(addMonths(first, 1), -1);
    const end = addDays(last, 6 - dow(last));
    days = [];
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
    const t = fmtDay(first, { month: 'long', year: 'numeric' });
    $('#llc-title').textContent = t.charAt(0).toUpperCase() + t.slice(1);
  } else {
    const start = addDays(llc.ref, -dow(llc.ref));
    days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    $('#llc-title').textContent = `${fmtDay(days[0], { day: 'numeric', month: 'short' })} – ${fmtDay(days[6], { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  const month = llc.ref.slice(0, 7);
  const max = llc.modo === 'mes' ? 4 : 99;
  $('#llc-grid').innerHTML = `<div class="cal ${llc.modo === 'mes' ? 'cal-mes' : 'cal-semana'} llc">
    ${llc.modo === 'mes' ? `<div class="cal-head">${DOW.map((x) => `<span>${x}</span>`).join('')}</div>` : ''}
    <div class="cal-body">${days.map((d) => {
    const list = porDia[d] || [];
    const more = list.length - max;
    return `<div class="cal-day llc-day ${d.slice(0, 7) !== month && llc.modo === 'mes' ? 'out' : ''} ${d === hoy ? 'today' : ''} ${d < hoy ? 'past' : ''}">
      <span class="cal-num">${llc.modo === 'semana' ? `<span class="cal-dow">${DOW[dow(d)]}</span> ` : ''}${Number(d.slice(8))}${list.length ? ` <span class="llc-count">${list.length}</span>` : ''}</span>
      <span class="cal-chips">${list.slice(0, max).map(llcChip).join('')}${more > 0 ? `<button type="button" class="cal-more llc-more" data-llc-dia="${d}">+${more} más</button>` : ''}</span>
    </div>`;
  }).join('')}</div></div>`;
}
function syncLlVista() {
  $$('#ll-vista .seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.llv === llc.vista));
  $('#llamadas-list').hidden = llc.vista !== 'lista';
  $('#ll-cal').hidden = llc.vista !== 'calendario';
  $('#ll-fases').hidden = llc.vista !== 'fases';
  if (llc.vista === 'calendario') renderLlCal();
  if (llc.vista === 'fases') renderFases();
}
$('#ll-vista').addEventListener('click', (e) => {
  const b = e.target.closest('[data-llv]');
  if (!b) return;
  llc.vista = b.dataset.llv;
  ls.set('lsd_ll_vista', llc.vista);
  syncLlVista();
});
$('#llc-modo').addEventListener('click', (e) => {
  const b = e.target.closest('[data-m]');
  if (!b) return;
  llc.modo = b.dataset.m;
  ls.set('lsd_llc_modo', llc.modo);
  renderLlCal();
});
$('#llc-prev').addEventListener('click', () => { llc.ref = llc.modo === 'mes' ? addMonths(llc.ref, -1) : addDays(llc.ref, -7); renderLlCal(); });
$('#llc-next').addEventListener('click', () => { llc.ref = llc.modo === 'mes' ? addMonths(llc.ref, 1) : addDays(llc.ref, 7); renderLlCal(); });
$('#llc-hoy').addEventListener('click', () => { llc.ref = today(); renderLlCal(); });
$('#llc-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ll]');
  if (b) { openLlamada(b.dataset.ll); return; }
  const m = e.target.closest('[data-llc-dia]');
  if (m) { llc.modo = 'semana'; llc.ref = m.dataset.llcDia; ls.set('lsd_llc_modo', 'semana'); renderLlCal(); }
});

// ---------- Llamadas: personas por fase y WhatsApp según la fase ----------
state.llFases = new Map(); // contactId → { fase, cita }
state.llFiltro = ls.get('lsd_llf_filtro') || 'todas';
const FASE_INFO = Object.fromEntries(FASES_LLAMADA.map((f) => [f.id, f]));

function calcularFases() {
  const d = state.llamadas?.code === codigo() ? state.llamadas.data : null;
  state.llFases = d?.configurado
    ? fasesPorContacto(d.llamadas.map((c) => ({ id: c.id, contactId: c.contactId, start: llStart(c), cancelada: llCancelada(c), resultado: c.resultado, c })))
    : new Map();
  // Filtro de la pestaña Leads: fases con su número de personas.
  const counts = {};
  for (const { fase } of state.llFases.values()) counts[fase] = (counts[fase] || 0) + 1;
  const sel = $('#f-llamada');
  const v = state.filters.llamada || '';
  sel.innerHTML = `<option value="">Cualquier fase de llamada</option>${FASES_LLAMADA.filter((f) => counts[f.id]).map((f) => `<option value="${f.id}">${f.icon} ${esc(f.label)} (${counts[f.id]})</option>`).join('')}`;
  sel.value = v;
  sel.hidden = !state.llFases.size;
}

function faseChip(contactId) {
  const f = state.llFases.get(contactId);
  if (!f) return '';
  const i = FASE_INFO[f.fase];
  return `<span class="fase-chip fase-${f.fase}" title="Fase de la llamada de valoración">${i.icon} ${esc(i.label)}</span>`;
}

// Origen de quien reserva: etiqueta de publi/orgánico del lanzamiento (como en Métricas) o, si no
// la tiene, sus UTM (utm_medium «paid» o anuncio de Meta = publi). Devuelve { tipo, label, detalle }.
function origenLlamada(c) {
  const lead = leadDe(c.contactId);
  const launch = embudoActual() || {};
  const tags = (lead?.tags || c.opp?.tags || c.contacto?.tags || []).map((t) => String(t).toLowerCase());
  const src = lead?.src || c.opp?.src || c.contacto?.src || {};
  let tipo = lead?.s.origen || '';
  if (!tipo && launch.publiTag && tags.includes(launch.publiTag)) tipo = 'publi';
  if (!tipo && launch.organicoTag && tags.includes(launch.organicoTag)) tipo = 'organico';
  if (!tipo && (/^(paid|cpc|ppc|ads?)$/i.test(src.medium || '') || src.content || /^(fb|ig|facebook|instagram)$/i.test(src.source || '') && src.campaign)) tipo = 'publi';
  if (!tipo && (src.source || tags.length)) tipo = 'organico';
  const names = state.meta?.names || {};
  const anuncio = tipo === 'publi' ? names[src.content] || names[src.campaign] || '' : '';
  return {
    tipo,
    label: tipo === 'publi' ? '📣 Publi' : tipo === 'organico' ? '🌱 Orgánico' : '❔ Origen sin datos',
    detalle: anuncio,
  };
}
const origenChip = (c) => {
  const o = origenLlamada(c);
  return `<span class="ll-chip origen-${o.tipo || 'nd'}" title="${esc(o.detalle ? `Anuncio: ${o.detalle}` : o.tipo === 'publi' ? 'Vino por publicidad' : o.tipo === 'organico' ? 'Vino por orgánico' : 'Sin etiqueta de publi/orgánico ni UTM')}">${o.label}${o.detalle ? ` · ${esc(o.detalle)}` : ''}</span>`;
};

// Datos de contacto: el lead del lanzamiento o, si no está, lo que devuelve GHL.
function contactoDe(c) {
  const lead = leadDe(c.contactId);
  const phone = lead?.phone || c.opp?.phone || c.contacto?.phone || '';
  return {
    lead,
    nombre: lead?.name || c.title || 'Sin nombre',
    primerNombre: lead?.firstName || String(c.title || '').split(/\s+/)[0] || '',
    phone,
    phoneWa: lead?.phoneWa || waPhone(phone, state.config.defaultCountryCode || '34'),
    email: lead?.email || c.opp?.email || c.contacto?.email || '',
  };
}

function mensajeFase(contactId) {
  const f = state.llFases.get(contactId);
  const info = f && FASE_INFO[f.fase];
  if (!info?.plantilla) return '';
  const c = f.cita.c;
  const k = contactoDe(c);
  const d = new Date(c.startTime);
  return buildMessage(state.config.templates[info.plantilla], {
    nombre: k.primerNombre, contactId, launch: embudoActual(), producto: nombreProducto(state.config),
    extra: {
      dia_llamada: d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' }),
      hora_llamada: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }),
    },
  });
}

const haceCuanto = (iso) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 60) return `hace ${Math.max(1, min)} min`;
  if (min < 1440) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} d`;
};

function renderFases() {
  const d = state.llamadas?.data;
  if (!d?.configurado) return;
  const counts = {};
  for (const { fase } of state.llFases.values()) counts[fase] = (counts[fase] || 0) + 1;
  if (state.llFiltro !== 'todas' && !counts[state.llFiltro]) state.llFiltro = 'todas';
  $('#llf-filtros').innerHTML = `<button type="button" class="llf-f ${state.llFiltro === 'todas' ? 'on' : ''}" data-llf="todas">Todas <b>${state.llFases.size}</b></button>
    ${FASES_LLAMADA.filter((f) => counts[f.id]).map((f) => `<button type="button" class="llf-f fase-${f.id} ${state.llFiltro === f.id ? 'on' : ''}" data-llf="${f.id}">${f.icon} ${esc(f.label)} <b>${counts[f.id]}</b></button>`).join('')}`;
  const orden = FASES_LLAMADA.map((f) => f.id);
  const filas = [...state.llFases.entries()]
    .filter(([, v]) => state.llFiltro === 'todas' || v.fase === state.llFiltro)
    .sort((a, b) => (orden.indexOf(a[1].fase) - orden.indexOf(b[1].fase)) || (b[1].cita.start - a[1].cita.start));
  $('#llf-list').innerHTML = filas.length ? filas.map(([contactId, { fase, cita }]) => {
    const c = cita.c;
    const k = contactoDe(c);
    const info = FASE_INFO[fase];
    const r = c.resultado;
    const wa = d.wa?.[contactId];
    const fecha = new Date(c.startTime).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
    const msg = mensajeFase(contactId);
    const waOk = info.plantilla && k.phoneWa && msg;
    return `<article class="llf-row fase-${fase}">
      <div class="llf-main">
        <div class="llf-name">${esc(k.nombre)} <span class="fase-chip fase-${fase}">${info.icon} ${esc(info.label)}</span></div>
        <div class="llf-meta">${fase === 'proxima' ? 'Llamada' : 'Última llamada'}: ${esc(fecha)}${r?.motivo ? ` · Motivo: ${esc(r.motivo)}` : ''}${k.phone ? ` · ${esc(k.phone)}` : ''}</div>
        ${r?.notas ? `<div class="llf-notas">${esc(r.notas)}</div>` : ''}
        <div class="ll-chips">${origenChip(c)}${k.lead ? `${k.lead.s.vip ? '<span class="ll-chip vip">⭐ VIP</span>' : ''}<span class="ll-chip st-${k.lead.estado.id}">${esc(k.lead.estado.label)} · ${k.lead.score} pts</span>${k.lead.s.compra ? '<span class="ll-chip buy">✅ Compró Raíces</span>' : ''}` : ''}</div>
      </div>
      <div class="llf-actions">
        ${waOk ? `<button type="button" class="btn wa ${wa && wa.fase === fase ? 'sent' : ''}" data-llwa="${esc(contactId)}" title="${esc(msg)}">WhatsApp · ${esc(info.label)}</button>` : info.plantilla ? '<span class="muted">Sin teléfono</span>' : ''}
        ${wa ? `<span class="llf-wa muted">✓ WhatsApp «${esc(FASE_INFO[wa.fase]?.label || wa.fase)}» ${esc(haceCuanto(wa.en))}</span>` : ''}
        ${llCancelada(c) ? '' : `<button type="button" class="btn ghost" data-ll="${esc(c.id)}">${r ? 'Cambiar resultado' : 'Anotar resultado'}</button>`}
      </div>
    </article>`;
  }).join('') : '<p class="muted">No hay personas en esta fase.</p>';
}

$('#llf-filtros').addEventListener('click', (e) => {
  const b = e.target.closest('[data-llf]');
  if (!b) return;
  state.llFiltro = b.dataset.llf;
  ls.set('lsd_llf_filtro', state.llFiltro);
  renderFases();
});
$('#llf-list').addEventListener('click', async (e) => {
  const a = e.target.closest('[data-ll]');
  if (a) { openLlamada(a.dataset.ll); return; }
  const b = e.target.closest('[data-llwa]');
  if (!b) return;
  const contactId = b.dataset.llwa;
  const f = state.llFases.get(contactId);
  const k = contactoDe(f.cita.c);
  window.open(`https://wa.me/${k.phoneWa}?text=${encodeURIComponent(mensajeFase(contactId))}`, '_blank', 'noopener');
  try {
    const r = await api('/api/llamadas', { method: 'POST', body: { l: state.llamadas.code, op: 'wa', contactId, fase: f.fase } });
    state.llamadas.data.wa = { ...(state.llamadas.data.wa || {}), [contactId]: r.wa };
    renderFases();
  } catch (ex) { notice(ex.message, true); }
});
$('#f-llamada').addEventListener('change', (e) => { state.filters.llamada = e.target.value; state.page = 0; render(); });

// Plantillas de mensajes por fase en Setting hoy → Mensajes de WhatsApp.
$('#tpl-llamadas').innerHTML = FASES_LLAMADA.filter((f) => f.plantilla).map((f) => `<label class="field"><span>${f.icon} ${esc(f.label)}</span><textarea id="tpl-${f.plantilla}" data-tpl="${f.plantilla}" rows="3"></textarea></label>`).join('');

// Mensajes de WhatsApp (en «Setting hoy»): los ve quien hace el setteo y los cambia quien tiene el permiso «mensajes».
const waBox = $('#wa-plantillas');
let waSucio = false;
function pintarPlantillas() {
  const edita = tiene('mensajes');
  $$('#wa-plantillas textarea, #cfg-country').forEach((el) => { el.readOnly = !edita; });
  $('#wa-pl-save').hidden = !edita;
  $('#wa-pl-sub').textContent = `Los textos que se envían con cada botón de WhatsApp. Pulsa para ${edita ? 'verlos o cambiarlos' : 'verlos (tu rol no puede cambiarlos)'}.`;
  const tp = state.config?.templates || {};
  $$('#wa-plantillas textarea[id^="tpl-"]').forEach((t) => { t.value = tp[t.dataset.tpl || t.id.slice(4)] || ''; });
  $('#cfg-country').value = state.config?.defaultCountryCode || '34';
  waSucio = false;
}
waBox.addEventListener('toggle', () => { if (waBox.open && !waSucio) pintarPlantillas(); });
waBox.addEventListener('input', () => { waSucio = true; $('#wa-pl-status').textContent = 'Cambios sin guardar.'; });
$('#wa-pl-guardar').addEventListener('click', async () => {
  const b = $('#wa-pl-guardar');
  const status = $('#wa-pl-status');
  b.disabled = true;
  status.textContent = 'Guardando…';
  try {
    const templates = { ...state.config.templates, ...Object.fromEntries($$('#wa-plantillas textarea[id^="tpl-"]').map((t) => [t.dataset.tpl || t.id.slice(4), t.value])) };
    const d = await api('/api/config', { method: 'POST', body: { op: 'plantillas', templates, defaultCountryCode: $('#cfg-country').value } });
    state.config = { ...state.config, templates: d.templates, defaultCountryCode: d.defaultCountryCode };
    pintarPlantillas();
    render();
    status.textContent = 'Mensajes guardados ✓';
  } catch (e) {
    status.textContent = e.message;
  } finally {
    b.disabled = false;
  }
});

// Diálogo para anotar el resultado
const lldlg = $('#llamada-dialog');
let llActual = null;
$('#ll-motivo').innerHTML = MOTIVOS.map((x) => `<option>${esc(x)}</option>`).join('');
const LL_EXPLICA = {
  venta: 'La cita se marca como realizada y la oportunidad pasa a «Venta» (ganada) en el pipeline.',
  pendiente_pago: 'La cita se marca como realizada y la oportunidad pasa a «Pendiente de pago» (o a «Seguimiento» si esa etapa no existe en el pipeline). En «Por fase» tendrás el WhatsApp con los enlaces de pago.',
  seguimiento: 'La cita se marca como realizada y la oportunidad pasa a «Seguimiento».',
  perdido: 'La cita se marca como realizada y la oportunidad pasa a «Perdido» con el motivo.',
  noshow: 'La cita se marca como «no se presentó» y la oportunidad avanza a «No contesta 1» (o al siguiente).',
  reagendar: 'La cita se cancela y la oportunidad vuelve a «Agenda llamada» para que reserve otra vez.',
};
function syncLlDialog() {
  const v = $('#ll-resultados input:checked')?.value;
  $('#ll-motivo-field').hidden = v !== 'perdido';
  $('#ll-explica').textContent = LL_EXPLICA[v] || '';
}
function openLlamada(id) {
  const c = state.llamadas.data.llamadas.find((x) => x.id === id);
  if (!c) return;
  llActual = c;
  const lead = leadDe(c.contactId);
  $('#ll-titulo').textContent = lead?.name || c.title || 'Llamada';
  const kk = contactoDe(c);
  $('#ll-sub').innerHTML = `${esc(new Date(c.startTime).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }))}${kk.phone ? ` · <a href="tel:${esc(kk.phone)}">${esc(kk.phone)}</a>` : ''} ${origenChip(c)}`;
  const actual = c.resultado?.resultado || (llStart(c) > Date.now() ? '' : 'venta');
  $('#ll-resultados').innerHTML = RESULTADOS.map((r) => `<label class="ll-opt ll-${r.id}"><input type="radio" name="ll-res" value="${r.id}" ${r.id === actual ? 'checked' : ''}><span>${r.icon} ${esc(r.label)}</span></label>`).join('');
  $('#ll-motivo').value = c.resultado?.motivo && MOTIVOS.includes(c.resultado.motivo) ? c.resultado.motivo : MOTIVOS[0];
  $('#ll-notas').value = c.resultado?.notas || '';
  $('#ll-status').textContent = '';
  syncLlDialog();
  lldlg.showModal();
}
$('#ll-resultados').addEventListener('change', syncLlDialog);
$('#llamadas-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ll]');
  if (b) { openLlamada(b.dataset.ll); return; }
  // El resto de la tarjeta (menos enlaces y botones) abre la ficha completa del lead.
  if (e.target.closest('a, button, select, input, textarea')) return;
  const card = e.target.closest('[data-ll-card]');
  if (card) abrirFicha(card.dataset.llCard);
});

// ---------- Ficha completa del lead (al pulsar una llamada) ----------
// Todo lo que ayuda a la setter antes de llamar: temperatura y puntuación, qué ha hecho en el embudo,
// la encuesta, el formulario de reserva de la llamada (y otros campos de GHL) y las notas.
let fichaLlamada = null;
const fechaFicha = (d) => (d ? new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' }) : '');
function hechosLead(lead) {
  const s = lead.s;
  if (enVsl()) {
    return [
      s.pct ? `🎬 Vio el ${s.pct}% del vídeo` : s.vio ? '🎬 Entró a ver el vídeo' : '🎬 No ha visto el vídeo',
      s.llamada ? '📞 Agendó llamada' : '',
      s.compra ? '✅ Ya compró' : '',
    ].filter(Boolean);
  }
  const launch = state.config.launches[state.launchCode] || {};
  const pctTxt = (p) => (p >= 90 ? 'entera' : p ? `${p}%` : 'no la ha visto');
  return [
    ...clasesDe(launch).map((c, i) => `🎓 Clase ${i + 1}: ${pctTxt(watched(s, c))}`),
    ...(conVip(launch) ? [s.vip ? '⭐ Compró la entrada VIP' : s.vip_anterior ? '⭐ VIP en una edición anterior' : '⭐ Sin entrada VIP'] : []),
    ...videosDe(launch).map((v) => {
      const live = s[`${v.directo}_final`] ? 'estuvo en directo hasta el final' : s[`${v.directo}_60`] ? 'estuvo en directo más de 60 min' : s[`${v.directo}_asistio`] ? 'entró al directo' : s[`${v.directo}_click`] ? 'pulsó el enlace del directo (no consta que entrara)' : '';
      const p = watched(s, v.replay);
      const nombre = videosDe(launch).length > 1 ? v.nombre : 'Webinar';
      return `🔴 ${nombre}: ${[live, p ? `vio el ${p}% de la grabación` : ''].filter(Boolean).join(' · ') || 'no lo ha visto'}`;
    }),
    s.encuesta ? '📋 Rellenó la encuesta' : '',
    ...(s.recursos?.musica ? [`🎵 Música: ${s.musica_90 ? 'la escuchó entera' : s.musica_50 ? 'escuchó más de la mitad' : s.musica_play ? 'le dio al play' : 'no la ha escuchado'}`] : []),
    ...(s.recursos?.test ? [s.test ? `🧭 Hizo el test${recursosDe(launch).test.nombre ? ` «${recursosDe(launch).test.nombre}»` : ''}` : '🧭 No ha hecho el test'] : []),
    ...(s.recursos?.votacion ? [votoTexto(lead.id) ? `🗳️ Votó: «${votoTexto(lead.id)}»` : s.voto ? '🗳️ Votó en la clase' : '🗳️ No ha votado'] : []),
    ...(s.recursos?.descargable ? [s.descarga ? '📄 Abrió el descargable' : ''] : []),
    s.wa_enviado ? '💬 Ya se le escribió por WhatsApp' : '',
    s.compra ? '✅ Ya compró' : s.clienta_anterior ? '✅ Clienta de una edición anterior' : '',
  ].filter(Boolean);
}
function pintarFicha(c, f, error = '') {
  const lead = leadDe(c.contactId);
  const k = contactoDe(c);
  const d = new Date(c.startTime);
  const cita = c.sinLlamada ? '' : `${d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' })} a las ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })}`;
  const etapa = state.llamadas?.data?.pipeline?.stages.find((x) => x.id === c.opp?.pipelineStageId);
  const r = c.resultado && RESULTADOS.find((x) => x.id === c.resultado.resultado);
  const filas = (lista, vacio) => (lista.length ? `<dl class="ficha-dl">${lista.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${b ? esc(b) : '<span class="muted">—</span>'}</dd>`).join('')}</dl>` : `<p class="muted">${vacio}</p>`);
  const reg = lead?.dateAdded || f?.contacto?.dateAdded;
  const dias = reg ? Math.max(0, Math.round((Date.now() - Date.parse(reg)) / 86_400_000)) : null;
  const encuestaRespondida = f?.encuesta?.some((x) => x.respuesta);
  const temp = lead ? `<div class="ficha-temp st-${lead.estado.id}"><span class="estado st-${lead.estado.id}"><span class="dot"></span>${esc(lead.estado.label)}</span>
      <div class="ficha-score"><div class="ficha-score-bar"><span style="width:${Math.min(100, lead.score)}%"></span></div><strong>${lead.score}</strong> <span class="muted">/ 100 puntos</span></div>
      ${!enVsl() && lead.step !== 'comprado' ? `<span class="muted">Siguiente paso: <strong>${esc(NEXT_STEPS[lead.step])}</strong></span>` : ''}</div>` : '<p class="muted">No está entre los registros de este embudo: no tiene puntuación.</p>';
  $('#ficha-titulo').textContent = lead?.name || f?.contacto?.name || c.title || 'Ficha del lead';
  $('#ficha-body').innerHTML = `
    ${c.sinLlamada ? '' : `<p class="ficha-cita">📅 Llamada el <strong>${esc(cita)}</strong>${etapa ? ` · etapa <strong>${esc(etapa.name)}</strong>` : ''}${llCancelada(c) ? ' · <strong>cancelada</strong>' : ''}</p>`}
    <div class="ll-contact ficha-contacto">${k.phone ? `<a href="tel:${esc(k.phone)}">${icon('phone')}${esc(k.phone)}</a>` : '<span class="muted">Sin teléfono</span>'}${k.phoneWa ? `<a href="https://wa.me/${esc(k.phoneWa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${k.email ? `<span class="muted">${esc(k.email)}</span>` : ''}</div>
    <section class="ficha-sec"><h3>🌡️ Temperatura (lead scoring)</h3>${temp}</section>
    ${lead ? `<section class="ficha-sec"><h3>🧭 Qué ha hecho</h3><ul class="ficha-hechos">${hechosLead(lead).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <p class="ficha-meta">${[c.sinLlamada ? '' : origenChip(c), lead.s.trafico ? `<span class="ll-chip">${lead.s.trafico === 'frio' ? '❄️ Tráfico frío (nueva en GHL)' : '🔥 Tráfico templado (ya estaba en GHL)'}</span>` : '', avatarChip(lead), dias != null ? `<span class="ll-chip">Registrada hace ${dias} día${dias === 1 ? '' : 's'} (${esc(fechaFicha(reg))})</span>` : ''].filter(Boolean).join(' ')}</p></section>` : ''}
    ${r ? `<section class="ficha-sec"><h3>📝 Resultado anotado</h3><p>${r.icon} <strong>${esc(r.label)}</strong>${c.resultado.motivo ? ` · ${esc(c.resultado.motivo)}` : ''} <span class="muted">· ${esc(c.resultado.por || '')}</span></p>${c.resultado.notas ? `<p class="ll-notas">${esc(c.resultado.notas)}</p>` : ''}</section>` : ''}
    ${error ? `<p class="error">${esc(error)}</p>` : !f ? '<p class="muted">Cargando la encuesta, el formulario y las notas de GHL…</p>' : `
    ${f.votacion ? `<section class="ficha-sec"><h3>🗳️ Votación de la clase</h3><p>${esc(f.votacion.pregunta)}</p>${votacionHtml(f.votacion.resultados, f.votacion.miVoto)}<p class="muted small">${f.votacion.miVoto ? `Votó «${esc(f.votacion.miVoto)}».` : 'No ha votado.'} ${f.votacion.resultados.total} voto${f.votacion.resultados.total === 1 ? '' : 's'} en total.</p></section>` : ''}
    <section class="ficha-sec"><h3>📋 Encuesta</h3>${encuestaRespondida ? filas(f.encuesta.map((x) => [x.pregunta, x.respuesta])) : `<p class="muted">${f.encuesta.length ? 'No ha rellenado la encuesta.' : 'Este cliente no tiene preguntas de encuesta configuradas (Equipo → Marca).'}</p>`}</section>
    <section class="ficha-sec"><h3>📞 Formulario de la llamada y otros datos de GHL</h3>${filas(f.otros.map((x) => [x.campo, x.fecha ? fechaFicha(x.valor) : x.valor]), 'No hay más datos en su ficha de GHL.')}</section>
    ${f.notas.length ? `<section class="ficha-sec"><h3>🗒️ Notas en GHL</h3><ul class="ficha-notas">${f.notas.map((n) => `<li><span class="muted small">${esc(fechaFicha(n.dateAdded))}</span><div>${esc(n.body)}</div></li>`).join('')}</ul></section>` : ''}`}`;
  $('#ficha-anotar').hidden = c.sinLlamada || llCancelada(c);
  $('#ficha-anotar').textContent = r ? 'Cambiar resultado' : 'Anotar resultado';
}
async function abrirFicha(id) {
  const c = state.llamadas?.data?.llamadas?.find((x) => x.id === id);
  if (!c) return;
  fichaLlamada = c;
  pintarFicha(c, null);
  $('#ficha-dialog').showModal();
  try {
    const f = await api(fichaUrl(c.contactId));
    if (fichaLlamada === c) pintarFicha(c, f);
  } catch (e) {
    if (fichaLlamada === c) pintarFicha(c, null, e.message);
  }
}
const fichaUrl = (cid) => `/api/ficha?cid=${encodeURIComponent(cid)}${!enVsl() && state.launchCode ? `&l=${encodeURIComponent(state.launchCode)}` : ''}`;
// Ficha de un lead sin llamada (pestaña Leads): la misma, sin la cita ni el resultado.
async function abrirFichaLead(id) {
  const c = { id: `lead-${id}`, contactId: id, sinLlamada: true };
  fichaLlamada = c;
  pintarFicha(c, null);
  $('#ficha-dialog').showModal();
  try {
    const f = await api(fichaUrl(id));
    if (fichaLlamada === c) pintarFicha(c, f);
  } catch (e) {
    if (fichaLlamada === c) pintarFicha(c, null, e.message);
  }
}
// Barras de % de una votación (ficha y métricas). `mio`: texto de la opción que votó.
function votacionHtml(res, mio = '') {
  return `<div class="vot-bars">${res.opciones.map((o) => `<div class="vot-bar${o.texto === mio ? ' mio' : ''}"><i style="width:${Math.round(o.pct * 100)}%"></i><span>${o.texto === mio ? '✓ ' : ''}${esc(o.texto)}</span><strong>${Math.round(o.pct * 100)} % <small class="muted">(${o.n})</small></strong></div>`).join('')}</div>`;
}
// Votos del lanzamiento abierto (para la tabla de leads y la ficha): { votos: { contacto → opción }, opciones }.
async function cargarVotos() {
  const code = state.launchCode;
  const launch = state.config.launches[code];
  if (enVsl() || !launch || !tieneRecurso(launch, 'votacion')) { state.votos = null; return; }
  try {
    const d = await api(`/api/votacion?l=${encodeURIComponent(code)}`);
    if (state.launchCode === code) { state.votos = d.activa ? { code, ...d } : null; render(); }
  } catch { state.votos = null; }
}
const votoTexto = (cid) => {
  const v = state.votos;
  if (!v || v.code !== state.launchCode) return '';
  return v.opciones.find((o) => o.id === v.votos?.[cid])?.texto || '';
};
$('#ficha-anotar').addEventListener('click', () => {
  if (!fichaLlamada) return;
  $('#ficha-dialog').close();
  openLlamada(fichaLlamada.id);
});
$('#btn-ll-reload').addEventListener('click', loadLlamadas);
// La ayuda se ve abierta hasta que la cierras (se recuerda en este navegador).
if (ls.get('lsd_ll_ayuda') !== 'cerrada') $('#ll-ayuda').open = true;
$('#ll-ayuda').addEventListener('toggle', (e) => ls.set('lsd_ll_ayuda', e.target.open ? 'abierta' : 'cerrada'));
$('#ll-save').addEventListener('click', async () => {
  const resultado = $('#ll-resultados input:checked')?.value;
  if (!resultado) { $('#ll-status').textContent = 'Elige un resultado.'; return; }
  const btn = $('#ll-save');
  btn.disabled = true;
  $('#ll-status').textContent = 'Guardando en GHL…';
  try {
    const c = llActual;
    const r = await api('/api/llamadas', { method: 'POST', body: { l: state.llamadas.code, op: 'resultado', eventId: c.id, contactId: c.contactId, nombre: leadDe(c.contactId)?.name || c.title, startTime: c.startTime, resultado, motivo: resultado === 'perdido' ? $('#ll-motivo').value : '', notas: $('#ll-notas').value } });
    lldlg.close();
    notice(r.avisos?.length ? `Resultado guardado, pero: ${r.avisos.join(' ')}` : 'Resultado guardado: pipeline, cita y nota actualizados en GHL.', Boolean(r.avisos?.length));
    await loadLlamadas();
  } catch (ex) {
    $('#ll-status').textContent = ex.message;
  } finally {
    btn.disabled = false;
  }
});

// ---------- Campos de los formularios instantáneos de Meta (Configuración) ----------
async function fillFormAdsFields() {
  const fa = state.config.formAds || {};
  const sels = { campaign: '#cfg-fa-campaign', adset: '#cfg-fa-adset', ad: '#cfg-fa-ad' };
  const pintar = (fields) => {
    for (const [k, sel] of Object.entries(sels)) {
      const v = fa[k] || '';
      const opts = [...fields];
      if (v && !opts.some((f) => f.id === v)) opts.push({ id: v, name: `(campo ${v})` });
      $(sel).innerHTML = `<option value="">— Ninguno —</option>${opts.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}`;
      $(sel).value = v;
    }
  };
  pintar(state.textFields || []);
  if (!state.textFields) {
    try { state.textFields = (await api('/api/fields?tipo=texto')).fields; pintar(state.textFields); } catch { /* sin permiso o sin conexión: se queda lo guardado */ }
  }
}

// ---------- Roles y permisos (Configuración, solo admin) ----------
// Desplegables de rol (alta de personas): los roles configurados, con Setter primero si existe.
function fillRolSelects() {
  const ids = state.roles.map((r) => r.id);
  const orden = [...(ids.includes('setter') ? ['setter'] : []), ...ids.filter((id) => id !== 'setter'), 'admin'];
  for (const sel of ['#eq-rol', '#t-np-rol']) {
    const el = $(sel);
    const v = el.value;
    el.innerHTML = orden.map((id) => `<option value="${esc(id)}">${esc(roleLabel(id))}</option>`).join('');
    if (orden.includes(v)) el.value = v;
  }
}

let rolesDraft = null;
function rolesResult(msg, isError = false) {
  const el = $('#roles-result');
  el.textContent = msg;
  el.classList.toggle('err', isError);
  el.hidden = !msg;
}
async function loadRoles() {
  $('#roles-table').innerHTML = '<tbody><tr><td class="muted">Cargando…</td></tr></tbody>';
  try {
    const d = await api('/api/roles');
    rolesDraft = { roles: d.roles, adminPersonas: d.adminPersonas };
    renderRoles();
  } catch (e) { rolesResult(e.message, true); }
}
function renderRoles() {
  const { roles, adminPersonas } = rolesDraft;
  const grupos = [...new Set(PERMISOS.map((p) => p.grupo))];
  $('#roles-table').innerHTML = `
    <thead>
      <tr><th rowspan="2">Rol</th>${grupos.map((g) => `<th colspan="${PERMISOS.filter((p) => p.grupo === g).length}" class="roles-grupo">${esc(g)}</th>`).join('')}<th rowspan="2" class="num">Personas</th><th rowspan="2"></th></tr>
      <tr>${PERMISOS.map((p) => `<th class="roles-perm"><span>${esc(p.label)}</span></th>`).join('')}</tr>
    </thead>
    <tbody>
      <tr class="roles-admin"><td><strong>Admin</strong><br><small class="muted">todo, siempre</small></td>${PERMISOS.map(() => '<td class="roles-cell"><input type="checkbox" checked disabled></td>').join('')}<td class="num">${adminPersonas ?? ''}</td><td></td></tr>
      ${roles.map((r, i) => `<tr data-ri="${i}">
        <td><input class="rol-label" value="${esc(r.label)}" maxlength="30" aria-label="Nombre del rol"><br><small class="muted">${esc(r.id)}</small></td>
        ${PERMISOS.map((p) => `<td class="roles-cell"><input type="checkbox" data-perm="${p.id}" ${r.permisos.includes(p.id) ? 'checked' : ''} ${r.id === ROL_CLIENTE ? 'disabled title="El rol Cliente solo ve su resumen"' : ''} aria-label="${esc(`${r.label}: ${p.label}`)}"></td>`).join('')}
        <td class="num">${r.personas ?? 0}</td>
        <td><button type="button" class="btn ghost" data-rol-del="${i}" ${r.id === ROL_CLIENTE ? 'disabled title="El rol Cliente no se puede borrar"' : r.personas ? `disabled title="Lo tienen ${r.personas} persona(s): cámbiales antes el rol en Equipo"` : 'title="Borrar el rol"'} aria-label="Borrar rol">✕</button></td>
      </tr>`).join('')}
    </tbody>`;
}
$('#roles-table').addEventListener('change', (e) => {
  const tr = e.target.closest('tr[data-ri]');
  if (!tr) return;
  const r = rolesDraft.roles[tr.dataset.ri];
  if (e.target.dataset.perm) {
    const p = e.target.dataset.perm;
    r.permisos = e.target.checked ? [...new Set([...r.permisos, p])] : r.permisos.filter((x) => x !== p);
  }
  if (e.target.classList.contains('rol-label')) r.label = e.target.value.trim() || r.label;
  rolesResult('Cambios sin guardar.');
});
$('#roles-table').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rol-del]');
  if (!b || b.disabled) return;
  const r = rolesDraft.roles[b.dataset.rolDel];
  if (!window.confirm(`¿Borrar el rol «${r.label}»? (Se borra al guardar.)`)) return;
  rolesDraft.roles.splice(Number(b.dataset.rolDel), 1);
  renderRoles();
  rolesResult('Cambios sin guardar.');
});
$('#btn-rol-add').addEventListener('click', () => {
  const label = $('#rol-nuevo').value.trim();
  if (!label) { $('#rol-nuevo').focus(); return; }
  rolesDraft.roles.push({ id: idDeRol(label, rolesDraft.roles.map((r) => r.id)), label, permisos: [], personas: 0 });
  $('#rol-nuevo').value = '';
  renderRoles();
  rolesResult(`Rol «${label}» añadido: marca sus permisos y pulsa «Guardar roles y permisos».`);
});
$('#btn-roles-save').addEventListener('click', async () => {
  const b = $('#btn-roles-save');
  b.disabled = true;
  try {
    const d = await api('/api/roles', { method: 'POST', body: { roles: rolesDraft.roles.map(({ id, label, permisos }) => ({ id, label, permisos })) } });
    rolesDraft.roles = d.roles;
    state.roles = d.roles.map(({ id, label }) => ({ id, label }));
    fillRolSelects();
    renderRoles();
    rolesResult('Roles y permisos guardados ✓ Cada persona verá los cambios al recargar el dashboard.');
  } catch (e) {
    rolesResult(e.message, true);
  } finally {
    b.disabled = false;
  }
});
$('.tab[data-tab="roles"]').addEventListener('click', () => { rolesResult(''); loadRoles(); });

// ---------- Embudo VSL ----------
// Siempre abierta: los leads se cargan una vez y se analizan por el periodo elegido.
const VR_KEY = 'lsd_vsl_rango';
state.vsl.sel = (() => { try { return { preset: '30d', ...JSON.parse(ls.get(VR_KEY) || '{}') }; } catch { return { preset: '30d' }; } })();
const vslRango = () => rangoDe(state.vsl.sel, today());
const fechaLarga = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (ym) => `${MESES[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
const ORD = ['', '1ª', '2ª', '3ª', '4ª', '5ª'];

function pintarRango() {
  const sel = state.vsl.sel;
  const r = vslRango();
  $('#vr-preset').value = sel.preset;
  const esMes = sel.preset === 'mes';
  const esCustom = sel.preset === 'personalizado';
  $('#vr-mes-f').hidden = !esMes;
  $('#vr-semanas').hidden = !(esMes || sel.preset === 'mes-actual' || sel.preset === 'mes-pasado');
  $('#vr-desde-f').hidden = !esCustom;
  $('#vr-hasta-f').hidden = !esCustom;
  const ym = sel.preset === 'mes-actual' ? today().slice(0, 7) : sel.preset === 'mes-pasado' ? addDay(`${today().slice(0, 7)}-01`, -1).slice(0, 7) : (sel.mes || today().slice(0, 7));
  $('#vr-mes').value = ym;
  if (!$('#vr-semanas').hidden) {
    $('#vr-semanas').innerHTML = `<button type="button" class="seg-btn ${!sel.semana ? 'on' : ''}" data-sem="0">Mes completo</button>${semanasDelMes(ym).map((w) => `<button type="button" class="seg-btn ${Number(sel.semana) === w.n ? 'on' : ''}" data-sem="${w.n}" title="Del ${Number(w.desde.slice(8))} al ${Number(w.hasta.slice(8))}">${ORD[w.n]} semana</button>`).join('')}`;
  }
  $('#vr-desde').value = esCustom ? sel.desde || r.desde : r.desde;
  $('#vr-hasta').value = esCustom ? sel.hasta || r.hasta : r.hasta;
  $('#vr-texto').textContent = `${fechaLarga(r.desde)} – ${fechaLarga(r.hasta)}`;
}

function cambiarRango(cambios) {
  state.vsl.sel = { ...state.vsl.sel, ...cambios };
  ls.set(VR_KEY, JSON.stringify(state.vsl.sel));
  loadVslMeta();
  renderVsl();
}
$('#vr-preset').addEventListener('change', (e) => {
  const preset = e.target.value;
  const extra = preset === 'mes' ? { mes: state.vsl.sel.mes || today().slice(0, 7) } : preset === 'personalizado' ? { desde: vslRango().desde, hasta: vslRango().hasta } : {};
  cambiarRango({ preset, semana: 0, ...extra });
});
$('#vr-mes').addEventListener('change', (e) => { if (e.target.value) cambiarRango({ preset: 'mes', mes: e.target.value, semana: 0 }); });
$('#vr-semanas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sem]');
  if (!b) return;
  const sel = state.vsl.sel;
  const mes = sel.preset === 'mes' ? sel.mes : $('#vr-mes').value;
  cambiarRango({ preset: 'mes', mes, semana: Number(b.dataset.sem) });
});
for (const id of ['#vr-desde', '#vr-hasta']) {
  $(id).addEventListener('change', () => { if ($('#vr-desde').value && $('#vr-hasta').value) cambiarRango({ preset: 'personalizado', desde: $('#vr-desde').value, hasta: $('#vr-hasta').value }); });
}

// Carga: leads de la etiqueta de registro (paginado), tareas, llamadas e inversión de Meta.
async function recargarVsl() {
  loadTareas();
  if (tiene('llamadas')) loadLlamadas();
  pintarRango();
  if (tieneDatos()) await loadVslLeads();
  else renderVsl();
}

async function loadVslLeads() {
  const v = vslCfg();
  const token = ++state.vsl.loadToken;
  const out = [];
  let cursor = null;
  let total = null;
  $('#btn-reload').disabled = true;
  state.vsl.leads = null;
  renderVsl();
  try {
    if (!v.registroTag) throw new Error('Falta la etiqueta de registro de la VSL (Configuración de la VSL → Embudo).');
    do {
      const qs = new URLSearchParams({ tag: v.registroTag });
      if (cursor) qs.set('cursor', JSON.stringify(cursor));
      const page = await api(`/api/leads?${qs}`);
      if (token !== state.vsl.loadToken) return;
      out.push(...page.contacts);
      total = page.total ?? total;
      cursor = page.cursor;
      progress(out.length, total, `Cargando leads de la VSL… ${out.length}${total ? ` de ${total}` : ''}`);
    } while (cursor);
    state.vsl.raw = out;
    enriquecerVsl();
    loadVslMeta();
    if (!out.length) notice(`No hay contactos con la etiqueta "${v.registroTag}".`);
  } catch (e) {
    state.vsl.raw = [];
    enriquecerVsl();
    notice(`No se pudieron cargar los leads de la VSL: ${e.message}`, true);
  } finally {
    if (token === state.vsl.loadToken) {
      progress(null);
      $('#btn-reload').disabled = false;
      renderVsl();
    }
  }
}

// Citas del calendario de la VSL por contacto (para saber quién ha agendado llamada).
function citasVsl() {
  const d = state.llamadas?.code === state.vsl.code ? state.llamadas.data : null;
  const m = new Map();
  for (const c of d?.configurado ? d.llamadas : []) {
    if (!c.contactId) continue;
    m.set(c.contactId, [...(m.get(c.contactId) || []), { start: llStart(c), resultado: c.resultado, cancelada: llCancelada(c) }]);
  }
  return m;
}
function enriquecerVsl() {
  if (!state.vsl.raw) return;
  const citas = citasVsl();
  state.vsl.leads = state.vsl.raw.map((c) => enrichVsl(c, vslCfg(state.vsl.code), { pais: state.config.defaultCountryCode, citas, code: state.vsl.code }));
}

let vslMetaToken = 0;
async function loadVslMeta() {
  const r = vslRango();
  const token = ++vslMetaToken;
  try {
    const m = await api(`/api/meta?launch=${encodeURIComponent(state.vsl.code)}&since=${r.desde}&until=${r.hasta}`);
    if (token !== vslMetaToken) return;
    state.vsl.meta = m.configured ? m : null;
  } catch (e) {
    if (token !== vslMetaToken) return;
    state.vsl.meta = { configured: true, error: e.message };
  }
  renderVsl();
}

function renderVsl() {
  if (!$('#view-rendimiento').hidden && state.vsl.leads) loadRendimiento();
  if (!enVsl() || !state.config) return;
  actualizarAuditor();
  pintarRango();
  if (!$('#view-vmetricas').hidden) renderVslMetricas();
  if (!$('#view-vleads').hidden) renderVslLeads();
  if (!$('#view-vanuncios').hidden) renderVslAnuncios();
}
const vslCargando = (box) => { box.innerHTML = '<p class="muted">Cargando los leads de la VSL…</p>'; };

// ----- Métricas -----
function renderVslMetricas() {
  if (!state.vsl.leads) { vslCargando($('#vm-kpis')); return; }
  const v = vslCfg();
  const r = vslRango();
  const L = state.vsl.leads;
  const inversion = state.vsl.meta && !state.vsl.meta.error && Number.isFinite(Number(state.vsl.meta.total)) ? Number(state.vsl.meta.total) : null;
  const m = computeVsl(L, r, v, { inversion });
  const tv = textosVsl(v);
  const kpi = (tono, ico, label, valor, sub = '') => `<div class="kpi static tone-${tono}"><span class="kpi-label"><span class="kpi-ico">${icon(ico)}</span>${label}</span><span class="kpi-value">${valor}</span><span class="kpi-sub">${sub}</span></div>`;
  const metaNota = state.vsl.meta?.error ? `Meta: ${esc(state.vsl.meta.error)}` : state.vsl.meta ? `${v.metaFiltro ? `campañas con «${esc(v.metaFiltro)}»` : 'todas las campañas (pon un filtro en la configuración)'}` : 'Meta no conectado';
  $('#vm-kpis').innerHTML = [
    kpi('accent', 'users', tv.registro, m.registros, `${m.publi} publicidad · ${m.organico} orgánico`),
    kpi('info', 'play', tv.vio, m.vio, `${pctOf(m.vio, m.registros)} · ${m.vio50} vieron ≥50%`),
    kpi('live', 'phone', 'Agendaron llamada', m.llamada, pctOf(m.llamada, m.registros)),
    kpi('buy', 'cart', 'Ventas', m.ventas, `${m.ventasDirectas} directas · ${m.ventasLlamada} tras llamada`),
    kpi('buy', 'euro', 'Facturación', eur(m.ingresos), m.planes ? `MRR ${eur(m.planes.mrr)} · ${m.planes.filas.filter((f) => f.n).map((f) => `${f.n} ${esc(f.label.toLowerCase())}`).join(' · ') || 'sin altas'}` : v.precioPrograma ? `a ${eur(Number(v.precioPrograma))} la venta` : 'Pon el precio en la configuración'),
    kpi('vip', 'coins', 'Inversión Meta', inversion != null ? eur(inversion) : '–', metaNota),
    kpi('accent', 'target', v.subtipo === 'leadmagnet' ? 'Coste por descarga' : v.subtipo === 'llamadas' ? 'Coste por aplicación' : 'Coste por lead', eur(m.cpl), `Coste por venta ${eur(m.cpa)}`),
    kpi('info', 'trend', 'ROAS', m.roas != null ? `${m.roas.toFixed(2)}x` : '–', `Conversión ${pctOf(m.compraCohorte, m.registros)} (registro → venta)`),
  ].join('');

  mostrarEmails(state.embudo, { kpis: '#em-kpis-v', tabla: '#em-v' });
  mostrarCiclo(state.embudo, { kpi: '#ciclo-kpi-v', detalle: '#ciclo-v', propias: L.filter((l) => l.s.compra), dateField: v.compraDateField, nombre: 'esta VSL' });
  $('#vm-planes-sec').hidden = !m.planes;
  if (m.planes) $('#vm-planes').innerHTML = tablaPlanes(m.planes);

  const pasos = [
    [v.subtipo === 'leadmagnet' ? 'Descargaron' : v.subtipo === 'llamadas' ? 'Aplicaron' : 'Se registraron', m.registros], [`Entraron ${conPrep('a', tv.contenido)}`, m.vio], ['Vieron ≥25%', m.vio25], ['Vieron ≥50%', m.vio50],
    ['Vieron ≥90%', m.vio90], ['Agendaron llamada', m.llamada], ['Compraron', m.compraCohorte],
  ];
  $('#vm-embudo').innerHTML = pasos.map(([label, n], i) => `<div class="vm-paso">
      <span class="vm-paso-lbl">${label}</span>
      <div class="vm-paso-bar"><span style="width:${m.registros ? Math.max(1.5, (n / m.registros) * 100) : 0}%"></span></div>
      <span class="vm-paso-n"><strong>${n}</strong> <span class="muted">${i ? pctOf(n, m.registros) : ''}</span></span></div>`).join('')
    + `<p class="muted vm-nota">Las ventas del embudo son de quienes se registraron en el periodo. Las ventas de las tarjetas de arriba son las compradas en el periodo (aunque se registraran antes)${v.compraDateField ? '' : '; sin campo de «fecha de compra» se usa la fecha de registro'}.</p>`;

  const sem = porSemanas(L, r, v);
  const fila = (lbl, x, extra = '') => `<tr class="${extra}"><td>${lbl}</td><td class="num">${x.registros}</td><td class="num">${x.vio} <span class="muted">${pctOf(x.vio, x.registros)}</span></td><td class="num">${x.vio50}</td><td class="num">${x.llamada}</td><td class="num">${x.ventas}</td><td class="num big">${pctOf(x.compraCohorte, x.registros)}</td><td class="num">${eur(x.ingresos)}</td></tr>`;
  $('#vm-semanas').innerHTML = `<thead><tr><th>Semana</th><th class="num">${tv.registro}</th><th class="num">${tv.vio}</th><th class="num">≥50%</th><th class="num">Llamadas</th><th class="num">Ventas</th><th class="num">Conversión</th><th class="num">Facturado</th></tr></thead>
    <tbody>${sem.map((w) => fila(`<strong>${ORD[w.n]} semana</strong> <span class="muted">${nombreMes(w.ym)} · ${Number(w.desde.slice(8))}–${Number(w.hasta.slice(8))}</span>`, w.m)).join('')}
    ${sem.length > 1 ? fila('<strong>Total del periodo</strong>', m, 'vm-total') : ''}</tbody>`;

  const dias = porDias(L, r);
  const max = Math.max(1, ...dias.map((d) => d.registros));
  $('#vm-dias').innerHTML = `<div class="vm-chart" style="--n:${dias.length}">${dias.map((d) => `<div class="vm-col" title="${fechaLarga(d.d)}: ${d.registros} registros, ${d.ventas} ventas">
      <span class="vm-reg" style="height:${(d.registros / max) * 100}%"></span>${d.ventas ? `<span class="vm-venta">${d.ventas}</span>` : ''}</div>`).join('')}</div>
    <div class="vm-eje"><span>${fechaLarga(r.desde)}</span><span class="vm-leyenda"><span class="sw vm-sw-reg"></span> Registros <span class="sw vm-sw-venta"></span> Ventas</span><span>${fechaLarga(r.hasta)}</span></div>`;

  // Llamadas con cita en el periodo
  const box = $('#vm-llamadas');
  const d = state.llamadas?.code === codigo() ? state.llamadas.data : null;
  if (!tiene('llamadas')) box.innerHTML = '<p class="muted">Tu rol no tiene acceso a las llamadas.</p>';
  else if (state.llamadas?.code === codigo() && state.llamadas.error) box.innerHTML = `<p class="error">${esc(state.llamadas.error)}</p>`;
  else if (!d) box.innerHTML = '<p class="muted">Cargando llamadas…</p>';
  else if (!d.configurado) box.innerHTML = `<p class="muted">${esc(d.motivo || 'Configura el calendario de la VSL.')}</p>`;
  else {
    const enR = d.llamadas.filter((c) => { const day = dayInMadrid(c.startTime); return day >= r.desde && day <= r.hasta; });
    const ml = metricasLlamadas(enR.map((c) => ({ start: llStart(c), resultado: c.resultado, cancelada: llCancelada(c) })));
    const p = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
    box.innerHTML = `<div class="kpis ll-kpis">
      ${kpi('info', 'calendar', 'Reservadas', ml.reservadas, `${ml.proximas} próximas`)}
      ${kpi('buy', 'check', 'Shows', ml.shows, `${p(ml.pctShow)} de las que tocaban`)}
      ${kpi('accent', 'alert', 'No shows', ml.noshow, p(ml.pctNoshow))}
      ${kpi('vip', 'refresh', 'Canceladas', ml.canceladas, p(ml.pctCancel))}
      ${kpi('buy', 'cart', 'Ventas en llamada', ml.ventas, `${p(ml.conversion)} sobre shows`)}
    </div>${ml.sinResultado ? `<p class="muted">${ml.sinResultado} llamada${ml.sinResultado === 1 ? '' : 's'} pasada${ml.sinResultado === 1 ? '' : 's'} sin resultado anotado (pestaña Llamadas).</p>` : ''}`;
  }

  const reg = L.filter((l) => l.fReg >= r.desde && l.fReg <= r.hasta);
  const og = (o) => { const x = reg.filter((l) => l.s.origen === o); return { n: x.length, vio: x.filter((l) => l.s.vio).length, ll: x.filter((l) => l.s.llamada).length, c: x.filter((l) => l.s.compra).length }; };
  const filaO = (lbl, x) => `<tr><td>${lbl}</td><td class="num">${x.n} <span class="muted">${pctOf(x.n, reg.length)}</span></td><td class="num">${x.vio} <span class="muted">${pctOf(x.vio, x.n)}</span></td><td class="num">${x.ll}</td><td class="num">${x.c}</td><td class="num big">${pctOf(x.c, x.n)}</td></tr>`;
  $('#vm-origen').innerHTML = `<thead><tr><th>Origen</th><th class="num">${textosVsl(vslCfg()).registro}</th><th class="num">${textosVsl(vslCfg()).vio}</th><th class="num">Llamadas</th><th class="num">Compras</th><th class="num">Conversión</th></tr></thead>
    <tbody>${filaO('📣 Publicidad', og('publi'))}${filaO('🌱 Orgánico', og('organico'))}</tbody>`;
}

// ----- Leads -----
function vslFiltrados() {
  const r = vslRango();
  const q = $('#vl-buscar').value.trim().toLowerCase();
  const est = $('#vl-estado').value;
  const ori = $('#vl-origen').value;
  const todos = $('#vl-todos').checked;
  return state.vsl.leads
    .filter((l) => (todos || (l.fReg >= r.desde && l.fReg <= r.hasta)) && (!est || l.estado === est) && (!ori || l.s.origen === ori) && (!q || l.search.includes(q)))
    .sort((a, b) => String(b.fReg).localeCompare(String(a.fReg)) || String(b.dateAdded).localeCompare(String(a.dateAdded)));
}

function waVsl(l) {
  const e = ESTADOS_VSL.find((x) => x.id === l.estado);
  if (!e?.plantilla || !l.phoneWa) return '';
  const msg = buildMessage(state.config.templates[e.plantilla], { nombre: l.firstName, contactId: l.id, launch: vslCfg(), producto: nombreProducto(state.config) });
  return `https://wa.me/${l.phoneWa}?text=${encodeURIComponent(msg)}`;
}

function renderVslLeads() {
  const tabla = $('#vl-table');
  if (!state.vsl.leads) { tabla.innerHTML = '<tbody><tr><td class="muted">Cargando los leads de la VSL…</td></tr></tbody>'; return; }
  const r = vslRango();
  const enPeriodo = state.vsl.leads.filter((l) => $('#vl-todos').checked || (l.fReg >= r.desde && l.fReg <= r.hasta));
  const counts = {};
  for (const l of enPeriodo) counts[l.estado] = (counts[l.estado] || 0) + 1;
  const sel = $('#vl-estado');
  const v = sel.value;
  sel.innerHTML = `<option value="">Todos los estados (${enPeriodo.length})</option>${ESTADOS_VSL.map((e) => `<option value="${e.id}">${e.icon} ${esc(e.label)} (${counts[e.id] || 0})</option>`).join('')}`;
  sel.value = v;
  $('#vl-resumen').innerHTML = ESTADOS_VSL.map((e) => `<button type="button" class="vl-chip ${v === e.id ? 'on' : ''}" data-vest="${e.id}"><span>${e.icon}</span> ${esc(e.label)} <strong>${counts[e.id] || 0}</strong></button>`).join('');
  const rows = vslFiltrados();
  $('#vl-count').textContent = `${rows.length} lead${rows.length === 1 ? '' : 's'}`;
  const vis = rows.slice(0, state.vsl.mostrar);
  const fmtF = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '–');
  const ahora = Date.now();
  const cita = (l) => {
    const prox = l.citas.filter((c) => !c.cancelada && c.start >= ahora).sort((a, b) => a.start - b.start)[0];
    if (prox) return `<span class="vl-cita">📅 ${esc(new Date(prox.start).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span>`;
    const ult = [...l.citas].sort((a, b) => b.start - a.start)[0];
    if (ult) { const res = RESULTADOS.find((x) => x.id === ult.resultado?.resultado); return res ? `${res.icon} ${esc(res.label)}` : ult.cancelada ? '❌ Cancelada' : '⚠️ Sin anotar'; }
    return l.s.llamada ? '📞 Agendó' : '<span class="muted">–</span>';
  };
  tabla.innerHTML = `<thead><tr><th>Lead</th><th>Registro</th><th>Vídeo</th><th>Llamada</th><th>Compra</th><th>WhatsApp</th></tr></thead>
    <tbody>${vis.map((l) => {
    const wa = waVsl(l);
    const e = ESTADOS_VSL.find((x) => x.id === l.estado);
    return `<tr>
      <td><strong>${esc(l.name || l.email)}</strong><br><span class="muted">${esc(l.email)}${l.phone ? ` · ${esc(l.phone)}` : ''}</span>
        <br><span class="vl-origen ${l.s.origen}">${l.s.origen === 'publi' ? '📣 Publicidad' : '🌱 Orgánico'}</span></td>
      <td>${fmtF(l.fReg)}</td>
      <td><div class="vl-video" title="${l.s.pct ? `Ha visto al menos el ${l.s.pct}%` : l.s.vio ? 'Entró a la página de la VSL' : 'No ha visto el vídeo'}"><span style="width:${l.s.pct || (l.s.vio ? 6 : 0)}%"></span></div><small class="muted">${l.s.pct ? `≥${l.s.pct}%` : l.s.vio ? 'Entró' : 'No'}</small></td>
      <td>${cita(l)}</td>
      <td>${l.s.compra ? `🎉 ${fmtF(l.fCompra)}` : '<span class="muted">–</span>'}</td>
      <td>${wa ? `<a class="btn wa" href="${esc(wa)}" target="_blank" rel="noopener" title="${esc(e.label)}">Enviar WhatsApp</a><br><small class="muted">${esc(e.icon)} ${esc(e.label)}</small>` : l.estado === 'llamada' ? '<small class="muted">Ver en Llamadas</small>' : !l.phoneWa && e?.plantilla ? '<small class="muted">Sin móvil</small>' : '<span class="muted">–</span>'}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="muted">No hay leads con estos filtros.</td></tr>'}</tbody>`;
  $('#vl-mas').hidden = rows.length <= vis.length;
  $('#vl-mas').textContent = `Ver más (${rows.length - vis.length})`;
}
for (const id of ['#vl-buscar', '#vl-estado', '#vl-origen', '#vl-todos']) {
  $(id).addEventListener(id === '#vl-buscar' ? 'input' : 'change', () => { state.vsl.mostrar = 100; renderVslLeads(); });
}
$('#vl-mas').addEventListener('click', () => { state.vsl.mostrar += 200; renderVslLeads(); });
$('#vl-resumen').addEventListener('click', (e) => {
  const b = e.target.closest('[data-vest]');
  if (!b) return;
  $('#vl-estado').value = $('#vl-estado').value === b.dataset.vest ? '' : b.dataset.vest;
  state.vsl.mostrar = 100;
  renderVslLeads();
});

// Mensajes de WhatsApp de la VSL (mismo permiso que los de Setting hoy).
const vplBox = $('#vsl-plantillas');
let vplSucio = false;
function pintarPlantillasVsl() {
  const edita = tiene('mensajes');
  $$('#vsl-plantillas textarea').forEach((t) => { t.readOnly = !edita; t.value = state.config?.templates?.[t.dataset.vtpl] || ''; });
  $('#vsl-pl-save').hidden = !edita;
  $('#vsl-pl-sub').textContent = `Los textos de los botones de WhatsApp de esta lista. Pulsa para ${edita ? 'verlos o cambiarlos' : 'verlos (tu rol no puede cambiarlos)'}.`;
  vplSucio = false;
}
vplBox.addEventListener('toggle', () => { if (vplBox.open && !vplSucio) pintarPlantillasVsl(); });
vplBox.addEventListener('input', () => { vplSucio = true; $('#vsl-pl-status').textContent = 'Cambios sin guardar.'; });
$('#vsl-pl-guardar').addEventListener('click', async () => {
  const b = $('#vsl-pl-guardar');
  b.disabled = true;
  $('#vsl-pl-status').textContent = 'Guardando…';
  try {
    const templates = Object.fromEntries($$('#vsl-plantillas textarea').map((t) => [t.dataset.vtpl, t.value]));
    const d = await api('/api/config', { method: 'POST', body: { op: 'plantillas', templates } });
    state.config = { ...state.config, templates: d.templates };
    pintarPlantillasVsl();
    renderVslLeads();
    $('#vsl-pl-status').textContent = 'Mensajes guardados ✓';
  } catch (e) {
    $('#vsl-pl-status').textContent = e.message;
  } finally {
    b.disabled = false;
  }
});

// ----- Anuncios ganadores -----
function renderVslAnuncios() {
  if (!state.vsl.leads) { vslCargando($('#vganadores')); return; }
  const r = vslRango();
  const reg = state.vsl.leads.filter((l) => l.fReg >= r.desde && l.fReg <= r.hasta);
  $$('#vgan-level .seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.gl === state.vsl.ganLevel));
  pintarGanadores($('#vganadores'), reg, vslCfg(), state.vsl.ganLevel, state.vsl.meta, { vip: false, donde: 'en este periodo' });
  const level = $('#vsrc-level').value;
  const names = state.vsl.meta?.names || {};
  const spendBy = state.vsl.meta?.spendBy || {};
  const groups = bySource(reg.map((l) => ({ ...l, s: { ...l.s, trafico: '' } })), level, names);
  const hasSpend = Object.keys(spendBy).length > 0;
  $('#vsrc-table').innerHTML = `
    <thead><tr><th>${{ source: 'Canal (utm_source)', campaign: 'Campaña', adset: 'Conjunto de anuncios', ad: 'Anuncio' }[level]}</th><th class="num">Registros</th><th class="num">Ventas</th><th class="num">Conversión</th>${hasSpend ? '<th class="num">Inversión</th><th class="num">CPL</th><th class="num">Coste/venta</th>' : ''}</tr></thead>
    <tbody>${groups.map((g) => {
    const spend = spendBy[g.key];
    return `<tr><td>${esc(g.label)}</td><td class="num">${g.leads}</td><td class="num">${g.compras}</td><td class="num big">${pctOf(g.compras, g.leads)}</td>${hasSpend ? `<td class="num">${spend ? eur(spend) : '–'}</td><td class="num">${spend ? eur(spend / g.leads) : '–'}</td><td class="num">${spend && g.compras ? eur(spend / g.compras) : '–'}</td>` : ''}</tr>`;
  }).join('') || '<tr><td colspan="7" class="muted">Sin registros en el periodo.</td></tr>'}</tbody>`;
}
$('#vgan-level').addEventListener('click', (e) => {
  const b = e.target.closest('[data-gl]');
  if (!b) return;
  state.vsl.ganLevel = b.dataset.gl;
  renderVslAnuncios();
});
$('#vsrc-level').addEventListener('change', renderVslAnuncios);

// ----- Configuración de la VSL -----
const vcDlg = $('#vsl-config-dialog');
const VC_TEXTOS = ['name', 'registroTag', 'vioTag', 'compraTag', 'llamadaTag', 'fraccionadoTag', 'unicoTag', 'publiTag', 'organicoTag',
  'vslUrl', 'raicesUrl', 'ventaUrl', 'ventaFraccionadoUrl', 'llamadaUrl', 'llamadasPipeline', 'precioPrograma', 'precioFraccionado', 'metaFiltro', 'emailFiltro',
  'vslVideoUrl', 'textoCompra', 'textoLlamada', 'graciasVideoUrl', 'agendaVideoUrl'];
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const aSegundos = (t) => {
  const m = /^\s*(\d{1,3})(?::(\d{1,2}))?\s*$/.exec(String(t || ''));
  return m ? Number(m[1]) * 60 + Number(m[2] || 0) : 0; // «12» = minuto 12; «12:30» = 12 min 30 s
};

async function openVslConfig(id = state.embudo) {
  vcId = id;
  const v = vslCfg(id);
  const tv = textosVsl(v);
  $('#vsl-config-dialog h2').textContent = `${tv.ico} Configuración · ${v.name}`;
  // Rótulos según la variante (VSL, lead magnet, webinar evergreen, embudo de llamadas).
  const rot = (sel, txt) => { const el = $(sel)?.previousElementSibling; if (el) { el.dataset.def ??= el.textContent; el.textContent = v.subtipo && v.subtipo !== 'vsl' ? txt : el.dataset.def; } };
  rot('#vc-registroTag', v.subtipo === 'leadmagnet' ? 'Descarga del lead magnet' : v.subtipo === 'llamadas' ? 'Aplicación enviada' : `Registro ${conPrep('de', tv.contenido)}`);
  rot('#vc-vioTag', `Ha abierto / visto ${tv.contenido}`);
  rot('#vc-compraTag', 'Compra desde este embudo');
  rot('#vc-vslUrl', tv.pagina);
  rot('#vc-vslVideoUrl', tv.video);
  for (const k of VC_TEXTOS) $(`#vc-${k}`).value = v[k] ?? '';
  for (const k of ['precioPrograma', 'precioFraccionado']) $(`#vc-${k}`).value = v[k] ? String(v[k]).replace('.', ',') : '';
  $('#vc-boton').value = v.botonSegundos ? mmss(v.botonSegundos) : '0';
  $('#vc-informeSemanal').checked = Boolean(v.informeSemanal);
  pintarPago('vc', v.pago);
  $('#vc-status').textContent = '';
  renderAccesosEditor(v.accesos, { box: '#vc-accesos', sugeridos: ACCESOS_SUGERIDOS_VSL });
  renderVslSnippets();
  $('.tab[data-tab="vembudo"]').click();
  vcDlg.showModal();
  // Campos de fecha y pipelines de GHL (para elegir sin escribir IDs).
  const pintarFechas = (fields) => {
    for (const k of ['registroDateField', 'compraDateField']) {
      $(`#vc-${k}`).innerHTML = `<option value="">— Fecha de alta del contacto —</option>${(fields || []).map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}`;
      if (v[k] && !(fields || []).some((f) => f.id === v[k])) $(`#vc-${k}`).insertAdjacentHTML('beforeend', `<option value="${esc(v[k])}">${esc(v[k])}</option>`);
      $(`#vc-${k}`).value = v[k] || '';
    }
  };
  pintarFechas(state.dateFields);
  if (!state.dateFields) { try { state.dateFields = (await api('/api/fields')).fields; pintarFechas(state.dateFields); } catch { /* se queda lo guardado */ } }
  const pipes = state.llamadas?.data?.pipeline ? [state.llamadas.data.pipeline.name] : [];
  $('#vc-pipelines').innerHTML = [...new Set(['Leads evergreen', 'Leads Lanzamientos', ...pipes])].map((p) => `<option value="${esc(p)}">`).join('');
}

function renderVslSnippets() {
  const qs = [`v=${encodeURIComponent(vcId || state.embudo)}`, cParam('').replace(/^\?/, '')].filter(Boolean).join('&');
  const script = `<script src="${location.origin}/vsl.js?${qs}" defer></script>`;
  const items = [
    ['PÁGINA DE LA VSL · vídeo medido + botones de compra y llamada', `<div data-lsd-vsl></div>\n${script}`],
    ['PÁGINA DE GRACIAS DEL REGISTRO · vídeo (se oculta si no hay)', `<div data-lsd-vsl-embed="gracias"></div>\n${script}`],
    ['PÁGINA DE GRACIAS DE LA LLAMADA · vídeo (se oculta si no hay)', `<div data-lsd-vsl-embed="agenda"></div>\n${script}`],
    ['Al final de la URL a la que redirige el formulario de registro (identifica a la lead para medir el vídeo)', '?cid={{contact.id}}'],
    ['Enlace a la VSL en emails y WhatsApp de GHL', `${vslCfg(vcId || state.embudo).vslUrl || 'https://tu-pagina-de-la-vsl'}?cid={{contact.id}}`],
  ];
  $('#vc-snippets').innerHTML = items.map(([title, text], i) => `
    <div class="snippet">
      <h3>${esc(title)}</h3>
      <pre id="vsnip-${i}">${esc(text)}</pre>
      <button type="button" class="btn" data-copy="vsnip-${i}">Copiar</button>
    </div>`).join('')
    + `<p class="muted">El vídeo se mide con los segundos realmente vistos: al llegar al 25%, 50%, 75% y 90% la lead recibe las etiquetas <code>${esc(vcId || state.embudo)}_vsl_25</code>, <code>${esc(vcId || state.embudo)}_vsl_50</code>… (se ven en Métricas y en Leads).</p>`;
}
$('#vc-snippets').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  await navigator.clipboard.writeText($(`#${b.dataset.copy}`).textContent);
  b.textContent = 'Copiado ✓';
  setTimeout(() => { b.textContent = 'Copiar'; }, 1500);
});

// Embudo que se está configurando en la ventana de la VSL.
let vcId = null;
$('#vc-save').addEventListener('click', async () => {
  const status = $('#vc-status');
  const reg = $('#vc-registroTag').value.trim();
  if (!reg) { $('.tab[data-tab="vembudo"]').click(); $('#vc-registroTag').focus(); status.textContent = 'Falta la etiqueta de registro.'; return; }
  const id = vcId;
  const previa = state.config.vsls[id] || {};
  const vsl = { ...previa };
  for (const k of VC_TEXTOS) vsl[k] = $(`#vc-${k}`).value.trim();
  for (const k of ['precioPrograma', 'precioFraccionado']) vsl[k] = vsl[k].replace(/\./g, '').replace(',', '.');
  for (const k of ['registroDateField', 'compraDateField']) vsl[k] = $(`#vc-${k}`).value;
  vsl.botonSegundos = aSegundos($('#vc-boton').value);
  vsl.informeSemanal = $('#vc-informeSemanal').checked;
  if (errorPago('vc')) { status.textContent = errorPago('vc'); return; }
  vsl.pago = leerPago('vc');
  vsl.accesos = readAccesosEditor();
  const b = $('#vc-save');
  b.disabled = true;
  status.textContent = 'Guardando…';
  try {
    const clave = (v) => JSON.stringify([v.registroTag, v.vioTag, v.compraTag, v.registroDateField, v.compraDateField, v.llamadaUrl, v.llamadasPipeline]);
    const antes = clave(previa);
    const embudosN = embudos().map((e) => (e.id === id ? { ...e, nombre: vsl.name || e.nombre } : e));
    const { config } = await api('/api/config', { method: 'POST', body: { ...state.config, vsls: { ...state.config.vsls, [id]: vsl }, embudos: embudosN } });
    state.config = config;
    status.textContent = 'Guardado ✓';
    renderVslSnippets();
    pintarSidebar();
    if (state.embudo === id) { if (antes !== clave(config.vsls[id])) recargarVsl(); else { enriquecerVsl(); loadVslMeta(); } }
  } catch (e) {
    status.textContent = '';
    window.alert(e.message);
  } finally {
    b.disabled = false;
  }
});

$('#vc-borrar').addEventListener('click', async () => {
  try { if (await eliminarEmbudo(vcId)) $('#vsl-config-dialog').close(); } catch (e) { window.alert(e.message); }
});

// ---------- Embudos: crear («＋») y editar (⚙️) ----------
const embDlg = $('#embudo-dialog');
let embEdit = null; // id del embudo que se edita (null = nuevo)
// Opción elegida: webinar | v2 | v3 | plf | reto (embudo de lanzamientos con ese formato) o un
// embudo siempre abierto: vsl | leadmagnet | evergreen | llamadas (motor de la VSL con su variante).
const embOpcion = () => $('input[name="emb-tipo"]:checked').value;
const embTipo = () => (embEdit ? embudoInfo(embEdit).tipo : embOpcion() === 'meteorico' ? 'meteorico' : SUBTIPO_IDS.includes(embOpcion()) ? 'vsl' : 'lanzamientos');
const embFormato = () => (embEdit ? $('#emb-formato').value : embTipo() !== 'lanzamientos' ? undefined : embOpcion() === 'reto' ? $('#emb-reto-dias').value : embOpcion());
const embSubtipo = () => (embTipo() !== 'vsl' ? undefined : embEdit ? $('#emb-subtipo').value : embOpcion());
const embPestanas = () => $$('#emb-pestanas input:checked').map((i) => i.value);
// Clases del prelanzamiento y entrada VIP: solo en los embudos de lanzamientos (sin plantilla elegida).
function pintarEmbPrelanz() {
  $('#emb-prelanz').hidden = embTipo() !== 'lanzamientos' || Boolean(!embEdit && $('#emb-plantilla').value);
  pintarEmbClases();
}
const embPrelanz = () => (embTipo() === 'lanzamientos' ? {
  preclase: $('#emb-preclase').value === 'si', clases: Number($('#emb-clases').value), vip: $('#emb-vip').value === 'si',
  recursos: $('#emb-preclase').value === 'si' ? $$('input[name="emb-recurso"]:checked').map((i) => i.value) : [],
  vipContadorBase: Math.max(0, Math.floor(Number($('#emb-vip-base').value.replace(/\./g, '')) || 0)),
} : {});
const pintarEmbVipBase = () => { $('#emb-vip-base-box').hidden = embTipo() !== 'lanzamientos' || $('#emb-vip').value !== 'si'; };
$('#emb-vip').addEventListener('change', pintarEmbVipBase);
// Sin área preclase no hay clases: se oculta el número de clases.
const pintarEmbClases = () => { $('#emb-clases-box').hidden = $('#emb-preclase').value === 'no'; $('#emb-recursos-box').hidden = $('#emb-preclase').value === 'no' || $('#emb-prelanz').hidden; };
$('#emb-preclase').addEventListener('change', () => { pintarEmbClases(); pintarEmbGuia(); });
function pintarEmbPestanas(activas) {
  pintarEmbPrelanz();
  const tipo = embTipo();
  $('#emb-reto-box').hidden = Boolean(embEdit) || embOpcion() !== 'reto';
  $('#emb-subtipo-box').hidden = !embEdit || tipo !== 'vsl';
  activas ??= pestanasSugeridas(tipo, embSubtipo());
  $('#emb-pestanas').innerHTML = PESTANAS[tipo].map((p) => `<label class="emb-pest"><input type="checkbox" value="${p.id}" ${!activas || activas.includes(p.id) ? 'checked' : ''}><span><strong>${esc(p.label)}</strong><small>${esc(p.desc)}</small></span></label>`).join('');
  pintarEmbGuia();
}
function pintarEmbGuia() {
  const pasos = guiaEmbudo(embTipo(), embPestanas(), embFormato(), embSubtipo(), { preclase: $('#emb-preclase').value !== 'no' });
  const rec = embTipo() === 'lanzamientos' && $('#emb-preclase').value !== 'no' ? $$('input[name="emb-recurso"]:checked').map((i) => i.value) : [];
  if (rec.length) {
    pasos.push({ titulo: `${pasos.length + 1} · Recursos de la preclase`, pasos: [
      ...(rec.includes('musica') ? ['<strong>Música:</strong> sube el MP3 a GHL → <em>Medios</em> y copia su enlace (va en Configuración → Preclase).'] : []),
      ...(rec.includes('test') ? ['<strong>Test:</strong> crea el test en GHL y un <strong>workflow</strong> que, al enviarlo, ponga una etiqueta (p. ej. <code>autodiagnostico-hecho</code>). Esa etiqueta y la fecha de desbloqueo van en Configuración → Preclase.'] : []),
      ...(rec.includes('votacion') ? ['<strong>Votación:</strong> la hace el dashboard, no hace falta nada en GHL; escribe la pregunta y las opciones en Configuración → Preclase.'] : []),
      ...(rec.includes('descargable') ? ['<strong>Descargable:</strong> sube el PDF a GHL → <em>Medios</em> (o a Drive) y copia su enlace.'] : []),
      'En la página preclase pega los bloques de <em>Configuración → Códigos</em> (música, test, votación y etapas).',
    ] });
  }
  $('#emb-guia').innerHTML = guiaPasosHtml(pasos);
}
$('#emb-recursos-box').addEventListener('change', pintarEmbGuia);
// Plantillas de agencia (superadmin): se cargan al abrir «＋ Nuevo embudo».
let plantillasAg = [];
async function cargarPlantillas() {
  if (!state.superadmin) return;
  try { plantillasAg = (await api('/api/plantillas')).plantillas; } catch { plantillasAg = []; }
  const sel = $('#emb-plantilla');
  sel.innerHTML = `<option value="">— Sin plantilla: elijo el tipo arriba —</option>${plantillasAg.map((p) => `<option value="${esc(p.id)}">${esc(p.nombre)} · ${p.tipo === 'vsl' ? esc(SUBTIPOS_VSL[subtipoValido(p.subtipo)].corto) : esc(FORMATOS[p.formato || 'webinar']?.label || 'Lanzamientos')} (de ${esc(p.origen)})</option>`).join('')}`;
  $('#emb-plantilla-box').hidden = !plantillasAg.length;
  pintarPlantillaElegida();
}
function pintarPlantillaElegida() {
  const p = plantillasAg.find((x) => x.id === $('#emb-plantilla').value);
  $('#emb-plantilla-opts').hidden = !p;
  $('.emb-tipos').classList.toggle('apagado', Boolean(p));
  $('#emb-plantilla-info').textContent = p ? `${p.desc ? `${p.desc} · ` : ''}${p.mensajes} mensajes de WhatsApp${p.habituales ? ` · ${p.habituales} tareas habituales` : ''}${p.pestanas ? ` · ${p.pestanas.length} pestañas` : ''}. Las etiquetas, enlaces y fechas de GHL los pones tú después (son de cada cliente).` : '';
  $('#emb-pl-habituales').checked = Boolean(p) && !Object.keys(state.config.launches).length;
  if (p && !$('#emb-nombre').value.trim()) $('#emb-nombre').placeholder = p.nombre;
}
$('#emb-plantilla').addEventListener('change', () => { pintarPlantillaElegida(); pintarEmbPrelanz(); });
$('#emb-pl-borrar').addEventListener('click', async () => {
  const p = plantillasAg.find((x) => x.id === $('#emb-plantilla').value);
  if (!p || !window.confirm(`¿Borrar la plantilla «${p.nombre}»? Los embudos ya creados con ella no cambian.`)) return;
  try { await api('/api/plantillas', { method: 'POST', body: { op: 'borrar', id: p.id } }); await cargarPlantillas(); } catch (e) { $('#emb-status').textContent = e.message; }
});
$('#emb-plantilla-guardar').addEventListener('click', async () => {
  const e = embudoInfo(embEdit);
  const nombre = window.prompt('Nombre de la plantilla (la verás al crear un embudo en cualquier cliente):', `${e.nombre} (${clienteNombre()})`);
  if (!nombre) return;
  const desc = window.prompt('Descripción corta (opcional), p. ej. «Webinar 2 clases + carrito 5 días»:', '') || '';
  try {
    await api('/api/plantillas', { method: 'POST', body: { op: 'guardar', embudo: embEdit, nombre, desc } });
    $('#emb-status').textContent = `Plantilla «${nombre}» guardada ✓ Ya puedes usarla en «＋ Nuevo embudo» de cualquier cliente.`;
  } catch (err) { $('#emb-status').textContent = err.message; }
});
const clienteNombre = () => state.clientes.find((c) => c.id === state.cliente)?.nombre || '';

function abrirNuevoEmbudo() {
  embEdit = null;
  $('#emb-plantilla').value = '';
  $('#emb-plantilla-guardar').hidden = true;
  cargarPlantillas();
  $('#emb-titulo').textContent = 'Nuevo embudo';
  $('.emb-tipos').hidden = false;
  $('input[name="emb-tipo"][value="webinar"]').checked = true;
  $('#emb-formato-box').hidden = true;
  $('#emb-preclase').value = 'si';
  $('#emb-clases').value = '2';
  $('#emb-vip').value = 'si';
  $('#emb-vip-base').value = esPrincipal() ? '41' : '0';
  $$('input[name="emb-recurso"]').forEach((i) => { i.checked = false; });
  pintarEmbClases();
  pintarEmbVipBase();
  $('#emb-nombre').value = '';
  $('#emb-status').textContent = '';
  $('#emb-nota').hidden = false;
  $('#emb-borrar').hidden = true;
  $('#emb-crear').textContent = 'Crear embudo';
  $('#emb-guia-box').open = true;
  pintarEmbPestanas(null);
  embDlg.showModal();
  $('#emb-nombre').focus();
}
function abrirEditarEmbudo(id) {
  const e = embudoInfo(id);
  if (!e) return;
  embEdit = id;
  $('#emb-titulo').textContent = `${e.tipo === 'vsl' ? textosVsl(state.config.vsls[id]).ico : '🚀'} ${e.nombre}`;
  $('#emb-subtipo').value = subtipoValido(state.config.vsls[id]?.subtipo);
  $('.emb-tipos').hidden = true;
  $('#emb-formato-box').hidden = e.tipo !== 'lanzamientos';
  $('#emb-formato').value = e.formato || 'webinar';
  $('#emb-preclase').value = e.preclase === false ? 'no' : 'si';
  $('#emb-clases').value = String(e.clases || 2);
  $('#emb-vip').value = e.vip === false ? 'no' : 'si';
  $$('input[name="emb-recurso"]').forEach((i) => { i.checked = (e.recursos || []).includes(i.value); });
  $('#emb-vip-base').value = String(e.vipContadorBase ?? (launchesSorted().find(([, x]) => embudoDeLanz(x) === id)?.[1].vipContadorBase ?? (esPrincipal() ? 41 : 0)));
  pintarEmbClases();
  pintarEmbVipBase();
  $('#emb-nombre').value = e.nombre;
  $('#emb-status').textContent = '';
  $('#emb-nota').hidden = true;
  $('#emb-borrar').hidden = false;
  $('#emb-plantilla-box').hidden = true;
  $('#emb-plantilla-guardar').hidden = !state.superadmin;
  $('#emb-crear').textContent = 'Guardar';
  $('#emb-guia-box').open = false;
  pintarEmbPestanas(e.pestanas || null);
  embDlg.showModal();
}
$('#sb-add').addEventListener('click', abrirNuevoEmbudo);
$('#sidebar').addEventListener('click', (e) => { const b = e.target.closest('[data-emb-edit]'); if (b) abrirEditarEmbudo(b.dataset.embEdit); });
document.addEventListener('click', (e) => { if (e.target.closest('[data-action="nuevo-embudo"]')) abrirNuevoEmbudo(); });
$$('input[name="emb-tipo"]').forEach((r) => r.addEventListener('change', () => { pintarEmbPestanas(null); pintarEmbVipBase(); }));
$('#emb-pestanas').addEventListener('change', pintarEmbGuia);
$('#emb-formato').addEventListener('change', pintarEmbGuia);
$('#emb-reto-dias').addEventListener('change', pintarEmbGuia);
$('#emb-subtipo').addEventListener('change', pintarEmbGuia);

$('#emb-crear').addEventListener('click', async () => {
  const pestanas = embPestanas();
  if (!pestanas.length) { $('#emb-status').textContent = 'Deja al menos una pestaña activada.'; return; }
  const todas = pestanas.length === PESTANAS[embTipo()].length;
  const b = $('#emb-crear');
  b.disabled = true;
  $('#emb-status').textContent = 'Guardando…';
  try {
    if (embEdit) {
      const id = embEdit;
      const nombre = $('#emb-nombre').value.trim() || embudoInfo(id).nombre;
      const lista = embudos().map((e) => (e.id === id ? { ...e, id: e.id, tipo: e.tipo, nombre, ...(e.tipo === 'lanzamientos' ? { formato: embFormato(), ...embPrelanz() } : {}), pestanas: todas ? undefined : pestanas } : e));
      const vsls = state.config.vsls[id] ? { ...state.config.vsls, [id]: { ...state.config.vsls[id], name: nombre, subtipo: embSubtipo() } } : state.config.vsls;
      const { config } = await api('/api/config', { method: 'POST', body: { ...state.config, embudos: lista, vsls } });
      state.config = config;
      embDlg.close();
      await setEmbudo(state.embudo);
      return;
    }
    // Desde una plantilla de agencia: la crea el servidor (embudo, mensajes, tareas habituales y base).
    const pl = $('#emb-plantilla').value;
    if (pl) {
      const d = await api('/api/plantillas', { method: 'POST', body: { op: 'aplicar', id: pl, nombre: $('#emb-nombre').value.trim(), mensajes: $('#emb-pl-mensajes').checked, habituales: $('#emb-pl-habituales').checked } });
      state.config = d.config;
      embDlg.close();
      await setEmbudo(d.embudo);
      if (embudoInfo(d.embudo)?.tipo === 'vsl') openVslConfig(); else openConfig(null);
      return;
    }
    const tipo = embTipo();
    const formato = embFormato();
    const subtipo = embSubtipo();
    const nombre = $('#emb-nombre').value.trim() || (tipo === 'vsl' ? SUBTIPOS_VSL[subtipo].corto : FORMATOS[formato].label);
    // id: a partir del nombre, sin chocar con otros embudos ni con códigos de lanzamiento.
    const usados = new Set([...embudos().map((e) => e.id), ...Object.keys(state.config.launches)]);
    const base = slugCliente(nombre) || (tipo === 'vsl' ? 'vsl' : 'lanz');
    let id = base.slice(0, 20);
    for (let n = 2; usados.has(id) || id.length < 2; n++) id = `${base.slice(0, 18)}-${n}`;
    const body = {
      ...state.config,
      embudos: [...embudos(), { id, tipo, nombre, ...(formato ? { formato, ...embPrelanz() } : {}), ...(todas ? {} : { pestanas }) }],
      vsls: tipo === 'vsl' ? { ...state.config.vsls, [id]: { name: nombre, subtipo } } : state.config.vsls,
    };
    const { config } = await api('/api/config', { method: 'POST', body });
    state.config = config;
    embDlg.close();
    await setEmbudo(id);
    // Y a configurarlo: etiquetas de GHL (VSL) o el primer lanzamiento.
    if (tipo === 'vsl') openVslConfig(); else if (tipo === 'meteorico') abrirMeteoDialog(null, { embudo: id }); else openConfig(null);
  } catch (e) {
    $('#emb-status').textContent = e.message;
  } finally {
    b.disabled = false;
  }
});

// Eliminar un embudo (las VSL, con su configuración; los de lanzamientos, solo si ya no tienen lanzamientos).
async function eliminarEmbudo(id) {
  const e = embudoInfo(id);
  if (!e) return false;
  if (e.tipo === 'lanzamientos' && Object.values(state.config.launches).some((l) => embudoDeLanz(l) === id)) {
    window.alert('Este embudo tiene lanzamientos. Bórralos antes (Configuración → Lanzamiento) o déjalo y desactiva sus pestañas.');
    return false;
  }
  if (!window.confirm(`¿Eliminar el embudo «${e.nombre}» del dashboard? Se borra su configuración. Sus contactos, etiquetas y páginas de GHL no se tocan.`)) return false;
  const vsls = { ...state.config.vsls };
  delete vsls[id];
  const { config } = await api('/api/config', { method: 'POST', body: { ...state.config, vsls, embudos: embudos().filter((x) => x.id !== id) } });
  state.config = config;
  await setEmbudo(state.embudo === id ? embudos()[0]?.id || '' : state.embudo);
  return true;
}
$('#emb-borrar').addEventListener('click', async () => {
  try { if (await eliminarEmbudo(embEdit)) embDlg.close(); } catch (e) { $('#emb-status').textContent = e.message; }
});

// ---------- Auditor de lanzamientos ----------
// Revisa el embudo activo (configuración, tareas, equipo, datos) y lo ordena por urgencia.
const AUD_NIVEL = { critico: { icon: '🔴', label: 'Crítico', plural: 'críticos' }, importante: { icon: '🟠', label: 'Importante', plural: 'importantes' }, aviso: { icon: '🟡', label: 'Aviso', plural: 'avisos' } };
const audIgnoradosKey = () => `lsd_aud_ign_${state.cliente || ''}_${codigo() || ''}`;
const audIgnorados = () => { try { return new Set(JSON.parse(ls.get(audIgnoradosKey()) || '[]')); } catch { return new Set(); } };
const audKey = (x) => `${x.area}|${x.titulo}`;

function auditoria() {
  if (!state.config || !codigo()) return [];
  const T = state.tareas?.code === codigo() ? state.tareas : null;
  const comun = {
    hoy: today(), tareas: T ? T.list : null, users: T?.users || [], roles: state.roles,
    tagsGhl: state.tags?.length ? state.tags : null, pestanas: pestanasEmbudo(),
    llamadas: state.llamadas?.code === codigo() ? state.llamadas.data : null,
  };
  if (enMeteo()) {
    const m = state.config.meteoricos?.[state.meteo.code];
    return m ? pendientesMeteorico(m).map((t) => ({ nivel: 'importante', area: 'Meteórico', titulo: t, detalle: '', accion: null })) : [];
  }
  if (enVsl()) return auditarVsl({ ...comun, vsl: vslCfg(), leads: state.vsl.code === state.embudo ? state.vsl.leads : null, meta: state.vsl.meta });
  const launch = state.config.launches[state.launchCode];
  if (!launch) return [];
  const otros = Object.entries(state.config.launches).filter(([c]) => c !== state.launchCode);
  return auditarLanzamiento({ ...comun, launch, code: state.launchCode, otros, leads: state.leadsDe === state.launchCode ? state.leads : null, zoom: state.zoomConfigured, meta: state.meta });
}

function actualizarAuditor() {
  if (!puedeConfig()) return;
  const ign = audIgnorados();
  const crit = auditoria().filter((x) => x.nivel === 'critico' && !ign.has(audKey(x))).length;
  const c = $('#auditor-count');
  c.hidden = !crit;
  c.textContent = String(crit);
  $('#btn-auditor').classList.toggle('has-crit', crit > 0);
  if ($('#auditor-dialog').open) pintarAuditor();
}

function pintarAuditor() {
  const lista = auditoria();
  const ign = audIgnorados();
  const activos = lista.filter((x) => !ign.has(audKey(x)));
  const ignorados = lista.filter((x) => ign.has(audKey(x)));
  const nombre = enVsl() ? vslCfg().name : state.config.launches[state.launchCode]?.name || '';
  $('#aud-titulo').textContent = `🩺 Auditor · ${nombre}`;
  const prox = enVsl() ? null : proximoHito(state.config.launches[state.launchCode] || {}, today());
  const cuenta = (n) => activos.filter((x) => x.nivel === n).length;
  $('#aud-cabecera').innerHTML = `
    <div class="aud-resumen">${Object.entries(AUD_NIVEL).map(([k, v]) => `<span class="aud-chip n-${k}">${v.icon} <strong>${cuenta(k)}</strong> ${v.plural}</span>`).join('')}
      ${!activos.length ? '<span class="aud-ok">✅ Todo en orden</span>' : ''}</div>
    ${prox ? `<p class="aud-prox">Próximo hito: <strong>${esc(prox.label)}</strong> · ${esc(fechaCortaAud(prox.d))} (${esc(cuando(diasHasta(prox.d, today())))})</p>` : ''}
    ${!state.tags?.length ? '<p class="muted aud-nota">Las etiquetas de GHL aún no se han leído: no se comprueba si existen.</p>' : ''}`;
  const item = (x) => `<li class="aud-item n-${x.nivel}" data-aud="${esc(audKey(x))}">
      <span class="aud-ico" aria-hidden="true">${AUD_NIVEL[x.nivel].icon}</span>
      <div class="aud-txt"><span class="aud-area">${esc(x.area)}</span><strong>${esc(x.titulo)}</strong>${x.detalle ? `<small>${esc(x.detalle)}</small>` : ''}</div>
      <div class="aud-acc">${x.accion ? `<button type="button" class="btn primary" data-aud-ir='${esc(JSON.stringify(x.accion))}'>Arreglar →</button>` : ''}
        <button type="button" class="btn ghost" data-aud-ign title="No volver a avisar de esto en este lanzamiento">Ignorar</button></div></li>`;
  $('#aud-lista').innerHTML = (activos.length ? `<ul class="aud-list">${activos.map(item).join('')}</ul>` : '<p class="aud-vacio">No hay nada pendiente: configuración, tareas y datos están en orden. 🎉</p>')
    + (ignorados.length ? `<details class="aud-ign"><summary>${ignorados.length} ignorado${ignorados.length === 1 ? '' : 's'}</summary><ul class="aud-list">${ignorados.map((x) => item(x).replace('data-aud-ign title="No volver a avisar de esto en este lanzamiento">Ignorar', 'data-aud-rest>Volver a avisar')).join('')}</ul></details>` : '');
}

$('#btn-auditor').addEventListener('click', () => { pintarAuditor(); $('#auditor-dialog').showModal(); });
$('#aud-lista').addEventListener('click', async (e) => {
  const li = e.target.closest('[data-aud]');
  if (!li) return;
  const key = li.dataset.aud;
  if (e.target.closest('[data-aud-ign], [data-aud-rest]')) {
    const ign = audIgnorados();
    if (ign.has(key)) ign.delete(key); else ign.add(key);
    ls.set(audIgnoradosKey(), JSON.stringify([...ign]));
    pintarAuditor();
    actualizarAuditor();
    return;
  }
  const b = e.target.closest('[data-aud-ir]');
  if (!b) return;
  const acc = JSON.parse(b.dataset.audIr);
  $('#auditor-dialog').close();
  if (acc.tipo === 'campo') { await openConfig(state.launchCode); setTimeout(() => goToField(acc.id), 150); }
  else if (acc.tipo === 'tarea') abrirTarea(acc.id);
  else if (acc.tipo === 'vista') showView(acc.v);
  else if (acc.tipo === 'vsl') { await openVslConfig(); $(`#vsl-config-dialog .tab[data-tab="${acc.tab}"]`)?.click(); }
});

// ---------- Inicio ----------
start().catch((e) => {
  if (e.message !== 'Sesión caducada') notice(e.message, true);
  showLogin();
});

// ---------- ⚡ Meteóricos: ofertas flash (independientes o downsell tras un lanzamiento) ----------
const meteoricos = () => Object.entries(state.config?.meteoricos || {});
const meteoDeEmbudo = (id) => meteoricos().filter(([, m]) => m.embudo === id).sort((a, b) => String(b[1].apertura).localeCompare(String(a[1].apertura)));
const meteoDeLanz = (code) => meteoricos().filter(([, m]) => m.lanzamiento === code).sort((a, b) => String(b[1].apertura).localeCompare(String(a[1].apertura)));
// Elige el meteórico del embudo activo: el guardado, el que está en marcha o el más reciente.
function pickMeteo() {
  const lista = meteoDeEmbudo(state.embudo);
  const guardado = ls.get(`lsd_meteo_${state.embudo}`);
  if (lista.some(([c]) => c === state.meteo.code)) return;
  const enMarcha = lista.find(([, m]) => ['calentamiento', 'abierta'].includes(faseMeteorico(m).id));
  state.meteo.code = (lista.some(([c]) => c === guardado) ? guardado : enMarcha?.[0]) || lista[0]?.[0] || '';
}
const cuentaAtras = (ms) => {
  if (ms == null || ms <= 0) return '';
  const min = Math.round(ms / 60_000);
  const d = Math.floor(min / 1440); const h = Math.floor((min % 1440) / 60); const m = min % 60;
  return [d ? `${d} d` : '', h ? `${h} h` : '', !d && m ? `${m} min` : ''].filter(Boolean).join(' ') || 'menos de 1 min';
};
const fechaHoraMeteo = (v) => (v ? new Date(madridToEpoch(v)).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '–');
async function cargarMeteo(code, { fresh = false } = {}) {
  const d = state.meteo.datos[code];
  if (!fresh && d?.data && d.at > Date.now() - 60_000) return d.data;
  const data = await api(`/api/meteorico?m=${encodeURIComponent(code)}`);
  state.meteo.datos[code] = { at: Date.now(), data };
  return data;
}
// Pinta un meteórico (estado, KPIs, ventas, compradoras y código de la página) dentro de `box`.
async function pintarMeteo(box, code, { fresh = false } = {}) {
  const m = state.config.meteoricos?.[code];
  if (!m) { box.innerHTML = ''; return; }
  const f = faseMeteorico(m);
  const F = FASES_METEORICO[f.id];
  const horas = horasOferta(m);
  const pend = pendientesMeteorico(m);
  const cab = `<div class="meteo-cab">
      <div><h2>⚡ ${esc(m.name)} <span class="badge tone-${F.tono}">${F.label}</span></h2>
        <p class="muted">${[m.producto, m.oferta].filter(Boolean).map(esc).join(' · ') || 'Pon el producto y la oferta en Configurar'}${horas ? ` · oferta de ${horas} h` : ''}</p>
        <p class="meteo-tiempos">🔥 Calentamiento desde <strong>${m.calentamiento ? esc(fechaFicha(`${m.calentamiento}T12:00:00Z`)) : '–'}</strong> · 🟢 Abre <strong>${esc(fechaHoraMeteo(m.apertura))}</strong> · 🔴 Cierra <strong>${esc(fechaHoraMeteo(m.cierre))}</strong></p></div>
      ${f.hasta ? `<div class="meteo-cuenta"><span>${f.id === 'abierta' ? 'Se cierra en' : f.id === 'calentamiento' ? 'Abre en' : 'Empieza en'}</span><strong>${cuentaAtras(f.hasta - Date.now())}</strong></div>` : ''}
    </div>${pend.length ? `<div class="notice warn"><strong>Para dejarlo listo:</strong><ul>${pend.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}`;
  box.innerHTML = `${cab}<p class="muted">Cargando las ventas…</p>`;
  let d;
  try { d = await cargarMeteo(code, { fresh }); } catch (e) { box.innerHTML = `${cab}<p class="error">${esc(e.message)}</p>`; return; }
  if (state.config.meteoricos?.[code] !== m) return;
  const pct1 = (x) => (x == null ? '–' : `${(Math.round(x * 1000) / 10).toLocaleString('es-ES')}%`);
  const obj = (k) => d.objetivos.find((o) => o.label === k);
  const kpis = [
    card('Ventas', d.ventas, obj('Ventas') ? `${Math.round(obj('Ventas').pct * 100)}% del objetivo (${obj('Ventas').meta})` : d.planes ? d.planes.filas.filter((f) => f.n).map((f) => `${f.n} ${esc(f.label.toLowerCase())}`).join(' · ') || 'suscripción' : `${d.unico} pago único · ${d.fraccionado} a plazos`, 'cart', 'buy'),
    card('Facturación', eur(d.facturacion), obj('Facturación') ? `${Math.round(obj('Facturación').pct * 100)}% de ${eur(obj('Facturación').meta)}` : d.ticket ? `ticket medio ${eur(d.ticket)}${d.planes ? ` · MRR ${eur(d.planes.mrr)}` : ''}` : 'pon el precio en Configurar', 'coins', 'money'),
    card('Visitas a la oferta', d.visitas ?? 0, d.visitas ? 'personas distintas por sesión (página con el código)' : 'Pon el código en la página de la oferta', 'eye', 'info'),
    card('Conversión de la oferta', pct1(d.conversion), 'ventas / visitas a la página', 'funnel', 'accent'),
    card('Inversión', d.inversion ? eur(d.inversion) : '–', d.inversionFuente === 'meta' ? 'Meta Ads' : d.inversionFuente === 'manual' ? 'introducida a mano' : 'sin publicidad', 'megaphone', 'accent'),
    card('Coste por venta', eur(d.cac), d.roas != null ? `ROAS ${d.roas.toFixed(2)}x` : 'inversión / ventas', 'target', 'buy'),
  ].join('');
  const max = Math.max(1, ...d.ventasPorDia.map(([, n]) => n));
  const visDias = Object.entries(d.visitasPorDia || {}).sort((a, b) => a[0].localeCompare(b[0]));
  const porDia = d.ventasPorDia.length || visDias.length ? `<section class="meteo-sec"><h3>Por día</h3><div class="table-scroll"><table class="metric-table"><thead><tr><th>Día</th><th class="num">Visitas</th><th class="num">Ventas</th><th></th></tr></thead><tbody>
      ${[...new Set([...visDias.map(([x]) => x), ...d.ventasPorDia.map(([x]) => x)])].sort().map((dia) => { const v = d.ventasPorDia.find(([x]) => x === dia)?.[1] || 0; return `<tr><td>${esc(fechaFicha(`${dia}T12:00:00Z`))}</td><td class="num">${d.visitasPorDia?.[dia] || 0}</td><td class="num"><strong>${v}</strong></td><td><div class="meter"><span style="width:${(v / max) * 100}%"></span></div></td></tr>`; }).join('')}</tbody></table></div></section>` : '';
  const compradoras = `<section class="meteo-sec"><h3>Compradoras (${d.compradores.length})</h3>${d.compradores.length ? `<div class="table-scroll"><table class="metric-table"><thead><tr><th>Persona</th><th>Teléfono</th><th>Fecha</th><th>Pago</th></tr></thead><tbody>${d.compradores.slice(0, 300).map((c) => `<tr><td><strong>${esc(c.name || '(sin nombre)')}</strong><br><span class="muted">${esc(c.email || '')}</span></td><td>${esc(c.phone || '–')}</td><td>${c.fecha ? esc(fechaFicha(`${c.fecha}T12:00:00Z`)) : '–'}</td><td>${esSuscripcion(m) ? esc(PLANES_SUSCRIPCION.find((p) => p.id === c.plan)?.label || 'Suscripción') : c.fraccionado ? 'A plazos' : 'Único'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Todavía ninguna.</p>'}</section>`;
  const qs = [`m=${encodeURIComponent(code)}`, cParam('').replace(/^\?/, '')].filter(Boolean).join('&');
  const snippet = `<div data-lsd-oferta></div>\n<script src="${location.origin}/oferta.js?${qs}" defer></script>`;
  const foto = m.compraDateField ? '' : `<p class="muted small">Sin campo de fecha de compra, las ventas son quienes tienen la etiqueta y no estaban en la «foto».${d.foto ? ` Foto hecha el ${esc(new Date(d.foto.at).toLocaleString('es-ES'))} (${d.foto.n} personas ya la tenían).` : ' <strong>Aún no hay foto: hazla antes de abrir.</strong>'}</p>${puedeConfig() ? `<button type="button" class="btn" data-meteo-foto="${esc(code)}">${d.foto ? 'Rehacer la foto' : 'Hacer la foto ahora'}</button>` : ''}`;
  const planes = d.planes ? `<section class="meteo-sec"><h3>Planes de la suscripción</h3><div class="table-scroll"><table class="metric-table">${tablaPlanes(d.planes)}</table></div></section>` : '';
  box.innerHTML = `${cab}<div class="kpis meteo-kpis">${kpis}</div>${planes}${porDia}${compradoras}
    <section class="meteo-sec"><h3>Código para la página de la oferta <span class="muted small">(bloque «Código HTML» en GHL)</span></h3>
      <p class="muted small">Pinta la cuenta atrás («se abre en…», «se cierra en…» con el botón de compra y «ha terminado») y cuenta las visitas. Los textos y horas se cambian en Configurar.</p>
      <pre class="snippet">${esc(snippet)}</pre><button type="button" class="btn" data-copiar-meteo="${esc(snippet)}">Copiar código</button>
      ${m.whatsappUrl ? ` <a class="btn ghost" href="${esc(m.whatsappUrl)}" target="_blank" rel="noopener">Grupo de WhatsApp</a>` : ''}${m.ofertaUrl ? ` <a class="btn ghost" href="${esc(m.ofertaUrl)}" target="_blank" rel="noopener">Ver la página de la oferta ↗</a>` : ''}
      ${foto}</section>
    <section class="meteo-sec"><h3>Emails del meteórico <span class="muted small">(apertura, CTR y qué mejorar)</span></h3><div data-em-meteo></div></section>
    ${m.notas ? `<section class="meteo-sec"><h3>Notas</h3><p class="ll-notas">${esc(m.notas)}</p></section>` : ''}`;
  if (tiene('metricas')) mostrarEmails(code, { tabla: box.querySelector('[data-em-meteo]') });
}
function llenarMeteoSelect(sel, lista, code, vacio) {
  sel.innerHTML = lista.length ? lista.map(([c, m]) => `<option value="${esc(c)}" ${c === code ? 'selected' : ''}>${esc(m.name)}${m.apertura ? ` · ${esc(fechaHoraMeteo(m.apertura))}` : ''}</option>`).join('') : `<option value="">${vacio}</option>`;
  sel.disabled = !lista.length;
}
function renderMeteoView({ fresh = false } = {}) {
  pickMeteo();
  const lista = meteoDeEmbudo(state.embudo);
  llenarMeteoSelect($('#meteo-select'), lista, state.meteo.code, 'Aún no hay meteóricos');
  $('#meteo-config').hidden = !state.meteo.code || !puedeConfig();
  $('#meteo-nuevo').hidden = !puedeConfig();
  if (!state.meteo.code) {
    $('#meteo-body').innerHTML = `<div class="card empty"><h2>⚡ Sin meteóricos todavía</h2><p class="muted">Crea el primero: nombre, producto y oferta, días de calentamiento, la apertura y el cierre, y la etiqueta de compra.</p>${puedeConfig() ? '<p><button type="button" class="btn primary" data-meteo-nuevo-embudo>+ Nuevo meteórico</button></p>' : ''}</div>`;
    return;
  }
  pintarMeteo($('#meteo-body'), state.meteo.code, { fresh });
}
// Conversión del downsell: de las registradas que NO compraron el lanzamiento, cuántas compraron el
// meteórico (recupera ventas) y cuántas compradoras eran ya clientas del lanzamiento o de fuera.
async function pintarConversionDownsell(code) {
  const box = $('#meteo-l-conv');
  const d = state.meteo.datos[code]?.data;
  if (!d || !state.leads?.length) { box.innerHTML = ''; return; }
  const ids = new Set(d.compradores.map((c) => c.id));
  const noCompraron = state.leads.filter((l) => !l.s.compra);
  const recuperadas = noCompraron.filter((l) => ids.has(l.id)).length;
  const yaClientas = state.leads.filter((l) => l.s.compra && ids.has(l.id)).length;
  const deFuera = d.compradores.length - recuperadas - yaClientas;
  // Misma etiqueta de compra que el lanzamiento: sus ventas se cuentan en los dos y no se pueden separar.
  const launch = state.config.launches[state.launchCode];
  const m = state.config.meteoricos?.[code];
  const mismaEtiqueta = m?.compraTag && launch?.compraTag && m.compraTag.toLowerCase() === launch.compraTag.toLowerCase();
  box.innerHTML = (mismaEtiqueta ? `<div class="notice warn" style="grid-column:1/-1"><span>El meteórico usa la <strong>misma etiqueta de compra</strong> que el lanzamiento («${esc(m.compraTag)}»): sus ventas cuentan también como ventas del lanzamiento y la conversión no se puede medir. Ponle su propia etiqueta de compra en GHL y en Configurar.</span></div>` : '') + [
    card('Conversión del downsell', pctOf(recuperadas, noCompraron.length), `${recuperadas} de las ${noCompraron.length.toLocaleString('es-ES')} registradas que no compraron el lanzamiento`, 'zap', 'buy'),
    card('Ventas recuperadas', recuperadas, d.ventas ? `${pctOf(recuperadas, d.ventas)} de las ventas del meteórico` : 'aún sin ventas', 'cart', 'money'),
    card('Ya eran clientas del lanzamiento', yaClientas, 'compraron el lanzamiento y también el downsell', 'crown', 'vip'),
    card('De fuera del lanzamiento', Math.max(0, deFuera), 'compraron el meteórico sin estar registradas en este lanzamiento', 'users', 'info'),
  ].join('');
}
// Métricas del lanzamiento → Downsell: los meteóricos posteriores de este lanzamiento.
let meteoLanzCode = '';
function renderMeteoLanz({ fresh = false } = {}) {
  const lista = meteoDeLanz(state.launchCode);
  if (!lista.some(([c]) => c === meteoLanzCode)) meteoLanzCode = lista[0]?.[0] || '';
  llenarMeteoSelect($('#meteo-l-select'), lista, meteoLanzCode, 'Este lanzamiento no tiene meteórico posterior');
  $('#meteo-l-config').hidden = !meteoLanzCode || !puedeConfig();
  $('#meteo-l-nuevo').hidden = !puedeConfig();
  if (!meteoLanzCode) { $('#meteo-l-body').innerHTML = '<p class="muted">Tras el lanzamiento puedes hacer una oferta flash (downsell u otro producto) a quien no compró: crea aquí su meteórico para medir sus ventas aparte.</p>'; $('#meteo-l-oferta').innerHTML = ''; $('#meteo-l-conv').innerHTML = ''; return; }
  pintarMeteo($('#meteo-l-body'), meteoLanzCode, { fresh }).then(() => { pintarConversionDownsell(meteoLanzCode); pintarOfertaMeteo($('#meteo-l-oferta'), meteoLanzCode); });
}
$('#meteo-select').addEventListener('change', (e) => { state.meteo.code = e.target.value; ls.set(`lsd_meteo_${state.embudo}`, state.meteo.code); renderMeteoView(); actualizarAuditor(); });
$('#meteo-l-select').addEventListener('change', (e) => { meteoLanzCode = e.target.value; renderMeteoLanz(); });
$('#meteo-recargar').addEventListener('click', () => renderMeteoView({ fresh: true }));
$('#meteo-nuevo').addEventListener('click', () => abrirMeteoDialog(null, { embudo: state.embudo }));
$('#meteo-config').addEventListener('click', () => abrirMeteoDialog(state.meteo.code, { embudo: state.embudo }));
$('#meteo-l-nuevo').addEventListener('click', () => abrirMeteoDialog(null, { lanzamiento: state.launchCode }));
$('#meteo-l-config').addEventListener('click', () => abrirMeteoDialog(meteoLanzCode, { lanzamiento: state.launchCode }));
document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-meteo-nuevo-embudo]')) { abrirMeteoDialog(null, { embudo: state.embudo }); return; }
  const cp = e.target.closest('[data-copiar-meteo]');
  if (cp) { navigator.clipboard?.writeText(cp.dataset.copiarMeteo).then(() => { cp.textContent = 'Copiado ✓'; }).catch(() => {}); return; }
  const fb = e.target.closest('[data-meteo-foto]');
  if (fb) {
    if (!window.confirm('Se apunta quién tiene ya la etiqueta de compra: no contarán como ventas de este meteórico. Hazla antes de abrir la oferta. ¿Continuar?')) return;
    fb.disabled = true;
    try {
      await api('/api/meteorico', { method: 'POST', body: { op: 'foto', m: fb.dataset.meteoFoto } });
      delete state.meteo.datos[fb.dataset.meteoFoto];
      if (enMeteo()) renderMeteoView(); else renderMeteoLanz();
    } catch (ex) { window.alert(ex.message); fb.disabled = false; }
  }
});

// Configuración de un meteórico (nuevo o existente).
let meteoEdit = null; // { code | null, embudo, lanzamiento }
const MT_CAMPOS = ['name', 'producto', 'oferta', 'precio', 'precioFraccionado', 'calentamiento', 'apertura', 'cierre', 'compraTag', 'fraccionadoTag', 'ofertaUrl', 'pagoUrl', 'pagoFraccionadoUrl', 'cerradaUrl', 'whatsappUrl', 'objetivoVentas', 'objetivoFacturacion', 'inversion', 'metaFiltro', 'emailFiltro', 'notas'];
async function abrirMeteoDialog(code, { embudo = '', lanzamiento = '' } = {}) {
  const m = code ? state.config.meteoricos?.[code] : null;
  meteoEdit = { code: m ? code : null, embudo: m?.embudo ?? embudo, lanzamiento: m?.lanzamiento ?? lanzamiento };
  $('#meteo-titulo').textContent = m ? `⚡ ${m.name}` : '⚡ Nuevo meteórico';
  $('#meteo-de').textContent = meteoEdit.lanzamiento ? `Meteórico posterior al lanzamiento «${state.config.launches[meteoEdit.lanzamiento]?.name || meteoEdit.lanzamiento}» (downsell u otro producto).` : 'Acción independiente a tu base de datos (Black Friday, rebajas, aniversario…).';
  for (const k of MT_CAMPOS) {
    const el = $(`#mt-${k}`);
    const v = m?.[k];
    el.value = v == null || v === 0 ? '' : String(v);
  }
  for (const k of ['calentamiento', 'abierta', 'cerrada', 'boton']) $(`#mt-t-${k}`).value = m?.textos?.[k] || '';
  $('#mt-code').value = code || '';
  $('#mt-code').readOnly = Boolean(m);
  pintarPago('mt', m?.pago);
  pintarPaqueteMeteo(m?.paquete);
  $('#meteo-dialog .tab[data-tab="mt-oferta"]').click();
  $('#mt-borrar').hidden = !m;
  $('#mt-status').textContent = '';
  // Un meteórico nuevo hereda del último del mismo sitio las etiquetas, el campo de fecha y los textos.
  if (!m) {
    const prev = (meteoEdit.lanzamiento ? meteoDeLanz(meteoEdit.lanzamiento) : meteoDeEmbudo(meteoEdit.embudo))[0]?.[1] || meteoricos().at(-1)?.[1];
    if (prev) for (const k of ['fraccionadoTag', 'whatsappUrl']) $(`#mt-${k}`).value = prev[k] || '';
    if (prev?.pago) pintarPago('mt', prev.pago);
    if (meteoEdit.lanzamiento) $('#mt-name').value = `Downsell ${state.config.launches[meteoEdit.lanzamiento]?.name || ''}`.trim();
  }
  const sel = $('#mt-compraDateField');
  // Campos de fecha y, aparte, de texto (con fecha y hora: para medir los bonus de 30 min y 1 h).
  const pintar = () => {
    const fields = state.dateFields;
    const textos = state.textFields || [];
    const actual = m?.compraDateField || '';
    // Sin la lista de GHL todavía, el campo guardado se mantiene como opción (si se guarda antes, no se pierde).
    const conocido = [...(fields || []), ...textos].some((f) => f.id === actual);
    const extra = actual && !conocido ? `<option value="${esc(actual)}">${fields ? 'Campo guardado (no está en GHL)' : 'Cargando campos de GHL…'}</option>` : '';
    const opts = (l) => l.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');
    sel.innerHTML = `<option value="">— Sin campo de fecha —</option>${extra}${fields?.length ? `<optgroup label="Campos de fecha (solo el día)">${opts(fields)}</optgroup>` : ''}${textos.length ? `<optgroup label="Campos de texto (fecha y hora, p. ej. {{right_now}})">${opts(textos)}</optgroup>` : ''}`;
    sel.value = actual;
  };
  pintar();
  $('#meteo-dialog').showModal();
  if (!state.dateFields) { try { state.dateFields = (await api('/api/fields')).fields; pintar(); } catch { /* sin campos */ } }
  if (!state.textFields) { try { state.textFields = (await api('/api/fields?tipo=texto')).fields; pintar(); } catch { /* sin campos */ } }
  if (!state.tags?.length) api('/api/tags').then((d) => { state.tags = d.tags; fillTagList(); }).catch(() => {});
}
$('#mt-guardar').addEventListener('click', async () => {
  const code = (meteoEdit.code || $('#mt-code').value.trim().toLowerCase());
  const status = $('#mt-status');
  if (!LAUNCH_CODE_RE.test(code)) { $('#meteo-dialog .tab[data-tab="mt-oferta"]').click(); status.textContent = 'El código solo puede tener minúsculas, números y guiones (2-24).'; return; }
  if (!meteoEdit.code && (state.config.meteoricos?.[code] || state.config.launches[code] || state.config.vsls?.[code])) { status.textContent = `El código «${code}» ya está en uso.`; return; }
  const v = Object.fromEntries(MT_CAMPOS.map((k) => [k, $(`#mt-${k}`).value.trim()]));
  const m = {
    ...(state.config.meteoricos?.[code] || {}), ...v,
    compraDateField: $('#mt-compraDateField').value,
    textos: Object.fromEntries(['calentamiento', 'abierta', 'cerrada', 'boton'].map((k) => [k, $(`#mt-t-${k}`).value.trim()])),
    embudo: meteoEdit.lanzamiento ? '' : meteoEdit.embudo, lanzamiento: meteoEdit.lanzamiento,
    pago: leerPago('mt'),
    paquete: leerPaqueteMeteo(),
  };
  if (errorPago('mt')) { $('#meteo-dialog .tab[data-tab="mt-oferta"]').click(); status.textContent = errorPago('mt'); return; }
  if (!m.name) { $('#meteo-dialog .tab[data-tab="mt-oferta"]').click(); status.textContent = 'Ponle un nombre.'; return; }
  status.textContent = 'Guardando…';
  try {
    const { config } = await api('/api/config', { method: 'POST', body: { ...state.config, meteoricos: { ...(state.config.meteoricos || {}), [code]: m } } });
    state.config = config;
    // Meteórico nuevo: su planificación se crea ya (acciones inmediatas para hoy, el resto con sus fechas).
    if (!meteoEdit.code && puedeTareas()) {
      try {
        const d = await api('/api/tareas', { method: 'POST', body: { l: code, op: 'plantilla' } });
        if (d.creadas) notice(`Creadas ${d.creadas} tareas del meteórico «${m.name}» (lo urgente, para hoy). Las tienes en Planificación → Tareas.`);
        if (state.tareas?.code === code) { state.tareas.list = d.tareas; renderTareas(); }
      } catch (ex) { notice(`El meteórico se ha guardado, pero no se pudieron crear sus tareas: ${ex.message}`, true); }
    }
    loadEventos();
    delete state.meteo.datos[code];
    $('#meteo-dialog').close();
    pintarSidebar();
    if (meteoEdit.lanzamiento) { meteoLanzCode = code; renderMeteoLanz(); } else { state.meteo.code = code; ls.set(`lsd_meteo_${state.embudo}`, code); if (enMeteo()) renderMeteoView(); }
    if (enMeteo() && !$('#view-moferta').hidden) renderMOfertaView();
    actualizarAuditor();
  } catch (e) { status.textContent = e.message; }
});
$('#mt-borrar').addEventListener('click', async () => {
  const code = meteoEdit?.code;
  if (!code || !window.confirm(`¿Eliminar el meteórico «${state.config.meteoricos[code].name}» del dashboard? Las etiquetas y páginas de GHL no se tocan.`)) return;
  const resto = { ...state.config.meteoricos };
  delete resto[code];
  try {
    const { config } = await api('/api/config', { method: 'POST', body: { ...state.config, meteoricos: resto } });
    state.config = config;
    $('#meteo-dialog').close();
    pintarSidebar();
    if (meteoEdit.lanzamiento) renderMeteoLanz(); else { state.meteo.code = ''; if (enMeteo()) renderMeteoView(); }
  } catch (e) { $('#mt-status').textContent = e.message; }
});


// ---------- Tipo de pago (lanzamientos, VSL y meteóricos) ----------
// Pago único (con o sin fraccionado) o suscripción con sus planes. Cada ventana tiene tres huecos:
// el selector y los precios (data-pago-tipo), los enlaces de pago de cada plan (data-pago-enlaces) y
// sus etiquetas (data-pago-etiquetas). Los campos de pago único / fraccionado de siempre llevan
// data-pago="unico" o "fr" y se ocultan cuando no tocan.
const pagoRoot = (pref) => $(`[data-pago-tipo="${pref}"]`).closest('dialog');
function montarPago(pref) {
  const tipo = $(`[data-pago-tipo="${pref}"]`);
  tipo.innerHTML = `<div class="pago-sel">
      <span class="pago-sel-label">Tipo de pago</span>
      <div class="pago-tipos" role="radiogroup" aria-label="Tipo de pago">
        <label><input type="radio" name="${pref}-pago-tipo" value="unico" checked><span>💳 Pago único</span></label>
        <label><input type="radio" name="${pref}-pago-tipo" value="suscripcion"><span>🔁 Suscripción</span></label>
      </div>
      <label class="chk" data-pago-solo="unico"><input type="checkbox" data-pago-fr> También se puede pagar fraccionado (a plazos)</label>
      <div class="pago-planes" data-pago-solo="suscripcion">
        <p class="muted small">Marca los planes que tiene y el precio de cada cobro. La facturación cuenta el primer cobro de cada alta; además verás el ingreso mensual recurrente (MRR).</p>
        ${PLANES_SUSCRIPCION.map((p) => `<div class="pago-plan">
          <label class="chk"><input type="checkbox" data-plan-on="${p.id}"> ${p.label}</label>
          <label class="field" data-plan-campo="${p.id}"><span>Precio por ${p.periodo} (€)</span><input data-plan-precio="${p.id}" inputmode="decimal" placeholder="0"></label>
        </div>`).join('')}
      </div>
    </div>`;
  $(`[data-pago-enlaces="${pref}"]`).innerHTML = PLANES_SUSCRIPCION.map((p) => `<label class="field" data-plan-campo="${p.id}"><span>Enlace de pago · plan ${p.label.toLowerCase()}</span><input data-plan-url="${p.id}" type="url" placeholder="https://…"></label>`).join('');
  $(`[data-pago-etiquetas="${pref}"]`).innerHTML = PLANES_SUSCRIPCION.map((p) => `<label class="field" data-plan-campo="${p.id}"><span>Etiqueta del plan ${p.label.toLowerCase()} <small>(la pone el workflow de ese pago)</small></span><input data-plan-tag="${p.id}" list="tag-list" placeholder="Busca la etiqueta…"></label>`).join('');
  pagoRoot(pref).addEventListener('change', (e) => { if (e.target.matches(`[name="${pref}-pago-tipo"], [data-pago-fr], [data-plan-on]`)) refrescarPago(pref); });
}
function refrescarPago(pref) {
  const root = pagoRoot(pref);
  const sus = $(`[name="${pref}-pago-tipo"][value="suscripcion"]`, root).checked;
  const fr = $('[data-pago-fr]', root).checked;
  $$('[data-pago="unico"]', root).forEach((el) => { el.hidden = sus; });
  $$('[data-pago="fr"]', root).forEach((el) => { el.hidden = sus || !fr; });
  $$('[data-pago-solo]', root).forEach((el) => { el.hidden = el.dataset.pagoSolo !== (sus ? 'suscripcion' : 'unico'); });
  for (const p of PLANES_SUSCRIPCION) {
    const on = sus && $(`[data-plan-on="${p.id}"]`, root).checked;
    $$(`[data-plan-campo="${p.id}"]`, root).forEach((el) => { el.hidden = !on; });
  }
}
function pintarPago(pref, pago) {
  const root = pagoRoot(pref);
  const sus = pago?.tipo === 'suscripcion';
  $(`[name="${pref}-pago-tipo"][value="${sus ? 'suscripcion' : 'unico'}"]`, root).checked = true;
  $('[data-pago-fr]', root).checked = pago?.fraccionado !== false;
  for (const p of PLANES_SUSCRIPCION) {
    const x = pago?.planes?.[p.id] || {};
    $(`[data-plan-on="${p.id}"]`, root).checked = Boolean(x.activo);
    $(`[data-plan-precio="${p.id}"]`, root).value = x.precio ? String(x.precio).replace('.', ',') : '';
    $(`[data-plan-url="${p.id}"]`, root).value = x.url || '';
    $(`[data-plan-tag="${p.id}"]`, root).value = x.tag || '';
  }
  refrescarPago(pref);
}
// «9,90» → 9.9 · «1.164» → 1164 · «9.90» → 9.9
const precioDe = (v) => { const t = String(v || '').trim(); return t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t; };
function leerPago(pref) {
  const root = pagoRoot(pref);
  return {
    tipo: $(`[name="${pref}-pago-tipo"][value="suscripcion"]`, root).checked ? 'suscripcion' : 'unico',
    fraccionado: $('[data-pago-fr]', root).checked,
    planes: Object.fromEntries(PLANES_SUSCRIPCION.map((p) => [p.id, {
      activo: $(`[data-plan-on="${p.id}"]`, root).checked,
      precio: precioDe($(`[data-plan-precio="${p.id}"]`, root).value),
      url: $(`[data-plan-url="${p.id}"]`, root).value.trim(),
      tag: $(`[data-plan-tag="${p.id}"]`, root).value.trim().toLowerCase(),
    }])),
  };
}
// Un error de la suscripción (sin planes) antes de guardar; '' si está bien.
function errorPago(pref) {
  const p = leerPago(pref);
  return p.tipo === 'suscripcion' && !Object.values(p.planes).some((x) => x.activo) ? 'Marca al menos un plan de la suscripción (mensual, trimestral, semestral o anual).' : '';
}
['cfg', 'vc', 'mt'].forEach(montarPago);

// Tabla de altas por plan (suscripción). `r`: resumenPlanes().
function tablaPlanes(r) {
  if (!r) return '';
  return `<thead><tr><th>Plan</th><th class="num">Altas</th><th class="num">%</th><th class="num">Facturación</th><th class="num">MRR</th></tr></thead><tbody>
    ${r.filas.map((f) => `<tr><td>${esc(f.label)}</td><td class="num">${f.n}</td><td class="num">${r.total ? `${Math.round(f.pct * 100)}%` : '–'}</td><td class="num">${eur(f.facturacion)}</td><td class="num">${eur(f.mrr)}</td></tr>`).join('')}
    <tr class="total"><td><strong>Total</strong></td><td class="num"><strong>${r.total}</strong></td><td class="num">${r.total ? '100%' : '–'}</td><td class="num"><strong>${eur(r.facturacion)}</strong></td><td class="num"><strong>${eur(r.mrr)}</strong></td></tr></tbody>`;
}


// ---------- Emails: apertura (open rate), CTR y CTOR de cada email, con indicadores ----------
// Datos: GHL (campañas y emails de workflows cuyo nombre lleva el texto de «Emails de este embudo»).
const emailsCache = {};
const pctE = (x) => (x == null ? '–' : `${(Math.round(x * 1000) / 10).toLocaleString('es-ES')}%`);
const NIVEL_TXT = { alto: '▲ Alta', medio: '● En la media', bajo: '▼ Baja' };
function nivelChip(niv, dif) {
  if (!niv) return '';
  const d = dif != null ? ` (${dif > 0 ? '+' : ''}${Math.round(dif * 100)}% vs. el resto)` : '';
  return `<span class="em-niv ${niv}" title="Frente a la media del resto de emails${d}">${NIVEL_TXT[niv]}</span>`;
}
async function cargarEmails(code, { fresh = false } = {}) {
  const c = emailsCache[code];
  if (c && !fresh && (c.datos || c.cargando)) return c.cargando || c.datos;
  const p = api(`/api/emails?l=${encodeURIComponent(code)}${fresh ? '&fresh=1' : ''}`);
  emailsCache[code] = { cargando: p };
  try { const datos = await p; emailsCache[code] = { datos }; return datos; } catch (e) { emailsCache[code] = { error: e.message }; throw e; }
}
function mostrarEmails(code, { kpis, tabla } = {}) {
  if (!code || !tiene('metricas')) return;
  const boxK = typeof kpis === 'string' ? $(kpis) : kpis;
  const boxT = typeof tabla === 'string' ? $(tabla) : tabla;
  for (const b of [boxK, boxT]) if (b) b.dataset.emCode = code;
  const pintar = () => {
    const c = emailsCache[code] || {};
    if (boxK && boxK.dataset.emCode === code) pintarEmailsKpis(boxK, c);
    if (boxT && boxT.dataset.emCode === code) pintarEmailsTabla(boxT, c, code);
  };
  const c = emailsCache[code];
  if (c?.datos || c?.error) { pintar(); return; }
  if (boxT) boxT.innerHTML = '<p class="muted">Cargando los emails de GHL…</p>';
  cargarEmails(code).catch(() => {}).finally(pintar);
}
function pintarEmailsKpis(box, c) {
  const d = c.datos;
  // Solo si su categoría de Métricas (Resumen) es la que está abierta.
  const nav = box.closest('[id^="view-"]')?.querySelector('.msubs');
  const activa = nav?.querySelector('[data-msub-btn].active')?.dataset.msubBtn;
  box.hidden = Boolean(box.dataset.msub && activa && box.dataset.msub !== activa);
  if (c.error) { box.innerHTML = card('Apertura media de los emails', '–', esc(c.error.slice(0, 140)), 'mail', 'info'); return; }
  if (!d) { box.hidden = true; box.innerHTML = ''; return; }
  if (!d.emails.length) {
    box.innerHTML = card('Apertura media de los emails', '–', d.sinFiltro ? 'Indica en Configuración qué emails son de este embudo' : 'No hay emails enviados con ese nombre todavía', 'mail', 'info');
    return;
  }
  const r = d.resumen;
  box.innerHTML = [
    card('Apertura media de los emails', pctE(r.apertura), `${r.n} emails · ${r.aperturas.toLocaleString('es-ES')} aperturas de ${r.entregados.toLocaleString('es-ES')} entregados`, 'mail', 'info'),
    card('CTR medio de los emails', pctE(r.ctr), `clics / entregados · de quien abre, el ${pctE(r.ctor)} hace clic`, 'trend', 'live'),
  ].join('');
}
function pintarEmailsTabla(box, c, code) {
  if (c.error) { box.innerHTML = `<div class="notice err">${esc(c.error)}</div><button type="button" class="btn" data-em-recargar="${esc(code)}">Reintentar</button>`; return; }
  const d = c.datos;
  if (!d) return;
  if (!d.emails.length) {
    box.innerHTML = `<p class="muted">${d.sinFiltro ? 'Pon en la configuración del embudo el texto que llevan en el nombre sus emails de GHL (campañas o workflows), p. ej. «[VSL]».' : `No hay emails enviados que encajen (${esc(d.criterio)}). Si los emails tienen otro nombre, cámbialo en «Emails de este embudo» de la configuración.`}</p>`;
    return;
  }
  const orden = state.emailsOrden || 'fecha';
  const val = { fecha: (e) => e.fecha || '', apertura: (e) => e.apertura ?? -1, ctr: (e) => e.ctr ?? -1, ctor: (e) => e.ctor ?? -1 }[orden];
  const lista = [...d.emails].sort((a, b) => (orden === 'fecha' ? val(b).localeCompare(val(a)) : val(b) - val(a)));
  const r = d.resumen;
  const mejor = (k) => d.emails.filter((e) => e.fiable && e[k] != null).sort((a, b) => b[k] - a[k])[0];
  const peor = (k) => d.emails.filter((e) => e.fiable && e[k] != null).sort((a, b) => a[k] - b[k])[0];
  const mA = mejor('apertura');
  const pA = peor('apertura');
  const mC = mejor('ctr');
  box.innerHTML = `
    <div class="kpis em-kpis">
      ${card('Apertura media', pctE(r.apertura), `${r.n} emails · media ponderada por entregas`, 'mail', 'info')}
      ${card('CTR medio', pctE(r.ctr), 'clics / entregados', 'trend', 'live')}
      ${card('Clics sobre aperturas (CTOR)', pctE(r.ctor), 'de quien abre, cuántos hacen clic', 'target', 'buy')}
      ${card('Bajas', r.bajas.toLocaleString('es-ES'), `${pctE(r.entregados ? r.bajas / r.entregados : null)} de las entregas`, 'logout', 'accent')}
    </div>
    ${mA && pA && mA !== pA ? `<div class="em-destacados">
      <p>🏆 <strong>Mejor asunto:</strong> «${esc(mA.asunto || mA.nombre)}» · ${pctE(mA.apertura)} de apertura</p>
      ${mC ? `<p>🎯 <strong>Mejor llamada a la acción:</strong> «${esc(mC.nombre)}» · ${pctE(mC.ctr)} de CTR</p>` : ''}
      <p>🔧 <strong>Asunto a mejorar:</strong> «${esc(pA.asunto || pA.nombre)}» · ${pctE(pA.apertura)} de apertura</p>
    </div>` : ''}
    <div class="em-barra">
      <span class="muted small">${esc(d.criterio)} · el indicador compara cada email con la media del resto (±15%).</span>
      <span class="spacer"></span>
      <label class="field inline"><span>Ordenar por</span><select data-em-orden>
        ${[['fecha', 'Fecha'], ['apertura', 'Apertura'], ['ctr', 'CTR'], ['ctor', 'Clics sobre aperturas']].map(([v, l]) => `<option value="${v}" ${v === orden ? 'selected' : ''}>${l}</option>`).join('')}
      </select></label>
      <button type="button" class="btn" data-em-recargar="${esc(code)}">Actualizar</button>
    </div>
    <div class="table-scroll"><table class="metric-table em-table">
      <thead><tr><th>Email y asunto</th><th class="num">Entregados</th><th class="num">Apertura</th><th class="num">CTR</th><th class="num">Clics / aperturas</th><th>Qué mejorar</th></tr></thead>
      <tbody>${lista.map((e) => `<tr>
        <td><strong>${esc(e.nombre)}</strong>${e.tipo === 'workflow' ? `<span class="em-tipo">Workflow · ${esc(e.workflow || '')}</span>` : `<span class="em-tipo">Campaña${e.fecha ? ` · ${esc(fmtDay(e.fecha, { day: 'numeric', month: 'short', year: 'numeric' }))}` : ''}</span>`}
          <span class="em-asunto">${e.asunto ? `✉️ ${esc(e.asunto)}` : '<span class="muted">GHL no da el asunto de los emails de workflows</span>'}</span></td>
        <td class="num">${e.entregados.toLocaleString('es-ES')}</td>
        <td class="num"><strong>${pctE(e.apertura)}</strong><br>${nivelChip(e.niveles.apertura, e.difApertura)}</td>
        <td class="num"><strong>${pctE(e.ctr)}</strong><br>${nivelChip(e.niveles.ctr, e.difCtr)}</td>
        <td class="num">${pctE(e.ctor)}${e.niveles.ctor ? `<br>${nivelChip(e.niveles.ctor)}` : ''}</td>
        <td class="em-consejo">${esc(e.consejo)}</td></tr>`).join('')}
        <tr class="total"><td><strong>Media</strong></td><td class="num">${r.entregados.toLocaleString('es-ES')}</td><td class="num"><strong>${pctE(r.apertura)}</strong></td><td class="num"><strong>${pctE(r.ctr)}</strong></td><td class="num">${pctE(r.ctor)}</td><td></td></tr>
      </tbody></table></div>
    <p class="muted small">La apertura depende sobre todo del <strong>asunto</strong> (y del remitente y la hora); los clics sobre aperturas, del <strong>contenido y la llamada a la acción</strong>. Apple Mail marca como abiertos muchos emails sin leerlos, así que la apertura es orientativa: sirve para comparar emails entre sí.</p>`;
}
document.addEventListener('change', (e) => {
  const sel = e.target.closest('[data-em-orden]');
  if (!sel) return;
  state.emailsOrden = sel.value;
  const box = sel.closest('[data-em-code]');
  if (box) pintarEmailsTabla(box, emailsCache[box.dataset.emCode] || {}, box.dataset.emCode);
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-em-recargar]');
  if (!b) return;
  const code = b.dataset.emRecargar;
  b.disabled = true;
  b.textContent = 'Actualizando…';
  await cargarEmails(code, { fresh: true }).catch(() => {});
  for (const box of $$(`[data-em-code="${CSS.escape(code)}"]`)) {
    if (box.classList.contains('em-kpis')) pintarEmailsKpis(box, emailsCache[code] || {}); else pintarEmailsTabla(box, emailsCache[code] || {}, code);
  }
});


// ---------- Oferta del lanzamiento: entregables y bonus (Configuración → Oferta) ----------
const optsTipo = (lista, sel) => lista.map((t) => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''} title="${esc(t.largo || t.label)}${t.desc ? ` · ${esc(t.desc)}` : ''}">${t.icon} ${esc(t.label)}</option>`).join('');
const valorTxt = (v) => (v ? String(v).replace('.', ',') : '');
function filaEntregable(e = {}) {
  return `<div class="of-fila" data-of="entregable" data-id="${esc(e.id || '')}">
    <select class="of-tipo" aria-label="Tipo de entregable">${optsTipo(TIPOS_ENTREGABLE, e.tipo || 'grabado')}</select>
    <input class="of-nombre" maxlength="120" placeholder="Nombre (p. ej. Módulo 1: tu ciclo)" value="${esc(e.nombre || '')}">
    <input class="of-detalle" maxlength="300" placeholder="Detalle (opcional)" value="${esc(e.detalle || '')}">
    <input class="of-valor" inputmode="decimal" placeholder="Valor €" value="${esc(valorTxt(e.valor))}" aria-label="Valor en euros">
    <button type="button" class="btn ghost of-del" aria-label="Quitar">✕</button></div>`;
}
function filaBonus(b = {}, tipos = TIPOS_BONUS) {
  return `<div class="of-fila of-fila-bonus" data-of="bonus" data-id="${esc(b.id || '')}">
    <select class="of-tipo" aria-label="Tipo de bonus">${optsTipo(tipos, b.tipo || 'bonus')}</select>
    <input class="of-nombre" maxlength="120" placeholder="Nombre del bonus" value="${esc(b.nombre || '')}">
    <input class="of-detalle" maxlength="300" placeholder="Detalle (opcional)" value="${esc(b.detalle || '')}">
    <input class="of-valor" inputmode="decimal" placeholder="Valor €" value="${esc(valorTxt(b.valor))}" aria-label="Valor en euros">
    <label class="of-hasta"><span>Fin a mano <small>(opcional)</small></span><input type="datetime-local" class="of-hasta-in" value="${esc(b.hasta || '')}"></label>
    <button type="button" class="btn ghost of-del" aria-label="Quitar">✕</button>
    <span class="of-ventana muted small"></span></div>`;
}
function pintarOfertaEditor(oferta = {}) {
  $('#of-entregables').innerHTML = (oferta.entregables || []).map((e) => filaEntregable(e)).join('') || '';
  $('#of-bonus').innerHTML = (oferta.bonus || []).map((b) => filaBonus(b)).join('') || '';
  refrescarOfertaEditor();
}
const nuevoId = (p) => `${p}${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 4)}`;
function leerOfertaEditor() {
  const fila = (el) => ({ id: el.dataset.id || nuevoId(el.dataset.of === 'bonus' ? 'b' : 'e'), tipo: $('.of-tipo', el).value, nombre: $('.of-nombre', el).value.trim(), detalle: $('.of-detalle', el).value.trim(), valor: $('.of-valor', el).value.trim() });
  return {
    entregables: $$('#of-entregables .of-fila').map(fila).filter((x) => x.nombre),
    bonus: $$('#of-bonus .of-fila').map((el) => ({ ...fila(el), hasta: $('.of-hasta-in', el).value })).filter((x) => x.nombre),
  };
}
const fechaHoraCorta = (ms) => (ms == null ? '–' : new Date(ms).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
// Ventana de cada bonus y resumen de valor, con las fechas que hay ahora en el formulario.
function refrescarOfertaEditor() {
  let launch = null;
  try { launch = readForm().launch; } catch { launch = null; }
  // Sin código o etiqueta todavía: bastan las fechas del formulario.
  const datos = launch || {
    ...(state.config.launches[editingCode] || {}), fechaDirecto: $('#cfg-directo-fecha').value, horaDirecto: $('#cfg-directo-hora').value,
    aperturaCarrito: $('#cfg-apertura-carrito').value, cierreCarrito: $('#cfg-cierre').value,
  };
  for (const el of $$('#of-bonus .of-fila')) {
    const w = ventanaBonus({ tipo: $('.of-tipo', el).value, hasta: $('.of-hasta-in', el).value }, datos);
    $('.of-ventana', el).textContent = w.desde != null && w.hasta != null ? `Activo: ${fechaHoraCorta(w.desde)} → ${fechaHoraCorta(w.hasta)}` : 'Pon las fechas del directo y del carrito (pestaña Lanzamiento) para ver cuándo está activo.';
  }
  const o = leerOfertaEditor();
  const precio = dinero($('#cfg-precio-programa').value);
  const v = valorOferta({ entregables: o.entregables.map((e) => ({ valor: dinero(e.valor) })), bonus: o.bonus.map((b) => ({ valor: dinero(b.valor) })) }, precio);
  $('#of-resumen').innerHTML = `<span><strong>${o.entregables.length}</strong> entregables</span><span><strong>${o.bonus.length}</strong> bonus</span>${v.total ? `<span>Valor total <strong>${eur(v.total)}</strong></span>` : ''}${v.ratio ? `<span>= <strong>${v.ratio.toFixed(1).replace('.', ',')}×</strong> el precio</span>` : ''}`;
}
$('#of-add-entregable').addEventListener('click', () => { $('#of-entregables').insertAdjacentHTML('beforeend', filaEntregable()); $('#of-entregables .of-fila:last-child .of-nombre').focus(); refrescarOfertaEditor(); });
$('#of-add-bonus').addEventListener('click', () => { $('#of-bonus').insertAdjacentHTML('beforeend', filaBonus()); $('#of-bonus .of-fila:last-child .of-nombre').focus(); refrescarOfertaEditor(); });
for (const id of ['#of-entregables', '#of-bonus']) {
  $(id).addEventListener('click', (e) => { if (e.target.closest('.of-del')) { e.target.closest('.of-fila').remove(); refrescarOfertaEditor(); } });
  $(id).addEventListener('change', refrescarOfertaEditor);
  $(id).addEventListener('input', (e) => { if (e.target.matches('.of-valor')) refrescarOfertaEditor(); });
}
$('.tab[data-tab="oferta"]').addEventListener('click', refrescarOfertaEditor);

// ---------- Métricas → Oferta y bonus: la oferta frente a las ventas de cada día del carrito ----------
function renderOfertaAnalisis(launch) {
  const box = $('#oferta-analisis');
  if (!box) return;
  const oferta = launch.oferta || { entregables: [], bonus: [] };
  const precio = Number(launch.precioPrograma) || 0;
  const valor = valorOferta(oferta, precio);
  const chipB = (b) => { const t = tipoBonus(b.tipo); return `<span class="of-chip b-${b.tipo}" title="${esc(t.largo || t.label)} · ${esc(t.desc)}">${t.icon} ${esc(b.nombre)}</span>`; };
  const resumen = `<div class="of-oferta">
      <div><h4>📦 Entregables (${oferta.entregables.length})</h4>${oferta.entregables.length ? `<ul>${oferta.entregables.map((e) => `<li>${tipoEntregable(e.tipo).icon} <strong>${esc(e.nombre)}</strong> <span class="muted small">${esc(tipoEntregable(e.tipo).label)}${e.valor ? ` · ${eur(e.valor)}` : ''}</span></li>`).join('')}</ul>` : '<p class="muted small">Sin entregables.</p>'}</div>
      <div><h4>🎁 Bonus (${oferta.bonus.length})</h4>${oferta.bonus.length ? `<ul>${oferta.bonus.map((b) => `<li>${chipB(b)}${b.valor ? ` <span class="muted small">${eur(b.valor)}</span>` : ''}</li>`).join('')}</ul>` : '<p class="muted small">Sin bonus.</p>'}</div>
      <div class="of-valor-box"><span class="muted small">Precio</span><strong>${precio ? eur(precio) : '–'}</strong>${valor.total ? `<span class="muted small">Valor de la oferta</span><strong>${eur(valor.total)}</strong>` : ''}${valor.ratio ? `<span class="of-ratio">${valor.ratio.toFixed(1).replace('.', ',')}× el precio</span>` : ''}</div>
    </div>`;
  if (!oferta.entregables.length && !oferta.bonus.length) {
    box.innerHTML = `<p class="muted">Añade los entregables y los bonus del lanzamiento en <strong>Configuración → Oferta</strong> para ver aquí qué bonus empujan la venta cada día del carrito.</p>`;
    return;
  }
  const vpd = ventasPorDia(state.leads, launch);
  if (!vpd) {
    box.innerHTML = `${resumen}<p class="muted">Para cruzar la oferta con las ventas de cada día hace falta el <strong>día del directo</strong> y el <strong>campo de fecha de compra</strong> (Configuración → Lanzamiento).</p>`;
    return;
  }
  const a = analizarOferta(launch, vpd);
  const porId = new Map(oferta.bonus.map((b) => [b.id, b]));
  const max = Math.max(1, ...a.dias.map((d) => d.n));
  const tablaDias = `<h3 class="of-h3">Ventas de cada día del carrito y bonus activos</h3>
    <div class="table-scroll"><table class="metric-table of-dias"><thead><tr><th>Día</th><th class="num">Ventas</th><th></th><th>Bonus activos ese día</th></tr></thead><tbody>
    ${a.dias.map((d) => `<tr><td>${esc(dayFmt.format(new Date(`${d.day}T12:00:00Z`)))}</td><td class="num"><strong>${d.n}</strong>${d.importe ? `<br><span class="muted small">${eur(d.importe)}</span>` : ''}</td>
      <td class="of-barra"><div class="meter"><span style="width:${(d.n / max) * 100}%"></span></div></td>
      <td>${d.activos.map((id) => chipB(porId.get(id))).join(' ') || '<span class="muted small">Ninguno</span>'}${d.caducan.length ? `<div class="of-caduca">⏰ Hoy caduca: ${d.caducan.map((id) => esc(porId.get(id).nombre)).join(', ')}</div>` : ''}</td></tr>`).join('')}
    </tbody></table></div>`;
  const efectoChip = (x) => (x == null ? '–' : `<span class="em-niv ${x >= 1.5 ? 'alto' : x >= 1.1 ? 'medio' : 'bajo'}">${x.toFixed(1).replace('.', ',')}×</span>`);
  const tablaBonus = `<h3 class="of-h3">Impacto de cada bonus</h3>
    <div class="table-scroll"><table class="metric-table of-bonus-t"><thead><tr><th>Bonus</th><th>Activo</th><th class="num">Ventas en su ventana</th><th class="num">% del carrito</th><th class="num">Ventas/día activo vs. resto</th><th class="num">Día que caduca</th><th>Lectura</th></tr></thead><tbody>
    ${a.bonus.map((b) => `<tr><td>${chipB(b)}</td><td class="small">${fechaHoraCorta(b.ventana.desde)} →<br>${fechaHoraCorta(b.ventana.hasta)}</td>
      <td class="num"><strong>${b.ventas ?? 0}</strong></td><td class="num">${pctE(b.pctCarrito)}</td>
      <td class="num">${b.porDiaDentro != null ? `${b.porDiaDentro.toFixed(1).replace('.', ',')} vs ${b.porDiaFuera != null ? b.porDiaFuera.toFixed(1).replace('.', ',') : '–'}<br>${efectoChip(b.efecto)}` : '–'}</td>
      <td class="num">${b.ventasUltimoDia != null ? `${b.ventasUltimoDia}${b.urgencia != null ? `<br>${efectoChip(b.urgencia)}` : ''}` : '–'}</td>
      <td class="em-consejo">${esc(lecturaBonus(b))}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted small">Las ventas se cuentan por día (fecha de compra), así que un bonus de unas horas cuenta todo su día. «Ventas/día activo vs. resto»: media de ventas diarias mientras el bonus estaba activo frente a la de los días del carrito sin él. «Día que caduca»: ventas de ese día frente a la media del carrito (el efecto de la fecha límite). ${vpd.antes || vpd.despues || vpd.sinFecha ? `Fuera del carrito: ${vpd.antes} antes, ${vpd.despues} después y ${vpd.sinFecha} sin fecha.` : ''}</p>`;
  box.innerHTML = resumen + tablaDias + tablaBonus;
}

// ---------- Meteóricos: su oferta (entregables y bonus) y su impacto en las ventas hora a hora ----------
function pintarPaqueteMeteo(p = {}) {
  $('#mt-of-entregables').innerHTML = (p?.entregables || []).map((e) => filaEntregable(e)).join('');
  $('#mt-of-bonus').innerHTML = (p?.bonus || []).map((b) => filaBonus(b, TIPOS_BONUS_METEO)).join('');
  refrescarPaqueteMeteo();
}
function leerPaqueteMeteo() {
  const fila = (el) => ({ id: el.dataset.id || nuevoId(el.dataset.of === 'bonus' ? 'b' : 'e'), tipo: $('.of-tipo', el).value, nombre: $('.of-nombre', el).value.trim(), detalle: $('.of-detalle', el).value.trim(), valor: $('.of-valor', el).value.trim() });
  return {
    entregables: $$('#mt-of-entregables .of-fila').map(fila).filter((x) => x.nombre),
    bonus: $$('#mt-of-bonus .of-fila').map((el) => ({ ...fila(el), hasta: $('.of-hasta-in', el).value })).filter((x) => x.nombre),
  };
}
function refrescarPaqueteMeteo() {
  const m = { apertura: $('#mt-apertura').value, cierre: $('#mt-cierre').value };
  for (const el of $$('#mt-of-bonus .of-fila')) {
    const w = ventanaBonusMeteo({ tipo: $('.of-tipo', el).value, hasta: $('.of-hasta-in', el).value }, m);
    $('.of-ventana', el).textContent = w.desde != null && w.hasta != null ? `Activo: ${fechaHoraCorta(w.desde)} → ${fechaHoraCorta(w.hasta)}` : 'Pon cuándo abre y cierra la oferta (pestaña Producto y tiempos) para ver cuándo está activo.';
  }
  const o = leerPaqueteMeteo();
  const v = valorOferta({ entregables: o.entregables.map((e) => ({ valor: dinero(e.valor) })), bonus: o.bonus.map((b) => ({ valor: dinero(b.valor) })) }, dinero($('#mt-precio').value));
  $('#mt-of-resumen').innerHTML = `<span><strong>${o.entregables.length}</strong> entregables</span><span><strong>${o.bonus.length}</strong> bonus</span>${v.total ? `<span>Valor total <strong>${eur(v.total)}</strong></span>` : ''}${v.ratio ? `<span>= <strong>${v.ratio.toFixed(1).replace('.', ',')}×</strong> el precio</span>` : ''}`;
}
$('#mt-of-add-entregable').addEventListener('click', () => { $('#mt-of-entregables').insertAdjacentHTML('beforeend', filaEntregable()); $('#mt-of-entregables .of-fila:last-child .of-nombre').focus(); refrescarPaqueteMeteo(); });
$('#mt-of-add-bonus').addEventListener('click', () => { $('#mt-of-bonus').insertAdjacentHTML('beforeend', filaBonus({}, TIPOS_BONUS_METEO)); $('#mt-of-bonus .of-fila:last-child .of-nombre').focus(); refrescarPaqueteMeteo(); });
for (const id of ['#mt-of-entregables', '#mt-of-bonus']) {
  $(id).addEventListener('click', (e) => { if (e.target.closest('.of-del')) { e.target.closest('.of-fila').remove(); refrescarPaqueteMeteo(); } });
  $(id).addEventListener('change', refrescarPaqueteMeteo);
  $(id).addEventListener('input', (e) => { if (e.target.matches('.of-valor')) refrescarPaqueteMeteo(); });
}
$('.tab[data-tab="mt-paquete"]').addEventListener('click', refrescarPaqueteMeteo);

// Pestaña «Oferta» del embudo de meteóricos (y sección del downsell en el lanzamiento).
function renderMOfertaView() {
  pickMeteo();
  const lista = meteoDeEmbudo(state.embudo);
  llenarMeteoSelect($('#moferta-select'), lista, state.meteo.code, 'Aún no hay meteóricos');
  $('#moferta-config').hidden = !state.meteo.code || !puedeConfig();
  if (!state.meteo.code) { $('#moferta-body').innerHTML = '<div class="card empty"><h2>🎁 Sin meteóricos todavía</h2><p class="muted">Crea un meteórico en la pestaña Meteóricos y añade aquí su oferta.</p></div>'; return; }
  pintarOfertaMeteo($('#moferta-body'), state.meteo.code);
}
$('#moferta-select').addEventListener('change', (e) => { state.meteo.code = e.target.value; ls.set(`lsd_meteo_${state.embudo}`, state.meteo.code); renderMOfertaView(); });
$('#moferta-config').addEventListener('click', async () => {
  await abrirMeteoDialog(state.meteo.code, { embudo: state.embudo });
  $('#meteo-dialog .tab[data-tab="mt-paquete"]').click();
});

async function pintarOfertaMeteo(box, code) {
  const m = state.config.meteoricos?.[code];
  if (!m) { box.innerHTML = ''; return; }
  const p = m.paquete || { entregables: [], bonus: [] };
  const precio = Number(m.precio) || 0;
  const valor = valorOferta(p, precio);
  const chipB = (b) => { const t = tipoBonusMeteo(b.tipo); return `<span class="of-chip b-${b.tipo}" title="${esc(t.largo || t.label)} · ${esc(t.desc)}">${t.icon} ${esc(b.nombre)}</span>`; };
  const resumen = `<section class="card metric-card"><h2>🎁 La oferta <span class="muted">· ${esc(m.name)}${m.oferta ? ` · ${esc(m.oferta)}` : ''}</span></h2><div class="of-oferta">
      <div><h4>📦 Entregables (${p.entregables.length})</h4>${p.entregables.length ? `<ul>${p.entregables.map((e) => `<li>${tipoEntregable(e.tipo).icon} <strong>${esc(e.nombre)}</strong> <span class="muted small">${esc(tipoEntregable(e.tipo).label)}${e.valor ? ` · ${eur(e.valor)}` : ''}</span></li>`).join('')}</ul>` : '<p class="muted small">Sin entregables.</p>'}</div>
      <div><h4>🎁 Bonus (${p.bonus.length})</h4>${p.bonus.length ? `<ul>${p.bonus.map((b) => { const w = ventanaBonusMeteo(b, m); return `<li>${chipB(b)}${b.valor ? ` <span class="muted small">${eur(b.valor)}</span>` : ''}<br><span class="muted small">${fechaHoraCorta(w.desde)} → ${fechaHoraCorta(w.hasta)}</span></li>`; }).join('')}</ul>` : '<p class="muted small">Sin bonus.</p>'}</div>
      <div class="of-valor-box"><span class="muted small">Precio</span><strong>${precio ? eur(precio) : '–'}</strong>${valor.total ? `<span class="muted small">Valor de la oferta</span><strong>${eur(valor.total)}</strong>` : ''}${valor.ratio ? `<span class="of-ratio">${valor.ratio.toFixed(1).replace('.', ',')}× el precio</span>` : ''}</div>
    </div></section>`;
  if (!p.entregables.length && !p.bonus.length) {
    box.innerHTML = `${resumen}<p class="muted">Añade los entregables y los bonus (BAR 30 min, BAR 1 h…) en <strong>Editar la oferta</strong> para ver aquí qué bonus empujan la venta.</p>`;
    return;
  }
  box.innerHTML = `${resumen}<p class="muted">Cargando las ventas…</p>`;
  let d;
  try { d = await cargarMeteo(code); } catch (e) { box.innerHTML = `${resumen}<p class="error">${esc(e.message)}</p>`; return; }
  if (state.config.meteoricos?.[code] !== m) return;
  const momentos = d.compradores.map((c) => c.momento).filter((t) => t != null);
  const a = analizarOfertaMeteo(m, momentos, d.ventas);
  const efectoChip = (x) => (x == null ? '–' : `<span class="em-niv ${x >= 1.5 ? 'alto' : x >= 1.1 ? 'medio' : 'bajo'}">${x.toFixed(1).replace('.', ',')}×</span>`);
  const ritmo = (x) => (x == null ? '–' : `${x.toFixed(1).replace('.', ',')}/h`);
  const sinHora = !momentos.length
    ? `<div class="notice warn"><span>Para medir los bonus por horas hace falta la <strong>hora</strong> de cada compra. ${m.compraDateField ? 'El campo de fecha de compra de este meteórico solo guarda el día.' : 'Este meteórico no tiene campo de fecha de compra.'} En GHL, crea un campo de <strong>texto</strong>, haz que el workflow de compra lo rellene con la fecha y hora actuales (<code>{{right_now}}</code>) y elígelo en <strong>Configurar → Etiquetas y recursos → Campo de fecha de compra</strong>.</span></div>`
    : a.conHora < d.ventas ? `<p class="muted small">${a.conHora} de ${d.ventas} ventas tienen hora; el análisis usa esas.</p>` : '';
  const porId = new Map(p.bonus.map((b) => [b.id, b]));
  const max = Math.max(1, ...a.horas.map((h) => h.n));
  const horaFmt = (ms) => new Date(ms).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const tablaBonus = momentos.length ? `<section class="card metric-card"><h2>Impacto de cada bonus <span class="muted">· ventas por hora mientras estuvo activo frente al resto de la oferta</span></h2>
    <div class="table-scroll"><table class="metric-table of-bonus-t"><thead><tr><th>Bonus</th><th>Activo</th><th class="num">Ventas en su ventana</th><th class="num">% de la oferta</th><th class="num">Ritmo activo vs. resto</th><th class="num">Al final de su ventana</th><th>Lectura</th></tr></thead><tbody>
    ${a.bonus.map((b) => `<tr><td>${chipB(b)}</td><td class="small">${fechaHoraCorta(b.ventana.desde)} →<br>${fechaHoraCorta(b.ventana.hasta)}</td>
      <td class="num"><strong>${b.ventas ?? 0}</strong></td><td class="num">${pctE(b.pct)}</td>
      <td class="num">${b.sinDatos ? '–' : b.ritmoFuera == null ? ritmo(b.ritmoDentro) : `${ritmo(b.ritmoDentro)} vs ${ritmo(b.ritmoFuera)}<br>${efectoChip(b.efecto)}`}</td>
      <td class="num">${b.sinDatos || b.tipo === 'bonus' ? '–' : `${b.ventasFinal} en ${b.tramoMin} min${b.urgencia != null ? `<br>${efectoChip(b.urgencia)}` : ''}`}</td>
      <td class="em-consejo">${esc(lecturaBonusMeteo(b))}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted small">«Ritmo activo vs. resto»: ventas por hora mientras el bonus estaba activo frente a las del resto de la oferta. «Al final de su ventana»: ventas en el último tramo antes de que caduque frente al ritmo medio de la oferta (el efecto de la fecha límite).</p></section>` : '';
  const tablaHoras = a.horas.length && momentos.length ? `<section class="card metric-card"><h2>Ventas hora a hora <span class="muted">· y bonus activos</span></h2>
    <div class="table-scroll of-horas"><table class="metric-table of-dias"><thead><tr><th>Hora</th><th class="num">Ventas</th><th></th><th>Bonus activos</th></tr></thead><tbody>
    ${a.horas.map((h) => `<tr><td>${esc(horaFmt(h.desde))}</td><td class="num"><strong>${h.n}</strong></td><td class="of-barra"><div class="meter"><span style="width:${(h.n / max) * 100}%"></span></div></td><td>${h.activos.map((id) => chipB(porId.get(id))).join(' ') || '<span class="muted small">Ninguno</span>'}</td></tr>`).join('')}
    </tbody></table></div></section>` : '';
  box.innerHTML = resumen + sinHora + tablaBonus + tablaHoras;
}


// ---------- Ciclo de compra: días desde que el contacto entra en GHL hasta que compra ----------
// Media de TODAS las compradoras del producto (servidor, /api/ciclo) y las de este lanzamiento / VSL.
const cicloCache = {};
function mostrarCiclo(code, { kpi, detalle, propias = [], dateField, nombre, porTrafico = false }) {
  if (!code || !tiene('metricas')) return;
  const boxK = $(kpi);
  const boxD = $(detalle);
  const propio = dateField ? cicloDeContactos(propias, dateField) : null;
  const pintar = () => {
    const g = cicloCache[code];
    const todas = g?.datos?.ciclo;
    if (boxK) {
      boxK.innerHTML = !dateField
        ? card('Ciclo de compra medio', '–', 'Elige el campo de fecha de compra en Configuración', 'calendar', 'info')
        : card('Ciclo de compra medio', textoDias(todas?.media ?? propio?.media),
          todas?.n ? `mediana ${textoDias(todas.mediana)} · ${todas.n.toLocaleString('es-ES')} compradoras con fecha${propio?.n ? ` · ${nombre}: ${textoDias(propio.media)}` : ''}`
            : g?.cargando ? `${nombre}: ${propio?.n ? `${propio.n} compradoras` : 'sin compras con fecha'} · calculando el de todas…`
              : propio?.n ? `${nombre} (${propio.n} compradoras) · mediana ${textoDias(propio.mediana)}` : 'Aún no hay compras con fecha', 'calendar', 'info');
    }
    if (boxD) boxD.innerHTML = cicloDetalle({ todas, propio, nombre, error: g?.error, porTrafico: porTrafico ? propias : null, dateField });
  };
  if (dateField && !cicloCache[code]?.datos && !cicloCache[code]?.cargando) {
    cicloCache[code] = { cargando: true };
    api(`/api/ciclo?l=${encodeURIComponent(code)}`).then((datos) => { cicloCache[code] = { datos }; }).catch((e) => { cicloCache[code] = { error: e.message }; }).finally(pintar);
  }
  pintar();
}
function cicloDetalle({ todas, propio, nombre, error, porTrafico, dateField }) {
  if (!dateField) return '<p class="muted">Para medir el ciclo de compra hace falta el <strong>campo de fecha de compra</strong> (Configuración).</p>';
  const col = (titulo, c, extra = '') => `<div class="ciclo-col"><h4>${titulo}</h4>${!c ? `<p class="muted small">${extra || 'Calculando…'}</p>` : !c.n ? '<p class="muted small">Sin compras con fecha.</p>' : `
    <div class="ciclo-cifras"><div><span class="muted small">Media</span><strong>${textoDias(c.media)}</strong></div><div><span class="muted small">Mediana</span><strong>${textoDias(c.mediana)}</strong></div><div><span class="muted small">La mitad, entre</span><strong>${textoDias(c.p25)} y ${textoDias(c.p75)}</strong></div></div>
    ${c.tramos.map((t) => `<div class="ciclo-tramo"><span>${t.label}</span><div class="meter"><span style="width:${Math.round(t.pct * 100)}%"></span></div><span class="num">${t.n} <span class="muted small">${Math.round(t.pct * 100)}%</span></span></div>`).join('')}
    <p class="muted small">${c.n.toLocaleString('es-ES')} compradoras con fecha${c.sinFecha ? ` · ${c.sinFecha} más sin fecha de compra válida (no cuentan)` : ''}</p>`}</div>`;
  let trafico = '';
  if (porTrafico?.length) {
    const g = (t) => cicloDeContactos(porTrafico.filter((l) => l.s.trafico === t), dateField);
    const fr = g('frio');
    const te = g('templado');
    if (fr.n || te.n) trafico = `<p class="ciclo-trafico">❄️ Tráfico frío (entraron en este lanzamiento): <strong>${textoDias(fr.media)}</strong> de media (${fr.n}) · 🔥 Templado (ya estaban en la base de datos): <strong>${textoDias(te.media)}</strong> de media (${te.n})</p>`;
  }
  return `<div class="ciclo-grid">${col('Todas las compradoras', todas, error ? esc(error) : '')}${col(`Compradoras de ${nombre}`, propio)}</div>${trafico}
    <p class="muted small">Desde la fecha de creación del contacto en GHL hasta la fecha de compra del producto principal. Cambia con el tiempo: es una idea general de cuánto tarda una persona en comprar desde que te conoce.</p>`;
}
