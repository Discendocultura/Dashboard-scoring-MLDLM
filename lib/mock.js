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
    if (chance(0.55)) tags.push('demo_clase1_50');
    if (tags.includes('demo_clase1_50') && chance(0.6)) tags.push('demo_clase1_90');
    if (chance(0.4)) tags.push('demo_clase2_50');
    if (tags.includes('demo_clase2_50') && chance(0.6)) tags.push('demo_clase2_90');
    if (chance(0.08)) tags.push('compra-vip-demo');
    if (chance(0.45)) tags.push('demo_directo_click');
    if (chance(0.15)) tags.push('demo_replay_50');
    if (tags.includes('demo_replay_50') && chance(0.5)) tags.push('demo_replay_90');
    state.contacts.push({
      id: `mock${String(i).padStart(5, '0')}`,
      firstName: first,
      name: `${first} ${last}`,
      email: `${first}.${last}.${i}@example.com`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
      phone: chance(0.9) ? `+346${String(10000000 + i * 37).slice(0, 8)}` : '',
      tags,
      dateAdded: new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString(),
    });
  }
}

export function listTags() {
  init();
  return [...new Set(state.contacts.flatMap((c) => c.tags).concat(['et-lista-general', 'clienta-raices']))].sort();
}

export function contactsByTag(tag, cursor) {
  init();
  const all = state.contacts.filter((c) => c.tags.includes(tag));
  const start = cursor ? Number(cursor[0]) : 0;
  const page = all.slice(start, start + 100);
  return { contacts: structuredClone(page), total: all.length, cursor: start + 100 < all.length ? [start + 100] : null };
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
