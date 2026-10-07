// Plantilla de «tareas habituales» (común a todos los lanzamientos), en el Custom Value lsd_tareas_habituales.
// Cada tarea marcada como habitual guarda aquí su título, notas, fase, a quién estaba asignada y
// su fecha relativa a un hito del lanzamiento. Al «Cargar tareas habituales» en el siguiente
// lanzamiento se crean con esos datos (misma persona o mismo rol que en el anterior).
import { storeGet as getCustomValue, storeSet as saveCustomValue } from './store.js';
import { PLANTILLA, hitos, addDays, FASE_IDS } from '../public/js/tareas.js';
import { sanitizeRich } from '../public/js/richtext.js';

const NAME = 'lsd_tareas_habituales';
const BASES = ['captacion', 'clase1', 'clase2', 'directo', 'cierre'];
// Hito de referencia preferido según la fase de la tarea.
const BASE_POR_FASE = { preparacion: 'captacion', captacion: 'captacion', clases: 'clase1', directo: 'directo', carrito: 'directo', cierre: 'cierre' };

const seed = () => PLANTILLA.map((t, i) => ({ id: `h${i + 1}`, titulo: t.titulo, notas: '', fase: t.fase, asignado: { tipo: 'rol', rol: t.rol }, rol: t.rol, base: t.base, dias: t.dias }));

export async function getHabituales() {
  const cv = await getCustomValue(NAME);
  if (!cv?.value) return seed();
  try {
    const parsed = JSON.parse(cv.value);
    return Array.isArray(parsed) ? parsed : seed();
  } catch {
    console.error('Plantilla de tareas habituales corrupta, se usa la de serie');
    return seed();
  }
}

export const saveHabituales = (list) => saveCustomValue(NAME, JSON.stringify(list.slice(0, 200)));

const diffDays = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

// Hito y desfase en días de una fecha dentro de un lanzamiento.
export function offsetDe(launch, fase, fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return { base: '', dias: 0 };
  const h = hitos(launch);
  const base = [BASE_POR_FASE[fase], 'directo', ...BASES].find((b) => b && h[b]);
  return base ? { base, dias: diffDays(h[base], fecha) } : { base: '', dias: 0 };
}

// Rol de la asignación (para usarlo si la persona ya no está).
function rolDe(asignado, users) {
  if (asignado?.tipo === 'rol') return asignado.rol;
  if (asignado?.tipo === 'persona') return users.find((u) => u.id === asignado.id)?.rol || '';
  return '';
}

// Enlaza las tareas cargadas antes de existir este sistema (mismo título que una habitual).
export function enlazar(tareas, list) {
  const porTitulo = new Map(list.map((h) => [h.titulo, h.id]));
  for (const t of tareas) {
    if (!t.habId && porTitulo.has(t.titulo)) { t.habId = porTitulo.get(t.titulo); t.habitual = true; }
    if (t.habId && !list.some((h) => h.id === t.habId)) { t.habitual = false; delete t.habId; }
  }
  return tareas;
}

// Crea o actualiza la habitual a partir de una tarea (y deja la tarea enlazada).
export function guardarDesdeTarea(list, t, launch, users, newId) {
  let h = t.habId && list.find((x) => x.id === t.habId);
  if (!h) { h = { id: newId('h') }; list.push(h); t.habId = h.id; }
  t.habitual = true;
  Object.assign(h, { titulo: t.titulo, notas: t.notas || '', fase: t.fase, sub: t.sub || '', asignado: t.asignado || null, rol: rolDe(t.asignado, users) }, offsetDe(launch, t.fase, t.fecha));
}

export function quitar(list, t) {
  const i = list.findIndex((x) => x.id === t.habId);
  if (i !== -1) list.splice(i, 1);
  t.habitual = false;
  delete t.habId;
}

// Tareas nuevas para un lanzamiento (las que aún no tiene, por habId o por título).
export function tareasDesdePlantilla(list, launch, existentes, users) {
  const h = hitos(launch);
  const ids = new Set(existentes.map((t) => t.habId).filter(Boolean));
  const titulos = new Set(existentes.map((t) => t.titulo));
  const activos = users.filter((u) => u.activo !== false);
  return list.filter((x) => !ids.has(x.id) && !titulos.has(x.titulo)).map((x) => {
    let asignado = x.asignado || null;
    if (asignado?.tipo === 'persona' && !activos.some((u) => u.id === asignado.id)) asignado = x.rol ? { tipo: 'rol', rol: x.rol } : null;
    return {
      titulo: x.titulo, notas: sanitizeRich(x.notas), fase: FASE_IDS.includes(x.fase) ? x.fase : 'preparacion', sub: x.sub || '',
      fecha: x.base && h[x.base] ? addDays(h[x.base], x.dias || 0) : '', asignado, habitual: true, habId: x.id,
    };
  });
}
