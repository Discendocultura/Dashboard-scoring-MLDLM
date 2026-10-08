// Pesos de la puntuación de los leads: cuánto cuenta cada bloque sobre 100.
//   clases: lo visto de las clases del prelanzamiento · vip: compró la entrada VIP · video: lo visto del
//   directo o la grabación (el vídeo de venta).
// De serie 30 / 30 / 40. Con las ventas de un lanzamiento se propone un reparto nuevo: más peso a lo que
// más separa a las que compran de las que no (diferencia de conversión con y sin la señal).
import { watched, puntosVideo } from './scoring.js';

export const PESOS_SERIE = { clases: 30, vip: 30, video: 40 };
export const BLOQUES = [
  { id: 'clases', label: 'Clases del prelanzamiento', senal: 'vio al menos la mitad de alguna clase' },
  { id: 'vip', label: 'Entrada VIP', senal: 'compró la entrada VIP' },
  { id: 'video', label: 'Directo o grabación', senal: 'asistió al directo o vio al menos la mitad de la grabación' },
];
const MIN_MUESTRA = 30; // leads con la señal
const MIN_VENTAS = 10;

export function sanitizePesos(p) {
  if (!p || typeof p !== 'object') return null;
  const out = {};
  for (const { id } of BLOQUES) {
    const v = Math.round(Number(p[id]));
    if (!Number.isFinite(v) || v < 5 || v > 80) return null;
    out[id] = v;
  }
  return out;
}
export const pesosDe = (config) => sanitizePesos(config?.pesosScore) || PESOS_SERIE;

const tieneSenal = {
  clases: (s) => (s.clases || ['clase1', 'clase2']).some((c) => watched(s, c) >= 50),
  vip: (s) => Boolean(s.vip),
  video: (s) => puntosVideo(s, s.nVideos || 1) >= 20,
};

// { pesos, detalle: [{ id, label, senal, con, convCon, convSin, diferencia }], ventas } o { motivo } si no hay datos.
export function proponerPesos(leads, { conClases = true, conVip = true } = {}) {
  const ventas = leads.filter((l) => l.s.compra).length;
  if (ventas < MIN_VENTAS) return { motivo: `Hacen falta al menos ${MIN_VENTAS} ventas para proponer pesos (hay ${ventas}).` };
  const activos = BLOQUES.filter((b) => (b.id !== 'clases' || conClases) && (b.id !== 'vip' || conVip));
  const detalle = activos.map((b) => {
    const con = leads.filter((l) => tieneSenal[b.id](l.s));
    const sin = leads.filter((l) => !tieneSenal[b.id](l.s));
    const convCon = con.length ? con.filter((l) => l.s.compra).length / con.length : 0;
    const convSin = sin.length ? sin.filter((l) => l.s.compra).length / sin.length : 0;
    return { ...b, con: con.length, convCon, convSin, diferencia: convCon - convSin, poca: con.length < MIN_MUESTRA };
  });
  // Peso proporcional a la diferencia de conversión (mínimo 10 y máximo 70 por bloque); los bloques con
  // poca muestra se quedan con su peso de serie.
  const fijos = detalle.filter((d) => d.poca);
  const libres = detalle.filter((d) => !d.poca);
  const totalFijo = fijos.reduce((t, d) => t + PESOS_SERIE[d.id], 0);
  const reparto = 100 - totalFijo;
  const base = libres.map((d) => Math.max(d.diferencia, 0.005));
  const suma = base.reduce((a, b) => a + b, 0) || 1;
  const pesos = {};
  for (const d of fijos) pesos[d.id] = PESOS_SERIE[d.id];
  libres.forEach((d, i) => { pesos[d.id] = Math.min(70, Math.max(10, Math.round(((base[i] / suma) * reparto) / 5) * 5)); });
  // Que sumen 100 entre los bloques del embudo (se ajusta el mayor).
  const ids = detalle.map((d) => d.id);
  const total = ids.reduce((t, id) => t + pesos[id], 0);
  if (ids.length && total !== 100) { const mayor = ids.reduce((a, b) => (pesos[a] >= pesos[b] ? a : b)); pesos[mayor] += 100 - total; }
  // Los bloques que el embudo no tiene conservan su peso de serie (no cuentan: la puntuación se escala).
  for (const { id } of BLOQUES) if (pesos[id] == null) pesos[id] = PESOS_SERIE[id];
  return { pesos, detalle, ventas };
}
