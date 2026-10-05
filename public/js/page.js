// Fases de la página de recursos / grabación de un lanzamiento. Lo usan el servidor (/api/page)
// y el dashboard (vista previa). Las fechas se escriben en hora de España ("2026-10-27T19:00").

export const PHASES = [
  { id: 'pre_c1', label: 'Antes de la clase 1', button: 'whatsapp', text: 'La clase 1 se abre en {cuenta}' },
  { id: 'c1', label: 'Clase 1 disponible', button: 'vip', text: 'Ya puedes ver la clase 1 · La clase 2 se abre en {cuenta}' },
  { id: 'c2', label: 'Clase 2 disponible', button: 'vip', text: 'Ya puedes ver la clase 2 · El directo empieza en {cuenta}' },
  { id: 'dia_directo', label: 'Día del directo (antes de empezar)', button: 'directo', text: 'Hoy es el directo · Empieza en {cuenta}' },
  { id: 'en_directo', label: 'Directo (desde que empieza hasta las 00:00)', button: 'directo', text: '🔴 Estamos en directo' },
  { id: 'replay', label: 'Grabación / carrito abierto', button: 'venta', text: 'La grabación se retira en {cuenta}' },
  { id: 'cerrado', label: 'Carrito cerrado', button: '', text: 'Las puertas de Raíces se han cerrado' },
];

export const LINK_KEYS = {
  '': 'Sin botón',
  whatsapp: 'Grupo de WhatsApp',
  vip: 'Comprar entrada VIP',
  directo: 'Entrar al directo',
  grabacion: 'Ver la grabación',
  venta: 'Página de venta de Raíces',
  pago: 'Enlace de pago',
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
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lead Scoring//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
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
export function milestones(launch) {
  const directo = launch.fechaDirecto && launch.horaDirecto ? madridToEpoch(`${launch.fechaDirecto}T${launch.horaDirecto}`) : null;
  const postDirecto = launch.fechaDirecto ? madridToEpoch(`${nextDay(launch.fechaDirecto)}T00:00`) : null;
  return {
    clase1: madridToEpoch(launch.clase1At),
    clase2: madridToEpoch(launch.clase2At),
    diaDirecto: launch.fechaDirecto ? madridToEpoch(`${launch.fechaDirecto}T00:00`) : null,
    directo,
    postDirecto,
    replay: madridToEpoch(launch.replayAt) ?? postDirecto,
    cierre: madridToEpoch(launch.cierreCarrito),
  };
}

// Fase actual, hasta cuándo dura y a qué momento apunta la cuenta atrás.
export function phaseAt(launch, now) {
  const m = milestones(launch);
  const before = (t) => t == null || now < t;
  let id;
  if (m.clase1 != null && now < m.clase1) id = 'pre_c1';
  else if (m.clase2 != null && now < m.clase2) id = 'c1';
  else if (m.directo == null || (m.diaDirecto != null && now < m.diaDirecto)) id = 'c2';
  else if (now < m.directo) id = 'dia_directo';
  else if (m.postDirecto == null || now < m.postDirecto) id = 'en_directo';
  else if (before(m.cierre)) id = 'replay';
  else id = 'cerrado';

  const target = {
    pre_c1: m.clase1, c1: m.clase2, c2: m.directo, dia_directo: m.directo,
    en_directo: null, replay: m.cierre, cerrado: null,
  }[id];
  const ends = {
    pre_c1: m.clase1, c1: m.clase2, c2: m.diaDirecto ?? m.directo, dia_directo: m.directo,
    en_directo: m.postDirecto, replay: m.cierre, cerrado: null,
  }[id];
  return { id, countdownTo: target ?? null, changesAt: ends ?? null, m };
}

// Mensaje y botón de la barra para una fase (lo configurado o el texto por defecto).
export function barFor(launch, phaseId) {
  const def = PHASES.find((p) => p.id === phaseId) || PHASES[0];
  const cfg = launch.barra?.[phaseId] || {};
  return {
    text: cfg.text != null && cfg.text !== '' ? cfg.text : def.text,
    button: cfg.button != null ? cfg.button : def.button,
    buttonLabel: cfg.buttonLabel || '',
  };
}

// "lunes 27 de octubre, 19:00" en hora de España.
const fmtLong = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const fmtDate = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long' });
const fmtTime = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
export const formatLong = (ms) => (ms == null ? '' : fmtLong.format(new Date(ms)));
export const formatDate = (ms) => (ms == null ? '' : fmtDate.format(new Date(ms)));
export const formatTime = (ms) => (ms == null ? '' : fmtTime.format(new Date(ms)));
