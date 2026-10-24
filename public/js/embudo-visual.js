// El embudo de un lanzamiento paso a paso (Métricas → Resumen): de la visita a la página de registro a la compra,
// con cuántos llegan a cada paso, qué % de los registros son, qué % pasa del anterior, lo que cuesta cada uno y lo
// que factura. Sin pantalla: la usan public/js/app.js y las pruebas.
import { watched } from './scoring.js';
import { videosDe, clasesDe, conVip } from './videos.js';

const vioVideo = (s, v) => Boolean(s?.[`${v.directo}_asistio`]) || watched(s || {}, v.replay) >= 25;

// leads: los ya enriquecidos (l.s). opts: { visitasRegistro, inversion, producto, ingresosVip, ingresosCompra, ventasCompra }
// → [{ id, ico, label, n, pctTotal (de los registros), pctPrev (del paso anterior), perdidos, coste, ingresos, detalle: [texto] }]
export function pasosEmbudo(leads = [], launch = {}, opts = {}) {
  const { visitasRegistro = 0, inversion = null, producto = 'el programa', ingresosVip = null, ingresosCompra = null, ventasCompra = null } = opts;
  const c = (fn) => leads.filter(fn).length;
  const total = leads.length;
  const pctDe = (n, t) => (t ? n / t : 0);
  const pasos = [];
  if (visitasRegistro > 0) pasos.push({ id: 'visitas', ico: '👀', label: 'Visitaron la página de registro', n: visitasRegistro, detalle: [] });
  pasos.push({ id: 'registros', ico: '📝', label: 'Se registraron', n: total, detalle: [
    ...(c((l) => l.s.trafico === 'frio') ? [`${c((l) => l.s.trafico === 'frio')} nuevas · ${c((l) => l.s.trafico === 'templado')} ya estaban`] : []),
  ] });
  if (launch.encuestaTag) pasos.push({ id: 'encuesta', ico: '📋', label: 'Rellenaron la encuesta', n: c((l) => l.s.encuesta || l.s.encuesta_anterior), detalle: [] });
  const clases = clasesDe(launch);
  if (clases.length) {
    pasos.push({ id: 'clases', ico: '🎓', label: clases.length > 1 ? 'Vieron alguna clase' : 'Vieron la clase', n: c((l) => clases.some((k) => watched(l.s, k) >= 25)),
      detalle: clases.length > 1 ? clases.map((k, i) => `Clase ${i + 1}: ${c((l) => watched(l.s, k) >= 25)}`) : [] });
  }
  // La VIP es una compra aparte (no todas pasan por ella): va como rama al lado del embudo, no como capa.
  if (conVip(launch)) pasos.push({ id: 'vip', ico: '⭐', label: 'Compraron la entrada VIP', n: c((l) => l.s.vip), ingresos: ingresosVip, lateral: true, detalle: [] });
  const videos = videosDe(launch);
  if (videos.length) {
    const enDirecto = c((l) => videos.some((v) => l.s[`${v.directo}_asistio`]));
    const vieron = c((l) => videos.some((v) => vioVideo(l.s, v)));
    pasos.push({ id: 'video', ico: '🔴', label: videos.length > 1 ? 'Vieron algún vídeo (directo o grabación)' : 'Vieron el directo o la grabación', n: vieron,
      detalle: vieron ? [`${enDirecto} en directo`, `${vieron - enDirecto} solo la grabación`] : [] });
  }
  const pago = c((l) => l.s.inicio_pago);
  if (pago) pasos.push({ id: 'pago', ico: '💳', label: 'Iniciaron el pago', n: pago, detalle: [] });
  const compras = ventasCompra ?? c((l) => l.s.compra);
  pasos.push({ id: 'compra', ico: '🏆', label: `Compraron ${producto}`, n: compras, ingresos: ingresosCompra, detalle: [] });
  return pasos.map((p, i) => {
    // «Pasa del anterior»: del paso anterior del embudo (sin contar la rama de la VIP); la VIP, sobre los registros.
    const prev = p.lateral ? pasos.find((x) => x.id === 'registros') : pasos.slice(0, i).reverse().find((x) => !x.lateral);
    return {
      ...p,
      pctTotal: p.id === 'visitas' ? null : pctDe(p.n, total),
      // Sin pasar por el anterior también se llega (p. ej. ver la grabación sin las clases): más del 100 % no se dice.
      pctPrev: prev && prev.n && p.n <= prev.n ? pctDe(p.n, prev.n) : null,
      perdidos: prev && p.n <= prev.n ? prev.n - p.n : 0,
      lateral: Boolean(p.lateral),
      coste: inversion && p.n ? inversion / p.n : null,
      ingresos: p.ingresos ?? null,
    };
  });
}

// Ancho de cada capa (en %): proporcional a la raíz (así los pasos pequeños también se ven), entre 26 % y 100 %.
// La rama lateral no cuenta para el máximo. Cada capa se estrecha hacia abajo (ver fondoCapa).
export function anchosEmbudo(pasos = []) {
  const max = Math.max(1, ...pasos.filter((p) => !p.lateral).map((p) => p.n));
  return pasos.map((p) => Math.round((26 + 74 * Math.sqrt(Math.max(0, p.n) / max)) * 10) / 10);
}
// Ancho de abajo de una capa: el de la siguiente si es menor; si no, un poco menos que el suyo (siempre se estrecha).
export const fondoCapa = (w, wSig) => Math.max(18, Math.min(w - 6, wSig ?? w - 8));
