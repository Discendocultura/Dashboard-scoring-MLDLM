// Emails con IA (Plan → Emails): la secuencia de emails del lanzamiento para escribirla con Claude.
//   · calendarioEmails(): los envíos propuestos, sacados de las fechas del lanzamiento (registro, clases de la preclase,
//     directo, grabación, cada día del carrito con sus horas de Plan → Carrito, bonus que caducan y cierre).
//   · asuntosGanadores(): los asuntos que más abrieron y más clics tuvieron en lanzamientos anteriores (GHL).
//   · promptEmails(): el prompt, con la ficha de marca, la narrativa, los datos, los enlaces, las etiquetas para
//     segmentar y el formato exacto de cada email (para programarlo luego en GHL).
import { videosDe, nVideos } from './videos.js';
import { desbloqueosPreclase } from './calentamiento.js';
import { diasCarrito } from './carrito.js';

export const FASES_EMAIL = [
  { id: 'registro', label: 'Bienvenida al registrarse', desc: 'Confirmación, qué va a pasar y siguientes pasos (grupo de WhatsApp, preclase).' },
  { id: 'preclase', label: 'Clases y recursos de la preclase', desc: 'Un email cuando se desbloquea cada clase o recurso.' },
  { id: 'vip', label: 'Entrada VIP', desc: 'Upsell de la entrada VIP antes del directo.' },
  { id: 'directo', label: 'Recordatorios del directo', desc: 'La víspera, por la mañana, 1 hora antes y «estamos en directo».' },
  { id: 'replay', label: 'Grabación', desc: 'Grabación disponible y aviso de que caduca.' },
  { id: 'carrito', label: 'Carrito abierto', desc: 'Apertura, un ángulo por día (testimonios, objeciones, bonus, FAQ…), últimas horas y cierre.' },
  { id: 'cierre', label: 'Después del cierre', desc: 'Gracias / lista de espera para quien no compró.' },
];
export const FASES_DEFECTO = FASES_EMAIL.filter((f) => f.id !== 'cierre').map((f) => f.id);

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
const sumar = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const horaMenos = (h, min) => { const [a, b] = String(h || '19:00').split(':').map(Number); const t = Math.max(0, a * 60 + b - min); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

// [{ at: 'AAAA-MM-DDTHH:MM' | '', fase, que, segmento? }] ordenados (lo «inmediato» va primero, sin fecha).
export function calendarioEmails(l = {}, fases = FASES_DEFECTO) {
  const on = new Set(fases);
  const out = [];
  // Dos emails a la misma hora no: el segundo se retrasa 2 horas.
  const masDos = (at) => { const [d, h] = at.split('T'); const [a, b] = h.split(':').map(Number); return `${d}T${String(Math.min(23, a + 2)).padStart(2, '0')}:${String(b).padStart(2, '0')}`; };
  const add = (at, fase, que, segmento = '') => {
    if (!on.has(fase)) return;
    let t = at;
    while (t && out.some((x) => x.at === t) && !t.endsWith('23:00')) t = masDos(t);
    out.push({ at: t, fase, que, segmento });
  };
  add('', 'registro', 'Bienvenida: confirmación del registro, cuándo es el directo, qué ganará y los siguientes pasos', 'al registrarse (automático por etiqueta de registro)');
  for (const x of desbloqueosPreclase(l)) add(x.at, 'preclase', `Ya disponible: ${x.nombre}${x.extra.length ? ` (${x.extra.join('; ')})` : ''}`);
  const vids = videosDe(l).filter((v) => DIA_RE.test(v.fecha || ''));
  const primero = vids[0];
  if (Number(l.precioVip) > 0 && primero) {
    add('', 'vip', 'Oferta de la entrada VIP (en la página de gracias o justo después de registrarse)', 'al registrarse, a quien no tiene la VIP');
    add(`${sumar(primero.fecha, -2)}T12:00`, 'vip', 'Recordatorio de la entrada VIP: qué incluye y por qué ahora', 'registrados sin VIP');
  }
  const multi = nVideos(l) > 1;
  for (const v of vids) {
    const h = v.hora || l.horaDirecto || '19:00';
    const nom = multi ? v.nombre : 'el directo';
    const deNom = multi ? `de ${v.nombre}` : 'del directo';
    add(`${sumar(v.fecha, -1)}T19:00`, 'directo', `Mañana es ${nom}: hora, qué verán y por qué no perdérselo`);
    add(`${v.fecha}T09:00`, 'directo', `Hoy es ${nom} a las ${h}: enlace de acceso`);
    add(`${v.fecha}T${horaMenos(h, 60)}`, 'directo', `Empezamos en 1 hora: enlace de acceso`);
    add(`${v.fecha}T${h}`, 'directo', `¡Estamos en directo! Entra ya`, 'quien no ha entrado aún (si se puede segmentar)');
    const rep = v.replayAt || `${sumar(v.fecha, 1)}T10:00`;
    add(rep, 'replay', `Grabación ${deNom} disponible${v.venta ? ' (y el carrito abierto)' : ''}`, 'sobre todo quien no asistió');
  }
  const C = diasCarrito(l);
  C.dias.forEach((d, i) => {
    const ultimo = i === C.dias.length - 1;
    const horas = d.envios?.emails?.length ? d.envios.emails : ultimo ? ['09:00', '18:00', '22:00'] : i === 0 ? [] : ['10:00', '19:00'];
    const hitos = d.auto.filter((a) => a.icon === '⏳').map((a) => a.texto);
    if (i === 0) add(l.aperturaCarrito || `${d.day}T21:00`, 'carrito', 'Apertura del carrito: la oferta completa, los bonus y el enlace de compra', 'registrados que no han comprado');
    horas.forEach((h, j) => add(`${d.day}T${h}`, 'carrito', ultimo
      ? ['Último día: qué se pierden y resumen de la oferta', 'Quedan pocas horas: objeción principal + testimonio', 'Últimas horas: cierre a las 23:59'][j] || 'Último día del carrito'
      : `Carrito día ${d.n}: un ángulo distinto (testimonio, objeción, FAQ, historia, bonus…)${hitos.length && j === 0 ? ` · hoy: ${hitos.join(' · ')}` : ''}`, 'registrados que no han comprado'));
  });
  if (C.dias.length) add(`${sumar(C.dias.at(-1).day, 1)}T10:00`, 'cierre', 'Gracias por acompañarnos / lista de espera para la próxima edición', 'quien no compró');
  return out.sort((a, b) => (a.at || '0').localeCompare(b.at || '0'));
}

// Asuntos ganadores de lanzamientos anteriores: los 5 con más apertura y los 5 con más clics (con 100 entregados o más).
export function asuntosGanadores(emails = []) {
  const ok = emails.filter((e) => (e.asunto || e.nombre) && Number(e.entregados) >= 100);
  if (!ok.length) return '';
  const pct = (x) => (x == null ? '–' : `${(x * 100).toFixed(1).replace('.', ',')} %`);
  const top = (k) => [...ok].filter((e) => e[k] != null).sort((a, b) => b[k] - a[k]).slice(0, 5);
  const linea = (e) => `- «${e.asunto || e.nombre}» · apertura ${pct(e.apertura)} · clics ${pct(e.ctr)}`;
  const ap = top('apertura');
  const cl = top('ctr');
  return [ap.length ? `Los que MÁS SE ABRIERON:\n${ap.map(linea).join('\n')}` : '', cl.length ? `Los que MÁS CLICS tuvieron:\n${cl.map(linea).join('\n')}` : ''].filter(Boolean).join('\n\n');
}

const fechaTxt = (at) => {
  if (!at) return 'inmediato';
  const [d, h] = at.split('T');
  return `${new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '').replace(',', '')} ${h}`;
};

// ctx: { launch, code, marca, producto, datos: ['- …'], contexto (ficha), narrativa (bloque), ganadores, notas, fases,
//        enlaces: { nombre: url }, directoUrl, remitente }
export function promptEmails(ctx = {}) {
  const l = ctx.launch || {};
  const fases = ctx.fases || FASES_DEFECTO;
  const plan = calendarioEmails(l, fases);
  const tags = [
    l.registroTag && `- Registrados: etiqueta «${l.registroTag}»`,
    l.vipTag && `- Compraron la VIP: «${l.vipTag}»`,
    l.compraTag && `- Compraron el programa: «${l.compraTag}» (EXCLUIR de todos los emails de venta)`,
  ].filter(Boolean);
  const enlaces = Object.entries(ctx.enlaces || {}).filter(([, u]) => u).map(([k, u]) => `- ${k}: ${u}`);
  return [
    `Usa tu skill de copy de venta (emails de lanzamiento) para escribir la SECUENCIA DE EMAILS del lanzamiento «${l.name || ctx.code || ''}»${ctx.producto ? ` de ${ctx.producto}` : ''}${ctx.marca ? ` (${ctx.marca})` : ''}.`,
    '',
    'DATOS DEL LANZAMIENTO:',
    ...(ctx.datos || []),
    ctx.directoUrl ? `- Enlace de acceso al directo (personal: pide el email con el que se registraron): ${ctx.directoUrl}` : null,
    enlaces.length ? `\nENLACES (usa SIEMPRE estos, tal cual; nunca otros):\n${enlaces.join('\n')}` : null,
    tags.length ? `\nETIQUETAS DE GHL PARA SEGMENTAR:\n${tags.join('\n')}` : null,
    ctx.contexto ? `\nMARCA, AVATAR Y PRODUCTO (la fuente de verdad: su tono, sus palabras, dolores, deseos y objeciones):\n<marca>\n${ctx.contexto}\n</marca>` : '\nMARCA Y AVATAR: aún no hay ficha; pregunta lo imprescindible antes de inventar.',
    ctx.narrativa ? `\n${ctx.narrativa}` : null,
    ctx.ganadores ? `\nASUNTOS QUE MEJOR HAN FUNCIONADO EN LANZAMIENTOS ANTERIORES (inspírate en su estilo, sin copiarlos):\n${ctx.ganadores}` : null,
    ctx.notas ? `\nINDICACIONES:\n${ctx.notas}` : null,
    '',
    'CALENDARIO DE ENVÍOS (propuesto por el dashboard con las fechas reales; hora de España). Respeta fechas y horas; si ves que falta o sobra alguno, dímelo antes de escribir:',
    ...plan.map((p, i) => `${i + 1}. ${fechaTxt(p.at)} · ${p.que}${p.segmento ? ` · A: ${p.segmento}` : ''}`),
    '',
    'CÓMO LOS QUIERO:',
    '- En español de España, con el tono de la marca. Emails personales, de persona a persona (texto, no newsletter): frases cortas, párrafos de 1-3 líneas, un solo objetivo y UNA llamada a la acción por email.',
    '- Personaliza con {{contact.first_name}} (variable de GHL), sin abusar.',
    '- Cada email con un ángulo distinto (historia, beneficio, prueba social, objeción, urgencia real, FAQ…). Nada de urgencia falsa: solo plazos reales (cierre, bonus que caducan).',
    '- Los del día del directo solo recuerdan que es HOY, la hora y el enlace; no venden.',
    '- Los de venta: a quien no ha comprado (excluye la etiqueta de compra) y con el enlace de la página de venta.',
    '- Cuida la entregabilidad: nada de MAYÚSCULAS ni signos «!!!» en el asunto, pocos enlaces (1, como mucho 2) y sin palabras típicas de spam.',
    '',
    'FORMATO DE CADA EMAIL (igual en todos, para programarlos en GHL):',
    '### Email N · [fecha y hora] · [fase]',
    '- Para: [segmento / etiquetas a incluir y a excluir]',
    '- Asunto A: …',
    '- Asunto B (para test A/B): …',
    '- Preheader: …',
    '- Cuerpo: (el texto completo)',
    '- Botón o enlace: [texto] → [URL exacta de la lista de enlaces]',
    '- P. D.: …',
    '',
    'Al final, una TABLA RESUMEN (nº, fecha y hora, asunto A, segmento, enlace). Si tienes la skill para programar emails en GHL, después te pediré que los programes con ella.',
    'Si falta un dato, escribe «[FALTA: …]»; no lo inventes.',
  ].filter((x) => x != null).join('\n').replace(/\n{3,}/g, '\n\n');
}
