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

// IVA de los precios del lanzamiento (Configuración): cada precio se escribe con el IVA incluido o «+ IVA».
// La facturación y el ROAS se calculan SIN IVA. Sin elegir, se toma como IVA incluido (y se avisa).
// El programa puede ir «sin IVA» (exento: producto sanitario como Raíces): su precio es el importe tal cual.
//  launch.iva = { pct: 21, vip: 'incluido' | 'mas' | '', programa: 'incluido' | 'mas' | 'exento' | '' }
export const IVA_DEF = 21;
export const MODOS_IVA = ['incluido', 'mas', 'exento'];
export function sanitizeIva(v) {
  const modo = (x) => (MODOS_IVA.includes(x) ? x : '');
  const pct = Number(v?.pct);
  return { pct: Number.isFinite(pct) && v?.pct !== '' && v?.pct != null ? Math.min(100, Math.max(0, pct)) : IVA_DEF, vip: modo(v?.vip), programa: modo(v?.programa) };
}
export const ivaPct = (launch) => (Number.isFinite(Number(launch?.iva?.pct)) ? Number(launch.iva.pct) : IVA_DEF);
// Importe sin IVA de un precio según cómo se escribió.
export const sinIva = (precio, modo, pct = IVA_DEF) => (Number(precio) || 0) / (modo === 'mas' || modo === 'exento' ? 1 : 1 + (Number(pct) || 0) / 100);
// Precio de la VIP sin IVA (para la facturación y el ROAS).
export const vipSinIva = (launch) => sinIva(launch?.precioVip, launch?.iva?.vip, ivaPct(launch));
// Precios que aún no dicen si llevan IVA.
export function ivaPendiente(launch) {
  const out = [];
  if (Number(launch?.precioVip) && !launch?.iva?.vip) out.push('entrada VIP');
  if ((Number(launch?.precioPrograma) || Number(launch?.precioFraccionado) || esSuscripcion(launch)) && !launch?.iva?.programa) out.push('programa');
  for (const b of todosLosBumps(launch)) if (Number(b.precio) && !b.iva) out.push(`bump «${b.nombre || 'sin nombre'}»`);
  return out;
}

// Bump offers de la entrada VIP (Configuración → ⑧ Precios e IVA): cada uno se activa o no, con
// su nombre, precio y la etiqueta de GHL de quien lo compra. Cuentan en la facturación y el ROAS.
// Cada precio dice si lleva el IVA incluido o es «+ IVA» (`iva`); en la facturación y el ROAS cuenta sin IVA.
//  [{ id, activo, nombre, precio, iva: 'incluido' | 'mas' | '', tag }]
export const MAX_BUMPS = 5;
export function sanitizeBumps(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.slice(0, MAX_BUMPS).map((b, i) => ({
    id: /^[a-z0-9_-]{1,24}$/i.test(String(b?.id || '')) ? String(b.id) : `bump${i + 1}`,
    activo: b?.activo !== false,
    nombre: String(b?.nombre ?? '').trim().slice(0, 80),
    precio: dinero(b?.precio),
    iva: MODOS_IVA.includes(b?.iva) ? b.iva : '',
    tag: String(b?.tag ?? '').trim().toLowerCase().slice(0, 120),
  })).filter((b) => b.nombre || b.tag || b.precio);
}
// Dónde puede haber bump offers: con la entrada VIP, con el pago único y con el pago fraccionado.
export const TIPOS_BUMP = [
  { id: 'vip', campo: 'vipBumps', label: 'entrada VIP', base: 'VIP' },
  { id: 'unico', campo: 'unicoBumps', label: 'pago único', base: 'ventas en pago único' },
  { id: 'fraccionado', campo: 'fraccionadoBumps', label: 'pago fraccionado', base: 'ventas en pago fraccionado' },
];
// Los que cuentan: activos y con etiqueta (de un tipo, o de todos con su `tipo`).
export const bumpsActivos = (launch, tipo = 'vip') => (launch?.[TIPOS_BUMP.find((t) => t.id === tipo)?.campo] || []).filter((b) => b.activo !== false && b.tag);
export const todosLosBumps = (launch) => TIPOS_BUMP.flatMap((t) => bumpsActivos(launch, t.id).map((b) => ({ ...b, tipo: t.id })));
// Precio del bump sin IVA (para la facturación y el ROAS) y lo que paga la lead (con IVA).
export const precioBump = (b, launch) => sinIva(b?.precio, b?.iva, ivaPct(launch));
export const precioBumpConIva = (b, launch) => precioBump(b, launch) * (1 + ivaPct(launch) / 100);
