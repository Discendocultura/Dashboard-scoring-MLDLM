// Lógica compartida entre el dashboard (navegador) y la API (servidor):
// nombres de etiquetas, puntuación, estado y siguiente paso de cada lead.
import { conFraccionado, esSuscripcion, planDeTags, planesActivos, enlacePago } from './pago.js';
import { MAX_VIDEOS, nVideos, sigDirecto, sigReplay, videosDe, videoVenta, clasesDe, conVip } from './videos.js';
import { madridToEpoch } from './page.js';
import { tieneRecurso, recursosDe, nivelMusica } from './recursos.js';

// Señales que se guardan como etiquetas en GHL con el formato `<lanzamiento>_<señal>`,
// p. ej. `nov26_clase1_50`. Así cada lanzamiento tiene su propio historial.
export const SIGNALS = [
  'clase1_25', 'clase1_50', 'clase1_75', 'clase1_90',
  'clase2_25', 'clase2_50', 'clase2_75', 'clase2_90',
  'clase3_25', 'clase3_50', 'clase3_75', 'clase3_90', // prelanzamientos de 3 clases
  'replay_25', 'replay_50', 'replay_75', 'replay_90',
  'directo_click', 'directo_asistio', 'directo_60', 'directo_final',
  // Lanzamientos de 2, 3 o 4 vídeos (PLF): las mismas señales de cada vídeo con su número.
  ...Array.from({ length: MAX_VIDEOS - 1 }, (_, i) => i + 2).flatMap((k) => [
    `directo${k}_click`, `directo${k}_asistio`, `directo${k}_60`, `directo${k}_final`,
    `replay${k}_25`, `replay${k}_50`, `replay${k}_75`, `replay${k}_90`,
  ]),
  'wa_enviado',
  // "Foto" al crear el lanzamiento: quién tenía ya la etiqueta VIP / de compra (de lanzamientos
  // anteriores). Esas personas no cuentan como VIP / compra de este lanzamiento.
  'vip_previo', 'compra_previo', 'llamada_previo', 'encuesta_previo',
  // Resultado del contacto de la setter (solo uno a la vez).
  'res_respondio', 'res_interesada', 'res_llamada', 'res_no_interesada', 'res_no_contesta',
  // Segmento de «casi compradoras» (muy calientes, calientes o VIP que no compraron) para el downsell
  // o el siguiente lanzamiento.
  'casi_compra',
  // Recursos de la preclase (recursos.js): la música (la reprodujo, la escuchó al 50 % y al 90 %),
  // la votación (votó) y el descargable (lo abrió). El test se sabe por su propia etiqueta de GHL.
  'musica_play', 'musica_50', 'musica_90', 'voto', 'descarga',
];

export const OUTCOMES = [
  { id: 'respondio', label: 'Respondió' },
  { id: 'interesada', label: 'Interesada' },
  { id: 'llamada', label: 'Llamada agendada' },
  { id: 'no_contesta', label: 'No contesta' },
  { id: 'no_interesada', label: 'No interesada' },
];

// Etiquetas fijas (no cambian entre lanzamientos) que se "fotografían" al crear el lanzamiento.
export const SNAPSHOT_TAGS = [
  { field: 'vipTag', signal: 'vip_previo', label: 'VIP' },
  { field: 'compraTag', signal: 'compra_previo', label: 'compra' },
  { field: 'llamadaTag', signal: 'llamada_previo', label: 'llamada' },
  // La encuesta puede ser siempre la misma (misma URL y etiqueta): solo hace falta su foto si la etiqueta
  // ya la usaba un lanzamiento anterior (`encuestaCompartida`, la calcula la configuración).
  { field: 'encuestaTag', signal: 'encuesta_previo', label: 'encuesta' },
];
// Fotos que faltan por hacer en un lanzamiento.
export const fotosPendientes = (launch) => SNAPSHOT_TAGS.filter((f) => launch?.[f.field]
  && (f.field !== 'encuestaTag' || launch.encuestaCompartida)
  && launch.snapshot?.tags?.[f.field] !== launch[f.field]);

export const VIDEOS = ['clase1', 'clase2', 'clase3', ...Array.from({ length: MAX_VIDEOS }, (_, i) => sigReplay(i + 1))];
export const THRESHOLDS = [25, 50, 75, 90];

// Mayor porcentaje visto de un vídeo (0, 25, 50, 75 o 90).
export function watched(s, video) {
  for (let i = THRESHOLDS.length - 1; i >= 0; i--) if (s[`${video}_${THRESHOLDS[i]}`]) return THRESHOLDS[i];
  return 0;
}

export const LAUNCH_CODE_RE = /^[a-z0-9-]{2,24}$/;

export function tagFor(launch, signal) {
  return `${launch}_${signal}`;
}

export function isValidSignalTag(tag) {
  // La señal puede contener '_' (clase1_50), así que buscamos un prefijo válido.
  return SIGNALS.some((s) => tag.endsWith(`_${s}`) && LAUNCH_CODE_RE.test(tag.slice(0, -(s.length + 1))));
}

// Detecta los códigos de lanzamiento que ya existen a partir de las etiquetas de GHL.
export function launchCodesFromTags(tags) {
  const codes = new Set();
  for (const tag of tags) {
    for (const s of SIGNALS) {
      if (tag.endsWith(`_${s}`)) {
        const code = tag.slice(0, -(s.length + 1));
        if (LAUNCH_CODE_RE.test(code)) codes.add(code);
      }
    }
  }
  return [...codes].sort();
}

// Día (AAAA-MM-DD) de un campo de fecha de GHL. Los campos de solo fecha se guardan como
// medianoche (UTC o España, que en UTC son las 22:00/23:00 del día anterior): sumando 12 h caemos en
// el día correcto. Si el campo trae hora de verdad (p. ej. {{right_now}}), se usa el día en España.
// Acepta texto ISO y marcas de tiempo en milisegundos o en segundos.
export function dayOfDateField(value) {
  if (value == null || value === '') return '';
  const t = normalizar(String(value).trim());
  if (LOCAL_SIN_ZONA.test(t)) return t.slice(0, 10); // ya es hora de España
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const n = instante(value, t);
  if (n == null) return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : '';
  const d = new Date(n);
  const medianoche = esMedianoche(d);
  return medianoche ? new Date(n + 12 * 3600_000).toISOString().slice(0, 10) : madridDay.format(d);
}

// Instante exacto (epoch ms) de un campo de fecha de GHL, solo si guarda la hora de verdad (p. ej. un
// campo de texto rellenado con {{right_now}}). Los campos de solo fecha (medianoche) devuelven null.
// Fecha y hora sin zona («2026-11-27 18:32» o «2026-11-27T18:32:05»): hora de España.
// También «27/11/2026 18:32» (día/mes/año, como lo escribe GHL en español).
const LOCAL_SIN_ZONA = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const DMY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const normalizar = (t) => {
  const x = DMY.exec(t);
  return x ? `${x[3]}-${x[2].padStart(2, '0')}-${x[1].padStart(2, '0')} ${x[4].padStart(2, '0')}:${x[5]}${x[6] ? `:${x[6]}` : ''}` : t;
};
const localMadrid = (t) => {
  const x = LOCAL_SIN_ZONA.exec(t);
  return x ? madridToEpoch(`${x[1]}T${x[2]}`) + Number(x[3] || 0) * 1000 + Number((x[4] || '0').padEnd(3, '0')) : null;
};
// Instante (epoch ms) de un valor: número o texto de 9-10 cifras = segundos, de 12-13 = milisegundos,
// o texto de fecha. Fuera de 2000-2100 (p. ej. un campo de texto que no es una fecha, «338») → null.
const MIN_MS = Date.UTC(2000, 0, 1);
const MAX_MS = Date.UTC(2100, 0, 1);
function instante(value, t) {
  let n;
  if (typeof value === 'number' || /^\d+$/.test(t)) {
    const x = Number(t);
    n = t.length <= 10 ? x * 1000 : x;
  } else n = Date.parse(t);
  return Number.isFinite(n) && n >= MIN_MS && n < MAX_MS ? n : null;
}
// Medianoche de un campo de solo fecha: 00:00:00 en UTC o en hora de España (no cualquier hora en punto).
const horaMadridFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
function esMedianoche(d) {
  if (d.getUTCMilliseconds() !== 0) return false;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) return true;
  return horaMadridFmt.format(d) === '00:00:00';
}
export function momentoDeCampo(value) {
  if (value == null || value === '') return null;
  const t = normalizar(String(value).trim());
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  if (LOCAL_SIN_ZONA.test(t)) return localMadrid(t);
  const n = instante(value, t);
  if (n == null) return null;
  const d = new Date(n);
  const medianoche = esMedianoche(d);
  return medianoche ? null : n;
}

// Día (AAAA-MM-DD) en hora de España de un instante (p. ej. la fecha de alta del contacto).
const madridDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' });
export function dayInMadrid(iso) {
  const n = Date.parse(iso);
  return Number.isNaN(n) ? '' : madridDay.format(new Date(n));
}

// `cfg` es la configuración del lanzamiento: { vipTag, compraTag, compraDateField, inicioCaptacion,
// finVentas, fechaDirecto }. `contact` aporta { dateAdded, cf } (cf = campos personalizados por id).
export function signalsFor(contactTags, launch, cfg = {}, contact = {}) {
  const tags = new Set((contactTags || []).map((t) => String(t).toLowerCase()));
  const has = (t) => Boolean(t) && tags.has(String(t).toLowerCase());
  const s = {};
  for (const sig of SIGNALS) s[sig] = tags.has(tagFor(launch, sig));
  s.vip = conVip(cfg) !== false && has(cfg.vipTag) && !s.vip_previo; // sin entrada VIP en el embudo no puntúa
  s.vip_anterior = has(cfg.vipTag) && s.vip_previo;
  // Encuesta de este lanzamiento; quien la rellenó en uno anterior (misma etiqueta) no cuenta aquí.
  s.encuesta = has(cfg.encuestaTag) && !s.encuesta_previo;
  s.encuesta_anterior = has(cfg.encuestaTag) && s.encuesta_previo;
  // Llamada agendada: la etiqueta fija (sin contar a quien ya la tenía al crear el lanzamiento)
  // o el resultado «Llamada agendada» que marca la setter.
  s.llamada = (has(cfg.llamadaTag) && !s.llamada_previo) || s.res_llamada;
  // Recursos de la preclase que tiene este lanzamiento (para la puntuación) y el test hecho (su etiqueta).
  s.recursos = { musica: tieneRecurso(cfg, 'musica'), test: tieneRecurso(cfg, 'test'), votacion: tieneRecurso(cfg, 'votacion'), descargable: tieneRecurso(cfg, 'descargable') };
  s.test = s.recursos.test && has(recursosDe(cfg).test.tag);

  // Compra: si hay "fecha de compra", manda la fecha (dentro del lanzamiento = de este lanzamiento);
  // si no, la foto de clientas anteriores.
  const buyDay = dayOfDateField(contact.cf?.[cfg.compraDateField]);
  const inicio = cfg.inicioCaptacion || '';
  s.compra = false;
  s.clienta_anterior = false;
  if (has(cfg.compraTag)) {
    if (buyDay && inicio) {
      s.compra = buyDay >= inicio && (!cfg.finVentas || buyDay < cfg.finVentas);
      s.clienta_anterior = buyDay < inicio;
    } else {
      s.compra = !s.compra_previo;
      s.clienta_anterior = s.compra_previo;
    }
  }
  s.fecha_compra = s.compra ? buyDay : '';
  // Tipo de pago de Raíces: cada uno con su etiqueta (si llevara las dos, cuenta como fraccionado).
  s.fraccionado = s.compra && conFraccionado(cfg) && has(cfg.fraccionadoTag);
  s.unico = s.compra && !esSuscripcion(cfg) && !s.fraccionado && has(cfg.unicoTag);
  // Suscripción: el plan que eligió (mensual, trimestral…), por la etiqueta de cada plan.
  s.plan = s.compra ? planDeTags(tags, cfg) : '';
  // Compra el día del vídeo de venta (el webinar en directo, o el último vídeo del lanzamiento).
  const diaVenta = videoVenta(cfg)?.fecha || '';
  s.compra_directo = s.compra && Boolean(diaVenta) && buyDay === diaVenta;
  s.nVideos = nVideos(cfg);
  s.clases = clasesDe(cfg); // clases del prelanzamiento de este embudo
  s.conVip = conVip(cfg);

  // Origen del lead: publicidad u orgánico, cada uno con su etiqueta (si lleva las dos, cuenta como publicidad).
  s.origen = has(cfg.publiTag) ? 'publi' : has(cfg.organicoTag) ? 'organico' : '';

  // Tráfico: templado si ya estaba en GHL (algún embudo anterior) antes de abrir la captación.
  const alta = dayInMadrid(contact.dateAdded);
  s.trafico = alta && inicio ? (alta < inicio ? 'templado' : 'frio') : '';
  return s;
}

// Puntuación (0-100). Ajusta aquí los pesos si quieres cambiar el criterio.
export const POINTS = {
  clase: { 25: 4, 50: 8, 75: 12, 90: 15 },   // por cada clase pre-webinar
  vip: 30,
  directoClick: 5,                  // pulsó el enlace al directo (sin asistencia confirmada)
  directoAsistio: 15, directo60: 10, directoFinal: 15,
  replay: { 25: 10, 50: 20, 75: 30, 90: 40 },
};

export const ESTADOS = [
  { id: 'muy-caliente', label: 'Muy caliente', min: 70 },
  { id: 'caliente', label: 'Caliente', min: 40 },
  { id: 'templado', label: 'Templado', min: 15 },
  { id: 'frio', label: 'Frío', min: 0 },
];

// Lo visto de un vídeo del lanzamiento (0-40): el directo o la grabación, lo mejor de los dos.
export function puntosVideo(s, k) {
  const P = POINTS;
  const d = sigDirecto(k);
  const live = (s[`${d}_asistio`] ? P.directoAsistio : 0) + (s[`${d}_60`] ? P.directo60 : 0) + (s[`${d}_final`] ? P.directoFinal : 0);
  const replay = P.replay[watched(s, sigReplay(k))] || 0;
  return Math.max(live, replay) + (s[`${d}_click`] && !s[`${d}_asistio`] ? P.directoClick : 0);
}

// Pesos de serie de cada bloque sobre 100 (pesos.js los ajusta con las ventas). La música, el test y la
// votación solo cuentan si el lanzamiento los tiene; si no, la puntuación se escala a 100 sin ellos.
export const PESOS_SERIE = { clases: 20, musica: 5, test: 10, votacion: 5, vip: 25, video: 35 };
// Lanzamientos sin música, test ni votación: el reparto de siempre (clases 30, VIP 30, vídeo 40).
export const PESOS_CLASICOS = { clases: 30, musica: 0, test: 0, votacion: 0, vip: 30, video: 40 };
export const pesosEfectivos = (aprendidos, recursos = {}) => aprendidos || (recursos.musica || recursos.test || recursos.votacion ? PESOS_SERIE : PESOS_CLASICOS);
export function score(s, aprendidos = null) {
  const pesos = pesosEfectivos(aprendidos, s.recursos);
  const P = POINTS;
  let pts = 0;
  // Clases del prelanzamiento: 30 puntos repartidos entre las que haya (15 cada una con 2 clases).
  const clases = s.clases || ['clase1', 'clase2'];
  let ptsClases = 0;
  for (const c of clases) ptsClases += ((P.clase[watched(s, c)] || 0) * 2) / clases.length;
  pts += (ptsClases * pesos.clases) / 30;
  if (s.vip) pts += pesos.vip;
  const R = s.recursos || {};
  if (R.musica) pts += nivelMusica(s) * pesos.musica;
  if (R.test && s.test) pts += pesos.test;
  if (R.votacion && s.voto) pts += pesos.votacion;
  // Vídeos del lanzamiento: con uno (webinar), lo visto de él. Con varios, la mitad por el mejor
  // y la mitad por la media (premia ver todos, sin hundir a quien solo ha podido ver uno).
  const n = s.nVideos || 1;
  const por = Array.from({ length: n }, (_, i) => Math.min(puntosVideo(s, i + 1), P.directoAsistio + P.directo60 + P.directoFinal));
  const media = por.reduce((a, b) => a + b, 0) / n;
  const ptsVideo = n === 1 ? puntosVideo(s, 1) : Math.round((Math.max(...por) + media) / 2);
  pts += (ptsVideo * pesos.video) / 40;
  // Sin entrada VIP, sin área preclase o sin ninguna de las dos: se lleva a 100 para que los estados
  // (caliente…) valgan igual.
  const max = (clases.length ? pesos.clases : 0) + (s.conVip === false ? 0 : pesos.vip) + pesos.video
    + (R.musica ? pesos.musica : 0) + (R.test ? pesos.test : 0) + (R.votacion ? pesos.votacion : 0);
  if (max !== 100) pts = (pts * 100) / max;
  // Inició el pago (llegó a la página de pago con «Quiero inscribirme») y no ha comprado: es lo más cerca de
  // comprar que hay. Suma 15 y como mínimo queda «muy caliente».
  if (s.inicio_pago && !s.compra) pts = Math.max(pts + 15, ESTADOS[0].min);
  return Math.min(Math.round(pts), 100);
}

export function estadoFor(points) {
  return ESTADOS.find((e) => points >= e.min);
}

// Qué mensaje de WhatsApp toca:
//  - cierre:    llegó al final (directo hasta el final o grabación ≥90%) → venta o llamada
//  - raices:    vio al menos el 50% de la grabación → oferta de Raíces
//  - grabacion: todavía no ha visto la grabación → enviarle a la grabación
export const NEXT_STEPS = {
  comprado: 'Ya compró',
  cierre: 'Venta / llamada',
  raices: 'Oferta Raíces',
  grabacion: 'Ver grabación',
};

// Se mira el vídeo de venta (el webinar, o el último vídeo del lanzamiento).
export function nextStepFor(s) {
  if (s.compra) return 'comprado';
  const k = s.nVideos || 1;
  const replay = watched(s, sigReplay(k));
  if (s[`${sigDirecto(k)}_final`] || replay >= 90) return 'cierre';
  if (replay >= 50) return 'raices';
  return 'grabacion';
}

// Mensajes de serie para un cliente nuevo: sin nada de MLDLM. {producto} = el nombre de su producto.
export const NEUTRAL_TEMPLATES = {
  grabacion: 'Hola {nombre} 👋 Ya tienes disponible la grabación de la clase en directo, te dejo aquí el enlace: {link_grabacion} ¿Me cuentas qué te parece cuando la veas?',
  raices: 'Hola {nombre} 👋 He visto que ya has empezado a ver la grabación, ¡qué bien! Aquí tienes toda la información de {producto}: {link_pagina_venta} ¿Tienes alguna duda que pueda resolverte?',
  cierre: 'Hola {nombre} 👋 ¡Gracias por quedarte hasta el final! Si sientes que {producto} es para ti, puedes unirte aquí: {link_pago} O si prefieres que lo hablemos, reserva una llamada conmigo: {link_llamada}',
  vsl_novio: 'Hola {nombre} 👋 Vi que te registraste para ver el vídeo y aún no has podido verlo. Te lo dejo aquí: {link_vsl} ¿Me cuentas qué te parece?',
  vsl_vio: 'Hola {nombre} 👋 He visto que ya has empezado a ver el vídeo, ¡qué bien! Aquí tienes toda la información de {producto}: {link_pagina_venta} ¿Tienes alguna duda que pueda resolverte?',
  vsl_final: 'Hola {nombre} 👋 ¡Gracias por ver el vídeo hasta el final! Si sientes que {producto} es para ti, puedes unirte aquí: {link_pago} O si prefieres que lo hablemos, reserva una llamada: {link_llamada}',
  ll_proxima: 'Hola {nombre} 👋 Te escribo para recordarte nuestra llamada el {dia_llamada} a las {hora_llamada}. ¡Hasta entonces!',
  ll_pendiente_pago: 'Hola {nombre} 👋 ¡Qué ilusión que vayas a empezar {producto}! Te dejo el enlace para completar tu inscripción: {link_pago} Si prefieres pagarlo a plazos: {link_pago_fraccionado} Cualquier duda, me dices.',
  ll_seguimiento: 'Hola {nombre} 👋 ¿Has podido pensarlo? Si te quedó alguna duda sobre {producto} estoy aquí para resolverla. Te dejo el enlace por si decides dar el paso: {link_pago}',
  ll_venta: 'Hola {nombre} 👋 ¡Bienvenida a {producto}! 🎉 En breve te llegará un email con tu acceso. Aquí me tienes para lo que necesites.',
  ll_perdido: 'Hola {nombre} 👋 Gracias por tu tiempo en la llamada. Entiendo que ahora no es el momento; si en algún momento quieres retomarlo, aquí me tienes.',
  ll_noshow: 'Hola {nombre} 👋 Te estaba esperando para nuestra llamada y no hemos podido conectar. ¿La reprogramamos? Puedes elegir otro hueco aquí: {link_llamada}',
  ll_reagendar: 'Hola {nombre} 👋 Sin problema, cambiamos la llamada. Elige el hueco que mejor te venga aquí: {link_llamada}',
  ll_cancelada: 'Hola {nombre} 👋 He visto que has cancelado la llamada. Si quieres, puedes reservar otro momento aquí: {link_llamada}',
};

export const DEFAULT_TEMPLATES = {
  grabacion: 'Hola {nombre} 🌱 Soy del equipo de Me lo dijo la matrona. Ya tienes disponible la grabación de la clase en directo, te dejo aquí el enlace: {link_grabacion} ¿Me cuentas qué te parece cuando la veas?',
  raices: 'Hola {nombre} 🌱 He visto que ya has empezado a ver la grabación, ¡qué bien! Te dejo aquí toda la información de Raíces, el programa de acompañamiento para quedarte embarazada de forma natural: {link_pagina_venta} ¿Tienes alguna duda que pueda resolverte?',
  cierre: 'Hola {nombre} 🌱 ¡Gracias por quedarte hasta el final! Si sientes que Raíces es para ti, puedes unirte aquí: {link_pago} O si prefieres que lo hablemos, reserva una llamada conmigo: {link_llamada}',
  // Embudo VSL: según lo que ha visto del vídeo.
  vsl_novio: 'Hola {nombre} 🌱 Soy del equipo de Me lo dijo la matrona. Vi que te registraste para ver el vídeo sobre cómo quedarte embarazada de forma natural y aún no has podido verlo. Te lo dejo aquí: {link_vsl} ¿Me cuentas qué te parece?',
  vsl_vio: 'Hola {nombre} 🌱 He visto que ya has empezado a ver el vídeo, ¡qué bien! Aquí tienes toda la información de Raíces: {link_pagina_venta} ¿Tienes alguna duda que pueda resolverte?',
  vsl_final: 'Hola {nombre} 🌱 ¡Gracias por ver el vídeo hasta el final! Si sientes que Raíces es para ti, puedes unirte aquí: {link_pago} O si prefieres que lo hablemos, reserva una llamada de valoración: {link_llamada}',
  // Llamadas de valoración: un mensaje por fase.
  ll_proxima: 'Hola {nombre} 🌱 Soy del equipo de Me lo dijo la matrona. Te escribo para recordarte nuestra llamada de valoración el {dia_llamada} a las {hora_llamada}. Si puedes, conéctate con tu pareja 💛 ¡Hasta entonces!',
  ll_pendiente_pago: 'Hola {nombre} 🌱 ¡Qué ilusión que vayas a empezar Raíces! Te dejo el enlace para completar tu inscripción: {link_pago} Si prefieres pagarlo a plazos, aquí tienes la opción fraccionada: {link_pago_fraccionado} Cualquier duda, me dices 💛',
  ll_seguimiento: 'Hola {nombre} 🌱 ¿Has podido pensarlo (o hablarlo con tu pareja)? Si te quedó alguna duda sobre Raíces estoy aquí para resolverla. Te dejo el enlace por si decides dar el paso: {link_pago}',
  ll_venta: 'Hola {nombre} 🌱 ¡Bienvenida a Raíces! 🎉 Ya está todo listo: en breve te llegará un email con tu acceso. Aquí me tienes para lo que necesites 💛',
  ll_perdido: 'Hola {nombre} 🌱 Gracias por tu tiempo en la llamada. Entiendo que ahora no es el momento; si en algún momento quieres retomarlo, aquí me tienes 💛',
  ll_noshow: 'Hola {nombre} 🌱 Te estaba esperando para nuestra llamada de valoración y no hemos podido conectar. ¿La reprogramamos? Puedes elegir otro hueco aquí: {link_llamada}',
  ll_reagendar: 'Hola {nombre} 🌱 Sin problema, cambiamos la llamada. Elige el hueco que mejor te venga aquí: {link_llamada} 💛',
  ll_cancelada: 'Hola {nombre} 🌱 He visto que has cancelado la llamada de valoración. Si quieres, puedes reservar otro momento aquí: {link_llamada} 💛',
};

export function withContactId(url, contactId) {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (contactId) u.searchParams.set('cid', contactId);
    return u.toString();
  } catch {
    return url;
  }
}

// Página del último vídeo ya publicado (con un solo vídeo, la de la grabación de siempre).
export function grabacionActual(launch, hoy = new Date().toISOString().slice(0, 10)) {
  const vs = videosDe(launch).filter((v) => v.replayUrl);
  if (!vs.length) return launch?.replayUrl || '';
  return (vs.filter((v) => !v.fecha || v.fecha <= hoy).at(-1) || vs[0]).replayUrl;
}

export function buildMessage(template, { nombre, contactId, launch, extra = {}, producto = '' }) {
  const links = {
    link_grabacion: withContactId(grabacionActual(launch), contactId),
    link_raices: withContactId(launch?.raicesUrl, contactId),
    link_venta: withContactId(launch?.ventaUrl, contactId),
    // Nombres claros: página de venta de Raíces y enlace de pago (los antiguos siguen funcionando).
    link_pagina_venta: withContactId(launch?.raicesUrl, contactId),
    link_pago: withContactId(enlacePago(launch, launch?.ventaUrl), contactId),
    // Suscripción: un enlace por plan ({link_plan_mensual}, {link_plan_anual}…).
    ...Object.fromEntries(planesActivos(launch).map((p) => [`link_plan_${p.id}`, withContactId(p.url, contactId)])),
    link_pago_fraccionado: withContactId(launch?.ventaFraccionadoUrl, contactId),
    link_llamada: launch?.llamadaUrl || '',
    link_vsl: withContactId(launch?.vslUrl, contactId), // embudo VSL
  };
  return String(template || '')
    .replaceAll('{nombre}', nombre || '')
    .replaceAll('{producto}', producto || 'el programa')
    .replace(/\{(link_[a-z_]+)\}/g, (m, k) => (k in links ? links[k] : m))
    .replace(/\{([a-z_]+)\}/g, (m, k) => (k in extra ? extra[k] : m))
    .replace(/ {2,}/g, ' ')
    .trim();
}

// Normaliza teléfonos para wa.me (solo dígitos, con prefijo internacional).
export function waPhone(phone, defaultCountryCode = '34') {
  if (!phone) return '';
  let p = String(phone).trim();
  if (p.startsWith('00')) p = p.slice(2);
  const digits = p.replace(/\D/g, '');
  if (!digits) return '';
  if (p.startsWith('+')) return digits;
  if (digits.length === 9) return defaultCountryCode + digits;
  return digits;
}
