// Lógica compartida entre el dashboard (navegador) y la API (servidor):
// nombres de etiquetas, puntuación, estado y siguiente paso de cada lead.

// Señales que se guardan como etiquetas en GHL con el formato `<lanzamiento>_<señal>`,
// p. ej. `nov26_clase1_50`. Así cada lanzamiento tiene su propio historial.
export const SIGNALS = [
  'clase1_25', 'clase1_50', 'clase1_75', 'clase1_90',
  'clase2_25', 'clase2_50', 'clase2_75', 'clase2_90',
  'replay_25', 'replay_50', 'replay_75', 'replay_90',
  'directo_click', 'directo_asistio', 'directo_60', 'directo_final',
  'wa_enviado',
  // "Foto" al crear el lanzamiento: quién tenía ya la etiqueta VIP / de compra (de lanzamientos
  // anteriores). Esas personas no cuentan como VIP / compra de este lanzamiento.
  'vip_previo', 'compra_previo', 'llamada_previo',
  // Resultado del contacto de la setter (solo uno a la vez).
  'res_respondio', 'res_interesada', 'res_llamada', 'res_no_interesada', 'res_no_contesta',
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
];

export const VIDEOS = ['clase1', 'clase2', 'replay'];
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
// medianoche (UTC o España según el caso): sumando 12 h siempre caemos en el día correcto.
export function dayOfDateField(value) {
  if (value == null || value === '') return '';
  const n = typeof value === 'number' || /^\d{10,}$/.test(String(value)) ? Number(value) : Date.parse(value);
  if (Number.isNaN(n)) return /^\d{4}-\d{2}-\d{2}/.test(String(value)) ? String(value).slice(0, 10) : '';
  return new Date(n + 12 * 3600_000).toISOString().slice(0, 10);
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
  s.vip = has(cfg.vipTag) && !s.vip_previo;
  s.vip_anterior = has(cfg.vipTag) && s.vip_previo;
  s.encuesta = has(cfg.encuestaTag);
  // Llamada agendada: la etiqueta fija (sin contar a quien ya la tenía al crear el lanzamiento)
  // o el resultado «Llamada agendada» que marca la setter.
  s.llamada = (has(cfg.llamadaTag) && !s.llamada_previo) || s.res_llamada;

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
  s.compra_directo = s.compra && Boolean(cfg.fechaDirecto) && buyDay === cfg.fechaDirecto;

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

export function score(s) {
  const P = POINTS;
  let pts = 0;
  pts += P.clase[watched(s, 'clase1')] || 0;
  pts += P.clase[watched(s, 'clase2')] || 0;
  if (s.vip) pts += P.vip;
  // Directo y grabación son dos formas de ver lo mismo: cuenta la mejor de las dos.
  const live = (s.directo_asistio ? P.directoAsistio : 0)
    + (s.directo_60 ? P.directo60 : 0)
    + (s.directo_final ? P.directoFinal : 0);
  const replay = P.replay[watched(s, 'replay')] || 0;
  pts += Math.max(live, replay);
  if (s.directo_click && !s.directo_asistio) pts += P.directoClick;
  return Math.min(pts, 100);
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

export function nextStepFor(s) {
  if (s.compra) return 'comprado';
  const replay = watched(s, 'replay');
  if (s.directo_final || replay >= 90) return 'cierre';
  if (replay >= 50) return 'raices';
  return 'grabacion';
}

export const DEFAULT_TEMPLATES = {
  grabacion: 'Hola {nombre} 🌱 Soy del equipo de Me lo dijo la matrona. Ya tienes disponible la grabación de la clase en directo, te dejo aquí el enlace: {link_grabacion} ¿Me cuentas qué te parece cuando la veas?',
  raices: 'Hola {nombre} 🌱 He visto que ya has empezado a ver la grabación, ¡qué bien! Te dejo aquí toda la información de Raíces, el programa de acompañamiento para quedarte embarazada de forma natural: {link_pagina_venta} ¿Tienes alguna duda que pueda resolverte?',
  cierre: 'Hola {nombre} 🌱 ¡Gracias por quedarte hasta el final! Si sientes que Raíces es para ti, puedes unirte aquí: {link_pago} O si prefieres que lo hablemos, reserva una llamada conmigo: {link_llamada}',
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

export function buildMessage(template, { nombre, contactId, launch }) {
  const links = {
    link_grabacion: withContactId(launch?.replayUrl, contactId),
    link_raices: withContactId(launch?.raicesUrl, contactId),
    link_venta: withContactId(launch?.ventaUrl, contactId),
    // Nombres claros: página de venta de Raíces y enlace de pago (los antiguos siguen funcionando).
    link_pagina_venta: withContactId(launch?.raicesUrl, contactId),
    link_pago: withContactId(launch?.ventaUrl, contactId),
    link_pago_fraccionado: withContactId(launch?.ventaFraccionadoUrl, contactId),
    link_llamada: launch?.llamadaUrl || '',
  };
  return String(template || '')
    .replaceAll('{nombre}', nombre || '')
    .replace(/\{(link_[a-z_]+)\}/g, (m, k) => (k in links ? links[k] : m))
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
