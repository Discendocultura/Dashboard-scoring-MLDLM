// Meteóricos: ofertas flash (normalmente 12 horas) con unos días de calentamiento por email y WhatsApp.
// Pueden ir solos (embudo «⚡ Meteóricos», p. ej. Black Friday a la base de datos) o como downsell tras
// un lanzamiento (`lanzamiento`: su código). El público no se mide (grupos de WhatsApp, listas): se
// miden las ventas (etiqueta de compra), la facturación, las visitas a la página de la oferta y los tiempos.
// Lo usan el navegador, el servidor y la página de la oferta.
import { madridToEpoch } from './page.js';

const DAY = 86_400_000;
export const FASES_METEORICO = {
  preparacion: { label: 'En preparación', tono: 'info' },
  calentamiento: { label: 'Calentando', tono: 'vip' },
  abierta: { label: 'Oferta abierta', tono: 'buy' },
  cerrada: { label: 'Cerrada', tono: '' },
};

// Momentos clave (epoch ms o null): inicio del calentamiento (00:00 de ese día), apertura y cierre.
export function tiemposMeteorico(m = {}) {
  const t = (v) => (v ? madridToEpoch(v) : null);
  return {
    calentamiento: m.calentamiento ? t(`${m.calentamiento}T00:00`) : null,
    apertura: t(m.apertura),
    cierre: t(m.cierre),
  };
}

// Fase en un momento dado y hasta cuándo dura (para la cuenta atrás).
export function faseMeteorico(m, now = Date.now()) {
  const T = tiemposMeteorico(m);
  if (T.cierre != null && now >= T.cierre) return { id: 'cerrada', hasta: null, T };
  if (T.apertura != null && now >= T.apertura) return { id: 'abierta', hasta: T.cierre, T };
  if (T.calentamiento != null && now >= T.calentamiento) return { id: 'calentamiento', hasta: T.apertura, T };
  return { id: 'preparacion', hasta: T.calentamiento ?? T.apertura, T };
}

// Horas que dura la oferta (para el título: «Oferta de 12 horas»).
export const horasOferta = (m) => {
  const T = tiemposMeteorico(m);
  return T.apertura != null && T.cierre != null && T.cierre > T.apertura ? Math.round((T.cierre - T.apertura) / 3_600_000) : null;
};

const dia = (v) => String(v || '').slice(0, 10);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const tiene = (c, tag) => Boolean(tag) && (c.tags || []).some((x) => String(x).toLowerCase() === String(tag).toLowerCase());

// ¿Es una venta de ESTE meteórico? Con campo de fecha de compra: comprada entre el calentamiento y el día
// del cierre. Sin él: cualquiera con la etiqueta que no estuviera en la «foto» de antes de abrir.
export function esVentaMeteorico(c, m, previo = null) {
  if (!tiene(c, m.compraTag)) return false;
  const f = m.compraDateField ? dia(c.cf?.[m.compraDateField]) : '';
  if (m.compraDateField && f) {
    const desde = m.calentamiento || dia(m.apertura);
    const hasta = dia(m.cierre) || dia(m.apertura);
    return (!desde || f >= desde) && (!hasta || f <= hasta);
  }
  return !(previo && previo.has(c.id));
}

// Métricas del meteórico a partir de los contactos con la etiqueta de compra.
// `visitas`: { total, porDia } de la página de la oferta; `inversion`: Meta o manual.
export function metricasMeteorico(contactos, m, { previo = null, visitas = null, inversion = null } = {}) {
  const ventas = contactos.filter((c) => esVentaMeteorico(c, m, previo));
  const fraccionado = (c) => tiene(c, m.fraccionadoTag);
  const importe = (c) => (fraccionado(c) && num(m.precioFraccionado) ? num(m.precioFraccionado) : num(m.precio));
  const facturacion = ventas.reduce((t, c) => t + importe(c), 0);
  const inv = inversion != null ? inversion : num(m.inversion) || null;
  const porDia = new Map();
  for (const c of ventas) {
    const d = (m.compraDateField && dia(c.cf?.[m.compraDateField])) || '';
    if (d) porDia.set(d, (porDia.get(d) || 0) + 1);
  }
  const vis = visitas?.total || 0;
  const objetivos = [
    ...(num(m.objetivoVentas) ? [{ label: 'Ventas', actual: ventas.length, meta: num(m.objetivoVentas), pct: ventas.length / num(m.objetivoVentas) }] : []),
    ...(num(m.objetivoFacturacion) ? [{ label: 'Facturación', actual: facturacion, meta: num(m.objetivoFacturacion), unit: 'eur', pct: facturacion / num(m.objetivoFacturacion) }] : []),
  ];
  return {
    ventas: ventas.length,
    compradores: ventas,
    fraccionado: ventas.filter(fraccionado).length,
    unico: ventas.filter((c) => !fraccionado(c)).length,
    facturacion,
    ticket: ventas.length ? facturacion / ventas.length : null,
    visitas: vis || null,
    conversion: vis ? ventas.length / vis : null,
    inversion: inv,
    cac: inv && ventas.length ? inv / ventas.length : null,
    roas: inv ? facturacion / inv : null,
    ventasPorDia: [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    objetivos,
  };
}

// Días del calendario: calentamiento → apertura → cierre.
export function hitosMeteorico(m) {
  const out = [];
  if (m.calentamiento) out.push({ day: m.calentamiento, titulo: `Empieza el calentamiento de «${m.name}»` });
  if (m.apertura) out.push({ day: dia(m.apertura), time: String(m.apertura).slice(11, 16), titulo: `Abre la oferta «${m.name}»` });
  if (m.cierre) out.push({ day: dia(m.cierre), time: String(m.cierre).slice(11, 16), titulo: `Cierra la oferta «${m.name}»` });
  return out;
}

// Pasos para dejarlo listo (checklist del meteórico).
export function pendientesMeteorico(m) {
  const out = [];
  if (!m.apertura || !m.cierre) out.push('Pon la apertura y el cierre de la oferta (día y hora).');
  else if (tiemposMeteorico(m).cierre <= tiemposMeteorico(m).apertura) out.push('El cierre es anterior a la apertura.');
  if (!m.calentamiento) out.push('Pon el día en que empieza el calentamiento.');
  if (!m.compraTag) out.push('Elige la etiqueta de compra (la pone el workflow del pago de esta oferta).');
  if (!m.precio) out.push('Pon el precio de la oferta (para la facturación y el ROAS).');
  if (!m.pagoUrl) out.push('Pon el enlace de pago de la oferta.');
  if (!m.ofertaUrl) out.push('Pon la URL de la página de la oferta (y su código de la cuenta atrás).');
  if (m.compraTag && !m.compraDateField) out.push('Sin campo de fecha de compra: antes de abrir, haz la «foto» de quién ya tenía la etiqueta de compra.');
  return out;
}
export const DIA = DAY;
