// Tableros de la Operativa: cada proyecto (cliente o «Agencia») tiene su tablero «General» y los que cree el
// superadmin (p. ej. «Contenido», «Anuncios»), cada uno con sus columnas. Una columna (al menos) «cuenta como
// hecha»: al llevar una tarea ahí, se marca como hecha. Las plantillas guardan unas columnas para reutilizarlas.
//   config: { tableros: [{ id, proyecto, nombre, columnas: [{ id, nombre, hecha }] }], plantillas: [{ id, nombre, columnas }] }
// Cada tarea guarda opTablero y opColumna (no se usa «columna»: es la de las fases del tablero de cada lanzamiento).
// Lo usan el navegador (panel) y el servidor (lib/operativa.js).
export const GENERAL = 'general';
export const COLUMNAS_SERIE = [
  { id: 'pendiente', nombre: 'Pendiente', hecha: false },
  { id: 'revision', nombre: 'Para revisar', hecha: false },
  { id: 'hecha', nombre: 'Hecho', hecha: true },
];
export const MAX_TABLEROS = 60;
export const MAX_COLUMNAS = 10;
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const ID_RE = /^[a-z0-9_-]{1,24}$/i;
const nuevoId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function sanitizeColumnas(cols) {
  const vistos = new Set();
  const out = (Array.isArray(cols) ? cols : []).slice(0, MAX_COLUMNAS).map((c) => {
    let id = str(c?.id, 24);
    if (!ID_RE.test(id) || vistos.has(id)) id = nuevoId('c');
    vistos.add(id);
    return { id, nombre: str(c?.nombre, 40), hecha: Boolean(c?.hecha) };
  }).filter((c) => c.nombre);
  if (!out.length) return COLUMNAS_SERIE.map((c) => ({ ...c }));
  if (!out.some((c) => c.hecha)) out[out.length - 1].hecha = true; // siempre hay dónde terminar
  return out;
}

export function sanitizeTablero(t) {
  const id = ID_RE.test(str(t?.id, 24)) ? str(t.id, 24) : nuevoId('t');
  const orden = Number(t?.orden);
  return { id, proyecto: str(t?.proyecto, 40), nombre: str(t?.nombre, 40) || (id === GENERAL ? 'General' : 'Tablero'), columnas: sanitizeColumnas(t?.columnas), ...(Number.isFinite(orden) ? { orden } : {}) };
}

export function sanitizeConfigTableros(cfg) {
  const vistos = new Set();
  const tableros = (Array.isArray(cfg?.tableros) ? cfg.tableros : []).slice(0, MAX_TABLEROS).map(sanitizeTablero)
    .filter((t) => t.proyecto && !vistos.has(`${t.proyecto}|${t.id}`) && vistos.add(`${t.proyecto}|${t.id}`));
  const plantillas = (Array.isArray(cfg?.plantillas) ? cfg.plantillas : []).slice(0, 30)
    .map((p) => ({ id: ID_RE.test(str(p?.id, 24)) ? str(p.id, 24) : nuevoId('p'), nombre: str(p?.nombre, 40) || 'Plantilla', columnas: sanitizeColumnas(p?.columnas) }));
  // Tablero por defecto de cada proyecto (el que se abre al entrar en él): { proyecto: tableroId }.
  const porDefecto = {};
  for (const [p, id] of Object.entries(cfg?.porDefecto && typeof cfg.porDefecto === 'object' ? cfg.porDefecto : {})) {
    if (typeof id === 'string' && id !== GENERAL && tableros.some((t) => t.proyecto === p && t.id === id)) porDefecto[p] = id;
  }
  // Proyecto con el que se abre la Operativa, el de cada persona: { uid: proyecto }.
  const proyectoDefecto = {};
  for (const [k, p] of Object.entries(cfg?.proyectoDefecto && typeof cfg.proyectoDefecto === 'object' ? cfg.proyectoDefecto : {}).slice(0, 500)) {
    if (/^[A-Za-z0-9_-]{1,40}$/.test(k) && typeof p === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(p)) proyectoDefecto[k] = p;
  }
  return { tableros, plantillas, etiquetas: sanitizeEtiquetas(cfg?.etiquetas), porDefecto, proyectoDefecto };
}
// El tablero que se abre al entrar en un proyecto: el marcado por defecto o, si no hay, el General.
export const tableroPorDefecto = (cfg, proyecto) => cfg?.porDefecto?.[proyecto] || GENERAL;

// Tableros de un proyecto: el General (el de serie o el que se haya cambiado) y los demás. Sin orden puesto a mano
// (arrastrando las pestañas), el General primero y los demás en el orden en que se crearon.
export function tablerosDe(cfg, proyecto) {
  const suyos = (cfg?.tableros || []).filter((t) => t.proyecto === proyecto);
  const general = suyos.find((t) => t.id === GENERAL) || { id: GENERAL, proyecto, nombre: 'General', columnas: COLUMNAS_SERIE.map((c) => ({ ...c })) };
  const todos = [general, ...suyos.filter((t) => t.id !== GENERAL)];
  const clave = (t, i) => (Number.isFinite(t.orden) ? t.orden : t.id === GENERAL ? -1 : 1000 + i);
  return todos.map((t, i) => ({ t, k: clave(t, i), i })).sort((a, b) => a.k - b.k || a.i - b.i).map((x) => x.t);
}
// Tablero nuevo: si las pestañas de su proyecto ya se han ordenado a mano, va al final.
export function alFinal(tableros, t) {
  const ords = tableros.filter((x) => x.proyecto === t.proyecto && Number.isFinite(x.orden)).map((x) => x.orden);
  return ords.length ? { ...t, orden: Math.max(...ords) + 1 } : t;
}
// Orden de las pestañas de un proyecto: [id] → cada tablero guarda su posición (el General de serie se guarda si hace falta).
export function ordenarTableros(cfg, proyecto, ids) {
  const actuales = tablerosDe(cfg, proyecto);
  const pos = new Map((Array.isArray(ids) ? ids : []).map(String).filter((id) => actuales.some((t) => t.id === id)).map((id, i) => [id, i]));
  const orden = [...actuales].sort((a, b) => (pos.get(a.id) ?? 999) - (pos.get(b.id) ?? 999));
  const otros = cfg.tableros.filter((t) => t.proyecto !== proyecto);
  return { ...cfg, tableros: [...otros, ...orden.map((t, i) => ({ ...t, orden: i }))] };
}

// Tablero de una tarea dentro de los de su proyecto (si el suyo ya no existe, el General).
export const tableroDeTarea = (t, tableros) => tableros.find((b) => b.id === t.opTablero) || tableros.find((b) => b.id === GENERAL) || tableros[0];
export const columnaHecha = (tab) => tab.columnas.find((c) => c.hecha) || tab.columnas[tab.columnas.length - 1];

// Columna de una tarea en su tablero: la que tiene guardada (si existe y encaja con hecha / no hecha); si no, por
// su estado (hecha → la de hecha; «para revisar» → esa columna si la hay; si no, la primera).
export function columnaDeTarea(t, tab) {
  const col = tab.columnas.find((c) => c.id === t.opColumna);
  if (col && Boolean(col.hecha) === Boolean(t.hecha)) return col.id;
  if (t.hecha) return columnaHecha(tab).id;
  if (t.estado === 'revision' && tab.columnas.some((c) => c.id === 'revision')) return 'revision';
  return (tab.columnas.find((c) => !c.hecha) || tab.columnas[0]).id;
}

// Llevar una tarea a una columna: { opTablero, opColumna, hecha, estado } (el estado sigue valiendo para «Mi día»,
// los avisos y los tableros de cada lanzamiento).
export function colocar(t, tab, colId) {
  const col = tab.columnas.find((c) => c.id === colId) || tab.columnas[0];
  return { opTablero: tab.id, opColumna: col.id, hecha: Boolean(col.hecha), estado: col.hecha ? 'hecha' : col.id === 'revision' ? 'revision' : 'pendiente' };
}

// ---------- Etiquetas (comunes a toda la agencia), prioridad, checklist y tareas que se repiten ----------
export const COLORES_ETIQUETA = {
  rojo: '#e5484d', naranja: '#f2783a', amarillo: '#e7b008', verde: '#2fa86b', turquesa: '#14a3a3',
  azul: '#3d7ef0', morado: '#8e5bd8', rosa: '#e0568f', gris: '#7d7f86',
};
export const MAX_ETIQUETAS = 60;
export const MAX_ETIQUETAS_TAREA = 6;
export function sanitizeEtiquetas(lista) {
  const vistos = new Set();
  return (Array.isArray(lista) ? lista : []).slice(0, MAX_ETIQUETAS).map((e) => {
    let id = str(e?.id, 24);
    if (!ID_RE.test(id) || vistos.has(id)) id = nuevoId('e');
    vistos.add(id);
    return { id, nombre: str(e?.nombre, 30), color: Object.hasOwn(COLORES_ETIQUETA, e?.color) ? e.color : 'gris' };
  }).filter((e) => e.nombre);
}
export const etiquetasDeTarea = (t, catalogo) => (Array.isArray(t?.etiquetas) ? t.etiquetas : []).map((id) => catalogo.find((e) => e.id === id)).filter(Boolean);

export const PRIORIDADES = [
  { id: 'alta', label: 'Alta', color: '#e5484d', orden: 0 },
  { id: 'media', label: 'Media', color: '#f2a23a', orden: 1 },
  { id: 'baja', label: 'Baja', color: '#3d7ef0', orden: 2 },
];
export const prioridadValida = (p) => (PRIORIDADES.some((x) => x.id === p) ? p : '');
const ordenPrioridad = (t) => PRIORIDADES.find((x) => x.id === t.prioridad)?.orden ?? 3;
// Orden dentro de una columna: prioridad (alta primero) y después la fecha (sin fecha, al final).
export const ordenTarjetas = (a, b) => ordenPrioridad(a) - ordenPrioridad(b) || String(a.fecha || '9').localeCompare(String(b.fecha || '9'));
// Orden a mano (arrastrando o con ↑/↓): las que tienen `opOrden` van primero, en ese orden; las demás, detrás
// con el orden automático de arriba.
const tieneOrden = (t) => Number.isFinite(t?.opOrden);
export const ordenColumna = (a, b) => (tieneOrden(a) && tieneOrden(b) ? a.opOrden - b.opOrden : tieneOrden(a) ? -1 : tieneOrden(b) ? 1 : ordenTarjetas(a, b));
// La columna con `movida` puesta en la posición `indice` (0 = arriba): la lista nueva, en orden.
export function recolocar(lista, movida, indice) {
  const resto = lista.filter((t) => t !== movida);
  const i = Math.max(0, Math.min(resto.length, Number.isInteger(indice) ? indice : resto.length));
  return [...resto.slice(0, i), movida, ...resto.slice(i)];
}
export const MAX_ORDENAR = 300;

export const MAX_CHECKLIST = 30;
export function sanitizeChecklist(lista) {
  return (Array.isArray(lista) ? lista : []).slice(0, MAX_CHECKLIST).map((c) => ({
    id: ID_RE.test(str(c?.id, 24)) ? str(c.id, 24) : nuevoId('k'), texto: str(c?.texto, 200), hecho: Boolean(c?.hecho),
  })).filter((c) => c.texto);
}
export const progresoChecklist = (t) => { const l = Array.isArray(t?.checklist) ? t.checklist : []; return { hechos: l.filter((c) => c.hecho).length, total: l.length }; };

// La copia que se crea al completar una tarea que se repite: lo mismo (descripción, etiquetas, responsable,
// prioridad, checklist sin marcar) en la primera columna de su tablero, con la próxima fecha que no haya pasado.
export function copiaRecurrente(t, { hoy, id, siguiente }) {
  return {
    id, titulo: t.titulo, notas: t.notas || '', fase: t.fase || '', sub: t.sub || '', fecha: siguiente,
    asignado: t.asignado || null, etiquetas: [...(t.etiquetas || [])], prioridad: t.prioridad || '',
    checklist: (t.checklist || []).map((c) => ({ ...c, hecho: false })), repetir: { ...t.repetir },
    ...(t.proyecto ? { proyecto: t.proyecto } : {}), ...(t.opTablero ? { opTablero: t.opTablero } : {}),
    estado: 'pendiente', hecha: false, hechaEn: '', hechaPor: '', comentarios: [],
    creadaPor: 'Se repite', creadaEn: `${hoy}T00:00:00.000Z`, repiteDe: t.id,
    ...(t.habitual ? { habitual: false } : {}),
  };
}
