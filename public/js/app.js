import {
  ESTADOS, NEXT_STEPS, buildMessage, tagFor, LAUNCH_CODE_RE, THRESHOLDS, watched, SNAPSHOT_TAGS, OUTCOMES, dayInMadrid,
} from './scoring.js';
import { icon } from './icons.js';
import { ENCUESTA_PREGUNTAS } from './encuesta.js';
import { enrichLead, computeMetrics, bySource, rankingGanadores, ventasPorDia, porRespuesta, avisosLanzamiento, perfilesCompradoras, describirAvatar, avatarDeLead } from './metrics.js';
import { PHASES, LINK_KEYS, phaseAt, barFor, formatLong } from './page.js';
import { FASES, puedeMarcar, esMia, vencida, addDays, vencidasEquipo, SUBS_PREPARACION, subDe, columnaDe, COLUMNA_HECHAS, COLOR_COLUMNAS } from './tareas.js';
import { hitosLanzamiento, fasesLanzamiento, EVENTO_TIPOS } from './calendario.js';
import { RESULTADOS, MOTIVOS, metricasLlamadas } from './llamadas.js';
import { sanitizeRich, richToHtml, richToText, richTieneVideo, richTieneEnlace, videoEmbed, safeHref } from './richtext.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const PAGE_SIZE = 100;

const state = {
  role: null,
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
  leads: [],
  filters: { search: '', estado: '', step: '', signal: '', pending: false },
  sort: { key: 'score', dir: 'desc' },
  page: 0,
  loadToken: 0,
};

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};
if (ls.get('lsd_tareas_vista') === 'tablero') state.tVista = 'tablero';

// ---------- API ----------
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
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
  if (dialog?.open) $('#cfg-status').textContent = label;
}

// ---------- Login ----------
function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login-password').focus();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#login-error');
  err.hidden = true;
  try {
    await api('/api/login', { method: 'POST', body: { email: $('#login-email').value.trim(), password: $('#login-password').value } });
    $('#login-password').value = '';
    await start();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

$('#btn-logout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  state.leads = [];
  state.tareas = null;
  showLogin();
});

// ---------- Arranque ----------
const ROLE_LABEL = { admin: 'Admin', tecnico: 'Técnico', setter: 'Setter', equipo: 'Equipo' };
// Roles que se ofrecen al asignar (equipo es un rol antiguo que ya no se usa).
const ROLES_UI = ['admin', 'tecnico', 'setter'];
const puedeConfig = () => state.role === 'admin' || state.role === 'tecnico';
// Pestañas que ve cada rol (el servidor también impide al equipo leer leads y métricas).
const ROLE_VIEWS = {
  admin: null,
  tecnico: ['hoy', 'llamadas', 'leads', 'metricas', 'objetivos', 'avatar', 'tareas', 'calendario'],
  setter: ['hoy', 'llamadas', 'leads', 'tareas', 'calendario'],
  equipo: ['tareas', 'calendario'],
};
const allowedViews = () => ROLE_VIEWS[state.role] || VIEWS;

async function start() {
  const [me, { role, config, zoomConfigured }] = await Promise.all([api('/api/me'), api('/api/config')]);
  state.role = role;
  state.user = me.user || null;
  state.config = config;
  state.zoomConfigured = zoomConfigured;
  document.body.classList.toggle('is-admin', role === 'admin');
  document.body.classList.toggle('can-config', role === 'admin' || role === 'tecnico');
  document.body.classList.toggle('is-equipo', role === 'equipo');
  $('#role-badge').textContent = state.user ? `${state.user.nombre.split(' ')[0]} · ${ROLE_LABEL[role]}` : ROLE_LABEL[role] || role;
  $('#btn-cuenta').hidden = !state.user;
  $('#login').hidden = true;
  $('#app').hidden = false;
  $$('.view-tab').forEach((t) => { t.hidden = !allowedViews().includes(t.dataset.view); });
  const hash = window.location.hash.slice(1);
  const wanted = VIEWS.includes(hash) ? hash : ls.get('lsd_view');
  showView(allowedViews().includes(wanted) ? wanted : allowedViews().includes('leads') ? 'leads' : allowedViews()[0]);
  fillStaticSelects();
  renderLaunchSelect();
  if (role === 'admin' || role === 'tecnico') api('/api/tags').then((d) => { state.tags = d.tags; fillTagList(); }).catch((e) => notice(e.message, true));
  await selectLaunch(pickInitialLaunch());
  if (!$('#view-comparar').hidden) renderCompareSelector();
}

function launchesSorted() {
  return Object.entries(state.config.launches)
    .sort((a, b) => String(b[1].createdAt).localeCompare(String(a[1].createdAt)));
}

function pickInitialLaunch() {
  const saved = ls.get('lsd_launch');
  if (saved && state.config.launches[saved]) return saved;
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
$('#btn-reload').addEventListener('click', () => selectLaunch(state.launchCode));

async function selectLaunch(code) {
  state.launchCode = code;
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
  if (state.role !== 'equipo') loadLlamadas();
  if (state.role !== 'equipo') await loadLeads();
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
  try {
    do {
      const qs = new URLSearchParams({ tag: launch.registroTag });
      if (cursor) qs.set('cursor', JSON.stringify(cursor));
      const page = await api(`/api/leads?${qs}`);
      if (token !== state.loadToken) return; // se cambió de lanzamiento mientras cargaba
      out.push(...page.contacts);
      total = page.total ?? total;
      cursor = page.cursor;
      progress(out.length, total, `Cargando leads… ${out.length}${total ? ` de ${total}` : ''}`);
    } while (cursor);
    state.leads = out.map((c) => enrich(c));
    state.page = 0;
    render();
    loadMeta(token);
    if (!out.length) notice(`No hay contactos con la etiqueta "${launch.registroTag}".`);
  } catch (e) {
    notice(`No se pudieron cargar los leads: ${e.message}`, true);
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
    if (f.signal === 'sin_actividad') return l.score === 0 && !l.s.directo_click;
    if (f.signal === 'no_compra') return !l.s.compra;
    if (f.signal === 'sin_encuesta') return !l.s.encuesta;
    if (f.signal.startsWith('res_')) return l.outcome === f.signal.slice(4);
    if (f.signal === 'sin_resultado') return l.s.wa_enviado && !l.outcome;
    if (f.signal === 'vip_no_compra') return l.s.vip && !l.s.compra;
    if (f.signal === 'trafico_frio') return l.s.trafico === 'frio';
    if (f.signal === 'trafico_templado') return l.s.trafico === 'templado';
    if (f.signal === 'sin_clases') return !watched(l.s, 'clase1') && !watched(l.s, 'clase2');
    if (f.signal === 'replay_50') return watched(l.s, 'replay') >= 50;
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
function render() {
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
    || '<tr><td colspan="10" class="muted">No hay leads con estos filtros.</td></tr>';
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

const VIDEO_LABELS = { clase1: 'Clase 1', clase2: 'Clase 2', replay: 'Grabación' };

// Cuántos leads han visto cada vídeo al menos un 25 / 50 / 75 / 90 %.
function renderConsumo() {
  const L = state.leads;
  const pct = (n) => (L.length ? Math.round((n / L.length) * 100) : 0);
  const rows = Object.entries(VIDEO_LABELS).map(([v, label]) => {
    const counts = THRESHOLDS.map((t) => L.filter((l) => watched(l.s, v) >= t).length);
    return `<tr><th scope="row">${label}</th>${counts.map((n) => `
      <td><div class="meter" title="${n} leads (${pct(n)}%)"><span style="width:${pct(n)}%"></span></div>
      <span class="meter-num">${n}</span> <span class="muted">${pct(n)}%</span></td>`).join('')}</tr>`;
  }).join('');
  $('#consumo').innerHTML = `
    <h2>Consumo de vídeos <span class="muted">· leads que han visto al menos…</span></h2>
    <div class="table-scroll"><table class="consumo">
      <thead><tr><th></th>${THRESHOLDS.map((t) => `<th>${t === 90 ? '90% (completo)' : `${t}%`}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
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

function renderMetrics() {
  const launch = state.config.launches[state.launchCode];
  const m = currentMetrics();
  m.launch = launch;
  const directoCard = launch.fechaDirecto && launch.compraDateField
    ? card('Ventas en directo', m.compraDirecto, `${pctOf(m.compraDirecto, m.compra)} de las ventas · ${pctOf(m.compraDirecto, m.live)} de los asistentes`, 'live', 'buy')
    : card('Ventas en directo', '–', 'Configura el día del directo y el campo de fecha de compra', 'live', 'buy');
  $('#metric-cards').innerHTML = [
    card('Registros', m.total, m.clientaAnterior || m.vipAnterior ? `${m.vipAnterior} VIP y ${m.clientaAnterior} clientas de lanzamientos anteriores` : 'leads del lanzamiento', 'users', 'accent'),
    ...(m.encuestaActiva ? [card('Encuesta rellenada', `${m.encuesta} <small class="muted">de ${m.total}</small>`, `${pctOf(m.encuesta, m.total)} de los registros`, 'survey', 'info')] : []),
    card('Entradas VIP', m.vip, `${pctOf(m.vip, m.total)} de los registros`, 'star', 'vip'),
    card('Asistencia al directo', m.live, `${pctOf(m.live, m.total)} de los registros · ${pctOf(m.vipLive, m.vip)} de las VIP`, 'live', 'live'),
    card('Compras totales', m.compra, `${pctOf(m.compra, m.total)} de los registros`, 'cart', 'buy'),
    card('Ventas de Raíces de VIP', `${m.compraVip} <small class="muted">de ${m.compra}</small>`, `${pctOf(m.compraVip, m.compra)} de las ventas · compra el ${pctOf(m.compraVip, m.vip)} de las VIP`, 'crown', 'vip'),
    card('Llamadas agendadas', `${m.llamada} <small class="muted">de ${m.total}</small>`, `${pctOf(m.llamada, m.total)} de los registros · ${pctOf(m.compraLlamada, m.llamada)} compran`, 'phone', 'info'),
    directoCard,
  ].join('');

  renderEconomics(m, launch);
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
    ['Empezaron la clase 1', m.clase1, '≥25% visto'],
    ['Empezaron la clase 2', m.clase2, '≥25% visto'],
    ['Compraron entrada VIP', m.vip],
    ['Pulsaron el enlace del directo', m.click],
    ['Asistieron al directo', m.live],
    ['Directo hasta el final', m.liveFinal],
    ['Vieron la grabación', m.replay, '≥25% visto'],
    ['Agendaron llamada', m.llamada, 'etiqueta de llamada o marcada por la setter'],
    ['Compraron', m.compra, '', 'buy'],
  ];
  $('#funnel').innerHTML = steps.map(([label, n, hint, cls]) => `
    <div class="funnel-row">
      <div class="funnel-label">${label}${hint ? `<small>${hint}</small>` : ''}</div>
      <div class="funnel-bar ${cls || ''}"><span style="width:${m.total ? (n / m.total) * 100 : 0}%"></span></div>
      <div class="funnel-num"><strong>${n}</strong> <span class="muted">${pctOf(n, m.total)}</span></div>
    </div>`).join('');

  const rows = [
    ['Todos los registrados', m.total, m.compra],
    ['Con entrada VIP', m.vip, m.compraVip],
    ['Sin entrada VIP', m.noVip, m.compraNoVip],
    ['Asistieron al directo', m.live, m.compraLive],
    ['Asistieron hasta el final', m.liveFinal, m.compraFinal],
    ['No fueron al directo, vieron la grabación', m.soloReplay, m.compraSoloReplay],
    ['Ni directo ni grabación', m.nada, m.compraNada],
    ['Agendaron llamada', m.llamada, m.compraLlamada],
  ];
  if (launch.fechaDirecto && launch.compraDateField) rows.splice(4, 0, ['Asistieron al directo y compraron ese mismo día', m.live, m.compraDirectoAsist]);
  renderTraffic(m);
  $('#conversion-table').innerHTML = `
    <thead><tr><th>Segmento</th><th class="num">Leads</th><th class="num">Compras</th><th class="num">Conversión</th></tr></thead>
    <tbody>${rows.map(([label, n, buy]) => `<tr><td>${label}</td><td class="num">${n}</td><td class="num">${buy}</td><td class="num big">${pctOf(buy, n)}</td></tr>`).join('')}</tbody>`;

  $('#estado-table').innerHTML = `
    <thead><tr><th>Estado</th><th class="num">Leads</th><th class="num">Compras</th><th class="num">Conversión</th></tr></thead>
    <tbody>${m.estados.map((e) => `<tr><td><span class="estado st-${e.id}"><span class="dot"></span>${e.label}</span></td><td class="num">${e.leads}</td><td class="num">${e.compras}</td><td class="num big">${pctOf(e.compras, e.leads)}</td></tr>`).join('')}</tbody>`;

  renderSources();
  renderSetterMetrics(m);
  renderLift(m);
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
  const box = $('#objetivos');
  if (!m.objetivos.length) {
    box.innerHTML = `<div class="card empty obj-empty">${icon('target', 'ico-xl')}<h2>Aún no hay objetivos para este lanzamiento</h2>
      <p class="muted">Pon metas de registros, entradas VIP, ventas y facturación y aquí verás cuánto llevas, cuánto falta y a qué ritmo hay que ir.</p>
      <button type="button" class="btn primary config-only" data-action="poner-objetivos">Poner objetivos</button></div>`;
    return;
  }
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
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-action="poner-objetivos"]')) return;
  openConfig(state.launchCode);
  goToField('cfg-obj-registros');
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
  state.avatar = perfilesCompradoras(leads, ENCUESTA_PREGUNTAS, objetivo);
  for (const l of state.leads) l.avatar = avatarDeLead(l, state.avatar.avatares, ENCUESTA_PREGUNTAS);
}
const avatarChip = (l) => (l.avatar >= 0
  ? `<span class="av-chip tone-${AV_TONES[l.avatar]}" title="${esc(describirAvatar(state.avatar.avatares[l.avatar].traits, ENCUESTA_PREGUNTAS))} Compra ${veces(state.avatar.avatares[l.avatar].indice)} respecto a la media.">${icon('users')} Avatar ${l.avatar + 1}</span>`
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
          <p class="av-frase">${esc(describirAvatar(a.traits, ENCUESTA_PREGUNTAS))}</p>
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
          <p class="av-frase">${esc(describirAvatar(r.anti.traits, ENCUESTA_PREGUNTAS))}</p>
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

  const tablas = ENCUESTA_PREGUNTAS.map((p) => {
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
    card('Facturación', hasPrices ? eur(e.facturacion) : '–', hasPrices ? `VIP ${eur(e.facturacionVip)} · Raíces ${eur(e.facturacionPrograma)}${launch.fraccionadoTag || launch.unicoTag ? ` (${m.compraUnico} único · ${m.compraFraccionado} fraccionado)` : ''}` : 'Añade los precios en Configuración', 'coins', 'money'),
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
}

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
  const box = $('#ganadores');
  const launch = state.config.launches[state.launchCode];
  const names = state.meta?.names || {};
  const spendBy = state.meta?.spendBy || {};
  const all = rankingGanadores(state.leads, launch, state.ganLevel, names, spendBy);
  const conVentas = all.filter((r) => r.compras > 0);
  $$('#gan-level .seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.gl === state.ganLevel));
  const que = { ad: 'anuncio', adset: 'conjunto', campaign: 'campaña' }[state.ganLevel];
  if (!all.length) {
    box.innerHTML = `<p class="muted">Ningún registro trae el ${que} en las UTM (utm_${{ ad: 'content', adset: 'term', campaign: 'campaign' }[state.ganLevel]}). Revisa que los anuncios de Meta lleven los parámetros de URL.</p>`;
    return;
  }
  if (!conVentas.length) {
    box.innerHTML = '<p class="muted">Todavía no hay ventas de Raíces atribuidas a anuncios en este lanzamiento. Aquí aparecerá el ranking en cuanto entren las primeras.</p>';
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
        <div class="gp-extra"><span>${r.leads} registros</span><span>${r.vip} VIP</span>${extra(r)}</div>
      </div>
    </article>`).join('');
  const hasSpend = conVentas.some((r) => r.spend);
  const resto = conVentas.slice(3);
  box.innerHTML = `<div class="gan-podios">${podio}</div>
    ${resto.length ? `<div class="table-scroll"><table class="metric-table gan-table">
      <thead><tr><th class="num">#</th><th>${que.charAt(0).toUpperCase() + que.slice(1)}</th><th>Ventas</th><th class="num">Conversión</th><th class="num">Registros</th><th class="num">VIP</th><th class="num">Facturado</th>${hasSpend ? '<th class="num">CAC</th><th class="num">ROAS</th>' : ''}</tr></thead>
      <tbody>${resto.map((r, i) => `<tr><td class="num">${i + 4}</td><td><strong>${esc(r.label)}</strong>${ruta(r) ? `<br><span class="muted">${ruta(r)}</span>` : ''}</td>
        <td><div class="gan-bar"><span style="width:${(r.compras / max) * 100}%"></span><b>${r.compras}</b></div></td>
        <td class="num">${(r.conversion * 100).toFixed(1)}%</td><td class="num">${r.leads}</td><td class="num">${r.vip}</td><td class="num">${r.ingresos ? eur(r.ingresos) : '–'}</td>
        ${hasSpend ? `<td class="num">${r.cac != null ? eur(r.cac) : '–'}</td><td class="num">${r.roas != null ? `${r.roas.toFixed(1)}x` : '–'}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : ''}
    <p class="muted gan-note">${all.length - conVentas.length ? `${all.length - conVentas.length} ${que}${all.length - conVentas.length === 1 ? '' : 's'} más con registros pero sin ventas todavía. ` : ''}Ventas = compras de Raíces de las personas que se registraron desde ese ${que} (UTM). Facturado incluye la entrada VIP.</p>`;
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
const VIEWS = ['hoy', 'llamadas', 'leads', 'metricas', 'objetivos', 'avatar', 'comparar', 'tareas', 'calendario'];
// Iconos de las pestañas y de las cabeceras de sección (data-icon en el HTML).
const VIEW_ICONS = { hoy: 'sun2', llamadas: 'phone', leads: 'users', metricas: 'trend', objetivos: 'target', avatar: 'crown', comparar: 'compare', tareas: 'list', calendario: 'calendar' };
$$('.view-tab').forEach((t) => t.insertAdjacentHTML('afterbegin', icon(VIEW_ICONS[t.dataset.view])));
$$('[data-tb-icon]').forEach((b) => b.insertAdjacentHTML('afterbegin', `<span class="tb-ico">${icon(b.dataset.tbIcon)}</span>`));
$$('[data-icon] > h2').forEach((h) => h.insertAdjacentHTML('afterbegin', `<span class="h-ico">${icon(h.parentElement.dataset.icon)}</span>`));
function showView(view) {
  if (state.role && !allowedViews().includes(view)) view = allowedViews()[0];
  $$('.view-tab').forEach((x) => x.classList.toggle('active', x.dataset.view === view));
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== view;
  ls.set('lsd_view', view);
  if (view === 'comparar' && state.config) renderCompareSelector();
  if (view === 'calendario' && state.config) renderCalendario();
  if (view === 'llamadas' && state.config) { if (state.llamadas?.code !== state.launchCode) loadLlamadas(); else renderLlamadas(); }
}
$$('.view-tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
showView(VIEWS.includes(ls.get('lsd_view')) ? ls.get('lsd_view') : 'leads');

const ESTADO_ICONS = { 'muy-caliente': 'flame', caliente: 'sun', templado: 'thermo', frio: 'snow' };

function renderKpis() {
  renderConsumo();
  const L = state.leads;
  const counts = Object.fromEntries(ESTADOS.map((e) => [e.id, 0]));
  let vip = 0; let live = 0; let replay = 0; let sent = 0;
  for (const l of L) {
    counts[l.estado.id]++;
    if (l.s.vip) vip++;
    if (l.s.directo_asistio) live++;
    if (watched(l.s, 'replay') >= 50) replay++;
    if (l.s.wa_enviado) sent++;
  }
  const pct = (n) => (L.length ? `${Math.round((n / L.length) * 100)}%` : '–');
  const f = state.filters.estado;
  $('#kpis').innerHTML = `
    <div class="kpi static tone-accent"><span class="kpi-label"><span class="kpi-ico">${icon('users')}</span>Leads registrados</span><span class="kpi-value">${L.length}</span><span class="kpi-sub">${sent} contactados por WhatsApp</span></div>
    ${ESTADOS.map((e) => `
      <button type="button" class="kpi kpi-estado st-${e.id} ${f === e.id ? 'active' : ''}" data-estado="${e.id}" title="Filtrar por ${e.label}">
        <span class="kpi-label"><span class="kpi-ico">${icon(ESTADO_ICONS[e.id])}</span>${e.label}</span>
        <span class="kpi-value">${counts[e.id]}</span>
        <span class="kpi-sub">${pct(counts[e.id])} · ${e.min}+ puntos</span>
      </button>`).join('')}
    <div class="kpi static tone-vip"><span class="kpi-label"><span class="kpi-ico">${icon('star')}</span>Compraron VIP</span><span class="kpi-value">${vip}</span><span class="kpi-sub">${pct(vip)}</span></div>
    <div class="kpi static tone-live"><span class="kpi-label"><span class="kpi-ico">${icon('live')}</span>Asistieron al directo</span><span class="kpi-value">${live}</span><span class="kpi-sub">${pct(live)}</span></div>
    <div class="kpi static tone-info"><span class="kpi-label"><span class="kpi-ico">${icon('play')}</span>Vieron la grabación</span><span class="kpi-value">${replay}</span><span class="kpi-sub">${pct(replay)} (≥50%)</span></div>
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

function compraChip(s) {
  if (s.compra_directo) return chip('En directo', 'on');
  if (s.compra) return chip('Compró', 'on');
  if (s.clienta_anterior) return chip('Clienta anterior');
  return chip('—');
}

function rowHtml(l) {
  const msgPreview = messageFor(l);
  const waBtn = l.step === 'comprado'
    ? '<span class="chip on">Ya compró ✓</span>'
    : l.phoneWa
    ? `<button type="button" class="btn wa ${l.s.wa_enviado ? 'sent' : ''}" data-wa="${esc(l.id)}" title="${esc(msgPreview)}">${l.s.wa_enviado ? 'Enviado ✓ · reenviar' : 'Enviar WhatsApp'}</button>`
    : '<span class="muted">Sin teléfono</span>';
  return `<tr>
    <td><div class="lead-name">${esc(l.name || '(sin nombre)')} ${avatarChip(l)}</div><div class="lead-meta">${esc(l.email)}${l.phone ? ` · ${esc(l.phone)}` : ''}${l.s.trafico ? ` · ${l.s.trafico === 'frio' ? 'Tráfico frío' : 'Tráfico templado'}` : ''}</div></td>
    <td>${videoChip(l.s, 'clase1')}</td>
    <td>${videoChip(l.s, 'clase2')}</td>
    <td>${l.s.vip ? chip('VIP', 'on') : l.s.vip_anterior ? chip('VIP anterior') : chip('—')}</td>
    <td>${liveChip(l.s)}</td>
    <td>${videoChip(l.s, 'replay')}</td>
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
    { id: 'grabacion', title: '🎬 Vieron la grabación y no han comprado', hint: '≥50% de la grabación', rows: state.leads.filter((l) => open(l) && !l.s.wa_enviado && !l.s.vip && l.estado.id !== 'muy-caliente' && watched(l.s, 'replay') >= 50) },
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
    l.s.directo_final ? 'Directo hasta el final' : l.s.directo_asistio ? 'Asistió al directo' : '',
    watched(l.s, 'replay') ? `Grabación ${watched(l.s, 'replay')}%` : '',
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
  return buildMessage(state.config.templates[l.step], { nombre: l.firstName, contactId: l.id, launch });
}

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
$('#btn-zoom').addEventListener('click', async () => {
  const launch = state.config.launches[state.launchCode];
  if (!state.zoomConfigured) return notice('Zoom no está conectado todavía (faltan las variables ZOOM_* en Cloudflare).', true);
  if (!launch.zoomMeetingId) return notice('Añade el ID de la reunión de Zoom en la configuración del lanzamiento.', true);
  const btn = $('#btn-zoom');
  btn.disabled = true;
  try {
    progress(0, 0, 'Leyendo el informe de asistencia de Zoom…');
    const report = await api(`/api/zoom-report?launch=${encodeURIComponent(state.launchCode)}`);
    const byEmail = new Map(state.leads.map((l) => [l.email, l]));
    const items = [];
    let unmatched = 0;
    for (const a of report.attendees) {
      const lead = byEmail.get(a.email);
      if (!lead) { unmatched++; continue; }
      const tags = ['directo_asistio'];
      if (a.minutes >= 60) tags.push('directo_60');
      if (a.final) tags.push('directo_final');
      const missing = tags.filter((t) => !lead.s[t]).map((t) => tagFor(state.launchCode, t));
      if (missing.length) items.push({ id: lead.id, tags: missing });
    }
    let done = 0; let failed = 0;
    for (let i = 0; i < items.length; i += 25) {
      const chunk = items.slice(i, i + 25);
      const { results } = await api('/api/apply-tags', { method: 'POST', body: { items: chunk } });
      failed += results.filter((r) => !r.ok).length;
      done += chunk.length;
      progress(done, items.length, `Etiquetando asistentes en GHL… ${done} de ${items.length}`);
    }
    await loadLeads();
    notice(`Zoom: ${report.attendees.length} asistentes identificados, ${items.length} leads actualizados`
      + `${unmatched ? `, ${unmatched} emails que no están en este lanzamiento` : ''}`
      + `${report.anonymous ? `, ${report.anonymous} conexiones sin email` : ''}`
      + `${failed ? `. ${failed} no se pudieron etiquetar (vuelve a sincronizar)` : ''}.`, failed > 0);
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
}

function openConfig(code) {
  editingCode = code && state.config.launches[code] ? code : null;
  const pick = $('#cfg-launch-pick');
  pick.innerHTML = '<option value="">— Nuevo lanzamiento —</option>'
    + launchesSorted().map(([c, l]) => `<option value="${esc(c)}">${esc(l.name)} (${esc(c)})</option>`).join('');
  pick.value = editingCode || '';
  // Las etiquetas de VIP y compra son fijas: un lanzamiento nuevo hereda las del último.
  const last = launchesSorted()[0]?.[1] || {};
  const l = editingCode ? state.config.launches[editingCode]
    : {
      vipTag: last.vipTag, compraTag: last.compraTag, llamadaTag: last.llamadaTag, compraDateField: last.compraDateField,
      precioVip: last.precioVip, precioPrograma: last.precioPrograma, precioFraccionado: last.precioFraccionado, fraccionadoTag: last.fraccionadoTag, unicoTag: last.unicoTag, publiTag: last.publiTag, organicoTag: last.organicoTag, vipContadorBase: last.vipContadorBase,
      // Las clases son las mismas en cada lanzamiento: se heredan sus vídeos y textos.
      clase1Url: last.clase1Url, clase2Url: last.clase2Url, textos: last.textos,
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
  $('#cfg-replay-video').value = l.replayVideoUrl || '';
  $('#cfg-replay-at').value = l.replayAt || '';
  $('#cfg-vip-url').value = l.vipUrl || '';
  $('#cfg-vip-base').value = l.vipContadorBase ?? 41;
  $('#cfg-whatsapp-url').value = l.whatsappUrl || '';
  $('#cfg-gracias-video').value = l.graciasVideoUrl || '';
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
  $('#cfg-publi-tag').value = l.publiTag || '';
  $('#cfg-obj-registros').value = l.objetivos?.registros || '';
  $('#cfg-obj-vip').value = l.objetivos?.vip || '';
  $('#cfg-obj-ventas').value = l.objetivos?.ventas || '';
  $('#cfg-obj-facturacion').value = l.objetivos?.facturacion || '';
  $('#cfg-organico-tag').value = l.organicoTag || '';
  $('#cfg-inversion').value = l.inversion || '';
  $('#cfg-meta-filtro').value = l.metaFiltro || '';
  renderMetaNaming();
  $('#cfg-digest-email').value = state.config.digestEmail || '';
  renderAccesosEditor(state.config.accesos);
  $('#tpl-grabacion').value = state.config.templates.grabacion;
  $('#tpl-raices').value = state.config.templates.raices;
  $('#tpl-cierre').value = state.config.templates.cierre;
  $('#cfg-country').value = state.config.defaultCountryCode || '34';
  $('#cfg-status').textContent = '';
  renderSnippets();
  renderSnapshotBox();
  renderGuia();
  if (!dlg.open) dlg.showModal();
}

$('#cfg-launch-pick').addEventListener('change', (e) => openConfig(e.target.value));
$('#btn-config').addEventListener('click', () => openConfig(state.launchCode));
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="new-launch"]')) openConfig(null);
});
$$('.tab').forEach((t) => t.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
  $$('.tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== t.dataset.tab; });
}));

// ---------- Etiquetas que deben cambiar en cada lanzamiento ----------
// Registro y encuesta: una nueva por lanzamiento. VIP y compra: siempre las mismas.
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
    const u = usedBy(enc, 'encuestaTag');
    if (u.length) out.encuesta = `Ya se usó en «${u.join('», «')}»: quien la rellenó entonces vería las clases sin hacer la encuesta. Crea una nueva.`;
    else if (enc === reg) out.encuesta = 'Es la misma que la de registro: todas verían las clases sin rellenar la encuesta.';
    else if (fixed.includes(enc)) out.encuesta = 'Es la misma que la de VIP o compra. Elige la etiqueta que añade la encuesta.';
  }
  return out;
}

function checkLaunchTags() {
  const p = tagProblems();
  for (const k of ['registro', 'encuesta']) {
    const el = $(`#warn-${k}`);
    el.textContent = p[k] ? `⚠ ${p[k]}` : '';
    el.hidden = !p[k];
  }
  const code = editingCode || $('#cfg-code').value.trim().toLowerCase();
  const prev = launchesSorted().filter(([c]) => c !== code).slice(0, 3);
  $('#tags-used').innerHTML = prev.length
    ? `Usadas en lanzamientos anteriores (no las repitas): ${prev.map(([, l]) => `<span>${esc(l.name)}: registro <code>${esc(l.registroTag || '–')}</code>${l.encuestaTag ? ` · encuesta <code>${esc(l.encuestaTag)}</code>` : ''}</span>`).join(' · ')}`
    : '';
}
['#cfg-registro', '#cfg-encuesta-tag', '#cfg-vip', '#cfg-compra', '#cfg-code'].forEach((sel) => $(sel).addEventListener('input', checkLaunchTags));

// ---------- Guía por colores: qué cambia en cada lanzamiento ----------
// nuevo = valor nuevo siempre · revisar = suele repetirse, pero hay que comprobarlo · fijo = no se toca.
// `key` es el campo del lanzamiento (para avisar si se repite el de otro lanzamiento); `opcional` no cuenta como «falta».
const CICLO = [
  { id: 'cfg-code', c: 'nuevo', label: 'Código' },
  { id: 'cfg-name', c: 'nuevo', label: 'Nombre', key: 'name' },
  { id: 'cfg-registro', c: 'nuevo', label: 'Etiqueta de registro' },
  { id: 'cfg-encuesta-tag', c: 'nuevo', label: 'Etiqueta de encuesta', opcional: true },
  { id: 'cfg-encuesta-url', c: 'nuevo', label: 'Enlace de la encuesta', key: 'encuestaUrl', opcional: true },
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
  { id: 'cfg-gracias-video', c: 'revisar', label: 'Vídeo de gracias', opcional: true },
  { id: 'cfg-cierre', c: 'nuevo', label: 'Cierre del carrito', key: 'cierreCarrito' },
  { id: 'cfg-replay', c: 'revisar', label: 'Página de la grabación' },
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
  { id: 'cfg-vip', c: 'fijo' },
  { id: 'cfg-compra', c: 'fijo' },
  { id: 'cfg-llamada-tag', c: 'fijo' },
  { id: 'cfg-publi-tag', c: 'fijo' },
  { id: 'cfg-organico-tag', c: 'fijo' },
  { id: 'cfg-unico-tag', c: 'fijo' },
  { id: 'cfg-fraccionado-tag', c: 'fijo' },
  { id: 'cfg-compra-fecha', c: 'fijo' },
  { id: 'tpl-grabacion', c: 'fijo' },
  { id: 'tpl-raices', c: 'fijo' },
  { id: 'tpl-cierre', c: 'fijo' },
  { id: 'cfg-country', c: 'fijo' },
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
  const st = issue ? 'warn' : v ? 'ok' : f.opcional ? 'opt' : 'falta';
  return { st, txt: issue || (v ? 'listo' : f.opcional ? 'vacío (opcional)' : 'falta') };
}
const GUIA_ICON = { ok: '✓', warn: '⚠', opt: '○', falta: '✗' };

// Checklist de cada pestaña, agrupada por sus secciones, y el estado en la cabecera de cada sección.
let guiaHtml = {};
function renderGuia() {
  const code = editingCode || $('#cfg-code').value.trim().toLowerCase();
  const others = Object.entries(state.config.launches).filter(([c]) => c !== code);
  const tagIssues = tagProblems();
  for (const [panel, box] of [['launch', '#guia-check'], ['pagina', '#guia-check-pagina']]) {
    const groups = $$(`.tab-panel[data-panel="${panel}"] .cfg-sec`).map((sec) => {
      const items = $$('.field', sec).map((el) => CICLO.find((f) => f.id === $('input, select, textarea', el)?.id))
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
$('#guia-check-pagina').addEventListener('click', (e) => {
  const b = e.target.closest('[data-goto]');
  if (b) goToField(b.dataset.goto);
});
$('#guia-check').addEventListener('click', (e) => {
  const b = e.target.closest('[data-goto]');
  if (b) goToField(b.dataset.goto);
});

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
      replayVideoUrl: $('#cfg-replay-video').value.trim(),
      replayAt: $('#cfg-replay-at').value,
      vipUrl: $('#cfg-vip-url').value.trim(),
      vipContadorBase: $('#cfg-vip-base').value.trim(),
      whatsappUrl: $('#cfg-whatsapp-url').value.trim(),
      graciasVideoUrl: $('#cfg-gracias-video').value.trim(),
      cierreCarrito: $('#cfg-cierre').value,
      calendarioUrl: $('#cfg-calendario-url').value.trim(),
      barra: readBarraEditor(),
      enlaces: readEnlacesEditor(),
      textos: readTextosEditor(),
      zoomMeetingId: $('#cfg-zoom-id').value,
      zoomJoinUrl: $('#cfg-zoom-url').value.trim(),
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
      objetivos: {
        registros: $('#cfg-obj-registros').value, vip: $('#cfg-obj-vip').value,
        ventas: $('#cfg-obj-ventas').value, facturacion: $('#cfg-obj-facturacion').value,
      },
      organicoTag: $('#cfg-organico-tag').value.trim().toLowerCase(),
      inversion: $('#cfg-inversion').value,
      metaFiltro: $('#cfg-meta-filtro').value.trim(),
    },
  };
}

$('#cfg-save').addEventListener('click', async () => {
  const status = $('#cfg-status');
  try {
    const { code, launch } = readForm();
    const probs = Object.values(tagProblems()).filter(Boolean);
    if (probs.length && !window.confirm(`Revisa las etiquetas:\n\n• ${probs.join('\n• ')}\n\n¿Guardar igualmente?`)) return;
    if (state.tags.length && !state.tags.map((t) => t.toLowerCase()).includes(launch.registroTag)) {
      if (!window.confirm(`La etiqueta "${launch.registroTag}" no existe en GHL todavía. ¿Guardar igualmente?`)) return;
    }
    const next = {
      ...state.config,
      defaultCountryCode: $('#cfg-country').value,
      digestEmail: $('#cfg-digest-email').value.trim(),
      accesos: readAccesosEditor(),
      templates: { grabacion: $('#tpl-grabacion').value, raices: $('#tpl-raices').value, cierre: $('#tpl-cierre').value },
      launches: { ...state.config.launches, [code]: launch },
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
  } finally {
    $('#cfg-save').disabled = false;
  }
});

// ---------- Foto de VIP / clientas anteriores ----------
// Las etiquetas de VIP y compra no cambian entre lanzamientos y GHL no guarda cuándo se pusieron.
// Al crear el lanzamiento marcamos a quien ya las tenía (`<código>_vip_previo`…) para no contarlas.
function missingSnapshot(launch) {
  return SNAPSHOT_TAGS.filter((f) => launch?.[f.field] && launch.snapshot?.tags?.[f.field] !== launch[f.field]);
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
    notice(`No se pudo completar la foto de VIP/clientas/llamadas anteriores: ${e.message}`, true);
  } finally {
    progress(null);
  }
}

function snapshotSummary(launch) {
  const s = launch.snapshot;
  if (!s) return '';
  const parts = SNAPSHOT_TAGS.filter((f) => s.tags?.[f.field]).map((f) => `${s.counts[f.field] ?? 0} con «${esc(s.tags[f.field])}»`);
  return `Foto hecha el ${new Date(s.at).toLocaleString('es-ES')}: ${parts.join(', ')}. No cuentan como VIP, compra ni llamada de este lanzamiento.`;
}

function renderSnapshotBox() {
  const box = $('#cfg-snapshot');
  const launch = editingCode && state.config.launches[editingCode];
  if (!launch) {
    box.innerHTML = '<p class="muted">Al guardar se hará una «foto» de quién tiene ya las etiquetas de VIP, compra y llamada, para no contarlas como de este lanzamiento. Crea el lanzamiento <strong>antes de abrir la venta de la VIP</strong>.</p>';
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
  const missing = puedeConfig() && launch ? missingSnapshot(launch) : [];
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
  $('#cfg-barra').innerHTML = PHASES.map((p) => {
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

function renderAccesosEditor(accesos) {
  // Los sugeridos solo se proponen la primera vez (lista vacía): después se respeta lo guardado
  // y nunca se añaden filas nuevas por su cuenta.
  const list = (accesos || []).map((a) => ({ ...a, tipo: ACCESO_TIPOS[a.tipo] ? a.tipo : guessTipo(a.nombre) }));
  if (!list.length) for (const [tipo, nombre] of ACCESOS_SUGERIDOS) list.push({ tipo, nombre, url: '' });
  state.accesosEdit = list;
  state.accesosCat = null;
  drawAccesos();
}

function drawAccesos(focusLast = false) {
  const box = $('#cfg-accesos');
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
  if (focusLast) $('#cfg-accesos .acceso-row:last-child .acc-nombre')?.focus();
}

function readAccesosEditor() {
  return (state.accesosEdit || []).map((a) => ({ tipo: a.tipo, nombre: a.nombre.trim(), url: a.url.trim() })).filter((a) => a.nombre);
}

$('#cfg-accesos').addEventListener('click', (e) => {
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
$('#cfg-accesos').addEventListener('input', (e) => {
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
  const label = PHASES.find((x) => x.id === p.id)?.label || p.id;
  const bar = barFor(l, p.id);
  box.innerHTML = `<p><strong>Ahora mismo la página está en la fase:</strong> ${esc(label)}${p.changesAt ? ` · cambia el ${esc(formatLong(p.changesAt))}` : ''}</p>
    <p class="muted">Barra: «${esc(bar.text.replace('{cuenta}', '⏳'))}»${p.id === 'en_directo' ? ' · la página preclase redirige al directo' : (p.id === 'replay' || p.id === 'cerrado') ? ' · la página preclase redirige a la grabación' : ''}</p>`;
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
  const script = `<script src="${origin}/tracker.js" defer></script>`;
  const items = [
    ['LOGIN · bloque del formulario (no cambia entre lanzamientos)',
      `<div data-lsd-login data-launch="auto"\n     data-title="Accede a las clases con el email con el que te registraste"\n     data-button="Acceder a las clases"></div>\n${script}`],
    ['RECURSOS · bloque base (una vez por página, en cualquier sitio)', `<div data-lsd-page="recursos" data-launch="auto"></div>\n${script}`],
    ['RECURSOS · barra de urgencia (dale estilo de barra fija arriba)', '<div class="mi-barra" data-lsd-bar></div>'],
    ['RECURSOS · vídeo de la clase 1 (bloqueado con cuenta atrás hasta su hora)', '<div data-lsd-video="clase1"></div>'],
    ['RECURSOS · vídeo de la clase 2', '<div data-lsd-video="clase2"></div>'],
    ['RECURSOS · oferta VIP (se oculta al empezar el directo y a quien ya es VIP)',
      '<div data-lsd-if="vip-abierta">\n  Entrada VIP por <span data-lsd-text="precioVip"></span> · se cierra en <span data-lsd-countdown="vip"></span>\n  <a data-lsd-link="vip">Quiero mi entrada VIP</a>\n</div>\n<div data-lsd-if="ya-vip">✓ Ya tienes tu entrada VIP</div>'],
    ['RECURSOS · botón del grupo de WhatsApp', '<a data-lsd-link="whatsapp" target="_blank">Unirme al grupo de WhatsApp</a>'],
    ['RECURSOS · botón del directo', '<a data-lsd-link="directo">Entrar al directo</a>'],
    ['RECURSOS · encuesta (sin ella no se ven las clases 1 y 2)',
      '<div data-lsd-if="encuesta-pendiente">\n  Antes de ver las clases, cuéntanos un poco sobre ti\n  <a data-lsd-link="encuesta">Rellenar la encuesta</a>\n</div>\n<div data-lsd-if="encuesta-hecha">✓ ¡Gracias por rellenar la encuesta!</div>'],
    ['RECURSOS · añadir el directo al calendario (Google y, opcional, Apple/Outlook)', '<a data-lsd-link="calendario" target="_blank">Añadir a Google Calendar</a>\n<a data-lsd-link="calendario-ics">Añadir a Apple / Outlook</a>'],
    ['GRABACIÓN · bloques de la página del replay', `<div data-lsd-page="grabacion" data-launch="auto"></div>\n<div class="mi-barra" data-lsd-bar></div>\n<div data-lsd-video="replay"></div>\n${script}`],
    ['Enlace al LOGIN o a los RECURSOS en emails de GHL (añádelo al final de la URL: entra directa)', '?cid={{contact.id}}'],
    ['Enlace al directo en emails de GHL', `${origin}/directo?l=auto&cid={{contact.id}}`],
    ['Enlace al directo para el grupo de WhatsApp (pide el email)', `${origin}/directo?l=auto`],
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

async function loadTareas() {
  const code = state.launchCode;
  if (!code) return;
  try {
    const d = await api(`/api/tareas?l=${encodeURIComponent(code)}`);
    if (code !== state.launchCode) return;
    if (state.tareas?.code !== code) state.tSel = null;
    state.tareas = { code, list: d.tareas, users: d.users, columnas: d.columnas || [] };
  } catch (e) {
    state.tareas = { code, list: [], users: [], error: e.message };
  }
  renderTareas();
}

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
    <optgroup label="Roles">${ROLES_UI.map((r) => `<option value="rol:${r}">Rol ${ROLE_LABEL[r]}</option>`).join('')}<option value="sin">Sin asignar</option></optgroup>
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
    ? `<span class="t-who"><span class="t-avatar">${esc(iniciales(asignadoTexto(a)))}</span>${esc(asignadoTexto(a))}</span>`
    : `<span class="t-who ${a ? 't-rol' : 't-nadie'}">${a ? icon('users') : ''}${esc(asignadoTexto(a))}</span>`;
  const fecha = t.fecha
    ? `<span class="t-fecha ${!t.hecha && venc ? 'vencida' : !t.hecha && t.fecha === hoy ? 'hoy' : ''}">${icon('calendar')}${!t.hecha && venc ? 'Vencida · ' : !t.hecha && t.fecha === hoy ? 'Hoy · ' : ''}${esc(fechaCorta(t.fecha))}</span>`
    : '';
  const hecha = t.hecha ? `<span class="t-hecha">✓ ${esc(t.hechaPor || '')}${t.hechaEn ? ` · ${esc(new Date(t.hechaEn).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }))}` : ''}</span>` : '';
  const sel = state.tSel ? `<label class="t-sel" title="Seleccionar"><input type="checkbox" data-sel="${esc(t.id)}" ${state.tSel.has(t.id) ? 'checked' : ''} aria-label="Seleccionar tarea"></label>` : '';
  return `<li class="tarea ${t.hecha ? 'done' : ''} ${venc ? 'is-vencida' : ''} ${esMia(t, meSess()) ? 'is-mia' : ''} ${state.tSel?.has(t.id) ? 'is-sel' : ''}">${sel}
    <label class="t-check" title="${puede ? (t.hecha ? 'Volver a pendiente' : 'Marcar como completada') : 'Solo puede marcarla su responsable'}">
      <input type="checkbox" data-tid="${esc(t.id)}" ${t.hecha ? 'checked' : ''} ${puede ? '' : 'disabled'}><span class="t-box" aria-hidden="true"></span>
    </label>
    <div class="t-main">
      <button type="button" class="t-titulo t-open" data-tver="${esc(t.id)}">${t.habitual ? '<span class="t-hab" title="Tarea habitual">🔁</span>' : ''}${esc(t.titulo)}</button>
      ${notasExtracto(t)}
      <div class="t-meta">${(() => { const c = !t.hecha && extraCols().find((x) => x.id === t.columna); return c ? `<span class="t-encurso">${c.icon} ${esc(c.label)}</span>` : ''; })()}${fecha}${who}${hecha}</div>
    </div>
    ${state.role === 'admin' ? `<div class="t-actions"><button type="button" class="btn ghost" data-tedit="${esc(t.id)}" title="Editar" aria-label="Editar">✎</button><button type="button" class="btn ghost" data-tdel="${esc(t.id)}" title="Borrar" aria-label="Borrar">✕</button></div>` : ''}
  </li>`;
}

// Aviso solo para admin: tareas de los demás que han pasado su fecha sin completarse.
function renderAvisosEquipo() {
  const el = $('#avisos-equipo');
  const T = state.tareas;
  const lista = state.role === 'admin' && T && T.code === state.launchCode ? vencidasEquipo(T.list, T.users, today()) : [];
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
  if (!T || T.code !== state.launchCode) return;
  renderAvisosEquipo();
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
      <h2>Aún no hay tareas en este lanzamiento</h2>
      ${state.role === 'admin'
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
  const groups = FASES.map((f) => ({ f, all: list.filter((t) => t.fase === f.id), items: shown.filter((t) => t.fase === f.id).sort(order) }))
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
const FASE_COLOR = { preparacion: 'gris', captacion: 'azul', clases: 'morado', directo: 'rojo', carrito: 'verde', cierre: 'naranja' };
const extraCols = () => state.tareas?.columnas || [];
function columnasTablero() {
  return [
    ...FASES.map((f) => ({ id: f.id, label: f.label, icon: f.icon, color: FASE_COLOR[f.id], tipo: 'fase' })),
    ...extraCols().map((c) => ({ ...c, tipo: 'extra' })),
    { id: COLUMNA_HECHAS, label: 'Completadas', icon: '✅', color: 'verde', tipo: 'hechas' },
  ];
}

function tarjeta(t) {
  const hoy = today();
  const puede = puedeMarcar(t, meSess());
  const admin = state.role === 'admin';
  const fase = FASES.find((f) => f.id === t.fase);
  const venc = vencida(t, hoy);
  const col = columnaDe(t, extraCols());
  const a = t.asignado;
  const who = a?.tipo === 'persona'
    ? `<span class="t-who"><span class="t-avatar">${esc(iniciales(asignadoTexto(a)))}</span>${esc(asignadoTexto(a))}</span>`
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
  const admin = state.role === 'admin';
  const cols = columnasTablero();
  const extras = extraCols();
  const order = (a, b) => (a.fecha || '9999').localeCompare(b.fecha || '9999') || a.titulo.localeCompare(b.titulo, 'es');
  return `<div class="kanban" style="--kb-n:${cols.length + (admin ? 1 : 0)}">${cols.map((c) => {
    let items = shown.filter((t) => columnaDe(t, extras) === c.id);
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
  const actual = columnaDe(t, extraCols());
  if (actual === destino) return;
  try {
    if (destino === COLUMNA_HECHAS) {
      if (!puedeMarcar(t, meSess())) throw new Error('Solo puede completarla su responsable');
      await tareasOp({ op: 'marcar', id, hecha: true });
    } else if (state.role === 'admin') {
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
  const name = state.config.launches[state.tareas.code]?.name || state.tareas.code;
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
$('#btn-tareas-plantilla').addEventListener('click', cargarPlantilla);
$('#btn-tarea-nueva').addEventListener('click', () => openTarea(null));
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="tareas-plantilla"]')) cargarPlantilla();
  if (e.target.closest('[data-action="tarea-nueva"]')) openTarea(null);
});

// Diálogo de tarea
const tdlg = $('#tarea-dialog');
let editingTarea = null;
$('#t-fase').innerHTML = FASES.map((f) => `<option value="${f.id}">${f.icon} ${esc(f.label)}</option>`).join('');
$('#t-sub').innerHTML = `<option value="">Automática (según el título)</option>${SUBS_PREPARACION.map((s) => `<option value="${s.id}">${s.icon} ${esc(s.label)}</option>`).join('')}`;
const syncSubField = () => { $('#t-sub-field').hidden = $('#t-fase').value !== 'preparacion'; };
$('#t-fase').addEventListener('change', syncSubField);

function fillAsignadoSelect(value) {
  const users = state.tareas?.users || [];
  $('#t-asignado').innerHTML = `<option value="">Sin asignar</option>
    <optgroup label="Todo un rol">${ROLES_UI.map((r) => `<option value="rol:${r}">Rol ${ROLE_LABEL[r]}</option>`).join('')}</optgroup>
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
  $('#t-fase').value = t?.fase || FASES[0].id;
  $('#t-fecha').value = t?.fecha || '';
  $('#t-sub').value = t?.sub || '';
  syncSubField();
  const a = t?.asignado;
  fillAsignadoSelect(a ? (a.tipo === 'rol' ? `rol:${a.rol}` : `u:${a.id}`) : '');
  ['#t-np-nombre', '#t-np-email'].forEach((s) => { $(s).value = ''; });
  $('#t-np-rol').value = 'setter';
  $('#t-avisar').checked = true;
  $('#tarea-status').textContent = '';
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
const accesoMsg = (r) => (r.emailEnviado
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
    state.equipo = (await api('/api/usuarios')).users;
    renderEquipo();
  } catch (e) {
    box.innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
}

function renderEquipo() {
  const users = state.equipo;
  const fmt = (d) => (d ? new Date(d).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Nunca');
  $('#equipo-list').innerHTML = users.length ? `<div class="table-scroll"><table class="metric-table equipo-table">
    <thead><tr><th>Persona</th><th>Rol</th><th>Último acceso</th><th></th></tr></thead>
    <tbody>${users.map((u) => `<tr class="${u.activo ? '' : 'inactivo'}" data-uid="${esc(u.id)}">
      <td><span class="t-who"><span class="t-avatar">${esc(iniciales(u.nombre))}</span><span><strong>${esc(u.nombre)}</strong><br><span class="muted">${esc(u.email)}</span>${u.activo ? '' : ' · <em>desactivada</em>'}</span></span></td>
      <td><select class="eq-rol" ${u.id === state.user?.id ? 'disabled' : ''}>${[...ROLES_UI, ...(ROLES_UI.includes(u.rol) ? [] : [u.rol])].map((r) => `<option value="${r}" ${r === u.rol ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select></td>
      <td class="muted">${fmt(u.lastLogin)}</td>
      <td class="eq-actions">
        <button type="button" class="btn" data-eq="regenerar" title="Genera una contraseña nueva y se la envía por email">Reenviar acceso</button>
        ${u.id === state.user?.id ? '' : `<button type="button" class="btn ghost" data-eq="${u.activo ? 'desactivar' : 'activar'}">${u.activo ? 'Desactivar' : 'Activar'}</button>
        <button type="button" class="btn ghost" data-eq="borrar" aria-label="Borrar">✕</button>`}
      </td></tr>`).join('')}</tbody></table></div>`
    : '<p class="muted">Todavía no hay nadie. Añade a Sara, Quique… con su nombre y email: les llegará el acceso.</p>';
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
  const u = state.equipo.find((x) => x.id === id);
  const op = b.dataset.eq;
  if (op === 'regenerar' && !window.confirm(`Se generará una contraseña nueva para ${u.nombre} y se le enviará por email. La anterior dejará de funcionar. ¿Continuar?`)) return;
  if (op === 'borrar' && !window.confirm(`¿Borrar a ${u.nombre}? Perderá el acceso y sus tareas quedarán como «Persona eliminada».`)) return;
  b.disabled = true;
  try {
    if (op === 'regenerar') {
      const r = await api('/api/usuarios', { method: 'POST', body: { op, id } });
      equipoResult(r.emailEnviado ? `Contraseña nueva enviada a ${u.email}.` : `No se pudo enviar el email${r.emailError ? ` (${r.emailError})` : ''}. Pásale tú la contraseña nueva: ${r.password}`, !r.emailEnviado);
    } else if (op === 'borrar') {
      await api('/api/usuarios', { method: 'POST', body: { op, id } });
      equipoResult(`${u.nombre} borrada.`);
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

// ---------- Mi cuenta ----------
$('#btn-cuenta').addEventListener('click', () => {
  const u = state.user;
  $('#cuenta-info').textContent = `${u.nombre} · ${u.email} · Rol ${ROLE_LABEL[state.role]}`;
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
const CAL_FASE_COLOR = { captacion: 'info', clases: 'live', directo: 'accent', carrito: 'buy' };
const DOW = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const cal = {
  modo: ls.get('lsd_cal_modo') === 'semana' ? 'semana' : 'mes',
  ref: null, // día de referencia (YYYY-MM-DD)
  refCode: null,
  sel: null,
  eventos: { code: null, list: [] },
  show: (() => { try { return { tareas: true, eventos: true, otros: false, ...JSON.parse(ls.get('lsd_cal_show') || '{}') }; } catch { return { tareas: true, eventos: true, otros: false }; } })(),
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
  const code = state.launchCode;
  if (!code) return;
  try {
    const d = await api(`/api/eventos?l=${encodeURIComponent(code)}`);
    if (code !== state.launchCode) return;
    cal.eventos = { code, list: d.eventos };
  } catch (e) {
    cal.eventos = { code, list: [], error: e.message };
  }
  if (!$('#view-calendario').hidden) renderCalendario();
}

// Día inicial: hoy si el lanzamiento está en marcha; si no, el mes del directo (o del primer hito).
function calInitialRef() {
  const hoy = today();
  const days = hitosLanzamiento(state.config.launches[state.launchCode] || {}).map((h) => h.day).sort();
  if (!days.length || (hoy >= addDays(days[0], -21) && hoy <= addDays(days[days.length - 1], 14))) return hoy;
  const l = state.config.launches[state.launchCode];
  return l.fechaDirecto || days[0];
}

// Todo lo que cae en cada día: { 'YYYY-MM-DD': [item…] }
function calItems() {
  const map = {};
  const push = (d, it) => { (map[d] ||= []).push(it); };
  const code = state.launchCode;
  const L = state.config.launches;
  const codes = cal.show.otros ? Object.keys(L) : [code];
  for (const c of codes) {
    for (const h of hitosLanzamiento(L[c])) push(h.day, { kind: 'hito', code: c, own: c === code, icon: h.icon, titulo: h.titulo, time: h.time, launch: L[c].name, hid: h.id });
  }
  if (cal.show.eventos && cal.eventos.code === code) {
    for (const e of cal.eventos.list) {
      const tipo = EVENTO_TIPOS.find((t) => t.id === e.tipo);
      for (let d = e.fecha; d && d <= (e.fin || e.fecha); d = addDays(d, 1)) push(d, { kind: 'evento', ev: e, icon: tipo?.icon || '📌', titulo: e.titulo, time: d === e.fecha ? e.hora : '', cont: d !== e.fecha });
    }
  }
  if (cal.show.tareas && state.tareas?.code === code) {
    for (const t of state.tareas.list) if (t.fecha) push(t.fecha, { kind: 'tarea', t, titulo: t.titulo, time: '' });
  }
  const rank = { hito: 0, evento: 1, tarea: 2 };
  for (const list of Object.values(map)) list.sort((a, b) => (rank[a.kind] - rank[b.kind]) || (a.time || '').localeCompare(b.time || '') || (b.own === true) - (a.own === true));
  return map;
}

function calChip(it, hoy) {
  if (it.kind === 'tarea') {
    const t = it.t;
    const cls = t.hecha ? 'done' : vencida(t, hoy) ? 'late' : esMia(t, meSess()) ? 'mine' : '';
    return `<span class="cal-chip k-tarea ${cls}" title="${esc(t.titulo)} · ${esc(asignadoTexto(t.asignado))}"><span class="cc-ico">${t.hecha ? '✓' : '☐'}</span><span class="cc-txt">${esc(t.titulo)}</span></span>`;
  }
  const other = it.kind === 'hito' && !it.own;
  const tipo = it.kind === 'evento' ? ` t-${it.ev.tipo}` : '';
  return `<span class="cal-chip k-${it.kind}${tipo} ${other ? 'other' : ''} ${it.cont ? 'cont' : ''}" title="${esc(it.titulo)}${other ? ` · ${esc(it.launch)}` : ''}"><span class="cc-ico">${it.icon}</span>${it.time ? `<span class="cc-time">${esc(it.time)}</span>` : ''}<span class="cc-txt">${esc(it.titulo)}${other ? ` · ${esc(it.launch)}` : ''}</span></span>`;
}

function renderCalendario() {
  if (!state.config || !state.launchCode || !state.config.launches[state.launchCode]) return;
  if (cal.refCode !== state.launchCode) { cal.ref = calInitialRef(); cal.refCode = state.launchCode; cal.sel = null; }
  const hoy = today();
  const launch = state.config.launches[state.launchCode];
  const fases = fasesLanzamiento(launch);
  const items = calItems();
  $$('#cal-modo .seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.m === cal.modo));
  $('#cal-show-tareas').checked = cal.show.tareas;
  $('#cal-show-eventos').checked = cal.show.eventos;
  $('#cal-show-otros').checked = cal.show.otros;

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

  const unknownDates = !hitosLanzamiento(launch).length;
  $('#cal-legend').innerHTML = `${fases.map((f) => `<span class="cal-leg tone-${CAL_FASE_COLOR[f.id]}"><i></i>${esc(f.label)}</span>`).join('')}
    <span class="cal-leg-sep"></span>
    <span class="cal-leg k"><span class="cal-chip k-hito">🔴 Hito</span></span>
    ${cal.show.eventos ? '<span class="cal-leg k"><span class="cal-chip k-evento">📌 Evento</span></span>' : ''}
    ${cal.show.tareas ? '<span class="cal-leg k"><span class="cal-chip k-tarea"><span class="cc-ico">☐</span>Tarea</span></span><span class="cal-leg k"><span class="cal-chip k-tarea late"><span class="cc-ico">☐</span>Vencida</span></span>' : ''}
    ${unknownDates ? `<span class="muted">Este lanzamiento aún no tiene fechas${puedeConfig() ? ': ponlas en Configuración.' : '.'}</span>` : ''}
    ${cal.eventos.error ? `<span class="error">No se pudieron cargar los eventos: ${esc(cal.eventos.error)}</span>` : ''}`;

  const month = cal.ref.slice(0, 7);
  const max = cal.modo === 'mes' ? 3 : 99;
  const cell = (d) => {
    const list = items[d] || [];
    const bands = fases.filter((f) => d >= f.from && d <= f.to);
    const more = list.length - max;
    return `<button type="button" class="cal-day ${d.slice(0, 7) !== month && cal.modo === 'mes' ? 'out' : ''} ${d === hoy ? 'today' : ''} ${d === cal.sel ? 'sel' : ''} ${d < hoy ? 'past' : ''}" data-day="${d}" aria-label="${esc(fmtDay(d, { weekday: 'long', day: 'numeric', month: 'long' }))}${list.length ? `, ${list.length} elementos` : ''}">
      <span class="cal-bands">${bands.map((f) => `<i class="tone-${CAL_FASE_COLOR[f.id]}" title="${esc(f.label)}"></i>`).join('')}</span>
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
  const admin = state.role === 'admin';
  const row = (it) => {
    if (it.kind === 'tarea') {
      const t = it.t;
      const puede = puedeMarcar(t, meSess());
      return `<li class="cd-row k-tarea ${t.hecha ? 'done' : ''} ${vencida(t, hoy) ? 'late' : ''}">
        <label class="t-check"><input type="checkbox" data-cal-tid="${esc(t.id)}" ${t.hecha ? 'checked' : ''} ${puede ? '' : 'disabled'}><span class="t-box" aria-hidden="true"></span></label>
        <div class="cd-main"><strong>${esc(t.titulo)}</strong><span class="muted">Tarea · ${esc(asignadoTexto(t.asignado))}${t.hecha ? ` · completada por ${esc(t.hechaPor || '')}` : vencida(t, hoy) ? ' · vencida' : ''}</span>${notasExtracto(t, 'cd-notas')}</div>
        <button type="button" class="btn ghost" data-tver="${esc(t.id)}">Abrir</button>
        ${admin ? `<button type="button" class="btn ghost" data-cal-tedit="${esc(t.id)}">Editar</button>` : ''}</li>`;
    }
    if (it.kind === 'evento') {
      const e = it.ev;
      const tipo = EVENTO_TIPOS.find((x) => x.id === e.tipo);
      return `<li class="cd-row k-evento"><span class="cd-ico">${it.icon}</span>
        <div class="cd-main"><strong>${esc(e.titulo)}</strong><span class="muted">${esc(tipo?.label || 'Evento')}${e.hora ? ` · ${esc(e.hora)} h` : ''}${e.fin ? ` · del ${esc(fmtDay(e.fecha, { day: 'numeric', month: 'short' }))} al ${esc(fmtDay(e.fin, { day: 'numeric', month: 'short' }))}` : ''}</span>${e.notas ? `<span class="cd-notas">${esc(e.notas)}</span>` : ''}</div>
        ${admin ? `<button type="button" class="btn ghost" data-cal-eedit="${esc(e.id)}">Editar</button>` : ''}</li>`;
    }
    return `<li class="cd-row k-hito ${it.own ? '' : 'other'}"><span class="cd-ico">${it.icon}</span>
      <div class="cd-main"><strong>${esc(it.titulo)}</strong><span class="muted">${it.time ? `${esc(it.time)} h · ` : ''}${esc(it.launch)}</span></div>
      ${puedeConfig() ? `<button type="button" class="btn ghost" data-cal-hito="${esc(it.code)}" title="Las fechas se cambian en la configuración del lanzamiento">Cambiar fecha</button>` : ''}</li>`;
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
for (const k of ['tareas', 'eventos', 'otros']) {
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
  if (ee) return openEvento(cal.eventos.list.find((x) => x.id === ee.dataset.calEedit));
  const h = e.target.closest('[data-cal-hito]');
  if (h) return openConfig(h.dataset.calHito);
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
  const d = await api('/api/eventos', { method: 'POST', body: { l: state.launchCode, ...body } });
  cal.eventos = { code: state.launchCode, list: d.eventos };
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
  const fase = FASES.find((f) => f.id === t.fase);
  $('#tv-titulo').textContent = t.titulo;
  $('#tv-meta').innerHTML = `
    <span class="tv-chip">${fase ? `${fase.icon} ${esc(fase.label)}` : ''}</span>
    ${t.fecha ? `<span class="tv-chip ${vencida(t, hoy) ? 'late' : ''}">${icon('calendar')} ${esc(fechaCorta(t.fecha))}${vencida(t, hoy) ? ' · vencida' : ''}</span>` : ''}
    <span class="tv-chip">${icon('users')} ${esc(asignadoTexto(t.asignado))}</span>
    ${t.habitual ? '<span class="tv-chip">🔁 Habitual</span>' : ''}
    ${t.hecha ? `<span class="tv-chip ok">✓ Completada por ${esc(t.hechaPor || '')}</span>` : ''}`;
  const box = $('#tv-notas');
  box.innerHTML = richToHtml(t.notas) || '<p class="muted">Sin descripción.</p>';
  hydrateVideos(box);
  const puede = puedeMarcar(t, meSess());
  const cols = columnasTablero().filter((c) => c.tipo !== 'hechas');
  $('#tv-estado').innerHTML = `<button type="button" class="btn ${t.hecha ? '' : 'primary'}" data-tvdone ${puede ? '' : 'disabled'}>${t.hecha ? '↩︎ Volver a pendiente' : '✓ Marcar como completada'}</button>
    ${state.role === 'admin' && !t.hecha ? `<label class="field inline"><span>Columna</span><select data-tvcol>${cols.map((c) => `<option value="${esc(c.id)}" ${columnaDe(t, extraCols()) === c.id ? 'selected' : ''}>${c.icon} ${esc(c.label)}</option>`).join('')}</select></label>` : ''}`;
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
  if (b) { e.preventDefault(); openTareaVer(b.dataset.tver); }
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tver]');
  if (b && !e.target.closest('#tarea-ver')) openTareaVer(b.dataset.tver);
});

// Reasignar las seleccionadas
function fillSelAsignar() {
  const users = state.tareas?.users || [];
  const sel = $('#sel-asignar');
  const v = sel.value;
  sel.innerHTML = `<option value="">Asignar a…</option><option value="ninguno">Sin asignar</option>
    <optgroup label="Todo un rol">${ROLES_UI.map((r) => `<option value="rol:${r}">Rol ${ROLE_LABEL[r]}</option>`).join('')}</optgroup>
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
async function loadLlamadas() {
  const code = state.launchCode;
  if (!code) return;
  state.llamadas = { code, loading: true };
  if (!$('#view-llamadas').hidden) renderLlamadas();
  try {
    const d = await api(`/api/llamadas?l=${encodeURIComponent(code)}`);
    if (code !== state.launchCode) return;
    state.llamadas = { code, data: d };
  } catch (e) {
    if (code !== state.launchCode) return;
    state.llamadas = { code, error: e.message };
  }
  renderLlamadas();
}

const llCancelada = (c) => ['cancelled', 'invalid'].includes(c.status) && c.resultado?.resultado !== 'reagendar';
const llStart = (c) => Date.parse(c.startTime);
const leadDe = (contactId) => state.leads.find((l) => l.id === contactId) || null;

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
    lead.s.directo_asistio ? '<span class="ll-chip">🔴 Vio el directo</span>' : '',
    watched(lead.s, 'clase1') || watched(lead.s, 'clase2') ? `<span class="ll-chip">🎬 Clases: ${[watched(lead.s, 'clase1') ? 1 : 0, watched(lead.s, 'clase2') ? 2 : 0].filter(Boolean).join(' y ')}</span>` : '',
    watched(lead.s, 'replay') >= 25 ? `<span class="ll-chip">📼 Grabación ${watched(lead.s, 'replay')}%</span>` : '',
    lead.s.encuesta ? '<span class="ll-chip">📋 Encuesta</span>' : '',
    lead.s.compra ? '<span class="ll-chip buy">✅ Ya compró Raíces</span>' : '',
  ].filter(Boolean).join('') : '<span class="ll-chip muted">No está entre los registros de este lanzamiento</span>';
  const phone = lead?.phone || '';
  const wa = lead?.phoneWa;
  return `<article class="ll-card ${pasada && !r && !llCancelada(c) ? 'pendiente' : ''} ${r ? `res-${r.id}` : ''} ${llCancelada(c) ? 'cancelada' : ''}">
    <div class="ll-when"><span class="ll-dia">${esc(cuando)}</span><span class="ll-hora">${esc(hora)}</span></div>
    <div class="ll-main">
      <div class="ll-name">${esc(lead?.name || c.title || 'Sin nombre')}
        ${etapa ? `<span class="ll-etapa" style="--c:${esc(etapa.color || '#8a817b')}" title="Etapa en el pipeline de GHL">${esc(etapa.name)}</span>` : '<span class="ll-etapa none" title="Aún no está en el pipeline: se añadirá al anotar el resultado">Sin etapa</span>'}
        ${llCancelada(c) ? '<span class="ll-etapa none">Cita cancelada</span>' : ''}</div>
      <div class="ll-contact">${phone ? `<a href="tel:${esc(phone)}">${icon('phone')}${esc(phone)}</a>` : ''}${wa ? `<a href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${lead?.email ? `<span class="muted">${esc(lead.email)}</span>` : ''}</div>
      <div class="ll-chips">${chips}</div>
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
  if (!L || L.code !== state.launchCode || L.loading) { top.innerHTML = '<p class="muted">Cargando llamadas de GHL…</p>'; box.innerHTML = ''; return; }
  if (L.error) { top.innerHTML = `<div class="notice err">No se pudieron cargar las llamadas: ${esc(L.error)}</div>`; box.innerHTML = ''; badge.hidden = true; return; }
  const d = L.data;
  if (!d.configurado) { top.innerHTML = `<div class="card empty"><h2>Llamadas de valoración</h2><p class="muted">${esc(d.motivo)}</p></div>`; box.innerHTML = ''; badge.hidden = true; return; }
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
      <div class="kpi static tone-buy"><span class="kpi-label"><span class="kpi-ico">${icon('cart')}</span>Ventas · conversión</span><span class="kpi-value">${m.ventas} <small class="ll-pct">${pct(m.conversion)}</small></span><span class="kpi-sub">sobre shows · ${m.seguimiento} en seguimiento · ${m.perdidas} no compran</span></div>
      <div class="kpi static ${m.sinResultado ? 'tone-accent' : ''}"><span class="kpi-label"><span class="kpi-ico">${icon('list')}</span>Sin anotar</span><span class="kpi-value">${m.sinResultado}</span><span class="kpi-sub">llamadas pasadas sin resultado</span></div>
    </div>
    ${d.pipeline ? `<div class="card ll-pipe"><h3>Pipeline · ${esc(d.pipeline.name)}</h3><div class="ll-stages">${d.pipeline.stages.map((s) => `<span class="ll-stage" style="--c:${esc(s.color || '#8a817b')}"><i></i>${esc(s.name)} <strong>${s.total}</strong></span>`).join('')}</div></div>` : ''}
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
}

// Diálogo para anotar el resultado
const lldlg = $('#llamada-dialog');
let llActual = null;
$('#ll-motivo').innerHTML = MOTIVOS.map((x) => `<option>${esc(x)}</option>`).join('');
const LL_EXPLICA = {
  venta: 'La cita se marca como realizada y la oportunidad pasa a «Venta» (ganada) en el pipeline.',
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
  $('#ll-sub').textContent = new Date(c.startTime).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
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
  if (b) openLlamada(b.dataset.ll);
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

// ---------- Inicio ----------
api('/api/me').then(start).catch((e) => {
  if (e.message !== 'Sesión caducada') notice(e.message, true);
  showLogin();
});
