// Biblioteca de procesos de la agencia (solo superadmin): el «cómo se hace» de todo, con pasos, vídeos y
// enlaces. Común a todos los clientes (cliente «_agencia», clave lsd_procesos). No son tareas: es la
// documentación que se consulta (y que más adelante podrán enlazar las tareas de cada embudo).
//   { secciones: [{ id, titulo }], procesos: [{ id, seccion, titulo, html, asana, actualizado, por }] }
// Lo usan el navegador (panel) y el servidor (para limpiar lo que llega). Se importa desde Asana con un
// archivo .json (el contenido no va en el código: el repositorio es público).
import { sanitizeRich, safeHref, richToText } from './richtext.js';

export const MAX_PROCESOS = 400;
export const MAX_SECCIONES = 40;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const limpio = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const nuevoIdProceso = () => `pr${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const idSeccion = (titulo) => limpio(titulo, 60).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'general';

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
  };
}

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

// Importar (archivo .json): añade las secciones nuevas y sustituye los procesos con el mismo id; el resto se queda.
export function fusionar(actual, entrante) {
  const a = sanitizeBiblioteca(actual);
  const e = sanitizeBiblioteca(entrante);
  const secciones = [...a.secciones.filter((s) => s.id !== 'general' || a.procesos.some((p) => p.seccion === 'general')), ...e.secciones.filter((s) => !a.secciones.some((x) => x.id === s.id))];
  const nuevos = new Map(e.procesos.map((p) => [p.id, p]));
  const procesos = [...a.procesos.map((p) => nuevos.get(p.id) || p), ...e.procesos.filter((p) => !a.procesos.some((x) => x.id === p.id))];
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
