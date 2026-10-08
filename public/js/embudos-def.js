// Tipos de embudo: qué pestañas pueden tener y la guía de lo que hay que preparar en GHL.
// Lo usan el navegador («＋ Nuevo embudo» y su ⚙️) y el servidor (para validar las pestañas).

export const PESTANAS = {
  lanzamientos: [
    { id: 'hoy', label: 'Setting hoy', desc: 'A quién escribir hoy por WhatsApp, por prioridad' },
    { id: 'llamadas', label: 'Llamadas', desc: 'Llamadas de valoración: calendario, resultados y pipeline' },
    { id: 'leads', label: 'Leads', desc: 'Lista de registrados con su puntuación y estado' },
    { id: 'metricas', label: 'Métricas', desc: 'Registros, clases, VIP, directo, ventas, coste por lead…' },
    { id: 'objetivos', label: 'Objetivos y calculadora', desc: 'Objetivos, ritmo necesario y calculadora de inversión y CPL por escenarios' },
    { id: 'avatar', label: 'Avatar y anuncios', desc: 'Perfil de compradoras (encuesta) y anuncios ganadores' },
    { id: 'comparar', label: 'Comparar', desc: 'Lanzamientos entre sí, edición actual frente a las anteriores, VSL frente a lanzamiento' },
    { id: 'rendimiento', label: 'Rendimiento del equipo', desc: 'WhatsApps, llamadas, shows, cierres y tiempo de respuesta por persona' },
    { id: 'tareas', label: 'Tareas', desc: 'Tareas del equipo con comentarios y avisos' },
    { id: 'calendario', label: 'Calendario', desc: 'El calendario del cliente: hitos, tareas y eventos de todos sus embudos' },
  ],
  vsl: [
    { id: 'vmetricas', label: 'Métricas', desc: 'Registros, visionado, llamadas, ventas y ROAS por fechas y semanas' },
    { id: 'vleads', label: 'Leads', desc: 'Cada persona con lo que ha visto y WhatsApp según su estado' },
    { id: 'llamadas', label: 'Llamadas', desc: 'Llamadas de valoración de la VSL' },
    { id: 'vanuncios', label: 'Anuncios ganadores', desc: 'Qué campañas, conjuntos y anuncios traen ventas' },
    { id: 'comparar', label: 'Comparar', desc: 'Mes a mes y frente a los lanzamientos, con alertas' },
    { id: 'rendimiento', label: 'Rendimiento del equipo', desc: 'WhatsApps, llamadas, shows, cierres y tiempo de respuesta por persona' },
    { id: 'tareas', label: 'Tareas', desc: 'Tareas del equipo para esta VSL' },
    { id: 'calendario', label: 'Calendario', desc: 'El calendario del cliente: hitos, tareas y eventos de todos sus embudos' },
  ],
};
PESTANAS.meteorico = [
  { id: 'meteoricos', label: 'Meteóricos', desc: 'Cada oferta flash: cuenta atrás, ventas, facturación, visitas a la oferta y compradoras' },
  { id: 'moferta', label: 'Oferta', desc: 'Entregables y bonus (BAR 30 min, 1 h…) frente a las ventas hora a hora' },
  { id: 'tareas', label: 'Tareas', desc: 'Tareas del equipo para el calentamiento y la oferta' },
  { id: 'calendario', label: 'Calendario', desc: 'El calendario del cliente: hitos, tareas y eventos de todos sus embudos' },
];
export const pestanaIds = (tipo) => (PESTANAS[tipo] || []).map((p) => p.id);

// Variantes del embudo «siempre abierto» (usan el mismo motor que la VSL: registro → contenido →
// venta, analizado por fechas). Cambian los textos, la guía, las pestañas sugeridas y el auditor.
//   registro: cómo se llama el alta · contenido: lo que consume (con artículo) · vio: KPI de consumo
export const SUBTIPOS_VSL = {
  vsl: {
    label: 'VSL (siempre abierta)', ico: '🎬', corto: 'VSL',
    desc: 'Registro → vídeo de venta → compra directa o llamada. Se analiza por fechas, meses y semanas.',
    registro: 'Registros', contenido: 'la VSL', vio: 'Vieron la VSL', pagina: 'Página de la VSL', video: 'Vídeo de la VSL',
  },
  leadmagnet: {
    label: 'Lead magnet + secuencia de emails', ico: '🧲', corto: 'Lead magnet',
    desc: 'Descarga de un regalo (guía, checklist, minicurso) → secuencia de emails → venta. Sin fechas: siempre abierto.',
    registro: 'Descargas', contenido: 'el lead magnet', vio: 'Abrieron el lead magnet', pagina: 'Página del lead magnet', video: 'Vídeo del lead magnet (si es un vídeo)',
    sinLlamadas: true,
  },
  evergreen: {
    label: 'Webinar evergreen (grabado)', ico: '⏯️', corto: 'Webinar evergreen',
    desc: 'Webinar grabado siempre disponible: registro → ve el webinar cuando quiere → oferta y compra (o llamada).',
    registro: 'Registros', contenido: 'el webinar', vio: 'Vieron el webinar', pagina: 'Página del webinar', video: 'Vídeo del webinar',
  },
  llamadas: {
    label: 'Embudo de llamadas', ico: '📞', corto: 'Embudo de llamadas',
    desc: 'Anuncio → formulario de aplicación (con vídeo opcional) → llamada de venta. La venta se cierra en la llamada.',
    registro: 'Aplicaciones', contenido: 'el vídeo', vio: 'Vieron el vídeo', pagina: 'Página de aplicación', video: 'Vídeo de la página (opcional)',
  },
};
export const SUBTIPO_IDS = Object.keys(SUBTIPOS_VSL);
// «de» / «a» + contenido con contracción: «del webinar», «al vídeo».
export const conPrep = (prep, txt) => `${prep} ${txt}`.replace(/^de el /, 'del ').replace(/^a el /, 'al ');
export const subtipoValido = (s) => (SUBTIPO_IDS.includes(s) ? s : 'vsl');
export const textosVsl = (vsl) => SUBTIPOS_VSL[subtipoValido(vsl?.subtipo)];
// Pestañas que se marcan de inicio en «＋ Nuevo embudo» (sin lista = todas).
export const pestanasSugeridas = (tipo, subtipo) => (tipo === 'vsl' && SUBTIPOS_VSL[subtipo]?.sinLlamadas ? pestanaIds('vsl').filter((p) => p !== 'llamadas') : null);

// Guía: secciones { titulo, pasos[] } según el tipo y las pestañas elegidas (texto con <strong>/<code>).
export function guiaEmbudo(tipo, pestanas = pestanaIds(tipo), formato = 'webinar', subtipo = 'vsl', { preclase = true } = {}) {
  const on = (id) => pestanas.includes(id);
  const s = [];
  if (tipo === 'meteorico') {
    return [
      { titulo: '1 · La oferta en GHL', pasos: [
        'Crea el <strong>producto y el enlace de pago</strong> de la oferta (y, si hay, el de pago a plazos).',
        'En el <strong>workflow del pago</strong> añade una etiqueta de compra para esta oferta (p. ej. <code>compra-bf26</code>). Si es el mismo producto que vendes en otras acciones, guarda también la fecha en un <strong>campo de fecha</strong> («Fecha compra …») o haz la «foto» antes de abrir: así solo cuentan las ventas de este meteórico.',
      ] },
      { titulo: '2 · Calentamiento (4-5 días)', pasos: [
        'Programa la secuencia de <strong>emails</strong> y los mensajes de <strong>WhatsApp</strong> (vídeos incluidos) hasta la apertura. Si creas un grupo de WhatsApp nuevo, pon su enlace en el meteórico.',
        'El último día: aviso de «mañana abre», y durante la oferta: «ya está abierta», «quedan 3 horas», «última hora».',
      ] },
      { titulo: '3 · Página de la oferta', pasos: [
        'En la página de la oferta pega el <strong>código de la cuenta atrás</strong> (te lo da el meteórico): muestra «se abre en…», el botón de compra con «se cierra en…» mientras está abierta y «ha terminado» al cerrar (o manda a la página de «oferta cerrada»). También cuenta las visitas.',
        'En los emails y WhatsApp enlaza siempre a esa página.',
      ] },
      { titulo: '4 · En el dashboard', pasos: [
        'Crea cada meteórico (Black Friday, rebajas…) con sus días y horas, producto, precio, etiquetas y objetivos. El de después de un lanzamiento (downsell) se crea dentro del lanzamiento: Métricas → Downsell.',
        'Durante la oferta, la pestaña Meteóricos te enseña la cuenta atrás, las ventas, la facturación, las visitas y la conversión.',
      ] },
    ];
  }
  if (tipo === 'vsl' && subtipo === 'leadmagnet') {
    s.push({ titulo: '1 · Etiquetas en GHL', pasos: [
      'Crea las etiquetas: <strong>descarga del lead magnet</strong> (p. ej. <code>descarga-guia-sueno</code>, la pone el formulario) y <strong>compra</strong> desde este embudo. Opcional: «ha abierto el lead magnet» (la pone un workflow cuando hace clic en el enlace del email) y «publicidad» / «orgánico».',
      'Recomendado: un campo de fecha «Fecha descarga» que rellene el workflow al registrarse, y otro «Fecha compra …» en el workflow de compra.',
    ] });
    s.push({ titulo: '2 · Página y secuencia de emails', pasos: [
      'Página de captación con el formulario → página de gracias / entrega. Si el lead magnet es un vídeo, pon en la página de entrega el bloque de vídeo de <em>Configuración → Códigos</em> para medir cuánto ve cada persona.',
      'En GHL → <strong>Automatización</strong> crea el workflow de la <strong>secuencia de emails</strong> (disparador: etiqueta de descarga). Los enlaces a la página de venta llevan <code>?cid={{contact.id}}</code>.',
      'Añade un paso que <strong>quite a quien compra</strong> de la secuencia (condición: tiene la etiqueta de compra).',
      'Guarda el enlace del workflow en <em>Recursos</em> para tenerlo a mano.',
    ] });
    if (on('llamadas')) s.push(guiaLlamadas('este embudo'));
    if (on('vmetricas') || on('vanuncios')) s.push(guiaMeta());
    s.push({ titulo: `${s.length + 1} · En el dashboard`, pasos: [
      'Al crearlo se abre su configuración: etiquetas, enlaces (página de entrega, página de venta, pagos), precio y filtro de campañas de Meta.',
      'Métricas te dice cuántas descargas, cuántas compran y en cuántos días (por semanas y meses), y lo que cuesta cada descarga.',
    ] });
    return s;
  }
  if (tipo === 'vsl' && subtipo === 'llamadas') {
    s.push({ titulo: '1 · Etiquetas en GHL', pasos: [
      'Crea las etiquetas: <strong>aplicación enviada</strong> (la pone el formulario de aplicación) y <strong>compra</strong> (cuando se cierra la venta). Opcional: «ha visto el vídeo», «llamada agendada», «publicidad» / «orgánico».',
      'El formulario de aplicación debería tener las preguntas que filtran (situación, presupuesto, urgencia): así quien llama llega preparado.',
    ] });
    s.push({ titulo: '2 · Página de aplicación y calendario', pasos: [
      'Página con vídeo corto (opcional) + formulario de aplicación. Al enviar, redirige al <strong>calendario de reserva</strong> añadiendo <code>?cid={{contact.id}}</code>.',
      'Si la página tiene vídeo, pon el bloque de <em>Configuración → Códigos</em> para medir quién lo ve antes de aplicar.',
      'Recordatorios de la llamada por email y WhatsApp en un workflow con disparador «Cita reservada».',
    ] });
    s.push(guiaLlamadas('este embudo'));
    if (on('vmetricas') || on('vanuncios')) s.push(guiaMeta());
    s.push({ titulo: `${s.length + 1} · En el dashboard`, pasos: [
      'Pon el <strong>enlace de reserva</strong> y el <strong>pipeline</strong> en la configuración: aquí lo importante son las llamadas (agendadas, shows, cierres) y el coste por llamada.',
      'Anota el resultado de cada llamada en la pestaña <em>Llamadas</em>; <em>Rendimiento del equipo</em> te da el % de show y de cierre por persona.',
    ] });
    return s;
  }
  if (tipo === 'vsl') {
    const c = SUBTIPOS_VSL[subtipoValido(subtipo)];
    s.push({ titulo: '1 · Etiquetas en GHL', pasos: [
      'En GHL → <strong>Contactos → Etiquetas</strong> crea (o reutiliza) las etiquetas del embudo. Necesitas como mínimo: <strong>registro en la VSL</strong> (p. ej. <code>registro-vsl-producto</code>) y <strong>compra desde la VSL</strong>. Opcionales: «ha entrado a la VSL», «pago fraccionado», «pago único», «publicidad» y «orgánico».',
      'En el <strong>formulario de registro</strong> (Sitios → Formularios) o en su workflow, añade la acción <strong>Añadir etiqueta → registro</strong>.',
      'En el <strong>workflow de compra</strong> (disparador: pedido o pago de tu pasarela) añade la etiqueta de compra. Si quieres medir ventas por fechas exactas, guarda también la fecha en un <strong>campo personalizado de tipo fecha</strong> («Fecha compra …»).',
      'Recomendado: un workflow que, al registrarse, guarde la fecha en un campo «Fecha registro VSL» (así el análisis por semanas es exacto aunque la persona ya existiera en GHL).',
    ] });
    s.push({ titulo: '2 · Páginas del embudo', pasos: [
      `Página de registro → al enviar, redirige a la página ${conPrep('de', c.contenido)} añadiendo <code>?cid={{contact.id}}</code> al final de la URL (así se mide quién ve el vídeo).`,
      `${c.pagina}: un bloque <strong>Código HTML</strong> con el código de <em>Configuración → Códigos</em>. El vídeo, el minuto en que salen los botones de compra y llamada y sus textos se cambian luego en <em>Configuración → Páginas</em>.`,
      ...(subtipo === 'evergreen' ? ['Webinar evergreen: sube la <strong>grabación completa</strong> a Vimeo (sin cortes de «directo») y pon los botones de compra en el minuto de la oferta. En los emails de la secuencia («¿lo has visto?», «la oferta se acaba») usa el enlace con <code>?cid={{contact.id}}</code>.', 'Si quieres sensación de evento, usa en GHL un temporizador por contacto (p. ej. 72 h desde el registro) en la página de venta.'] : []),
      'Páginas de gracias (tras registrarse y tras reservar llamada): su bloque de código si quieres mostrar un vídeo.',
    ] });
    if (on('llamadas')) s.push(guiaLlamadas('la VSL'));
    if (on('vmetricas') || on('vanuncios')) s.push(guiaMeta());
    s.push({ titulo: `${s.length + 1} · En el dashboard`, pasos: [
      'Al crear el embudo se abre su configuración: pon las etiquetas, los enlaces (página de la VSL, página de venta, pagos, calendario), los precios y el filtro de campañas de Meta.',
      'Revisa los mensajes de WhatsApp en <em>Leads → Mensajes de WhatsApp de la VSL</em>.',
    ] });
  } else {
    s.push({ titulo: '1 · Etiquetas en GHL (por lanzamiento)', pasos: [
      'Cada lanzamiento usa su etiqueta de <strong>registro</strong> (nueva en cada edición, p. ej. <code>registro-webinar-nov26</code>) que pone el formulario de registro o su workflow.',
      'Etiquetas de <strong>compra</strong> del programa y, si vendes entrada, de <strong>VIP</strong> (pueden ser siempre las mismas: el dashboard hace una «foto» de quién ya las tenía al crear el lanzamiento).',
      'Opcionales: <strong>pago fraccionado</strong> / <strong>pago único</strong>, <strong>publicidad</strong> / <strong>orgánico</strong> (una en cada formulario de registro) y <strong>encuesta rellenada</strong>.',
      'Guarda la fecha de compra en un <strong>campo personalizado de tipo fecha</strong> («Fecha compra …») para ver las ventas por día.',
    ] });
    s.push({ titulo: '2 · Páginas y vídeos', pasos: [
      preclase
        ? 'Página de registro y de gracias, página de <strong>login/recursos (preclase)</strong> y de <strong>grabación</strong>: en cada una, los bloques de <em>Configuración → Códigos</em>.'
        : 'Página de registro y de gracias y página de <strong>grabación</strong> (sin área de recursos preclase): en cada una, los bloques de <em>Configuración → Códigos</em>. Tras registrarse, la persona espera directamente al directo (recordatorios por email y WhatsApp).',
      preclase
        ? 'Sube las clases y la grabación a <strong>Vimeo</strong> y pega sus URLs en la configuración del lanzamiento: se desbloquean solas a su hora y se mide cuánto ve cada persona.'
        : 'Sube la grabación a <strong>Vimeo</strong> y pega su URL en la configuración del lanzamiento: se desbloquea sola a su hora y se mide cuánto ve cada persona.',
      'En los emails de GHL, los enlaces a recursos y al directo llevan <code>?cid={{contact.id}}</code> (los tienes listos para copiar).',
    ] });
    const nv = { v2: 2, v3: 3, plf: 4 }[formato];
    const nd = { reto3: 3, reto4: 4, reto5: 5 }[formato];
    if (nd) s.push({ titulo: `${s.length + 1} · Los ${nd} días del reto`, pasos: [
      `Cada día tiene su vídeo (en directo con Zoom o grabado) con las mismas casillas que un webinar: <strong>día y hora</strong>, <strong>Zoom</strong> (si es en directo), <strong>página</strong> y <strong>vídeo de Vimeo</strong>. El <strong>día ${nd}</strong> se hace la venta: con él se abre el carrito.`,
      'Crea en GHL <strong>una página por día</strong> con el bloque de vídeo de <em>Configuración → Códigos</em> (<code>data-lsd-video="replay2"</code>, <code>replay3</code>…) y, si das tareas o deberes, el grupo de WhatsApp o Telegram del reto en el botón.',
      'Emails y WhatsApp de cada mañana con el enlace del día y <code>?cid={{contact.id}}</code>. La puntuación de cada lead suma lo que ve de cada día: quien sigue el reto entero sale «muy caliente».',
      ...(preclase ? ['La preclase (clases grabadas) es opcional en un reto: si no la quieres, elige «sin área preclase» en el ⚙️ del embudo.'] : []),
    ] });
    if (nv) s.push({ titulo: `${s.length + 1} · Los ${nv} vídeos del lanzamiento${formato === 'plf' ? ' (PLC 1-4)' : ''}`, pasos: [
      `Cada vídeo tiene las mismas casillas que un webinar: <strong>día y hora</strong>, <strong>Zoom</strong> (solo si ese vídeo es en directo), <strong>página</strong> y <strong>vídeo de Vimeo</strong> y desde cuándo se ve. En el ${formato === 'plf' ? 'PLC 4' : `vídeo ${nv}`} se hace la venta: con él se abre el carrito.`,
      'Crea en GHL <strong>una página por vídeo</strong> con el bloque de vídeo de <em>Configuración → Códigos</em> (<code>data-lsd-video="replay2"</code>, <code>replay3</code>…): así se mide cuánto ve cada persona de cada vídeo.',
      'La página preclase manda sola a cada vídeo cuando toca. En los emails de cada vídeo usa el enlace de su página con <code>?cid={{contact.id}}</code>.',
      ...(preclase ? ['La preclase (clases grabadas) es aparte y funciona igual que en el webinar.'] : []),
    ] });
    if (on('hoy') || on('leads')) s.push({ titulo: `${s.length + 1} · Setteo y WhatsApp`, pasos: [
      'Los leads se puntúan solos con lo que hacen (clases, VIP, directo, grabación). Revisa los textos de WhatsApp en <em>Setting hoy → Mensajes de WhatsApp</em>.',
      'Para el webinar en directo con Zoom: crea una app <strong>Server-to-Server OAuth</strong> en Zoom y añade sus claves en Cloudflare (ver la guía del cliente). Así «Sincronizar Zoom» marca quién asistió.',
    ] });
    if (on('llamadas')) s.push(guiaLlamadas('los lanzamientos'));
    if (on('avatar')) s.push({ titulo: `${s.length + 1} · Encuesta del avatar`, pasos: [
      'Crea en GHL una <strong>encuesta</strong> (Sitios → Encuestas) con las preguntas del perfil y que, al enviarse, ponga la etiqueta de «encuesta rellenada».',
      'Las respuestas se guardan en campos personalizados del contacto: el perfil de compradoras sale de esos campos.',
    ] });
    if (on('metricas') || on('avatar') || on('objetivos')) s.push(guiaMeta());
    if (on('objetivos')) s.push({ titulo: `${s.length + 1} · Objetivos`, pasos: ['En la pestaña <em>Objetivos y calculadora</em> pon los objetivos de registros, VIP, ventas y facturación: calcula el ritmo necesario y, con los lanzamientos anteriores, la inversión, los registros y el CPL máximo y recomendado en tres escenarios.'] });
    s.push({ titulo: `${s.length + 1} · En el dashboard`, pasos: [
      'Crea el primer lanzamiento (se abre al crear el embudo): nombre, código, etiquetas, fechas de captación, clases, directo y cierre, enlaces y precios.',
      ...(on('tareas') ? ['En <em>Tareas</em>, «Cargar tareas habituales» crea la lista de siempre con fechas calculadas.'] : []),
    ] });
  }
  return s;
}

function guiaLlamadas(donde) {
  return { titulo: `· Llamadas de valoración (${donde})`, pasos: [
    'En GHL → <strong>Calendarios</strong> crea el calendario de la llamada (y asígnalo a quien llama). Copia su <strong>enlace de reserva</strong> (<code>…/widget/booking/…</code>) y pégalo en la configuración del embudo.',
    'En GHL → <strong>Oportunidades → Pipelines</strong> crea un pipeline (su nombre se pone en la configuración) con estas etapas, en este orden y con estos nombres (el dashboard las reconoce por el nombre): <strong>Llamada agendada</strong> (o «Agenda llamada»), <strong>Contactado</strong>, <strong>❌ No contesta 1</strong>, <strong>❌ No contesta 2</strong>, <strong>❌ No contesta 3</strong>, <strong>Seguimiento</strong>, <strong>Pendiente de pago</strong>, <strong>Venta</strong> y <strong>Perdido</strong>.',
    'Opcional: un workflow con disparador «Cita reservada» en ese calendario que cree la oportunidad en «Llamada agendada» y ponga una etiqueta de «llamada agendada».',
    'El token de GHL del cliente necesita permisos de <strong>calendarios, eventos de calendario y oportunidades</strong> (lectura y escritura).',
  ] };
}

function guiaMeta() {
  return { titulo: '· Publicidad de Meta', pasos: [
    'En cada anuncio de Meta → <strong>Parámetros de URL</strong>: <code>utm_source={{site_source_name}}&amp;utm_medium=paid&amp;utm_campaign={{campaign.id}}&amp;utm_term={{adset.id}}&amp;utm_content={{ad.id}}</code>. GHL las guarda solas en el contacto.',
    'Si usas formularios instantáneos, crea campos personalizados para campaña / conjunto / anuncio y elígelos en la configuración.',
    'Pon en el nombre de las campañas un texto común (p. ej. el código del embudo) y úsalo como «filtro de campañas»: así la inversión y el coste por lead son solo de este embudo.',
  ] };
}

// Cuenta de Cloudflare donde está desplegado el dashboard (la de la agencia; los clientes no necesitan Cloudflare).
export const CLOUDFLARE_EMAIL = 'holadiscendo@gmail.com';

// Guía para conectar un cliente nuevo (GHL + Cloudflare). `variable`: p. ej. GHL_TOKEN_CLINICA_SOL.
export function guiaCliente(variable = 'GHL_TOKEN_<CÓDIGO>', sufijo = '<CÓDIGO>') {
  return [
    { titulo: '1 · En el GHL del cliente: el ID de su subcuenta', pasos: [
      'Entra en su subcuenta → <strong>Ajustes (Settings) → Información del negocio (Business Profile)</strong>. Copia el <strong>Location ID</strong> (también sale en la URL: <code>/location/<strong>XXXX</strong>/…</code>).',
    ] },
    { titulo: '2 · En el GHL del cliente: el token (integración privada)', pasos: [
      'En su subcuenta → <strong>Ajustes → Integraciones privadas (Private Integrations) → Crear nueva integración</strong>. Nombre: «Dashboard».',
      'Marca estos permisos: <strong>Contactos</strong> (ver y editar), <strong>Custom Values</strong> (ver y editar), <strong>Campos personalizados</strong> (ver), <strong>Etiquetas</strong> (ver), <strong>Conversaciones / mensajes</strong> (enviar, para los emails al equipo), <strong>Calendarios y eventos</strong> y <strong>Oportunidades</strong> (ver y editar, si usará Llamadas).',
      'Crea y <strong>copia el token</strong> (empieza por <code>pit-</code>). No lo pegues en ningún chat: va directo a Cloudflare.',
    ] },
    { titulo: '3 · En Cloudflare (el de la agencia, no el del cliente): guardar el token', pasos: [
      `Es el <strong>Cloudflare donde ya está montado este dashboard</strong> (cuenta <strong>${CLOUDFLARE_EMAIL}</strong>), no uno del cliente: el cliente no necesita Cloudflare. Todos los clientes comparten el mismo proyecto y cada uno tiene su variable.`,
      'Entra en <strong>dash.cloudflare.com</strong> con esa cuenta <strong>→ Workers &amp; Pages →</strong> el proyecto del dashboard <strong>→ Settings → Variables and Secrets → Add</strong>.',
      `Tipo <strong>Secret</strong>, nombre <code>${variable}</code> (exactamente así) y como valor el token. Guarda.`,
      'Ve a <strong>Deployments</strong> y en el último despliegue pulsa <strong>⋯ → Retry deployment</strong> para que coja la variable (tarda 1-2 minutos).',
    ] },
    { titulo: '4 · Comprobar y empezar', pasos: [
      'Aquí, en su tarjeta, pulsa <strong>Probar conexión</strong>: debe decir «Conectado» con el número de etiquetas de su GHL.',
      '<strong>Entra</strong> en el cliente (botón «Entrar →» o el desplegable de arriba), crea su primer embudo con <strong>＋ Nuevo embudo</strong> y da de alta a su equipo en <strong>Equipo → Miembros</strong>.',
      `Opcional · Meta: pon su cuenta publicitaria en la tarjeta (si el token de Meta de la agencia tiene acceso a ella) o añade <code>META_ACCESS_TOKEN_${sufijo}</code>. Zoom: <code>ZOOM_ACCOUNT_ID_${sufijo}</code>, <code>ZOOM_CLIENT_ID_${sufijo}</code> y <code>ZOOM_CLIENT_SECRET_${sufijo}</code>. Estas variables también van en el Cloudflare de la agencia (${CLOUDFLARE_EMAIL}).`,
    ] },
  ];
}

export const guiaHtml = (secciones) => secciones.map((sec, i) => `<section class="guia-sec">
  <h4>${sec.titulo.startsWith('·') ? `${i + 1} ${sec.titulo}` : sec.titulo}</h4>
  <ol>${sec.pasos.map((p) => `<li>${p}</li>`).join('')}</ol></section>`).join('');
