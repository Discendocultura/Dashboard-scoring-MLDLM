// Pesos de la puntuación de los leads: cuánto cuenta cada bloque sobre 100.
//   clases: lo visto de las clases del prelanzamiento · musica: escuchó la música de la preclase ·
//   test: hizo el test · votacion: votó · vip: compró la entrada VIP · video: lo visto del directo o la
//   grabación (el vídeo de venta). Los de la preclase solo cuentan si el lanzamiento los tiene.
// De serie 20 / 5 / 10 / 5 / 25 / 35. Con las ventas de un lanzamiento se propone un reparto nuevo: más
// peso a lo que más separa a las que compran de las que no (diferencia de conversión con y sin la señal).
import { watched, puntosVideo, PESOS_SERIE, PESOS_CLASICOS, pesosEfectivos } from './scoring.js';

export { PESOS_SERIE, PESOS_CLASICOS, pesosEfectivos };
export const BLOQUES = [
  { id: 'clases', label: 'Clases del prelanzamiento', senal: 'vio al menos la mitad de alguna clase' },
  { id: 'musica', label: 'Música de la preclase', senal: 'la escuchó al menos a la mitad' },
  { id: 'test', label: 'Test', senal: 'lo completó' },
  { id: 'votacion', label: 'Votación', senal: 'votó' },
  { id: 'vip', label: 'Entrada VIP', senal: 'compró la entrada VIP' },
  { id: 'video', label: 'Directo o grabación', senal: 'asistió al directo o vio al menos la mitad de la grabación' },
];
const MIN_MUESTRA = 30; // leads con la señal
const MIN_VENTAS = 10;

// Guardados antes de existir la música, el test y la votación: esos bloques toman su valor de serie.
export function sanitizePesos(p) {
  if (!p || typeof p !== 'object') return null;
  const out = {};
  for (const { id } of BLOQUES) {
    if (p[id] == null && ['musica', 'test', 'votacion'].includes(id)) { out[id] = PESOS_SERIE[id]; continue; }
    const v = Math.round(Number(p[id]));
    if (!Number.isFinite(v) || v < 0 || v > 80) return null;
    out[id] = v;
  }
  return out;
}
// Los aprendidos del cliente (null = de serie, según los recursos de cada lanzamiento).
export const pesosDe = (config) => sanitizePesos(config?.pesosScore);

const tieneSenal = {
  clases: (s) => (s.clases || ['clase1', 'clase2']).some((c) => watched(s, c) >= 50),
  vip: (s) => Boolean(s.vip),
  video: (s) => puntosVideo(s, s.nVideos || 1) >= 20,
  musica: (s) => Boolean(s.musica_50 || s.musica_90),
  test: (s) => Boolean(s.test),
  votacion: (s) => Boolean(s.voto),
};

// { pesos, detalle: [{ id, label, senal, con, convCon, convSin, diferencia }], ventas } o { motivo } si no hay datos.
export function proponerPesos(leads, { conClases = true, conVip = true, recursos = {} } = {}) {
  const ventas = leads.filter((l) => l.s.compra).length;
  if (ventas < MIN_VENTAS) return { motivo: `Hacen falta al menos ${MIN_VENTAS} ventas para proponer pesos (hay ${ventas}).` };
  const activos = BLOQUES.filter((b) => (b.id !== 'clases' || conClases) && (b.id !== 'vip' || conVip)
    && (!['musica', 'test', 'votacion'].includes(b.id) || recursos[b.id]));
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
  const serie = pesosEfectivos(null, recursos); // de serie para este lanzamiento
  const totalFijo = fijos.reduce((t, d) => t + serie[d.id], 0);
  const reparto = 100 - totalFijo;
  const base = libres.map((d) => Math.max(d.diferencia, 0.005));
  const suma = base.reduce((a, b) => a + b, 0) || 1;
  const pesos = {};
  for (const d of fijos) pesos[d.id] = serie[d.id];
  // Mínimo 5 para los de la preclase (son pequeños) y 10 para el resto.
  libres.forEach((d, i) => { const min = ['musica', 'test', 'votacion'].includes(d.id) ? 5 : 10; pesos[d.id] = Math.min(70, Math.max(min, Math.round(((base[i] / suma) * reparto) / 5) * 5)); });
  // Que sumen 100 entre los bloques del embudo (se ajusta el mayor).
  const ids = detalle.map((d) => d.id);
  const total = ids.reduce((t, id) => t + pesos[id], 0);
  if (ids.length && total !== 100) { const mayor = ids.reduce((a, b) => (pesos[a] >= pesos[b] ? a : b)); pesos[mayor] += 100 - total; }
  // Los bloques que el embudo no tiene conservan su peso de serie (no cuentan: la puntuación se escala).
  for (const { id } of BLOQUES) if (pesos[id] == null) pesos[id] = serie[id];
  return { pesos, detalle, ventas };
}
