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

export function signalsFor(contactTags, launch, vipTag) {
  const tags = new Set((contactTags || []).map((t) => String(t).toLowerCase()));
  const s = {};
  for (const sig of SIGNALS) s[sig] = tags.has(tagFor(launch, sig));
  s.vip = Boolean(vipTag) && tags.has(vipTag.toLowerCase());
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
  cierre: 'Venta / llamada',
  raices: 'Oferta Raíces',
  grabacion: 'Ver grabación',
};

export function nextStepFor(s) {
  const replay = watched(s, 'replay');
  if (s.directo_final || replay >= 90) return 'cierre';
  if (replay >= 50) return 'raices';
  return 'grabacion';
}

export const DEFAULT_TEMPLATES = {
  grabacion: 'Hola {nombre} 🌱 Soy del equipo de Me lo dijo la matrona. Ya tienes disponible la grabación de la clase en directo, te dejo aquí el enlace: {link_grabacion} ¿Me cuentas qué te parece cuando la veas?',
  raices: 'Hola {nombre} 🌱 He visto que ya has empezado a ver la grabación, ¡qué bien! Te dejo aquí toda la información de Raíces, el programa de acompañamiento para quedarte embarazada de forma natural: {link_raices} ¿Tienes alguna duda que pueda resolverte?',
  cierre: 'Hola {nombre} 🌱 ¡Gracias por quedarte hasta el final! Si sientes que Raíces es para ti, puedes unirte aquí: {link_venta} O si prefieres que lo hablemos, reserva una llamada conmigo: {link_llamada}',
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
    link_llamada: launch?.llamadaUrl || '',
  };
  return String(template || '')
    .replaceAll('{nombre}', nombre || '')
    .replace(/\{(link_[a-z]+)\}/g, (m, k) => (k in links ? links[k] : m))
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
