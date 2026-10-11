// Cliente mínimo de la API de Zoom con una app "Server-to-Server OAuth" (gratuita).
import { env } from './env.js';
import * as mock from './mock.js';
import { envCliente, cachePorCliente } from './cliente.js';

const useMock = () => env.GHL_MOCK === '1';
const cachedTokens = cachePorCliente();
// Cada cliente con su app de Zoom (ZOOM_*_<ID>; el principal, ZOOM_*).
const zc = () => ({ ZOOM_ACCOUNT_ID: envCliente('ZOOM_ACCOUNT_ID'), ZOOM_CLIENT_ID: envCliente('ZOOM_CLIENT_ID'), ZOOM_CLIENT_SECRET: envCliente('ZOOM_CLIENT_SECRET') });

export const zoomConfigured = () => useMock() || Object.values(zc()).every(Boolean);

async function token() {
  const cachedToken = cachedTokens.get();
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;
  const { ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = zc();
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(ZOOM_ACCOUNT_ID)}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`)}` },
  });
  if (!res.ok) throw zoomError(res.status, await res.text());
  const data = await res.json();
  return cachedTokens.set({ value: data.access_token, exp: Date.now() + data.expires_in * 1000 }).value;
}

function zoomError(status, body) {
  const err = new Error(`Zoom ${status}: ${body.slice(0, 300)}`);
  err.status = 502;
  err.publicMessage = 'Error al hablar con Zoom';
  return err;
}

async function zoom(path, { method = 'GET', body } = {}) {
  let res;
  // Límite de Zoom (muchas inscripciones a la vez a la hora del directo): hasta 2 reintentos con espera al azar.
  for (let intento = 0; ; intento++) {
    res = await fetch(`https://api.zoom.us/v2${path}`, {
      method,
      headers: { Authorization: `Bearer ${await token()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status !== 429 || intento >= 2) break;
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 900));
  }
  if (!res.ok) throw zoomError(res.status, await res.text());
  return res.status === 204 ? {} : res.json();
}

const cleanId = (meetingId) => String(meetingId).replace(/\D/g, '');

// Crea la sala del directo (Lanzamiento rápido). Con «Registro: obligatorio» y aprobación automática (lo necesita
// addRegistrant: cada lead entra con su enlace personal) y sin los emails de Zoom a cada inscrita (los manda GHL).
// Si se da la reunión del lanzamiento anterior, copia sus ajustes, su duración y su anfitrión.
// Anfitrión: el de esa reunión, o ZOOM_HOST_EMAIL[_<CLIENTE>], o «me». Hace falta el permiso «meeting:write» en la app.
const AJUSTES_COPIABLES = ['host_video', 'participant_video', 'join_before_host', 'jbh_time', 'mute_upon_entry', 'waiting_room', 'auto_recording',
  'audio', 'allow_multiple_devices', 'alternative_hosts', 'meeting_authentication', 'show_share_button', 'focus_mode', 'private_meeting', 'continuous_meeting_chat', 'question_and_answer'];
export async function crearReunion({ topic, fecha, hora, duracion = 120, copiarDe = '' }) {
  if (useMock()) return mock.zoomCrearReunion({ topic, fecha, hora });
  let settings = { join_before_host: false, waiting_room: false, mute_upon_entry: true, host_video: true, participant_video: false };
  let host = envCliente('ZOOM_HOST_EMAIL') || 'me';
  let dur = duracion;
  if (copiarDe) {
    try {
      const m = await zoom(`/meetings/${cleanId(copiarDe)}`);
      settings = Object.fromEntries(AJUSTES_COPIABLES.filter((k) => m.settings?.[k] !== undefined).map((k) => [k, m.settings[k]]));
      if (m.duration) dur = m.duration;
      if (m.host_id) host = m.host_id;
    } catch (e) {
      console.error('Zoom: no se pudo leer la reunión anterior', e.message);
    }
  }
  Object.assign(settings, { approval_type: 0, registration_type: 1, registrants_confirmation_email: false, registrants_email_notification: false });
  let m;
  try {
    m = await zoom(`/users/${encodeURIComponent(host)}/meetings`, { method: 'POST', body: { topic: String(topic || 'Directo').slice(0, 200), type: 2, start_time: `${fecha}T${hora}:00`, timezone: 'Europe/Madrid', duration: dur, settings } });
  } catch (e) {
    const status = Number(/Zoom (\d+)/.exec(e.message)?.[1]);
    e.publicMessage = status === 400 || status === 401 || status === 403 || status === 404
      ? 'Zoom no ha dejado crear la reunión: revisa que la app de Zoom (Server-to-Server) tenga el permiso «meeting:write» (o «meeting:write:meeting:admin») y, si hace falta, pon en Cloudflare ZOOM_HOST_EMAIL con el email del anfitrión.'
      : 'No se ha podido crear la reunión en Zoom. Prueba en un momento.';
    throw e;
  }
  return { id: String(m.id), joinUrl: String(m.join_url || '') };
}

// Inscribe al lead en la reunión (requiere "Registro: obligatorio" en la reunión de Zoom)
// y devuelve su enlace personal. Así el informe de asistencia trae su email.
// Borra una reunión (Deshacer del nuevo lanzamiento). Ya borrada: no es un error.
export async function borrarReunion(meetingId) {
  if (useMock()) return mock.zoomBorrarReunion(meetingId);
  try { await zoom(`/meetings/${cleanId(meetingId)}`, { method: 'DELETE' }); } catch (e) { if (!/Zoom 404/.test(e.message)) throw e; }
  return true;
}

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
