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
  return { id, proyecto: str(t?.proyecto, 40), nombre: id === GENERAL ? 'General' : str(t?.nombre, 40) || 'Tablero', columnas: sanitizeColumnas(t?.columnas) };
}

export function sanitizeConfigTableros(cfg) {
  const vistos = new Set();
  const tableros = (Array.isArray(cfg?.tableros) ? cfg.tableros : []).slice(0, MAX_TABLEROS).map(sanitizeTablero)
    .filter((t) => t.proyecto && !vistos.has(`${t.proyecto}|${t.id}`) && vistos.add(`${t.proyecto}|${t.id}`));
  const plantillas = (Array.isArray(cfg?.plantillas) ? cfg.plantillas : []).slice(0, 30)
    .map((p) => ({ id: ID_RE.test(str(p?.id, 24)) ? str(p.id, 24) : nuevoId('p'), nombre: str(p?.nombre, 40) || 'Plantilla', columnas: sanitizeColumnas(p?.columnas) }));
  return { tableros, plantillas };
}

// Tableros de un proyecto: el General (el de serie o el que se haya cambiado) y después los demás.
export function tablerosDe(cfg, proyecto) {
  const suyos = (cfg?.tableros || []).filter((t) => t.proyecto === proyecto);
  const general = suyos.find((t) => t.id === GENERAL) || { id: GENERAL, proyecto, nombre: 'General', columnas: COLUMNAS_SERIE.map((c) => ({ ...c })) };
  return [general, ...suyos.filter((t) => t.id !== GENERAL)];
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
