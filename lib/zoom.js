// Cliente mínimo de la API de Zoom con una app "Server-to-Server OAuth" (gratuita).
import { env } from './env.js';
import * as mock from './mock.js';

const useMock = () => env.GHL_MOCK === '1';
let cachedToken = null;

export const zoomConfigured = () => useMock() || Boolean(env.ZOOM_ACCOUNT_ID && env.ZOOM_CLIENT_ID && env.ZOOM_CLIENT_SECRET);

async function token() {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;
  const { ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = env;
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(ZOOM_ACCOUNT_ID)}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`)}` },
  });
  if (!res.ok) throw zoomError(res.status, await res.text());
  const data = await res.json();
  cachedToken = { value: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

function zoomError(status, body) {
  const err = new Error(`Zoom ${status}: ${body.slice(0, 300)}`);
  err.status = 502;
  err.publicMessage = 'Error al hablar con Zoom';
  return err;
}

async function zoom(path, { method = 'GET', body } = {}) {
  const res = await fetch(`https://api.zoom.us/v2${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw zoomError(res.status, await res.text());
  return res.status === 204 ? {} : res.json();
}

const cleanId = (meetingId) => String(meetingId).replace(/\D/g, '');

// Inscribe al lead en la reunión (requiere "Registro: obligatorio" en la reunión de Zoom)
// y devuelve su enlace personal. Así el informe de asistencia trae su email.
export async function addRegistrant(meetingId, { email, firstName, lastName }) {
  if (useMock()) return mock.zoomAddRegistrant(meetingId, email);
  const data = await zoom(`/meetings/${cleanId(meetingId)}/registrants`, {
    method: 'POST',
    body: { email, first_name: firstName || email.split('@')[0], last_name: lastName || '' },
  });
  return data.join_url;
}

async function paginate(path, key) {
  const out = [];
  let next = '';
  do {
    const sep = path.includes('?') ? '&' : '?';
    const data = await zoom(`${path}${sep}page_size=300${next ? `&next_page_token=${encodeURIComponent(next)}` : ''}`);
    out.push(...(data[key] || []));
    next = data.next_page_token || '';
  } while (next);
  return out;
}

// Asistencia agregada por email: minutos totales y si se quedó hasta el final.
export async function attendance(meetingId, { finalWindowMinutes = 15 } = {}) {
  let participants;
  let registrants = [];
  if (useMock()) {
    ({ participants, registrants } = mock.zoomReport(meetingId));
  } else {
    const id = cleanId(meetingId);
    participants = await paginate(`/report/meetings/${id}/participants`, 'participants');
    try {
      registrants = await paginate(`/meetings/${id}/registrants?status=approved`, 'registrants');
    } catch {
      registrants = []; // reunión sin registro: solo tendremos los emails que Zoom conozca
    }
  }
  const emailByRegistrant = new Map(registrants.map((r) => [r.id, (r.email || '').toLowerCase()]));
  const end = Math.max(0, ...participants.map((p) => Date.parse(p.leave_time) || 0));
  const byEmail = new Map();
  let anonymous = 0;
  for (const p of participants) {
    const email = (p.user_email || emailByRegistrant.get(p.registrant_id) || '').toLowerCase();
    if (!email) {
      anonymous++;
      continue;
    }
    const a = byEmail.get(email) || { email, name: p.name || '', seconds: 0, lastLeave: 0 };
    a.seconds += Number(p.duration) || 0;
    a.lastLeave = Math.max(a.lastLeave, Date.parse(p.leave_time) || 0);
    byEmail.set(email, a);
  }
  const attendees = [...byEmail.values()].map((a) => ({
    email: a.email,
    name: a.name,
    minutes: Math.round(a.seconds / 60),
    // "Hasta el final": seguía conectado en los últimos minutos (la oferta) y estuvo al menos 20 min.
    final: end > 0 && a.lastLeave >= end - finalWindowMinutes * 60_000 && a.seconds >= 20 * 60,
  }));
  return { attendees, anonymous, meetingEnd: end ? new Date(end).toISOString() : null };
}
