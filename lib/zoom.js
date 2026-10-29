// Cliente mínimo de la API de Zoom con una app "Server-to-Server OAuth" (gratuita).
import { env } from './env.js';
import { curvaDirecto } from '../public/js/retencion.js';
import * as mock from './mock.js';
import { envCliente, cachePorCliente, clienteActual } from './cliente.js';

const useMock = () => env.GHL_MOCK === '1';
const cachedTokens = cachePorCliente();
// Qué Zoom usa cada cliente (lo elige el alta del cliente, campo «zoom»): el de la agencia (ZOOM_*), uno propio
// (ZOOM_*_<ID>) o ninguno. Sin elegir: el propio si está completo y, si no, el de la agencia. El principal, ZOOM_*.
const NOMBRES = ['ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET'];
export function zoomDeCliente(c = clienteActual()) {
  const agencia = Object.fromEntries(NOMBRES.map((k) => [k, env[k]]));
  if (c.ejemplo) return { cual: 'ninguno', vars: {} }; // el ejemplo nunca usa credenciales reales
  if (c.principal) return { cual: 'agencia', vars: agencia };
  if (c.zoom === 'ninguno') return { cual: 'ninguno', vars: {} };
  const propio = Object.fromEntries(NOMBRES.map((k) => [k, envCliente(k, c)]));
  if (c.zoom === 'propio' || (c.zoom !== 'agencia' && Object.values(propio).every(Boolean))) return { cual: 'propio', vars: propio };
  return { cual: 'agencia', vars: agencia };
}
const zc = () => zoomDeCliente().vars;

export const zoomConfigured = () => useMock() || (Object.keys(zc()).length === 3 && Object.values(zc()).every(Boolean));

async function token() {
  const cachedToken = cachedTokens.get();
  const { ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = zc();
  if (cachedToken && cachedToken.cuenta === ZOOM_ACCOUNT_ID && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(ZOOM_ACCOUNT_ID)}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`)}` },
  });
  if (!res.ok) throw zoomError(res.status, await res.text());
  const data = await res.json();
  return cachedTokens.set({ value: data.access_token, exp: Date.now() + data.expires_in * 1000, cuenta: ZOOM_ACCOUNT_ID }).value;
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
  let host = (zoomDeCliente().cual === 'propio' ? envCliente('ZOOM_HOST_EMAIL') : env.ZOOM_HOST_EMAIL) || 'me';
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

// Si la reunión pide campos obligatorios en su registro (apellido, teléfono, ciudad…) y la lead no los tiene, se
// rellenan con lo que haya (o «-») y se reintenta: si no, Zoom no la inscribe (code 300 «The parameter is required: X»).
// ocurrencias: en una reunión periódica (varios días con el mismo ID), las sesiones en las que se inscribe; sin ellas,
// Zoom la apunta solo a la primera.
export async function addRegistrant(meetingId, { email, firstName, lastName, phone }, { ocurrencias = [] } = {}) {
  if (useMock()) return mock.zoomAddRegistrant(meetingId, email, ocurrencias);
  const body = { email, first_name: firstName || email.split('@')[0], last_name: lastName || '-', ...(phone ? { phone } : {}) };
  const qs = ocurrencias.length ? `?occurrence_ids=${ocurrencias.map(encodeURIComponent).join(',')}` : '';
  for (let intento = 0; ; intento++) {
    try {
      const data = await zoom(`/meetings/${cleanId(meetingId)}/registrants${qs}`, { method: 'POST', body });
      return data.join_url;
    } catch (e) {
      const falta = /required:\s*([a-z_]+)/i.exec(e.message)?.[1];
      if (!falta || intento >= 4 || body[falta]) throw e;
      body[falta] = falta === 'phone' ? phone || '-' : '-';
    }
  }
}

// Sesiones de una reunión periódica: [{ id, inicio (ms) }] (sin sesiones: []). Se guardan 30 min por servidor.
const ocurrenciasCache = new Map();
export async function ocurrenciasDe(meetingId) {
  if (useMock()) return mock.zoomOcurrencias ? mock.zoomOcurrencias(meetingId) : [];
  const id = cleanId(meetingId);
  const c = ocurrenciasCache.get(id);
  if (c && Date.now() - c.at < 30 * 60_000) return c.lista;
  const data = await zoom(`/meetings/${id}`);
  const lista = (data.occurrences || []).filter((o) => o.status !== 'deleted').map((o) => ({ id: String(o.occurrence_id), inicio: Date.parse(o.start_time) })).filter((o) => Number.isFinite(o.inicio));
  ocurrenciasCache.set(id, { at: Date.now(), lista });
  return lista;
}

// Ajustes de una reunión que importan para entrar (solo lectura): si tiene código de acceso, si su enlace lo lleva
// dentro, el tipo de registro y la aprobación. No devuelve el código.
export async function ajustesReunion(meetingId) {
  if (useMock()) return { id: cleanId(meetingId), tipo: 2, conCodigo: true, enlaceConCodigo: true, registro: 1, aprobacion: 0, salaDeEspera: false };
  const m = await zoom(`/meetings/${cleanId(meetingId)}`);
  return {
    id: String(m.id), tema: m.topic || '', inicio: m.start_time || null, tipo: m.type,
    conCodigo: Boolean(m.password || m.encrypted_password), enlaceConCodigo: /[?&]pwd=/.test(m.join_url || ''),
    registro: m.settings?.registration_type ?? null, aprobacion: m.settings?.approval_type ?? null,
    salaDeEspera: Boolean(m.settings?.waiting_room), soloAutenticados: Boolean(m.settings?.meeting_authentication),
  };
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

// Cada vez que se abre la sala, Zoom guarda una «instancia» y el informe por ID de reunión solo da la ÚLTIMA. Si se
// vuelve a abrir la sala después del directo (o se cayó y se reabrió durante), el informe salía casi vacío. Con la
// hora del directo se juntan todas las instancias que empezaron cerca (de 2 h antes a 6 h después). Sin hora, o si
// Zoom no da las instancias, la última, como antes.
export function instanciasDelDirecto(instancias = [], inicio) {
  if (!inicio) return [];
  return instancias.filter((m) => { const t = Date.parse(m.start_time); return t >= inicio - 2 * 3600_000 && t <= inicio + 6 * 3600_000; });
}
// El UUID de una instancia va codificado dos veces si empieza por «/» o lleva «//» (lo pide Zoom).
const uuidEnRuta = (uuid) => (uuid.startsWith('/') || uuid.includes('//') ? encodeURIComponent(encodeURIComponent(uuid)) : encodeURIComponent(uuid));
// → { participants, fuente: { instancias (las de la hora del directo), conInforme, error } } (fuente: para ver qué pasó).
async function participantesDelDirecto(id, inicio) {
  const fuente = { instancias: 0, conInforme: 0, error: '' };
  let instancias = [];
  try { instancias = instanciasDelDirecto((await zoom(`/past_meetings/${id}/instances`)).meetings || [], inicio); } catch (e) { fuente.error = `instancias: ${e.message}`; }
  fuente.instancias = instancias.length;
  const listas = [];
  for (const m of instancias) {
    try { listas.push(await paginate(`/report/meetings/${uuidEnRuta(m.uuid)}/participants`, 'participants')); fuente.conInforme++; } catch (e) { fuente.error = `informe: ${e.message}`; }
  }
  if (listas.length) return { participants: listas.flat(), fuente };
  return { participants: await paginate(`/report/meetings/${id}/participants`, 'participants'), fuente };
}

// Asistencia agregada por email: minutos totales y si se quedó hasta el final.
// También la curva de retención: personas conectadas cada minuto (inicio = hora del directo en ms, para el minuto 0).
export async function attendance(meetingId, { finalWindowMinutes = 15, inicio = null } = {}) {
  let participants;
  let fuente = null;
  let registrants = [];
  if (useMock()) {
    ({ participants, registrants } = mock.zoomReport(meetingId));
  } else {
    const id = cleanId(meetingId);
    ({ participants, fuente } = await participantesDelDirecto(id, inicio));
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
  const curva = curvaDirecto(participants.map((p, i) => ({
    clave: (p.user_email || emailByRegistrant.get(p.registrant_id) || '').toLowerCase() || `anon:${p.id || p.user_id || p.name || i}`,
    entra: Date.parse(p.join_time) || 0, sale: Date.parse(p.leave_time) || 0,
  })), inicio);
  return { attendees, anonymous, meetingEnd: end ? new Date(end).toISOString() : null, curva, fuente };
}

// «Comprobar Zoom» del alta del cliente: pide un token con sus credenciales (una petición) y dice qué falta.
export async function probarZoom(c = clienteActual()) {
  const { cual, vars } = zoomDeCliente(c);
  if (cual === 'ninguno') return { ok: true, cual, texto: 'Este cliente no usa Zoom.' };
  if (useMock() && cual === 'agencia') return { ok: true, cual, texto: 'Usa el Zoom de la agencia (prueba).' };
  const faltan = NOMBRES.filter((k) => !vars[k]).map((k) => (cual === 'propio' ? `${k}_${String(c.id).toUpperCase().replace(/-/g, '_')}` : k));
  if (faltan.length) return { ok: false, cual, error: `Faltan en Cloudflare: ${faltan.join(', ')}. Añádelas (tipo Secret) y vuelve a desplegar (Deployments → ⋯ → Retry deployment).` };
  if (useMock()) return { ok: true, cual, texto: cual === 'propio' ? 'Zoom propio del cliente conectado (prueba).' : 'Usa el Zoom de la agencia (prueba).' };
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(vars.ZOOM_ACCOUNT_ID)}`, {
    method: 'POST', headers: { Authorization: `Basic ${btoa(`${vars.ZOOM_CLIENT_ID}:${vars.ZOOM_CLIENT_SECRET}`)}` },
  });
  if (res.ok) return { ok: true, cual, texto: cual === 'propio' ? 'Zoom propio del cliente conectado.' : 'Usa el Zoom de la agencia.' };
  const t = await res.text().catch(() => '');
  if (/invalid_client|Invalid client/i.test(t)) return { ok: false, cual, error: 'Zoom no acepta el Client ID o el Client Secret: vuelve a copiarlos de App Credentials (sin espacios) en Cloudflare y despliega otra vez.' };
  if (/account/i.test(t)) return { ok: false, cual, error: 'Zoom no reconoce el Account ID: cópialo otra vez de App Credentials (es distinto del Client ID).' };
  if (/activat|not.*active|disabled/i.test(t)) return { ok: false, cual, error: 'La app de Zoom no está activada: en marketplace.zoom.us → tu app → Activation → Activate your app.' };
  return { ok: false, cual, error: `Zoom ha respondido con un error (${res.status}): ${t.slice(0, 200)}` };
}
