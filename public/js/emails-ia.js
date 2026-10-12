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
  { id: 'consciencia', label: 'Objeciones, consciencia y expectación', desc: 'Antes del directo, un email al día: elevar la consciencia del problema, romper las objeciones habituales y generar expectación por el directo (con la ficha del avatar, el producto y el contenido del webinar).' },
  { id: 'vip', label: 'Entrada VIP', desc: 'Upsell de la entrada VIP antes del directo.' },
  { id: 'directo', label: 'Recordatorios del directo', desc: 'La víspera, por la mañana, 1 hora antes y «estamos en directo».' },
  { id: 'replay', label: 'Grabación', desc: 'Grabación disponible y aviso de que caduca.' },
  { id: 'carrito', label: 'Carrito abierto', desc: 'Apertura, un ángulo por día (testimonios, objeciones, bonus, FAQ…), últimas horas y cierre.' },
  { id: 'cierre', label: 'Después del cierre', desc: 'Gracias / lista de espera para quien no compró.' },
];
export const FASES_DEFECTO = FASES_EMAIL.filter((f) => f.id !== 'cierre').map((f) => f.id);

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
export const HORAS_CARRITO = ['09:00', '15:00', '20:00'];
export const HORAS_ULTIMO_DIA = ['09:00', '13:00', '19:00', '22:00'];
// Mensajes a comunicar en el carrito: el día 1 (ver la grabación), del más emocional al más racional, y el último día.
const MENSAJES_DIA1 = ['Mira la grabación: lo que no te puedes perder', 'El momento del directo que lo cambia todo', '¿Te ves en lo que contamos? Es para ti'];
const ANGULOS = {
  emocional: ['Imagina tu vida dentro de unos meses', 'La historia de alguien como tú', 'No estás sola: lo que sienten muchas', 'Lo que cuesta seguir igual', 'Por qué creamos este programa'],
  mixto: ['Qué cambia exactamente cuando entras', 'Respuesta a «no tengo tiempo»', 'Respuesta a «no sé si es para mí»', 'Resultados reales de alumnas', 'Respuesta a «es caro»', 'Cómo es el día a día dentro'],
  racional: ['Todo lo que incluye, punto por punto', 'Precio por día y formas de pago', 'Garantía: entras sin riesgo', 'Sola o acompañada: la comparativa', 'Último repaso: todo lo que te llevas'],
};
// El primero del último día es SIEMPRE el de preguntas frecuentes sobre el producto.
const MENSAJES_ULTIMO_DIA = ['Último día: las preguntas frecuentes, respondidas', 'Respuesta a tu última duda', 'Cierra esta noche: decide hoy', 'Últimas horas: cierra a las 23:59'];
// Antes del directo: primero ELEVAR LA CONSCIENCIA, después ROMPER OBJECIONES y, al final, GENERAR EXPECTACIÓN por el directo.
export const ANGULOS_PREVIOS = {
  consciencia: { nombre: 'Elevar consciencia', lista: ['El verdadero problema no es el que crees', 'Por qué lo que has probado no ha funcionado', 'El error más común (y cómo evitarlo)', 'Lo que nadie te ha contado', 'Lo que cuesta seguir igual'] },
  objecion: { nombre: 'Romper objeción', lista: ['«Ya lo he probado todo»', '«No tengo tiempo para esto»', '«No sé si es para mí»', '«Es tarde para mí»', '«Necesito pensarlo / no me lo puedo permitir»'] },
  expectacion: { nombre: 'Generar expectación', lista: ['Lo que vas a descubrir en el directo', 'La historia de alguien como tú', 'Un adelanto de lo que verás', 'Por qué este directo es diferente', 'Cuenta atrás: lo que te llevarás'] },
};
export const MAX_PREVIOS = 9;
const sumar = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const horaMenos = (h, min) => { const [a, b] = String(h || '19:00').split(':').map(Number); const t = Math.max(0, a * 60 + b - min); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

// [{ at: 'AAAA-MM-DDTHH:MM' | '', fase, que, segmento, titulo, dia?, tono?, motivo?: { icon, texto } }] ordenados
// (que: el texto largo para el prompt; titulo, tono y motivo: lo corto para la pantalla) (lo «inmediato» va primero, sin fecha).
export function calendarioEmails(l = {}, fases = FASES_DEFECTO) {
  const on = new Set(fases);
  const out = [];
  // Dos emails a la misma hora no: el segundo se retrasa 2 horas.
  const masDos = (at) => { const [d, h] = at.split('T'); const [a, b] = h.split(':').map(Number); return `${d}T${String(Math.min(23, a + 2)).padStart(2, '0')}:${String(b).padStart(2, '0')}`; };
  const add = (at, fase, que, segmento = '', extra = {}) => {
    if (!on.has(fase)) return;
    let t = at;
    while (t && out.some((x) => x.at === t) && !t.endsWith('23:00')) t = masDos(t);
    out.push({ at: t, fase, que, segmento, titulo: extra.titulo || que.split(':')[0], ...extra });
  };
  add('', 'registro', 'Bienvenida: confirmación del registro, cuándo es el directo, qué ganará y los siguientes pasos', 'al registrarse (automático por etiqueta de registro)', { titulo: 'Bienvenida' });
  for (const x of desbloqueosPreclase(l)) add(x.at, 'preclase', `Ya disponible: ${x.nombre}${x.extra.length ? ` (${x.extra.join('; ')})` : ''}`, '', { titulo: `${x.nombre.replace(/ «.*»$/, '')} disponible` });
  const vids = videosDe(l).filter((v) => DIA_RE.test(v.fecha || ''));
  const primero = vids[0];
  if (Number(l.precioVip) > 0 && primero) {
    add('', 'vip', 'Oferta de la entrada VIP (en la página de gracias o justo después de registrarse)', 'al registrarse, a quien no tiene la VIP', { titulo: 'Oferta VIP' });
    add(`${sumar(primero.fecha, -2)}T12:00`, 'vip', 'Recordatorio de la entrada VIP: qué incluye y por qué ahora', 'registrados sin VIP', { titulo: 'Recordatorio VIP' });
  }
  // Antes del directo: un email al día (12:00) desde el día siguiente al inicio de la captación (o 10 días antes) hasta la
  // víspera; como mucho MAX_PREVIOS, repartidos. Primero consciencia, luego objeciones y al final expectación.
  if (primero && on.has('consciencia')) {
    const fin = sumar(primero.fecha, -1);
    let ini = DIA_RE.test(l.inicioCaptacion || '') ? sumar(l.inicioCaptacion, 1) : sumar(primero.fecha, -10);
    if (ini < sumar(primero.fecha, -21)) ini = sumar(primero.fecha, -21);
    const dias = [];
    for (let d = ini; d <= fin; d = sumar(d, 1)) dias.push(d);
    const n = Math.min(MAX_PREVIOS, dias.length);
    const elegidos = n ? Array.from({ length: n }, (_, i) => dias[Math.round((i * (dias.length - 1)) / Math.max(1, n - 1))]) : [];
    const usadosP = { consciencia: 0, objecion: 0, expectacion: 0 };
    [...new Set(elegidos)].forEach((d, i, arr) => {
      const p = arr.length > 1 ? i / (arr.length - 1) : 1;
      const tipo = p < 0.34 ? 'consciencia' : p < 0.67 ? 'objecion' : 'expectacion';
      const A = ANGULOS_PREVIOS[tipo];
      const titulo = A.lista[(usadosP[tipo]++) % A.lista.length];
      add(`${d}T12:00`, 'consciencia', `Antes del directo · ${A.nombre}: «${titulo}» · termina llevando al directo (fecha y hora, y añadirlo al calendario)`, 'registrados', { titulo, angulo: tipo });
    });
  }
  const multi = nVideos(l) > 1;
  for (const v of vids) {
    const h = v.hora || l.horaDirecto || '19:00';
    const nom = multi ? v.nombre : 'el directo';
    const deNom = multi ? `de ${v.nombre}` : 'del directo';
    add(`${sumar(v.fecha, -1)}T19:00`, 'directo', `Mañana es ${nom}: hora, qué verán y por qué no perdérselo`, '', { titulo: `Mañana es ${nom}` });
    add(`${v.fecha}T09:00`, 'directo', `Hoy es ${nom} a las ${h}: enlace de acceso`, '', { titulo: `Hoy es ${nom}` });
    add(`${v.fecha}T${horaMenos(h, 60)}`, 'directo', `Empezamos en 1 hora: enlace de acceso`, '', { titulo: 'Empezamos en 1 hora' });
    add(`${v.fecha}T${h}`, 'directo', `¡Estamos en directo! Entra ya`, 'quien no ha entrado aún (si se puede segmentar)', { titulo: '¡Estamos en directo!' });
    const rep = v.replayAt || `${sumar(v.fecha, 1)}T10:00`;
    // La grabación del vídeo de venta la cubren los emails del día 1 del carrito (si están).
    if (!(v.venta && on.has('carrito'))) add(rep, 'replay', `Grabación ${deNom} disponible${v.venta ? ' (y el carrito abierto)' : ''}`, 'sobre todo quien no asistió', { titulo: 'Grabación disponible' });
  }
  // Carrito: 3 emails al día (9:00, 15:00 y 20:00) y 4 el último (9:00, 13:00, 19:00 y 22:00). Cada uno rompe una
  // objeción, genera emoción y da un motivo para comprar ya (el que toque: bonus, fin de un bonus, cierre). Del más
  // emocional al más racional; el día 1, foco en ver la grabación; desde el día 2, en la venta.
  const C = diasCarrito(l);
  const slots = [];
  C.dias.forEach((d, i) => {
    if (i === 0) return; // el día del directo: solo la apertura
    const ultimo = i === C.dias.length - 1;
    for (const h of ultimo ? HORAS_ULTIMO_DIA : HORAS_CARRITO) slots.push({ d, h, ultimo });
  });
  if (C.dias.length) add(l.aperturaCarrito || `${C.dias[0].day}T21:00`, 'carrito', 'Apertura del carrito: la oferta completa, los bonus y el enlace de compra', 'registrados que no han comprado', { titulo: 'Abre el carrito: la oferta y sus bonus' });
  // Los ángulos de cada tono van en orden, sin repetirse hasta agotarlos.
  const usados = { dia1: 0, emocional: 0, mixto: 0, racional: 0 };
  const siguienteAngulo = (t) => ANGULOS[t][(usados[t]++) % ANGULOS[t].length];
  // El día que acaba un bonus: el primer email lo anuncia y el último antes de que acabe avisa de sus últimas horas.
  const mensajeBonus = (d, h, fin) => {
    const antes = slots.filter((x) => x.d === d && x.h < fin[2]).map((x) => x.h);
    if (h === antes[0]) return `Hoy acaba «${fin[1]}» (${fin[2]}): aprovéchalo`;
    if (antes.length > 1 && h === antes.at(-1)) return `Últimas horas para el «${fin[1]}»`;
    return '';
  };
  slots.forEach(({ d, h, ultimo }, k) => {
    const p = slots.length > 1 ? k / (slots.length - 1) : 0;
    const tono = p < 0.4 ? 'emocional' : p < 0.7 ? 'emocional y racional' : 'racional';
    // Bonus que acaban hoy (y aún no han acabado a esta hora): «nombre» a las HH:MM.
    const finBonus = d.auto.filter((a) => a.icon === '⏳').map((a) => a.texto.match(/:\s*(.+?) \(acaba a las (\d{2}:\d{2})\)/)).filter((m) => m && h < m[2]).map((m) => `«${m[1]}» a las ${m[2]}`);
    const yaAcabados = d.auto.filter((a) => a.icon === '⏳').map((a) => a.texto.match(/:\s*(.+?) \(acaba a las (\d{2}:\d{2})\)/)).filter((m) => m && h >= m[2]).map((m) => m[1]);
    const activos = (d.auto.find((a) => a.icon === '🎁')?.texto.replace(/^Bonus activos: /, '').split(', ') || []).filter((b) => b && !yaAcabados.includes(b)).join(', ');
    const motivador = ultimo ? (h >= '22:00' ? 'últimas horas: el carrito cierra hoy a las 23:59' : `urgencia: el carrito cierra hoy a las 23:59${finBonus.length ? ` (y hoy acaba ${finBonus.join(' y ')})` : ''}`)
      : finBonus.length ? `urgencia: hoy acaba ${finBonus.join(' y ')}`
        : activos ? `bonus: ${activos}` : 'la oferta completa y la garantía';
    const foco = d.n <= 1 ? 'ver la GRABACIÓN (venta en segundo plano)' : 'la VENTA';
    // Lo corto para la pantalla: título, tono y motivo.
    const jUlt = ultimo ? HORAS_ULTIMO_DIA.indexOf(h) : -1;
    // El mensaje a comunicar en este email (lo que se ve en la tarjeta y guía a Claude).
    const fin = d.auto.filter((a) => a.icon === '⏳').map((a) => a.texto.match(/:\s*(.+?) \(acaba a las (\d{2}:\d{2})\)/)).find((m) => m && h < m[2]);
    const mensaje = ultimo ? MENSAJES_ULTIMO_DIA[jUlt] || MENSAJES_ULTIMO_DIA[0]
      : d.n <= 1 ? MENSAJES_DIA1[(usados.dia1++) % MENSAJES_DIA1.length]
        : fin && mensajeBonus(d, h, fin)
          || siguienteAngulo(p < 0.4 ? 'emocional' : p < 0.7 ? 'mixto' : 'racional');
    add(`${d.day}T${h}`, 'carrito', `Carrito día ${d.n}${ultimo ? ' (último día)' : ''} · mensaje: «${mensaje}» · foco: ${foco} · tono ${tono} · objeción + emoción + motivo para comprar ya: ${motivador}`, 'registrados que no han comprado',
      { titulo: mensaje, dia: d.n, tono: p < 0.4 ? 'emocional' : p < 0.7 ? 'mixto' : 'racional' });
  });
  if (C.dias.length) add(`${sumar(C.dias.at(-1).day, 1)}T10:00`, 'cierre', 'Gracias por acompañarnos / lista de espera para la próxima edición', 'quien no compró', { titulo: 'Gracias y lista de espera' });
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
    ctx.temario ? `\nCONTENIDO DEL WEBINAR / CLASES (lo que se enseña: úsalo para anticipar sin destripar):\n${ctx.temario}` : null,
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
    '',
    ...(fases.includes('consciencia') && plan.some((p) => p.fase === 'consciencia') ? [
      'LOS EMAILS ANTES DEL DIRECTO (fase «Objeciones, consciencia y expectación»; uno al día a las 12:00). Usa TODA la documentación: la ficha del avatar (dolores, deseos, creencias limitantes, lo que ya ha probado, sus objeciones y SUS PALABRAS), el producto, la narrativa (la gran idea) y el contenido del webinar. Van en este orden:',
      '1. ELEVAR LA CONSCIENCIA: que entienda el problema de verdad (la causa real, por qué lo que ha probado no le ha funcionado, el error común, lo que le cuesta seguir igual). Sin vender el programa todavía.',
      '2. ROMPER OBJECIONES HABITUALES: cada email, UNA objeción del avatar («ya lo he probado todo», «no tengo tiempo», «no es para mí», «es tarde para mí», el dinero…) desmontada con una historia, un dato o un cambio de creencia. Anticipa la oferta sin hablar de precio.',
      '3. GENERAR EXPECTACIÓN: lo que va a descubrir en el directo (con ganchos concretos sacados del contenido del webinar, sin destriparlo), una historia de alguien como ella y por qué no puede perdérselo.',
      '- Todos terminan con UNA llamada a la acción hacia el directo: apuntarse la fecha y la hora, añadirlo al calendario o ver la clase disponible. Nada de enlace de venta en esta fase.',
      '',
    ] : []),
    'LOS EMAILS DEL CARRITO (3 al día a las 9:00, 15:00 y 20:00; 4 el último día a las 9:00, 13:00, 19:00 y 22:00). CADA UNO tiene que:',
    '1. Romper UNA objeción (distinta en cada email; sácalas de la ficha del avatar: precio, tiempo, «no es para mí», «ya lo probé», miedo a no conseguirlo, pareja/familia…).',
    '2. Generar emoción (la vida que desea frente a la que tiene, historias y testimonios reales).',
    '3. Dar un motivo para comprar YA, el que toque en ese momento (está en el calendario: bonus disponible, fin de un bonus, cierre del carrito).',
    '- Progresión: los primeros, más EMOCIONALES; a medida que avanza el carrito, más RACIONALES (qué incluye, precio por día, garantía, FAQ, comparativas, cifras).',
    '- Día 1 del carrito: el foco es que VEAN LA GRABACIÓN (lo que se perdieron o quieren repasar), con la venta en segundo plano. Desde el día 2: foco en la VENTA, manteniendo lo anterior.',
    '- El último día: el PRIMER email (9:00) es SIEMPRE el de PREGUNTAS FRECUENTES sobre el producto (formato FAQ: las dudas reales con su respuesta corta, y el enlace de compra). Después, urgencia real creciente hasta el cierre a las 23:59; el de las 22:00, corto y directo.',
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
