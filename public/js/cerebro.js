// Cerebro de lanzamientos: lo que se aprende de TODOS los lanzamientos (de todos los clientes de la agencia, siempre
// en anónimo y agregado) para predecir el que está en marcha y decir en qué fase falla.
//   · referencia: medianas y cuartiles de cada ratio por formato (webinar, 2 vídeos, reto…), con al menos 3 lanzamientos.
//   · prediccion: ventas previstas a este ritmo y lo que falta (registros y € de anuncios) para el objetivo.
//   · comparar: cada fase del lanzamiento frente a los anteriores del cliente y a la referencia de la agencia.
// Lo usan lib/cerebro.js, lib/agente.js y el navegador.

export const MIN_REGISTROS = 100;
export const MIN_LANZAMIENTOS = 3;

// Ratios por fase (sobre los registros), en el orden del embudo. mejorAlto: false → cuanto más bajo, mejor.
export const RATIOS = [
  { id: 'cpl', label: 'Coste por registro', fase: 'Captación', euros: true, mejorAlto: false },
  { id: 'convVip', label: 'Compran la VIP', fase: 'VIP' },
  { id: 'convClase1', label: 'Ven la clase 1', fase: 'Preclase' },
  { id: 'convDirecto', label: 'Entran al directo', fase: 'Directo' },
  { id: 'convFinal', label: 'Se quedan hasta la oferta', fase: 'Oferta' },
  { id: 'convVenta', label: 'Compran el programa', fase: 'Venta' },
];

// Ratios de unos resultados guardados (solo cantidades: lib/config-store.js → resultados).
export function ratiosDeResultados(r = {}) {
  const reg = Number(r.registros) || 0;
  const d = (x) => (reg && Number(x) > 0 ? Number(x) / reg : null);
  return {
    registros: reg, formato: r.formato || 'webinar',
    cpl: reg && Number(r.inversion) > 0 ? Number(r.inversion) / reg : null,
    convVip: d(r.vip), convClase1: d(r.clase1), convDirecto: d(r.directo), convFinal: d(r.final),
    convVenta: reg ? (Number(r.ventas) || 0) / reg : null,
  };
}
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
function cuantil(ordenados, q) {
  if (!ordenados.length) return null;
  const pos = (ordenados.length - 1) * q;
  const i = Math.floor(pos);
  const f = pos - i;
  return ordenados[i + 1] != null ? ordenados[i] + f * (ordenados[i + 1] - ordenados[i]) : ordenados[i];
}
export function resumenSerie(valores) {
  const v = valores.map(num).filter((x) => x != null && x >= 0).sort((a, b) => a - b);
  if (!v.length) return null;
  return { n: v.length, p25: cuantil(v, 0.25), mediana: cuantil(v, 0.5), p75: cuantil(v, 0.75) };
}

// resultados: [{ formato, registros, cpl, convVip, … }] → { [formato | 'todos']: { [ratio]: resumenSerie } }
export function referencia(resultados) {
  const validos = resultados.filter((r) => num(r.registros) >= MIN_REGISTROS);
  const grupos = { todos: validos };
  for (const r of validos) (grupos[r.formato || 'webinar'] ||= []).push(r);
  const out = {};
  for (const [g, lista] of Object.entries(grupos)) {
    out[g] = { lanzamientos: lista.length };
    for (const r of RATIOS) {
      const s = resumenSerie(lista.map((x) => x[r.id]));
      if (s && s.n >= MIN_LANZAMIENTOS) out[g][r.id] = s;
    }
  }
  return out;
}
// La del formato si tiene datos suficientes; si no, la de todos los formatos.
export const referenciaDe = (ref, formato) => (ref?.[formato]?.lanzamientos >= MIN_LANZAMIENTOS ? { ...ref[formato], formato } : ref?.todos ? { ...ref.todos, formato: 'todos' } : null);

// Ratio de los lanzamientos anteriores del cliente: la mediana (y cuántos).
export function propiosDe(anteriores, id) {
  const s = resumenSerie(anteriores.filter((r) => num(r.registros) >= MIN_REGISTROS).map((r) => r[id]));
  return s ? { valor: s.mediana, n: s.n, p25: s.p25, p75: s.p75 } : null;
}

// Predicción de ventas. ritmo: el de public/js/agente.js (actualDia, quedan) o null si la captación ya acabó.
export function prediccion({ registros, ritmo = null, objetivo = {}, inversion = null, convPropia = null, convRef = null }) {
  if (!registros) return null;
  const finales = Math.round(registros + (ritmo ? ritmo.actualDia * ritmo.quedan : 0));
  const conv = convPropia?.valor != null ? { valor: convPropia.valor, bajo: convPropia.p25, alto: convPropia.p75, fuente: 'tus lanzamientos anteriores', n: convPropia.n }
    : convRef?.mediana != null ? { valor: convRef.mediana, bajo: convRef.p25, alto: convRef.p75, fuente: 'los lanzamientos de la agencia', n: convRef.n } : null;
  if (!conv) return { registrosFinales: finales, sinConversion: true };
  const ventas = Math.round(finales * conv.valor);
  const out = {
    registrosFinales: finales, conv: conv.valor, fuente: conv.fuente, n: conv.n,
    ventas, ventasBajo: Math.round(finales * (conv.bajo ?? conv.valor * 0.8)), ventasAlto: Math.round(finales * (conv.alto ?? conv.valor * 1.2)),
  };
  if (objetivo.ventas && conv.valor > 0) {
    const necesarios = Math.ceil(objetivo.ventas / conv.valor);
    out.faltanRegistros = Math.max(0, necesarios - finales);
    const cpl = inversion && registros ? inversion / registros : null;
    out.eurosExtra = out.faltanRegistros && cpl ? Math.round(out.faltanRegistros * cpl) : null;
    out.convNecesaria = finales ? objetivo.ventas / finales : null;
    out.llega = ventas >= objetivo.ventas;
  }
  return out;
}

// Cada fase frente a lo propio y a la agencia. actual: { cpl, convVip, … } del lanzamiento en marcha (null = aún no).
// → { filas: [{ id, label, fase, actual, propio, ref, vsRef }], peor: fila | null }
//   vsRef: cuánto mejor (+) o peor (−) que la mediana de la agencia, en proporción (0,3 = un 30 % mejor).
export function comparar(actual, anteriores = [], ref = null) {
  const filas = RATIOS.map((r) => {
    const a = num(actual?.[r.id]);
    const propio = propiosDe(anteriores, r.id);
    const rf = ref?.[r.id] || null;
    const base = rf?.mediana ?? propio?.valor ?? null;
    const vs = a != null && base ? (r.mejorAlto === false ? (base - a) / base : (a - base) / base) : null;
    return { id: r.id, label: r.label, fase: r.fase, euros: Boolean(r.euros), actual: a, propio, ref: rf, vsRef: vs, base: rf ? 'agencia' : propio ? 'propio' : null };
  });
  const peor = filas.filter((f) => f.vsRef != null && f.vsRef < -0.15).sort((x, y) => x.vsRef - y.vsRef)[0] || null;
  return { filas, peor };
}

const pct = (v) => (v == null ? '–' : `${(v * 100).toFixed(v < 0.1 ? 1 : 0).replace('.', ',')} %`);
const eur = (v) => (v == null ? '–' : `${v.toFixed(2).replace('.', ',')} €`);
export const fmtRatio = (f, v) => (f.euros ? eur(v) : pct(v));

// Frases para la pantalla, Telegram y el prompt de Claude.
export function textoPrediccion(p, objetivo = {}) {
  if (!p) return '';
  if (p.sinConversion) return `A este ritmo acabarás la captación con unos ${p.registrosFinales} registros. Aún no hay lanzamientos cerrados para predecir las ventas.`;
  let t = `A este ritmo acabarás con unos ${p.registrosFinales} registros y, si convierten como ${p.fuente} (${pct(p.conv)}), unas ${p.ventas} ventas (entre ${p.ventasBajo} y ${p.ventasAlto}).`;
  if (objetivo.ventas) {
    if (p.llega) t += ` Llegas al objetivo de ${objetivo.ventas}.`;
    else t += ` Para llegar a ${objetivo.ventas} te faltan unos ${p.faltanRegistros} registros${p.eurosExtra ? ` (≈ ${p.eurosExtra.toLocaleString('es-ES')} € más en anuncios al coste por registro de ahora)` : ''} o subir la conversión al ${pct(p.convNecesaria)}.`;
  }
  return t;
}
export function textoComparativa(c) {
  if (!c?.peor) return '';
  const f = c.peor;
  return `Donde más se pierde: ${f.fase.toLowerCase()} («${f.label}»): ${fmtRatio(f, f.actual)} frente a ${fmtRatio(f, f.ref?.mediana ?? f.propio?.valor)} ${f.base === 'agencia' ? 'de mediana en lanzamientos parecidos' : 'en tus anteriores'} (un ${Math.round(-f.vsRef * 100)} % peor).`;
}
