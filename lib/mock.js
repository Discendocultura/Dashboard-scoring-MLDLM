// Datos falsos para probar el dashboard en local sin tocar GHL ni Zoom (GHL_MOCK=1).
const NAMES = ['Lucía', 'María', 'Paula', 'Laura', 'Marta', 'Ana', 'Elena', 'Sara', 'Carmen', 'Irene', 'Nuria', 'Cristina'];
const SURNAMES = ['García', 'López', 'Martín', 'Sánchez', 'Pérez', 'Gómez', 'Ruiz', 'Díaz', 'Moreno', 'Romero'];

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const chance = (p) => rand() < p;

const state = { contacts: [], customValues: new Map(), registrants: new Map() };

function init() {
  if (state.contacts.length) return;
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
      cf.H3Q8asVCA89m3vaqFNSu = ['Nada todavía', 'Suplementos', 'Acupuntura', 'Tratamiento de fertilidad'][(i >> 2) % 4];
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
  }
}

export function removeTags(id, tags) {
  init();
  const c = state.contacts.find((x) => x.id === id);
  if (!c) throw Object.assign(new Error('Contacto no encontrado'), { status: 404 });
  c.tags = c.tags.filter((t) => !tags.includes(t));
}

export const metaInsights = () => ({
  ads: [
    ...['1201', '1202', '1203'].flatMap((camp, ci) => [0, 1, 2].map((k) => ({
      campaign_id: camp, campaign_name: ['Webinar · Frío intereses', 'Webinar · Lookalike compradoras', 'Webinar · Retargeting'][ci],
      adset_id: `22${(ci * 2 + k) % 6}`, adset_name: `Conjunto ${(ci * 2 + k) % 6 + 1}`,
      ad_id: `33${ci * 3 + k}`, ad_name: `Anuncio ${ci * 3 + k + 1} · ${['Vídeo testimonio', 'Carrusel', 'Reel matrona'][k]}`,
      spend: String(Math.round(150 + rand() * 450)),
    }))),
  ],
});

export function listTags() {
  init();
  return [...new Set(state.contacts.flatMap((c) => c.tags).concat(['et-lista-general', 'clienta-raices']))].sort();
}

export function contactsByTag(tag, cursor, fields = []) {
  init();
  const all = state.contacts.filter((c) => c.tags.includes(tag));
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
