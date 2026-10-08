// Recursos de la página preclase de un lanzamiento, además de las clases grabadas:
//   · música   — un audio (MP3) debajo de una clase; se desbloquea al ver el 75 % de esa clase.
//                Se mide si lo reproduce y si lo escucha al 50 % y al 90 % (etiquetas como los vídeos).
//   · test     — un test de GHL (botón a su página); se desbloquea en su fecha y se sabe que lo hizo
//                por la etiqueta que pone GHL al terminarlo.
//   · votación — una pregunta con opciones debajo de una clase (la hace el dashboard, no GHL); se
//                desbloquea al ver el 75 % de esa clase; al votar se ven los % de todas.
//   · descargable — un recurso (PDF, guía…) con su enlace; opcionalmente desde una fecha.
// Etapas de la página: 1 la encuesta, después cada clase, test o descargable por orden de fecha, y la
// última el directo. La música y la votación van dentro de la etapa de su clase.
// Lo usan el navegador, el servidor y la página (vía /api/page).
import { madridToEpoch, LOCAL_DT_RE } from './page.js';

export const TIPOS_RECURSO = [
  { id: 'clase', label: 'Clase grabada', icon: '🎬', desc: 'Vídeo de Vimeo con su fecha de desbloqueo' },
  { id: 'musica', label: 'Música o audio', icon: '🎵', desc: 'Debajo de una clase; se desbloquea al ver el 75 % de la clase' },
  { id: 'test', label: 'Test (GHL)', icon: '🧭', desc: 'Botón a un test de GHL; se desbloquea en su fecha y se mide con su etiqueta' },
  { id: 'votacion', label: 'Votación', icon: '🗳️', desc: 'Debajo de una clase; al votar ven los % de todas' },
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
  const opciones = (Array.isArray(v.opciones) ? v.opciones : String(v.opciones || '').split('\n'))
    .map((o, i) => (typeof o === 'object' ? { id: str(o.id, 12) || `o${i + 1}`, texto: str(o.texto, 120) } : { id: `o${i + 1}`, texto: str(o, 120) }))
    .filter((o) => o.texto).slice(0, 8);
  // Ids estables y únicos (los votos se guardan con el id de la opción).
  const vistos = new Set();
  for (const [i, o] of opciones.entries()) { if (!/^[a-z0-9_-]{1,12}$/i.test(o.id) || vistos.has(o.id)) o.id = `o${i + 1}`; vistos.add(o.id); }
  return {
    musica: { activo: Boolean(m.activo), nombre: str(m.nombre, 80), url: url(m.url), tras: clase(m.tras, nClases), texto: str(m.texto, 200) },
    test: { activo: Boolean(t.activo), nombre: str(t.nombre, 120), url: url(t.url), tag: str(t.tag, 120).toLowerCase(), at: localDT(t.at) },
    votacion: { activo: Boolean(v.activo), pregunta: str(v.pregunta, 200), opciones, tras: clase(v.tras || 'clase2', nClases) },
    descargable: { activo: Boolean(d.activo), nombre: str(d.nombre, 120), url: url(d.url), at: localDT(d.at) },
  };
}

export const recursosDe = (launch) => launch?.recursosPre || sanitizeRecursos(null);
// ¿Tiene el lanzamiento ese recurso (activo y con lo mínimo para funcionar)?
export function tieneRecurso(launch, tipo) {
  const r = recursosDe(launch)[tipo];
  if (!r?.activo) return false;
  if (tipo === 'votacion') return Boolean(r.pregunta) && r.opciones.length >= 2;
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
