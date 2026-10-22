# Dashboard de lead scoring para lanzamientos

Muestra todos los leads de un lanzamiento (por etiqueta de GHL), lo que ha hecho cada uno
(clases pre-webinar, VIP, directo, grabación), su **puntuación y estado** y un botón para
**abrir WhatsApp con el mensaje adecuado**. Todo con planes gratuitos (Cloudflare Pages): no usa webhooks de GHL.


**Nombre en pantalla**: en todo lo que ve el usuario (botones, avisos, emails, Telegram, el conector de Claude y las tareas de serie) se habla de **AlquimIA**, nunca de «dashboard» (con su logo donde ya hay marca: acceso y barra de arriba). Por dentro siguen los nombres técnicos (`dashboardUrl`, la etiqueta `equipo-dashboard`, el scope `dashboard` del conector y `/api/dashboard/resumen` de LabIA) para no romper nada; las tareas antiguas con «en el dashboard» siguen reconociéndose.
## Cómo funciona

GHL es la única base de datos. Cada cosa que hace un lead se guarda como **etiqueta** en su
contacto con el formato `<código>_<señal>` (p. ej. `nov26_clase1_90`). El dashboard lee
las etiquetas y calcula la puntuación. Puedes usar esas mismas etiquetas en workflows de GHL.

| Señal | Etiqueta | Cómo se captura |
|---|---|---|
| Registrado | la que elijas | formulario de GHL (lo que ya haces) |
| VIP | la que elijas | tu checkout de GHL (lo que ya haces) |
| Clase 1 / Clase 2 / Grabación | `<código>_clase1_25` … `_clase1_90` (25, 50, 75, 90), igual para `clase2` y `replay` | `tracker.js` en la página de GHL: cuenta los segundos realmente vistos en Vimeo y avisa al 25%, 50%, 75% y 90% |
| Pulsó el enlace al directo | `<código>_directo_click` | enlace puente `/directo` |
| Asistió al directo | `_directo_asistio`, `_directo_60` (+60 min), `_directo_final` | botón **Sincronizar Zoom** (informe de participantes) |
| Contactado por WhatsApp | `<código>_wa_enviado` | al pulsar el botón de WhatsApp |

### Puntuación (0-100)

| Acción | Puntos |
|---|---|
| Cada clase pre-webinar: 25% / 50% / 75% / 90% | 4 / 8 / 12 / 15 |
| Compra VIP | 30 |
| Directo: asistió / +60 min / hasta el final | 15 / +10 / +15 |
| Grabación: 25% / 50% / 75% / 90% | 10 / 20 / 30 / 40 |
| Pulsó el enlace al directo, pero no consta su asistencia | 5 |

Directo y grabación **no se suman**: cuenta el mejor de los dos (son la misma clase).
Estados: 🔴 **Muy caliente** ≥70 · 🟠 **Caliente** ≥40 · 🟡 **Templado** ≥15 · 🔵 **Frío** <15.
Los pesos están en `public/js/scoring.js` (`POINTS` y `ESTADOS`).

**Con recursos de preclase** (música, test o votación), los 100 puntos se reparten así: clases 20 · música 5 · test 10 · votación 5 · VIP 25 · directo/grabación 35 (los bloques que el lanzamiento no tiene se quitan y el resto se reescala a 100). Música: le dio al play 1/3, más del 50 % 2/3, más del 90 % entera. Los lanzamientos sin estos recursos siguen con el reparto de siempre (clases 30 · VIP 30 · vídeo 40).

### Mensaje de WhatsApp

1. **Ver grabación**: aún no ha visto el 50% de la grabación (ni estuvo en el directo hasta el final).
2. **Oferta Raíces**: ha visto ≥50% de la grabación.
3. **Venta / llamada**: estuvo en el directo hasta el final o vio ≥90% de la grabación.

Los textos se editan en **Setting hoy → 💬 Mensajes de WhatsApp** (abajo del todo). Los ve todo el que tiene «Setting hoy» y los cambia quien tiene el permiso **Editar mensajes de WhatsApp** (de serie: Setter y Técnico; se ajusta en Equipo → Roles y permisos), con su botón «Guardar mensajes». Los enlaces llevan el
`cid` del lead para seguir midiendo lo que hace después.

### ¿Qué significa "hasta el final" en el directo?

Que seguía conectado en los últimos 15 minutos de la reunión (cuando se presenta la oferta)
y estuvo al menos 20 minutos en total.

### Pestaña «Etiquetas GHL» (Configuración)
Todas las etiquetas del lanzamiento están en *Configuración → Etiquetas GHL*, en tres bloques:
- **🔄 Cambian en cada lanzamiento**: registro y encuesta rellenada (avisa si repites la de otra edición).
- **📌 Fijas**: compra VIP, compra del programa, llamada agendada, publicidad / orgánico y pago único / fraccionado (más el campo de fecha de compra y la «foto» de quién ya las tenía).
- **🤖 Automáticas**: las que pone el dashboard con el código delante (clases y vídeos vistos, directo, WhatsApp, resultado, foto). Solo informativo: no hay que crearlas.

Cada etiqueta que no exista en el GHL del cliente se marca con un aviso al momento.

### VIP y compras: etiquetas fijas entre lanzamientos

Las etiquetas de **compra VIP**, **compra del programa** y, si existe, **compra en directo** son siempre las
mismas. GHL no guarda cuándo se puso una etiqueta, así que al **crear un lanzamiento** el dashboard hace una
"foto": marca con `<código>_vip_previo` / `_compra_previo` / `_compradirecto_previo` a quien ya las tenía. Si la etiqueta (VIP, compra…) es **nueva y solo de este lanzamiento** (p. ej. `et-entrada-vip-29octubre26`), no hace falta foto: en el aviso «Falta la foto», el botón «es una etiqueta nueva de este lanzamiento» la da por hecha sin marcar a nadie (hacerla con ventas ya hechas marcaría como «anterior» a quien acaba de comprar).
Esas personas aparecen como "VIP anterior" o "Clienta anterior" y no cuentan en las métricas del lanzamiento.
**Crea el lanzamiento en el dashboard antes de abrir la venta de la VIP.** Si alguien que ya era VIP vuelve
a comprarla, no se puede distinguir solo con la etiqueta, así que no cuenta en este lanzamiento.

### Ventas en directo y del lanzamiento (campo "Fecha compra Raíces")
En la configuración del lanzamiento se elige el **campo de fecha de compra** (se propone "Fecha compra Raíces"),
el **inicio de captación** (día en que se abren los registros) y el **día del directo**:
- Una compra es **de este lanzamiento** si la fecha de compra es igual o posterior al inicio de captación y anterior
  al inicio de captación del siguiente lanzamiento. Si la fecha es anterior, es una clienta anterior.
- Es **venta en directo** si la fecha de compra coincide con el día del directo.
- Si un contacto tiene la etiqueta de compra pero no tiene la fecha rellena, se usa la "foto" de clientas anteriores.

### Tráfico frío / templado
Un registro es **templado** si el contacto ya existía en GHL antes del inicio de captación, porque ya había entrado por
otro embudo (lanzamientos anteriores, VSL, newsletter…). Si es nuevo, es **frío**. Las métricas muestran el % de las
ventas que viene de cada tipo (los dos suman 100%) y la conversión de cada uno.
Además, en *Métricas → Consumo de vídeos*, **Asistencia y consumo por tipo de tráfico**: cada paso (clases empezadas y
enteras, VIP, clic y asistencia al directo, hasta el final, grabación empezada y entera, compra; o cada vídeo en los
lanzamientos de varios vídeos) en % **global**, **frío**, **templado**, **publicidad** y **orgánico** (sobre los registros de
cada grupo), con las diferencias frío − templado y publi − orgánico en puntos. Frío/templado necesita el inicio de
captación; publicidad/orgánico, sus etiquetas. La tarjeta de asistencia
también enseña el % de frío y de templado junto al global.

**Aspecto general:** las fichas de cifras se reparten solas según el ancho (sin títulos partidos en tres líneas), las tarjetas del Inicio alinean sus datos en rejilla, las subpestañas (Setting hoy / Llamadas, las categorías de Métricas, las de Plan…) son botones con aire, su icono en un cuadradito y la activa marcada en color (en móvil, una fila que se desliza), los avisos de anuncios del Inicio salen en lista por anuncio y el botón «Agencia» va abajo a la izquierda en escritorio (solo icono en móvil) para no tapar nada.

### Pestaña Hoy
Lo del día, en tres subpestañas: **Setting hoy** (a quién escribir hoy por WhatsApp, por prioridad), **Llamadas** (calendario, resultados y pipeline) y **En directo** (el día del webinar, minuto a minuto). Al entrar abre la última que usaste en ese embudo; el número rojo de la pestaña son las llamadas pendientes de anotar. Si un embudo o un rol solo tiene una (p. ej. las VSL, que solo tienen Llamadas), entra directamente.

**Setting hoy**: una sola lista ya ordenada por prioridad (el número de la izquierda es su puesto). Primero el motivo más urgente (inició el pago → visitó la página de venta → muy caliente sin contactar → VIP → en el grupo de WhatsApp → vio la grabación → seguimiento → contactada sin resultado) y, dentro de cada motivo, de más a menos puntuación. Cada fila lleva el color de su temperatura (rojo muy caliente, naranja caliente, amarillo templado, azul frío) y su motivo; arriba se filtra por temperatura o por motivo (con el número de leads de cada uno) y se ven de 40 en 40 con «Ver más».

**Ficha completa del lead** (Hoy → Llamadas): al pulsar una llamada se abre una ventana con todo lo que ayuda a la setter antes de llamar: cuándo es la cita y su etapa, teléfono / WhatsApp / email, la **temperatura** (estado y puntuación sobre 100) y el siguiente paso, **qué ha hecho** (cada clase, VIP, directo y grabación, encuesta, si ya se le escribió, si compró), origen (publi / orgánico), tráfico frío / templado, avatar y días desde el registro, las **respuestas de la encuesta**, las **respuestas del formulario de reserva de la llamada y el resto de campos de su ficha de GHL**, y las últimas **notas** de GHL. Desde ahí se anota el resultado.

### Inicio de la agencia: el donut lleva a cada cliente

En el resumen de arriba, «N necesita atención», «N a vigilar» y «N en orden» son botones: filtran «Salud de los clientes» a ese grupo y bajan hasta allí (con «Ver todos los clientes» para quitar el filtro). Debajo salen los clientes que necesitan atención o vigilar, con su primer motivo («2 críticos del auditor»…); al pulsar uno, baja a su tarjeta y la resalta.

### Operativa de la agencia («el Asana de operativa»)

Se abre **a pantalla completa** (arriba, «← Volver al inicio» y el resumen del día: abiertas, vencidas, para hoy y bloqueadas) desde el **Inicio de la agencia** (tarjeta y botón «🗂️ Operativa») y desde el botón **Operativa** de la barra de arriba (el equipo de la agencia: superadmin o usuarios marcados como «de la agencia»; y los admin de cada proyecto, con lo suyo). **No es otra lista**: lee las tareas que ya existen en cada embudo de cada cliente (`lsd_tareas_<código>`, una lectura por cliente) y las del **proyecto «Agencia»** (lo interno que no es de ningún cliente: `lsd_operativa_agencia`, común). Lo que se cambia aquí se guarda en su proyecto.

- **Quién ve qué**: cada persona, solo lo que tiene asignado (a su nombre o a su rol en ese cliente); el superadmin, todo, con filtros por proyecto y por persona. La API (`/api/operativa`) lo aplica también al cambiar: nadie toca tareas que no son suyas.
- **Estados** (tres columnas): **Pendiente** · **Para revisar** (esperando el visto bueno: guiones, ediciones, emails…) · **Hecho**. **Bloqueada** no es una columna sino una marca con su motivo (p. ej. «esperando al cliente»): se pone y se quita desde la ficha («⛔ Marcar como bloqueada» / «Desbloquear»), la tarjeta sigue en su columna con un borde naranja y su motivo, y cuenta en el resumen de arriba. Las tareas antiguas «en curso» o «bloqueadas» pasan a Pendiente (las bloqueadas, con su marca). Las tareas de cada lanzamiento usan los mismos estados.
- **Filtros**: **cliente** y, dentro del cliente, **embudo** (🚀 Lanzamientos, 🎬 VSL, 🛒 venta directa, ⚡ meteóricos, con las tareas abiertas de cada uno): con el cliente se ve todo lo suyo y con el embudo solo lo de ese embudo. El segundo desplegable empieza por «Todos los proyectos» (todo lo del cliente). Además, persona (superadmin) y buscador. Cada tarea trae su embudo del servidor (`embudoDeCodigo` en `lib/operativa.js`).
- **Tableros de cada proyecto** (`public/js/tableros.js`, `lsd_operativa_tableros`, común a la agencia): al elegir un cliente, el Tablero enseña sus tableros: el **General** (todas sus tareas, también las de sus lanzamientos) y los que cree el superadmin («＋ Nuevo tablero»: p. ej. «Contenido», «Anuncios»). Cada tablero tiene **sus columnas** (hasta 10; «⚙️ Columnas de…» para renombrar, añadir, ordenar y quitar) y al menos una **«cuenta como hecha»**: llevar una tarea ahí la marca como hecha (y sacarla, la reabre). **Plantillas**: «📐 Guardar como plantilla» guarda las columnas y, al crear un tablero en cualquier proyecto, «Empezar con» la plantilla. Las tareas guardan `opTablero` / `opColumna` (si su tablero o columna ya no existe, vuelven al General / a la columna que les toca por su estado). En la ficha, la fila **Columna** lleva a cualquier columna de su tablero y el superadmin la cambia de **Tablero**. «＋ Nueva tarea» pide proyecto y tablero: las de un cliente creadas aquí se guardan en la lista de la Operativa con su `proyecto` (salen en ese cliente, embudo «Tareas de la Operativa»). Con «Todos los clientes», el tablero sigue por estado (Pendiente · Para revisar · Hecho).
- **Tableros en una columna a la izquierda**: con un cliente elegido, sus tableros salen en vertical, como un menú lateral («TABLEROS» y cuántos hay): cada uno con su icono (🗂️ General, 📋 propio, 🚀 el del lanzamiento en curso), su nombre (hasta dos líneas), las tareas abiertas y ⭐ si es el de por defecto; el abierto, resaltado con una barrita del color de la marca. Debajo, «＋ Nuevo tablero» e «Importar tablero». A la derecha, el tablero abierto con su **cabecera** (icono, nombre, cuántas abiertas, «✏️ Editar» y «☆ Por defecto»). Se reordenan arrastrando arriba o abajo. En el móvil, la columna pasa a una fila deslizable encima del tablero.
- **Ancho de las columnas, guardado en tu cuenta**: arrastrando el borde derecho de una columna se cambia su ancho (doble clic, el de serie). Se guarda **en la cuenta de cada persona** (`lsd_op_anchos_<usuario>`, `POST /api/operativa { op: 'mis-anchos' }`; `GET` lo devuelve como `misAnchos`), por tablero, así que sale igual en todas sus sesiones y aparatos; el navegador guarda una copia para pintarlo al momento y, la primera vez, sube los anchos que ya tuviera. En el móvil no se usa.
- **⬆️ Importar tablero** (superadmin; botón arriba, junto a «＋ Nueva tarea», y en la barra de tableros; en la vista previa se elige el cliente): sube un `.json` y crea un tablero nuevo con sus columnas y todas sus tareas (descripción con formato, fecha, responsable si está en el equipo de la agencia —por nombre o email—, subtareas como checklist, prioridad). Vale el formato propio (`{ formato: 'tablero-operativa', nombre, columnas: [{ nombre, hecha }], tareas: [{ titulo, notas, fecha, columna, asignado, checklist }] }`) o el **export JSON de un proyecto de Asana** (cada sección es una columna; las completadas, solo si se marca). Antes de crear enseña la vista previa (columnas y cuántas tareas van a cada una). Una sola escritura para todas las tareas. Código: `public/js/tableros-import.js`. El contenido se sube desde el dashboard: nunca va en el repositorio.
- **Etiquetas, prioridad, checklist y tareas que se repiten** (en la ficha de cada tarea): **etiquetas** comunes a toda la agencia (`etiquetas` dentro de `lsd_operativa_tableros`; cualquiera del equipo las crea con nombre y uno de 9 colores, sin duplicar nombres; el superadmin las borra), hasta 6 por tarea. **Prioridad** alta / media / baja (en cada columna van primero las de prioridad alta y después por fecha). **Checklist** de pasos (hasta 30) con barra de progreso en la tarjeta. **Se repite** (cada día, día laborable, semana, 2 semanas, mes o cada N días): al completarla (✓, columna de hecho o desde su lanzamiento) pasa a hechas y se crea **otra igual** (descripción, etiquetas, responsable, prioridad, checklist sin marcar, tablero) con la **siguiente fecha a partir de la planificada** que no haya pasado; solo una vez por tarea (`repeticionCreada`), aunque se reabra y se vuelva a completar. **Día concreto** (`public/js/repetir-ui.js`, también en la Biblioteca de procesos): cada semana → qué días (uno o varios: «lunes y jueves»); cada 2 semanas → qué día; cada mes → el mismo día que su fecha, un día del mes («el 5», «el último día»; en los meses cortos, el último que tenga) o «el primer / segundo / tercer / cuarto / último lunes…». Si la fecha de la tarea no cae en el día elegido, la ficha lo dice y ofrece «📅 Pasarla al …» (el próximo día que toca). Encima del tablero, **filtro por etiqueta** y «🔥 Prioridad alta».
- **Filtros y columnas**: arriba solo **Tablero · Calendario · Mi día** (cliente, embudo y persona se eligen en los desplegables, en forma de píldora con icono y resaltados cuando filtran). Cada columna tiene **＋** en su cabecera y **«＋ Añadir tarea»** abajo: se escribe el título y con Intro se crea ya en esa columna (Mayús+Intro, salto de línea; Esc, cerrar); con «Todos los clientes» abre la ficha para elegir el proyecto. **Al completar** (✓ o al llevarla a la columna de hecho), el check salta, sale una ráfaga de colores, la tarjeta brilla en verde y se va, y aparece en «Hecho» con su animación de llegada.
- **Diseño del tablero**: columnas con su color, tarjetas con portada del color de su primera etiqueta (o de la prioridad), etiquetas en píldoras, fecha en chip, 🔁 si se repite y avatar. Animaciones: las tarjetas entran escalonadas al abrir o cambiar de tablero, se levantan al pasar el ratón, se inclinan al arrastrarlas, la columna se ilumina al soltar, al completar hay un destello verde y la tarjeta se va, y la copia que se crea brilla con un aviso abajo. Con «reducir movimiento» del sistema, sin animaciones.
- **Orden dentro de cada columna**: arrastra una tarjeta arriba o abajo (una raya marca dónde va a quedar; también al soltarla en otra columna) o usa ⤒ ↑ ↓ ⤓ en la ficha (sirve en el móvil). El orden se guarda para todo el equipo; las tareas que nadie ha colocado van detrás, por prioridad y fecha.
- **Tableros**: las pestañas se ordenan arrastrándolas (superadmin) y con «✏️ Editar» se cambia el nombre del tablero (también el General) y de sus columnas. El nombre de una tarea se cambia con ✏️ junto al título en su ficha. El círculo ✓ de cada tarjeta se ve siempre (apagado) y se enciende en verde al pasar por encima o al completarla.
- **Nada de lo escrito se pierde**: mientras se escribe la descripción, un comentario o una tarea nueva, cambiar otra cosa de la ficha (fecha, repetición, prioridad, etiquetas…) repinta la ficha pero conserva lo escrito (`borrador` en `operativa-panel.js`). Al cerrar la ficha con la descripción a medias, se guarda sola.
- **Perfil «Solo Operativa»** (rol fijo `operativa`, como «Cliente»): se da en el Equipo de cada proyecto. Al entrar ve solo un Inicio con dos tarjetas, **Operativa** y **Biblioteca de procesos**, y el botón Operativa arriba: ni embudos, ni lanzamientos, ni ninguna métrica. En la Operativa ve y trabaja **todas las tareas de su proyecto** (estado, fechas, comentarios, descripción, crear tareas), sin crear tableros ni repartir. La biblioteca la ve **en solo consulta** (los procesos generales y los de su proyecto). El servidor lo bloquea en todo lo demás (`requireSession` sin `operativa: true` → 403; no pide ni `/api/config`; el conector de Claude no le da datos de ese cliente).
- **Solo lo que tiene el lanzamiento**: los prompts cuentan únicamente los recursos de la preclase que ese lanzamiento tiene activados en Configuración (clases, test, votación, audio, descargable, comentarios), y la voz del público solo incluye comentarios si los tiene (`preclaseIncluye`).
- **Prompts más afilados** (emails, WhatsApp, anuncios y páginas; `public/js/voz.js`). A cada prompt se le añade:
  1. **La voz real del público**: las respuestas libres de la encuesta (agrupadas, anónimas, las de quien compró marcadas `[COMPRÓ]`), los comentarios de la preclase y los motivos de las llamadas perdidas. Salen de los leads ya descargados en el navegador (los de ese lanzamiento o, si aún no hay, del anterior del mismo embudo).
  2. **Lo que funcionó** en los lanzamientos anteriores del mismo embudo (ver «🏆 Qué funcionó»), solo lo de ese canal.
  3. **La revisión antes de entregar**: versiones con ángulos distintos (3 asuntos por email, 3 versiones por anuncio, 3 titulares por página), una lista de comprobación por canal, las palabras que suenan a IA o a plantilla (`NUNCA_DIGAS`), nada inventado y cuál recomienda y por qué. El prompt de imágenes de Magnific no lleva nada de esto.
- **🏆 Qué funcionó** (Análisis → Comparar, en cada lanzamiento): al cerrarlo, el equipo apunta el ángulo que más vendió, el mejor email, mensaje de WhatsApp, anuncio y página, y lo que no funcionó. Se guarda en el lanzamiento (`aprendizajes`) y entra en los prompts de los siguientes lanzamientos de ese embudo.
- **Bienvenida con contraseña propia**: al dar de alta a alguien (o reenviarle el acceso), su contraseña queda como temporal (`claveTemporal`). La primera vez que entra ve una pantalla de bienvenida (pasos «Tu contraseña → Tu marca (si le toca) → Tu dashboard») para elegir la suya: al menos 8 caracteres con letra y número, repetida, con medidor de seguridad y el ojo para verla. Al guardarla (op `mi-clave-inicial`, solo mientras siga con la temporal) pasa a la ficha de marca si la tiene asignada y después a su dashboard. La temporal deja de valer.
- **👁️ Ver como** (solo el superadmin): en **Agencia → Equipo de la agencia** (también en «Personas de los proyectos») y en el **Equipo** de cada proyecto, cada persona tiene «👁️ Ver como». Abre el dashboard **exactamente como lo ve esa persona** (sus clientes, su rol, su Inicio, su Operativa…), con una barra morada arriba y «← Volver a mi cuenta». Es **solo para mirar**: mientras dura, el servidor rechaza cualquier cambio (`lib/router.js`). Va en una segunda cookie firmada que dura 4 horas como mucho y que solo pone un superadmin (`verComoCookie` / `verComoUid` en `lib/auth.js`, `handlers/vercomo.js`); con una cookie inventada no pasa nada. Salir de la cuenta también la borra.
- **Inicio para todo el equipo**: quien no ve las métricas (o en un cliente sin embudos) tiene un **Inicio de trabajo**, sin ninguna cifra de ventas: la tarjeta grande de la Operativa, **sus tareas de hoy y las vencidas** (asignadas a su nombre; pulsando una se abre en la Operativa), sus embudos para entrar y «Te han mencionado» (`pintarInicioTrabajo`). Quien ve las métricas sigue con el Inicio de siempre.
- **Proyecto sin embudos**: la tarjeta grande «🗂️ Operativa» sale también encima de «Este cliente aún no tiene embudos» (y ya no se suma «Crea tu primer lanzamiento»), además del botón de arriba.
- **Proyecto por defecto**: con un cliente elegido, **«☆ Por defecto»** junto a su nombre hace que la Operativa se te abra siempre en él (cada persona el suyo, guardado en el servidor: `proyectoDefecto`, op `mi-proyecto-defecto`). Se quita pulsando «⭐ Por defecto».
- **Filtro de tiempo** en el tablero: **Todas · Hoy · Esta semana · Quincena · Mes**. Con un plazo, salen las tareas con fecha dentro (y las vencidas sin hacer, que siguen pendientes; las hechas, solo si su fecha cae en el plazo; las sin fecha, no). Se recuerda en el navegador (`enRango` en `public/js/operativa.js`).
- **Cerrar pulsando fuera**: la ficha de la Operativa se cierra al pulsar fuera; también la ventana de una tarea de un proyecto (si se había cambiado algo, se guarda antes).
- **Tablero de cada embudo** (🚀): en la Operativa de cada cliente hay un tablero por embudo, con el **nombre del lanzamiento en curso** y **solo sus tareas** (las de Plan → Tareas; lo que se cambie aquí se guarda allí). No se guarda como los demás: sale de las tareas (`tablerosEmbudo`, id `e-<embudo>`). Al crear otro lanzamiento en el mismo embudo, el tablero pasa a ser el del nuevo y sus tareas «se reinician» (las del anterior siguen en su Plan → Tareas, pero ya no salen en la Operativa). Dos embudos distintos tienen cada uno su tablero. Un meteórico que cuelga de un lanzamiento va en el tablero de ese lanzamiento. **Es el mismo tablero que Plan → Tareas**: sus columnas son las fases del tipo de embudo (lanzamiento: Preparación, Captación, Clases previas, Webinar en directo, Carrito abierto, Cierre y análisis; VSL / venta directa y meteórico, las suyas), las columnas extra que haya creado la admin y **✅ Completadas** (`columnasEmbudo` en `public/js/tableros.js`; la columna de cada tarea sale de su `fase`). Arrastrar una tarjeta a otra fase le cambia la fase (y en Plan → Tareas se ve ahí), a «Completadas» la da por hecha, y «＋ Añadir tarea» en una fase la crea en ese lanzamiento con esa fase (`crearTareaEmbudo` en `lib/operativa.js`). Sus columnas no se editan desde aquí, pero se puede marcar «por defecto».
- **Mover columnas**: en el tablero de un proyecto, quien lo gestiona arrastra la **cabecera** de una columna a un lado u otro (una raya marca dónde queda) y se guarda el nuevo orden.
- **Fecha límite sin abrir la tarea**: en cada tarjeta, pulsando su fecha (o «📅 Fecha» si no tiene) sale un menú con atajos (Hoy, Mañana, Este viernes, Próximo lunes, En una semana), un calendario para «Otra fecha» y «Quitar la fecha».
- **Mencionar a una persona con «@»** (Operativa: descripción y comentarios; en las tareas de cada proyecto, en la descripción, y en sus comentarios con «@Nombre» como siempre): la lista sale agrupada en 👤 personas (las que pueden estar en esa tarea: la agencia y la gente del proyecto), 📝 tareas y 🗂️ tableros. A la persona mencionada en la Operativa le llega un email con el texto (en la descripción, solo la primera vez que se la menciona). Cada enlace lleva delante qué es y su color: **📝 Tarea** (naranja), **🗂️ Tablero** (azul) y **@persona** (verde); la tarea y el tablero llevan ahí al pulsarlos. Referencia `#persona:<uid>` (`personasEn`, `comentarioPlano` en `public/js/enlaces.js`; `avisarMencionOp` en `lib/operativa.js`).
- **Enlazar tareas y tableros con «@»**: en la descripción (editor) y en los comentarios, tanto en la Operativa como en las tareas de cada proyecto, escribe `@` y parte del nombre: sale una lista con tareas y tableros (de todos los proyectos que ves; en un proyecto, también las personas para mencionarlas). El enlace se ve como una píldora (📝 tarea, 🗂️ tablero) y al pulsarlo abre esa tarea o ese tablero (si es de otro cliente o de la Operativa, se abre la Operativa). En los comentarios se guarda como `@[Título](#tarea:…)`; en los emails queda como texto.
- **Ancho de las columnas**: arrastra el borde derecho de una columna para hacerla más ancha o estrecha (para leer bien su nombre; al pasar el ratón por el nombre se ve entero). Se recuerda en este navegador, por tablero; doble clic en el borde la deja como estaba. En el móvil no se usa.
- **Admin de un proyecto**: quien es **admin** de uno o más clientes (sin ser de la agencia) también entra en la Operativa, **solo con sus proyectos**: en su Inicio tiene la tarjeta grande «🗂️ Operativa de tus proyectos» y arriba el botón **Operativa**. Ve todas las tareas de sus proyectos (no las internas de la agencia), las reparte (el «Responsable»: el equipo de la agencia y quien tiene acceso a sus proyectos), las ordena, las mueve de tablero y crea, edita, ordena y borra los tableros de sus proyectos. Importar tableros, plantillas y borrar etiquetas siguen siendo del superadmin (`proyectosQueGestiona`, `visiblesOperativa`, `puedeOperativa` en `lib/operativa.js`; `/api/me` devuelve `operativa`). Si solo lleva un proyecto, la Operativa se abre directamente en él.
- **Responsable**: se puede elegir a cualquiera del equipo de la agencia y a cualquier persona con acceso a ese proyecto (sale en el grupo «Del proyecto»); al dar de alta a alguien en el equipo de un cliente, ya aparece. **Sin abrir la tarea**: pulsando el círculo del responsable en la tarjeta sale la lista de personas y se cambia ahí mismo (quien gestiona ese proyecto). La **descripción** va justo debajo de los datos de la tarea y se ve como un campo de texto grande («✍️ Escribe aquí la descripción…»); pulsándola se edita (los enlaces de dentro se abren sin entrar a editar).
- **Tablero por defecto**: en cada proyecto, quien gestiona sus tableros pulsa **«☆ Marcar por defecto»** en un tablero: al entrar en la Operativa de ese proyecto se abre siempre ese tablero (lleva ⭐ en su pestaña). Pulsando «⭐ Por defecto» se quita y vuelve a abrirse el General (`porDefecto` en `lsd_operativa_tableros`, op `tablero-defecto`).
- **Siempre a mano**: el botón **Operativa** está en la barra de arriba (con su nombre) en Inicio y en cualquier embudo. En el Inicio de la agencia, **Operativa** y **Biblioteca de procesos** son las dos tarjetas grandes justo debajo del resumen.
- **Diseño propio de la Operativa**: arriba a la derecha, el chip **🎨 Clásico / 🚀 Espacial** elige el diseño de la Operativa independiente del del dashboard (p. ej. el dashboard en espacial y la Operativa en clásico). Se aplica al abrirla y al cerrarla vuelve el de siempre (`LSD_ESTILO.temporal` en `tema.js`); sin elegir, el mismo del dashboard. Se recuerda en este navegador.
- **Se entra siempre por el 🗂️ Tablero.** 🗓️ **Calendario**: el mes de lunes a domingo con cada tarea en su día (color del cliente; vencidas en rojo, hechas tachadas, 👀 para revisar, ⛔ bloqueadas). **Arrastrar una tarea a otro día cambia su fecha**; las que no tienen fecha están abajo para arrastrarlas a su día. Pulsar una tarea abre su ficha. En el móvil se ve como agenda (solo los días con tareas).
- **Vistas**: ☀️ **Mi día** (vencidas, hoy, esta semana, más adelante, sin fecha y las hechas de los últimos días) · 📁 **Por proyecto** (semáforo: algo bloqueado / con retraso / al día, abiertas, vencidas, bloqueadas y las vencidas más antiguas) · 🗂️ **Tablero** por estado (arrastrando las tarjetas, o con el «✓» de cada tarjeta para completarla sin abrirla) · 👥 **Por persona** (solo superadmin: carga y vencidas de cada uno).
- **Ficha** de cada tarea en un panel lateral: estado, fecha, responsable (lo reparte el superadmin), **descripción con formato** (negrita, cursiva, títulos, listas, pasos numerados, enlaces y vídeos; editor en `public/js/editor-rico.js`, lo puede cambiar el superadmin o quien la tiene asignada) y comentarios. En las tarjetas del tablero se ve un adelanto de la descripción. «＋ Nueva tarea» crea tareas de la agencia o del tablero de un cliente.
- **Avisos por email**: al asignar una tarea a alguien, y **cada mañana** (con la tarea programada de la agencia, una vez al día) a cada persona del equipo de la agencia con sus tareas vencidas, las de hoy y las bloqueadas (`lib/operativa.js`).

### Tus atajos (antes «Accesos rápidos») de cada proyecto

En el menú lateral de cada cliente, debajo de *Inicio*, **🔗 Tus atajos**: un clic abre el panel con los enlaces del proyecto en tarjetas (icono y nombre del servicio según el dominio: Drive, Sheets, GHL, Meta, Canva, Notion, Vimeo, Zoom…) y otro clic abre el enlace en otra pestaña. Buscador sin tildes (escribir + Intro abre el primero). Quien puede configurar añade enlaces pegando la URL («＋ Añadir un enlace»; sin nombre, coge el del servicio) y en «✏️ Ordenar y editar» los ordena (↑ ↓), les pone **grupo** (salen agrupados) y nota, y los quita; el admin puede marcar alguno como **solo admin** (no lo ve el resto del equipo). Se guardan por cliente (`lsd_atajos`, `/api/atajos`; solo `http(s)://`, hasta 80). Es distinto de *Configuración → Accesos y enlaces* de cada lanzamiento.

### Procesos: de la agencia y de cada cliente

**Dos pestañas** arriba del panel «📚 Procesos» (botón «📚 Procesos» arriba y en el lateral, para todo el equipo; en el portal del rol Cliente, botón «📚 Procesos»):

- **🏢 De la agencia**: la biblioteca de la agencia (abajo). En la ficha de cada proceso, el superadmin tiene el interruptor **«Compartir con todos los clientes»** (`compartido`, queda en la actividad); la tarjeta lleva «🤝 Compartido». Cualquier persona con acceso a un cliente ve aquí **solo los compartidos**, en solo consulta y sin el trabajo interno de la agencia: el servidor quita responsable, fecha, repetición, comentarios, actividad y proyectos antes de enviarlos. El perfil «Solo Operativa» ve, además de los suyos, los compartidos.
- **📁 De <cliente>**: los **procesos internos de ese cliente**, separados de los del resto (`lsd_procesos_cliente`, que no es una clave común: cada cliente tiene la suya). Los ve y los edita cualquiera con acceso a ese cliente (también el rol Cliente) y el superadmin; el responsable se elige entre su equipo (sin superadmins). No hay proyectos, ni «compartir», ni vaciar, ni importar; cada uno borra sus comentarios (el admin, cualquiera). **«＋ Nuevo proceso» es un asistente paso a paso** (para que nadie se pierda; también lo usa «Desde cero» en los procesos de la agencia), con la barra de 7 pasos arriba, «Atrás / Siguiente», en cada paso una explicación corta y un «💡 Ver un ejemplo»: 1 · **categoría** (obligatoria): tarjetas con las secciones que ya hay, las sugeridas que aún no existen (📣 Marketing, 💰 Ventas, 📦 Entrega, 💬 Atención al cliente, 🧾 Administración, 👥 Equipo) y «＋ Nueva categoría» con su nombre; si es nueva, se crea la sección al crear el proceso → 2 · **responsable** (tarjetas con el equipo o «Nadie todavía») → 3 · **en qué consiste**: nombre (obligatorio), para qué sirve y cuándo se hace o qué lo pone en marcha → 4 · **paso a paso**: una casilla numerada por paso (Intro añade el siguiente, ✕ lo quita); salen como subtareas para ir marcando → 5 · **material**: trucos y enlaces, y un vídeo de Loom, YouTube, Vimeo o Bunny (opcional) → 6 · **cuándo**: fecha y «se repite» (opcional; si se repite sin fecha, empieza el próximo día que toque) → 7 · **revisa y crea**. La descripción del proceso se arma sola con los apartados «🎯 Para qué sirve», «⏰ Cuándo se hace», «🪜 Paso a paso» y «💡 Trucos y enlaces». Al crear se abre su ficha.

La pestaña se recuerda; por defecto, el superadmin abre la de la agencia y el resto la de su cliente. API: `GET /api/procesos?ambito=agencia|cliente` y `ambito` en el cuerpo de cada POST.

#### Biblioteca de la agencia

**Solo procesos generales.** «＋ Nuevo proceso» pregunta cómo crearlo: **✍️ desde cero** o **📥 importar de un tablero** (eliges cliente, tablero y la tarea; se copian su título, su descripción y su checklist como subtareas, y en la actividad queda de qué tarea salió). **🗑️ Vaciar biblioteca** (arriba a la derecha de la lista) borra todos los procesos y secciones tras escribir `VACIAR`; el estado anterior queda en el historial de cambios por si hubiera que recuperarlo.

Desde el **Inicio de la agencia** (tarjeta «📚 Biblioteca de procesos» y botón «📚 Procesos» arriba) y desde Cuenta → **Procesos** (editarla, solo el superadmin; el resto solo ve los compartidos, como se explica arriba). Es el «cómo se hace» de todo, común a todos los clientes (`lsd_procesos` en el cliente `_agencia`): secciones a la izquierda con su número de procesos, buscador (sin tildes), tarjetas con insignias (🎬 vídeo, 🔗 enlaces, ✍️ por documentar) y la ficha de cada proceso con los pasos, los vídeos dentro (Vimeo, **Bunny**, YouTube, Loom) y los enlaces en otra pestaña. Se edita ahí mismo (negrita, títulos, listas, pasos numerados, enlaces y vídeos), se crean secciones y procesos nuevos y se **importa un archivo .json** (por ejemplo, el «Sistema Operativo» de Asana): los procesos con el mismo id se sustituyen y el resto se queda.

Cada proceso es **como una tarea de Asana**: título editable, **responsable** (del equipo de la agencia), **fecha** que puede **repetirse** (cada día, días laborables, cada semana, cada 2 semanas, cada mes o cada N días; al marcarla como hecha pasa sola a la próxima fecha y las subtareas se reinician), sección, **descripción** con texto, enlaces y vídeos, **subtareas** con barra de progreso, **comentarios** (con enlaces) y **toda la actividad** (quién cambió qué y cuándo). **Proyectos**: cada proceso es **general** (para todos los proyectos) o de uno o varios **proyectos** (los clientes del dashboard: Discendo, Me lo dijo la matrona…). Se elige en la ficha («🌐 General (todos)» o los proyectos que sean) y arriba a la izquierda se filtra por proyecto: al elegir uno se ven sus procesos y los generales (o «Solo los generales»); se recuerda. Para no ir uno a uno, «🏷️ Asignar estos N procesos a un proyecto…» aplica el proyecto a todos los que se ven (sección, búsqueda y filtros), o los hace generales. Todo se guarda al momento. En la lista: filtros «Míos», «Con fecha» y «Vencidos», y en cada tarjeta la fecha (roja si está vencida), las subtareas, los comentarios y el responsable. Al reimportar el archivo se actualiza el contenido sin perder fechas, subtareas ni comentarios.

**El contenido no está en el código**: el repositorio es público, así que los procesos (enlaces a Drive y Vimeo, nombres del equipo…) solo viven en la base de datos del dashboard. Formato del archivo: `{ origen, secciones: [{ id, titulo }], procesos: [{ id, seccion, titulo, html, asana }] }` (modelo en `public/js/procesos.js`).

### Marca, producto y avatar como proceso (Cuenta → Marca y avatar)

Ya no son pestañas mezcladas: es un proceso por etapas, como la configuración de los embudos (`pasosEquipo` y `estadoProceso` en `public/js/marca.js`, panel en `public/js/marca-panel.js`):

1. **La marca**: identidad, tono y estilo visual.
2. **Producto y avatar**: por cada producto, su oferta y su cliente ideal (＋ para añadir otro).
3. **Documentos** (opcional).
4. **Ficha con Claude** de cada producto.
5. **Embudos**: qué vende cada uno (con un solo producto, ya está).

A la izquierda (arriba en el móvil), el carril con cada paso: ✓ hecho, cuántas preguntas van respondidas y un anillo con el progreso total. Cada paso se abre con su cabecera (etapa, paso N de M, anillo del paso), entra deslizándose y el paso que se completa hace «pop». Abajo, «Siguiente: …». Al final, si falta algo, la lista de lo que queda (pulsando se va directo); si está todo, **confeti** y un resumen de lo que ya sale con la voz de la marca. El enlace para el cliente queda plegado arriba («Que lo rellene el cliente»). El cuestionario del cliente también termina con confeti. El confeti está en `public/js/confeti.js` (lo usa también «¡Enhorabuena!» al crear un embudo).

### Avatares de compradoras en lenguaje sencillo

Análisis → Avatar: arriba, las cifras de partida en frases («1850 personas registradas», «8 de cada 100 compra la VIP»); después «En pocas palabras», con las conclusiones escritas («Las que responden X compran casi el doble que la media»); los perfiles que más compran con frases en vez de índices; y, respuesta a respuesta, «X de Y personas compran» con una barra y una etiqueta en palabras (Compra más · Como la media · Compra menos · Aún pocas personas). Los textos salen de `public/js/avatares-texto.js`.

### Informe diario: CPL del día, CPL general y CAC

- **Captación**: el email trae el **CPL de ayer** (lo gastado ayer en Meta ÷ registros de ayer; sin Meta, la inversión de ayer sale de la diferencia con la foto del día anterior) y el **CPL general** (inversión total ÷ registros totales), en las tarjetas, en «Publicidad» y en el asunto. Las tarjetas van de 3 en 3 (con 4, dos y dos) para que se lean en el móvil.
- **Venta (carrito)**: tarjeta propia de **CAC** (inversión ÷ ventas) y también en el asunto.
- El **resumen diario de leads** (el otro email de cada mañana, `lib/digest.js`) lleva lo mismo: CPL de ayer y CPL general en captación, CAC en carrito.

### Color de contraste del diseño clásico: el del logo
Botones, pestañas activas, anillos de progreso, enlaces y resaltados usan el **naranja del matraz del logo de AlquimIA** (de `#ffab00` a `#ff4b00`): `--accent: #f05200` y `--accent-2: #ff9500` en modo día; `#ff6a10` y `#ffab00` en modo noche (`public/styles.css`, al principio). Antes era marrón (`#b4552d`). El color de cada cliente (Agencia → Clientes) no cambia.

### Cabecera de AlquimIA: siempre «espacial»
En el diseño **clásico** la cabecera de arriba (logo, cliente, Auditor, Operativa, Procesos, Mi negocio, avisos y cuenta) va siempre **oscura, con un brillo azul a la izquierda y estrellas**, como la de LabIA; el resto de la página sigue clara. Con el diseño espacial no cambia nada. Solo CSS: `.topbar` con los colores del espacial (`public/styles.css`, al final).

La tarjeta de **LabIA** del menú lateral también lleva ese fondo espacial (oscuro, brillo azul y estrellas), en los dos diseños.

### 🧭 Navegación (barra superior y menú lateral)
- **⚙️ Configuración, dentro de tu perfil** (la foto de arriba a la derecha): ya no sale suelta en la barra superior (también está en el menú lateral). Al pulsarla en el menú del perfil se despliega ahí mismo con sus apartados (`#tb-menu-ajustes`, `abrirMenuConfig`).
- **Barra superior.** Agencia: logo · **selector** (🏢 Agencia / cliente ▾) · **ADMIN** · buscador · 🔔 · ❓ · ⚙️ **Configuración** · tu foto. Cliente: logo · buscador · 🔔 · ❓ · ⚙️ · tu foto.
  - **Selector de cliente** (`pintarSelectorCliente`): la primera opción es «🏢 Agencia · todos los clientes» (solo el superadmin, que es quien tiene esa vista), separada con una línea de los clientes. La agencia lo ve siempre; quien no es de la agencia, solo si tiene más de un negocio (los suyos, sin Agencia). La etiqueta **ADMIN** (o AGENCIA) solo la ve la agencia.
  - **⚙️ Configuración** (antes «Mi negocio»): solo ajustes del cliente: Productos, Marca y avatar, Equipo, **Conexiones y atajos** (Conexiones y Atajos · Drive, GHL y enlaces, lo que antes era «Tus atajos») y **Plantillas de WhatsApp** (antes «Mensajes de WhatsApp»). Sin número encima.
  - **❓ Ayuda**: además del recorrido, la ayuda de la pantalla y los primeros pasos, **«Volver a ver las ayudas»** (sale del menú de cuenta).
  - **Tu cuenta**: arriba a la derecha, tu foto (o tus iniciales). Dentro: «Nombre · Rol», Mi cuenta, Cambiar contraseña, **Apariencia** (Clásico / Espacial y modo día / noche), una línea y Salir.
- **Menú lateral** (igual para agencia y cliente, siempre del cliente elegido): Inicio · Operativa · Inteligencia de negocio · Procesos · **EMBUDOS** (cada embudo concreto: cada lanzamiento y cada meteórico por separado, nunca la categoría, con su icono por tipo y un subtítulo corto: su estado —«Captación · empieza el 21 oct», «Carrito abierto», «Cerrado»— y, en cuanto se han cargado los datos del Inicio, lo facturado: «Carrito abierto · 8.210 €») · ＋ Nuevo embudo · ⚙️ Configuración (despliega sus apartados) · LabIA ↗ en pequeño, con el fondo espacial de su cabecera (estrellas y azul noche) en cualquier diseño y modo. Sin «Agencia» (está en el selector), sin «Tus atajos» (está en Configuración) y sin subtítulos en las secciones fijas. Pulsar un lanzamiento abre ese lanzamiento en su embudo (`itemsSidebar`, `pintarSidebar`).
- **El Auditor sale de la navegación** (ni en el lateral, ni en Configuración, ni en la campana).
- **Enlaces de antes**: `#mi-negocio` y `#configuracion` abren Configuración; `#productos`, `#marca`, `#equipo`, `#conexiones`, `#atajos` / `#tus-atajos`, `#mensajes-whatsapp` / `#plantillas-whatsapp`, su apartado; `#agencia`, la vista de agencia; `#inteligencia-negocio`, `#operativa` y `#procesos`, lo suyo (`ALIAS_NAV`). El buscador encuentra todo con los nombres nuevos y los viejos («mi negocio», «tus atajos», «mensajes de whatsapp»…).
- **Onboarding**: el recorrido enseña el lateral (Operativa, Inteligencia y Procesos) y ⚙️ Configuración; los primeros pasos y «Mostrar poco a poco» apuntan a sus sitios nuevos.

### Cabecera limpia y siempre igual (también en la Operativa)
- Arriba solo: **Mi negocio** (menú), **❓ Ayuda**, **🔔 Notificaciones** y **Mi cuenta** (menú). **Mi negocio** tiene dos bloques: *Tu día a día* (**Operativa**, **Procesos**, **Auditor**) y *Este cliente* (Equipo, Marca y avatar, Productos, Conexiones, Mensajes de WhatsApp). Si el Auditor tiene avisos críticos, su número sale también en el botón «Mi negocio». Sale siempre (Operativa y Procesos son de todos); dentro, cada uno ve lo que su rol puede tocar. En el móvil siguen en el menú ☰.
- **La Operativa se abre debajo de la cabecera de AlquimIA** (que sigue a la vista y se puede usar: Mi negocio, Mi cuenta, avisos…), sin velo y **con el mismo diseño que el resto** (ya no tiene su propio selector Clásico / Espacial): no parece otra aplicación. «← Volver al inicio» o Esc la cierran; en el móvil, el menú ☰ también (`dlg.show()` no modal y `--op-top` en `public/js/operativa-panel.js`).
- De paso: un directo que empieza muy tarde (p. ej. a las 23:30) ya no «acaba» a las 00:00: el directo dura hasta medianoche y, como poco, 3 horas desde que empieza (`momentosVideo` en `public/js/page.js`).

### 🎯 Anuncios → UTMs: qué tipo de lead trae cada campaña, conjunto y anuncio
- **«Crear anuncios con IA» está ahora en la pestaña Crear** (Crear → Anuncios, junto a Páginas, Emails e Imágenes); en Anuncios quedan Cómo van, Ganadores y UTMs. Si el lanzamiento aún no ha empezado a captar, UTMs lo dice (con la fecha) en vez de una tabla vacía, y recuerda que las campañas de Meta deben llevar el código del lanzamiento en el nombre y los parámetros de URL.
Subpestaña nueva en **Anuncios** de los lanzamientos, las VSL y la venta directa (`public/js/utms.js`, pruebas en `test/utms.test.js`). Agrupa a cada persona por sus UTM (utm_campaign › utm_term › utm_content; los nombres salen de Meta) y enseña, **en orden como un embudo**, cuántos dan cada paso y su %:
- **Lanzamiento**: Leads → Rellenó la encuesta → Vio alguna clase → Entrada VIP → Fue al directo → Compró el producto (Raíces).
- **VSL**: Leads → Vio el vídeo → Vio el 75% → Agendó llamada → Compró (en el periodo elegido).
- **Venta directa**: Compras → Con extras (bump / upsell) → Compró el producto principal.
- Arriba, el embudo de todos los leads y **🏆 los 3 anuncios que traen el lead más cerca de la compra**. Se ve en árbol (campaña › conjunto › anuncio, desplegable), o solo conjuntos o solo anuncios; se ordena por **💸 leads más baratos** (menor CPL; el gasto de Meta se encuentra aunque las UTM lleven el nombre en vez del id), **🎯 más cerca de la compra** (0-100: pesan más los pasos finales; con menos de 10 leads, orientativo ≈), **✅ más compras** o **🧬 avatar comprador** (los que traen leads cuyas respuestas a la encuesta se parecen más a las de quien compra; al elegirlo, aprende de todos los lanzamientos anteriores). Al pasar el ratón por un número, lo que ha costado cada uno (con la inversión de Meta). «↻ Actualizar» vuelve a leer GHL en el momento. La fila «Sin UTM» junta orgánico y enlaces sin parámetros.
- **🚦 Calidad del lead (encuesta)**: cada lead se compara con quien compra (las mismas cifras que «Avatar comprador»: cuántas veces más compra quien da cada respuesta; con pocas ventas aún, con quien compra la VIP). 🟢 sus respuestas se parecen a las de quien compra (≥ 1,25 veces la media) · 🟡 en la media · 🔴 se parecen a las de quien no compra (< 0,8). Por fila: el color medio, el % en verde y la barra verde/ámbar/rojo; con menos de 5 respuestas, orientativo.

### Pestaña «Comercial» y acción recomendada
- **«Comercial» es la primera pestaña en todos los embudos** (como en los lanzamientos).
- **Venta directa → Comercial**: tres subpestañas con el mismo aspecto que en un lanzamiento: **Setting hoy** (las compradoras que aún no tienen el producto principal, con su WhatsApp escrito y su etapa), **Llamadas** (las del calendario de reservas — nuevo campo «Enlace para reservar llamada» en la configuración — que se mueven en **el pipeline elegido en este embudo**, el de la oportunidad de compra, o «Leads evergreen») y **LabIA**. La ficha de cada llamada enseña la compra (fecha, importe, extras y si ya tiene el principal). En **Setting hoy** cada compradora es una tarjeta amplia: bloque grande con el día de compra, iniciales, nombre y etapa, teléfono y email, etiquetas separadas y, debajo de una línea, los botones **WhatsApp** y **Llamar** a la izquierda y un recuadro **«Mover a»** (etapa, nota y Guardar) a la derecha; las etapas de arriba son píldoras con su color y su número. En el móvil todo se apila a lo ancho.
- **Venta directa → Compradoras**: arriba, bien visible, **«🎯 X compradoras aún no tienen Raíces»** con el % que ya ha dado el paso, una barra, lo que supondría que el 10 % diera el paso y el botón «📞 Escribirles ahora» (lleva a Comercial → Setting hoy).
- **Roles y permisos, onboarding y «＋ Nuevo embudo» al día**: permisos agrupados como las pestañas (Comercial, Leads y métricas, Anuncios, Crear, Plan, Análisis…); en el nuevo embudo las pestañas salen en el mismo orden y con los mismos nombres que en AlquimIA; recorridos y ayudas con «Comercial», Anuncios → UTMs y Crear → Anuncios.
- La pestaña **«Hoy» se llama ahora «Comercial»** en todos los embudos (Setting hoy, Llamadas, En directo, LabIA…).
- **Al terminar el recorrido de burbujas**, un pop-up con **la acción recomendada** (la misma lógica que «Tu siguiente paso»: conectar el CRM, crear o configurar el embudo, la marca, ver los leads…; a las setters, «Empieza por Comercial») con un botón que lo hace al momento (`popupAccionRecomendada` en `public/js/app.js`, `despuesDelTour` en `public/js/onboarding.js`).

### 🔍 Auditoría (seguridad, eficiencia y errores)
- **Seguridad**: el ejemplo (donde todos entran como admin) ya no da acceso a nada común de la agencia (equipo, seguridad, clientes, historial, Operativa…) ni a credenciales reales (SendFlow, Zoom, Meta, Telegram, setter, conector de Claude): `VETADOS_EJEMPLO` en `lib/router.js`. `/directo` tiene límite de intentos por IP al registrarse por email. Un cliente que no existe responde un 404 genérico (no sirve para adivinar clientes). `/api/health` solo da el detalle de variables con sesión de admin. Con «Ver como», Claude se conecta a nombre de quien de verdad está. «¿Olvidaste tu contraseña?» tiene su propio contador por IP (no bloquea el login de la oficina). Los informes al cliente se marcan antes de enviarse (no se repiten si la ejecución se corta) y va uno por pasada.
- **Eficiencia (gastar menos con el mismo resultado)**: la inversión de Meta se guarda en caché compartida (6 h los rangos cerrados, 10 min si llegan a hoy); el conector de Claude devuelve JSON compacto (máx. 60.000 caracteres), los 6 últimos lanzamientos salvo que se pidan todos y 40 emails; el prompt de la ficha de marca lleva solo los documentos de ese producto (40.000 caracteres por documento, 160.000 en total) y el servidor solo lee esos; el prompt de la encuesta, 30.000 caracteres (primero lo más repetido y lo de quien compró); el ETag del setter ya no cambia cada minuto; la campanita pide las tareas de todos los embudos en una sola petición; el «editando» late cada 35 s; LabIA guarda también la lista de pipelines.
- **Errores**: el nuevo embudo ya no crea un webinar si no se han contestado las 2 preguntas; sin CRM conectado, un aviso amable en vez del error técnico de GHL; al salir del Inicio por un atajo solo se ven las pestañas desbloqueadas; la burbuja «Nuevo ✨» se reintenta si no se pudo enseñar; en el ejemplo no salen botones de editar, funciona la Ayuda y el desplegable dice «Ejemplo»; la contraseña general de setter también puede ver el ejemplo; el recorrido espera también a que cierres la configuración; fechas en hora de España; «/» no se come la tecla con ventanas abiertas; los avisos de personas atascadas no se dosifican y se refrescan cada hora; Esc en el primer acceso = «Lo haré luego»; los meteóricos cuentan como configurados con su etiqueta de compra.

### 🌱 Que AlquimIA no abrume a quien empieza (admin nuevo con acceso completo)
Se mantienen todos los nombres de siempre (embudo, VSL, CPL, ROAS, setter, closer…): lo que cambia es **cuánto se ve a la vez**. La lógica está en `public/js/primeros-pasos.js` (con pruebas en `test/primeros-pasos.test.js`) y la pantalla en `public/js/app.js`.
- **Primer acceso, una pregunta por pantalla**: la contraseña; si su CRM (GHL) aún no está conectado, «Conectamos tu CRM» (lo hace la agencia, no toca nada técnico); y «¿Qué quieres hacer primero?» con 3 tarjetas (*Un lanzamiento*, *Un embudo siempre abierto*, *Vender a mis alumnos*). Si ya tiene embudos: «Este es tu embudo». Si lo implementa la agencia: «Revisa que esto está bien». El recorrido de burbujas empieza después (si eligió crear, al cerrar la ventana del nuevo embudo).
- **Mostrar poco a poco** (solo admins nuevos): el primer día ven su embudo con **Hoy · Leads · Métricas** y, en «Mi negocio», Equipo y Marca. El resto aparece cuando tiene sentido (Plan y Crear cuando el embudo está configurado; Anuncios cuando hay leads; Llamadas con calendario; Análisis con 2 lanzamientos; Inteligencia de negocio y Productos cuando hay ventas…, o con los días) con la etiqueta **«Nuevo ✨»** y una burbuja que lo explica. **«👀 Ver todo»** (en las pestañas, en el Inicio y en el menú ❓) lo enseña todo ya. Se guarda en su progreso del onboarding (`pasos['u-<id>']`, `tours['vn-<id>']`), sin cambios en el servidor.
- **Inicio → «Tu siguiente paso»**: una sola tarjeta grande (fondo espacial) con lo siguiente que le toca: CRM → crear o revisar su embudo → configurarlo → Marca → ver sus leads → crear algo con IA. Sustituye a la píldora de «Primeros pasos» mientras dura.
- **Embudo de ejemplo con datos inventados** (cliente `ejemplo`): un lanzamiento webinar, una VSL y un meteórico de «Programa Raíces» con leads y ventas de mentira (GHL simulado siempre, `lib/ejemplo.js`). Es **solo para mirar**: el servidor rechaza cualquier cambio (salvo el progreso del onboarding de cada uno) y la lista de usuarios sale vacía. Arriba, una barra «Estás viendo un ejemplo… ← Volver a lo mío». Se entra desde el primer acceso, «Tu siguiente paso», el menú ❓ o «🧪 Ver un ejemplo» del lateral, que desaparece cuando su embudo está configurado o al pulsar ✕.
- **＋ Nuevo embudo con 2 preguntas**: ¿tu venta tiene fecha? ¿se cierra por llamada o directa? → «Te encaja: …» con el porqué (con fecha + llamada → reto; con fecha + directa → webinar; siempre abierto + llamada → embudo de llamadas; siempre abierto + directa → VSL). **«Ver todos los tipos»** abre la lista completa de siempre.
- **🛠️ Implementa la agencia** (extra de pago): interruptor por cliente en Agencia → Clientes (solo superadmin). Si está marcado, el cliente ve «La agencia está montando tus embudos» y después «Revisa que esto está bien» en vez de «Crea tu primer embudo».
- **Buscador «¿Qué quieres hacer?»** en la cabecera (atajo `/` o Ctrl+K; en el móvil, el botón 🔎): «ver mis ventas», «llamar», «precio», «anuncios»… y te lleva directo. Solo enseña lo que tu rol puede ver.
- **Avisos dosificados la primera semana**: un admin nuevo solo recibe lo urgente (te mencionan o se te pasó una tarea), como mucho 2, y sin el número del Auditor en «Mi negocio».
- **Salas de Zoom de cada vídeo**: al crear un lanzamiento de varios vídeos, «Crear la sala de Zoom» crea la de **todos** los vídeos en directo con día y hora (antes, la del vídeo 2 en adelante solo si el lanzamiento anterior ya la tenía; en el primero de 2 vídeos solo se creaba la del día 1). Sin lanzamiento anterior con ese vídeo se da por en directo (salvo en los retos) y copia los ajustes de la sala del vídeo 1 anterior. Y en Datos básicos, cada pestaña de vídeo tiene **«🎥 Crear su sala de Zoom»**: la crea en la misma cuenta de Zoom, con su día y hora, registro obligatorio y los ajustes de la sala del vídeo 1, y rellena su ID y su enlace genérico (luego, Guardar).
- **Logo del producto**: además del logo del lanzamiento (el evento), cada lanzamiento tiene el **logo del producto** que se vende (Crear → Imágenes, al lado del otro, y Anuncios → Ajustes; `logoProductoUrl`). Va en las **imágenes de venta** (carrito abierto, bonus y cierre: junto al titular y en la portada del mockup del producto; el prompt de Magnific lo sube también), en los **anuncios de venta** (como el del lanzamiento en los de captación) y en los datos de **todos los prompts** del lanzamiento (páginas, emails, WhatsApp…), que dicen dónde va cada logo: el del lanzamiento en captación, registro y preclase; el del producto en venta, pago, grabación y carrito. Los prompts de mensajes también conocen ya los recursos de la preclase de varios recursos (qué hay y cuándo se abre cada uno).
- **Grabaciones de cada vídeo (2, 3 o 4 vídeos y retos)**: en la pestaña Grabación, una fila por vídeo con su vídeo de Vimeo y desde cuándo se ve, y la elección **«Una página para todas»** (una sola URL: la de la página de replay; la página lleva un bloque de vídeo por grabación, cada uno se abre a su hora — los Códigos lo dan ya hecho) o **«Una página por vídeo»** (cada grabación con su URL). Se guarda en `grabacionModo`; con «global», la URL de cada vídeo es la misma (para los avisos y redirecciones). En Datos básicos, cada pestaña de vídeo queda con su día, hora y Zoom.
- **Todo según la preclase del lanzamiento (tareas, columnas, códigos y prompts)**: **sin preclase**, Plan → Tareas (y su tablero en la Operativa) no tiene la columna de las clases y «Cargar tareas habituales» no crea las de las clases ni la del plan B de la preclase; los prompts de Páginas no incluyen ni el login ni la preclase. **Con clases grabadas**, columna «🎬 Clases previas» con sus tareas (solo de las clases que tiene: con 1 clase, nada de la clase 2). **Con varios recursos**, columna «🧩 Recursos preclase» con sus tareas propias (preparar y pegar los recursos, pegar el bloque de la lista, comprobar que se abren, avisar de cada uno, contactar a las calientes) y el prompt de la página preclase pide la lista de recursos. Las tareas de preparación van siempre.
- **Arreglo: Grabación vacía**: con la preclase de varios recursos se ocultaban por error los apartados de Grabación (y de Datos básicos) y no volvían a salir; ahora solo se ocultan los de la preclase.
- **Resumen final («¡Enhorabuena!»): enlace para emails y enlace para WhatsApp**: las páginas que saben quién entra (login, preclase, replay, venta y pago) salen con sus dos enlaces, cada uno con su botón Copiar: ✉️ **para emails** (con `?cid={{contact.id}}`: entra directa y se sabe quién es) y 💬 **para WhatsApp** (sin él: si el móvil no la recuerda, pide el email). Gracias, grupo de WhatsApp, encuesta, VIP y llamada tienen un solo enlace. «Copiar todos» copia los dos.
- **Ventas cruzadas → Comercial → A quién llamar: el filtro «Ya tienen → Ofrécele»**: el mismo puente de Alumnos (un botón por producto a cada lado, con cuántos lo tienen o no entre los alumnos del pipeline) está ahora encima del tablero. Al tocar productos, las fases y sus columnas enseñan solo a esas personas. Es el mismo filtro en las dos pestañas (se recuerda al cambiar de una a otra) y «✕ Quitar» lo borra.
- **Lanzamientos de 2, 3 o 4 vídeos (y retos): una pestaña por vídeo**: en Datos básicos, «Vídeo 1 · Vídeo 2 · Vídeo 3…» con los mismos campos en cada uno: 📅 día y hora, 🎥 su sala de Zoom (ID y enlace genérico) y ▶️ su página y su vídeo (los del vídeo 1, en «Grabación»). La pestaña del vídeo 1 escribe en las casillas del directo de siempre (que se ocultan mientras haya varios vídeos). **Inscripción en Zoom de cada vídeo**: (1) al registrarse, el webhook del registro de GHL (`/api/zoom-registro`, en Plan → Automatizaciones) la inscribe en la reunión de **cada** vídeo en directo que tenga Zoom (la URL es de un cliente, `?c=`, y lleva el código del lanzamiento, `&l=`, para no depender de que GHL ya haya puesto la etiqueta; sale siempre con `alquimia.tenaxdigital.com`, nunca con la antigua; responde siempre el motivo en claro —se ve en el historial del workflow de GHL— y en Configuración → Captación → Página de registro, «🎥 Comprobar la inscripción en Zoom» inscribe a un email ya registrado y dice qué falla: Zoom no conectado, no está en el CRM, sin etiqueta, sin sala, la reunión no existe en esa cuenta de Zoom o no tiene el registro activado, o la app de Zoom sin permiso). **Datos que se mandan a Zoom** (igual para todos los clientes, lanzamientos y caminos —registro, preclase y clic al directo—, en `datosRegistrante` + `addRegistrant`): nombre y apellidos de GHL (sin nombre, la parte del email antes de la @; sin apellido, «-»); si la reunión pide otro campo obligatorio (teléfono, ciudad…), se rellena y se reintenta; (2) al entrar en la preclase, la página la inscribe por detrás en **todos** los directos que quedan (uno detrás de otro, cada uno con su enlace personal; antes solo el próximo); (3) la pantalla de espera y el clic al directo siguen de respaldo. Nadie se inscribe dos veces.
- **SendFlow: la campaña se configura en SendFlow**: donde se vincula una campaña (Captación del lanzamiento, meteórico y Conexiones) y al crear el lanzamiento, un aviso dice que la campaña (grupos, enlace de entrada y mensajes programados) se configura directamente en SendFlow; AlquimIA solo la vincula para ver entradas y salidas.
- **Códigos según el embudo**: Configuración → Códigos enseña arriba lo que tiene el embudo (🎬 preclase con N clases / 🧩 preclase de varios recursos / 🚫 sin preclase, ⭐ VIP, 📝 encuesta) y **solo los códigos que tocan**: sin preclase, nada del login ni de la preclase (ni sus enlaces); con varios recursos, la lista en vez de las clases e imágenes de clase; sin VIP, sin su bloque; sin encuesta, sin el suyo. Los prompts de Páginas usan esa misma lista.
- **Pies de las ventanas**: los botones nunca se aplastan; si no caben, bajan a otra fila (en la del embudo, «Cancelar / Siguiente / Guardar» quedan arriba y juntos, y «Eliminar» y «Plantilla» debajo).
- **Tipo de preclase: clases grabadas o varios recursos**: al crear (o editar con ⚙️) un embudo de lanzamientos, en «Prelanzamiento» se elige el tipo de preclase. **Clases grabadas** es lo de siempre (1-3 clases, con música, test, votación, descargable…). **Varios recursos** pregunta solo **cuántos** (1-12) y quita los recursos de las clases. En la configuración de cada lanzamiento (Preclase) desaparecen el calendario de las clases, las clases y sus recursos, y aparece **«Recursos de la preclase»**: una tarjeta por recurso con nombre, tipo (🎬 vídeo de Vimeo/YouTube/MP4, 🎧 audio, 📄 descargable o 🔗 enlace), enlace, fecha de desbloqueo (vacía = desde el principio) y un texto corto. En la página de GHL va un solo bloque, `<div data-lsd-lista-recursos></div>` (en «Códigos»): pinta los recursos en orden, cada uno con candado y cuenta atrás hasta su fecha (y después de la encuesta, si la hay). Cada recurso es una etapa de la página (`data-lsd-etapa="r1"`, `r2`…). Los lanzamientos nuevos heredan la lista del anterior sin fechas.
- **Nuevo embudo y nuevo lanzamiento: pasos en tarjetas**: como en el resto de configuraciones, cada paso es una tarjeta con su número en un círculo (que ya no se aplasta) y el nombre debajo; todos caben a la vista, también en el móvil.
- **🔔 Notificaciones (campanita + email) y Perfil → Notificaciones**: cuando alguien te menciona con `@` en la Operativa (comentario o descripción) te llega **siempre un aviso en la campanita y un email** (salvo que lo quites). Los avisos de la Operativa se guardan en el servidor para cada persona (`lsd_buzon_<id>`, los 60 últimos), así que se ven en cualquier dispositivo y desde cualquier cliente; al pulsarlos se abre la tarea. En el menú de tu foto, **Notificaciones** abre la lista de avisos con un interruptor para 🔔 campanita y otro para ✉️ email: te mencionan, te asignan una tarea, comentan en tus tareas, tus tareas vencidas o a punto de vencer, resumen de tu día (agencia), vencidas del equipo (admin) y personas atascadas (agencia). Y **sugerencias ✨** que se pueden quitar: *terminan una tarea que creaste*, *se bloquea una tarea tuya* (con el motivo) y *cambian la fecha de tu tarea*. Se guarda al momento y vale en todos los dispositivos; el servidor respeta esa elección antes de mandar cualquier email (también los de Plan → Tareas y el resumen de cada mañana). En la campanita, «⚙️ Elegir» lleva directo ahí.
- **Aviso a la agencia de quien se atasca**: en 🔔 Notificaciones (superadmin), «🧗 Marta (cliente) lleva 4 días sin avanzar…» o «no ha entrado todavía»; al pulsarlo, se abre un email para echarle una mano.

### 🔁 Embudo de ventas cruzadas (a los alumnos de un producto, venderles otro)
- **«Hoy» funciona como «Llamadas» de un lanzamiento**: al pulsar la tarjeta de un alumno se abre su ficha completa (sus productos y lo que le falta, la fase en la que está, la encuesta y las notas de GHL) y **«Mover de etapa»** (en la tarjeta y en la ficha) abre **las mismas opciones que al anotar una llamada**: ✅ Venta, 💳 Pendiente de pago, 🔁 Seguimiento, ❌ No compra (con motivo), 🚫 No contesta (avanza No contesta 1 → 2) y 📅 Reagendar. Mueve (o crea) su oportunidad en el pipeline de ventas cruzadas y guarda la nota en su ficha de GHL (`POST /api/cruzadas {op:'mover'}`, para quien tiene Hoy o Llamadas). En venta directa, pulsar la tarjeta de seguimiento también abre la ficha. Las llamadas y la ficha ya no fallan con alumnos (no tienen puntuación: se enseñan sus productos).
Nuevo tipo en **＋ Nuevo embudo → 3 · Otros → Ventas cruzadas**. Pestañas: **Alumnos**, **Ofertas**, **Hoy** (solo si se usan llamadas: *A quién llamar* y *Llamadas*) y **Plan** (Tareas y Calendario). Visual pero sobrio: **un solo color para los datos y grises**. Números, barras y lo destacado van en el **azul de la gráfica del logo** (`--dato`, barras de cian a azul), que no parece una alerta; el **naranja** queda solo para lo seleccionado o activo (pestañas, embudo abierto, filtros marcados). Los productos se distinguen por su nombre, no por un color distinto cada uno. Las tarjetas de **«Cuántos productos tiene cada alumno»** (aquí y en Inteligencia de negocio) son espaciales en la parte más azul, con los números en blanco. Los **números en círculo** (p. ej. los productos en la configuración) van en naranja con el número en blanco; en modo noche, el texto sobre el naranja también es blanco. Las **tarjetas destacadas oscuras** (cabeceras de Alumnos, Hoy y Ofertas, y la de Agencia) llevan en el diseño clásico el **fondo espacial** de la cabecera de AlquimIA (azul noche, brillo azul y estrellas); iconos, números que cuentan solos y tarjetas que entran escalonadas (sin movimiento si el sistema pide «reducir movimiento»). La paleta está en el bloque «paleta sobria» al final de `public/styles.css`.

**⚙️ Configuración** (5 pasos):
1. **Productos**: cada producto con la **etiqueta de GHL** que lleva quien lo compra y **otras etiquetas que también cuentan** (ofertas, ediciones, el mismo producto en otro embudo). **📦 Traer de Configuración → Productos** los añade de un clic. Al menos 2. **⭐ Producto prioritario** (uno, opcional; botón «☆ Marcar como prioritario»): a todo alumno que no lo tiene se le recomienda **siempre ese primero** (tarjeta, WhatsApp, Hoy, oportunidades y propuestas de oferta), por delante de las demás ofertas; si una oferta lleva a él, se usan su precio y su mensaje.
   **Sus productos entran solos en Configuración → Productos** (en el servidor, `fusionarCruzadas` en `lib/productos.js`): al guardar la configuración y cada vez que se lee el catálogo (así también los embudos creados antes). Los que no estaban se crean (con su etiqueta; las otras, como ofertas a 0 €); los que ya estaban (por etiqueta o nombre) se enlazan al embudo y ganan las etiquetas que les falten. No se duplican. Solo falta ponerles el precio.
2. **Ofertas por tipo de alumno**: «✅ si ya tiene X ➜ 🎁 ofrécele Y», con precio o condición y un **mensaje de WhatsApp** (`{nombre}` y `{producto}` se cambian solos). **✨ Propónmelas según mis alumnos** crea una por producto con la oportunidad más grande. Si un alumno encaja en varias, cuenta la primera que aún no tenga.
3. **Comerciales y reparto de alumnos** (opcional): **¿Cuántos comerciales?** (− / ＋, hasta 10), el **nombre** de cada uno (se elige del equipo o se escribe) y el **% de alumnos** que se lleva («⚖️ Repartir a partes iguales»; tienen que sumar 100 % para guardar). **Todos los alumnos se reparten** según ese %: cada alumno es siempre del mismo comercial (sale de su id de contacto, sin guardar listas; si cambian los %, solo cambian de comercial los necesarios). Quien tiene usuario en AlquimIA, al entrar, ve directamente **«⭐ Los míos»** en Alumnos y en Hoy; los demás se ven filtrando por su nombre. Cada tarjeta dice de quién es (👤).
4. **Hoy y Llamadas**: «No, solo la lista» o «Sí, vamos a llamarles» (como en los lanzamientos). Con «Sí»: el **calendario de reservas** de GHL (para *Llamadas*) y el **pipeline** de GHL (desplegable con los que tienes). Si aún no existe, se recomienda **crear en GHL un pipeline «Ventas cruzadas»** con sus fases: 🆕 Por contactar · 💬 Contactado · 📅 Agenda llamada · 📵 No contesta 1 · 📵 No contesta 2 · 🔁 Seguimiento · ✅ Venta · ❌ Perdido (con botón para copiar los nombres). Esas fases encajan con las que usa *Llamadas* para mover a cada alumno al anotar el resultado.
5. **Notas para el equipo** (opcional): el guion, que sale arriba en Alumnos.

**Alumnos**:
- Cabecera con cuántos tienen cada producto, **en número y en %**.
- **📦 Cuántos productos tiene cada alumno**: tarjetas grandes con el **% que tiene 1 producto, 2, 3… y ⭐ todos**. Al pulsar una, se ven esas personas.
- **💡 Tus mejores oportunidades**: para cada salto A ➜ B, cuántos tienen A y aún no B (y qué % de los de A son), con una barra de **cuántos ya dieron el salto** («✅ 5 % ya lo tiene, 7 de 146»). Al pulsar, se filtra la lista.
- **🧩 Qué combinación tiene cada alumno**: el **% de alumnos con cada combinación exacta** («solo Reto», «Reto + Raíces», «⭐ todos»), con barras. Al pulsar, se ven justo esas personas.
- **🎯 ¿A quién quieres llamar?**: toca lo que **ya tienen** y lo que les quieres **ofrecer** (cada botón con su número y %). Debajo, una barra fija y sobria (blanca, sin colores que cambian) con **cuántas personas son, qué % del total** y la frase del filtro («tienen Entrada VIP · aún no tienen Raíces · con teléfono · de Ana»), el buscador, «✕ Ver todos» y dos filtros más: **📞 Teléfono** (Todos / Con teléfono / Sin teléfono) y **👤 Comercial** (Todos / cada comercial / ⭐ Los míos), cada uno con su número; si hay otros filtros puestos, cada comercial dice cuántos de los suyos los cumplen y cuántos tiene en total («17 de 170»). Los filtros se recuerdan.
- Tarjeta de cada alumno: sus productos, **la oferta que le toca** (con precio), **📞** y el botón de **WhatsApp (con su logo, en verde) con el mensaje de su oferta ya escrito**, y su ficha al pulsar el nombre.

**Ofertas**: una tarjeta por oferta («Si ya tiene» ➜ «Ofrécele»), con precio, mensaje, a cuántos alumnos les toca y **Ver a quién →** (abre Alumnos con ese filtro).

**Hoy → A quién llamar**: arriba, si hay alumnos que aún no están en el pipeline, **«📥 Meter a los N en "Por contactar"»** (quien configura): crea en GHL una oportunidad en la fase «Por contactar» (o, si no existe, la primera) para cada alumno que aún no está en ese pipeline, con el **comercial que le toca en el nombre** («Ana Díaz · Vicky»), para que las closers los vayan moviendo. Pide confirmación, va de 20 en 20 (`POST /api/cruzadas` op `por-contactar`: por cada alumno, «¿ya está?» y «crear», dentro del límite de Cloudflare) con el avance a la vista, y no duplica a nadie. Debajo, el resumen de fases: **cada fase es un filtro** (al pulsarla se ven solo las personas de esa fase, en cuadrícula y con más tarjetas; otra vez o «✕ Todas las fases», todas). Y el pipeline de GHL **fase a fase** (tablero; cada columna pinta las primeras 60 y el filtro de comercial cuenta todas), cada alumno con sus productos y su oferta, 📞 y 💬; las fases cerradas (Venta, Perdido) se ven con «Ver las cerradas». Sin pipeline, la guía para crearlo. **Hoy → Llamadas**: como en los lanzamientos, con el calendario elegido (60 días hacia atrás).

**Inteligencia de negocio → 🔀 Ventas cruzadas** (con 2 productos o más en Configuración → Productos): tarjetas con el **% de clientes que tiene 1, 2, 3… y todos los productos**; **🧭 Qué haría con esto** (acciones sugeridas a partir de esos %: los que aún no tienen tu producto prioritario y por qué grupo empezar, el mayor grupo por vender A ➜ B, si la mayoría solo tiene un producto, tu camino natural entre productos, los saltos que casi nadie da y qué hacer con quien lo tiene todo); **% de clientes con cada combinación** y el **paso de un producto a otro** («✅ 25 % ya lo tiene · 🎯 15 por ofrecer, el 75 %», el prioritario primero). La acción más importante también sale en «🧭 Qué haría ahora para facturar más» (`cruzadasDe` en `lib/negocio-calc.js`).

**Tareas de partida** («Crear las tareas del embudo»): revisar las etiquetas, preparar el guion de cada salto, elegir a quién llamar esta semana, llamar y anotar, y revisar resultados.

Código: `public/js/cruzadas.js` (datos, filtros, ofertas, `combinaciones`, `cruces`; también lo usa el servidor), `public/js/cruzadas-vista.js` (configuración, Alumnos, Ofertas y Hoy), `handlers/cruzadas.js` (`/api/cruzadas?parte=pipelines` y `/api/cruzadas?x=<embudo>`: el pipeline por fases, hasta 1.000 oportunidades, 3 minutos en caché), `config.cruzadas[id]` en `lib/config-store.js`, `cruzadas` en `lib/negocio-calc.js`. Las etiquetas de sus productos cuentan como del embudo para `/api/leads`.

### ＋ Nuevo embudo: tipos agrupados
Los tipos salen en tres bloques: **1 🚀 Lanzamientos** (webinar, 2 vídeos, 3 vídeos, PLF, reto), **2 ♾️ Evergreen** (VSL, lead magnet, webinar evergreen, embudo de llamadas, venta directa) y **3 ✨ Otros** (meteórico y ventas cruzadas).

### Tu cuenta: cambiar la contraseña
En el menú de tu cuenta (el icono de la persona, arriba a la derecha) está **🔑 Cambiar contraseña**: abre «Mi cuenta» directamente en ese apartado. Se escribe la actual y la nueva dos veces (con «Ver las contraseñas»); avisa si no coinciden o si es igual que la actual, y al cambiarla se cierran tus sesiones en los demás dispositivos. Solo para quien entra con su usuario (no con la contraseña general).

**Lo de tu propia cuenta no depende del cliente que se esté viendo** (`sesionPropia` en `handlers/usuarios.js`): contraseña (también la del primer acceso), verificación en dos pasos, foto, avisos y notificaciones. Antes, alguien del equipo de la agencia con acceso solo a otro cliente (p. ej. solo Discendo) no podía guardar su contraseña al entrar la primera vez: salía «No tienes acceso a «Me lo dijo la matrona»», porque la app abre primero el cliente principal. Ahora la guarda y la app le lleva a su cliente.

### Móvil: barra fija arriba y subpestañas abajo
- **Arriba, fija al hacer scroll**: la cabecera del embudo en una fila (qué lanzamiento, ⚠️ pendientes, ⚙️ si la configuración ya está completa, ↻ actualizar y ⋯) y, debajo, lo importante de cada pestaña: el **periodo** (VSL, ventas directas, Cómo van los anuncios, Inicio e Inteligencia de negocio), el **buscador y los filtros** de Leads, la vista de **Llamadas**, de **Tareas** y del **Calendario**, y los filtros por motivo de **Setting hoy**.
- **La cabecera de AlquimIA** (☰ con el menú lateral, avisos y cuenta) se queda fija arriba en todas las pantallas. **La barra de abajo es solo de los embudos**: sus pestañas (Hoy · Leads · Métricas · ☰ Todo); fuera de un embudo no sale, porque Agencia, Inicio, Inteligencia de negocio y los embudos ya están en el menú ☰ de arriba. Las barras se vuelven a pintar solas cuando las pestañas del embudo cambian (p. ej. al terminar de cargar sus datos).
- **Abajo, encima de las pestañas**: las **subpestañas** de la pestaña en la que estás (Hoy → Setting hoy · Llamadas · En directo · LabIA; Métricas → Resumen · Ventas · Captación…; Leads → Lista · Encuesta · Comentarios; Anuncios, Crear, Plan, Análisis). Si son más de 4, se ven las 3 primeras (o la que tienes abierta) y **☰ Todas** abre un panel con todas.

### Configuración: una sola tarjeta con el %
Mientras a la configuración del lanzamiento le falte algo, sale **una sola tarjeta grande** (en el ordenador y en el móvil) con el anillo del %, cuántos datos faltan, la barra de progreso, por cuál empezar y «Completar →». El botón pequeño de «Configuración» de la cabecera no se repite mientras tanto: vuelve cuando está al 100 % (o en VSL, ventas directas y meteóricos).

### Menú «Cuenta» en el móvil

En pantallas estrechas se abre como una hoja opaca debajo de la barra de arriba, con los botones más separados y el fondo oscurecido (no se mezcla con lo de detrás en ningún estilo).

### Emails y WhatsApp de cada fase (plan de envíos)
Configuración → Carrito → **Emails y WhatsApp de cada fase** (`public/js/envios.js`): cuántos se envían al día y a qué hora en cada fase. Por defecto, si no se cambia: **captación** 1 email + 1 WhatsApp al día; **preclase** (desde que se abre el primer recurso) 1 email + 2 WhatsApp (mañana y tarde-noche; el de la tarde, una encuesta para generar conversación); **día del directo** 3 + 3; **carrito** 3 + 3 al día; **último día** 4 + 4. Cada día del carrito se puede cambiar a mano debajo (como antes); lo que no se toca sigue a su fase («↺ Por defecto» la devuelve). Los calendarios y los prompts de **Crear → Emails** y **Crear → Grupo de WhatsApp** salen de este plan: el número de envíos de cada día y su hora, con su objetivo (consciencia, objeciones y expectación antes del directo; el recurso que se abre; «mañana es el directo»; recordatorios y apertura del carrito; y en el carrito, objeción + emoción + motivo para comprar ya).

**Crear → Grupo de WhatsApp** tiene ahora el mismo selector que los emails: se eligen las **categorías** (preclase, objeciones y expectación, VIP, directo, grabación, carrito, cierre), se ve el **calendario** de mensajes por día con su formato (✍️ texto, 🖼️ imagen, 📊 encuesta) y se copia el prompt de **todas** o **solo de una categoría** (con los mismos huecos que en el plan completo). Los mensajes buscan el mismo objetivo que los emails pero más al grano: gancho en la primera línea, 2-6 líneas, 1-3 emojis, una sola llamada a la acción; el mensaje principal de los días clave va con **imagen** (Claude describe una imagen impactante con la frase clave) y la tarde de la preclase, con **encuesta**.

### API para el setter IA (solo lectura)
**Solo para los clientes con LabIA contratado** (Agencia → Clientes → «LabIA contratado»; los de antes sin marcar, si tienen su setter conectado en Conexiones): al resto, `/api/setter/*` responde **403 `{ sinLabia: true }`** y LabIA funciona sin la información extra. `GET /api/setter/estado?c=` → `{ ok, cliente }`: lo usa LabIA para enseñar en su panel «✓ Conectado a AlquimIA» o «Sin AlquimIA».
`handlers/setter.js` + `lib/setter-api.js`: el setter IA (proyecto aparte) lee lo que necesita para conversar con cada lead, en texto listo para su prompt. Protegida con su propia clave: `Authorization: Bearer <SETTER_API_KEY>` (secreto en Cloudflare; mínimo 24 caracteres; sin ella responde 503 y con una mala, 401). **Una clave por cliente** (recomendado si el setter lo lleva un tercero): `SETTER_API_KEY_<CLIENTE>` (p. ej. `SETTER_API_KEY_MLDLM`) solo abre ese cliente. Si se usa la general, `SETTER_API_CLIENTES` (ids separados por comas) limita a qué clientes abre; sin esa lista, abre todos. Sin emails ni teléfonos (del lead, solo su nombre de pila).
- `GET /api/setter/marca?c=<cliente>[&producto=<id o nombre>][&e=<embudo>]`: ficha de marca, producto y avatar, oferta y testimonios. Funciona sin lanzamiento. **El producto se elige por proyecto**: el pedido, el del embudo o el primero; la respuesta lista los demás productos con su id.
- `GET /api/setter/lanzamiento?c=&l=<código | auto>[&producto=]`: fase actual (preparación, captación, preclase, día del directo, en directo, carrito abierto, cerrado), fechas, oferta (precios, entregables, bonus con su fin, garantía), enlaces (venta, pago, plazos, llamada, grabación…), narrativa y la encuesta con las opciones de cada pregunta (de los campos de GHL).
- `GET /api/setter/lead?c=&l=&cid=<id del contacto>`: encuesta, preclase (clases y recursos), directo y grabación, VIP, visita a la venta, inicio de pago, compra, origen (campaña, conjunto, anuncio), tráfico y la **puntuación con su temperatura, con la misma fórmula del dashboard** (`enrichLead` + `score` de `scoring.js`, incluido el inicio de pago de D1).
Respuesta JSON `{ texto, version, … }` (el lead también trae `puntos`, `temperatura`, `compro`, `inicioPago`); con `&formato=texto`, solo el texto. Lleva `ETag` (= `version`): si el setter manda `If-None-Match` con la que ya tiene y nada ha cambiado, responde **304** sin cuerpo (puede refrescar a menudo sin descargar de nuevo).

### 🤖 Setter IA dentro del dashboard
**LabIA contratado o no, por cliente**: en el lateral **Agencia → botón «🏢 Clientes»** (pestaña **Clientes** de la ventana Agencia; antes se llamaba «Añadir nuevo cliente»): al **añadir un cliente** hay una casilla «Tiene LabIA contratado», y en la tarjeta de cada cliente «LabIA contratado» (se guarda al marcarla). Se guarda en el registro de clientes (`labia: true/false`; `labiaActivo()` en `lib/clientes.js`); los clientes de antes, sin marcar, lo tienen si su setter IA está conectado (dirección en Conexiones). `/api/me` devuelve `labia`. **Sin LabIA**: no sale el enlace del menú lateral; **Hoy → LabIA sí sale, con su logo y sin datos**: «Aún no tienes LabIA activado», tres ventajas (contesta al momento 24/7; cualifica, agenda y cobra solo; con AlquimIA sabe quién es cada lead) y el botón «🚀 Quiero LabIA» (un email a la agencia; al superadmin le recuerda dónde activarlo). Tampoco salen sus cifras en Rendimiento (`/api/setter-ia` responde `sinLabia`), ni el pipeline en Conexiones. **Con LabIA**:
- **Menú lateral**: el enlace directo a LabIA (o, si falta la dirección, a Conexiones).
- **Hoy → LabIA** (subpestaña con su logo, en todos los tipos de embudo, para quien ve Setting hoy o Llamadas; `GET /api/labia`, `lib/labia.js`): el **pipeline de LabIA en GHL** leído directamente de GHL (no se le pide nada a LabIA). Se elige solo el primer pipeline con etapas 🤖, o el que se escoja en **Conexiones → Setter IA → «Pipeline de LabIA en GHL»** (`setterIa.pipelineId`). Como en LabIA, el icono de la etapa dice quién lleva al lead: 🤖 la IA, 👩/🧑/👨 una persona. Arriba: **🤖 con la IA ahora** (no hace falta escribirles), **🙋 te tocan a ti** (en una etapa del equipo o con la etiqueta `setter-ia-humano`), citas de la semana y tiempo de respuesta. Debajo, cada etapa con su barra y su número (abiertos; en las que no son ni de la IA ni del equipo, como Venta o Perdido, todos). Luego la lista **«Te tocan a ti»** (las 40 más recientes, con «La IA te lo pasa», WhatsApp, «Ver chat ↗» en LabIA y su ficha al pulsar el nombre) y **«El setter esta semana»** (respondieron, conversaciones activas, pasadas a persona, citas, bajas y mensajes de la IA, de `resumenSetterIa`). Se guarda 5 minutos; «Actualizar» lo vuelve a leer. Lee como mucho 1.500 oportunidades (15 páginas), por el límite de 50 peticiones de Cloudflare.
- **Setting hoy**: el aviso de cuántos lleva el setter IA trae «Ver el pipeline de LabIA →».
Los mensajes van directos entre GHL y el setter IA; el dashboard solo lee **cómo va cada conversación** (por las etiquetas fijas que pone el setter en GHL) y sus **cifras**.
- **Etiquetas** (`public/js/scoring.js` → `SETTER_IA_TAGS`): `setter-ia-plantilla` (se le mandó la plantilla; la pone el workflow de GHL), `setter-ia-activo` (la IA está conversando), `setter-ia-pausa` (la lleva una persona), `setter-ia-humano` (la IA pide una persona), `setter-ia-cita` (agendó la llamada), `setter-ia-baja` (no quiere más mensajes). No llevan el código del lanzamiento: dicen cómo está la conversación ahora.
- **Leads y ficha**: chip 🤖 con el estado (📨 plantilla · 💬 conversando · 🙋 pide persona · 📅 cita · ⏸️ en pausa · 🚫 baja) y, en la ficha, «🤖 Abrir en el setter» (`<dirección>/#/lead/<cliente>/<cid>`; pide entrar en el setter).
- **Puntuación**: respondió al setter +5; cita con el setter +10 y como mínimo «caliente».
- **Setting hoy**: primero «🙋 Pide persona» (la IA te la pasa), con «🤖 Ver chat». Las que la IA está atendiendo (`setter-ia-activo`) y las de baja **no salen**, para que la IA y el equipo no escriban a la vez; un aviso dice cuántas lleva el setter. Al pulsar WhatsApp en una de ellas desde Leads, pide confirmación.
- **Enlace a LabIA** (el setter IA): en el lateral, debajo de Tus atajos, con su logo (SVG en línea, `labiaLogo()` en `app.js`, con ids propios en cada copia para que sus degradados se vean aunque otra copia esté oculta; «Lab» toma el color del texto). Debajo del logo, «Tu setter IA ↗». Abre la dirección del setter guardada en Conexiones; sin ella, quien puede configurar va a Conexiones. El logo también sale en Conexiones → Setter IA y en la tarjeta del setter de Rendimiento, con «Abrir LabIA ↗».
- **Rendimiento del equipo → 🤖 Setter IA**: plantillas, respuestas, citas y ventas de sus conversaciones (de las etiquetas de los leads del embudo) y, del setter, conversaciones, pasadas a persona, bajas, mensajes y tiempo de respuesta. `GET /api/setter-ia?desde=&hasta=` (`handlers/setter-ia.js`, `lib/setter-ia.js`) las pide a `<dirección>/api/dashboard/resumen` con la clave `SETTER_RESUMEN_KEY` (Cloudflare; una sola para todos los clientes, mismo valor que `RESUMEN_KEY` del setter; si un cliente necesita la suya, `SETTER_RESUMEN_KEY_<CLIENTE>` manda sobre la global) y las guarda 10 min. Solo pasan números.
- **Dos botones para escribir a cada lead** (Leads y Setting hoy), con una nota fija encima que explica la diferencia:
  - **💬 WhatsApp · gratis**: abre el WhatsApp de quien lo pulsa con el mensaje de «Mensajes de WhatsApp» ya escrito. ⚠️ Riesgo de bloqueo del número si se escribe a mucha gente que no lo tiene guardado.
  - **📨 Plantilla · de pago**: elige una de las plantillas aprobadas (Conexiones → Setter IA → Plantillas) y el dashboard pone a la persona su etiqueta `setter-ia-enviar-…` (y la de contactada). El workflow de GHL de esa etiqueta envía la plantilla desde el número oficial, pone `setter-ia-plantilla` y quita la etiqueta (para poder repetir). Si responde, contesta el setter IA. Desactivado si pidió la baja; avisa si ya se le mandó una (se cobra otra vez). `apply-tags` solo acepta las etiquetas de plantillas configuradas. De serie hay una: «Plantilla del setter IA» → `setter-ia-enviar-plantilla`.
- **Plantilla con desplegable y envío masivo** (`handlers/plantillas-wa.js`, `public/js/plantillas-wa.js`, `lib/envios-plantillas.js`):
  - La ventana «📨 Enviar plantilla» tiene un **desplegable** con las plantillas aprobadas (con su precio) y el **coste estimado** (n.º × precio) en grande.
  - **Leads**: el filtro de actividad es ahora «＋ Condición» y **las condiciones se suman** (p. ej. «Visitó la página de venta» + «Asistió al directo» + «No ha comprado» + «Sin plantilla enviada»); salen como fichas con ✕. Cada fila tiene su **casilla** y la cabecera marca todas las del filtro (todas las páginas). La barra de envío masivo dice cuántas hay marcadas y cuánto costaría, y «📨 Enviar plantilla a N» abre la ventana (pide confirmación con el coste). Solo se marcan las que tienen teléfono, no han comprado y no pidieron la baja.
  - **Setting hoy**: «📨 Plantilla a las N de esta lista» (con el motivo y la temperatura elegidos).
  - Se envía de 20 en 20 (`POST /api/plantillas-wa { l, tag, ids }`): pone la etiqueta de la plantilla y la de contactada y **apunta cada envío** (`lsd_plantillas_wa_<código>`: fecha, plantilla, personas, precio, quién). `apply-tags` ya no acepta etiquetas de plantilla: ningún envío se queda sin apuntar su coste.
  - **Gasto y retorno** (Leads, Setting hoy y Rendimiento → Setter IA): plantillas enviadas y a cuántas personas, gasto, cuántas respondieron al setter IA, cuántas compraron **después** de su primera plantilla, lo facturado, el coste por venta y el retorno (×). El precio de cada plantilla se pone en Conexiones (de serie 0,06 €, aproximado: mira la factura).
- **Configurarlo**: Cuenta → **Conexiones → 🤖 Setter IA**: la dirección del setter (y te dice si falta la clave). **Crear → Automatizaciones** añade los workflows de GHL: uno por plantilla (Contact Tag Added `setter-ia-enviar-…` → filtro sin `setter-ia-baja` → plantilla → etiqueta `setter-ia-plantilla` → quitar la etiqueta que lo disparó → oportunidad «Contactado») y, con la dirección del setter puesta, el de la respuesta (Customer Replied por WhatsApp, con `setter-ia-plantilla` y sin pausa ni baja → Webhook al setter con su firma `k`; uno para todo el cliente).

### Inscripción en Zoom al registrarse
`handlers/zoom-registro.js` + `lib/zoom-inscripcion.js`: en el workflow de **registro** de GHL, después de poner la etiqueta, una acción **Webhook (POST)** a la URL que da el dashboard (Crear → Automatizaciones → «Registro al webinar» la incluye cuando el lanzamiento tiene la reunión de Zoom; `GET /api/zoom-registro`, firmada por cliente). Con el contacto que manda GHL (`contact_id` en el cuerpo o, en el webhook personalizado, `cid` = `{{contact.id}}` como parámetro o encabezado), inscribe a la persona en la reunión de cada directo pendiente de los lanzamientos cuya etiqueta de registro tiene (o el de `&l=`) y guarda su enlace personal. Así quedan inscritas repartidas durante la captación, no todas a la vez a la hora del directo. La **preclase** (`/api/directo-zoom` op `prep`) y el **enlace del directo** siguen inscribiendo a quien falte. **Sin duplicados**: si ya está inscrita en esa reunión no se llama a Zoom (ni a GHL), y Zoom, con el mismo email, devuelve la inscripción que ya tenía.

### Operativa: «Añadir a mi calendario»
`public/js/mi-calendario.js`: cada tarea tiene su botón 📆 (en la tarjeta) y «📅 Añadir a …» en la ficha (con hora opcional; sin hora es de todo el día; sin fecha, hoy). Cada persona **conecta su calendario** una vez (pestaña «📅 Mi calendario» o al pulsar el botón por primera vez): **Google Calendar** u **Outlook** abren el evento ya relleno (título · proyecto, descripción y enlace al dashboard) y solo hay que guardar; **Apple u otro** descarga un `.ics`. La elección se guarda por persona en el servidor (`op: 'mi-calendario'`, en la configuración de tableros: vale en cualquier dispositivo). Además, **sincronización automática**: «Crear mi enlace» da un enlace privado (`/api/cal?op=1&t=…`, firmado) con todas las tareas con fecha que tiene asignadas en todos los proyectos (desde hace 30 días), para suscribirse en Google («Otros calendarios → Desde URL»), Outlook («Suscribirse desde la web») o Apple (webcal); se actualiza solo. Requiere entrar con usuario propio (no con la contraseña general).

### Onboarding: que nadie se agobie el primer día

Quien entra por primera vez (después de elegir su contraseña y, si toca, de la marca) no ve todo de golpe: se le guía con **burbujas** (la pantalla se oscurece y solo queda iluminado lo que se explica, con «2 de 5», Atrás, Siguiente y Saltar; Esc para salir y las flechas para moverse). Todo en `public/js/onboarding.js`, sin librerías.

- **Bienvenida** («¡Hola, Marta! 👋 Te enseño lo básico en 1 minuto» · Empezar / Ahora no) y el **recorrido principal de su rol** (4–6 burbujas): **admin** (embudos, dónde estás, las pestañas, Crear con IA, Mi negocio), **setter** (Hoy, Leads, el lanzamiento, los mensajes de WhatsApp), **cliente** (en su portal: embudos, resultados, procesos y cuenta) y **Solo Operativa** (tareas y procesos). Todos terminan en el botón **Ayuda**. Si estaba en el Inicio, el recorrido abre su embudo para que se vea de qué habla cada burbuja.
- **Mini-recorridos por pestaña** (2–3 burbujas la primera vez que entra en Hoy, Leads, Métricas, Anuncios, Páginas, Emails, Imágenes, Grupo de WhatsApp, Plan, Análisis…): **sustituyen** al aviso «Entendido» de esa pestaña. «Volver a ver las ayudas» (menú de la cuenta) los vuelve a sacar.
- **Primeros pasos**: una pastilla abajo a la izquierda («🚀 Primeros pasos 2/6») que se abre en la lista de tareas reales de su rol; **se marcan solas** al hacerlas (al pulsar el botón o entrar en la pestaña) y cada una tiene «Ir». Admin: el recorrido, Marca y avatar, ver los leads, abrir una ficha, revisar las conexiones y crear algo con IA (copiar un prompt). Setter: el recorrido, Hoy, abrir una ficha, el primer WhatsApp y las llamadas. Cliente: el recorrido, sus resultados, los procesos y su cuenta. Solo Operativa: el recorrido, sus tareas y un proceso. Al terminarlos, confeti. «Ocultar la lista» la quita (vuelve desde Ayuda).
- **Vista sencilla** (admin y setter): mientras no termine los primeros pasos no se ven las pestañas avanzadas (Análisis, Automatizaciones, Planificador y Comparar); «＋ Más pestañas» (junto a las pestañas) o «Ver todas las pestañas» las enseña para siempre.
- **Botón «Ayuda»** (arriba, y «❓ Ayuda» en el portal del cliente): repetir el recorrido, la ayuda de esta pantalla, mis primeros pasos y ver todas las pestañas. Lo tiene todo el mundo, también quien ya usaba el dashboard.
- **Dónde se guarda**: en el usuario (`onboarding` en `lsd_usuarios`, `POST /api/usuarios { op: 'onboarding', cambio }`), así vale en todos sus dispositivos. Quien ya existía antes (creado antes del 18-10-2026 a las 14:00 UTC) lo tiene **hecho** y no lo ve; con la contraseña general no hay onboarding.
- **Equipo**: columna «🚀 Primeros pasos» con la barra y «3/5» (o «—» si ya usaba el dashboard) y **«↺ Repetir»**, que le vuelve a sacar la bienvenida, el recorrido y los primeros pasos la próxima vez que entre (`op: 'onboarding-reiniciar'`, solo admin).
- **Superadmin · «🎓 Ver como usuario nuevo»** (en Ayuda): eliges **Admin, Setter, Cliente o Solo Operativa** y ves el onboarding completo desde cero, exactamente como le saldrá a esa persona (el cliente, en su portal; Solo Operativa, en su Inicio). Es en tu sesión del navegador y **no guarda nada**; una barra morada abajo permite empezar de nuevo, cambiar de rol o salir.

### Claude o ChatGPT: dos prompts en cada «Copiar el prompt»

En todo lo que se crea con IA (**Emails, Páginas, Imágenes, Anuncios, Grupo de WhatsApp, Narrativa, Ficha de marca y avatar** y el análisis de la encuesta), debajo del botón de Claude hay una fila **«💬 ¿Usas ChatGPT?»** con «📋 Copiar el prompt para ChatGPT» y «Abrir ChatGPT ↗»: la persona elige cuál copia. Es el mismo prompt, adaptado por `paraChatGPT` (`public/js/chatgpt.js`): sin «usa tu skill» ni menciones a Claude (le dice qué experto es), las reglas al principio **y** al final (en los prompts largos ChatGPT olvida lo del principio), que no pregunte salvo que el prompt lo pida, que no resuma ni corte, el formato de salida al pie de la letra (el dashboard lo lee), español de España y sin muletillas de IA. Según el tipo: páginas → un único bloque ```html``` sin Canvas; imágenes → que la genere directamente con el texto exacto. **Anuncios**: ChatGPT no tiene el conector de Magnific, así que «Todo en uno» e «Imágenes» tienen su propia versión (`promptTodoGpt`, `promptImagenesGpt` en `public/js/anuncios.js`): las imágenes las genera él, de una en una, sin vídeos. El análisis con el conector «Dashboard Datos» y las automatizaciones (Claude en el navegador) siguen siendo solo de Claude.

El mecanismo (en `app.js`): el botón de ChatGPT lleva los mismos `data-*` que el de Claude más `data-ia="chatgpt"` (y `data-ia-tipo`); un manejador en captura apunta el destino y `paraIa()` / `copiarPrompt()` adaptan el texto antes de copiarlo.

### Imágenes con IA (Crear → Imágenes)
`public/js/imagenes-ia.js`: las imágenes de cada momento del lanzamiento con su **texto exacto** (con tildes) y las **horas reales**: **Grabación disponible**, **Grabación disponible · solo 48 horas** y **Último día para ver la grabación** (la grabación dura 48 h desde que se abre), **Plazas abiertas · producto**, por cada bonus de acción rápida **Último día / Últimas horas para conseguir «nombre del bonus»** (hasta su fin) y **Último día / Últimas horas / Última hora para entrar en producto** (hasta el cierre del carrito). La medianoche se escribe «23.59h» del día anterior.
**Un prompt completo por imagen** (`promptImagen`): el estilo de la marca, el logo, la composición, el texto exacto y **su propio mockup descrito dentro** (la grabación en portátil y móvil, el producto como pack premium o el bonus como objeto): se copia, se pega en la IA de imágenes y sale terminada, sin pasos aparte. Todas comparten estilo y composición, así que la serie sale coherente. También hay «hazlas todas» para Magnific desde Claude (plan y coste antes de generar) y un prompt para pasar cualquiera a 9:16.
**Colores, tipografías y logo**: salen de Marca y avatar (Estilo visual) con su código exacto y su papel (fondo, titular, trazo del destacado, adornos) y la tipografía de titular y subtítulo. El **logo del lanzamiento** se pone en la misma pantalla (es el mismo de Anuncios → Crear con IA) y va arriba en todas; si no hay, se usa el de la marca y la pantalla avisa.
**Pantalla**: el avance («N de M hechas»), la paleta y el logo que usará la IA, y una galería por momento con la vista previa cuadrada de cada imagen (pintada con los colores de la marca), «Copiar prompt» y «Marcar hecha» (se recuerda en ese navegador, por lanzamiento).

### Emails de GHL por tandas
Métricas → Emails, los asuntos ganadores de Crear → Emails, los emails a reprogramar y el conector de Claude leen los emails en dos pasos: primero la **lista** del embudo (`GET /api/emails?l=…`, solo listar campañas y workflows) y después sus **estadísticas en tandas de 8** (`…&stats=<claves>`), cada tanda en su propia petición, con el avance en pantalla. Antes se pedía todo de golpe (lista, asunto y estadísticas de 30-40 emails) y en cuentas con muchas campañas pasaba del límite de Cloudflare: «Error 502». La lista y las estadísticas se guardan 15 min (compartido entre servidores).

### Inicio de la agencia (superadmin)
Quien es superadmin ve en el **Inicio** un interruptor **🏢 Agencia / 👤 cliente**. «Agencia» (por defecto) es el centro de mando de todos los clientes a la vez (`public/js/agencia-inicio.js`), hecho con el último resumen guardado de cada cliente (el del panel de agencia) y actualizando de uno en uno los de más de 30 min, sin pasar del límite de peticiones de Cloudflare:
- **Cabecera**: clientes, lanzamientos en curso, cuántas cosas críticas hay hoy y los hitos de la semana; un **anillo de salud** (cuántos clientes en orden, a vigilar o que necesitan atención) y accesos al panel de agencia, añadir cliente, «Ver como» y el equipo.
- **Cifras de la agencia**: facturación e inversión de los lanzamientos en curso, ROAS medio, registros (y VIP) y ventas.
- **🔥 Lo urgente de hoy**: de más a menos grave, con el cliente al lado y un botón para ir: críticos del auditor, GHL caído o sin conectar, ROAS por debajo del objetivo (objetivo de facturación ÷ objetivo de inversión), tareas vencidas (con quién y desde cuándo), avisos importantes y altas sin terminar.
- **📅 Próximos 14 días**: una tira con cada día y los hitos de todos los clientes (directos, clases, apertura y cierre del carrito, meteóricos), con el color de cada cliente.
- **🩺 Salud de los clientes**: una ficha por cliente con su semáforo (rojo, ámbar, verde), la fase (captación, carrito, cerrado), el próximo hito, registros, ventas, inversión y ROAS con una barra frente al objetivo, por qué está en ese color, sus conexiones (GHL, Meta, Zoom, SendFlow) y «Entrar →». Primero los que necesitan atención.
- **👥 Tareas vencidas por persona**, sumando todos los clientes.

El resumen de cada cliente (`lib/agencia.js`) incluye ahora su agenda de 21 días, las tareas vencidas por persona, las conexiones y la fase del lanzamiento (sin peticiones de más a GHL). Los clientes siguen viendo su Inicio de siempre.

### Movimiento (animaciones)
Discreto y solo cuando aporta (`public/js/animaciones.js` y el bloque «Movimiento» de `styles.css`): al entrar en una vista, subpestaña o apartado, las tarjetas aparecen escalonadas con un fundido y las de más abajo aparecen al llegar con el scroll; las barras (embudo, objetivos, encuesta, día a día…) crecen desde cero; las cifras grandes (KPI) cuentan hasta su valor y, si cambian al actualizar, cuentan del valor anterior al nuevo con un destello; los botones se hunden un poco al pulsarlos y dejan una onda; las tarjetas se elevan al pasar por encima. Los refrescos automáticos y lo que se repinta al escribir no se animan (no parpadea), y con «reducir movimiento» del sistema operativo no se anima nada.

### Emails: objeciones, consciencia y expectación (antes del directo)
En **Crear → Emails**, la fase **🧠 Objeciones y expectación** (encendida por defecto) añade un email al día a las 12:00 desde el día siguiente al inicio de la captación (o 10 días antes del directo) hasta la víspera, como mucho 9, repartidos: primero **elevar la consciencia** (el problema real, por qué lo que han probado no funcionó, el error común), después **romper objeciones habituales** («ya lo he probado todo», «no tengo tiempo», «no es para mí», «es tarde para mí», el dinero) y al final **generar expectación** por el directo. El prompt le pide a Claude que use toda la ficha (avatar con sus dolores, creencias, objeciones y palabras; producto; narrativa) y el **contenido del webinar**, que se escribe en el recuadro de esa sección (es el mismo de «Grupo de WhatsApp»). Todos acaban llevando al directo, sin enlace de venta. La cabecera de Emails (cifras, fases y leyenda) y la barra de **Informes** de Métricas se han rehecho con más aire.

### Lo que falta en la configuración (todos los embudos)
En la configuración de cada embudo (lanzamientos, VSL, venta directa y meteóricos), cada apartado con algo pendiente lleva en su pestaña el **número de lo que falta** y, al abrirlo, lo primero es un **recuadro destacado** con lo que falta exactamente (y lo que conviene revisar, en naranja). Al pulsar cada punto te lleva al campo donde se completa (cambia de pestaña si hace falta) y lo resalta un momento. Se actualiza mientras escribes: al rellenarlo, desaparece de la lista.

### Titular de la página de venta según la encuesta
Configuración → Venta → Página de venta → **🎯 Titular según la encuesta**. Se escribe un **titular y subtitular general** y las **variantes** que quieras: cada una mira una pregunta de la encuesta (de opciones o la edad, por tramos) y una o varias respuestas, con su titular y subtitular (vacío = el general). Cada lead ve la **primera variante que encaja** con lo que contestó (de arriba abajo: las flechas cambian la prioridad); quien no rellenó la encuesta, no encaja con ninguna o llega sin su enlace personal (`?cid=`) ve el general.

En la página de venta de GHL, el titular y el subtitular van en un **«Código personalizado»** con `data-lsd-text="titular"` y `data-lsd-text="subtitular"` (el código está ahí mismo, listo para copiar), además del bloque del pie de siempre. Lo escrito en la página es el general: se ve si el dashboard no responde. Para no dar un salto de texto, el titular se oculta hasta saber cuál toca (como mucho 2,5 s). Las respuestas de cada lead se consultan en GHL una vez y se guardan 2 horas; si GHL tarda más de 1,5 s, sale el general.

Debajo, la tabla **«Cómo convierte cada titular»**: por variante, cuántas leads le tocan, cuántas visitaron la venta y cuántas compraron (conversión = compras ÷ visitas), para quedarte con el que mejor vende.

### Pestaña Plan
Para planificar: **Planificador** (objetivos, inversión, equipo y previsión), **Calendario**, **Carrito** y **Tareas**. Como en Hoy, al entrar abre la última que usaste en ese embudo y el número de la pestaña son las tareas pendientes. Si alguien solo puede ver una, entra directo sin subpestañas.

**Carrito** (Plan → Carrito): los días del carrito del lanzamiento en solo lectura (hitos automáticos, emails y WhatsApps de cada día y la estrategia), para todo el equipo con el permiso «Carrito». Se edita en Configuración → Carrito (botón «Editar» para quien puede configurar). Es visual: arriba, las fechas y las cifras (días, emails, WhatsApps y días que quedan); una tira con todos los días (pulsa uno para ir a él; los pasados atenuados, el de hoy resaltado, con el icono de lo importante: 🛒 abre, 📼 grabación, ⏳ acaba un bonus, 🔒 cierre); y un timeline con la fecha grande de cada día, sus hitos con la hora a la derecha, los bonus activos en chips, los envíos como horas (✉️ emails · 💬 WhatsApp) y la estrategia en una cita. Al añadirse, este permiso lo reciben de entrada los roles con Setting hoy, Configuración o Métricas; luego se puede quitar en Equipo → Roles y permisos.

### Pestaña Análisis
Para decidir: **Avatar y anuncios** (en las VSL, Anuncios ganadores), **Comparar** y **Rendimiento del equipo**.

### Pestaña Leads
Arriba, junto a los estados, el **% de leads de pago (publicidad) y orgánicos** (según sus etiquetas de origen). Dos subpestañas: **Lista de leads** (la tabla con su puntuación, encuesta ✓/✗, clases, VIP, directo, grabación y WhatsApp) y **Encuesta**: cuántas leads la han respondido y, por pregunta, el **% de cada respuesta** (sobre quienes la contestaron, con cuántas compraron); en las preguntas de texto libre, las respuestas que más se repiten y **todas las respuestas** con el nombre de quien la dio, con buscador.

**🧠 Analizar con Claude** (arriba en Encuesta; es la tarea de cierre «Analizar con Claude las respuestas abiertas de la encuesta»): copia un prompt con todas las respuestas de texto libre **anónimas** (sin nombres; los emails y teléfonos escritos en una respuesta se cambian por `[email]`/`[teléfono]`), agrupadas (×N si se repiten, sin distinguir mayúsculas ni puntuación) y con **[COMPRÓ]** en las de quien compró (van primero), los % de las preguntas de opciones, la ficha de marca y avatar y la narrativa del lanzamiento. Claude devuelve: resumen, los 8-10 patrones con citas literales, compradoras frente al resto, dolores/deseos/miedos/objeciones, 25 expresiones literales del avatar, ganchos listos (10 para anuncios + 5 ángulos, 10 asuntos de email, 5 aperturas de WhatsApp, 5+5 titulares de registro y venta, 5 objeciones con respuesta), qué cambiar para el próximo lanzamiento y un bloque para actualizar la ficha del avatar. Con muchas respuestas, recorta a ~60.000 caracteres (primero compradoras y las más repetidas) y lo dice en el prompt. «Ver el prompt» lo enseña antes de copiarlo.

### Pestaña Métricas
La **conversión de la página de registro** es registros de publicidad ÷ visitas a la página («landing page views» de Meta: quien hizo clic en el anuncio y la página llegó a cargar). Necesita Meta conectado; los orgánicos no cuentan porque no pasan por los anuncios.
Ordenada en subpestañas para no hacer tanto scroll (se recuerda la última elegida): **Resumen** (tarjetas principales con el **CPL medio** y la **conversión de la página de registro**, y el embudo), **Ventas y rentabilidad** (inversión, ROAS, ventas por día del carrito, pago único / fraccionado), **Tráfico** (lo publicitario de Meta Ads: inversión, impresiones y CPM, clics en el enlace con CTR y CPC, visitas a la página de registro y su coste, conversión de la página, CPL medio / de publicidad / de tráfico frío, coste por VIP y por venta, ROAS, y una tabla **por campaña** con todo eso más los registros, VIP y ventas de cada una), **Origen** (publicidad / orgánico, frío / templado), **Consumo de vídeos** (cuánto se ve de cada clase y grabación, y el **directo**: pulsaron el enlace, entraron, más de 60 min, hasta el final y la retención; uno por vídeo en los lanzamientos de varios vídeos) y **Conversión y setting** (conversión por segmento, trabajo de la setter, compras por estado y qué predice la compra). En las VSL: **Resumen**, **Semanas y días**, **Llamadas** y **Origen**. Los avisos de «Revisa estas cosas» se ven siempre arriba.

Registros, encuesta rellenada (si el lanzamiento la usa), entradas VIP, asistencia (en número y en %), compras totales, compras de VIP, compras en directo,
el embudo completo, la conversión por segmento (VIP / no VIP / directo / grabación), el consumo de cada vídeo y
la conversión por estado (para comprobar si la puntuación predice bien).

## Instalación (una sola vez)

### 1. Token de GHL (gratis)
En la subcuenta **Me lo dijo la matrona** → *Ajustes → Integraciones privadas → Crear*. Permisos:
`contacts.readonly`, `contacts.write`, `locations.readonly`, `locations/tags.readonly`,
`locations/customValues.readonly`, `locations/customValues.write`.

### 2. App de Zoom (gratis, cuenta Pro o superior)
1. Entra en [marketplace.zoom.us](https://marketplace.zoom.us) con la cuenta propietaria de Zoom.
2. *Develop → Build App → Server-to-Server OAuth App → Create*. Nombre: `Lead scoring dashboard`.
3. **App Credentials**: copia el *Account ID*, el *Client ID* y el *Client Secret*.
4. **Information**: rellena el nombre de la empresa y el nombre y email de contacto (son obligatorios).
5. **Scopes → Add Scopes**, y marca:
   - `meeting:write:registrant:admin`: inscribir a los leads en la reunión.
   - `meeting:read:list_registrants:admin`: leer los inscritos.
   - `report:read:list_meeting_participants:admin`: leer quién asistió y cuánto tiempo.
6. **Activation → Activate your app**.

Si no ves la opción *Server-to-Server OAuth*: *Admin → Gestión de usuarios → Roles → Owner/Admin →
Funciones avanzadas* y activa "Server-to-Server OAuth app".

### Reunión de Zoom para cada directo
1. *zoom.us → Reuniones → Programar una reunión*. Pon el título, la fecha, una duración de 3 h 30 min y la zona horaria de Madrid.
2. **ID de reunión: Generar automáticamente.** No uses tu ID personal (PMI).
3. **Registro: Obligatorio** ✅. Sin esto no podemos saber quién asiste.
4. Seguridad: deja el código de acceso **incrustado en el enlace** y desactiva la **sala de espera**,
   para no tener que admitir a cientos de personas a mano.
5. Guarda. En la página de la reunión:
   - Pestaña **Registro → Editar**: *Aprobación automática*, desactiva "Enviar email al anfitrión cuando
     alguien se registre" y deja solo nombre, apellidos y email como preguntas.
   - Pestaña **Configuración de email → Email de confirmación a los inscritos**: desactívalo si no quieres
     que Zoom mande su propio email (el enlace lo das tú desde GHL).
6. Copia el **ID de la reunión** (11 dígitos) y el **enlace de invitación**, y pégalos en el lanzamiento del dashboard
   (*ID de la reunión de Zoom* y *Enlace genérico de Zoom*).
7. Prueba: abre `https://<tu-proyecto>.pages.dev/directo?l=<código>`, pon tu email y comprueba que entras
   en la sala de Zoom y que aparece como inscrito en la pestaña Registro.

### 3. Cloudflare Pages (gratis, también para uso comercial)
1. Crea una cuenta en [dash.cloudflare.com](https://dash.cloudflare.com).
2. *Workers & Pages → Create → Pages → Connect to Git* y elige este repositorio.
3. Configuración de la compilación:
   - **Framework preset:** None
   - **Build command:** déjalo vacío
   - **Build output directory:** `public`
4. En *Settings → Variables and Secrets*, añade como **Secret** (en Production) las variables de `.env.example`:
   `GHL_TOKEN`, `GHL_LOCATION_ID`, `ADMIN_PASSWORD`, `SETTER_PASSWORD`, `SESSION_SECRET`
   y las tres `ZOOM_*`.
5. Vuelve a desplegar (*Deployments → Retry deployment*) para que se apliquen las variables.
   El dashboard queda en `https://<tu-proyecto>.pages.dev`. Si quieres, en *Custom domains* puedes
   ponerle un subdominio tuyo, como `leads.melodijolamatrona.com`.

El plan gratuito incluye 100.000 peticiones al día, de sobra para varios lanzamientos.

#### Ahorro de peticiones (para no salir del plan gratuito)
- **Caché compartida en D1** (`cache_compartida`): el contador de VIP vendidas, los resultados de las votaciones,
  los recuentos de GHL del panel En directo, el resumen del Inicio, el del meteórico y el del portal del cliente
  se calculan una vez y los reutilizan todos los servidores y personas durante 1-15 min (Recargar los recalcula).
- **tracker.js**: la página de preclase reutiliza la primera respuesta en vez de pedirla dos veces; la espera de la
  encuesta y del test se comprueba cada vez menos a menudo (15 s → 5 min) y no se repite si ya se comprobó hace 5 s.
  Las visitas a la página de registro se apuntan una vez al día por navegador, y las de venta y pago una vez cada 10 min.
- **Apuntar etiquetas** (track y votación) va directo al contacto, sin leerlo antes de GHL.
- **En directo** cuenta las visitas recientes con una sola consulta en D1.
- **Leads**: si la copia del navegador tiene menos de 10 min (p. ej. al volver a un lanzamiento), se usa tal cual sin
  volver a descargarla; **Recargar** siempre la actualiza. Votos y visitas se piden una sola vez por carga.

## Cada lanzamiento

1. **Configuración → + Nuevo**. Rellena el código (p. ej. `nov26`), las etiquetas (pestaña **Etiquetas GHL**: la de registro y la de encuesta son nuevas; las fijas se revisan),
   el ID de la reunión de Zoom y los enlaces de la grabación, la página de venta de Raíces, los enlaces de pago de Raíces (único en ThriveCart y fraccionado en Hotmart) y la llamada.
2. **Zoom**: crea una reunión nueva para cada lanzamiento con **Registro: obligatorio**. En
   *Registro → Ajustes*, desactiva los emails de confirmación de Zoom si no los quieres.
3. **Páginas de GHL**: en *Configuración → Códigos* copia el bloque de cada vídeo y pégalo
   en un elemento **Código HTML**, cambiando el enlace de Vimeo. Las clases 1 y 2 son siempre las
   mismas, así que en esas páginas solo hay que cambiar `data-launch` al nuevo código.
4. **Enlaces que envías**:
   - En los emails de GHL, añade `?cid={{contact.id}}` a los enlaces de las clases y de la grabación,
     y usa `https://<tu-proyecto>.pages.dev/directo?l=<código>&cid={{contact.id}}` para el directo.
   - En el grupo de WhatsApp, usa los mismos enlaces sin `cid`. La página pedirá el email una sola
     vez y lo recordará en ese móvil.
5. **Después del directo**: espera unos 30 minutos a que Zoom genere el informe y pulsa **Sincronizar Zoom**.

### Vimeo
En cada vídeo: *Privacidad → Dónde se puede insertar → Solo en dominios específicos*, y añade
tu dominio de GHL. Si el vídeo es oculto, usa su URL completa con el hash (`https://vimeo.com/123/abcdef`).

## Página de login + página de recursos
Dos páginas en GHL (los códigos exactos, con el lanzamiento ya puesto, están en *Configuración → Códigos*):

**Login** (bloque Código HTML):
```html
<div data-lsd-login data-launch="nov26" data-redirect="https://tu-dominio/recursos-webinar"></div>
<script src="https://<tu-proyecto>.pages.dev/tracker.js" defer></script>
```
- Escribe su email y su **WhatsApp** (`data-movil`: `si` por defecto, obligatorio; `opcional`; o `no` para quitarlo; `data-movil-nota` cambia la frase de debajo). Si su ficha de GHL **no tiene teléfono**, se guarda ahí (`+34…` si no lleva prefijo) para el setting y las plantillas; **nunca se pisa** el que ya tenga (el formulario es público). Se guarda **en su ficha, por su id** (`setContactPhone`), nunca en el upsert por email: con email y móvil juntos, GHL podía emparejarlo por móvil con **otro** contacto (le cambiaba el email) o ignorar el móvil sin avisar. Si GHL no lo acepta (ese número ya es de otro contacto y la subcuenta no permite duplicados), entra igual y el número queda en una **nota** de su ficha. Igual para todos los clientes y para el registro desde la preclase y el directo.
- **Registrada en el lanzamiento** → va a la página de recursos.
- **No registrada** (nueva o en GHL por otro embudo) → nombre y móvil → se crea/actualiza en GHL con la etiqueta de
  registro → va a la página de recursos.
- Si llega con `?cid={{contact.id}}` (email de GHL) va directa a recursos sin escribir nada.
- Opcional: `data-title="…"` y `data-button="…"` para cambiar los textos.

**Recursos** (uno o varios bloques Código HTML; el `<script>` una sola vez):
```html
<div data-lsd-video="clase1" data-vimeo="https://vimeo.com/111/aaa" data-launch="nov26" data-login="https://tu-dominio/login-webinar"></div>
<div data-lsd-video="clase2" data-vimeo="https://vimeo.com/222/bbb" data-launch="nov26"></div>
<a href="https://<tu-proyecto>.pages.dev/directo?l=nov26">Entrar al directo</a>
<script src="https://<tu-proyecto>.pages.dev/tracker.js" defer></script>
```
- Quien abre la página sin pasar por el login (o sin estar registrada en este lanzamiento) es enviada al login.
- Mide cada vídeo al 25/50/75/90 %. El botón al directo se completa con su identidad: entra a Zoom sin escribir nada.
- Sin `data-login`, la propia página muestra el formulario de acceso en lugar de redirigir.
- El dominio de las páginas tiene que estar en los *Hostnames* de Turnstile.

## Páginas gestionadas desde el dashboard (recursos y grabación)
Todo lo que cambia en cada lanzamiento se configura en *Configuración → Página de recursos* (en hora de España):
URL del login y de recursos, vídeo y **hora de desbloqueo** de la clase 1 y 2, vídeo de la grabación (por defecto se
abre a las 00:00 del día siguiente al directo), enlace de pago de la **VIP** (se cierra a la hora del directo), grupo de
**WhatsApp**, **cierre del carrito** y los mensajes de la **barra de urgencia** por fase (`{cuenta}` = cuenta atrás).

### Encuesta obligatoria para ver las clases
En *Configuración → Etiquetas*: **etiqueta de encuesta rellenada** (la que añade la encuesta de GHL al enviarse) y
**enlace de la encuesta**. Si hay etiqueta, el servidor no entrega el vídeo de la clase 1 ni de la 2 a quien no la
tiene: en su lugar sale la tarjeta "Completa la encuesta para desbloquear las clases" con el botón. La encuesta se
abre en otra pestaña con el email, nombre y teléfono ya rellenos (`?email=…&first_name=…&phone=…`, para que la
etiqueta caiga en el mismo contacto) y, al volver, la página detecta la etiqueta sola (comprueba cada 15 s y al
volver a la pestaña). La grabación no depende de la encuesta. Usa **una etiqueta distinta en cada lanzamiento**
(p. ej. `encuesta-camino-nov26`): si fuera la misma, quien la rellenó en un lanzamiento anterior no tendría que
volver a hacerlo. En *Métricas* sale cuántas la han rellenado frente a los registros (y en %).

Fases: antes de la clase 1 → clase 1 → clase 2 → día del directo → **directo** (la página de recursos redirige al
directo) → **desde las 00:00 del día siguiente** (redirige a la página de la grabación) → carrito cerrado.

Marcadores para el diseño de GHL (`data-launch="auto"` = lanzamiento en curso, no hay que tocarlos entre lanzamientos):

| Marcador | Qué hace |
|---|---|
| `<div data-lsd-page="recursos" data-launch="auto"></div>` + `<script src=".../tracker.js">` | Activa la página (una vez) |
| `<div data-lsd-page="grabacion" data-launch="auto"></div>` | Página del replay |
| `<div data-lsd-page="registro" data-launch="auto"></div>` (o `"gracias"`) | Página pública (registro, gracias): pinta fecha, hora, cuentas atrás y enlaces del lanzamiento en curso sin pedir el email ni redirigir al login. Si llega con `?cid=` los enlaces (checkout VIP) llevan su ID |
| `<div data-lsd-bar></div>` | Barra de urgencia: texto (`.lsd-bar-text`), cuenta atrás (`.lsd-cd`) y botón (`.lsd-bar-btn`) |
| `<div data-lsd-video="clase1|clase2|replay"></div>` | Vídeo; antes de su hora, tarjeta bloqueada (`.lsd-locked`) con cuenta atrás; si ya es la hora pero aún no hay vídeo en el dashboard, "Muy pronto disponible"; si falta la encuesta, la pide con un botón (`.lsd-locked-btn`; textos cambiables con `data-encuesta-text` y `data-encuesta-label`) |
| `<a data-lsd-link="vip|whatsapp|directo|grabacion|venta|pago|pago-fraccionado|llamada">` | Pone el enlace; se oculta si no hay |
| `<a data-lsd-link="calendario">` / `data-lsd-link="calendario-ics"` | Añadir el directo a Google Calendar (o el enlace que pongas en el dashboard) / archivo .ics para Apple y Outlook |
| `<span data-lsd-text="clases-titulo|clases-subtitulo|clase1-titulo|clase1-descripcion|clase2-titulo|clase2-descripcion">` | Textos editables en *Página de recursos → Textos de la página* (vacío = se queda el texto del diseño); también textos con nombre propio |
| `<div data-lsd-embed="gracias"></div>` | Vídeo de la página de gracias (Vimeo o YouTube) desde *Configuración → Captación → Página de gracias*; se oculta si no hay |

**Segunda página de gracias** (*Captación → Página de gracias*, opcional; p. ej. la de un embudo duplicado con otro píxel): lleva los mismos códigos que la primera (`data-lsd-page="gracias"`, vídeo, WhatsApp, VIP…) y enseña lo mismo, porque el contenido sale del lanzamiento, no de la URL. Su URL se guarda en `gracias2Url` y sale en Accesos y enlaces, en el resumen final y en los prompts.

| `<span data-lsd-text="vipContador">` | Prueba social: número de partida (se elige al crear el embudo de lanzamientos, en «Contador de VIP · empieza en», y cada lanzamiento lo puede cambiar en su configuración) + VIP vendidas en este lanzamiento (las de lanzamientos anteriores no cuentan; se actualiza cada minuto) |
| `<a data-lsd-link="guia">` (cualquier nombre) | Enlace personalizado creado en *Página de recursos → Enlaces personalizados* |
| `<span data-lsd-text="nombre|fechaDirecto|horaDirecto|directo|clase1|clase2|replay|cierreVip|cierreCarrito|precioVip">` | Escribe el dato |
| `<span data-lsd-countdown="vip|directo|clase1|clase2|replay|fase">` | Cuenta atrás |
| `<div data-lsd-countdown-boxes="directo|clase1|clase2|vip|fase"></div>` | Cuenta atrás en cajas (`.lsd-cdb`, `.lsd-cdb-unit`, `.lsd-cdb-num`, `.lsd-cdb-label`); se oculta al llegar a cero |
| `<a data-lsd-link="encuesta">` | Botón a la encuesta (se abre en otra pestaña, con los datos rellenos; se oculta cuando ya la ha hecho) |
| `data-lsd-if="vip-abierta|vip-cerrada|ya-vip|encuesta-pendiente|encuesta-hecha"` | Muestra el elemento solo en ese caso |
| `data-lsd-phase="pre_c1 c1 c2 dia_directo en_directo replay cerrado"` | Muestra el elemento solo en esas fases |
| `<div data-lsd-audio="musica"></div>` | Música de la preclase: no se ve hasta ver el 75 % de su clase (el vídeo ya invita a verla); después, el reproductor (mide play, 50 % y 90 %). Con `data-mostrar-bloqueo` enseña un candado mientras tanto |
| `<a data-lsd-link="test">` | Botón al test de GHL (se abre en otra pestaña con el email y el nombre; solo desde su fecha y con la encuesta rellenada); `data-lsd-countdown="test"` cuenta atrás hasta su desbloqueo |
| `<div data-lsd-votacion></div>` | Votación propia (una o varias preguntas, tipo test o libres): no se ve hasta ver el 75 % de su clase (con `data-mostrar-bloqueo`, un candado); al responder enseña los % de las tipo test y su respuesta a las libres. Opcional: `data-boton="…"` (texto del botón) y `data-placeholder="…"` (texto del cuadro libre) |
| `<a data-lsd-link="descargable">` | Recurso descargable (mide quién lo abre) |
| `<img data-lsd-img="clase1|clase2|clase3|test|descargable">` (o un `<div>`: se le mete el `<img>` dentro) | Imagen de esa etapa, de *Configuración → Preclase* (URL de Medios de GHL); sin imagen se oculta |
| `<div data-lsd-etapa="encuesta|clase1|test|clase2|descargable|directo">` | Recibe `data-lsd-estado="bloqueada|disponible|hecha"` para el diseño; `<span data-lsd-etapa-n="test">` escribe su número de etapa |
| `data-lsd-if="test-bloqueado|test-falta-encuesta|test-disponible|test-hecho|musica-bloqueada|musica-disponible|votacion-bloqueada|votacion-disponible|votacion-hecha|votacion-abierta|descargable-bloqueado|descargable-disponible"` | Muestra el elemento solo en ese caso |

**Vista previa:** en la misma pestaña, "Ver la página de recursos como si fuera…" abre tu página simulando una fecha
(enlace firmado; para las leads sigue siendo la hora real y los vídeos no se desbloquean antes).

## 🧭 Cómo está ordenado el dashboard (revisión de UX de octubre de 2026)
- **Barra de arriba, solo lo general**: Auditor, Operativa, Procesos (agencia), **⚙️ Mi negocio** (antes «Ajustes del cliente»: Equipo, Marca y avatar, Conexiones y Mensajes de WhatsApp). En el lateral, la lista de embudos se titula «Tus embudos» y el enlace de LabIA tiene aire arriba y abajo, 🔔 y **tu cuenta** (Mi cuenta, diseño, modo día/noche, ayudas, salir).
- **Menú lateral**: 🏢 **Agencia** (solo superadmin: el centro de mando de todos los clientes; ya no hay botón flotante ni interruptor en el Inicio), 🏠 **Inicio** (el del cliente en el que estás), accesos rápidos y los embudos.
- **Cabecera del embudo** (encima de las pestañas): `🚀 Lanzamientos › [lanzamiento ▾] · FASE`, el chip **⚠️ N pendientes** (la foto y lo que falta configurar: se despliega al pulsarlo), **⚙️ Configurar este lanzamiento**, **↻ Actualizar** y **⋯** (Sincronizar Zoom e informes).
- **Pestañas**: Hoy · Leads · Métricas · **Anuncios** (Cómo van · Ganadores · Crear con IA) · **Crear** (Páginas · Emails · Imágenes · Grupo de WhatsApp · Automatizaciones) · **Plan** (Planificador · Calendario · Tareas · Carrito) · **Análisis** (Avatar comprador · Comparar · Rendimiento del equipo · Analizar con Claude). Los ids de las vistas no cambian: los enlaces, permisos y pestañas elegidas en cada embudo siguen valiendo («Avatar comprador» la ven quienes tenían «Avatar y anuncios»).
- **Ayuda de cada pestaña**: la primera vez, abierta; tras «Entendido», una línea fina «ⓘ qué es esto» que se despliega. Sin frases duplicadas debajo.
- **Móvil (≤ 900 px)**: cabecera de una fila (☰ · nombre · 🔔 · tu cuenta). ☰ abre un panel con Agencia, Inicio, los embudos y las herramientas y ajustes. Las pestañas van **fijas abajo** (las tres primeras + «Más»).

## Vistas del dashboard
- **Hoy**: listas priorizadas para la setter (muy calientes sin contactar, VIP sin comprar, vieron la grabación,
  seguimientos pendientes y contactadas sin resultado). Cada lead sale una sola vez.
- **Leads**: la tabla completa con filtros. Tras enviar un WhatsApp aparece el selector de **resultado**
  (respondió, interesada, llamada agendada, no contesta, no interesada), que se guarda en GHL como
  `<código>_res_…`.
- **Métricas**: embudo, inversión y rentabilidad, tráfico frío/templado, conversión por segmento, **origen**
  (campaña / conjunto / anuncio), trabajo de la setter, consumo de vídeos, compras por estado y **qué predice la
  compra** (para ajustar los pesos de la puntuación con datos reales).
- **Comparar**: varios lanzamientos lado a lado.

## Llamadas de valoración
Pestaña **Llamadas** (admin, técnico y setter), conectada a GHL:
- Lee las citas del calendario del «Enlace para reservar llamada» del lanzamiento y la etapa de cada persona en el pipeline **Leads Lanzamientos** (se busca por nombre; otro nombre: `llamadasPipeline` en la configuración).
- Cada llamada muestra la ficha del lead (puntuación, VIP, directo, clases, grabación, encuesta) y se agrupa en *Pendientes de anotar*, *Hoy*, *Próximos días* y *Ya anotadas*.
- «Anotar resultado» (Venta, Seguimiento, No compra + motivo, No se presentó, Reagendar) mueve la oportunidad de etapa (o la crea), marca la cita como realizada / no presentada / cancelada y deja una nota en la ficha del contacto. «No se presentó» avanza No contesta 1 → 2 → 3.
- Resultado **💳 Pendiente de pago**: va a la etapa «Pendiente de pago» del pipeline si existe (si no, a «Seguimiento»).
- Vista **👥 Por fase**: cada persona aparece en la fase de su última llamada (próxima, sin anotar, pendiente de pago, seguimiento, venta, no compra, no show, reagendar, cancelada), con filtros y un botón de **WhatsApp con el mensaje de esa fase** (plantillas editables en Setting hoy → Mensajes de WhatsApp; admiten {dia_llamada} y {hora_llamada}). Queda registrado cuándo se envió. La fase también se puede filtrar en la pestaña Leads.
- Métricas: reservadas, shows, no shows, canceladas y conversión (número y %), sin anotar y motivos de no compra. El resultado se guarda también en `lsd_llamadas_<código>`.
- El token de GHL (integración privada) necesita los permisos de calendarios, eventos de calendario y oportunidades (lectura y escritura) y de notas de contactos.

## Avatar y anuncios ganadores
Pestaña para admin y técnico con:
- **Anuncios ganadores**: ranking (🥇🥈🥉 y tabla) de anuncios, conjuntos o campañas por ventas de Raíces que traen, con conversión, registros, VIP, facturado y, si Meta está conectado, inversión, CAC y ROAS. Se atribuye por las UTM del registro (utm_content = anuncio, utm_term = conjunto, utm_campaign = campaña).
- **Ventas por canal, campaña, conjunto y anuncio**.
- **Formularios instantáneos de Meta**: como no traen UTM, el origen se completa con la atribución que guarde GHL (adId, adGroupId, campaignId) o con los campos personalizados elegidos en Configuración → Captación → «Formularios instantáneos de Meta» (ID de campaña, conjunto y anuncio). Aparecen como canal «Formulario instantáneo (Meta)», cuentan como publi y entran en el ranking de anuncios ganadores.
- **Avatares de compradoras** sacados de la encuesta.

## Planificador
Pestaña **Plan → Planificador** de cada lanzamiento (antes «Objetivos y calculadora»). No hay que meter datos: todo sale de los lanzamientos anteriores del mismo embudo.
- **Lanzamientos anteriores**: se cargan solos al abrir la pestaña (los que faltan o llevan más de 3 días sin actualizar; se recuerdan en el navegador). Cuentan los que tienen al menos 100 registros.
- **Medias**: ponderadas por volumen (un lanzamiento de 4.000 leads pesa más que uno de 1.000) y por lo recientes que son (cada uno pesa un 25 % menos que el siguiente). De cada dato (CPL, % VIP, % venta, ticket, % que agenda llamada, % de cierre, inversión y registros) sale el **rango del 80 %** para el próximo lanzamiento: intervalo de predicción con la t de Student y la variación entre lanzamientos, más el error de muestreo en los porcentajes; como mínimo ±10 % (±20 % con un solo lanzamiento). **Fiabilidad** alta (3 o más lanzamientos parecidos), media o baja.
- **Inversión recomendada**: con 3 o más lanzamientos de inversiones distintas se mide cuánto sube el CPL al invertir más (CPL = a · inversión^b) y se recomienda la mayor inversión que mantiene el ROAS objetivo (como mucho el doble de la mayor hecha). Sin esa curva: la inversión media reciente, +20 % si el ROAS histórico supera el objetivo con holgura.
- **Tu plan** (escenario neutro): inversión, leads previstos, CPL máximo para el ROAS objetivo y de equilibrio, presupuesto diario; **equipo de llamadas** (cada persona hace setting y cierre, planificado para el pico del carrito: 1,5× la media); facturación, costes, beneficio, ROAS y punto de equilibrio. Debajo, **si va peor o mejor**: los escenarios reparten la desviación conjunta entre CPL, conversiones y ticket (no se juntan todos los extremos a la vez).
- **Ajustar supuestos** (plegado, opcional): ROAS objetivo, presupuesto, cualquier dato del histórico, llamadas al día por persona, días de carrito y costes (equipo, comisión, otros). Vacío = lo que dice el histórico.
- **Objetivos del lanzamiento**: salen de la proyección (registros, VIP, ventas y facturación, con su rango). La primera vez se fijan solos; si la proyección cambia, «Actualizar los objetivos con la proyección». Abajo del todo, **cómo vas frente a los objetivos**: cuánto llevas y el ritmo diario necesario hasta su fecha. Los avisos, la previsión y los informes usan esos objetivos.
- **Sugerencias**: cuánto subir la inversión (o por qué no), CPL actual frente al máximo, a dónde llegas al ritmo actual y cómo organizar al equipo.

### Previsión durante el lanzamiento
Arriba de la calculadora: **ventas previstas al final** (con rango bajo–alto), registros al final de la captación al ritmo actual y si se llega al objetivo de ventas (con margen / probable / en el límite / no se llega). Usa la conversión del histórico corregida por cómo va esta edición (compra de VIP y visionado de la clase 1 frente a lo normal). Si no llega: cuántos registros faltan, cuánto subir el presupuesto al día a tu CPL actual y cuántos leads calientes quedan sin contactar.

## Comparativas y alertas (pestaña Comparar)
Además de comparar lanzamientos entre sí: **esta edición frente a la anterior y a la media de las anteriores** del mismo embudo (coste por lead, VIP, clase 1, conversión, coste por venta, ticket, ROAS…), **mes a mes** de una VSL (últimos 6 meses) y **VSL frente a lanzamiento** (ratios). Con alertas en claro cuando algo se separa más de un 20 %: «El coste por lead va un 40 % por encima de la edición anterior». También está en las VSL.

## Crear con IA (Emails, Páginas, Grupo de WhatsApp, Anuncios): pensado para quien llega por primera vez
Todas las vistas «con IA» usan la misma cabecera (`estudioHero`): los **pasos** en lenguaje llano, un aviso **«👇 Empieza por el paso 1»** con el botón **«🤖 Abrir Claude ↗»** (claude.ai en una pestaña nueva), un plegable **«🙋 ¿Primera vez? Así funciona»** (qué es el prompt y qué hacer con él) y, plegado, **«💡 Para que salga mejor»** con la marca y la narrativa (opcionales: ya no salen como avisos encima de todo). Cada botón de **Copiar el prompt** lleva al lado su **Abrir Claude**. En Emails, la tarjeta va en orden: **1 · Qué emails quieres** → **2 · Copia el prompt y pégalo en Claude** → 3 · programarlos en GHL. En Páginas, las instrucciones de GHL están en el plegable **«Paso 3 · Cómo pegarla en GHL»**.

## Métricas → Consumo de vídeos y Conversión (dos pestañas)
**🎬 Consumo de vídeos** (también el **directo**: tarjeta con el % que entró, la **duración media** —minutos de cada asistente guardados al «Sincronizar Zoom» (`GET /api/zoom-report?…&guardado=1`)— y el **% que llegó al final**; embudo pulsaron → entraron → más de 1 h → más de 2 h, con la señal nueva `directo_120`): arriba, cuatro tarjetas (empezaron las clases, vieron alguna entera, entraron al directo y dónde más se pierden). Una tarjeta por clase o grabación con un anillo del % que la empezó y una **curva de retención** (25 %, 50 %, 75 % y entero). El directo, como un **embudo** que se estrecha con el % que pasa de un paso al siguiente. Al final, **¿Quién ve los vídeos?**: frío vs templado y publicidad vs orgánico en barras emparejadas (la tabla completa sigue en «Ver la tabla completa»).

**🛒 Conversión**: arriba, cuántos compran, el grupo que más compra, cuánto multiplica escribir por WhatsApp y la señal que más predice. Debajo, el **embudo del registro a la compra** (registro → cada clase → directo o grabación → llamada → pago → compra) y, en dos columnas, barras de **¿Quién compra?**, **Compras por temperatura**, **Trabajo de la setter** y **Qué predice la compra** (con la propuesta de pesos plegada). La votación de la clase va aquí. Quien había quitado «Vídeos y conversión» en un embudo deja de ver las dos; la última pestaña elegida «consumo» abre ahora «Consumo de vídeos».

## Rendimiento del equipo
Pestaña **Rendimiento** (permiso «Rendimiento del equipo»), en lanzamientos y VSL. Por persona: WhatsApps enviados, leads contactados, resultados anotados, llamadas agendadas / shows / no-shows / cierres (con % de show y de cierre), **ventas e importe de los leads que contactó primero** (útil para comisiones), tiempo de respuesta mediano desde el registro y % contactado en menos de 24 h. Arriba, los totales y cuántos leads siguen sin contactar. Se ve en **tarjetas**: arriba las cifras generales, luego la tarjeta destacada del **🤖 Setter IA** (siempre visible; si no está conectado, dice dónde conectarlo) y una tarjeta por persona con «💬 Setting», «📞 Llamadas» y sus ventas. Sale **todo el equipo del cliente** (usuarios activos, sin la agencia, el rol Cliente ni «Solo Operativa»), también quien aún no tiene actividad, en gris: solo cuenta lo hecho desde el dashboard (botón de WhatsApp y resultados anotados). `GET /api/rendimiento` devuelve además `equipo: [{ nombre, rol }]`. Cuenta desde que existe el registro de actividad (los WhatsApps y resultados anteriores a esta versión no tienen autor).

## Inversión y rentabilidad
En la configuración del lanzamiento: **precio de la VIP**, **precio de Raíces** (o el importe medio cobrado) y,
si no conectas Meta, la **inversión**. Facturación = VIP × precio VIP + ventas × precio Raíces.
**CAC** (coste de adquisición por clienta) = inversión ÷ clientas nuevas de Raíces del lanzamiento; se calcula solo
en *Métricas* y en *Comparar*.

### Conectar Meta Ads (opcional, gratis)
1. [business.facebook.com](https://business.facebook.com) → *Configuración del negocio → Usuarios del sistema → Añadir*
   (rol administrador) → *Asignar activos*: tu cuenta publicitaria con permiso de ver rendimiento.
2. *Generar token* → elige tu app (o crea una en developers.facebook.com, tipo *Empresa*) → permiso **`ads_read`** →
   caducidad **Nunca**.
3. En Cloudflare añade los secretos `META_ACCESS_TOKEN` y `META_AD_ACCOUNT_ID` (el número de la cuenta, con o sin `act_`).
4. **Nombra la campaña de captación con el código del lanzamiento**, p. ej. `Captación webinar nov26`. El dashboard
   solo suma el gasto de las campañas cuyo nombre contiene el código (o el texto que pongas en *Campañas de Meta de
   este lanzamiento*). La configuración del lanzamiento muestra siempre este recordatorio con el nombre exacto.
5. En cada anuncio, *Parámetros de URL*:
   `utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}`
El periodo es desde el inicio de captación hasta el día antes del siguiente lanzamiento (o hoy). La tabla de origen
cruza las UTM de GHL (`utm_campaign`, `utm_term`, `utm_content` con los ID de Meta) con los nombres y el gasto.

## Resumen diario por email
1. Configuración → Datos básicos → Resumen diario por email → **Enviar el resumen a**: tu email (tiene que existir como contacto en GHL).
   Pulsa **Enviar resumen de prueba**.
2. El token de GHL necesita además el permiso **`conversations/message.write`**.
3. Para recibirlo cada mañana: añade en Cloudflare el secreto `DIGEST_KEY` (texto aleatorio largo) y crea una tarea
   gratuita en [cron-job.org](https://cron-job.org) que abra a las 8:00 (hora de Madrid):
   `https://<tu-proyecto>.pages.dev/api/agencia?key=<DIGEST_KEY>&c=<cliente>` (la tarea de cada cliente, ver «Tareas automáticas por cliente»).
   La antigua `/api/digest?key=…` sigue funcionando; si están las dos, el resumen solo se manda una vez al día.

## Anti-bots (Cloudflare Turnstile, gratis)
Cloudflare → *Turnstile → Add widget* → dominios: el de tus páginas de GHL y `<tu-proyecto>.pages.dev`, modo
*Managed*. Copia la *Site Key* y la *Secret Key* a los secretos `TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET`. A partir de
ahí, registrarse desde la página de recursos o el directo pide la verificación (casi siempre invisible).

## Prueba completa antes de cada lanzamiento
Con un email tuyo que **no** esté en GHL:
1. Abre la página de recursos sin `cid` → te pide registrarte → regístrate → en GHL tienes la etiqueta de registro.
2. Mira 2-3 minutos de la clase 1 → en GHL aparece `<código>_clase1_25` (según la duración del vídeo).
3. Pulsa el enlace al directo → entras a Zoom → en GHL `<código>_directo_click` y en Zoom apareces como inscrita.
4. En el dashboard sales en Leads con tu puntuación; envíate el WhatsApp y marca un resultado.
5. Haz una compra de prueba (o pon la etiqueta de compra y la fecha a mano) → cuenta en Métricas.
6. Borra después tu contacto de prueba en GHL.

## Accesos y equipo
Cada persona entra con **su email y su contraseña**. Se dan de alta en el botón *Equipo → Miembros del equipo* (arriba, solo admin) (o al asignar una tarea a «+ Nueva persona»): se crea su contacto en GHL con la etiqueta `equipo-dashboard` y le llega un email desde GHL con el enlace, su email y una contraseña generada. Desde «Mi cuenta» puede cambiarla y subir su **foto de perfil** (el navegador la recorta y reduce a 160×160; se guarda como `lsd_foto_<id>` y se ve en la barra, en Equipo y en las tareas que tiene asignadas); desde Equipo se puede reenviar el acceso (contraseña nueva), cambiar el rol, desactivar o borrar.

Los roles y lo que ve cada uno se configuran en el botón **Equipo → Roles y permisos** (arriba, solo admin): una tabla con una casilla por pestaña (Setting hoy, Llamadas, Leads, Métricas, Objetivos, Avatar y anuncios, Comparar) y por acción (Configuración de lanzamientos, Sincronizar Zoom, Crear/editar/borrar tareas y eventos). Se pueden crear roles nuevos, renombrarlos y borrarlos (si nadie los tiene). El servidor aplica los mismos permisos.
- **Admin**: todo, siempre (y es el único que gestiona el equipo y los roles).
- **Todos los roles**: Tareas y Calendario (cada uno marca sus tareas y las de su rol).
- De serie: **Técnico** (configuración, Zoom, Setting hoy, Llamadas, Leads, Métricas, Objetivos, Avatar) y **Setter** (Setting hoy, Llamadas, Leads). Se guardan en `lsd_roles`.

**🧭 Embudos de cada persona** (p. ej. un setter en un embudo y no en otro): al **añadir persona** en Equipo salen los embudos del cliente como casillas, todos marcados («¿En qué embudos va a trabajar?»; no sale si el rol es Admin o si solo hay un embudo). Después se cambian en la columna **🧭 Embudos** de la tabla (botón con los suyos o «Todos» → casillas y «Guardar embudos»). Se guarda por cliente en el usuario (`embudosEn = { <cliente>: [ids] }`, `fijarEmbudos()` en `lib/users.js`); con todos marcados no se guarda nada y los ve todos, también los que se creen después. Quien tiene solo algunos:
- en el **menú lateral, Inicio y el Calendario** (también el de Google/Apple) solo le salen esos embudos, con sus lanzamientos, VSL, ventas directas y meteóricos (`configDeEmbudos()` en `lib/embudos.js`, usada por `/api/config`, `/api/inicio`, `/api/calendario` y `/api/cal`);
- el **servidor rechaza** cualquier petición de datos de otro embudo (parámetros o cuerpo `l`, `launch`, `v`, `e`, `embudo`, `code`; `comprobarEmbudos()` en `lib/auth.js`), con el aviso «Este embudo no lo tienes asignado»;
- no puede guardar la configuración general (la suya está recortada), solo sus cambios puntuales.
El **Admin y el superadmin ven siempre todos**.

**¿Olvidaste tu contraseña?** (en la pantalla de acceso): la persona escribe su email y le llega, desde el GHL principal de la agencia (el mismo que envía los accesos), un email «Crea tu contraseña nueva» con un enlace a `/?reset=…`. El enlace vale **1 hora y una sola vez** (se guarda solo su hash en el usuario); al abrirlo se pide la contraseña nueva dos veces (mínimo 8 caracteres) y, al guardarla, se cierran sus sesiones abiertas en otros dispositivos y vuelve al formulario para entrar. La respuesta es la misma exista o no el email (no se puede averiguar quién tiene acceso) y las peticiones cuentan para el bloqueo de intentos. El remitente es **«Equipo Estelabs»** si en Cloudflare pones la variable `EMAIL_REMITENTE` con la dirección de envío (p. ej. `hola@estelabs.com`; debe ser de un dominio verificado en GHL → Ajustes → Email Services). La API de GHL solo deja cambiar el nombre junto con la dirección: sin la variable sale con el remitente por defecto de GHL, y si GHL rechaza la dirección se reenvía con el de por defecto (el email llega igual). Se envía desde GHL y no desde Cloudflare porque Cloudflare no puede mandar emails a direcciones cualquiera (solo a direcciones verificadas) sin otra herramienta.

Las contraseñas generales `ADMIN_PASSWORD` / `SETTER_PASSWORD` siguen funcionando (dejando el email vacío) como acceso de emergencia, salvo que el superadmin las desactive (ver **Seguridad**).

## Operativa: nombre de las columnas
En un tablero (no en los de embudo, que son automáticos), quien gestiona el proyecto cambia el nombre de una columna **pulsando su título**: sale un campo en su sitio; **Intro** o pulsar fuera guarda y **Esc** lo deja como estaba (`editarNombreColumna` en `public/js/operativa-panel.js`, guarda con `tablero-guardar`). También sigue en «✏️ Editar tablero».

## Tareas
Cada lanzamiento tiene su pestaña **Tareas**, agrupadas por fase (preparación → cierre) con barra de progreso, vencidas y filtros (pendientes, mías, vencidas, hechas, por persona). La admin crea, edita y borra (también varias a la vez con «Seleccionar», o todas con «Eliminar todas»); cada tarea se asigna a una persona o a todo un rol y, si se marca «Avisar», le llega un email. El resto marca como hechas las suyas o las de su rol. Se ven en **Lista** (por fases) o en **Tablero** kanban: una columna por fase (Preparación agrupada por subcategorías), las columnas extra que cree la admin (comunes a todos los lanzamientos; se renombran, mueven, colorean y borran con «⋯») y **✅ Completadas** al final: al marcar la casilla la tarjeta salta ahí tachada. La admin arrastra tarjetas entre columnas (o elige la columna al abrir la tarea); el resto marca las suyas como completadas. La fase **Preparación** se divide en subcategorías (Dashboard y herramientas, Oferta y pagos, Contenido y creatividades, Comunicación, Revisión y pruebas, Equipo y reuniones, Otras): se deducen del título y se pueden elegir al crear o editar la tarea.

Filtros: pendientes, hoy, esta semana, mías, vencidas, hechas y por persona.

Cada tarea tiene una **descripción con formato** (títulos, negrita, listas con viñetas o numeradas, enlaces externos y **vídeos de Vimeo, YouTube o Loom** que se reproducen dentro de la tarea). Pulsa **en cualquier parte de una tarea** (fila o tarjeta) para abrirla: quien puede gestionar tareas la abre ya en edición; el resto, en vista completa. El servidor limpia el HTML: solo pasa el formato permitido.

**Comentarios y menciones**: cada tarea tiene comentarios (todos los roles pueden comentar; cada cual borra los suyos y la admin cualquiera). Escribe `@` y elige a la persona para **mencionarla**: le llega un email con el comentario y le aparece en la campanita. Ctrl/⌘ + Enter publica.

**Campanita 🔔** (barra superior, todos): cuenta las novedades y al pulsarla despliega, del lanzamiento elegido, los **comentarios en tus tareas y menciones**, **tus tareas vencidas sin completar**, las que **vencen en los próximos 2 días** y (solo admin) las **vencidas del equipo**. Pulsa una para abrir la tarea (en los comentarios, directamente en la caja de respuesta). Al abrirla, lo que había se da por visto (para usuarios con email se recuerda en todos sus dispositivos). Se actualiza sola cada 2 minutos.

**Tareas habituales**: al marcar «🔁 Tarea habitual» la tarea se guarda en la plantilla (Custom Value `lsd_tareas_habituales`) con su descripción, fase, persona o rol asignado y fecha relativa a un hito (captación, clase 1, directo o cierre). «Cargar tareas habituales» en el siguiente lanzamiento las crea con esa misma asignación (si la persona ya no está, se asigna a su rol) y sin duplicar. Editar una habitual actualiza la plantilla; desmarcar la casilla la quita.

**Proceso paso a paso en cada tarea**: `public/js/procesos-tarea.js` tiene el proceso (🎯 objetivo, pasos numerados y «✅ Está hecha cuando…») de todas las tareas habituales y de las creadas a mano que se repiten (anuncios nuevos, revisión de oferta y precios, edición de clases, reunión de coordinación). Se reconocen por el título, aunque esté retocado. Al leer las tareas (`getTareas`, la plantilla de habituales y la Operativa), las que **no tienen descripción** reciben su proceso, y queda guardado con el siguiente cambio de la lista. Nunca pisa una descripción que alguien haya escrito. En los emails de aviso se resume en una línea («Tiene el proceso paso a paso en su descripción») para que no pesen.

**Avisos para la admin**: si una tarea asignada a otra persona o a otro rol (no admin) pasa su fecha sin completarse, aparece un aviso rojo arriba del dashboard (solo para admin) con quién va tarde, qué tarea y cuántos días; «Ver vencidas» lleva a la lista y «Entendido» lo oculta hasta mañana o hasta que haya otra. También salen en el resumen diario por email.

Con «Seleccionar» la admin puede **asignar varias tareas a la vez** (p. ej. todas las de «Rol Admin» a una persona) o eliminarlas.

## Varios clientes
El mismo dashboard sirve a varios clientes (MLDLM es el **principal**). Arriba, junto al nombre, un **desplegable** cambia de cliente (solo sale si tienes acceso a más de uno). Cada cliente usa **su propio GHL**: su configuración, embudos, tareas, calendario, roles, llamadas y contactos viven en su subcuenta y no se mezclan.

- **Usuarios**: cada persona tiene un único usuario (email y contraseña) y **accesos** por cliente, con un rol en cada uno. La admin de un cliente gestiona su equipo (si añade un email que ya existe, por ejemplo de la agencia, solo le da acceso a su cliente). Lo que afecta a la cuenta de alguien que trabaja en varios clientes (contraseña, desactivar) lo hace el **superadmin**.
- **Superadmin**: entra en todos los clientes como admin, ve el botón **Agencia** (panel de clientes y pestaña **Clientes**) y, en Miembros, el botón «Clientes» de cada persona para darle acceso a otros clientes o hacerla superadmin. La contraseña general de admin (`ADMIN_PASSWORD`) también es superadmin.
- **La lista de clientes** (Agencia → Clientes, `pintarClientes()` en `public/js/app.js`): **una fila por cliente**, el que estás primero. En cada fila: un cuadro con su **color e iniciales**, el nombre («● Estás aquí», «Principal» o «Falta conectar su GHL»), sus **conexiones como iconos** (🔌 CRM · 📣 Meta · 🎥 Zoom · 💬 SendFlow; ✓ conectado, • elegido, – no lo usa, … sin elegir, ! revisar; al pulsar uno se abre esa conexión), **LabIA como interruptor** (se guarda al pulsarlo) y los botones **«⚙️ Ajustes ▾»** y **«Entrar →»**. «Ajustes» despliega lo técnico: nombre, color, código, Location ID, cuenta de Meta (con su ayuda), «Guardar cambios», «🔌 Conexiones», «Probar conexión» y «Quitar cliente» (se recuerda qué filas están abiertas mientras no recargues). El alta va plegada: **«＋ Añadir cliente»** arriba a la derecha la abre (con «Cancelar»).
- **Añadir un cliente** (Agencia → Clientes → «＋ Añadir cliente») es un proceso de tres pasos:
  - **1 · Datos del cliente**: nombre, código (p. ej. `clinica-sol`), *Location ID* de su subcuenta y, opcional, su **cuenta publicitaria de Meta** (el identificador, solo números; si pegan `act_…` o la URL del Administrador de anuncios con `?act=…` se queda el número). Su ayuda «¿Qué número es?» explica dónde encontrarlo y que **antes el cliente tiene que dar acceso a la agencia** (Configuración del negocio → Usuarios → Personas → Añadir, con el correo de `META_EMAIL_AGENCIA` en `public/js/integrar-crm.js`, y su cuenta publicitaria con control total). **Comprobar Meta** dice también de qué **app** es el token de la agencia (nombre e ID, con `/app` de la Graph API): si la app está en el nivel de acceso básico, la cuenta del cliente hay que añadirla en developers.facebook.com → la app → Configuración → Avanzada → Identificadores de cuentas publicitarias autorizadas, además de asignarla al usuario del sistema.
  - **2 · Conexiones** (`public/js/integrar-crm.js`): al pulsar «Añadir cliente» (o «⚙️ Conexiones →» / los iconos CRM · Meta · Zoom · SendFlow de su fila) se abre un asistente con una barra de etapas (**CRM → Meta → Zoom → SendFlow → Listo**), todas abiertas en cualquier orden. Los pasos son un acordeón: solo el actual está abierto, con instrucciones numeradas, las rutas de menús como chips (`Ajustes › Integraciones privadas`), los valores exactos con botón «Copiar» (nombres de variables, permisos, scopes) y avisos; «✓ Hecho, siguiente» abre el siguiente y los hechos se pliegan con «▾» para verlos de nuevo y «↩ Desmarcar» (se recuerdan en ese navegador, `lsd_crm_<código>`). Cada etapa termina con **Comprobar**, que lo prueba de verdad y, si falla, dice qué revisar y marca el paso.
    - **CRM (GHL)**: siempre el suyo: 5 pasos hasta `GHL_TOKEN_<CÓDIGO>` y «Retry deployment».
    - **Meta**: se elige **Cuenta en el portfolio de la agencia** (usa `META_ACCESS_TOKEN` de la agencia: que el cliente la comparta, asignarla al usuario del sistema de la agencia y poner el número), **Portfolio propio del cliente** (como Discendo: app en su portfolio, usuario del sistema, asignarle app y cuenta, token con `ads_read` y caducidad Nunca → `META_ACCESS_TOKEN_<CÓDIGO>`) o **No hará anuncios**. «Comprobar Meta» dice también de qué app es el token y, si no hay acceso, el motivo exacto de Meta.
    - **Zoom**: **El Zoom de la agencia** (no hay que crear nada: usa `ZOOM_*` de la agencia), **Zoom propio** (8 pasos: Marketplace → Server-to-Server OAuth → credenciales → información → los 6 scopes con «Copiar» → activar → `ZOOM_ACCOUNT_ID_<C>`, `ZOOM_CLIENT_ID_<C>`, `ZOOM_CLIENT_SECRET_<C>` y opcional `ZOOM_HOST_EMAIL_<C>` → desplegar) o **No usa Zoom**. «Comprobar Zoom» pide un token con esas credenciales y dice cuál falla (Client ID/Secret, Account ID, app sin activar o variables que faltan).
    - **SendFlow**: **El de la agencia** (`SENDFLOW_API_KEY`), **propio** (clave de SendAPI → `SENDFLOW_API_KEY_<C>`) o **No usa**. «Comprobar SendFlow» lee sus campañas (una petición).
    - Lo elegido se guarda en el registro del cliente (`meta`, `zoom`, `sendflow`: `agencia` | `propio` | `ninguno`). Sin elegir, Zoom y SendFlow usan los suyos si existen y, si no, los de la agencia (`lib/zoom.js` `zoomDeCliente`, `lib/sendflow.js` `sendflowDeCliente`); Meta usa su token propio si existe y, si no, el de la agencia.
    - **Cuenta → Conexiones** (superadmin, dentro de un cliente que no es el principal): «De dónde salen las conexiones de …» con Meta, Zoom y SendFlow en botones **🏢 Agencia · 👤 Propio · 🚫 No usa**, «Comprobar» y «Paso a paso →» (abre el asistente en esa etapa).
  - **3 · Conectar Meta (opcional)**: tras «CRM integrado», 3 pasos con check (pedir acceso al cliente con **«📋 Copiar mensaje»**, un texto listo para WhatsApp o email con lo que tiene que hacer; aceptar la invitación; poner el número de su cuenta) y **Comprobar Meta** (`POST /api/clientes {op:'probar-meta'}`: una petición a Meta que confirma que el token ve la cuenta y está activa, o dice qué falta). «Saltar: no hará anuncios» lleva al final. Los clientes conectados sin cuenta de Meta tienen en su tarjeta «📣 Conectar Meta →».
  - Al final, «¡<cliente> está listo!» con el resumen (CRM ✓, Meta ✓ o pendiente) y «Entrar en …». Los textos están en `public/js/integrar-crm.js`.

  Lo que hacen esos pasos:
  1. En su subcuenta de GHL, crea una **integración privada** (con los mismos permisos que la de MLDLM) y copia el token.
  2. En el **Cloudflare de la agencia, donde ya está desplegado el dashboard** (cuenta `holadiscendo@gmail.com`; el cliente no necesita Cloudflare) → *Workers & Pages → el proyecto → Settings → Variables and secrets*, añade el secreto **`GHL_TOKEN_<CÓDIGO>`** (mayúsculas y `_`, p. ej. `GHL_TOKEN_CLINICA_SOL`) y vuelve a desplegar.
  3. Pulsa «Probar conexión».
  - Meta: usa `META_ACCESS_TOKEN` (el de la agencia) con la cuenta del cliente, o `META_ACCESS_TOKEN_<CÓDIGO>`. Zoom: `ZOOM_ACCOUNT_ID_<CÓDIGO>`, `ZOOM_CLIENT_ID_<CÓDIGO>`, `ZOOM_CLIENT_SECRET_<CÓDIGO>`.
- **Páginas de GHL de otros clientes**: sus códigos (Configuración → Códigos) ya llevan `?c=<código>` en `tracker.js`, `vsl.js` y los enlaces al directo. Los del cliente principal no cambian.
- Los usuarios y el registro de clientes se guardan en el GHL del principal (`lsd_usuarios`, `lsd_clientes`). Cada petición sabe de qué cliente es gracias a `AsyncLocalStorage` (en `wrangler.toml`: `compatibility_flags = ["nodejs_als"]`).
- Pendiente para clientes que no son MLDLM: algunos textos fijos (nombre del programa «Raíces», mensajes de WhatsApp de serie, tareas habituales, encuesta del avatar) son de MLDLM; se editan o se adaptarán por cliente.

## Portal del cliente (rol «Cliente», solo lectura)
Para que el cliente vea sus resultados sin tocar nada: en *Equipo → Miembros*, crea su usuario con el rol **Cliente (solo lectura)**. Al entrar ve solo un portal limpio con cada embudo: registros, VIP, ventas, facturación, inversión, ROAS, coste por registro y por venta, sus objetivos, el embudo de conversión y los próximos hitos (en las VSL, los últimos 30 días). No ve leads, tareas, calendario, setteo, configuración ni nada interno, y el servidor se lo impide (solo recibe cifras agregadas, ningún dato personal). Los datos se recalculan cada 15 minutos. En *Equipo → Miembros*, «Ver lo que ve el cliente» lo enseña a la agencia. El cliente **elige qué ver**: «Todos los embudos» (el resumen de cada uno) o un embudo concreto; en los de lanzamientos puede elegir cualquier lanzamiento ya empezado (no solo el último) y en las VSL el periodo (7, 30 o 90 días, este mes o el pasado). Todo sigue siendo de solo lectura.

**Ver como** (*Agencia → Ver como*, superadmin): eliges cualquier cliente y ves su portal exactamente como lo ve él (con sus cifras recalculadas al momento y el nombre de su producto), sin entrar en su dashboard ni avisarle. Dice también quién de ese cliente tiene acceso de «Cliente». «← Volver al dashboard» te devuelve a Agencia.

## Informe para el cliente
En *Métricas* de cada lanzamiento: **Informe para el cliente ↗** (página con resultados frente a objetivos, embudo, anuncios ganadores, avatar comprador y aprendizajes; con botón para guardarla en PDF), **Copiar enlace para el cliente** (enlace firmado que se abre sin usuario y caduca a los 180 días; cada envío lleva uno nuevo) y **Enviárselo ahora** (email a las personas con el rol Cliente y a los destinatarios añadidos, desde su GHL). **✉️ Destinatarios**: quién recibe los informes (las personas con el rol «Cliente», que se cambian en Equipo, y las que se añadan aquí, una por línea «Nombre <email>»; clave `lsd_informes` de cada cliente, `lib/informes-config.js`). Los usan el envío automático y el conector de Claude (`datos_informe`). En las VSL hay un informe semanal (la semana pasada frente a la anterior). Automático, con la tarea de cada mañana de cada cliente (`/api/agencia?key=…&c=<cliente>`): el informe del lanzamiento se manda solo al cerrar el carrito (una vez) y el de la VSL cada lunes si se activa en su configuración. Desde el portal, el cliente también puede abrirlo.

## Vista de agencia (superadmin)
El botón **Agencia** está aparte, junto al nombre del cliente (no entre los botones del cliente). Dentro:
- **Equipo de la agencia**: las personas del equipo interno de la agencia y, para cada una, a qué clientes entra y con qué rol en cada uno (o superadmin: todos como admin). Desde ahí se añaden (les llega su acceso por email), se cambian sus clientes y roles, se les reenvía el acceso o se quitan (pierden el acceso a todos los clientes). **Pasar a la agencia**: en cualquier momento, el superadmin convierte a una persona de un proyecto en usuario de la agencia con un clic, desde el **Equipo** de su proyecto (botón «🏢 Pasar a la agencia» en su fila) o desde aquí («Personas de los proyectos · pásalas a la agencia»). Conserva su usuario, su contraseña y sus accesos; desde ese momento entra en la Operativa y en la Biblioteca de procesos y se gestiona en esta lista.
- El **Equipo** de cada cliente (botón Equipo) es solo el equipo propio de ese proyecto; abajo indica qué personas de la agencia entran también y que se gestionan en Agencia.
- **Panel de agencia** (botón *Agencia* arriba): todos los clientes de un vistazo, primero los que necesitan atención. De cada uno: lanzamiento en curso y su próximo hito, registros, VIP y ventas (con su objetivo), inversión total y de los últimos 7 días, CPL, ROAS, críticos e importantes del auditor, tareas vencidas, sus VSL y **«Entrar →»**.
- **Alta guiada del cliente** (en cada tarjeta): se marca sola: GHL conectado, nombre del producto, equipo con acceso, al menos un embudo, etiquetas de registro y compra creadas en GHL, calendario y pipeline (si usa Llamadas), páginas de GHL con el código (llega la primera visita) y primer registro recibido.
- **Plantillas de embudo**: en el ⚙️ de un embudo, *Guardar como plantilla de agencia* (tipo y formato, pestañas, mensajes de WhatsApp, tareas habituales y la base de los lanzamientos: precios, textos y barra de la página; de una VSL, sus textos y precios). En *＋ Nuevo embudo* de cualquier cliente, *Partir de una plantilla*: se crea el embudo con todo eso (los mensajes y las tareas habituales, si se marcan). Etiquetas, enlaces y fechas de GHL los pone cada cliente.
- **Marca de cada cliente** (*Equipo → Marca*, admin): nombre de su producto (sustituye a «Raíces» en el dashboard, la página preclase, el calendario y los emails), colores de los emails del equipo y preguntas de su encuesta del avatar (campos de su GHL). Un cliente nuevo empieza con mensajes de WhatsApp neutros (con `{producto}`), sin encuesta y sin nada de MLDLM.
- **Auditor automático**: cada mañana revisa todos los clientes y manda a los superadmin un email con los críticos, las tareas vencidas, el próximo hito y el alta pendiente de cada uno. Se activa con una tarea de [cron-job.org](https://cron-job.org) a las 8:00 que abra `https://<tu-proyecto>.pages.dev/api/agencia?key=<DIGEST_KEY>` (la misma clave del resumen diario). En el panel, *Enviarme el resumen* lo manda al momento.
- **Tareas automáticas por cliente**: una tarea más por cliente (8:05, 8:10…) que abra `https://<tu-proyecto>.pages.dev/api/agencia?key=<DIGEST_KEY>&c=<cliente>`. Manda sus informes automáticos y su resumen diario. Van separadas para que ninguna llamada se pase del límite de peticiones de Cloudflare. Las URL de cada cliente están en *Agencia → Panel de clientes → Tareas automáticas de cada mañana*. Si un cliente manda varios informes el mismo día, el resumen diario se deja para la siguiente llamada: se puede separar en dos tareas, `…&c=<cliente>&tarea=informes` (8:05) y `…&c=<cliente>&tarea=digest` (8:20), para que cada una tenga su propio margen de peticiones.

## Embudos de cada cliente («＋ Nuevo embudo»)
Se crea con un **asistente por pasos**: 1) **tipo de embudo**; 2) **prelanzamiento** (solo lanzamientos: área preclase y clases, entrada VIP y su contador, recursos de la preclase y pantalla de espera); 3) **dashboard**: las categorías del menú (Hoy, Leads, Métricas, Plan, Análisis; en meteóricos, Meteóricos, Oferta y Plan) con sus secciones para marcar o quitar, incluidas las subpestañas de Leads y Métricas (p. ej. quitar «Emails» o «Meteórico posterior»); 4) **nombre y resumen** de lo elegido, con lo que hay que preparar en GHL. Con el ⚙️ del embudo se abre el mismo asistente y se puede saltar a cualquier paso y guardar.

Cada cliente tiene sus embudos en el menú lateral. Con **＋ Nuevo embudo** (quien puede configurar) se elige el tipo:
- **Lanzamientos**, en cinco formatos según cuántos **vídeos del lanzamiento** tiene (la preclase con las clases 1 y 2 grabadas es del prelanzamiento y es igual en todos): **🔴 Webinar** (1 vídeo: el webinar en directo), **Lanzamiento de 2 vídeos**, **de 3 vídeos** **PLF** (4 vídeos: PLC 1, 2, 3 y el PLC 4 de venta) y **reto** (ver abajo). Agrupa sus lanzamientos (cada uno con fechas, etiquetas, setteo, métricas, objetivos, calendario y tareas). Un cliente puede tener varios; cada lanzamiento pertenece a uno. El formato se puede cambiar con el ⚙️.
- **🏁 Reto de varios días** (3, 4 o 5 días): un lanzamiento con un vídeo por día («Día 1»…«Día 5», en directo o grabado, con las mismas casillas que los lanzamientos de varios vídeos). La venta se hace el último día; quien sigue el reto entero sale «muy caliente».
- **Embudos siempre abiertos** (mismo motor que la VSL, analizados por días, semanas y meses), en cuatro variantes que cambian los textos (registros / descargas / aplicaciones…), las pestañas sugeridas, la guía de GHL y lo que revisa el auditor. La variante se cambia con el ⚙️:
  - **🎬 VSL**: registro → vídeo de venta → compra o llamada. El vídeo y el enlace de compra son imprescindibles.
  - **🧲 Lead magnet + secuencia de emails**: descarga de un regalo → secuencia de emails → venta. No exige vídeo (avisa si no se mide quién abre el lead magnet); la guía explica la secuencia y cómo sacar de ella a quien compra. Sin pestaña de Llamadas de inicio.
  - **⏯️ Webinar evergreen**: webinar grabado siempre disponible, con oferta en el minuto que elijas.
  - **📞 Embudo de llamadas**: formulario de aplicación → llamada de venta. Lo crítico es el calendario y el pipeline (no el enlace de compra), y avisa si hay aplicaciones y ninguna llamada agendada.
- **🎬 VSL** (detalles de todos los siempre abiertos): con su configuración (etiquetas, páginas, códigos, recursos). Puede haber varias; cada una tiene su código (su id) para tareas, llamadas y vídeo (`<id>_vsl_50`), y sus páginas usan `vsl.js?v=<id>`. Desde su configuración se puede eliminar.
Al crearlo se eligen sus **pestañas** (no todos los clientes necesitan Setteo, Avatar, Llamadas…) y se ve una **guía** de lo que hay que preparar en GHL según esas pestañas (etiquetas, formularios, workflows, páginas, calendario y pipeline con los nombres exactos de las etapas, UTMs de Meta…). Con el **⚙️** de cada embudo se cambian sus pestañas y su nombre, se vuelve a ver la guía o se elimina (los de lanzamientos, cuando ya no tienen lanzamientos). Un cliente nuevo empieza sin embudos y sin nada de MLDLM. Los de MLDLM («Lanzamientos» y «VSL Raíces») se conservan tal cual.

### Prelanzamiento: área preclase, clases y entrada VIP
Al crear un embudo de lanzamientos (o con su ⚙️) se eligen las **clases del prelanzamiento** (1, 2 o 3 vídeos grabados de la página preclase) y si hay **entrada VIP** o no. Con 3 clases aparecen las casillas de la clase 3 (desbloqueo, vídeo, textos; bloque `data-lsd-video="clase3"`) y su fase en la página; con 1, desaparecen las de la clase 2. Sin VIP se ocultan su etiqueta, precio, enlace, contador, objetivo, columna y tarjetas, la página no ofrece VIP y la puntuación se reescala a 100 (las clases reparten siempre 30 puntos).

**Sin área de recursos preclase** (opción al crear el embudo o con su ⚙️, para webinar, 2 o 3 vídeos, PLF y reto): el lanzamiento no tiene clases. Se ocultan las páginas de login y preclase, la encuesta de la página y las clases (la pestaña pasa a llamarse «Directo y grabación»), el auditor no las pide y la página cuenta atrás directamente hasta el primer vídeo. La puntuación se reparte entre la VIP y los vídeos del lanzamiento y se reescala a 100 (sin VIP tampoco, el directo y la grabación valen los 100 puntos).

### Pantalla de espera (59 minutos antes del directo)
Al crear un embudo de lanzamientos con «＋» se pregunta si quieres pantalla de espera; cada lanzamiento la puede activar o desactivar en *Configuración → Preclase → Pantalla de espera* (desactivada, la preclase se ve normal hasta la hora del directo y entonces entra sola al webinar). **Vídeo opcional** (Vimeo o YouTube) en ese mismo sitio: con vídeo, el vídeo es lo principal y el contador se hace pequeño; sin vídeo, la pantalla es la de siempre.

Desde 59 minutos antes del directo, quien abra la página preclase (o la tenga abierta) ve solo una pantalla de espera: el logo, «¡Empezamos en unos minutos!», «Prepárate», una cuenta atrás de minutos y segundos y el aviso «Quédate aquí, serás redirigida al directo en cuanto el contador llegue a cero». Al llegar a cero pasa sola por `/directo` (registro en Zoom y su enlace personal). No hace falta ningún bloque en GHL: lo pone el script de la página. **El enlace para conectarse al directo, por email y por WhatsApp, es el de la página preclase** (*Configuración → Códigos*: con `?cid={{contact.id}}` en los emails; sin nada en WhatsApp, donde la página pide el email si ese móvil no la recuerda). Logo y textos en *Configuración → Preclase → Pantalla de espera* (vacíos = los de ejemplo). Colores con las variables CSS `--lsd-espera-fondo`, `--lsd-espera-titulo`, `--lsd-espera-acento` y `--lsd-espera-texto`.

### Entrada al directo sin atascos (cientos a la vez)
GHL admite unas 100 peticiones cada 10 s, y a la hora exacta entran cientos de personas a la vez. Por eso:
- **Mientras espera** en la pantalla de espera, cada lead se inscribe en Zoom en un momento al azar (como mucho 10 min después de abrirla y siempre antes del último minuto) con `/api/directo-zoom`; su enlace personal se guarda en su navegador y en D1 (tabla `entradas_directo`).
- **A la hora exacta** entra directa a su enlace de Zoom: ninguna llamada a GHL ni a Zoom.
- **Quien llega justo a la hora** sin haber esperado: la preclase recibe solo adónde ir (sin GHL) y `/directo` la inscribe (1 llamada a GHL + Zoom, con reintentos); si ya estaba inscrita, entra al momento desde D1.
- **«Pulsó el enlace»** (`<código>_directo_click`) se apunta en D1 y se pone en GHL al pulsar **Sincronizar Zoom** después del directo, junto con la asistencia.
- Si algo falla, nadie se queda fuera: entra por el enlace genérico de Zoom del lanzamiento.

### Plan B del directo (si el dashboard no carga)
En *Códigos para GHL* hay un bloque «RECURSOS · plan B del directo»: un recuadro con un botón **directo a Zoom** (el
«Enlace genérico de Zoom» de la configuración, ya escrito en el HTML) y un pequeño script con su propio reloj. Está
**oculto siempre** y solo aparece **el día del directo, desde su hora de inicio y durante 3 horas, y solo si el
dashboard no ha cargado** (p. ej. un bloqueo de red a Cloudflare en España en horario de fútbol: sin dashboard no hay
pantalla de espera). `tracker.js` marca `window.lsdCargado`; si cargó, el recuadro no sale nunca. La hora va en
`data-directo="AAAA-MM-DDTHH:MM"` (hora de España, también en invierno). Se pega arriba de la preclase y bajo el
formulario de la página de acceso. Lleva la fecha, la hora y el Zoom de ese lanzamiento: si cambian, hay que volver a
pegarlo. Los prompts de Páginas (preclase y acceso) ya lo incluyen.
Recordatorios: con la pantalla de espera activa y directo en Zoom, el **Auditor** avisa si falta el «Enlace genérico de
Zoom» (sin él no se genera el bloque); las **tareas habituales** de los clientes nuevos traen «Plan B del directo» 3 días
antes del directo; y el campo del enlace en Configuración lo explica.

### Recursos de la preclase: música, test, votación, descargable y comentarios
Al crear el embudo se marca qué recursos tendrá la preclase además de las clases; los lanzamientos nuevos los heredan (sin fechas). En cada lanzamiento, *Configuración → Preclase → Recursos de la preclase*:
- **Música:** enlace del MP3 (súbelo a Medios de GHL) y bajo qué clase va. Se desbloquea al ver el 75 % de esa clase (en el mismo navegador al momento; en cualquier otro, con su etiqueta).
- **Test (GHL):** enlace, **etiqueta que pone el workflow de GHL al terminarlo** y fecha y hora de desbloqueo. Si el lanzamiento tiene encuesta, además hay que haberla rellenado (etapa 1): mientras, el bloque `test-falta-encuesta` lo explica. Cuenta como hecho cuando la lead tiene esa etiqueta.
- **Votación:** la hace el dashboard (tabla `votos` de D1). Bajo qué clase va (75 % para responder) y **una o varias preguntas** (hasta 6), cada una **tipo test** (opciones, una por línea; al responder ven los % de todas) o de **respuesta libre** (un cuadro de texto; las demás no ven lo que escribe cada una). Las tipo test son obligatorias y las libres, opcionales; con una sola pregunta tipo test se responde con un clic, y si hay más, con «Enviar respuestas». No cambies el orden de las opciones ni quites preguntas cuando ya haya respuestas. Su voto sale en la ficha del lead (pulsando su nombre en Leads) y en la ficha de cada llamada, y *Métricas → Vídeos y conversión → Votación de la clase* da, por pregunta, el % de cada opción con la conversión a compra de quienes la eligieron y todas las respuestas libres con el nombre de quien las escribió.
- **Descargable:** nombre, enlace y fecha opcional.
- **Recursos debajo de cada clase**: en Configuración → Preclase → Recursos, la música, la votación y el **test** tienen «Va debajo de» (el test también «Como etapa propia», con su fecha, como antes). En la página basta `<div data-lsd-recursos="clase2"></div>` debajo de cada clase: pinta lo que va debajo de esa clase, en cuanto la clase está disponible ya se pueden usar (sin tener que verla; el test además con su fecha si la tiene y la encuesta rellenada; hecho con su etiqueta). Títulos opcionales `data-titulo-musica`, `data-titulo-votacion`, `data-titulo-test` y `data-boton-test`. Los bloques `data-lsd-if="test-…|musica-…|votacion-…|descargable-…"` de un recurso que no está activo ya no se ven.
- **Comentarios de las clases** (`lib/comentarios.js`, tabla `comentarios` de D1; sin D1, un dato JSON por lanzamiento): debajo de cada clase, un **muro** donde las leads responden a las **preguntas que haces en la clase** (hasta 5 por clase, cada una con su id `q1, q2…` para que sus comentarios sigan con ella aunque cambie el texto) y leen las respuestas de las demás. En la página: «1 · Elige la pregunta» (si solo hay una, no hace falta) → «2 · Escribe tu respuesta» → **Publicar**; se publica **al momento** con su **nombre de pila** (nunca su id ni su email: si en GHL no tiene nombre —se registró solo con el email—, el panel le pide «Tu nombre» la primera vez, firma con él y lo guarda en su ficha, solo si estaba vacío), y debajo el muro de esa clase (destacados primero, filtro por pregunta, «Tú» en los suyos, «Ver más»). Se abre cuando la clase está disponible (antes, un candado); se refresca cada 90 s. Bloque para GHL (en *Códigos*): **uno solo**, `<div data-lsd-comentarios="todas"></div>`, debajo de la sección de las clases, con **una pestaña por clase** («Preguntas de la Clase 1», «Preguntas de la Clase 2»… o el nombre que se ponga en Configuración → Preclase → Comentarios; la pestaña bloqueada lleva 🔒 y cada una su número de comentarios; al entrar se abre la de la última clase disponible; flechas ← → entre pestañas; lo escrito no se pierde al cambiar). En Configuración también el **título del bloque**. Sigue valiendo el formato antiguo, `<div data-lsd-comentarios="clase1"></div>` debajo de cada vídeo. Textos opcionales con `data-titulo`, `data-kicker`, `data-placeholder`, `data-boton` y `data-texto-bloqueado`. **¿No se ve?** Añade `?lsd_debug=1` a la dirección de la página publicada: sale una caja con lo que falta (código cargado, bloque base, lead identificada, lanzamiento, comentarios activados). Los comentarios solo se pintan cuando la página sabe qué lead es. Con `data-una-respuesta` no se elige pregunta: se muestran todas y se responde a todas en un solo comentario (se guarda con la primera). Todas sus clases empiezan por `.lsd-com` para que el diseño de la página las vista.
  - **Moderación en *Leads → Comentarios***: cifras (comentarios, personas, sin responder, destacados), filtros por clase y «Sin responder / Todos / Destacados / Ocultos», buscador y, en cada uno, **💬 Responder** (sale debajo en la página, firmado con la firma configurada o el nombre del cliente), **⭐ Destacar**, **🙈 Ocultar** y 🗑️ Borrar (solo admin).
  - **Puntuación**: comentar pone `<código>_comento` y cuenta en el bloque de **participación** (antes «Votación»: ahora votó **o** comentó). Sale en la ficha del lead y en *Métricas* («Comentó en la preclase»). Límites: 20 comentarios por minuto y conexión, 15 por lead y clase, 1.500 caracteres.

Las **etapas** de la página se numeran solas: 1 la encuesta (si hay), después clases, test y descargable por orden de fecha y la última el directo; la música y la votación van dentro de la etapa de su clase. La configuración enseña el orden resultante. Etiquetas automáticas: `<código>_musica_play|_50|_90`, `<código>_voto`, `<código>_descarga`, `<código>_comento`. La configuración marca con 💬 las clases con comentarios.

### Lanzamientos de varios vídeos (2, 3 o PLF)
Funcionan como el webinar, con las casillas repetidas para cada vídeo (*Configuración → Datos básicos*, bloque «Vídeos del lanzamiento»): **día y hora**, **Zoom** (solo si ese vídeo es en directo; si no, es grabado y se publica a su hora), **página del vídeo en GHL**, **vídeo de Vimeo** y desde cuándo se ve. El vídeo 1 usa las casillas de siempre del directo y su grabación.
- **Señales** de cada vídeo: `<código>_directo2_asistio`, `_directo2_final`, `_replay2_50`… (el vídeo 1, las de siempre). En cada página de vídeo va su bloque `<div data-lsd-video="replay2">` (está en *Configuración → Códigos*), y el enlace al directo de cada vídeo lleva `&v=2`.
- **Página preclase**: tras las clases, fases por vídeo (su día, su directo o estreno y «vídeo N disponible» hasta el siguiente). Manda sola a la página de cada vídeo cuando toca; tras el último, carrito abierto. La barra de urgencia se configura por cada una de esas fases.
- **Venta**: en el último vídeo. El carrito se abre con él (si no se pone otra apertura), «ventas el día del vídeo de venta» y el WhatsApp de cierre miran ese vídeo. El enlace `{link_grabacion}` lleva a la página del último vídeo ya publicado.
- **Puntuación**: la mitad por el vídeo mejor visto y la mitad por la media de todos (máximo 40 puntos, como el directo del webinar).
- **Leads, Métricas, Calendario, Auditor y Sincronizar Zoom** muestran cada vídeo (Zoom sincroniza cada vídeo en directo ya celebrado).

## ⏳ Ciclo de compra

Días desde que el contacto se creó en GHL hasta su fecha de compra del producto principal (etiqueta y campo de fecha de compra del lanzamiento o de la VSL). En **Métricas → Resumen**, la tarjeta «Ciclo de compra medio» (de **todas** las compradoras de esa etiqueta, con la mediana y el dato de este lanzamiento); en **Ventas y rentabilidad** (y en el Resumen de la VSL), el detalle: media, mediana, entre qué valores está la mitad, reparto por tramos (mismo día, 1-7 días, 8-30, 1-3 meses, 3-6, 6-12, más de 1 año) y, en lanzamientos, tráfico frío frente a templado. Se recalcula cada hora; no cuentan las compras sin fecha ni las anteriores a la creación del contacto (contactos importados después).

## 📝 Encuesta fija (misma URL y etiqueta en todos los lanzamientos)

La encuesta de la Etapa 1 puede ser siempre la misma: misma URL y misma etiqueta al terminarla (está en «Etiquetas GHL → Fijas»). Un lanzamiento nuevo las hereda. Al crearlo, la «foto» marca a quien ya tenía la etiqueta de la encuesta (`<código>_encuesta_previo`): esas personas **no cuentan** como «rellenó la encuesta» de este lanzamiento (en Leads salen con ↺), pero **sí ven las clases** sin tener que repetirla.

## 🎁 Oferta: entregables, precio y bonus

- **Configuración → Oferta** (cada lanzamiento): el **precio** (tipo de pago, precios VIP y del programa; antes estaban en «Precios y anuncios»), los **entregables** (contenido grabado, sesión grupal en directo, sesión individual en directo, presencial, descargable o audio) y los **bonus** (BAR en directo, BAR 24 h, BAR 48 h o bonus de todo el carrito). Se añaden y quitan libremente; cada uno con nombre, detalle y valor opcional. Debajo de cada bonus se ve cuándo está activo (sale de la hora del directo de venta y de la apertura y el cierre del carrito; se puede poner su fin a mano). Arriba, el valor total de la oferta y cuántas veces el precio.
  - **Diseño visual (octubre 2026)**: arriba, «🎁 Tu oferta» con las cifras (cuántas cosas incluye, cuántos bonus y el **valor total** con cuántas veces el precio) y una barra que reparte el valor entre lo incluido, los bonus y el precio. **1 · Lo que incluye el programa** y **2 · Los bonus** se añaden **pulsando una tarjeta por tipo** (🎬 grabado, 👥 grupal, 🧑‍⚕️ individual… / 🔴 BAR directo, ⚡ 24 h, ⏳ 48 h, 🎁 todo el carrito, con su explicación); cada cosa sale como una tarjeta con su icono y **se ordena sola por categorías**, con un encabezado por grupo (cuántas y cuánto valen). **3 · La garantía** con botones Sí / No. Al final, **«📋 Así queda tu oferta»**: todo ordenado por categorías como lo vería quien compra (✓ cada cosa con su valor, «Y además, los bonus», la garantía y el valor total frente al precio). Código: `ordenarOferta()`, `refrescarOfertaEditor()` y los `[data-of-picker]` en `public/js/app.js`; los Sí / No eligen el `<select>` oculto (`[data-seg-for]`).
- **Métricas → Ventas → Oferta y bonus**: la oferta, las ventas de cada día del carrito con los bonus activos ese día (y cuál caduca) y el **impacto de cada bonus**: ventas en su ventana, % del carrito, ventas al día mientras estuvo activo frente al resto del carrito, ventas del día en que caduca frente a la media (efecto de la fecha límite) y una lectura. Las ventas se cuentan por día (fecha de compra).
- Un lanzamiento nuevo hereda la oferta del anterior.

- **Objetivo de cada bonus**: acelera el resultado, resuelve un problema futuro, reduce la percepción de riesgo u «Otro» (escrito a mano). Sale junto al bonus en el resumen de la oferta.
- **Garantía**: ¿hay garantía de 15 días? y, además, ¿hay alguna otra? (con cuál es). También en los meteóricos.
- Tipos de entregable: contenido grabado, sesiones grupales o individuales, presencial, descargable, audio, chatbot / agente, comunidad (plataforma propia, Skool, Telegram o WhatsApp), soporte (chatbot de soporte, seguimiento individual o email / WhatsApp) y servicio.
## ✉️ Emails: apertura, CTR e indicadores

- **Métricas → Resumen**: «Apertura media de los emails» y «CTR medio de los emails» (medias ponderadas por entregas).
- **Métricas → Emails** (lanzamientos y VSL; en los meteóricos, en su propia vista): cada email con su **asunto**, entregados, **apertura**, **CTR** y **clics sobre aperturas (CTOR)**, con indicador ▲ Alta / ● En la media / ▼ Baja frente a la **media del resto** de emails del embudo (±15 %; con menos de 30 entregas no se compara) y qué mejorar: apertura baja → el **asunto**; pocos clics de quien abre → la **llamada a la acción**. Arriba, el mejor asunto, la mejor llamada a la acción y el asunto a mejorar.
- **Qué emails son de cada embudo**: en la configuración, «Emails de este lanzamiento / de la VSL / del meteórico»: texto que lleva en el nombre la campaña o el workflow de GHL (varios, separados por comas). Vacío en un lanzamiento o meteórico = las campañas enviadas durante sus fechas.
- Los datos salen de GHL (estadísticas acumuladas de cada email; se guardan 10 minutos, botón «Actualizar»). De los emails de workflows GHL no da el asunto, solo el nombre del paso.
- ⚠️ **Permisos del token**: la integración privada de GHL necesita **View Email Campaigns** (`emails/campaigns.readonly`) y **View Email Stats** (`emails/stats.readonly`). Si faltan, la pestaña lo dice.

## 🎨 Aspecto y modo día / noche
**Diseño clásico o espacial (Cuenta → Diseño).** «🎨 Clásico» es el de siempre (con modo día / noche). «🚀 Espacial»
lleva el estilo de la pantalla de acceso a todo el dashboard: siempre oscuro, cielo con estrellas que caen despacio y
nebulosas, barra de arriba y tarjetas de cristal, botones naranja espacial y el saludo del Inicio con el degradado
del titular (el botón de día / noche se oculta). Se guarda en el navegador de cada persona (`lsd_estilo`) y se aplica
antes de pintar la página (`tema.js`, `<html data-estilo>`), así que no parpadea. Con «reducir movimiento» del
sistema, las estrellas no se mueven.
**Dirección principal (login): `alquimia.tenaxdigital.com`.** Quien abre la pantalla de entrar (`/` o `/index.html`) por cualquier otra dirección (`data.discendocultura.com`, `leads-mldlm.pages.dev`…) va ahí con un 302, conservando los parámetros (`?reset=…`, `?oauth=…`). Todo lo demás (la API, `tracker.js`, `oferta.js`, `vsl.js`, `/directo`, `marca.html`, el conector de Claude) sigue respondiendo en todas las direcciones, porque las páginas de GHL, LabIA, las tareas programadas y los webhooks usan la antigua: **no quites `data.discendocultura.com` del proyecto**. **Se activa** poniendo en Cloudflare (proyecto del dashboard → Configuración → Variables y secretos) la variable `DOMINIO_LOGIN` = `alquimia.tenaxdigital.com` y volviendo a desplegar, solo cuando esa dirección ya cargue; sin ella no se redirige. En local nunca redirige. Código: `lib/dominio.js` y `functions/_middleware.js` (por eso `/` e `/index.html` están en `public/_routes.json`).

**Marca: AlquimIA.** El logo (matraz con la gráfica y «Alquim» + «IA» en degradado naranja) está hecho en SVG dentro de `index.html`, así se adapta al tema claro y oscuro: arriba a la izquierda (seguido del nombre del cliente) y en la tarjeta del login; el matraz es también el icono de la pestaña. Al pie del formulario de entrar, en pequeño, «powered by» y el logo de la agencia (Tenax Digital, también en SVG). La pestaña del navegador se llama «AlquimIA · <cliente>».

**Pantalla de acceso:** siempre oscura, «Convierte tus datos en negocio» en grande, con la última palabra cambiando cada 2,4 s (negocio → ventas → cash → libertad → impacto; sin movimiento si el sistema pide reducirlo), y debajo «Inteligencia de negocio para escalar. Factura más, implementa más rápido y trabaja menos aprovechando los datos que ya tienes», fondo de espacio con estrellas en movimiento,
un cohete que despega (llama, humo y estelas), una gráfica de crecimiento que se dibuja y tarjetas de métricas
flotando; el acceso va en una tarjeta de cristal. En el móvil, solo el titular y el acceso (el cohete, pequeño, arriba).
Sin animaciones si el sistema pide reducir el movimiento.

- Diseño renovado: tipografía Inter, barra superior translúcida con botones sobrios (el color va solo en el icono; los textos se ocultan en pantallas estrechas y quedan en el aviso al pasar el ratón), menú de embudos con indicador del activo, pestañas y subpestañas más limpias, tarjetas, tablas, campos y ventanas con sombras suaves.
- **Modo día / noche automático según la hora** del ordenador: claro de 8:00 a 20:00 y oscuro el resto (se revisa cada minuto).
- Botón ☀️/🌙 en la barra superior (también en el acceso y en la vista del cliente) para cambiarlo a mano. Ese cambio dura **hasta el siguiente cambio automático** (las 8:00 o las 20:00) y después vuelve a seguir la hora; un puntito en el botón indica que está elegido a mano. Se guarda en el navegador (`lsd_tema`), en `public/tema.js`.

## 🗓️ Planificación por tipo de embudo y calendario del cliente

- **Calendario**: es **el mismo en todos los embudos del cliente**. Enseña los hitos (lanzamientos y meteóricos), las tareas con fecha y los eventos de **todos** sus embudos; lo del embudo abierto se resalta y lo de los demás lleva su nombre («De otro embudo», con botón «Ir al embudo»). Las franjas de color son las del embudo abierto (captación, clases, directo, carrito… o calentamiento y oferta abierta). «Solo este embudo» filtra.
- **Tareas**: cada tipo de embudo tiene sus fases y su planificación:
  - **Lanzamientos**: Preparación, Captación, Clases, Directo, Carrito y Cierre, con las tareas habituales («Cargar tareas habituales»).
  - **Meteóricos**: Preparación, Calentamiento, Oferta abierta y Cierre. Al crear un meteórico se crean **ya** sus tareas, adaptadas a su configuración (downsell de un lanzamiento o a la base de datos, pago único / a plazos / suscripción, anuncios, grupo de WhatsApp, «foto» si no hay campo de fecha de compra, página de oferta cerrada…). Las fechas salen del calentamiento, la apertura y el cierre; lo que ya debería estar hecho queda **para hoy** (acciones inmediatas). En Tareas eliges el meteórico y «Crear tareas del meteórico» añade las que falten.
  - **VSL**: Preparación, Publicidad y captación, Llamadas y seguimiento, Revisión y mejora («Crear tareas de la VSL»).

## 💳 Tipo de pago (lanzamientos, VSL y meteóricos)

En la configuración de cada lanzamiento, VSL o meteórico eliges el **tipo de pago**:

- **Pago único**: precio único y, si marcas «También se puede pagar fraccionado», el precio, la etiqueta y el enlace del pago a plazos (si no lo marcas, esos campos desaparecen).
- **Suscripción**: marca los planes que tiene (**mensual, trimestral, semestral, anual**) y pon de cada uno su precio por periodo, su **etiqueta de GHL** (la pone el workflow de ese pago; en la pestaña de etiquetas) y su **enlace de pago** (con los enlaces).

En Métricas, con suscripción, verás las **altas por plan**, la facturación (primer cobro de cada alta) y el **MRR** (ingreso mensual recurrente equivalente: un anual de 240 € son 20 €/mes). En los mensajes puedes usar `{link_plan_mensual}`, `{link_plan_anual}`…; `{link_pago}` es el del primer plan. En la página de un meteórico con varios planes sale un botón por plan.

## 💬 SendFlow (grupos de WhatsApp) · conexión
1. En **SendFlow → API Keys** crea una clave de SendAPI (tu plan debe incluir SendAPI). No la pegues en ningún chat.
2. En **Cloudflare → Workers & Pages → el proyecto → Settings → Variables and Secrets → Add**: tipo **Secret**,
   nombre `SENDFLOW_API_KEY` (otros clientes: `SENDFLOW_API_KEY_<CLIENTE>`) y como valor la clave.
3. **Deployments → ⋯ → Retry deployment** (1-2 min).
4. En el dashboard: **Cuenta → Conexiones → Probar conexión**. Debe decir «Conectado» con tus campañas y comprobar
   que la analítica (entradas, salidas y clics) responde.
**Límite de SendAPI (estricto):** si se le pide demasiado, SendFlow bloquea la clave 30 min o más (y cada vez más).
El dashboard: solo llama al pulsar «Probar conexión» (abrir Conexiones no gasta nada), deja 3 s entre peticiones,
guarda campañas (10 min) y analítica (5 min) en D1 y, si SendFlow responde 429/403, no vuelve a llamarle hasta que
pase el bloqueo (el freno va con cada clave: con una clave nueva se empieza de cero).
**Grupos de cada lanzamiento y meteórico:** en Configuración (Captación → «Grupos de WhatsApp · campaña de SendFlow»)
o en el meteórico («Campaña de SendFlow») eliges su campaña (la lista se pide a SendFlow solo al abrir el desplegable).
Después, **Métricas → Grupos de WhatsApp** enseña: personas en los grupos ahora (entradas − salidas), % de los
registros que está en el grupo, % de salidas, % del clic en el enlace a entrar, grupos llenos y la tabla día a día
(entradas, salidas, neto, clics y registros de GHL). En el meteórico sale en su vista. Datos guardados 5 min (grupos 10 min).
**Cruce con GHL (fase 2):** SendFlow exporta los participantes actuales (CSV Position;Group;Name;Number; tarda hasta
2 min, guardado 30 min en D1). El CSV pasa tal cual al navegador (sin leerlo en Cloudflare: 10 ms de CPU) y allí se
cruza con los leads por los **últimos 9 dígitos del teléfono**, sin contar a las administradoras (quien está en todos
los grupos, con 3 o más). Resultado:
- **Métricas → Resumen → Leads totales:** debajo, «💬 X % en grupos de WhatsApp (n)» (exacto; «≈» aproximado con
  entradas − salidas mientras se cruza).
- **Hoy → Setting hoy → «💬 En el grupo de WhatsApp y sin comprar»:** las que siguen en el grupo, no han comprado y
  aún no se les ha escrito, de más a menos caliente, con su WhatsApp 1:1. En cada lead, la señal «En el grupo de WhatsApp».
- **Métricas → Grupos de WhatsApp:** cuántos leads están, cuántos compraron y cuántos siguen sin comprar.
**Vigilancia (fase 3):** una tarea de cron-job.org **cada 15 minutos** abre
`https://<tu-proyecto>.pages.dev/api/sendflow?op=vigilar&key=<DIGEST_KEY>` (otros clientes: `&c=<cliente>`; la URL
está en Cuenta → Conexiones; cambia `<DIGEST_KEY>`, signos `< >` incluidos, por el valor de la variable de Cloudflare). Si
cron-job.org da «Unauthorized», abre la URL en el navegador: la respuesta trae `motivo` (falta DIGEST_KEY en Cloudflare,
es corta, la URL aún lleva `<DIGEST_KEY>` o la clave no coincide; nunca muestra la clave). Usa una clave de solo letras
y números: `&`, `#`, `%` o `?` se rompen en la URL. Los espacios del principio o del final no cuentan. Solo trabaja con lanzamientos en captación o carrito y meteóricos en curso que tengan
campaña de SendFlow (máx. 3; unas 2 peticiones a SendFlow por campaña). Guarda una foto (entradas, salidas y clics) y avisa de:
- **🔗 Enlace caído:** el «Grupo de WhatsApp · enlace» del lanzamiento (o del meteórico) da error o no responde
  (mejor poner el enlace de redirección de SendFlow que el de un grupo concreto).
- **🈵 Grupos llenos:** todos los grupos de la campaña están llenos.
- **🖱️ Clics sin entradas:** 15 o más clics en la última hora y ninguna entrada.
- **🚪 Pico de salidas (fuga):** en la última media hora se han salido 10 o más y el triple de lo normal (media de
  cada media hora de las últimas 24 h). En la fase 4 se cruzará con el mensaje enviado justo antes.
Avisos: por **email** (al del resumen diario; todos) y, si quieres, por **WhatsApp** (solo los fallos: enlace roto, grupos llenos o clics sin entradas; los picos de salidas no) a un número desde una cuenta de SendFlow
(Cuenta → Conexiones → «Dónde te avisa»). El mismo aviso no se repite en 3 h (las fugas, en 1 h). En **Métricas →
Grupos de WhatsApp → Vigilancia**: última comprobación, estado del enlace y de los grupos, avisos recientes y
entradas y salidas por hora de las últimas 24 h (la hora con el pico, marcada).
**Calentamiento del grupo (fase 4) · Crear → Grupo de WhatsApp** (lanzamientos y meteóricos):
1. **Copiar el prompt:** ya lleva la ficha de marca y avatar del producto del embudo (Marca y avatar), el producto, las fechas (captación, clases, directo, carrito / oferta), precios,
   entregables y bonus, los días elegidos y lo ya programado. Se pega en Claude con la skill de copy.
   **Día del directo (o de cada directo):** el prompt exige que todos los mensajes de ese día solo recuerden que es hoy
   (y la hora), cuenten lo que se verá en la masterclass y lleven **el enlace de acceso al directo**
   (`/directo?l=<código>[&v=<vídeo>]`, pide el email); nada de venta ese día. Campo opcional «¿Qué verán en la
   masterclass?» que entra en el prompt. En la lista, aviso en los mensajes de ese día que no llevan el enlace.
   **Estrategia de la preclase:** el prompt lista lo que se desbloquea en la página preclase por orden (clases con su
   título, test, descargable; la música y la votación con su clase). El día de cada desbloqueo: anunciar que ya está,
   beneficios y curiosidad, repetido con otro ángulo; los días siguientes, foco en el nuevo y recordar los anteriores.
   El enlace siempre es el de la página preclase (si falta, deja `[ENLACE DE LA PÁGINA PRECLASE]`).
2. **Pegar la respuesta:** formato `### AAAA-MM-DD HH:MM | tipo [| mencionar | varias]` y el contenido debajo
   (`Archivo:`, `Guion:`, `Texto:`; opciones de encuesta con `- `). Se convierte en mensajes editables.
3. **Archivos:** SendFlow necesita un **enlace público al archivo** (GHL → Sitios → Medios → ⋯ → Copiar enlace).
   Vimeo/YouTube no sirven. Formatos: imagen .jpg/.png · vídeo .mp4 (H.264, vertical) · audio .mp3/.m4a · nota de voz
   .ogg (opus) o .mp3 · documento .pdf; máx. 16 MB.
4. **Programar en SendFlow** (con confirmación): `POST /actions/send-message` con `scheduledTo`, a todos los grupos de
   la campaña; tipos texto (con mención a todos), imagen, vídeo, audio, nota de voz, encuesta (2-12 opciones) y documento.
   En tandas de 8 con 3 s entre peticiones. Lo que le falta algo no se programa. Lo programado no se edita: se cancela
   (si SendFlow no deja cancelarlo por API, se cancela allí y se marca aquí). Las encuestas enviadas enseñan sus votos.
   Los mensajes se guardan en D1 (`lsd_calentamiento_<código>`).
El **detector de fuga** (fase 3) dice ahora qué mensaje salió justo antes del pico de salidas.
Ver: permiso «Carrito»; preparar y programar: permiso «Configuración».
API: `GET /api/sendflow?op=probar` · `?op=campanas` · `?op=cuentas` (permiso «config») · `?op=calentamiento&l=` ·
`?op=votos&l=&id=` · `POST {op: calentamiento-guardar | programar | cancelar | marcar-cancelado}` · `?op=grupos&l=<código>` (permiso «metricas») ·
`?op=miembros&l=<código>` (CSV; permisos hoy, leads o métricas). Base `https://sendflow.pro/sendapi` (cambiable con `SENDFLOW_BASE_URL`).

### 📈 Impacto de cada mensaje del grupo (Métricas → Grupos de WhatsApp)
Al pulsar **«Ver el impacto de cada mensaje»** (nunca solo: SendAPI limita las peticiones) se cruzan los mensajes
enviados al grupo con lo que pasó después. Mensajes: los programados desde el dashboard (con su texto) **y los que se
mandaron desde SendFlow** sin pasar por él (solo la hora; `GET /actions` de la campaña, guardado 30 min). Así funciona
también si al crear el embudo dijiste que los mensajes «ya los tengo» (eso solo quita los prompts de Plan).
**Regla de atribución:** cada **venta**, **reserva de llamada** e **inicio de pago** se atribuye al **último mensaje
enviado en las 3 horas anteriores**; si no hubo ninguno, va a «sin mensaje cerca». Horas: venta = su llegada a la
página de pago ese mismo día (GHL solo guarda el día de la compra; sin esa visita, «sin hora»); reserva = cuándo se
reservó la cita (`dateAdded` de GHL); inicio de pago = primera llegada a la página de pago. **Salidas:** las de la
primera hora tras el mensaje frente a lo normal (media por hora de las 24 h anteriores); ⚠️ si son el doble o más (y
5 o más). Si ya se cruzó el grupo con GHL por teléfono, solo cuentan las personas del grupo. Tabla por mensaje (hora,
mensaje, salidas, inicios de pago, reservas, ventas e importe) y tarjetas: % de ventas / reservas / inicios de pago
que llegaron tras un mensaje, el mensaje que más vendió y el que más salidas provocó. Es una señal, no prueba de causa.
Las salidas por hora salen de la vigilancia (fotos cada 15 min), que ahora se guardan **30 días** (los 3 últimos cada
15 min y antes una por hora) para poder medir todo el lanzamiento. Código: `public/js/impacto-wa.js`.

## 🎨 Marca y avatar (Cuenta → Marca y avatar)
El cuestionario de cada cliente: la **fuente de todos los prompts** del dashboard (páginas del embudo y mensajes de
WhatsApp). Se guarda solo mientras se escribe, por campos (el cliente y el equipo pueden escribir a la vez sin pisarse).
- **Marca** (una por cliente): identidad (quién, autoridad, historia, misión, valores, «enemigo», cifras, redes,
  referentes), tono (tú/usted, género, emojis, expresiones, palabras prohibidas, ejemplos) y estilo visual (5 colores,
  tipografías, estilo, logo, fotos, webs de referencia).
- **Productos** (hasta 8): la oferta (promesa, resultados, método, qué incluye, precio, bonus, garantía, para quién sí/no,
  testimonios, FAQ) y su **avatar** (quién es, día a día, dolores, deseos, miedos, lo que ya probó, objeciones, frases
  literales, creencias, quién decide, dónde está, nivel de consciencia). En «🧭 Embudos» se elige qué producto vende cada
  embudo (sin elegir, el primero).
- **Documentos** (hasta 15; PDF, Word .docx, TXT, MD o CSV): el texto se saca **en el navegador** (pdf.js y mammoth,
  copiados en `public/vendor/` con versión fija) y solo se guarda el texto (máx. 300.000 caracteres por documento, en D1
  aparte: `lsd_marca_doc_<id>`, sin copias). Los PDF escaneados no se pueden leer. Necesita D1.
- **Ficha de marca y avatar** (por producto): «Copiar el prompt de la ficha» lleva todas las respuestas y el texto de
  los documentos; se pega en Claude y su respuesta se pega en el dashboard. Los prompts usan la ficha; sin ficha, las
  respuestas tal cual. El estilo visual va siempre aparte en los prompts de páginas.
- **Enlace para el cliente**: `/marca.html?c=<cliente>&t=<clave>` (sin cuenta). Ve y rellena sus respuestas, añade
  productos y sube documentos; no ve las fichas. «Crear otro» invalida el anterior; «Desactivar» lo cierra.
- **Quién tiene que rellenarlo antes de entrar (lo eliges tú):** al dar de alta a una persona en *Equipo → Miembros
  del equipo* hay una casilla **«Tiene que rellenar Marca y avatar antes de poder entrar»**, sea cual sea su rol (se
  marca sola al elegir el rol Cliente y se puede desmarcar). Después se cambia en la columna **🎨 Marca** de la lista.
  Esa persona, hasta que el cuestionario del cliente esté terminado (por ella o por otra persona), solo ve el asistente;
  al enviarlo entra al dashboard normal con su rol. Se guarda por cliente (`marcaObligatoria` del usuario); sin marcar
  nada, como antes: solo el rol Cliente. El superadmin nunca se queda bloqueado.
- **Asistente para el cliente (lo primero que ve):** por su enlace y al entrar al dashboard con su acceso de
  **Cliente**, mientras no lo haya terminado, solo ve el asistente (ni portal ni nada más), en el paso donde lo dejó
  (se guarda en el servidor). Empieza con un aviso (15-20 min, sin prisas) y va por orden de importancia: tú y tu
  historia → qué vendes → por cada producto: oferta, promesa, método, para quién y su cliente ideal (dolores, deseos,
  miedos, objeciones, frases…) → tono → colores y estilo visual → valores y redes → documentos (opcional) → enviar.
  Etapas de 2-3 preguntas que caben en la pantalla, barra de progreso («Paso X de N · Y % respondido») siempre
  visible, botón **Guardar** (además del guardado automático), Anterior / Siguiente. No deja pasar con obligatorias
  vacías (las marca en rojo); las opcionales lo dicen. «Enviar y terminar» solo con todo lo obligatorio; después, su
  portal. El equipo ve en el panel por dónde va o cuándo lo terminó, y puede **reabrirlo**.
- **Superadmin:** selector de cliente en el panel para ver y editar la marca de cualquier cliente sin cambiar de
  cliente en el dashboard.
- El **alta guiada** del cliente (Agencia) incluye el paso «Cuestionario de marca y avatar (con su ficha)».
- API: `GET/POST /api/marca` (equipo; escribir pide el permiso «config») y con `t=` (el cliente desde su enlace).

## 🎯 Crear anuncios con IA (Anuncios → Crear con IA)
**Diseño (Anuncios, Páginas y Grupo de WhatsApp):** las tres vistas comparten estructura para que no agobien: una
cabecera con título, una línea y los pasos en fila; avisos de una sola línea con su botón a la derecha (p. ej. «Falta
el cuestionario de marca»); los ajustes juntos en un bloque (Anuncios: nombre del evento, logo y notas; los ganadores,
plegados); y el contenido en tarjetas en cuadrícula con una sola acción principal (Anuncios: «⚡ Copiar Todo en uno» y
debajo Guiones / Magnific / Copys; Páginas: una tarjeta numerada por página con «📋 Copiar el prompt» y lo demás en
«Personalizar y ver el prompt»; WhatsApp: pasos 1-2-3 numerados, con las fechas y el temario en dos columnas).
En todos los embudos. **Plan** va ahora en el orden del embudo: Anuncios → Páginas → Grupo de WhatsApp → Carrito →
Planificador → Calendario → Tareas. Por cada **objetivo** del tipo de embudo (lanzamientos: captación al directo,
retargeting de consumo y venta del producto; VSL: captación, consumo y venta; meteórico: calentamiento y venta; venta
directa: venta en frío y retargeting) hay 4 prompts para Claude:
- **⚡ Todo en uno:** guiones → copys → creación en Magnific, parando en cada paso.
- **🎬 Guiones de vídeo:** 5 ángulos, con gancho de 3 s, escenas (lo que se ve, lo que se dice, texto en pantalla) y CTA.
- **🖼️ Crear en Magnific** (conector MCP de Claude): kit de marca (colores, tipografías, logo), plan y coste en
  créditos antes de generar, imágenes 1:1, 4:5 y 9:16, vídeos 9:16 con subtítulos y voz en off, en una carpeta con
  nombres que luego se ponen igual en Meta.
- **✍️ Copys para Meta:** 3 textos principales con emojis (corto, medio, historia), 5 titulares y 3 descripciones,
  generales para todo el objetivo.
Todos llevan los **anuncios ganadores** (del lanzamiento abierto, de todos los lanzamientos del embudo con «Usar los
ganadores de todos los lanzamientos», o de la VSL; por ventas y, si no hay, por leads; con el conector de Meta, Claude
puede mirar sus creativos), las notas opcionales sobre lo que ha funcionado, la **ficha de marca, avatar y producto**,
el estilo visual, los datos del embudo y las reglas de Meta (sin atributos personales, sin antes/después, sin promesas
de salud). Sin histórico, se basan en la ficha y proponen ángulos nuevos.
**Nunca «webinar»:** en lanzamientos y VSL hay un campo «¿Cómo llamamos al evento gratuito en los anuncios?» con
sugerencias según el formato (webinar: «clase gratuita», «masterclass en directo gratuita»…; 2-3 vídeos: «formación
gratuita en 3 clases»…; PLF: «Semana de…», «serie de clases gratuitas»; reto: «reto gratuito de N días»). Se recuerda en
este navegador. Los prompts prohíben la palabra «webinar», dicen el formato del lanzamiento y, si el campo está vacío,
Claude pregunta el nombre (con opciones para ese formato) antes de empezar.
**🖼️ Logo del lanzamiento** (lanzamientos, en la tarjeta de Captación): el enlace a la imagen del logo (PNG con fondo
transparente; GHL → Sitios → Medios → ⋯ → Copiar enlace). Se guarda en el lanzamiento (lo ve todo el equipo; solo
`https://`) y entra en los 4 prompts de **captación**: Claude debe usar esa imagen tal cual (sin redibujarla) en cada
formato de imagen y en el cierre de cada vídeo, y en Magnific la sube y la añade al kit de marca.

## 🧱 Páginas del embudo con IA (Crear → Páginas)
**Nota de GHL en la vista (siempre visible):** en cada página, en la sección donde se pega el código, activar
«Extender sección» (*Full width*) y poner a 0 los márgenes y el relleno; lo mismo en su fila y su columna, con la
anchura sin píxeles fijos (automático / 100 %). Si no, la página se ve estrecha o con bordes blancos.

**¿De cero o ya hechas? (＋ Nuevo embudo → paso «Páginas y WhatsApp»).** Al crear un embudo se pregunta (obligatorio)
si las **páginas** ya están creadas o se van a crear de cero y, en lanzamientos y meteóricos, lo mismo con los
**mensajes del grupo de WhatsApp**. De cero → se activa su sección en Plan (Páginas / Grupo de WhatsApp); ya hechas → no
aparece (manda lo elegido: no se cuela por la regla de compatibilidad de los embudos antiguos). Se puede cambiar con ⚙️.
Si las páginas son de cero, el asistente ofrece **proponer las URLs** (casilla marcada) con el **dominio** (se sugiere
el de otro embudo o el de alguna página ya configurada) y el **nombre del embudo** (editable): `dominio/nombre-página`.
Lanzamiento: `-registro` (orgánico: redes, bio, emails) y `-registro-ads` (publicidad), `-gracias`, `-acceso` (login) y
`-preclase` (si hay preclase), `-replay`, `-inscripcion` (venta) y `-pago`; VSL: registro ×2, `-gracias`, `-video` y
`-cita-confirmada`; meteórico: `-oferta`; venta directa: `dominio/nombre` (venta), `-pago`, `-especial` (upsell),
`-alternativa` (downsell) y `-gracias`. Se ven en el paso final y en **Crear → Páginas** (cada una con «Copiar» y
«Copiar todas»), van en el prompt de su página («URL de esta página»), **rellenan los enlaces de los lanzamientos
nuevos** del embudo (gracias, acceso, preclase, replay, venta y pago) y van en el **prompt del grupo de WhatsApp**:
calentamiento → preclase, directo → acceso al directo, grabación → replay, carrito → venta (bloque «A dónde lleva cada
mensaje»; lo que se haya puesto a mano en el lanzamiento manda). Se guardan en el embudo (`paginasOrigen`, `waOrigen`,
`urls: { dominio, nombre }`; `public/js/urls-paginas.js`).

En todos los tipos de embudo. Por cada página (lanzamientos: registro, gracias, login, preclase, venta, pago y
grabación; VSL: registro, contenido, gracias y gracias de la llamada; meteórico: oferta; venta directa: venta,
checkout, upsell, downsell y gracias) hay un **prompt para Claude** con: objetivo y estructura recomendada de la página,
datos del embudo (fechas, precios, oferta, bonus, enlaces), la **ficha de marca y avatar** del producto del embudo, el
**estilo visual** de la marca, los **códigos del dashboard** que lleva esa página (los mismos de «Códigos para GHL»,
que se incluyen tal cual) e indicaciones opcionales (se recuerdan en este navegador). Claude devuelve **un único bloque
HTML + CSS** (clases con prefijo propio, sin JS, mobile-first) para pegar en un elemento «Código personalizado» de GHL;
en registro y pago deja el hueco para el formulario de GHL. La API de GHL no permite crear páginas: el último paso
(pegar) es manual.

## 🛒 Venta directa / producto de entrada (low ticket)
Embudo sin registro: **anuncio → página de venta → checkout (con bump offers) → upsell → downsell → gracias**.
Se crea con **＋ Nuevo embudo → Venta directa** y el asistente pregunta **«¿Qué lleva tu embudo?»** con interruptores:
bump offers, upsell, downsell, medir visitas de las páginas e inversión de Meta automática. Lo apagado no se pide en la
configuración ni sale en las métricas (se cambia cuando quieras en **⚙️ Configurar el embudo**).

- **Configuración**: producto, precio (IVA incluido, + IVA o sin IVA), etiqueta de compra (y opcional el campo «Fecha de
  compra»); cada **bump**, **upsell** y **downsell** con nombre, precio, IVA, **su etiqueta de GHL** y su página; URLs;
  filtro de campañas de Meta (o inversión al día a mano) y objetivos (CPA máximo, ROAS mínimo, ventas al mes).
- **Métricas** (por periodo: 7/30/90 días, este mes, el pasado o fechas a medida): ventas, facturación sin IVA y ROAS en
  grande; inversión, visitas, clic al checkout, cierre del checkout, conversión de la página, **CPA** (con el CPA máximo
  para no perder dinero = ticket medio), **ticket medio** (y cuánto lo suben los extras) y beneficio. Cada bump y upsell:
  % de compradoras que lo coge; el **downsell**, % de las que dijeron que no al upsell. Día a día con barras.
- **Compradoras**: quién compró, cuándo, qué extras se llevó y su WhatsApp; filtro por extra.
- **Visitas**: bloque `<div data-lsd-directa="venta|checkout|upsell|downsell|gracias" data-embudo="id">` + tracker.js
  (en ⚙️ → Páginas → Códigos). Visitantes únicos en D1 (tabla `visitas_directa`), una petición al día por navegador y página.
- También en **Inicio**, el **portal del cliente**, **Tareas** («Crear tareas del embudo»), **Calendario** y el **Auditor**.
  Permisos: Métricas usa «Métricas» y Compradoras usa «Leads» (no hace falta tocar los roles).
- API: `GET /api/directa?d=<id>&preset=30d` (cacheado 5 min en D1) y `POST /api/directa {op:'visita', d, pagina, v}` (pública).

## ⚡ Meteóricos (ofertas flash)
Una oferta de pocas horas (p. ej. 12 h) tras 4-5 días de calentamiento por email y WhatsApp, a la base de datos. Dos maneras:
- **Independiente** (Black Friday, rebajas…): «＋ Nuevo embudo» → **⚡ Meteóricos**. Cada edición es un meteórico de ese embudo (desplegable arriba, «+ Nuevo meteórico»).
- **Downsell tras un lanzamiento** (o para ofrecer otro producto): en el lanzamiento, *Métricas → Meteórico posterior* → «+ Crear meteórico posterior».

Cada meteórico tiene: nombre y código, producto y oferta, precio (y a plazos), **calentamiento** (día), **apertura y cierre** (día y hora), etiqueta de compra (y de pago a plazos), campo de fecha de compra, página de la oferta, enlaces de pago, página de «oferta cerrada», grupo de WhatsApp, textos de la cuenta atrás, objetivos de ventas y facturación, inversión (o Meta con su filtro) y notas.

El público no se mide (grupos de WhatsApp y listas). Se mide: **fase y cuenta atrás**, **ventas** (etiqueta de compra con su fecha entre el calentamiento y el cierre; si el producto ya se vendía y no hay campo de fecha, con la **«foto»** de quién ya tenía la etiqueta, que se hace antes de abrir), pago único / a plazos, **facturación** y ticket, **visitas a la página de la oferta**, **conversión** (ventas / visitas), inversión, coste por venta y ROAS, ventas y visitas por día y la lista de **compradoras**. El auditor dice qué falta para dejarlo listo y las **Tareas** funcionan igual que en los lanzamientos.

**Página de la oferta** (bloque «Código HTML» en GHL; el meteórico te da el código exacto):
```html
<div data-lsd-oferta></div>
<script src="https://<tu-proyecto>.pages.dev/oferta.js?m=<código>" defer></script>
```
Durante el calentamiento muestra «la oferta se abre en…», con la oferta abierta el botón de compra y «se cierra en…», y al cerrar «ha terminado» (o manda a la página de oferta cerrada). Cuenta una visita por persona y sesión.

**Oferta y bonus del meteórico**: en *Configurar → Oferta* van los entregables y los bonus: **BAR 30 min** y **BAR 1 h** (para quien compra en los primeros 30 minutos o en la primera hora tras abrir), BAR 24 h / 48 h y bonus de toda la oferta (o con fin a mano). La pestaña **Oferta** del embudo (y la sección de abajo en *Métricas → Downsell*) cruza los bonus con las ventas **hora a hora**: ventas en la ventana de cada bonus, ritmo de ventas por hora mientras estuvo activo frente al resto de la oferta y el empujón de los últimos minutos antes de que caduque. Para medir por horas hace falta la **hora** de cada compra: un campo de **texto** en GHL que el workflow de compra rellene con la fecha y hora (`{{right_now}}`), elegido como «Campo de fecha de compra» (el desplegable muestra los de fecha y los de texto). Con un campo de solo fecha, la oferta se ve pero el análisis por horas no.

## ⚡ Nuevo lanzamiento rápido
«Nuevo lanzamiento» (y al crear un embudo de lanzamientos) abre un asistente **en 4 pasos** (① Fechas ② Oferta y objetivo
③ Qué te dejo hecho ④ Revisar y crear; Intro pasa al siguiente): **nombre**, **día y hora del directo**
(en los de varios vídeos, del 1.º), **días de carrito abierto** (propone los del anterior; fijan el cierre: desde el día
siguiente al vídeo de venta, el último a las 23:59) y **de qué lanzamiento copiar** (el último del embudo, por defecto). Con eso:
- **Copia el anterior entero** (oferta, bonus, precios, etiquetas de VIP y compra, textos, barras, recursos, envíos y
  notas del carrito, enlaces de las páginas…) y **mueve todas sus fechas** los mismos días que el directo, así se
  mantienen los intervalos (captación, clases, apertura y cierre del carrito, grabación, tramos de las barras, bonus).
  Si cambia la hora del directo, lo de ese día a partir de esa hora se mueve también. Se vacía lo de cada edición:
  Zoom, grupo de WhatsApp, campaña de SendFlow, vídeo de la grabación y la «foto» de etiquetas.
- Sin lanzamiento anterior: **plantilla estándar** (captación 14 días antes; clases cada 2 días a las 10:00, la última
  3 días antes; vídeos seguidos según el formato; carrito desde 1 h 30 min tras el vídeo de venta y 5 días; grabación
  al día siguiente a las 10:00) y, si el embudo viene de una plantilla de agencia, su oferta y precios.
- **Código** propuesto (`<embudo>-<mes><año>`, p. ej. `camino-nov26`) y **etiqueta de registro** con el código nuevo
  (la del anterior cambiando su código; si no lo llevaba, `registro-<código>`); avisa si aún no existe en GHL.
- **Sala de Zoom** (casilla): la crea con registro obligatorio y aprobación automática (lo que necesita el enlace
  personal de cada lead) y sin los emails de Zoom; si el anterior tenía sala, con sus mismos ajustes, duración y
  anfitrión. En formatos de varios vídeos, una por cada vídeo que en el anterior era en directo. Necesita que la app
  de Zoom (Server-to-Server) tenga el permiso `meeting:write` (o `meeting:write:meeting:admin`); si Zoom pide
  anfitrión, variable `ZOOM_HOST_EMAIL` (o `ZOOM_HOST_EMAIL_<CLIENTE>`). Si falla, el lanzamiento se crea igual y lo avisa.
- **Días de captación**: propone los del anterior (o 14); la captación empieza esos días antes del directo y acaba el día del directo.
- **💶 Precios y bonus** (plegable): precio de la entrada VIP y del programa (si el de la oferta era el mismo que el del
  programa, cambia también) y casillas con los bonus que se mantienen (los demás se quitan de la oferta).
- **🎯 Objetivo de facturación** (plegable): con la media de los lanzamientos anteriores del embudo (los resultados que
  guarda el Planificador en el navegador, o «Cargar mis lanzamientos anteriores», y los metidos a mano), escenario neutro,
  calcula registros, VIP, ventas, inversión en anuncios (y al día) y ROAS. El ticket se ajusta si cambias el precio del
  programa. Se guardan como **objetivos** del lanzamiento y como **presupuesto** y días de captación del Planificador.
- **⚙️ Además, déjame hecho…** (casillas):
  - 🗓️ **Copiar las tareas** del anterior: mismas personas o roles, fase y notas; fecha movida; sin hacer y sin comentarios
    (no duplica si ya están).
  - 💬 **Copiar los mensajes del grupo de WhatsApp** del anterior: en borrador, con la fecha movida y los enlaces del nuevo
    (las URL que cambian, como la de Zoom, y `?l=<código>` de los enlaces del dashboard). Solo si el nuevo no tiene mensajes;
    los cancelados no se copian. Luego se revisan y se programan en Crear → Grupo de WhatsApp.
  - 🏷️ **Crear la etiqueta de registro en GHL** (desmarcada de serie: escribe en GHL; si ya existe, no se puede marcar).
  - 📲 **Crear la campaña de grupos en SendFlow** (`POST /releases`, tipo WhatsRelease; desmarcada de serie) y vincularla
    al lanzamiento. Los grupos y el enlace de entrada se hacen en SendFlow. *Ruta de SendAPI aún sin probar con la real.*
  Si algo falla, el lanzamiento se crea igual y la pantalla de enhorabuena lo marca con ⚠️. Si se reintenta tras un
  fallo, las salas de Zoom y la campaña de SendFlow ya creadas se reutilizan (no se duplican).
- **Lo que no se copia** (es de cada edición): objetivos, inversión a mano, presupuesto y días de captación del
  Planificador y sus resultados. Los **filtros de Meta y de emails** pasan al código nuevo si llevaban el del anterior; si
  no, se quitan (y se avisa) para no sumar la inversión ni los emails del anterior.
- **Mensajes copiados**: también se mueven las fechas escritas en el texto («martes 20 de octubre», «20/10» si es una
  fecha cercana) y la hora del directo si cambia («19:00» → «18:00»); la pantalla dice cuántas, para revisarlas.
- **Comprobaciones**: directo ya pasado (hay que confirmarlo), captación que empezaría antes de hoy y solape con otro
  lanzamiento del mismo embudo (de la captación al cierre del carrito).
- **Objetivo**: los tres escenarios (desfavorable, neutro ✓, favorable); se guardan los del neutro. Los resultados de
  cada lanzamiento que calcula el Planificador se guardan también en el servidor (`op: 'resultados'`), así el cálculo es
  igual en cualquier dispositivo. Si cambias el precio del programa, avisa de que se supone la misma conversión.
- **↩️ Deshacer** (pantalla de enhorabuena, hasta 24 h después): borra el lanzamiento, sus salas de Zoom, sus tareas y
  sus mensajes en borrador y la campaña de SendFlow si la creó el asistente (no si ya hay mensajes programados). La
  etiqueta de GHL se queda. *Borrar la campaña en SendAPI (`DELETE /releases/<id>`) aún sin probar con la real.*
- **📧 Emails a reprogramar**: en la pantalla de enhorabuena, las campañas de email del anterior con su fecha nueva
  (para duplicarlas y programarlas en GHL) y cuántos emails de workflows hay (van solos: revisar la etiqueta nueva).
  Código: `handlers/nuevo-lanzamiento.js` (`POST /api/nuevo-lanzamiento`, ops `tareas`, `whatsapp`, `etiqueta`, `sendflow`; permiso «config»).
- Vista previa con las fechas en claro antes de crear; al crear, se guarda, se hace la «foto» de etiquetas y sale la
  **pantalla de enhorabuena** (ver abajo); su botón abre la Configuración para revisar (la barra «Listo para lanzar» marca lo que falte). «Configurar a mano» abre el
  formulario de siempre. Código: `public/js/lanzamiento-rapido.js`, `handlers/zoom-sala.js` (`POST /api/zoom-sala`).

## 📅 Periodos de Métricas y día de cada venta (venta directa)
- **Selector de fechas** (VSL y venta directa, y el portal del cliente): Hoy · Últimos 30 días (por defecto) · Últimos 90 días · Mes en curso · Mes pasado (+ «Elegir mes y semana…» en la VSL y «Fechas a medida…»). «Mes en curso» acaba **hoy** (antes enseñaba los días que faltaban con 0). Un periodo guardado que ya no existe (7 días) vuelve a 30 días.
- **Día de cada venta sin campo «Fecha de compra»** (venta directa): antes era el día en que se creó el contacto, así que quien ya estaba en GHL y compraba hoy contaba el día de su alta (o ni entraba en el periodo). Ahora se descargan **todas** las compradoras y el servidor apunta en `lsd_directa_compras_<id>` (sin historial) el día de cada una al ver su etiqueta de compra por primera vez: contacto nuevo → su día de alta; contacto que ya existía → el día en que GHL lo actualizó al ponerle la etiqueta (o hoy). La primera vez, las compradoras que ya había se quedan con su día de alta (como antes). **Con el email de compra** (Configuración del embudo → «Asunto del email de compra», p. ej. `(PRIMEROS PASOS) Reto de ovulación`): GHL no deja ver cuándo entró alguien en un workflow, pero sí el email que envía el workflow de compra, con su hora exacta. Las compras de quien ya era contacto (actualizado en los últimos 14 días) se fechan con la de ese email (`/conversations/messages/export`, como mucho 10 contactos por carga; cada uno se comprueba una vez). Necesita el permiso «View Conversation Messages» del token; si falta, Métricas lo avisa. Con el campo de fecha de compra (puesto por el workflow de compra), manda el campo: es lo más exacto. **Medición mixta**: si el campo se crea con el embudo ya en marcha, quien compró antes no lo tiene relleno y se sigue fechando por la etiqueta y el email (Métricas → Día a día dice cuántas ventas del periodo van así). Código: `apuntarCompras()`, `comprasDudosas()` y `fechaEmailCompra()` en `public/js/directa.js`; `emailsDeContacto()` en `lib/ghl.js`.
- **Selector de campo de fecha igual en todos los embudos** (`pintarSelectFecha()` en `app.js`): fecha de compra del lanzamiento, venta directa (antes había que escribir el ID), meteórico y fecha de registro/compra de la VSL. Muestra los campos de fecha de GHL y, aparte, los de texto (fecha y hora, p. ej. `{{right_now}}`); el campo guardado se mantiene aunque la lista tarde o ya no esté en GHL, y los campos se piden una sola vez.

## 👑 Venta directa → Anuncios ganadores
Pestaña nueva en los embudos de venta directa (junto a Métricas y Compradoras), con el periodo de arriba: qué **anuncios, conjuntos o campañas** traen ventas al **menor coste por venta (CAC)** y cuáles traen **más ventas** (botones «Menor CAC» / «Más ventas»). Cada compradora lleva su anuncio de origen (UTM `utm_campaign/utm_term/utm_content` con los ids, o los campos del formulario de Meta) y se cruza con el gasto de Meta por anuncio de las campañas del filtro. **Podio** 🥇🥈🥉 con CAC, ventas y ROAS (hacen falta 2 ventas o más: con una sola el CAC es suerte); tabla con ventas, facturación sin IVA, inversión, CAC (verde si está por debajo de tu CPA máximo o, si no lo hay, del ticket medio; rojo si está por encima) y ROAS; lo que **gasta sin vender** sale al final («sin ventas»), y cuántas ventas no tienen anuncio identificado. Código: `ganadoresDirecta()` en `public/js/directa.js`; `adSpend()` devuelve además la `estructura` (campaña → conjunto → anuncio).

**Iconos**: todas las pestañas tienen el suyo (en venta directa faltaban los de Métricas y Compradoras y salía el genérico, que parece un «cargando»). `test/iconos.test.js` falla si una pestaña nueva no tiene icono o usa uno que no existe.

## 📣 Código de las campañas de Meta (VSL, venta directa y meteóricos)
Junto al campo «Campañas de Meta» de cada VSL, venta directa y meteórico, el dashboard propone un código para el **nombre de sus campañas en Meta**: `VSL-<embudo>`, `DIR-<embudo>` y `MET-<código>` (sin repetir el tipo: la VSL «vsl» llamada «VSL Raíces» → `VSL-raices`). Se pone al principio del nombre de cada campaña (p. ej. `VSL-raices · Captación · Frío`) y el dashboard suma solo la inversión de las campañas que lo contienen (sin distinguir mayúsculas ni acentos). Botones **Copiar** y **Usar este** (lo escribe en el campo), y avisos si está vacío en una VSL (se sumaría **toda la cuenta**) o si choca con el filtro de otro embudo (uno contiene al otro). Las VSL y ventas directas nuevas nacen ya con su código, y los meteóricos nuevos sin filtro lo reciben al guardarlos. Los lanzamientos siguen igual (su código o el filtro de Configuración → Captación). Código: `public/js/meta-codigo.js`.

## 🏷️ Etiqueta de registro: nomenclatura fija
La etiqueta de registro de cada lanzamiento (la que pone el workflow de registro y con la que el dashboard cuenta los leads) es SIEMPRE **`registrado-webinar-DDMMAA`** con la fecha del directo: directo el 29/10/2026 → `registrado-webinar-291026`; el 5/7/2027 → `registrado-webinar-050727`. La propone el asistente de nuevo lanzamiento; en Configuración → Etiquetas, si la que hay es otra, sale «Poner «registrado-webinar-…»» y la lista de comprobación la marca como «no sigue la nomenclatura»; los prompts de automatizaciones usan siempre la buena. Código: `etiquetaRegistro()` en `public/js/lanzamiento-rapido.js`.

## ⚙️ Automatizaciones de GHL (Crear → Automatizaciones)
Al crear un embudo («Nuevo embudo», paso *¿Partes de cero?*) y un lanzamiento (asistente, paso *¿Qué te dejo hecho?*) se pregunta si **las automatizaciones de GoHighLevel ya existen o hay que crearlas de cero** (se guarda en el embudo, `autoOrigen`, y en el lanzamiento, `automatizaciones.origen`; se puede cambiar en la pestaña).
- **La lista** depende del tipo de embudo, con los datos reales de la Configuración (etiquetas, URLs, fechas): lanzamiento → registro (etiqueta fija + publicidad/orgánico + confirmación), encuesta, compra VIP (si hay VIP), recordatorios del directo (día antes, 1 h antes y al empezar, con el enlace de la preclase; uno por vídeo en PLF), grabación disponible, compra del programa (único/fraccionado, campo de fecha, sacarla de los avisos), carrito abandonado y llamada (si hay calendario) · VSL → registro, llamada, seguimiento y compra · venta directa → compra, extras (bumps, upsell, downsell) y carrito abandonado · meteórico → compra y últimas horas.
- **De cero**: el conector de GHL **no puede crear workflows** (la API pública solo los lee), así que cada tarjeta trae su **prompt para Claude en el navegador** (Claude in Chrome o Cowork): carpeta con el **nombre del lanzamiento**, nombre `[código] 01 · Registro al webinar`, disparador, acciones en orden, reglas (etiquetas exactas, no tocar otros workflows, textos provisionales [REVISAR], dejarlo en **borrador**) y cómo probarlo; y «Para la IA de GHL», una descripción corta para el asistente de IA de workflows de GHL. Arriba, **«0 · Preparar GHL»**: crear la carpeta y las etiquetas que falten y comprobar formularios, encuesta, productos y calendario.
- **Ya existen**: cada tarjeta dice qué revisar (la etiqueta nueva, las fechas de los «Wait»…).
- Cada una tiene **estado** (pendiente · creada · probada, con barra de progreso) y su **URL del workflow**: al pegarla pasa a creada y se añade a **Configuración → Accesos y enlaces** (tipo workflow). Si falta un dato en la Configuración, la tarjeta lo avisa y el prompt lo marca [FALTA].
- Servidor: `POST /api/config { op: 'automatizaciones', tipo, l, datos, workflow? }` (permiso «config»). Código: `public/js/automatizaciones.js`.

## 🔗 Páginas del lanzamiento en Accesos y enlaces
Al crear un lanzamiento con el asistente, sus páginas (las URLs propuestas del embudo y las que ya tenga puestas) se añaden a **Configuración → Accesos y enlaces** como «Nombre del lanzamiento · Página…», sin duplicar (misma URL o nombre: manda la nueva). Accesos admite hasta 80 enlaces.

## 🧠 Análisis → Analizar con Claude
Primera pestaña de Plan: el **análisis del lanzamiento** (el mismo prompt que en Tareas; si aún no hay ninguno cerrado, uno que le pide a Claude que lo busque) y accesos directos a lo demás que se hace con Claude: encuesta para copy, narrativa y anuncios, páginas, automatizaciones, grupo de WhatsApp y emails. El conector se llama **«Dashboard Datos»**.

## 🧠 Análisis del lanzamiento con Claude (Plan → Tareas)
En **Análisis → Analizar con Claude** (antes era la pestaña «Claude» de Plan; ahora solo tiene el análisis) y en **Plan → Tareas** (debajo del progreso), la tarjeta **«🧠 Análisis del lanzamiento con Claude»** copia un prompt para pegar en Claude **con el conector del dashboard activado**. Analiza el último lanzamiento que ya cerró del embudo (si el abierto ya cerró, él mismo) comparado con los dos anteriores; Claude saca solo los datos (`ver_embudos`, `metricas_embudo` de los tres, `encuesta_para_copy`, `emails_lanzamiento`, `tareas_lanzamiento` con las hechas y `marca_y_narrativa`) y devuelve: resumen ejecutivo, cuadro de mando (este · anterior · variación · objetivo), el embudo paso a paso con **el cuello de botella**, qué funcionó y qué no (dato frente a hipótesis), lo que dice el avatar, emails, ejecución del equipo, **8-12 mejoras para el próximo** (qué cambiar exactamente, por qué —dato y razonamiento—, impacto esperado, esfuerzo, prioridad ICE y cómo medirlo), objetivos realistas para el siguiente, 3 experimentos A/B y un checklist de 10 tareas. Es la tarea de **Preparación** «Analizar con Claude el lanzamiento anterior» (14 días antes de la captación). Código: `public/js/analisis-ia.js`.

## 🧠 Claude (Cowork y claude.ai): conector del dashboard
Claude consulta el dashboard por sí mismo, sin copiar y pegar prompts. **Fase 1: solo lectura.** Se explica en
**Agencia → Panel → 🧠 Claude**, con la URL para copiar y la lista de conexiones (con «Desconectar»).

- **Conectar**: en Claude, Ajustes → Conectores → Añadir conector personalizado, URL `https://<tu-dashboard>/api/mcp`.
  Al pulsar Conectar se abre el dashboard: si no has entrado, «Entrar en el dashboard» y vuelve solo a la pantalla de
  permiso; **Permitir** → vuelve a Claude. Claude entra **con tu usuario**: tus permisos, tus clientes y tu rol en cada
  uno (si te desactivan, te cambian el rol, cambias la contraseña o desconectas, deja de ver lo que tú no ves).
- **Herramientas** (todas de solo lectura, en el cliente que se le pida, por id o nombre):
  `ver_embudos` (clientes, embudos y lanzamientos con fechas, estado, precios y narrativa) ·
  `metricas_embudo` (lo mismo que el resumen: registros, VIP, ventas, facturación, inversión, ROAS, CPL, CAC, embudo, objetivos e hitos; permiso Métricas o Resumen) ·
  `encuesta_para_copy` (el mismo contenido que «🧠 Analizar con Claude»: respuestas libres anónimas y agrupadas con [COMPRÓ], % de las de opciones, ficha y narrativa y la guía del análisis; cacheada 30 min, sin nombres; permiso Leads, Avatar o Métricas) ·
  `marca_y_narrativa` (ficha de marca/producto/avatar, estilo visual y narrativa del lanzamiento) ·
  `tareas_lanzamiento` (pendientes o todas, con fase, fecha, asignada y vencidas) ·
  `emails_lanzamiento` (calendario de emails propuesto y resultados de los enviados en GHL con los asuntos ganadores; permiso Métricas).
  `datos_informe` (para preparar y mandar el informe del cliente: destinatarios con nombre y email —rol «Cliente» y los de «✉️ Destinatarios»—, colores, tipografías y logo de la marca —del Estilo visual de Marca y avatar o, si falta, de Configuración → Marca—, fechas de cada fase —captación, directo y carrito—, el enlace firmado al informe web y si ya se envió, y las **llamadas de valoración por fase** con resultados y motivos de no compra, sin datos de los leads; permiso Configuración). Las llamadas se registran en el dashboard (Hoy → Llamadas: citas del calendario de GHL; el resultado se anota aquí y mueve el pipeline de GHL); desde ahora cada resultado guarda también el día de la cita para repartirlas por fase.
  Nunca devuelven emails ni teléfonos de los leads. El rol «Cliente» solo ve `ver_embudos` y `metricas_embudo`.
- **Seguridad**: OAuth 2.1 con PKCE (S256) y registro dinámico; solo redirecciones a `claude.ai` / `claude.com`
  (y `localhost` para pruebas; `MCP_REDIRECTS` en Cloudflare añade otros dominios, separados por comas). Pantalla de
  permiso con CSRF y sin iframes. Código de un solo uso (5 min; si se repite, se revoca la conexión), access token de
  1 h y refresh token que rota en cada uso (caduca a los 60 días sin usarse). Todo firmado con `SESSION_SECRET`
  (cambiarla desconecta a todos). Las conexiones se guardan en `lsd_mcp` (común, sin historial).
- **Cloudflare**: `functions/_middleware.js` atiende `/.well-known/oauth-*` (metadatos que Claude busca) y
  `public/_routes.json` limita las funciones a `/api/*`, `/directo` y `/.well-known/*` (los estáticos no gastan peticiones).
- Código: `lib/oauth.js`, `handlers/oauth.js` (`/api/oauth/register|authorize|token|conexiones`), `handlers/mcp.js`
  (`POST /api/mcp`, JSON-RPC sin estado), `lib/mcp-tools.js`. Pruebas: `test/mcp.test.js`.
- **Fase 2 (pendiente)**: escritura limitada (guardar narrativa, actualizar la ficha, crear tareas, borradores), siempre
  con confirmación.

## 📲 Bot de Telegram de la agencia
Avisos y resúmenes en el móvil, y preguntas cuando quieras. Se configura en **Agencia → Panel → 📲 Bot de Telegram**
(solo superadmin):
1. En Telegram, [@BotFather](https://t.me/BotFather) → `/newbot` → nombre (p. ej. «Estelabs») y usuario acabado en `bot`.
2. El **token** que da va en Cloudflare como `TELEGRAM_BOT_TOKEN` (Secret) + «Retry deployment». Nunca en un chat ni en el código.
3. **Conectar el bot** (registra el webhook `POST /api/telegram` con una cabecera secreta que sale de `SESSION_SECRET`, y
   el menú de comandos) y **Vincular mi Telegram** (enlace `t.me/<bot>?start=<código>` de un solo uso, 15 minutos).

El bot **solo responde a chats privados vinculados** por un superadmin (si esa persona deja de ser superadmin o se
desactiva, su chat deja de valer). Comandos:
- `/estado`: todos los clientes (registros, ventas, ROAS, próximo hito, críticos y tareas vencidas), primero los que
  tienen críticos. Usa los resúmenes guardados del panel de agencia y recalcula el más antiguo.
- `/resumen <cliente>` (por código o nombre, sin tildes): el detalle recién calculado; sin nombre, botones para elegir.
- `/hoy`: los hitos de hoy y de mañana de cada cliente y lo que hay que resolver.
- `/ayuda`.

Avisos automáticos a los chats vinculados: el **resumen de cada mañana** (la misma tarea de cron-job.org de
`/api/agencia?key=…` que manda el email del auditor) y los de la **vigilancia de los grupos de WhatsApp** (picos de
salidas, enlace caído, grupos llenos…), con las mismas esperas que el email para no repetir. «Mandarme una prueba»
comprueba que llegan. Código: `lib/telegram.js`, `handlers/telegram.js`. Los chats vinculados se guardan en `lsd_telegram` (común).

## 🧭 Narrativa del lanzamiento (con IA)
La gran idea de la que bebe todo el lanzamiento: una metáfora con un referente reconocible y su estética. Ejemplo:
«El Camino hacia tu embarazo natural», inspirado en el Camino de Santiago (cada clase es una etapa, la credencial con
sellos, las flechas amarillas, la concha…), del que salen el copy, los anuncios y el diseño de las páginas.
- **Dónde**: en el asistente de nuevo lanzamiento (paso ② «Oferta y narrativa»: mantener la del anterior, ✨ crear una
  nueva con IA o ninguna) y, después, en la tarjeta 🧭 de **Anuncios → Crear con IA, Páginas y Grupo de WhatsApp** («✨ Crear con
  IA» / «✏️ Cambiar»).
- **Cómo**: «Copiar el prompt» lleva la ficha de marca, producto y avatar, el estilo visual, la oferta, las fechas, el
  formato, las etapas del embudo y la narrativa anterior (para no repetirla). Claude propone 5 narrativas (con referente,
  imágenes clave, por qué conecta y riesgo), recomienda una y espera; la elegida la desarrolla en un formato fijo entre
  `===NARRATIVA===` y `===FIN NARRATIVA===`: título, idea central, referente, promesa, el viaje etapa a etapa, nombres
  (evento, clases, grupo de WhatsApp, bonus…), símbolos y rituales, vocabulario, palabras a evitar, tono, dirección
  visual (paleta con hex, texturas, fotografía, iconos, composición), escenas para anuncios, ganchos, titulares, mensajes
  clave por canal y frase firma + CTA. Al pegarla, el dashboard se queda con lo de dentro de las marcas y saca el título.
- **Qué hace**: se guarda en el lanzamiento (`narrativa: { titulo, texto }`, `op: 'narrativa'`) y entra sola, como
  bloque OBLIGATORIO con instrucciones de cada canal, en los prompts de **anuncios** (guiones, Magnific, copys), de
  **cada página** del embudo (diseño, titulares, símbolos), de los **mensajes del grupo de WhatsApp** (cada mensaje, un
  momento del viaje) y de los **emails** (Crear → Emails). Los lanzamientos nuevos la heredan del anterior si se elige «mantener». Código: `public/js/narrativa.js`.

## ✉️ Emails con IA (Crear → Emails)
La secuencia de emails del lanzamiento para escribirla con Claude y programarla en GHL (lanzamientos):
- **Calendario de envíos** sacado de las fechas reales: bienvenida al registrarse, un email por cada clase o recurso de
  la preclase, entrada VIP (si hay), la víspera / la mañana / 1 hora antes / «estamos en directo» de cada vídeo,
  grabación (la del vídeo de venta la cubren los del día 1 del carrito), apertura del carrito y el **carrito: 3 emails al
  día (9:00, 15:00 y 20:00) y 4 el último (9:00, 13:00, 19:00 y 22:00)**. Cada uno rompe una objeción (distinta),
  genera emoción y da el motivo para comprar ya que toque a esa hora (bonus disponible, fin de un bonus, cierre); van de
  más emocionales a más racionales; el día 1 con foco en ver la grabación y desde el día 2 en la venta; el último día,
  el primero (9:00) es siempre el de **preguntas frecuentes** sobre el producto. Y, si se marca,
  el de después del cierre. Dos emails nunca coinciden a la misma hora.
- **Pantalla**: arriba, cuántos emails, días y de carrito y el botón «Copiar el prompt»; las fases como botones
  (encender / apagar); el calendario en tarjetas por día (fecha grande, qué pasa ese día y una tarjeta por email con su
  hora, el **mensaje a comunicar** —«Mira la grabación…», «La historia de alguien como tú», «Respuesta a «es caro»», «Hoy
  acaba el bonus…», «Cierra esta noche»…, sin repetirse— y el tono por color); al pasar el ratón, el detalle. Ese mensaje
  también va en el prompt para cada email.
  Indicaciones, asuntos ganadores y el prompt completo, plegados en «Ajustes del prompt».
- **Asuntos ganadores**: «Cargar los emails de <anterior>» trae de GHL los emails del lanzamiento anterior y entran en el
  prompt los 5 con más apertura y los 5 con más clics (con 100 entregas o más).
- **El prompt** lleva el calendario, los datos y enlaces del lanzamiento (y el de acceso al directo), las etiquetas de
  GHL para segmentar (excluir compradores), la ficha de marca, la **narrativa** (bloque obligatorio para emails) y las
  indicaciones; pide cada email con fecha y hora, segmento, asunto A y B, preheader, cuerpo con `{{contact.first_name}}`,
  botón con su URL y P. D., y una tabla resumen para programarlos. Código: `public/js/emails-ia.js`.

## 🎉 Enhorabuena: siguientes pasos al crear un embudo o un lanzamiento
Al terminar «＋ Nuevo embudo» (en los de lanzamientos, después del asistente de nuevo lanzamiento; si se cierra sin
crearlo, también) o «Nuevo lanzamiento», sale una pantalla con confeti: lo que se ha hecho (copia, sala de Zoom, días de
carrito…) y **lo que toca ahora**, numerado y según el tipo de embudo y sus respuestas (etiqueta de registro a crear en
GHL, páginas de cero con sus prompts o propias con sus códigos, Zoom, grupo de WhatsApp, anuncios, tareas…).
Los mismos pasos le llegan **por email a quien lo ha creado** (desde el GHL de la agencia y con el remitente «Equipo
Estelabs» si está `EMAIL_REMITENTE`; con la marca del cliente). Con la contraseña general no hay email al que mandarlo
y la pantalla lo dice. Código: `public/js/siguientes-pasos.js`, `handlers/siguientes-pasos.js` (`POST /api/siguientes-pasos`).

## Embudos: Lanzamientos y VSL
El menú lateral (arriba en el móvil) cambia de embudo. Las pestañas siguen el mismo orden en todos, por momento de uso: **Hoy** (Setting hoy, Llamadas y En directo) · **Leads** · **Métricas** · **Plan** (Planificador, Calendario, Carrito y Tareas) · **Análisis** (Avatar y anuncios / Anuncios ganadores, Comparar y Rendimiento del equipo). En los meteóricos: **Meteóricos** · **Oferta** · **Plan**.

**Métricas del lanzamiento** en 6 subpestañas: **Resumen** (arriba, la facturación del lanzamiento, la de su meteórico posterior y la total), **Ventas** (rentabilidad, ventas por día, tipo de pago, oferta y bonus, ciclo de compra), **Captación** (tráfico de pago, campañas, origen y tipo de tráfico), **Vídeos y conversión**, **Emails** y **Downsell**.

 Cada uno tiene sus pestañas, sus tareas y su configuración; el equipo, la campanita, «Mi cuenta» y «Actualizar» son comunes. La campanita avisa de las tareas y comentarios de los dos embudos (los del otro llevan su nombre; al pulsar uno se cambia de embudo y se abre la tarea).

### VSL (siempre abierta)
Registro → vídeo de venta → compra directa o llamada de valoración. Pestañas (las mismas que en los lanzamientos y en el mismo orden): **Hoy** (Llamadas), **Leads**, **Métricas**, **Plan** (Calendario y Tareas) y **Análisis** (Anuncios ganadores, Comparar y Rendimiento del equipo) (con los mismos permisos que sus equivalentes de los lanzamientos).
- **Periodo**: últimos 7/30/90 días, este mes, mes pasado, un mes concreto y su **1ª, 2ª, 3ª, 4ª o 5ª semana** (días 1-7, 8-14, 15-21, 22-28 y 29-fin) o fechas a medida. Se recuerda en el navegador.
- **Métricas**: registros (publicidad/orgánico), vieron la VSL (y ≥50%), llamadas agendadas, ventas (directas o tras llamada), facturación, inversión en Meta (campañas cuyo nombre contiene el filtro, del periodo), coste por lead y por venta, ROAS; embudo del periodo, tabla **por semanas del mes**, gráfico diario, llamadas del periodo (shows, no shows, canceladas, ventas) y publicidad vs orgánico.
- **Leads**: estado de cada persona (no ha visto el vídeo, lo ha empezado, lo vio hasta el final, agendó llamada, compró), cuánto vio, su cita y su compra, con **WhatsApp** adaptado a su estado (mensajes editables abajo, con el permiso «Editar mensajes de WhatsApp»; variable nueva `{link_vsl}`).
- **Llamadas**: igual que en los lanzamientos, con el calendario y el pipeline de la VSL («Llamada de valoración RAICES» y «Leads evergreen» de serie).
- **Configuración de la VSL** (botón Configuración estando en la VSL): *Embudo* (etiquetas, campos de fecha, enlaces, pipeline, precios y filtro de campañas de Meta), *Páginas* (vídeo de la VSL, minuto en que aparecen los botones de compra y llamada y sus textos, vídeos de las páginas de gracias), *Códigos* y *Recursos* (como en los lanzamientos).
- **Páginas de GHL**: `<div data-lsd-vsl></div>` + `<script src="…/vsl.js" defer></script>` pinta el vídeo, mide los segundos realmente vistos (etiquetas `vsl_vsl_25/50/75/90`) y enseña los botones en el minuto elegido. `data-lsd-vsl-embed="gracias"` / `"agenda"` para los vídeos de las páginas de gracias. La lead se identifica con `?cid={{contact.id}}` en la URL.
- Fechas: GHL no guarda cuándo se pone una etiqueta; si un workflow guarda la fecha de registro o de compra en un campo, elígelo en la configuración (si no, se usa la fecha de alta del contacto).
- Las tareas de la VSL se guardan en `lsd_tareas_vsl` y los resultados de sus llamadas en `lsd_llamadas_vsl`. El código `vsl` está reservado (no puede usarse para un lanzamiento).

## Auditor de lanzamientos
Botón **Auditor** arriba (quien puede configurar), con un contador rojo de lo **crítico**. Revisa el embudo activo y lo ordena por gravedad (🔴 crítico · 🟠 importante · 🟡 aviso), con un botón **«Arreglar →»** que lleva al campo de la configuración, a la tarea o a la pestaña:
- **Fechas**: que estén todas (captación, clases, directo y su hora, cierre) y en orden.
- **Etiquetas**: registro (que no sea la de otro lanzamiento y que exista en GHL), compra, VIP, «foto» de VIP/compra, campo de fecha de compra.
- **Enlaces y páginas** según el hito para el que hacen falta: WhatsApp y VIP para la captación; login, preclase y vídeos para las clases; Zoom y reservar llamada para el directo; venta, pago y precio para el carrito; grabación. La urgencia sube sola: a más de 10 días es aviso, a 10 o menos importante y a 3 o menos (o pasado) crítico. También avisa de lo copiado del lanzamiento anterior sin cambiar (ID de Zoom, vídeos, grupo de WhatsApp).
- **Integraciones** (Zoom, Meta y su filtro, llamadas), **tareas** (vencidas, que vencen en 2 días, sin responsable o sin fecha), **equipo** (sin setter) y **datos reales** (captación sin registros, días sin registros nuevos, nadie ha visto la clase 1, nadie en el directo, ventas sin fecha, leads sin origen).
- En una VSL: etiquetas, vídeo, enlaces de compra y llamada, precio, campos de fecha, registros recientes y que el vídeo se esté midiendo.
- «Ignorar» oculta un aviso en ese lanzamiento (se puede volver a activar).

## Calendario
Pestaña **Calendario** (todos los roles), con vista **mensual** y **semanal**:
- **Hitos** del lanzamiento sacados de la configuración: inicio y fin de la publi de captación, clase 1, clase 2, webinar en directo, apertura del carrito (vacío = al empezar el directo), grabación y cierre del carrito.
- **Franjas de fase** de colores: captación, clases previas, webinar en directo y carrito abierto.
- Cada **fase colorea el día entero** (tono suave + línea gruesa arriba, del color de la fase; si se solapan, manda la más importante). Los **hitos** enmarcan el día y su etiqueta va en color sólido; el del **webinar en directo**, en rojo.
- **Tareas** con fecha (las vencidas en rojo) y **eventos propios** (email, RRSS, publicidad, reunión, directo/live; pueden durar varios días). Solo la admin crea o cambia eventos.
- **Otros lanzamientos**: muestra también sus hitos para ver si se solapan.
- Pulsa un día para ver el detalle, marcar tareas o (admin) añadir eventos y tareas ese día.
- **Sincronizar con mi calendario**: cada persona tiene un enlace privado para Google Calendar (*Añadir calendario → Desde URL*) o iPhone/Mac (webcal). Incluye hitos, eventos y sus tareas, y se actualiza solo. Si se desactiva a la persona, su enlace deja de funcionar.

Los datos se llaman igual que siempre: la configuración `lead_scoring_dashboard_config`, los usuarios `lsd_usuarios` (contraseñas solo como hash PBKDF2), las tareas `lsd_tareas_<código>`, los eventos `lsd_eventos_<código>` y las columnas extra del tablero `lsd_kanban_columnas`. Con la base de datos D1 viven en ella; sin D1, en los Custom Values de GHL (no los borres). Ver **Base de datos (D1)**.

## Base de datos (D1), historial y copias
El dashboard guarda sus datos (configuración, tareas, eventos, llamadas, equipo, roles, clientes…) en su **propia base de datos**: Cloudflare D1, gratis, en la misma cuenta de Cloudflare del dashboard (holadiscendo@gmail.com). Sin D1 sigue funcionando como antes (todo en los Custom Values del GHL de MLDLM), pero con D1:
- **No depende del GHL de un cliente**: lo común (equipo, clientes, seguridad, fotos) va aparte, en la «agencia».
- **Nadie pisa los cambios de otra persona**: cada dato lleva una versión. Si dos personas guardan a la vez, el servidor vuelve a aplicar el cambio sobre lo último (tareas, eventos, llamadas, equipo) o, en la Configuración, avisa: «Otra persona ha cambiado esto a la vez que tú. Vuelve a cargar y repite el cambio».
- **Dos personas en la misma configuración: «Tomar el control»**. Al abrir la configuración de un embudo (lanzamiento, VSL, venta directa o meteórico), si otra persona ya la tiene abierta sale un aviso: «Ana está editando esto», qué está editando y desde cuándo, con dos botones: **✋ Tomar el control** y **Ahora no**. Al tomar el control, a la otra persona se le cierra la ventana en unos segundos con el aviso «X ha tomado el control» (lo que no hubiera guardado no se guarda), y tú ves lo último guardado. Al cerrar la ventana el turno queda libre; si alguien cierra la pestaña o se queda sin conexión, se libera solo en minuto y medio. «Ver como» no pide turno (es solo mirar). Por dentro: `POST /api/editando` (`entrar`, `latido` cada 15 s, `tomar`, `salir`; permiso de configurar), guardado en `lsd_editando_config` sin historial.
- **Historial** (*Equipo → Historial*, admin): quién cambió qué y cuándo. El superadmin ve también el de la agencia.
- **Copias de seguridad**: de cada dato se guarda una copia al día (las últimas 30) y se puede **restaurar** con un clic (lo que había queda a su vez copiado). Botón para **descargar todos los datos** en JSON. Además, Cloudflare guarda la base de datos entera 30 días (*Time Travel*).
- **Migración automática**: la primera vez que se lee cada dato que aún no está en D1, se copia desde GHL. No hay que hacer nada; lo de GHL se queda como estaba (de reserva).

### Conectar D1 (una sola vez, ~3 minutos)
1. Entra en Cloudflare (holadiscendo@gmail.com) → **Storage & Databases → D1 SQL Database → Create**. Nombre: `dashboard-datos`. Ubicación: Europa (Western Europe).
2. Copia el **Database ID** que aparece (un código tipo `xxxxxxxx-xxxx-…`). No es secreto.
3. Ese ID va en `wrangler.toml` (`[[d1_databases]]`, ya puesto: `dashboard-datos`). Al desplegar, el dashboard la usa: las tablas se crean solas.

Como el proyecto tiene `wrangler.toml`, la base de datos se conecta ahí (no desde *Settings → Bindings* del panel).

## Seguridad
*Equipo → Seguridad* (admin; los ajustes, solo el superadmin):
- **Verificación en dos pasos** (TOTP: Google Authenticator, Microsoft Authenticator, 1Password…). Cada persona la activa en **Mi cuenta** escaneando un QR; recibe 10 **códigos de recuperación** de un solo uso. Al entrar se pide la contraseña y el código. Si alguien pierde el móvil, un admin (o el superadmin, si trabaja en varios clientes) se la quita y la vuelve a activar. Los admins sin ella ven un aviso arriba con «Activarla ahora», «Ahora no» (lo esconde hasta cerrar el navegador) y **«No volver a mostrar»** (se guarda en su usuario —`POST /api/usuarios {op: "aviso-2fa-ocultar"}`— y deja de salir en todos sus dispositivos; con la contraseña general, solo en ese navegador).
- **Exigirla a los admins**: quien sea admin en algún cliente tendrá que activarla al entrar (y no podrá quitársela).
- **Bloqueo de intentos**: 5 fallos seguidos con un email (o 20 desde una misma conexión) bloquean 15 minutos. También el código de verificación y la contraseña general.
- **Desactivar la contraseña general** (`ADMIN_PASSWORD`/`SETTER_PASSWORD`): deja de valer para entrar y las sesiones abiertas con ella se cierran. Solo puede hacerlo un superadmin que haya entrado con su email. Si os quedáis fuera: variable `REACTIVAR_CONTRASENA_GENERAL=1` en Cloudflare y volver a desplegar.
- **Permisos del token de GHL**: botón que comprueba, solo leyendo, a qué llega el token del cliente (contactos, etiquetas, custom values y fields, pipelines, calendarios, citas, conversaciones) y dice cuál falta marcar en la integración privada. Lo mínimo que necesita: lo de esa lista, nada más (no le des permisos de facturación, pagos, usuarios ni ajustes de la subcuenta).

## Escala
Los leads se cargan en páginas de 100 desde el navegador, así que 2.000 leads son unas 20
peticiones y la carga sigue funcionando con decenas de miles. La sincronización de Zoom etiqueta
en bloques de 25 y respeta el límite de peticiones de GHL.

## Desarrollo local
```bash
npm run dev:mock   # datos falsos, contraseñas "admin" / "setter" → http://localhost:3000
                   # (con una D1 local en memoria; D1_FILE=datos.sqlite para conservarla, NO_D1=1 para probar sin ella)
npm run dev        # contra GHL real, con las variables en un fichero .env
npm test           # cálculos, servidor y permisos
npm run test:e2e   # recorrido en un navegador de verdad (Playwright): todos los embudos, pestañas y diálogos,
                   # como admin y como setter, y el móvil. Falla si salta cualquier error.
npx wrangler pages dev   # igual que en Cloudflare (variables en .dev.vars)
```

**Huellas de los archivos (obligatorio tras cambiar CSS o JS):** `index.html` y `marca.html` piden `styles.css`, `tema.js` y cada módulo de `public/js` con su huella (`?v=<sha1>`; los módulos, con un *import map*). Así ningún navegador ni la caché de Cloudflare sirve un JS o CSS viejo con una página nueva (pasó con el enlace «¿Olvidaste tu contraseña?»: se veía, pero el JS antiguo no sabía abrirlo). Después de cambiar cualquiera de esos archivos ejecuta `npm run huellas`; `npm test` falla si alguna está desactualizada.

## ⚡ Menos peticiones al servidor (auditoría de octubre de 2026)
- **Navegador**: volver al Inicio en menos de 5 min lo repinta sin pedir nada; las tareas se refrescan cada 2 min pero solo se repintan si cambiaron (y un fallo puntual no vacía la lista); las de otros embudos, los grupos de SendFlow, los eventos y las llamadas se reutilizan unos minutos («Actualizar» los pide siempre); la VSL reutiliza sus leads de menos de 10 min; los grupos y los comentarios solo se piden con su pestaña a la vista; el Inicio de agencia actualiza 3 clientes a la vez; varias respuestas seguidas se pintan en un solo repintado; las respuestas que llegan tarde (de otro lanzamiento) se descartan.
- **Servidor**: el resumen del portal del cliente recalcula como mucho 2 embudos por visita (el resto sale de la caché o «Actualizando…»); el nombre del calendario de llamadas se guarda 24 h y sus contactos 10 min; el feed de calendario de la Operativa usa una caché de 5 min; la importación por MCP va en lotes de 8; límite por IP en el alta en Zoom.
- **Fallos corregidos**: el lanzamiento «en marcha» gana a uno futuro al elegir el vigente; el enlace de calendario de la Operativa caduca al cerrar todas las sesiones y vale con «Solo Operativa»; el carrito abandonado solo etiqueta a quien está registrado; el enlace de Zoom guardado solo se reutiliza si es de la reunión actual; guardar la configuración general nunca pierde campos; al iniciar sesión se borra el «Ver como»; la fase «en directo» del setter respeta el carrito; la imagen «48 horas» solo sale si la grabación dura 48 h.
- **Accesibilidad**: avisos y progreso anunciados al lector de pantalla; pestañas con su estado elegido.

## 📱 Móvil: todas las secciones a mano
Abajo, fijas, las tres primeras pestañas del embudo (p. ej. Hoy · Leads · Métricas) y **☰ Todo**: un panel con **todas las secciones** y, dentro de cada una, **sus páginas** como botones (Hoy → Setting hoy · Llamadas · En directo · LabIA; Anuncios → Cómo van · Ganadores · Crear con IA…). Un toque y estás en la página (`pintarNavMovil()` en `public/js/app.js`). Las subpestañas de cada sección se ven todas, en varias líneas si hace falta (antes iban en una fila que se cortaba por la derecha). En la vista sencilla, el panel trae «＋ Ver todas las pestañas». El aviso grande de la configuración no sale en el móvil: el botón «Configuración» ya dice cuánto falta.

## 📦 Productos (Configuración → Productos)
En **Configuración → 📦 Productos** (quien configura) se pone **cada producto que vende el cliente**: de aquí bebe la Inteligencia de negocio. La ventana explica arriba para qué sirve (nombre y precio · la etiqueta de compra · sus ofertas) y cada producto se rellena **paso a paso**, cada paso con su explicación y un ✓ al completarlo:
1. **¿Cómo se llama?** y qué tipo es: ⭐ producto principal · 🚪 de entrada (reto, guía, taller) · 🔁 para después (comunidad, nivel 2) · 📦 otro.
2. **¿Cuánto cuesta?** Primero, cómo se cobra: **💳 Pago único** o **🔁 Recurrente (membresía)**.
   - Pago único: el precio normal, sin descuentos (si es a plazos, el total).
   - Membresía: **hasta 3 planes** (tiers, p. ej. Básico, Pro y VIP), cada uno con su nombre y, en cada periodo que se venda (**mensual, trimestral, semestral, anual**), su **precio** y la **etiqueta de GHL** de quien paga así; debajo de cada precio que no es mensual, lo que sale al mes («= 24,17 €/mes»). En la lista sale «🔁 Membresía · 2 planes · desde 24,17 €/mes». Cada plan y periodo cuenta como una forma de comprarlo (como una oferta: «Básico · anual») y **cada alta cuenta como un cobro de su periodo** (`planes` y `variantesDe` en `public/js/productos.js`).
   - Con **IVA incluido / + IVA / sin IVA**; debajo, cuánto cuenta como facturado por venta (sin IVA, al 21 %).
3. **¿Qué etiqueta pone GHL a quien lo compra?** (en una membresía, opcional si cada plan y periodo ya tiene la suya). La que añade el workflow de compra; se elige de la lista de etiquetas de GHL y dice «✓ Existe en GHL» o «⚠️ No la encuentro».
4. **¿Lo vendes a veces a otro precio?** Sus **ofertas** (el mismo producto a otro precio: lanzamiento, Black Friday, precio para alumnas…), cada una con **nombre, precio y la etiqueta** de quien compra con ella.
5. **¿Dónde se vende?** Los embudos que lo venden (de ellos salen su coste por lead, ROAS y conversión).
6. **¿Qué quieres que compren después?** (opcional) El producto al que lleva (p. ej. el reto → Raíces).
7. **¿Cuándo lo compró cada persona?** (opcional) El campo de fecha de compra de GHL; si no, se usa la fecha de su compra en el embudo.

**Se rellena solo la primera vez** (`cargarCatalogo()` y `catalogoDesdeConfig()` en `lib/productos.js`): si el cliente nunca ha guardado productos, al abrir la ventana o la Inteligencia de negocio se ponen los que ya están configurados en sus embudos y se guardan: el **principal** del último lanzamiento con etiqueta de compra (nombre del producto de la marca, su precio, IVA, etiqueta y campo de fecha; los otros lanzamientos y la VSL con otra etiqueta, como ofertas, y sus embudos marcados); cada **venta directa** como producto de entrada propio (su nombre, precio, IVA, etiqueta y fecha) que **lleva al principal** si tiene configurado el «producto principal»; y cada **meteórico** con su producto. Luego se pueden cambiar a mano; si se borran todos, no se vuelven a poner.

La lista enseña cada producto con su precio, etiqueta, nº de ofertas, a qué lleva y «✓ Listo» o «⚠️ Falta …». Se guarda en `lsd_productos` (`GET/POST /api/productos`, `handlers/productos.js`; modelo y limpieza en `public/js/productos.js`; ventana en `public/js/productos-panel.js`).

**Cómo lo usa la Inteligencia de negocio**: por cada producto, una foto con todas las personas que tienen su etiqueta o la de una oferta (`lsd_negocio_c-<producto>-<firma>`, cada 6 h; si cambian precios o etiquetas, se rehace). Lo que pagó cada una es el precio de su oferta (si tiene varias etiquetas de oferta, la más barata) o el normal, **sin IVA**. Con productos puestos, **los productos de la Inteligencia salen de aquí** y también **las cifras de todo el negocio** (facturación, ventas, clientes, nuevos, LTV, CAC, ROAS con la inversión de los embudos, recompra y camino entre productos). Sin productos, todo sale de los embudos como antes, con una invitación «Poner mis productos».

## 📈 Inteligencia de negocio
En el menú lateral, debajo de **Inicio** (con «Decide con criterio» debajo del nombre) (para quien tiene Métricas; el rol **Cliente** la tiene en su portal, chip «📈 Inteligencia de negocio», solo para mirar; quien tiene embudos asignados ve solo los suyos). El histórico de **todos los embudos** del cliente, con un selector **Últimos 12 meses · Este año · Todo el histórico** (se recuerda). Sin datos: «A medida que tengamos datos de tu negocio, verás aquí tus métricas»; con pocas ventas, cada bloque lleva «Pocos datos todavía».

**Ordenada por secciones (para que alguien nuevo sepa dónde está cada cosa).** Arriba, una barra fija con cinco secciones, cada una con una frase que dice qué hay dentro: **📊 Resumen** (cómo va tu negocio y qué hacer ahora), **📦 Productos** (lo que vende y factura cada uno), **👥 Clientes** (cuánto tardan en comprar y si repiten: ciclo de compra, recompra, de la primera compra a la siguiente y ventas cruzadas), **📅 Evolución** (facturación e inversión mes a mes y la tabla de cada embudo) y **🧪 Mejora tus datos** (solo el equipo; con su % en la pestaña). El **Resumen** abre con una portada: la **facturación grande** con su gráfica de meses y, al lado, **🩺 la salud de tu negocio** con tres semáforos (🟢 bien · 🟡 vigilar · 🔴 mejorar) y una frase que los resume: rentabilidad de los anuncios (ROAS ≥ 3 verde, ≥ 1,5 ámbar), lo que deja un cliente frente a lo que cuesta (LTV ÷ CAC, igual) y clientes que vuelven a comprar (≥ 25 % verde, ≥ 10 % ámbar) (`saludNg` en `public/js/negocio-vista.js`). Después, «Lo que haría ahora», las cifras en **tres familias con una pregunta cada una** (¿Cuánto te deja? · ¿Cuánto te cuesta conseguirlo? · ¿Cómo conviertes?) y **🔎 Sigue explorando**, una tarjeta por sección con un dato de lo que hay dentro. La ficha de un producto lleva «← Todos los productos» y los demás productos para pasar de uno a otro. La sección elegida se recuerda en este navegador.

**Más cifras y datos accionables.** En la vista general, además de facturación, LTV, coste por lead, ROAS, CAC y LTV ÷ CAC: **ticket medio**, **conversión** (registro → venta) y **lo que vale cada lead** (facturación ÷ registros: lo máximo que se puede pagar por lead sin perder). El **ciclo de compra** sale con cifras grandes (lo normal, la media, % que compra en la primera semana y el mismo día) y cada tramo con su número y su %; igual en la ficha de cada producto. **«⏩ De la primera compra a la siguiente»**: cuánto tardan en comprar otro producto (lo normal, la media, % que compra un segundo producto, cuántos y por tramos: 7 días, 8-30, 1-3 meses, 3-6, más) y **«🚀 Cómo acortarlo»** (oferta solo para compradores con fecha límite, la página de gracias y el email de bienvenida, un WhatsApp a mitad de camino con el día calculado, un paso intermedio si tardan más de 3 meses, acceso anticipado si casi nadie repite); en la ficha de un producto, hasta el producto al que lleva. **«🧪 Mejora tus datos»** (solo quien configura): un anillo con el % de datos completos y lo que falta, cada cosa con lo que se verá al ponerla y un botón a donde se pone (productos, sus embudos, su campo de fecha, a qué lleva cada producto de entrada, precios e inversión de cada embudo —abre su configuración—, la fecha de compra en GHL y los lanzamientos anteriores); lo hecho, en chips ✓ (`calidadDatos()` en `lib/negocio-calc.js`). **«＋ Añadir producto»** siempre a mano: un botón junto a los productos de arriba y una tarjeta grande en «Tus productos».

**General y por producto.** Si hay productos en **Configuración → Productos**, salen de ahí (ver «📦 Productos»): cada ficha añade **«🏷️ A qué precio se vende»** (ventas, % y facturación a precio normal y con cada oferta, y el precio medio real), «También te compran», avisos si faltan fechas y recomendaciones como «La mayoría lo compra con oferta», «¿A qué producto quieres llevarles?» o «Ponle el campo de fecha de compra». Si no, arriba, una fila de botones: **🌐 Todo el negocio** y uno **por producto** (con lo que factura y su % del total, y una barrita de su peso). **Qué vende cada embudo**: los lanzamientos y las VSL, el producto de **Marca y avatar** (el elegido para ese embudo o, si solo hay uno, ese); una **venta directa vende su propio producto** (su nombre en la configuración o el del embudo, p. ej. «Reto Ovulación», 🛒), y el producto de Marca y avatar es **el producto al que quiere llevar** a sus compradores (p. ej. Raíces; si no hay, el «producto principal» de su upsell). Un embudo sin producto cuenta como producto propio (🚀/🎬) y **cada meteórico es un producto aparte** (⚡). En la vista general, además de lo de siempre, **«📦 Tus productos»**: una tarjeta por producto (facturación y su cambio, % de lo que facturas, ventas, ROAS, ticket, mini gráfica por mes y 💡 cuántas recomendaciones tiene); al pulsarla (o su botón de arriba) se abre su **ficha**: cabecera con el anillo de su % de la facturación, seis cifras (facturación, ticket medio, lo que deja quien lo compra contando todo lo que compra después, ROAS, coste por lead y conversión, con su cambio frente al periodo anterior), **«💡 Qué haría con …»** (hasta 3: ponle precio, pocos pasan a «Raíces» / el N % acaba comprando «Raíces» (venta directa), pierde dinero en anuncios, escala la inversión, convierte menos que tus otros productos / es el que mejor convierte, ofrece «X» justo después, sus clientes no compran nada más, tu negocio depende de él, factura un N % menos / crece, sus compradores se lo piensan), **«⏱️ Ciclo de compra» de ese producto** (los días del registro a la compra por tramos y, si se vende en lanzamientos, en qué momento del carrito se compra; también en su tarjeta, «⏱️ N d»), además del de todo el negocio en la vista general; **«🧭 El viaje de sus clientes»** (en una venta directa, arriba, **«🎯 El producto al que quiere llevar»**: qué % de sus compradores también lo ha comprado (por su etiqueta, como en el embudo), cuántos y, si fue después, a los cuántos días; debajo, a todo lo ancho, qué compraron antes → el producto → qué compran después, con huecos discretos si aún no hay nadie, y el % que compra otra cosa y a los cuántos días), su facturación por mes y la tabla de sus embudos. Se pinta con los datos ya cargados, sin volver a pedirlos. Cálculo: `productos` en `agregar()` y `recomendacionesProducto()` (`lib/negocio-calc.js`); vista: `public/js/negocio-vista.js`.
- **Números clave** (con ▲▼ frente al periodo anterior; en costes, bajar es bueno): facturación (clientes y ventas), **lo que deja un cliente (LTV)** —todas sus compras de todos los embudos, todo el histórico—, coste por lead medio, ROAS medio, **coste por cliente (CAC)** —inversión ÷ clientes cuya primera compra es del periodo— y **LTV ÷ CAC** (≥ 3 sano).
- **Qué haría ahora para facturar más**: hasta 3 recomendaciones automáticas por reglas (`recomendaciones()` en `lib/negocio-calc.js`): faltan precios, un embudo pierde dinero (ROAS < 1), pasar presupuesto al embudo con mejor ROAS (≥ 1,5 veces el peor), invertir más (LTV÷CAC ≥ 3) o cuidado (< 1,5), clientes que repiten (≥ 15 %: oferta para clientes) o casi nadie repite (< 8 %), el coste por lead de los dos últimos lanzamientos sube ≥ 25 % (renovar anuncios) o baja ≥ 20 % (escalar), se compra en la primera semana (≥ 75 %) o se tarda (≥ 30 % pasados 15 días), y el último día del carrito concentra ≥ 35 % de las ventas.
- **Ciclo de compra**: días desde que se registra hasta que compra (lo normal y por tramos) y, en lanzamientos, **cuándo compran** (directo, primer día, durante, último día). Solo cuenta las compras con fecha de compra (campo de GHL); si faltan, lo dice.
- **El cliente a lo largo del tiempo**: % que vuelve a comprar, lo que deja quien repite frente a quien compra una vez, días hasta la segunda compra y **el camino más habitual entre productos** (p. ej. «Lanzamientos → VSL»).
- **Actividad**: lanzamientos en total y en 12 meses, embudos activos, y un gráfico de **facturación e inversión por mes** con el ROAS encima.
- **Cada embudo**: registros, ventas, facturación, coste por lead, ROAS, conversión y **tendencia** (ROAS del último lanzamiento frente al anterior; en VSL y venta directa, del último trimestre frente al anterior); 🏆 el de mejor ROAS y ⚠️ el que pierde dinero. Al pulsar una fila se abre el embudo.

**Cómo se calcula** (`lib/negocio.js`, `GET /api/negocio?periodo=12m|ano|todo`): una **foto por pieza** guardada en `lsd_negocio_<id>` (sin historial): cada **lanzamiento** (registros, ventas, facturación con VIP y bumps, inversión y cada compra con su importe, día, días desde el registro y momento del carrito), cada **mes de una VSL o venta directa** (los últimos 12 y el actual; todos los meses de una vez con una descarga de leads y **una consulta a Meta por mes** —`adSpendPorMes()` en `lib/meta.js`, `time_increment=monthly`—) y cada **meteórico** abierto o cerrado. Las cerradas se calculan una vez; las en curso, como mucho cada 6 h; si una falla, se reintenta a las 6 h. Cada visita calcula **como mucho una** que falte (por el límite de 50 peticiones de Cloudflare) y el navegador repite mientras queden, enseñando «Revisando tu histórico: 3 de 8». Los cálculos (`agregar()`) están en `lib/negocio-calc.js` y el HTML en `public/js/negocio-vista.js` (lo usan el dashboard y el portal del cliente).

## Inicio, avisos del carrito y carga rápida
**Inicio del cliente: «¿qué tengo que hacer hoy?» y «¿cómo voy?» en 5 segundos** (nada se repite; lo que no tiene contenido no sale):
1. **Cabecera**: «Buenos días, Nombre 👋», el cliente y cuántos embudos activos, el periodo, **«Actualizado hace X min»** (la hora en que se calcularon los datos más antiguos de la página: cada respuesta de `/api/inicio` lleva `calculadoEn`) y «Actualizar datos».
2. **Cómo vas**: Facturación, Ventas e Inversión (con el ROAS conjunto), cada una con **▲▼ frente al periodo anterior** (verde / rojo; la inversión, sin color): VSL y venta directa, los mismos días justo antes; lanzamientos y meteóricos, el anterior del mismo embudo, sacado de las fotos de Inteligencia de negocio sin pedir nada a GHL (`parte=previo`, `previoInicio` en `lib/inicio.js`). Solo compara los embudos que tienen con qué. Sin objetivo de facturación (no hay anillo).
3. **🚀 Primeros pasos** (quien configura, mientras los datos no estén al 100 %): lo que falta según «Mejora tus datos», cada cosa con su botón (`botonCalidad`). Desaparece al completarlo.
4. **⚠️ Lo urgente** (solo si hay algo): avisos del carrito («Ir al lanzamiento →») y anuncios que se cansan («Preparar anuncios nuevos →», a Crear → Anuncios de ese embudo, y «Ver cuáles»).
5. **✅ Tus tareas de hoy | 📅 Próximos hitos** (2 columnas; en móvil, una): como mucho 5 tareas, primero las vencidas (en rojo) y luego las de hoy, las asignadas a ti o a tu rol (con la contraseña general, todas). El ✓ la completa sin salir (es la misma tarea de Plan → Tareas y la Operativa; la agenda del servidor se vuelve a leer, `olvidarAgenda`). «Ver las N →» abre la Operativa. Vacío: «Nada pendiente para hoy ✓». Los hitos: los 5 más cercanos, el primero destacado con su cuenta atrás («Hoy», «mañana», «en 6 días»).
6. **💡 Lo que haría ahora para facturar más**: la primera recomendación de Inteligencia de negocio (la misma función, `recosHtml`; si es un paso de la checklist, la siguiente) y «Ver más recomendaciones →».
7. **🧭 Tus embudos activos**: nombre, tipo, estado y 4 cifras (Facturación, Ventas, ROAS y Conversión; en venta directa y meteóricos, el ticket medio). Pulsando, su embudo. Con 1, a todo el ancho; con más, en columnas que siempre llenan la fila.
8. **💬 Te han mencionado**, solo si hay algo. Menos margen a los lados (hasta 1640 px).

**Pasos de la configuración de los embudos, todos a la vista**: sin barra para desplazarse, como tarjetas numeradas en una fila (en el móvil, más compactas). La venta directa pasa de 6 a **4 pasos**: 🛍️ Producto (qué lleva + el producto), 🧲 Pipeline de GHL, ➕ Extras y páginas (sin extras, solo «📄 Páginas») y 🎯 Objetivos. La VSL (Embudo · Páginas · Códigos · Accesos y enlaces) y el meteórico (Producto y tiempos · Oferta · Etiquetas y recursos) usan los mismos pasos en tarjetas (`.cfg-pasos-vis`); el lanzamiento sigue con sus categorías en el lateral de la ventana, todas visibles. Y donde decía «siempre abierto/a» ahora dice **evergreen**.

**Procesos → Importar un tablero entero de la Operativa** (p. ej. «Procesos Discendo» del proyecto Agencia): en Procesos → ＋ Nuevo proceso → 📥 Importar de un tablero, al elegir el proyecto (ahora también **Agencia**) y el tablero sale «📚 Importar el tablero entero»: cada columna con tarjetas pasa a ser una **categoría** (en su orden) y cada tarjeta un **proceso** de esa categoría (en su orden), con su descripción y su checklist como subtareas. Se puede repetir: cada proceso lleva el id de su tarjeta (`op-<id>`), así que la segunda vez se actualiza en vez de duplicarse (`tableroEntero` en `public/js/procesos-panel.js`, op `importar`).

**Columnas de la Operativa más anchas de serie**: 340 px como mínimo (antes 260); si no caben todas, el tablero se desplaza en horizontal. Las que se han ajustado a mano conservan su ancho (`ANCHO_COL` en `public/js/operativa-panel.js`).

**La Operativa se abre a la derecha del menú lateral**, que sigue visible: pulsar cualquier cosa del lateral la cierra y te lleva allí (y mientras está abierta, «Operativa» sale marcada). Sin «← Volver al inicio».

Al iniciar sesión (también tras la verificación en dos pasos) se abre siempre el **Inicio**, que saluda «Hola 👋 Nombre» (el nombre de pila del usuario; con la contraseña general, solo «Hola 👋»). Un enlace directo a una pestaña (`#vista`) sigue abriendo esa pestaña.

- **Inicio** (menú lateral, arriba): todos los embudos del cliente de un vistazo. Facturación, ventas, inversión y ROAS conjuntos; una tarjeta por embudo (último lanzamiento de cada embudo, VSL de los últimos 30 días y meteóricos recientes) que lleva a sus métricas; avisos del carrito, próximos hitos (14 días) y tareas vencidas de todos los embudos. Se actualiza cada 15 minutos (o con «Actualizar datos»).
- **Avisos del carrito**: con el carrito abierto, arriba en el dashboard y en el resumen diario por email (asunto con 🚨 si es urgente): ritmo de ventas por debajo del necesario para el objetivo, bonus que caducan hoy o mañana y día de cierre.
- **Conversión del downsell** (Métricas → Meteórico posterior): de las registradas que no compraron el lanzamiento, cuántas compraron el meteórico; y cuántas compradoras ya eran clientas o venían de fuera.
- **Leads al momento**: el navegador guarda una copia de los leads de cada lanzamiento (24 h) y la enseña al abrir mientras descarga los de ahora. Se borra al cerrar sesión.

## 🔴 En directo y visitas a la página de venta

- **En directo** (Hoy → En directo; permiso «En directo» en Equipo → Roles y permisos, que reciben de entrada los roles con Setting hoy): durante el directo, cuántas están en la pantalla de espera, cuántas tienen ya su enlace de Zoom, cuántas han entrado (el % sobre las que esperaban y la **asistencia**: % sobre el total de leads registradas), las entradas minuto a minuto de la última hora, VIP y ventas desde que abre el carrito y visitas a la página de venta. Se refresca solo cada minuto. Casi todo sale de D1; a GHL solo se le piden 5 recuentos por minuto (cacheados), así que no se satura aunque haya 1500 leads.
- **Página de venta**: pega en la página de venta de GHL el bloque «VENTA» de Configuración → Códigos (`<div data-lsd-venta data-launch="auto"></div>` + el script). Cada visita de un lead identificado se guarda en D1. En los emails, los enlaces a la página de venta deben llevar `?cid={{contact.id}}` para saber quién es.
- **Setting hoy**: el primer grupo es «🛒 Visitaron la página de venta y no han comprado», ordenado por la visita más reciente. En la ficha y en los chips aparece cuándo la visitaron y cuántas veces.

## ⏳ Barras de urgencia

En todas las barras (las de cada fase en *Configuración → Preclase → Barra de urgencia* y la barra fija de la página de replay) se elige **«¿Lleva botón?»**: *Sí, con botón* (adónde lleva y su texto) o *No, solo texto* (solo informativa, para crear urgencia).

### 🧾 Página de pago (Configuración → Venta; precios y enlaces de pago en Precios)

La página donde se elige pago único o fraccionado. Aquí está todo lo del pago (salió de «Lanzamiento» y «Oferta»): la **URL de la página de pago** (adonde llevan los botones «Quiero inscribirme» de las páginas de replay y de venta: `data-lsd-link="pagina-pago"` y también los de siempre, `pago` y `pago-fraccionado`; solo en la propia página de pago van al checkout. Vacía = el pago único), el **tipo de pago y los precios**, un **cajetín por forma de pago** (título, precio a mostrar, texto, texto del botón y su enlace de pago) y su **barra fija por tramos** (como la de la página de venta). En GHL: el bloque base `<div data-lsd-pago data-launch="auto"></div>` + script en el pie, y en cada cajetín `data-lsd-caja="unico|fraccionado"` con `data-lsd-text="pago-unico-titulo|precio|texto|boton"` y el botón `data-lsd-link="pago"` / `"pago-fraccionado"` (los códigos, en esa misma sección). Sin enlace fraccionado, su cajetín se oculta.

### 💳 Inició el pago (página de pago intermedia)

Quien llega a la página de pago con su ID (al pulsar «Quiero inscribirme» en la página de venta o de replay) queda apuntada en D1 (sin GHL) como **inició el pago**. Cuenta en la **puntuación** (+15 y como mínimo «muy caliente», si no ha comprado), sale primero en **Setting hoy** («💳 Iniciaron el pago y no han comprado», por la más reciente), con su chip y en su ficha, y en **Métricas**: el paso «Iniciaron el pago» del embudo (y cuántas de ellas compraron) y en «qué predice la compra». Además, la primera vez le pone en GHL la **etiqueta de carrito abandonado** (Páginas → Página de pago; de serie `el-camino-carrito-abandonado`, vacía = ninguna), que dispara el workflow de recuperación; ahí mismo están los enlaces para sus emails (página de pago con `?cid={{contact.id}}`, llamada y WhatsApp).

### 💬 WhatsApp para dudas (páginas de venta y de replay)

### Configuración por fases
La configuración de un lanzamiento sigue el orden en que se monta, sin nada repetido: **Datos básicos** (lanzamiento a editar, identificación, fechas, días y cierre del carrito, **el directo**: Zoom, vídeos, «Añadir al calendario», enlace para conectarse y **pantalla de espera** de 59 min; resumen diario por email) · **Captación** (anuncios de Meta y emails, página de gracias) · **Preclase** (páginas de GHL, calendario de las clases, encuesta, clases, recursos, textos del directo, barra) · **Grabación** (vídeo de la grabación y cuándo se desbloquea, página de replay) · **Oferta** (entregables, bonus, garantía) · **Venta** (página de venta, textos de la página de pago, llamada de admisión, WhatsApp de dudas) · **Carrito** (días y estrategia) · **Precios** (todo lo de la entrada VIP —enlace de pago, precio, IVA, contador y bumps— y del programa —tipo de pago, precios, IVA, enlaces de pago, precio que se muestra en la página de pago y bumps—) · **Etiquetas**. Aparte: **Códigos** y **Accesos y enlaces**.

**⚙️ Botón «Configuración» de la cabecera del embudo**: destacado pero sobrio (fondo oscuro con un toque del color de la marca, borde fino y texto normal; en verde suave cuando está al 100 %), junto al nombre del lanzamiento. En los lanzamientos lleva un **anillo con el % listo** y debajo «Faltan N · Octubre» (o «✓ Lista», en verde). El % se calcula al entrar en el lanzamiento sin abrir la ventana (`openConfig(code, { silencioso: true })` rellena el formulario por detrás) y se actualiza al cambiar algo en la Configuración (`state.cfgPct`, `pintarBotonConfig()`). Si falta algo o hay algo por revisar, sale además un **aviso bajo la cabecera**: «La configuración de «Octubre» está al 56 %… Faltan 17, empezando por «Hora del directo»» con **«Completar la configuración →»**; los primeros segundos el botón late suavemente. Solo para quien puede configurar.

**🧭 Configuración guiada, paso a paso** (`pintarGuiaPaso()` en `public/js/app.js`, se repinta con `renderGuia()` al escribir): cada apartado del lanzamiento empieza con su **«Paso N de 12»** (icono, nombre, para qué sirve, barra de lo que lleva hecho) y un botón grande **«👉 Ahora: …»** que lleva al primer campo que falta y lo resalta (o, si está completo, «✓ Hecho · sigue con …»). Debajo, «📝 Lo que falta aquí» en chips. Los bloques del apartado van **numerados** (✓ verde al completarlos) y el primero que falta sale resaltado con **«👉 Estás aquí»**. Al final, **«← Anterior»**, los puntitos de los 12 pasos y **«Siguiente: … →»** (en el último, «🏁 Ver el resumen»). La lista de comprobación plegada ya no sale (era lo mismo).

**🏠 Resumen de la Configuración** (lo primero al abrir un lanzamiento que ya existe; uno nuevo abre en «Datos básicos»; primer punto del menú y botón «🏠 Resumen» arriba de cada apartado): un anillo con el % listo, cuántas cosas faltan y «Seguir por: …» al primer campo pendiente; debajo, **cada categoría en una tarjeta grande** con su icono (🚀 Datos básicos, 🎁 Oferta, 💶 Precios, 📣 Captación, 🎓 Preclase, 🔴 Grabación, 🛒 Venta, 🧺 Carrito, 🏷️ Etiquetas, 🧩 Códigos, 🔗 Accesos, 📨 Informes), lo que le falta («Faltan 3», «Revisa 1», «✓ Completo» o «Para consultar») y una barra de progreso; al pulsarla se abre. **Al 100 %** (lanzamiento guardado, nada pendiente ni por revisar) la pantalla cambia a **«🎉 ¡Enhorabuena! Has terminado la configuración»** (con confeti la primera vez) y lo importante a mano, en bloques que llevan a su apartado: **1 · Enlaces para emails y WhatsApp** (registro, preclase —también para conectarse al directo—, gracias, grupo de WhatsApp, encuesta, VIP, replay, venta, pago y reservar llamada, cada uno con «Copiar» y «📋 Copiar todos»), **2 · Fechas clave** (captación, directo, carrito, grabación), **3 · Preclase** (nº de clases, cuándo se desbloquea cada una y recursos activos), **4 · Precios**, **5 · Etiquetas de GHL** (para copiar) y **6 · El directo en Zoom**. Siempre con **«⚙️ Volver a la configuración»** (enseña las tarjetas; «🎉 Ver el resumen final» vuelve). Lee los valores del formulario (`pintarHub()` en `public/js/app.js`, que se repinta con la barra «Listo para lanzar»).

**Diseño de la Configuración**: un **menú a la izquierda** agrupado por fases —*El lanzamiento* (Datos básicos, Oferta, Precios) · *Las páginas, en orden* (Captación, Preclase, Grabación, Venta, Carrito) · *Conexión con GHL* (Etiquetas, Códigos, Accesos y enlaces)—, cada apartado con una línea de qué contiene y su estado (en rojo cuántos faltan, ✓ si está completo). Arriba del menú, el **lanzamiento** a editar (y «+ Nuevo») y **«Listo para lanzar»** con un anillo de % y el botón **Siguiente** al primer campo que falta. A la derecha, el apartado con su título y sus bloques. Para que se lea mejor: las explicaciones de cada bloque salen en una línea (al pulsarlas se leen enteras), la ayuda de cada campo (ⓘ) aparece al escribir en él, «nuevo / revisar / siempre igual» es un punto de color junto al nombre (leyenda en «Qué cambiar en cada lanzamiento») y las listas de comprobación van plegadas. En el **móvil** la Configuración abre en el menú (como unos Ajustes): al elegir un apartado se abre a pantalla completa y «‹ Apartados» vuelve.

### Móvil
- Sin zoom al tocar dos veces (`touch-action: manipulation`; pellizcar sigue funcionando) ni al tocar un campo en iPhone (los campos van a 16 px).
- Las ventanas se abren a **pantalla completa**, con la cabecera (✕ grande) y los botones de abajo siempre a la vista; el panel de notificaciones tiene su ✕.
- El botón **«Atrás»** del móvil (o del navegador) cierra la ventana o el panel abierto, o vuelve a la pestaña anterior, en vez de salir del dashboard.
- El botón flotante de Agencia es solo el icono, para no tapar el contenido.

### Inicio: carga y menciones
- Cada tarjeta de Inicio se pide por separado y deja de esperar **al minuto**: si GHL va lento o falla, la tarjeta enseña el error y un botón **«Reintentar»** (antes podía quedarse en «Cargando…» para siempre).
- La VSL en Inicio pide los contactos **del más nuevo al más antiguo** y para al llegar a los registrados más de 6 meses antes del periodo (30 días): una VSL de años ya no descarga todo su histórico (y no se queda con los 4000 más antiguos, dejando fuera los recientes).
- **«Te han mencionado»**: los comentarios de las tareas que te mencionan (o en tus tareas), de todos los embudos, los más nuevos primero. Pulsa uno para abrir su tarea y contestar. Solo para quien entra con su usuario (con la contraseña general nadie puede mencionarte).

### Enlaces para emails y códigos de las páginas
- Bajo la URL de la **página de venta** (Venta) y de la **página de replay** (Grabación) sale, bien visible, el **enlace para tus emails** (con `?cid={{contact.id}}`) y el botón «Copiar enlace»: se copia tal cual.
- Los **códigos para pegar en GHL** de las páginas de venta, pago, replay y gracias por agendar salen **plegados** («Solo la primera vez · pulsa para ver los códigos»).

### Barra de arriba
En dos grupos: **este lanzamiento** (Actualizar, Sincronizar Zoom, Auditor y Configuración, con su texto hasta 1180 px de ancho; por debajo, solo el icono con su explicación al pasar el ratón) y, separados, las **notificaciones** y el menú **Cuenta** (Equipo, Mi cuenta, modo día / noche y Salir).

### Cómo se calcula cada dato («?»)
Las tarjetas de Métricas, Inicio y el Planificador llevan un **«?»** junto al título: al pasar el ratón (o tocarlo en el móvil) explica la fórmula y de dónde sale el dato (p. ej. «CPL = inversión de Meta de las campañas con el código ÷ leads con la etiqueta de registro»). Las explicaciones están en `AYUDA_KPI` (y `AYUDA_PLAN` para el Planificador) en `public/js/app.js`. Cada pestaña y subpestaña enseña también su descripción al pasar el ratón. La **primera vez** que alguien entra en una pestaña ve arriba una explicación corta de qué hay y para qué sirve; con «Entendido» no vuelve a salir (se recuerda por usuario en ese navegador) y en *Cuenta → Volver a ver las ayudas* salen otra vez. Los textos están en `AYUDA_VISTA` (`public/js/app.js`).

En **Leads**, encima de la tabla, «Cómo leer la tabla» (plegado) explica los estados con sus puntos (salen de `ESTADOS`), qué suma puntos y qué significa cada etiqueta (Completo, 50 %, Clic, Asistió, +60 min, VIP, VIP anterior, En directo, Compró, Clienta anterior).

Cuando falta algo de la configuración (avisos de Métricas, tablas vacías, CPL sin inversión, Plan → Carrito…), el mensaje lleva un botón **«Configurarlo ahora →»** (o la propia cosa que falta, subrayada) que abre la configuración del lanzamiento en el campo exacto. Solo lo ve quien puede configurar.

### IVA, bump offers y orden del resumen
- **IVA**: junto a cada precio (entrada VIP, programa, todos en «Precios» y cada bump) se elige si lleva el **IVA incluido** o es **«+ IVA»** (el programa también puede ir **«Sin IVA»**, exento, como un producto sanitario), y el % (21 de serie). La **facturación, el beneficio y el ROAS se calculan sin IVA**. Si un precio no lo dice, se toma como IVA incluido y sale un aviso en Métricas.
- **Bump offers** (opcionales, cada uno se activa o no): de la **entrada VIP** (en «Entrada VIP»), del **pago único** y del **pago fraccionado** (en «Página de pago»). Cada uno con nombre, precio, IVA y la **etiqueta de GHL** de quien lo compra. Cuentan solo con la VIP o la compra de este lanzamiento en ese tipo de pago. En Métricas → Resumen y en Inicio: cuántos se compran y el **% sobre las VIP** (o sobre las ventas de ese tipo de pago); suman a la facturación y al ROAS.
- **Métricas → Resumen**: arriba, en grande, **Leads totales**, **Facturación** (sin IVA, con las **ventas totales** debajo) y **ROAS**. Debajo, el resto en el orden del embudo: captación (inversión, CPL, conversión de la página de registro) → calentamiento (encuesta, entradas VIP, bump de la VIP) → directo (asistencia) → carrito (llamadas, conversión a venta, ventas en directo, ventas de VIP, bumps del pago único y fraccionado). En Inicio, la tarjeta del lanzamiento: leads, CPL medio, entradas VIP, inversión y ROAS.
- **CPL medio = inversión de Meta / leads con la etiqueta de registro.** La inversión se suma sola de las campañas de Meta que llevan el código del lanzamiento (o el texto de «Campañas de Meta») en el nombre, desde el inicio de captación. Si no hay inversión, la tarjeta dice por qué (Meta sin conectar, ninguna campaña con el código, sin inicio de captación…). La inversión a mano de Configuración solo se usa si Meta no da nada.

### Conversión de la página de registro
La API de GHL no da las estadísticas de los embudos (las visitas de «Embudos → … → Estadísticas»), así que el dashboard cuenta las **visitas únicas** él mismo: en la página de registro, en el footer, `<div data-lsd-page="registro" data-lsd-registro data-launch="auto"></div>` + `tracker.js` (Configuración → Captación → «Página de registro», o Códigos → «REGISTRO · bloque del footer»). Con `data-lsd-page="registro"` además rellena la fecha y la hora de cada directo (`data-lsd-text="fechaDirecto"`, `horaDirecto`, `fechaDirecto2`, `horaDirecto2`…) desde Configuración. Cada navegador cuenta una vez por lanzamiento (tabla `visitas_registro` de D1, sin GHL). **Conversión = registros (etiqueta de registro) / visitas únicas.** Sin el código, se usan las visitas de Meta (landing page views) si las hay.

### Llamada de admisión
En *Configuración → Venta → Llamada de admisión*: el **enlace para reservar la llamada** (calendario de GHL; lo usan los botones `data-lsd-link="llamada"`), la **URL de la página de gracias por agendar** y el **vídeo de confirmación** (Vimeo o YouTube). En la página de gracias: `<div data-lsd-llamada data-launch="auto"></div>` + `tracker.js` (respuesta ligera de `/api/page?pagina=llamada`, sin llamar a GHL) y `<div data-lsd-embed="llamada"></div>` donde va el vídeo (sin URL, se oculta). Los códigos, con «Copiar», en la misma sección.

En *Configuración → Venta → Venta y seguimiento → WhatsApp para resolver dudas* se pone **el número** (con prefijo; un móvil español sin prefijo se toma como +34) y **el mensaje que sale ya escrito** (`{producto}` = nombre del producto): el enlace `https://wa.me/…?text=…` se genera solo (con «Copiar» y «Probar»). Lo usan los botones `<a data-lsd-link="whatsapp-dudas">` de las páginas de venta y de replay (se abren en otra pestaña; sin enlace, se ocultan). En *Códigos* está el **botón flotante** (abajo a la derecha, fijo al hacer scroll; en móvil solo el icono), también en `bloques-ghl/whatsapp-flotante.html`. En la página de venta, el bloque VENTA pone además los enlaces de `pago`, `pago-fraccionado` y `llamada` con el ID de la lead.

### Barra fija de la página de venta

En *Configuración → Venta → Página de venta → Barra fija con cuenta atrás*: varios **tramos** seguidos, cada uno con su texto (`{cuenta}` = cuenta atrás hasta su fin), su fecha y hora de fin y si lleva botón (adónde y con qué texto) o es solo informativo. Al acabar un tramo empieza solo el siguiente y tras el último la barra desaparece (p. ej. «🎁 Último día para llevarte el bonus» hasta que acaba el bonus y luego «⏳ Último día para entrar» hasta el cierre). **«✨ Rellenar con los bonus de Oferta y el cierre»** crea un tramo por cada fin de bonus y otro hasta el cierre del carrito, para retocar los textos. La pinta el mismo bloque «VENTA» que apunta las visitas (no hay que pegar nada más) y no llama a GHL. En cada lanzamiento nuevo se heredan los textos y botones, sin fechas.

### 🛒 Pestaña Carrito (Configuración)

**Días de carrito** (*Datos básicos → Fechas*): empiezan a contar el día siguiente al vídeo de venta (el webinar, o el último vídeo en PLF). Venta el lunes + 4 días → día 1 el martes, último día el viernes, y el cierre se calcula solo (viernes 23:59; la casilla del cierre queda bloqueada). Vacío = el cierre se pone a mano.

Un día por cada día del carrito (el día del directo, con la apertura, y luego día 1, 2…). Cada día trae sus **hitos clave** automáticos (apertura, directo de venta, grabación, bonus activos, último día de cada bonus con su objetivo, mensaje de la barra de la página de venta que empieza ese día y cierre) y una casilla para escribir a mano la **estrategia** de ese día. La primera línea de la estrategia sale en el calendario como hito de ese día («🎯 Día 2 de carrito: …»). En cada día también se elige cuántos **emails** y cuántos mensajes al **grupo de WhatsApp** se envían y a qué hora cada uno («Copiar estos envíos al resto de días» los repite en todos los días de carrito); salen en el calendario de forma discreta (sin marcar el día ni aparecer en los próximos hitos de Inicio): «✉️ 3 emails del carrito · 10:00, 19:00, 22:15». El calendario también muestra los recursos de la preclase con fecha: clases, test (p. ej. «🧭 Test autodiagnóstico disponible») y descargable. Sin fechas, avisa de que se rellenará sola al configurar el carrito y la oferta.

### Fin de los bonus en el calendario

Cada bonus de *Oferta* que acaba antes del cierre sale como hito en el calendario (y en el calendario sincronizado, el Inicio y el resumen del cliente) el día en que acaba: «⏳ Último día · Bonus de acción rápida 48 h: Guía… (acaba a las 21:00)». Los de menos de un día (BAR en directo, 1 h…) dicen «Acaba el…». Sale de las fechas del carrito y del tipo de bonus (o de su fin a mano), igual en los meteóricos.

### Barra fija de la página de replay

En *Configuración → Grabación → Página de replay → Barra fija con cuenta atrás*: con el carrito abierto, la página de la grabación enseña una barra fija arriba del todo con su texto (`{cuenta}` = la cuenta atrás), un botón opcional a la página de venta y su color. Hay que elegir si **lleva botón** (a la página de venta) o es **solo informativa** para crear urgencia. La cuenta atrás va **hasta una fecha y hora fija** (igual para todas) o dura **X minutos desde que cada lead abre la grabación** (se recuerda en su navegador: recargar no la reinicia). Al llegar a cero, la lead va sola a la página de venta, y si vuelve a abrir la grabación después, también. No hace falta pegar ningún código más en GHL: la barra la pone el bloque base de la página de replay. Necesita la URL de la página de venta.

## Aprender de cada lanzamiento

- **Retrospectiva** (Métricas → Resumen, al cerrar el carrito): el lanzamiento frente al anterior del mismo embudo (registros, coste por registro, asistencia, VIP, conversión, ventas, facturación y ROAS) y los aprendizajes, incluidos los bonus que funcionaron o no. Cada aprendizaje propone una tarea; con un botón se pasan a la planificación del siguiente lanzamiento (sin duplicarlas).
- **Casi compradoras** (Métricas → Ventas): muy calientes, calientes y VIP que no compraron. Un botón les pone la etiqueta `<código>_casi_compra` en GHL (con confirmación) para el workflow del downsell o del siguiente lanzamiento.
- **La puntuación aprende** (Métricas → Vídeos y conversión → «Qué predice la compra»): con al menos 10 ventas propone cuánto pesan las clases, la VIP y el directo o la grabación sobre los 100 puntos, según lo que separó a las que compraron. Al aplicarlo cambian la puntuación y el estado de los leads de todos los lanzamientos del cliente; se puede volver a los de serie (30/30/40).
- **Anuncios de todos los lanzamientos** (Anuncios → Ganadores): anuncios, conjuntos o campañas juntados por nombre en todos los lanzamientos del embudo, con sus ventas, inversión, coste por venta y ROAS, y si conviene reutilizarlos o revisarlos.

## Sesiones

Al cambiar o regenerar la contraseña de una persona se cierran sus sesiones abiertas en otros dispositivos (quien cambia la suya sigue dentro). Desactivar a alguien le quita el acceso al momento.

### 🎥 Inscripción en Zoom por adelantado

La primera vez que una lead entra en la preclase (cualquier día antes del directo, hasta 30 días antes) se la inscribe por detrás en Zoom en el próximo directo y su enlace personal se guarda (en su navegador y en D1). A la hora del directo, al llegar a cero la pantalla de espera la lleva a Zoom al instante, sin esperar a Zoom ni a GHL; y las inscripciones se reparten en la semana en vez de concentrarse en la última hora. Como mucho un intento cada 6 h por dispositivo; la pantalla de espera y el clic siguen de respaldo. Si se cambia la reunión de Zoom, los enlaces de la reunión anterior se descartan y se reinscribe. Hace falta tener la reunión de Zoom configurada desde que abre la preclase, y conviene desactivar en Zoom el email de confirmación de registro.


## 📣 Publicidad (todos los embudos)

- **Pestaña «Publicidad»** en lanzamientos, VSL, venta directa y meteóricos: las métricas de Meta como en el Administrador de anuncios, en árbol **Campaña → Conjunto de anuncios → Anuncio** (▸ abre cada nivel, ↗ lo abre en Meta, «Solo activos», «Abrir/Cerrar todo»). Tres juegos de columnas: **Rendimiento** (gasto, impresiones, alcance, frecuencia, CPM, CTR y CPC del enlace, resultados y coste por resultado), **Embudo y conversión** (clics, visitas a la página, % de carga, registros, pagos iniciados, compras, valor y ROAS de Meta) y **Creatividad** (reproducciones de 3 s, hook rate, CTR). El resultado es «registros» en lanzamientos y VSL y «compras» en venta directa y meteóricos.
- **Periodo**: hoy, últimos 30 y 90 días, mes en curso, mes pasado, fechas a medida y, en lanzamientos, «Todo el lanzamiento». Se recuerda por embudo.
- **Sí / no por embudo**: sale por defecto en todos (también en los creados antes); se quita desmarcándola en el ⚙️ del embudo → paso «Dashboard» (se guarda `publicidad: false` en el embudo).
- Campañas de cada embudo: las que llevan su filtro en el nombre (código del lanzamiento o «Filtro de campañas», código de Meta de la VSL, venta directa o meteórico). Meta: tres consultas de insights (campaña, conjunto y anuncio, cada una con su alcance) y el estado y la fecha de creación de cada id (`?ids=`, de 50 en 50). Guardado 10 minutos para todo el equipo. Código: `lib/publicidad.js`, `publicidadMeta()` / `estadosMeta()` / `tendenciaAnuncios()` en `lib/meta.js`, `public/js/publicidad.js`, `GET /api/publicidad`.
- Las acciones de Meta que llegan repetidas con varios nombres (`omni_purchase`, `purchase`, `offsite_conversion.fb_pixel_purchase`…) cuentan una vez.
- **Avisos «¿Toca preparar anuncios nuevos?»** (`avisosAnuncios()`, umbrales en `UMBRALES`): última semana frente a la anterior, anuncio a anuncio (activos con ≥ 15 € o ≥ 1.000 impresiones). 🔴 frecuencia ≥ 3 en 7 días, coste por resultado +30 % (con ≥ 3 resultados), CTR del enlace a la mitad, o un anuncio con avisos que se lleva ≥ 60 % del gasto. 🟠 frecuencia ≥ 2,2, CTR −25 %, coste por encima del objetivo +20 % (venta directa), menos de 3 anuncios con gasto. 🔵 CPM +30 %, ≥ 28 días publicado. Con 🔴 «prepara anuncios nuevos ya»; con 🟠 «en 1-2 semanas». Una sola consulta de tendencia para toda la cuenta (30 min) que se reparte por embudo.
- **Inicio**: tarjeta «📣 Anuncios» con los embudos que necesitan anuncios nuevos (pulsando, a su pestaña Publicidad), y **selector de periodo** (hoy, 30 y 90 días, mes en curso, mes pasado, fechas a medida): VSL y venta directa en esas fechas, lanzamientos el último empezado antes de que acabe el periodo y meteóricos los abiertos algún día del periodo (`/api/inicio?…&periodo=&desde=&hasta=`, `parte=anuncios`).
- **Día de compra por la oportunidad del workflow de compra** (venta directa, lo más fiable cuando el pago no pasa por GHL): el workflow de compra crea una oportunidad (p. ej. «Upsell a Raíces», origen «Clienta Reto Ovulación») y su `createdAt` es la hora exacta de la compra, también para quien ya era contacto. El pipeline y la etapa se **detectan solos** (la pareja más repetida entre las compradoras: al menos el 40 % y 3 o más; la búsqueda de contactos ya trae sus oportunidades) o se eligen en Configuración → «Oportunidad que crea el workflow de compra» («No usar oportunidades» la desactiva). Se piden de 100 en 100, de las más nuevas a las más antiguas, hasta un día antes del periodo (máx. 10 páginas), y el día encontrado se guarda en `lsd_directa_compras_<id>` (`op`): aunque la oportunidad cambie de etapa después, el día se queda. Orden: campo «Fecha de compra» → oportunidad → email de compra → día en que se vio la etiqueta → alta. Código: `pipelineDeCompra()` y `fechasDeOportunidades()` en `public/js/directa.js`; `comprasPorOportunidad()` en `lib/directa.js`; `/api/fields?tipo=pipelines`.
- **Paso al producto principal (upsell posterior)** en venta directa: en Configuración del embudo → «Producto principal al que llevarlas después» se pone su nombre y una o varias etiquetas de compra (chips). Métricas enseña, como métrica principal debajo de Ventas / Facturación / ROAS, el % y el número de compradoras que tienen alguna de esas etiquetas: **en el periodo** (de las que compraron en las fechas elegidas) y **total** (de todas las compradoras del embudo). También sale en la tarjeta del embudo en Inicio. Cuenta a quien ya tuviera el producto principal antes (GHL no guarda cuándo se puso cada etiqueta). Código: `sanitizeUpsellPrincipal()` y `upsellAlPrincipal()` en `public/js/directa.js`.
- **Páginas con IA: gracias por comprar y gracias por agendar.** Crear → Páginas tiene ahora «Página de gracias por comprar» en lanzamientos, VSL y meteóricos (en venta directa ya estaba: «gracias por comprar (acceso)») y «Página de gracias por agendar la llamada» también en lanzamientos (en VSL ya estaba, salvo en los embudos sin llamadas). Sus URL propuestas: `…-bienvenida` y `…-cita-confirmada`.
- **Icono de la pestaña «Analizar con Claude»** (Análisis): el logo de Claude (la chispa naranja, `claude` en `icons.js`) en vez del genérico; sale en todos los embudos porque los iconos de las pestañas se ponen al cargar el dashboard.
- **Seguimiento a las compradoras sin el producto principal** (venta directa → Compradoras → casilla «📞 Sin Raíces», al lado de «Mostrar», con el nombre del producto principal configurado; sale cuando el embudo lo tiene configurado): todas las compradoras del embudo **con teléfono** (no solo las del periodo; hay casilla para limitarlo) que aún no tienen ninguna de sus etiquetas, en el formato de Llamadas, de la compra más reciente a la más antigua. Cada tarjeta: días desde la compra, nombre (abre su ficha con encuesta, formulario y notas de GHL), etapa en el pipeline, teléfono, email, extras comprados, si vino de un anuncio, último WhatsApp y último cambio con su nota. Botones: **WhatsApp** con el mensaje ya escrito (editable en «💬 Mensaje de WhatsApp», con {nombre}, {producto}, {principal} y {setter}; se apunta quién escribió y cuándo), **Llamar** y **cambiar de etapa + nota** (mueve —o crea— su oportunidad en GHL y deja la nota en su ficha). Filtros por etapa con su número: «🆕 Sin contactar» son las que siguen en la etapa donde las deja el workflow de compra (en el Reto, «Clienta Reto Ovulación» de «Leads evergreen») o sin oportunidad. El pipeline es el de la oportunidad del workflow de compra (o «Leads evergreen»). La etapa de cada una sale de la búsqueda de contactos (sin una petición por persona); compartido 3 minutos y los cambios hechos en el dashboard se ven al momento (`lsd_seguimiento_<id>`). Lo pueden usar quienes tienen permiso de Leads o Llamadas (la setter). Código: `public/js/seguimiento.js`, `handlers/seguimiento.js` (`/api/seguimiento`).
- **Diseño**: todos los desplegables llevan su propia flecha con margen (la nativa se pegaba al borde) y los selectores de periodo son una píldora con icono de calendario. Compradoras de venta directa en tarjetas agrupadas por día (con lo facturado cada día): iniciales de color, nombre (abre la ficha), email y teléfono, extras y origen como etiquetas, importe y botón de WhatsApp; las que ya tienen el producto principal llevan su marca.
- **Facturación del paso al producto principal**: cada etiqueta del producto principal lleva su precio (Configuración → «Producto principal al que llevarlas después»). El bloque «🎯 Pasan a …» enseña, en el periodo y en total, lo facturado en el principal por esas compradoras (si tiene dos etiquetas, p. ej. pago único y VIP, cuenta la más cara una sola vez).

## 📨 Informes diarios por email (Configuración → Informes)

- Pestaña **Informes** en Configuración (grupo «Avisos»): hasta 10 emails (se crean como contacto en GHL para poder enviarles el email desde allí) y qué fases se informan (captación / carrito). Se guarda con el botón Guardar (`config.informes`).
- **Días de captación** (del inicio de captación al día antes del directo), cada mañana con los datos de ayer: registros totales y de ayer, registros por día (7 días), tráfico frío/templado, de publicidad/orgánico (si hay etiquetas de origen), encuesta, clases vistas, inversión, CPL, CPL de frío, ROAS, objetivos y, **solo si el lanzamiento tiene entrada VIP**, VIP vendidas (+ayer), conversión, facturación VIP, bumps de la VIP y coste por VIP.
- **Días de carrito** (del directo al cierre): ventas de ayer, totales y por día del carrito, conversión (de las que vieron el directo, de las VIP, tras llamada, de las que iniciaron el pago), pago único / a plazos, facturación (programa, VIP, bumps), inversión, ROAS, CAC, beneficio y objetivos. Lo que el lanzamiento no tiene (VIP, inversión, llamadas, plazos…) no sale.
- «+N ayer»: con el campo de fecha de compra, las ventas de cada día son exactas; los registros y lo que no tiene fecha salen de la diferencia con el total guardado el día anterior (`lsd_informe_diario_<código>`, 60 días). El primer día los registros de ayer se cuentan por la fecha de alta del contacto.
- **Envío automático**: una tarea por cliente en cron-job.org a las 8:15 que abra `https://<tu-proyecto>.pages.dev/api/informe-diario?key=<DIGEST_KEY>&c=<cliente>` (va aparte de la del resumen para no pasar del límite de peticiones de Cloudflare; la URL de cada cliente sale en el Panel de agencia y en la pestaña). Una vez al día por lanzamiento.
- **«👀 Ver cómo queda»** enseña el email del lanzamiento abierto y **«📨 Enviarlo ahora»** lo manda al momento (sin contar como el del día). Código: `public/js/informe-diario.js` (qué entra y el HTML), `lib/informe-diario.js` (cálculo, envío) y `handlers/informe-diario.js`.

## 🛡️ Auditoría con Fable (seguridad, errores y eficiencia)

- **Eficiencia** (plan gratuito de Cloudflare: 50 llamadas y poca CPU por petición): tendencia de anuncios una vez para todo el Inicio; compradoras de venta directa en una caché común (5 min) para cualquier periodo y para Seguimiento; portal del cliente con la caché de cada embudo; lanzamientos del Inicio sin recalcular al cambiar el periodo; informe diario de un lanzamiento por llamada y contacto de cada email recordado (`lsd_informe_contactos`); informe semanal de la VSL con 6 meses de registros; etiquetas de cada contacto calculadas una vez (`WeakMap`) y altas/ventas por día en una sola pasada.
- **Errores**: guardado del mensaje de Seguimiento con la configuración fresca y su versión; la oportunidad que crea Seguimiento no cambia el día de la venta; respuestas viejas (periodo anterior) que ya no pisan las nuevas en Inicio y venta directa; guardados con versión en seguimiento, días de compra e informe diario; textos del informe con el día en que se lee; sin directo, el informe de captación acaba con el fin de captación; cachés de Seguimiento (etapa) e Inicio (configuración del embudo).
- **Seguridad**: límite por conexión en las llamadas públicas (`dentroDelLimite` en `lib/intentos.js`: registro 40, identificar 60, medición de vídeos 400, visitas 300, visitas de venta directa 120 y votos 60 cada 10 min); `/api/identify` ya no dice si un email es contacto de GHL; los emails del informe diario solo los cambia un admin y su vista previa pide también ver Métricas; Seguimiento decide el pipeline en el servidor y solo mueve a compradoras del embudo; OAuth exige el mismo `redirect_uri` con el que se pidió el código; el enlace de la encuesta ya no lleva el teléfono.
- **Día a día de venta directa en columnas** (de izquierda a derecha, abre mostrando lo más reciente): número de ventas encima, barra, facturación y el día debajo (y las visitas si se miden); el mejor día en verde y hoy resaltado. Arriba, un resumen (ventas, media al día, mejor día, días con ventas) y un **selector de mes** con los 13 últimos meses para ver las compras diarias de cualquier mes sin cambiar el periodo de arriba (`/api/directa?preset=mes&mes=AAAA-MM`).

**Compatibilidad con móviles:** el JS del navegador no usa «lookbehind» en las expresiones regulares (`(?<=`, `(?<!`): Safari de iOS anterior a 16.4 no lo entiende y no arrancaría nada. Lo vigila `test/compat-navegador.test.js`.

## ThriveCart (ventas reales)

Cada venta, cuota y reembolso de ThriveCart llega a AlquimIA por su aviso (webhook) y se guarda resumida por cliente (`lsd_thrivecart_ventas`, sin historial): importe cobrado (con cupones, bumps y plazos), producto, email, fecha y si es de prueba.

- **Conectarlo:** Conexiones → «ThriveCart · ventas reales» da la dirección de este cliente (`/api/thrivecart?c=…&k=…`, firmada como la del registro de Zoom). Se pega en ThriveCart → Settings → Integrations → Webhooks & notifications. No hace falta ninguna clave de ThriveCart.
- **Métricas → Resumen:** bloque «Cobrado en ThriveCart» con lo cobrado a los leads del lanzamiento (por el email, del inicio de captación −7 días al siguiente lanzamiento), los reembolsos, el neto sin IVA, el ROAS real, el desglose por producto, las compradoras sin su etiqueta de VIP/compra en GHL y los cobros de emails que no están registrados. Las ventas de prueba no cuentan.
- **Ventas anteriores:** ThriveCart solo avisa de las nuevas. Las de antes se traen con su exportación de transacciones en CSV: Conexiones → ThriveCart → «Traer ventas anteriores». Entiende cabeceras en inglés o español (email, importe/amount, producto, fecha, pedido, estado), importes con € o coma, reembolsos (estado o importe negativo) y descarta las fallidas. Enseña antes qué columnas ha entendido y el total; no repite las que ya llegaron por aviso (mismo email, tipo, importe y día) y un aviso posterior tampoco repite una importada.
- **Pedidos y bumps del CSV:** las filas del mismo pedido (por su n.º de pedido; si la columna es de cobro, factura o transacción —un número por fila— o no hay, las compras del mismo email con menos de 5 minutos de diferencia) se juntan en una venta con sus líneas: el producto principal y cada bump/upsell/downsell (por la columna de tipo de línea, por el nombre, o si va acompañando al principal en el mismo pedido). También vale un CSV de una fila por pedido con columnas «Bump»/«Bump amount». Fechas 10/21/2026 (mes delante) se detectan solas. Sin columna de producto, las ventas salen como «Sin nombre de producto» y se pueden elegir igual; los bumps sin nombre se llaman por su precio («Bump de 10 €»). Volver a importar sustituye lo importado antes de esos pedidos o del mismo email y día (corrige una importación anterior fila a fila). La vista previa enseña pedidos, productos principales, bumps con su % y todas las columnas del archivo.
- **Entrada VIP y programa por separado:** en Configuración → Precios, «Entrada VIP en ThriveCart» y «Programa en ThriveCart» (su ID de ThriveCart o su nombre; un número tiene que ser el ID exacto, un texto vale entero o en parte, sin tildes: «raices» = «Raíces · pago único»). Así el programa cuenta desde su primera venta. En Métricas → «Qué ventas son de este lanzamiento», cada producto que ya ha vendido se marca como «Entrada VIP» o «Programa» (sin VIP, sí/no), y lo puesto a mano que aún no ha vendido sale como «Esperando la primera venta». El programa suma lo de ThriveCart + las compras con etiqueta de quien no compró en ThriveCart (p. ej. el fraccionado de Hotmart) + los bumps del fraccionado; los bumps del programa en ThriveCart tienen sus tarjetas. «Facturación del lanzamiento» y «Facturación total» usan lo mismo.
- **Lo de arriba sale de ThriveCart:** con los productos del lanzamiento elegidos y cobros en ThriveCart, la Facturación y el ROAS (los grandes y los de Economía), «Entradas VIP vendidas» (= pedidos de ThriveCart) y las tarjetas de cada bump (su % sobre esas ventas, cuántos y cuánto sin IVA) usan lo cobrado de verdad. En un lanzamiento con VIP, ThriveCart sustituye la parte de la VIP y sus bumps (el programa sigue por etiquetas); sin VIP, toda la facturación. Lo calculado por etiquetas queda en letra pequeña para comparar.
- **Cada embudo, solo sus ventas:** en el bloque de Métricas, «Qué ventas son de este lanzamiento» lista los productos de ThriveCart que han llegado en su periodo; los que se marquen (`tcProductos` del lanzamiento, op `tcProductos` de /api/config) son los suyos: cuentan todas sus ventas, aunque la compradora no se haya registrado, y sus reembolsos por el pedido. Sin marcar ninguno, cuentan las ventas de los emails de sus leads.
- **Bumps, upsells y downsells sin configurar nada:** salen de las líneas de cada pedido del aviso (`order.charges`: nombre, tipo e importe): cuántos, en qué % de los pedidos y cuánto facturan.
- Código: `public/js/thrivecart.js` (lectura del aviso y resumen), `handlers/thrivecart.js`, pruebas en `test/thrivecart.test.js`.

