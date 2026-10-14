// Importar un tablero entero en la Operativa (columnas + tareas) desde un archivo .json. Admite:
//   · el formato propio: { formato: 'tablero-operativa', nombre, columnas: [{ nombre, hecha }],
//       tareas: [{ titulo, notas (HTML), fecha, columna (nombre o nº), asignado (nombre o email), checklist: [texto | { texto, hecho }], prioridad }] }
//   · el JSON que exporta Asana de un proyecto ({ data: [tareas] }): cada sección es una columna y las subtareas, la checklist.
// El contenido no va en el código (el repositorio es público): se sube el archivo desde el dashboard.
// Lo usan el navegador (vista previa) y el servidor (lo vuelve a limpiar).
export const MAX_TAREAS_IMPORT = 300;
const str = (v, n) => String(v ?? '').trim().slice(0, n);
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
export const RE_COLUMNA_HECHA = /cerrad|hech|complet|terminad|done/i;

function desdeAsana(data, { incluirCompletadas = false } = {}) {
  const columnas = [];
  const tareas = [];
  for (const t of data) {
    if (!t || t.parent) continue; // las subtareas van dentro de su tarea
    const seccion = str(t.memberships?.[0]?.section?.name, 40) || 'Sin sección';
    if (!columnas.some((c) => c.nombre === seccion)) columnas.push({ nombre: seccion, hecha: RE_COLUMNA_HECHA.test(seccion) });
    if (t.completed && !incluirCompletadas) continue;
    tareas.push({
      titulo: t.name, notas: t.html_notes || (t.notes ? String(t.notes).split('\n').map((l) => `<p>${l.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</p>`).join('') : ''),
      fecha: t.due_on || '', columna: seccion, asignado: t.assignee?.email || t.assignee?.name || '',
      checklist: (Array.isArray(t.subtasks) ? t.subtasks : []).map((s) => ({ texto: s.name, hecho: Boolean(s.completed) })),
    });
  }
  if (!columnas.some((c) => c.hecha)) columnas.push({ nombre: 'Hecho', hecha: true });
  return { nombre: '', columnas, tareas };
}

// Cualquier archivo admitido → { nombre, columnas: [{ nombre, hecha }], tareas: [{ titulo, notas, fecha, columna (índice), asignado, checklist, prioridad }] }
export function normalizarImportacion(json, opts = {}) {
  const base = Array.isArray(json?.data) ? desdeAsana(json.data, opts) : json;
  const columnas = (Array.isArray(base?.columnas) ? base.columnas : []).slice(0, 10)
    .map((c) => ({ nombre: str(c?.nombre, 40), hecha: Boolean(c?.hecha) })).filter((c) => c.nombre);
  if (!columnas.length) throw new Error('El archivo no tiene columnas (secciones).');
  if (!columnas.some((c) => c.hecha)) columnas[columnas.length - 1].hecha = true;
  const idxCol = (v) => {
    if (Number.isInteger(v) && v >= 0 && v < columnas.length) return v;
    const i = columnas.findIndex((c) => c.nombre.toLowerCase() === str(v, 40).toLowerCase());
    return i >= 0 ? i : 0;
  };
  const tareas = (Array.isArray(base?.tareas) ? base.tareas : []).slice(0, MAX_TAREAS_IMPORT).map((t) => ({
    titulo: str(t?.titulo, 200), notas: String(t?.notas ?? '').slice(0, 20000), fecha: DIA_RE.test(String(t?.fecha || '')) ? t.fecha : '',
    columna: idxCol(t?.columna), asignado: str(t?.asignado, 120), prioridad: ['alta', 'media', 'baja'].includes(t?.prioridad) ? t.prioridad : '',
    checklist: (Array.isArray(t?.checklist) ? t.checklist : []).map((c) => (typeof c === 'string' ? { texto: c, hecho: false } : { texto: str(c?.texto, 200), hecho: Boolean(c?.hecho) })).filter((c) => c.texto).slice(0, 30),
  })).filter((t) => t.titulo);
  return { nombre: str(base?.nombre, 40), columnas, tareas };
}

// A quién del equipo corresponde «Nombre» o «email» (sin tildes ni mayúsculas; vale el nombre de pila si es único).
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export function personaDe(texto, equipo) {
  const q = norm(texto);
  if (!q) return null;
  const exacta = equipo.find((u) => norm(u.email) === q || norm(u.nombre) === q);
  if (exacta) return exacta;
  const pila = q.includes('@') ? q.split('@')[0].replace(/[^a-z]/g, ' ').split(' ')[0] : q.split(/\s+/)[0];
  const candidatas = equipo.filter((u) => { const n = norm(u.nombre).split(/\s+/)[0] || ''; return n.length > 2 && (n === pila || pila.startsWith(n)); });
  return candidatas.length === 1 ? candidatas[0] : null;
}
