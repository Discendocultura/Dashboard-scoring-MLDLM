// Días del carrito de un lanzamiento: de la apertura al cierre (Configuración → ① Datos básicos), cada uno con
// sus hitos automáticos (sacados de las fechas, la oferta y la barra de la página de venta) y la estrategia
// que se escriba a mano (`launch.carritoNotas`: { 'YYYY-MM-DD': texto }). Lo usan el navegador y el servidor.
import { madridToEpoch, formatTime, formatDate, milestones } from './page.js';
import { momentosCarrito, ventanaBonus, tipoBonus, objetivoBonus, textoGarantia } from './oferta.js';
import { dayInMadrid } from './scoring.js';
import { addDays } from './tareas.js';
import { videosDe } from './videos.js';

const MAX_DIAS = 31;
const dia = (ms) => dayInMadrid(new Date(ms).toISOString());
const hora = (ms) => formatTime(ms);

// Días de carrito (Configuración → ① Datos básicos): empiezan a contar el día siguiente al vídeo de venta (el
// webinar, o el último vídeo en los de varios vídeos). Venta el lunes + 4 días → del martes al viernes, y el
// carrito cierra el viernes a las 23:59.
export const MAX_DIAS_CARRITO = 30;
export const diasCarritoValido = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_DIAS_CARRITO) : null;
};
export const fechaVenta = (launch = {}) => videosDe(launch).at(-1)?.fecha || launch.fechaDirecto || '';
export function cierrePorDias(launch = {}) {
  const n = diasCarritoValido(launch.diasCarrito);
  const fv = fechaVenta(launch);
  return n && /^\d{4}-\d{2}-\d{2}$/.test(fv) ? `${addDays(fv, n)}T23:59` : '';
}
// Días entre dos fechas YYYY-MM-DD (b − a).
const entre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

// Notas a mano por día: solo días válidos y texto corto.
export function sanitizeCarritoNotas(n) {
  const out = {};
  for (const [k, v] of Object.entries(n && typeof n === 'object' ? n : {}).slice(0, 60)) {
    const t = String(v ?? '').trim().slice(0, 1500);
    if (/^\d{4}-\d{2}-\d{2}$/.test(k) && t) out[k] = t;
  }
  return out;
}

// Envíos de cada día del carrito: cuántos emails y mensajes al grupo de WhatsApp, y a qué hora cada uno.
// { 'YYYY-MM-DD': { emails: ['10:00', '19:00'], whatsapp: ['12:00'] } }
export const MAX_ENVIOS_DIA = 8;
export const CANALES_CARRITO = [
  { id: 'emails', label: 'Emails', icon: '✉️' },
  { id: 'whatsapp', label: 'Grupo de WhatsApp', icon: '💬' },
];
export function sanitizeCarritoEnvios(c) {
  const out = {};
  for (const [k, v] of Object.entries(c && typeof c === 'object' ? c : {}).slice(0, 60)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !v || typeof v !== 'object') continue;
    const dia = {};
    for (const { id } of CANALES_CARRITO) {
      const horas = (Array.isArray(v[id]) ? v[id] : []).slice(0, MAX_ENVIOS_DIA).map((h) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(h)) ? String(h) : ''));
      if (horas.length) dia[id] = horas;
    }
    if (Object.keys(dia).length) out[k] = dia;
  }
  return out;
}

// { faltan: [qué falta configurar], garantia, dias: [{ day, n, titulo, etiqueta, fecha, auto: [{ icon, texto }], nota }] }
export function diasCarrito(launch = {}) {
  const M = momentosCarrito(launch);
  const cierre = madridToEpoch(launch.cierreCarrito);
  const faltan = [];
  if (M.apertura == null) faltan.push('la apertura del carrito (o la fecha y hora del directo)');
  if (cierre == null) faltan.push('los días de carrito (o el cierre del carrito)');
  if (faltan.length || cierre <= M.apertura) {
    return { faltan: faltan.length ? faltan : ['un cierre del carrito posterior a la apertura'], garantia: textoGarantia(launch.oferta?.garantia), dias: [] };
  }
  const desde = dia(M.apertura);
  const hasta = dia(cierre);
  // Día 1 = el día siguiente al vídeo de venta (el día del directo es el «día 0», con la apertura).
  const fv = fechaVenta(launch);
  const dias = [];
  for (let d = desde, i = 0; d <= hasta && i < MAX_DIAS; d = addDays(d, 1), i++) {
    dias.push({ day: d, n: fv ? entre(fv, d) : i + 1, fecha: formatDate(madridToEpoch(`${d}T12:00`)), auto: [], nota: launch.carritoNotas?.[d] || '', envios: launch.carritoEnvios?.[d] || {} });
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
    x.titulo = x.n > 0 ? `Día ${x.n}` : x.n === 0 ? 'Día del directo' : 'Antes del directo';
    x.etiqueta = x.day === hasta ? 'Último día' : x.day === desde ? 'Apertura' : x.day === addDays(hasta, -1) ? 'Penúltimo día' : '';
  }
  return { faltan: [], garantia: textoGarantia(launch.oferta?.garantia), dias };
}
