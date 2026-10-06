// Calendario del lanzamiento: hitos, franjas de fase y archivo .ics de suscripción.
// Lo usan el navegador (pestaña Calendario) y el servidor (/api/cal).
import { madridToEpoch } from './page.js';
import { addDays } from './tareas.js';

// Tipos de evento propio (los añade la admin a mano).
export const EVENTO_TIPOS = [
  { id: 'email', label: 'Email', icon: '✉️' },
  { id: 'rrss', label: 'Contenido / RRSS', icon: '📱' },
  { id: 'publi', label: 'Publicidad', icon: '📣' },
  { id: 'reunion', label: 'Reunión', icon: '👥' },
  { id: 'directo', label: 'Directo / live', icon: '🎙️' },
  { id: 'otro', label: 'Otro', icon: '📌' },
];

const day = (v) => String(v || '').slice(0, 10);
const time = (v) => (/T\d{2}:\d{2}/.test(String(v || '')) ? String(v).slice(11, 16) : '');

// Hitos del lanzamiento con su día (YYYY-MM-DD) y hora ('' = todo el día). Solo los que tienen fecha.
export function hitosLanzamiento(launch = {}) {
  const directoDT = launch.fechaDirecto ? `${launch.fechaDirecto}T${launch.horaDirecto || ''}` : '';
  const apertura = launch.aperturaCarrito || directoDT;
  const replay = launch.replayAt || (launch.fechaDirecto ? `${addDays(launch.fechaDirecto, 1)}T00:00` : '');
  const list = [
    { id: 'captacion', titulo: 'Empieza la publi de captación', icon: '📣', at: launch.inicioCaptacion },
    { id: 'fin-captacion', titulo: 'Termina la publi de captación', icon: '🛑', at: launch.finCaptacion },
    { id: 'clase1', titulo: 'Se libera la clase 1', icon: '🎬', at: launch.clase1At },
    { id: 'clase2', titulo: 'Se libera la clase 2', icon: '🎬', at: launch.clase2At },
    { id: 'directo', titulo: 'Directo', icon: '🔴', at: directoDT, minutos: 180 },
    { id: 'carrito', titulo: 'Abre el carrito de Raíces', icon: '🛒', at: apertura },
    { id: 'replay', titulo: 'Se libera la grabación', icon: '📼', at: replay },
    { id: 'cierre', titulo: 'Cierre del carrito', icon: '🔒', at: launch.cierreCarrito },
  ];
  return list.filter((h) => /^\d{4}-\d{2}-\d{2}/.test(h.at || '')).map((h) => ({ ...h, day: day(h.at), time: time(h.at) }));
}

// Franjas de fase (de día a día, ambos incluidos) para sombrear el calendario.
export function fasesLanzamiento(launch = {}) {
  const directo = launch.fechaDirecto || '';
  const c1 = day(launch.clase1At);
  const apertura = day(launch.aperturaCarrito) || directo;
  const cierre = day(launch.cierreCarrito);
  const out = [];
  if (launch.inicioCaptacion) out.push({ id: 'captacion', label: 'Captación', from: launch.inicioCaptacion, to: launch.finCaptacion || addDays(directo, -1) || launch.inicioCaptacion });
  if (c1 && directo) out.push({ id: 'clases', label: 'Clases previas', from: c1, to: addDays(directo, -1) });
  if (directo) out.push({ id: 'directo', label: 'Directo', from: directo, to: directo });
  if (apertura && cierre) out.push({ id: 'carrito', label: 'Carrito abierto', from: apertura, to: cierre });
  return out.filter((f) => f.from && f.to && f.from <= f.to);
}

// ---------- .ics ----------
const icsEsc = (t) => String(t ?? '').replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');
const utc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const compact = (d) => d.replace(/-/g, '');

// Corta las líneas a 75 octetos como pide el estándar (Google es tolerante, Apple no tanto).
function fold(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (bytes + n > 74) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n');
}

// items: [{ uid, titulo, day, time?, minutos?, fin? (día final, todo el día), notas?, url? }]
export function icsCalendar(name, items) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lanzamientos MLDLM//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEsc(name)}`, 'X-WR-TIMEZONE:Europe/Madrid', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
  const stamp = utc(Date.now());
  for (const it of items) {
    lines.push('BEGIN:VEVENT', `UID:${it.uid}`, `DTSTAMP:${stamp}`);
    const start = it.time ? madridToEpoch(`${it.day}T${it.time}`) : null;
    if (start != null) {
      lines.push(`DTSTART:${utc(start)}`, `DTEND:${utc(start + (it.minutos || 30) * 60_000)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compact(it.day)}`, `DTEND;VALUE=DATE:${compact(addDays(it.fin && it.fin > it.day ? it.fin : it.day, 1))}`);
    }
    lines.push(`SUMMARY:${icsEsc(it.titulo)}`);
    if (it.notas) lines.push(`DESCRIPTION:${icsEsc(it.notas)}`);
    if (it.url) lines.push(`URL:${it.url}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n');
}
