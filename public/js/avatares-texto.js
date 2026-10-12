// Avatares de compradoras en palabras (Métricas → Captación): lo que sale de perfilesCompradoras
// (metrics.js) contado para alguien que no es técnico. Sin «índices» ni «×1,5»: «compran casi el doble».

// «compran casi el doble que la media», «compran un 30 % menos que la media»…
export function comparaMedia(indice) {
  if (indice == null || !Number.isFinite(indice)) return '';
  if (indice >= 2.5) return `compran ${Math.round(indice).toLocaleString('es-ES')} veces más que la media`;
  if (indice >= 2.2) return 'compran más del doble que la media';
  if (indice >= 1.8) return 'compran casi el doble que la media';
  if (indice >= 1.15) return `compran un ${Math.round((indice - 1) * 10) * 10} % más que la media`;
  if (indice > 0.85) return 'compran como la media';
  if (indice > 0) return `compran un ${Math.round((1 - indice) * 10) * 10} % menos que la media`;
  return 'no ha comprado ninguna';
}

// Etiqueta de una respuesta: { tono: 'mas' | 'igual' | 'menos' | 'pocos', texto }.
export function etiquetaRespuesta(x) {
  if (x.pocos) return { tono: 'pocos', texto: 'Aún pocas personas' };
  if (x.indice == null) return { tono: 'igual', texto: 'Sin compras aún' };
  if (x.indice >= 1.15) return { tono: 'mas', texto: 'Compra más' };
  if (x.indice <= 0.85) return { tono: 'menos', texto: 'Compra menos' };
  return { tono: 'igual', texto: 'Como la media' };
}

// «3 de cada 10», «1 de cada 4»… (o «menos de 1 de cada 100»).
export function deCada(conv) {
  if (!conv) return 'ninguna';
  for (const n of [2, 3, 4, 5]) if (Math.abs(conv - 1 / n) < 0.02) return `1 de cada ${n}`;
  if (conv >= 0.1) return `${Math.round(conv * 10)} de cada 10`;
  if (conv >= 0.01) return `${Math.round(conv * 100)} de cada 100`;
  return 'menos de 1 de cada 100';
}

// Conclusiones en frases: las respuestas (con datos suficientes) que más y menos compran.
//   → [{ tono: 'mas' | 'menos', texto }]
export function conclusionesAvatares(r, { que = 'compran', max = 4 } = {}) {
  const filas = r.preguntas.flatMap(({ p, rows }) => rows.filter((x) => !x.pocos && x.indice != null).map((x) => ({ ...x, pregunta: p.name })));
  const mas = filas.filter((x) => x.indice >= 1.15).sort((a, b) => b.indice - a.indice).slice(0, Math.max(1, max - 1));
  const menos = filas.filter((x) => x.indice <= 0.85).sort((a, b) => a.indice - b.indice).slice(0, 1);
  const frase = (x) => `Las que responden «${x.respuesta}» a «${x.pregunta}» ${comparaMedia(x.indice)} (${x.compras} de ${x.leads} ${que}).`;
  return [...mas.map((x) => ({ tono: 'mas', texto: frase(x) })), ...menos.map((x) => ({ tono: 'menos', texto: frase(x) }))];
}
