// Calendario del lanzamiento: hitos, franjas de fase y archivo .ics de suscripción.
// Lo usan el navegador (pestaña Calendario) y el servidor (/api/cal).
import { madridToEpoch } from './page.js';
import { addDays } from './tareas.js';
import { videosDe, esEnDirecto, nClases } from './videos.js';
import { ventanaBonus, tipoBonus, momentosCarrito } from './oferta.js';
import { diasCarrito } from './carrito.js';

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
  const vs = videosDe(launch);
  const unico = vs.length <= 1;
  const dt = (v) => (v?.fecha ? `${v.fecha}T${v.hora || ''}` : '');
  const venta = vs.at(-1);
  const apertura = launch.aperturaCarrito || dt(venta);
  const replay = launch.replayAt || (launch.fechaDirecto ? `${addDays(launch.fechaDirecto, 1)}T00:00` : '');
  const list = [
    { id: 'captacion', titulo: 'Empieza la publi de captación', icon: '📣', at: launch.inicioCaptacion },
    { id: 'fin-captacion', titulo: 'Termina la publi de captación', icon: '🛑', at: launch.finCaptacion },
    // Clases del prelanzamiento (1, 2 o 3 según el embudo).
    ...Array.from({ length: nClases(launch) }, (_, i) => ({ id: `clase${i + 1}`, titulo: `Clase ${i + 1} disponible`, icon: '🎬', at: launch[`clase${i + 1}At`] })),
    // Vídeos del lanzamiento: el webinar en directo, o cada vídeo / PLC (el de venta, marcado).
    ...vs.map((v) => ({
      id: v.k === 1 ? 'directo' : `directo${v.k}`,
      titulo: unico ? 'Webinar en directo' : `${v.nombre}${v.venta ? ' (venta)' : ''}${esEnDirecto(v) ? ' en directo' : ''}`,
      icon: esEnDirecto(v) || unico ? '🔴' : '🎥', at: dt(v), minutos: 180,
    })),
    { id: 'carrito', titulo: 'Abre el carrito de Raíces', icon: '🛒', at: apertura },
    ...(unico ? [{ id: 'replay', titulo: 'Grabación disponible', icon: '📼', at: replay }] : []),
    { id: 'cierre', titulo: 'Cierre del carrito', icon: '🔒', at: launch.cierreCarrito },
  ];
  return [...list.filter((h) => /^\d{4}-\d{2}-\d{2}/.test(h.at || '')).map((h) => ({ ...h, day: day(h.at), time: time(h.at) })),
    ...hitosBonus((launch.oferta?.bonus || []).map((b) => ({ ...b, ...ventanaBonus(b, launch) })), momentosCarrito(launch).cierre),
    ...hitosEstrategia(launch)];
}

// Estrategia de cada día del carrito (pestaña Carrito): su hito principal (la primera línea) en el calendario.
function hitosEstrategia(launch) {
  if (!launch.carritoNotas || !Object.keys(launch.carritoNotas).length) return [];
  return diasCarrito(launch).dias.filter((d) => d.nota).map((d) => ({
    id: `carrito-${d.day}`, icon: '🎯', titulo: `${d.n > 0 ? `Día ${d.n} de carrito` : d.titulo}: ${d.nota.split('\n')[0].trim().slice(0, 120)}`,
    at: d.day, day: d.day, time: '',
  }));
}

// Último día de cada bonus de la oferta (lanzamientos y meteóricos): un hito el día en que acaba, para que
// el equipo sepa qué pasa ese día. `bonus`: [{ id, tipo, nombre, hasta (epoch ms) }]. El que acaba con el
// cierre ya lo dice el hito del cierre. Si acaba a las 00:00, su último día es el anterior (hasta las 23:59).
const madridLocal = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const local = (ms) => madridLocal.format(new Date(ms)).replace(' ', 'T');
export function hitosBonus(bonus, cierre = null) {
  return bonus.filter((b) => b.hasta != null && b.hasta !== cierre).map((b) => {
    const t = local(b.hasta);
    const medianoche = t.endsWith('T00:00');
    const ultimo = medianoche ? local(b.hasta - 60_000) : t;
    const tipo = tipoBonus(b.tipo);
    // Los de menos de un día (BAR en directo, 1 h…) no tienen «último día»: acaban a una hora.
    const corto = b.desde != null && b.hasta - b.desde < 24 * 3_600_000;
    return {
      id: `bonus-${b.id}`, icon: '⏳', titulo: `${corto ? 'Acaba el' : 'Último día ·'} ${tipo.largo || tipo.label}: ${b.nombre} (acaba a las ${medianoche ? '23:59' : t.slice(11)})`,
      at: ultimo, day: day(ultimo), time: medianoche ? '' : t.slice(11),
    };
  });
}

// Franjas de fase (de día a día, ambos incluidos) para sombrear el calendario.
export function fasesLanzamiento(launch = {}) {
  const vs = videosDe(launch);
  const directo = launch.fechaDirecto || '';
  const ultimo = vs.at(-1)?.fecha || directo;
  const c1 = day(launch.clase1At);
  const apertura = day(launch.aperturaCarrito) || ultimo;
  const cierre = day(launch.cierreCarrito);
  const out = [];
  if (launch.inicioCaptacion) out.push({ id: 'captacion', label: 'Captación', from: launch.inicioCaptacion, to: launch.finCaptacion || addDays(directo, -1) || launch.inicioCaptacion });
  if (c1 && directo) out.push({ id: 'clases', label: 'Clases previas', from: c1, to: addDays(directo, -1) });
  if (directo) out.push({ id: 'directo', label: vs.length > 1 ? 'Vídeos del lanzamiento' : 'Webinar en directo', from: directo, to: ultimo >= directo ? ultimo : directo });
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
