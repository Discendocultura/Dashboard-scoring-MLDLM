// Automatizaciones de GoHighLevel (Crear → Automatizaciones): los workflows que necesita cada tipo de embudo, con
// los datos reales del lanzamiento (etiquetas, URLs, fechas) y el prompt para crearlos con Claude.
// El conector de GHL NO puede crear workflows (la API pública solo los lee): Claude los monta desde el navegador
// (Claude in Chrome o Cowork) o se pega la descripción corta en el asistente de IA de workflows de GHL.
// Todos van en una carpeta con el nombre del lanzamiento y se llaman «[código] 01 · Registro», «[código] 02 · …».
// Se guarda en el lanzamiento (o la VSL, venta directa o meteórico): automatizaciones = { origen, items }
//   origen: 'existen' (ya están en GHL: solo revisar) | 'cero' (crearlas) · items: { id: { estado, url } }
import { etiquetaRegistro } from './lanzamiento-rapido.js';

export const ESTADOS_AUTO = [
  { id: 'pendiente', label: 'Pendiente', icon: '○' },
  { id: 'creada', label: 'Creada', icon: '◐' },
  { id: 'probada', label: 'Probada', icon: '✓' },
];
const ESTADO_IDS = ESTADOS_AUTO.map((e) => e.id);

export function sanitizeAutomatizaciones(a) {
  if (!a || typeof a !== 'object') return undefined;
  const items = {};
  for (const [id, v] of Object.entries(a.items || {}).slice(0, 30)) {
    if (!/^[a-z0-9-]{1,30}$/.test(id) || !v || typeof v !== 'object') continue;
    const url = String(v.url || '').trim().slice(0, 600);
    items[id] = { estado: ESTADO_IDS.includes(v.estado) ? v.estado : 'pendiente', ...(/^https:\/\/\S+$/i.test(url) ? { url } : {}) };
  }
  const origen = ['existen', 'cero'].includes(a.origen) ? a.origen : '';
  return origen || Object.keys(items).length ? { origen, items } : undefined;
}

// Fechas legibles: 2026-10-29 → «jueves 29/10/2026»; 2026-10-29T19:00 → «… a las 19:00».
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export function fechaTxt(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/);
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  return `${DIAS[d.getUTCDay()]} ${m[3]}/${m[2]}/${m[1]}${m[4] ? ` a las ${m[4]}` : ''}`;
}
const menosDias = (dia, n) => new Date(Date.parse(`${dia}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
const menosHora = (hora) => { const [h, mi] = String(hora || '19:00').split(':').map(Number); return `${String(Math.max(0, h - 1)).padStart(2, '0')}:${String(mi || 0).padStart(2, '0')}`; };

// Contexto: los datos del embudo que van en los workflows.
//   tipo: 'lanzamientos' | 'vsl' | 'directa' | 'meteorico' · obj: el lanzamiento / VSL / venta directa / meteórico
// Webhook de Zoom del registro de este lanzamiento: la URL firmada del cliente + &l=<código> (inscribe en sus directos
// aunque GHL aún no haya puesto la etiqueta de registro).
export const webhookZoomLanz = (c) => (c.zoomWebhook && c.code && !/[?&]l=/.test(c.zoomWebhook) ? `${c.zoomWebhook}&l=${encodeURIComponent(c.code)}` : c.zoomWebhook || '');
export function autoCtx(tipo, obj = {}, { code = '', cliente = '', producto = '', zoomWebhook = '', setterUrl = '', clienteId = '', plantillasWa = [] } = {}) {
  const o = obj || {};
  return {
    tipo, code, cliente, producto, nombre: o.name || code, zoomWebhook, setterUrl, clienteId, plantillasWa: Array.isArray(plantillasWa) ? plantillasWa : [],
    carpeta: o.name || code,
    // Lanzamientos: la etiqueta de registro es SIEMPRE «registrado-webinar-DDMMAA» (fecha del directo). Si la de
    // Configuración es otra, el prompt usa la buena y registroDistinta avisa de que hay que cambiarla allí.
    ...(() => {
      const propuesta = tipo === 'lanzamientos' ? etiquetaRegistro(o.fechaDirecto) : '';
      const actual = String(o.registroTag || '').trim();
      return { registroTag: propuesta || actual, registroPropuesta: propuesta, registroDistinta: propuesta && actual && actual.toLowerCase() !== propuesta ? actual : '' };
    })(),
    encuestaTag: o.encuestaTag || '', vipTag: o.vipTag || '', compraTag: o.compraTag || '', unicoTag: o.unicoTag || '', fraccionadoTag: o.fraccionadoTag || '',
    publiTag: o.publiTag || '', organicoTag: o.organicoTag || '', llamadaTag: o.llamadaTag || '', carritoAbandonadoTag: o.carritoAbandonadoTag || '',
    compraDateField: o.compraDateField || '',
    fechaDirecto: o.fechaDirecto || '', horaDirecto: o.horaDirecto || '', replayAt: o.replayAt || '', aperturaCarrito: o.aperturaCarrito || '', cierreCarrito: o.cierreCarrito || '',
    videos: Array.isArray(o.videos) ? o.videos.filter((v) => v?.fecha) : [],
    precioVip: Number(o.precioVip) || 0,
    graciasUrl: o.graciasUrl || '', recursosUrl: o.recursosUrl || '', replayUrl: o.replayUrl || '', raicesUrl: o.raicesUrl || '', paginaPagoUrl: o.paginaPagoUrl || o.checkoutUrl || '', // venta directa: su checkout
    vipUrl: o.vipUrl || '', ventaUrl: o.ventaUrl || o.pagoUrl || '', ventaFraccionadoUrl: o.ventaFraccionadoUrl || o.pagoFraccionadoUrl || '',
    whatsappUrl: o.whatsappUrl || '', whatsappDudasUrl: o.whatsappDudasUrl || '', encuestaUrl: o.encuestaUrl || '',
    llamadaUrl: o.llamadaUrl || '', llamadaGraciasUrl: o.llamadaGraciasUrl || '', vslUrl: o.vslUrl || '', ofertaUrl: o.ofertaUrl || '',
    apertura: o.apertura || '', cierre: o.cierre || '',
  };
}

// Qué dato falta, con su nombre en Configuración.
const NOMBRES = {
  registroTag: 'la etiqueta de registro', encuestaTag: 'la etiqueta de encuesta', vipTag: 'la etiqueta de compra VIP', compraTag: 'la etiqueta de compra',
  fechaDirecto: 'el día del directo', horaDirecto: 'la hora del directo', recursosUrl: 'la URL de la página preclase', replayUrl: 'la URL de la página de replay',
  replayAt: 'cuándo se desbloquea la grabación', paginaPagoUrl: 'la URL de la página de pago', llamadaUrl: 'el enlace del calendario de llamadas',
  llamadaTag: 'la etiqueta de llamada', vslUrl: 'la URL de la VSL', ofertaUrl: 'la URL de la oferta', cierre: 'el cierre de la oferta',
};
// En la venta directa la «página de pago» es su checkout (Configuración de la venta directa → Páginas).
const NOMBRES_DIRECTA = { paginaPagoUrl: 'la URL del checkout' };
export const faltanDatos = (a, c) => (a.requiere || []).filter((k) => !c[k]).map((k) => (c.tipo === 'directa' && NOMBRES_DIRECTA[k]) || NOMBRES[k] || k);

const t = (v, alt) => (v ? `«${v}»` : `«${alt}» [FALTA: ponlo en Configuración]`);
const u = (v, alt) => v || `[FALTA: ${alt}]`;
const origenAcciones = (c) => (c.publiTag || c.organicoTag
  ? [`Rama «If/Else» por formulario: si es el de anuncios, añade la etiqueta ${t(c.publiTag, 'etiqueta de publicidad')}; si es el orgánico, ${t(c.organicoTag, 'etiqueta de orgánico')} (así AlquimIA separa publicidad y orgánico).`]
  : []);
const directos = (c) => (c.videos.length > 1 ? c.videos.map((v, i) => `${v.nombre || `Vídeo ${i + 1}`}: ${fechaTxt(`${v.fecha}T${v.hora || c.horaDirecto || '19:00'}`)}`) : [`Directo: ${fechaTxt(`${c.fechaDirecto}T${c.horaDirecto || '19:00'}`) || '[FALTA: día y hora del directo]'}`]);

// Lista por tipo de embudo. Cada una: { id, titulo, para, disparador, acciones(ctx), requiere, prueba, si?(ctx) }
const LANZAMIENTO = [
  {
    id: 'registro', titulo: 'Registro al webinar', requiere: ['registroTag', 'fechaDirecto'],
    para: 'Marca a cada persona que se registra con la etiqueta del lanzamiento: es la que usa AlquimIA para contar los leads.',
    disparador: () => 'Form Submitted: el formulario de registro del lanzamiento (si hay dos, el orgánico y el de anuncios, pon los dos como disparadores).',
    acciones: (c) => [
      `Añadir la etiqueta ${t(c.registroTag || c.registroPropuesta, 'registrado-webinar-DDMMAA')} (nomenclatura fija de la agencia: «registrado-webinar-» + la fecha del directo DDMMAA).`,
      ...origenAcciones(c),
      `Email de confirmación: que ya tiene su plaza, cuándo es (${directos(c).join(' · ')}) y un botón a la página preclase ${u(c.recursosUrl, 'URL de la página preclase')}.`,
      ...(c.whatsappUrl ? [`En el email, el enlace al grupo de WhatsApp: ${c.whatsappUrl}.`] : []),
      ...(c.zoomWebhook ? [`Después de añadir la etiqueta: acción «Webhook» (método POST) a ${webhookZoomLanz(c)} — inscribe a la persona en la reunión de Zoom de cada directo con su enlace personal (no hace falta mapear campos: basta el contact_id que GHL manda siempre). Es solo para ${c.cliente ? `${c.cliente} y ` : ''}este lanzamiento: no sirve la de otro cliente ni la de otro lanzamiento.`] : []),
    ],
    prueba: (c) => `Regístrate con un email de prueba: en AlquimIA (Leads) debe aparecer con la etiqueta ${t(c.registroTag || c.registroPropuesta, 'registrado-webinar-DDMMAA')} y te tiene que llegar el email.${c.zoomWebhook ? ' En Zoom → la reunión → Registrantes, debe aparecer su email.' : ''}`,
  },
  {
    id: 'encuesta', titulo: 'Encuesta rellenada', requiere: ['encuestaTag'], si: (c) => c.encuestaTag || c.encuestaUrl,
    para: 'Marca a quien rellena la encuesta: desbloquea las clases de la preclase y alimenta Leads → Encuesta.',
    disparador: (c) => `Survey Submitted: la encuesta del lanzamiento${c.encuestaUrl ? ` (${c.encuestaUrl})` : ''}.`,
    acciones: (c) => [`Añadir la etiqueta ${t(c.encuestaTag, 'etiqueta de encuesta')}.`],
    prueba: (c) => `Rellena la encuesta con el contacto de prueba: en Leads debe salir «encuesta ✓» y la etiqueta ${t(c.encuestaTag, 'etiqueta de encuesta')}.`,
  },
  {
    id: 'vip', titulo: 'Compra de la entrada VIP', requiere: ['vipTag'], si: (c) => c.precioVip > 0,
    para: 'Marca a quien compra la entrada VIP y le da acceso a lo que incluye.',
    disparador: (c) => `Order Submitted / Payment Received del producto de la entrada VIP${c.vipUrl ? ` (enlace de pago ${c.vipUrl})` : ''}.`,
    acciones: (c) => [`Añadir la etiqueta ${t(c.vipTag, 'etiqueta VIP')}.`, 'Email de bienvenida VIP con lo que incluye y cómo acceder [texto provisional: REVISAR].'],
    prueba: (c) => `Haz una compra de prueba de la VIP (cupón del 100 % o modo test): en Leads debe salir como VIP (${t(c.vipTag, 'etiqueta VIP')}).`,
  },
  {
    id: 'recordatorios', titulo: 'Recordatorios del directo', requiere: ['registroTag', 'fechaDirecto', 'horaDirecto', 'recursosUrl'],
    para: 'Que nadie se pierda el directo: recordatorios el día antes, una hora antes y al empezar, con el enlace para conectarse.',
    disparador: (c) => `Contact Tag Added: ${t(c.registroTag || c.registroPropuesta, 'registrado-webinar-DDMMAA')}.`,
    acciones: (c) => [
      `«Wait» hasta el ${fechaTxt(`${menosDias(c.fechaDirecto || '2000-01-02', 1)}T19:00`) || '[día antes] a las 19:00'} → email (y WhatsApp si lo usáis): «Mañana es el directo».`,
      `«Wait» hasta el ${fechaTxt(`${c.fechaDirecto}T${menosHora(c.horaDirecto)}`) || '[día del directo, 1 h antes]'} → «Empezamos en 1 hora».`,
      `«Wait» hasta el ${fechaTxt(`${c.fechaDirecto}T${c.horaDirecto || '19:00'}`) || '[hora del directo]'} → «Estamos en directo» con el enlace para conectarse: la página preclase ${u(c.recursosUrl, 'URL de la página preclase')} (59 minutos antes muestra la cuenta atrás y a la hora entra sola al directo).`,
      ...(c.videos.length > 1 ? [`Repite los tres avisos para cada vídeo: ${directos(c).join(' · ')}.`] : []),
      'Si la persona entra después de una de esas horas, que salte ese aviso (opción de «Wait»: si ya pasó, continuar).',
    ],
    prueba: () => 'Con el contacto de prueba registrado, revisa en el historial del workflow que queda esperando hasta la primera fecha.',
  },
  {
    id: 'grabacion', titulo: 'Grabación disponible', requiere: ['registroTag', 'replayUrl', 'replayAt'],
    para: 'Avisa de que ya está la grabación a quien no ha comprado.',
    disparador: (c) => `Contact Tag Added: ${t(c.registroTag || c.registroPropuesta, 'registrado-webinar-DDMMAA')}.`,
    acciones: (c) => [
      `«Wait» hasta el ${fechaTxt(c.replayAt) || '[cuándo se desbloquea la grabación]'}.`,
      `Si NO tiene la etiqueta ${t(c.compraTag, 'etiqueta de compra')}: email «Ya tienes la grabación» con el botón a ${u(c.replayUrl, 'URL de la página de replay')}.`,
    ],
    prueba: () => 'Comprueba en el historial del workflow que el contacto de prueba espera hasta la fecha de la grabación.',
  },
  {
    id: 'compra', titulo: 'Compra del programa', requiere: ['compraTag'],
    para: 'Marca a quien compra (pago único o fraccionado), guarda la fecha y la saca de los avisos de venta.',
    disparador: (c) => `Order Submitted / Payment Received del programa${c.producto ? ` «${c.producto}»` : ''} (pago único${c.ventaUrl ? ` ${c.ventaUrl}` : ''} y fraccionado${c.ventaFraccionadoUrl ? ` ${c.ventaFraccionadoUrl}` : ''}).`,
    acciones: (c) => [
      `Añadir la etiqueta ${t(c.compraTag, 'etiqueta de compra')}.`,
      ...(c.unicoTag || c.fraccionadoTag ? [`Según el pago: pago único → ${t(c.unicoTag, 'etiqueta de pago único')}; fraccionado → ${t(c.fraccionadoTag, 'etiqueta de fraccionado')}.`] : []),
      ...(c.compraDateField ? [`Actualizar el campo de fecha «${c.compraDateField}» con la fecha de hoy (así AlquimIA cuenta la venta en este lanzamiento).`] : []),
      `Quitarla de los workflows «[${c.code || 'código'}] Grabación disponible» y «[${c.code || 'código'}] Carrito abandonado» (Remove from workflow).`,
      'Email de bienvenida al programa con el acceso [texto provisional: REVISAR].',
    ],
    prueba: (c) => `Compra de prueba (cupón del 100 % o modo test): en Métricas debe sumar una venta y el contacto tener ${t(c.compraTag, 'etiqueta de compra')}.`,
  },
  {
    id: 'carrito-abandonado', titulo: 'Carrito abandonado', requiere: ['paginaPagoUrl'],
    para: 'Recupera a quien empieza a pagar y no termina.',
    disparador: (c) => `Order Form Submission (empieza el pago) en la página de pago ${u(c.paginaPagoUrl, 'URL de la página de pago')}, o el evento de carrito abandonado de vuestra pasarela.`,
    acciones: (c) => [
      '«Wait» 1 hora.',
      `Si NO tiene la etiqueta ${t(c.compraTag, 'etiqueta de compra')}: ${c.carritoAbandonadoTag ? `añadir la etiqueta «${c.carritoAbandonadoTag}» y ` : ''}email (y WhatsApp) «¿Te ayudo a terminar tu inscripción?»${c.whatsappDudasUrl ? ` con el WhatsApp de dudas ${c.whatsappDudasUrl}` : ''}.`,
    ],
    prueba: () => 'Empieza un pago de prueba y no lo termines: a la hora debe llegar el aviso.',
  },
  {
    id: 'llamada', titulo: 'Llamada de admisión reservada', requiere: ['llamadaUrl'], si: (c) => c.llamadaUrl || c.llamadaTag,
    para: 'Marca a quien reserva la llamada y le recuerda la cita.',
    disparador: (c) => `Customer Booked Appointment en el calendario de llamadas (${u(c.llamadaUrl, 'enlace del calendario de llamadas')}).`,
    acciones: (c) => [
      ...(c.llamadaTag ? [`Añadir la etiqueta «${c.llamadaTag}».`] : []),
      `Email de confirmación${c.llamadaGraciasUrl ? ` con la página ${c.llamadaGraciasUrl}` : ''}; recordatorio 24 h y 1 h antes de la cita.`,
    ],
    prueba: () => 'Reserva una llamada de prueba: debe salir en la pestaña Llamadas de AlquimIA.',
  },
];

const VSL = [
  {
    id: 'registro', titulo: 'Registro', requiere: ['registroTag', 'vslUrl'],
    para: 'Marca a cada persona que se registra para ver el vídeo.',
    disparador: () => 'Form Submitted: el formulario de registro (orgánico y anuncios).',
    acciones: (c) => [`Añadir la etiqueta ${t(c.registroTag, 'etiqueta de registro')}.`, ...origenAcciones(c), `Email con el enlace al vídeo ${u(c.vslUrl, 'URL de la VSL')}.`],
    prueba: (c) => `Regístrate con un email de prueba: debe salir en Leads con ${t(c.registroTag, 'etiqueta de registro')}.`,
  },
  LANZAMIENTO.find((a) => a.id === 'llamada'),
  {
    id: 'seguimiento', titulo: 'Seguimiento a quien no agenda', requiere: ['registroTag'],
    para: 'Recordatorios a quien se registró y no ha visto el vídeo o no ha reservado la llamada.',
    disparador: (c) => `Contact Tag Added: ${t(c.registroTag, 'etiqueta de registro')}.`,
    acciones: (c) => ['«Wait» 1 día → si no tiene cita ni compra: email con el vídeo y el botón de reservar.', '«Wait» 2 días → segundo recordatorio.', `Salir si tiene ${t(c.compraTag, 'etiqueta de compra')}${c.llamadaTag ? ` o «${c.llamadaTag}»` : ''}.`],
    prueba: () => 'El contacto de prueba debe quedar esperando el primer recordatorio.',
  },
  LANZAMIENTO.find((a) => a.id === 'compra'),
];

const DIRECTA = [
  LANZAMIENTO.find((a) => a.id === 'compra'),
  {
    id: 'extras', titulo: 'Bumps, upsell y downsell', requiere: [],
    para: 'Marca cada extra que se compra (para el % de cada uno en Métricas).',
    disparador: () => 'Order Submitted de cada bump, upsell y downsell.',
    acciones: () => ['Una rama por producto: añadir su etiqueta (la que tiene en Configuración → Venta directa).', 'Email de acceso a cada extra [texto provisional: REVISAR].'],
    prueba: () => 'Compra de prueba con un bump: en Métricas debe salir el % del bump.',
  },
  LANZAMIENTO.find((a) => a.id === 'carrito-abandonado'),
];

const METEORICO = [
  {
    id: 'compra', titulo: 'Compra de la oferta', requiere: ['compraTag'],
    para: 'Marca a quien compra la oferta flash.',
    disparador: (c) => `Order Submitted del producto de la oferta${c.ofertaUrl ? ` (${c.ofertaUrl})` : ''}.`,
    acciones: (c) => [`Añadir la etiqueta ${t(c.compraTag, 'etiqueta de compra')}.`, ...(c.compraDateField ? [`Actualizar el campo de fecha «${c.compraDateField}» con la fecha de hoy.`] : []), 'Email de acceso [texto provisional: REVISAR].'],
    prueba: () => 'Compra de prueba: debe sumar en la pestaña Meteóricos.',
  },
  {
    id: 'cierre', titulo: 'Últimas horas de la oferta', requiere: ['cierre'],
    para: 'Avisa del cierre a quien no ha comprado.',
    disparador: () => 'Contact Tag Added: la etiqueta de la lista a la que se envía la oferta.',
    acciones: (c) => [`«Wait» hasta 3 horas antes del cierre (${fechaTxt(c.cierre) || '[cierre de la oferta]'}) → si no ha comprado: email y WhatsApp «Últimas horas».`],
    prueba: () => 'Revisa en el historial que el contacto de prueba espera hasta esa hora.',
  },
];

// Setter IA: el envío de cada plantilla de WhatsApp (botón «📨 Plantilla» de Leads y Setting hoy, Cuenta → Conexiones)
// y, si está la dirección del setter, el aviso al setter cuando la lead responde. Las etiquetas setter-ia-… son fijas.
const listaPlantillas = (c) => c.plantillasWa.map((p) => `«${p.nombre}» → disparador Contact Tag Added «${p.tag}»`).join(' · ');
const SETTER = [
  {
    id: 'setter-plantilla', titulo: 'Plantillas de WhatsApp (botón 📨 de AlquimIA)', requiere: [], si: (c) => c.plantillasWa.length,
    para: 'Cuando alguien del equipo pulsa «📨 Plantilla» en AlquimIA, se pone a la persona una etiqueta y este workflow le envía la plantilla aprobada. Si responde, contesta el setter IA. Son para todo el cliente: UN workflow por plantilla (si ya existen de otro lanzamiento, no los dupliques).',
    disparador: (c) => `Contact Tag Added. Uno por plantilla: ${listaPlantillas(c)}.`,
    acciones: (c) => [
      'Filtro al principio: la etiqueta NO incluye «setter-ia-baja» (quien pidió la baja no vuelve a recibir plantillas).',
      `Enviar la plantilla de WhatsApp aprobada por Meta con ese nombre (${c.plantillasWa.map((p) => `«${p.nombre}»`).join(', ')}).`,
      'Añadir la etiqueta «setter-ia-plantilla» (sin ella el setter no responde y AlquimIA no la cuenta).',
      'Quitar la etiqueta que lo disparó (la de «setter-ia-enviar-…»), para poder volver a enviarla otro día.',
      'Crear o actualizar la oportunidad en el pipeline del lanzamiento, etapa «Contactado».',
    ],
    prueba: () => 'Ponte como contacto de prueba con tu propio número y pulsa «📨 Plantilla» en AlquimIA: en unos segundos te llega la plantilla y en Leads sale «📨 Plantilla ✓».',
  },
  {
    id: 'setter-respuesta', titulo: 'Setter IA · respuesta de la lead', requiere: [], si: (c) => c.setterUrl,
    para: 'Cuando la lead contesta a la plantilla, avisa al setter IA para que responda. Es UNO para todo el cliente: si ya existe de otro lanzamiento, no lo dupliques (márcalo como creado).',
    disparador: () => 'Customer Replied, canal WhatsApp.',
    acciones: (c) => [
      'Filtros: la etiqueta incluye «setter-ia-plantilla» y NO incluye «setter-ia-pausa» ni «setter-ia-baja».',
      `Acción «Webhook», método POST, a ${c.setterUrl}/api/webhook/ghl?c=${c.clienteId || '[cliente]'}&k=[FIRMA: cópiala del paso Plantillas del setter IA]. Sin encabezados ni campos: GHL ya envía el contact_id y el setter lee la conversación entera.`,
    ],
    prueba: () => 'Contesta desde tu número a la plantilla de prueba: el setter debe responder y en AlquimIA salir 🤖💬 (y desaparecer de Setting hoy mientras la IA conversa).',
  },
];

const LISTAS = { lanzamientos: LANZAMIENTO, vsl: VSL, directa: DIRECTA, meteorico: METEORICO };

// Las automatizaciones de este embudo, numeradas: [{ ...def, n, nombre, faltan }]
export function automatizacionesDe(c) {
  return [...(LISTAS[c.tipo] || []), ...SETTER].filter((a) => a && (!a.si || a.si(c))).map((a, i) => {
    const n = String(i + 1).padStart(2, '0');
    return { ...a, n, nombre: `[${c.code || 'código'}] ${n} · ${a.titulo}`, faltan: faltanDatos(a, c) };
  });
}

// Prompt para Claude (en el navegador: Claude in Chrome o Cowork controlando el ordenador).
export function promptAutomatizacion(a, c) {
  return [
    `Vas a crear un workflow en GoHighLevel (subcuenta de ${c.cliente || 'la marca'}) para ${c.tipo === 'lanzamientos' ? 'el lanzamiento' : 'el embudo'} «${c.nombre}». El conector de GHL no puede crear workflows (la API solo los lee), así que hazlo en la interfaz de GHL desde el navegador: Automatización → Workflows. Ve paso a paso y PARA antes de publicar.`,
    '',
    `CARPETA: «${c.carpeta}» (dentro de Workflows; si no existe, créala. Todos los workflows de ${c.tipo === 'lanzamientos' ? 'este lanzamiento' : 'este embudo'} van ahí).`,
    `NOMBRE DEL WORKFLOW: «${a.nombre}»`,
    `PARA QUÉ: ${a.para}`,
    `DISPARADOR: ${a.disparador(c)}`,
    'ACCIONES, en este orden:',
    ...a.acciones(c).map((x, i) => `${i + 1}. ${x}`),
    '',
    'REGLAS:',
    '- Usa las etiquetas EXACTAS de arriba, en minúsculas. Si una no existe en GHL, créala con ese nombre exacto.',
    ...(c.tipo === 'lanzamientos' ? ['- La etiqueta de registro sigue SIEMPRE la nomenclatura «registrado-webinar-DDMMAA» (fecha del directo): no la cambies.'] : []),
    '- No toques ningún otro workflow (tampoco los de lanzamientos anteriores).',
    '- Los textos de emails y WhatsApp: pon uno provisional corto que empiece por [REVISAR] (los definitivos salen de Crear → Emails de AlquimIA).',
    '- Si un paso no existe tal cual en GHL, usa el equivalente más cercano y avísame.',
    '- Déjalo en BORRADOR (sin publicar). Al terminar dime: qué has creado, qué no has podido hacer y la URL del workflow (la pegaré en AlquimIA).',
    '',
    `CÓMO PROBARLO después: ${a.prueba(c)}`,
  ].join('\n');
}

// Descripción corta para el asistente de IA de workflows de GHL (si la cuenta lo tiene).
export function descripcionIaGhl(a, c) {
  return `Crea un workflow llamado «${a.nombre}». Disparador: ${a.disparador(c)} Acciones: ${a.acciones(c).map((x, i) => `${i + 1}) ${x}`).join(' ')}`;
}

// Primer prompt: preparar GHL (carpeta, etiquetas y lo que necesitan los workflows) antes de crearlos.
export function promptPreparacion(lista, c) {
  const etiquetas = [...new Set([c.registroTag || c.registroPropuesta, c.encuestaTag, c.vipTag, c.compraTag, c.unicoTag, c.fraccionadoTag, c.publiTag, c.organicoTag, c.llamadaTag, c.carritoAbandonadoTag, ...(c.setterUrl || c.plantillasWa.length ? ['setter-ia-plantilla', 'setter-ia-activo', 'setter-ia-pausa', 'setter-ia-humano', 'setter-ia-cita', 'setter-ia-baja', ...c.plantillasWa.map((p) => p.tag)] : [])].filter(Boolean))];
  return [
    `Vamos a preparar GoHighLevel (subcuenta de ${c.cliente || 'la marca'}) para crear las automatizaciones de «${c.nombre}». Todavía no crees ningún workflow.`,
    '',
    '1. Con el conector de GHL: lista los workflows que ya existen (para no duplicar ninguno) y comprueba qué etiquetas de esta lista existen; crea las que falten con el nombre exacto, en minúsculas:',
    ...etiquetas.map((e) => `   - ${e}`),
    ...(c.tipo === 'lanzamientos' ? ['   (La de registro sigue la nomenclatura fija «registrado-webinar-DDMMAA» con la fecha del directo.)'] : []),
    `2. Desde el navegador (Automatización → Workflows): crea la carpeta «${c.carpeta}».`,
    '3. Comprueba que existe lo que van a usar los workflows y dime lo que falte: el formulario de registro (y el de anuncios), la encuesta, los productos y enlaces de pago, el calendario de llamadas y los campos personalizados.',
    '',
    'Después los crearemos uno a uno, en este orden:',
    ...lista.map((a) => `   ${a.nombre}${a.faltan.length ? ` (aún falta en AlquimIA: ${a.faltan.join(', ')})` : ''}`),
    '',
    'Termina con un resumen: etiquetas creadas, carpeta creada y lo que falta antes de empezar.',
  ].join('\n');
}

// Si ya existen: qué revisar en cada uno al empezar un lanzamiento nuevo.
export function revisarExistente(a, c) {
  if (a.id === 'registro') return `Cambia la etiqueta de registro a ${t(c.registroTag || c.registroPropuesta, 'registrado-webinar-DDMMAA')} (nomenclatura fija) y revisa la fecha del directo en el email.`;
  if (a.id === 'recordatorios') return `Cambia el disparador a la etiqueta nueva y las fechas de los «Wait» (${directos(c).join(' · ')}).`;
  if (a.id === 'grabacion') return `Cambia el disparador a la etiqueta nueva y el «Wait» a ${fechaTxt(c.replayAt) || 'la fecha de la grabación'}.`;
  if (a.id === 'encuesta') return 'Si la encuesta es nueva, cambia el disparador a esa encuesta.';
  return 'Revisa que no lleve fechas, enlaces ni etiquetas del lanzamiento anterior.';
}
