// Tipo de pago de un embudo (lanzamiento, VSL o meteórico):
//   · Pago único: precio único y, si se ofrece, pago fraccionado (a plazos) con su precio y etiqueta.
//   · Suscripción: uno o varios planes (mensual, trimestral, semestral, anual), cada uno con su precio
//     por periodo, su etiqueta de GHL (la pone el workflow del pago) y su enlace de pago.
// La facturación de una suscripción es el primer cobro de cada alta (precio del plan); además se da el
// ingreso mensual recurrente (MRR) equivalente. Lo usan el navegador y el servidor.

export const PLANES_SUSCRIPCION = [
  { id: 'mensual', label: 'Mensual', meses: 1, periodo: 'mes' },
  { id: 'trimestral', label: 'Trimestral', meses: 3, periodo: 'trimestre' },
  { id: 'semestral', label: 'Semestral', meses: 6, periodo: 'semestre' },
  { id: 'anual', label: 'Anual', meses: 12, periodo: 'año' },
];
export const TIPOS_PAGO = { unico: 'Pago único', suscripcion: 'Suscripción' };

// Importe escrito a mano: «1.200» o «1.200,50» (miles con punto) · «97,5» · «97.5». 0 si no es válido.
export const dinero = (v) => {
  const t = String(v ?? '').trim();
  const n = typeof v === 'number' ? v : Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};
const num = dinero;
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const url = (v) => (/^https?:\/\//i.test(str(v, 600)) ? str(v, 600) : '');

// Limpia lo que llega del navegador. Sin `pago` (embudos antiguos): pago único con fraccionado.
export function sanitizePago(p) {
  const tipo = p?.tipo === 'suscripcion' ? 'suscripcion' : 'unico';
  const planes = {};
  for (const { id } of PLANES_SUSCRIPCION) {
    const x = p?.planes?.[id];
    if (!x) continue;
    const plan = { activo: Boolean(x.activo), precio: num(x.precio), tag: str(x.tag, 120).toLowerCase(), url: url(x.url) };
    if (plan.activo || plan.precio || plan.tag || plan.url) planes[id] = plan;
  }
  return { tipo, fraccionado: p?.fraccionado !== false, planes };
}

export const pagoDe = (cfg) => sanitizePago(cfg?.pago);
export const esSuscripcion = (cfg) => cfg?.pago?.tipo === 'suscripcion';
export const conFraccionado = (cfg) => !esSuscripcion(cfg) && cfg?.pago?.fraccionado !== false;

// Planes activos, en orden (mensual → anual), con su precio, etiqueta y enlace.
export function planesActivos(cfg) {
  if (!esSuscripcion(cfg)) return [];
  return PLANES_SUSCRIPCION
    .filter((p) => cfg.pago.planes?.[p.id]?.activo)
    .map((p) => ({ ...p, precio: num(cfg.pago.planes[p.id].precio), tag: cfg.pago.planes[p.id].tag || '', url: cfg.pago.planes[p.id].url || '' }));
}

// Plan de una compradora según sus etiquetas ('' si no lleva ninguna de los planes).
export function planDeTags(tags, cfg) {
  const set = tags instanceof Set ? tags : new Set([...(tags || [])].map((t) => String(t).toLowerCase()));
  return planesActivos(cfg).find((p) => p.tag && set.has(p.tag))?.id || '';
}

// Importe de una venta. `venta`: { fraccionado, plan }; `precios`: { unico, fraccionado } del embudo.
// Suscripción sin plan reconocido: el precio del primer plan activo (mejor una estimación que 0).
export function importeVenta(venta, cfg, precios) {
  if (esSuscripcion(cfg)) {
    const planes = planesActivos(cfg);
    return (planes.find((p) => p.id === venta?.plan) || planes[0])?.precio || 0;
  }
  return venta?.fraccionado && conFraccionado(cfg) && num(precios.fraccionado) ? num(precios.fraccionado) : num(precios.unico);
}

// Ingreso mensual recurrente equivalente de un plan (anual de 240 € → 20 €/mes).
export const mrrPlan = (p) => (p?.precio && p.meses ? p.precio / p.meses : 0);

// Reparto de las ventas por plan. `planOf(venta)` devuelve el id del plan de cada venta.
export function resumenPlanes(ventas, cfg, planOf) {
  const planes = planesActivos(cfg);
  const total = ventas.length;
  const fila = (p, ls) => ({
    id: p?.id || '', label: p?.label || 'Sin etiqueta de plan', n: ls.length, pct: total ? ls.length / total : 0,
    facturacion: ls.length * (p?.precio || planes[0]?.precio || 0), mrr: ls.length * (p ? mrrPlan(p) : mrrPlan(planes[0])),
  });
  const filas = planes.map((p) => fila(p, ventas.filter((v) => planOf(v) === p.id)));
  const sin = ventas.filter((v) => !planes.some((p) => p.id === planOf(v)));
  if (sin.length) filas.push(fila(null, sin));
  return { filas, total, mrr: filas.reduce((t, f) => t + f.mrr, 0), facturacion: filas.reduce((t, f) => t + f.facturacion, 0) };
}

// Enlace de pago principal: el único, o el del primer plan activo en una suscripción.
export const enlacePago = (cfg, unicoUrl) => (esSuscripcion(cfg) ? planesActivos(cfg).find((p) => p.url)?.url || unicoUrl || '' : unicoUrl || '');

// Lo que falta para que la facturación salga bien (auditor / avisos).
export function pendientesPago(cfg, { precioUnico, unicoTag, fraccionadoTag, precioFraccionado } = {}) {
  const out = [];
  if (esSuscripcion(cfg)) {
    const planes = planesActivos(cfg);
    if (!planes.length) return ['Suscripción sin planes: marca qué planes tiene (mensual, trimestral, semestral, anual).'];
    for (const p of planes) {
      if (!p.precio) out.push(`Plan ${p.label.toLowerCase()}: falta el precio.`);
      if (!p.tag && planes.length > 1) out.push(`Plan ${p.label.toLowerCase()}: falta su etiqueta de GHL (sin ella no se sabe qué plan eligió cada clienta).`);
    }
    return out;
  }
  if (precioUnico !== undefined && !num(precioUnico)) out.push('Falta el precio del pago único.');
  if (conFraccionado(cfg) && precioFraccionado !== undefined && !num(precioFraccionado) && fraccionadoTag) out.push('Falta el precio del pago fraccionado.');
  void unicoTag;
  return out;
}
