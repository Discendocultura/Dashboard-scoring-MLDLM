// Comparativas: edición actual frente a la anterior y a la media de las anteriores, mes a mes (VSL)
// y VSL frente a lanzamiento, con alertas en claro («el coste por lead va un 40 % por encima…»).
// Lo usan el navegador (pestaña Comparar) y los tests.

export const INDICADORES = [
  { id: 'registros', label: 'Registros', fmt: 'n', mejor: 'mas', alerta: 'los registros' },
  { id: 'cpl', label: 'Coste por lead', fmt: 'eur', mejor: 'menos', alerta: 'el coste por lead' },
  { id: 'convVip', label: '% que compra la VIP', fmt: 'pct', mejor: 'mas', alerta: 'la conversión a VIP' },
  { id: 'convClase1', label: '% que ve la clase 1', fmt: 'pct', mejor: 'mas', alerta: 'el visionado de la clase 1' },
  { id: 'convVenta', label: 'Conversión a venta', fmt: 'pct', mejor: 'mas', alerta: 'la conversión a venta' },
  { id: 'ventas', label: 'Ventas', fmt: 'n', mejor: 'mas', alerta: 'las ventas' },
  { id: 'facturacion', label: 'Facturación', fmt: 'eur', mejor: 'mas', alerta: 'la facturación' },
  { id: 'cac', label: 'Coste por venta', fmt: 'eur', mejor: 'menos', alerta: 'el coste por venta' },
  { id: 'ticket', label: 'Ticket medio', fmt: 'eur', mejor: 'mas', alerta: 'el ticket medio' },
  { id: 'roas', label: 'ROAS', fmt: 'x', mejor: 'mas', alerta: 'el ROAS' },
];
const div = (a, b) => (b ? a / b : null);

// De las métricas de un lanzamiento (computeMetrics).
// `launch`: para la inversión puesta a mano si Meta no da nada.
export function indicadoresLanzamiento(m, launch = null) {
  const inv = m.eco?.inversion || Number(launch?.inversion) || 0;
  return {
    registros: m.total, cpl: inv ? div(inv, m.total) : null, convVip: m.conVip === false ? null : div(m.vip, m.total), convClase1: div(m.clase1, m.total),
    convVenta: div(m.compra, m.total), ventas: m.compra, facturacion: m.eco?.facturacion ?? null,
    cac: inv ? div(inv, m.compra) : null, ticket: div(m.eco?.facturacionPrograma || 0, m.compra), roas: div(m.eco?.facturacion || 0, inv),
  };
}
// De las métricas de un periodo de una VSL (computeVsl).
export function indicadoresVsl(m) {
  return {
    registros: m.registros, cpl: m.cpl, convVip: null, convClase1: null, convVenta: div(m.compraCohorte, m.registros), ventas: m.ventas,
    facturacion: m.ingresos, cac: m.cpa, ticket: div(m.ingresos, m.ventas), roas: m.roas,
  };
}

export function mediaIndicadores(lista) {
  const out = {};
  for (const { id } of INDICADORES) {
    const xs = lista.map((x) => x?.[id]).filter((v) => v != null && Number.isFinite(v));
    out[id] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  }
  return out;
}

// Diferencia relativa de cada indicador y si es buena o mala.
export function diferencias(actual, ref) {
  const out = {};
  for (const ind of INDICADORES) {
    const a = actual?.[ind.id];
    const r = ref?.[ind.id];
    if (a == null || r == null || !r) { out[ind.id] = null; continue; }
    const pct = (a - r) / r;
    out[ind.id] = { pct, bueno: ind.mejor === 'mas' ? pct >= 0 : pct <= 0 };
  }
  return out;
}

// Alertas a partir de un umbral (20 % por defecto). `que`: «la última edición», «la media de las anteriores»…
// `omitir`: indicadores que no tiene sentido comparar (p. ej. totales de un lanzamiento a medias).
export function alertas(actual, ref, que, { umbral = 0.2, omitir = [] } = {}) {
  const d = diferencias(actual, ref);
  const out = [];
  for (const ind of INDICADORES) {
    const x = d[ind.id];
    if (!x || omitir.includes(ind.id) || Math.abs(x.pct) < umbral) continue;
    const n = Math.round(Math.abs(x.pct) * 100);
    out.push({ id: ind.id, nivel: x.bueno ? 'bien' : 'mal', pct: x.pct, texto: `${ind.alerta.charAt(0).toUpperCase()}${ind.alerta.slice(1)} va un ${n} % ${x.pct > 0 ? 'por encima' : 'por debajo'} de ${que}` });
  }
  return out.sort((a, b) => (a.nivel === b.nivel ? Math.abs(b.pct) - Math.abs(a.pct) : a.nivel === 'mal' ? -1 : 1));
}

// Meses (AAAA-MM) desde `desde` hasta el mes de `hoy`, máximo `n`.
export function ultimosMeses(hoy, n = 6) {
  const out = [];
  let [y, m] = hoy.slice(0, 7).split('-').map(Number);
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (!m) { m = 12; y -= 1; }
  }
  return out;
}
