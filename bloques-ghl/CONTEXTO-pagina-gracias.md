Ahora vamos a hacer la PÁGINA DE GRACIAS: la que ven justo después de registrarse gratis al webinar "El Camino" (Me lo dijo la matrona). URL: https://lp.saraguzman.com/el-camino-gracias-entrada-vip

Te paso pantallazos de mi página de gracias actual: úsalos para el COPY (textos, qué incluye cada entrada…), pero el diseño tiene que seguir la narrativa visual del camino que ya tienen la página de registro y la preclase.

ESTÉTICA
- Paleta: burdeos #860d0e, botón #c49b79 (texto del botón #3a2a24), pastel #f0e4da, crema #fbf6f1, texto #3a2a24, títulos #4a2c20, líneas #e2d3c5. Dorado suave para lo VIP (#d9b47a / #f3e2bf).
- Tipografía: Lato (400, 700, 900) de Google Fonts.
- Motivo del Camino de Santiago: sendero punteado que une las secciones, conchas, mojones numerados.
- Muy visual, con animaciones suaves al aparecer y respeto a prefers-reduced-motion. Móvil primero.

REGLAS PARA GHL
1. Cada sección es un bloque independiente para pegar en un elemento "Código personalizado": sin <html>, <head> ni <body>; cada bloque con su <link> de Lato, su <style> y su HTML.
2. Todas las clases con prefijo mldlm-gr-. Nada de estilos globales (body, h1, a…) fuera de la clase del bloque.
3. Imágenes por URL (las subo a Medios de GHL); nunca en base64.
4. Nada de scripts de "vista previa" que simulen datos: los datos los pone mi script.
5. Ningún elemento con atributos data-lsd-… puede llevar display:none en el CSS (mi script los muestra y oculta él solo).
6. Los enlaces con data-lsd-link van SIN href: lo pone mi script con la URL del dashboard.

NARRATIVA Y SECCIONES
"Ya has dado el primer paso del camino" → confirmación → vídeo → elegir cómo vivir el directo (normal o VIP). El objetivo principal es que compren la ENTRADA VIP; la normal es la alternativa.

1) Confirmación (primer bloque). Su PRIMERA LÍNEA tiene que ser exactamente:
   <div data-lsd-page="gracias" data-launch="auto"></div>
   - Titular tipo "¡Tu plaza está reservada!" y un aviso "Paso 1 de 2: no cierres esta página, mira el vídeo".
   - Fecha y hora automáticas del directo:
     <span data-lsd-text="fechaDirecto">jueves, 29 de octubre</span> a las <span data-lsd-text="horaDirecto">19:00</span> h
   - Cuenta atrás hasta el directo: <div data-lsd-countdown-boxes="directo"></div>
     Mi script genera dentro: <div class="lsd-cdb"><div class="lsd-cdb-unit"><span class="lsd-cdb-num">23</span><span class="lsd-cdb-label">días</span></div>… (horas, min, seg)</div>. Estílalo con !important (trae estilos por defecto). Se oculta solo al llegar a cero.

2) Vídeo (protagonista, grande). El vídeo lo pongo desde mi dashboard, NO pongas iframe ni URL. Usa solo este contenedor:
     <div data-lsd-embed="gracias"></div>
   Mi script mete dentro: <div class="lsd-embed"><iframe …></iframe></div> (16:9). Dale marco elegante (borde, sombra, esquinas redondeadas, quizá un "sello" o una concha decorativa) estilando .lsd-embed con !important si hace falta. Encima, un titular que invite a verlo ("Mira este vídeo antes de continuar") y una flecha animada hacia abajo hacia las opciones.

3) Las 2 opciones, como dos tarjetas lado a lado en ordenador y una debajo de otra en móvil (la VIP primero en móvil). La VIP claramente destacada: más grande o elevada, borde dorado, sello "Recomendada" o "Plazas limitadas".
   - ENTRADA GRATUITA (la que ya tienen): qué incluye (del pantallazo). Botón "Continuar con mi entrada gratuita" que lleva al grupo de WhatsApp:
       <a data-lsd-link="whatsapp" target="_blank" rel="noopener">Continuar con mi entrada gratuita</a>
   - ENTRADA VIP: qué incluye (del pantallazo).
       Precio automático: <span data-lsd-text="precioVip">9 €</span>
       Prueba social automática: <span data-lsd-text="vipContador">41</span> mujeres ya tienen su entrada VIP
       Cuenta atrás de cierre (la VIP se cierra al empezar el directo): <span data-lsd-countdown="vip"></span>
       Botón al checkout: <a data-lsd-link="vip">Quiero mi entrada VIP</a>
   - Toda la tarjeta clicable: al pulsar en cualquier parte de la tarjeta, que vaya a la misma URL que su botón (léela del href del botón con un pequeño script al hacer clic). NO pongas data-lsd-link en la tarjeta, solo en el botón.

4) Estados automáticos de la VIP (mi script muestra u oculta cada contenedor según el caso):
   - data-lsd-if="vip-abierta" → la tarjeta VIP con su botón.
   - data-lsd-if="vip-cerrada" → en su lugar, "La entrada VIP ya está cerrada" (y la gratuita sigue igual).
   - data-lsd-if="ya-vip" → "¡Ya tienes tu entrada VIP!" (si ya la compró).

5) Cierre: recordatorio de unirse al grupo de WhatsApp, porque ahí se manda el enlace del directo, con otro botón:
     <a data-lsd-link="whatsapp" target="_blank" rel="noopener">Unirme al grupo de WhatsApp</a>
   y el camino que continúa: "Próxima parada: las 2 clases previas" con sus fechas automáticas:
     Clase 1: <span data-lsd-text="clase1">lunes, 26 de octubre, 09:00</span>
     Clase 2: <span data-lsd-text="clase2">martes, 27 de octubre, 09:00</span>

Si mi script aún no ha cargado se ve el texto de muestra, así que pon textos de muestra que tengan sentido.

Dame los bloques completos, en orden, listos para pegar.
