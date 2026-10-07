// Calculadora de objetivos: con el histórico de lanzamientos anteriores calcula, para tres escenarios
// (desfavorable, neutro y favorable), cuántos registros e inversión hacen falta para llegar a los
// objetivos, el CPL máximo y el recomendado, y proyecta a dónde se llega al ritmo actual o con un presupuesto.
// Lo usa el navegador (pestaña «Objetivos y calculadora») y los tests.

export const ESCENARIOS = [
  { id: 'desfavorable', label: 'Desfavorable', tone: 'warn' },
  { id: 'neutro', label: 'Neutro', tone: 'info' },
  { id: 'favorable', label: 'Favorable', tone: 'buy' },
];
// Con menos de 3 lanzamientos no hay dispersión fiable: se abre ±20 % alrededor del dato.
const MARGEN = 0.2;
export const ROAS_OBJETIVO_DEF = 2.5;

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const div = (a, b) => (b ? a / b : null);

// Lo que interesa de las métricas de un lanzamiento (computeMetrics).
export function resumenLanzamiento(code, launch, m) {
  const fact = m.eco?.facturacionPrograma ?? 0;
  // Inversión: la de Meta o, si no hay (o es 0), la puesta a mano en el lanzamiento.
  const inversion = n(m.eco?.inversion) || n(launch?.inversion);
  return {
    code, name: launch?.name || code,
    registros: m.total, vip: m.vip, ventas: m.compra,
    inversion, facturacion: n(m.eco?.facturacion), facturacionPrograma: n(fact),
    precioVip: n(launch?.precioVip),
    cpl: div(inversion, m.total),
    convVip: div(m.vip, m.total),
    convVenta: div(m.compra, m.total),
    ticket: div(n(fact), m.compra),
    roas: div(n(m.eco?.facturacion), inversion),
  };
}

// Percentil (interpolado) de una lista de números.
export function percentil(lista, p) {
  const xs = lista.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const i = (xs.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return xs[lo] + (xs[hi] - xs[lo]) * (i - lo);
}

// Supuestos de cada escenario a partir del histórico. `manual` (opcional) sustituye el valor neutro
// de cualquier supuesto: { cpl, convVip, convVenta, ticket } (las conversiones en tanto por uno).
// En el favorable el CPL es el bajo y las conversiones las altas; en el desfavorable, al revés.
export function escenarios(historico, manual = {}) {
  const validos = historico.filter((h) => h.registros > 0);
  const claves = { cpl: 'menos', convVip: 'mas', convVenta: 'mas', ticket: 'mas' };
  const out = { desfavorable: {}, neutro: {}, favorable: {}, fuente: {}, n: validos.length };
  for (const [k, mejor] of Object.entries(claves)) {
    const vals = validos.map((h) => h[k]).filter((x) => x != null && x > 0);
    const man = manual[k] != null && manual[k] !== '' && Number(manual[k]) > 0 ? Number(manual[k]) : null;
    let neutro = man ?? (vals.length ? percentil(vals, 0.5) : null);
    let bajo;
    let alto;
    if (!man && vals.length >= 3) {
      bajo = percentil(vals, 0.25);
      alto = percentil(vals, 0.75);
    } else if (neutro != null) {
      bajo = neutro * (1 - MARGEN);
      alto = neutro * (1 + MARGEN);
    }
    if (neutro == null) { bajo = null; alto = null; neutro = null; }
    out.fuente[k] = man != null ? 'manual' : vals.length ? `histórico (${vals.length})` : 'sin datos';
    out.neutro[k] = neutro;
    out.favorable[k] = mejor === 'menos' ? bajo : alto;
    out.desfavorable[k] = mejor === 'menos' ? alto : bajo;
  }
  return out;
}

// Proyección de un escenario.
//  obj: { registros, vip, ventas, facturacion } (0 = sin objetivo)
//  esc: { cpl, convVip, convVenta, ticket }
//  actual: { registros, vip, ventas, facturacion, inversion } (lo que lleva el lanzamiento)
//  opts: { precioVip, roasObjetivo, diasCaptacion, ritmoDiario, presupuesto }
export function proyectar(obj, esc, actual = {}, opts = {}) {
  const precioVip = n(opts.precioVip);
  const roasObj = n(opts.roasObjetivo) || ROAS_OBJETIVO_DEF;
  const { cpl, convVip, convVenta, ticket } = esc;
  // Lo que deja de media cada registro (VIP + programa).
  const factLead = (convVip || 0) * precioVip + (convVenta || 0) * (ticket || 0);
  // Registros que pide cada objetivo; manda el más exigente.
  const pide = [
    ['registros', n(obj.registros)],
    ['ventas', convVenta ? n(obj.ventas) / convVenta : (n(obj.ventas) ? Infinity : 0)],
    ['vip', convVip ? n(obj.vip) / convVip : (n(obj.vip) ? Infinity : 0)],
    ['facturacion', factLead ? n(obj.facturacion) / factLead : (n(obj.facturacion) ? Infinity : 0)],
  ];
  const [manda, registrosNec] = pide.reduce((a, b) => (b[1] > a[1] ? b : a), ['', 0]);
  const calculable = Number.isFinite(registrosNec);
  const R = calculable ? Math.ceil(registrosNec) : null;
  const res = (r, inversion = cpl ? r * cpl : null) => (r == null ? null : {
    registros: r,
    vip: Math.round(r * (convVip || 0)),
    ventas: Math.round(r * (convVenta || 0)),
    facturacion: r * factLead,
    inversion,
  });
  const necesario = res(R);
  if (necesario) necesario.roas = div(necesario.facturacion, necesario.inversion);
  // CPL máximo: el que deja la inversión igual a lo facturado (ROAS 1). Recomendado: para el ROAS objetivo.
  const cplMax = factLead || null;
  const cplRecomendado = factLead ? factLead / roasObj : null;
  // Lo que falta desde hoy y a qué ritmo.
  const faltan = R != null ? Math.max(0, R - n(actual.registros)) : null;
  const dias = opts.diasCaptacion != null && opts.diasCaptacion > 0 ? opts.diasCaptacion : null;
  const inversionPendiente = necesario?.inversion != null ? Math.max(0, necesario.inversion - n(actual.inversion)) : null;
  // Al ritmo actual (registros al día de los últimos días) hasta el fin de la captación.
  const nuevos = opts.ritmoDiario != null && dias ? Math.round(opts.ritmoDiario * dias) : null;
  const alRitmo = nuevos != null ? res(n(actual.registros) + nuevos, cpl ? n(actual.inversion) + nuevos * cpl : null) : null;
  // Con un presupuesto total de publicidad (lo ya gastado cuenta).
  const conPresupuesto = n(opts.presupuesto) && cpl
    ? res(Math.round(n(actual.registros) + Math.max(0, n(opts.presupuesto) - n(actual.inversion)) / cpl), Math.max(n(opts.presupuesto), n(actual.inversion)))
    : null;
  return {
    factLead, manda, calculable, necesario, cplMax, cplRecomendado,
    faltan, porDia: faltan != null && dias ? faltan / dias : null,
    inversionPendiente, inversionDia: inversionPendiente != null && dias ? inversionPendiente / dias : null,
    alRitmo, conPresupuesto, dias,
  };
}

// ¿Llega un resultado a los objetivos? → lista de los que no.
export function noLlega(obj, r) {
  if (!r) return [];
  return [['registros', 'registros'], ['vip', 'VIP'], ['ventas', 'ventas'], ['facturacion', 'facturación']]
    .filter(([k]) => n(obj[k]) > 0 && n(r[k]) < n(obj[k])).map(([, l]) => l);
}
