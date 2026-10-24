// Tests A/B de páginas: lo común al servidor, al dashboard y a las pruebas. GHL reparte el tráfico entre las
// variantes de un paso del embudo; cada variante lleva su bloque de AlquimIA con data-lsd-variante="a|b|…".
// Resultado: visitas, conversiones y tasa de cada variante, y si la diferencia con la A es de verdad o puede ser
// casualidad (prueba de dos proporciones).
export const VARIANTE_RE = /^[a-z0-9]{1,12}$/;
// Mínimos para dar un veredicto: con menos, cualquier diferencia puede ser casualidad.
export const MINIMO_AB = { visitas: 100, conversiones: 10 };

// Φ(x) (distribución normal): aproximación de Abramowitz-Stegun 7.1.26, sobra para esto.
function normal(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

// ¿Es distinta la tasa de b que la de a? → { z, p, confianza (1 - p) }. Sin datos: null.
export function compararTasas(a, b) {
  if (!a.visitas || !b.visitas) return null;
  const pa = a.conversiones / a.visitas;
  const pb = b.conversiones / b.visitas;
  const pc = (a.conversiones + b.conversiones) / (a.visitas + b.visitas);
  const se = Math.sqrt(pc * (1 - pc) * (1 / a.visitas + 1 / b.visitas));
  if (!se) return { z: 0, p: 1, confianza: 0 };
  const z = (pb - pa) / se;
  const p = 2 * (1 - normal(Math.abs(z)));
  return { z, p, confianza: 1 - p };
}

// De { a: { visitas, conversiones, … }, b: … } a la tabla y el veredicto:
// { filas: [{ id, visitas, conversiones, tasa, mejora (vs A), confianza }], veredicto: { tipo, ganadora, texto } }
//   tipo: 'sin-datos' (aún no hay dos variantes con visitas) · 'pocos' (faltan datos) · 'gana' · 'empate'.
export function resumenAb(variantes = {}, { confianza = 0.95 } = {}) {
  const ids = Object.keys(variantes).filter((k) => VARIANTE_RE.test(k)).sort();
  const filas = ids.map((id) => {
    const x = variantes[id];
    const visitas = Number(x.visitas) || 0;
    const conversiones = Math.min(Number(x.conversiones) || 0, visitas);
    return { id, visitas, conversiones, tasa: visitas ? conversiones / visitas : 0, primera: x.primera ?? null, ultima: x.ultima ?? null };
  });
  const base = filas[0];
  for (const f of filas.slice(1)) {
    const c = compararTasas(base, f);
    f.mejora = base?.tasa ? (f.tasa - base.tasa) / base.tasa : null;
    f.confianza = c ? c.confianza : null;
  }
  const conVisitas = filas.filter((f) => f.visitas > 0);
  if (conVisitas.length < 2) return { filas, veredicto: { tipo: 'sin-datos', ganadora: null, texto: 'Aún no hay visitas de dos variantes.' } };
  const pocos = filas.some((f) => f.visitas < MINIMO_AB.visitas) || filas.reduce((t, f) => t + f.conversiones, 0) < MINIMO_AB.conversiones;
  const mejor = [...filas].sort((x, y) => y.tasa - x.tasa)[0];
  if (pocos) return { filas, veredicto: { tipo: 'pocos', ganadora: null, texto: `Faltan datos: hacen falta al menos ${MINIMO_AB.visitas} visitas por variante y ${MINIMO_AB.conversiones} conversiones en total. De momento va por delante la ${mejor.id.toUpperCase()}, pero aún puede ser casualidad.` } };
  // Gana la mejor si su diferencia con cada una de las demás no es casualidad.
  const seguro = filas.filter((f) => f !== mejor).every((f) => (compararTasas(f, mejor)?.confianza || 0) >= confianza);
  if (seguro) return { filas, veredicto: { tipo: 'gana', ganadora: mejor.id, texto: `Gana la ${mejor.id.toUpperCase()} con un ${Math.round(confianza * 100)} % de confianza o más: su conversión es mejor de verdad, no por casualidad.` } };
  return { filas, veredicto: { tipo: 'empate', ganadora: null, texto: `Sin diferencia clara todavía: va por delante la ${mejor.id.toUpperCase()}, pero con estos datos la diferencia aún puede ser casualidad. Deja la prueba más tiempo.` } };
}
