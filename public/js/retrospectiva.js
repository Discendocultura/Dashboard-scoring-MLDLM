// Retrospectiva de un lanzamiento al cerrar el carrito: cómo fue frente al anterior del mismo embudo
// (captación, asistencia, VIP, conversión, facturación, ROAS) y qué aprendizajes deja, cada uno con una
// tarea propuesta para el siguiente lanzamiento. También usa el análisis de los bonus (oferta.js).
// `m`, `mPrev`: computeMetrics(); `bonus`: analizarOferta(...).bonus (opcional).
const rel = (a, b) => (b ? a / b - 1 : null);
const pct = (x) => `${Math.round(Math.abs(x) * 100)} %`;
const tasa = (n, d) => (d ? n / d : null);

export function retrospectiva(m, mPrev, { nombrePrev = '', bonus = [] } = {}) {
  const asist = (x) => (x.videos?.length > 1 ? x.videos.at(-1).vieron : x.live + (x.soloReplay || 0));
  const filas = [
    { id: 'registros', label: 'Registros', actual: m.total, anterior: mPrev?.total, mejorSiSube: true, tipo: 'n' },
    { id: 'cpl', label: 'Coste por registro', actual: m.eco?.cpl, anterior: mPrev?.eco?.cpl, mejorSiSube: false, tipo: 'eur' },
    { id: 'asistencia', label: 'Vieron el directo o la grabación', actual: tasa(asist(m), m.total), anterior: mPrev ? tasa(asist(mPrev), mPrev.total) : null, mejorSiSube: true, tipo: 'pct' },
    ...(m.conVip ? [{ id: 'vip', label: 'Compran la entrada VIP', actual: tasa(m.vip, m.total), anterior: mPrev ? tasa(mPrev.vip, mPrev.total) : null, mejorSiSube: true, tipo: 'pct' }] : []),
    { id: 'conversion', label: 'Conversión a venta', actual: tasa(m.compra, m.total), anterior: mPrev ? tasa(mPrev.compra, mPrev.total) : null, mejorSiSube: true, tipo: 'pct' },
    { id: 'ventas', label: 'Ventas', actual: m.compra, anterior: mPrev?.compra, mejorSiSube: true, tipo: 'n' },
    { id: 'facturacion', label: 'Facturación', actual: m.eco?.facturacion, anterior: mPrev?.eco?.facturacion, mejorSiSube: true, tipo: 'eur' },
    { id: 'roas', label: 'ROAS', actual: m.eco?.roas, anterior: mPrev?.eco?.roas, mejorSiSube: true, tipo: 'x' },
  ].map((f) => {
    const d = f.actual != null && f.anterior != null ? rel(f.actual, f.anterior) : null;
    const tono = d == null || Math.abs(d) < 0.1 ? 'igual' : (d > 0) === f.mejorSiSube ? 'mejor' : 'peor';
    return { ...f, cambio: d, tono };
  });
  const por = Object.fromEntries(filas.map((f) => [f.id, f]));
  const aprendizajes = [];
  const add = (id, tono, texto, tarea) => aprendizajes.push({ id, tono, texto, tarea });
  const peor = (id, umbral = 0.15) => por[id]?.cambio != null && por[id].tono === 'peor' && Math.abs(por[id].cambio) >= umbral;
  const mejor = (id, umbral = 0.15) => por[id]?.cambio != null && por[id].tono === 'mejor' && Math.abs(por[id].cambio) >= umbral;
  const frente = nombrePrev ? ` frente a «${nombrePrev}»` : '';
  if (peor('registros')) add('registros', 'peor', `Los registros bajaron un ${pct(por.registros.cambio)}${frente}.`, { titulo: 'Captación: probar ganchos y anuncios nuevos (los registros bajaron)', fase: 'captacion', notas: 'Revisa en Análisis → Avatar y anuncios qué creativos funcionaron en otros lanzamientos y reutilízalos.' });
  if (peor('cpl', 0.2)) add('cpl', 'peor', `El coste por registro subió un ${pct(por.cpl.cambio)}${frente}.`, { titulo: 'Anuncios: refrescar creativos (el coste por registro subió)', fase: 'captacion', notas: 'Apaga pronto los anuncios caros y duplica los ganadores de Análisis → Anuncios de todos los lanzamientos.' });
  if (peor('asistencia')) add('asistencia', 'peor', `Vio el directo o la grabación un ${pct(por.asistencia.cambio)} menos de gente${frente}.`, { titulo: 'Directo: reforzar recordatorios (email y WhatsApp 24 h, 1 h y 10 min antes)', fase: 'directo', notas: 'La asistencia bajó: recordatorios más insistentes y un motivo para venir en directo (bonus en directo).' });
  if (peor('vip')) add('vip', 'peor', `Compraron la entrada VIP un ${pct(por.vip.cambio)} menos${frente}.`, { titulo: 'Entrada VIP: revisar la oferta y su página de venta', fase: 'preparacion', notas: '' });
  if (peor('conversion')) add('conversion', 'peor', `La conversión a venta bajó un ${pct(por.conversion.cambio)}${frente}.`, { titulo: 'Carrito: revisar la oferta, los bonus y la secuencia de cierre (la conversión bajó)', fase: 'carrito', notas: '' });
  for (const id of ['registros', 'asistencia', 'conversion', 'roas']) if (mejor(id)) add(id, 'mejor', `${por[id].label}: mejor que el anterior (+${pct(por[id].cambio)}). Mantén lo que cambiaste.`, null);
  for (const b of bonus) {
    if (b.sinDatos || b.tipo === 'bonus') continue;
    if (b.efecto != null && b.efecto >= 1.5) add(`bonus-${b.id}`, 'mejor', `El bonus «${b.nombre}» funcionó: mientras estuvo activo se vendió ${b.efecto.toFixed(1).replace('.', ',')}× más al día.`, { titulo: `Oferta: repetir el bonus «${b.nombre}» (funcionó)`, fase: 'preparacion', notas: '' });
    else if (b.efecto != null && b.efecto < 1.1) add(`bonus-${b.id}`, 'peor', `El bonus «${b.nombre}» no movió las ventas mientras estuvo activo.`, { titulo: `Oferta: cambiar el bonus «${b.nombre}» o anunciarlo más (no movió ventas)`, fase: 'preparacion', notas: '' });
  }
  return { filas, aprendizajes, conAnterior: Boolean(mPrev) };
}
