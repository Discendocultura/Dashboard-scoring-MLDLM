// «¿Y ahora qué?»: los siguientes pasos al crear un embudo o un lanzamiento. Salen en la pantalla de
// enhorabuena y en el email que recibe quien lo ha creado (mismo texto en los dos sitios).
//   embudo: { tipo, nombre, paginasOrigen, waOrigen, preclase } · launch: el lanzamiento recién creado (o null)
// → [{ icono, titulo, detalle }]
//   tagExiste: la etiqueta de registro ya está en GHL (entonces solo hay que ponerla en el formulario)
export function siguientesPasos({ embudo = {}, launch = null, tagExiste = false } = {}) {
  const pasos = [];
  const add = (icono, titulo, detalle) => pasos.push({ icono, titulo, detalle });
  const paginasCero = embudo.paginasOrigen === 'cero';
  const waCero = embudo.waOrigen === 'cero';
  const paginas = () => (paginasCero
    ? add('🧱', 'Crea las páginas en GHL', 'En Plan → Páginas tienes el prompt de cada página y su URL. Al pegarlas en GHL, en cada sección pulsa «Extender sección» y pon a 0 los márgenes y el relleno.')
    : add('🔗', 'Conecta tus páginas', 'Pega en cada página de GHL su código del dashboard (Configuración → Códigos). Así se miden las visitas, los vídeos y las compras.'));
  const anuncios = (filtro) => add('📣', 'Prepara los anuncios', `En Plan → Anuncios tienes los guiones, los prompts de imagen y los copys. En Meta, pon ${filtro ? `«${filtro}»` : 'el código'} en el nombre de la campaña para que el dashboard cuente la inversión.`);

  if (embudo.tipo === 'lanzamientos' || launch) {
    const l = launch || {};
    add('✅', 'Revisa la configuración', 'Abre Configuración: la barra «Listo para lanzar» te marca en rojo lo que falta (oferta, precios, etiquetas…).');
    if (l.registroTag) add('🏷️', tagExiste ? `Pon la etiqueta «${l.registroTag}» en el formulario` : `Crea la etiqueta «${l.registroTag}» en GHL`, `${tagExiste ? 'Ya existe en GHL. ' : ''}Ponla en el formulario de registro (el de orgánico y el de anuncios) para que cada registro entre en este lanzamiento.`);
    paginas();
    add('🎥', l.zoomMeetingId ? 'Revisa la sala de Zoom' : 'Crea la sala de Zoom', l.zoomMeetingId
      ? `Ya está creada (ID ${l.zoomMeetingId}) con registro obligatorio. Comprueba en Zoom el anfitrión y la grabación.`
      : 'Crea la reunión con registro obligatorio y pega su ID en Configuración → Directo.');
    add('💬', 'Monta el grupo de WhatsApp', l.sendflowId
      ? `La campaña de SendFlow ya está creada y vinculada: crea sus grupos y pega el enlace de entrada en Configuración.${waCero ? ' Los mensajes, con Plan → Grupo de WhatsApp.' : ' Revisa los mensajes copiados (están en borrador) y prográmalos.'}`
      : waCero
      ? 'Crea la campaña en SendFlow, pega su enlace en Configuración y escribe los mensajes con Plan → Grupo de WhatsApp (ya llevan las URLs de tus páginas).'
      : 'Crea la campaña en SendFlow y pega su enlace en Configuración. Revisa que tus mensajes lleven los enlaces de este lanzamiento.');
    anuncios(l.metaFiltro || '');
    add('🗓️', 'Reparte las tareas', 'En Plan → Tareas asigna a cada persona lo suyo con fecha. Cada una lo verá en su «Hoy» y en su calendario.');
  } else if (embudo.tipo === 'vsl') {
    add('🏷️', 'Pon las etiquetas de GHL', 'En la configuración de la VSL elige la etiqueta de registro y la de compra (y el calendario si hay llamada).');
    paginas();
    anuncios('');
    add('🧪', 'Haz un registro de prueba', 'Regístrate tú en el formulario: si aparece en Leads, todo está conectado.');
  } else if (embudo.tipo === 'meteorico') {
    add('⚡', 'Configura la oferta', 'Precio, cuenta atrás y bonus: el dashboard genera la página de la oferta con sus tiempos.');
    add('🔗', 'Pega el código en GHL', 'En la página de la oferta, el código del dashboard (Configuración → Códigos).');
    add('📨', 'Avisa a tu lista', 'Programa los emails y mensajes que llevan a la oferta mientras está abierta.');
  } else if (embudo.tipo === 'directa') {
    add('🛒', 'Pon el producto y los precios', 'En la configuración: producto, precio, bumps y, si los hay, upsell y downsell.');
    paginas();
    anuncios('');
    add('🧪', 'Haz una compra de prueba', 'Con un cupón del 100 % o en modo prueba: si sale en Métricas, todo está conectado.');
  } else {
    paginas();
    anuncios('');
  }
  return pasos;
}
