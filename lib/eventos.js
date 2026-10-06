// Eventos propios del calendario de cada lanzamiento (Custom Value lsd_eventos_<código>).
import { getCustomValue, saveCustomValue } from './ghl.js';
import { EVENTO_TIPOS } from '../public/js/calendario.js';

export const MAX_EVENTOS = 200;
const name = (code) => `lsd_eventos_${code}`;
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIPOS = EVENTO_TIPOS.map((t) => t.id);

export async function getEventos(code) {
  const cv = await getCustomValue(name(code));
  if (!cv?.value) return [];
  try {
    const parsed = JSON.parse(cv.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error(`Eventos de ${code} corruptos, se ignoran`);
    return [];
  }
}

export const saveEventos = (code, eventos) => saveCustomValue(name(code), JSON.stringify(eventos));

export function sanitizeEvento(input) {
  const bad = (m) => Object.assign(new Error(m), { status: 400, publicMessage: m });
  const titulo = str(input?.titulo, 200);
  if (!titulo) throw bad('El evento necesita un título');
  const fecha = str(input?.fecha, 10);
  if (!ISO_DAY.test(fecha)) throw bad('El evento necesita una fecha');
  const fin = ISO_DAY.test(str(input?.fin, 10)) && str(input.fin, 10) > fecha ? str(input.fin, 10) : '';
  const hora = /^\d{2}:\d{2}$/.test(str(input?.hora, 5)) && !fin ? str(input.hora, 5) : '';
  return { titulo, fecha, fin, hora, tipo: TIPOS.includes(input?.tipo) ? input.tipo : 'otro', notas: str(input?.notas, 1000) };
}
