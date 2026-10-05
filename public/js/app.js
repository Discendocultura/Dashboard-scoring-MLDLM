import {
  ESTADOS, NEXT_STEPS, buildMessage, tagFor, LAUNCH_CODE_RE, THRESHOLDS, watched, SNAPSHOT_TAGS, OUTCOMES,
} from './scoring.js';
import { enrichLead, computeMetrics, bySource, ventasPorDia } from './metrics.js';
import { PHASES, LINK_KEYS, phaseAt, barFor, formatLong } from './page.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const PAGE_SIZE = 100;

const state = {
  role: null,
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
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
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
    await api('/api/login', { method: 'POST', body: { password: $('#login-password').value } });
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
  showLogin();
});

// ---------- Arranque ----------
async function start() {
  const { role, config, zoomConfigured } = await api('/api/config');
  state.role = role;
  state.config = config;
  state.zoomConfigured = zoomConfigured;
  document.body.classList.toggle('is-admin', role === 'admin');
  $('#role-badge').textContent = role === 'admin' ? 'Admin' : 'Setter';
  $('#login').hidden = true;
  $('#app').hidden = false;
  fillStaticSelects();
  renderLaunchSelect();
  if (role === 'admin') api('/api/tags').then((d) => { state.tags = d.tags; fillTagList(); }).catch((e) => notice(e.message, true));
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
  await loadLeads();
}

// ---------- Carga de leads (paginada contra GHL) ----------
async function loadLeads() {
  if (state.compare) delete state.compare.cache[state.launchCode];
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
  renderKpis();
  renderHoy();
  renderMetrics();
  renderSnapshotWarning();
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
const card = (label, value, sub) => `<div class="kpi static"><span class="kpi-label">${label}</span><span class="kpi-value">${value}</span><span class="kpi-sub">${sub}</span></div>`;

function currentMetrics() {
  const launch = state.config.launches[state.launchCode];
  return computeMetrics(state.leads, launch, { metaSpend: state.meta?.configured && !state.meta.error ? state.meta.total : null });
}

function renderMetrics() {
  const launch = state.config.launches[state.launchCode];
  const m = currentMetrics();
  m.launch = launch;
  const directoCard = launch.fechaDirecto && launch.compraDateField
    ? card('Ventas en directo', m.compraDirecto, `${pctOf(m.compraDirecto, m.compra)} de las ventas · ${pctOf(m.compraDirecto, m.live)} de los asistentes`)
    : card('Ventas en directo', '–', 'Configura el día del directo y el campo de fecha de compra');
  $('#metric-cards').innerHTML = [
    card('Registros', m.total, m.clientaAnterior || m.vipAnterior ? `${m.vipAnterior} VIP y ${m.clientaAnterior} clientas de lanzamientos anteriores` : 'leads del lanzamiento'),
    ...(m.encuestaActiva ? [card('Encuesta rellenada', `${m.encuesta} <small class="muted">de ${m.total}</small>`, `${pctOf(m.encuesta, m.total)} de los registros`)] : []),
    card('Entradas VIP', m.vip, `${pctOf(m.vip, m.total)} de los registros`),
    card('Asistencia al directo', m.live, `${pctOf(m.live, m.total)} de los registros · ${pctOf(m.vipLive, m.vip)} de las VIP`),
    card('Compras totales', m.compra, `${pctOf(m.compra, m.total)} de los registros`),
    card('Llamadas agendadas', `${m.llamada} <small class="muted">de ${m.total}</small>`, `${pctOf(m.llamada, m.total)} de los registros · ${pctOf(m.compraLlamada, m.llamada)} compran`),
    directoCard,
  ].join('');

  renderEconomics(m, launch);
  renderVentasDia(launch);
  renderPago(m, launch);
  renderOrigen(m, launch);

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
    card('Inversión en anuncios', e.inversion ? eur(e.inversion) : '–', e.inversion ? fuente : 'Conecta Meta o introdúcela en Configuración'),
    card('Facturación', hasPrices ? eur(e.facturacion) : '–', hasPrices ? `VIP ${eur(e.facturacionVip)} · Raíces ${eur(e.facturacionPrograma)}${launch.fraccionadoTag || launch.unicoTag ? ` (${m.compraUnico} único · ${m.compraFraccionado} fraccionado)` : ''}` : 'Añade los precios en Configuración'),
    card('ROAS', e.roas != null && hasPrices ? `${e.roas.toFixed(2)}x` : '–', e.roas != null && hasPrices ? `Beneficio: ${eur(e.beneficio)}` : 'facturación / inversión'),
    card('Coste por lead', eur(e.cpl), e.cplFrio != null ? `${eur(e.cplFrio)} por lead de tráfico frío` : 'inversión / registros'),
    card('Coste por VIP', eur(e.cpVip), 'inversión / entradas VIP'),
    card('CAC', eur(e.cac), 'coste por clienta nueva de Raíces (inversión / ventas)'),
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

async function loadLaunchMetrics(code) {
  if (state.compare.cache[code]) return state.compare.cache[code];
  const launch = state.config.launches[code];
  const leads = [];
  let cursor = null;
  do {
    const qs = new URLSearchParams({ tag: launch.registroTag });
    if (cursor) qs.set('cursor', JSON.stringify(cursor));
    const page = await api(`/api/leads?${qs}`);
    leads.push(...page.contacts);
    cursor = page.cursor;
    progress(leads.length, page.total, `Comparar · ${launch.name}: ${leads.length}${page.total ? ` de ${page.total}` : ''} leads`);
  } while (cursor);
  let metaSpend = null;
  try {
    const meta = await api(`/api/meta?launch=${encodeURIComponent(code)}`);
    if (meta.configured && !meta.error) metaSpend = meta.total;
  } catch { /* sin Meta: se usa la inversión manual */ }
  const m = computeMetrics(leads.map((c) => enrichLead(c, code, state.config)), launch, { metaSpend });
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
const VIEWS = ['hoy', 'leads', 'metricas', 'comparar'];
function showView(view) {
  $$('.view-tab').forEach((x) => x.classList.toggle('active', x.dataset.view === view));
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== view;
  ls.set('lsd_view', view);
  if (view === 'comparar' && state.config) renderCompareSelector();
}
$$('.view-tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
showView(VIEWS.includes(ls.get('lsd_view')) ? ls.get('lsd_view') : 'leads');

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
    <div class="kpi static"><span class="kpi-label">Leads registrados</span><span class="kpi-value">${L.length}</span><span class="kpi-sub">${sent} contactados por WhatsApp</span></div>
    ${ESTADOS.map((e) => `
      <button type="button" class="kpi st-${e.id} ${f === e.id ? 'active' : ''}" data-estado="${e.id}" title="Filtrar por ${e.label}">
        <span class="kpi-label"><span class="dot"></span>${e.label}</span>
        <span class="kpi-value">${counts[e.id]}</span>
        <span class="kpi-sub">${pct(counts[e.id])} · ${e.min}+ puntos</span>
      </button>`).join('')}
    <div class="kpi static"><span class="kpi-label">Compraron VIP</span><span class="kpi-value">${vip}</span><span class="kpi-sub">${pct(vip)}</span></div>
    <div class="kpi static"><span class="kpi-label">Asistieron al directo</span><span class="kpi-value">${live}</span><span class="kpi-sub">${pct(live)}</span></div>
    <div class="kpi static"><span class="kpi-label">Vieron la grabación</span><span class="kpi-value">${replay}</span><span class="kpi-sub">${pct(replay)} (≥50%)</span></div>
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
    <td><div class="lead-name">${esc(l.name || '(sin nombre)')}</div><div class="lead-meta">${esc(l.email)}${l.phone ? ` · ${esc(l.phone)}` : ''}${l.s.trafico ? ` · ${l.s.trafico === 'frio' ? 'Tráfico frío' : 'Tráfico templado'}` : ''}</div></td>
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
  const byScore = (a, b) => b.score - a.score;
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
      <div><span class="lead-name">${esc(l.name || l.email)}</span> <span class="estado st-${l.estado.id}"><span class="dot"></span>${l.score}</span></div>
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
  { id: 'cfg-zoom-id', c: 'nuevo', label: 'ID de Zoom', key: 'zoomMeetingId' },
  { id: 'cfg-zoom-url', c: 'nuevo', label: 'Enlace genérico de Zoom', key: 'zoomJoinUrl', opcional: true },
  { id: 'cfg-inversion', c: 'nuevo', label: 'Inversión en anuncios', opcional: true },
  { id: 'cfg-meta-filtro', c: 'nuevo', label: 'Campañas de Meta', key: 'metaFiltro', opcional: true },
  { id: 'cfg-clase1-at', c: 'nuevo', label: 'Clase 1 · desbloqueo', key: 'clase1At' },
  { id: 'cfg-clase2-at', c: 'nuevo', label: 'Clase 2 · desbloqueo', key: 'clase2At' },
  { id: 'cfg-replay-video', c: 'nuevo', label: 'Vídeo de la grabación', key: 'replayVideoUrl', opcional: true },
  { id: 'cfg-whatsapp-url', c: 'nuevo', label: 'Grupo de WhatsApp', key: 'whatsappUrl' },
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
  { id: 'cfg-recursos-url', c: 'revisar', label: 'Página de recursos' },
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
  const missing = state.role === 'admin' && launch ? missingSnapshot(launch) : [];
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
  workflow: { label: 'Workflow', icon: svgIco('<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M6 8.5v1.5a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V8.5M12 13v2.5"/>') },
  pagina: { label: 'Página', icon: svgIco('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>') },
  formulario: { label: 'Formulario', icon: svgIco('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>') },
  encuesta: { label: 'Encuesta', icon: svgIco('<path d="M9 11l2 2 4-4"/><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 17h8"/>') },
  calendario: { label: 'Calendario', icon: svgIco('<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>') },
  email: { label: 'Email / campaña', icon: svgIco('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>') },
  pago: { label: 'Pago / producto', icon: svgIco('<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6.5 15h4"/>') },
  otro: { label: 'Otro enlace', icon: svgIco('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>') },
};
const ACCESOS_SUGERIDOS = [
  ['workflow', 'Workflow · formulario de registro'], ['workflow', 'Workflow · encuesta rellenada'], ['workflow', 'Workflow · compra'],
  ['workflow', 'Workflow · bonus'], ['workflow', 'Workflow · llamada agendada'], ['encuesta', 'Encuesta del avatar'],
  ['formulario', 'Formulario de registro'], ['pagina', 'Página de recursos (editor)'],
];
// Para accesos guardados antes de que hubiera tipo: se deduce del nombre.
const guessTipo = (nombre) => (/workflow/i.test(nombre) ? 'workflow' : /encuesta/i.test(nombre) ? 'encuesta' : /formulario/i.test(nombre) ? 'formulario'
  : /p[aá]gina|landing|funnel|embudo/i.test(nombre) ? 'pagina' : /calendario|agenda/i.test(nombre) ? 'calendario' : /email|campa/i.test(nombre) ? 'email' : 'otro');

const accesoRow = (tipo = 'workflow', nombre = '', url = '') => {
  const t = ACCESO_TIPOS[tipo] ? tipo : 'otro';
  return `<div class="acceso-row">
  <span class="acc-ico acc-${t}" title="${esc(ACCESO_TIPOS[t].label)}">${ACCESO_TIPOS[t].icon}</span>
  <select class="acc-tipo" aria-label="Tipo">${Object.entries(ACCESO_TIPOS).map(([k, v]) => `<option value="${k}"${k === t ? ' selected' : ''}>${v.label}</option>`).join('')}</select>
  <input class="acc-nombre" value="${esc(nombre)}" placeholder="Nombre" maxlength="60" aria-label="Nombre">
  <input class="acc-url" type="url" value="${esc(url)}" placeholder="Pega aquí la URL" aria-label="URL">
  <a class="btn acc-open" target="_blank" rel="noopener"${url ? ` href="${esc(url)}"` : ' aria-disabled="true"'}>Abrir ↗</a>
  <button type="button" class="btn acc-del" title="Quitar">✕</button></div>`;
};

function renderAccesosEditor(accesos) {
  // Los sugeridos que aún no estén en la lista se añaden al final, vacíos.
  const list = (accesos || []).map((a) => ({ ...a, tipo: a.tipo || guessTipo(a.nombre) }));
  for (const [tipo, nombre] of ACCESOS_SUGERIDOS) if (!list.some((a) => a.nombre === nombre)) list.push({ tipo, nombre, url: '' });
  $('#cfg-accesos').innerHTML = list.map((a) => accesoRow(a.tipo, a.nombre, a.url)).join('');
}

function readAccesosEditor() {
  return $$('#cfg-accesos .acceso-row')
    .map((r) => ({ tipo: $('.acc-tipo', r).value, nombre: $('.acc-nombre', r).value.trim(), url: $('.acc-url', r).value.trim() }))
    .filter((a) => a.nombre);
}

$('#btn-add-acceso').addEventListener('click', () => {
  $('#cfg-accesos').insertAdjacentHTML('beforeend', accesoRow());
  $('#cfg-accesos .acceso-row:last-child .acc-nombre').focus();
});
$('#cfg-accesos').addEventListener('click', (e) => { if (e.target.closest('.acc-del')) e.target.closest('.acceso-row').remove(); });
$('#cfg-accesos').addEventListener('change', (e) => {
  if (!e.target.classList.contains('acc-tipo')) return;
  const t = e.target.value;
  const ico = $('.acc-ico', e.target.closest('.acceso-row'));
  ico.className = `acc-ico acc-${t}`;
  ico.title = ACCESO_TIPOS[t].label;
  ico.innerHTML = ACCESO_TIPOS[t].icon;
});
$('#cfg-accesos').addEventListener('input', (e) => {
  if (!e.target.classList.contains('acc-url')) return;
  const a = $('.acc-open', e.target.closest('.acceso-row'));
  const url = e.target.value.trim();
  if (/^https:\/\//i.test(url)) { a.href = url; a.removeAttribute('aria-disabled'); } else { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); }
});

// Textos de la página: los fijos (bloque de clases) + los que añada a mano.
const textoRow = (k = '', v = '') => `<div class="enlace-row texto-row">
  <input class="txt-key" value="${esc(k)}" placeholder="nombre-del-texto" pattern="[a-z0-9\\-]{2,40}">
  <textarea class="txt-val" rows="1" placeholder="Texto">${esc(v)}</textarea>
  <button type="button" class="btn txt-del" title="Quitar">✕</button></div>`;

function renderTextosEditor(textos) {
  const fixed = new Set();
  $$('#cfg-textos-fijos [data-texto]').forEach((el) => { fixed.add(el.dataset.texto); el.value = textos[el.dataset.texto] || ''; });
  $('#cfg-textos').innerHTML = Object.entries(textos).filter(([k]) => !fixed.has(k)).map(([k, v]) => textoRow(k, v)).join('');
}

function readTextosEditor() {
  const out = {};
  $$('#cfg-textos .texto-row').forEach((r) => {
    const k = $('.txt-key', r).value.trim().toLowerCase();
    const v = $('.txt-val', r).value.trim();
    if (k && v) out[k] = v;
  });
  $$('#cfg-textos-fijos [data-texto]').forEach((el) => { if (el.value.trim()) out[el.dataset.texto] = el.value.trim(); });
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
    <p class="muted">Barra: «${esc(bar.text.replace('{cuenta}', '⏳'))}»${p.id === 'en_directo' ? ' · la página de recursos redirige al directo' : (p.id === 'replay' || p.id === 'cerrado') ? ' · la página de recursos redirige a la grabación' : ''}</p>`;
}

$('#btn-preview').addEventListener('click', async () => {
  const l = editingCode && state.config.launches[editingCode];
  const at = $('#cfg-preview-at').value;
  if (!l?.recursosUrl) return window.alert('Guarda primero la URL de la página de recursos.');
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

// ---------- Inicio ----------
api('/api/me').then(start).catch((e) => {
  if (e.message !== 'Sesión caducada') notice(e.message, true);
  showLogin();
});
