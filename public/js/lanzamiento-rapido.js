// Nuevo lanzamiento rápido («＋ Nuevo lanzamiento»): con el nombre y el día y la hora del directo, deja hecho casi todo.
//   · Si el embudo ya tiene un lanzamiento: lo copia entero (oferta, bonus, precios, textos, barras, recursos, envíos
//     del carrito…) y MUEVE todas sus fechas los mismos días que se mueve el directo, así se mantienen los intervalos
//     (captación, clases, apertura y cierre del carrito, grabación, tramos de las barras, notas del carrito…).
//     Lo que es propio de cada edición se vacía: Zoom, grupo de WhatsApp y campaña de SendFlow, vídeo de la grabación,
//     «foto» de etiquetas y la etiqueta de registro (sale del código nuevo).
//   · Si es el primero: plantilla estándar a partir del directo (ver plantillaEstandar).
// Lo usan el navegador (vista previa y crear) y los tests.
import { nVideos, formatoValido, esReto } from './videos.js';
import { diasCarritoValido, cierrePorDias } from './carrito.js';

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
const DT_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

export function sumarDias(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const aMin = (h) => { const [x, y] = String(h || '00:00').split(':').map(Number); return x * 60 + y; };
const deMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// Mueve una fecha (AAAA-MM-DD) o fecha-hora (AAAA-MM-DDTHH:MM) los días del cambio. Las horas del mismo día del
// directo que eran a partir de su hora (apertura del carrito, grabación…) se mueven también el cambio de hora.
export function moverValor(v, m) {
  if (typeof v !== 'string') return v;
  if (DIA_RE.test(v)) return sumarDias(v, m.dias);
  const x = v.match(DT_RE);
  if (!x) return v;
  let dia = sumarDias(x[1], m.dias);
  let min = Number(x[2]) * 60 + Number(x[3]);
  if (m.minutos && x[1] === m.diaAnt && min >= m.horaAnt) {
    min += m.minutos;
    if (min >= 1440) { dia = sumarDias(dia, 1); min -= 1440; }
    if (min < 0) { dia = sumarDias(dia, -1); min += 1440; }
  }
  return `${dia}T${deMin(min)}`;
}
// Recorre todo el objeto (también las claves con fecha, como las notas y los envíos de cada día del carrito).
export function moverFechas(obj, m) {
  if (Array.isArray(obj)) return obj.map((x) => moverFechas(x, m));
  if (obj && typeof obj === 'object') return Object.fromEntries(Object.entries(obj).map(([k, v]) => [DIA_RE.test(k) ? sumarDias(k, m.dias) : k, moverFechas(v, m)]));
  return moverValor(obj, m);
}

// Lo propio de cada edición, que no se copia del lanzamiento anterior.
const PROPIOS = ['name', 'createdAt', 'registroTag', 'zoomMeetingId', 'zoomJoinUrl', 'replayVideoUrl', 'whatsappUrl', 'sendflowId', 'snapshot', 'embudo'];
const PROPIOS_VIDEO = ['zoomMeetingId', 'zoomJoinUrl', 'replayVideoUrl'];

// Código del lanzamiento: nombre del embudo + mes y año del directo (p. ej. «camino-nov26»), sin chocar con otros.
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function codigoPropuesto(base, fecha, usados = []) {
  const raiz = String(base || 'lanz').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\b(webinar|lanzamiento|lanzamientos|de|del|la|el|los|las)\b/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 14).replace(/-+$/, '') || 'lanz';
  const suf = DIA_RE.test(fecha) ? `${MESES[Number(fecha.slice(5, 7)) - 1]}${fecha.slice(2, 4)}` : '';
  const cod = suf ? `${raiz}-${suf}` : raiz;
  const set = new Set(usados);
  if (!set.has(cod)) return cod;
  for (let n = 2; n < 50; n++) if (!set.has(`${cod}-${n}`)) return `${cod}-${n}`;
  return `${cod}-${Date.now().toString(36).slice(-4)}`;
}

// Etiqueta de registro: la del anterior con su código cambiado por el nuevo (registro-camino-oct26 →
// registro-camino-nov26); si no lo llevaba, «registro-<código>».
export function etiquetaRegistro(prevTag, prevCode, code) {
  const t = String(prevTag || '');
  if (t && prevCode && t.includes(prevCode)) return t.split(prevCode).join(code);
  return `registro-${code}`;
}

// Plantilla estándar (primer lanzamiento del embudo), a partir del día y la hora del primer vídeo:
//   captación desde 14 días antes · clases de la preclase cada 2 días a las 10:00 (la última, 3 días antes)
//   · vídeos seguidos (reto: cada día; PLF: cada 3 días; 2-3 vídeos: cada 2 días) · carrito: abre 1 h 30 min
//   después del vídeo de venta y dura 5 días · grabación al día siguiente de cada vídeo a las 10:00.
export function plantillaEstandar({ fecha, hora = '19:00', formato = 'webinar', nClases = 2, preclase = true }) {
  const f = formatoValido(formato);
  const n = nVideos(f);
  const paso = esReto(f) ? 1 : f === 'plf' ? 3 : n > 1 ? 2 : 0;
  const fechas = Array.from({ length: n }, (_, i) => sumarDias(fecha, i * paso));
  const venta = fechas.at(-1);
  const out = {
    fechaDirecto: fecha, horaDirecto: hora,
    inicioCaptacion: sumarDias(fecha, -14), finCaptacion: fecha,
    replayAt: `${sumarDias(fecha, 1)}T10:00`,
    diasCarrito: 5,
  };
  const ap = Math.min(aMin(hora) + 90, 23 * 60 + 30);
  out.aperturaCarrito = `${venta}T${deMin(ap)}`;
  if (preclase) {
    const k = [1, 2, 3].includes(Number(nClases)) ? Number(nClases) : 2;
    for (let i = 1; i <= k; i++) out[`clase${i}At`] = `${sumarDias(fecha, -3 - 2 * (k - i))}T10:00`;
  }
  if (n > 1) out.videos = fechas.slice(1).map((d) => ({ fecha: d, hora, replayAt: `${sumarDias(d, 1)}T10:00` }));
  return out;
}

// El lanzamiento nuevo (sin guardar): { launch, origen: 'copia' | 'plantilla', dias, avisos }
//   prev: el lanzamiento del que copiar (o null) y prevCode su código · embudo: { id, formato, clases, preclase, vip }
//   base: sin lanzamiento anterior, la base de la plantilla de agencia del embudo (oferta, precios, textos…)
//   diasCarrito: los días que está abierto el carrito tras el vídeo de venta (fija el cierre); sin él, los del anterior o 5
export function nuevoLanzamiento({ code, nombre, fecha, hora, prev = null, prevCode = '', base = null, embudo = {}, diasCarrito = null }) {
  if (!DIA_RE.test(fecha || '')) throw new Error('Pon el día del directo');
  if (!/^\d{2}:\d{2}$/.test(hora || '')) throw new Error('Pon la hora del directo');
  const avisos = [];
  let launch;
  let origen;
  if (prev && DIA_RE.test(prev.fechaDirecto || '')) {
    origen = 'copia';
    const m = { dias: diasEntre(prev.fechaDirecto, fecha), diaAnt: prev.fechaDirecto, horaAnt: aMin(prev.horaDirecto || hora), minutos: prev.horaDirecto ? aMin(hora) - aMin(prev.horaDirecto) : 0 };
    const base = structuredClone(prev);
    for (const k of PROPIOS) delete base[k];
    if (Array.isArray(base.videos)) base.videos = base.videos.map((v) => { const x = { ...v }; for (const k of PROPIOS_VIDEO) delete x[k]; return x; });
    launch = moverFechas(base, m);
    // Los vídeos 2.º y siguientes conservan su hora; el 1.º es el directo que se pide.
    launch.fechaDirecto = fecha;
    launch.horaDirecto = hora;
    if (launch.oferta?.bonus?.length) avisos.push('Revisa las fechas de los bonus: se han movido igual que el directo.');
  } else {
    origen = 'plantilla';
    launch = { ...(base ? structuredClone(base) : {}), ...plantillaEstandar({ fecha, hora, formato: embudo.formato, nClases: embudo.clases, preclase: embudo.preclase !== false }) };
    avisos.push(base
      ? 'Primer lanzamiento del embudo: la oferta, los precios y los textos vienen de su plantilla de agencia; las fechas son de plantilla estándar (revísalas).'
      : 'Es el primer lanzamiento de este embudo: fechas de plantilla estándar (revísalas) y faltan las etiquetas de VIP y compra, la oferta y los precios.');
  }
  const dc = diasCarritoValido(diasCarrito);
  if (dc) {
    launch.diasCarrito = dc;
    launch.cierreCarrito = cierrePorDias(launch) || launch.cierreCarrito;
  }
  launch.name = String(nombre || '').trim() || code;
  launch.registroTag = etiquetaRegistro(prev?.registroTag, prevCode, code);
  if (embudo.id) launch.embudo = embudo.id;
  return { launch, origen, dias: prev?.fechaDirecto ? diasEntre(prev.fechaDirecto, fecha) : null, avisos };
}

// Días de carrito de un lanzamiento (para proponerlos en el nuevo): los suyos, o los que salen de su cierre; si no, 5.
export function diasCarritoDe(l) {
  if (!l) return 5;
  const n = diasCarritoValido(l.diasCarrito);
  if (n) return n;
  const venta = l.videos?.at(-1)?.fecha || l.fechaDirecto;
  const cierre = String(l.cierreCarrito || '').slice(0, 10);
  const d = DIA_RE.test(venta || '') && DIA_RE.test(cierre) ? diasEntre(venta, cierre) : 0;
  return diasCarritoValido(d) || 5;
}

// Fecha legible: «lun 24 nov» o «lun 24 nov · 18:00».
export function fechaBonita(v) {
  const x = String(v || '').match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?$/);
  if (!x) return '—';
  const d = new Date(`${x[1]}T12:00:00Z`).toLocaleDateString('es-ES', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '').replace(',', '');
  return x[2] ? `${d} · ${x[2]}` : d;
}

// Lo que se enseña antes de crear: [[etiqueta, valor]] con las fechas clave.
export function resumenFechas(l) {
  const cierre = cierrePorDias(l) || l.cierreCarrito;
  return [
    ['Captación', `${fechaBonita(l.inicioCaptacion)} → ${fechaBonita(l.finCaptacion)}`],
    ...[1, 2, 3].filter((k) => l[`clase${k}At`]).map((k) => [`Clase ${k}`, fechaBonita(l[`clase${k}At`])]),
    [l.videos?.length ? 'Vídeo 1' : 'Directo', fechaBonita(`${l.fechaDirecto}T${l.horaDirecto}`)],
    ...(l.videos || []).map((v, i) => [`Vídeo ${i + 2}`, fechaBonita(v.hora ? `${v.fecha}T${v.hora}` : v.fecha)]),
    ['Abre el carrito', fechaBonita(l.aperturaCarrito)],
    ['Cierra el carrito', fechaBonita(cierre)],
    ...(l.replayAt ? [['Grabación disponible', fechaBonita(l.replayAt)]] : []),
  ];
}
