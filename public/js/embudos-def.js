// Tipos de embudo: qué pestañas pueden tener y la guía de lo que hay que preparar en GHL.
// Lo usan el navegador («＋ Nuevo embudo» y su ⚙️) y el servidor (para validar las pestañas).

export const PESTANAS = {
  lanzamientos: [
    { id: 'hoy', label: 'Setteo hoy', desc: 'A quién escribir hoy por WhatsApp, por prioridad' },
    { id: 'llamadas', label: 'Llamadas', desc: 'Llamadas de valoración: calendario, resultados y pipeline' },
    { id: 'leads', label: 'Leads', desc: 'Lista de registrados con su puntuación y estado' },
    { id: 'metricas', label: 'Métricas', desc: 'Registros, clases, VIP, directo, ventas, coste por lead…' },
    { id: 'objetivos', label: 'Objetivos', desc: 'Cuánto llevas de cada objetivo y a qué ritmo hay que ir' },
    { id: 'avatar', label: 'Avatar y anuncios', desc: 'Perfil de compradoras (encuesta) y anuncios ganadores' },
    { id: 'comparar', label: 'Comparar', desc: 'Comparar lanzamientos entre sí' },
    { id: 'tareas', label: 'Tareas', desc: 'Tareas del equipo con comentarios y avisos' },
    { id: 'calendario', label: 'Calendario', desc: 'Hitos, fases y eventos del lanzamiento' },
  ],
  vsl: [
    { id: 'vmetricas', label: 'Métricas', desc: 'Registros, visionado, llamadas, ventas y ROAS por fechas y semanas' },
    { id: 'vleads', label: 'Leads', desc: 'Cada persona con lo que ha visto y WhatsApp según su estado' },
    { id: 'llamadas', label: 'Llamadas', desc: 'Llamadas de valoración de la VSL' },
    { id: 'vanuncios', label: 'Anuncios ganadores', desc: 'Qué campañas, conjuntos y anuncios traen ventas' },
    { id: 'tareas', label: 'Tareas', desc: 'Tareas del equipo para esta VSL' },
  ],
};
export const pestanaIds = (tipo) => (PESTANAS[tipo] || []).map((p) => p.id);

// Guía: secciones { titulo, pasos[] } según el tipo y las pestañas elegidas (texto con <strong>/<code>).
export function guiaEmbudo(tipo, pestanas = pestanaIds(tipo), formato = 'webinar') {
  const on = (id) => pestanas.includes(id);
  const s = [];
  if (tipo === 'vsl') {
    s.push({ titulo: '1 · Etiquetas en GHL', pasos: [
      'En GHL → <strong>Contactos → Etiquetas</strong> crea (o reutiliza) las etiquetas del embudo. Necesitas como mínimo: <strong>registro en la VSL</strong> (p. ej. <code>registro-vsl-producto</code>) y <strong>compra desde la VSL</strong>. Opcionales: «ha entrado a la VSL», «pago fraccionado», «pago único», «publicidad» y «orgánico».',
      'En el <strong>formulario de registro</strong> (Sitios → Formularios) o en su workflow, añade la acción <strong>Añadir etiqueta → registro</strong>.',
      'En el <strong>workflow de compra</strong> (disparador: pedido o pago de tu pasarela) añade la etiqueta de compra. Si quieres medir ventas por fechas exactas, guarda también la fecha en un <strong>campo personalizado de tipo fecha</strong> («Fecha compra …»).',
      'Recomendado: un workflow que, al registrarse, guarde la fecha en un campo «Fecha registro VSL» (así el análisis por semanas es exacto aunque la persona ya existiera en GHL).',
    ] });
    s.push({ titulo: '2 · Páginas del embudo', pasos: [
      'Página de registro → al enviar, redirige a la página de la VSL añadiendo <code>?cid={{contact.id}}</code> al final de la URL (así se mide quién ve el vídeo).',
      'Página de la VSL: un bloque <strong>Código HTML</strong> con el código de <em>Configuración → Códigos para GHL</em>. El vídeo, el minuto en que salen los botones de compra y llamada y sus textos se cambian luego en <em>Páginas del embudo</em>.',
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
      'Página de registro y de gracias, página de <strong>login/recursos (preclase)</strong> y de <strong>grabación</strong>: en cada una, los bloques de <em>Configuración → Códigos para GHL</em>.',
      'Sube las clases y la grabación a <strong>Vimeo</strong> y pega sus URLs en la configuración del lanzamiento: se desbloquean solas a su hora y se mide cuánto ve cada persona.',
      'En los emails de GHL, los enlaces a recursos y al directo llevan <code>?cid={{contact.id}}</code> (los tienes listos para copiar).',
    ] });
    const nv = { v2: 2, v3: 3, plf: 4 }[formato];
    if (nv) s.push({ titulo: `${s.length + 1} · Los ${nv} vídeos del lanzamiento${formato === 'plf' ? ' (PLC 1-4)' : ''}`, pasos: [
      `Cada vídeo tiene las mismas casillas que un webinar: <strong>día y hora</strong>, <strong>Zoom</strong> (solo si ese vídeo es en directo), <strong>página</strong> y <strong>vídeo de Vimeo</strong> y desde cuándo se ve. En el ${formato === 'plf' ? 'PLC 4' : `vídeo ${nv}`} se hace la venta: con él se abre el carrito.`,
      'Crea en GHL <strong>una página por vídeo</strong> con el bloque de vídeo de <em>Códigos para GHL</em> (<code>data-lsd-video="replay2"</code>, <code>replay3</code>…): así se mide cuánto ve cada persona de cada vídeo.',
      'La página preclase manda sola a cada vídeo cuando toca. En los emails de cada vídeo usa el enlace de su página con <code>?cid={{contact.id}}</code>.',
      'La preclase (clases 1 y 2) es aparte y funciona igual que en el webinar; si no la usas, deja vacías sus fechas.',
    ] });
    if (on('hoy') || on('leads')) s.push({ titulo: `${s.length + 1} · Setteo y WhatsApp`, pasos: [
      'Los leads se puntúan solos con lo que hacen (clases, VIP, directo, grabación). Revisa los textos de WhatsApp en <em>Setteo hoy → Mensajes de WhatsApp</em>.',
      'Para el webinar en directo con Zoom: crea una app <strong>Server-to-Server OAuth</strong> en Zoom y añade sus claves en Cloudflare (ver la guía del cliente). Así «Sincronizar Zoom» marca quién asistió.',
    ] });
    if (on('llamadas')) s.push(guiaLlamadas('los lanzamientos'));
    if (on('avatar')) s.push({ titulo: `${s.length + 1} · Encuesta del avatar`, pasos: [
      'Crea en GHL una <strong>encuesta</strong> (Sitios → Encuestas) con las preguntas del perfil y que, al enviarse, ponga la etiqueta de «encuesta rellenada».',
      'Las respuestas se guardan en campos personalizados del contacto: el perfil de compradoras sale de esos campos.',
    ] });
    if (on('metricas') || on('avatar') || on('objetivos')) s.push(guiaMeta());
    if (on('objetivos')) s.push({ titulo: `${s.length + 1} · Objetivos`, pasos: ['En la configuración de cada lanzamiento pon los objetivos de registros, VIP, ventas y facturación: la pestaña calcula el ritmo necesario hasta cada fecha.'] });
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
