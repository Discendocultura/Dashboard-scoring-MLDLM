// Oferta de un lanzamiento: entregables (lo que incluye el programa), precio y bonus.
// Los bonus tienen una ventana: BAR en directo (solo durante el directo de venta), BAR 24 h y BAR 48 h
// (desde que abre el carrito) y bonus a secas (todo el carrito). Con las ventas de cada día del carrito se
// mide qué tal funciona cada bonus. Lo usan el navegador y el servidor.
import { madridToEpoch, milestones } from './page.js';
import { dayInMadrid } from './scoring.js';
import { addDays } from './tareas.js';
import { dinero } from './pago.js';

export { dinero };

export const TIPOS_BONUS = [
  { id: 'bar_directo', label: 'BAR en directo', largo: 'Bonus de acción rápida en directo', corto: 'BAR directo', icon: '🔴', desc: 'Solo para quien compra durante el directo' },
  { id: 'bar_24h', label: 'BAR 24 h', largo: 'Bonus de acción rápida 24 h', corto: 'BAR 24 h', icon: '⚡', desc: 'Para quien compra en las primeras 24 h del carrito' },
  { id: 'bar_48h', label: 'BAR 48 h', largo: 'Bonus de acción rápida 48 h', corto: 'BAR 48 h', icon: '⏳', desc: 'Para quien compra en las primeras 48 h del carrito' },
  { id: 'bonus', label: 'Bonus', corto: 'Bonus', icon: '🎁', desc: 'Para todas las compras del carrito' },
];
// Meteóricos (ofertas de pocas horas): los BAR cuentan desde que abre la oferta.
export const TIPOS_BONUS_METEO = [
  { id: 'bar_30m', label: 'BAR 30 min', largo: 'Bonus de acción rápida 30 min', corto: 'BAR 30 min', icon: '⚡', desc: 'Para quien compra en los primeros 30 minutos tras abrir', min: 30 },
  { id: 'bar_1h', label: 'BAR 1 h', largo: 'Bonus de acción rápida 1 h', corto: 'BAR 1 h', icon: '⏱️', desc: 'Para quien compra en la primera hora tras abrir', min: 60 },
  { id: 'bar_24h', label: 'BAR 24 h', largo: 'Bonus de acción rápida 24 h', corto: 'BAR 24 h', icon: '⏳', desc: 'Para quien compra en las primeras 24 h tras abrir', min: 24 * 60 },
  { id: 'bar_48h', label: 'BAR 48 h', largo: 'Bonus de acción rápida 48 h', corto: 'BAR 48 h', icon: '⌛', desc: 'Para quien compra en las primeras 48 h tras abrir', min: 48 * 60 },
  { id: 'bonus', label: 'Bonus', corto: 'Bonus', icon: '🎁', desc: 'Para todas las compras de la oferta' },
];
export const TIPOS_ENTREGABLE = [
  { id: 'grabado', label: 'Contenido grabado', icon: '🎬' },
  { id: 'grupal', label: 'Sesión grupal en directo', icon: '👥' },
  { id: 'individual', label: 'Sesión individual en directo', icon: '🧑‍⚕️' },
  { id: 'presencial', label: 'Presencial', icon: '📍' },
  { id: 'descargable', label: 'Descargable', icon: '📄' },
  { id: 'audio', label: 'Audio', icon: '🎧' },
  { id: 'chatbot', label: 'Chatbot / Agente', icon: '🤖' },
];
const IDS_BONUS = TIPOS_BONUS.map((t) => t.id);
const IDS_ENTREGABLE = TIPOS_ENTREGABLE.map((t) => t.id);
const LOCAL_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const HORA = 3_600_000;

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const idDe = (v, i, p) => (/^[a-z0-9_-]{1,24}$/i.test(String(v || '')) ? String(v) : `${p}${i + 1}`);

export function sanitizeOferta(o, { tipos = IDS_BONUS } = {}) {
  const ents = Array.isArray(o?.entregables) ? o.entregables : [];
  const bons = Array.isArray(o?.bonus) ? o.bonus : [];
  return {
    entregables: ents.slice(0, 40).map((e, i) => ({
      id: idDe(e?.id, i, 'e'), tipo: IDS_ENTREGABLE.includes(e?.tipo) ? e.tipo : 'grabado',
      nombre: str(e?.nombre, 120), detalle: str(e?.detalle, 300), valor: dinero(e?.valor),
    })).filter((e) => e.nombre),
    bonus: bons.slice(0, 30).map((b, i) => ({
      id: idDe(b?.id, i, 'b'), tipo: tipos.includes(b?.tipo) ? b.tipo : 'bonus',
      nombre: str(b?.nombre, 120), detalle: str(b?.detalle, 300), valor: dinero(b?.valor),
      // Fin a mano (opcional): si no, sale del tipo y de las fechas del carrito.
      hasta: LOCAL_DT.test(String(b?.hasta || '')) ? b.hasta : '',
    })).filter((b) => b.nombre),
  };
}

export const tipoBonus = (id) => TIPOS_BONUS.find((t) => t.id === id) || TIPOS_BONUS_METEO.find((t) => t.id === id) || TIPOS_BONUS[3];
export const IDS_BONUS_METEO = TIPOS_BONUS_METEO.map((t) => t.id);
// Tipo de bonus de un meteórico (sus BAR cuentan desde que abre la oferta, con su duración en `min`).
export const tipoBonusMeteo = (id) => TIPOS_BONUS_METEO.find((t) => t.id === id) || TIPOS_BONUS_METEO.at(-1);
export const tipoEntregable = (id) => TIPOS_ENTREGABLE.find((t) => t.id === id) || TIPOS_ENTREGABLE[0];

// Momentos del carrito (epoch ms): directo de venta, apertura y cierre.
export function momentosCarrito(launch = {}) {
  const m = milestones(launch);
  const venta = m.videos.at(-1) || {};
  const directo = venta.inicio ?? m.directo ?? null;
  const apertura = madridToEpoch(launch.aperturaCarrito) ?? directo;
  const cierre = madridToEpoch(launch.cierreCarrito) ?? (apertura != null ? apertura + 7 * 24 * HORA : null);
  const finDirecto = directo != null ? Math.min(directo + 3 * HORA, venta.post ?? Infinity) : null;
  return { directo, finDirecto, apertura, cierre };
}

// Ventana de un bonus { desde, hasta } (epoch ms; null si faltan fechas).
export function ventanaBonus(b, launch) {
  const M = momentosCarrito(launch);
  const desde = b.tipo === 'bar_directo' ? M.directo : M.apertura;
  let hasta = { bar_directo: M.finDirecto, bar_24h: M.apertura != null ? M.apertura + 24 * HORA : null, bar_48h: M.apertura != null ? M.apertura + 48 * HORA : null, bonus: M.cierre }[b.tipo] ?? M.cierre;
  if (b.hasta) hasta = madridToEpoch(b.hasta);
  if (desde == null || hasta == null || hasta <= desde) return { desde, hasta: hasta ?? null, dias: [] };
  return { desde, hasta, dias: diasEntre(desde, hasta) };
}

const dia = (ms) => dayInMadrid(new Date(ms).toISOString());
function diasEntre(desde, hasta) {
  const out = [];
  const fin = dia(hasta - 1);
  for (let d = dia(desde), i = 0; d <= fin && i < 60; d = addDays(d, 1), i++) out.push(d);
  return out;
}

// Valor de la oferta: lo que suman entregables y bonus frente al precio.
export function valorOferta(oferta = {}, precio = 0) {
  const sum = (l) => (l || []).reduce((t, x) => t + (Number(x.valor) || 0), 0);
  const entregables = sum(oferta.entregables);
  const bonus = sum(oferta.bonus);
  const total = entregables + bonus;
  return { entregables, bonus, total, ratio: precio && total ? total / precio : null };
}

// Cruza la oferta con las ventas de cada día del carrito (`vpd`: ventasPorDia()).
//   dias: cada día con sus ventas y los bonus activos ese día (y los que caducan ese día).
//   bonus: por bonus, ventas mientras estuvo activo, % del carrito, ventas/día activo frente al resto
//          del carrito (efecto) y ventas del día en que caduca frente a la media (urgencia).
export function analizarOferta(launch, vpd) {
  const oferta = launch?.oferta || { entregables: [], bonus: [] };
  const bonus = (oferta.bonus || []).map((b) => ({ ...b, ventana: ventanaBonus(b, launch) }));
  if (!vpd?.days?.length) return { dias: [], bonus: bonus.map((b) => ({ ...b, sinDatos: true })), total: 0 };
  const total = vpd.days.reduce((t, d) => t + d.n, 0);
  const media = total / vpd.days.length;
  const dias = vpd.days.map((d) => ({
    ...d,
    activos: bonus.filter((b) => b.ventana.dias.includes(d.day)).map((b) => b.id),
    caducan: bonus.filter((b) => b.ventana.hasta != null && b.tipo !== 'bonus' && dia(b.ventana.hasta - 1) === d.day).map((b) => b.id),
  }));
  const res = bonus.map((b) => {
    const enVentana = dias.filter((d) => b.ventana.dias.includes(d.day));
    const fuera = dias.filter((d) => !b.ventana.dias.includes(d.day));
    const ventas = enVentana.reduce((t, d) => t + d.n, 0);
    const porDiaDentro = enVentana.length ? ventas / enVentana.length : null;
    const porDiaFuera = fuera.length ? fuera.reduce((t, d) => t + d.n, 0) / fuera.length : null;
    const ultimo = enVentana.at(-1);
    return {
      ...b, ventas, diasActivo: enVentana.length,
      pctCarrito: total ? ventas / total : null,
      porDiaDentro, porDiaFuera,
      efecto: porDiaDentro != null && porDiaFuera ? porDiaDentro / porDiaFuera : null,
      ventasUltimoDia: b.tipo !== 'bonus' && ultimo ? ultimo.n : null,
      urgencia: b.tipo !== 'bonus' && ultimo && media ? ultimo.n / media : null,
      sinDatos: !enVentana.length,
    };
  });
  return { dias, bonus: res, total, media };
}

// Lectura en una frase de cómo funcionó un bonus.
export function lecturaBonus(r) {
  if (r.sinDatos) return 'Sin ventas con fecha dentro de su ventana (revisa las fechas del carrito o el campo de fecha de compra).';
  if (r.tipo === 'bonus') return `Activo todo el carrito: ${r.ventas} ventas.`;
  const partes = [];
  if (r.efecto != null) partes.push(r.efecto >= 1.5 ? `Mientras estuvo activo se vendió ${r.efecto.toFixed(1)}× más al día que el resto del carrito: funciona.` : r.efecto >= 1.1 ? `Algo más de ventas al día mientras estuvo activo (${r.efecto.toFixed(1)}×).` : 'No se nota más venta mientras estuvo activo: prueba otro bonus o comunícalo más.');
  if (r.urgencia != null && r.urgencia >= 1.5) partes.push(`El día que caducaba se vendió ${r.urgencia.toFixed(1)}× la media: la fecha límite empuja.`);
  return partes.join(' ') || `${r.ventas} ventas mientras estuvo activo.`;
}
