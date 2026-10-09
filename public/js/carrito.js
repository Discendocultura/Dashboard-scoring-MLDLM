// Días del carrito de un lanzamiento: de la apertura al cierre (Configuración → Lanzamiento), cada uno con
// sus hitos automáticos (sacados de las fechas, la oferta y la barra de la página de venta) y la estrategia
// que se escriba a mano (`launch.carritoNotas`: { 'YYYY-MM-DD': texto }). Lo usan el navegador y el servidor.
import { madridToEpoch, formatTime, formatDate, milestones } from './page.js';
import { momentosCarrito, ventanaBonus, tipoBonus, objetivoBonus, textoGarantia } from './oferta.js';
import { dayInMadrid } from './scoring.js';
import { addDays } from './tareas.js';

const MAX_DIAS = 31;
const dia = (ms) => dayInMadrid(new Date(ms).toISOString());
const hora = (ms) => formatTime(ms);

// Notas a mano por día: solo días válidos y texto corto.
export function sanitizeCarritoNotas(n) {
  const out = {};
  for (const [k, v] of Object.entries(n && typeof n === 'object' ? n : {}).slice(0, 60)) {
    const t = String(v ?? '').trim().slice(0, 1500);
    if (/^\d{4}-\d{2}-\d{2}$/.test(k) && t) out[k] = t;
  }
  return out;
}

// { faltan: [qué falta configurar], garantia, dias: [{ day, n, etiqueta, fecha, auto: [{ icon, texto }], nota }] }
export function diasCarrito(launch = {}) {
  const M = momentosCarrito(launch);
  const cierre = madridToEpoch(launch.cierreCarrito);
  const faltan = [];
  if (M.apertura == null) faltan.push('la apertura del carrito (o la fecha y hora del directo)');
  if (cierre == null) faltan.push('el cierre del carrito');
  if (faltan.length || cierre <= M.apertura) {
    return { faltan: faltan.length ? faltan : ['un cierre del carrito posterior a la apertura'], garantia: textoGarantia(launch.oferta?.garantia), dias: [] };
  }
  const desde = dia(M.apertura);
  const hasta = dia(cierre);
  const dias = [];
  for (let d = desde, i = 0; d <= hasta && i < MAX_DIAS; d = addDays(d, 1), i++) {
    dias.push({ day: d, n: i + 1, fecha: formatDate(madridToEpoch(`${d}T12:00`)), auto: [], nota: launch.carritoNotas?.[d] || '' });
  }
  const en = (ms) => dias.find((x) => x.day === dia(ms));
  const add = (ms, icon, texto, orden = ms) => { const x = ms != null && en(ms); if (x) x.auto.push({ icon, texto, orden }); };

  add(M.apertura, '🛒', `Abre el carrito (${hora(M.apertura)})`);
  if (M.directo != null && M.directo !== M.apertura) add(M.directo, '🔴', `Directo de venta (${hora(M.directo)})`);
  const replay = milestones(launch).videos.at(-1)?.replay;
  if (replay != null && replay > M.apertura && replay < cierre) add(replay, '📼', `Grabación disponible (${hora(replay)})`);

  // Bonus: activos cada día y su último día (los que acaban antes del cierre).
  const bonus = (launch.oferta?.bonus || []).map((b) => ({ ...b, w: ventanaBonus(b, launch) }));
  for (const x of dias) {
    const activos = bonus.filter((b) => b.w.dias?.includes(x.day));
    if (activos.length) x.auto.push({ icon: '🎁', texto: `Bonus activos: ${activos.map((b) => b.nombre).join(', ')}`, orden: madridToEpoch(`${x.day}T00:00`) });
  }
  for (const b of bonus) {
    if (b.w.hasta == null || b.w.hasta >= cierre) continue;
    // Si acaba a las 00:00, su último día es el anterior (hasta las 23:59).
    const medianoche = hora(b.w.hasta) === '00:00';
    const t = tipoBonus(b.tipo);
    const obj = objetivoBonus(b);
    add(medianoche ? b.w.hasta - 60_000 : b.w.hasta, '⏳', `${b.w.desde != null && b.w.hasta - b.w.desde < 86_400_000 ? 'Acaba el' : 'Último día del'} ${t.largo || t.label}: ${b.nombre} (acaba a las ${medianoche ? '23:59' : hora(b.w.hasta)})${obj ? ` · ${obj}` : ''}`);
  }

  // Barra de la página de venta: qué mensaje empieza a verse cada día.
  if (launch.ventaBarra?.activa) {
    const tramos = (launch.ventaBarra.tramos || []).map((t) => ({ ...t, fin: madridToEpoch(t.hasta) })).filter((t) => t.fin != null).sort((a, b) => a.fin - b.fin);
    let inicio = M.apertura;
    for (const t of tramos) {
      if (t.fin > M.apertura) add(Math.max(inicio, M.apertura), '📣', `Barra de la página de venta: «${(t.texto || '⏳ Quedan {cuenta}').replace('{cuenta}', '⏱')}»${t.conBoton ? '' : ' (solo texto)'}`, Math.max(inicio, M.apertura) + 1);
      inicio = t.fin;
    }
  }

  add(cierre, '🔒', `Cierre del carrito (${hora(cierre)})`);
  for (const x of dias) {
    x.auto.sort((a, b) => a.orden - b.orden);
    x.etiqueta = x.n === 1 ? 'Apertura' : x.day === hasta ? 'Último día' : x.day === addDays(hasta, -1) ? 'Penúltimo día' : '';
  }
  return { faltan: [], garantia: textoGarantia(launch.oferta?.garantia), dias };
}
