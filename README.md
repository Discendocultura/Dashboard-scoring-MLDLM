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

### Mensaje de WhatsApp

1. **Ver grabación**: aún no ha visto el 50% de la grabación (ni estuvo en el directo hasta el final).
2. **Oferta Raíces**: ha visto ≥50% de la grabación.
3. **Venta / llamada**: estuvo en el directo hasta el final o vio ≥90% de la grabación.

Los textos se editan en **Configuración → Mensajes de WhatsApp**. Los enlaces llevan el
`cid` del lead para seguir midiendo lo que hace después.

### ¿Qué significa "hasta el final" en el directo?

Que seguía conectado en los últimos 15 minutos de la reunión (cuando se presenta la oferta)
y estuvo al menos 20 minutos en total.

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

### Pestaña Métricas
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

## Cada lanzamiento

1. **Configuración → + Nuevo**. Rellena el código (p. ej. `nov26`), las etiquetas de registro y VIP,
   el ID de la reunión de Zoom y los enlaces de la grabación, la página de venta de Raíces, los enlaces de pago de Raíces (único en ThriveCart y fraccionado en Hotmart) y la llamada.
2. **Zoom**: crea una reunión nueva para cada lanzamiento con **Registro: obligatorio**. En
   *Registro → Ajustes*, desactiva los emails de confirmación de Zoom si no los quieres.
3. **Páginas de GHL**: en *Configuración → Códigos para GHL* copia el bloque de cada vídeo y pégalo
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
Dos páginas en GHL (los códigos exactos, con el lanzamiento ya puesto, están en *Configuración → Códigos para GHL*):

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
En *Configuración → Lanzamiento*: **etiqueta de encuesta rellenada** (la que añade la encuesta de GHL al enviarse) y
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
| `<div data-lsd-embed="gracias"></div>` | Vídeo de la página de gracias (Vimeo o YouTube) desde *Página preclase → Página de gracias*; se oculta si no hay |
| `<span data-lsd-text="vipContador">` | Prueba social: número configurado en el dashboard (41 por defecto) + VIP vendidas en este lanzamiento (las de lanzamientos anteriores no cuentan; se actualiza cada minuto) |
| `<a data-lsd-link="guia">` (cualquier nombre) | Enlace personalizado creado en *Página de recursos → Enlaces personalizados* |
| `<span data-lsd-text="nombre|fechaDirecto|horaDirecto|directo|clase1|clase2|replay|cierreVip|cierreCarrito|precioVip">` | Escribe el dato |
| `<span data-lsd-countdown="vip|directo|clase1|clase2|replay|fase">` | Cuenta atrás |
| `<div data-lsd-countdown-boxes="directo|clase1|clase2|vip|fase"></div>` | Cuenta atrás en cajas (`.lsd-cdb`, `.lsd-cdb-unit`, `.lsd-cdb-num`, `.lsd-cdb-label`); se oculta al llegar a cero |
| `<a data-lsd-link="encuesta">` | Botón a la encuesta (se abre en otra pestaña, con los datos rellenos; se oculta cuando ya la ha hecho) |
| `data-lsd-if="vip-abierta|vip-cerrada|ya-vip|encuesta-pendiente|encuesta-hecha"` | Muestra el elemento solo en ese caso |
| `data-lsd-phase="pre_c1 c1 c2 dia_directo en_directo replay cerrado"` | Muestra el elemento solo en esas fases |

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
- Vista **👥 Por fase**: cada persona aparece en la fase de su última llamada (próxima, sin anotar, pendiente de pago, seguimiento, venta, no compra, no show, reagendar, cancelada), con filtros y un botón de **WhatsApp con el mensaje de esa fase** (plantillas editables en Configuración → Mensajes de WhatsApp; admiten {dia_llamada} y {hora_llamada}). Queda registrado cuándo se envió. La fase también se puede filtrar en la pestaña Leads.
- Métricas: reservadas, shows, no shows, canceladas y conversión (número y %), sin anotar y motivos de no compra. El resultado se guarda también en `lsd_llamadas_<código>`.
- El token de GHL (integración privada) necesita los permisos de calendarios, eventos de calendario y oportunidades (lectura y escritura) y de notas de contactos.

## Avatar y anuncios ganadores
Pestaña para admin y técnico con:
- **Anuncios ganadores**: ranking (🥇🥈🥉 y tabla) de anuncios, conjuntos o campañas por ventas de Raíces que traen, con conversión, registros, VIP, facturado y, si Meta está conectado, inversión, CAC y ROAS. Se atribuye por las UTM del registro (utm_content = anuncio, utm_term = conjunto, utm_campaign = campaña).
- **Ventas por canal, campaña, conjunto y anuncio**.
- **Avatares de compradoras** sacados de la encuesta.

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
1. Configuración → Mensajes → **Enviar el resumen a**: tu email (tiene que existir como contacto en GHL).
   Pulsa **Enviar resumen de prueba**.
2. El token de GHL necesita además el permiso **`conversations/message.write`**.
3. Para recibirlo cada mañana: añade en Cloudflare el secreto `DIGEST_KEY` (texto aleatorio largo) y crea una tarea
   gratuita en [cron-job.org](https://cron-job.org) que abra a las 8:00 (hora de Madrid):
   `https://<tu-proyecto>.pages.dev/api/digest?key=<DIGEST_KEY>`

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
Cada persona entra con **su email y su contraseña**. Se dan de alta en *Configuración → Equipo* (o al asignar una tarea a «+ Nueva persona»): se crea su contacto en GHL con la etiqueta `equipo-dashboard` y le llega un email desde GHL con el enlace, su email y una contraseña generada. Desde «Mi cuenta» puede cambiarla; desde Equipo se puede reenviar el acceso (contraseña nueva), cambiar el rol, desactivar o borrar.

- **Admin**: todo (incluida la gestión del equipo y crear/editar tareas y eventos).
- **Técnico**: configuración de lanzamientos, Setteo hoy, Leads, Métricas, Objetivos y Avatar y anuncios.
- **Setter**: Setteo hoy y Leads.
- **Todos**: Tareas y Calendario (cada uno marca sus tareas y las de su rol).

Las contraseñas generales `ADMIN_PASSWORD` / `SETTER_PASSWORD` siguen funcionando (dejando el email vacío) como acceso de emergencia.

## Tareas
Cada lanzamiento tiene su pestaña **Tareas**, agrupadas por fase (preparación → cierre) con barra de progreso, vencidas y filtros (pendientes, mías, vencidas, hechas, por persona). La admin crea, edita y borra (también varias a la vez con «Seleccionar», o todas con «Eliminar todas»); cada tarea se asigna a una persona o a todo un rol y, si se marca «Avisar», le llega un email. El resto marca como hechas las suyas o las de su rol. Se ven en **Lista** (por fases) o en **Tablero** kanban: una columna por fase (Preparación agrupada por subcategorías), las columnas extra que cree la admin (comunes a todos los lanzamientos; se renombran, mueven, colorean y borran con «⋯») y **✅ Completadas** al final: al marcar la casilla la tarjeta salta ahí tachada. La admin arrastra tarjetas entre columnas (o elige la columna al abrir la tarea); el resto marca las suyas como completadas. La fase **Preparación** se divide en subcategorías (Dashboard y herramientas, Oferta y pagos, Contenido y creatividades, Comunicación, Revisión y pruebas, Equipo y reuniones, Otras): se deducen del título y se pueden elegir al crear o editar la tarea.

Filtros: pendientes, hoy, esta semana, mías, vencidas, hechas y por persona.

Cada tarea tiene una **descripción con formato** (títulos, negrita, listas con viñetas o numeradas, enlaces externos y **vídeos de Vimeo, YouTube o Loom** que se reproducen dentro de la tarea). Pulsa el título de una tarea para verla completa. El servidor limpia el HTML: solo pasa el formato permitido.

**Tareas habituales**: al marcar «🔁 Tarea habitual» la tarea se guarda en la plantilla (Custom Value `lsd_tareas_habituales`) con su descripción, fase, persona o rol asignado y fecha relativa a un hito (captación, clase 1, directo o cierre). «Cargar tareas habituales» en el siguiente lanzamiento las crea con esa misma asignación (si la persona ya no está, se asigna a su rol) y sin duplicar. Editar una habitual actualiza la plantilla; desmarcar la casilla la quita.

**Avisos para la admin**: si una tarea asignada a otra persona o a otro rol (no admin) pasa su fecha sin completarse, aparece un aviso rojo arriba del dashboard (solo para admin) con quién va tarde, qué tarea y cuántos días; «Ver vencidas» lleva a la lista y «Entendido» lo oculta hasta mañana o hasta que haya otra. También salen en el resumen diario por email.

Con «Seleccionar» la admin puede **asignar varias tareas a la vez** (p. ej. todas las de «Rol Admin» a una persona) o eliminarlas.

## Calendario
Pestaña **Calendario** (todos los roles), con vista **mensual** y **semanal**:
- **Hitos** del lanzamiento sacados de la configuración: inicio y fin de la publi de captación, clase 1, clase 2, directo, apertura del carrito (vacío = al empezar el directo), grabación y cierre del carrito.
- **Franjas de fase** de colores: captación, clases previas, directo y carrito abierto.
- **Tareas** con fecha (las vencidas en rojo) y **eventos propios** (email, RRSS, publicidad, reunión, directo/live; pueden durar varios días). Solo la admin crea o cambia eventos.
- **Otros lanzamientos**: muestra también sus hitos para ver si se solapan.
- Pulsa un día para ver el detalle, marcar tareas o (admin) añadir eventos y tareas ese día.
- **Sincronizar con mi calendario**: cada persona tiene un enlace privado para Google Calendar (*Añadir calendario → Desde URL*) o iPhone/Mac (webcal). Incluye hitos, eventos y sus tareas, y se actualiza solo. Si se desactiva a la persona, su enlace deja de funcionar.

La configuración se guarda en el Custom Value `lead_scoring_dashboard_config` de GHL, los usuarios en `lsd_usuarios` (contraseñas solo como hash PBKDF2) las tareas en `lsd_tareas_<código>` los eventos en `lsd_eventos_<código>` y las columnas extra del tablero en `lsd_kanban_columnas`. No los borres.

## Escala
Los leads se cargan en páginas de 100 desde el navegador, así que 2.000 leads son unas 20
peticiones y la carga sigue funcionando con decenas de miles. La sincronización de Zoom etiqueta
en bloques de 25 y respeta el límite de peticiones de GHL.

## Desarrollo local
```bash
npm run dev:mock   # datos falsos, contraseñas "admin" / "setter" → http://localhost:3000
npm run dev        # contra GHL real, con las variables en un fichero .env
npm test
npx wrangler pages dev   # igual que en Cloudflare (variables en .dev.vars)
```
