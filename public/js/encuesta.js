// Preguntas de la encuesta del avatar (campos de contacto de GHL) que se cruzan con las ventas en
// Métricas. Son fijas: si se cambia la encuesta, se actualizan aquí sus ids (Ajustes → Campos personalizados).
export const ENCUESTA_PREGUNTAS = [
  { id: '0lVfpThUn3rOkt5nalEp', key: 'contact.cual_es_tu_edad_actual', name: '¿Cuál es tu edad actual?', tipo: 'edad' },
  { id: 'jgsgct0q45CnzoAL0QG0', key: 'contact.cuanto_tiempo_llevas_buscando_embarazo', name: '¿Cuánto tiempo llevas buscando embarazo?', tipo: 'opciones' },
  { id: 'Ez1HWRYbBv5LXyHNPCQW', key: 'contact.qu_crees_que_esta_retrasando_o_bloqueando_el_positivo', name: '¿Qué crees que está retrasando o bloqueando el positivo?', tipo: 'texto' },
  { id: 'H3Q8asVCA89m3vaqFNSu', key: 'contact.qu_has_probado_hasta_ahora_para_lograr_el_positivo', name: '¿Qué has probado hasta ahora para lograr el positivo?', tipo: 'texto' },
];

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
