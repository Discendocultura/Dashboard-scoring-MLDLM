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
const PROPIOS = ['name', 'createdAt', 'registroTag', 'zoomMeetingId', 'zoomJoinUrl', 'replayVideoUrl', 'whatsappUrl', 'sendflowId', 'snapshot', 'embudo', 'objetivos', 'inversion', 'resultados'];
// De los supuestos del Planificador, lo que es de cada edición (el resto, como el ROAS objetivo, se mantiene).
const PROPIOS_CALC = ['presupuesto', 'diasCaptacion'];
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
// Etiqueta de registro: nomenclatura FIJA de la agencia, «registrado-webinar-DDMMAA» con la fecha del directo
// (29/10/2026 → «registrado-webinar-291026»). Cambia en cada lanzamiento y es la que pone el workflow de registro.
export const ETIQUETA_REGISTRO_RE = /^registrado-webinar-\d{6}$/;
export function etiquetaRegistro(fechaDirecto) {
  const m = String(fechaDirecto || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `registrado-webinar-${m[3]}${m[2]}${m[1].slice(2)}` : '';
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
    if (base.calculadora) { base.calculadora = { ...base.calculadora }; for (const k of PROPIOS_CALC) delete base.calculadora[k]; }
    launch = moverFechas(base, m);
    // Filtros de Meta y de emails: con el código nuevo; si no llevaban el código del anterior, se quitan (si no, se
    // sumarían la inversión y los emails del anterior).
    for (const [k, que, ahora] of [['metaFiltro', 'El filtro de campañas de Meta', 'cuenta las campañas con el código nuevo en el nombre'], ['emailFiltro', 'El filtro de emails', 'cuenta los emails enviados en las fechas del nuevo']]) {
      const v = String(launch[k] || '');
      if (!v) continue;
      if (prevCode && v.includes(prevCode)) launch[k] = v.split(prevCode).join(code);
      else {
        launch[k] = '';
        avisos.push(`${que} del anterior era «${v}»: lo he quitado para no mezclar sus datos (ahora ${ahora}). Si tus nombres son de otra forma, cámbialo en Configuración.`);
      }
    }
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
  launch.registroTag = etiquetaRegistro(launch.fechaDirecto || fecha);
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

// Días de captación de un lanzamiento (del inicio de la captación al directo); sin datos, 14.
export function diasCaptacionDe(l) {
  const d = l && DIA_RE.test(l.inicioCaptacion || '') && DIA_RE.test(l.fechaDirecto || '') ? diasEntre(l.inicioCaptacion, l.fechaDirecto) : 0;
  return d >= 1 && d <= 365 ? d : 14;
}
// Fija la captación: empieza N días antes del directo y acaba el día del directo.
export function fijarCaptacion(launch, dias) {
  const n = Math.floor(Number(dias));
  if (!(n >= 1 && n <= 365) || !DIA_RE.test(launch.fechaDirecto || '')) return launch;
  launch.inicioCaptacion = sumarDias(launch.fechaDirecto, -n);
  launch.finCaptacion = launch.fechaDirecto;
  return launch;
}

// Precios y bonus del asistente: cambia los precios (y el de la oferta si era el mismo que el del programa) y
// quita los bonus que no se mantienen. precios: { vip, programa } (vacío = sin cambiar) · bonus: ids que se quedan
export function aplicarOferta(launch, { vip = '', programa = '', bonus = null } = {}) {
  const num = (v) => (v === '' || v == null || !(Number(v) >= 0) ? null : Number(v));
  const pv = num(vip);
  const pp = num(programa);
  if (pv != null) launch.precioVip = pv;
  if (pp != null) {
    if (launch.oferta && Number(launch.oferta.precio) === Number(launch.precioPrograma)) launch.oferta = { ...launch.oferta, precio: pp };
    launch.precioPrograma = pp;
  }
  if (Array.isArray(bonus) && Array.isArray(launch.oferta?.bonus)) {
    const quedan = new Set(bonus);
    launch.oferta = { ...launch.oferta, bonus: launch.oferta.bonus.filter((b, i) => quedan.has(b.id || `b${i}`)) };
  }
  return launch;
}

// Objetivos a partir de la facturación que se quiere (con las medias de los lanzamientos anteriores, escenario neutro):
//   meta: € · M: { cpl, convVip, convVenta, ticket } (valores) · precioVip: € por entrada VIP · diasCaptacion
// → { registros, vip, ventas, facturacion, inversion, inversionDia, cpl, roas, factLead } o null sin datos.
export function objetivosDesdeMeta(meta, M, { precioVip = 0, diasCaptacion = 0 } = {}) {
  const fact = Number(meta);
  if (!(fact > 0) || !M) return null;
  const convVenta = Number(M.convVenta) || 0;
  const ticket = Number(M.ticket) || 0;
  const convVip = Number(M.convVip) || 0;
  const factLead = convVip * (Number(precioVip) || 0) + convVenta * ticket;
  if (!(factLead > 0)) return null;
  const registros = Math.ceil(fact / factLead);
  const cpl = Number(M.cpl) || null;
  const inversion = cpl ? Math.round(registros * cpl) : null;
  return {
    registros, vip: Math.round(registros * convVip), ventas: Math.ceil(registros * convVenta), facturacion: Math.round(fact),
    inversion, inversionDia: inversion && diasCaptacion > 0 ? Math.round(inversion / diasCaptacion) : null,
    cpl, roas: inversion ? fact / inversion : null, factLead,
  };
}

// Tareas del anterior para el nuevo: las mismas (título, notas, fase, persona o rol…) con la fecha movida y sin
// hacer, sin comentarios ni historial. Las ids las pone el servidor.
export function copiarTareas(tareas = [], m) {
  return tareas.filter((t) => t && t.titulo).map((t) => ({
    titulo: t.titulo, notas: t.notas || '', fase: t.fase, sub: t.sub || '', fecha: t.fecha ? moverValor(t.fecha, m) : '',
    asignado: t.asignado || null, ...(t.clave ? { clave: t.clave } : {}), ...(t.columna ? { columna: t.columna } : {}), ...(t.habId ? { habId: t.habId, habitual: true } : {}),
  }));
}

// Enlaces que cambian del anterior al nuevo: [[viejo, nuevo]] (los campos de URL que no son iguales y el código del
// lanzamiento en los enlaces del dashboard: …?l=<viejo> → …?l=<nuevo>).
export function cambiosEnlaces(prev = {}, nuevo = {}, prevCode = '', code = '') {
  const out = [];
  for (const [k, v] of Object.entries(prev)) {
    if (!/(Url|JoinUrl)$/.test(k) || typeof v !== 'string' || !/^https?:\/\//.test(v)) continue;
    const n = nuevo[k];
    if (typeof n === 'string' && /^https?:\/\//.test(n) && n !== v) out.push([v, n]);
  }
  if (prevCode && code && prevCode !== code) out.push([`l=${prevCode}`, `l=${code}`]);
  return out;
}
const reemplazar = (txt, cambios) => cambios.reduce((t, [a, b]) => (a.startsWith('l=')
  ? t.replace(new RegExp(`([?&])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'g'), `$1${b}`)
  : t.split(a).join(b)), String(txt || ''));

// Fechas escritas en un texto («martes 20 de octubre», «20 de octubre de 2026», «20/10»), movidas los días del cambio,
// y la hora del directo si cambia («19:00» → «18:00»). anio: el del mensaje (para las fechas sin año).
const DIAS_SEM = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const quitarTilde = (w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const mayus = (w, como) => (como && como[0] === como[0].toUpperCase() && como[0] !== como[0].toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w);
const diaSemana = (iso) => DIAS_SEM[new Date(`${iso}T12:00:00Z`).getUTCDay()];
function isoDe(dia, mes, anio, ref) {
  let y = anio ? Number(String(anio).length === 2 ? `20${anio}` : anio) : Number(ref.slice(0, 4));
  if (!anio) { const mRef = Number(ref.slice(5, 7)); if (mes < mRef - 6) y += 1; else if (mes > mRef + 6) y -= 1; }
  const iso = `${y}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  return DIA_RE.test(iso) && !Number.isNaN(Date.parse(`${iso}T12:00:00Z`)) && new Date(`${iso}T12:00:00Z`).getUTCDate() === Number(dia) ? iso : null;
}
export function moverFechasTexto(texto, m, ref = '2026-01-01') {
  let n = 0;
  let t = String(texto || '');
  if (!m || (!m.dias && !m.minutos)) return { texto: t, n };
  if (m.dias) {
    const semRe = '(?:(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo),?\\s+)?';
    const largo = new RegExp(`${semRe}(\\d{1,2})\\s+de\\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\\s+(?:de\\s+|del\\s+)?(\\d{4}))?`, 'gi');
    t = t.replace(largo, (todo, sem, d, mes, anio) => {
      const mi = MESES_L.indexOf(quitarTilde(mes) === 'setiembre' ? 'septiembre' : quitarTilde(mes));
      const iso = isoDe(Number(d), mi + 1, anio, ref);
      if (!iso) return todo;
      const nuevo = sumarDias(iso, m.dias);
      n++;
      const [y, mm, dd] = nuevo.split('-');
      const mesTxt = mayus(MESES_L[Number(mm) - 1], mes);
      return `${sem ? `${mayus(diaSemana(nuevo), sem)} ` : ''}${Number(dd)} de ${mesTxt}${anio ? (todo.includes(' del ') ? ` del ${y}` : ` de ${y}`) : ''}`;
    });
    // «20/10»: solo si es una fecha cercana a la del mensaje (±90 días), para no tocar «2/3» u otras cifras.
    t = t.replace(/(?<![\w/.,])(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?![\w/])/g, (todo, d, mes, anio) => {
      const iso = isoDe(Number(d), Number(mes), anio, ref);
      if (!iso || Math.abs(diasEntre(ref, iso)) > 90) return todo;
      const [y, mm, dd] = sumarDias(iso, m.dias).split('-');
      n++;
      const pad = (v, como) => (como.length === 2 ? v : String(Number(v)));
      return `${pad(dd, d)}/${pad(mm, mes)}${anio ? `/${anio.length === 2 ? y.slice(2) : y}` : ''}`;
    });
  }
  if (m.minutos && Number.isFinite(m.horaAnt)) {
    const viejo = deMin(m.horaAnt);
    const nuevaMin = (m.horaAnt + m.minutos + 1440) % 1440;
    const re = new RegExp(`(?<!\\d)${viejo.replace(':', '[:.]')}(?!\\d)`, 'g');
    t = t.replace(re, () => { n++; return deMin(nuevaMin); });
  }
  return { texto: t, n };
}

// Mensajes del grupo de WhatsApp del anterior para el nuevo: en borrador, con la fecha movida, los enlaces cambiados
// y las fechas escritas en el texto movidas (fechasCambiadas: cuántas, para revisarlas).
export function copiarMensajes(mensajes = [], m, cambios = []) {
  return mensajes.filter((x) => x && x.estado !== 'cancelado').map((x) => {
    const { id, estado, error, actionId, programadoEn, ...resto } = x;
    const ref = String(x.at || '').slice(0, 10) || m?.diaAnt || '2026-01-01';
    const tx = moverFechasTexto(reemplazar(x.texto, cambios), m, ref);
    const gu = moverFechasTexto(x.guion, m, ref);
    const en = x.encuesta ? moverFechasTexto(x.encuesta.pregunta, m, ref) : null;
    return {
      ...resto, at: x.at ? moverValor(x.at, m) : '', texto: tx.texto, url: reemplazar(x.url, cambios), estado: 'borrador',
      ...(x.guion ? { guion: gu.texto } : {}), ...(en ? { encuesta: { ...x.encuesta, pregunta: en.texto } } : {}),
      fechasCambiadas: tx.n + gu.n + (en?.n || 0),
    };
  });
}

// Desplazamiento entre el anterior y el nuevo (lo mismo que usa nuevoLanzamiento), para tareas y mensajes.
export function desplazamiento(prev, fecha, hora) {
  if (!prev || !DIA_RE.test(prev.fechaDirecto || '') || !DIA_RE.test(fecha || '')) return null;
  return { dias: diasEntre(prev.fechaDirecto, fecha), diaAnt: prev.fechaDirecto, horaAnt: aMin(prev.horaDirecto || hora), minutos: prev.horaDirecto ? aMin(hora) - aMin(prev.horaDirecto) : 0 };
}

// Comprobaciones antes de crear: [{ nivel: 'error' | 'aviso', texto }]
//   · el directo ya ha pasado (error: hay que confirmarlo) · la captación empieza antes de hoy
//   · se solapa con otro lanzamiento del mismo embudo (de la captación al cierre del carrito)
export function comprobarFechas(launch, otros = [], hoy) {
  const out = [];
  const cierreDia = (l) => String(cierrePorDias(l) || l.cierreCarrito || '').slice(0, 10) || l.fechaDirecto;
  if (DIA_RE.test(launch.fechaDirecto || '') && launch.fechaDirecto < hoy) out.push({ nivel: 'error', texto: `El directo (${fechaBonita(launch.fechaDirecto)}) ya ha pasado.` });
  else if (DIA_RE.test(launch.inicioCaptacion || '') && launch.inicioCaptacion < hoy) out.push({ nivel: 'aviso', texto: `La captación empezaría el ${fechaBonita(launch.inicioCaptacion)}, que ya ha pasado: quedan ${diasEntre(hoy, launch.fechaDirecto)} días hasta el directo.` });
  const ini = launch.inicioCaptacion || launch.fechaDirecto;
  const fin = cierreDia(launch);
  for (const [nombre, l] of otros) {
    const a = l.inicioCaptacion || l.fechaDirecto;
    const b = cierreDia(l);
    if (!DIA_RE.test(a || '') || !DIA_RE.test(b || '') || !ini || !fin) continue;
    if (a <= fin && ini <= b) out.push({ nivel: 'aviso', texto: `Se solapa con «${nombre}» (${fechaBonita(a)} → ${fechaBonita(b)}): los dos captarían o venderían a la vez.` });
  }
  return out;
}

// Emails del anterior que hay que volver a programar en GHL (las campañas con fecha), con su fecha nueva.
//   emails: los de Métricas → Emails del anterior ([{ tipo: 'campana' | 'workflow', nombre, asunto, fecha }])
// → { campanas: [{ nombre, asunto, antes, despues }], workflows: nº de emails de workflows (se envían solos) }
export function emailsAReprogramar(emails = [], m) {
  const campanas = emails.filter((e) => e.tipo === 'campana' && DIA_RE.test(String(e.fecha || '').slice(0, 10)))
    .map((e) => { const antes = String(e.fecha).slice(0, 10); return { nombre: e.nombre, asunto: e.asunto || '', antes, despues: m ? sumarDias(antes, m.dias) : antes }; })
    .sort((a, b) => a.antes.localeCompare(b.antes));
  return { campanas, workflows: emails.filter((e) => e.tipo === 'workflow').length };
}
