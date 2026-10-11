// Código para el nombre de las campañas de Meta de los embudos que no son lanzamientos (VSL, venta directa y
// meteóricos): el dashboard suma la inversión de las campañas cuyo nombre lo contiene (sin distinguir mayúsculas ni
// acentos). Formato: TIPO-id → «VSL-raices», «DIR-guia-fertilidad», «MET-black-friday».
// En Meta, al principio del nombre de CADA campaña del embudo: «VSL-raices · Captación · Frío».
const PREFIJO = { vsl: 'VSL', directa: 'DIR', meteorico: 'MET', lanzamientos: 'LAN' };
const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Sin repetir el tipo: la VSL «vsl» llamada «VSL Raíces» → «VSL-raices» (si el id no dice nada, el nombre).
export function codigoMeta(tipo, id, nombre = '') {
  const pre = PREFIJO[tipo] || 'EMB';
  const slug = (v) => norm(v).replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const sinTipo = (v) => slug(v).replace(new RegExp(`^${pre.toLowerCase()}(-|$)`), '');
  const base = (sinTipo(id) || sinTipo(nombre) || slug(id)).slice(0, 30).replace(/-+$/, '');
  return base ? `${pre}-${base}` : '';
}

// Otros embudos cuyo filtro choca con este (uno contiene al otro): sus campañas se sumarían en los dos.
//   otros: [{ nombre, filtro }] → nombres
export function choquesMeta(filtro, otros = []) {
  const f = norm(filtro);
  if (!f) return [];
  return otros.filter((o) => { const g = norm(o.filtro); return g && (g.includes(f) || f.includes(g)); }).map((o) => o.nombre);
}

export const ejemploCampana = (codigo) => `${codigo} · Captación · Frío`;
