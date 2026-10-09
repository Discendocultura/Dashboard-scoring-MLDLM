// Fases de la página de recursos / grabación de un lanzamiento. Lo usan el servidor (/api/page)
// y el dashboard (vista previa). Las fechas se escriben en hora de España ("2026-10-27T19:00").
import { videosDe, esEnDirecto, MAX_VIDEOS, nClases, conVip } from './videos.js';

export const PHASES = [
  { id: 'pre_c1', label: 'Antes de la clase 1', button: 'whatsapp', text: 'La clase 1 se abre en {cuenta}' },
  { id: 'c1', label: 'Clase 1 disponible', button: 'vip', text: 'Ya puedes ver la clase 1 · La clase 2 se abre en {cuenta}' },
  { id: 'c2', label: 'Clase 2 disponible', button: 'vip', text: 'Ya puedes ver la clase 2 · El directo empieza en {cuenta}' },
  { id: 'dia_directo', label: 'Día del directo (antes de empezar)', button: 'directo', text: 'Hoy es el directo · Empieza en {cuenta}' },
  { id: 'en_directo', label: 'Directo (desde que empieza hasta las 00:00)', button: 'directo', text: '🔴 Estamos en directo' },
  { id: 'replay', label: 'Grabación / carrito abierto', button: 'venta', text: 'La grabación se retira en {cuenta}' },
  { id: 'cerrado', label: 'Carrito cerrado', button: '', text: 'Las puertas de Raíces se han cerrado' },
];

// Lanzamientos de varios vídeos: fases de cada vídeo (el 1 usa las de siempre) y entre vídeos.
const suf = (k) => (k === 1 ? '' : String(k));
const otrosVideos = Array.from({ length: MAX_VIDEOS - 1 }, (_, i) => i + 2);
export const PHASE_IDS = [
  ...PHASES.map((p) => p.id), 'c3',
  ...otrosVideos.flatMap((k) => [`dia_directo${k}`, `en_directo${k}`]),
  ...Array.from({ length: MAX_VIDEOS - 1 }, (_, i) => `v${i + 1}`),
];

// Fases de la página según el prelanzamiento (1, 2 o 3 clases; con o sin VIP) y los vídeos del
// lanzamiento. Con 2 clases, VIP y un vídeo (el webinar de siempre), las de siempre.
export function phasesFor(launch) {
  const vs = videosDe(launch);
  const nc = nClases(launch);
  const vip = conVip(launch);
  if (vs.length <= 1 && nc === 2 && vip) return PHASES;
  const botonClase = vip ? 'vip' : 'whatsapp';
  const primero = vs.length > 1 ? `el ${vs[0].nombre}` : 'el directo';
  // Sin área preclase (sin clases): la primera fase es la cuenta atrás hasta el primer vídeo.
  const out = [nc ? { ...PHASES[0] } : { ...PHASES[0], label: 'Antes del directo', button: 'whatsapp', text: `${primero.charAt(0).toUpperCase()}${primero.slice(1)} empieza en {cuenta}` }];
  for (let i = 1; i <= nc; i++) {
    out.push({
      id: `c${i}`, label: `Clase ${i} disponible`, button: botonClase,
      text: i < nc ? `Ya puedes ver la clase ${i} · La clase ${i + 1} se abre en {cuenta}` : `Ya puedes ver la clase ${i} · ${primero.charAt(0).toUpperCase()}${primero.slice(1)} empieza en {cuenta}`,
    });
  }
  if (vs.length <= 1) return [...out, ...PHASES.slice(3)];
  for (const v of vs) {
    const s = suf(v.k);
    const directo = esEnDirecto(v);
    out.push({ id: `dia_directo${s}`, label: `Día del ${v.nombre} (antes de empezar)`, button: directo ? `directo${s}` : '', text: `Hoy es el ${v.nombre} · Empieza en {cuenta}` });
    out.push({ id: `en_directo${s}`, label: directo ? `${v.nombre} en directo (hasta las 00:00)` : `${v.nombre} recién publicado (hasta las 00:00)`, button: directo ? `directo${s}` : `grabacion${s}`, text: directo ? '🔴 Estamos en directo' : `Ya está disponible el ${v.nombre}` });
    if (!v.venta) {
      const sig = vs[v.k];
      out.push({ id: `v${v.k}`, label: `${v.nombre} disponible`, button: `grabacion${s}`, text: `Ya puedes ver el ${v.nombre} · El ${sig.nombre} empieza en {cuenta}` });
    }
  }
  const ultimo = vs.at(-1);
  out.push({ id: 'replay', label: 'Carrito abierto', button: 'venta', text: `El ${ultimo.nombre} se retira en {cuenta}` });
  out.push(PHASES.at(-1));
  return out;
}

export const LINK_KEYS = {
  '': 'Sin botón',
  whatsapp: 'Grupo de WhatsApp',
  vip: 'Comprar entrada VIP',
  directo: 'Entrar al directo',
  grabacion: 'Ver la grabación',
  ...Object.fromEntries(otrosVideos.flatMap((k) => [[`directo${k}`, `Entrar al vídeo ${k} (directo)`], [`grabacion${k}`, `Ver el vídeo ${k}`]])),
  venta: 'Página de venta de Raíces',
  pago: 'Pago único de Raíces',
  'pago-fraccionado': 'Pago fraccionado de Raíces',
  llamada: 'Reservar llamada',
  calendario: 'Añadir al calendario',
  encuesta: 'Rellenar la encuesta',
};

// Enlace de Google Calendar con el directo ya relleno.
const gcalDate = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
export function googleCalendarUrl({ title, start, minutes = 180, details = '' }) {
  if (start == null) return '';
  const u = new URL('https://calendar.google.com/calendar/render');
  u.searchParams.set('action', 'TEMPLATE');
  u.searchParams.set('text', title);
  u.searchParams.set('dates', `${gcalDate(start)}/${gcalDate(start + minutes * 60_000)}`);
  if (details) u.searchParams.set('details', details);
  return u.toString();
}

// Archivo .ics (Apple Calendar, Outlook…) del directo.
export function icsFile({ title, start, minutes = 180, url = '', uid }) {
  const esc = (t) => String(t).replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lanzamientos MLDLM//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${gcalDate(Date.now())}`,
    `DTSTART:${gcalDate(start)}`,
    `DTEND:${gcalDate(start + minutes * 60_000)}`,
    `SUMMARY:${esc(title)}`,
    url ? `DESCRIPTION:${esc(`Entra al directo aquí: ${url}`)}` : '',
    url ? `URL:${url}` : '',
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

export const LOCAL_DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const tzParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Madrid', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

// Diferencia (ms) entre la hora de Madrid y UTC en un instante dado.
function madridOffset(epoch) {
  const p = Object.fromEntries(tzParts.formatToParts(new Date(epoch)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(epoch / 1000) * 1000;
}

// "2026-10-27T19:00" (hora de España) → milisegundos UTC.
export function madridToEpoch(local) {
  if (!LOCAL_DT_RE.test(local || '')) return null;
  const [d, t] = local.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, da, h, mi);
  let epoch = guess - madridOffset(guess);
  epoch = guess - madridOffset(epoch); // corrige el día del cambio de hora
  return epoch;
}

function nextDay(isoDay) {
  const d = new Date(`${isoDay}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Momentos clave del lanzamiento (ms UTC). Los que falten quedan a null.
//  - directo: a esa hora la página de recursos manda al directo.
//  - postDirecto: 00:00 del día siguiente al directo → la página de recursos manda al replay.
//  - replay: cuando se desbloquea la grabación (por defecto, también a las 00:00 del día siguiente).
//  - videos: lo mismo para cada vídeo del lanzamiento (el [0] es el webinar / vídeo 1).
function momentosVideo(v) {
  const inicio = v.fecha && v.hora ? madridToEpoch(`${v.fecha}T${v.hora}`) : null;
  const post = v.fecha ? madridToEpoch(`${nextDay(v.fecha)}T00:00`) : null;
  return { k: v.k, dia: v.fecha ? madridToEpoch(`${v.fecha}T00:00`) : null, inicio, post, replay: madridToEpoch(v.replayAt) ?? post };
}
export function milestones(launch) {
  const videos = videosDe(launch).map(momentosVideo);
  const v1 = videos[0] || { dia: null, inicio: null, post: null, replay: null };
  return {
    clase1: madridToEpoch(launch.clase1At),
    clase2: madridToEpoch(launch.clase2At),
    clase3: madridToEpoch(launch.clase3At),
    diaDirecto: v1.dia,
    directo: v1.inicio,
    postDirecto: v1.post,
    replay: v1.replay,
    cierre: madridToEpoch(launch.cierreCarrito),
    videos,
  };
}

// Fase actual, hasta cuándo dura y a qué momento apunta la cuenta atrás.
export function phaseAt(launch, now) {
  const m = milestones(launch);
  const before = (t) => t == null || now < t;
  // Clases del prelanzamiento: antes de la 1, «pre_c1»; luego «c1», «c2»… hasta la siguiente.
  const nc = nClases(launch);
  for (let i = 1; i <= nc; i++) {
    const t = m[`clase${i}`];
    if (t != null && now < t) return { id: i === 1 ? 'pre_c1' : `c${i - 1}`, countdownTo: t, changesAt: t, m };
  }
  // Vídeos del lanzamiento, uno detrás de otro: antes de su día sigue la fase anterior
  // (la clase 2, o «vídeo anterior disponible»); su día; su directo o estreno; y al siguiente.
  for (const v of m.videos) {
    const s = suf(v.k);
    const previa = v.k === 1 ? (nc ? `c${nc}` : 'pre_c1') : `v${v.k - 1}`;
    if (v.inicio == null || (v.dia != null && now < v.dia)) return { id: previa, countdownTo: v.inicio, changesAt: v.dia ?? v.inicio, m };
    if (now < v.inicio) return { id: `dia_directo${s}`, countdownTo: v.inicio, changesAt: v.inicio, m };
    if (v.post == null || now < v.post) return { id: `en_directo${s}`, countdownTo: null, changesAt: v.post, m };
  }
  if (before(m.cierre)) return { id: 'replay', countdownTo: m.cierre, changesAt: m.cierre, m };
  return { id: 'cerrado', countdownTo: null, changesAt: null, m };
}

// Adónde manda la página de recursos en cada fase (clave de `links`), o '' para quedarse.
export function redirectFor(launch, phaseId) {
  const vs = videosDe(launch);
  const ultimo = vs.at(-1);
  if (phaseId === 'replay' || phaseId === 'cerrado') return ultimo && ultimo.k > 1 ? `grabacion${ultimo.k}` : 'grabacion';
  const en = /^en_directo(\d?)$/.exec(phaseId);
  if (en) {
    const v = vs[(Number(en[1]) || 1) - 1];
    return esEnDirecto(v) || v?.k === 1 ? `directo${en[1]}` : `grabacion${en[1]}`;
  }
  const entre = /^v(\d)$/.exec(phaseId);
  if (entre) return entre[1] === '1' ? 'grabacion' : `grabacion${entre[1]}`;
  return '';
}

// Mensaje y botón de la barra para una fase (lo configurado o el texto por defecto).
export function barFor(launch, phaseId) {
  const def = phasesFor(launch).find((p) => p.id === phaseId) || PHASES[0];
  const cfg = launch.barra?.[phaseId] || {};
  return {
    text: cfg.text != null && cfg.text !== '' ? cfg.text : def.text,
    button: cfg.button != null ? cfg.button : def.button,
    buttonLabel: cfg.buttonLabel || '',
  };
}

// Barra fija de la página de replay: un texto con {cuenta} y, al llegar a cero, lleva a la página de venta.
// La cuenta atrás va hasta una fecha y hora fija o dura X minutos desde que cada lead abre la grabación.
export const REPLAY_BARRA_TEXTO = '⏳ La grabación se retira en {cuenta}';
export const REPLAY_BARRA_BOTON = 'Ver la oferta';
export function sanitizeReplayBarra(r) {
  const txt = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
  const min = Math.floor(Number(r?.minutos));
  return {
    activa: Boolean(r?.activa),
    texto: txt(r?.texto, 200),
    modo: r?.modo === 'minutos' ? 'minutos' : 'fecha',
    at: LOCAL_DT_RE.test(String(r?.at || '')) ? String(r.at) : '',
    minutos: Number.isFinite(min) && min > 0 ? Math.min(min, 60 * 24 * 14) : null,
    // ¿Lleva botón (a la página de venta) o es solo informativa? Se elige siempre; sin elegir, según haya texto.
    conBoton: typeof r?.conBoton === 'boolean' ? r.conBoton : Boolean(r?.boton == null ? false : txt(r.boton, 40)),
    boton: r?.boton == null ? REPLAY_BARRA_BOTON : txt(r.boton, 40),
    color: /^#[0-9a-f]{6}$/i.test(String(r?.color || '')) ? String(r.color).toLowerCase() : '',
  };
}
// Lo que necesita la página: hasta cuándo (`at`, ms) o cuántos minutos por lead; null si no hay barra.
export function replayBarraDe(launch) {
  const r = launch?.replayBarra;
  if (!r?.activa) return null;
  const at = r.modo === 'fecha' ? madridToEpoch(r.at) : null;
  const minutos = r.modo === 'minutos' ? r.minutos : null;
  if (at == null && !minutos) return null;
  return { text: r.texto || REPLAY_BARRA_TEXTO, at, minutos, boton: r.conBoton ? r.boton || REPLAY_BARRA_BOTON : '', color: r.color || '' };
}

// "lunes 27 de octubre, 19:00" en hora de España.
const fmtLong = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const fmtDate = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long' });
const fmtTime = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
export const formatLong = (ms) => (ms == null ? '' : fmtLong.format(new Date(ms)));
export const formatDate = (ms) => (ms == null ? '' : fmtDate.format(new Date(ms)));
export const formatTime = (ms) => (ms == null ? '' : fmtTime.format(new Date(ms)));
