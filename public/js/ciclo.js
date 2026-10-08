// Ciclo de compra: días desde que el contacto se creó en GHL (dateAdded) hasta que compró el producto
// principal (campo de fecha de compra). Media, mediana y reparto por tramos. Lo usan el navegador
// (compradoras del lanzamiento o de la VSL) y el servidor (todas las compradoras de la etiqueta).
import { dayInMadrid, dayOfDateField } from './scoring.js';

export const TRAMOS_CICLO = [
  { id: 'd0', label: 'El mismo día', max: 0 },
  { id: 'd7', label: '1 a 7 días', max: 7 },
  { id: 'd30', label: '8 a 30 días', max: 30 },
  { id: 'd90', label: '1 a 3 meses', max: 90 },
  { id: 'd180', label: '3 a 6 meses', max: 180 },
  { id: 'd365', label: '6 meses a 1 año', max: 365 },
  { id: 'mas', label: 'Más de 1 año', max: Infinity },
];
const DIA = 86_400_000;
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DIA);

// Días de una compradora (null si falta alguna fecha o la compra es anterior a la creación del contacto,
// p. ej. contactos importados después de comprar).
export function diasHastaCompra(c, compraDateField) {
  const alta = c.dateAdded ? dayInMadrid(c.dateAdded) : '';
  const compra = dayOfDateField(c.cf?.[compraDateField]);
  if (!alta || !compra) return null;
  const d = diasEntre(alta, compra);
  return d < 0 ? null : d;
}

export function cicloCompra(dias) {
  const v = dias.filter((d) => Number.isFinite(d)).sort((a, b) => a - b);
  const n = v.length;
  const q = (p) => (n ? v[Math.min(n - 1, Math.floor(p * (n - 1) + 0.5))] : null);
  const tramos = TRAMOS_CICLO.map((t, i) => {
    const min = i ? TRAMOS_CICLO[i - 1].max + 1 : 0;
    const k = v.filter((d) => d >= min && d <= t.max).length;
    return { ...t, n: k, pct: n ? k / n : 0 };
  });
  return { n, media: n ? v.reduce((a, b) => a + b, 0) / n : null, mediana: q(0.5), p25: q(0.25), p75: q(0.75), tramos };
}

// Ciclo de un conjunto de contactos compradores.
export const cicloDeContactos = (contactos, compraDateField) => {
  const dias = contactos.map((c) => diasHastaCompra(c, compraDateField));
  return { ...cicloCompra(dias.filter((d) => d != null)), sinFecha: dias.filter((d) => d == null).length };
};

// «23 días», «1 día», «4,5 meses», «1,2 años».
export function textoDias(d) {
  if (d == null) return '–';
  if (d < 60) return `${Math.round(d)} día${Math.round(d) === 1 ? '' : 's'}`;
  if (d < 730) return `${(d / 30.4).toFixed(1).replace('.', ',').replace(',0', '')} meses`;
  return `${(d / 365).toFixed(1).replace('.', ',')} años`;
}
