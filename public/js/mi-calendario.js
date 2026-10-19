// «Añadir a mi calendario» desde la Operativa: cada persona elige su calendario (Google, Outlook o Apple/otro con un
// archivo .ics) y cada tarea se añade con un clic. Además, la suscripción (/api/cal?op=1) mete solas en su calendario
// todas las tareas con fecha que tiene asignadas, y se actualiza sola.
import { madridToEpoch } from './page.js';
import { icsCalendar } from './calendario.js';
import { addDays } from './tareas.js';

export const CALENDARIOS = [
  { id: 'google', nombre: 'Google Calendar', ico: '🟦' },
  { id: 'outlook', nombre: 'Outlook / Microsoft 365', ico: '🟪' },
  { id: 'apple', nombre: 'Apple Calendar u otro (.ics)', ico: '🍏' },
];
export const calendarioValido = (id) => CALENDARIOS.some((c) => c.id === id);

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;
const corto = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s || ''));
const utc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const compact = (d) => d.replace(/-/g, '');

// El evento de una tarea: { titulo, dia, hora? ('' = todo el día), minutos, notas, url }.
export function eventoDeTarea(t, { hora = '', minutos = 60, url = '', hoy = '' } = {}) {
  const dia = ISO_DAY.test(t?.fecha || '') ? t.fecha : hoy;
  const proyecto = t?.clienteNombre ? ` · ${t.clienteNombre}` : '';
  const notas = [t?.notasTexto ? corto(t.notasTexto, 1500) : '', url ? `Ábrela en AlquimIA: ${url}` : ''].filter(Boolean).join('\n\n');
  return { titulo: `${t?.titulo || 'Tarea'}${proyecto}`, dia, hora: HORA.test(hora) ? hora : '', minutos, notas, url };
}

// Inicio y fin en el formato de cada calendario.
function rango(ev) {
  if (ev.hora) {
    const ini = madridToEpoch(`${ev.dia}T${ev.hora}`);
    return { todoElDia: false, ini, fin: ini + ev.minutos * 60_000 };
  }
  return { todoElDia: true, ini: ev.dia, fin: addDays(ev.dia, 1) };
}

// Enlace que abre el evento ya relleno (Google, Outlook). Apple/otro: null (se descarga el .ics).
export function enlaceCalendario(tipo, ev) {
  const r = rango(ev);
  if (tipo === 'google') {
    const dates = r.todoElDia ? `${compact(r.ini)}/${compact(r.fin)}` : `${utc(r.ini)}/${utc(r.fin)}`;
    const q = new URLSearchParams({ action: 'TEMPLATE', text: ev.titulo, dates, details: ev.notas, ctz: 'Europe/Madrid' });
    return `https://calendar.google.com/calendar/render?${q}`;
  }
  if (tipo === 'outlook') {
    const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const q = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: ev.titulo, body: ev.notas,
      startdt: r.todoElDia ? r.ini : iso(r.ini), enddt: r.todoElDia ? r.fin : iso(r.fin), ...(r.todoElDia ? { allday: 'true' } : {}) });
    return `https://outlook.office.com/calendar/0/deeplink/compose?${q}`;
  }
  return null;
}

// Archivo .ics de un solo evento (Apple Calendar, Outlook de escritorio, Thunderbird…).
export function icsDeEvento(ev, uid) {
  return icsCalendar(ev.titulo, [{ uid, titulo: ev.titulo, day: ev.dia, time: ev.hora, minutos: ev.minutos, notas: ev.notas, url: ev.url }]);
}
