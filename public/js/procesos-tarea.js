// Proceso paso a paso de cada tarea habitual del lanzamiento. Se pone como descripción de las tareas
// que aún no tienen ninguna (las ya creadas y las que se carguen después) para que quien la haga sepa
// exactamente qué hacer. Se reconocen por su título (sin mayúsculas ni tildes), aunque esté retocado.
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Cada proceso: objetivo, pasos y cuándo está terminada.
const p = (objetivo, pasos, listo) => `<p><strong>🎯 Objetivo:</strong> ${objetivo}</p><h3>Paso a paso</h3><ol>${pasos.map((x) => `<li>${x}</li>`).join('')}</ol><p><strong>✅ Está hecha cuando:</strong> ${listo}</p>`;

export const PROCESOS_TAREA = [
  { re: /crear el lanzamiento en (el dashboard|alquimia)/, html: p('que el lanzamiento nuevo exista en AlquimIA con sus fechas y etiquetas, para que todo lo que se mida sea de esta edición.', [
    'En AlquimIA, pulsa <strong>+ Nuevo</strong> (junto al selector de lanzamientos) y elige el formato (webinar, 2 o 3 clases…). Ponle un nombre claro, p. ej. «El Camino Octubre 2026».',
    'Abre <strong>Configuración → Datos básicos</strong> y rellena las fechas: inicio de captación, clases, directo y cierre del carrito.',
    'Ve a <strong>Configuración → Etiquetas</strong> y comprueba una a una: registro, VIP, compra (pago único y fraccionado), encuesta, llamada, y publicidad / orgánico. Tienen que ser las <strong>de esta edición</strong> (con la fecha nueva), no las del lanzamiento anterior.',
    'Si alguna etiqueta no existe aún en GHL, créala en GHL → <strong>Contactos → Etiquetas</strong> con el mismo nombre exacto.',
    'Mira la barra <strong>«Listo para lanzar»</strong> de Configuración: lo que salga en rojo es lo que falta.',
  ], 'el lanzamiento aparece en el selector, tiene todas sus fechas y todas las etiquetas están puestas y existen en GHL.') },

  { re: /duplicar los workflows/, html: p('que las automatizaciones de GHL (registro, recordatorios, compra…) funcionen con las etiquetas del lanzamiento nuevo.', [
    'En GHL → <strong>Automatización → Workflows</strong>, abre la carpeta del lanzamiento anterior.',
    'Duplica cada workflow (⋯ → <strong>Duplicar</strong>) y muévelo a una carpeta nueva con el nombre de esta edición.',
    'En cada copia, cambia el <strong>disparador</strong> y las acciones de «añadir / quitar etiqueta» por las etiquetas nuevas (están en AlquimIA: Configuración → Etiquetas).',
    'Revisa también fechas, enlaces y nombres que lleve dentro (emails, WhatsApp, esperas hasta una fecha concreta).',
    'Publica las copias y <strong>desactiva los workflows del lanzamiento anterior</strong> para que no se mezclen.',
    'Prueba: regístrate con un email tuyo y comprueba que te llega la etiqueta y el primer mensaje.',
  ], 'todos los workflows nuevos están publicados con las etiquetas nuevas, los antiguos apagados y la prueba de registro funciona.') },

  { re: /reunion de zoom/, html: p('tener la sala del directo creada y conectada con AlquimIA para medir la asistencia.', [
    'En Zoom, programa una reunión (o webinar) con la fecha y hora del directo. Activa la sala de espera solo si la vais a usar.',
    'Copia el <strong>ID de la reunión</strong> (los números, sin espacios) y el enlace de acceso.',
    'En AlquimIA → <strong>Configuración → Datos básicos</strong>, pega el ID en el campo de Zoom y guarda.',
    'Comprueba que el enlace del directo que reciben las leads (emails y WhatsApp) es el de esta reunión.',
  ], 'el ID está guardado en AlquimIA y el enlace de los mensajes lleva a esta reunión.') },

  { re: /revisar precios y enlaces de pago/, html: p('que cada botón de compra cobre lo que tiene que cobrar y etiquete a la compradora.', [
    'En AlquimIA → <strong>Configuración → Precios</strong>, comprueba el precio de la entrada VIP, del programa en pago único y en fraccionado.',
    'Abre cada enlace de pago (VIP, pago único y fraccionado) en una ventana privada y comprueba que el importe, el nombre del producto y el número de cuotas son correctos.',
    'Comprueba que cada pago pone la <strong>etiqueta de compra</strong> correcta en GHL (la de Configuración → Etiquetas). Si podéis, haz una compra de prueba y reembólsala.',
    'Revisa que los botones de la página de venta y de los emails llevan a estos enlaces.',
  ], 'los tres enlaces cobran el importe correcto, etiquetan bien y todos los botones apuntan a ellos.') },

  { re: /grupo de whatsapp/, html: p('tener el grupo de WhatsApp del lanzamiento listo para que las leads se unan desde la página de gracias.', [
    'Crea el grupo en WhatsApp (o en SendFlow, si lo usáis) con el nombre del lanzamiento y la foto de la marca.',
    'Ajustes del grupo: solo los administradores pueden enviar mensajes y editar la información.',
    'Copia el <strong>enlace de invitación</strong> del grupo.',
    'En AlquimIA → vista <strong>Grupo de WhatsApp</strong> (o Configuración → Captación), pega el enlace y guarda.',
    'Ábrelo desde el móvil para comprobar que entra al grupo correcto.',
  ], 'el enlace está guardado en AlquimIA y lleva al grupo nuevo.') },

  { re: /analizar con claude el lanzamiento anterior/, html: p('aprender del lanzamiento anterior antes de preparar este y decidir qué cambiar.', [
    'En AlquimIA elige el <strong>lanzamiento anterior</strong> en el selector.',
    'Ve a <strong>Tareas → 🧠 Análisis del lanzamiento</strong> y copia el prompt (lleva todas las cifras).',
    'Pégalo en Claude y lee el análisis: qué funcionó, qué falló y qué recomienda.',
    'Apunta en esta tarea (comentario) las <strong>3-5 decisiones</strong> para este lanzamiento: p. ej. cambiar el gancho de los anuncios, la hora del directo o los emails del carrito.',
    'Comparte esas decisiones con el equipo antes de empezar la preparación.',
  ], 'hay un comentario con las decisiones concretas y el equipo las conoce.') },

  { re: /poner fechas del directo, clases y cierre/, html: p('que la página preclase, las cuentas atrás y los desbloqueos de clases usen las fechas de esta edición.', [
    'En AlquimIA → <strong>Configuración → Datos básicos</strong>, revisa la fecha y hora del directo, de cada clase y del cierre del carrito.',
    'En <strong>Configuración → Preclase</strong>, revisa los textos: títulos de las clases, descripciones, recursos y la barra de progreso. Quita cualquier referencia a fechas antiguas.',
    'Abre la página preclase (botón «Abrir página») y comprueba que las cuentas atrás marcan las fechas nuevas.',
  ], 'todas las fechas son las de esta edición y los textos de la preclase están revisados.') },

  { re: /programar los emails del lanzamiento/, html: p('que todos los emails salgan el día y a la hora correctos de esta edición.', [
    'En AlquimIA → vista <strong>Emails</strong>, mira el calendario de emails del lanzamiento con sus fechas nuevas.',
    'En GHL → <strong>Marketing → Emails</strong> (o en los workflows), duplica los emails del lanzamiento anterior.',
    'En cada email cambia: fecha y hora de envío, fechas del texto, enlaces (preclase, directo, venta, pago) y el asunto si menciona fechas.',
    'Comprueba el <strong>segmento</strong> de cada envío: que vaya a la etiqueta de registro de esta edición y excluya a quien ya compró cuando toque.',
    'Envíate una prueba de cada email y revisa enlaces y aspecto en el móvil.',
  ], 'todos los emails están programados con fechas, enlaces y segmentos de esta edición y las pruebas se ven bien.') },

  { re: /revisar en el movil las paginas/, html: p('que las leads vean bien las páginas desde el móvil (es desde donde entra la mayoría).', [
    'Abre en tu móvil la <strong>página de registro</strong>: textos, fecha del directo, formulario y botón.',
    'Regístrate con un email tuyo y revisa la <strong>página de gracias</strong>: enlace al grupo de WhatsApp, siguientes pasos y vídeo si lo hay.',
    'Abre la <strong>página preclase</strong>: clases, cuentas atrás, recursos y que no haya nada cortado o descolocado.',
    'Apunta en un comentario cualquier fallo con una captura y quién debe arreglarlo.',
  ], 'las tres páginas se ven y funcionan bien en el móvil y no quedan fallos sin apuntar.') },

  { re: /activar las campanas de meta/, html: p('arrancar la publicidad y que AlquimIA mida solo la inversión de este lanzamiento.', [
    'En el Administrador de anuncios de Meta, revisa las campañas de esta edición: presupuesto, fechas, públicos y que los anuncios llevan los <strong>parámetros de URL</strong> (utm).',
    'Comprueba que el nombre de todas las campañas lleva un texto común del lanzamiento (p. ej. «CAMINO-OCT26»).',
    'Activa las campañas.',
    'En AlquimIA → <strong>Configuración → Captación</strong>, pon ese texto común en <strong>«Campañas de Meta de este lanzamiento»</strong> y guarda.',
    'Al día siguiente, mira en <strong>Publicidad</strong> que aparece la inversión y solo de estas campañas.',
  ], 'las campañas están activas y AlquimIA muestra su inversión (y solo la suya).') },

  { re: /revisar registros, coste por lead/, html: p('saber si la captación va a ritmo y corregir a tiempo.', [
    'En AlquimIA → <strong>Métricas</strong>, mira registros totales, registros por día y <strong>coste por lead (CPL)</strong>.',
    'Compáralo con los objetivos del <strong>Planificador</strong>: ¿vamos por encima o por debajo del ritmo necesario?',
    'En <strong>Publicidad</strong>, mira qué campañas y anuncios traen los leads más baratos y cuáles gastan sin traer.',
    'Decide y apunta en un comentario: subir presupuesto a lo que funciona, pausar lo que no, o preparar anuncios nuevos.',
  ], 'hay un comentario con las cifras de hoy frente al objetivo y las decisiones tomadas.') },

  { re: /subir los videos de las clases/, html: p('que las clases estén subidas y enlazadas antes de que se desbloqueen.', [
    'Sube el vídeo de cada clase a <strong>Vimeo</strong> (en la carpeta del lanzamiento) con el título de la clase.',
    'En Vimeo, ajustes de privacidad: <strong>oculto</strong> y que se pueda insertar en vuestras páginas.',
    'Copia la URL de cada vídeo.',
    'En AlquimIA → <strong>Configuración → Preclase</strong>, pega cada URL en su clase y guarda.',
    'En la página preclase, comprueba que cada vídeo se reproduce (puedes verlo como admin antes del desbloqueo).',
  ], 'todas las clases tienen su vídeo puesto en AlquimIA y se reproducen.') },

  { re: /comprobar que la clase 1 se desbloquea/, html: p('asegurar que la clase 1 está disponible a su hora y se ve bien.', [
    'A la hora de desbloqueo, abre la página preclase desde un móvil y en una ventana privada (como lo vería una lead).',
    'Comprueba que la clase 1 aparece desbloqueada, el vídeo se reproduce con sonido y los recursos se abren.',
    'Revisa que ha salido el email / WhatsApp de aviso de la clase.',
    'Si algo falla, avisa al momento en el grupo del equipo y apunta aquí qué pasó.',
  ], 'la clase 1 se ve bien en el móvil y el aviso ha salido.') },

  { re: /comprobar que la clase 2 se desbloquea/, html: p('asegurar que la clase 2 está disponible a su hora y se ve bien.', [
    'A la hora de desbloqueo, abre la página preclase desde un móvil y en una ventana privada.',
    'Comprueba que la clase 2 aparece desbloqueada, el vídeo se reproduce y los recursos se abren.',
    'Revisa que ha salido el aviso de la clase 2 (email / WhatsApp).',
    'Si algo falla, avisa al momento y apunta aquí qué pasó.',
  ], 'la clase 2 se ve bien en el móvil y el aviso ha salido.') },

  { re: /leads calientes de .?sett?(ing|eo) hoy/, html: p('hablar hoy con las personas con más intención de compra, cuando aún están calientes.', [
    'En AlquimIA → <strong>Setting hoy</strong>, mira la lista ordenada por puntuación (las de arriba son las más calientes).',
    'Abre la ficha de cada una para ver qué ha hecho: clases vistas, respuestas de la encuesta, visitas a la página de venta.',
    'Escríbele por WhatsApp con un mensaje personal (usa su nombre y algo de su encuesta). Puedes partir de los mensajes de <strong>Comercial → Mensajes de WhatsApp</strong>.',
    'Marca en AlquimIA a quién has contactado y apunta lo importante de cada conversación.',
    'Si alguna quiere hablar, agéndale la llamada.',
  ], 'has contactado a todas las de la lista de hoy y queda apuntado el resultado de cada una.') },

  { re: /plan b del directo/, html: p('tener una salida preparada por si la sala principal del directo falla.', [
    'Ten a mano un <strong>enlace genérico de Zoom</strong> de reserva (otra reunión creada para el mismo día y hora).',
    'En AlquimIA → <strong>Configuración → Códigos</strong>, copia el bloque <strong>«RECURSOS · plan B del directo»</strong>.',
    'En GHL, pégalo <strong>arriba de la página preclase</strong> y <strong>bajo el formulario de acceso</strong> al directo. Queda oculto hasta que se active.',
    'Explica al equipo cómo activarlo si hace falta (y quién lo hace).',
  ], 'el bloque está pegado en las dos páginas y el equipo sabe cómo activarlo.') },

  { re: /probar el enlace del directo/, html: p('evitar sorpresas el día del directo.', [
    'Abre el enlace del directo tal y como lo reciben las leads (desde un email o el WhatsApp) en el móvil y en el ordenador.',
    'Entra en la sala de Zoom: comprueba cámara, micrófono, compartir pantalla y la presentación.',
    'Revisa que la grabación está activada (en la nube) y quién será el anfitrión y el coanfitrión.',
    'Ten preparado el enlace de pago para compartir en el chat en el momento de la oferta.',
  ], 'el enlace funciona, la sala está probada y la grabación está activada.') },

  { re: /recordatorio del directo/, html: p('que el máximo de personas se conecte al directo.', [
    'Escribe en el grupo de WhatsApp los recordatorios del día: por la mañana, 1 hora antes y al empezar («¡Estamos en directo!»).',
    'Incluye siempre el <strong>enlace del directo</strong> y la hora.',
    'Comprueba que también han salido los emails y SMS de recordatorio de GHL.',
  ], 'los recordatorios han salido en el grupo con el enlace correcto.') },

  { re: /sincronizar la asistencia de zoom/, html: p('saber quién vio el directo (y cuánto) para el seguimiento del carrito.', [
    'Cuando termine el directo (mejor al día siguiente, cuando Zoom ya tiene el informe), abre AlquimIA en este lanzamiento.',
    'Pulsa <strong>Sincronizar Zoom</strong> (arriba). AlquimIA lee la asistencia y etiqueta a cada lead en GHL.',
    'Mira en <strong>Métricas</strong> o <strong>En directo</strong> cuántas asistieron y cuánto tiempo.',
  ], 'la asistencia aparece en AlquimIA y las leads tienen su etiqueta de asistencia.') },

  { re: /subir la grabacion/, html: p('que quien no pudo verlo en directo vea la grabación durante el carrito.', [
    'Descarga la grabación de Zoom (o espera a que esté en la nube) y súbela a <strong>Vimeo</strong>, oculta.',
    'Si hace falta, recórtala (quita el inicio de espera).',
    'En AlquimIA → <strong>Configuración → Grabación</strong>, pega la URL del vídeo y revisa la hora de desbloqueo.',
    'Abre la página de replay en el móvil y comprueba que se ve.',
  ], 'la grabación está en la página de replay y se ve bien.') },

  { re: /seguimiento por whatsapp\/llamada/, html: p('ayudar a decidir a quien vio el directo pero aún no ha comprado.', [
    'En AlquimIA → <strong>Setting hoy</strong>, filtra a las que vieron el directo y no han comprado.',
    'Empieza por las de mayor puntuación y las que visitaron la página de venta.',
    'Escríbeles por WhatsApp (o llámalas): pregunta qué les pareció y resuelve dudas sobre el programa, el precio o el pago fraccionado.',
    'Apunta el resultado de cada conversación y agenda llamadas a quien lo pida.',
    'Repite cada día del carrito con las nuevas.',
  ], 'todas las que vieron el directo y no compraron han recibido seguimiento y está apuntado.') },

  { re: /revisar ventas por dia del carrito/, html: p('saber si el carrito va a llegar al objetivo y reaccionar a tiempo.', [
    'En AlquimIA → <strong>Carrito</strong> y <strong>Métricas</strong>, mira las ventas de cada día y el total.',
    'Compáralas con el objetivo del <strong>Planificador</strong>.',
    'Si vamos por debajo, decide acciones: más seguimiento de setters, un email o directo extra, un bonus de última hora…',
    'Apunta en un comentario las cifras y las decisiones.',
  ], 'hay un comentario con ventas frente a objetivo y las acciones decididas.') },

  { re: /cerrar el carrito/, html: p('que nadie pueda comprar fuera de plazo.', [
    'A la hora del cierre, desactiva o cambia los <strong>enlaces de pago</strong> (VIP, pago único y fraccionado) en la pasarela.',
    'Cambia el botón de la página de venta por un mensaje de «carrito cerrado» (o la lista de espera).',
    'Abre los enlaces de pago en una ventana privada y comprueba que ya no dejan comprar.',
    'Comprueba que se han parado los emails y mensajes de venta.',
  ], 'ningún enlace de pago deja comprar y los mensajes de venta están parados.') },

  { re: /perfiles de compradoras/, html: p('entender quién compra para afinar mensajes y anuncios del siguiente lanzamiento.', [
    'En AlquimIA → <strong>Métricas</strong>, mira la tarjeta <strong>«Avatares de compradoras»</strong>: «En pocas palabras» y qué respuestas compran más.',
    'Apunta en un comentario las 3-5 conclusiones: quién compra, qué le duele, qué la convence.',
    'Pasa las más útiles a la ficha de <strong>Marca, producto y avatar</strong>.',
  ], 'hay conclusiones apuntadas y la ficha de avatar está actualizada.') },

  { re: /respuestas abiertas de la encuesta/, html: p('sacar ganchos y el lenguaje real de las compradoras para los próximos anuncios y emails.', [
    'En AlquimIA → <strong>Leads → Encuesta → 🧠 Analizar con Claude</strong>, copia el prompt.',
    'Pégalo en Claude y lee el resultado: ganchos, objeciones y frases literales.',
    'Copia los ganchos y las frases que mejor funcionen a la ficha de <strong>Marca, producto y avatar</strong>.',
  ], 'la ficha de marca tiene los ganchos y el lenguaje del avatar actualizados.') },

  { re: /informe final del lanzamiento/, html: p('dejar por escrito cómo fue el lanzamiento para mejorar el siguiente.', [
    'En AlquimIA, revisa <strong>Métricas</strong> (registros, CPL, asistencia, ventas, facturación) y <strong>Comparar</strong> con lanzamientos anteriores.',
    'Mira el cumplimiento de los objetivos del <strong>Planificador</strong>.',
    'Escribe el informe: cifras clave, qué funcionó, qué no y 3-5 aprendizajes para la próxima edición.',
    'Compártelo con el equipo (y con el cliente si toca) y pégalo o enlázalo en esta tarea.',
  ], 'el informe está escrito, compartido y enlazado aquí.') },

  // Tareas creadas a mano en lanzamientos anteriores
  { re: /nuevos anuncios.*guiones/, html: p('tener anuncios nuevos listos antes de que los actuales se cansen.', [
    'En AlquimIA → <strong>Avatar y anuncios</strong> (o <strong>Anuncios ganadores</strong>), mira qué anuncios funcionaron mejor y por qué.',
    'Usa los botones de prompts de guiones (vídeo) e imágenes estáticas: parten de la ficha de marca y de los ganadores.',
    'Escribe al menos <strong>3 guiones de vídeo</strong> y <strong>3 ideas de imagen</strong> con ganchos distintos.',
    'Pásalos a revisión (estado «Para revisar») y, una vez aprobados, a grabación / diseño.',
  ], 'los guiones e imágenes están aprobados y en producción.') },

  { re: /revision oferta .* precios|revisar la oferta/, html: p('confirmar la oferta y los precios antes de abrir la captación.', [
    'En AlquimIA → <strong>Configuración → Oferta</strong>, revisa entregables, bonus y garantía.',
    'En <strong>Configuración → Precios</strong>, revisa precio del programa, pago fraccionado y entrada VIP.',
    'Decide si hay cambios respecto al lanzamiento anterior (bonus nuevos, fechas límite, precio) y apúntalos aquí.',
    'Comprueba que la página de venta y los enlaces de pago reflejan exactamente esta oferta.',
  ], 'la oferta y los precios están confirmados y coinciden en AlquimIA, página de venta y pagos.') },

  { re: /edicion clases previas/, html: p('tener las clases 1 y 2 editadas y listas para subir.', [
    'Recoge los brutos de la grabación de cada clase.',
    'Edita: corta silencios y errores, añade intro y cierre, subtítulos y la llamada a la acción del final.',
    'Exporta en 1080p y pásalas a revisión (estado «Para revisar») con el enlace de descarga.',
    'Con el visto bueno, súbelas a Vimeo (ver la tarea «Subir los vídeos de las clases»).',
  ], 'las dos clases están aprobadas y subidas.') },

  { re: /reunion de coordinacion/, html: p('que todo el equipo sepa qué toca, quién lo hace y para cuándo.', [
    'Convoca al equipo (30 min) y comparte la vista <strong>Tareas</strong> del lanzamiento.',
    'Repasad fase por fase: tareas vencidas, bloqueadas y las de esta semana.',
    'Asegúrate de que cada tarea tiene responsable y fecha.',
    'Apunta en un comentario los acuerdos y los siguientes pasos.',
  ], 'cada tarea tiene responsable y fecha, y los acuerdos están apuntados.') },
];

// Proceso de una tarea por su título ('' si no hay ninguno).
export function procesoDeTarea(titulo) {
  const t = norm(titulo);
  return PROCESOS_TAREA.find((x) => x.re.test(t))?.html || '';
}

// La tarea con su proceso como descripción si aún no tiene ninguna (no pisa lo que haya escrito alguien).
export function conProceso(t) {
  if (!t || String(t.notas || '').replace(/<[^>]*>/g, '').trim()) return t;
  const html = procesoDeTarea(t.titulo);
  return html ? { ...t, notas: html } : t;
}

// ¿La descripción es el proceso de serie? (en los emails se resume en una línea para que no pesen).
export const esProcesoDeSerie = (t) => Boolean(t?.notas) && t.notas === procesoDeTarea(t.titulo);
export const NOTA_PROCESO_EMAIL = '<div style="font-size:13px;margin-top:4px;color:#7a6458">📋 Tiene el proceso paso a paso en su descripción, en AlquimIA.</div>';
