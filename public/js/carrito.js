// Días del carrito de un lanzamiento: de la apertura al cierre (Configuración → Datos básicos), cada uno con
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

// Días de carrito (Configuración → Datos básicos): empiezan a contar el día siguiente al vídeo de venta (el
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
      // Una lista vacía también se guarda: «ninguno ese día» (sin el canal, el día usa lo de por defecto).
      if (!Array.isArray(v[id])) continue;
      dia[id] = v[id].slice(0, MAX_ENVIOS_DIA).map((h) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(h)) ? String(h) : '')).filter(Boolean);
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
    const tramos = tramosBarraVenta(launch).map((t) => ({ ...t, fin: madridToEpoch(t.hasta) })).filter((t) => t.fin != null).sort((a, b) => a.fin - b.fin);
    let inicio = M.apertura;
    let previo = null;
    for (const t of tramos) {
      // El mismo texto dos veces el mismo día (p. ej. el día de un bonus, por días) solo se apunta una vez.
      const clave = `${dia(Math.max(inicio, M.apertura))}|${t.texto}`;
      if (t.fin > M.apertura && clave !== previo) add(Math.max(inicio, M.apertura), '📣', `Barra de la página de venta: «${(t.texto || '⏳ Quedan {cuenta}').replace('{cuenta}', '⏱')}»${t.conBoton ? '' : ' (solo texto)'}`, Math.max(inicio, M.apertura) + 1);
      if (t.fin > M.apertura) previo = clave;
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

// ---------- Barra de la página de venta «por días» (Configuración → Venta → Página de venta) ----------
// Un mensaje por cada día del carrito. Por defecto sale de lo que pasa ese día (la apertura, el último día de un
// bonus, el penúltimo y el último día) y en Configuración → Carrito se puede cambiar el de cualquier día
// (`ventaBarra.dias`). El día de un bonus que acaba, la barra cuenta hasta su fin y después, hasta el cierre.
const localFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const aLocal = (ms) => localFmt.format(new Date(ms)).replace(' ', 'T');
const DIA_MS = 86_400_000;
const listaBonus = (nombres) => {
  const n = nombres.map((x) => `«${x}»`);
  return n.length > 1 ? `los bonus ${n.slice(0, -1).join(', ')} y ${n.at(-1)}` : `el bonus ${n[0]}`;
};

// [{ day, partes: [{ desde, hasta, cuenta (ms), defecto }], defecto, texto, aMano }] — uno por día del carrito.
export function barraVentaDias(launch = {}) {
  const M = momentosCarrito(launch);
  const cierre = madridToEpoch(launch.cierreCarrito);
  if (M.apertura == null || cierre == null || cierre <= M.apertura) return [];
  const desde = dia(M.apertura);
  const hasta = dia(cierre);
  const bonus = (launch.oferta?.bonus || []).map((b) => ({ nombre: b.nombre, ...ventanaBonus(b, launch) }))
    .filter((b) => b.hasta != null && b.hasta < cierre && b.hasta > M.apertura);
  const aMano = launch.ventaBarra?.dias || {};
  const out = [];
  for (let d = desde, i = 0; d <= hasta && i < MAX_DIAS; d = addDays(d, 1), i++) {
    const ini = Math.max(madridToEpoch(`${d}T00:00`), M.apertura);
    const fin = d === hasta ? cierre : madridToEpoch(`${addDays(d, 1)}T00:00`);
    const general = d === hasta ? '⏳ Último día para entrar · Las puertas se cierran en {cuenta}'
      : d === addDays(hasta, -1) ? '⚠️ Solo quedan 2 días · Las puertas se cierran en {cuenta}'
      : d === desde ? '🔓 Las puertas ya están abiertas · Se cierran en {cuenta}'
      : '🔓 Las puertas están abiertas · Se cierran en {cuenta}';
    // Bonus que acaban este día (los que acaban a las 00:00 son del día anterior), agrupados por su fin.
    const fines = new Map();
    for (const b of bonus) if (b.hasta > ini && b.hasta <= fin) fines.set(b.hasta, [...(fines.get(b.hasta) || []), b]);
    const partes = [];
    let previo = ini;
    for (const h of [...fines.keys()].sort((a, b) => a - b)) {
      const bs = fines.get(h);
      const largo = bs.some((b) => b.desde != null && h - b.desde > DIA_MS);
      partes.push({ desde: previo, hasta: h, cuenta: h, defecto: `🎁 ${largo ? 'Último día para llevarte' : 'Llévate'} ${listaBonus(bs.map((b) => b.nombre))} · Acaba en {cuenta}` });
      previo = h;
    }
    if (fin > previo) partes.push({ desde: previo, hasta: fin, cuenta: cierre, defecto: general });
    const defecto = partes[0]?.defecto || general;
    out.push({ day: d, partes, defecto, texto: aMano[d] || defecto, aMano: Boolean(aMano[d]) });
  }
  return out;
}

// Los tramos de la barra (formato de `sanitizeVentaBarra`): los de a mano o, «por días», los de cada día
// (el texto cambiado a mano de un día vale para todo ese día).
export function tramosBarraVenta(launch = {}) {
  const vb = launch.ventaBarra || {};
  if (!vb.porDias) return vb.tramos || [];
  const b = vb.botonDias || {};
  return barraVentaDias(launch).flatMap((d) => d.partes.map((p) => ({
    texto: d.aMano ? d.texto : p.defecto, hasta: aLocal(p.hasta), cuenta: aLocal(p.cuenta),
    conBoton: b.conBoton !== false, destino: b.destino || 'pagina-pago', boton: b.boton || '',
  })));
}
