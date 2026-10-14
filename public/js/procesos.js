// Biblioteca de procesos de la agencia (solo superadmin): el «cómo se hace» de todo, con pasos, vídeos y
// enlaces. Común a todos los clientes (cliente «_agencia», clave lsd_procesos). No son tareas: es la
// documentación que se consulta (y que más adelante podrán enlazar las tareas de cada embudo).
//   { secciones: [{ id, titulo }], procesos: [{ id, seccion, titulo, html, asana, actualizado, por,
//     proyectos: [cliente…] (vacío = general, para todos), responsable, fecha, repetir: { tipo, n }, hecho, hechoEn, subtareas: [{ id, texto, hecha }],
//     comentarios: [{ id, porId, por, en, texto }], actividad: [{ en, por, txt }] }] }
// Como una tarea de Asana: responsable, fecha (que puede repetirse), descripción, subtareas y comentarios.
// Lo usan el navegador (panel) y el servidor (para limpiar lo que llega). Se importa desde Asana con un
// archivo .json (el contenido no va en el código: el repositorio es público).
import { sanitizeRich, safeHref, richToText } from './richtext.js';

export const MAX_PROCESOS = 400;
export const MAX_SECCIONES = 40;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const limpio = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const nuevoIdProceso = () => `pr${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const idSeccion = (titulo) => limpio(titulo, 60).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'general';

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
const PROYECTO_RE = /^[a-z][a-z0-9-]{1,23}$/; // id de un cliente del dashboard
// ¿Se ve en este proyecto? Los generales (sin proyecto), en todos. proyecto: '' = todos · '_general' = solo los generales.
export const enProyecto = (p, proyecto) => (!proyecto ? true : proyecto === '_general' ? !p.proyectos?.length : !p.proyectos?.length || p.proyectos.includes(proyecto));
export const REPETIR = [
  { id: '', label: 'No se repite' },
  { id: 'diaria', label: 'Cada día' },
  { id: 'laborables', label: 'Cada día laborable (L-V)' },
  { id: 'semanal', label: 'Cada semana' },
  { id: 'quincenal', label: 'Cada 2 semanas' },
  { id: 'mensual', label: 'Cada mes' },
  { id: 'dias', label: 'Cada N días' },
];
export const MAX_SUBTAREAS = 50;
export const MAX_COMENTARIOS = 300;
const MAX_ACTIVIDAD = 150;
const idCorto = () => Math.random().toString(36).slice(2, 10);

export function sanitizeRepetir(r) {
  const tipo = REPETIR.some((x) => x.id === r?.tipo) ? r.tipo : '';
  return tipo === 'dias' ? { tipo, n: Math.min(365, Math.max(1, Math.round(Number(r?.n) || 1))) } : { tipo, n: 0 };
}
export const sumarDias = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
function sumarMes(d) {
  const [y, m, dd] = d.split('-').map(Number);
  const ult = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // último día del mes siguiente
  return `${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, '0')}-${String(Math.min(dd, ult)).padStart(2, '0')}`;
}
// La siguiente fecha de un proceso que se repite (o '' si no se repite).
export function siguienteFecha(fecha, repetir) {
  const r = sanitizeRepetir(repetir);
  if (!r.tipo || !DIA_RE.test(fecha || '')) return '';
  if (r.tipo === 'diaria') return sumarDias(fecha, 1);
  if (r.tipo === 'laborables') { let d = sumarDias(fecha, 1); while ([0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())) d = sumarDias(d, 1); return d; }
  if (r.tipo === 'semanal') return sumarDias(fecha, 7);
  if (r.tipo === 'quincenal') return sumarDias(fecha, 14);
  if (r.tipo === 'mensual') return sumarMes(fecha);
  return sumarDias(fecha, r.n);
}
// Al marcar como hecho uno que se repite: la próxima fecha que no haya pasado ya.
export function proximaTrasHecho(fecha, repetir, hoy) {
  let d = siguienteFecha(fecha, repetir);
  for (let i = 0; d && d < hoy && i < 800; i++) d = siguienteFecha(d, repetir);
  return d;
}
// 'vencida' | 'hoy' | 'manana' | 'semana' | 'futura' | '' (sin fecha o hecho).
export function estadoFecha(p, hoy) {
  if (!p?.fecha || (p.hecho && !p.repetir?.tipo)) return '';
  if (p.fecha < hoy) return 'vencida';
  if (p.fecha === hoy) return 'hoy';
  if (p.fecha === sumarDias(hoy, 1)) return 'manana';
  return p.fecha <= sumarDias(hoy, 7) ? 'semana' : 'futura';
}
export const textoRepetir = (r) => (r?.tipo === 'dias' ? `Cada ${r.n} día${r.n === 1 ? '' : 's'}` : REPETIR.find((x) => x.id === (r?.tipo || ''))?.label || '');

export function sanitizeProceso(p, secciones = []) {
  const id = ID_RE.test(String(p?.id || '')) ? String(p.id) : nuevoIdProceso();
  const seccion = secciones.some((s) => s.id === p?.seccion) ? p.seccion : secciones[0]?.id || 'general';
  return {
    id, seccion,
    titulo: limpio(p?.titulo, 160) || 'Proceso sin título',
    html: sanitizeRich(p?.html || ''),
    asana: safeHref(p?.asana) && /^https:\/\/app\.asana\.com\//.test(p.asana) ? p.asana : '',
    actualizado: limpio(p?.actualizado, 30),
    por: limpio(p?.por, 60),
    proyectos: [...new Set((Array.isArray(p?.proyectos) ? p.proyectos : []).map(String).filter((x) => PROYECTO_RE.test(x)))].slice(0, 30),
    responsable: ID_RE.test(String(p?.responsable || '')) ? String(p.responsable) : '',
    fecha: DIA_RE.test(p?.fecha || '') ? p.fecha : '',
    repetir: sanitizeRepetir(p?.repetir),
    hecho: Boolean(p?.hecho),
    hechoEn: limpio(p?.hechoEn, 30),
    subtareas: (Array.isArray(p?.subtareas) ? p.subtareas : []).slice(0, MAX_SUBTAREAS)
      .map((x) => ({ id: ID_RE.test(String(x?.id || '')) ? String(x.id) : idCorto(), texto: limpio(x?.texto, 300), hecha: Boolean(x?.hecha) })).filter((x) => x.texto),
    comentarios: (Array.isArray(p?.comentarios) ? p.comentarios : []).slice(-MAX_COMENTARIOS)
      .map((c) => ({ id: ID_RE.test(String(c?.id || '')) ? String(c.id) : idCorto(), porId: ID_RE.test(String(c?.porId || '')) ? String(c.porId) : '', por: limpio(c?.por, 60) || 'Alguien', en: limpio(c?.en, 30), texto: String(c?.texto ?? '').trim().slice(0, 4000) }))
      .filter((c) => c.texto),
    actividad: (Array.isArray(p?.actividad) ? p.actividad : []).slice(-MAX_ACTIVIDAD).map((a) => ({ en: limpio(a?.en, 30), por: limpio(a?.por, 60), txt: limpio(a?.txt, 200) })).filter((a) => a.txt),
  };
}
export const nuevoIdCorto = idCorto;

export function sanitizeBiblioteca(b) {
  const vistas = new Set();
  const secciones = (Array.isArray(b?.secciones) ? b.secciones : []).slice(0, MAX_SECCIONES)
    .map((s) => ({ id: ID_RE.test(String(s?.id || '')) ? String(s.id) : idSeccion(s?.titulo), titulo: limpio(s?.titulo, 60) || 'Sin sección' }))
    .filter((s) => !vistas.has(s.id) && vistas.add(s.id));
  if (!secciones.length) secciones.push({ id: 'general', titulo: 'General' });
  const ids = new Set();
  const procesos = (Array.isArray(b?.procesos) ? b.procesos : []).slice(0, MAX_PROCESOS)
    .map((p) => sanitizeProceso(p, secciones)).filter((p) => !ids.has(p.id) && ids.add(p.id));
  return { secciones, procesos };
}

// Importar (archivo .json): añade las secciones nuevas y actualiza los procesos con el mismo id; el resto se queda.
export function fusionar(actual, entrante) {
  const a = sanitizeBiblioteca(actual);
  const e = sanitizeBiblioteca(entrante);
  const secciones = [...a.secciones.filter((s) => s.id !== 'general' || a.procesos.some((p) => p.seccion === 'general')), ...e.secciones.filter((s) => !a.secciones.some((x) => x.id === s.id))];
  const nuevos = new Map(e.procesos.map((p) => [p.id, p]));
  // Del archivo se toma el contenido (título, sección, descripción y enlace); lo de trabajo (responsable, fechas,
  // subtareas, comentarios y actividad) se queda como estaba.
  const contenido = (p, n) => ({ ...p, titulo: n.titulo, seccion: n.seccion, html: n.html, asana: n.asana || p.asana, proyectos: n.proyectos?.length ? n.proyectos : p.proyectos });
  const procesos = [...a.procesos.map((p) => (nuevos.has(p.id) ? contenido(p, nuevos.get(p.id)) : p)), ...e.procesos.filter((p) => !a.procesos.some((x) => x.id === p.id))];
  return { biblioteca: sanitizeBiblioteca({ secciones, procesos }), nuevos: e.procesos.filter((p) => !a.procesos.some((x) => x.id === p.id)).length, actualizados: e.procesos.filter((p) => a.procesos.some((x) => x.id === p.id)).length };
}

// ¿Tiene contenido? (los que en Asana estaban vacíos salen como «por documentar»).
export const documentado = (p) => richToText(p?.html).trim().length > 0 || /data-video=/.test(p?.html || '');
export const tieneVideo = (p) => /data-video=/.test(p?.html || '');

// Búsqueda sin tildes ni mayúsculas, en el título y el texto.
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function buscarProcesos(procesos, q) {
  const t = norm(q).trim();
  if (!t) return procesos;
  const palabras = t.split(/\s+/);
  return procesos.filter((p) => { const txt = norm(`${p.titulo} ${richToText(p.html)}`); return palabras.every((w) => txt.includes(w)); });
}
