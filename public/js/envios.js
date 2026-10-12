// Plan de envíos del lanzamiento: cuántos emails y mensajes al grupo de WhatsApp hay cada día y a qué hora.
// Por defecto (se cambia en Configuración → Carrito):
//   · Captación: 1 email y 1 WhatsApp al día.
//   · Preclase (desde que se abre el primer recurso): 1 email y 2 WhatsApp (mañana y tarde-noche, con encuestas).
//   · Día del directo: 3 emails y 3 WhatsApp.
//   · Carrito: 3 emails y 3 WhatsApp al día; el último día, 4 y 4.
// Cada fase se guarda en `launch.envios[fase] = { emails: ['HH:MM'…], whatsapp: [...] }` y cada día del carrito, si se
// cambia a mano, en `launch.carritoEnvios[día]` (como antes). Lo usan Configuración, Plan → Emails y Plan → Grupo de WhatsApp.
import { videosDe } from './videos.js';
import { desbloqueosPreclase } from './calentamiento.js';
import { diasCarrito } from './carrito.js';

export const CANALES = [{ id: 'emails', label: 'Emails', icon: '✉️' }, { id: 'whatsapp', label: 'Grupo de WhatsApp', icon: '💬' }];
export const FASES_PLAN = [
  { id: 'captacion', label: 'Captación', icon: '🎯', desc: 'Desde que empieza la captación hasta que se abre el primer recurso de la preclase' },
  { id: 'preclase', label: 'Preclase', icon: '🎓', desc: 'Desde el primer recurso hasta la víspera del directo (los WhatsApp, con encuestas para generar conversación)' },
  { id: 'directo', label: 'Día del directo', icon: '🔴', desc: 'Recordatorios, «empezamos» y apertura del carrito' },
  { id: 'carrito', label: 'Carrito', icon: '🛒', desc: 'Cada día de carrito (se puede cambiar día a día)' },
  { id: 'ultimo', label: 'Último día', icon: '⏳', desc: 'El día que cierra el carrito' },
];
export const MAX_ENVIOS = 8;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
const sumar = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const horaMas = (h, min) => { const [a, b] = String(h || '19:00').split(':').map(Number); const t = Math.min(23 * 60 + 59, Math.max(0, a * 60 + b + min)); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

// Horas por defecto de cada fase (las del día del directo dependen de la hora del directo y de la apertura del carrito).
export function enviosPorDefecto(l = {}) {
  const hD = videosDe(l)[0]?.hora || l.horaDirecto || '19:00';
  const hA = /T(\d{2}:\d{2})/.exec(l.aperturaCarrito || '')?.[1] || horaMas(hD, 150);
  return {
    captacion: { emails: ['12:00'], whatsapp: ['13:00'] },
    preclase: { emails: ['12:00'], whatsapp: ['09:30', '20:30'] },
    directo: { emails: ['09:00', horaMas(hD, -60), hA > hD ? hA : horaMas(hD, 150)], whatsapp: ['10:00', horaMas(hD, -60), hD] },
    carrito: { emails: ['09:00', '15:00', '20:00'], whatsapp: ['10:00', '16:00', '21:00'] },
    ultimo: { emails: ['09:00', '13:00', '19:00', '22:00'], whatsapp: ['10:00', '14:00', '20:00', '22:30'] },
  };
}

// Lo guardado: solo fases y canales con horas válidas (una fase con [] = ninguno ese canal).
export function sanitizeEnvios(e) {
  const out = {};
  for (const { id } of FASES_PLAN) {
    const v = e?.[id];
    if (!v || typeof v !== 'object') continue;
    const f = {};
    for (const c of CANALES) if (Array.isArray(v[c.id])) f[c.id] = [...new Set(v[c.id].map(String).filter((h) => HORA_RE.test(h)))].sort().slice(0, MAX_ENVIOS);
    if (Object.keys(f).length) out[id] = f;
  }
  return out;
}

// Las horas de cada fase: lo guardado o, si no, lo de por defecto.
export function enviosDe(l = {}) {
  const def = enviosPorDefecto(l);
  const g = sanitizeEnvios(l.envios);
  return Object.fromEntries(FASES_PLAN.map(({ id }) => [id, Object.fromEntries(CANALES.map((c) => [c.id, g[id]?.[c.id] ?? def[id][c.id]]))]));
}

// Plan día a día: [{ day, fase, emails: ['HH:MM'…], whatsapp: [...], propio: bool }] desde la captación hasta el cierre.
//   propio: el día del carrito tiene sus horas cambiadas a mano (Configuración → Carrito).
export function planEnvios(l = {}) {
  const vids = videosDe(l).filter((v) => DIA_RE.test(v.fecha || ''));
  const primero = vids[0]?.fecha || (DIA_RE.test(l.fechaDirecto || '') ? l.fechaDirecto : '');
  if (!primero) return [];
  const E = enviosDe(l);
  const diasVideo = new Set(vids.map((v) => v.fecha));
  const C = diasCarrito(l);
  const diasC = C.dias.map((d) => d.day);
  const ultimo = diasC.at(-1) || '';
  const inicioPre = desbloqueosPreclase(l).map((x) => x.at.slice(0, 10)).sort()[0] || '';
  let ini = DIA_RE.test(l.inicioCaptacion || '') ? l.inicioCaptacion : sumar(primero, -10);
  if (ini < sumar(primero, -45)) ini = sumar(primero, -45);
  const ultimoVideo = vids.at(-1)?.fecha || primero;
  const fin = ultimo || ultimoVideo;
  const out = [];
  for (let d = ini, n = 0; d <= fin && n < 120; d = sumar(d, 1), n++) {
    // Entre dos vídeos (lanzamientos de varios), sigue siendo preclase; después del último, carrito.
    const fase = d === ultimo && !diasVideo.has(d) ? 'ultimo' : diasVideo.has(d) ? 'directo' : diasC.includes(d) || d > ultimoVideo ? 'carrito'
      : d > primero || (inicioPre && d >= inicioPre) ? 'preclase' : 'captacion';
    const propio = l.carritoEnvios?.[d];
    out.push({ day: d, fase, emails: propio?.emails ?? E[fase].emails, whatsapp: propio?.whatsapp ?? E[fase].whatsapp, propio: Boolean(propio) });
  }
  return out;
}

// Resumen de cuántos hay en total (para la pantalla): { emails, whatsapp, dias }.
export function totalesPlan(plan = []) {
  return { emails: plan.reduce((t, d) => t + d.emails.length, 0), whatsapp: plan.reduce((t, d) => t + d.whatsapp.length, 0), dias: plan.length };
}
