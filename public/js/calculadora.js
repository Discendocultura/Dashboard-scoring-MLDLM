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
    convClase1: div(m.clase1, m.total),
    ticket: div(n(fact), m.compra),
    roas: div(n(m.eco?.facturacion), inversion),
    // Llamadas de valoración: cuántas agendaron y cuántas de ellas compraron.
    llamadas: n(m.llamada), ventasLlamada: n(m.compraLlamada),
    pctLlamada: div(n(m.llamada), m.total),
    pctCierre: div(n(m.compraLlamada), n(m.llamada)),
    diasCarrito: n(launch?.diasCarrito) || null,
  };
}

// Lanzamiento anterior metido a mano (Calculadora → «Añadir lanzamiento anterior»): mismo formato que
// resumenLanzamiento. `shows` (llamadas que se hicieron) es opcional: con él, el % de cierre es sobre ellas.
export function resumenManual(r = {}) {
  const registros = n(r.registros);
  const inversion = n(r.inversion);
  const facturacion = n(r.facturacion);
  const llamadas = n(r.llamadas);
  const shows = n(r.shows);
  return {
    code: r.id, name: r.nombre || 'Lanzamiento anterior', manual: true,
    registros, vip: n(r.vip), ventas: n(r.ventas), inversion, facturacion,
    cpl: div(inversion, registros),
    convVip: div(n(r.vip), registros),
    convVenta: div(n(r.ventas), registros),
    ticket: n(r.ticket) || div(facturacion, n(r.ventas)),
    roas: div(facturacion, inversion),
    llamadas, shows, ventasLlamada: n(r.ventasLlamada),
    pctLlamada: div(llamadas, registros),
    pctShow: shows ? div(shows, llamadas) : null,
    pctCierre: div(n(r.ventasLlamada), shows || llamadas),
    diasCarrito: n(r.diasCarrito) || null,
  };
}

// Medianas del histórico para el equipo de llamadas (sin datos, null).
export function supuestosLlamadas(historico) {
  const med = (k) => percentil(historico.map((h) => h[k]).filter((x) => x != null && x > 0), 0.5);
  return { pctLlamada: med('pctLlamada'), pctShow: med('pctShow'), pctCierre: med('pctCierre'), diasCarrito: med('diasCarrito') };
}

// Valores de serie si no hay histórico ni supuesto escrito.
export const PLAN_DEF = { llamadasDia: 8, pctShow: 0.7, pico: 1.5, diasCarrito: 7 };

// Plan del lanzamiento con un escenario: captación, equipo de llamadas y números.
//  r: resultado de proyectar() (r.necesario = registros, ventas, facturación… para los objetivos)
//  esc: { cpl, convVip, convVenta, ticket }
//  p: { roasObjetivo, diasCaptacion, pctLlamada, pctShow, pctCierre, llamadasDia, diasCarrito,
//       costePersona, comision (tanto por uno), costesFijos, pico }
export function planificar(r, esc, p = {}) {
  const nec = r?.necesario;
  if (!nec) return null;
  const roas = n(p.roasObjetivo) || ROAS_OBJETIVO_DEF;
  const leads = nec.registros;
  // Captación: el CPL máximo para el ROAS objetivo y la inversión (al CPL previsto, o el techo si no hay CPL).
  const cplMaxRoas = r.factLead ? r.factLead / roas : null;
  const techoInversion = nec.facturacion ? nec.facturacion / roas : null;
  const inversion = nec.inversion ?? techoInversion;
  const diasCapt = n(p.diasCaptacion) || null;
  // Llamadas: las que se agendan, las que se hacen y las ventas que salen de ellas.
  const pctLlamada = p.pctLlamada ?? null;
  const pctShow = p.pctShow ?? PLAN_DEF.pctShow;
  const agendadas = pctLlamada != null ? Math.round(leads * pctLlamada) : null;
  const hechas = agendadas != null ? Math.round(agendadas * pctShow) : null;
  const ventasLlamada = hechas != null && p.pctCierre != null ? Math.round(hechas * p.pctCierre) : null;
  // Equipo: cada persona hace setting y cierre. Las llamadas se concentran en el carrito, con picos
  // (apertura y último día) de ~1,5× la media: se planifica para el pico.
  const diasCarrito = n(p.diasCarrito) || PLAN_DEF.diasCarrito;
  const capacidad = n(p.llamadasDia) || PLAN_DEF.llamadasDia;
  const porDia = agendadas != null ? agendadas / diasCarrito : null;
  const pico = porDia != null ? porDia * (n(p.pico) || PLAN_DEF.pico) : null;
  const personas = pico != null ? Math.max(agendadas ? 1 : 0, Math.ceil(pico / capacidad)) : null;
  // Números: facturación, costes y beneficio.
  const costeEquipo = personas != null ? personas * n(p.costePersona) : 0;
  const comisiones = ventasLlamada != null ? ventasLlamada * n(esc.ticket) * n(p.comision) : 0;
  const costesFijos = n(p.costesFijos);
  const costes = n(inversion) + costeEquipo + comisiones + costesFijos;
  const beneficio = nec.facturacion - costes;
  // Punto de equilibrio: ventas para cubrir la publicidad y los costes (lo que deja cada venta, con su VIP).
  const porVenta = esc.convVenta ? nec.facturacion / Math.max(1, nec.ventas) : n(esc.ticket);
  const equilibrio = porVenta ? Math.ceil((n(inversion) + costeEquipo + costesFijos) / (porVenta * (1 - n(p.comision) * (ventasLlamada && nec.ventas ? ventasLlamada / nec.ventas : 0)))) : null;
  return {
    leads, cplMaxRoas, cplEquilibrio: r.factLead || null, inversion, techoInversion,
    inversionDia: inversion != null && diasCapt ? inversion / diasCapt : null,
    leadsDia: diasCapt ? leads / diasCapt : null, diasCaptacion: diasCapt,
    ventas: nec.ventas, vip: nec.vip, facturacion: nec.facturacion,
    agendadas, hechas, ventasLlamada, porDia, pico, personas, capacidad, diasCarrito,
    costeEquipo, comisiones, costesFijos, costes, beneficio,
    roas: inversion ? nec.facturacion / inversion : null,
    equilibrio,
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

// ---- Previsión durante el lanzamiento ----
// Ventas finales estimadas: registros al final de la captación (al ritmo actual) × la conversión
// histórica, corregida por las señales tempranas de esta edición (compra de VIP y visionado de la
// clase 1 frente al histórico). Rango con los lanzamientos peores y mejores (percentiles 25 y 75).
//  actual: { registros, vip, clase1, ventas, carritoAbierto }
//  hist: resúmenes de lanzamientos anteriores (resumenLanzamiento)
export function prevision(actual, hist, { diasCaptacion = 0, ritmoDiario = null, objetivoVentas = 0, conVip = true } = {}) {
  const validos = hist.filter((h) => h.registros > 0 && h.convVenta != null);
  const regFinal = Math.round(n(actual.registros) + (ritmoDiario && diasCaptacion > 0 ? ritmoDiario * diasCaptacion : 0));
  const convs = validos.map((h) => h.convVenta);
  let base = percentil(convs, 0.5);
  let bajo = convs.length >= 3 ? percentil(convs, 0.25) : base != null ? base * 0.8 : null;
  let alto = convs.length >= 3 ? percentil(convs, 0.75) : base != null ? base * 1.2 : null;
  // Señales tempranas frente a la media histórica.
  const ratios = [];
  const r = n(actual.registros);
  const vipH = percentil(validos.map((h) => h.convVip), 0.5);
  const claseH = percentil(validos.map((h) => h.convClase1), 0.5);
  if (conVip && vipH && r >= 50) ratios.push({ que: 'compra de VIP', v: n(actual.vip) / r / vipH });
  if (claseH && r >= 50 && n(actual.clase1) > 0) ratios.push({ que: 'visionado de la clase 1', v: n(actual.clase1) / r / claseH });
  const factor = ratios.length ? Math.min(1.8, Math.max(0.5, Math.exp(ratios.reduce((a, x) => a + Math.log(x.v), 0) / ratios.length))) : 1;
  let fuente = 'histórico';
  if (base == null) {
    // Sin histórico: si el carrito ya está abierto, la conversión que lleva esta edición.
    if (actual.carritoAbierto && r) { base = n(actual.ventas) / r; bajo = base * 0.8; alto = base * 1.3; fuente = 'esta edición'; } else return { calculable: false, regFinal };
  }
  const v = (c) => Math.max(n(actual.ventas), Math.round(regFinal * c * factor));
  const res = { calculable: true, fuente, regFinal, factor, ratios, ventas: v(base), bajo: v(bajo), alto: v(alto) };
  if (objetivoVentas > 0) {
    res.objetivo = objetivoVentas;
    res.estado = res.alto < objetivoVentas ? 'no-llega' : res.ventas < objetivoVentas ? 'justo' : res.bajo >= objetivoVentas ? 'sobrado' : 'probable';
    // Registros extra para llegar con la conversión prevista.
    const convPrev = base * factor;
    res.registrosExtra = convPrev ? Math.max(0, Math.ceil(objetivoVentas / convPrev - regFinal)) : null;
  }
  return res;
}
