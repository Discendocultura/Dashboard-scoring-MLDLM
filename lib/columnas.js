// Columnas extra del tablero de tareas (además de una por fase y «Completadas»), comunes a
// todos los lanzamientos. Custom Value lsd_kanban_columnas: [{ id, label, icon, color }].
import { getCustomValue, saveCustomValue } from './ghl.js';
import { COLOR_COLUMNAS } from '../public/js/tareas.js';

const NAME = 'lsd_kanban_columnas';
export const MAX_COLUMNAS = 10;

export async function getColumnas() {
  const cv = await getCustomValue(NAME);
  if (!cv?.value) return [];
  try {
    const parsed = JSON.parse(cv.value);
    return Array.isArray(parsed) ? sanitizeColumnas(parsed) : [];
  } catch {
    return [];
  }
}

export function sanitizeColumnas(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).slice(0, MAX_COLUMNAS).map((c) => ({
    id: String(c?.id || ''),
    label: String(c?.label || '').trim().slice(0, 30),
    icon: [...String(c?.icon || '').trim()].slice(0, 2).join('') || '📌',
    color: COLOR_COLUMNAS.includes(c?.color) ? c.color : 'gris',
  })).filter((c) => /^c[a-z0-9]{3,16}$/.test(c.id) && c.label && !seen.has(c.id) && seen.add(c.id));
}

export const saveColumnas = (list) => saveCustomValue(NAME, JSON.stringify(sanitizeColumnas(list)));
