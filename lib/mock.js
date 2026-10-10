// Datos falsos para probar el dashboard en local sin tocar GHL ni Zoom (GHL_MOCK=1).
import { clienteActual } from './cliente.js';
const NAMES = ['Lucía', 'María', 'Paula', 'Laura', 'Marta', 'Ana', 'Elena', 'Sara', 'Carmen', 'Irene', 'Nuria', 'Cristina'];
const SURNAMES = ['García', 'López', 'Martín', 'Sánchez', 'Pérez', 'Gómez', 'Ruiz', 'Díaz', 'Moreno', 'Romero'];

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const chance = (p) => rand() < p;

// Un estado por cliente (como si cada uno tuviera su GHL). El principal trae los datos de prueba.
const estados = new Map();
const cur = () => {
  const id = clienteActual().id;
  if (!estados.has(id)) estados.set(id, { contacts: [], customValues: new Map(), registrants: new Map(), opps: [], events: [], vslEvents: [] });
  return estados.get(id);
};
const state = new Proxy({}, { get: (_, k) => cur()[k], set: (_, k, v) => { cur()[k] = v; return true; } });

function init() {
  if (state.inited) return;
  state.inited = true;
  if (!clienteActual().principal) return; // los demás clientes empiezan vacíos
  for (let i = 0; i < 1850; i++) {
    const first = NAMES[i % NAMES.length];
    const last = SURNAMES[Math.floor(rand() * SURNAMES.length)];
    const tags = ['registro-webinar-demo'];
    for (const [v, p] of [['clase1', 0.65], ['clase2', 0.5]]) {
      for (const t of [25, 50, 75, 90]) {
        if (!chance(t === 25 ? p : 0.75)) break;
        tags.push(`demo_${v}_${t}`);
      }
    }
    const vip = chance(0.08);
    if (vip) tags.push('compra-vip-demo');
    if (chance(0.45)) tags.push('demo_directo_click');
    for (const t of [25, 50, 75, 90]) {
      if (!chance(t === 25 ? 0.25 : 0.7)) break;
      tags.push(`demo_replay_${t}`);
    }
    // Clientas de lanzamientos anteriores (compraron en marzo).
    const cf = {};
    if (chance(0.04)) {
      tags.push('clienta-raices');
      cf.mockFechaCompraRaices = '2026-03-12T00:00:00.000Z';
    }
    // Respuestas de la encuesta (deterministas para no cambiar el resto de datos de prueba).
    if (i % 5 !== 0) {
      cf['0lVfpThUn3rOkt5nalEp'] = 27 + ((i * 7) % 18);
      cf.jgsgct0q45CnzoAL0QG0 = [['0 - 6 meses'], ['6 - 12 meses'], ['Más de 1 año'], ['Todavía no he empezado a buscar']][i % 4];
      cf.Ez1HWRYbBv5LXyHNPCQW = ['El estrés', 'el estrés.', 'Mis hormonas', 'No lo sé', 'La edad', `Algo concreto ${i % 30}`][(i >> 1) % 6];
      cf.v4zDuixEurBx4MY7JofI = [['Tiras de ovulación'], ['Tiras de ovulación', 'Buscar información en internet'], ['Leer libros', 'Remedios naturales'], ['Ir a la consulta de un profesional (Ginecólogo, matrona...)'], ['Buscar información en internet']][(i >> 2) % 5];
      if (i % 7 === 0) cf.H3Q8asVCA89m3vaqFNSu = 'Acupuntura'; // respuestas antiguas (texto libre)
    }
    // Respuestas del formulario de reserva de la llamada (deterministas).
    if (i % 3 === 0) {
      cf.mockMotivoLlamada = ['Quiero saber si el programa es para mí', 'Llevo 2 años y estoy agotada, necesito un plan', 'Dudas sobre el precio y los plazos'][i % 3 === 0 ? (i / 3) % 3 : 0];
      cf.mockInversion = ['Sí, ahora mismo', 'Sí, si me encaja', 'Necesito pensarlo'][(i / 3) % 3];
    }
    const warm = chance(0.4);
    state.contacts.push({
      id: `mock${String(i).padStart(5, '0')}`,
      firstName: first,
      name: `${first} ${last}`,
      email: `${first}.${last}.${i}@example.com`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
      phone: chance(0.9) ? `+346${String(10000000 + i * 37).slice(0, 8)}` : '',
      tags,
      dateAdded: warm
        ? new Date(Date.UTC(2025, 2, 1) + i * 3_600_000).toISOString()
        : new Date(Date.UTC(2026, 9, 1, 8) + i * 300_000).toISOString(),
      cf,
      src: chance(0.75)
        ? { source: 'ig', medium: 'paid', campaign: ['1201', '1202', '1203'][i % 3], term: `22${i % 6}`, content: `33${i % 9}` }
        : { source: chance(0.5) ? 'email' : '', medium: '', campaign: '', term: '', content: '' },
    });
    // 1 de cada 20: registro desde un formulario instantáneo de Meta (sin UTM; IDs en campos propios).
    if (i % 20 === 7) {
      const last2 = state.contacts[state.contacts.length - 1];
      last2.src = { source: '', medium: '', campaign: '', term: '', content: '' };
      last2.cf = { ...last2.cf, mockFbCampaign: '1203', mockFbAdset: '225', mockFbAd: '338' };
    }
  }
  initVsl();
  initDirecta();
}

// Embudo VSL: 420 registros repartidos en los últimos 75 días (deterministas, sin tocar los de arriba).
export const VSL_CAL = '6pgezBW77b9AMkJ8aqDJ';
function initVsl() {
  const day = 86_400_000;
  const hoy = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 9);
  for (let i = 0; i < 420; i++) {
    const first = NAMES[(i * 5) % NAMES.length];
    const last = SURNAMES[(i * 3) % SURNAMES.length];
    const added = hoy - (i % 75) * day + ((i * 7919) % 36_000_000);
    const tags = ['et-registro-vsl-búsqueda'];
    const cf = {};
    if (i % 3 !== 0) {
      tags.push('et-ve-vsl-raices');
      const nivel = i % 5; // 0 → nada medido, 4 → 90%
      [25, 50, 75, 90].slice(0, nivel).forEach((t) => tags.push(`vsl_vsl_${t}`));
    }
    if (i % 13 === 0) {
      tags.push('et-compra-raices-vsl');
      cf.mockFechaCompraVsl = new Date(added + (i % 6) * day).toISOString();
    }
    state.contacts.push({
      id: `mockv${String(i).padStart(4, '0')}`,
      firstName: first,
      name: `${first} ${last} V`,
      email: `${first}.${last}.v${i}@example.com`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
      phone: i % 9 ? `+346${String(20000000 + i * 41).slice(0, 8)}` : '',
      tags,
      dateAdded: new Date(added).toISOString(),
      cf,
      src: i % 4
        ? { source: 'fb', medium: 'paid', campaign: ['1301', '1302'][i % 2], term: `23${i % 4}`, content: `34${i % 6}` }
        : { source: '', medium: '', campaign: '', term: '', content: '' },
    });
  }
}

// Venta directa (low ticket): 300 compradoras en los últimos 60 días, con bumps, upsell y downsell (deterministas).
function initDirecta() {
  const day = 86_400_000;
  const hoy = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 10);
  for (let i = 0; i < 300; i++) {
    const first = NAMES[(i * 7) % NAMES.length];
    const last = SURNAMES[(i * 5) % SURNAMES.length];
    const added = hoy - (i % 60) * day - ((i * 4093) % 30_000_000);
    const tags = ['compra-guia-sueno'];
    if (i % 3 === 0) tags.push('bump-audios-guia');
    if (i % 5 === 1) tags.push('bump-checklist');
    const upsell = i % 7 === 0;
    if (upsell) tags.push('upsell-curso-sueno');
    else if (i % 4 === 2) tags.push('downsell-minicurso');
    state.contacts.push({
      id: `mockd${String(i).padStart(4, '0')}`,
      firstName: first,
      name: `${first} ${last} LT`,
      email: `${first}.${last}.lt${i}@example.com`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
      phone: i % 6 ? `+346${String(30000000 + i * 43).slice(0, 8)}` : '',
      tags,
      dateAdded: new Date(added).toISOString(),
      cf: {},
      src: { source: 'fb', medium: 'paid', campaign: '1401', term: '241', content: `35${i % 3}` },
    });
  }
}

export function removeTags(id, tags) {
  init();
  const c = state.contacts.find((x) => x.id === id);
  if (!c) throw Object.assign(new Error('Contacto no encontrado'), { status: 404 });
  c.tags = c.tags.filter((t) => !tags.includes(t));
}

// Impresiones, clics y visitas de prueba proporcionales al gasto (CPM ~9 €, CTR ~1,4 %, 80 % de las visitas cargan).
const statsMock = (gasto) => {
  const imp = Math.round(gasto * 110);
  const clics = Math.round(imp * 0.014);
  return { impressions: String(imp), inline_link_clicks: String(clics), actions: [{ action_type: 'landing_page_view', value: String(Math.round(clics * 0.8)) }, { action_type: 'lead', value: String(Math.round(clics * 0.8 * 0.3)) }] };
};
export const metaInsights = () => ({
  ads: [
    ...['1301', '1302'].flatMap((camp, ci) => [0, 1, 2].map((k) => ({
      campaign_id: camp, campaign_name: ['VSL · Frío intereses', 'VSL · Retargeting'][ci],
      adset_id: `23${(ci * 2 + k) % 4}`, adset_name: `Conjunto VSL ${(ci * 2 + k) % 4 + 1}`,
      ad_id: `34${ci * 3 + k}`, ad_name: `Anuncio VSL ${ci * 3 + k + 1} · ${['Vídeo matrona', 'Testimonio', 'Carrusel'][k]}`,
      spend: String(120 + ci * 90 + k * 35),
      ...statsMock(120 + ci * 90 + k * 35),
    }))),
    ...[0, 1].map((k) => ({
      campaign_id: '1401', campaign_name: 'LT-guia · Frío',
      adset_id: '241', adset_name: 'Conjunto low ticket',
      ad_id: `35${k}`, ad_name: `Anuncio guía ${k + 1}`,
      spend: String(420 + k * 180),
      ...statsMock(420 + k * 180),
    })),
    ...['1201', '1202', '1203'].flatMap((camp, ci) => [0, 1, 2].map((k) => ({
      campaign_id: camp, campaign_name: ['Webinar · Frío intereses', 'Webinar · Lookalike compradoras', 'Webinar · Retargeting'][ci],
      adset_id: `22${(ci * 2 + k) % 6}`, adset_name: `Conjunto ${(ci * 2 + k) % 6 + 1}`,
      ad_id: `33${ci * 3 + k}`, ad_name: `Anuncio ${ci * 3 + k + 1} · ${['Vídeo testimonio', 'Carrusel', 'Reel matrona'][k]}`,
      spend: String(Math.round(150 + (ci * 3 + k) * 37 % 450)),
      ...statsMock(150 + (ci * 3 + k) * 37 % 450),
    }))),
  ],
});

export function listTags() {
  init();
  return [...new Set(state.contacts.flatMap((c) => c.tags).concat(['et-lista-general', 'clienta-raices']))].sort();
}

export function contactsByTag(tag, cursor, fields = [], { orden = 'asc' } = {}) {
  init();
  const all = state.contacts.filter((c) => c.tags.includes(tag));
  if (orden === 'desc') all.sort((a, b) => String(b.dateAdded).localeCompare(String(a.dateAdded)));
  const start = cursor ? Number(cursor[0]) : 0;
  const page = structuredClone(all.slice(start, start + 100)).map((c) => ({
    ...c, cf: Object.fromEntries(Object.entries(c.cf || {}).filter(([k]) => fields.includes(k))),
  }));
  return { contacts: page, total: all.length, cursor: start + 100 < all.length ? [start + 100] : null };
}

export function countByTag(tag) {
  init();
  return state.contacts.filter((c) => c.tags.includes(tag)).length;
}

export function getContact(id) {
  init();
  return structuredClone(state.contacts.find((c) => c.id === id) || null);
}

export function findContactByEmail(email) {
  init();
  return structuredClone(state.contacts.find((c) => c.email === email.trim().toLowerCase()) || null);
}

export function addTags(id, tags) {
  init();
  const c = state.contacts.find((x) => x.id === id);
  if (!c) throw Object.assign(new Error('Contacto no encontrado'), { status: 404 });
  for (const t of tags) if (!c.tags.includes(t)) c.tags.push(t);
}

export const getCustomValue = (name) => (state.customValues.has(name) ? { id: name, name, value: state.customValues.get(name) } : null);
export const listCustomValues = () => [...state.customValues].map(([name, value]) => ({ id: name, name, value }));
export const saveCustomValue = (name, value) => void state.customValues.set(name, value);

export function zoomAddRegistrant(meetingId, email) {
  const id = `reg-${email}`;
  state.registrants.set(id, email);
  return `https://zoom.us/w/${String(meetingId).replace(/\D/g, '')}?tk=${encodeURIComponent(id)}`;
}

export function zoomReport() {
  init();
  const start = Date.UTC(2026, 9, 8, 17, 0);
  const end = start + 3 * 3600_000;
  const participants = [];
  for (const c of state.contacts) {
    if (!c.tags.includes('demo_directo_click') || !chance(0.75)) continue;
    const join = start + Math.floor(rand() * 40) * 60_000;
    const leave = chance(0.45) ? end - Math.floor(rand() * 5) * 60_000 : join + Math.floor(10 + rand() * 120) * 60_000;
    participants.push({ name: c.name, user_email: c.email, join_time: new Date(join).toISOString(), leave_time: new Date(leave).toISOString(), duration: Math.round((leave - join) / 1000) });
  }
  participants.push({ name: 'Anfitriona', user_email: 'host@example.com', join_time: new Date(start).toISOString(), leave_time: new Date(end).toISOString(), duration: 10800 });
  return { participants, registrants: [] };
}

// Solo para pruebas locales: simula ventas de VIP y del programa hechas DESPUÉS de la foto.
export function simulateSales(launch = 'demo') {
  init();
  let n = 0;
  for (const c of state.contacts) {
    if (!c.tags.includes('registro-webinar-demo') || c.tags.includes(`${launch}_vip_previo`)) continue;
    const vip = chance(0.1);
    if (vip) { c.tags.push('compra-vip-demo'); n++; }
    if (c.tags.includes('clienta-raices')) continue;
    const live = c.tags.includes(`${launch}_directo_click`);
    const warm = c.dateAdded < '2026-10-01';
    // Perfil que más compra en los datos de prueba: 35-40 años y más de 1 año buscando.
    const edad = Number(c.cf?.['0lVfpThUn3rOkt5nalEp']);
    const perfil = edad >= 35 && edad <= 40 && String(c.cf?.jgsgct0q45CnzoAL0QG0) === 'Más de 1 año' ? 3 : 1;
    if (chance((vip ? 0.3 : live ? 0.07 : 0.015) * (warm ? 1.4 : 0.8) * perfil)) {
      c.tags.push('clienta-raices');
      // en el directo (15/10) o en los días de carrito siguientes
      c.cf = { ...c.cf, [MOCK_DATE_FIELD]: live && chance(0.55) ? '2026-10-15T00:00:00.000Z' : `2026-10-${16 + Math.floor(rand() * 5)}T00:00:00.000Z` };
    }
  }
  return n;
}

export const MOCK_DATE_FIELD = 'mockFechaCompraRaices';
export const listDateFields = () => [
  { id: 'mockFechaCaptura', name: 'Fecha captura lead' },
  { id: MOCK_DATE_FIELD, name: 'Fecha compra Raíces' },
  { id: 'mockFechaCompraVsl', name: 'Fecha compra Raíces VSL' },
];

export function upsertContact({ email, firstName, lastName, phone }) {
  init();
  const e = email.trim().toLowerCase();
  let c = state.contacts.find((x) => x.email === e);
  if (!c) {
    c = { id: `new${String(state.contacts.length).padStart(5, '0')}`, email: e, tags: [], dateAdded: new Date().toISOString(), cf: {} };
    state.contacts.push(c);
  }
  Object.assign(c, {
    firstName: firstName || c.firstName || '',
    name: `${firstName || c.firstName || ''} ${lastName || ''}`.trim() || c.name || e,
    phone: phone || c.phone || '',
  });
  return structuredClone(c);
}

export const sentEmails = [];
export function sendEmail(contactId, msg) {
  sentEmails.push({ contactId, ...msg });
}

// ---------- Llamadas (pipeline y calendario de prueba) ----------
const MOCK_PIPELINE = {
  id: 'pipeLanz', name: 'Leads Lanzamientos',
  stages: ['Registrado', 'Contactado', 'Agenda llamada', '❌ No contesta 1', '❌ No contesta 2', '❌ No contesta 3', 'Seguimiento', 'Venta', 'Perdido']
    .map((name, i) => ({ id: `st${i}`, name, position: i, color: ['#F97316', '#F59E0B', '#2DD4BF', '#64748B', '#64748B', '#64748B', '#6366F1', '#16A34A', '#EF4444'][i] })),
};
const MOCK_PIPELINE_VSL = { ...MOCK_PIPELINE, id: 'pipeEver', name: 'Leads evergreen', stages: MOCK_PIPELINE.stages.map((s) => ({ ...s, id: `sv${s.position}` })) };
export const notes = [];
function initCalls() {
  init();
  if (state.callsInit) return;
  state.callsInit = true;
  if (!clienteActual().principal) return;
  const now = Date.now();
  const day = 86_400_000;
  // 14 citas: unas pasadas (para anotar el resultado) y otras de hoy y los próximos días.
  for (let i = 0; i < 14; i++) {
    const c = state.contacts[3 + i * 37];
    const start = Math.floor((now + (i - 7) * day * 0.7) / 1_800_000) * 1_800_000;
    state.events.push({ id: `ev${i}`, title: c.name, contactId: c.id, startTime: new Date(start).toISOString(), endTime: new Date(start + 40 * 60_000).toISOString(), status: 'confirmed', deleted: false });
    state.opps.push({ id: `op${i}`, contactId: c.id, pipelineStageId: 'st2', status: 'open', name: c.name });
  }
  // VSL: 10 citas de leads de la VSL, en su pipeline.
  const vsl = state.contacts.filter((c) => c.id.startsWith('mockv'));
  for (let i = 0; i < 10; i++) {
    const c = vsl[5 + i * 29];
    const start = Math.floor((now + (i - 5) * day * 0.9) / 1_800_000) * 1_800_000;
    state.vslEvents.push({ id: `evv${i}`, title: c.name, contactId: c.id, startTime: new Date(start).toISOString(), endTime: new Date(start + 40 * 60_000).toISOString(), status: 'confirmed', deleted: false });
    state.opps.push({ id: `opv${i}`, contactId: c.id, pipelineStageId: 'sv2', status: 'open', name: c.name, pipelineId: 'pipeEver' });
  }
  for (let i = 0; i < 40; i++) state.opps.push({ id: `opr${i}`, contactId: state.contacts[500 + i].id, pipelineStageId: i % 3 ? 'st0' : 'st1', status: 'open', name: state.contacts[500 + i].name });
}
export const getPipelines = () => [structuredClone(MOCK_PIPELINE), structuredClone(MOCK_PIPELINE_VSL)];
export function searchOpportunities({ pipelineId, pipelineStageId, contactId, limit = 100, page = 1 }) {
  initCalls();
  const all = state.opps.filter((o) => pipelineId === (o.pipelineId || MOCK_PIPELINE.id) && (!pipelineStageId || o.pipelineStageId === pipelineStageId) && (!contactId || o.contactId === contactId));
  return { opportunities: structuredClone(all.slice((page - 1) * limit, page * limit)), total: all.length };
}
export function createOpportunity(o) {
  initCalls();
  const op = { id: `opn${state.opps.length}`, ...o };
  state.opps.push(op);
  return structuredClone(op);
}
export function updateOpportunity(id, { pipelineStageId, status }) {
  const o = state.opps.find((x) => x.id === id);
  if (!o) throw Object.assign(new Error('Oportunidad no encontrada'), { status: 404 });
  Object.assign(o, { pipelineStageId, status });
}
export function calendarEvents({ calendarId, startTime, endTime }) {
  initCalls();
  const list = calendarId === 'calMock' ? state.events : calendarId === VSL_CAL ? state.vslEvents : [];
  return structuredClone(list.filter((e) => Date.parse(e.startTime) >= startTime && Date.parse(e.startTime) <= endTime));
}
export const getCalendar = (id) => (id === 'calMock' ? { id, name: 'Llamada de valoración RAICES - L' } : id === VSL_CAL ? { id, name: 'Llamada de valoración RAICES' } : null);
export function updateAppointmentStatus(id, status) {
  const e = state.events.find((x) => x.id === id) || state.vslEvents.find((x) => x.id === id);
  if (!e) throw Object.assign(new Error('Cita no encontrada'), { status: 404 });
  e.status = status;
}
export function addContactNote(contactId, body) { notes.push({ contactId, body }); }

// Todos los campos de contacto (para la ficha del lead): encuesta, formulario de la llamada y otros.
export const listAllFields = () => [
  { id: '0lVfpThUn3rOkt5nalEp', name: '¿Cuál es tu edad actual?', tipo: 'NUMERICAL' },
  { id: 'jgsgct0q45CnzoAL0QG0', name: '¿Cuánto tiempo llevas buscando embarazo?', tipo: 'SINGLE_OPTIONS' },
  { id: 'Ez1HWRYbBv5LXyHNPCQW', name: '¿Qué crees que está retrasando o bloqueando el positivo?', tipo: 'LARGE_TEXT' },
  { id: 'v4zDuixEurBx4MY7JofI', name: '¿Qué has probado para intentar quedarte embarazada?', tipo: 'CHECKBOX' },
  { id: 'H3Q8asVCA89m3vaqFNSu', name: '¿Qué has probado hasta ahora para lograr el positivo?', tipo: 'LARGE_TEXT' },
  { id: 'mockFechaCompraRaices', name: 'Fecha compra Raíces', tipo: 'DATE' },
  { id: 'mockMotivoLlamada', name: '¿Qué te gustaría resolver en la llamada?', tipo: 'LARGE_TEXT' },
  { id: 'mockInversion', name: '¿Estás dispuesta a invertir en acompañamiento?', tipo: 'SINGLE_OPTIONS' },
  ...listTextFields(),
];

export const listTextFields = () => [
  { id: 'mockFbCampaign', name: 'Meta · ID de campaña' },
  { id: 'mockFbAdset', name: 'Meta · ID de conjunto' },
  { id: 'mockFbAd', name: 'Meta · ID de anuncio' },
];

// ---------- Emails (campañas y workflows) con estadísticas de prueba ----------
const MOCK_CAMPANAS = [
  ['Octubre · Email 1 · Bienvenida al webinar', '🌱 Ya estás dentro: esto es lo que vas a aprender', '2026-09-28', 1850, 0.52, 0.11],
  ['Octubre · Email 2 · Clase 1 disponible', 'Tu primera clase ya está aquí (dura 18 minutos)', '2026-10-02', 1830, 0.47, 0.14],
  ['Octubre · Email 3 · Recordatorio clase 1', 'Recordatorio', '2026-10-04', 1810, 0.29, 0.04],
  ['Octubre · Email 4 · Clase 2', '¿Por qué tu bebé se despierta a las 3 de la mañana?', '2026-10-08', 1800, 0.58, 0.16],
  ['Octubre · Email 5 · Mañana es el directo', 'Mañana a las 19:00 te espero (guarda este email)', '2026-10-19', 1790, 0.49, 0.09],
  ['Octubre · Email 6 · Directo hoy', 'HOY 19:00 · Directo', '2026-10-20', 1780, 0.44, 0.21],
  ['Octubre · Email 7 · Grabación', 'La grabación solo estará 48 h', '2026-10-21', 1770, 0.39, 0.06],
  ['Octubre · Email 8 · Cierre del carrito', 'Últimas horas para entrar en Raíces', '2026-10-27', 1760, 0.41, 0.07],
  ['Newsletter septiembre', 'Novedades de septiembre', '2026-09-10', 5200, 0.31, 0.03],
];
const campanaMock = (c, i) => ({ id: `camp${i}`, sourceId: `src${i}`, source: 'email-campaign', name: c[0], status: 'sent', createdAt: `${c[2]}T08:00:00.000Z`, updatedAt: `${c[2]}T09:00:00.000Z` });
export function listEmailCampaigns({ search, offset = 0, limit = 20 } = {}) {
  const todas = MOCK_CAMPANAS.map(campanaMock).filter((c) => !search || c.name.toLowerCase().includes(String(search).toLowerCase())).reverse();
  return { campaigns: todas.slice(offset, offset + limit), total: todas.length };
}
export function getEmailCampaign(id) {
  const i = Number(String(id).replace('camp', ''));
  const c = MOCK_CAMPANAS[i];
  return c ? { ...campanaMock(c, i), subject: c[1], fromName: 'Sara Guzmán' } : null;
}
const MOCK_WORKFLOWS = [{ id: 'wf0', sourceId: 'wfsrc0', name: '[VSL] Secuencia no ha visto el vídeo', subSources: [['vsl1', 'Email 1 · ¿Viste el vídeo?', 900, 0.46, 0.12], ['vsl2', 'Email 2 · Lo que nadie te cuenta', 860, 0.38, 0.09], ['vsl3', 'Email 3 · Última oportunidad', 830, 0.24, 0.03]] }];
export function listWorkflowCampaigns({ search } = {}) {
  const todas = MOCK_WORKFLOWS.filter((w) => !search || w.name.toLowerCase().includes(String(search).toLowerCase())).map((w) => ({ id: w.id, sourceId: w.sourceId, source: 'workflow', name: w.name, status: 'published', createdAt: '2026-06-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z' }));
  return { campaigns: todas, total: todas.length };
}
export function getWorkflowCampaign(id) {
  const w = MOCK_WORKFLOWS.find((x) => x.id === id);
  return w ? { id: w.id, sourceId: w.sourceId, name: w.name, subSources: w.subSources.map(([sid, name]) => ({ id: sid, name })) } : null;
}
export function getEmailStats(source, sourceId, subSourceId) {
  const fila = source === 'workflow-campaigns'
    ? MOCK_WORKFLOWS.find((w) => w.sourceId === sourceId)?.subSources.find((s) => s[0] === subSourceId)?.slice(2)
    : MOCK_CAMPANAS[Number(String(sourceId).replace('src', ''))]?.slice(3);
  if (!fila) return {};
  const [enviados, ap, ctr] = fila;
  const delivered = Math.round(enviados * 0.98);
  const opened = Math.round(delivered * ap);
  const clicked = Math.round(delivered * ctr);
  return { sent: enviados, delivered, opened, clicked, openRate: Math.round((opened / delivered) * 1000) / 10, clickRate: Math.round((clicked / delivered) * 1000) / 10, unsubscribed: Math.round(delivered * 0.004) };
}

// CSV de participantes de SendFlow (Position;Group;Name;Number): 70 % de los registrados del webinar de prueba
// con teléfono, repartidos en 4 grupos, y 2 administradores que están en todos.
export function csvMiembrosMock() {
  init();
  const filas = ['Position;Group;Name;Number'];
  const regs = state.contacts.filter((c) => c.tags.includes('registro-webinar-demo') && c.phone);
  regs.forEach((c, i) => { if (i % 10 < 7) filas.push(`${i + 1};Grupo ${(i % 4) + 1} · Webinar;${c.firstName};${c.phone.replace(/\D/g, '')}`); });
  for (let g = 1; g <= 4; g++) for (const n of ['34600000001', '34600000002']) filas.push(`0;Grupo ${g} · Webinar;Admin;${n}`);
  return filas.join('\n');
}
