import {
  signalsFor, score, estadoFor, ESTADOS, nextStepFor, NEXT_STEPS, buildMessage, waPhone, tagFor, LAUNCH_CODE_RE,
  THRESHOLDS, watched, SNAPSHOT_TAGS,
} from './scoring.js';

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
    state.leads = out.map((c) => enrich(c, launch));
    state.page = 0;
    render();
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

// Las ventas de un lanzamiento terminan cuando empieza la captación del siguiente.
function nextLaunchStart(code) {
  const start = state.config.launches[code]?.inicioCaptacion;
  if (!start) return '';
  return Object.values(state.config.launches).map((l) => l.inicioCaptacion).filter((d) => d && d > start).sort()[0] || '';
}

function enrich(contact, launch) {
  const s = signalsFor(contact.tags, state.launchCode, { ...launch, finVentas: nextLaunchStart(state.launchCode) }, contact);
  const pts = score(s);
  return {
    ...contact,
    s,
    score: pts,
    estado: estadoFor(pts),
    step: nextStepFor(s),
    phoneWa: waPhone(contact.phone, state.config.defaultCountryCode),
    search: `${contact.name} ${contact.email} ${contact.phone}`.toLowerCase(),
  };
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

function funnelStats() {
  const L = state.leads;
  const launch = state.config.launches[state.launchCode];
  const c = (fn) => L.filter(fn).length;
  const viewedReplay = (l) => watched(l.s, 'replay') >= 25;
  return {
    launch,
    total: L.length,
    clase1: c((l) => watched(l.s, 'clase1') >= 25),
    clase2: c((l) => watched(l.s, 'clase2') >= 25),
    vip: c((l) => l.s.vip),
    click: c((l) => l.s.directo_click || l.s.directo_asistio),
    live: c((l) => l.s.directo_asistio),
    liveFinal: c((l) => l.s.directo_final),
    replay: c(viewedReplay),
    compra: c((l) => l.s.compra),
    compraVip: c((l) => l.s.compra && l.s.vip),
    noVip: c((l) => !l.s.vip),
    compraNoVip: c((l) => l.s.compra && !l.s.vip),
    vipLive: c((l) => l.s.vip && l.s.directo_asistio),
    compraLive: c((l) => l.s.compra && l.s.directo_asistio),
    compraFinal: c((l) => l.s.compra && l.s.directo_final),
    soloReplay: c((l) => !l.s.directo_asistio && viewedReplay(l)),
    compraSoloReplay: c((l) => l.s.compra && !l.s.directo_asistio && viewedReplay(l)),
    nada: c((l) => !l.s.directo_asistio && !viewedReplay(l)),
    compraNada: c((l) => l.s.compra && !l.s.directo_asistio && !viewedReplay(l)),
    compraDirecto: c((l) => l.s.compra_directo),
    compraDirectoAsist: c((l) => l.s.compra_directo && l.s.directo_asistio),
    frio: c((l) => l.s.trafico === 'frio'),
    templado: c((l) => l.s.trafico === 'templado'),
    compraFrio: c((l) => l.s.compra && l.s.trafico === 'frio'),
    compraTemplado: c((l) => l.s.compra && l.s.trafico === 'templado'),
    vipAnterior: c((l) => l.s.vip_anterior),
    clientaAnterior: c((l) => l.s.clienta_anterior),
  };
}

function renderMetrics() {
  const m = funnelStats();
  const card = (label, value, sub) => `<div class="kpi static"><span class="kpi-label">${label}</span><span class="kpi-value">${value}</span><span class="kpi-sub">${sub}</span></div>`;
  const directoCard = m.launch.fechaDirecto && m.launch.compraDateField
    ? card('Ventas en directo', m.compraDirecto, `${pctOf(m.compraDirecto, m.compra)} de las ventas · ${pctOf(m.compraDirecto, m.live)} de los asistentes`)
    : card('Ventas en directo', '–', 'Configura el día del directo y el campo de fecha de compra');
  $('#metric-cards').innerHTML = [
    card('Registros', m.total, m.clientaAnterior || m.vipAnterior ? `${m.vipAnterior} VIP y ${m.clientaAnterior} clientas de lanzamientos anteriores` : 'leads del lanzamiento'),
    card('Entradas VIP', m.vip, `${pctOf(m.vip, m.total)} de los registros`),
    card('Asistencia al directo', m.live, `${pctOf(m.live, m.total)} de los registros · ${pctOf(m.vipLive, m.vip)} de las VIP`),
    card('Compras totales', m.compra, `${pctOf(m.compra, m.total)} de los registros`),
    card('Compras de VIP', m.compraVip, `${pctOf(m.compraVip, m.vip)} de las VIP`),
    directoCard,
  ].join('');

  const steps = [
    ['Registros', m.total],
    ['Empezaron la clase 1', m.clase1, '≥25% visto'],
    ['Empezaron la clase 2', m.clase2, '≥25% visto'],
    ['Compraron entrada VIP', m.vip],
    ['Pulsaron el enlace del directo', m.click],
    ['Asistieron al directo', m.live],
    ['Directo hasta el final', m.liveFinal],
    ['Vieron la grabación', m.replay, '≥25% visto'],
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
  ];
  if (m.launch.fechaDirecto && m.launch.compraDateField) rows.splice(4, 0, ['Asistieron al directo y compraron ese mismo día', m.live, m.compraDirectoAsist]);
  renderTraffic(m);
  $('#conversion-table').innerHTML = `
    <thead><tr><th>Segmento</th><th class="num">Leads</th><th class="num">Compras</th><th class="num">Conversión</th></tr></thead>
    <tbody>${rows.map(([label, n, buy]) => `<tr><td>${label}</td><td class="num">${n}</td><td class="num">${buy}</td><td class="num big">${pctOf(buy, n)}</td></tr>`).join('')}</tbody>`;

  $('#estado-table').innerHTML = `
    <thead><tr><th>Estado</th><th class="num">Leads</th><th class="num">Compras</th><th class="num">Conversión</th></tr></thead>
    <tbody>${ESTADOS.map((e) => {
    const inE = state.leads.filter((l) => l.estado.id === e.id);
    const buy = inE.filter((l) => l.s.compra).length;
    return `<tr><td><span class="estado st-${e.id}"><span class="dot"></span>${e.label}</span></td><td class="num">${inE.length}</td><td class="num">${buy}</td><td class="num big">${pctOf(buy, inE.length)}</td></tr>`;
  }).join('')}</tbody>`;
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

$$('.view-tab').forEach((t) => t.addEventListener('click', () => {
  $$('.view-tab').forEach((x) => x.classList.toggle('active', x === t));
  $('#view-leads').hidden = t.dataset.view !== 'leads';
  $('#view-metricas').hidden = t.dataset.view !== 'metricas';
  ls.set('lsd_view', t.dataset.view);
}));
if (ls.get('lsd_view') === 'metricas') $('.view-tab[data-view="metricas"]').click();

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
    <td><div class="wa-cell">${waBtn}${l.step === 'comprado' ? '' : `<span class="wa-step">${NEXT_STEPS[l.step]}</span>`}</div></td>
  </tr>`;
}

function messageFor(l) {
  const launch = state.config.launches[state.launchCode];
  return buildMessage(state.config.templates[l.step], { nombre: l.firstName, contactId: l.id, launch });
}

// ---------- WhatsApp ----------
$('#leads-body').addEventListener('click', async (e) => {
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
    : { vipTag: last.vipTag, compraTag: last.compraTag, compraDateField: last.compraDateField, inicioCaptacion: new Date().toISOString().slice(0, 10) };
  $('#cfg-code').value = editingCode || '';
  $('#cfg-code').readOnly = Boolean(editingCode);
  $('#cfg-name').value = l.name || '';
  $('#cfg-registro').value = l.registroTag || '';
  $('#cfg-vip').value = l.vipTag || '';
  $('#cfg-compra').value = l.compraTag || '';
  $('#cfg-inicio').value = l.inicioCaptacion || '';
  $('#cfg-directo-fecha').value = l.fechaDirecto || '';
  fillDateFields(l.compraDateField);
  $('#cfg-zoom-id').value = l.zoomMeetingId || '';
  $('#cfg-zoom-url').value = l.zoomJoinUrl || '';
  $('#cfg-replay').value = l.replayUrl || '';
  $('#cfg-raices').value = l.raicesUrl || '';
  $('#cfg-venta').value = l.ventaUrl || '';
  $('#cfg-llamada').value = l.llamadaUrl || '';
  $('#tpl-grabacion').value = state.config.templates.grabacion;
  $('#tpl-raices').value = state.config.templates.raices;
  $('#tpl-cierre').value = state.config.templates.cierre;
  $('#cfg-country').value = state.config.defaultCountryCode || '34';
  $('#cfg-status').textContent = '';
  renderSnippets();
  renderSnapshotBox();
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
      compraDateField: $('#cfg-compra-fecha').value,
      inicioCaptacion: $('#cfg-inicio').value,
      fechaDirecto: $('#cfg-directo-fecha').value,
      zoomMeetingId: $('#cfg-zoom-id').value,
      zoomJoinUrl: $('#cfg-zoom-url').value.trim(),
      replayUrl: $('#cfg-replay').value.trim(),
      raicesUrl: $('#cfg-raices').value.trim(),
      ventaUrl: $('#cfg-venta').value.trim(),
      llamadaUrl: $('#cfg-llamada').value.trim(),
    },
  };
}

$('#cfg-save').addEventListener('click', async () => {
  const status = $('#cfg-status');
  try {
    const { code, launch } = readForm();
    if (state.tags.length && !state.tags.map((t) => t.toLowerCase()).includes(launch.registroTag)) {
      if (!window.confirm(`La etiqueta "${launch.registroTag}" no existe en GHL todavía. ¿Guardar igualmente?`)) return;
    }
    const next = {
      ...state.config,
      defaultCountryCode: $('#cfg-country').value,
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
    notice(`No se pudo completar la foto de VIP/clientas anteriores: ${e.message}`, true);
  } finally {
    progress(null);
  }
}

function snapshotSummary(launch) {
  const s = launch.snapshot;
  if (!s) return '';
  const parts = SNAPSHOT_TAGS.filter((f) => s.tags?.[f.field]).map((f) => `${s.counts[f.field] ?? 0} con «${esc(s.tags[f.field])}»`);
  return `Foto hecha el ${new Date(s.at).toLocaleString('es-ES')}: ${parts.join(', ')}. No cuentan como VIP ni como compra de este lanzamiento.`;
}

function renderSnapshotBox() {
  const box = $('#cfg-snapshot');
  const launch = editingCode && state.config.launches[editingCode];
  if (!launch) {
    box.innerHTML = '<p class="muted">Al guardar se hará una «foto» de quién tiene ya las etiquetas de VIP y de compra, para no contarlas como de este lanzamiento. Crea el lanzamiento <strong>antes de abrir la venta de la VIP</strong>.</p>';
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
  el.innerHTML = `<p><strong>Falta la foto de VIP/clientas anteriores</strong> (${missing.map((f) => `«${esc(launch[f.field])}»`).join(', ')}). Mientras tanto, quien compró en lanzamientos anteriores cuenta como VIP/compra de este. Hazla antes de abrir la venta.</p>
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

function renderSnippets() {
  const code = editingCode;
  const box = $('#snippets');
  if (!code) { box.innerHTML = '<p class="muted">Guarda el lanzamiento para ver sus códigos.</p>'; return; }
  const origin = location.origin;
  const video = (v, label) => `<div data-lsd-video="${v}" data-vimeo="https://vimeo.com/ID_DEL_VIDEO_${label}" data-launch="${code}"></div>\n<script src="${origin}/tracker.js" defer></script>`;
  const items = [
    ['Página Clase 1 (bloque Código HTML)', video('clase1', 'CLASE1')],
    ['Página Clase 2 (bloque Código HTML)', video('clase2', 'CLASE2')],
    ['Página de la grabación (bloque Código HTML)', video('replay', 'GRABACION')],
    ['Enlace al directo para emails de GHL', `${origin}/directo?l=${code}&cid={{contact.id}}`],
    ['Enlace al directo para el grupo de WhatsApp (pide el email)', `${origin}/directo?l=${code}`],
    ['Enlaces a las clases en emails de GHL (añádelo al final de la URL)', '?cid={{contact.id}}'],
  ];
  box.innerHTML = items.map(([title, text], i) => `
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
