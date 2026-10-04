import {
  signalsFor, score, estadoFor, ESTADOS, nextStepFor, NEXT_STEPS, buildMessage, waPhone, tagFor, LAUNCH_CODE_RE,
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

function enrich(contact, launch) {
  const s = signalsFor(contact.tags, state.launchCode, launch.vipTag);
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
    if (f.signal === 'replay_50') return l.s.replay_50 || l.s.replay_90;
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
  const rows = filtered();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.page = Math.min(Math.max(0, state.page), pages - 1);
  const slice = rows.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);
  $('#leads-body').innerHTML = slice.map(rowHtml).join('')
    || '<tr><td colspan="9" class="muted">No hay leads con estos filtros.</td></tr>';
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

function renderKpis() {
  const L = state.leads;
  const counts = Object.fromEntries(ESTADOS.map((e) => [e.id, 0]));
  let vip = 0; let live = 0; let replay = 0; let sent = 0;
  for (const l of L) {
    counts[l.estado.id]++;
    if (l.s.vip) vip++;
    if (l.s.directo_asistio) live++;
    if (l.s.replay_50 || l.s.replay_90) replay++;
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
  if (s[`${v}_90`]) return chip('Completo', 'on');
  if (s[`${v}_50`]) return chip('50%', 'half');
  return chip('—');
}

function liveChip(s) {
  if (s.directo_final) return chip('Hasta el final', 'on');
  if (s.directo_60) return chip('+60 min', 'on');
  if (s.directo_asistio) return chip('Asistió', 'half');
  if (s.directo_click) return chip('Clic', 'half');
  return chip('—');
}

function rowHtml(l) {
  const msgPreview = messageFor(l);
  const waBtn = l.phoneWa
    ? `<button type="button" class="btn wa ${l.s.wa_enviado ? 'sent' : ''}" data-wa="${esc(l.id)}" title="${esc(msgPreview)}">${l.s.wa_enviado ? 'Enviado ✓ · reenviar' : 'Enviar WhatsApp'}</button>`
    : '<span class="muted">Sin teléfono</span>';
  return `<tr>
    <td><div class="lead-name">${esc(l.name || '(sin nombre)')}</div><div class="lead-meta">${esc(l.email)}${l.phone ? ` · ${esc(l.phone)}` : ''}</div></td>
    <td>${videoChip(l.s, 'clase1')}</td>
    <td>${videoChip(l.s, 'clase2')}</td>
    <td>${l.s.vip ? chip('VIP', 'on') : chip('—')}</td>
    <td>${liveChip(l.s)}</td>
    <td>${videoChip(l.s, 'replay')}</td>
    <td class="num"><span class="score">${l.score}</span></td>
    <td><span class="estado st-${l.estado.id}"><span class="dot"></span>${l.estado.label}</span></td>
    <td><div class="wa-cell">${waBtn}<span class="wa-step">${NEXT_STEPS[l.step]}</span></div></td>
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
  const head = ['Nombre', 'Email', 'Teléfono', 'Clase 1', 'Clase 2', 'VIP', 'Directo', 'Grabación', 'Puntos', 'Estado', 'Siguiente mensaje', 'Contactado'];
  const v = (s, k) => (s[`${k}_90`] ? '90%' : s[`${k}_50`] ? '50%' : '');
  const live = (s) => (s.directo_final ? 'Hasta el final' : s.directo_60 ? '+60 min' : s.directo_asistio ? 'Asistió' : s.directo_click ? 'Clic' : '');
  const lines = filtered().map((l) => [l.name, l.email, l.phone, v(l.s, 'clase1'), v(l.s, 'clase2'), l.s.vip ? 'Sí' : '', live(l.s), v(l.s, 'replay'), l.score, l.estado.label, NEXT_STEPS[l.step], l.s.wa_enviado ? 'Sí' : '']);
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
  if (!state.zoomConfigured) return notice('Zoom no está conectado todavía (faltan las variables ZOOM_* en Vercel).', true);
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

function fillTagList() {
  $('#tag-list').innerHTML = state.tags.map((t) => `<option value="${esc(t)}">`).join('');
}

function openConfig(code) {
  editingCode = code && state.config.launches[code] ? code : null;
  const pick = $('#cfg-launch-pick');
  pick.innerHTML = '<option value="">— Nuevo lanzamiento —</option>'
    + launchesSorted().map(([c, l]) => `<option value="${esc(c)}">${esc(l.name)} (${esc(c)})</option>`).join('');
  pick.value = editingCode || '';
  const l = editingCode ? state.config.launches[editingCode] : {};
  $('#cfg-code').value = editingCode || '';
  $('#cfg-code').readOnly = Boolean(editingCode);
  $('#cfg-name').value = l.name || '';
  $('#cfg-registro').value = l.registroTag || '';
  $('#cfg-vip').value = l.vipTag || '';
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
    const { config } = await api('/api/config', { method: 'POST', body: next });
    state.config = config;
    editingCode = code;
    $('#cfg-code').readOnly = true;
    status.textContent = 'Guardado ✓';
    renderLaunchSelect();
    renderSnippets();
    await selectLaunch(code);
  } catch (e) {
    status.textContent = '';
    window.alert(e.message);
  } finally {
    $('#cfg-save').disabled = false;
  }
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
