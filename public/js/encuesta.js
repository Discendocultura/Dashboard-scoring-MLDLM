// Preguntas de la encuesta del avatar (campos de contacto de GHL) que se cruzan con las ventas en
// Métricas. Son fijas: si se cambia la encuesta, se actualizan aquí sus ids (Ajustes → Campos personalizados).
export const ENCUESTA_PREGUNTAS = [
  { id: '0lVfpThUn3rOkt5nalEp', key: 'contact.cual_es_tu_edad_actual', name: '¿Cuál es tu edad actual?', tipo: 'edad' },
  { id: 'jgsgct0q45CnzoAL0QG0', key: 'contact.cuanto_tiempo_llevas_buscando_embarazo', name: '¿Cuánto tiempo llevas buscando embarazo?', tipo: 'opciones' },
  { id: 'Ez1HWRYbBv5LXyHNPCQW', key: 'contact.qu_crees_que_esta_retrasando_o_bloqueando_el_positivo', name: '¿Qué crees que está retrasando o bloqueando el positivo?', tipo: 'texto' },
  // Desde el 8-10-2026 es de opciones múltiples (antes, texto libre en H3Q8asVCA89m3vaqFNSu).
  { id: 'v4zDuixEurBx4MY7JofI', key: 'contact.qu_has_probado_para_intentar_quedarte_embarazada', name: '¿Qué has probado para intentar quedarte embarazada?', tipo: 'opciones' },
];

// Cambios de campo de la encuesta en GHL: la pregunta antigua se sustituye por la nueva en la configuración
// guardada (solo si aún no tiene la nueva). Las respuestas antiguas siguen en la ficha del lead.
export const CAMBIOS_ENCUESTA = [
  { antes: 'H3Q8asVCA89m3vaqFNSu', ahora: { id: 'v4zDuixEurBx4MY7JofI', name: '¿Qué has probado para intentar quedarte embarazada?', tipo: 'opciones' } },
];
export function actualizarEncuesta(lista) {
  if (!Array.isArray(lista)) return lista;
  let out = lista;
  for (const c of CAMBIOS_ENCUESTA) {
    if (out.some((p) => p.id === c.antes) && !out.some((p) => p.id === c.ahora.id)) out = out.map((p) => (p.id === c.antes ? { ...c.ahora } : p));
  }
  return out;
}

// Tramos de edad habituales en fertilidad.
export function tramoEdad(v) {
  const n = Number(String(v ?? '').replace(',', '.').match(/\d+(\.\d+)?/)?.[0]);
  if (!Number.isFinite(n) || n < 14 || n > 60) return '';
  if (n < 30) return 'Menos de 30 años';
  if (n < 35) return '30 a 34 años';
  if (n < 38) return '35 a 37 años';
  if (n <= 40) return '38 a 40 años';
  return 'Más de 40 años';
}
export const ORDEN_EDAD = ['Menos de 30 años', '30 a 34 años', '35 a 37 años', '38 a 40 años', 'Más de 40 años'];
