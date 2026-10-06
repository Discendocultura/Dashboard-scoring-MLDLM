Voy a rediseñar la página de registro de mi webinar "El Camino" (Me lo dijo la matrona) en GoHighLevel (GHL). Te paso el código / capturas de mi página actual: mantén el copy y la estructura, pero con la estética de la página preclase que ya tengo:

- Paleta: burdeos #860d0e, botón #c49b79 (texto del botón #3a2a24), pastel #f0e4da, crema #fbf6f1, texto #3a2a24, marrón títulos #4a2c20, líneas #e2d3c5.
- Tipografía: Lato (400, 700, 900) de Google Fonts.
- Motivo visual del "camino" (Camino de Santiago): concha, sendero punteado, mojones.

REGLAS PARA QUE FUNCIONE EN GHL
1. Dame cada sección como un bloque independiente para pegar en un elemento "Código personalizado" de GHL: sin <html>, <head> ni <body>; cada bloque con su <link> de Lato, su <style> y su HTML.
2. Prefija todas las clases con mldlm-reg- para no chocar con los estilos de GHL. Nada de estilos globales (body, h1, a…) salvo dentro de la clase del bloque.
3. Imágenes por URL (las subo a Medios de GHL); nunca en base64.
4. Nada de scripts de "vista previa" que simulen la cuenta atrás o rellenen datos: los datos los pone un script mío (abajo).
5. Ningún elemento con data-lsd-… puede tener display:none en el CSS (mi script los muestra y oculta él mismo).
6. El formulario de registro es el formulario nativo de GHL (lo pongo yo en el editor): déjale un hueco/sección donde colocarlo y estilos que encajen alrededor, pero no hagas un formulario en HTML.

DATOS AUTOMÁTICOS (no escribas fechas fijas)
La fecha, la hora del directo y la cuenta atrás salen de mi dashboard. Usa exactamente estos marcadores; el texto de dentro es solo de muestra (mi script lo sustituye):

- Fecha del directo:  <span data-lsd-text="fechaDirecto">jueves, 29 de octubre</span>
- Hora del directo:   <span data-lsd-text="horaDirecto">19:00</span>
- Fecha y hora juntas: <span data-lsd-text="directo">jueves, 29 de octubre, 19:00</span>
- Cuenta atrás en texto: <span data-lsd-countdown="directo"></span>   (escribe por ejemplo "23 d 8 h 22 min")
- Cuenta atrás en cajas: <div data-lsd-countdown-boxes="directo"></div>
  Mi script genera dentro esta estructura, a la que tienes que dar estilo (con !important, porque trae estilos por defecto):
    <div class="lsd-cdb">
      <div class="lsd-cdb-unit"><span class="lsd-cdb-num">23</span><span class="lsd-cdb-label">días</span></div>
      (… horas, min, seg)
    </div>
  Al llegar a cero se oculta sola.
- Botón "Añadir al calendario": <a data-lsd-link="calendario" target="_blank">…</a>  (sin href; lo pone el script)
  Enlace para Apple/Outlook: <a data-lsd-link="calendario-ics">…</a>

En el primer bloque de la página incluye esta línea al principio (activa los datos automáticos, sin pedir email):
<div data-lsd-page="registro" data-launch="auto"></div>

Y en el pie de la página (Configuración de la página → Tracking code → Footer) va:
<script src="https://leads-mldlm.pages.dev/tracker.js" defer></script>

Si el script no ha cargado todavía, se ve el texto de muestra, así que pon textos de muestra que tengan sentido.
