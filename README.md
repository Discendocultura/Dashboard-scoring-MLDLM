# Dashboard de lead scoring para lanzamientos

Muestra todos los leads de un lanzamiento (por etiqueta de GHL), lo que ha hecho cada uno
(clases pre-webinar, VIP, directo, grabación), su **puntuación y estado** y un botón para
**abrir WhatsApp con el mensaje adecuado**. Todo con planes gratuitos (Cloudflare Pages): no usa webhooks de GHL.

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
"foto": marca con `<código>_vip_previo` / `_compra_previo` / `_compradirecto_previo` a quien ya las tenía.
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

### Pestaña Hoy
Lo del día, en tres subpestañas: **Setting hoy** (a quién escribir hoy por WhatsApp, por prioridad), **Llamadas** (calendario, resultados y pipeline) y **En directo** (el día del webinar, minuto a minuto). Al entrar abre la última que usaste en ese embudo; el número rojo de la pestaña son las llamadas pendientes de anotar. Si un embudo o un rol solo tiene una (p. ej. las VSL, que solo tienen Llamadas), entra directamente.

**Ficha completa del lead** (Hoy → Llamadas): al pulsar una llamada se abre una ventana con todo lo que ayuda a la setter antes de llamar: cuándo es la cita y su etapa, teléfono / WhatsApp / email, la **temperatura** (estado y puntuación sobre 100) y el siguiente paso, **qué ha hecho** (cada clase, VIP, directo y grabación, encuesta, si ya se le escribió, si compró), origen (publi / orgánico), tráfico frío / templado, avatar y días desde el registro, las **respuestas de la encuesta**, las **respuestas del formulario de reserva de la llamada y el resto de campos de su ficha de GHL**, y las últimas **notas** de GHL. Desde ahí se anota el resultado.

### Pestaña Plan
Para planificar: **Planificador** (objetivos, inversión, equipo y previsión), **Calendario**, **Carrito** y **Tareas**. Como en Hoy, al entrar abre la última que usaste en ese embudo y el número de la pestaña son las tareas pendientes. Si alguien solo puede ver una, entra directo sin subpestañas.

**Carrito** (Plan → Carrito): los días del carrito del lanzamiento en solo lectura (hitos automáticos, emails y WhatsApps de cada día y la estrategia), para todo el equipo con el permiso «Carrito». Se edita en Configuración → ⑦ Carrito (botón «Editar» para quien puede configurar). Al añadirse, este permiso lo reciben de entrada los roles con Setting hoy, Configuración o Métricas; luego se puede quitar en Equipo → Roles y permisos.

### Pestaña Análisis
Para decidir: **Avatar y anuncios** (en las VSL, Anuncios ganadores), **Comparar** y **Rendimiento del equipo**.

### Pestaña Leads
Arriba, junto a los estados, el **% de leads de pago (publicidad) y orgánicos** (según sus etiquetas de origen). Dos subpestañas: **Lista de leads** (la tabla con su puntuación, encuesta ✓/✗, clases, VIP, directo, grabación y WhatsApp) y **Encuesta**: cuántas leads la han respondido y, por pregunta, el **% de cada respuesta** (sobre quienes la contestaron, con cuántas compraron); en las preguntas de texto libre, las respuestas que más se repiten y **todas las respuestas** con el nombre de quien la dio, con buscador.

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
- Escribe su email. **Registrada en el lanzamiento** → va a la página de recursos.
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
En *Configuración → ⑨ Etiquetas GHL*: **etiqueta de encuesta rellenada** (la que añade la encuesta de GHL al enviarse) y
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
| `<div data-lsd-embed="gracias"></div>` | Vídeo de la página de gracias (Vimeo o YouTube) desde *Configuración → ② Captación → Página de gracias*; se oculta si no hay |
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
- **Formularios instantáneos de Meta**: como no traen UTM, el origen se completa con la atribución que guarde GHL (adId, adGroupId, campaignId) o con los campos personalizados elegidos en Configuración → ② Captación → «Formularios instantáneos de Meta» (ID de campaña, conjunto y anuncio). Aparecen como canal «Formulario instantáneo (Meta)», cuentan como publi y entran en el ranking de anuncios ganadores.
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

## Rendimiento del equipo
Pestaña **Rendimiento** (permiso «Rendimiento del equipo»), en lanzamientos y VSL. Por persona: WhatsApps enviados, leads contactados, resultados anotados, llamadas agendadas / shows / no-shows / cierres (con % de show y de cierre), **ventas e importe de los leads que contactó primero** (útil para comisiones), tiempo de respuesta mediano desde el registro y % contactado en menos de 24 h. Arriba, los totales y cuántos leads siguen sin contactar. Cuenta desde que existe el registro de actividad (los WhatsApps y resultados anteriores a esta versión no tienen autor).

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
1. Configuración → ① Datos básicos → Resumen diario por email → **Enviar el resumen a**: tu email (tiene que existir como contacto en GHL).
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

Las contraseñas generales `ADMIN_PASSWORD` / `SETTER_PASSWORD` siguen funcionando (dejando el email vacío) como acceso de emergencia, salvo que el superadmin las desactive (ver **Seguridad**).

## Tareas
Cada lanzamiento tiene su pestaña **Tareas**, agrupadas por fase (preparación → cierre) con barra de progreso, vencidas y filtros (pendientes, mías, vencidas, hechas, por persona). La admin crea, edita y borra (también varias a la vez con «Seleccionar», o todas con «Eliminar todas»); cada tarea se asigna a una persona o a todo un rol y, si se marca «Avisar», le llega un email. El resto marca como hechas las suyas o las de su rol. Se ven en **Lista** (por fases) o en **Tablero** kanban: una columna por fase (Preparación agrupada por subcategorías), las columnas extra que cree la admin (comunes a todos los lanzamientos; se renombran, mueven, colorean y borran con «⋯») y **✅ Completadas** al final: al marcar la casilla la tarjeta salta ahí tachada. La admin arrastra tarjetas entre columnas (o elige la columna al abrir la tarea); el resto marca las suyas como completadas. La fase **Preparación** se divide en subcategorías (Dashboard y herramientas, Oferta y pagos, Contenido y creatividades, Comunicación, Revisión y pruebas, Equipo y reuniones, Otras): se deducen del título y se pueden elegir al crear o editar la tarea.

Filtros: pendientes, hoy, esta semana, mías, vencidas, hechas y por persona.

Cada tarea tiene una **descripción con formato** (títulos, negrita, listas con viñetas o numeradas, enlaces externos y **vídeos de Vimeo, YouTube o Loom** que se reproducen dentro de la tarea). Pulsa **en cualquier parte de una tarea** (fila o tarjeta) para abrirla: quien puede gestionar tareas la abre ya en edición; el resto, en vista completa. El servidor limpia el HTML: solo pasa el formato permitido.

**Comentarios y menciones**: cada tarea tiene comentarios (todos los roles pueden comentar; cada cual borra los suyos y la admin cualquiera). Escribe `@` y elige a la persona para **mencionarla**: le llega un email con el comentario y le aparece en la campanita. Ctrl/⌘ + Enter publica.

**Campanita 🔔** (barra superior, todos): cuenta las novedades y al pulsarla despliega, del lanzamiento elegido, los **comentarios en tus tareas y menciones**, **tus tareas vencidas sin completar**, las que **vencen en los próximos 2 días** y (solo admin) las **vencidas del equipo**. Pulsa una para abrir la tarea (en los comentarios, directamente en la caja de respuesta). Al abrirla, lo que había se da por visto (para usuarios con email se recuerda en todos sus dispositivos). Se actualiza sola cada 2 minutos.

**Tareas habituales**: al marcar «🔁 Tarea habitual» la tarea se guarda en la plantilla (Custom Value `lsd_tareas_habituales`) con su descripción, fase, persona o rol asignado y fecha relativa a un hito (captación, clase 1, directo o cierre). «Cargar tareas habituales» en el siguiente lanzamiento las crea con esa misma asignación (si la persona ya no está, se asigna a su rol) y sin duplicar. Editar una habitual actualiza la plantilla; desmarcar la casilla la quita.

**Avisos para la admin**: si una tarea asignada a otra persona o a otro rol (no admin) pasa su fecha sin completarse, aparece un aviso rojo arriba del dashboard (solo para admin) con quién va tarde, qué tarea y cuántos días; «Ver vencidas» lleva a la lista y «Entendido» lo oculta hasta mañana o hasta que haya otra. También salen en el resumen diario por email.

Con «Seleccionar» la admin puede **asignar varias tareas a la vez** (p. ej. todas las de «Rol Admin» a una persona) o eliminarlas.

## Varios clientes
El mismo dashboard sirve a varios clientes (MLDLM es el **principal**). Arriba, junto al nombre, un **desplegable** cambia de cliente (solo sale si tienes acceso a más de uno). Cada cliente usa **su propio GHL**: su configuración, embudos, tareas, calendario, roles, llamadas y contactos viven en su subcuenta y no se mezclan.

- **Usuarios**: cada persona tiene un único usuario (email y contraseña) y **accesos** por cliente, con un rol en cada uno. La admin de un cliente gestiona su equipo (si añade un email que ya existe, por ejemplo de la agencia, solo le da acceso a su cliente). Lo que afecta a la cuenta de alguien que trabaja en varios clientes (contraseña, desactivar) lo hace el **superadmin**.
- **Superadmin**: entra en todos los clientes como admin, ve el botón **Agencia** (panel de clientes y pestaña **Añadir nuevo cliente**) y, en Miembros, el botón «Clientes» de cada persona para darle acceso a otros clientes o hacerla superadmin. La contraseña general de admin (`ADMIN_PASSWORD`) también es superadmin.
- **Añadir un cliente** (Agencia → Añadir nuevo cliente; hay una guía paso a paso y, en la tarjeta de cada cliente sin conectar, sus pasos con el nombre exacto de su variable): nombre, código (p. ej. `clinica-sol`), *Location ID* de su subcuenta y, opcional, su cuenta publicitaria de Meta. Después:
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
En *Métricas* de cada lanzamiento: **Informe para el cliente ↗** (página con resultados frente a objetivos, embudo, anuncios ganadores, avatar comprador y aprendizajes; con botón para guardarla en PDF), **Copiar enlace para el cliente** (enlace firmado que se abre sin usuario y caduca a los 180 días; cada envío lleva uno nuevo) y **Enviárselo ahora** (email a las personas con el rol Cliente, desde su GHL). En las VSL hay un informe semanal (la semana pasada frente a la anterior). Automático, con la tarea de cada mañana de cada cliente (`/api/agencia?key=…&c=<cliente>`): el informe del lanzamiento se manda solo al cerrar el carrito (una vez) y el de la VSL cada lunes si se activa en su configuración. Desde el portal, el cliente también puede abrirlo.

## Vista de agencia (superadmin)
El botón **Agencia** está aparte, junto al nombre del cliente (no entre los botones del cliente). Dentro:
- **Equipo de la agencia**: las personas del equipo interno de la agencia y, para cada una, a qué clientes entra y con qué rol en cada uno (o superadmin: todos como admin). Desde ahí se añaden (les llega su acceso por email), se cambian sus clientes y roles, se les reenvía el acceso o se quitan (pierden el acceso a todos los clientes).
- El **Equipo** de cada cliente (botón Equipo) es solo el equipo propio de ese proyecto; abajo indica qué personas de la agencia entran también y que se gestionan en Agencia.
- **Panel de agencia** (botón *Agencia* arriba): todos los clientes de un vistazo, primero los que necesitan atención. De cada uno: lanzamiento en curso y su próximo hito, registros, VIP y ventas (con su objetivo), inversión total y de los últimos 7 días, CPL, ROAS, críticos e importantes del auditor, tareas vencidas, sus VSL y **«Entrar →»**.
- **Alta guiada del cliente** (en cada tarjeta): se marca sola: GHL conectado, nombre del producto, equipo con acceso, al menos un embudo, etiquetas de registro y compra creadas en GHL, calendario y pipeline (si usa Llamadas), páginas de GHL con el código (llega la primera visita) y primer registro recibido.
- **Plantillas de embudo**: en el ⚙️ de un embudo, *Guardar como plantilla de agencia* (tipo y formato, pestañas, mensajes de WhatsApp, tareas habituales y la base de los lanzamientos: precios, textos y barra de la página; de una VSL, sus textos y precios). En *＋ Nuevo embudo* de cualquier cliente, *Partir de una plantilla*: se crea el embudo con todo eso (los mensajes y las tareas habituales, si se marcan). Etiquetas, enlaces y fechas de GHL los pone cada cliente.
- **Marca de cada cliente** (*Equipo → Marca*, admin): nombre de su producto (sustituye a «Raíces» en el dashboard, la página preclase, el calendario y los emails), colores de los emails del equipo y preguntas de su encuesta del avatar (campos de su GHL). Un cliente nuevo empieza con mensajes de WhatsApp neutros (con `{producto}`), sin encuesta y sin nada de MLDLM.
- **Auditor automático**: cada mañana revisa todos los clientes y manda a los superadmin un email con los críticos, las tareas vencidas, el próximo hito y el alta pendiente de cada uno. Se activa con una tarea de [cron-job.org](https://cron-job.org) a las 8:00 que abra `https://<tu-proyecto>.pages.dev/api/agencia?key=<DIGEST_KEY>` (la misma clave del resumen diario). En el panel, *Enviarme el resumen* lo manda al momento.
- **Tareas automáticas por cliente**: una tarea más por cliente (8:05, 8:10…) que abra `https://<tu-proyecto>.pages.dev/api/agencia?key=<DIGEST_KEY>&c=<cliente>`. Manda sus informes automáticos y su resumen diario. Van separadas para que ninguna llamada se pase del límite de peticiones de Cloudflare. Las URL de cada cliente están en *Agencia → Panel de clientes → Tareas automáticas de cada mañana*.

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

### Recursos de la preclase: música, test, votación y descargable
Al crear el embudo se marca qué recursos tendrá la preclase además de las clases; los lanzamientos nuevos los heredan (sin fechas). En cada lanzamiento, *Configuración → Preclase → Recursos de la preclase*:
- **Música:** enlace del MP3 (súbelo a Medios de GHL) y bajo qué clase va. Se desbloquea al ver el 75 % de esa clase (en el mismo navegador al momento; en cualquier otro, con su etiqueta).
- **Test (GHL):** enlace, **etiqueta que pone el workflow de GHL al terminarlo** y fecha y hora de desbloqueo. Si el lanzamiento tiene encuesta, además hay que haberla rellenado (etapa 1): mientras, el bloque `test-falta-encuesta` lo explica. Cuenta como hecho cuando la lead tiene esa etiqueta.
- **Votación:** la hace el dashboard (tabla `votos` de D1). Bajo qué clase va (75 % para responder) y **una o varias preguntas** (hasta 6), cada una **tipo test** (opciones, una por línea; al responder ven los % de todas) o de **respuesta libre** (un cuadro de texto; las demás no ven lo que escribe cada una). Las tipo test son obligatorias y las libres, opcionales; con una sola pregunta tipo test se responde con un clic, y si hay más, con «Enviar respuestas». No cambies el orden de las opciones ni quites preguntas cuando ya haya respuestas. Su voto sale en la ficha del lead (pulsando su nombre en Leads) y en la ficha de cada llamada, y *Métricas → Vídeos y conversión → Votación de la clase* da, por pregunta, el % de cada opción con la conversión a compra de quienes la eligieron y todas las respuestas libres con el nombre de quien las escribió.
- **Descargable:** nombre, enlace y fecha opcional.

Las **etapas** de la página se numeran solas: 1 la encuesta (si hay), después clases, test y descargable por orden de fecha y la última el directo; la música y la votación van dentro de la etapa de su clase. La configuración enseña el orden resultante. Etiquetas automáticas: `<código>_musica_play|_50|_90`, `<código>_voto`, `<código>_descarga`.

### Lanzamientos de varios vídeos (2, 3 o PLF)
Funcionan como el webinar, con las casillas repetidas para cada vídeo (*Configuración → ① Datos básicos*, bloque «Vídeos del lanzamiento»): **día y hora**, **Zoom** (solo si ese vídeo es en directo; si no, es grabado y se publica a su hora), **página del vídeo en GHL**, **vídeo de Vimeo** y desde cuándo se ve. El vídeo 1 usa las casillas de siempre del directo y su grabación.
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
**Grupos de cada lanzamiento y meteórico:** en Configuración (② Captación → «Grupos de WhatsApp · campaña de SendFlow»)
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
está en Cuenta → Conexiones). Solo trabaja con lanzamientos en captación o carrito y meteóricos en curso que tengan
campaña de SendFlow (máx. 3; unas 2 peticiones a SendFlow por campaña). Guarda una foto (entradas, salidas y clics) y avisa de:
- **🔗 Enlace caído:** el «Grupo de WhatsApp · enlace» del lanzamiento (o del meteórico) da error o no responde
  (mejor poner el enlace de redirección de SendFlow que el de un grupo concreto).
- **🈵 Grupos llenos:** todos los grupos de la campaña están llenos.
- **🖱️ Clics sin entradas:** 15 o más clics en la última hora y ninguna entrada.
- **🚪 Pico de salidas (fuga):** en la última media hora se han salido 10 o más y el triple de lo normal (media de
  cada media hora de las últimas 24 h). En la fase 4 se cruzará con el mensaje enviado justo antes.
Avisos: por **email** (al del resumen diario) y, si quieres, por **WhatsApp** a un número desde una cuenta de SendFlow
(Cuenta → Conexiones → «Dónde te avisa»). El mismo aviso no se repite en 3 h (las fugas, en 1 h). En **Métricas →
Grupos de WhatsApp → Vigilancia**: última comprobación, estado del enlace y de los grupos, avisos recientes y
entradas y salidas por hora de las últimas 24 h (la hora con el pico, marcada).
API: `GET /api/sendflow?op=probar` · `?op=campanas` · `?op=cuentas` (permiso «config») · `?op=grupos&l=<código>` (permiso «metricas») ·
`?op=miembros&l=<código>` (CSV; permisos hoy, leads o métricas). Base `https://sendflow.pro/sendapi` (cambiable con `SENDFLOW_BASE_URL`).

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
- **Verificación en dos pasos** (TOTP: Google Authenticator, Microsoft Authenticator, 1Password…). Cada persona la activa en **Mi cuenta** escaneando un QR; recibe 10 **códigos de recuperación** de un solo uso. Al entrar se pide la contraseña y el código. Si alguien pierde el móvil, un admin (o el superadmin, si trabaja en varios clientes) se la quita y la vuelve a activar. Los admins sin ella ven un aviso arriba.
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

## Inicio, avisos del carrito y carga rápida

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

### 🧾 Página de pago (Configuración → ⑥ Venta; precios y enlaces de pago en ⑧ Precios)

La página donde se elige pago único o fraccionado. Aquí está todo lo del pago (salió de «Lanzamiento» y «Oferta»): la **URL de la página de pago** (adonde llevan los botones «Quiero inscribirme» de las páginas de replay y de venta: `data-lsd-link="pagina-pago"` y también los de siempre, `pago` y `pago-fraccionado`; solo en la propia página de pago van al checkout. Vacía = el pago único), el **tipo de pago y los precios**, un **cajetín por forma de pago** (título, precio a mostrar, texto, texto del botón y su enlace de pago) y su **barra fija por tramos** (como la de la página de venta). En GHL: el bloque base `<div data-lsd-pago data-launch="auto"></div>` + script en el pie, y en cada cajetín `data-lsd-caja="unico|fraccionado"` con `data-lsd-text="pago-unico-titulo|precio|texto|boton"` y el botón `data-lsd-link="pago"` / `"pago-fraccionado"` (los códigos, en esa misma sección). Sin enlace fraccionado, su cajetín se oculta.

### 💳 Inició el pago (página de pago intermedia)

Quien llega a la página de pago con su ID (al pulsar «Quiero inscribirme» en la página de venta o de replay) queda apuntada en D1 (sin GHL) como **inició el pago**. Cuenta en la **puntuación** (+15 y como mínimo «muy caliente», si no ha comprado), sale primero en **Setting hoy** («💳 Iniciaron el pago y no han comprado», por la más reciente), con su chip y en su ficha, y en **Métricas**: el paso «Iniciaron el pago» del embudo (y cuántas de ellas compraron) y en «qué predice la compra». Además, la primera vez le pone en GHL la **etiqueta de carrito abandonado** (Páginas → Página de pago; de serie `el-camino-carrito-abandonado`, vacía = ninguna), que dispara el workflow de recuperación; ahí mismo están los enlaces para sus emails (página de pago con `?cid={{contact.id}}`, llamada y WhatsApp).

### 💬 WhatsApp para dudas (páginas de venta y de replay)

### Configuración por fases
La configuración de un lanzamiento sigue el orden en que se monta, sin nada repetido: **① Datos básicos** (lanzamiento a editar, identificación, fechas, días y cierre del carrito, **el directo**: Zoom, vídeos, «Añadir al calendario», enlace para conectarse y **pantalla de espera** de 59 min; resumen diario por email) · **② Captación** (anuncios de Meta y emails, página de gracias) · **③ Preclase** (páginas de GHL, calendario de las clases, encuesta, clases, recursos, textos del directo, barra) · **④ Grabación** (vídeo de la grabación y cuándo se desbloquea, página de replay) · **⑤ Oferta** (entregables, bonus, garantía) · **⑥ Venta** (página de venta, textos de la página de pago, llamada de admisión, WhatsApp de dudas) · **⑦ Carrito** (días y estrategia) · **⑧ Precios** (todo lo de la entrada VIP —enlace de pago, precio, IVA, contador y bumps— y del programa —tipo de pago, precios, IVA, enlaces de pago, precio que se muestra en la página de pago y bumps—) · **⑨ Etiquetas GHL**. Aparte: **Códigos** y **Accesos y enlaces**. Cada pestaña con campos que revisar enseña arriba «Qué falta en esta pestaña» (pulsa uno para ir a él), cada sección su estado («Falta 1», «✓ Completo») y la pestaña, en rojo, cuántos le faltan. Encima de las pestañas, la barra **«Listo para lanzar: 26 de 39»** suma todo y su botón lleva al primer campo que falta (por orden de pestañas).

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
- Bajo la URL de la **página de venta** (⑥ Venta) y de la **página de replay** (④ Grabación) sale, bien visible, el **enlace para tus emails** (con `?cid={{contact.id}}`) y el botón «Copiar enlace»: se copia tal cual.
- Los **códigos para pegar en GHL** de las páginas de venta, pago, replay y gracias por agendar salen **plegados** («Solo la primera vez · pulsa para ver los códigos»).

### Barra de arriba
En dos grupos: **este lanzamiento** (Actualizar, Sincronizar Zoom, Auditor y Configuración, con su texto hasta 1180 px de ancho; por debajo, solo el icono con su explicación al pasar el ratón) y, separados, las **notificaciones** y el menú **Cuenta** (Equipo, Mi cuenta, modo día / noche y Salir).

### Cómo se calcula cada dato («?»)
Las tarjetas de Métricas, Inicio y el Planificador llevan un **«?»** junto al título: al pasar el ratón (o tocarlo en el móvil) explica la fórmula y de dónde sale el dato (p. ej. «CPL = inversión de Meta de las campañas con el código ÷ leads con la etiqueta de registro»). Las explicaciones están en `AYUDA_KPI` (y `AYUDA_PLAN` para el Planificador) en `public/js/app.js`. Cada pestaña y subpestaña enseña también su descripción al pasar el ratón. La **primera vez** que alguien entra en una pestaña ve arriba una explicación corta de qué hay y para qué sirve; con «Entendido» no vuelve a salir (se recuerda por usuario en ese navegador) y en *Cuenta → Volver a ver las ayudas* salen otra vez. Los textos están en `AYUDA_VISTA` (`public/js/app.js`).

En **Leads**, encima de la tabla, «Cómo leer la tabla» (plegado) explica los estados con sus puntos (salen de `ESTADOS`), qué suma puntos y qué significa cada etiqueta (Completo, 50 %, Clic, Asistió, +60 min, VIP, VIP anterior, En directo, Compró, Clienta anterior).

Cuando falta algo de la configuración (avisos de Métricas, tablas vacías, CPL sin inversión, Plan → Carrito…), el mensaje lleva un botón **«Configurarlo ahora →»** (o la propia cosa que falta, subrayada) que abre la configuración del lanzamiento en el campo exacto. Solo lo ve quien puede configurar.

### IVA, bump offers y orden del resumen
- **IVA**: junto a cada precio (entrada VIP, programa, todos en «⑧ Precios» y cada bump) se elige si lleva el **IVA incluido** o es **«+ IVA»** (el programa también puede ir **«Sin IVA»**, exento, como un producto sanitario), y el % (21 de serie). La **facturación, el beneficio y el ROAS se calculan sin IVA**. Si un precio no lo dice, se toma como IVA incluido y sale un aviso en Métricas.
- **Bump offers** (opcionales, cada uno se activa o no): de la **entrada VIP** (en «Entrada VIP»), del **pago único** y del **pago fraccionado** (en «Página de pago»). Cada uno con nombre, precio, IVA y la **etiqueta de GHL** de quien lo compra. Cuentan solo con la VIP o la compra de este lanzamiento en ese tipo de pago. En Métricas → Resumen y en Inicio: cuántos se compran y el **% sobre las VIP** (o sobre las ventas de ese tipo de pago); suman a la facturación y al ROAS.
- **Métricas → Resumen**: arriba, en grande, **Leads totales**, **Facturación** (sin IVA, con las **ventas totales** debajo) y **ROAS**. Debajo, el resto en el orden del embudo: captación (inversión, CPL, conversión de la página de registro) → calentamiento (encuesta, entradas VIP, bump de la VIP) → directo (asistencia) → carrito (llamadas, conversión a venta, ventas en directo, ventas de VIP, bumps del pago único y fraccionado). En Inicio, la tarjeta del lanzamiento: leads, CPL medio, entradas VIP, inversión y ROAS.
- **CPL medio = inversión de Meta / leads con la etiqueta de registro.** La inversión se suma sola de las campañas de Meta que llevan el código del lanzamiento (o el texto de «Campañas de Meta») en el nombre, desde el inicio de captación. Si no hay inversión, la tarjeta dice por qué (Meta sin conectar, ninguna campaña con el código, sin inicio de captación…). La inversión a mano de Configuración solo se usa si Meta no da nada.

### Conversión de la página de registro
La API de GHL no da las estadísticas de los embudos (las visitas de «Embudos → … → Estadísticas»), así que el dashboard cuenta las **visitas únicas** él mismo: en la página de registro, en el footer, `<div data-lsd-registro data-launch="auto"></div>` + `tracker.js` (Configuración → Códigos → «REGISTRO · visitas únicas»). Cada navegador cuenta una vez por lanzamiento (tabla `visitas_registro` de D1, sin GHL). **Conversión = registros (etiqueta de registro) / visitas únicas.** Sin el código, se usan las visitas de Meta (landing page views) si las hay.

### Llamada de admisión
En *Configuración → ⑥ Venta → Llamada de admisión*: el **enlace para reservar la llamada** (calendario de GHL; lo usan los botones `data-lsd-link="llamada"`), la **URL de la página de gracias por agendar** y el **vídeo de confirmación** (Vimeo o YouTube). En la página de gracias: `<div data-lsd-llamada data-launch="auto"></div>` + `tracker.js` (respuesta ligera de `/api/page?pagina=llamada`, sin llamar a GHL) y `<div data-lsd-embed="llamada"></div>` donde va el vídeo (sin URL, se oculta). Los códigos, con «Copiar», en la misma sección.

En *Configuración → ⑥ Venta → Venta y seguimiento → WhatsApp para resolver dudas* se pone **el número** (con prefijo; un móvil español sin prefijo se toma como +34) y **el mensaje que sale ya escrito** (`{producto}` = nombre del producto): el enlace `https://wa.me/…?text=…` se genera solo (con «Copiar» y «Probar»). Lo usan los botones `<a data-lsd-link="whatsapp-dudas">` de las páginas de venta y de replay (se abren en otra pestaña; sin enlace, se ocultan). En *Códigos* está el **botón flotante** (abajo a la derecha, fijo al hacer scroll; en móvil solo el icono), también en `bloques-ghl/whatsapp-flotante.html`. En la página de venta, el bloque VENTA pone además los enlaces de `pago`, `pago-fraccionado` y `llamada` con el ID de la lead.

### Barra fija de la página de venta

En *Configuración → ⑥ Venta → Página de venta → Barra fija con cuenta atrás*: varios **tramos** seguidos, cada uno con su texto (`{cuenta}` = cuenta atrás hasta su fin), su fecha y hora de fin y si lleva botón (adónde y con qué texto) o es solo informativo. Al acabar un tramo empieza solo el siguiente y tras el último la barra desaparece (p. ej. «🎁 Último día para llevarte el bonus» hasta que acaba el bonus y luego «⏳ Último día para entrar» hasta el cierre). **«✨ Rellenar con los bonus de Oferta y el cierre»** crea un tramo por cada fin de bonus y otro hasta el cierre del carrito, para retocar los textos. La pinta el mismo bloque «VENTA» que apunta las visitas (no hay que pegar nada más) y no llama a GHL. En cada lanzamiento nuevo se heredan los textos y botones, sin fechas.

### 🛒 Pestaña Carrito (Configuración)

**Días de carrito** (*① Datos básicos → Fechas*): empiezan a contar el día siguiente al vídeo de venta (el webinar, o el último vídeo en PLF). Venta el lunes + 4 días → día 1 el martes, último día el viernes, y el cierre se calcula solo (viernes 23:59; la casilla del cierre queda bloqueada). Vacío = el cierre se pone a mano.

Un día por cada día del carrito (el día del directo, con la apertura, y luego día 1, 2…). Cada día trae sus **hitos clave** automáticos (apertura, directo de venta, grabación, bonus activos, último día de cada bonus con su objetivo, mensaje de la barra de la página de venta que empieza ese día y cierre) y una casilla para escribir a mano la **estrategia** de ese día. La primera línea de la estrategia sale en el calendario como hito de ese día («🎯 Día 2 de carrito: …»). En cada día también se elige cuántos **emails** y cuántos mensajes al **grupo de WhatsApp** se envían y a qué hora cada uno («Copiar estos envíos al resto de días» los repite en todos los días de carrito); salen en el calendario de forma discreta (sin marcar el día ni aparecer en los próximos hitos de Inicio): «✉️ 3 emails del carrito · 10:00, 19:00, 22:15». El calendario también muestra los recursos de la preclase con fecha: clases, test (p. ej. «🧭 Test autodiagnóstico disponible») y descargable. Sin fechas, avisa de que se rellenará sola al configurar el carrito y la oferta.

### Fin de los bonus en el calendario

Cada bonus de *Oferta* que acaba antes del cierre sale como hito en el calendario (y en el calendario sincronizado, el Inicio y el resumen del cliente) el día en que acaba: «⏳ Último día · Bonus de acción rápida 48 h: Guía… (acaba a las 21:00)». Los de menos de un día (BAR en directo, 1 h…) dicen «Acaba el…». Sale de las fechas del carrito y del tipo de bonus (o de su fin a mano), igual en los meteóricos.

### Barra fija de la página de replay

En *Configuración → ④ Grabación → Página de replay → Barra fija con cuenta atrás*: con el carrito abierto, la página de la grabación enseña una barra fija arriba del todo con su texto (`{cuenta}` = la cuenta atrás), un botón opcional a la página de venta y su color. Hay que elegir si **lleva botón** (a la página de venta) o es **solo informativa** para crear urgencia. La cuenta atrás va **hasta una fecha y hora fija** (igual para todas) o dura **X minutos desde que cada lead abre la grabación** (se recuerda en su navegador: recargar no la reinicia). Al llegar a cero, la lead va sola a la página de venta, y si vuelve a abrir la grabación después, también. No hace falta pegar ningún código más en GHL: la barra la pone el bloque base de la página de replay. Necesita la URL de la página de venta.

## Aprender de cada lanzamiento

- **Retrospectiva** (Métricas → Resumen, al cerrar el carrito): el lanzamiento frente al anterior del mismo embudo (registros, coste por registro, asistencia, VIP, conversión, ventas, facturación y ROAS) y los aprendizajes, incluidos los bonus que funcionaron o no. Cada aprendizaje propone una tarea; con un botón se pasan a la planificación del siguiente lanzamiento (sin duplicarlas).
- **Casi compradoras** (Métricas → Ventas): muy calientes, calientes y VIP que no compraron. Un botón les pone la etiqueta `<código>_casi_compra` en GHL (con confirmación) para el workflow del downsell o del siguiente lanzamiento.
- **La puntuación aprende** (Métricas → Vídeos y conversión → «Qué predice la compra»): con al menos 10 ventas propone cuánto pesan las clases, la VIP y el directo o la grabación sobre los 100 puntos, según lo que separó a las que compraron. Al aplicarlo cambian la puntuación y el estado de los leads de todos los lanzamientos del cliente; se puede volver a los de serie (30/30/40).
- **Anuncios de todos los lanzamientos** (Análisis → Avatar y anuncios): anuncios, conjuntos o campañas juntados por nombre en todos los lanzamientos del embudo, con sus ventas, inversión, coste por venta y ROAS, y si conviene reutilizarlos o revisarlos.

## Sesiones

Al cambiar o regenerar la contraseña de una persona se cierran sus sesiones abiertas en otros dispositivos (quien cambia la suya sigue dentro). Desactivar a alguien le quita el acceso al momento.

### 🎥 Inscripción en Zoom por adelantado

La primera vez que una lead entra en la preclase (cualquier día antes del directo, hasta 30 días antes) se la inscribe por detrás en Zoom en el próximo directo y su enlace personal se guarda (en su navegador y en D1). A la hora del directo, al llegar a cero la pantalla de espera la lleva a Zoom al instante, sin esperar a Zoom ni a GHL; y las inscripciones se reparten en la semana en vez de concentrarse en la última hora. Como mucho un intento cada 6 h por dispositivo; la pantalla de espera y el clic siguen de respaldo. Si se cambia la reunión de Zoom, los enlaces de la reunión anterior se descartan y se reinscribe. Hace falta tener la reunión de Zoom configurada desde que abre la preclase, y conviene desactivar en Zoom el email de confirmación de registro.
