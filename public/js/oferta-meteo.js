// Oferta de un meteórico (entregables y bonus) frente a sus ventas. Como la oferta dura horas, los bonus
// se miden por horas: BAR 30 min y BAR 1 h (desde que abre), BAR 24 h / 48 h y bonus (toda la oferta).
// Para medir por horas hace falta la hora de cada compra (campo de fecha de compra con hora, p. ej. un
// campo de texto con {{right_now}}); con un campo de solo fecha, se ve por días.
// Lo usan el navegador y el servidor.
import { tiemposMeteorico } from './meteorico.js';
import { madridToEpoch } from './page.js';
import { tipoBonus } from './oferta.js';

const MIN = 60_000;
const HORA = 60 * MIN;

// Ventana de un bonus del meteórico { desde, hasta } (epoch ms; null si faltan las horas).
export function ventanaBonusMeteo(b, m) {
  const T = tiemposMeteorico(m);
  if (T.apertura == null) return { desde: null, hasta: null };
  const min = tipoBonus(b.tipo).min;
  let hasta = min ? T.apertura + min * MIN : T.cierre;
  if (T.cierre != null && hasta != null) hasta = Math.min(hasta, T.cierre);
  if (b.hasta) hasta = madridToEpoch(b.hasta) ?? hasta;
  return { desde: T.apertura, hasta: hasta ?? null };
}

// `momentos`: instante (epoch ms) de cada venta con hora conocida; `total`: todas las ventas.
export function analizarOfertaMeteo(m, momentos = [], total = momentos.length) {
  const T = tiemposMeteorico(m);
  const bonus = (m?.paquete?.bonus || []).map((b) => ({ ...b, ventana: ventanaBonusMeteo(b, m) }));
  const abierta = T.apertura != null && T.cierre != null && T.cierre > T.apertura;
  // Ventas con hora dentro de la oferta (las de antes o después no cuentan para los bonus).
  const dentroOferta = abierta ? momentos.filter((t) => t >= T.apertura && t < T.cierre) : [];
  const horasOferta = abierta ? (T.cierre - T.apertura) / HORA : 0;
  const ritmoMedio = horasOferta && dentroOferta.length ? dentroOferta.length / horasOferta : null;
  const res = bonus.map((b) => {
    const { desde, hasta } = b.ventana;
    if (!abierta || desde == null || hasta == null || hasta <= desde || !dentroOferta.length) return { ...b, sinDatos: true };
    const ventas = dentroOferta.filter((t) => t >= desde && t < hasta).length;
    const horasDentro = (hasta - desde) / HORA;
    const horasFuera = horasOferta - horasDentro;
    const ritmoDentro = ventas / horasDentro;
    const ritmoFuera = horasFuera > 0.01 ? (dentroOferta.length - ventas) / horasFuera : null;
    // Urgencia: el ritmo en el último tramo antes de que caduque (un cuarto de su ventana, entre 5 y 30 min).
    const tramo = Math.min(30 * MIN, Math.max(5 * MIN, (hasta - desde) / 4));
    const finales = dentroOferta.filter((t) => t >= hasta - tramo && t < hasta).length;
    return {
      ...b, ventas, horasDentro, ritmoDentro, ritmoFuera,
      pct: dentroOferta.length ? ventas / dentroOferta.length : null,
      efecto: ritmoFuera ? ritmoDentro / ritmoFuera : null,
      tramoMin: Math.round(tramo / MIN), ventasFinal: finales,
      urgencia: b.tipo !== 'bonus' && ritmoMedio ? (finales / (tramo / HORA)) / ritmoMedio : null,
      sinDatos: false,
    };
  });
  // Ventas por hora de la oferta (como mucho 96 filas) y qué bonus estaban activos.
  const horas = [];
  if (abierta) {
    for (let h = T.apertura, i = 0; h < T.cierre && i < 96; h += HORA, i++) {
      const fin = Math.min(h + HORA, T.cierre);
      horas.push({
        desde: h, hasta: fin, n: dentroOferta.filter((t) => t >= h && t < fin).length,
        activos: bonus.filter((b) => b.ventana.desde != null && b.ventana.hasta > h && b.ventana.desde < fin).map((b) => b.id),
      });
    }
  }
  return { bonus: res, horas, conHora: momentos.length, dentroOferta: dentroOferta.length, total, ritmoMedio, abierta };
}

const coma = (x) => x.toFixed(1).replace('.', ',');
export function lecturaBonusMeteo(r) {
  if (r.sinDatos) return 'Sin compras con hora dentro de la oferta todavía.';
  if (r.tipo === 'bonus') return `Activo toda la oferta: ${r.ventas} ventas.`;
  const partes = [];
  if (r.efecto != null) partes.push(r.efecto >= 1.5 ? `Mientras estuvo activo se vendió ${coma(r.efecto)}× más por hora que el resto de la oferta: funciona.` : r.efecto >= 1.1 ? `Algo más de ventas por hora mientras estuvo activo (${coma(r.efecto)}×).` : 'No se nota más venta mientras estuvo activo: prueba otro bonus o anúncialo más.');
  if (r.urgencia != null && r.urgencia >= 1.5) partes.push(`En sus últimos ${r.tramoMin} min se vendió ${coma(r.urgencia)}× el ritmo medio: la fecha límite empuja.`);
  return partes.join(' ') || `${r.ventas} ventas mientras estuvo activo.`;
}
