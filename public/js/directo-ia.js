// Análisis de los directos con Claude, lo común a cualquier embudo con vídeos en directo (webinar, 2 o 3 vídeos, PLF,
// retos…): va ligado al dato —un vídeo con curva de Zoom—, no a un tipo de embudo. Sin pantalla: lo usan app.js,
// el servidor (lib/directo-ia.js) y las pruebas.
import { analizarDirecto } from './retencion.js';
import { videosDe, FORMATOS, formatoValido } from './videos.js';

// Qué papel tiene el directo k en su embudo, para el prompt y la pantalla. → { k, n, nombre, formato, venta, texto }
export function rolDirecto(launch, k) {
  const vids = videosDe(launch);
  const v = vids[k - 1] || { k, nombre: `Vídeo ${k}`, venta: true };
  const formato = FORMATOS[formatoValido(launch?.formato)].label;
  const n = vids.length || 1;
  const texto = n > 1
    ? `${v.nombre}, el ${k}.º de ${n} vídeos de un ${formato.toLowerCase()}; ${v.venta ? 'en este se hace la venta (la oferta)' : 'es de contenido: aquí no se vende, su trabajo es que vuelvan al siguiente'}`
    : `${v.nombre} (${formato.toLowerCase()}): un solo directo en el que se hace la venta`;
  return { k, n, nombre: v.nombre, formato, venta: Boolean(v.venta), texto };
}

// Comparación entre los directos de un mismo embudo (los que tienen curva). items: [{ k, nombre, curva, analisis? }]
// → { filas: [{ k, nombre, pico, picoMin, final, fugas, mayorFuga, titular }], conclusiones: [texto] } (sin filas si hay menos de 2).
export function compararDirectos(items = []) {
  const filas = items.filter((x) => x?.curva?.valores?.length).map((x) => {
    const an = analizarDirecto(x.curva);
    const fugaIa = (x.analisis?.puntos || []).filter((p) => p.tipo === 'fuga').length;
    const mayor = [...an.fugas].sort((a, b) => b.caida - a.caida)[0] || null;
    return { k: x.k, nombre: x.nombre || `Vídeo ${x.k}`, pico: an.pico, picoMin: an.picoMin, final: Math.round(an.final), fugas: Math.max(an.fugas.length, fugaIa),
      mayorFuga: mayor ? { min0: mayor.min0, min1: mayor.min1, caida: Math.round(mayor.caida), personas: mayor.personas } : null, titular: x.analisis?.resumen?.titular || '' };
  }).sort((a, b) => a.k - b.k);
  if (filas.length < 2) return { filas: [], conclusiones: [] };
  const c = [];
  const [primero, ultimo] = [filas[0], filas.at(-1)];
  if (primero.pico) {
    const cambio = Math.round(((ultimo.pico - primero.pico) / primero.pico) * 100);
    c.push(cambio < 0
      ? `Del ${primero.nombre} al ${ultimo.nombre} el máximo de personas a la vez baja un ${-cambio}% (de ${primero.pico.toLocaleString('es-ES')} a ${ultimo.pico.toLocaleString('es-ES')}).`
      : `Del ${primero.nombre} al ${ultimo.nombre} el máximo de personas a la vez ${cambio ? `sube un ${cambio}%` : 'se mantiene'} (de ${primero.pico.toLocaleString('es-ES')} a ${ultimo.pico.toLocaleString('es-ES')}).`);
  }
  const mejor = [...filas].sort((a, b) => b.final - a.final)[0];
  const peor = [...filas].sort((a, b) => a.final - b.final)[0];
  if (mejor.final !== peor.final) c.push(`El que mejor retiene es el ${mejor.nombre} (al final queda el ${mejor.final}% del máximo); el que menos, el ${peor.nombre} (${peor.final}%).`);
  const fuga = filas.filter((f) => f.mayorFuga).sort((a, b) => b.mayorFuga.caida - a.mayorFuga.caida)[0];
  if (fuga) c.push(`La mayor fuga está en el ${fuga.nombre}, entre el minuto ${fuga.mayorFuga.min0} y el ${fuga.mayorFuga.min1}: se va el ${fuga.mayorFuga.caida}% del máximo.`);
  return { filas, conclusiones: c };
}
