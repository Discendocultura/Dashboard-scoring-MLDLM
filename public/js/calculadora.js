// Planificador del lanzamiento: con los lanzamientos anteriores (medias ponderadas por volumen y por lo
// recientes que son, con su intervalo de predicción) proyecta el siguiente: inversión recomendada, leads,
// CPL máximo para el ROAS objetivo, VIP, ventas, facturación, llamadas y equipo. Los objetivos del
// lanzamiento salen de esa proyección. También la previsión durante el lanzamiento.
// Lo usa el navegador (pestaña «Objetivos y calculadora») y los tests.

export const ESCENARIOS = [
  { id: 'desfavorable', label: 'Desfavorable', tone: 'warn' },
  { id: 'neutro', label: 'Neutro', tone: 'info' },
  { id: 'favorable', label: 'Favorable', tone: 'buy' },
];
// Con un solo lanzamiento no hay dispersión medible: como mínimo ±20 % alrededor del dato.
const MARGEN = 0.2;
export const ROAS_OBJETIVO_DEF = 2.5;
// Cada lanzamiento pesa un 25 % menos que el siguiente (lo reciente se parece más al próximo).
export const PESO_RECIENTE = 0.75;
// Lanzamientos con menos registros no cuentan (pruebas o datos incompletos).
export const MIN_REGISTROS = 100;

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const div = (a, b) => (b ? a / b : null);

// Lo que interesa de las métricas de un lanzamiento (computeMetrics).
export function resumenLanzamiento(code, launch, m) {
  const fact = m.eco?.facturacionPrograma ?? 0;
  // Inversión: la de Meta o, si no hay (o es 0), la puesta a mano en el lanzamiento.
  const inversion = n(m.eco?.inversion) || n(launch?.inversion);
  return {
    code, name: launch?.name || code, fecha: launch?.inicioCaptacion || launch?.fechaDirecto || '',
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

// ---- Medias del histórico ----
// t de Student (dos colas, 80 %) por grados de libertad: intervalo de predicción del próximo lanzamiento.
const T80 = [null, 3.078, 1.886, 1.638, 1.533, 1.476, 1.44, 1.415, 1.397, 1.383];
const t80 = (gl) => T80[gl] ?? 1.282;

// Media ponderada de un cociente (num ÷ den) en varios lanzamientos, con su intervalo de predicción.
//  items: [{ num, den, w }] (w: peso por lo reciente). Cada lanzamiento pesa además por su volumen (den).
//  tasa: true si es una proporción (añade el error de muestreo de la binomial).
// → { valor, bajo, alto, n, base } o null sin datos.
export function estimar(items, { tasa = false } = {}) {
  const xs = items.filter((x) => x.den > 0 && Number.isFinite(x.num) && x.num >= 0);
  if (!xs.length) return null;
  const v = xs.map((x) => x.w * x.den);
  const sv = v.reduce((a, b) => a + b, 0);
  const valor = xs.reduce((a, x) => a + x.w * x.num, 0) / sv;
  const base = xs.reduce((a, x) => a + x.den, 0);
  const k = xs.length;
  // Varianza entre lanzamientos (ponderada) y tamaño efectivo de la muestra.
  const varEntre = k > 1 ? xs.reduce((a, x, i) => a + v[i] * (x.num / x.den - valor) ** 2, 0) / sv * (k / (k - 1)) : 0;
  const nEf = sv ** 2 / v.reduce((a, b) => a + b * b, 0);
  const varMuestreo = tasa ? (valor * (1 - valor)) / base : 0;
  let semi = k > 1 ? t80(k - 1) * Math.sqrt(varEntre * (1 + 1 / nEf) + varMuestreo) : 1.282 * Math.sqrt(varMuestreo);
  // Nunca más estrecho que ±10 % (±20 % con un solo lanzamiento): ningún lanzamiento es igual a otro.
  semi = Math.max(semi, valor * (k > 1 ? MARGEN / 2 : MARGEN));
  // Rango en proporción (log-simétrico): el bajo nunca llega a 0 (un CPL o una conversión de 0 no existen).
  return { valor, bajo: valor ? valor * valor / (valor + semi) : 0, alto: valor + semi, n: k, base };
}

// Medias del histórico para proyectar el siguiente lanzamiento.
//  hist: resúmenes (resumenLanzamiento / resumenManual), en cualquier orden (se ordenan por fecha).
export function medias(hist) {
  const validos = hist.filter((h) => n(h.registros) >= MIN_REGISTROS)
    .sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')));
  const k = validos.length;
  const serie = (f) => validos.map((h, i) => ({ ...f(h), w: PESO_RECIENTE ** (k - 1 - i) }));
  const conVip = (h) => n(h.vip) > 0 || n(h.precioVip) > 0;
  const ingresosPrograma = (h) => (h.facturacionPrograma != null ? n(h.facturacionPrograma) : n(h.ticket) * n(h.ventas));
  const M = {
    n: k, lanzamientos: validos, leads: validos.reduce((a, h) => a + n(h.registros), 0),
    cpl: estimar(serie((h) => ({ num: n(h.inversion), den: n(h.inversion) > 0 ? n(h.registros) : 0 }))),
    convVip: estimar(serie((h) => ({ num: n(h.vip), den: conVip(h) ? n(h.registros) : 0 })), { tasa: true }),
    convVenta: estimar(serie((h) => ({ num: n(h.ventas), den: n(h.registros) })), { tasa: true }),
    ticket: estimar(serie((h) => ({ num: ingresosPrograma(h), den: ingresosPrograma(h) > 0 ? n(h.ventas) : 0 }))),
    pctLlamada: estimar(serie((h) => ({ num: n(h.llamadas), den: n(h.llamadas) > 0 ? n(h.registros) : 0 })), { tasa: true }),
    pctShow: estimar(serie((h) => ({ num: n(h.shows), den: n(h.shows) > 0 ? n(h.llamadas) : 0 })), { tasa: true }),
    pctCierre: estimar(serie((h) => ({ num: n(h.ventasLlamada), den: n(h.llamadas) > 0 ? n(h.shows) || n(h.llamadas) : 0 })), { tasa: true }),
    // Escala: inversión y registros medios (ponderados por lo recientes) y días de carrito.
    inversion: estimar(serie((h) => ({ num: n(h.inversion), den: n(h.inversion) > 0 ? 1 : 0 }))),
    registros: estimar(serie((h) => ({ num: n(h.registros), den: 1 }))),
    diasCarrito: estimar(serie((h) => ({ num: n(h.diasCarrito), den: n(h.diasCarrito) > 0 ? 1 : 0 }))),
  };
  // Fiabilidad: cuántos lanzamientos y lo ancho que es el rango de la conversión a venta.
  const anchoVenta = M.convVenta?.valor ? (M.convVenta.alto - M.convVenta.bajo) / 2 / M.convVenta.valor : null;
  M.fiabilidad = !k ? 'sin datos' : k >= 3 && anchoVenta != null && anchoVenta <= 0.3 ? 'alta'
    : (k >= 2 || M.leads >= 3000) && anchoVenta != null && anchoVenta <= 0.6 ? 'media' : 'baja';
  M.curva = curvaCpl(validos);
  return M;
}

// Cómo sube el CPL al invertir más: CPL = e^a · inversión^b (mínimos cuadrados en logaritmos, ponderado
// por lo reciente). Hace falta al menos 3 lanzamientos con inversiones distintas (la mayor ≥ 1,3× la menor).
// Sin subida medible (b ≤ 0,02), null: se toma el CPL medio.
export function curvaCpl(hist) {
  const pts = hist.filter((h) => n(h.inversion) > 0 && n(h.registros) > 0);
  if (pts.length < 3) return null;
  const invs = pts.map((h) => n(h.inversion));
  if (Math.max(...invs) < 1.3 * Math.min(...invs)) return null;
  const k = pts.length;
  const w = pts.map((_, i) => PESO_RECIENTE ** (k - 1 - i));
  const X = pts.map((h) => Math.log(n(h.inversion)));
  const Y = pts.map((h) => Math.log(n(h.inversion) / n(h.registros)));
  const sw = w.reduce((a, b) => a + b, 0);
  const mx = X.reduce((a, x, i) => a + w[i] * x, 0) / sw;
  const my = Y.reduce((a, y, i) => a + w[i] * y, 0) / sw;
  const sxx = X.reduce((a, x, i) => a + w[i] * (x - mx) ** 2, 0);
  const sxy = X.reduce((a, x, i) => a + w[i] * (x - mx) * (Y[i] - my), 0);
  const b = Math.min(1, sxx ? sxy / sxx : 0);
  if (!(b > 0.02)) return null;
  const a = my - b * mx;
  return { a, b, n: k, maxInversion: Math.max(...invs), cpl: (inv) => Math.exp(a + b * Math.log(inv)) };
}

// Supuestos de un escenario: el dato del histórico (neutro) o su lado malo / bueno. `manual` sustituye el
// neutro de cualquier supuesto (y el rango se mueve con él, en proporción).
// CPL, conversiones y ticket se multiplican entre sí: que todos salgan a la vez en su extremo es muy raro,
// así que se reparte la desviación conjunta (√Σr², en logaritmos) entre ellos, proporcional a lo que varía
// cada uno. Así el escenario completo queda en el 80 %, no solo cada dato por separado.
//  → { cpl, convVip, convVenta, ticket, pctLlamada, pctShow, pctCierre }
const ECONOMICOS = ['cpl', 'convVip', 'convVenta', 'ticket'];
export function supuestosEscenario(M, esc, manual = {}) {
  const r = (k) => (M?.[k]?.valor && M[k].alto ? Math.log(M[k].alto / M[k].valor) : 0);
  const R = Math.sqrt(ECONOMICOS.reduce((a, k) => a + r(k) ** 2, 0));
  const out = {};
  for (const k of ['cpl', 'convVip', 'convVenta', 'ticket', 'pctLlamada', 'pctShow', 'pctCierre']) {
    const man = manual[k] != null && manual[k] !== '' && Number(manual[k]) > 0 ? Number(manual[k]) : null;
    const neutro = man ?? M?.[k]?.valor ?? null;
    if (neutro == null) { out[k] = null; continue; }
    if (esc === 'neutro' || !r(k) || ['pctLlamada', 'pctShow'].includes(k)) { out[k] = neutro; continue; }
    // Desviación (en logaritmos) de este dato en el escenario; el CPL bueno es el bajo.
    const d = ECONOMICOS.includes(k) ? r(k) ** 2 / R : r(k);
    const signo = (esc === 'favorable' ? 1 : -1) * (k === 'cpl' ? -1 : 1);
    out[k] = neutro * Math.exp(signo * d);
  }
  return out;
}

// Inversión recomendada para el ROAS objetivo.
//  · Con curva de CPL: la mayor inversión cuyo CPL previsto deja el ROAS objetivo (como mucho el doble
//    de la mayor inversión hecha: más allá no hay datos).
//  · Sin curva: la inversión media reciente; +20 % si el ROAS histórico supera el objetivo con holgura.
//  → { valor, motivo: 'curva' | 'escalar' | 'mantener' | 'revisar' } o null.
export function inversionRecomendada(M, { factLead, roasObjetivo = ROAS_OBJETIVO_DEF } = {}) {
  if (!factLead) return null;
  const cplMax = factLead / roasObjetivo;
  const c = M?.curva;
  if (c) {
    const tope = 2 * c.maxInversion;
    const inv = Math.exp((Math.log(cplMax) - c.a) / c.b);
    return { valor: Math.max(0, Math.min(tope, inv)), motivo: 'curva', tope: inv > tope };
  }
  const base = M?.inversion?.valor;
  const cpl = M?.cpl?.valor;
  if (!base || !cpl) return null;
  const roas = factLead / cpl;
  if (roas >= 1.2 * roasObjetivo) return { valor: base * 1.2, motivo: 'escalar' };
  return { valor: base, motivo: roas >= roasObjetivo ? 'mantener' : 'revisar' };
}

// Proyección del próximo lanzamiento con una inversión y los supuestos de un escenario.
//  esc: supuestosEscenario(); opts: { inversion, precioVip, curva (opcional: el CPL sube con la inversión) }
//  → { factLead, necesario: { registros, vip, ventas, facturacion, inversion, roas } } (formato de planificar)
export function proyeccion(esc, { inversion, precioVip = 0, curva = null, cplNeutro = null } = {}) {
  const inv = n(inversion);
  // Con curva, el CPL a esta inversión; el del escenario se mueve en proporción al neutro.
  let cpl = esc.cpl;
  if (curva && inv > 0 && cpl && cplNeutro) cpl = curva.cpl(inv) * (cpl / cplNeutro);
  const factLead = (esc.convVip || 0) * n(precioVip) + (esc.convVenta || 0) * (esc.ticket || 0);
  if (!cpl || !inv || esc.convVenta == null) return { factLead: factLead || null, cpl, necesario: null };
  const registros = Math.round(inv / cpl);
  const facturacion = registros * factLead;
  return {
    factLead, cpl,
    necesario: {
      registros, vip: Math.round(registros * (esc.convVip || 0)), ventas: Math.round(registros * esc.convVenta),
      facturacion, inversion: inv, roas: div(facturacion, inv),
    },
  };
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
