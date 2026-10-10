import {
  ESTADOS, NEXT_STEPS, buildMessage, waPhone, tagFor, LAUNCH_CODE_RE, THRESHOLDS, watched, SNAPSHOT_TAGS, fotosPendientes, OUTCOMES, dayInMadrid,
  score as puntuar, estadoFor,
} from './scoring.js';
import { icon } from './icons.js';
import { nombreProducto, conProducto, PRODUCTO_MLDLM } from './producto.js';
import { asistenciaPorTrafico, resumenEncuesta, resumenTrafico, importeCompra, enrichLead, computeMetrics, bySource, rankingGanadores, historicoAnuncios, ventasPorDia, porRespuesta, avisosLanzamiento, perfilesCompradoras, describirAvatar, avatarDeLead } from './metrics.js';
import { LINK_KEYS, phaseAt, barFor, formatLong, formatDate, phasesFor, madridToEpoch, CAJAS_PAGO, numeroWhatsApp, enlaceWhatsApp, leerEnlaceWhatsApp } from './page.js';
import { FORMATOS, formatoValido, videosDe, esEnDirecto, sigDirecto, sigReplay, nClases, clasesDe, conVip, esReto } from './videos.js';
import { ESCENARIOS, ROAS_OBJETIVO_DEF, MIN_REGISTROS, resumenLanzamiento, prevision, resumenManual, medias, supuestosEscenario, inversionRecomendada, proyeccion, planificar, PLAN_DEF } from './calculadora.js';
import { rendimientoEquipo } from './rendimiento.js';
import { FASES_METEORICO, faseMeteorico, horasOferta, pendientesMeteorico, hitosMeteorico, fasesMeteoricoCal } from './meteorico.js';
import { PLANES_SUSCRIPCION, esSuscripcion, planesActivos, pendientesPago, vipSinIva, TIPOS_BUMP } from './pago.js';
import { cicloDeContactos, textoDias } from './ciclo.js';
import { TIPOS_BONUS, TIPOS_BONUS_METEO, TIPOS_ENTREGABLE, tipoBonus, tipoBonusMeteo, tipoEntregable, etiquetaEntregable, SUBTIPOS_ENTREGABLE, OBJETIVOS_BONUS, objetivoBonus, textoGarantia, ventanaBonus, valorOferta, analizarOferta, lecturaBonus, dinero } from './oferta.js';
import { ventanaBonusMeteo, analizarOfertaMeteo, lecturaBonusMeteo } from './oferta-meteo.js';
import { alertasCarrito } from './alertas.js';
import { BLOQUES, pesosDe, proponerPesos, pesosEfectivos } from './pesos.js';
import { tieneRecurso, recursosDe, sanitizeRecursos, etapasPreclase, TIPOS_RECURSO, RECURSOS_EXTRA } from './recursos.js';
import { retrospectiva } from './retrospectiva.js';
import { diasCarrito, cierrePorDias, diasCarritoValido, CANALES_CARRITO, MAX_ENVIOS_DIA } from './carrito.js';
import { leerLeads, guardarLeads, borrarCopias } from './cache-leads.js';
import { INDICADORES, indicadoresLanzamiento, indicadoresVsl, mediaIndicadores, diferencias, alertas, ultimosMeses } from './comparar.js';
import { fasesDe, puedeMarcar, esMia, vencida, addDays, vencidasEquipo, SUBS_PREPARACION, subDe, columnaDe, COLUMNA_HECHAS, COLOR_COLUMNAS } from './tareas.js';
import { hitosLanzamiento, fasesLanzamiento, EVENTO_TIPOS } from './calendario.js';
import { RESULTADOS, MOTIVOS, metricasLlamadas, FASES_LLAMADA, fasesPorContacto } from './llamadas.js';
import { PERMISOS, PERMISOS_DATOS, idDeRol, ROL_CLIENTE } from './roles.js';
import { auditarLanzamiento, auditarVsl, proximoHito, diasHasta, cuando, fechaCortaAud } from './auditor.js';
import { PESTANAS, SECCIONES, CATEGORIAS, SUBTIPOS_VSL, SUBTIPO_IDS, conPrep, subtipoValido, textosVsl, pestanasSugeridas, guiaEmbudo, guiaCliente, guiaHtml as guiaPasosHtml } from './embudos-def.js';
import { rangoDe, semanasDelMes, enrichVsl, computeVsl, porSemanas, porDias, ESTADOS_VSL, importeVsl, addDay } from './embudo-vsl.js';
import { claveTelefono, leerMiembros } from './grupos-wa.js';
import { TIPOS_MSG, ESTADOS_MSG, GUIA_ARCHIVOS, parsearSecuencia, promptCalentamiento, datosEmbudo, faltaMensaje, faltaEnlaceDirecto, sanitizeMensaje, nuevoIdMsg } from './calentamiento.js';
import { PARTES_DIRECTA, PAGINAS_DIRECTA, partesPorDefecto, conParte, pendientesDirecta } from './directa.js';
import { abrirPanelMarca, marcaDeEmbudo } from './marca-panel.js';
import { montarAsistente } from './marca-asistente.js';
import { contextoMarca, nombreDeProducto, disenoTexto } from './marca.js';
import { paginasDe, codigosDePagina, promptPagina } from './paginas.js';
import { objetivosDe, ganadoresTexto, PROMPTS_ANUNCIOS, nombresEvento } from './anuncios.js';
import { sanitizeRich, richToHtml, richToText, richTieneVideo, richTieneEnlace, videoEmbed, safeHref } from './richtext.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const PAGE_SIZE = 100;

const state = {
  meteo: { code: '', datos: {} }, // ⚡ meteóricos: el elegido y sus métricas
  directa: { datos: null, id: '', cargando: false, buscar: '', filtro: '' }, // 🛒 venta directa: métricas del rango
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
  for (const el of [root, ...root.querySelectorAll('[placeholder],[title],[aria-label],[data-ayuda]')]) {
    for (const a of ['placeholder', 'title', 'aria-label', 'data-ayuda']) { const v = el.getAttribute?.(a); if (v && v.includes(PRODUCTO_MLDLM)) el.setAttribute(a, v.replace(re, n)); }
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
  $('#asistente-marca').hidden = true;
  $('#asistente-marca').innerHTML = '';
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
const VIEW_EMBUDO = { vmetricas: 'vsl', vleads: 'vsl', vanuncios: 'vsl', llamadas: 'ambos', tareas: 'todos', calendario: 'todos', comparar: 'ambos', rendimiento: 'ambos', meteoricos: 'meteorico', moferta: 'meteorico', dmetricas: 'directa', dclientes: 'directa', grupowa: 'lanzmeteo', paginas: 'todos', anuncios: 'todos' };
const VIEW_PERMISO = { vmetricas: 'metricas', vleads: 'leads', vanuncios: 'avatar', meteoricos: 'metricas', moferta: 'metricas', dmetricas: 'metricas', dclientes: 'leads', grupowa: 'carrito', paginas: 'config', anuncios: 'config' };
const tiposVista = (v) => ({ ambos: ['lanz', 'vsl'], todos: ['lanz', 'vsl', 'meteorico', 'directa'], lanzmeteo: ['lanz', 'meteorico'] }[VIEW_EMBUDO[v]] || [VIEW_EMBUDO[v] || 'lanz']);
// Embudos del cliente (menú lateral): { id, tipo: 'lanzamientos' | 'vsl', nombre }. state.embudo = id del activo.
const embudos = () => state.config?.embudos || [];
const embudoInfo = (id = state.embudo) => embudos().find((e) => e.id === id) || null;
const enVsl = () => embudoInfo()?.tipo === 'vsl';
const enMeteo = () => embudoInfo()?.tipo === 'meteorico';
const enDirecta = () => embudoInfo()?.tipo === 'directa';
const tipoActual = () => (enVsl() ? 'vsl' : enMeteo() ? 'meteorico' : enDirecta() ? 'directa' : 'lanz');
// Pestañas que el embudo tiene activadas (⚙️ del menú lateral; sin lista = todas).
const pestanasEmbudo = () => embudoInfo()?.pestanas || null;
const allowedViews = () => VIEWS.filter((v) => tiposVista(v).includes(tipoActual())
  // El calendario es el del cliente (todos sus embudos): está en todos.
  && (!pestanasEmbudo() || pestanasEmbudo().includes(v) || v === 'calendario'
    // «Oferta» es nueva: los embudos de meteóricos con pestañas elegidas antes la ven junto a «Meteóricos».
    || (v === 'moferta' && pestanasEmbudo().includes('meteoricos'))
    // «En directo» es nueva: los embudos con pestañas elegidas antes la ven junto a Setting hoy o Llamadas.
    || (v === 'endirecto' && (pestanasEmbudo().includes('hoy') || pestanasEmbudo().includes('llamadas')))
    // «Carrito» es nueva: los embudos con pestañas elegidas antes la ven junto a Calendario o Tareas.
    || (v === 'carrito' && (pestanasEmbudo().includes('tareas') || pestanasEmbudo().includes('objetivos')))
    // «Grupo de WhatsApp» es nueva: la ven los embudos con pestañas elegidas antes que tengan Tareas o Carrito.
    || (v === 'grupowa' && (pestanasEmbudo().includes('tareas') || pestanasEmbudo().includes('carrito')))
    // «Páginas» es nueva: la ven los embudos con pestañas elegidas antes que tengan Tareas.
    || ((v === 'paginas' || v === 'anuncios') && pestanasEmbudo().includes('tareas')))
  && (v === 'tareas' || v === 'calendario' || tiene(VIEW_PERMISO[v] || v)));
// Código del embudo activo para tareas y llamadas: el lanzamiento elegido o el id de la VSL.
const codigo = () => (enVsl() || enDirecta() ? state.embudo : enMeteo() ? state.meteo.code : state.launchCode);
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
  if (role === ROL_CLIENTE) { pintarFotoCuenta(); if (!(await asistenteMarcaCliente())) await mostrarPortal(); return; }
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
  else if (VIEW_EMBUDO[hash] === 'directa' && primero('directa')) state.embudo = embudoInfo(guardado)?.tipo === 'directa' ? guardado : primero('directa');
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
  if (enDirecta()) { cargarDirecta({ fresh: true }); if (codigo()) loadTareas(); return; }
  return selectLaunch(state.launchCode, { forzar: true });
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
    const sub = e.tipo === 'meteorico' ? `${nMeteo} meteórico${nMeteo === 1 ? '' : 's'}` : e.tipo === 'directa' ? 'Venta directa · siempre abierto' : tv ? `${tv.corto} · siempre abierto`
      : (() => { const n = Object.values(state.config.launches).filter((l) => embudoDeLanz(l) === e.id).length; return `${n} lanzamiento${n === 1 ? '' : 's'}`; })();
    return `<div class="sb-row"><button type="button" class="sb-item ${e.id === state.embudo ? 'active' : ''}" data-embudo="${esc(e.id)}"><span class="sb-ico" aria-hidden="true">${e.tipo === 'meteorico' ? '⚡' : e.tipo === 'directa' ? '🛒' : tv ? tv.ico : esReto(e.formato) ? '🏁' : '🚀'}</span><span class="sb-txt"><strong>${esc(e.nombre)}</strong><small>${esc(sub)}</small></span></button>${puedeConfig() ? `<button type="button" class="sb-edit" data-emb-edit="${esc(e.id)}" title="Pestañas, nombre y guía de «${esc(e.nombre)}»" aria-label="Ajustes del embudo">⚙️</button>` : ''}</div>`;
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
  document.body.classList.toggle('embudo-directa', enDirecta());
  pintarSidebar();
  renderSnapshotWarning();
  // Cliente sin embudos todavía.
  const sin = !embudos().length;
  $('#sin-embudos').hidden = !sin;
  if (sin) { $('#dashboard').hidden = true; $('#empty-state').hidden = true; return; }
  // Cada embudo de lanzamientos enseña solo sus lanzamientos.
  if (!enVsl() && !enMeteo() && !enDirecta()) {
    renderLaunchSelect();
    if (!state.config.launches[state.launchCode] || embudoDeLanz(state.config.launches[state.launchCode]) !== state.embudo) state.launchCode = pickInitialLaunch();
  }
  if (enVsl() && state.vsl.code !== state.embudo) Object.assign(state.vsl, { code: state.embudo, leads: null, raw: null, meta: null });
  $$('.view-tab').forEach((t) => { t.hidden = t.dataset.viewGrupo ? !GRUPOS[t.dataset.viewGrupo].some((v) => allowedViews().includes(v)) : !allowedViews().includes(t.dataset.view); });
  $$('.subview-tab[data-view]').forEach((t) => { t.hidden = !allowedViews().includes(t.dataset.view); });
  // Secciones de Métricas y Leads que el embudo tiene quitadas.
  $$('.msubs').forEach((nav) => pintarMsub(nav, ls.get(`lsd_${nav.id}`)));
  const guardada = ls.get(`lsd_view_${state.embudo}`) || (enVsl() ? '' : ls.get('lsd_view'));
  const quiero = [vista, guardada].find((v) => v && allowedViews().includes(v));
  if (enMeteo()) pickMeteo();
  if (enDirecta() && state.directa.id !== state.embudo) Object.assign(state.directa, { id: state.embudo, datos: null });
  const porDefecto = enVsl() ? ['vmetricas', 'vleads', 'llamadas', 'tareas'] : enMeteo() ? ['meteoricos'] : enDirecta() ? ['dmetricas', 'dclientes', 'tareas'] : ['leads', 'hoy', 'tareas'];
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
  } else if (enDirecta()) {
    $('#empty-state').hidden = true;
    $('#dashboard').hidden = false;
    notice('');
    cargarDirecta();
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
  // Las tareas de todos los embudos (para «Te han mencionado»), si aún no están.
  if (!state.tareas) loadTareas().catch(() => {}); else if (!state.tareasOtros) cargarTareasOtro().catch(() => {});
  // Cada embudo y cada meteórico en su propia petición (cada una con su límite de peticiones a GHL).
  state.inicio.embudos = lista.embudos.map((e) => ({ ...e, cargando: true }));
  state.inicio.meteoricos = lista.meteoricos.map((m) => ({ ...m, cargando: true }));
  pintarInicio();
  const tareas = [
    ...lista.embudos.map((e, i) => cargarEmbudoInicio(e, i, fresh)),
    ...lista.meteoricos.map((m, i) => cargarMeteoInicio(m, i, fresh)),
    conLimite(q('parte=agenda')).then((d) => { state.inicio.agenda = d; }, (err) => { state.inicio.agenda = { error: err.message }; }),
  ].map((p) => p.then(() => { if (token === state.inicioToken) pintarInicio(); }));
  await Promise.all(tareas);
}
// Cada tarjeta deja de esperar al minuto (GHL lento o caído) y enseña «Reintentar» en vez de quedarse cargando.
const conLimite = (p, ms = 60_000) => Promise.race([p, new Promise((_, rej) => { setTimeout(() => rej(new Error('Tarda demasiado en responder (GHL va lento).')), ms); })]);
const qInicio = (qs, fresh) => api(`/api/inicio?${qs}${fresh ? '&fresh=1' : ''}`);
function cargarEmbudoInicio(e, i, fresh) {
  return conLimite(qInicio(`parte=embudo&id=${encodeURIComponent(e.id)}`, fresh))
    .then((d) => { state.inicio.embudos[i] = d.embudo; }, (err) => { state.inicio.embudos[i] = { tipo: 'error', tipoOrig: e.tipo, id: e.id, nombre: e.nombre, error: err.message }; });
}
function cargarMeteoInicio(m, i, fresh) {
  return conLimite(qInicio(`parte=meteorico&id=${encodeURIComponent(m.code)}`, fresh))
    .then((d) => { state.inicio.meteoricos[i] = d.meteorico; }, (err) => { state.inicio.meteoricos[i] = { code: m.code, nombre: m.nombre, error: err.message }; });
}
$('#inicio-embudos').addEventListener('click', (e) => {
  const b = e.target.closest('[data-reintentar]');
  if (!b) return;
  e.stopPropagation();
  const [tipo, i] = b.dataset.reintentar.split(':');
  const lista = tipo === 'embudo' ? state.inicio.embudos : state.inicio.meteoricos;
  const item = lista[Number(i)];
  lista[Number(i)] = tipo === 'embudo' ? { id: item.id, nombre: item.nombre, tipo: item.tipoOrig, cargando: true } : { code: item.code, nombre: item.nombre, cargando: true };
  pintarInicio();
  (tipo === 'embudo' ? cargarEmbudoInicio({ id: item.id, nombre: item.nombre, tipo: item.tipoOrig }, Number(i), true) : cargarMeteoInicio({ code: item.code, nombre: item.nombre }, Number(i), true)).then(pintarInicio);
});
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
    card('Facturación total', eur(fact), 'último lanzamiento de cada embudo · VSL y venta directa (30 días) · meteóricos recientes', 'coins', 'money'),
    card('Ventas', sum('ventas').toLocaleString('es-ES'), `${lista.length} embudo${lista.length === 1 ? '' : 's'}${metas.length ? ` y ${metas.length} meteórico${metas.length === 1 ? '' : 's'}` : ''}`, 'cart', 'buy'),
    card('Inversión', inv ? eur(inv) : '–', inv ? `ROAS conjunto ${(fact / inv).toFixed(2).replace('.', ',')}x` : 'sin inversión registrada', 'megaphone', 'accent'),
  ].join('');
  const cifra = (label, v) => `<span>${label}<strong>${v}</strong></span>`;
  const roasIni = (r) => (r != null ? `${r.toFixed(2).replace('.', ',')}x` : '–');
  const obj = (o) => (o?.length ? `<div class="muted small">🎯 ${o.map((x) => `${esc(x.label)}: ${Math.round((x.pct || 0) * 100)}%`).join(' · ')}</div>` : '');
  const tarjetas = [
    ...lista.map((e) => {
      if (e.cargando) return `<div class="card inicio-emb"><h3>${e.tipo === 'vsl' ? '🎬' : e.tipo === 'directa' ? '🛒' : '🚀'} ${esc(e.nombre)}</h3><p class="muted small">Cargando…</p></div>`;
      if (e.tipo === 'directa') {
        return `<button type="button" class="card inicio-emb" data-ir-inicio="directa" data-code="${esc(e.code)}">
        <h3>🛒 ${esc(e.nombre)} <span class="badge tone-info">Últimos 30 días</span></h3>
        <div class="ie-cifras">${cifra('Ventas', e.kpis.ventas)}${cifra('Facturación', eur(e.kpis.facturacion || 0))}${cifra('ROAS', roasIni(e.kpis.roas))}</div>
        <div class="ie-cifras ie-sec">${cifra('Coste por venta', eur(e.kpis.cac))}${cifra('Ticket medio', eur(e.kpis.ticket))}${(e.extras || []).map((x) => cifra(`${x.tipo === 'bump' ? 'Bump' : x.tipo === 'upsell' ? 'Upsell' : 'Downsell'} · ${esc(x.nombre)}`, `${x.pct != null ? `${Math.round(x.pct * 1000) / 10}%`.replace('.', ',') : '–'} <small>(${x.n})</small>`)).join('')}</div></button>`;
      }
      if (e.tipo === 'error') return `<div class="card inicio-emb"><h3>${esc(e.nombre)}</h3><p class="error small">${esc(e.error)}</p><button type="button" class="btn small" data-reintentar="embudo:${state.inicio.embudos.indexOf(e)}">Reintentar</button></div>`;
      const est = e.tipo === 'vsl' ? ['Últimos 30 días', 'info'] : ESTADO_LANZ[e.estado] || ['', 'muted'];
      return `<button type="button" class="card inicio-emb" data-ir-inicio="${e.tipo === 'vsl' ? 'vsl' : 'lanz'}" data-code="${esc(e.code)}" data-embudo="${esc(e.embudoId || '')}">
        <h3>${e.tipo === 'vsl' ? '🎬' : '🚀'} ${esc(e.nombre)} <span class="badge tone-${est[1]}">${est[0]}</span></h3>
        ${e.embudo ? `<span class="muted small">${esc(e.embudo)}</span>` : ''}
        <div class="ie-cifras">${e.tipo === 'vsl'
          ? `${cifra('Ventas', e.kpis.ventas)}${cifra('Facturación', eur(e.kpis.facturacion || 0))}${cifra('ROAS', roasIni(e.kpis.roas))}`
          : `${cifra('Leads', (e.kpis.registros || 0).toLocaleString('es-ES'))}${cifra('CPL medio', eur(e.kpis.cpl))}${e.kpis.vip != null ? cifra('Entradas VIP', e.kpis.vip) : ''}${cifra('Inversión', e.kpis.inversion ? eur(e.kpis.inversion) : '–')}${cifra('ROAS', roasIni(e.kpis.roas))}`}</div>
        ${e.tipo !== 'vsl' ? `<div class="ie-cifras ie-sec">${cifra('Ventas', e.kpis.ventas)}${cifra('Facturación', eur(e.kpis.facturacion || 0))}${(e.kpis.bumps || []).map((b) => cifra(`Bump · ${esc(b.nombre)}`, `${b.pct != null ? `${Math.round(b.pct * 1000) / 10}%`.replace('.', ',') : '–'} <small>(${b.n} vendidos)</small>`)).join('')}</div>` : ''}${obj(e.objetivos)}</button>`;
    }),
    ...metas.map((m) => {
      if (m.cargando) return `<div class="card inicio-emb"><h3>⚡ ${esc(m.nombre)}</h3><p class="muted small">Cargando…</p></div>`;
      if (m.error) return `<div class="card inicio-emb"><h3>⚡ ${esc(m.nombre)}</h3><p class="error small">${esc(m.error)}</p><button type="button" class="btn small" data-reintentar="meteo:${state.inicio.meteoricos.indexOf(m)}">Reintentar</button></div>`;
      const f = FASE_METEO_TXT[m.fase] || ['', 'muted'];
      return `<button type="button" class="card inicio-emb" data-ir-inicio="meteo" data-code="${esc(m.code)}">
        <h3>⚡ ${esc(m.nombre)} <span class="badge tone-${f[1]}">${f[0]}</span></h3>
        ${m.lanzamiento ? `<span class="muted small">Downsell de ${esc(state.config.launches[m.lanzamiento]?.name || m.lanzamiento)}</span>` : ''}
        <div class="ie-cifras">${cifra('Ventas', m.ventas)}${cifra('Facturación', eur(m.facturacion || 0))}${cifra('ROAS', m.roas != null ? `${m.roas.toFixed(2).replace('.', ',')}x` : '–')}</div>${obj(m.objetivos)}</button>`;
    }),
  ];
  $('#inicio-embudos').innerHTML = tarjetas.join('') || '<p class="muted">Aún no hay lanzamientos empezados, VSL ni meteóricos recientes.</p>';
  pintarMencionesInicio();
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
    if (ir.dataset.irInicio === 'directa') return setEmbudo(code, { vista: 'dmetricas' });
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

// `forzar`: vuelve a descargar los leads aunque la copia del navegador sea reciente (Recargar, tras etiquetar).
async function selectLaunch(code, { forzar = false } = {}) {
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
  if (tieneDatos()) await loadLeads({ forzar });
}

// ---------- Carga de leads (paginada contra GHL) ----------
// Copia del navegador de hace menos de esto: se usa tal cual, sin volver a pedir los leads a GHL.
const LEADS_FRESCOS_MS = 10 * 60_000;
async function loadLeads({ forzar = false } = {}) {
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
    aplicarVisitas();
  } else if (state.leadsDe !== state.launchCode) {
    state.leads = []; // sin copia: no se quedan a la vista los de otro lanzamiento
    state.leadsDe = state.launchCode;
    state.page = 0;
    render();
  }
  // Votos y visitas no dependen de los leads: se piden una vez (y se aplican también a los que lleguen).
  cargarVotos();
  cargarVisitas();
  if (!forzar && copia?.contacts.length && Date.now() - copia.at < LEADS_FRESCOS_MS) {
    loadMeta(token);
    $('#btn-reload').disabled = false;
    return;
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
    aplicarVisitas();
    render();
    loadMeta(token);
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
  const l = enrichLead(contact, state.launchCode, state.config);
  // ¿Está en el grupo de WhatsApp del lanzamiento? (cruce por teléfono con SendFlow, si ya se ha cargado)
  if (state.grupoWa?.code === state.launchCode && state.grupoWa.claves) l.s.enGrupo = state.grupoWa.claves.has(claveTelefono(contact.phone));
  return l;
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

let buscarTimer = null;
$('#f-search').addEventListener('input', (e) => { state.filters.search = e.target.value; state.page = 0; clearTimeout(buscarTimer); buscarTimer = setTimeout(renderTabla, 120); });
$('#f-estado').addEventListener('change', (e) => { state.filters.estado = e.target.value; state.page = 0; renderTabla(); });
$('#f-step').addEventListener('change', (e) => { state.filters.step = e.target.value; state.page = 0; renderTabla(); });
$('#f-signal').addEventListener('change', (e) => { state.filters.signal = e.target.value; state.page = 0; renderTabla(); });
$('#f-pending').addEventListener('change', (e) => { state.filters.pending = e.target.checked; state.page = 0; renderTabla(); });
$('#f-avatar').addEventListener('change', (e) => { state.filters.avatar = e.target.checked; state.page = 0; renderTabla(); });
$('#page-prev').addEventListener('click', () => { state.page--; renderTabla(); window.scrollTo({ top: 0 }); });
$('#page-next').addEventListener('click', () => { state.page++; renderTabla(); window.scrollTo({ top: 0 }); });
$$('.leads th[data-sort]').forEach((th) => th.addEventListener('click', () => {
  const key = th.dataset.sort;
  state.sort = state.sort.key === key
    ? { key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: key === 'name' ? 'asc' : 'desc' };
  renderTabla();
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
  // Test del área preclase (va después de la clase 1): solo si el lanzamiento lo tiene.
  $('#th-test').hidden = !launch || !tieneRecurso(launch, 'test');
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
  renderTabla();
  if (!$('#view-leads').hidden && !$('#enc-leads').parentElement.hidden) renderEncuestaLeads();
  if (!$('#view-carrito').hidden) renderCarritoVista();
}

// Solo la tabla de leads (filtros, orden y páginas): no hace falta recalcular métricas, auditor ni avatares.
function renderTabla() {
  const rows = filtered();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.page = Math.min(Math.max(0, state.page), pages - 1);
  const slice = rows.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);
  $('#leads-body').innerHTML = slice.map(rowHtml).join('')
    || '<tr><td colspan="14" class="muted">No hay leads con estos filtros.</td></tr>';
  $('#page-info').textContent = rows.length
    ? `${state.page * PAGE_SIZE + 1}–${state.page * PAGE_SIZE + slice.length} de ${rows.length} leads`
    : '0 leads';
  $('#page-prev').disabled = state.page === 0;
  $('#page-next').disabled = state.page >= pages - 1;
  $$('.leads th[data-sort]').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.sort === state.sort.key);
    th.classList.toggle('asc', state.sort.dir === 'asc');
  });
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
// «?» de cada tarjeta: cómo se calcula y de dónde sale el dato (por el título de la tarjeta, o su comienzo).
const AYUDA_KPI = {
  'Leads totales': 'Contactos de GHL con la etiqueta de registro del lanzamiento. Debajo, los que están en los grupos de WhatsApp (cruce por teléfono con SendFlow, sin administradoras; «≈» = aproximado con entradas − salidas mientras se cruza).',
  'CPL medio': 'Inversión ÷ leads totales. La inversión es la de Meta (campañas con el código del lanzamiento en el nombre, desde el inicio de captación) o, si Meta no da nada, la puesta a mano en Configuración.',
  'Coste por lead': 'Inversión ÷ leads totales (CPL medio).',
  'CPL de publicidad': 'Inversión ÷ leads con la etiqueta de publicidad (sin los orgánicos).',
  'Coste por lead de publicidad': 'Inversión ÷ leads con la etiqueta de publicidad (sin los orgánicos).',
  'CPL de tráfico frío': 'Inversión ÷ leads que no estaban en GHL antes del inicio de captación.',
  'Entradas VIP vendidas': 'Leads con la etiqueta de compra de la VIP en este lanzamiento (no cuenta quien la tenía de un lanzamiento anterior).',
  'Inversión en publicidad': 'Lo gastado en Meta en las campañas con el código del lanzamiento en el nombre, desde el inicio de captación hasta el siguiente lanzamiento (o hoy).',
  'Inversión en anuncios': 'Lo gastado en Meta en las campañas con el código del lanzamiento en el nombre, desde el inicio de captación.',
  Inversión: 'Lo gastado en Meta en las campañas de este embudo en el periodo.',
  ROAS: 'Facturación sin IVA ÷ inversión. La facturación suma el programa, las entradas VIP y los bump offers activos.',
  'ROAS de publicidad': 'Facturación sin IVA de los leads de publicidad ÷ inversión.',
  'Bump offer': '% = cuántas lo compran (etiqueta del bump) sobre las VIP, o sobre las ventas de ese tipo de pago. Solo cuentan los bumps activos.',
  'Conversión de la página de registro': 'Leads ÷ visitas únicas a la página de registro (las cuenta el código «REGISTRO · visitas únicas»). Sin ese código, registros de publicidad ÷ visitas de Meta.',
  'Conversión de la página': 'Leads ÷ visitas únicas a la página de registro (o, sin el código, ÷ visitas de Meta).',
  'Encuesta rellenada': 'Leads con la etiqueta de encuesta rellenada en este lanzamiento.',
  'Asistencia al directo': 'Leads que entraron al directo (Zoom o el enlace del dashboard) ÷ leads totales.',
  'Vieron el': 'Leads que vieron ese vídeo en directo o grabado ÷ leads totales.',
  'Compras totales': 'Leads con la etiqueta de compra del programa en este lanzamiento (con la fecha de compra dentro del lanzamiento, si hay campo de fecha).',
  'Ventas de Raíces de VIP': 'Compras del programa de leads que compraron la VIP.',
  'Llamadas agendadas': 'Leads con la etiqueta de llamada agendada o el resultado «Llamada agendada» de la setter.',
  'Ventas en directo': 'Ventas del programa con fecha de compra el día del directo de venta.',
  'Ventas el día del': 'Ventas del programa con fecha de compra el día de ese vídeo.',
  Facturación: 'Programa + entradas VIP + bump offers, todo sin IVA. Debajo, las ventas totales del programa en este lanzamiento.',
  'Conversión a venta': 'Ventas del programa ÷ leads totales.',
  'Facturación (sin IVA)': 'Programa + entradas VIP + bump offers, todo sin IVA (según si cada precio lleva IVA incluido, + IVA o es exento).',
  'Facturación del lanzamiento': 'Programa + entradas VIP + bump offers del lanzamiento, sin IVA.',
  'Facturación del meteórico': 'Lo vendido en los meteóricos posteriores de este lanzamiento.',
  'Facturación total': 'Lanzamiento + meteórico posterior.',
  'Coste por VIP': 'Inversión ÷ entradas VIP vendidas.',
  CAC: 'Inversión ÷ ventas del programa: lo que cuesta cada clienta nueva.',
  'CAC de publicidad': 'Inversión ÷ ventas de leads de publicidad.',
  'Coste por venta': 'Inversión ÷ ventas del programa.',
  Impresiones: 'Veces que se mostraron los anuncios (Meta).',
  'Clics en el enlace': 'Clics en el enlace de los anuncios (Meta). CTR = clics ÷ impresiones; CPC = inversión ÷ clics.',
  'Visitas a la página de registro': 'Visitas a la página que cuenta Meta (landing page views): hicieron clic y la página llegó a cargar.',
};
const ayudaKpi = (label) => {
  const t = String(label).replace(/<[^>]+>/g, '').trim();
  return AYUDA_KPI[t] || Object.entries(AYUDA_KPI).find(([k]) => t.startsWith(k))?.[1] || '';
};
const ayudaBtn = (txt) => (txt ? `<button type="button" class="kpi-ayuda" aria-label="Cómo se calcula: ${esc(txt)}" data-ayuda="${esc(txt)}">?</button>` : '');
// Globo flotante del «?» (fuera de la tarjeta, para que no se corte), dentro de la pantalla.
{
  const pop = document.createElement('div');
  pop.className = 'ayuda-pop';
  pop.hidden = true;
  pop.setAttribute('role', 'tooltip');
  document.body.append(pop);
  let fijo = null;
  const mostrar = (b) => {
    pop.textContent = b.dataset.ayuda;
    pop.hidden = false;
    const r = b.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    pop.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    pop.style.top = `${r.bottom + 6 + h > window.innerHeight ? r.top - h - 6 : r.bottom + 6}px`;
  };
  const ocultar = () => { pop.hidden = true; fijo = null; };
  document.addEventListener('mouseover', (e) => { const b = e.target.closest('.kpi-ayuda'); if (b) mostrar(b); });
  document.addEventListener('mouseout', (e) => { if (e.target.closest('.kpi-ayuda') && !fijo) pop.hidden = true; });
  document.addEventListener('focusin', (e) => { const b = e.target.closest('.kpi-ayuda'); if (b) mostrar(b); });
  document.addEventListener('focusout', (e) => { if (e.target.closest('.kpi-ayuda')) ocultar(); });
  // En el móvil (sin ratón): tocar lo abre y tocar otra vez (o fuera) lo cierra.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.kpi-ayuda');
    if (!b) { if (fijo) ocultar(); return; }
    e.preventDefault();
    e.stopPropagation();
    if (fijo === b) ocultar(); else { fijo = b; mostrar(b); }
  }, true);
  window.addEventListener('scroll', () => { if (!pop.hidden) ocultar(); }, { passive: true });
}
const card = (label, value, sub, ico = 'sparkle', tone = 'accent') => `<div class="kpi static tone-${tone}"><span class="kpi-label"><span class="kpi-ico">${icon(ico)}</span>${label}${ayudaBtn(ayudaKpi(label))}</span><span class="kpi-value">${value}</span><span class="kpi-sub">${sub}</span></div>`;

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
    const subLanz = `sin IVA · ${eur(eco.facturacionPrograma || 0)} del programa (${m.compra} ventas)${eco.facturacionVip ? ` + ${eur(eco.facturacionVip)} de VIP (${m.vip})` : ''}${eco.facturacionBumps ? ` + ${eur(eco.facturacionBumps)} de bumps` : ''}`;
    const subMeteo = !metas.length ? 'Sin meteórico posterior (créalo en Métricas → Meteórico posterior)'
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

// Botón «Configurarlo ahora» que lleva al campo exacto de la configuración (solo quien puede configurar).
const irA = (campo, txt = 'Configurarlo ahora') => (puedeConfig() && !enVsl() && !enMeteo() ? ` <button type="button" class="btn small ir-config" ${campo.startsWith('tab:') ? `data-config-tab="${campo.slice(4)}"` : `data-ir-campo="${campo}"`}>${txt} →</button>` : '');

// De dónde sale la inversión (y por tanto el CPL): Meta, a mano, o por qué no hay.
const formatoDia = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' });
function fuenteInversion(launch, m) {
  const meta = state.meta;
  const filtro = launch.metaFiltro || state.launchCode;
  const leads = `${m.total.toLocaleString('es-ES')} leads con la etiqueta de registro`;
  if (m.eco.inversion && m.eco.inversionFuente === 'meta') return { ok: true, txt: `Meta Ads: campañas con «${esc(filtro)}» en el nombre${meta?.since ? ` (${esc(meta.since)} → ${esc(meta.until)})` : ''} · ${leads}` };
  if (m.eco.inversion) return { ok: true, txt: `inversión puesta a mano en Configuración · ${leads}` };
  if (!launch.inicioCaptacion) return { ok: false, txt: `Falta el inicio de captación: desde ese día se suma lo gastado en Meta.${irA('cfg-inicio')}` };
  if (launch.inicioCaptacion > dayInMadrid(new Date().toISOString())) return { ok: false, txt: `La captación empieza el ${esc(formatoDia(launch.inicioCaptacion))}: desde ese día se suma sola la inversión de las campañas con «${esc(filtro)}» en el nombre` };
  if (!meta) return { ok: false, txt: 'Meta no está conectado (variables META_* en Cloudflare)' };
  if (meta.error) return { ok: false, txt: `Meta: ${esc(meta.error)}` };
  if (!(meta.campaigns || []).length) return { ok: false, txt: `Ninguna campaña de Meta lleva «${esc(filtro)}» en el nombre: ponle el código del lanzamiento al nombre de la campaña (o cambia el texto que se busca).${irA('cfg-meta-filtro', 'Ver el texto que se busca')}` };
  return { ok: false, txt: `Las campañas con «${esc(filtro)}» aún no tienen gasto` };
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
  const tr = resumenTrafico(m, state.meta, { visitasRegistro: state.visitas?.code === state.launchCode ? state.visitas.registro : 0 });
  const pct1 = (x) => (x == null ? '–' : `${(Math.round(x * 1000) / 10).toLocaleString('es-ES')}%`);
  // Arriba, en grande: leads, facturación (con las ventas) y ROAS. Debajo, el resto en el orden del embudo:
  // captación → calentamiento (encuesta, VIP) → directo → carrito (llamadas, ventas, bumps del programa).
  const roasTxt = m.eco.roas != null ? `${m.eco.roas.toFixed(2).replace('.', ',')}x` : '–';
  const inv = fuenteInversion(launch, m);
  const factSub = [`programa ${eur(m.eco.facturacionPrograma)}`, m.conVip ? `VIP ${eur(m.eco.facturacionVip)}` : '', m.eco.facturacionBumps ? `bumps ${eur(m.eco.facturacionBumps)}` : ''].filter(Boolean).join(' + ');
  const grande = (html) => html.replace('class="kpi static', 'class="kpi static kpi-hero');
  $('#metric-hero').innerHTML = [
    grande(card('Leads totales', m.total.toLocaleString('es-ES'), `${launch.sendflowId ? textoGrupoWa(m) : ''}${m.clientaAnterior || m.vipAnterior ? `${m.vipAnterior} VIP y ${m.clientaAnterior} clientas de lanzamientos anteriores` : 'registros del lanzamiento'}`, 'users', 'accent')),
    grande(card('Facturación', eur(m.eco.facturacion), `<strong class="kpi-hero-ventas">${m.compra.toLocaleString('es-ES')} ${m.compra === 1 ? 'venta' : 'ventas'} totales</strong>Sin IVA: ${factSub}`, 'coins', 'money')),
    grande(card('ROAS', roasTxt, m.eco.roas != null ? `facturación sin IVA ÷ ${eur(m.eco.inversion)} de inversión` : inv.ok ? 'facturación sin IVA ÷ inversión' : inv.txt, 'trend', 'buy')),
  ].join('');
  const bumpCard = (b) => {
    const t = TIPOS_BUMP.find((x) => x.id === b.tipo);
    // En grande el % de las VIP (o de las ventas de ese tipo de pago) que lo compran; debajo, cuántos se han vendido.
    return card(`Bump offer ${b.tipo === 'vip' ? 'de la VIP' : `del ${t.label}`} · ${esc(b.nombre)}`, pctOf(b.n, b.base).replace('.', ','), `<strong>${b.n.toLocaleString('es-ES')} ${b.n === 1 ? 'bump vendido' : 'bumps vendidos'}</strong> de ${b.base} ${b.tipo === 'vip' ? 'VIP' : t.base} · ${eur(b.facturacion)} sin IVA`, 'gift', b.tipo === 'vip' ? 'vip' : 'buy');
  };
  $('#metric-cards').innerHTML = [
    // Captación
    card('Inversión en publicidad', m.eco.inversion ? eur(m.eco.inversion) : '–', inv.txt, 'megaphone', 'accent'),
    card('CPL medio', eur(tr.cpl), tr.cpl == null ? inv.txt : `${eur(m.eco.inversion)} / ${m.total.toLocaleString('es-ES')} leads${tr.cplPubli != null ? ` · ${eur(tr.cplPubli)} por lead de publicidad` : ''}`, 'coins', 'money'),
    card('Conversión de la página de registro', pct1(tr.conversionPagina), tr.conversionFuente === 'registro'
      ? `${m.total.toLocaleString('es-ES')} registros de ${tr.visitasRegistro.toLocaleString('es-ES')} visitas únicas a la página de registro`
      : tr.conversionFuente === 'meta' ? `${tr.registrosPubli} registros${tr.conOrigen ? ' de publicidad' : ''} de ${tr.visitas.toLocaleString('es-ES')} visitas (Meta) · pega el código de la página de registro (Códigos) para contar las visitas únicas`
        : `Pega en la página de registro el código «REGISTRO · visitas únicas».${irA('tab:snippets', 'Ver el código')}`, 'funnel', 'info'),
    // Calentamiento
    ...(m.encuestaActiva ? [card('Encuesta rellenada', `${m.encuesta} <small class="muted">de ${m.total}</small>`, `${pctOf(m.encuesta, m.total)} de los registros`, 'survey', 'info')] : []),
    ...(m.conVip ? [card('Entradas VIP vendidas', m.vip, `${pctOf(m.vip, m.total)} de los leads${m.eco.facturacionVip ? ` · ${eur(m.eco.facturacionVip)} sin IVA` : ''}`, 'star', 'vip')] : []),
    ...(m.bumps || []).filter((b) => b.tipo === 'vip').map(bumpCard),
    // Directo
    asistenciaCard,
    // Carrito
    card('Llamadas agendadas', `${m.llamada} <small class="muted">de ${m.total}</small>`, `${pctOf(m.llamada, m.total)} de los registros · ${pctOf(m.compraLlamada, m.llamada)} compran`, 'phone', 'info'),
    card('Conversión a venta', pctOf(m.compra, m.total).replace('.', ','), `${m.compra.toLocaleString('es-ES')} ventas de ${m.total.toLocaleString('es-ES')} leads`, 'cart', 'buy'),
    directoCard,
    ...(!m.conVip ? [] : [card('Ventas de Raíces de VIP', `${m.compraVip} <small class="muted">de ${m.compra}</small>`, `${pctOf(m.compraVip, m.compra)} de las ventas · compra el ${pctOf(m.compraVip, m.vip)} de las VIP`, 'crown', 'vip')]),
    ...(m.bumps || []).filter((b) => b.tipo !== 'vip').map(bumpCard),
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
    ...(m.inicioPago || launch.paginaPagoUrl ? [['Iniciaron el pago', m.inicioPago, `pulsaron «Quiero inscribirme» · ${m.inicioPago ? `compró el ${pctOf(m.compraInicioPago, m.inicioPago)}` : 'aún nadie'}`]] : []),
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
  $('#asistencia-trafico').innerHTML = !at ? `<tbody><tr><td class="muted">Configura el <strong>inicio de captación</strong> (frío / templado) o las <strong>etiquetas de publicidad y orgánico</strong> del lanzamiento para separar el consumo por tipo de tráfico.${irA('cfg-inicio')}</td></tr></tbody>` : `
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

// Votación de la preclase: por pregunta, el % de cada opción y la conversión a compra de quienes la eligieron;
// de las preguntas libres, todas las respuestas con el nombre de quien la escribió.
function renderVotacionMetric() {
  const v = state.votos;
  const launch = state.config.launches[state.launchCode];
  $('#votacion-card').hidden = !launch || !tieneRecurso(launch, 'votacion');
  if ($('#votacion-card').hidden) return;
  if (!v || v.code !== state.launchCode) { $('#votacion-metric').innerHTML = '<p class="muted">Cargando las respuestas…</p>'; return; }
  const porId = new Map(state.leads.map((l) => [l.id, l]));
  const votos = Object.entries(v.votos || {});
  const noVotaron = state.leads.filter((l) => !Object.keys(v.votos?.[l.id] || {}).length);
  const bloques = v.preguntas.map((q, i) => {
    const rq = v.resultados.preguntas?.[q.id] || { total: 0, opciones: [] };
    const cab = `<h3 class="vot-m-q">${v.preguntas.length > 1 ? `${i + 1}. ` : ''}${esc(q.pregunta)} <span class="muted">· ${rq.total} respuesta${rq.total === 1 ? '' : 's'}${q.tipo === 'libre' ? ' · respuesta libre' : ''}</span></h3>`;
    if (q.tipo === 'libre') {
      const lista = votos.filter(([, r]) => r?.[q.id]).map(([cid, r]) => ({ lead: porId.get(cid), texto: r[q.id] }));
      return `${cab}${lista.length ? `<ul class="vot-libres">${lista.slice(0, 300).map((x) => `<li><strong>${esc(x.lead?.name || 'Lead')}</strong>${x.lead?.s.compra ? ' <span class="chip on">Compró</span>' : ''}<p>${esc(x.texto)}</p></li>`).join('')}</ul>` : '<p class="muted">Todavía no hay respuestas.</p>'}`;
    }
    const filas = rq.opciones.map((o) => {
      const eligieron = votos.filter(([, r]) => r?.[q.id] === o.id).map(([cid]) => porId.get(cid)).filter(Boolean);
      return { ...o, leads: eligieron.length, compras: eligieron.filter((l) => l.s.compra).length };
    });
    return `${cab}${votacionHtml(rq)}
      <div class="table-scroll"><table class="metric-table"><thead><tr><th>Opción</th><th class="num">Votos</th><th class="num">%</th><th class="num">Compras</th><th class="num">Conversión</th></tr></thead>
      <tbody>${filas.map((f) => `<tr><td>${esc(f.texto)}</td><td class="num">${f.n}</td><td class="num">${Math.round(f.pct * 100)} %</td><td class="num">${f.compras}</td><td class="num big">${pctOf(f.compras, f.leads)}</td></tr>`).join('')}</tbody></table></div>`;
  });
  $('#votacion-metric').innerHTML = `<p><strong>${v.resultados.total}</strong> ${v.resultados.total === 1 ? 'lead ha respondido' : 'leads han respondido'} (${pctOf(v.resultados.total, state.leads.length)} de los registros) · no respondieron ${noVotaron.length}, de las que compraron ${noVotaron.filter((l) => l.s.compra).length} (${pctOf(noVotaron.filter((l) => l.s.compra).length, noVotaron.length)}).</p>
    ${bloques.join('<hr class="vot-m-sep">')}`;
}

// Ventas de Raíces por día del carrito (fecha de compra de Raíces).
const dayFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
function renderVentasDia(launch) {
  const v = ventasPorDia(state.leads, launch);
  const box = $('#ventas-dia');
  if (!v) {
    box.innerHTML = `<p class="muted">Configura el <strong>día del directo</strong> y el <strong>campo de fecha de compra</strong> para ver las ventas de cada día.${irA('cfg-compra-fecha')}</p>`;
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
  el.innerHTML = avisos.length ? `<strong>Revisa ${avisos.length === 1 ? 'esto' : `estas ${avisos.length} cosas`}:</strong><ul>${avisos.map((a) => `<li>${conBotones(a)}</li>`).join('')}</ul>` : '';
}
// En cada aviso, lo que falta lleva su botón al campo de la configuración.
const AVISO_CAMPOS = [
  ['el día del directo', 'cfg-directo-fecha'], ['la hora del directo', 'cfg-directo-hora'], ['la etiqueta de compra', 'cfg-compra'],
  ['el campo de fecha de compra', 'cfg-compra-fecha'], ['el precio de ', 'cfg-precio-programa'], ['el precio de la VIP', 'cfg-precio-vip'],
  ['el enlace del grupo de WhatsApp', 'cfg-whatsapp-url'], ['el cierre del carrito', 'cfg-cierre'], ['IVA', 'tab:precios'],
  ['etiquetas de pago único y fraccionado', 'cfg-unico-tag'], ['sin etiqueta de pago único ni fraccionado', 'cfg-unico-tag'],
];
function conBotones(aviso) {
  let html = esc(aviso);
  if (!puedeConfig() || enVsl() || enMeteo()) return html;
  // «Falta en Configuración: a, b, c.» → cada cosa es un botón; en el resto, un botón al final.
  const falta = /^Falta en Configuración: (.*)\.$/.exec(aviso);
  if (falta) {
    return `Falta en Configuración: ${falta[1].split(', ').map((x) => {
      const c = AVISO_CAMPOS.filter(([k]) => x.startsWith(k)).sort((a, b) => b[0].length - a[0].length)[0];
      return c ? `<button type="button" class="link-btn" ${c[1].startsWith('tab:') ? `data-config-tab="${c[1].slice(4)}"` : `data-ir-campo="${c[1]}"`}>${esc(x)}</button>` : esc(x);
    }).join(', ')}.`;
  }
  const c = AVISO_CAMPOS.find(([k]) => aviso.includes(k));
  if (c) html += irA(c[1]);
  return html;
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
  const box = $('#objetivos');
  if (!m.objetivos.length) {
    box.innerHTML = `<div class="card empty obj-empty">${icon('target', 'ico-xl')}<h2>Aún no hay objetivos para este lanzamiento</h2>
      <p class="muted">Salen de la proyección del planificador (arriba) en cuanto haya lanzamientos anteriores con datos. Entonces verás aquí cuánto llevas, cuánto falta y a qué ritmo hay que ir.</p></div>`;
  } else {
    const fmt = (o, n) => (o.unit === 'eur' ? eur(n) : Math.round(n).toLocaleString('es-ES'));
    // El ritmo diario lleva un decimal si es pequeño (1,3 al día mejor que 1).
    const fmtDia = (o, n) => (o.unit === 'eur' ? eur(n) : n.toLocaleString('es-ES', { maximumFractionDigits: n < 10 ? 1 : 0 }));
    const today = Date.parse(`${dayInMadrid(new Date().toISOString())}T12:00:00Z`);
    box.innerHTML = `<h3 class="obj-titulo">${icon('target')} Cómo vas frente a los objetivos</h3><div class="obj-grid">${m.objetivos.map((o) => {
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

async function guardarObjetivos(cambio, statusSel) {
  const st = $(statusSel);
  st.textContent = 'Guardando…';
  try {
    const { config } = await api('/api/config', { method: 'POST', body: { op: 'objetivos', l: state.launchCode, ...cambio } });
    state.config = config;
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
// Lanzamientos anteriores metidos a mano antes (se guardan en el embudo).
const historicoManual = () => embudoInfo(embudoDeLanz(state.config.launches[state.launchCode]))?.historico || [];
function historico() {
  const g = histGuardado();
  return [...lanzamientosHistorico().map(([c]) => g[c]).filter(Boolean), ...historicoManual().map(resumenManual)];
}
// Se cargan solos al abrir la pestaña: los que faltan o llevan más de 3 días sin actualizar (una vez por sesión).
let cargandoHist = null;
const histIntentados = new Set();
const objAutoFijados = new Set();
let ultimaProyeccion = null;
function autoCargarHistorico({ todo = false } = {}) {
  if (cargandoHist || !state.config?.launches?.[state.launchCode]) return;
  const g = histGuardado();
  const viejo = (x) => todo || !x || !(Date.now() - Date.parse(x.at || 0) < 3 * 86400_000);
  const clave = (c) => `${state.cliente || 'principal'}|${c}`;
  const faltan = lanzamientosHistorico().filter(([c]) => viejo(g[c]) && !histIntentados.has(clave(c)));
  if (!faltan.length) return;
  for (const [c] of faltan) histIntentados.add(clave(c));
  cargandoHist = cargarHistorico(faltan)
    .catch((err) => notice(`No se pudieron cargar los lanzamientos anteriores: ${err.message}`, true))
    .finally(() => { cargandoHist = null; render(); });
}
async function cargarHistorico(lista) {
  const g = histGuardado();
  for (const [c, l] of lista) {
    const m = await loadLaunchMetrics(c);
    g[c] = { ...resumenLanzamiento(c, l, m), at: new Date().toISOString() };
    try { ls.set(CALC_KEY(), JSON.stringify(g)); } catch { /* sin almacenamiento */ }
  }
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
  if (!$('#view-objetivos').hidden) autoCargarHistorico();
  const hist = historico();
  const M = medias(hist);
  const sup = supuestosCalc(launch);
  const pct = (v) => (v !== '' && v != null && Number(v) > 0 ? Number(v) / 100 : null);
  const manual = {
    cpl: sup.cpl, ticket: sup.ticket, convVip: pct(sup.convVip), convVenta: pct(sup.convVenta),
    pctLlamada: pct(sup.pctLlamada), pctShow: pct(sup.pctShow), pctCierre: pct(sup.pctCierre),
  };
  const esc3 = Object.fromEntries(ESCENARIOS.map((e) => [e.id, supuestosEscenario(M, e.id, manual)]));
  // Sin entrada VIP: ni conversión a VIP ni objetivo de VIP.
  if (!conVip(launch)) for (const e of ESCENARIOS) esc3[e.id].convVip = 0;
  // Lo que deja cada VIP, sin IVA: la entrada y los bumps (con el % de VIP que los compra en este lanzamiento).
  const precioVip = vipSinIva(launch) + (m.bumps || []).filter((b) => b.tipo === 'vip').reduce((t, b) => t + b.precio * (m.vip >= 20 ? b.pct || 0 : 0), 0);
  const roasObj = Number(sup.roasObjetivo) || ROAS_OBJETIVO_DEF;
  // Inversión: la escrita en «Presupuesto» o la recomendada por el histórico. Con CPL escrito no hay curva.
  const cplManual = Number(manual.cpl) > 0;
  const Mrec = cplManual ? { ...M, curva: null, cpl: { valor: Number(manual.cpl) } } : M;
  const N = esc3.neutro;
  const factLeadN = (N.convVip || 0) * precioVip + (N.convVenta || 0) * (N.ticket || 0);
  const rec = inversionRecomendada(Mrec, { factLead: factLeadN, roasObjetivo: roasObj });
  const presupuesto = Number(sup.presupuesto) || 0;
  const inversion = presupuesto || rec?.valor || 0;
  const curva = cplManual ? null : M.curva;
  const res = Object.fromEntries(ESCENARIOS.map((e) => [e.id, proyeccion(esc3[e.id], { inversion, precioVip, curva, cplNeutro: N.cpl })]));
  // Días de captación (todos, para planificar) y los que quedan (para el ritmo desde hoy).
  const hoy = dayInMadrid(new Date().toISOString());
  const finCapt = launch.finCaptacion || (launch.fechaDirecto ? addDays(launch.fechaDirecto, -1) : '');
  const entre = (a, b2) => Math.round((Date.parse(`${b2}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400_000) + 1;
  const quedan = finCapt ? entre(hoy, finCapt) : null;
  const diasCaptTotal = Number(sup.diasCaptacion) || (launch.inicioCaptacion && finCapt ? Math.max(1, entre(launch.inicioCaptacion, finCapt)) : null);
  const llevaDias = launch.inicioCaptacion ? Math.max(1, entre(launch.inicioCaptacion, hoy)) : null;
  const ritmo = llevaDias && launch.inicioCaptacion <= hoy ? m.total / llevaDias : null;
  const invActual = m.eco.inversion || Number(launch.inversion) || 0;
  const cplActual = invActual && m.total ? invActual / m.total : null;
  const diasCarrito = Number(sup.diasCarrito) || Number(launch.diasCarrito) || Math.round(M.diasCarrito?.valor || 0) || PLAN_DEF.diasCarrito;
  const pp = {
    roasObjetivo: roasObj, diasCaptacion: diasCaptTotal, llamadasDia: Number(sup.llamadasDia) || PLAN_DEF.llamadasDia, diasCarrito,
    costePersona: Number(sup.costePersona) || 0, comision: pct(sup.comision) ?? 0, costesFijos: Number(sup.costesFijos) || 0,
  };
  const plan = Object.fromEntries(ESCENARIOS.map((e) => {
    const s = esc3[e.id];
    return [e.id, planificar(res[e.id], s, { ...pp, pctLlamada: s.pctLlamada, pctShow: s.pctShow ?? PLAN_DEF.pctShow, pctCierre: s.pctCierre })];
  }));
  const P = plan.neutro;

  const AYUDA_PLAN = {
    'Inversión': 'Con 3 o más lanzamientos de inversiones distintas: la mayor inversión que mantiene el ROAS objetivo según cómo sube tu CPL al invertir más. Si no, tu inversión media reciente (+20 % si el ROAS va sobrado).',
    'Leads previstos': 'Inversión ÷ CPL previsto (el CPL medio de tus lanzamientos o, con curva, el de esa inversión).',
    'CPL máximo': 'Lo que deja cada lead (VIP + programa, sin IVA) ÷ ROAS objetivo. Por encima, no llegas al ROAS que buscas.',
    'Presupuesto diario': 'Inversión ÷ días de captación.',
    'Personas necesarias': 'Llamadas del día más fuerte del carrito (1,5 × la media) ÷ llamadas al día por persona.',
    'Punto de equilibrio': 'Ventas para cubrir la publicidad, el equipo y los demás costes.',
    'Facturación prevista': 'Leads × (conversión a VIP × precio VIP + conversión a venta × ticket), sin IVA.',
    'Beneficio previsto': 'Facturación prevista − publicidad − equipo − comisiones − otros costes.',
  };
  const tile = (label, valor, sub = '', clase = '') => `<div class="plan-tile ${clase}"><span class="plan-l">${label}${ayudaBtn(Object.entries(AYUDA_PLAN).find(([k]) => String(label).startsWith(k))?.[1])}</span><strong class="plan-n">${valor}</strong>${sub ? `<span class="plan-s">${sub}</span>` : ''}</div>`;
  const num1 = (x) => (x == null ? '–' : x.toLocaleString('es-ES', { maximumFractionDigits: x < 10 ? 1 : 0 }));
  const roasTxt = (x) => (x == null ? '–' : x.toLocaleString('es-ES', { maximumFractionDigits: 1 }));
  const cplClase = cplActual != null && P?.cplMaxRoas != null ? (cplActual <= P.cplMaxRoas ? 'ok' : cplActual <= P.cplEquilibrio ? 'warn' : 'mal') : '';
  const recTxt = !rec ? '' : {
    curva: `donde tu CPL deja el ROAS ${roasTxt(roasObj)}${rec.tope ? ' (tope: el doble de tu mayor inversión)' : ''}`,
    escalar: 'tu media reciente +20 %: el ROAS histórico supera el objetivo con holgura',
    mantener: 'tu media reciente: el ROAS histórico cumple el objetivo justo',
    revisar: 'tu media reciente: el ROAS histórico no llega al objetivo',
  }[rec.motivo];
  const faltaDato = !inversion ? 'la inversión (pon un presupuesto en «Ajustar supuestos»)'
    : !N.cpl ? 'el CPL' : N.convVenta == null ? 'la conversión a venta' : N.ticket == null ? 'el ticket medio' : '';
  const planHtml = !P
    ? `<div class="notice${hist.length ? ' warn' : ''}">${hist.length ? `Falta ${faltaDato} para proyectar.` : cargandoHist ? 'Cargando los lanzamientos anteriores…' : 'Aún no hay lanzamientos anteriores con datos (al menos 100 registros). En cuanto cierre el primero, el plan se rellena solo; mientras, puedes simular escribiendo los supuestos.'}</div>`
    : `<div class="plan-grupos">
        <section class="plan-grupo"><h4>📣 Captación</h4><div class="plan-tiles">
          ${tile(presupuesto ? 'Inversión (tu presupuesto)' : 'Inversión recomendada', eur(P.inversion), presupuesto ? (rec ? `la recomendada sería ${eur(rec.valor)}` : '') : recTxt, 'destacado')}
          ${tile('Leads previstos', numTxt(P.leads), `${P.leadsDia != null ? `${num1(P.leadsDia)} al día · ` : ''}a un CPL de ${eur(res.neutro.cpl)}`)}
          ${tile(`CPL máximo para ROAS ${roasTxt(roasObj)}`, eur(P.cplMaxRoas), `${cplActual != null ? `ahora vas a ${eur(cplActual)} · ` : ''}a ${eur(P.cplEquilibrio)} ni ganas ni pierdes`, cplClase)}
          ${tile('Presupuesto diario', P.inversionDia != null ? eur(P.inversionDia) : '–', P.inversionDia != null ? `durante ${P.diasCaptacion} días de captación` : 'faltan las fechas de captación')}
        </div></section>
        <section class="plan-grupo"><h4>📞 Equipo de llamadas <small class="muted">(cada persona hace setting y cierre)</small></h4><div class="plan-tiles">
          ${tile('Personas necesarias', P.personas == null ? '–' : numTxt(P.personas), P.personas == null ? 'aún no hay llamadas en el histórico' : `para el pico: ${num1(P.pico)} llamadas/día a ${P.capacidad} por persona`, P.personas ? 'destacado' : '')}
          ${tile('Llamadas agendadas', numTxt(P.agendadas), P.agendadas != null ? `${num1(P.porDia)} al día durante ${P.diasCarrito} días de carrito` : '')}
          ${tile('Llamadas que se harán', numTxt(P.hechas), P.hechas != null ? `${pctTxt(N.pctShow ?? PLAN_DEF.pctShow)} de asistencia${N.pctShow == null ? ' (supuesto)' : ''}` : '')}
          ${tile('Ventas por llamada', numTxt(P.ventasLlamada), P.ventasLlamada != null && P.ventas ? `${pctTxt(P.ventasLlamada / P.ventas)} de las ventas · cierre ${pctTxt(N.pctCierre)}` : '')}
        </div></section>
        <section class="plan-grupo"><h4>💶 Números</h4><div class="plan-tiles">
          ${tile('Facturación prevista', eur(P.facturacion), `${numTxt(P.ventas)} ventas${conVip(launch) ? ` · ${numTxt(P.vip)} VIP` : ''}`)}
          ${tile('Costes', eur(P.costes), [P.inversion ? `publicidad ${eur(P.inversion)}` : '', P.costeEquipo ? `equipo ${eur(P.costeEquipo)}` : '', P.comisiones ? `comisiones ${eur(P.comisiones)}` : '', P.costesFijos ? `otros ${eur(P.costesFijos)}` : ''].filter(Boolean).join(' · '))}
          ${tile('Beneficio previsto', eur(P.beneficio), P.roas ? `ROAS ${roasTxt(P.roas)}` : '', P.beneficio >= 0 ? 'ok' : 'mal')}
          ${tile('Punto de equilibrio', P.equilibrio == null ? '–' : `${numTxt(P.equilibrio)} ventas`, 'para cubrir publicidad, equipo y costes')}
        </div></section>
      </div>
      <h4 class="calc-h">Si va peor o mejor <small class="muted">(intervalo del 80 % de tus lanzamientos${M.n < 2 ? '; con uno solo, ±20 %' : ''})</small></h4>
      <div class="table-scroll"><table class="metric-table plan-rango"><thead><tr><th></th>${ESCENARIOS.map((e) => `<th class="num">${e.label}</th>`).join('')}</tr></thead><tbody>
        ${[['Leads', (x) => numTxt(x.leads)], ['Ventas', (x) => numTxt(x.ventas)], ['Facturación', (x) => eur(x.facturacion)], ['ROAS', (x) => roasTxt(x.roas)], ['Personas al teléfono', (x) => (x.personas == null ? '–' : numTxt(x.personas))], ['Beneficio', (x) => eur(x.beneficio)]]
          .map(([l, f]) => `<tr><th>${l}</th>${ESCENARIOS.map((e) => `<td class="num">${plan[e.id] ? f(plan[e.id]) : '–'}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>`;

  // Sugerencias en claro.
  const sug = [];
  if (P) {
    if (M.fiabilidad === 'baja') sug.push(M.n < 2 ? 'Con un solo lanzamiento las medias son orientativas: el plan se afina solo con cada lanzamiento que cierres.' : 'Tus lanzamientos se parecen poco entre sí (la conversión varía mucho): el rango es ancho y el neutro, orientativo. Se afina con cada lanzamiento que cierres.');
    if (rec?.motivo === 'curva') sug.push(`Tu CPL sube un <strong>${pctTxt(2 ** M.curva.b - 1)}</strong> cada vez que doblas la inversión (medido en ${M.curva.n} lanzamientos): por encima de ${eur(rec.valor)} el ROAS baja de ${roasTxt(roasObj)}.`);
    else if (rec?.motivo === 'escalar') sug.push(`Tu ROAS medio (${roasTxt(factLeadN / N.cpl)}) supera el objetivo: sube la inversión un 20 % y mira el CPL. Con 3 lanzamientos de inversiones distintas se calcula cuánto sube el CPL al escalar.`);
    else if (rec?.motivo === 'revisar') sug.push(`<span class="error">Tu ROAS medio (${roasTxt(factLeadN / N.cpl)}) no llega al objetivo (${roasTxt(roasObj)}): antes de invertir más baja el CPL (creatividades, públicos) o sube la conversión (llamadas, oferta).</span>`);
    if (cplActual != null && P.cplMaxRoas != null) {
      if (cplActual > P.cplEquilibrio) sug.push(`<span class="error">Tu CPL actual (${eur(cplActual)}) supera el de equilibrio (${eur(P.cplEquilibrio)}): pierdes dinero con cada registro. Para y revisa creatividades y públicos.</span>`);
      else if (cplActual > P.cplMaxRoas) sug.push(`Tu CPL actual (${eur(cplActual)}) está por encima del máximo para tu ROAS objetivo (${eur(P.cplMaxRoas)}): rentable pero por debajo del ROAS que buscas. Apaga los anuncios con peor CPL.`);
      else sug.push(`Tu CPL actual (${eur(cplActual)}) está por debajo del máximo (${eur(P.cplMaxRoas)}): hay margen para <strong>escalar la inversión</strong>.`);
    }
    if (ritmo != null && quedan > 0 && N.convVenta) {
      const regFinal = Math.round(m.total + ritmo * quedan);
      sug.push(`Al ritmo actual (${num1(ritmo)} registros al día) acabarás la captación con unos <strong>${numTxt(regFinal)} registros</strong> → ${numTxt(regFinal * N.convVenta)} ventas${regFinal < P.leads ? `: te faltarían ${numTxt(P.leads - regFinal)} leads (${numTxt((P.leads - regFinal) / quedan)} más al día)` : ''}.`);
    }
    if (P.personas) sug.push(`Organiza el equipo para el <strong>primer y el último día del carrito</strong>: concentran la mayoría de llamadas (se planifica para ${num1(P.pico)} llamadas/día). Ten agenda abierta desde el directo.`);
    if (P.beneficio < 0) sug.push('<span class="error">Con estos datos el lanzamiento pierde dinero: baja el CPL, sube la conversión (más llamadas, mejor oferta) o ajusta los costes.</span>');
  }

  // Objetivos: salen de la proyección neutra (con el rango de los otros escenarios).
  const proy = P ? { registros: P.leads, vip: conVip(launch) ? P.vip : 0, ventas: P.ventas, facturacion: Math.round(P.facturacion) } : null;
  const guardados = launch.objetivos || {};
  ultimaProyeccion = proy;
  const iguales = proy && ['registros', 'vip', 'ventas', 'facturacion'].every((k) => Math.round(Number(guardados[k]) || 0) === Math.round(proy[k] || 0));
  const rango = (k, f) => (plan.desfavorable && plan.favorable ? `entre ${f(plan.desfavorable[k])} y ${f(plan.favorable[k])}` : '');
  const objHtml = !proy ? '' : `<section class="obj-proy">
      <h4 class="calc-h">🎯 Objetivos del lanzamiento <small class="muted">(salen de la proyección)</small></h4>
      <div class="plan-tiles">
        ${tile('Registros', numTxt(proy.registros), rango('leads', numTxt))}
        ${conVip(launch) ? tile('Entradas VIP', numTxt(proy.vip), rango('vip', numTxt)) : ''}
        ${tile(`Ventas de ${esc(nombreProducto(state.config))}`, numTxt(proy.ventas), rango('ventas', numTxt))}
        ${tile('Facturación', eur(proy.facturacion), rango('facturacion', eur))}
      </div>
      <div class="row">${iguales ? '<span class="ok-txt">✓ Son los objetivos del lanzamiento: el progreso de abajo, los avisos y los informes se miden con ellos.</span>'
        : puedeConfig() ? `<button type="button" class="btn primary" id="obj-fijar">${Object.values(guardados).some((v) => Number(v) > 0) ? 'Actualizar los objetivos con la proyección' : 'Fijar como objetivos'}</button><span class="muted" id="obj-status" aria-live="polite"></span>`
          : '<span class="muted">Quien puede configurar fija estos objetivos.</span>'}</div>
    </section>`;

  const resultadosHtml = `${planHtml}
    ${sug.length ? `<h4 class="calc-h">Sugerencias</h4><ul class="calc-sug">${sug.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}
    ${objHtml}`;
  if (soloResultados && $('#calc-resultados')) { $('#calc-resultados').innerHTML = resultadosHtml; return; }

  // Los objetivos se fijan solos la primera vez (sin objetivos guardados y con el histórico ya cargado).
  if (proy && !iguales && puedeConfig() && !cargandoHist && hist.length && !Object.values(guardados).some((v) => Number(v) > 0) && !objAutoFijados.has(state.launchCode)) {
    objAutoFijados.add(state.launchCode);
    setTimeout(() => guardarObjetivos({ objetivos: proy }, '#obj-status'), 0);
  }

  const g = launch.calculadora || {};
  const editable = puedeConfig() ? '' : 'readonly';
  const campo = (k, label, ph) => `<label class="field"><span>${label}</span><input data-calc="${k}" inputmode="decimal" value="${g[k] ?? ''}" placeholder="${esc(ph)}" ${editable}></label>`;
  const ph = (e, f, ej) => (e ? f(e.valor) : ej);
  const kpiMedia = (label, e, f) => `<div class="plan-tile"><span class="plan-l">${label}</span><strong class="plan-n">${e ? f(e.valor) : '–'}</strong><span class="plan-s">${e ? `entre ${f(e.bajo)} y ${f(e.alto)} · ${e.n} ${e.n === 1 ? 'lanzamiento' : 'lanzamientos'}` : 'sin datos'}</span></div>`;
  const filaHist = (h) => `<tr><td>${esc(h.name)}${h.manual ? ' <small class="muted">(a mano)</small>' : ''}</td><td class="num">${numTxt(h.registros)}</td><td class="num">${eur(h.inversion)}</td><td class="num">${eur(h.cpl)}</td><td class="num">${pctTxt(h.convVip)}</td><td class="num">${pctTxt(h.convVenta)}</td><td class="num">${eur(h.ticket)}</td><td class="num">${roasTxt(h.roas)}</td><td class="num">${pctTxt(h.pctLlamada)}</td><td class="num">${pctTxt(h.pctCierre)}</td><td>${h.manual && puedeConfig() ? `<button type="button" class="btn ghost small" data-hm-quitar="${esc(h.code)}" aria-label="Quitar">✕</button>` : ''}</td></tr>`;
  const anteriores = lanzamientosHistorico().length;
  const fiab = { alta: ['badge-fija', 'Fiabilidad alta'], media: ['badge-revisa', 'Fiabilidad media'], baja: ['badge-cambia', 'Fiabilidad baja'] }[M.fiabilidad];
  const ajustados = Object.values(g).some((v) => v !== '' && v != null);
  box.innerHTML = `<section class="card calc">
    <h3>${icon('trend')} Planificador del lanzamiento</h3>
    <p class="muted">Sale solo de tus lanzamientos anteriores: medias ponderadas por volumen (los grandes pesan más) y por lo recientes que son (cada uno pesa un 25 % menos que el siguiente), con el rango en el que cae el 80 % de los casos. Proyecta la inversión, los leads, el equipo y los números del siguiente, y de ahí salen los objetivos.</p>

    <h4 class="calc-h">1 · Lo que dicen tus lanzamientos anteriores ${fiab ? `<span class="${fiab[0]}">${fiab[1]}</span>` : ''}</h4>
    <div class="row calc-hist-bar"><span class="muted">${cargandoHist ? `Cargando ${anteriores} ${anteriores === 1 ? 'lanzamiento anterior' : 'lanzamientos anteriores'}…`
      : anteriores ? `${M.n} de ${hist.length} con datos suficientes (al menos ${MIN_REGISTROS} registros) · ${numTxt(M.leads)} leads en total` : 'Todavía no hay lanzamientos anteriores en este embudo.'}</span>
      ${anteriores && !cargandoHist ? '<button type="button" class="btn ghost small" id="calc-cargar">Volver a cargar</button>' : ''}</div>
    ${M.n ? `<div class="plan-tiles">
      ${kpiMedia('CPL', M.cpl, eur)}
      ${conVip(launch) ? kpiMedia('% que compra la VIP', M.convVip, pctTxt) : ''}
      ${kpiMedia('% de leads que compra', M.convVenta, pctTxt)}
      ${kpiMedia('Ticket medio', M.ticket, eur)}
      ${kpiMedia('% de leads que agenda llamada', M.pctLlamada, pctTxt)}
      ${kpiMedia('% de cierre en llamada', M.pctCierre, pctTxt)}
      ${kpiMedia('Inversión media', M.inversion, eur)}
      ${kpiMedia('Registros por lanzamiento', M.registros, numTxt)}
    </div>` : ''}
    ${hist.length ? `<details class="calc-detalle"><summary>Ver los lanzamientos (${hist.filter((h) => h.registros > 0).length})</summary><div class="table-scroll"><table class="metric-table"><thead><tr><th>Lanzamiento</th><th class="num">Registros</th><th class="num">Inversión</th><th class="num">CPL</th><th class="num">% VIP</th><th class="num">% venta</th><th class="num">Ticket</th><th class="num">ROAS</th><th class="num">% agendan</th><th class="num">% cierre</th><th></th></tr></thead><tbody>${hist.filter((h) => h.registros > 0).map(filaHist).join('')}</tbody></table></div></details>` : ''}

    <details class="calc-detalle" id="calc-ajustes"${ajustados ? ' open' : ''}><summary>Ajustar supuestos <small class="muted">(opcional: vacío = lo que dice el histórico, en gris)</small></summary>
    <div id="calc-supuestos" data-code="${esc(state.launchCode)}">
      <div class="plan-sup">
        <fieldset><legend>📣 Publicidad</legend>
          ${campo('roasObjetivo', 'ROAS objetivo <small>(facturación ÷ inversión)</small>', String(ROAS_OBJETIVO_DEF).replace('.', ','))}
          ${campo('presupuesto', 'Presupuesto de publicidad (€)', rec ? `${eur(rec.valor)} (recomendada)` : 'p. ej. 15000')}
          ${campo('cpl', 'CPL (€ por lead)', ph(M.cpl, eur, 'p. ej. 4'))}
          ${campo('diasCaptacion', 'Días de captación', diasCaptTotal && !sup.diasCaptacion ? `${diasCaptTotal} (de las fechas)` : 'p. ej. 21')}
        </fieldset>
        <fieldset><legend>🛒 Conversión</legend>
          ${!conVip(launch) ? '' : campo('convVip', '% que compra la VIP', ph(M.convVip, pctTxt, 'p. ej. 8'))}
          ${campo('convVenta', '% de leads que compra el programa', ph(M.convVenta, pctTxt, 'p. ej. 3'))}
          ${campo('ticket', 'Ticket medio del programa (€)', ph(M.ticket, eur, eur(Number(launch.precioPrograma) || 0)))}
        </fieldset>
        <fieldset><legend>📞 Llamadas y equipo</legend>
          ${campo('pctLlamada', '% de leads que agenda llamada', ph(M.pctLlamada, pctTxt, 'p. ej. 6'))}
          ${campo('pctShow', '% que se presenta a la llamada', ph(M.pctShow, pctTxt, pctTxt(PLAN_DEF.pctShow)))}
          ${campo('pctCierre', '% de cierre en llamada', ph(M.pctCierre, pctTxt, 'p. ej. 30'))}
          ${campo('llamadasDia', 'Llamadas al día por persona', String(PLAN_DEF.llamadasDia))}
          ${campo('diasCarrito', 'Días de carrito', String(diasCarrito))}
        </fieldset>
        <fieldset><legend>💶 Costes</legend>
          ${campo('costePersona', 'Coste por persona del equipo (€ por lanzamiento)', 'p. ej. 1200')}
          ${campo('comision', '% de comisión por venta en llamada', 'p. ej. 10')}
          ${campo('costesFijos', 'Otros costes (€) <small>(herramientas, diseño…)</small>', 'p. ej. 500')}
        </fieldset>
      </div>
      <p class="muted small">Cada VIP deja ${eur(precioVip)} sin IVA (entrada${m.bumps?.length ? ' + bumps' : ''}, de Configuración). Llevas ${numTxt(m.total)} registros${invActual ? `, ${eur(invActual)} invertidos (CPL ${eur(cplActual)})` : ''}.</p>
      ${puedeConfig() ? '<div class="row"><button type="button" class="btn" id="calc-guardar">Guardar ajustes</button><span class="muted" id="calc-status" aria-live="polite"></span></div>' : ''}
    </div></details>

    <h4 class="calc-h">2 · Tu plan <small class="muted">(escenario neutro)</small></h4>
    <div id="calc-resultados">${resultadosHtml}</div>
  </section>`;
}

// Lanzamientos anteriores metidos a mano antes (se guardan en el embudo): se pueden quitar.
document.addEventListener('click', async (e) => {
  const id = e.target.dataset?.hmQuitar;
  if (!id || !window.confirm('¿Quitar este lanzamiento del histórico?')) return;
  try {
    const embudo = embudoDeLanz(state.config.launches[state.launchCode]);
    const { config } = await api('/api/config', { method: 'POST', body: { op: 'historico', embudo, historico: historicoManual().filter((x) => x.id !== id) } });
    state.config = config;
    render();
  } catch (err) { notice(err.message, true); }
});
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
  if (e.target.id === 'obj-fijar') {
    if (ultimaProyeccion) await guardarObjetivos({ objetivos: ultimaProyeccion }, '#obj-status');
    return;
  }
  if (e.target.id !== 'calc-cargar') return;
  histIntentados.clear();
  autoCargarHistorico({ todo: true });
  render();
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
    t.innerHTML = `<tbody><tr><td class="muted">Elige las etiquetas de leads de publicidad y orgánicos. Mientras, tienes el desglose por canal (utm_source) en «Canales y campañas».${irA('cfg-publi-tag')}</td></tr></tbody>`;
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
    t.innerHTML = planesActivos(launch).length ? tablaPlanes(m.planes) : `<tbody><tr><td class="muted">Marca los planes de la suscripción.${irA('tab:precios')}</td></tr></tbody>`;
    return;
  }
  tit.innerHTML = tit.dataset.def;
  if (!launch.unicoTag && !launch.fraccionadoTag) {
    t.innerHTML = `<tbody><tr><td class="muted">Elige las etiquetas de pago único y fraccionado.${irA('cfg-unico-tag')}</td></tr></tbody>`;
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
  const metaWarn = state.meta?.error ? `<p class="muted">Meta: ${esc(state.meta.error)}</p>` : '';
  $('#eco-cards').innerHTML = `${[
    card('Inversión en anuncios', e.inversion ? eur(e.inversion) : '–', fuenteInversion(launch, m).txt, 'megaphone', 'accent'),
    card('Facturación (sin IVA)', hasPrices ? eur(e.facturacion) : '–', hasPrices ? `VIP ${eur(e.facturacionVip)}${e.facturacionBumps ? ` · bumps ${eur(e.facturacionBumps)}` : ''} · Raíces ${eur(e.facturacionPrograma)}${m.planes ? ` · MRR ${eur(m.planes.mrr)}` : launch.fraccionadoTag || launch.unicoTag ? ` (${m.compraUnico} único · ${m.compraFraccionado} fraccionado)` : ''}` : 'Añade los precios en Configuración', 'coins', 'money'),
    card('ROAS', e.roas != null && hasPrices ? `${e.roas.toFixed(2)}x` : '–', e.roas != null && hasPrices ? `Beneficio: ${eur(e.beneficio)} (sin IVA)` : 'facturación sin IVA / inversión', 'trend', 'money'),
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
    card('Conversión de la página', pct1(tr.conversionPagina), tr.conversionFuente === 'registro' ? `${n(m.total)} registros / ${n(tr.visitasRegistro)} visitas únicas a la página de registro`
      : tr.conversionPagina != null ? `${n(tr.registrosPubli)} registros${tr.conOrigen ? ' de publicidad' : ''} / ${n(tr.visitas)} visitas (Meta)${tr.registrosMeta ? ` · Meta cuenta ${n(tr.registrosMeta)}` : ''}` : 'registros / visitas únicas a la página de registro', 'funnel', 'buy'),
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
// Leads y Meta de todos los lanzamientos empezados del embudo (para el histórico de anuncios y Crear anuncios).
const codigosHistorico = () => launchesSorted().filter(([, l]) => embudoDeLanz(l) === state.embudo && l.registroTag && l.inicioCaptacion && l.inicioCaptacion <= today()).map(([c]) => c);
async function cargarDatosHistorico(codes = codigosHistorico()) {
  const datos = [];
  for (const code of codes) {
    const leads = await loadLaunchLeads(code, 'Anuncios');
    let meta = null;
    try { const r = await api(`/api/meta?launch=${encodeURIComponent(code)}`); meta = r.configured && !r.error ? r : null; } catch { /* sin Meta */ }
    datos.push({ code, nombre: state.config.launches[code].name, leads, meta });
  }
  state.hist.datos = datos;
  state.hist.embudo = state.embudo;
  return datos;
}
async function cargarHistoricoAnuncios() {
  const btn = $('#btn-hist-anuncios');
  const codes = codigosHistorico();
  if (!codes.length) { $('#hist-anuncios').innerHTML = '<p class="muted">Aún no hay lanzamientos empezados en este embudo.</p>'; return; }
  btn.disabled = true;
  try {
    await cargarDatosHistorico(codes);
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
const VIEWS = ['hoy', 'llamadas', 'endirecto', 'leads', 'metricas', 'objetivos', 'avatar', 'comparar', 'tareas', 'calendario', 'carrito', 'vmetricas', 'vleads', 'vanuncios', 'rendimiento', 'meteoricos', 'moferta', 'dmetricas', 'dclientes', 'grupowa', 'paginas', 'anuncios'];
// Iconos de las pestañas y de las cabeceras de sección (data-icon en el HTML).
// Pestañas que agrupan varias vistas en subpestañas:
// «Comercial» (Setting hoy y Llamadas), «Análisis» (Objetivos, Avatar y anuncios / Anuncios ganadores y
// Comparar) y «Planificación» (Calendario, Tareas y Rendimiento del equipo).
// Leyenda de la tabla de Leads: los estados con sus puntos (salen de ESTADOS, así no se desfasan).
$('#leyenda-estados').innerHTML = ESTADOS.map((e, i) => `<li><span class="estado st-${e.id}"><span class="dot"></span>${e.label}</span> ${i === 0 ? `${e.min} puntos o más` : `de ${e.min} a ${ESTADOS[i - 1].min - 1} puntos`}</li>`).join('');

// Ayuda de la primera visita a cada pestaña: qué hay y para qué sirve. Se cierra con «Entendido» y se
// recuerda por usuario (Cuenta → «Volver a ver las ayudas» las enseña otra vez).
const AYUDA_VISTA = {
  hoy: ['☀️ Setting hoy', 'Las listas de a quién escribir hoy por WhatsApp, de más a menos caliente. Pulsa el botón de WhatsApp de cada lead: el mensaje sale ya escrito (se cambia en «Mensajes de WhatsApp», abajo).'],
  llamadas: ['📞 Llamadas', 'Las llamadas de valoración del calendario de GHL. Pulsa una para ver la ficha del lead antes de llamar y anota el resultado al terminar: alimenta el pipeline y el rendimiento del equipo.'],
  endirecto: ['🔴 En directo', 'El día del webinar, minuto a minuto: quién espera, quién entra, la asistencia, las VIP y las ventas desde que abre el carrito. Se actualiza solo cada minuto.'],
  leads: ['👥 Leads', 'Cada persona registrada con su puntuación (0-100) y su estado: muy caliente, caliente, templado o frío. Filtra, ordena y abre su WhatsApp. En «Encuesta», qué ha respondido la gente.'],
  metricas: ['📊 Métricas', 'Cómo va el lanzamiento en cifras, por categorías (Resumen, Ventas, Captación…). Pasa el ratón por el «?» de cada tarjeta para ver cómo se calcula.'],
  objetivos: ['🎯 Planificador', 'Proyecta el lanzamiento con tus lanzamientos anteriores: inversión, leads, CPL máximo, equipo de llamadas y números. Los objetivos salen de ahí, y abajo ves cuánto llevas.'],
  calendario: ['🗓️ Calendario', 'Todas las fechas del cliente juntas: hitos de cada lanzamiento, tareas y eventos. Se puede sincronizar con tu calendario.'],
  dmetricas: ['📊 Métricas de la venta directa', 'Ventas, facturación, ticket medio, coste por venta (CPA) y ROAS del periodo elegido arriba. Debajo, el % de compradoras que coge cada bump, upsell y downsell, y la conversión de cada página si pegaste sus códigos.'],
  dclientes: ['🛍️ Compradoras', 'Quién ha comprado en el periodo, qué extras se llevó y su WhatsApp. Filtra por un extra para ver, por ejemplo, quién cogió el upsell.'],
  anuncios: ['🎯 Crear anuncios', 'Anuncios con IA para cada objetivo del embudo (captación, retargeting de consumo, venta): copia el prompt (lleva los anuncios ganadores, la ficha de marca, avatar y producto y los datos del embudo), pégalo en Claude y él escribe los guiones y los copys y crea las imágenes y los vídeos con Magnific.'],
  paginas: ['🧱 Páginas', 'Las páginas del embudo hechas con IA: copia el prompt de cada página (lleva la marca, el avatar, los datos del embudo y los códigos del dashboard), pégalo en Claude y pega el HTML que te devuelva en un elemento «Código personalizado» de GHL.'],
  grupowa: ['💬 Grupo de WhatsApp', 'Los mensajes del grupo de este lanzamiento: copia el prompt, pégalo en Claude (con tu skill de copy), pega aquí su respuesta, sube los archivos, revisa y programa en SendFlow con un botón.'],
  carrito: ['🛒 Carrito', 'Cada día del carrito: lo que pasa ese día (se calcula solo con las fechas, la oferta y la barra), los emails y WhatsApps previstos y la estrategia.'],
  tareas: ['✅ Tareas', 'Las tareas del equipo para este lanzamiento, con responsable y fecha. «Cargar tareas habituales» crea la lista de siempre con las fechas ya calculadas.'],
  avatar: ['👑 Avatar y anuncios', 'Qué perfil compra (según la encuesta) y qué anuncios traen ventas. Úsalo para decidir creatividades y públicos.'],
  comparar: ['⚖️ Comparar', 'Este lanzamiento frente a los anteriores (o la VSL frente a los lanzamientos): qué mejora y qué empeora.'],
  rendimiento: ['📈 Rendimiento del equipo', 'Por persona: WhatsApps enviados, llamadas, shows, cierres y tiempo de respuesta.'],
  vmetricas: ['📊 Métricas', 'Cómo va el embudo por fechas: registros, consumo, llamadas, ventas y ROAS. Elige el periodo arriba.'],
  vleads: ['👥 Leads', 'Cada persona con lo que ha visto y su WhatsApp según su estado.'],
  vanuncios: ['👑 Anuncios ganadores', 'Qué campañas, conjuntos y anuncios traen ventas en el periodo elegido.'],
  meteoricos: ['⚡ Meteóricos', 'Cada oferta flash: cuenta atrás, ventas, facturación, visitas a la oferta y quién compra.'],
  moferta: ['🎁 Oferta', 'Los entregables y bonus de la oferta frente a las ventas hora a hora.'],
};
const claveAyuda = (v) => `lsd_ayuda_${state.user?.email || state.user?.id || state.role || 'x'}_${v}`;
function pintarAyudaVista(view) {
  const sec = $(`#view-${view}`);
  const a = AYUDA_VISTA[view];
  $$('.ayuda-vista').forEach((x) => { if (!sec?.contains(x)) x.remove(); });
  if (!state.role || !sec || !a || ls.get(claveAyuda(view)) || $('.ayuda-vista', sec)) return; // hasta saber quién es, nada
  sec.insertAdjacentHTML('afterbegin', `<div class="ayuda-vista" role="note" data-vista="${view}"><div><strong>${esc(a[0])}</strong><p>${esc(a[1])}</p></div><button type="button" class="btn small" data-ayuda-ok>Entendido</button></div>`);
}
document.addEventListener('click', (e) => {
  const ok = e.target.closest('[data-ayuda-ok]');
  if (ok) { const box = ok.closest('.ayuda-vista'); ls.set(claveAyuda(box.dataset.vista), '1'); box.remove(); return; }
  if (e.target.closest('#btn-ayudas')) {
    for (const v of Object.keys(AYUDA_VISTA)) { try { localStorage.removeItem(claveAyuda(v)); } catch { /* sin almacenamiento */ } }
    const actual = VIEWS.find((v) => !$(`#view-${v}`)?.hidden);
    if (actual) pintarAyudaVista(actual);
    notice('Las ayudas de cada pestaña vuelven a salir la próxima vez que entres en ella.');
  }
});

// Grupos de la barra de arriba, por momento de uso: Hoy (lo del día), Plan y Análisis.
const GRUPOS = { comercial: ['hoy', 'llamadas', 'endirecto'], planificacion: ['anuncios', 'paginas', 'grupowa', 'carrito', 'objetivos', 'calendario', 'tareas'], analisis: ['avatar', 'vanuncios', 'comparar', 'rendimiento'] };
const grupoDe = (view) => Object.keys(GRUPOS).find((g) => GRUPOS[g].includes(view)) || null;
const VIEW_ICONS = { endirecto: 'live', meteoricos: 'zap', moferta: 'gift', comercial: 'phone', analisis: 'compare', planificacion: 'calendar', hoy: 'sun2', llamadas: 'phone', leads: 'users', metricas: 'trend', objetivos: 'target', avatar: 'crown', comparar: 'compare', tareas: 'list', calendario: 'calendar', vmetricas: 'trend', vleads: 'users', vanuncios: 'crown', rendimiento: 'users', carrito: 'cart', grupowa: 'whatsapp', paginas: 'layout', anuncios: 'megaphone' };
$$('.view-tab, .subview-tab[data-view]').forEach((t) => t.insertAdjacentHTML('afterbegin', icon(VIEW_ICONS[t.dataset.view || t.dataset.viewGrupo])));
// Cada pestaña y subpestaña explica qué hay dentro al pasar el ratón (la misma descripción que al crear el embudo).
{
  const descVista = {};
  for (const p of Object.values(PESTANAS).flat()) descVista[p.id] ??= p.desc; // si se repite, la de lanzamientos
  $$('.view-tab[data-view], .subview-tab[data-view]').forEach((t) => { if (!t.title && descVista[t.dataset.view]) t.title = descVista[t.dataset.view]; });
  for (const [vista, secs] of Object.entries(SECCIONES)) {
    for (const x of secs) $$(`#msub-${vista} [data-msub-btn="${x.id}"]`).forEach((b) => { if (!b.title) b.title = x.desc; });
  }
}
$$('[data-tab-icon]').forEach((b) => b.insertAdjacentHTML('afterbegin', `<span class="tab-ico">${icon(b.dataset.tabIcon)}</span>`));
$$('[data-tb-icon]').forEach((b) => b.insertAdjacentHTML('afterbegin', `<span class="tb-ico">${icon(b.dataset.tbIcon)}</span>`));
// Menú «Cuenta» de arriba: se cierra al elegir algo o al pulsar fuera.
document.addEventListener('click', (e) => {
  const menu = $('#tb-menu-cuenta');
  if (!menu?.open) return;
  if (!menu.contains(e.target) || e.target.closest('.tb-menu-panel button')) menu.open = false;
});

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
// ---------- Comercial → En directo ----------
let enDirectoTimer = null;
async function cargarEnDirecto() {
  const code = state.launchCode;
  if (!code || enVsl() || enMeteo()) return;
  try {
    const d = await api(`/api/endirecto?l=${encodeURIComponent(code)}`);
    if (state.launchCode === code && !$('#view-endirecto').hidden) pintarEnDirecto(d);
  } catch (e) {
    $('#ed-estado').textContent = `No se pudo actualizar: ${e.message}`;
  }
}
function pintarEnDirecto(d) {
  const num = (n) => Number(n || 0).toLocaleString('es-ES', { useGrouping: 'always' });
  const pct = (n, total) => (total ? `${(Math.round((n / total) * 1000) / 10).toLocaleString('es-ES')} %` : '–');
  const min = (ms) => Math.round(ms / 60_000);
  const hora = (ms) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  // «en 20 días y 2 h», «en 3 h 15 min», «en 12 min»
  const falta = (ms) => {
    const m = min(ms);
    const dias = Math.floor(m / 1440);
    const h = Math.floor((m % 1440) / 60);
    return dias ? `${dias} día${dias > 1 ? 's' : ''}${h ? ` y ${h} h` : ''}` : m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
  };
  const fecha = (ms) => new Date(ms).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
  const [tono, estado] = d.directo == null ? ['espera', 'Pon el día y la hora del directo en la configuración']
    : d.now < d.directo ? ['espera', `Empieza ${min(d.directo - d.now) >= 1440 ? `el ${fecha(d.directo)} ` : ''}a las ${hora(d.directo)} · en ${falta(d.directo - d.now)}`]
      : d.finDirecto == null || d.now < d.finDirecto ? ['vivo', `En directo desde las ${hora(d.directo)} · hace ${falta(d.now - d.directo)}`] : ['fin', `El directo empezó a las ${hora(d.directo)}`];
  $('#ed-video').textContent = d.video;
  $('#ed-titulo').textContent = d.nombre;
  $('#ed-estado').dataset.tono = tono;
  $('#ed-estado span').textContent = estado;
  $('#ed-actualizado').textContent = `Actualizado a las ${new Date(d.now).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  const ghl = d.ghlError ? (d.ghlActualizado ? `GHL no responde: dato de las ${hora(d.ghlActualizado)}` : 'GHL no responde ahora') : 'de GHL, cada minuto';
  const carrito = d.apertura == null ? '' : d.now < d.apertura ? `El carrito abre a las ${hora(d.apertura)}` : d.cierre && d.now > d.cierre ? 'Carrito cerrado' : 'Carrito abierto';
  const stat = (label, valor, sub, ico, tone) => `<div class="ed-stat"><span class="ed-stat-l"><span class="ed-ico tone-${tone}" aria-hidden="true">${icon(ico)}</span>${esc(label)}</span><strong class="ed-stat-n">${valor}</strong><span class="ed-stat-s">${esc(sub)}</span></div>`;
  const grupo = (titulo, extra, stats) => `<section class="card ed-card"><h3 class="ed-card-t">${titulo}${extra ? ` <span class="ed-pill">${esc(extra)}</span>` : ''}</h3><div class="ed-stats">${stats.join('')}</div></section>`;
  $('#ed-kpis').innerHTML = grupo('El directo', '', [
    stat('Pantalla de espera', num(d.esperando), 'la abrieron en la hora antes', 'eye', 'info'),
    stat('Inscritas en Zoom', num(d.inscritas), 'desde la preclase (en la semana) o la espera: entran al instante', 'check', 'accent'),
    stat('Entraron al directo', num(d.entraron), d.esperando ? `${pct(d.entraron, d.esperando)} de las que esperaban` : 'desde la preclase o el enlace del directo', 'live', 'live'),
    stat('Asistencia', d.leads ? pct(d.entraron, d.leads) : '–', d.leads ? `${num(d.entraron)} de ${num(d.leads)} leads registradas` : d.leads === 0 ? 'todavía no hay leads registradas' : 'sobre el total de leads (de GHL)', 'users', 'accent'),
  ]) + grupo('Ventas', carrito, [
    ...(d.conVip ? [stat('Entradas VIP', d.vip == null ? '–' : num(d.vip), ghl, 'crown', 'vip')] : []),
    stat('Ventas del lanzamiento', d.ventas == null ? '–' : num(d.ventas), ghl, 'cart', 'buy'),
    stat('Visitas a la página de venta', num(d.visitas.total), `${num(d.visitas.recientes)} en los últimos 15 min · ver en Setting hoy`, 'eye', 'warn'),
  ]);
  // Entradas por minuto de la última hora (barras).
  const ahora = Math.floor(d.now / 60_000);
  const porMin = new Array(60).fill(0);
  for (const t of d.entradas || []) { const i = 59 - (ahora - Math.floor(t / 60_000)); if (i >= 0 && i < 60) porMin[i]++; }
  const max = Math.max(1, ...porMin);
  $('#ed-grafica').innerHTML = porMin.some(Boolean)
    ? `<div class="ed-barras" role="img" aria-label="Entradas por minuto en la última hora">${porMin.map((n, i) => `<span style="height:${Math.round((n / max) * 100)}%" title="${hora((ahora - 59 + i) * 60_000)} · ${n} entrada${n === 1 ? '' : 's'}"></span>`).join('')}</div><div class="ed-eje"><span>hace 60 min</span><span>máx. ${max}/min</span><span>ahora</span></div>`
    : '<p class="muted">Todavía no ha entrado nadie al directo en la última hora.</p>';
}
$('#ed-recargar').addEventListener('click', cargarEnDirecto);

// ---------- Botón «Atrás» del navegador / del móvil ----------
// Cada ventana que se abre y cada cambio de pestaña dejan un paso en el historial: «Atrás» cierra la
// ventana o el panel abierto (o vuelve a la pestaña anterior) en vez de salir del dashboard.
const nav = { restaurando: false };
{
  const abrir = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function showModalConAtras(...args) {
    abrir.apply(this, args);
    try { history.pushState({ ...(history.state || {}), modal: (history.state?.modal || 0) + 1 }, ''); } catch { /* sin historial */ }
    this.addEventListener('close', () => {
      // Cerrada con su ✕ o «Cancelar»: se quita su paso del historial (sin volver a cerrar nada).
      if (!nav.restaurando && history.state?.modal) { nav.saltarPop = true; history.back(); }
    }, { once: true });
  };
}
window.addEventListener('popstate', (e) => {
  if (nav.saltarPop) { nav.saltarPop = false; return; }
  const abiertas = [...document.querySelectorAll('dialog[open]')];
  if (abiertas.length) { nav.restaurando = true; abiertas.at(-1).close(); nav.restaurando = false; return; }
  if (!$('#notif-panel').hidden) { cerrarNotif(); return; }
  const menu = $('#tb-menu-cuenta');
  if (menu?.open) { menu.open = false; return; }
  const v = e.state?.view;
  if (v && VIEWS.includes(v) && allowedViews().includes(v)) { nav.restaurando = true; showView(v); nav.restaurando = false; }
});

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
  $('#dir-rango').hidden = !['dmetricas', 'dclientes'].includes(view);
  if ((view === 'dmetricas' || view === 'dclientes') && state.config && enDirecta()) renderDirecta();
  if (enVsl() && state.vsl.leads) renderVsl();
  if (view === 'comparar' && state.config) { renderCompareSelector(); renderComparativas(); }
  if (view === 'rendimiento' && state.config) loadRendimiento();
  if (view === 'meteoricos' && state.config && enMeteo()) renderMeteoView();
  if (view === 'moferta' && state.config && enMeteo()) renderMOfertaView();
  if (view === 'calendario' && state.config) renderCalendario();
  if (view === 'carrito' && state.config) renderCarritoVista();
  if (view === 'grupowa' && state.config) renderGrupoWa();
  if (view === 'paginas' && state.config) renderPaginas();
  if (view === 'anuncios' && state.config) renderAnuncios();
  // Planificador: al abrirla se cargan solos los lanzamientos anteriores que falten.
  if (view === 'objetivos' && state.config?.launches?.[state.launchCode] && !enVsl() && !enMeteo() && state.leads) renderObjetivos(currentMetrics());
  // Tareas del embudo abierto (en meteóricos, del meteórico elegido).
  if (view === 'tareas' && state.config) { if (codigo() && state.tareas?.code !== codigo()) loadTareas(); else { pintarCabeceraTareas(); renderTareas(); } }
  if (view === 'llamadas' && state.config) { if (state.llamadas?.code !== codigo()) loadLlamadas(); else renderLlamadas(); }
  // «En directo»: se carga al abrirla y cada minuto mientras está abierta (y la pestaña del navegador visible).
  clearInterval(enDirectoTimer);
  if (view === 'endirecto' && state.config) { cargarEnDirecto(); enDirectoTimer = setInterval(() => { if (!document.hidden) cargarEnDirecto(); }, 60_000); }
  if (!nav.restaurando && state.role && history.state?.view !== view) {
    try { history[history.state?.view ? 'pushState' : 'replaceState']({ view }, ''); } catch { /* sin historial */ }
  }
  pintarAyudaVista(view);
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
  // Secciones quitadas en este embudo («＋ Nuevo embudo» o su ⚙️): fuera su botón.
  const vistaNav = nav.id.replace('msub-', '');
  const ocultas = embudoInfo()?.ocultas || [];
  $$('[data-msub-btn]', nav).forEach((b) => { b.hidden = ocultas.includes(`${vistaNav}.${b.dataset.msubBtn}`); });
  const cats = $$('[data-msub-btn]', nav).filter((b) => !b.hidden).map((b) => b.dataset.msubBtn);
  // Subpestañas que se juntaron (la última elegida puede ser una de antes).
  if (nav.id === 'msub-metricas') cat = { trafico: 'captacion', origen: 'captacion', consumo: 'conversion', oferta: 'ventas' }[cat] || cat;
  if (!cats.includes(cat)) cat = cats[0];
  $$('[data-msub-btn]', nav).forEach((b) => b.classList.toggle('active', b.dataset.msubBtn === cat));
  $$('[data-msub]', view).forEach((el) => { el.hidden = el.dataset.msub !== cat; });
  ls.set(`lsd_${nav.id}`, cat);
  if (nav.id === 'msub-leads' && cat === 'encuesta' && state.config && state.leads) renderEncuestaLeads();
  if (nav.id === 'msub-metricas' && cat === 'meteorico' && state.config) renderMeteoLanz();
  if (nav.id === 'msub-metricas' && cat === 'grupos' && state.config) cargarGrupos(state.launchCode, $('#grupos-l'));
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
  if (l.s.inicio_pago && !l.s.compra) out.push(`<span class="ll-chip" title="${esc(pagoTxt(l.s.inicio_pago))}">💳${l.s.inicio_pago.veces > 1 ? ` ×${l.s.inicio_pago.veces}` : ''}</span>`);
  if (l.s.venta_visita && !l.s.compra) out.push(`<span class="ll-chip" title="${esc(visitaTxt(l.s.venta_visita))}">🛒${l.s.venta_visita.veces > 1 ? ` ×${l.s.venta_visita.veces}` : ''}</span>`);
  if (r.musica && (l.s.musica_play || l.s.musica_50 || l.s.musica_90)) out.push(`<span class="ll-chip" title="Música: ${l.s.musica_90 ? 'entera' : l.s.musica_50 ? 'más de la mitad' : 'le dio al play'}">🎵${l.s.musica_90 ? ' 90%' : l.s.musica_50 ? ' 50%' : ''}</span>`);
  const v = r.votacion && votoTexto(l.id);
  if (v) out.push(`<span class="ll-chip" title="${esc(`Sus respuestas en la clase: ${v}`)}">🗳️ ${esc(v.length > 22 ? `${v.slice(0, 21)}…` : v)}</span>`);
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
    ${(l.s.clases || ['clase1', 'clase2']).map((c, i) => `<td>${videoChip(l.s, c)}</td>${i === 0 && l.s.recursos?.test ? `<td>${l.s.test ? '<span class="enc-si" title="Ha hecho el test">✓</span>' : '<span class="enc-no" title="No ha hecho el test">✗</span>'}</td>` : ''}`).join('')}
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
  if (state.config.launches[state.launchCode]?.sendflowId && state.grupoWa?.code !== state.launchCode) cargarMiembrosGrupo();
  const open = (l) => !l.s.compra && l.phoneWa;
  // Dentro de cada lista, primero las que encajan con un avatar comprador.
  const byScore = (a, b) => (b.avatar >= 0) - (a.avatar >= 0) || b.score - a.score;
  const buckets = [
    // Las más calientes del carrito: abrieron la página de venta y no han comprado (la más reciente primero).
    { id: 'pago', title: '💳 Iniciaron el pago y no han comprado', hint: 'Pulsaron «Quiero inscribirme» y llegaron a la página de pago: lo más cerca de comprar. Escríbeles ya', rows: state.leads.filter((l) => open(l) && l.s.inicio_pago), orden: (a, b) => b.s.inicio_pago.ultima - a.s.inicio_pago.ultima },
    { id: 'venta', title: '🛒 Visitaron la página de venta y no han comprado', hint: 'Están decidiendo ahora: escríbeles cuanto antes', rows: state.leads.filter((l) => open(l) && l.s.venta_visita), orden: (a, b) => b.s.venta_visita.ultima - a.s.venta_visita.ultima },
    { id: 'calientes', title: '🔥 Muy calientes sin contactar', hint: 'Máxima prioridad', rows: state.leads.filter((l) => open(l) && !l.s.wa_enviado && l.estado.id === 'muy-caliente') },
    { id: 'vip', title: '⭐ VIP que no han comprado', hint: 'Pagaron la entrada: están cerca', rows: state.leads.filter((l) => open(l) && !l.s.wa_enviado && l.s.vip) },
    ...(state.config.launches[state.launchCode]?.sendflowId ? [{ id: 'grupo', title: '💬 En el grupo de WhatsApp y sin comprar', hint: state.grupoWa?.code === state.launchCode && state.grupoWa.claves ? 'Siguen en el grupo del lanzamiento: interesadas. Escríbeles 1:1, primero las más calientes' : state.grupoWa?.error ? `No se pudo cruzar con el grupo: ${state.grupoWa.error}` : 'Cruzando con el grupo de SendFlow… (la primera vez puede tardar 1-2 minutos)', rows: state.leads.filter((l) => open(l) && !l.s.wa_enviado && l.s.enGrupo) }] : []),
    { id: 'grabacion', title: '🎬 Vieron la grabación y no han comprado', hint: '≥50% de la grabación', rows: state.leads.filter((l) => open(l) && !l.s.wa_enviado && !l.s.vip && l.estado.id !== 'muy-caliente' && grabVenta(l.s) >= 50) },
    { id: 'seguimiento', title: '💬 Seguimiento pendiente', hint: 'Respondieron, interesadas o no contestan', rows: state.leads.filter((l) => open(l) && ['respondio', 'interesada', 'no_contesta'].includes(l.outcome)) },
    { id: 'sinresultado', title: '📝 Contactadas sin resultado anotado', hint: 'Anota qué pasó', rows: state.leads.filter((l) => open(l) && l.s.wa_enviado && !l.outcome) },
  ];
  const seen = new Set();
  $('#hoy-lists').innerHTML = buckets.map((b) => {
    const rows = b.rows.filter((l) => !seen.has(l.id)).sort(b.orden || byScore);
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
    l.s.inicio_pago ? pagoTxt(l.s.inicio_pago) : '',
    l.s.venta_visita ? visitaTxt(l.s.venta_visita) : '',
    l.s.vip ? 'VIP' : '',
    l.s.enGrupo ? 'En el grupo de WhatsApp' : '',
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
  const head = ['Nombre', 'Email', 'Teléfono', 'Tráfico', 'Clase 1', 'Test', 'Clase 2', 'VIP', 'Directo', 'Grabación', 'Compra', 'Fecha compra', 'Puntos', 'Estado', 'Siguiente mensaje', 'Contactado'];
  const v = (s, k) => (watched(s, k) ? `${watched(s, k)}%` : '');
  const live = (s) => (s.directo_final ? 'Hasta el final' : s.directo_60 ? '+60 min' : s.directo_asistio ? 'Asistió' : s.directo_click ? 'Clic' : '');
  const lines = filtered().map((l) => [l.name, l.email, l.phone, l.s.trafico, v(l.s, 'clase1'), l.s.recursos?.test ? (l.s.test ? 'Sí' : 'No') : '', v(l.s, 'clase2'), l.s.vip ? 'Sí' : '', live(l.s), v(l.s, 'replay'), l.s.compra_directo ? 'En directo' : l.s.compra ? 'Sí' : '', l.s.fecha_compra, l.score, l.estado.label, NEXT_STEPS[l.step], l.s.wa_enviado ? 'Sí' : '']);
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
      // Quién pulsó el enlace del directo (apuntado por el dashboard): su etiqueta «clic».
      const porId = new Map(state.leads.map((l) => [l.id, l]));
      for (const id of report.entraron || []) {
        const lead = porId.get(id);
        if (!lead || lead.s[`${v.directo}_click`]) continue;
        items.set(id, [...(items.get(id) || []), tagFor(state.launchCode, `${v.directo}_click`)]);
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
    await loadLeads({ forzar: true });
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
  $('#cfg-videos-nota').textContent = `El ${vs[0].nombre} usa las casillas de arriba (fechas y Zoom) y su grabación y su página van en la pestaña «④ Grabación». Si un vídeo es grabado, deja vacío su Zoom. En el ${vs.at(-1).nombre} se hace la venta.`;
  $('#cfg-videos').innerHTML = vs.slice(1).map((v) => `<fieldset class="cfg-video" data-k="${v.k}"><legend>${esc(v.nombre)}${v.venta ? ' · vídeo de venta' : ''}</legend><div class="grid2">
    ${V_CAMPOS.map(([c, label, type]) => `<label class="field"><span>${label}</span><input id="cfg-v${v.k}-${c === 'replayUrl' ? 'replay' : c === 'replayVideoUrl' ? 'replay-video' : c === 'replayAt' ? 'replay-at' : c}" data-vc="${c}" type="${type}" value="${esc(v[c] || '')}"${c === 'zoomMeetingId' ? ' inputmode="numeric"' : ''}></label>`).join('')}
  </div></fieldset>`).join('');
}
function readVideosCfg() {
  return $$('#cfg-videos .cfg-video').map((fs) => Object.fromEntries($$('[data-vc]', fs).map((i) => [i.dataset.vc, i.value.trim()])));
}

// Prelanzamiento del embudo (clases y VIP): solo se ven las casillas que tocan.
// Enlace para conectarse al directo: la página preclase (con ?cid en los emails de GHL).
// Pantalla de espera: sus campos solo si está activa.
function pintarEsperaCfg() {
  $$('#config-dialog [data-espera-campo]').forEach((el) => { el.hidden = !$('#cfg-espera-on').checked; });
}
$('#cfg-espera-on').addEventListener('change', pintarEsperaCfg);

function pintarEnlaceDirecto() {
  const pre = $('#cfg-recursos-url').value.trim();
  const box = $('#enlace-directo-box');
  if (!pre) { box.innerHTML = '<p class="enlace-directo-falta">Pon la <strong>URL de la página preclase</strong> (más abajo, en «Páginas de GHL») y aquí aparecerán los enlaces para copiar.</p>'; return; }
  const email = `${pre}${pre.includes('?') ? '&' : '?'}cid={{contact.id}}`;
  const fila = (etq, txt, nota) => `<div class="enlace-directo-fila"><span class="enlace-directo-etq">${etq}</span><code>${esc(txt)}</code><button type="button" class="btn primary" data-copy-text="${esc(txt)}">Copiar</button><small>${nota}</small></div>`;
  box.innerHTML = fila('📧 Emails de GHL', email, 'Entra directa, sin escribir nada (GHL pone el contacto en <code>{{contact.id}}</code>).')
    + fila('💬 WhatsApp', pre, 'En el grupo y en mensajes: si el móvil no la recuerda, la página le pide su email.');
}
$('#cfg-recursos-url').addEventListener('input', pintarEnlaceDirecto);

// WhatsApp para dudas: con el número y el mensaje se genera el enlace de todos los botones de WhatsApp.
function pintarWaDudas() {
  const crudo = $('#cfg-wa-numero').value.trim();
  const num = numeroWhatsApp(crudo);
  const producto = nombreProducto(state.config) || 'el programa';
  const url = enlaceWhatsApp(num, $('#cfg-wa-mensaje').value.replace(/\{producto\}/g, producto));
  $('#cfg-wa-dudas-nota').innerHTML = !crudo
    ? 'Pon el número y el mensaje: el enlace se genera solo y se pone en todos los botones de WhatsApp (<code>data-lsd-link="whatsapp-dudas"</code>). Vacío = esos botones no se ven.'
    : !num ? '⚠️ El número no es válido: ponlo con el prefijo del país (34 para España), sin «+». Ej.: 34 600 000 000.'
    : `<strong>Enlace generado</strong> (+${esc(num)}):<div class="copy-row"><code>${esc(url)}</code><button type="button" class="btn" data-copy-text="${esc(url)}">Copiar</button><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Probar ↗</a></div>Ya está puesto en los botones de WhatsApp de las páginas de venta, de pago y de replay (el flotante y el de la sección).`;
}
['#cfg-wa-numero', '#cfg-wa-mensaje'].forEach((sel) => $(sel).addEventListener('input', pintarWaDudas));

// Páginas de venta y de replay: qué código va en GHL (y dónde) y el enlace con ?cid para los emails.
const filaCopiar = (etq, txt, nota) => `<div class="enlace-directo-fila"><span class="enlace-directo-etq">${etq}</span><code${txt.includes('\n') ? ' class="multi"' : ''}>${esc(txt)}</code><button type="button" class="btn primary" data-copy-text="${esc(txt)}">Copiar</button><small>${nota}</small></div>`;
const enlaceEmail = (url) => `${url}${url.includes('?') ? '&' : '?'}cid={{contact.id}}`;
// Enlace para los emails (con el ID de la lead), bien visible bajo la URL de su página.
function pintarEnlaceEmail(box, url, pagina) {
  $(box).innerHTML = url
    ? `<div class="ee-head"><span class="ee-ico" aria-hidden="true">✉️</span><div><strong>Enlace para tus emails a la ${pagina}</strong><span>Cópialo <strong>tal cual</strong> en los botones y enlaces de los emails de GHL. Lleva <code>?cid={{contact.id}}</code> al final: así el dashboard sabe quién la abre (y la lead entra sin login). No lo cambies.</span></div></div>
      <div class="ee-fila"><code>${esc(enlaceEmail(url))}</code><button type="button" class="btn primary" data-copy-text="${esc(enlaceEmail(url))}">Copiar enlace</button></div>`
    : `<div class="ee-head ee-falta"><span class="ee-ico" aria-hidden="true">✉️</span><div><strong>Enlace para tus emails a la ${pagina}</strong><span>Pon arriba la URL de la ${pagina} y aquí aparecerá el enlace que hay que copiar en los emails.</span></div></div>`;
}

function pintarVentaPasos() {
  const url = $('#cfg-raices').value.trim();
  pintarEnlaceEmail('#venta-email-box', url, 'página de venta');
  const bloque = `<div data-lsd-venta data-launch="auto"></div>\n<script src="${location.origin}/tracker.js${cParam()}" defer></script>`;
  const fila = filaCopiar;
  $('#venta-pasos-box').innerHTML = fila('Bloque para GHL', bloque, '📍 <strong>Dónde:</strong> al final de la página, en el pie, dentro de un elemento «Código personalizado». No se ve: apunta la visita y, si la activas arriba, pinta la barra fija. También está en «Códigos». (El enlace para los emails está arriba, bajo la URL de la página.)');
}
$('#cfg-raices').addEventListener('input', pintarVentaPasos);
// ---------- Barras fijas por tramos (páginas de venta y de pago): texto, fin y con o sin botón ----------
// Cada tramo se ve hasta su fecha y al acabar empieza el siguiente. `pre`: «vb» (venta) o «pb» (pago);
// sus casillas son #cfg-<pre>-on, -color, -tramos, -add, -bonus y -resumen.
const VB_DESTINOS = ['pagina-pago', 'pago', 'pago-fraccionado', 'llamada', 'whatsapp-dudas', 'whatsapp', 'venta'];
const DESTINO_DEF = { vb: 'pagina-pago', pb: 'whatsapp-dudas' };
function vbTramoHtml(t = {}, pre = 'vb') {
  const con = Boolean(t.conBoton);
  const destinos = [...new Set([...VB_DESTINOS, ...Object.keys(LINK_KEYS).filter((k) => k)])];
  return `<div class="vb-tramo ${con ? '' : 'sin-boton'}">
    <span class="vb-n"></span>
    <label class="field vb-texto"><span>Texto <small>({cuenta} = cuenta atrás)</small></span><input class="vb-t" maxlength="200" value="${esc(t.texto || '')}" placeholder="⏳ Último día para entrar · Cierra en {cuenta}"></label>
    <label class="field"><span>Se ve hasta <small>(y ahí acaba su cuenta)</small></span><input class="vb-hasta" type="datetime-local" value="${esc(t.hasta || '')}"></label>
    <label class="field"><span>¿Lleva botón?</span><select class="vb-con"><option value="no" ${con ? '' : 'selected'}>No, solo texto</option><option value="si" ${con ? 'selected' : ''}>Sí, con botón</option></select></label>
    <label class="field" data-vb-boton><span>Adónde lleva</span><select class="vb-destino">${destinos.map((k) => `<option value="${k}" ${k === (t.destino || DESTINO_DEF[pre]) ? 'selected' : ''}>${esc(LINK_KEYS[k])}</option>`).join('')}</select></label>
    <label class="field" data-vb-boton><span>Texto del botón</span><input class="vb-boton" maxlength="40" value="${esc(t.boton || '')}" placeholder="Quiero entrar"></label>
    <button type="button" class="btn ghost vb-del" aria-label="Quitar tramo" title="Quitar tramo">✕</button>
  </div>`;
}
const leerBarraTramos = (pre) => ({
  activa: $(`#cfg-${pre}-on`).checked, color: $(`#cfg-${pre}-color`).value,
  tramos: $$(`#cfg-${pre}-tramos .vb-tramo`).map((r) => ({
    texto: $('.vb-t', r).value.trim(), hasta: $('.vb-hasta', r).value, conBoton: $('.vb-con', r).value === 'si',
    destino: $('.vb-destino', r).value, boton: $('.vb-boton', r).value.trim(),
  })).filter((t) => t.texto || t.hasta),
});
function pintarBarraTramos(pre, vb = {}) {
  $(`#cfg-${pre}-on`).checked = Boolean(vb.activa);
  $(`#cfg-${pre}-color`).value = vb.color || '#860d0e';
  $(`#cfg-${pre}-tramos`).innerHTML = (vb.tramos?.length ? vb.tramos : [{}]).map((t) => vbTramoHtml(t, pre)).join('');
  resumenBarraTramos(pre);
}
// Cómo se verá: cada tramo, de cuándo a cuándo, en orden.
function resumenBarraTramos(pre) {
  const on = $(`#cfg-${pre}-on`).checked;
  $$(`#config-dialog [data-tramos-campo="${pre}"]`).forEach((el) => { el.hidden = !on; });
  $$(`#cfg-${pre}-tramos .vb-tramo`).forEach((r, i) => {
    $('.vb-n', r).textContent = `${i + 1}`;
    r.classList.toggle('sin-boton', $('.vb-con', r).value !== 'si');
  });
  const todos = leerBarraTramos(pre).tramos;
  const tramos = todos.filter((t) => t.hasta).sort((a, b) => a.hasta.localeCompare(b.hasta));
  $(`#cfg-${pre}-resumen`).innerHTML = !on ? '' : !tramos.length
    ? '⚠️ Pon al menos un tramo con su fecha y hora: sin ella la barra no sale.'
    : `<strong>Así se verá</strong> (los tramos se ordenan solos por fecha):<ol>${tramos.map((t, i) => `<li>${i ? `Desde el ${esc(formatLong(madridToEpoch(tramos[i - 1].hasta)))}` : 'Desde que abres la página'} hasta el <strong>${esc(formatLong(madridToEpoch(t.hasta)))}</strong>: «${esc(t.texto || '⏳ Quedan {cuenta}')}»${t.conBoton ? ` + botón «${esc(t.boton || 'Quiero entrar')}» → ${esc(LINK_KEYS[t.destino] || '')}` : ' · solo texto'}</li>`).join('')}</ol>Después, la barra desaparece.${todos.some((t) => !t.hasta) ? '<br>⚠️ Hay tramos sin fecha: no saldrán.' : ''}`;
}
// Tramos con el fin de cada bonus de «Oferta» y el cierre del carrito (con las fechas del formulario).
const madridLocalFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const aLocal = (ms) => madridLocalFmt.format(new Date(ms)).replace(' ', 'T');
function tramosDeBonus(pre) {
  const base = editingCode ? state.config.launches[editingCode] : {};
  const l = { ...base, aperturaCarrito: $('#cfg-apertura-carrito').value, cierreCarrito: $('#cfg-cierre').value, fechaDirecto: $('#cfg-directo-fecha').value, horaDirecto: $('#cfg-directo-hora').value, oferta: leerOfertaEditor() };
  const cierre = madridToEpoch(l.cierreCarrito);
  if (cierre == null) { window.alert('Pon antes los días de carrito o el cierre del carrito.'); return null; }
  // Bonus que acaban antes del cierre, agrupados por su fin.
  const fines = new Map();
  for (const b of l.oferta?.bonus || []) {
    const { hasta } = ventanaBonus(b, l);
    if (hasta != null && hasta < cierre && hasta > Date.now() - 86_400_000) fines.set(hasta, [...(fines.get(hasta) || []), b.nombre]);
  }
  const DIA = 86_400_000;
  const destino = pre === 'pb' ? 'whatsapp-dudas' : 'pagina-pago';
  const boton = pre === 'pb' ? '¿Dudas? Escríbenos' : 'Quiero entrar';
  let previo = madridToEpoch(l.aperturaCarrito) ?? null;
  const tramos = [...fines.keys()].sort((a, b) => a - b).map((hasta) => {
    const nombres = fines.get(hasta).map((n) => `«${n}»`);
    const lista = nombres.length > 1 ? `los bonus ${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : `el bonus ${nombres[0]}`;
    const ultimo = previo != null && hasta - previo <= DIA;
    previo = hasta;
    return { texto: ultimo ? `🎁 Último día para llevarte ${lista} · Acaba en {cuenta}` : `🎁 Llévate ${lista} · Acaba en {cuenta}`, hasta: aLocal(hasta), conBoton: pre !== 'pb', destino, boton };
  });
  tramos.push({ texto: previo != null && cierre - previo <= DIA ? '⏳ Último día para entrar · Las puertas se cierran en {cuenta}' : '🔒 Las puertas se cierran en {cuenta}', hasta: aLocal(cierre), conBoton: pre !== 'pb', destino, boton });
  return tramos;
}
for (const pre of ['vb', 'pb']) {
  $(`#cfg-${pre}-add`).addEventListener('click', () => { $(`#cfg-${pre}-tramos`).insertAdjacentHTML('beforeend', vbTramoHtml({}, pre)); resumenBarraTramos(pre); });
  $(`#cfg-${pre}-tramos`).addEventListener('click', (e) => { if (e.target.closest('.vb-del')) { e.target.closest('.vb-tramo').remove(); resumenBarraTramos(pre); } });
  ['input', 'change'].forEach((ev) => $(`#cfg-${pre}-tramos`).addEventListener(ev, () => resumenBarraTramos(pre)));
  $(`#cfg-${pre}-on`).addEventListener('change', () => resumenBarraTramos(pre));
  $(`#cfg-${pre}-bonus`).addEventListener('click', () => {
    const tramos = tramosDeBonus(pre);
    if (!tramos) return;
    if (leerBarraTramos(pre).tramos.length && !window.confirm('Se cambiarán los tramos que hay ahora por los de los bonus y el cierre. ¿Seguimos?')) return;
    $(`#cfg-${pre}-on`).checked = true;
    $(`#cfg-${pre}-tramos`).innerHTML = tramos.map((t) => vbTramoHtml(t, pre)).join('');
    resumenBarraTramos(pre);
  });
}
// Página de pago: el copy de cada cajetín (pago único y fraccionado) y su barra por tramos.
function pintarPaginaPago(pp = {}) {
  for (const c of CAJAS_PAGO) for (const f of ['titulo', 'precio', 'texto', 'boton']) $(`#cfg-pp-${c.dom}-${f}`).value = pp[c.id]?.[f] || '';
  pintarBarraTramos('pb', pp.barra);
  pintarPagoPasos();
}
const leerPaginaPago = () => ({
  ...Object.fromEntries(CAJAS_PAGO.map((c) => [c.id, Object.fromEntries(['titulo', 'precio', 'texto', 'boton'].map((f) => [f, $(`#cfg-pp-${c.dom}-${f}`).value.trim()]))])),
  barra: leerBarraTramos('pb'),
});
// Carrito abandonado: los enlaces para los emails y WhatsApp del workflow (con el ID de la lead de GHL).
function pintarCarritoAbandonado() {
  const pago = $('#cfg-pagina-pago').value.trim();
  const llamada = $('#cfg-llamada').value.trim();
  const wa = enlaceWhatsApp($('#cfg-wa-numero').value, $('#cfg-wa-mensaje').value.replace(/\{producto\}/g, nombreProducto(state.config) || ''));
  const conCid = (u) => `${u}${u.includes('?') ? '&' : '?'}cid={{contact.id}}`;
  const falta = (que, donde) => `<p class="enlace-directo-falta">Pon ${que} (${donde}) y aquí aparecerá su enlace.</p>`;
  $('#ca-enlaces').innerHTML = (pago ? filaCopiar('Página de pago', conCid(pago), 'Para el botón «Completar mi inscripción» de los emails (lleva el ID de la lead: no vuelve a contar como nueva).') : falta('la URL de la página de pago', 'arriba'))
    + (llamada ? filaCopiar('Reservar llamada', llamada, 'Para «¿Prefieres hablarlo? Reserva una llamada».') : falta('el enlace de la llamada', 'Llamada de admisión'))
    + (wa ? filaCopiar('WhatsApp para dudas', wa, 'Por si quieres un botón de WhatsApp en los emails.') : '');
}
['#cfg-pagina-pago', '#cfg-llamada', '#cfg-wa-numero', '#cfg-wa-mensaje'].forEach((sel) => $(sel).addEventListener('input', pintarCarritoAbandonado));

// Bump offers de la entrada VIP (Configuración → Entrada VIP): activo, nombre, precio (con o sin IVA) y etiqueta.
const OPC_IVA = [['', 'Elige…'], ['incluido', 'IVA incluido'], ['mas', '+ IVA']];
const bumpFila = (b = {}) => `<div class="bump-fila${b.activo === false ? ' off' : ''}" data-bump="${esc(b.id || nuevoId('bump'))}">
    <label class="chk"><input type="checkbox" class="bump-activo"${b.activo === false ? '' : ' checked'}> Activo</label>
    <label class="field"><span>Nombre</span><input class="bump-nombre" maxlength="80" value="${esc(b.nombre || '')}" placeholder="Guía extra"></label>
    <label class="field"><span>Precio (€)</span><input class="bump-precio" inputmode="decimal" value="${b.precio ? String(b.precio).replace('.', ',') : ''}" placeholder="9"></label>
    <label class="field"><span>¿Lleva IVA?</span><select class="bump-iva">${OPC_IVA.map(([v, t]) => `<option value="${v}"${(b.iva || '') === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="field"><span>Etiqueta de quien lo compra</span><input class="bump-tag" list="tag-list" value="${esc(b.tag || '')}" placeholder="Busca la etiqueta…"></label>
    <button type="button" class="btn ghost small bump-quitar" aria-label="Quitar este bump">✕</button>
  </div>`;
const cajaBumps = (tipo) => $(`#config-dialog [data-bumps="${tipo}"]`);
function pintarBumps(tipo, lista) {
  cajaBumps(tipo).innerHTML = (lista || []).map(bumpFila).join('') || '<p class="muted small bump-vacio">Sin bump offers.</p>';
}
const leerBumps = (tipo) => $$('.bump-fila', cajaBumps(tipo)).map((f) => ({
  id: f.dataset.bump, activo: $('.bump-activo', f).checked, nombre: $('.bump-nombre', f).value.trim(),
  precio: $('.bump-precio', f).value.trim(), iva: $('.bump-iva', f).value, tag: $('.bump-tag', f).value.trim().toLowerCase(),
}));
$('#config-dialog').addEventListener('click', (e) => {
  const add = e.target.closest('[data-bump-add]');
  if (add) {
    const caja = cajaBumps(add.dataset.bumpAdd);
    $('.bump-vacio', caja)?.remove();
    caja.insertAdjacentHTML('beforeend', bumpFila());
    $('.bump-fila:last-child .bump-nombre', caja).focus();
    return;
  }
  if (!e.target.closest('.bump-quitar')) return;
  const caja = e.target.closest('[data-bumps]');
  e.target.closest('.bump-fila').remove();
  if (!$('.bump-fila', caja)) pintarBumps(caja.dataset.bumps, []);
});
$('#config-dialog').addEventListener('change', (e) => {
  if (e.target.classList.contains('bump-activo')) e.target.closest('.bump-fila').classList.toggle('off', !e.target.checked);
});

// Página de gracias por agendar la llamada: su bloque base y el vídeo de confirmación.
function pintarLlamadaPasos() {
  const script = `<script src="${location.origin}/tracker.js${cParam()}" defer></script>`;
  const video = $('#cfg-llamada-video').value.trim();
  $('#llamada-pasos-box').innerHTML = filaCopiar('1 · Bloque base', `<div data-lsd-llamada data-launch="auto"></div>\n${script}`,
    '📍 <strong>Dónde:</strong> en el pie de la página (o en Ajustes → Código de seguimiento → Footer). No se ve: pinta el vídeo y los enlaces.')
    + filaCopiar('2 · Vídeo de confirmación', '<div data-lsd-embed="llamada"></div>',
      `📍 <strong>Dónde:</strong> justo debajo del titular «Mira este vídeo para confirmar tu llamada». ${video ? 'Pinta el vídeo de arriba.' : '⚠️ Pon arriba la URL del vídeo: sin ella el bloque se oculta.'}`)
    + filaCopiar('3 · Botón de WhatsApp flotante (opcional)', WA_FLOTANTE, '📍 <strong>Dónde:</strong> en cualquier sitio (o en el footer): se queda fijo abajo a la derecha. Abre el WhatsApp de dudas de «⑥ Venta → Venta y seguimiento».');
}
$('#cfg-llamada-video').addEventListener('input', pintarLlamadaPasos);

function pintarPagoPasos() {
  const script = `<script src="${location.origin}/tracker.js${cParam()}" defer></script>`;
  const caja = (c) => `<div data-lsd-caja="${c.id}">\n  <h3 data-lsd-text="pago-${c.id}-titulo">${c.titulo}</h3>\n  <p data-lsd-text="pago-${c.id}-precio"></p>\n  <p data-lsd-text="pago-${c.id}-texto"></p>\n  <a data-lsd-link="${c.link}"><span data-lsd-text="pago-${c.id}-boton">${c.boton}</span></a>\n</div>`;
  $('#pago-pasos-box').innerHTML = filaCopiar('1 · Bloque base', `<div data-lsd-pago data-launch="auto"></div>\n${script}`,
    '📍 <strong>Dónde:</strong> en el pie de la página (o en Ajustes → Código de seguimiento → Footer). No se ve: pinta la barra fija, los textos, precios y enlaces de los cajetines.')
    + CAJAS_PAGO.map((c, i) => filaCopiar(`${i + 2} · Cajetín ${c.titulo.toLowerCase()}`, caja(c),
      `📍 <strong>Dónde:</strong> donde quieras el cajetín. Dale el diseño que quieras: solo mantén los atributos <code>data-lsd-…</code> (título, precio, texto y botón salen de aquí). ${c.id === 'fraccionado' ? 'Sin enlace de pago fraccionado, el cajetín se oculta solo.' : ''}`)).join('')
    + filaCopiar('4 · Botón de WhatsApp flotante (opcional)', WA_FLOTANTE, '📍 <strong>Dónde:</strong> en cualquier sitio (o en el footer): se queda fijo abajo a la derecha. Abre el WhatsApp de dudas de «⑥ Venta → Venta y seguimiento».');
}
const leerVentaBarra = () => leerBarraTramos('vb');
const pintarVentaBarra = (vb) => pintarBarraTramos('vb', vb);

// Barra fija de la página de replay: sus campos solo si está activa; fecha u minutos según el modo.
function pintarReplayBarraCfg() {
  const on = $('#cfg-rb-on').checked;
  $$('#config-dialog [data-rb-campo]').forEach((el) => { el.hidden = !on; });
  $$('#config-dialog [data-rb-boton]').forEach((el) => { el.hidden = $('#cfg-rb-con-boton').value !== 'si'; });
  const modo = $('#cfg-rb-modo').value;
  $$('#config-dialog [data-rb-modo]').forEach((el) => { el.hidden = el.dataset.rbModo !== modo; });
  const falta = modo === 'fecha' ? !$('#cfg-rb-at').value : !(Number($('#cfg-rb-min').value) > 0);
  const sinVenta = !$('#cfg-raices').value.trim();
  $('#cfg-rb-aviso').innerHTML = !on ? '' : sinVenta ? '⚠️ Pon la <strong>URL de la página de venta</strong> (más arriba): sin ella la barra no sale.'
    : falta ? `⚠️ Pon ${modo === 'fecha' ? 'la fecha y hora' : 'los minutos'} de la cuenta atrás: sin ${modo === 'fecha' ? 'ella' : 'ellos'} la barra no sale.`
    : modo === 'fecha' ? `Al llegar a cero (${esc(formatLong(madridToEpoch($('#cfg-rb-at').value)))}) todas van a la página de venta; quien abra la grabación después, también.`
    : `Cada lead tiene ${Number($('#cfg-rb-min').value)} minutos desde que abre la grabación; después, la página la lleva a la de venta.`;
  pintarReplayPasos();
}
['#cfg-rb-on', '#cfg-rb-con-boton', '#cfg-rb-modo', '#cfg-rb-at', '#cfg-rb-min', '#cfg-raices'].forEach((sel) => $(sel).addEventListener('input', pintarReplayBarraCfg));
function pintarReplayPasos() {
  const url = $('#cfg-replay').value.trim();
  pintarEnlaceEmail('#replay-email-box', url, 'página de replay');
  const script = `<script src="${location.origin}/tracker.js${cParam()}" defer></script>`;
  $('#replay-pasos-box').innerHTML = filaCopiar('1 · Bloque base', `<div data-lsd-page="grabacion" data-launch="auto"></div>\n${script}`,
    '📍 <strong>Dónde:</strong> arriba del todo, en la primera sección de la página (antes del titular). Va una sola vez y no se ve: reconoce a la lead (si no sabe quién es, la lleva al login) y activa el resto.')
    + ($('#cfg-rb-on').checked
      ? '<p class="enlace-directo-falta"><strong>2 · Barra de urgencia:</strong> no hace falta ningún código. La barra fija de arriba (la de esta configuración) aparece sola arriba del todo.</p>'
      : filaCopiar('2 · Barra de urgencia', '<div class="mi-barra" data-lsd-bar></div>',
        '📍 <strong>Dónde:</strong> justo debajo del bloque base, encima del titular. Enseña la cuenta atrás del carrito y su botón. Opcional (o activa arriba la barra fija con cuenta atrás).'))
    + filaCopiar('3 · Vídeo de la grabación', '<div data-lsd-video="replay"></div>',
      '📍 <strong>Dónde:</strong> en el sitio exacto donde quieres que se vea el vídeo (normalmente debajo del titular, a todo el ancho de la columna). Pinta el vídeo de «Grabación del directo» y mide cuánto ve (25, 50, 75 y 90 %). En vez del elemento de vídeo de GHL.')
    + (videosDe(editingCode ? state.config.launches[editingCode] : null).length > 1 ? '<p class="enlace-directo-falta">Lanzamiento de varios vídeos: cada vídeo tiene su propia página con sus bloques (en «Códigos»).</p>' : '');
}
$('#cfg-replay').addEventListener('input', pintarReplayPasos);

function pintarPrelanzamientoCfg(l) {
  const emb = embudoInfo(editingCode ? embudoDeLanz(l) : state.embudo) || {};
  const preclase = emb.preclase !== false;
  const nc = !preclase ? 0 : [1, 2, 3].includes(emb.clases) ? emb.clases : 2;
  const vip = emb.vip !== false;
  $$('#config-dialog [data-clase]').forEach((el) => { el.hidden = Number(el.dataset.clase) > nc; });
  // Sin área de recursos preclase: fuera sus páginas, la encuesta de la página y las clases.
  $$('#config-dialog [data-preclase]').forEach((el) => { el.hidden = !preclase; });
  $('#tab-pagina-txt').textContent = preclase ? '③ Preclase' : '③ Página del directo';
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
      precioVip: last.precioVip, iva: last.iva, vipBumps: last.vipBumps, unicoBumps: last.unicoBumps, fraccionadoBumps: last.fraccionadoBumps, precioPrograma: last.precioPrograma, precioFraccionado: last.precioFraccionado, pago: last.pago, oferta: last.oferta, fraccionadoTag: last.fraccionadoTag, unicoTag: last.unicoTag, publiTag: last.publiTag, organicoTag: last.organicoTag,
      vipContadorBase: embudoInfo(state.embudo)?.vipContadorBase ?? last.vipContadorBase,
      // Las clases son las mismas en cada lanzamiento: se heredan sus vídeos y textos.
      clase1Url: last.clase1Url, clase2Url: last.clase2Url, clase3Url: last.clase3Url, textos: last.textos, imagenes: last.imagenes,
      // Los recursos de la preclase se heredan sin fechas; los que pidió el embudo al crearlo, activos.
      recursosPre: heredarRecursos(last.recursosPre, embudoInfo(state.embudo)?.recursos),
      // Pantalla de espera: la que se eligió al crear el embudo; el vídeo, el del último lanzamiento.
      espera: { activa: embudoInfo(state.embudo)?.espera !== false, video: last.espera?.video || '' },
      // La barra fija del replay se hereda sin su fecha (cada lanzamiento tiene la suya).
      ...(last.replayBarra ? { replayBarra: { ...last.replayBarra, at: '' } } : {}),
      diasCarrito: last.diasCarrito,
      whatsappDudas: last.whatsappDudas, whatsappDudasUrl: last.whatsappDudasUrl,
      paginaPagoUrl: last.paginaPagoUrl,
      carritoAbandonadoTag: last.carritoAbandonadoTag,
      // La página de pago se hereda con su copy; su barra, sin fechas.
      ...(last.paginaPago ? { paginaPago: { ...last.paginaPago, barra: { ...(last.paginaPago.barra || {}), tramos: (last.paginaPago.barra?.tramos || []).map((t) => ({ ...t, hasta: '' })) } } } : {}),
      // La barra de la página de venta se hereda con sus textos y botones, sin fechas.
      ...(last.ventaBarra?.tramos?.length ? { ventaBarra: { ...last.ventaBarra, tramos: last.ventaBarra.tramos.map((t) => ({ ...t, hasta: '' })) } } : {}),
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
  for (const k of ['clase1', 'clase2', 'clase3', 'test', 'descargable', 'espera']) $(`#cfg-img-${k}`).value = l.imagenes?.[k] || '';
  $('#cfg-replay-video').value = l.replayVideoUrl || '';
  $('#cfg-replay-at').value = l.replayAt || '';
  $('#cfg-vip-url').value = l.vipUrl || '';
  $('#cfg-vip-base').value = l.vipContadorBase ?? embudoInfo(embudoDeLanz(l))?.vipContadorBase ?? (esPrincipal() ? 41 : 0);
  $('#cfg-whatsapp-url').value = l.whatsappUrl || '';
  opcionSendflow($('#cfg-sendflow'), l.sendflowId || '');
  $('#cfg-gracias-video').value = l.graciasVideoUrl || '';
  $('#cfg-gracias-url').value = l.graciasUrl || '';
  $('#cfg-cierre').value = l.cierreCarrito || '';
  $('#cfg-dias-carrito').value = l.diasCarrito || '';
  pintarDiasCarrito();
  $('#cfg-calendario-url').value = l.calendarioUrl || '';
  renderBarraEditor(l.barra || {});
  renderEnlacesEditor(l.enlaces || {});
  renderTextosEditor(l.textos || {});
  renderPhaseNow(l);
  fillDateFields(l.compraDateField);
  $('#cfg-zoom-id').value = l.zoomMeetingId || '';
  $('#cfg-zoom-url').value = l.zoomJoinUrl || '';
  $('#cfg-replay').value = l.replayUrl || '';
  $('#cfg-raices').value = l.raicesUrl || '';
  const wa = l.whatsappDudas?.numero ? l.whatsappDudas : leerEnlaceWhatsApp(l.whatsappDudasUrl);
  $('#cfg-wa-numero').value = wa.numero || '';
  $('#cfg-wa-mensaje').value = wa.mensaje || '';
  pintarWaDudas();
  $('#cfg-venta').value = l.ventaUrl || '';
  $('#cfg-pagina-pago').value = l.paginaPagoUrl || '';
  $('#cfg-venta-fraccionado').value = l.ventaFraccionadoUrl || '';
  $('#cfg-llamada').value = l.llamadaUrl || '';
  $('#cfg-llamada-gracias').value = l.llamadaGraciasUrl || '';
  $('#cfg-llamada-video').value = l.llamadaVideoUrl || '';
  pintarLlamadaPasos();
  $('#cfg-precio-vip').value = l.precioVip || '';
  $('#cfg-iva-vip').value = l.iva?.vip || '';
  $('#cfg-iva-programa').value = l.iva?.programa || '';
  $('#cfg-iva-pct').value = l.iva?.pct != null && l.iva.pct !== 21 ? String(l.iva.pct).replace('.', ',') : '';
  for (const t of TIPOS_BUMP) pintarBumps(t.id, l[t.campo]);
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
  pintarEnlaceDirecto();
  pintarVentaPasos();
  pintarVentaBarra(l.ventaBarra);
  pintarPaginaPago(l.paginaPago);
  $('#cfg-ca-tag').value = l.carritoAbandonadoTag ?? '';
  pintarCarritoAbandonado();
  carritoNotasEdit = { ...(l.carritoNotas || {}) };
  carritoEnviosEdit = JSON.parse(JSON.stringify(l.carritoEnvios || {}));
  $('#carrito-dias').innerHTML = '';
  const rb = l.replayBarra || {};
  $('#cfg-rb-on').checked = Boolean(rb.activa);
  $('#cfg-rb-texto').value = rb.texto || '';
  $('#cfg-rb-modo').value = rb.modo === 'minutos' ? 'minutos' : 'fecha';
  $('#cfg-rb-at').value = rb.at || '';
  $('#cfg-rb-min').value = rb.minutos || '';
  $('#cfg-rb-con-boton').value = rb.conBoton ? 'si' : 'no';
  $('#cfg-rb-boton').value = rb.boton || 'Ver la oferta';
  $('#cfg-rb-color').value = rb.color || '#860d0e';
  pintarReplayBarraCfg();
  $('#cfg-espera-on').checked = l.espera?.activa ?? (embudoInfo(editingCode ? embudoDeLanz(l) : state.embudo)?.espera !== false);
  $('#cfg-espera-video').value = l.espera?.video || '';
  pintarEsperaCfg();
  checkLaunchTags();
  renderGuia();
  if (!dlg.open) dlg.showModal();
}

$('#cfg-launch-pick').addEventListener('change', (e) => openConfig(e.target.value));
$('#btn-config').addEventListener('click', () => (enVsl() ? openVslConfig() : enDirecta() ? abrirDirectaConfig() : enMeteo() ? abrirMeteoDialog(state.meteo.code, { embudo: state.embudo }) : openConfig(state.launchCode)));
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
  { id: 'cfg-llamada-gracias', c: 'revisar', label: 'Gracias por agendar', opcional: true },
  { id: 'cfg-llamada-video', c: 'revisar', label: 'Vídeo de confirmar la llamada', opcional: true },
  { id: 'cfg-precio-vip', c: 'revisar', label: 'Precio VIP' },
  { id: 'cfg-iva-vip', c: 'revisar', label: 'IVA del precio VIP' },
  { id: 'cfg-iva-programa', c: 'revisar', label: 'IVA de los precios del programa' },
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
  // Cada pestaña con campos que revisar tiene su checklist (las que no tienen caja, la reciben arriba).
  const CAJAS_GUIA = { launch: '#guia-check', etiquetas: '#guia-check-etiquetas', pagina: '#guia-check-pagina', embudo: '#guia-check-embudo' };
  const todos = []; // para la barra «Listo para lanzar»
  for (const panel of $$('#config-dialog .tab-panel').map((p) => p.dataset.panel)) {
    let box = CAJAS_GUIA[panel] || `#guia-check-${panel}`;
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
    todos.push(...total.map((i) => ({ ...i, panel })));
    // En la pestaña, cuántas cosas faltan.
    const tab = $(`#config-dialog .tab[data-tab="${panel}"]`);
    const faltanTab = total.filter((i) => i.st === 'falta').length;
    let cnt = tab && $('.tab-falta', tab);
    if (tab && faltanTab && !cnt) { tab.insertAdjacentHTML('beforeend', '<span class="tab-falta"></span>'); cnt = $('.tab-falta', tab); }
    if (cnt) { cnt.textContent = faltanTab || ''; cnt.hidden = !faltanTab; cnt.title = `Faltan ${faltanTab} en esta pestaña`; }
    if (!$(box)) {
      if (!total.length) continue;
      const pnl = $(`#config-dialog .tab-panel[data-panel="${panel}"]`);
      const intro = $(':scope > .cfg-intro', pnl);
      (intro || pnl.firstElementChild).insertAdjacentHTML(intro ? 'afterend' : 'beforebegin', `<div class="guia" role="note"><strong>Qué falta en esta pestaña</strong><div id="guia-check-${panel}" class="guia-check"></div></div>`);
      box = `#guia-check-${panel}`;
    }
    const listos = total.filter((i) => i.st === 'ok' || i.st === 'opt').length;
    const html = `<p class="guia-sub"><strong>${listos} de ${total.length}</strong> listos · pulsa uno para ir a él</p>
      <div class="guia-groups">${groups.map((g) => `<div class="guia-group"><span class="guia-group-t">${esc(g.title)}</span><div class="guia-items">${g.items.map((i) => `<button type="button" class="guia-item guia-${i.st}" data-goto="${i.f.id}">${GUIA_ICON[i.st]} ${esc(i.f.label)} <small>${esc(i.txt)}</small></button>`).join('')}</div></div>`).join('')}</div>`;
    // Solo se repinta si algo cambió: el «change» al salir de un campo no debe borrar el botón que se está pulsando.
    if (html !== guiaHtml[panel]) $(box).innerHTML = guiaHtml[panel] = html;
  }
  pintarListo(todos);
}

// Barra «Listo para lanzar»: lo que está listo de todas las pestañas y un botón al primero que falta
// (por orden de pestañas: lo de «Datos básicos» antes que lo de «Venta»).
function pintarListo(todos) {
  const box = $('#cfg-listo');
  const listos = todos.filter((i) => i.st === 'ok' || i.st === 'opt').length;
  const faltan = todos.filter((i) => i.st === 'falta');
  const revisar = todos.filter((i) => i.st === 'warn');
  const pct = todos.length ? Math.round((listos / todos.length) * 100) : 0;
  const sig = faltan[0] || revisar[0];
  const html = !todos.length ? '' : `<div class="cfg-listo-txt"><strong>${faltan.length ? 'Listo para lanzar' : '✓ Listo para lanzar'}: ${listos} de ${todos.length}</strong>
      <span class="muted small">${faltan.length ? `Faltan ${faltan.length}` : 'No falta nada'}${revisar.length ? ` · ${revisar.length} por revisar` : ''}</span></div>
    <div class="cfg-listo-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span class="${faltan.length ? '' : 'ok'}" style="width:${pct}%"></span></div>
    ${sig ? `<button type="button" class="btn small" data-goto="${sig.f.id}">${faltan.length ? 'Ir a lo que falta' : 'Ir a revisar'}: ${esc(sig.f.label)} →</button>` : ''}`;
  if (box.dataset.html !== html) { box.innerHTML = html; box.dataset.html = html; }
}
$('#config-dialog').addEventListener('click', (e) => {
  const b = e.target.closest('.guia-check [data-goto], #cfg-listo [data-goto]');
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
  $('#cfg-rec-votacion-tras').value = r.votacion.tras;
  pintarPreguntasCfg(r.votacion.preguntas);
  $('#cfg-rec-descargable-nombre').value = r.descargable.nombre;
  $('#cfg-rec-descargable-url').value = r.descargable.url;
  $('#cfg-rec-descargable-at').value = r.descargable.at;
  pintarRecursosVis();
}
// Preguntas de la votación: cada una tipo test (opciones, una por línea) o de respuesta libre.
// Cada pregunta guarda su id (p1, p2…) para que sus respuestas sigan siendo suyas aunque cambie el texto.
function preguntaCfgHtml(q, i) {
  return `<div class="vot-q" data-qid="${esc(q.id || '')}">
    <div class="vot-q-head"><strong>Pregunta ${i + 1}</strong>
      <select data-q-tipo aria-label="Tipo de pregunta"><option value="opciones" ${q.tipo !== 'libre' ? 'selected' : ''}>Tipo test (opciones)</option><option value="libre" ${q.tipo === 'libre' ? 'selected' : ''}>Respuesta libre</option></select>
      <span class="spacer"></span><button type="button" class="btn ghost" data-q-quitar>Quitar</button></div>
    <input data-q-texto maxlength="200" placeholder="¿Qué te ha sorprendido más de la clase?" value="${esc(q.pregunta || '')}" aria-label="Pregunta">
    <textarea data-q-opciones rows="3" placeholder="Una opción por línea" aria-label="Opciones" ${q.tipo === 'libre' ? 'hidden' : ''}>${esc((q.opciones || []).map((o) => o.texto).join('\n'))}</textarea>
  </div>`;
}
function pintarPreguntasCfg(preguntas) {
  const lista = preguntas?.length ? preguntas : [{ tipo: 'opciones', pregunta: '', opciones: [] }];
  $('#cfg-rec-votacion-preguntas').innerHTML = lista.map(preguntaCfgHtml).join('');
  $('#cfg-rec-votacion-add').disabled = lista.length >= 6;
}
function leerPreguntasCfg() {
  return $$('#cfg-rec-votacion-preguntas .vot-q').map((el) => ({
    id: el.dataset.qid || undefined,
    tipo: $('[data-q-tipo]', el).value,
    pregunta: $('[data-q-texto]', el).value,
    opciones: $('[data-q-opciones]', el).value,
  }));
}
$('#cfg-rec-votacion-add').addEventListener('click', () => {
  const actuales = leerPreguntasCfg();
  if (actuales.length >= 6) return;
  pintarPreguntasCfg([...actuales.map((q) => ({ ...q, opciones: String(q.opciones).split('\n').filter(Boolean).map((t) => ({ texto: t })) })), { tipo: 'opciones', pregunta: '', opciones: [] }]);
  $$('#cfg-rec-votacion-preguntas [data-q-texto]').at(-1).focus();
  pintarRecursosVis();
});
$('#cfg-rec-votacion-preguntas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-q-quitar]');
  if (!b) return;
  const el = b.closest('.vot-q');
  if ($$('#cfg-rec-votacion-preguntas .vot-q').length === 1) { $('[data-q-texto]', el).value = ''; $('[data-q-opciones]', el).value = ''; }
  else el.remove();
  $$('#cfg-rec-votacion-preguntas .vot-q-head strong').forEach((x, i) => { x.textContent = `Pregunta ${i + 1}`; });
  $('#cfg-rec-votacion-add').disabled = false;
  pintarRecursosVis();
});
$('#cfg-rec-votacion-preguntas').addEventListener('change', (e) => {
  const sel = e.target.closest('[data-q-tipo]');
  if (sel) $('[data-q-opciones]', sel.closest('.vot-q')).hidden = sel.value === 'libre';
});

// Las opciones de la votación van por posición (o1, o2…): los votos guardan esa posición.
function leerRecursosCfg() {
  return sanitizeRecursos({
    musica: { activo: $('#cfg-rec-musica-on').checked, nombre: $('#cfg-rec-musica-nombre').value, url: $('#cfg-rec-musica-url').value, tras: $('#cfg-rec-musica-tras').value, texto: $('#cfg-rec-musica-texto').value },
    test: { activo: $('#cfg-rec-test-on').checked, nombre: $('#cfg-rec-test-nombre').value, url: $('#cfg-rec-test-url').value, tag: $('#cfg-rec-test-tag').value, at: $('#cfg-rec-test-at').value },
    votacion: { activo: $('#cfg-rec-votacion-on').checked, preguntas: leerPreguntasCfg(), tras: $('#cfg-rec-votacion-tras').value },
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
    + (faltan.length ? `<p class="muted small">Sin completar (no salen en la página): ${faltan.map((t) => TIPOS_RECURSO.find((x) => x.id === t).label).join(', ')}. ${faltan.includes('votacion') ? 'La votación necesita al menos una pregunta (las tipo test, con 2 opciones o más).' : ''}</p>` : '');
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
      sendflowId: $('#cfg-sendflow').value,
      graciasVideoUrl: $('#cfg-gracias-video').value.trim(),
      graciasUrl: $('#cfg-gracias-url').value.trim(),
      cierreCarrito: $('#cfg-cierre').value,
      diasCarrito: diasCarritoValido($('#cfg-dias-carrito').value),
      calendarioUrl: $('#cfg-calendario-url').value.trim(),
      barra: readBarraEditor(),
      enlaces: readEnlacesEditor(),
      textos: readTextosEditor(),
      zoomMeetingId: $('#cfg-zoom-id').value,
      zoomJoinUrl: $('#cfg-zoom-url').value.trim(),
      videos: readVideosCfg(),
      replayUrl: $('#cfg-replay').value.trim(),
      raicesUrl: $('#cfg-raices').value.trim(),
      whatsappDudas: { numero: $('#cfg-wa-numero').value.trim(), mensaje: $('#cfg-wa-mensaje').value.trim() },
      ventaUrl: $('#cfg-venta').value.trim(),
      paginaPagoUrl: $('#cfg-pagina-pago').value.trim(),
      ventaFraccionadoUrl: $('#cfg-venta-fraccionado').value.trim(),
      llamadaUrl: $('#cfg-llamada').value.trim(),
      llamadaGraciasUrl: $('#cfg-llamada-gracias').value.trim(),
      llamadaVideoUrl: $('#cfg-llamada-video').value.trim(),
      precioVip: $('#cfg-precio-vip').value,
      iva: { vip: $('#cfg-iva-vip').value, programa: $('#cfg-iva-programa').value, pct: $('#cfg-iva-pct').value.trim() ? Number($('#cfg-iva-pct').value.trim().replace(',', '.')) : 21 },
      ...Object.fromEntries(TIPOS_BUMP.map((t) => [t.campo, leerBumps(t.id)])),
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
      espera: { activa: $('#cfg-espera-on').checked, video: $('#cfg-espera-video').value.trim() },
      ventaBarra: leerVentaBarra(),
      paginaPago: leerPaginaPago(),
      carritoAbandonadoTag: $('#cfg-ca-tag').value.trim(),
      carritoNotas: leerCarritoNotas(),
      carritoEnvios: leerCarritoEnvios(),
      replayBarra: {
        activa: $('#cfg-rb-on').checked, texto: $('#cfg-rb-texto').value.trim(), modo: $('#cfg-rb-modo').value,
        at: $('#cfg-rb-at').value, minutos: Number($('#cfg-rb-min').value) || null, conBoton: $('#cfg-rb-con-boton').value === 'si', boton: $('#cfg-rb-boton').value.trim(), color: $('#cfg-rb-color').value,
      },
      imagenes: Object.fromEntries(['clase1', 'clase2', 'clase3', 'test', 'descargable', 'espera'].map((k) => [k, $(`#cfg-img-${k}`).value.trim()]).filter(([, v]) => v)),
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
    await selectLaunch(code, { forzar: true });
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
  await selectLaunch(state.launchCode, { forzar: true });
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
  const opts = (sel) => Object.entries(LINK_KEYS).filter(([k]) => k).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
  // Fases según los vídeos del lanzamiento (con varios, cada vídeo y el tiempo entre vídeos).
  const l = editingCode ? state.config.launches[editingCode] : null;
  const fases = phasesFor({ ...(l || {}), formato: formatoDeLanz(l) });
  $('#cfg-barra').innerHTML = fases.map((p) => {
    const b = barra[p.id] || {};
    const boton = b.button != null ? b.button : p.button;
    // Cada barra pregunta si lleva botón: algunas son solo informativas (para crear urgencia).
    return `<tr data-phase="${p.id}" class="${boton ? '' : 'sin-boton'}">
      <td>${esc(p.label)}</td>
      <td><input class="bar-text" value="${esc(b.text || '')}" placeholder="${esc(p.text)}"></td>
      <td><select class="bar-con-boton" aria-label="¿Lleva botón?"><option value="no" ${boton ? '' : 'selected'}>No, solo texto</option><option value="si" ${boton ? 'selected' : ''}>Sí, con botón</option></select></td>
      <td><select class="bar-button" aria-label="Adónde lleva el botón">${opts(boton || p.button || 'venta')}</select></td>
      <td><input class="bar-label" value="${esc(b.buttonLabel || '')}" placeholder="Texto del botón"></td>
    </tr>`;
  }).join('');
}
$('#cfg-barra').addEventListener('change', (e) => {
  if (e.target.matches('.bar-con-boton')) e.target.closest('tr').classList.toggle('sin-boton', e.target.value !== 'si');
});

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
  $$('#config-dialog [data-texto]').forEach((el) => { fixed.add(el.dataset.texto); el.value = textos[el.dataset.texto] || ''; });
  $('#cfg-textos').innerHTML = Object.entries(textos).filter(([k]) => !fixed.has(k)).map(([k, v]) => textoRow(k, v)).join('');
}

function readTextosEditor() {
  const out = {};
  $$('#cfg-textos .texto-row').forEach((r) => {
    const k = $('.txt-key', r).value.trim().toLowerCase();
    const v = $('.txt-val', r).value.trim();
    if (k && v) out[k] = v;
  });
  $$('#config-dialog [data-texto]').forEach((el) => { if (el.value.trim()) out[el.dataset.texto] = el.value.trim(); });
  return out;
}

$('#btn-add-texto').addEventListener('click', () => $('#cfg-textos').insertAdjacentHTML('beforeend', textoRow()));
$('#cfg-textos').addEventListener('click', (e) => { if (e.target.closest('.txt-del')) e.target.closest('.texto-row').remove(); });

function readBarraEditor() {
  const out = {};
  $$('#cfg-barra tr').forEach((tr) => {
    out[tr.dataset.phase] = { text: $('.bar-text', tr).value.trim(), button: $('.bar-con-boton', tr).value === 'si' ? $('.bar-button', tr).value : '', buttonLabel: $('.bar-label', tr).value.trim() };
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

// Botón flotante de WhatsApp para dudas (el mismo que bloques-ghl/whatsapp-flotante.html).
const WA_FLOTANTE = "<a class=\"mldlm-wa\" data-lsd-link=\"whatsapp-dudas\" target=\"_blank\" rel=\"noopener\" aria-label=\"¿Dudas? Escríbenos por WhatsApp\">\n  <span class=\"mldlm-wa__txt\">¿Dudas? Escríbenos</span>\n  <span class=\"mldlm-wa__ico\" aria-hidden=\"true\"><svg viewBox=\"0 0 32 32\" width=\"30\" height=\"30\"><path fill=\"#fff\" d=\"M16 3C8.8 3 3 8.7 3 15.8c0 2.5.7 4.9 2 7L3 29l6.4-2c2 1.1 4.3 1.7 6.6 1.7 7.2 0 13-5.7 13-12.8S23.2 3 16 3Zm0 23.4c-2.1 0-4.1-.6-5.9-1.7l-.4-.3-3.8 1.2 1.2-3.7-.3-.4c-1.2-1.8-1.9-3.9-1.9-6.1C4.9 9.8 9.9 5 16 5s11.1 4.8 11.1 10.8S22.1 26.4 16 26.4Zm6.1-8c-.3-.2-2-1-2.3-1.1-.3-.1-.5-.2-.8.2-.2.3-.9 1.1-1.1 1.3-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.7-1.7-1-.9-1.7-2-1.9-2.3-.2-.3 0-.5.1-.7l.5-.6c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.6l-1-2.5c-.3-.7-.5-.6-.8-.6h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.2-1.2 2.9s1.2 3.4 1.4 3.6c.2.2 2.4 3.7 5.9 5.1 2.9 1.1 3.5.9 4.1.9.6-.1 2-.8 2.3-1.6.3-.8.3-1.5.2-1.6-.1-.2-.3-.3-.6-.4Z\"/></svg></span>\n</a>\n<style>\n.mldlm-wa{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));z-index:2147481000;display:flex;align-items:center;gap:10px;text-decoration:none!important;font-family:'Lato',Helvetica,Arial,sans-serif}\n.mldlm-wa:not([href]){display:none}\n.mldlm-wa__ico{display:flex;align-items:center;justify-content:center;width:60px;height:60px;border-radius:50%;background:#25d366;box-shadow:0 6px 18px rgba(0,0,0,.22);transition:transform .2s ease;animation:mldlm-wa-pulso 2.6s ease-out 1.5s 3}\n.mldlm-wa__txt{background:#fff;color:#3a2a24;font-weight:700;font-size:14px;padding:9px 14px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.14);white-space:nowrap}\n.mldlm-wa:hover .mldlm-wa__ico,.mldlm-wa:focus-visible .mldlm-wa__ico{transform:scale(1.07)}\n.mldlm-wa:focus-visible{outline:none}.mldlm-wa:focus-visible .mldlm-wa__ico{box-shadow:0 0 0 4px rgba(37,211,102,.35),0 6px 18px rgba(0,0,0,.22)}\n@keyframes mldlm-wa-pulso{0%{box-shadow:0 0 0 0 rgba(37,211,102,.55),0 6px 18px rgba(0,0,0,.22)}100%{box-shadow:0 0 0 18px rgba(37,211,102,0),0 6px 18px rgba(0,0,0,.22)}}\n@media (max-width:600px){.mldlm-wa__txt{display:none}.mldlm-wa__ico{width:56px;height:56px}}\n@media (prefers-reduced-motion:reduce){.mldlm-wa__ico{animation:none;transition:none}}\n</style>";

// Plan B del directo para las páginas de GHL: botón con el enlace genérico de Zoom, ya escrito en la página.
// Oculto siempre; su propio reloj (script en la página) lo enseña solo desde la hora del directo y durante 3 h,
// y solo si el dashboard no cargó (tracker.js pone window.lsdCargado). Así, un día normal no se ve nunca.
const SCRIPT_RESPALDO = `<script>
(function () {
  function madrid(s) { var d = new Date(s + ':00Z'); var f = function (tz) { return new Date(d.toLocaleString('en-US', { timeZone: tz })).getTime(); }; return d.getTime() - (f('Europe/Madrid') - f('UTC')); }
  function mirar() {
    var cajas = document.querySelectorAll('[data-lsd-respaldo]');
    for (var i = 0; i < cajas.length; i++) {
      var ini = madrid(cajas[i].getAttribute('data-directo')), ahora = Date.now();
      cajas[i].style.display = !window.lsdCargado && ahora >= ini && ahora <= ini + 3 * 3600000 ? 'block' : 'none';
    }
  }
  setTimeout(mirar, 8000); setInterval(mirar, 30000);
})();
</script>`;
function respaldoDirecto(launch) {
  const vids = videosDe(launch).filter((v) => v.zoomJoinUrl && v.fecha);
  if (!vids.length) return 'Pon primero la fecha y hora del directo y el «Enlace genérico de Zoom» en Configuración y aquí saldrá el bloque con el botón.';
  const caja = (v) => `<div data-lsd-respaldo data-directo="${esc(v.fecha)}T${esc(v.hora || '19:00')}" style="display:none;margin:16px auto;max-width:560px;padding:16px;border:2px solid #2d8cff;border-radius:14px;text-align:center;line-height:1.5">
  <strong>Si no te redirige automáticamente a la sala del directo, pulsa el botón de abajo y te llevamos:</strong><br>
  <a href="${esc(v.zoomJoinUrl)}" target="_blank" rel="noopener" style="display:inline-block;margin:8px 4px 0;padding:12px 20px;background:#2d8cff;color:#fff;border-radius:10px;text-decoration:none;font-weight:700">Entrar ${vids.length > 1 ? `a ${esc(v.nombre)}` : 'al directo'} por Zoom</a>
</div>`;
  return `${vids.map(caja).join('\n')}\n${SCRIPT_RESPALDO}`;
}
// Códigos de las páginas de GHL de un lanzamiento: [[título, código]]. Los usan «Códigos para GHL» y los
// prompts de Páginas (cada página, los suyos por el prefijo del título: REGISTRO, RECURSOS, VENTA…).
function snippetsLanzamiento(code) {
  const origin = location.origin;
  const script = `<script src="${origin}/tracker.js${cParam()}" defer></script>`;
  return [
    ['REGISTRO · visitas únicas de la página de registro (en el footer; para la conversión de la página en Métricas)',
      `<div data-lsd-registro data-launch="auto"></div>\n${script}`],
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
    ['RECURSOS · plan B del directo: botón directo a Zoom (solo aparece el día del directo, desde su hora y durante 3 h, y solo si el dashboard no carga; ponlo arriba de la preclase y bajo el acceso. Lleva la fecha, la hora y el Zoom de ESTE lanzamiento: vuelve a pegarlo si cambian)', respaldoDirecto(state.config.launches[code])],
    ['RECURSOS · encuesta (sin ella no se ven las clases 1 y 2)',
      '<div data-lsd-if="encuesta-pendiente">\n  Antes de ver las clases, cuéntanos un poco sobre ti\n  <a data-lsd-link="encuesta">Rellenar la encuesta</a>\n</div>\n<div data-lsd-if="encuesta-hecha">✓ ¡Gracias por rellenar la encuesta!</div>'],
    // Recursos de la preclase (pestaña Preclase): música, test, votación, descargable y etapas.
    ...(tieneRecurso(state.config.launches[code], 'musica') ? [['RECURSOS · música (debajo de su clase; se desbloquea al ver el 75 % de la clase)', '<div data-lsd-audio="musica"></div>']] : []),
    ...(tieneRecurso(state.config.launches[code], 'test') ? [['RECURSOS · test (botón; se desbloquea en su fecha y con la encuesta rellenada)',
      '<div data-lsd-if="test-bloqueado">🔒 El test se abre en <span data-lsd-countdown="test"></span></div>\n<div data-lsd-if="test-falta-encuesta">🔒 Para hacer el test, rellena primero la encuesta (etapa 1)</div>\n<div data-lsd-if="test-disponible">\n  <a data-lsd-link="test">Hacer el test</a>\n</div>\n<div data-lsd-if="test-hecho">✓ ¡Test completado!</div>']] : []),
    ...(tieneRecurso(state.config.launches[code], 'votacion') ? [['RECURSOS · votación (debajo de su clase; se abre al ver el 75 % de la clase; tipo test enseña los % al responder)', '<div data-lsd-votacion></div>']] : []),
    ...(tieneRecurso(state.config.launches[code], 'descargable') ? [['RECURSOS · recurso descargable (se mide quién lo abre)', '<div data-lsd-if="descargable-bloqueado">🔒 Disponible en <span data-lsd-countdown="descargable"></span></div>\n<a data-lsd-if="descargable-disponible" data-lsd-link="descargable">Descargar</a>']] : []),
    ['RECURSOS · imagen de una etapa (la URL se pone en Configuración → Preclase; sin imagen, se oculta)', '<img data-lsd-img="clase1" alt="">'],
    ['RECURSOS · etapas (cada caja recibe data-lsd-estado="bloqueada | disponible | hecha" para el diseño)',
      etapasPreclase(state.config.launches[code], nClases(state.config.launches[code])).map((e) => `<div data-lsd-etapa="${e.id}">Etapa <span data-lsd-etapa-n="${e.id}"></span> · ${e.label}</div>`).join('\n')],
    ['RECURSOS · añadir el directo al calendario (Google y, opcional, Apple/Outlook)', '<a data-lsd-link="calendario" target="_blank">Añadir a Google Calendar</a>\n<a data-lsd-link="calendario-ics">Añadir a Apple / Outlook</a>'],
    ['VENTA · página de venta de Raíces: al final de la página, en el pie (apunta quién la visita para «Setting hoy» y pinta la barra fija si está activa en Páginas; los enlaces a esta página en los emails, con ?cid={{contact.id}})', `<div data-lsd-venta data-launch="auto"></div>\n${script}`],
    ['WHATSAPP · botón flotante abajo a la derecha (páginas de venta y de replay; abre el WhatsApp de dudas de ⑥ Venta → Venta y seguimiento)', WA_FLOTANTE],
    ['PAGO · bloque base de la página de pago (en el pie: barra fija, textos, precios y enlaces de los cajetines; el resto, en ⑥ Venta → Página de pago)', `<div data-lsd-pago data-launch="auto"></div>\n${script}`],
    ['INSCRIBIRME · botón a la página de pago (páginas de venta y de replay; la URL va en ⑥ Venta → Página de pago)', '<a data-lsd-link="pagina-pago">Quiero inscribirme en Raíces</a>'],
    ['WHATSAPP · botón para una sección (sin estilo: dale el tuyo)', '<a data-lsd-link="whatsapp-dudas">Escríbenos por WhatsApp</a>'],
    ['GRABACIÓN · bloques de la página del replay (el 1º y la barra arriba del todo; el de vídeo, donde quieras que se vea; el paso a paso, en ④ Grabación → Página de replay)', `<div data-lsd-page="grabacion" data-launch="auto"></div>\n<div class="mi-barra" data-lsd-bar></div>\n<div data-lsd-video="replay"></div>\n${script}`],
    ['Enlace al LOGIN o a los RECURSOS en emails de GHL (añádelo al final de la URL: entra directa)', '?cid={{contact.id}}'],
    // El enlace para conectarse al directo es el de la preclase: 59 min antes enseña la pantalla de espera y al llegar a cero entra sola.
    ...(() => {
      const pre = state.config.launches[code]?.recursosUrl || '';
      const sep = pre.includes('?') ? '&' : '?';
      return pre
        ? [['DIRECTO · enlace para conectarse por EMAIL de GHL (la preclase: pantalla de espera 59 min antes y entra sola)', `${pre}${sep}cid={{contact.id}}`],
          ['DIRECTO · enlace para conectarse por WHATSAPP (la preclase; si el móvil no la recuerda, pide el email)', pre]]
        : [['DIRECTO · enlace para conectarse (email y WhatsApp)', 'Pon primero la URL de la página preclase en Configuración → Preclase → Páginas de GHL.']];
    })(),
    ['Enlace directo a Zoom (sin pantalla de espera) en emails de GHL', `${origin}/directo?l=auto&cid={{contact.id}}${cParam('&')}`],
    ['Enlace directo a Zoom (sin pantalla de espera) para WhatsApp (pide el email)', `${origin}/directo?l=auto${cParam('&')}`],
    // Lanzamientos de varios vídeos: una página por vídeo y su enlace al directo (si es en directo).
    ...videosDe(state.config.launches[code]).slice(1).flatMap((v) => [
      [`${v.nombre.toUpperCase()} · bloques de su página`, `<div data-lsd-page="grabacion" data-launch="auto"></div>\n<div class="mi-barra" data-lsd-bar></div>\n<div data-lsd-video="${v.replay}"></div>\n${script}`],
      [`${v.nombre} · enlace al directo en emails de GHL (solo si es en directo)`, `${origin}/directo?l=auto&v=${v.k}&cid={{contact.id}}${cParam('&')}`],
    ]),
  ];
}
function renderSnippets() {
  const code = editingCode;
  const box = $('#snippets');
  if (!code) { box.innerHTML = '<p class="muted">Guarda el lanzamiento para ver sus códigos.</p>'; return; }
  const items = snippetsLanzamiento(code);
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
  b.textContent = enMeteo() ? 'Crear tareas del meteórico' : enVsl() ? 'Crear tareas de la VSL' : enDirecta() ? 'Crear tareas del embudo' : 'Cargar tareas habituales';
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

// ---------- Previsión durante el lanzamiento (pestaña Plan → Planificador) ----------
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
  const cabecera = e.tipo === 'vsl' || e.tipo === 'directa'
    ? `<h2>${e.tipo === 'directa' ? '🛒' : '🎬'} ${esc(e.nombre)}</h2><p class="muted">${esc(PERIODOS_PORTAL[e.preset || '30d'] || 'Últimos 30 días')} (${esc(fechaPortal(e.periodo.desde))} – ${esc(fechaPortal(e.periodo.hasta))})</p>`
    : `<h2>🚀 ${esc(e.nombre)} ${estado ? `<span class="badge tone-${tono}">${estado}</span>` : ''}</h2><p class="muted">${esc(e.embudo)} · ${esc(e.formato)}${e.fechas.directo ? ` · webinar el ${esc(fechaPortal(e.fechas.directo))}` : ''}${e.fechas.cierre ? ` · cierre ${esc(fechaPortal(e.fechas.cierre))}` : ''}</p>`;
  return `<article class="portal-card">${cabecera}
    <div class="portal-kpis">
      ${e.tipo !== 'directa' ? kpi('Registros', (k.registros ?? 0).toLocaleString('es-ES')) : ''}
      ${k.vip != null ? kpi('Entradas VIP', k.vip.toLocaleString('es-ES')) : ''}
      ${kpi('Ventas', (k.ventas ?? 0).toLocaleString('es-ES'))}
      ${kpi('Facturación', eur(k.facturacion || 0))}
      ${kpi('Inversión en anuncios', eur(k.inversion))}
      ${kpi('ROAS', roas(k.roas), 'facturación ÷ inversión')}
      ${e.tipo !== 'directa' ? kpi('Coste por registro', eur(k.cpl)) : kpi('Ticket medio', eur(k.ticket), 'sin IVA, con los extras')}
      ${kpi('Coste por venta', eur(k.cac))}
    </div>
    ${objetivos ? `<h3>Objetivos</h3>${objetivos}` : ''}
    <h3>Embudo</h3><div class="portal-funnel">${funnel}</div>
    ${hitos ? `<h3>Próximos hitos</h3><ul class="portal-hitos">${hitos}</ul>` : ''}
    ${e.tipo === 'directa' ? '' : `<p><a class="btn" href="/api/informe?${e.tipo === 'vsl' ? 'v' : 'l'}=${encodeURIComponent(e.code)}${state.clientes.find((c) => c.id === portalCliente)?.principal ? '' : `&c=${encodeURIComponent(portalCliente)}`}" target="_blank" rel="noopener">${e.tipo === 'vsl' ? 'Informe de la semana pasada ↗' : 'Informe completo ↗'}</a></p>`}
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
    ? `<div class="portal-chips">${portal.catalogo.length > 1 ? chip('todos', 'Todos los embudos') : ''}${portal.catalogo.map((x) => chip(x.id, `${x.tipo === 'vsl' ? '🎬' : x.tipo === 'directa' ? '🛒' : '🚀'} ${esc(x.nombre)}`)).join('')}</div>${extra}`
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
// Panel de agencia: enseña al momento el último resumen guardado de cada cliente y después los actualiza
// de uno en uno (cada cliente en su propia petición, para no pasar del límite de Cloudflare).
let agenciaCarga = 0;
async function loadAgencia(fresh = false) {
  const box = $('#ag-body');
  const turno = ++agenciaCarga;
  box.innerHTML = '<p class="muted">Cargando los clientes…</p>';
  try {
    const r = await api('/api/agencia');
    if (turno !== agenciaCarga) return;
    const clientes = r.clientes;
    const pintar = (estado) => {
      const crit = clientes.reduce((t, c) => t + (c.lanzamiento?.auditor.critico || 0) + (c.vsls || []).reduce((s, v) => s + v.auditor.critico, 0), 0);
      $('#ag-info').textContent = `${clientes.length} cliente${clientes.length === 1 ? '' : 's'} · ${crit} crítico${crit === 1 ? '' : 's'}${estado ? ` · ${estado}` : ''}`;
      // Primero los que necesitan atención.
      const peso = (c) => (c.error || (!c.pendiente && !c.conectado) ? 1000 : 0) + (c.lanzamiento?.auditor.critico || 0) * 10 + (c.lanzamiento?.vencidas || 0) + (c.alta ? c.alta.total - c.alta.hechos : 0);
      box.innerHTML = `<div class="ag-grid">${[...clientes].sort((a, b) => peso(b) - peso(a)).map((c) => (c.pendiente ? `<article class="ag-card"><header><h3>${esc(c.nombre)}</h3></header><p class="muted">Calculando…</p></article>` : tarjetaAgencia(c))).join('')}</div>`;
    };
    // Se actualizan los que no tienen resumen o lo tienen de hace más de 30 min (o todos con «Actualizar»).
    const viejos = clientes.filter((c) => fresh || c.pendiente || c.viejo || !c.actualizado || Date.parse(c.actualizado) < Date.now() - 30 * 60_000);
    pintar(viejos.length ? `actualizando 0 de ${viejos.length}…` : 'al día');
    for (const [n, c] of viejos.entries()) {
      try {
        const nuevo = await api(`/api/agencia?cliente=${encodeURIComponent(c.id)}`);
        if (turno !== agenciaCarga) return;
        clientes[clientes.indexOf(c)] = nuevo;
      } catch (e) {
        if (turno !== agenciaCarga) return;
        clientes[clientes.indexOf(c)] = { ...c, pendiente: false, error: e.message };
      }
      pintar(n + 1 < viejos.length ? `actualizando ${n + 1} de ${viejos.length}…` : `actualizado ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`);
    }
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
    for (const h of hitosDe(c)) push(h.day, { kind: 'hito', code: c, own: c === code, icon: h.icon, titulo: h.titulo, time: h.time, launch: nombreCal(c), hid: h.id, suave: h.suave });
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
  // Los envíos del carrito (hitos «suaves») van detrás de los hitos importantes y de los eventos.
  const rk = (it) => (it.suave ? 1.5 : rank[it.kind]);
  for (const list of Object.values(map)) list.sort((a, b) => (rk(a) - rk(b)) || (b.own === true) - (a.own === true) || (a.time || '').localeCompare(b.time || ''));
  return map;
}

function calChip(it, hoy) {
  if (it.kind === 'tarea') {
    const t = it.t;
    const cls = t.hecha ? 'done' : vencida(t, hoy) ? 'late' : esMia(t, meSess()) ? 'mine' : '';
    return `<span class="cal-chip k-tarea ${cls} ${it.own ? '' : 'other'}" title="${esc(t.titulo)} · ${esc(asignadoTexto(t.asignado))}${it.own ? '' : ` · ${esc(it.launch)}`}"><span class="cc-ico">${t.hecha ? '✓' : '☐'}</span><span class="cc-txt">${esc(t.titulo)}</span></span>`;
  }
  const other = !it.own;
  const tipo = it.kind === 'evento' ? ` t-${it.ev.tipo}` : it.suave ? ' h-suave' : it.kind === 'hito' && /^directo\d?$/.test(it.hid) ? ' h-webinar' : '';
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
    ${unknownDates ? `<span class="muted">${enMeteo() ? 'Este meteórico' : 'Este lanzamiento'} aún no tiene fechas.${enMeteo() ? '' : irA('cfg-inicio', 'Ponerlas ahora')}</span>` : ''}
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
    const hito = list.find((it) => it.kind === 'hito' && it.own && !it.suave);
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

// Inicio: los comentarios que te mencionan (o en tus tareas), de todos los embudos, para verlos al entrar.
function pintarMencionesInicio() {
  const card = $('#inicio-menciones-card');
  if (!card || !state.enInicio) return;
  if (!meSess().uid) { card.hidden = true; return; } // con la contraseña general nadie puede mencionarte
  card.hidden = false;
  const items = notifItems().filter((n) => n.c).sort((a, b) => b.c.en.localeCompare(a.c.en)).slice(0, 8);
  $('#inicio-menciones').innerHTML = items.length ? items.map(notifHtml).join('')
    : `<p class="muted">${state.tareas || state.tareasOtros ? 'Nadie te ha mencionado ni ha comentado en tus tareas.' : 'Cargando…'}</p>`;
}
$('#inicio-menciones').addEventListener('click', (e) => {
  const b = e.target.closest('[data-nt]');
  if (b) abrirTareaEn(b.dataset.ncode, b.dataset.nt, { comentar: Boolean(b.dataset.ntc) });
});

function renderNotif() {
  pintarMencionesInicio();
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
  panel.innerHTML = `<div class="notif-head"><strong>Notificaciones</strong><button type="button" class="btn ghost notif-cerrar" aria-label="Cerrar" data-notif-cerrar>✕</button><span class="muted">${esc(nombreEmbudo(codigo()))}${state.tareasOtros?.length ? ` y ${state.tareasOtros.length} embudo${state.tareasOtros.length === 1 ? '' : 's'} más` : ''}</span></div>
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
  if (e.target.closest('[data-notif-cerrar]')) { cerrarNotif(); return; }
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
    ...(s.recursos?.votacion ? [votoTexto(lead.id) ? `🗳️ Respondió en la clase: «${votoTexto(lead.id)}»` : s.voto ? '🗳️ Respondió la votación de la clase' : '🗳️ No ha respondido la votación'] : []),
    ...(s.recursos?.descargable ? [s.descarga ? '📄 Abrió el descargable' : ''] : []),
    s.inicio_pago ? `💳 Inició el pago: llegó a la página de pago${s.inicio_pago.veces > 1 ? ` ${s.inicio_pago.veces} veces` : ''} (la última, ${haceTxt(s.inicio_pago.ultima)})${s.compra ? '' : ' y no ha comprado'}` : '',
    s.venta_visita ? `🛒 Abrió la página de venta${s.venta_visita.veces > 1 ? ` ${s.venta_visita.veces} veces` : ''} (la última, ${haceTxt(s.venta_visita.ultima)})` : '',
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
    ${f.votacion ? `<section class="ficha-sec"><h3>🗳️ Votación de la clase</h3>${f.votacion.preguntas.map((q) => `<div class="ficha-vot"><p><strong>${esc(q.pregunta)}</strong></p>${q.tipo === 'libre'
      ? (q.respuesta ? `<p class="ll-notas">${esc(q.respuesta)}</p>` : '<p class="muted small">No respondió.</p>')
      : `${votacionHtml(q.resultados, q.respuesta, q.respuestaId)}<p class="muted small">${q.respuesta ? `Votó «${esc(q.respuesta)}».` : 'No votó.'} ${q.resultados.total} voto${q.resultados.total === 1 ? '' : 's'} en total.</p>`}</div>`).join('')}</section>` : ''}
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
function votacionHtml(res, mio = '', mioId = '') {
  const esMio = (o) => (mioId ? o.id === mioId : o.texto === mio);
  return `<div class="vot-bars">${res.opciones.map((o) => `<div class="vot-bar${esMio(o) ? ' mio' : ''}"><i style="width:${Math.round(o.pct * 100)}%"></i><span>${esMio(o) ? '✓ ' : ''}${esc(o.texto)}</span><strong>${Math.round(o.pct * 100)} % <small class="muted">(${o.n})</small></strong></div>`).join('')}</div>`;
}
// Votos del lanzamiento abierto (para la tabla de leads y la ficha): { votos: { contacto → opción }, opciones }.
async function cargarVotos() {
  const code = state.launchCode;
  const launch = state.config.launches[code];
  if (enVsl() || !launch || !tieneRecurso(launch, 'votacion')) { state.votos = null; return; }
  try {
    const d = await api(`/api/votacion?l=${encodeURIComponent(code)}`);
    if (state.launchCode === code) { state.votos = d.activa ? { code, ...d } : null; render(); }
  } catch { if (state.launchCode === code) state.votos = null; }
}
// Visitas a la página de venta (apuntadas por el bloque data-lsd-venta, sin GHL): l.s.venta_visita.
async function cargarVisitas() {
  const code = state.launchCode;
  if (enVsl() || !state.config.launches[code]) return;
  try {
    const d = await api(`/api/visita?l=${encodeURIComponent(code)}`);
    if (state.launchCode !== code) return;
    state.visitas = { code, visitas: d.visitas || {}, pago: d.pago || {}, registro: d.registro || 0 };
    aplicarVisitas();
    render();
  } catch { /* sin visitas: no pasa nada */ }
}
function aplicarVisitas() {
  const v = state.visitas?.code === state.launchCode ? state.visitas.visitas : null;
  if (!v) return;
  const pago = state.visitas.pago || {};
  for (const l of state.leads) {
    if (v[l.id]) l.s.venta_visita = v[l.id]; else delete l.s.venta_visita;
    // Llegó a la página de pago («Quiero inscribirme») = inició el pago: cuenta en la puntuación.
    const antes = Boolean(l.s.inicio_pago);
    if (pago[l.id]) l.s.inicio_pago = pago[l.id]; else delete l.s.inicio_pago;
    if (antes !== Boolean(l.s.inicio_pago)) { l.score = puntuar(l.s, pesosDe(state.config)); l.estado = estadoFor(l.score); }
  }
}
const pagoTxt = (v) => `💳 Inició el pago${v.veces > 1 ? ` ×${v.veces}` : ''} · ${haceTxt(v.ultima)}`;
const haceTxt = (ms) => { const m = Math.max(0, Math.round((Date.now() - ms) / 60_000)); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
const visitaTxt = (v) => `🛒 Página de venta${v.veces > 1 ? ` ×${v.veces}` : ''} · ${haceTxt(v.ultima)}`;

// Respuestas de un lead a la votación: [{ q, texto }] (texto de la opción elegida o lo que escribió).
const respuestasDe = (cid) => {
  const v = state.votos;
  if (!v || v.code !== state.launchCode) return [];
  const mias = v.votos?.[cid] || {};
  return v.preguntas.map((q) => ({ q, texto: q.tipo === 'libre' ? mias[q.id] || '' : q.opciones.find((o) => o.id === mias[q.id])?.texto || '' })).filter((x) => x.texto);
};
const votoTexto = (cid) => respuestasDe(cid).map((x) => x.texto).join(' · ');
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

// Códigos de las páginas de GHL de una VSL: [[título, código]] (Códigos para GHL y prompts de Páginas).
function snippetsVsl(id) {
  const qs = [`v=${encodeURIComponent(id)}`, cParam('').replace(/^\?/, '')].filter(Boolean).join('&');
  const script = `<script src="${location.origin}/vsl.js?${qs}" defer></script>`;
  return [
    ['PÁGINA DE LA VSL · vídeo medido + botones de compra y llamada', `<div data-lsd-vsl></div>\n${script}`],
    ['PÁGINA DE GRACIAS DEL REGISTRO · vídeo (se oculta si no hay)', `<div data-lsd-vsl-embed="gracias"></div>\n${script}`],
    ['PÁGINA DE GRACIAS DE LA LLAMADA · vídeo (se oculta si no hay)', `<div data-lsd-vsl-embed="agenda"></div>\n${script}`],
    ['Al final de la URL a la que redirige el formulario de registro (identifica a la lead para medir el vídeo)', '?cid={{contact.id}}'],
    ['Enlace a la VSL en emails y WhatsApp de GHL', `${vslCfg(id).vslUrl || 'https://tu-pagina-de-la-vsl'}?cid={{contact.id}}`],
  ];
}
function renderVslSnippets() {
  const items = snippetsVsl(vcId || state.embudo);
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
const embTipo = () => (embEdit ? embudoInfo(embEdit).tipo : embOpcion() === 'meteorico' || embOpcion() === 'directa' ? embOpcion() : SUBTIPO_IDS.includes(embOpcion()) ? 'vsl' : 'lanzamientos');
const embFormato = () => (embEdit ? $('#emb-formato').value : embTipo() !== 'lanzamientos' ? undefined : embOpcion() === 'reto' ? $('#emb-reto-dias').value : embOpcion());
const embSubtipo = () => (embTipo() !== 'vsl' ? undefined : embEdit ? $('#emb-subtipo').value : embOpcion());
// Pestañas elegidas en el paso «Dashboard»: las marcadas y las que tienen alguna sección marcada.
const embPestanas = () => [...new Set([
  ...$$('#emb-pestanas input[data-vista]:checked').map((i) => i.dataset.vista),
  ...$$('#emb-pestanas input[data-seccion]:checked').map((i) => i.dataset.seccion.split('.')[0]),
])];
// Secciones quitadas de las pestañas que sí van (vista.sección).
const embOcultas = () => { const p = embPestanas(); return $$('#emb-pestanas input[data-seccion]:not(:checked)').map((i) => i.dataset.seccion).filter((x) => p.includes(x.split('.')[0])); };
// Clases del prelanzamiento y entrada VIP: solo en los embudos de lanzamientos (sin plantilla elegida).
function pintarEmbPrelanz() {
  pintarEmbClases();
  pintarEmbVipBase();
}
const embPrelanz = () => (embTipo() === 'lanzamientos' ? {
  preclase: $('#emb-preclase').value === 'si', clases: Number($('#emb-clases').value), vip: $('#emb-vip').value === 'si',
  recursos: $('#emb-preclase').value === 'si' ? $$('input[name="emb-recurso"]:checked').map((i) => i.value) : [],
  espera: $('#emb-preclase').value === 'si' && $('#emb-espera').value === 'si',
  vipContadorBase: Math.max(0, Math.floor(Number($('#emb-vip-base').value.replace(/\./g, '')) || 0)),
} : {});
const pintarEmbVipBase = () => { $('#emb-vip-base-box').hidden = embTipo() !== 'lanzamientos' || $('#emb-vip').value !== 'si'; };
$('#emb-vip').addEventListener('change', pintarEmbVipBase);
// Sin área preclase no hay clases: se oculta el número de clases.
const pintarEmbClases = () => { const no = $('#emb-preclase').value === 'no'; $('#emb-clases-box').hidden = no; $('#emb-recursos-card').hidden = no; $('#emb-espera-card').hidden = no; };
$('#emb-preclase').addEventListener('change', () => { pintarEmbClases(); pintarEmbGuia(); });
// Paso «Dashboard»: categorías del menú (Comercial, Leads, Métricas…) con sus secciones para marcar.
function pintarEmbPestanas(activas, ocultas = []) {
  pintarEmbPrelanz();
  const tipo = embTipo();
  $('#emb-reto-box').hidden = Boolean(embEdit) || embOpcion() !== 'reto';
  $('#emb-subtipo-box').hidden = !embEdit || tipo !== 'vsl';
  // Sugerencias solo al crear: editando, «sin lista» significa «todas» (si no, se perdería p. ej. Llamadas).
  activas ??= embEdit ? null : pestanasSugeridas(tipo, embSubtipo());
  const on = (v) => !activas || activas.includes(v);
  const pest = Object.fromEntries(PESTANAS[tipo].map((p) => [p.id, p]));
  const hijo = (attr, val, label, desc, checked) => `<label class="emb-sub"><input type="checkbox" ${attr}="${esc(val)}" ${checked ? 'checked' : ''}><span><strong>${esc(label)}</strong><small>${esc(desc)}</small></span></label>`;
  $('#emb-pestanas').innerHTML = (CATEGORIAS[tipo] || []).map((c) => {
    const vistas = c.vistas.filter((v) => pest[v]);
    if (!vistas.length) return '';
    // Una sola pestaña con secciones (Leads, Métricas): sus secciones son las subcategorías.
    const hijos = vistas.length === 1 && SECCIONES[vistas[0]]
      ? SECCIONES[vistas[0]].map((x) => hijo('data-seccion', `${vistas[0]}.${x.id}`, x.label, x.desc, on(vistas[0]) && !ocultas.includes(`${vistas[0]}.${x.id}`)))
      : vistas.map((v) => hijo('data-vista', v, pest[v].label, pest[v].desc, on(v)));
    return `<fieldset class="emb-cat" data-cat="${c.id}"><legend><label class="emb-cat-h"><input type="checkbox" data-cat-all aria-label="Toda la categoría ${esc(c.label)}"><span class="emb-cat-ico">${c.icon}</span><span><strong>${esc(c.label)}</strong><small>${esc(c.desc)}</small></span><span class="emb-cat-n"></span></label></legend><div class="emb-subs">${hijos.join('')}</div></fieldset>`;
  }).join('');
  pintarEmbCats();
  pintarEmbGuia();
}
// Casilla de cada categoría: marcada si están todas, a medias si algunas; y cuántas van.
function pintarEmbCats() {
  $$('#emb-pestanas .emb-cat').forEach((f) => {
    const hijos = $$('.emb-subs input', f);
    const n = hijos.filter((i) => i.checked).length;
    const all = $('[data-cat-all]', f);
    all.checked = n === hijos.length;
    all.indeterminate = n > 0 && n < hijos.length;
    f.classList.toggle('apagada', n === 0);
    $('.emb-cat-n', f).textContent = `${n} de ${hijos.length}`;
  });
}
$('#emb-pestanas').addEventListener('change', (e) => {
  const all = e.target.closest('[data-cat-all]');
  if (all) $$('.emb-subs input', all.closest('.emb-cat')).forEach((i) => { i.checked = all.checked; });
  pintarEmbCats();
});

// ---------- Asistente por pasos ----------
const PASO_LABEL = { tipo: 'Tipo de embudo', preclase: 'Prelanzamiento', directa: 'Qué lleva', dashboard: 'Dashboard', final: 'Nombre y resumen' };
let embPaso = 0;
function pasosEmb() {
  const plantilla = !embEdit && $('#emb-plantilla').value;
  const lanz = embTipo() === 'lanzamientos';
  // Editando: el tipo no cambia (solo el formato de los lanzamientos o la variante de la VSL).
  const conTipo = !embEdit || lanz || embTipo() === 'vsl';
  return [...(conTipo ? ['tipo'] : []), ...(lanz && !plantilla ? ['preclase'] : []), ...(embTipo() === 'directa' && !embEdit && !plantilla ? ['directa'] : []), ...(plantilla ? [] : ['dashboard']), 'final'];
}
function irPasoEmb(i) {
  const pasos = pasosEmb();
  embPaso = Math.max(0, Math.min(i, pasos.length - 1));
  const actual = pasos[embPaso];
  $$('#embudo-dialog .wiz-paso').forEach((sec) => { sec.hidden = sec.dataset.paso !== actual; });
  $('#emb-pasos').innerHTML = pasos.map((p, n) => `<button type="button" class="wiz-dot ${n === embPaso ? 'actual' : n < embPaso ? 'hecho' : ''}" data-ir-paso="${n}" ${!embEdit && n > embPaso ? 'disabled' : ''}><span class="wiz-num">${n < embPaso && !embEdit ? '✓' : n + 1}</span><span class="wiz-lbl">${PASO_LABEL[p]}</span></button>`).join('<span class="wiz-raya" aria-hidden="true"></span>');
  const ultimo = embPaso === pasos.length - 1;
  $('#emb-atras').hidden = embPaso === 0;
  $('#emb-siguiente').hidden = ultimo;
  // Editando se puede guardar desde cualquier paso; creando, al final.
  $('#emb-crear').hidden = !ultimo && !embEdit;
  $('#emb-status').textContent = '';
  if (actual === 'final') pintarEmbResumen();
  $('#embudo-dialog .dialog-body').scrollTop = 0;
}
function validarPasoEmb() {
  if (pasosEmb()[embPaso] === 'dashboard' && !embPestanas().length) { $('#emb-status').textContent = 'Deja al menos una sección marcada.'; return false; }
  return true;
}
$('#emb-siguiente').addEventListener('click', () => { if (validarPasoEmb()) irPasoEmb(embPaso + 1); });
$('#emb-atras').addEventListener('click', () => irPasoEmb(embPaso - 1));
$('#emb-pasos').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ir-paso]');
  if (b && !b.disabled && (Number(b.dataset.irPaso) < embPaso || validarPasoEmb())) irPasoEmb(Number(b.dataset.irPaso));
});
// Paso final: resumen de lo elegido.
function pintarEmbResumen() {
  const tipo = embTipo();
  const plantilla = !embEdit && plantillasAg.find((x) => x.id === $('#emb-plantilla').value);
  const opcion = embEdit ? null : $('input[name="emb-tipo"]:checked')?.closest('.emb-tipo');
  const tipoTxt = plantilla ? `Plantilla «${plantilla.nombre}»` : opcion ? $('strong', opcion).textContent : tipo === 'vsl' ? SUBTIPOS_VSL[embSubtipo()].corto : tipo === 'meteorico' ? 'Meteóricos' : FORMATOS[embFormato()]?.label || 'Lanzamientos';
  const filas = [['Tipo', tipoTxt + (!embEdit && embOpcion() === 'reto' ? ` · ${$('#emb-reto-dias').selectedOptions[0].text}` : '')]];
  if (tipo === 'lanzamientos' && !plantilla) {
    const pre = $('#emb-preclase').value === 'si';
    const rec = $$('input[name="emb-recurso"]:checked').map((i) => i.closest('label').textContent.replace(/\(.*\)/, '').trim());
    filas.push(['Área preclase', pre ? `Sí · ${$('#emb-clases').selectedOptions[0].text}${rec.length ? ` · ${rec.join(', ')}` : ''}` : 'No']);
    filas.push(['Entrada VIP', $('#emb-vip').value === 'si' ? `Sí · el contador empieza en ${$('#emb-vip-base').value || 0}` : 'No']);
    if (pre) filas.push(['Pantalla de espera', $('#emb-espera').value === 'si' ? 'Sí, 59 min antes y entra sola al webinar' : 'No']);
  }
  if (tipo === 'directa' && !embEdit) {
    const p = partesElegidas('#emb-partes');
    filas.push(['Qué lleva', ['Página de venta', 'Checkout', ...PARTES_DIRECTA.filter((x) => p[x.id]).map((x) => x.label)].join(' · ')]);
  }
  if (!plantilla) {
    const cats = $$('#emb-pestanas .emb-cat').map((f) => ({ t: $('.emb-cat-h strong', f).textContent, subs: $$('.emb-subs input:checked', f).map((i) => $('strong', i.closest('label')).textContent) })).filter((c) => c.subs.length);
    filas.push(['Dashboard', cats.map((c) => `<strong>${esc(c.t)}</strong>: ${esc(c.subs.join(', '))}`).join('<br>')]);
  }
  $('#emb-resumen').innerHTML = `<dl>${filas.map(([a, b], i) => `<dt>${esc(a)}</dt><dd>${i === filas.length - 1 && !plantilla ? b : esc(b)}</dd>`).join('')}</dl>`;
}
$('#emb-plantilla').addEventListener('change', () => irPasoEmb(embPaso));

function pintarEmbGuia() {
  const pasos = guiaEmbudo(embTipo(), embPestanas(), embFormato(), embSubtipo(), { preclase: $('#emb-preclase').value !== 'no', partes: embEdit ? state.config.directas?.[embEdit]?.partes : partesElegidas('#emb-partes') });
  const rec = embTipo() === 'lanzamientos' && $('#emb-preclase').value !== 'no' ? $$('input[name="emb-recurso"]:checked').map((i) => i.value) : [];
  if (rec.length) {
    pasos.push({ titulo: `${pasos.length + 1} · Recursos de la preclase`, pasos: [
      ...(rec.includes('musica') ? ['<strong>Música:</strong> sube el MP3 a GHL → <em>Medios</em> y copia su enlace (va en Configuración → Preclase).'] : []),
      ...(rec.includes('test') ? ['<strong>Test:</strong> crea el test en GHL y un <strong>workflow</strong> que, al enviarlo, ponga una etiqueta (p. ej. <code>autodiagnostico-hecho</code>). Esa etiqueta y la fecha de desbloqueo van en Configuración → Preclase.'] : []),
      ...(rec.includes('votacion') ? ['<strong>Votación:</strong> la hace el dashboard, no hace falta nada en GHL; escribe las preguntas (tipo test o de respuesta libre) en Configuración → Preclase.'] : []),
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
  $('#emb-espera').value = 'si';
  pintarPartes('#emb-partes', partesPorDefecto());
  pintarEmbClases();
  pintarEmbVipBase();
  $('#emb-nombre').value = '';
  $('#emb-status').textContent = '';
  $('#emb-nota').hidden = false;
  $('#emb-borrar').hidden = true;
  $('#emb-crear').textContent = 'Crear embudo';
  $('#emb-guia-box').open = false;
  $('#emb-h-tipo').textContent = '¿Qué tipo de embudo es?';
  $('#emb-sub-tipo').textContent = 'Elige el que más se parezca. En los siguientes pasos lo terminas de ajustar.';
  pintarEmbPestanas(null);
  irPasoEmb(0);
  embDlg.showModal();
}
function abrirEditarEmbudo(id) {
  const e = embudoInfo(id);
  if (!e) return;
  embEdit = id;
  $('#emb-titulo').textContent = `${e.tipo === 'vsl' ? textosVsl(state.config.vsls[id]).ico : e.tipo === 'directa' ? '🛒' : e.tipo === 'meteorico' ? '⚡' : '🚀'} ${e.nombre}`;
  $('#emb-subtipo').value = subtipoValido(state.config.vsls[id]?.subtipo);
  $('.emb-tipos').hidden = true;
  $('#emb-formato-box').hidden = e.tipo !== 'lanzamientos';
  $('#emb-formato').value = e.formato || 'webinar';
  $('#emb-preclase').value = e.preclase === false ? 'no' : 'si';
  $('#emb-clases').value = String(e.clases || 2);
  $('#emb-vip').value = e.vip === false ? 'no' : 'si';
  $$('input[name="emb-recurso"]').forEach((i) => { i.checked = (e.recursos || []).includes(i.value); });
  $('#emb-espera').value = e.espera === false ? 'no' : 'si';
  $('#emb-vip-base').value = String(e.vipContadorBase ?? (launchesSorted().find(([, x]) => embudoDeLanz(x) === id)?.[1].vipContadorBase ?? (esPrincipal() ? 41 : 0)));
  pintarEmbClases();
  pintarEmbVipBase();
  $('#emb-nombre').value = e.nombre;
  $('#emb-status').textContent = '';
  $('#emb-nota').hidden = true;
  $('#emb-borrar').hidden = false;
  $('#emb-plantilla-box').hidden = true;
  $('#emb-plantilla-guardar').hidden = !state.superadmin || e.tipo === 'directa';
  $('#emb-crear').textContent = 'Guardar';
  $('#emb-guia-box').open = false;
  $('#emb-h-tipo').textContent = e.tipo === 'vsl' ? 'Tipo de embudo siempre abierto' : 'Formato de los lanzamientos';
  $('#emb-sub-tipo').textContent = 'El tipo de embudo no se cambia; puedes pulsar cualquier paso de arriba y guardar cuando quieras.';
  pintarEmbPestanas(e.pestanas || null, e.ocultas || []);
  irPasoEmb(0);
  embDlg.showModal();
}
$('#sb-add').addEventListener('click', abrirNuevoEmbudo);
$('#sidebar').addEventListener('click', (e) => { const b = e.target.closest('[data-emb-edit]'); if (b) abrirEditarEmbudo(b.dataset.embEdit); });
document.addEventListener('click', (e) => { if (e.target.closest('[data-action="nuevo-embudo"]')) abrirNuevoEmbudo(); });
$$('input[name="emb-tipo"]').forEach((r) => r.addEventListener('change', () => { pintarEmbPestanas(null); pintarEmbVipBase(); irPasoEmb(embPaso); }));
$('#emb-pestanas').addEventListener('change', pintarEmbGuia);
$('#emb-formato').addEventListener('change', pintarEmbGuia);
$('#emb-reto-dias').addEventListener('change', pintarEmbGuia);
$('#emb-subtipo').addEventListener('change', pintarEmbGuia);

$('#emb-crear').addEventListener('click', async () => {
  const pestanas = embPestanas();
  const ocultas = embOcultas();
  if (!pestanas.length && !(!embEdit && $('#emb-plantilla').value)) { $('#emb-status').textContent = 'Deja al menos una sección marcada en el paso «Dashboard».'; return; }
  const todas = pestanas.length === PESTANAS[embTipo()].length;
  const b = $('#emb-crear');
  b.disabled = true;
  $('#emb-status').textContent = 'Guardando…';
  try {
    if (embEdit) {
      const id = embEdit;
      const nombre = $('#emb-nombre').value.trim() || embudoInfo(id).nombre;
      const lista = embudos().map((e) => (e.id === id ? { ...e, id: e.id, tipo: e.tipo, nombre, ...(e.tipo === 'lanzamientos' ? { formato: embFormato(), ...embPrelanz() } : {}), pestanas: todas ? undefined : pestanas, ocultas: ocultas.length ? ocultas : undefined } : e));
      const vsls = state.config.vsls[id] ? { ...state.config.vsls, [id]: { ...state.config.vsls[id], name: nombre, subtipo: embSubtipo() } } : state.config.vsls;
      const directas = state.config.directas?.[id] ? { ...state.config.directas, [id]: { ...state.config.directas[id], name: nombre } } : state.config.directas;
      const { config } = await api('/api/config', { method: 'POST', body: { ...state.config, embudos: lista, vsls, directas } });
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
    const nombre = $('#emb-nombre').value.trim() || (tipo === 'vsl' ? SUBTIPOS_VSL[subtipo].corto : tipo === 'directa' ? 'Venta directa' : tipo === 'meteorico' ? 'Meteóricos' : FORMATOS[formato].label);
    // id: a partir del nombre, sin chocar con otros embudos ni con códigos de lanzamiento.
    const usados = new Set([...embudos().map((e) => e.id), ...Object.keys(state.config.launches), ...Object.keys(state.config.meteoricos || {})]);
    const base = slugCliente(nombre) || (tipo === 'vsl' ? 'vsl' : tipo === 'directa' ? 'venta' : 'lanz');
    let id = base.slice(0, 20);
    for (let n = 2; usados.has(id) || id.length < 2; n++) id = `${base.slice(0, 18)}-${n}`;
    const body = {
      ...state.config,
      embudos: [...embudos(), { id, tipo, nombre, ...(formato ? { formato, ...embPrelanz() } : {}), ...(todas ? {} : { pestanas }), ...(ocultas.length ? { ocultas } : {}) }],
      vsls: tipo === 'vsl' ? { ...state.config.vsls, [id]: { name: nombre, subtipo } } : state.config.vsls,
      directas: tipo === 'directa' ? { ...(state.config.directas || {}), [id]: { name: nombre, producto: nombre, partes: partesElegidas('#emb-partes') } } : state.config.directas,
    };
    const { config } = await api('/api/config', { method: 'POST', body });
    state.config = config;
    embDlg.close();
    await setEmbudo(id);
    // Y a configurarlo: etiquetas de GHL (VSL) o el primer lanzamiento.
    if (tipo === 'vsl') openVslConfig(); else if (tipo === 'meteorico') abrirMeteoDialog(null, { embudo: id }); else if (tipo === 'directa') abrirDirectaConfig(); else openConfig(null);
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
    window.alert('Este embudo tiene lanzamientos. Bórralos antes (Configuración → ① Datos básicos) o déjalo y desactiva sus pestañas.');
    return false;
  }
  if (!window.confirm(`¿Eliminar el embudo «${e.nombre}» del dashboard? Se borra su configuración. Sus contactos, etiquetas y páginas de GHL no se tocan.`)) return false;
  const vsls = { ...state.config.vsls };
  delete vsls[id];
  const directas = { ...(state.config.directas || {}) };
  delete directas[id];
  const { config } = await api('/api/config', { method: 'POST', body: { ...state.config, vsls, directas, embudos: embudos().filter((x) => x.id !== id) } });
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
  if (enDirecta()) {
    const d = state.config.directas?.[state.embudo];
    const tags = state.tags?.length ? new Set(state.tags.map((t) => String(t).toLowerCase())) : null;
    const noExiste = d ? [d.compraTag, ...[['bumps', d.bumps], ['upsell', d.upsells], ['downsell', d.downsells]].filter(([p]) => conParte(d, p)).flatMap(([, l]) => (l || []).filter((o) => o.activo !== false).map((o) => o.tag))].filter((t) => t && tags && !tags.has(t)) : [];
    return d ? [
      ...pendientesDirecta(d).map((x) => ({ nivel: x.campo === 'dc-compraTag' || x.campo === 'dc-precio' ? 'critico' : 'importante', area: 'Venta directa', titulo: x.txt, detalle: '', accion: { tipo: 'directa' } })),
      ...noExiste.map((t) => ({ nivel: 'importante', area: 'Etiquetas', titulo: `La etiqueta «${t}» no existe en GHL`, detalle: 'Revisa que esté bien escrita o créala en el workflow de la compra.', accion: { tipo: 'directa' } })),
    ] : [];
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
  const nombre = enVsl() ? vslCfg().name : enDirecta() ? state.config.directas?.[state.embudo]?.name || '' : state.config.launches[state.launchCode]?.name || '';
  $('#aud-titulo').textContent = `🩺 Auditor · ${nombre}`;
  const prox = enVsl() || enDirecta() ? null : proximoHito(state.config.launches[state.launchCode] || {}, today());
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
  else if (acc.tipo === 'directa') abrirDirectaConfig();
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
  box.innerHTML = `${cab}<div class="kpis meteo-kpis">${kpis}</div>${planes}${porDia}${m.sendflowId ? '<section class="meteo-sec"><h3>💬 Grupo de WhatsApp</h3><div data-meteo-grupos></div></section>' : ''}${compradoras}
    <section class="meteo-sec"><h3>Código para la página de la oferta <span class="muted small">(bloque «Código HTML» en GHL)</span></h3>
      <p class="muted small">Pinta la cuenta atrás («se abre en…», «se cierra en…» con el botón de compra y «ha terminado») y cuenta las visitas. Los textos y horas se cambian en Configurar.</p>
      <pre class="snippet">${esc(snippet)}</pre><button type="button" class="btn" data-copiar-meteo="${esc(snippet)}">Copiar código</button>
      ${m.whatsappUrl ? ` <a class="btn ghost" href="${esc(m.whatsappUrl)}" target="_blank" rel="noopener">Grupo de WhatsApp</a>` : ''}${m.ofertaUrl ? ` <a class="btn ghost" href="${esc(m.ofertaUrl)}" target="_blank" rel="noopener">Ver la página de la oferta ↗</a>` : ''}
      ${foto}</section>
    <section class="meteo-sec"><h3>Emails del meteórico <span class="muted small">(apertura, CTR y qué mejorar)</span></h3><div data-em-meteo></div></section>
    ${m.notas ? `<section class="meteo-sec"><h3>Notas</h3><p class="ll-notas">${esc(m.notas)}</p></section>` : ''}`;
  if (tiene('metricas')) mostrarEmails(code, { tabla: box.querySelector('[data-em-meteo]') });
  if (m.sendflowId && tiene('metricas')) cargarGrupos(code, box.querySelector('[data-meteo-grupos]'));
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
const MT_CAMPOS = ['name', 'producto', 'oferta', 'precio', 'precioFraccionado', 'calentamiento', 'apertura', 'cierre', 'compraTag', 'fraccionadoTag', 'ofertaUrl', 'pagoUrl', 'pagoFraccionadoUrl', 'cerradaUrl', 'whatsappUrl', 'sendflowId', 'objetivoVentas', 'objetivoFacturacion', 'inversion', 'metaFiltro', 'emailFiltro', 'notas'];
async function abrirMeteoDialog(code, { embudo = '', lanzamiento = '' } = {}) {
  const m = code ? state.config.meteoricos?.[code] : null;
  meteoEdit = { code: m ? code : null, embudo: m?.embudo ?? embudo, lanzamiento: m?.lanzamiento ?? lanzamiento };
  $('#meteo-titulo').textContent = m ? `⚡ ${m.name}` : '⚡ Nuevo meteórico';
  $('#meteo-de').textContent = meteoEdit.lanzamiento ? `Meteórico posterior al lanzamiento «${state.config.launches[meteoEdit.lanzamiento]?.name || meteoEdit.lanzamiento}» (downsell u otro producto).` : 'Acción independiente a tu base de datos (Black Friday, rebajas, aniversario…).';
  opcionSendflow($('#mt-sendflowId'), m?.sendflowId || '');
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
        if (d.creadas) notice(`Creadas ${d.creadas} tareas del meteórico «${m.name}» (lo urgente, para hoy). Las tienes en Plan → Tareas.`);
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
// Variante del entregable (dónde está la comunidad, tipo de soporte): solo en los tipos que la tienen.
const opcionesSubtipo = (tipo, sel) => {
  const st = SUBTIPOS_ENTREGABLE[tipo];
  return st ? st.opciones.map((o) => `<option value="${o.id}" ${o.id === sel ? 'selected' : ''}>${st.icon} ${esc(o.label)}</option>`).join('') : '';
};
function filaEntregable(e = {}) {
  return `<div class="of-fila" data-of="entregable" data-id="${esc(e.id || '')}">
    <div class="of-tipo-box"><select class="of-tipo" aria-label="Tipo de entregable">${optsTipo(TIPOS_ENTREGABLE, e.tipo || 'grabado')}</select>
      <select class="of-sub" aria-label="${esc(SUBTIPOS_ENTREGABLE[e.tipo]?.label || '')}" ${SUBTIPOS_ENTREGABLE[e.tipo] ? '' : 'hidden'}>${opcionesSubtipo(e.tipo, e.subtipo)}</select></div>
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
    <div class="of-obj"><label><span>Objetivo del bonus</span><select class="of-obj-sel"><option value="">Elige…</option>${OBJETIVOS_BONUS.map((o) => `<option value="${o.id}" ${o.id === b.objetivo ? 'selected' : ''}>${o.icon} ${esc(o.label)}</option>`).join('')}</select></label>
      <input class="of-obj-otro" maxlength="160" placeholder="Escribe el objetivo" aria-label="Otro objetivo" value="${esc(b.objetivoOtro || '')}" ${b.objetivo === 'otro' ? '' : 'hidden'}></div>
    <span class="of-ventana muted small"></span></div>`;
}
// Objetivo «Otro»: aparece la casilla para escribirlo.
for (const id of ['#of-bonus', '#mt-of-bonus']) {
  $(id).addEventListener('change', (e) => {
    if (!e.target.matches('.of-obj-sel')) return;
    const otro = $('.of-obj-otro', e.target.closest('.of-fila'));
    otro.hidden = e.target.value !== 'otro';
    if (!otro.hidden) otro.focus();
  });
}
const leerObjetivo = (el) => ({ objetivo: $('.of-obj-sel', el).value, objetivoOtro: $('.of-obj-sel', el).value === 'otro' ? $('.of-obj-otro', el).value.trim() : '' });
// Garantía (lanzamientos: «of»; meteóricos: «mt-of»).
const triVal = (v) => (v === true ? 'si' : v === false ? 'no' : '');
function pintarGarantia(pre, g = {}) {
  $(`#${pre}-gar-15`).value = triVal(g.dias15);
  $(`#${pre}-gar-otra`).value = triVal(g.otra);
  $(`#${pre}-gar-otra-txt`).value = g.otraTexto || '';
  $(`[data-gar="${pre}"] [data-gar-otra]`).hidden = $(`#${pre}-gar-otra`).value !== 'si';
}
const leerGarantia = (pre) => {
  const tri = (v) => (v === 'si' ? true : v === 'no' ? false : null);
  const otra = tri($(`#${pre}-gar-otra`).value);
  return { dias15: tri($(`#${pre}-gar-15`).value), otra, otraTexto: otra ? $(`#${pre}-gar-otra-txt`).value.trim() : '' };
};
for (const pre of ['of', 'mt-of']) {
  $(`#${pre}-gar-otra`).addEventListener('change', () => {
    const box = $(`[data-gar="${pre}"] [data-gar-otra]`);
    box.hidden = $(`#${pre}-gar-otra`).value !== 'si';
    if (!box.hidden) $(`#${pre}-gar-otra-txt`).focus();
  });
}
function pintarOfertaEditor(oferta = {}) {
  $('#of-entregables').innerHTML = (oferta.entregables || []).map((e) => filaEntregable(e)).join('') || '';
  $('#of-bonus').innerHTML = (oferta.bonus || []).map((b) => filaBonus(b)).join('') || '';
  pintarGarantia('of', oferta.garantia);
  refrescarOfertaEditor();
}
const nuevoId = (p) => `${p}${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 4)}`;
function leerOfertaEditor() {
  const fila = (el) => ({ id: el.dataset.id || nuevoId(el.dataset.of === 'bonus' ? 'b' : 'e'), tipo: $('.of-tipo', el).value, nombre: $('.of-nombre', el).value.trim(), detalle: $('.of-detalle', el).value.trim(), valor: $('.of-valor', el).value.trim(), ...($('.of-sub', el) && SUBTIPOS_ENTREGABLE[$('.of-tipo', el).value] ? { subtipo: $('.of-sub', el).value } : {}) });
  return {
    entregables: $$('#of-entregables .of-fila').map(fila).filter((x) => x.nombre),
    bonus: $$('#of-bonus .of-fila').map((el) => ({ ...fila(el), hasta: $('.of-hasta-in', el).value, ...leerObjetivo(el) })).filter((x) => x.nombre),
    garantia: leerGarantia('of'),
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
    $('.of-ventana', el).textContent = w.desde != null && w.hasta != null ? `Activo: ${fechaHoraCorta(w.desde)} → ${fechaHoraCorta(w.hasta)}` : 'Pon las fechas del directo y del carrito (pestaña «① Datos básicos») para ver cuándo está activo.';
  }
  const o = leerOfertaEditor();
  const precio = dinero($('#cfg-precio-programa').value);
  const v = valorOferta({ entregables: o.entregables.map((e) => ({ valor: dinero(e.valor) })), bonus: o.bonus.map((b) => ({ valor: dinero(b.valor) })) }, precio);
  $('#of-resumen').innerHTML = `<span><strong>${o.entregables.length}</strong> entregables</span><span><strong>${o.bonus.length}</strong> bonus</span>${v.total ? `<span>Valor total <strong>${eur(v.total)}</strong></span>` : ''}${v.ratio ? `<span>= <strong>${v.ratio.toFixed(1).replace('.', ',')}×</strong> el precio</span>` : ''}`;
}
$('#of-add-entregable').addEventListener('click', () => { $('#of-entregables').insertAdjacentHTML('beforeend', filaEntregable()); $('#of-entregables .of-fila:last-child .of-nombre').focus(); refrescarOfertaEditor(); });
$('#of-add-bonus').addEventListener('click', () => { $('#of-bonus').insertAdjacentHTML('beforeend', filaBonus()); $('#of-bonus .of-fila:last-child .of-nombre').focus(); refrescarOfertaEditor(); });
// Comunidad (dónde está) y soporte (chatbot, seguimiento individual, email / WhatsApp): se elige la variante.
for (const id of ['#of-entregables', '#mt-of-entregables']) {
  $(id).addEventListener('change', (e) => {
    if (!e.target.matches('.of-tipo')) return;
    const sub = $('.of-sub', e.target.closest('.of-fila'));
    if (!sub) return;
    const st = SUBTIPOS_ENTREGABLE[e.target.value];
    sub.hidden = !st;
    sub.setAttribute('aria-label', st?.label || '');
    sub.innerHTML = opcionesSubtipo(e.target.value);
  });
}
for (const id of ['#of-entregables', '#of-bonus']) {
  $(id).addEventListener('click', (e) => { if (e.target.closest('.of-del')) { e.target.closest('.of-fila').remove(); refrescarOfertaEditor(); } });
  $(id).addEventListener('change', refrescarOfertaEditor);
  $(id).addEventListener('input', (e) => { if (e.target.matches('.of-valor')) refrescarOfertaEditor(); });
}
$('.tab[data-tab="oferta"]').addEventListener('click', refrescarOfertaEditor);

// Días de carrito: cuentan desde el día siguiente al vídeo de venta; el cierre se calcula solo (último día, 23:59).
function pintarDiasCarrito() {
  const n = diasCarritoValido($('#cfg-dias-carrito').value);
  const vs = readVideosCfg();
  const l = { fechaDirecto: $('#cfg-directo-fecha').value, formato: editingCode ? formatoDeLanz(state.config.launches[editingCode]) : embudoInfo(state.embudo)?.formato, videos: vs, diasCarrito: n };
  const cierre = n ? cierrePorDias(l) : '';
  const fv = vs.length ? (vs.at(-1).fecha || '') : l.fechaDirecto;
  const fmt = (d) => formatDate(madridToEpoch(`${d}T12:00`));
  $('#cfg-cierre').readOnly = Boolean(n);
  if (n && cierre) $('#cfg-cierre').value = cierre;
  $('#cfg-cierre-nota').textContent = n ? `(calculado con los ${n} días de carrito)` : '';
  $('#cfg-dias-carrito-nota').innerHTML = !n ? 'Vacío = el cierre del carrito se pone a mano (aquí abajo, «Cierre del carrito»).'
    : !fv ? `Pon el día del ${vs.length ? 'vídeo de venta' : 'directo'} para calcular los días.`
    : `Día 1 de carrito: <strong>${esc(fmt(addDays(fv, 1)))}</strong> · último día: <strong>${esc(fmt(addDays(fv, n)))}</strong> (cierra a las 23:59). De aquí salen el cierre, la pestaña «Carrito» y el calendario.`;
}
$('#cfg-dias-carrito').addEventListener('input', pintarDiasCarrito);
$('#cfg-directo-fecha').addEventListener('change', pintarDiasCarrito);
$('#cfg-videos').addEventListener('change', pintarDiasCarrito);

// ---------- Configuración → Carrito: un día por cada día del carrito, con sus hitos y la estrategia a mano ----------
// Las notas escritas se guardan aquí mientras se edita (al cambiar fechas u oferta se vuelve a pintar sin perderlas).
let carritoNotasEdit = {};
function leerCarritoNotas() {
  for (const t of $$('#carrito-dias .car-nota')) carritoNotasEdit[t.dataset.day] = t.value;
  return Object.fromEntries(Object.entries(carritoNotasEdit).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
}
// Envíos de cada día (emails y grupo de WhatsApp): cuántos y a qué hora. Se guardan aquí mientras se edita.
let carritoEnviosEdit = {};
const HORAS_SUGERIDAS = ['10:00', '19:00', '13:00', '21:00', '08:30', '16:00', '22:30', '11:30'];
function leerCarritoEnvios() {
  for (const box of $$('#carrito-dias .car-canal')) {
    const day = box.dataset.day;
    carritoEnviosEdit[day] = { ...(carritoEnviosEdit[day] || {}), [box.dataset.canal]: $$('.car-hora', box).map((i) => i.value) };
  }
  return Object.fromEntries(Object.entries(carritoEnviosEdit).map(([d, v]) => [d, Object.fromEntries(Object.entries(v).filter(([, h]) => h.length))]).filter(([, v]) => Object.keys(v).length));
}
function canalHtml(day, canal, horas = []) {
  return `<div class="car-canal" data-day="${day}" data-canal="${canal.id}">
    <label class="car-canal-n"><span>${canal.icon} ${esc(canal.label)}</span><select class="car-cuantos" aria-label="${esc(canal.label)}: cuántos al día">${Array.from({ length: MAX_ENVIOS_DIA + 1 }, (_, i) => `<option value="${i}" ${i === horas.length ? 'selected' : ''}>${i === 0 ? 'Ninguno' : `${i} al día`}</option>`).join('')}</select></label>
    <div class="car-horas">${horas.map((h, i) => `<label class="car-hora-l"><span>${canal.id === 'emails' ? 'Email' : 'WhatsApp'} ${i + 1}</span><input class="car-hora" type="time" value="${esc(h)}"></label>`).join('')}</div>
  </div>`;
}
function pintarCarrito({ leerEnvios = true } = {}) {
  const notas = leerCarritoNotas();
  // Tras «copiar al resto de días» lo bueno es lo copiado, no lo que había en pantalla.
  const envios = leerEnvios ? leerCarritoEnvios() : Object.fromEntries(Object.entries(carritoEnviosEdit).filter(([, v]) => Object.values(v).some((h) => h.length)));
  let launch = null;
  try { launch = readForm().launch; } catch { launch = null; }
  const datos = {
    ...(launch || { ...(state.config.launches[editingCode] || {}), fechaDirecto: $('#cfg-directo-fecha').value, horaDirecto: $('#cfg-directo-hora').value, aperturaCarrito: $('#cfg-apertura-carrito').value, cierreCarrito: $('#cfg-cierre').value }),
    oferta: leerOfertaEditor(), ventaBarra: leerVentaBarra(), carritoNotas: notas, carritoEnvios: envios,
  };
  const r = diasCarrito(datos);
  const box = $('#carrito-dias');
  if (!r.dias.length) {
    box.innerHTML = `<div class="car-vacio">🛒 <strong>Aquí aparecerán los días del carrito.</strong> Se rellenará automáticamente cuando configures ${esc(r.faltan.join(' y '))} en la pestaña «① Datos básicos», y los bonus en «⑤ Oferta».</div>`;
    return;
  }
  const hoy = dayInMadrid(new Date().toISOString());
  box.innerHTML = `<p class="car-resumen"><strong>${r.dias.length} días de carrito</strong>${r.garantia ? ` · 🛡️ ${esc(r.garantia)}` : ''}</p>
    <div class="car-dias">${r.dias.map((d) => `<article class="car-dia${d.day === hoy ? ' car-hoy' : ''}" data-n="${d.n > 0 ? d.n : 0}">
      <header><span class="car-n">${esc(d.titulo)}</span><strong>${esc(d.fecha)}</strong>${d.etiqueta ? `<span class="car-tag">${esc(d.etiqueta)}</span>` : ''}${d.day === hoy ? '<span class="car-tag car-tag-hoy">Hoy</span>' : ''}</header>
      <h4>Hitos clave</h4>
      ${d.auto.length ? `<ul class="car-auto">${d.auto.map((a) => `<li><span aria-hidden="true">${a.icon}</span> ${esc(a.texto)}</li>`).join('')}</ul>` : '<p class="muted small">Sin hitos automáticos este día: se rellenará solo cuando la oferta o la barra de la página de venta tengan algo este día. Escribe abajo la estrategia.</p>'}
      <h4>Envíos del día</h4>
      <div class="car-envios">${CANALES_CARRITO.map((c) => canalHtml(d.day, c, d.envios[c.id] || [])).join('')}</div>
      ${r.dias.length > 1 ? `<button type="button" class="btn ghost small car-copiar" data-day="${d.day}" title="Pone estos mismos emails y mensajes de WhatsApp (con sus horas) en los demás días de carrito">Copiar estos envíos al resto de días</button>` : ''}
      <label class="field"><span>Estrategia / notas del día <small>(a mano)</small></span><textarea class="car-nota" data-day="${d.day}" rows="3" maxlength="1500" placeholder="Ej.: email de testimonios a las 10:00, directo de dudas en Instagram, WhatsApp a las que vieron la página de venta…">${esc(d.nota)}</textarea></label>
    </article>`).join('')}</div>`;
}
$('.tab[data-tab="carrito"]').addEventListener('click', pintarCarrito);

// Plan → Carrito: los mismos días que en Configuración → ⑦ Carrito, en solo lectura (para todo el equipo).
function renderCarritoVista() {
  const box = $('#carrito-vista');
  const launch = state.config?.launches?.[state.launchCode];
  if (!box || !launch) return;
  const r = diasCarrito(launch);
  const editar = puedeConfig() ? '<button type="button" class="btn" data-config-tab="carrito">Editar en Configuración → ⑦ Carrito</button>' : '';
  if (!r.dias.length) {
    box.innerHTML = `<div class="card empty car-vacio">🛒 <strong>Aquí aparecerán los días del carrito.</strong> Falta ${esc(r.faltan.join(' y '))} (Configuración → ① Datos básicos).${puedeConfig() ? ' <button type="button" class="btn small" data-config-tab="launch">Configurarlo ahora</button>' : ''}</div>`;
    return;
  }
  const hoy = dayInMadrid(new Date().toISOString());
  const envios = (d) => CANALES_CARRITO.map((c) => {
    const horas = (d.envios[c.id] || []).filter(Boolean);
    return horas.length ? `<li>${c.icon} ${horas.length} ${esc(c.label.toLowerCase())}: ${horas.map(esc).join(', ')}</li>` : '';
  }).join('');
  box.innerHTML = `<div class="row car-vista-bar"><p class="car-resumen"><strong>${r.dias.length} días de carrito</strong>${r.garantia ? ` · 🛡️ ${esc(r.garantia)}` : ''}</p><span class="spacer"></span>${editar}</div>
    <div class="car-dias">${r.dias.map((d) => `<article class="car-dia${d.day === hoy ? ' car-hoy' : ''}">
      <header><span class="car-n">${esc(d.titulo)}</span><strong>${esc(d.fecha)}</strong>${d.etiqueta ? `<span class="car-tag">${esc(d.etiqueta)}</span>` : ''}${d.day === hoy ? '<span class="car-tag car-tag-hoy">Hoy</span>' : ''}</header>
      <h4>Hitos clave</h4>
      ${d.auto.length ? `<ul class="car-auto">${d.auto.map((a) => `<li><span aria-hidden="true">${a.icon}</span> ${esc(a.texto)}</li>`).join('')}</ul>` : '<p class="muted small">Sin hitos automáticos este día.</p>'}
      ${envios(d) ? `<h4>Envíos del día</h4><ul class="car-auto">${envios(d)}</ul>` : ''}
      ${d.nota ? `<h4>Estrategia</h4><p class="car-nota-txt">${esc(d.nota).replace(/\n/g, '<br>')}</p>` : ''}
    </article>`).join('')}</div>`;
}
// Botones «Configurarlo ahora» / «Editar en Configuración → …»: abren la configuración del lanzamiento
// en el campo exacto (data-ir-campo="cfg-…") o en una pestaña (data-config-tab="…").
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-config-tab], [data-ir-campo]');
  if (!b || !puedeConfig() || enVsl() || enMeteo()) return;
  openConfig(state.launchCode);
  if (b.dataset.configTab) $(`#config-dialog .tab[data-tab="${b.dataset.configTab}"]`)?.click();
  else requestAnimationFrame(() => goToField(b.dataset.irCampo));
});
// Cambiar cuántos envíos: aparecen (o se quitan) las horas, con una hora sugerida en las nuevas.
$('#carrito-dias').addEventListener('change', (e) => {
  if (!e.target.matches('.car-cuantos')) return;
  const box = e.target.closest('.car-canal');
  const actuales = $$('.car-hora', box).map((i) => i.value);
  const n = Number(e.target.value);
  const horas = actuales.slice(0, n);
  while (horas.length < n) horas.push(HORAS_SUGERIDAS.find((h) => !horas.includes(h)) ?? '');
  box.outerHTML = canalHtml(box.dataset.day, CANALES_CARRITO.find((c) => c.id === box.dataset.canal), horas);
  leerCarritoEnvios();
});
$('#carrito-dias').addEventListener('click', (e) => {
  const b = e.target.closest('.car-copiar');
  if (!b) return;
  const todos = leerCarritoEnvios();
  const origen = todos[b.dataset.day] || {};
  // Solo a los días de carrito (no al día del directo).
  for (const box of $$('#carrito-dias .car-dia:not([data-n="0"]) .car-canal')) {
    if (box.dataset.day === b.dataset.day) continue;
    carritoEnviosEdit[box.dataset.day] = JSON.parse(JSON.stringify(origen));
  }
  pintarCarrito({ leerEnvios: false });
  b.blur();
});

// ---------- Métricas → Oferta y bonus: la oferta frente a las ventas de cada día del carrito ----------
function renderOfertaAnalisis(launch) {
  const box = $('#oferta-analisis');
  if (!box) return;
  const oferta = launch.oferta || { entregables: [], bonus: [] };
  const precio = Number(launch.precioPrograma) || 0;
  const valor = valorOferta(oferta, precio);
  const chipB = (b) => { const t = tipoBonus(b.tipo); return `<span class="of-chip b-${b.tipo}" title="${esc(t.largo || t.label)} · ${esc(t.desc)}">${t.icon} ${esc(b.nombre)}</span>`; };
  const resumen = `<div class="of-oferta">
      <div><h4>📦 Entregables (${oferta.entregables.length})</h4>${oferta.entregables.length ? `<ul>${oferta.entregables.map((e) => `<li>${tipoEntregable(e.tipo).icon} <strong>${esc(e.nombre)}</strong> <span class="muted small">${esc(etiquetaEntregable(e))}${e.valor ? ` · ${eur(e.valor)}` : ''}</span></li>`).join('')}</ul>` : '<p class="muted small">Sin entregables.</p>'}</div>
      <div><h4>🎁 Bonus (${oferta.bonus.length})</h4>${oferta.bonus.length ? `<ul>${oferta.bonus.map((b) => `<li>${chipB(b)}${b.valor ? ` <span class="muted small">${eur(b.valor)}</span>` : ''}${objetivoBonus(b) ? ` <span class="muted small">· ${esc(objetivoBonus(b))}</span>` : ''}</li>`).join('')}</ul>` : '<p class="muted small">Sin bonus.</p>'}${textoGarantia(oferta.garantia) ? `<p class="small">🛡️ ${esc(textoGarantia(oferta.garantia))}</p>` : ''}</div>
      <div class="of-valor-box"><span class="muted small">Precio</span><strong>${precio ? eur(precio) : '–'}</strong>${valor.total ? `<span class="muted small">Valor de la oferta</span><strong>${eur(valor.total)}</strong>` : ''}${valor.ratio ? `<span class="of-ratio">${valor.ratio.toFixed(1).replace('.', ',')}× el precio</span>` : ''}</div>
    </div>`;
  if (!oferta.entregables.length && !oferta.bonus.length) {
    box.innerHTML = `<p class="muted">Añade los entregables y los bonus del lanzamiento (Configuración → ⑤ Oferta) para ver aquí qué bonus empujan la venta cada día del carrito.${irA('tab:oferta')}</p>`;
    return;
  }
  const vpd = ventasPorDia(state.leads, launch);
  if (!vpd) {
    box.innerHTML = `${resumen}<p class="muted">Para cruzar la oferta con las ventas de cada día hace falta el <strong>día del directo</strong> y el <strong>campo de fecha de compra</strong>.${irA('cfg-compra-fecha')}</p>`;
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
  pintarGarantia('mt-of', p?.garantia);
  refrescarPaqueteMeteo();
}
function leerPaqueteMeteo() {
  const fila = (el) => ({ id: el.dataset.id || nuevoId(el.dataset.of === 'bonus' ? 'b' : 'e'), tipo: $('.of-tipo', el).value, nombre: $('.of-nombre', el).value.trim(), detalle: $('.of-detalle', el).value.trim(), valor: $('.of-valor', el).value.trim(), ...($('.of-sub', el) && SUBTIPOS_ENTREGABLE[$('.of-tipo', el).value] ? { subtipo: $('.of-sub', el).value } : {}) });
  return {
    entregables: $$('#mt-of-entregables .of-fila').map(fila).filter((x) => x.nombre),
    bonus: $$('#mt-of-bonus .of-fila').map((el) => ({ ...fila(el), hasta: $('.of-hasta-in', el).value, ...leerObjetivo(el) })).filter((x) => x.nombre),
    garantia: leerGarantia('mt-of'),
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
      <div><h4>📦 Entregables (${p.entregables.length})</h4>${p.entregables.length ? `<ul>${p.entregables.map((e) => `<li>${tipoEntregable(e.tipo).icon} <strong>${esc(e.nombre)}</strong> <span class="muted small">${esc(etiquetaEntregable(e))}${e.valor ? ` · ${eur(e.valor)}` : ''}</span></li>`).join('')}</ul>` : '<p class="muted small">Sin entregables.</p>'}</div>
      <div><h4>🎁 Bonus (${p.bonus.length})</h4>${p.bonus.length ? `<ul>${p.bonus.map((b) => { const w = ventanaBonusMeteo(b, m); return `<li>${chipB(b)}${b.valor ? ` <span class="muted small">${eur(b.valor)}</span>` : ''}<br><span class="muted small">${fechaHoraCorta(w.desde)} → ${fechaHoraCorta(w.hasta)}${objetivoBonus(b) ? ` · ${esc(objetivoBonus(b))}` : ''}</span></li>`; }).join('')}</ul>` : '<p class="muted small">Sin bonus.</p>'}${textoGarantia(p.garantia) ? `<p class="small">🛡️ ${esc(textoGarantia(p.garantia))}</p>` : ''}</div>
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
        ? card('Ciclo de compra medio', '–', `Elige el campo de fecha de compra.${irA('cfg-compra-fecha')}`, 'calendar', 'info')
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
  if (!dateField) return `<p class="muted">Para medir el ciclo de compra hace falta el <strong>campo de fecha de compra</strong>.${irA('cfg-compra-fecha')}</p>`;
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

// ---------- 🛒 Venta directa / producto de entrada (low ticket) ----------
// Interruptores de «Qué lleva tu embudo» (al crearlo y en su configuración).
function pintarPartes(sel, partes) {
  $(sel).innerHTML = PARTES_DIRECTA.map((p) => `<label class="dir-parte${partes?.[p.id] ? ' on' : ''}"><input type="checkbox" data-parte="${p.id}"${partes?.[p.id] ? ' checked' : ''}><span class="dir-parte-ico" aria-hidden="true">${p.ico}</span><span><strong>${esc(p.label)}</strong><small>${esc(p.desc)}</small></span><span class="dir-switch" aria-hidden="true"></span></label>`).join('');
  pintarFlujo();
}
const partesElegidas = (sel) => Object.fromEntries($$(`${sel} [data-parte]`).map((i) => [i.dataset.parte, i.checked]));
// El dibujo del flujo (anuncio → venta → checkout → upsell → downsell → gracias) según lo elegido.
function pintarFlujo() {
  const p = partesElegidas('#emb-partes');
  $$('#embudo-dialog [data-flujo]').forEach((x) => { x.hidden = !p[x.dataset.flujo]; });
}
for (const sel of ['#emb-partes', '#dc-partes']) {
  $(sel).addEventListener('change', (e) => {
    const i = e.target.closest('[data-parte]');
    if (!i) return;
    i.closest('.dir-parte').classList.toggle('on', i.checked);
    if (sel === '#emb-partes') { pintarFlujo(); pintarEmbGuia(); } else pintarDirectaPartes();
  });
}

// Configuración del embudo (⚙️ Configurar el embudo).
const dcDlg = $('#directa-dialog');
const OPC_IVA_DIR = [['', 'Elige…'], ['incluido', 'IVA incluido'], ['mas', '+ IVA'], ['exento', 'Sin IVA']];
const LISTAS_DIR = { bumps: { nombre: 'Audios extra', tag: 'bump-…', url: false }, upsells: { nombre: 'Curso completo', tag: 'upsell-…', url: true }, downsells: { nombre: 'Minicurso', tag: 'downsell-…', url: true } };
const ofertaFila = (lista, o = {}) => `<div class="bump-fila${LISTAS_DIR[lista].url ? ' con-url' : ''}${o.activo === false ? ' off' : ''}" data-oferta="${esc(o.id || nuevoId(lista.slice(0, 2)))}">
    <label class="chk"><input type="checkbox" class="bump-activo"${o.activo === false ? '' : ' checked'}> Activo</label>
    <label class="field"><span>Nombre</span><input class="bump-nombre" maxlength="80" value="${esc(o.nombre || '')}" placeholder="${LISTAS_DIR[lista].nombre}"></label>
    <label class="field"><span>Precio (€)</span><input class="bump-precio" inputmode="decimal" value="${o.precio ? String(o.precio).replace('.', ',') : ''}" placeholder="9"></label>
    <label class="field"><span>¿Lleva IVA?</span><select class="bump-iva">${OPC_IVA_DIR.map(([v, t]) => `<option value="${v}"${(o.iva || '') === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="field"><span>Etiqueta de quien lo compra</span><input class="bump-tag" list="tag-list" value="${esc(o.tag || '')}" placeholder="${LISTAS_DIR[lista].tag}"></label>
    ${LISTAS_DIR[lista].url ? `<label class="field bump-url"><span>Página <small>(opcional)</small></span><input class="oferta-url" type="url" value="${esc(o.url || '')}" placeholder="https://…"></label>` : ''}
    <button type="button" class="btn ghost small bump-quitar" aria-label="Quitar">✕</button>
  </div>`;
const cajaDir = (lista) => $(`#directa-dialog [data-dc-lista="${lista}"]`);
function pintarOfertas(lista, items) {
  cajaDir(lista).innerHTML = (items || []).map((o) => ofertaFila(lista, o)).join('') || `<p class="muted small bump-vacio">Todavía no hay ninguno: pulsa «+ Añadir».</p>`;
}
const leerOfertas = (lista) => $$('.bump-fila', cajaDir(lista)).map((f) => ({
  id: f.dataset.oferta, activo: $('.bump-activo', f).checked, nombre: $('.bump-nombre', f).value.trim(),
  precio: $('.bump-precio', f).value.trim(), iva: $('.bump-iva', f).value, tag: $('.bump-tag', f).value.trim().toLowerCase(),
  ...(LISTAS_DIR[lista].url ? { url: $('.oferta-url', f).value.trim() } : {}),
}));
dcDlg.addEventListener('click', (e) => {
  const add = e.target.closest('[data-dc-add]');
  if (add) {
    const caja = cajaDir(add.dataset.dcAdd);
    $('.bump-vacio', caja)?.remove();
    caja.insertAdjacentHTML('beforeend', ofertaFila(add.dataset.dcAdd));
    $('.bump-fila:last-child .bump-nombre', caja).focus();
    return;
  }
  const quitar = e.target.closest('.bump-quitar');
  if (quitar) {
    const caja = quitar.closest('[data-dc-lista]');
    quitar.closest('.bump-fila').remove();
    if (!$('.bump-fila', caja)) pintarOfertas(caja.dataset.dcLista, []);
  }
});
dcDlg.addEventListener('change', (e) => {
  if (e.target.classList.contains('bump-activo')) e.target.closest('.bump-fila').classList.toggle('off', !e.target.checked);
});
// Cada sección se ve solo si su parte está encendida (y al encender upsell o downsell sin ninguno, sale uno vacío).
function pintarDirectaPartes() {
  const p = partesElegidas('#dc-partes');
  $$('#directa-dialog [data-dc-parte]').forEach((x) => { x.hidden = !p[x.dataset.dcParte]; });
  for (const [parte, lista] of [['bumps', 'bumps'], ['upsell', 'upsells'], ['downsell', 'downsells']]) {
    if (p[parte] && !$('.bump-fila', cajaDir(lista))) { cajaDir(lista).innerHTML = ''; cajaDir(lista).insertAdjacentHTML('beforeend', ofertaFila(lista)); }
  }
  pintarCodigosDirecta();
}
function pintarCodigosDirecta() {
  const id = dcDlg.dataset.id;
  const p = partesElegidas('#dc-partes');
  const script = `<script src="${location.origin}/tracker.js${cParam()}" defer></script>`;
  $('#dc-codigos-box').innerHTML = `<p class="muted small">Pega cada bloque en un elemento «Código HTML» de su página (en cualquier sitio; no se ve). Cuenta visitantes únicos sin gastar llamadas a GHL.</p>`
    + PAGINAS_DIRECTA.filter((x) => !x.parte || p[x.parte]).map((x) => filaCopiar(x.label, `<div data-lsd-directa="${x.id}" data-embudo="${id}"></div>\n${script}`, x.id === 'checkout' ? 'Llegar aquí = ha pulsado «Comprar» en la página de venta.' : x.id === 'venta' ? 'Base de la conversión de todo el embudo.' : '')).join('');
}

function abrirDirectaConfig(id = state.embudo) {
  const d = state.config.directas?.[id];
  if (!d) return;
  dcDlg.dataset.id = id;
  $('#dc-titulo').textContent = `🛒 ${d.name}`;
  pintarPartes('#dc-partes', d.partes || partesPorDefecto());
  const v = (k, x) => { $(`#dc-${k}`).value = x ?? ''; };
  v('name', d.name); v('producto', d.producto); v('precio', d.precio ? String(d.precio).replace('.', ',') : '');
  v('iva', d.iva?.producto || ''); v('ivaPct', d.iva?.pct ?? 21); v('compraTag', d.compraTag); v('compraDateField', d.compraDateField);
  v('ventaUrl', d.ventaUrl); v('checkoutUrl', d.checkoutUrl); v('graciasUrl', d.graciasUrl);
  v('metaFiltro', d.metaFiltro); v('inversionDia', d.inversionDia || ''); v('objetivoCpa', d.objetivoCpa || '');
  v('objetivoRoas', d.objetivoRoas ? String(d.objetivoRoas).replace('.', ',') : ''); v('objetivoVentasMes', d.objetivoVentasMes || ''); v('notas', d.notas);
  pintarOfertas('bumps', d.bumps);
  pintarOfertas('upsells', d.upsells);
  pintarOfertas('downsells', d.downsells);
  pintarDirectaPartes();
  const pend = pendientesDirecta(d);
  $('#dc-pendientes').innerHTML = pend.length ? `<div class="notice warn"><strong>Falta para que las cifras salgan bien:</strong><ul>${pend.map((x) => `<li>${esc(x.txt)}</li>`).join('')}</ul></div>` : '';
  $('#dc-status').textContent = '';
  dcDlg.showModal();
}
$('#dr-config').addEventListener('click', () => abrirDirectaConfig());
$('#dc-guardar').addEventListener('click', async () => {
  const id = dcDlg.dataset.id;
  const val = (k) => $(`#dc-${k}`).value.trim();
  const d = {
    ...state.config.directas[id],
    name: val('name') || state.config.directas[id].name, producto: val('producto'), precio: val('precio'),
    iva: { pct: val('ivaPct') === '' ? 21 : Number(val('ivaPct').replace(',', '.')), producto: $('#dc-iva').value },
    compraTag: val('compraTag').toLowerCase(), compraDateField: val('compraDateField'),
    partes: partesElegidas('#dc-partes'),
    bumps: leerOfertas('bumps'), upsells: leerOfertas('upsells'), downsells: leerOfertas('downsells'),
    ventaUrl: val('ventaUrl'), checkoutUrl: val('checkoutUrl'), graciasUrl: val('graciasUrl'),
    metaFiltro: val('metaFiltro'), inversionDia: val('inversionDia'), objetivoCpa: val('objetivoCpa'),
    objetivoRoas: val('objetivoRoas'), objetivoVentasMes: val('objetivoVentasMes'), notas: $('#dc-notas').value,
  };
  const b = $('#dc-guardar');
  b.disabled = true;
  $('#dc-status').textContent = 'Guardando…';
  try {
    const lista = embudos().map((e) => (e.id === id ? { ...e, nombre: d.name } : e));
    const { config } = await api('/api/config', { method: 'POST', body: { ...state.config, embudos: lista, directas: { ...state.config.directas, [id]: d } } });
    state.config = config;
    dcDlg.close();
    pintarSidebar();
    await cargarDirecta({ fresh: true });
  } catch (e) {
    $('#dc-status').textContent = e.message;
  } finally {
    b.disabled = false;
  }
});

// Periodo (como en la VSL): últimos 7/30/90 días, este mes, el pasado o fechas a medida.
const drRango = () => ({ preset: $('#dr-preset').value, desde: $('#dr-desde').value, hasta: $('#dr-hasta').value });
$('#dr-preset').value = ls.get('lsd_dr_preset') || '30d';
function pintarDrCampos() {
  const p = $('#dr-preset').value === 'personalizado';
  $('#dr-desde-f').hidden = !p;
  $('#dr-hasta-f').hidden = !p;
}
pintarDrCampos();
$('#dr-preset').addEventListener('change', () => { ls.set('lsd_dr_preset', $('#dr-preset').value); pintarDrCampos(); if ($('#dr-preset').value !== 'personalizado' || ($('#dr-desde').value && $('#dr-hasta').value)) cargarDirecta(); });
['#dr-desde', '#dr-hasta'].forEach((s) => $(s).addEventListener('change', () => { if ($('#dr-desde').value && $('#dr-hasta').value) cargarDirecta(); }));
$('#dr-recargar').addEventListener('click', () => cargarDirecta({ fresh: true }));

async function cargarDirecta({ fresh = false } = {}) {
  const id = state.embudo;
  if (!enDirecta() || !tiene(['metricas', 'leads'])) { renderDirecta(); return; }
  const r = drRango();
  const qs = new URLSearchParams({ d: id, preset: r.preset, ...(r.preset === 'personalizado' ? { desde: r.desde, hasta: r.hasta } : {}), ...(fresh ? { fresh: '1' } : {}) });
  state.directa.cargando = true;
  renderDirecta();
  try {
    const datos = await api(`/api/directa?${qs}`);
    if (state.embudo !== id) return;
    state.directa.datos = datos;
  } catch (e) {
    if (state.embudo !== id) return;
    state.directa.datos = { error: e.message };
  } finally {
    if (state.embudo === id) state.directa.cargando = false;
  }
  renderDirecta();
}

function renderDirecta() {
  if (!enDirecta()) return;
  const D = state.directa.datos;
  const fecha = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  $('#dr-texto').textContent = state.directa.cargando ? 'Cargando…' : D?.rango ? `${fecha(D.rango.desde)} – ${fecha(D.rango.hasta)} · ${D.rango.dias} días` : '';
  if (!$('#view-dmetricas').hidden) renderDirectaMetricas(D);
  if (!$('#view-dclientes').hidden) renderDirectaClientes(D);
}

// Tarjeta con su propia ayuda «?» (las de los lanzamientos dicen otra cosa).
const AYUDA_DIR = {
  Ventas: 'Contactos con la etiqueta de compra cuyo día de compra cae en el periodo.',
  Facturación: 'Precio del producto sin IVA × ventas + cada bump, upsell y downsell sin IVA × quienes lo compraron.',
  ROAS: 'Facturación sin IVA ÷ inversión en publicidad del periodo. 1x = el embudo se paga solo.',
  'Inversión en publicidad': 'Gasto en Meta de las campañas cuyo nombre contiene el filtro, en el periodo (o la inversión al día escrita a mano × días).',
  'Visitas a la página de venta': 'Visitantes únicos nuevos de la página de venta en el periodo (código de medición de la página).',
  'Clic al checkout': 'Visitantes del checkout ÷ visitantes de la página de venta.',
  'Cierre del checkout': 'Ventas ÷ visitantes que llegaron al checkout.',
  'Conversión de la página': 'Ventas ÷ visitantes de la página de venta.',
  'Coste por venta (CPA)': 'Inversión ÷ ventas. Si es mayor que el ticket medio, cada venta cuesta más de lo que deja.',
  'Ticket medio': 'Facturación sin IVA ÷ ventas: lo que deja de media cada compradora con sus extras.',
  'Beneficio (facturación − publicidad)': 'Facturación sin IVA menos la inversión en publicidad (sin otros costes).',
};
const cardD = (label, value, sub, ico, tone, ayuda = AYUDA_DIR[label] || '') => `<div class="kpi static tone-${tone}"><span class="kpi-label"><span class="kpi-ico">${icon(ico)}</span>${label}${ayudaBtn(ayuda)}</span><span class="kpi-value">${value}</span><span class="kpi-sub">${sub}</span></div>`;
const x2 = (v) => (v == null ? '–' : `${v.toFixed(2).replace('.', ',')}x`);
const pct1d = (v) => (v == null ? '–' : `${(Math.round(v * 1000) / 10).toLocaleString('es-ES')}%`);
function renderDirectaMetricas(D) {
  const d = state.config.directas?.[state.embudo] || {};
  const boton = puedeConfig() ? ' <button type="button" class="btn small" data-dir-config>Configurarlo ahora →</button>' : '';
  if (!D) { $('#dir-hero').innerHTML = '<p class="muted">Cargando…</p>'; ['#dir-cards', '#dir-extras', '#dir-objetivos', '#dir-dias', '#dir-avisos'].forEach((s) => { $(s).innerHTML = ''; }); return; }
  if (D.error) { $('#dir-avisos').innerHTML = `<div class="notice err">No se pudieron cargar las métricas: ${esc(D.error)}</div>`; $('#dir-hero').innerHTML = ''; return; }
  const avisos = [
    ...(D.pendientes || []).map((p) => p.txt),
    ...(D.metaError ? [`Meta: ${D.metaError}`] : []),
    ...(conParte(d, 'meta') && !D.metaConectado ? ['Meta no está conectado para este cliente: pon la inversión al día a mano en la configuración (o conecta Meta).'] : []),
  ];
  $('#dir-avisos').innerHTML = avisos.length ? `<div class="notice warn"><strong>Para que las cifras salgan bien:</strong><ul>${avisos.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>${boton}</div>` : '';
  const grande = (html) => html.replace('class="kpi static', 'class="kpi static kpi-hero');
  const invTxt = D.inversion == null ? (conParte(d, 'meta') ? 'sin datos de Meta' : 'pon la inversión en la configuración') : D.inversionFuente === 'meta' ? `Meta · campañas con «${esc(d.metaFiltro || state.embudo)}»` : 'a mano (€ al día × días)';
  $('#dir-hero').innerHTML = [
    grande(cardD('Ventas', D.ventas.toLocaleString('es-ES'), `${(D.ventas / Math.max(1, D.rango.dias)).toLocaleString('es-ES', { maximumFractionDigits: 1 })} al día de media`, 'cart', 'buy')),
    grande(cardD('Facturación', eur(D.facturacion), `<strong class="kpi-hero-ventas">Sin IVA</strong>producto ${eur(D.facturacionProducto)}${D.facturacionExtras ? ` + extras ${eur(D.facturacionExtras)}` : ''}`, 'coins', 'money')),
    grande(cardD('ROAS', x2(D.roas), D.roas != null ? `${eur(D.facturacion)} ÷ ${eur(D.inversion)} de inversión${D.roas >= 1 ? ' · se paga solo ✓' : ' · aún no se paga solo'}` : invTxt, 'trend', D.roas != null && D.roas < 1 ? 'warn' : 'buy')),
  ].join('');
  const v = D.visitas || {};
  const conVisitas = conParte(d, 'visitas');
  const sinCodigo = (pag) => `pega el código de la ${pag} (⚙️ Configurar → Páginas)`;
  // Más compras que visitas medidas: el código se pegó con el periodo ya empezado (o falta en alguna página).
  const incompleta = 'hay más compras que visitas medidas: el código se pegó con el periodo ya empezado o falta en alguna página';
  const conv = (x) => (x != null && x > 1 ? null : x);
  for (const k of ['ventaCheckout', 'checkoutCompra', 'ventaCompra']) if (D.conversion[k] > 1) D.conversion[k + 'Inc'] = true;
  $('#dir-cards').innerHTML = [
    cardD('Inversión en publicidad', D.inversion != null ? eur(D.inversion) : '–', invTxt, 'megaphone', 'accent'),
    ...(conVisitas ? [
      cardD('Visitas a la página de venta', v.venta ? v.venta.toLocaleString('es-ES') : '–', v.venta ? `visitantes únicos${D.inversion ? ` · ${eur(D.inversion / v.venta)} por visita` : ''}` : sinCodigo('página de venta'), 'eye', 'info'),
      cardD('Clic al checkout', pct1d(conv(D.conversion.ventaCheckout)), D.conversion.ventaCheckoutInc ? incompleta : v.checkout ? `${v.checkout.toLocaleString('es-ES')} llegaron al checkout de ${v.venta.toLocaleString('es-ES')} visitas` : sinCodigo('página del checkout'), 'funnel', 'info'),
      cardD('Cierre del checkout', pct1d(conv(D.conversion.checkoutCompra)), D.conversion.checkoutCompraInc ? incompleta : v.checkout ? `${D.ventas} compras de ${v.checkout.toLocaleString('es-ES')} que llegaron al checkout` : sinCodigo('página del checkout'), 'cart', 'buy'),
      cardD('Conversión de la página', pct1d(conv(D.conversion.ventaCompra)), D.conversion.ventaCompraInc ? incompleta : v.venta ? `${D.ventas} compras de ${v.venta.toLocaleString('es-ES')} visitas a la página de venta` : sinCodigo('página de venta'), 'target', 'buy'),
    ] : []),
    cardD('Coste por venta (CPA)', eur(D.cpa), D.cpa != null ? `${eur(D.inversion)} ÷ ${D.ventas} ventas · para no perder dinero: máx. ${eur(D.cpaEquilibrio)}` : invTxt, 'coins', D.cpa != null && D.cpaEquilibrio != null && D.cpa > D.cpaEquilibrio ? 'warn' : 'money'),
    cardD('Ticket medio', eur(D.ticket), D.subidaTicket != null && D.subidaTicket > 0.001 ? `+${pct1d(D.subidaTicket)} sobre el precio gracias a los extras · sin IVA` : 'sin IVA, por compra', 'euro', 'money'),
    cardD('Beneficio (facturación − publicidad)', D.beneficio != null ? eur(D.beneficio) : '–', D.beneficio != null ? 'sin IVA y sin contar otros costes' : invTxt, 'trend', D.beneficio != null && D.beneficio < 0 ? 'warn' : 'buy'),
  ].join('');
  // Extras: en grande el % de compradoras que lo coge y, debajo, cuántos se han vendido.
  const TIT = { bump: ['➕ Bump offers', 'de las compradoras lo añaden en el checkout'], upsell: ['⬆️ Upsell', 'de las compradoras lo cogen'], downsell: ['⬇️ Downsell', 'de las que dijeron que no al upsell lo cogen'] };
  const grupos = ['bump', 'upsell', 'downsell'].map((t) => [t, (D.extras || []).filter((x) => x.tipo === t)]).filter(([, l]) => l.length);
  $('#dir-extras').innerHTML = grupos.map(([t, l]) => `<section class="card dir-extra"><h3>${TIT[t][0]}</h3><div class="kpis">${l.map((x) => cardD(esc(x.nombre), pct1d(x.pct), `<strong>${x.n.toLocaleString('es-ES')} ${x.n === 1 ? 'vendido' : 'vendidos'}</strong> de ${x.base} · ${TIT[t][1]} · ${eur(x.facturacion)} sin IVA`, 'gift', t === 'bump' ? 'vip' : t === 'upsell' ? 'buy' : 'info', t === 'downsell' ? 'Quienes lo compraron ÷ compradoras que no cogieron ningún upsell (solo a ellas se les ofrece).' : 'Quienes tienen su etiqueta ÷ compradoras del periodo.')).join('')}</div></section>`).join('')
    || (conParte(d, 'bumps') || conParte(d, 'upsell') || conParte(d, 'downsell') ? `<div class="notice">Pon la etiqueta de cada bump, upsell o downsell para ver qué % de compradoras lo coge.${boton}</div>` : '');
  $('#dir-objetivos').innerHTML = D.objetivos?.length ? `<section class="card"><h3>🎯 Objetivos</h3><div class="kpis">${D.objetivos.map((o) => {
    const ok = o.actual == null ? null : o.menosEsMejor ? o.actual <= o.meta : o.actual >= o.meta;
    const fmt = (n) => (n == null ? '–' : o.unit === 'eur' ? eur(n) : o.unit === 'x' ? x2(n) : Math.round(n).toLocaleString('es-ES'));
    return cardD(o.label, fmt(o.actual), `objetivo ${fmt(o.meta)}${ok == null ? '' : ok ? ' · ✓ lo cumples' : ' · ✗ aún no'}`, 'target', ok === false ? 'warn' : 'buy', '');
  }).join('')}</div></section>` : '';
  // Por días: ventas, facturación y (si se miden) visitas, con una barra.
  const dias = (D.porDia || []).slice().reverse();
  const max = Math.max(1, ...dias.map((x) => x.ventas));
  $('#dir-dias').innerHTML = dias.length ? `<section class="card"><h3>📅 Día a día</h3><div class="table-wrap"><table class="metric-table dir-dias"><thead><tr><th>Día</th><th>Ventas</th><th class="num">Facturación</th>${conVisitas ? '<th class="num">Visitas</th><th class="num">Checkout</th>' : ''}</tr></thead><tbody>${dias.map((x) => `<tr><td>${new Date(`${x.dia}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</td><td><span class="dir-barra"><i style="width:${Math.round((x.ventas / max) * 100)}%"></i><b>${x.ventas}</b></span></td><td class="num">${eur(x.facturacion)}</td>${conVisitas ? `<td class="num">${x.venta || ''}</td><td class="num">${x.checkout || ''}</td>` : ''}</tr>`).join('')}</tbody></table></div>${D.sinFechaCompra ? '<p class="muted small">El día de cada venta es el día en que se creó el contacto. Si quieres el día exacto del pago (p. ej. de quien ya estaba en tu base de datos), pon el campo «Fecha de compra» en la configuración.</p>' : ''}</section>` : '';
}
$('#view-dmetricas').addEventListener('click', (e) => { if (e.target.closest('[data-dir-config]')) abrirDirectaConfig(); });

function renderDirectaClientes(D) {
  const d = state.config.directas?.[state.embudo] || {};
  const extras = [...(conParte(d, 'bumps') ? d.bumps || [] : []).map((o) => ({ ...o, t: '➕' })), ...(conParte(d, 'upsell') ? d.upsells || [] : []).map((o) => ({ ...o, t: '⬆️' })), ...(conParte(d, 'downsell') ? d.downsells || [] : []).map((o) => ({ ...o, t: '⬇️' }))].filter((o) => o.tag);
  const sel = $('#dc-filtro');
  const antes = sel.value;
  sel.innerHTML = `<option value="">Todas</option><option value="-">Sin ningún extra</option><option value="+">Con algún extra</option>${extras.map((o) => `<option value="${esc(o.id)}">${o.t} ${esc(o.nombre || o.tag)}</option>`).join('')}`;
  sel.value = [...sel.options].some((o) => o.value === antes) ? antes : '';
  if (!D || D.error) { $('#dc-body').innerHTML = `<tr><td colspan="4" class="muted">${D?.error ? esc(D.error) : 'Cargando…'}</td></tr>`; $('#dc-n').textContent = ''; return; }
  const q = $('#dc-buscar').value.trim().toLowerCase();
  const f = sel.value;
  const lista = (D.compradores || []).filter((c) => (!q || `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(q))
    && (!f || (f === '-' ? !c.extras.length : f === '+' ? c.extras.length > 0 : c.extras.includes(f))));
  const nombreExtra = (id) => { const o = extras.find((x) => x.id === id); return o ? `${o.t} ${o.nombre || o.tag}` : id; };
  $('#dc-n').textContent = `${lista.length.toLocaleString('es-ES')} de ${(D.compradores || []).length.toLocaleString('es-ES')} compradoras`;
  $('#dc-body').innerHTML = lista.slice(0, 500).map((c) => {
    const wa = waPhone(c.phone, state.config.defaultCountryCode || '34');
    return `<tr><td>${new Date(`${c.dia}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</td><td><strong>${esc(c.name || '—')}</strong><br><small class="muted">${esc(c.email)}</small></td><td>${c.extras.length ? c.extras.map((x) => `<span class="badge">${esc(nombreExtra(x))}</span>`).join(' ') : '<span class="muted small">Solo el producto</span>'}</td><td>${wa ? `<a class="btn small" href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp</a>` : '<span class="muted small">Sin teléfono</span>'}</td></tr>`;
  }).join('') || '<tr><td colspan="4" class="muted">Nadie con ese filtro en este periodo.</td></tr>';
}
$('#dc-buscar').addEventListener('input', () => renderDirectaClientes(state.directa.datos));
$('#dc-filtro').addEventListener('change', () => renderDirectaClientes(state.directa.datos));

// ---------- 🔌 Conexiones (SendFlow) ----------
// El cliente (rol «Cliente») que aún no ha terminado su cuestionario de marca solo ve el asistente, en el paso
// donde lo dejó, hasta terminarlo. Devuelve true si lo está enseñando.
async function asistenteMarcaCliente() {
  let d;
  try { d = await api('/api/marca'); } catch { return false; } // si falla, que pueda ver su portal
  if (d.asistente?.completado) return false;
  $('#app').hidden = true;
  $('#login').hidden = true;
  $('#portal').hidden = true;
  const box = $('#asistente-marca');
  box.hidden = false;
  await montarAsistente(box, {
    llamar: async (body) => (body ? api('/api/marca', { method: 'POST', body }) : d),
    clienteNombre: d.cliente, docsActivos: d.docsActivos,
    alTerminar: async () => { box.hidden = true; box.innerHTML = ''; await mostrarPortal(); },
    salir: () => $('#btn-logout').click(),
  });
  return true;
}

// ---------- 🎨 Marca y avatar (cuestionario del cliente: la fuente de los prompts) ----------
$('#btn-marca').addEventListener('click', () => {
  $('#tb-menu-cuenta').open = false;
  abrirPanelMarca({ api, cliente: state.cliente, clienteNombre: clienteNombre(), clientes: state.superadmin ? state.clientes.map((c) => ({ id: c.id, nombre: c.nombre })) : [], embudos: embudos().map((e) => ({ id: e.id, nombre: e.nombre })), puedeEditar: puedeConfig(), dialog: $('#marca-dialog') });
});
$('#mk-cerrar').addEventListener('click', () => $('#marca-dialog').close());
document.addEventListener('click', (e) => { if (e.target.closest('[data-abrir-marca]')) $('#btn-marca').click(); });
// Al cerrar el panel, lo que dependa de la marca se vuelve a pintar (p. ej. el prompt del grupo de WhatsApp).
$('#marca-dialog').addEventListener('close', () => {
  if (!$('#view-grupowa').hidden && state.config) renderGrupoWa();
  if (!$('#view-paginas').hidden && state.config) renderPaginas();
  if (!$('#view-anuncios').hidden && state.config) renderAnuncios();
});

$('#btn-conexiones').addEventListener('click', () => {
  $('#tb-menu-cuenta').open = false;
  pintarVigiaConexiones();
  $('#conexiones-dialog').showModal();
});
// Vigilancia: la tarea de cron-job.org y dónde avisar (sin pedir nada a SendFlow al abrir).
function pintarVigiaConexiones() {
  const url = `${location.origin}/api/sendflow?op=vigilar&key=<DIGEST_KEY>${cParam('&')}`;
  $('#cx-vigia-tarea').innerHTML = `<ol class="small">
    <li>En <a href="https://cron-job.org" target="_blank" rel="noopener">cron-job.org</a> (gratis), la misma cuenta del resumen diario → <strong>Create cronjob</strong>.</li>
    <li>URL: cambia <code>&lt;DIGEST_KEY&gt;</code> (signos <code>&lt; &gt;</code> incluidos) por el valor de la variable DIGEST_KEY de Cloudflare. Si cron-job.org da «Unauthorized», abre la URL en el navegador: el motivo sale escrito.</li></ol>
    ${filaCopiar('Tarea de vigilancia', url, 'Ejecución: <strong>cada 15 minutos</strong>. Solo trabaja cuando hay un lanzamiento en captación o carrito, o un meteórico en curso, con su campaña de SendFlow.')}`;
  const av = state.config.sendflowAvisos || {};
  $('#cx-av-email').checked = av.email !== false;
  $('#cx-av-email-a').textContent = state.config.digestEmail ? `(a ${state.config.digestEmail}, el del resumen diario)` : '(falta el email del resumen diario en Configuración)';
  $('#cx-av-tel').value = av.telefono || '';
  const sel = $('#cx-av-cuenta');
  if (av.cuentaId && ![...sel.options].some((o) => o.value === av.cuentaId)) sel.insertAdjacentHTML('beforeend', `<option value="${esc(av.cuentaId)}">Cuenta guardada</option>`);
  sel.value = av.cuentaId || '';
  $('#cx-av-status').textContent = '';
}
// Las cuentas de WhatsApp se piden a SendFlow solo al abrir el desplegable.
let sfCuentas = null;
for (const ev of ['focus', 'mousedown', 'touchstart']) {
  $('#cx-av-cuenta').addEventListener(ev, async () => {
    if (sfCuentas) return;
    sfCuentas = [];
    const sel = $('#cx-av-cuenta');
    const actual = sel.value;
    try {
      const d = await api('/api/sendflow?op=cuentas');
      sfCuentas = d.cuentas || [];
      sel.innerHTML = `<option value="">— Elige la cuenta —</option>${sfCuentas.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}${c.estado && c.estado !== 'connected' ? ` (${esc(c.estado)})` : ''}</option>`).join('')}${d.error ? `<option disabled>${esc(d.error)}</option>` : ''}`;
      sel.value = actual;
    } catch { /* se queda la guardada */ }
  }, { passive: true });
}
$('#cx-av-guardar').addEventListener('click', async () => {
  const tel = $('#cx-av-tel').value.replace(/\D/g, '');
  if (tel && !$('#cx-av-cuenta').value) { $('#cx-av-status').textContent = 'Elige también la cuenta de WhatsApp desde la que se manda.'; return; }
  $('#cx-av-status').textContent = 'Guardando…';
  try {
    const { config } = await api('/api/config', { method: 'POST', body: { ...state.config, sendflowAvisos: { email: $('#cx-av-email').checked, telefono: tel, cuentaId: tel ? $('#cx-av-cuenta').value : '' } } });
    state.config = config;
    $('#cx-av-status').textContent = 'Guardado ✓';
  } catch (e) { $('#cx-av-status').textContent = e.message; }
});
$('#cx-sendflow-probar').addEventListener('click', () => probarSendflow());
$('#cx-sendflow').addEventListener('click', (e) => { if (e.target.closest('[data-sf-reintentar]')) probarSendflow({ reintentar: true }); });
// SendFlow bloquea la clave si se le pide demasiado: el botón descansa 30 s entre pruebas.
async function probarSendflow({ reintentar = false } = {}) {
  const box = $('#cx-sendflow');
  const b = $('#cx-sendflow-probar');
  b.disabled = true;
  box.innerHTML = '<p class="muted">Conectando con SendFlow…</p>';
  try {
    const d = await api(`/api/sendflow?op=probar${reintentar ? '&reintentar=1' : ''}`);
    const hora = (ms) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    if (d.freno) {
      box.innerHTML = d.freno.bloqueo
        ? `<div class="notice warn"><strong>⏸️ SendFlow ha bloqueado la clave un rato por exceso de peticiones.</strong> La clave y la conexión están bien. El dashboard no le pedirá nada hasta las <strong>${hora(d.freno.hasta)}</strong> (para no alargar el bloqueo). Vuelve a probar a partir de esa hora.</div>`
        : `<div class="notice warn"><strong>SendFlow rechazó la clave (${d.freno.status}).</strong> Para no provocar un bloqueo, el dashboard espera hasta las <strong>${hora(d.freno.hasta)}</strong>.${d.formato?.prefijo === false ? ' Ojo: las claves de SendAPI empiezan por <code>send_api-</code> y la guardada no.' : ''} Si ya has cambiado la clave en Cloudflare (y vuelto a desplegar): <button type="button" class="btn small" data-sf-reintentar>Probar la clave nueva</button></div>`;
      return;
    }
    if (!d.configurada) {
      box.innerHTML = `<div class="notice warn"><strong>Aún no está conectado.</strong> Falta la variable <code>${esc(d.variable)}</code> en Cloudflare (tipo <em>Secret</em>) con la clave de SendFlow → «API Keys». Después, <em>Deployments → Retry deployment</em> y vuelve a probar.</div>`;
      return;
    }
    if (!d.ok) {
      const f = d.formato || {};
      const avisos = [
        f.conBearer ? 'La clave se guardó con la palabra «Bearer» delante (se quita sola, pero mejor guárdala sin ella).' : '',
        f.comillas ? 'La clave se guardó entre comillas: guárdala sin comillas.' : '',
        f.espacios ? 'La clave tiene espacios o saltos de línea: vuelve a copiarla sin espacios.' : '',
        f.largo && !f.prefijo ? 'Las claves de SendAPI empiezan por «send_api-» y la guardada no: ¿es la clave correcta?' : '',
      ].filter(Boolean);
      box.innerHTML = `<div class="notice err"><strong>No conecta:</strong> ${esc(d.error)}</div>${avisos.length ? `<ul class="small">${avisos.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}`;
      return;
    }
    const a = d.analitica;
    box.innerHTML = `<div class="notice">✅ <strong>Conectado con SendFlow.</strong> ${d.total} campaña${d.total === 1 ? '' : 's'} encontrada${d.total === 1 ? '' : 's'}.</div>
      ${a ? (a.ok ? `<p class="small">📊 Analítica de «${esc(a.nombre)}»: <strong>${a.entradas}</strong> entradas, <strong>${a.salidas}</strong> salidas y <strong>${a.clics}</strong> clics. La analítica funciona ✓</p>` : `<div class="notice warn"><strong>Las campañas se leen, pero la analítica no:</strong> ${esc(a.error)} Pide a SendFlow que active la analítica para tu clave de SendAPI.</div>`) : '<p class="muted small">No hay campañas todavía: crea una en SendFlow para probar la analítica.</p>'}
      ${d.campanas.length ? `<details><summary>Ver las campañas</summary><ul class="small">${d.campanas.map((c) => `<li>${esc(c.nombre)}${c.archivada ? ' <span class="muted">(archivada)</span>' : ''} <code class="muted">${esc(c.id)}</code></li>`).join('')}</ul></details>` : ''}`;
  } catch (e) {
    box.innerHTML = `<div class="notice err">${esc(e.message)}</div>`;
  } finally {
    // Descanso de 30 s entre pruebas (el límite de SendFlow es estricto).
    setTimeout(() => { b.disabled = false; }, 30_000);
  }
}

// ---------- 💬 Grupos de WhatsApp (SendFlow) ----------
// Desplegable de campañas: se piden a SendFlow solo al abrirlo (su límite es estricto) y una vez por sesión.
let sfCampanas = null;
function opcionSendflow(sel, actual) {
  const lista = sfCampanas?.campanas || [];
  const opts = [['', '— Sin vincular —'], ...lista.filter((c) => !c.archivada || c.id === actual).map((c) => [c.id, c.nombre])];
  if (actual && !opts.some(([v]) => v === actual)) opts.push([actual, `Campaña ${actual}`]);
  sel.innerHTML = opts.map(([v, t]) => `<option value="${esc(v)}"${v === actual ? ' selected' : ''}>${esc(t)}</option>`).join('')
    + (sfCampanas ? '' : '<option value="" disabled>(Ábrelo para cargar tus campañas de SendFlow)</option>');
  sel.value = actual;
}
async function cargarCampanasSendflow(sel) {
  if (sfCampanas) return;
  sfCampanas = { campanas: [] };
  const actual = sel.value;
  sel.insertAdjacentHTML('beforeend', '<option value="" disabled data-cargando>Cargando campañas de SendFlow…</option>');
  try {
    const d = await api('/api/sendflow?op=campanas');
    sfCampanas = d;
    if (!d.conectado) sfCampanas.campanas = [];
  } catch { sfCampanas = { campanas: [], error: true }; }
  $$('[data-sendflow-select]').forEach((s) => opcionSendflow(s, s === sel ? actual : s.value));
  if (sfCampanas.error || sfCampanas.conectado === false) sel.insertAdjacentHTML('beforeend', `<option value="" disabled>${sfCampanas.conectado === false ? 'SendFlow no está conectado (Cuenta → Conexiones)' : esc(typeof sfCampanas.error === 'string' ? sfCampanas.error : 'No se pudieron cargar las campañas')}</option>`);
}
$$('[data-sendflow-select]').forEach((sel) => {
  for (const ev of ['focus', 'mousedown', 'touchstart']) sel.addEventListener(ev, () => cargarCampanasSendflow(sel), { passive: true });
});

// Entradas, salidas y clics de la campaña de un lanzamiento o meteórico (el servidor lo guarda 5 min).
async function cargarGrupos(code, box) {
  if (!box || !code) return;
  box.innerHTML = '<p class="muted">Cargando los grupos de SendFlow…</p>';
  let d;
  try { d = await api(`/api/sendflow?op=grupos&l=${encodeURIComponent(code)}`); } catch (e) { box.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  const esLanz = Boolean(state.config.launches[code]);
  if (!d.vinculada) {
    box.innerHTML = `<div class="notice">Este ${esLanz ? 'lanzamiento' : 'meteórico'} aún no tiene su campaña de SendFlow.${d.conectado ? '' : ' Primero conecta SendFlow en <strong>Cuenta → Conexiones</strong>.'}${puedeConfig() && d.conectado ? ` <button type="button" class="btn small" data-grupos-vincular="${esc(code)}">Elegir la campaña →</button>` : ''}</div>`;
    return;
  }
  if (!d.conectado) { box.innerHTML = '<div class="notice warn">SendFlow no está conectado: <strong>Cuenta → Conexiones</strong>.</div>'; return; }
  if (d.error) { box.innerHTML = `<div class="notice warn">${esc(d.error)}</div>`; return; }
  const neto = d.entradas - d.salidas;
  // Registros por día (GHL) para compararlos con las entradas al grupo.
  const regDia = new Map();
  if (esLanz && state.leadsDe === code) for (const l of state.leads || []) { const k = l.dateAdded ? dayInMadrid(l.dateAdded) : ''; if (k) regDia.set(k, (regDia.get(k) || 0) + 1); }
  const registros = esLanz && state.leadsDe === code ? state.leads.length : null;
  const llenos = (d.grupos || []).filter((g) => g.lleno).length;
  const AY = {
    grupo: 'Entradas menos salidas desde que empezó la campaña de SendFlow (no descuenta a quien entró dos veces).',
    salidas: 'Quienes se han salido ÷ quienes han entrado.',
    clics: 'Entradas ÷ clics en el enlace de SendFlow: si baja mucho, el enlace o los grupos pueden fallar.',
    registros: 'Personas en el grupo ÷ leads registrados del lanzamiento (aproximado).',
  };
  box.innerHTML = `<div class="kpis">
      ${cardD('En los grupos ahora', neto.toLocaleString('es-ES'), `${d.entradas.toLocaleString('es-ES')} entradas − ${d.salidas.toLocaleString('es-ES')} salidas${d.nombre ? ` · «${esc(d.nombre)}»` : ''}`, 'users', 'accent', AY.grupo)}
      ${registros ? cardD('De los registros, en el grupo', pctOf(neto, registros).replace('.', ','), `${neto.toLocaleString('es-ES')} en el grupo de ${registros.toLocaleString('es-ES')} leads`, 'funnel', 'info', AY.registros) : ''}
      ${cardD('Salidas', pctOf(d.salidas, d.entradas).replace('.', ','), `${d.salidas.toLocaleString('es-ES')} se han salido`, 'logout', d.entradas && d.salidas / d.entradas > 0.15 ? 'warn' : 'info', AY.salidas)}
      ${cardD('Del clic a entrar', pctOf(d.entradas, d.clics).replace('.', ','), `${d.clics.toLocaleString('es-ES')} clics en el enlace`, 'link', 'buy', AY.clics)}
      ${d.grupos ? cardD('Grupos', d.grupos.length, llenos ? `${llenos} llenos${llenos === d.grupos.length ? ' · ⚠️ todos llenos: revisa que SendFlow cree el siguiente' : ''}` : 'ninguno lleno', 'chat', llenos && llenos === d.grupos.length ? 'warn' : 'info', 'Grupos de la campaña en SendFlow y cuántos están llenos.') : ''}
    </div>
    ${d.porDia.length ? `<div class="table-scroll"><table class="metric-table"><thead><tr><th>Día</th><th class="num">Entradas</th><th class="num">Salidas</th><th class="num">Neto</th><th class="num">Clics</th>${registros ? '<th class="num">Registros</th>' : ''}</tr></thead><tbody>${d.porDia.slice().reverse().map((x) => `<tr><td>${esc(fechaFicha(`${x.dia}T12:00:00Z`))}</td><td class="num">${x.entradas}</td><td class="num">${x.salidas}</td><td class="num"><strong>${x.entradas - x.salidas}</strong></td><td class="num">${x.clics}</td>${registros ? `<td class="num">${regDia.get(x.dia) || 0}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : '<p class="muted">SendFlow aún no tiene entradas en esta campaña.</p>'}
    ${d.grupos?.length ? `<details><summary class="small">Ver los ${d.grupos.length} grupos</summary><ul class="small">${d.grupos.map((g) => `<li>${esc(g.nombre || g.id)} · ${g.personas} personas${g.lleno ? ' · <strong>lleno</strong>' : ''}</li>`).join('')}</ul></details>` : ''}
    ${esLanz && state.grupoWa?.code === code && state.grupoWa.claves && state.leadsDe === code ? (() => {
      const en = state.leads.filter((l) => l.s.enGrupo);
      const sin = en.filter((l) => !l.s.compra).length;
      return `<div class="notice">🔗 <strong>Cruce exacto con GHL (por teléfono):</strong> ${en.length.toLocaleString('es-ES')} de ${state.leads.length.toLocaleString('es-ES')} leads están en los grupos (${pctOf(en.length, state.leads.length).replace('.', ',')}); ${(en.length - sin).toLocaleString('es-ES')} ya han comprado y <strong>${sin.toLocaleString('es-ES')} siguen sin comprar</strong> (lista en <em>Hoy → Setting hoy</em>). ${state.grupoWa.personas.toLocaleString('es-ES')} personas en los grupos${state.grupoWa.admins ? `, sin contar ${state.grupoWa.admins} administradora${state.grupoWa.admins === 1 ? '' : 's'}` : ''}.</div>`;
    })() : ''}
    ${vigilanciaHtml(d.vigilancia, code)}
    <p class="muted small">Datos de SendFlow, se actualizan cada 5 minutos (la lista de personas, cada 30).</p>`;
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-grupos-vincular]');
  if (!b) return;
  const code = b.dataset.gruposVincular;
  if (state.config.meteoricos?.[code]) { await abrirMeteoDialog(code); return; }
  await openConfig(code);
  setTimeout(() => goToField('cfg-sendflow'), 150);
});

// Participantes de los grupos (CSV de SendFlow) cruzados con los leads por teléfono. Se carga una vez por
// lanzamiento y sesión; el servidor guarda la exportación 30 min (SendFlow tarda y limita las peticiones).
async function cargarMiembrosGrupo(code = state.launchCode, { forzar = false } = {}) {
  const l = state.config.launches[code];
  if (!l?.sendflowId || !tiene(['hoy', 'leads', 'metricas'])) return;
  if (!forzar && state.grupoWa?.code === code && (state.grupoWa.claves || state.grupoWa.cargando)) return;
  state.grupoWa = { code, cargando: true };
  try {
    const res = await fetch(`/api/sendflow?op=miembros&l=${encodeURIComponent(code)}`, { headers: state.cliente ? { 'x-cliente': state.cliente } : {}, credentials: 'same-origin' });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`);
    const m = leerMiembros(await res.text());
    if (state.grupoWa?.code !== code) return;
    state.grupoWa = { code, ...m, at: Number(res.headers.get('x-exportado')) || Date.now() };
  } catch (e) {
    if (state.grupoWa?.code === code) state.grupoWa = { code, error: e.message };
  }
  if (state.launchCode !== code || !state.leads) return;
  for (const lead of state.leads) lead.s.enGrupo = Boolean(state.grupoWa.claves?.has(claveTelefono(lead.phone)));
  render();
}
// Estadísticas de SendFlow (entradas − salidas) para el % aproximado mientras no hay cruce exacto.
const gruposStats = {};
async function cargarStatsGrupo(code) {
  if (gruposStats[code]) return;
  gruposStats[code] = { cargando: true };
  try { gruposStats[code] = await api(`/api/sendflow?op=grupos&l=${encodeURIComponent(code)}`); } catch (e) { gruposStats[code] = { error: e.message }; }
  if (state.launchCode === code && state.leads) render();
}
// Resumen → dentro de «Leads totales»: % y número de leads en los grupos de WhatsApp. Exacto (cruce por
// teléfono con SendFlow) o, mientras se cruza, aproximado (entradas − salidas ÷ leads).
function textoGrupoWa(m) {
  const code = state.launchCode;
  const g = state.grupoWa?.code === code ? state.grupoWa : null;
  const linea = (txt, title) => `<strong class="kpi-hero-ventas" title="${esc(title)}">💬 ${txt}</strong>`;
  if (g?.claves) {
    const n = state.leads.filter((l) => l.s.enGrupo).length;
    return linea(`${pctOf(n, m.total).replace('.', ',')} en grupos de WhatsApp (${n.toLocaleString('es-ES')})`, `Cruce por teléfono con SendFlow: ${g.personas} personas en los grupos, sin contar administradoras`);
  }
  if (!g) cargarMiembrosGrupo(code);
  const st = gruposStats[code];
  if (!st) cargarStatsGrupo(code);
  if (st && st.vinculada && !st.error && st.entradas != null) {
    const neto = Math.max(0, st.entradas - st.salidas);
    return linea(`≈ ${pctOf(neto, m.total).replace('.', ',')} en grupos de WhatsApp (${neto.toLocaleString('es-ES')})`, g?.error ? `Aproximado (entradas − salidas). No se pudo cruzar por teléfono: ${g.error}` : 'Aproximado (entradas − salidas): calculando el cruce exacto por teléfono…');
  }
  return linea('Grupos de WhatsApp: cargando…', st?.error || g?.error || 'Cargando de SendFlow');
}

// Vigilancia de los grupos: última comprobación, estado del enlace, entradas y salidas por hora y avisos.
const TIPO_ALERTA = { enlace: '🔗 Enlace caído', llenos: '🈵 Grupos llenos', clics: '🖱️ Clics sin entradas', fuga: '🚪 Pico de salidas' };
function vigilanciaHtml(v, code) {
  const horaCorta = (t) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const diaHora = (t) => new Date(t).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  if (!v?.ultima) {
    return `<section class="vigia"><h3>🛎️ Vigilancia</h3><p class="muted small">Aún no se ha comprobado. Se activa con una tarea cada 15 minutos (<strong>Cuenta → Conexiones → Vigilancia de los grupos</strong>) y vigila mientras ${state.config.launches[code] ? 'el lanzamiento está en captación o carrito' : 'el meteórico está en curso'}.</p></section>`;
  }
  const e = v.estado || {};
  const mins = Math.round((Date.now() - v.ultima) / 60_000);
  const estado = [
    e.enlace ? (e.enlace.ok ? '✅ El enlace de entrada funciona' : `🚨 El enlace de entrada no funciona (${esc(e.enlace.detalle || '')})`) : '<span class="muted">Sin enlace del grupo para comprobar (pon el enlace de WhatsApp en la configuración)</span>',
    e.grupos != null ? (e.llenos && e.llenos === e.grupos ? `🚨 Los ${e.grupos} grupos están llenos` : `✅ ${e.grupos - (e.llenos || 0)} de ${e.grupos} grupos con sitio`) : '',
    (e.activas || []).includes('fuga') ? '⚠️ Pico de salidas ahora mismo' : '',
  ].filter(Boolean);
  const ph = v.porHora || [];
  const maxS = Math.max(1, ...ph.map((x) => x.salidas));
  const mediaS = ph.length ? ph.reduce((t, x) => t + x.salidas, 0) / ph.length : 0;
  const tabla = ph.length ? `<details${(e.activas || []).includes('fuga') ? ' open' : ''}><summary class="small">Entradas y salidas por hora (últimas 24 h)</summary><div class="table-scroll"><table class="metric-table vigia-horas"><thead><tr><th>Hora</th><th class="num">Entradas</th><th class="num">Salidas</th><th></th></tr></thead><tbody>${ph.slice().reverse().map((x) => `<tr class="${x.salidas >= Math.max(10, 3 * mediaS) ? 'vigia-pico' : ''}"><td>${horaCorta(x.hasta - 3_600_000)}–${horaCorta(x.hasta)}</td><td class="num">${x.entradas}</td><td class="num"><strong>${x.salidas}</strong></td><td><div class="meter"><span style="width:${(x.salidas / maxS) * 100}%"></span></div></td></tr>`).join('')}</tbody></table></div></details>` : '';
  const alertas = (v.alertas || []).length ? `<h4 class="cx-h">Avisos recientes</h4><ul class="vigia-alertas">${v.alertas.map((a) => `<li class="n-${a.nivel}"><strong>${TIPO_ALERTA[a.tipo] || a.tipo}</strong> · <span class="muted">${diaHora(a.t)}${a.enviados?.length ? ` · enviado por ${a.enviados.join(' y ')}` : ''}</span><br>${esc(a.texto)}</li>`).join('')}</ul>` : '<p class="muted small">Sin avisos: todo en orden.</p>';
  return `<section class="vigia"><h3>🛎️ Vigilancia <span class="muted small">· última comprobación ${mins < 1 ? 'ahora mismo' : `hace ${mins} min`}</span></h3>
    <ul class="vigia-estado">${estado.map((t) => `<li>${t}</li>`).join('')}</ul>${alertas}${tabla}</section>`;
}

// ---------- 💬 Plan → Grupo de WhatsApp: calentamiento escrito con Claude y programado en SendFlow ----------
const gwc = { code: '', mensajes: [], sendflowId: '', conectado: false, cargando: false, cambios: false, error: '' };
const embCal = () => (enMeteo() ? state.config.meteoricos?.[state.meteo.code] : state.config.launches[state.launchCode]) || null;
const tipoMsg = (id) => TIPOS_MSG.find((t) => t.id === id) || TIPOS_MSG[0];
const hoyLocal = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
async function cargarCal(code, { fresh = false } = {}) {
  if (!fresh && gwc.code === code && !gwc.error) return;
  Object.assign(gwc, { code, mensajes: [], cargando: true, cambios: false, error: '' });
  try {
    const d = await api(`/api/sendflow?op=calentamiento&l=${encodeURIComponent(code)}`);
    Object.assign(gwc, { mensajes: d.mensajes || [], sendflowId: d.sendflowId, conectado: d.conectado });
  } catch (e) { gwc.error = e.message; }
  gwc.cargando = false;
}
// Rango por defecto del prompt: de hoy (o el inicio) al cierre del carrito / de la oferta.
function rangoCal(emb) {
  const hoy = hoyLocal();
  const desde = (enMeteo() ? emb.calentamiento : emb.inicioCaptacion) || hoy;
  const hasta = String((enMeteo() ? emb.cierre : emb.cierreCarrito) || '').slice(0, 10) || (enMeteo() ? '' : emb.fechaDirecto) || '';
  return { desde: desde < hoy ? hoy : desde, hasta };
}
async function renderGrupoWa() {
  const box = $('#grupowa-body');
  const code = codigo();
  const emb = embCal();
  if (!code || !emb) { box.innerHTML = `<div class="card empty"><p class="muted">${enMeteo() ? 'Elige o crea un meteórico.' : 'Elige un lanzamiento.'}</p></div>`; return; }
  if (gwc.code !== code || gwc.cargando) { box.innerHTML = '<p class="muted">Cargando…</p>'; await cargarCal(code); if (codigo() !== code) return; }
  const editable = puedeConfig();
  const r = rangoCal(emb);
  const desde = $('#gw-desde')?.value || r.desde;
  const hasta = $('#gw-hasta')?.value || r.hasta;
  const sinCampana = !emb.sendflowId;
  gwc.marca = await marcaDeEmbudo(api, state.cliente, state.embudo);
  if (codigo() !== code) return;
  const listos = gwc.mensajes.filter((m) => (m.estado === 'borrador' || m.estado === 'error') && !faltaMensaje(m).length);
  const programados = gwc.mensajes.filter((m) => m.estado === 'programado');
  const porDia = new Map();
  for (const m of gwc.mensajes) { const d = (m.at || 'sin fecha').slice(0, 10); if (!porDia.has(d)) porDia.set(d, []); porDia.get(d).push(m); }
  box.innerHTML = `
    <section class="card gw-intro">
      <h2>💬 Mensajes del grupo de WhatsApp · ${esc(emb.name || code)}</h2>
      <ol class="gw-pasos">
        <li><strong>Copia el prompt</strong> (paso 1) y pégalo en <strong>Claude</strong>, en una conversación con tu <strong>skill de copy</strong>. Ya lleva las fechas, el producto, la oferta y los bonus de este ${enMeteo() ? 'meteórico' : 'lanzamiento'}.</li>
        <li><strong>Pega aquí su respuesta</strong> (paso 2): se convierte sola en mensajes con su día y hora.</li>
        <li><strong>Sube los archivos</strong> (vídeos, audios, imágenes) y pega su enlace en cada mensaje: mira «📎 Archivos» abajo.</li>
        <li><strong>Revisa y programa</strong> (paso 3): con un botón se programan en SendFlow para todos los grupos de la campaña.</li>
      </ol>
      ${sinCampana ? `<div class="notice warn">Este ${enMeteo() ? 'meteórico' : 'lanzamiento'} aún no tiene su campaña de SendFlow: puedes preparar los mensajes, pero para programarlos hay que elegirla.${editable ? ` <button type="button" class="btn small" data-grupos-vincular="${esc(code)}">Elegir la campaña →</button>` : ''}</div>` : !gwc.conectado ? '<div class="notice warn">SendFlow no está conectado (Cuenta → Conexiones).</div>' : ''}
      ${gwc.error ? `<div class="notice err">${esc(gwc.error)}</div>` : ''}
    </section>
    ${editable ? `<section class="card">
      <h3>1 · El prompt para Claude</h3>
      <div class="row gw-rango"><label class="field inline"><span>Desde</span><input type="date" id="gw-desde" value="${esc(desde)}"></label><label class="field inline"><span>Hasta</span><input type="date" id="gw-hasta" value="${esc(hasta)}"></label>
        <button type="button" class="btn primary" id="gw-copiar">📋 Copiar el prompt</button></div>
      ${gwDirectos().length ? `<div class="gw-directo-info"><strong>📅 Día${gwDirectos().length > 1 ? 's' : ''} de directo:</strong> ${gwDirectos().map((x) => `${esc(x.nombre)} · ${esc(fechaFicha(madridToEpoch(x.at)))} a las ${esc(x.at.slice(11))}`).join(' · ')}. Ese día todos los mensajes solo recuerdan que es hoy, cuentan lo que verán y llevan el enlace de acceso al directo (ya va en el prompt).</div>
      <label class="field"><span>¿Qué verán en la masterclass? <small>(opcional, entra en el prompt: temas, lo que aprenderán, sorpresas…)</small></span><textarea id="gw-temario" rows="3" placeholder="- Por qué el bebé se despierta cada 2 horas&#10;- Las 3 rutinas que funcionan&#10;- Sorpresa al final para quien se quede">${esc(ls.get(temarioKey()) || '')}</textarea></label>` : ''}
      <p class="muted small">Pégalo en Claude en una conversación con tu skill de copy de venta. Si ya hay mensajes programados, el prompt se los dice para que no los repita.</p>
      ${avisoMarcaHtml(gwc.marca)}
      <details><summary class="small">Ver el prompt</summary><pre class="snippet gw-prompt" id="gw-prompt"></pre></details>
    </section>
    <section class="card">
      <h3>2 · Pega aquí la respuesta de Claude</h3>
      <textarea id="gw-pegar" rows="7" placeholder="### 2026-11-03 19:00 | texto&#10;El texto del mensaje…&#10;&#10;### 2026-11-04 10:00 | encuesta&#10;¿La pregunta?&#10;- Opción 1&#10;- Opción 2"></textarea>
      <p><button type="button" class="btn primary" id="gw-anadir">Convertir en mensajes</button> <span class="muted small" id="gw-anadir-st"></span></p>
    </section>` : ''}
    <section class="card gw-archivos">
      <details${gwc.mensajes.some((m) => tipoMsg(m.tipo).archivo && !m.url && m.estado !== 'programado') ? ' open' : ''}><summary><h3>📎 Archivos: vídeos, audios, imágenes y PDF</h3></summary>
      <p><strong>SendFlow no recibe el archivo, sino un enlace público al archivo.</strong> Así se consigue:</p>
      <ol class="small">
        <li>En GHL → <strong>Sitios → Medios</strong> (o «Media Storage»), sube el archivo.</li>
        <li>En el archivo, <strong>⋯ → Copiar enlace</strong> (empieza por <code>https://</code> y termina en <code>.mp4</code>, <code>.ogg</code>, <code>.jpg</code>…).</li>
        <li>Pégalo en el campo <strong>«Enlace del archivo»</strong> del mensaje (abajo).</li>
      </ol>
      <p class="small">❌ <strong>No sirven</strong> enlaces de Vimeo, YouTube, Instagram o Drive «para ver»: son páginas, no el archivo (ese contenido, mejor como texto con el enlace).</p>
      <div class="table-scroll"><table class="metric-table"><thead><tr><th>Tipo</th><th>Formato recomendado</th><th>Consejo</th></tr></thead><tbody>${GUIA_ARCHIVOS.map((g) => `<tr><td>${tipoMsg(g.tipo).ico} ${esc(tipoMsg(g.tipo).label)}</td><td><strong>${esc(g.formato)}</strong></td><td class="small">${esc(g.consejo)}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted small">Máximo 16 MB por archivo (límite de WhatsApp). Las <strong>notas de voz</strong> son lo que más se escucha en un grupo: grábalas con el guion que te da Claude.</p></details>
    </section>
    <section class="card">
      <h3>3 · Revisa y programa <span class="muted small">· ${gwc.mensajes.length} mensajes · ${programados.length} programados · ${listos.length} listos para programar</span></h3>
      ${gwc.mensajes.length ? [...porDia.entries()].map(([d, lista]) => `<div class="gw-dia"><h4>${d === 'sin fecha' ? 'Sin fecha' : esc(new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }))}</h4>${lista.map((m) => gwFila(m, editable)).join('')}</div>`).join('') : '<p class="muted">Aún no hay mensajes. Pega la respuesta de Claude en el paso 2.</p>'}
      ${editable ? `<div class="gw-anadir"><span class="gw-anadir-t">Añadir a mano:</span>${TIPOS_MSG.map((t) => `<button type="button" class="btn small" data-gw-add="${t.id}">+ ${t.ico} ${esc(t.label)}</button>`).join('')}</div>` : ''}
      ${editable && gwc.mensajes.length ? `<div class="gw-acciones">
        <button type="button" class="btn" id="gw-guardar"${gwc.cambios ? '' : ' disabled'}>Guardar cambios</button>
        <button type="button" class="btn primary" id="gw-programar"${listos.length && !sinCampana && gwc.conectado ? '' : ' disabled'}>📤 Programar en SendFlow (${listos.length})</button>
        <span class="muted small" id="gw-st"></span></div>` : ''}
    </section>`;
  const pre = $('#gw-prompt');
  if (pre) pre.textContent = gwPrompt();
}
// Días de directo del lanzamiento con su enlace genérico de acceso (sin datos de cada persona: pide el email).
function gwDirectos() {
  if (enMeteo()) return [];
  const emb = embCal();
  const vids = videosDe(emb);
  const dir = vids.filter((v) => esEnDirecto(v) || (v.k === 1 && emb.fechaDirecto));
  return dir.filter((v) => v.fecha).map((v) => ({
    nombre: vids.length > 1 ? v.nombre : 'El webinar en directo', at: `${v.fecha}T${v.hora || '19:00'}`,
    url: `${location.origin}/directo?l=${encodeURIComponent(gwc.code)}${vids.length > 1 ? `&v=${v.k}` : ''}${cParam('&')}`,
  }));
}
const temarioKey = () => `lsd_gw_temario_${state.cliente || ''}_${gwc.code}`;
function gwPrompt() {
  const emb = embCal();
  return promptCalentamiento(emb, { esMeteo: enMeteo(), producto: nombreProducto(state.config), marca: clienteNombre(), desde: $('#gw-desde')?.value || '', hasta: $('#gw-hasta')?.value || '', ya: gwc.mensajes.filter((m) => m.estado === 'programado'), directos: gwDirectos(), temario: ($('#gw-temario')?.value ?? ls.get(temarioKey()) ?? '').trim(), contexto: contextoMarca(gwc.marca?.m, gwc.marca?.producto) });
}
// ---------- 🎯 Crear anuncios con IA (Plan → Anuncios) ----------
// Por objetivo del embudo, prompts para Claude (guiones, Magnific, copys de Meta) con los anuncios ganadores
// (del lanzamiento, de todos los lanzamientos del embudo o de la VSL) y la ficha de marca, avatar y producto.
const notasAnKey = () => `lsd_an_notas_${state.cliente || ''}_${state.embudo}`;
const eventoAnKey = () => `lsd_an_evento_${state.cliente || ''}_${state.embudo}`;
const TIPO_TXT = { lanzamientos: 'Lanzamiento (webinar / clases gratuitas y carrito)', vsl: 'Embudo siempre abierto (VSL)', meteorico: 'Meteórico (oferta flash)', directa: 'Venta directa (producto de entrada)' };
// Filas de anuncios ganadores disponibles ahora mismo: { filas, origen }.
function ganadoresAnuncios() {
  const t = tipoActual();
  if (t === 'lanz') {
    if (state.hist.datos?.length && state.hist.embudo === state.embudo) {
      const h = historicoAnuncios(state.hist.datos.map((d) => ({ code: d.code, nombre: d.nombre, filas: rankingGanadores(d.leads, state.config.launches[d.code], 'ad', d.meta?.names || {}, d.meta?.spendBy || {}) })));
      return { filas: h.filas, origen: `${h.lanzamientos} lanzamiento${h.lanzamientos === 1 ? '' : 's'} de este embudo` };
    }
    const launch = state.config.launches[state.launchCode];
    if (launch && state.leadsDe === state.launchCode && state.leads?.length) return { filas: rankingGanadores(state.leads, launch, 'ad', state.meta?.names || {}, state.meta?.spendBy || {}), origen: `el lanzamiento «${launch.name}»` };
  }
  if (t === 'vsl' && state.vsl?.leads?.length) return { filas: rankingGanadores(state.vsl.leads, vslCfg(), 'ad', state.vsl.meta?.names || {}, state.vsl.meta?.spendBy || {}), origen: 'el periodo elegido de la VSL' };
  return { filas: [], origen: '' };
}
// Formato del lanzamiento abierto (webinar, 2/3 vídeos, PLF, reto) para adaptar el nombre del evento.
function formatoAnuncios() {
  if (tipoActual() !== 'lanz') return { id: '', texto: '' };
  const l = state.config.launches[state.launchCode];
  const id = formatoValido(l?.formato || embudoInfo()?.formato);
  return { id, texto: `${FORMATOS[id].label}: ${FORMATOS[id].desc}` };
}
function ctxAnuncio(c, objetivo) {
  const g = ganadoresAnuncios();
  const f = formatoAnuncios();
  return { objetivo, tipoTexto: TIPO_TXT[c.tipo] || c.tipo, nombreEmbudo: c.nombre, marca: clienteNombre(), datos: c.datos, urls: c.urls,
    contexto: contextoMarca(pgc.marca?.m, pgc.marca?.producto), diseno: disenoTexto(pgc.marca?.m), ganadores: ganadoresTexto(g.filas), notas: (ls.get(notasAnKey()) || '').trim(), evento: (ls.get(eventoAnKey()) || '').trim(), formato: f.id, formatoTexto: f.texto };
}
async function renderAnuncios() {
  const box = $('#anuncios-body');
  const c = contextoPaginas();
  if (c.falta) { box.innerHTML = `<div class="card empty"><p class="muted">${esc(c.falta)}</p></div>`; return; }
  const embudo = state.embudo;
  pgc.marca = await marcaDeEmbudo(api, state.cliente, embudo);
  if (state.embudo !== embudo) return;
  const g = ganadoresAnuncios();
  const top = [...g.filas].sort((a, b) => (b.compras - a.compras) || (b.leads - a.leads)).slice(0, 6);
  const conHist = tipoActual() === 'lanz' && codigosHistorico().length > 1;
  box.innerHTML = `<section class="card">
      <h2>🎯 Anuncios de «${esc(c.nombre)}» con IA</h2>
      <ol class="small pg-pasos">
        <li>Elige el <strong>objetivo</strong> y copia el prompt. <strong>⚡ Todo en uno</strong> hace los guiones, los copys y los anuncios en Magnific, paso a paso.</li>
        <li>Pégalo en <strong>Claude</strong> (con el conector de <strong>Magnific</strong> activo y tu skill de copy). Antes de crear nada te enseñará el plan y el coste en créditos.</li>
        <li>Sube los creativos a Meta con el <strong>mismo nombre</strong> que les ponga Claude: así, en el próximo lanzamiento, el dashboard sabrá cuáles ganan.</li>
      </ol>
      ${avisoMarcaHtml(pgc.marca)}
    </section>
    <section class="card">
      <h3>👑 Anuncios ganadores en los que se basan</h3>
      ${top.length ? `<p class="muted small">Según ${esc(g.origen)} (por ventas y, si no hay, por leads). Entran en todos los prompts.</p>
        <div class="table-scroll"><table class="metric-table"><thead><tr><th>Anuncio</th><th class="num">Leads</th><th class="num">Ventas</th><th class="num">Conversión</th><th class="num">ROAS</th></tr></thead><tbody>
        ${top.map((r) => `<tr><td><strong>${esc(r.label)}</strong></td><td class="num">${r.leads}</td><td class="num">${r.compras}</td><td class="num">${pctE(r.conversion)}</td><td class="num">${r.roas != null ? `${r.roas.toFixed(1).replace('.', ',')}x` : '–'}</td></tr>`).join('')}
        </tbody></table></div>`
        : '<p class="muted">Aún no hay datos de anuncios ganadores (hacen falta registros con las UTM de Meta). Los prompts se basan en la <strong>ficha de marca, avatar y producto</strong> y proponen ángulos nuevos para testear.</p>'}
      ${conHist ? `<p><button type="button" class="btn small" id="an-hist">${state.hist.datos && state.hist.embudo === state.embudo ? '↻ Volver a cargar' : '📚 Usar los ganadores de todos los lanzamientos'}</button> <span class="muted small">Carga los leads de cada lanzamiento del embudo (tarda un poco).</span></p>` : ''}
      ${['lanz', 'vsl'].includes(tipoActual()) ? `<label class="field"><span>¿Cómo llamamos al evento gratuito en los anuncios? <small>(nunca «webinar»${formatoAnuncios().id ? `; formato: ${esc(FORMATOS[formatoAnuncios().id].label)}` : ''}; si lo dejas vacío, Claude te lo preguntará con opciones para este formato)</small></span>
        <input id="an-evento" list="an-eventos" maxlength="60" placeholder="Ej.: ${esc(nombresEvento(formatoAnuncios().id || 'webinar')[0])}" value="${esc(ls.get(eventoAnKey()) || '')}">
        <datalist id="an-eventos">${nombresEvento(formatoAnuncios().id || 'webinar').map((x) => `<option value="${esc(x)}">`).join('')}</datalist></label>` : ''}
      <label class="field"><span>Notas sobre lo que ha funcionado <small>(opcional, entran en los prompts: qué decía el anuncio ganador, formato, gancho, quién sale…)</small></span><textarea id="an-notas" rows="2" placeholder="Ej.: el que más vende es un vídeo de Laura a cámara contando su historia; los carruseles no funcionan…">${esc(ls.get(notasAnKey()) || '')}</textarea></label>
    </section>
    ${objetivosDe(c.tipo).map((o) => `<section class="card an-obj">
      <h3>${o.icono} ${esc(o.titulo)}</h3>
      <p class="small">${esc(o.meta)}</p>
      <p class="muted small">Para: ${esc(o.publico)}</p>
      <div class="an-btns">${PROMPTS_ANUNCIOS.map((p) => `<button type="button" class="btn${p.id === 'todo' ? ' primary' : ''}" data-an-copiar="${o.id}:${p.id}" title="${esc(p.desc)}">${p.icono} ${esc(p.titulo)}</button>`).join('')}</div>
      <details><summary class="small">Ver el prompt «Todo en uno»</summary><pre class="snippet pg-prompt" data-an-prompt="${o.id}"></pre></details>
    </section>`).join('')}`;
}
$('#anuncios-body').addEventListener('toggle', (e) => {
  const pre = e.target.querySelector?.('[data-an-prompt]');
  if (!e.target.open || !pre || !e.target.contains(pre)) return;
  const c = contextoPaginas();
  const o = objetivosDe(c.tipo).find((x) => x.id === pre.dataset.anPrompt);
  if (o) pre.textContent = PROMPTS_ANUNCIOS[0].fn(ctxAnuncio(c, o));
}, true);
$('#anuncios-body').addEventListener('input', (e) => {
  if (e.target.id === 'an-notas') ls.set(notasAnKey(), e.target.value);
  if (e.target.id === 'an-evento') ls.set(eventoAnKey(), e.target.value);
});
$('#anuncios-body').addEventListener('click', async (e) => {
  if (e.target.closest('#an-hist')) {
    const b = e.target.closest('#an-hist');
    b.disabled = true; b.textContent = 'Cargando…';
    try { await cargarDatosHistorico(); } catch (err) { notice(err.message, true); }
    renderAnuncios();
    return;
  }
  const b = e.target.closest('[data-an-copiar]');
  if (!b) return;
  const [oid, pid] = b.dataset.anCopiar.split(':');
  const c = contextoPaginas();
  const o = objetivosDe(c.tipo).find((x) => x.id === oid);
  const p = PROMPTS_ANUNCIOS.find((x) => x.id === pid);
  if (!o || !p) return;
  const txt = p.fn(ctxAnuncio(c, o));
  const txtOriginal = b.textContent;
  try {
    await navigator.clipboard.writeText(txt);
    b.textContent = 'Copiado ✓ · pégalo en Claude';
  } catch {
    const pre = b.closest('.an-obj').querySelector('[data-an-prompt]');
    pre.textContent = txt;
    pre.closest('details').open = true;
    b.textContent = 'Cópialo de «Ver el prompt»';
  }
  setTimeout(() => { b.textContent = txtOriginal; }, 2500);
});

// ---------- 🧱 Páginas del embudo con IA (Plan → Páginas) ----------
// Por cada página, un prompt para Claude con la marca y el avatar, el estilo, los datos del embudo y los
// códigos del dashboard; el HTML que devuelve se pega en un elemento «Código personalizado» de GHL.
const pgc = { marca: null };
const notasPagKey = (id) => `lsd_pag_notas_${state.cliente || ''}_${state.embudo}_${id}`;
const eurTxt = (n) => (Number(n) > 0 ? eur(Number(n)) : '');
// Lo de cada tipo de embudo: { tipo, nombre, datos, codigos, urls, opts } o { falta: 'texto' }.
function contextoPaginas() {
  const t = tipoActual();
  const script = `<script src="${location.origin}/tracker.js${cParam()}" defer></script>`;
  const marca = clienteNombre();
  const producto = nombreProducto(state.config);
  if (t === 'lanz') {
    const emb = state.config.launches[state.launchCode];
    if (!emb) return { falta: 'Elige o crea un lanzamiento: las páginas usan sus fechas, precios y códigos.' };
    return { tipo: 'lanzamientos', nombre: emb.name, datos: datosEmbudo(emb, { producto, marca }), codigos: snippetsLanzamiento(state.launchCode), ctx: { script },
      urls: { 'Página preclase': emb.recursosUrl, 'Página de acceso (login)': emb.loginUrl, 'Página de pago': emb.paginaPagoUrl, 'Grupo de WhatsApp': emb.whatsappUrl } };
  }
  if (t === 'meteorico') {
    const code = state.meteo.code;
    const m = state.config.meteoricos?.[code];
    if (!m) return { falta: 'Elige o crea un meteórico.' };
    const qs = [`m=${encodeURIComponent(code)}`, cParam('').replace(/^\?/, '')].filter(Boolean).join('&');
    return { tipo: 'meteorico', nombre: m.name, datos: datosEmbudo(m, { esMeteo: true, producto, marca }),
      codigos: [['OFERTA · bloque de la página (cuenta atrás, botón de compra y visitas)', `<div data-lsd-oferta></div>\n<script src="${location.origin}/oferta.js?${qs}" defer></script>`]],
      urls: { 'Pago de la oferta': m.pagoUrl, 'Página de la oferta': m.ofertaUrl, 'Grupo de WhatsApp': m.whatsappUrl } };
  }
  if (t === 'vsl') {
    const v = vslCfg();
    const st = SUBTIPOS_VSL[subtipoValido(v.subtipo)];
    const datos = [`- Embudo: ${st.label} «${v.name}»${marca ? ` (${marca})` : ''}.`, `- Producto: ${producto}${eurTxt(v.precioPrograma) ? ` · precio ${eurTxt(v.precioPrograma)}` : ''}${eurTxt(v.precioFraccionado) ? ` · a plazos ${eurTxt(v.precioFraccionado)}` : ''}.`,
      `- Contenido: ${st.contenido}. Botones: «${v.textoCompra}»${st.sinLlamadas ? '' : ` y «${v.textoLlamada}»`}${v.botonSegundos ? ` (aparecen a los ${v.botonSegundos} s del vídeo)` : ''}.`];
    return { tipo: 'vsl', nombre: v.name, datos, codigos: snippetsVsl(state.embudo), opts: { sinLlamadas: st.sinLlamadas },
      urls: { [st.pagina]: v.vslUrl, 'Compra': v.ventaUrl, 'Agendar llamada': st.sinLlamadas ? '' : v.llamadaUrl } };
  }
  const d = state.config.directas?.[state.embudo];
  if (!d) return { falta: 'Configura primero el embudo (⚙️).' };
  const extra = (o, tipo) => `- ${tipo}: ${o.nombre}${eurTxt(o.precio) ? ` · ${eurTxt(o.precio)}` : ''}.`;
  const datos = [`- Producto de entrada: «${d.name}»${eurTxt(d.precio) ? ` · ${eurTxt(d.precio)}` : ''}${marca ? ` (${marca})` : ''}.`,
    ...(d.partes?.bumps ? (d.bumps || []).filter((o) => o.activo !== false).map((o) => extra(o, 'Bump offer en el checkout')) : []),
    ...(d.partes?.upsell ? (d.upsells || []).map((o) => extra(o, 'Upsell')) : []),
    ...(d.partes?.downsell ? (d.downsells || []).map((o) => extra(o, 'Downsell')) : [])];
  const codigos = PAGINAS_DIRECTA.filter((x) => !x.parte || d.partes?.[x.parte]).map((x) => [x.label, `<div data-lsd-directa="${x.id}" data-embudo="${state.embudo}"></div>\n${script}`]);
  return { tipo: 'directa', nombre: d.name, datos, codigos, opts: { partes: d.partes }, urls: { 'Página de venta': d.ventaUrl } };
}
function promptDePagina(c, p) {
  return promptPagina({ pagina: p, nombreEmbudo: c.nombre, marca: clienteNombre(), datos: c.datos, contexto: contextoMarca(pgc.marca?.m, pgc.marca?.producto),
    diseno: disenoTexto(pgc.marca?.m), codigos: codigosDePagina(p, c.codigos, c.ctx), notas: (ls.get(notasPagKey(p.id)) || '').trim(), urls: c.urls || {} });
}
async function renderPaginas() {
  const box = $('#paginas-body');
  const c = contextoPaginas();
  if (c.falta) { box.innerHTML = `<div class="card empty"><p class="muted">${esc(c.falta)}</p></div>`; return; }
  const embudo = state.embudo;
  pgc.marca = await marcaDeEmbudo(api, state.cliente, embudo);
  if (state.embudo !== embudo) return;
  const paginas = paginasDe(c.tipo, c.opts || {});
  box.innerHTML = `<section class="card">
      <h2>🧱 Páginas de «${esc(c.nombre)}» con IA</h2>
      <ol class="small pg-pasos">
        <li><strong>Copia el prompt</strong> de la página y pégalo en <strong>Claude</strong> (con tu skill de copy si la tienes). Ya lleva la marca, el avatar, los datos del embudo y los códigos del dashboard.</li>
        <li>Pide los cambios que quieras en la misma conversación hasta que te guste.</li>
        <li>En <strong>GHL</strong>: crea la página (en blanco, ancho completo) → añade un elemento <strong>«Código personalizado»</strong> (Custom HTML/JS) → pega el código → guarda y publica. Si es de registro o de pago, mete el formulario de GHL donde indica el comentario.</li>
        <li>Pon la URL de la página publicada en la configuración del embudo (si no estaba) y haz una prueba.</li>
      </ol>
      ${avisoMarcaHtml(pgc.marca)}
    </section>
    ${paginas.map((p) => `<details class="card pg-pag" data-pag="${esc(p.id)}">
      <summary><strong>${esc(p.nombre)}</strong><span class="muted small">${esc(p.objetivo)}</span></summary>
      <div class="pg-cuerpo">
        <p class="small"><strong>Lleva:</strong> ${esc(p.secciones.join(' · '))}</p>
        <p class="small muted">${codigosDePagina(p, c.codigos, c.ctx).length} código${codigosDePagina(p, c.codigos, c.ctx).length === 1 ? '' : 's'} del dashboard incluidos en el prompt.</p>
        <label class="field"><span>Indicaciones para esta página <small>(opcional, entran en el prompt: ángulo, oferta especial, referencia…)</small></span><textarea rows="2" data-pag-notas="${esc(p.id)}" placeholder="Ej.: más corta; empieza con un testimonio; ángulo del cansancio de las noches…">${esc(ls.get(notasPagKey(p.id)) || '')}</textarea></label>
        <p><button type="button" class="btn primary" data-pag-copiar="${esc(p.id)}">📋 Copiar el prompt</button></p>
        <details><summary class="small">Ver el prompt</summary><pre class="snippet pg-prompt" data-pag-prompt="${esc(p.id)}"></pre></details>
      </div>
    </details>`).join('')}`;
}
$('#paginas-body').addEventListener('toggle', (e) => {
  const pre = e.target.querySelector?.('[data-pag-prompt]');
  if (!e.target.open || !pre || !e.target.contains(pre)) return;
  const c = contextoPaginas();
  const p = paginasDe(c.tipo, c.opts || {}).find((x) => x.id === pre.dataset.pagPrompt);
  if (p) pre.textContent = promptDePagina(c, p);
}, true);
$('#paginas-body').addEventListener('input', (e) => {
  const t = e.target.closest('[data-pag-notas]');
  if (t) ls.set(notasPagKey(t.dataset.pagNotas), t.value);
});
$('#paginas-body').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-pag-copiar]');
  if (!b) return;
  const c = contextoPaginas();
  const p = paginasDe(c.tipo, c.opts || {}).find((x) => x.id === b.dataset.pagCopiar);
  if (!p) return;
  const txt = promptDePagina(c, p);
  const pre = b.closest('.pg-cuerpo').querySelector('[data-pag-prompt]');
  pre.textContent = txt;
  try {
    await navigator.clipboard.writeText(txt);
    b.textContent = 'Copiado ✓ · pégalo en Claude';
  } catch {
    pre.closest('details').open = true;
    b.textContent = 'Cópialo de «Ver el prompt»';
  }
  setTimeout(() => { b.textContent = '📋 Copiar el prompt'; }, 3000);
});

// Qué lleva el prompt de la marca del cliente (Cuenta → Marca y avatar).
function avisoMarcaHtml(mp) {
  const btn = puedeConfig() ? ' <button type="button" class="btn small" data-abrir-marca>Abrir Marca y avatar</button>' : '';
  if (!mp?.m || !contextoMarca(mp.m, mp.producto)) return `<div class="notice warn">🎨 Aún no hay cuestionario de marca: rellénalo (o manda el enlace al cliente) para que todo salga con su voz y para su cliente ideal.${btn}</div>`;
  const nombre = mp.producto ? nombreDeProducto(mp.producto) : '';
  return mp.producto?.ficha
    ? `<p class="muted small">🎨 Lleva la <strong>ficha de marca y avatar</strong>${nombre ? ` de «${esc(nombre)}»` : ''}.</p>`
    : `<p class="muted small">🎨 Lleva las respuestas del cuestionario de marca${nombre ? ` y de «${esc(nombre)}»` : ''}. Saldrá mejor con la ficha hecha (Marca y avatar → el producto → Ficha).${btn}</p>`;
}
function gwFila(m, editable) {
  const tp = tipoMsg(m.tipo);
  const fijo = !editable || m.estado === 'programado' || m.estado === 'cancelado';
  const falta = m.estado === 'borrador' || m.estado === 'error' ? faltaMensaje(m) : [];
  const t = madridToEpoch(m.at);
  const enviado = m.estado === 'programado' && t != null && t < Date.now();
  const badge = m.estado === 'programado' ? (enviado ? '<span class="badge tone-buy">✓ Enviado</span>' : '<span class="badge tone-info">⏰ Programado</span>') : m.estado === 'cancelado' ? '<span class="badge">Cancelado</span>' : m.estado === 'error' ? '<span class="badge tone-warn">Error</span>' : falta.length ? '<span class="badge tone-warn">Falta algo</span>' : '<span class="badge">Listo</span>';
  const dis = fijo ? ' disabled' : '';
  return `<div class="gw-msg${fijo ? ' fijo' : ''}" data-gw="${esc(m.id)}">
    <div class="gw-cab">
      <input type="datetime-local" class="gw-at" value="${esc(m.at)}"${dis}>
      <select class="gw-tipo"${dis}>${TIPOS_MSG.map((x) => `<option value="${x.id}"${x.id === m.tipo ? ' selected' : ''}>${x.ico} ${esc(x.label)}</option>`).join('')}</select>
      ${['texto', 'imagen', 'video'].includes(m.tipo) ? `<label class="chk small"><input type="checkbox" class="gw-menc"${m.mencionar ? ' checked' : ''}${dis}> Mencionar a todo el grupo</label>` : ''}
      ${badge}
      ${!fijo ? '<button type="button" class="btn ghost small gw-borrar" aria-label="Quitar">✕</button>' : ''}
      ${editable && m.estado === 'programado' && !enviado ? '<button type="button" class="btn ghost small gw-cancelar">Cancelar</button>' : ''}
      ${m.estado === 'programado' && enviado && m.tipo === 'encuesta' ? '<button type="button" class="btn ghost small gw-votos">Ver votos</button>' : ''}
    </div>
    ${m.tipo === 'encuesta' ? `<label class="field"><span>Pregunta</span><input class="gw-preg" maxlength="255" value="${esc(m.encuesta?.pregunta || '')}"${dis}></label>
      <label class="field"><span>Opciones <small>(una por línea; de 2 a 12)</small></span><textarea class="gw-opc" rows="${Math.max(2, (m.encuesta?.opciones || []).length)}"${dis}>${esc((m.encuesta?.opciones || []).join('\n'))}</textarea></label>
      <label class="chk small"><input type="checkbox" class="gw-multi"${m.encuesta?.multiple ? ' checked' : ''}${dis}> Se puede marcar más de una</label><div class="gw-votos-res"></div>`
    : `${tp.archivo ? `<label class="field"><span>Enlace del archivo <small>(${esc(GUIA_ARCHIVOS.find((g) => g.tipo === m.tipo)?.formato || '')}, público, menos de 16 MB)</small></span><input type="url" class="gw-url" value="${esc(m.url)}" placeholder="https://…"${dis}></label>` : ''}
      ${m.tipo === 'documento' ? `<label class="field"><span>Nombre del archivo</span><input class="gw-nombre" value="${esc(m.nombreArchivo)}"${dis}></label>` : ''}
      ${m.guion ? `<details class="gw-guion"><summary class="small">🎬 Guion para grabarlo</summary><pre>${esc(m.guion)}</pre></details>` : ''}
      ${m.tipo === 'audio' || m.tipo === 'nota' ? '' : `<label class="field"><span>${m.tipo === 'texto' ? 'Texto' : 'Texto que lo acompaña'}</span><textarea class="gw-texto" rows="${Math.min(8, Math.max(2, (m.texto || '').split('\n').length))}"${dis}>${esc(m.texto)}</textarea></label>`}`}
    ${falta.length ? `<p class="small gw-falta">Falta: ${esc(falta.join(', '))}.</p>` : ''}
    ${(() => { const d = m.estado !== 'cancelado' ? faltaEnlaceDirecto(m, gwDirectos()) : null; return d ? `<p class="small gw-falta">📅 Es el día del directo: este mensaje debería llevar el enlace de acceso <code>${esc(d.url)}</code>${!fijo ? ` <button type="button" class="btn ghost small" data-copy-text="${esc(d.url)}">Copiar enlace</button>` : ''}</p>` : ''; })()}
    ${m.estado === 'error' && m.error ? `<p class="small error">${esc(m.error)}</p>` : ''}
  </div>`;
}
// Lo editado en la lista → gwc.mensajes.
function gwLeer(fila) {
  const m = gwc.mensajes.find((x) => x.id === fila.dataset.gw);
  if (!m || fila.classList.contains('fijo')) return;
  const v = (sel) => $(sel, fila)?.value ?? '';
  m.at = v('.gw-at');
  m.tipo = v('.gw-tipo') || m.tipo;
  m.mencionar = Boolean($('.gw-menc', fila)?.checked);
  if ($('.gw-preg', fila)) m.encuesta = { pregunta: v('.gw-preg').trim(), opciones: v('.gw-opc').split('\n').map((x) => x.trim()).filter(Boolean), multiple: Boolean($('.gw-multi', fila)?.checked) };
  if ($('.gw-url', fila)) m.url = v('.gw-url').trim();
  if ($('.gw-nombre', fila)) m.nombreArchivo = v('.gw-nombre').trim();
  if ($('.gw-texto', fila)) m.texto = v('.gw-texto');
  if (m.estado === 'error') m.estado = 'borrador';
  gwc.cambios = true;
  $('#gw-guardar')?.removeAttribute('disabled');
}
$('#grupowa-body').addEventListener('change', (e) => {
  if (e.target.id === 'gw-desde' || e.target.id === 'gw-hasta' || e.target.id === 'gw-temario') {
    if (e.target.id === 'gw-temario') ls.set(temarioKey(), e.target.value);
    const pre = $('#gw-prompt'); if (pre) pre.textContent = gwPrompt(); return;
  }
  const fila = e.target.closest('[data-gw]');
  if (!fila) return;
  gwLeer(fila);
  if (e.target.classList.contains('gw-tipo')) { const m = gwc.mensajes.find((x) => x.id === fila.dataset.gw); if (m?.tipo === 'encuesta' && !m.encuesta) m.encuesta = { pregunta: m.texto || '', opciones: [], multiple: false }; renderGrupoWa(); }
});
$('#grupowa-body').addEventListener('input', (e) => { const fila = e.target.closest('[data-gw]'); if (fila && !e.target.classList.contains('gw-tipo')) gwLeer(fila); });
async function gwGuardar() {
  const d = await api('/api/sendflow', { method: 'POST', body: { op: 'calentamiento-guardar', l: gwc.code, mensajes: gwc.mensajes.filter((m) => m.estado !== 'programado' && m.estado !== 'cancelado') } });
  gwc.mensajes = d.mensajes;
  gwc.cambios = false;
}
$('#grupowa-body').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const fila = b.closest('[data-gw]');
  const st = (t) => { if ($('#gw-st')) $('#gw-st').textContent = t; };
  try {
    if (b.id === 'gw-copiar') {
      await navigator.clipboard.writeText(gwPrompt());
      b.textContent = '✓ Copiado: pégalo en Claude';
      setTimeout(() => { b.textContent = '📋 Copiar el prompt'; }, 2500);
    } else if (b.id === 'gw-anadir') {
      const nuevos = parsearSecuencia($('#gw-pegar').value);
      if (!nuevos.length) { $('#gw-anadir-st').textContent = 'No encuentro mensajes: cada uno empieza por «### AAAA-MM-DD HH:MM | tipo» (como en el prompt).'; return; }
      gwc.mensajes = [...gwc.mensajes, ...nuevos.map((m) => ({ ...m, estado: 'borrador' }))];
      await gwGuardar();
      $('#gw-pegar').value = '';
      await renderGrupoWa();
      $('#gw-anadir-st') && ($('#gw-anadir-st').textContent = `${nuevos.length} mensajes añadidos ✓ Revísalos abajo.`);
    } else if (b.dataset.gwAdd) {
      // Mensaje nuevo del tipo elegido, a continuación del último (1 h después) o mañana a las 10:00.
      const ult = gwc.mensajes.map((m) => madridToEpoch(m.at)).filter((t) => t != null).sort((a, c) => a - c).at(-1);
      const base = ult && ult > Date.now() ? ult + 3_600_000 : null;
      const at = base ? new Date(base).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 16).replace(' ', 'T') : `${addDay(hoyLocal(), 1)}T10:00`;
      const tipo = b.dataset.gwAdd;
      const id = nuevoIdMsg();
      gwc.mensajes.push({ ...sanitizeMensaje({ id, tipo, at, ...(tipo === 'encuesta' ? { encuesta: { pregunta: '', opciones: [], multiple: false } } : {}) }), estado: 'borrador' });
      gwc.cambios = true;
      await renderGrupoWa();
      const fila = $(`[data-gw="${id}"]`);
      fila?.scrollIntoView({ block: 'center' });
      $('.gw-preg, .gw-texto, .gw-url', fila)?.focus();
    } else if (b.id === 'gw-guardar') {
      st('Guardando…'); await gwGuardar(); await renderGrupoWa(); st('Guardado ✓');
    } else if (b.id === 'gw-programar') {
      if (gwc.cambios) await gwGuardar();
      const listos = gwc.mensajes.filter((m) => (m.estado === 'borrador' || m.estado === 'error') && !faltaMensaje(m).length);
      if (!listos.length) return;
      const ts = listos.map((m) => madridToEpoch(m.at)).sort((a, c) => a - c);
      const f = (t) => new Date(t).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      const tipos = Object.entries(listos.reduce((o, m) => ({ ...o, [m.tipo]: (o[m.tipo] || 0) + 1 }), {})).map(([k, n]) => `${n} ${tipoMsg(k).label.toLowerCase()}`).join(', ');
      const faltan = gwc.mensajes.filter((m) => (m.estado === 'borrador' || m.estado === 'error') && faltaMensaje(m).length).length;
      if (!window.confirm(`¿Programar ${listos.length} mensajes en SendFlow?\n\n${tipos}\nDel ${f(ts[0])} al ${f(ts.at(-1))}, a todos los grupos de la campaña.${faltan ? `\n\n(${faltan} no se programan porque les falta algo.)` : ''}\n\nUna vez programados, solo se pueden cancelar (no editar).`)) return;
      b.disabled = true;
      let hechos = 0;
      for (;;) {
        st(`Programando… ${hechos} de ${listos.length} (con pausas, para no pasarse del límite de SendFlow)`);
        const ids = gwc.mensajes.filter((m) => (m.estado === 'borrador' || m.estado === 'error') && !faltaMensaje(m).length && listos.some((x) => x.id === m.id)).map((m) => m.id);
        if (!ids.length) break;
        const d = await api('/api/sendflow', { method: 'POST', body: { op: 'programar', l: gwc.code, ids } });
        gwc.mensajes = d.mensajes;
        hechos += d.programados;
        if (d.frenado) { st(d.frenado); break; }
        if (!d.programados || !d.pendientes) break;
      }
      await renderGrupoWa();
      const errores = gwc.mensajes.filter((m) => m.estado === 'error').length;
      st(`${hechos} programados en SendFlow ✓${errores ? ` · ${errores} con error (míralos abajo)` : ''}`);
    } else if (fila && b.classList.contains('gw-borrar')) {
      gwc.mensajes = gwc.mensajes.filter((m) => m.id !== fila.dataset.gw);
      gwc.cambios = true;
      await renderGrupoWa();
    } else if (fila && b.classList.contains('gw-cancelar')) {
      if (!window.confirm('¿Cancelar este mensaje en SendFlow? No se enviará.')) return;
      try {
        gwc.mensajes = (await api('/api/sendflow', { method: 'POST', body: { op: 'cancelar', l: gwc.code, id: fila.dataset.gw } })).mensajes;
      } catch (err) {
        if (window.confirm(`${err.message}\n\n¿Ya lo has cancelado en SendFlow? Pulsa Aceptar para marcarlo como cancelado aquí.`)) gwc.mensajes = (await api('/api/sendflow', { method: 'POST', body: { op: 'marcar-cancelado', l: gwc.code, id: fila.dataset.gw } })).mensajes;
      }
      await renderGrupoWa();
    } else if (fila && b.classList.contains('gw-votos')) {
      const r = await api(`/api/sendflow?op=votos&l=${encodeURIComponent(gwc.code)}&id=${encodeURIComponent(fila.dataset.gw)}`);
      $('.gw-votos-res', fila).innerHTML = `<p class="small"><strong>${r.total} votos</strong></p><ul class="small">${r.votos.map((v) => `<li>${esc(v.opcion)}: <strong>${v.n}</strong> (${pctOf(v.n, r.total)})</li>`).join('')}</ul>`;
    }
  } catch (err) {
    st(err.message);
    if (!$('#gw-st')) notice(err.message, true);
    b.disabled = false;
  }
});
