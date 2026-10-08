// Recursos de la página preclase de un lanzamiento, además de las clases grabadas:
//   · música   — un audio (MP3) debajo de una clase; se desbloquea al ver el 75 % de esa clase.
//                Se mide si lo reproduce y si lo escucha al 50 % y al 90 % (etiquetas como los vídeos).
//   · test     — un test de GHL (botón a su página); se desbloquea en su fecha y se sabe que lo hizo
//                por la etiqueta que pone GHL al terminarlo.
//   · votación — una o varias preguntas debajo de una clase (la hace el dashboard, no GHL): tipo test
//                (opciones; al responder se ven los % de todas) o de respuesta libre. Se desbloquea al ver
//                el 75 % de esa clase.
//   · descargable — un recurso (PDF, guía…) con su enlace; opcionalmente desde una fecha.
// Etapas de la página: 1 la encuesta, después cada clase, test o descargable por orden de fecha, y la
// última el directo. La música y la votación van dentro de la etapa de su clase.
// Lo usan el navegador, el servidor y la página (vía /api/page).
import { madridToEpoch, LOCAL_DT_RE } from './page.js';

export const TIPOS_RECURSO = [
  { id: 'clase', label: 'Clase grabada', icon: '🎬', desc: 'Vídeo de Vimeo con su fecha de desbloqueo' },
  { id: 'musica', label: 'Música o audio', icon: '🎵', desc: 'Debajo de una clase; se desbloquea al ver el 75 % de la clase' },
  { id: 'test', label: 'Test (GHL)', icon: '🧭', desc: 'Botón a un test de GHL; se desbloquea en su fecha y se mide con su etiqueta' },
  { id: 'votacion', label: 'Votación', icon: '🗳️', desc: 'Debajo de una clase: una o varias preguntas, tipo test (ven los % al responder) o de respuesta libre' },
  { id: 'descargable', label: 'Recurso descargable', icon: '📄', desc: 'PDF, guía, plantilla… con su enlace' },
];
export const RECURSOS_EXTRA = ['musica', 'test', 'votacion', 'descargable'];
export const UMBRAL_DESBLOQUEO = 75; // % de la clase que hay que ver para la música y la votación

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const url = (v) => (/^https?:\/\//i.test(str(v, 600)) ? str(v, 600) : '');
const localDT = (v) => (LOCAL_DT_RE.test(str(v, 20)) ? str(v, 20) : '');
const clase = (v, n) => (/^clase[1-3]$/.test(String(v)) && Number(String(v).slice(5)) <= Math.max(1, n) ? String(v) : 'clase1');

// Limpia lo que llega del navegador. `nClases`: clases del prelanzamiento del embudo.
export function sanitizeRecursos(r, nClases = 2) {
  const m = r?.musica || {};
  const t = r?.test || {};
  const v = r?.votacion || {};
  const d = r?.descargable || {};
  const preguntas = sanitizePreguntas(v);
  return {
    musica: { activo: Boolean(m.activo), nombre: str(m.nombre, 80), url: url(m.url), tras: clase(m.tras, nClases), texto: str(m.texto, 200) },
    test: { activo: Boolean(t.activo), nombre: str(t.nombre, 120), url: url(t.url), tag: str(t.tag, 120).toLowerCase(), at: localDT(t.at) },
    votacion: { activo: Boolean(v.activo), preguntas, tras: clase(v.tras || 'clase2', nClases) },
    descargable: { activo: Boolean(d.activo), nombre: str(d.nombre, 120), url: url(d.url), at: localDT(d.at) },
  };
}

// Opciones de una pregunta tipo test: de un array o de un texto (una por línea). Ids estables por posición
// (o1, o2…): los votos guardan ese id.
function sanitizeOpciones(lista) {
  const opciones = (Array.isArray(lista) ? lista : String(lista || '').split('\n'))
    .map((o, i) => (o && typeof o === 'object' ? { id: str(o.id, 12) || `o${i + 1}`, texto: str(o.texto, 120) } : { id: `o${i + 1}`, texto: str(o, 120) }))
    .filter((o) => o.texto).slice(0, 8);
  const vistos = new Set();
  for (const [i, o] of opciones.entries()) { if (!/^[a-z0-9_-]{1,12}$/i.test(o.id) || vistos.has(o.id)) o.id = `o${i + 1}`; vistos.add(o.id); }
  return opciones;
}
// Preguntas de la votación: [{ id, tipo: 'opciones' | 'libre', pregunta, opciones }]. Hasta 6.
// Las votaciones antiguas (una sola pregunta con `pregunta` y `opciones`) pasan a ser la pregunta p1.
export const MAX_PREGUNTAS = 6;
function sanitizePreguntas(v) {
  const lista = Array.isArray(v.preguntas) ? v.preguntas : v.pregunta || v.opciones ? [{ id: 'p1', tipo: 'opciones', pregunta: v.pregunta, opciones: v.opciones }] : [];
  const items = lista.slice(0, MAX_PREGUNTAS);
  // Primero se respetan los ids que ya tenían (sus votos van con ese id); las nuevas cogen el siguiente libre.
  const usados = new Set();
  const ids = items.map((q) => { const id = str(q?.id, 12); if (/^p[0-9]{1,3}$/.test(id) && !usados.has(id)) { usados.add(id); return id; } return ''; });
  // Las nuevas van detrás de la última que ya existía (no heredan las respuestas de una pregunta quitada).
  let n = 1 + Math.max(0, ...[...usados].map((id) => Number(id.slice(1))));
  return items.map((q, i) => {
    let id = ids[i];
    if (!id) { while (usados.has(`p${n}`)) n++; id = `p${n}`; usados.add(id); }
    const tipo = q?.tipo === 'libre' ? 'libre' : 'opciones';
    return { id, tipo, pregunta: str(q?.pregunta, 200), opciones: tipo === 'opciones' ? sanitizeOpciones(q?.opciones) : [] };
  }).filter((q) => q.pregunta);
}
// Preguntas que se pueden contestar (las tipo test necesitan al menos 2 opciones).
export const preguntasValidas = (v) => (v?.preguntas || []).filter((q) => q.tipo === 'libre' || q.opciones.length >= 2);

export const recursosDe = (launch) => launch?.recursosPre || sanitizeRecursos(null);
// ¿Tiene el lanzamiento ese recurso (activo y con lo mínimo para funcionar)?
export function tieneRecurso(launch, tipo) {
  const r = recursosDe(launch)[tipo];
  if (!r?.activo) return false;
  if (tipo === 'votacion') return preguntasValidas(r).length > 0;
  if (tipo === 'test') return Boolean(r.url);
  return Boolean(r.url);
}

// Etapas de la página preclase, por orden: [{ n, id, tipo, label, at }]. `nClases` clases (clase1…).
export function etapasPreclase(launch, nClases = 2) {
  const r = recursosDe(launch);
  const items = [];
  for (let i = 1; i <= nClases; i++) items.push({ id: `clase${i}`, tipo: 'clase', label: `Clase ${i}`, at: madridToEpoch(launch?.[`clase${i}At`]) });
  if (tieneRecurso(launch, 'test')) items.push({ id: 'test', tipo: 'test', label: r.test.nombre || 'Test', at: madridToEpoch(r.test.at) });
  if (tieneRecurso(launch, 'descargable')) items.push({ id: 'descargable', tipo: 'descargable', label: r.descargable.nombre || 'Recurso', at: madridToEpoch(r.descargable.at) });
  // Por fecha; sin fecha, en el orden en que están (clases, test, descargable) y al final.
  const orden = items.map((x, i) => ({ ...x, i })).sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity) || a.i - b.i);
  const conEncuesta = Boolean(launch?.encuestaTag);
  const etapas = [];
  if (conEncuesta) etapas.push({ id: 'encuesta', tipo: 'encuesta', label: 'Encuesta', at: null });
  for (const x of orden) etapas.push({ id: x.id, tipo: x.tipo, label: x.label, at: x.at });
  etapas.push({ id: 'directo', tipo: 'directo', label: 'Directo', at: null });
  return etapas.map((e, i) => ({ ...e, n: i + 1 }));
}

// Puntos de la música (0-1) según lo escuchado.
export const nivelMusica = (s) => (s.musica_90 ? 1 : s.musica_50 ? 2 / 3 : s.musica_play ? 1 / 3 : 0);
