// Prompt para diseñar con Claude la pantalla de espera de un lanzamiento (Configuración → Pantalla de espera →
// Diseño propio): Claude devuelve un CSS y una decoración HTML/SVG que se pegan en el dashboard. Sin pantalla:
// app.js y las pruebas.

// La estructura que pinta tracker.js (mostrarEspera): Claude solo puede vestirla, no cambiarla.
export const ESTRUCTURA_ESPERA = `<div id="lsd-espera" class="lsd-espera--propio [lsd-espera--video si hay vídeo]">
  <div class="lsd-espera-in">
    <img class="lsd-espera-logo">                      (si hay logo)
    <h2 class="lsd-espera-t">Titular</h2>
    <p class="lsd-espera-sub">Debajo del titular</p>
    <div class="lsd-espera-video"><div class="lsd-embed"><iframe></iframe></div></div>   (si hay vídeo)
    <div class="lsd-espera-cd">
      <div class="lsd-espera-u"><span class="lsd-espera-num">12</span><span class="lsd-espera-lbl">minutos</span></div>
      <span class="lsd-espera-sep">:</span>
      <div class="lsd-espera-u"><span class="lsd-espera-num">34</span><span class="lsd-espera-lbl">segundos</span></div>
    </div>
    <p class="lsd-espera-msg"><span class="lsd-espera-dot"></span><span>Mensaje (puede llevar <strong>)</span></p>
    <div class="lsd-espera-app">                        (si el directo es en Zoom)
      <p class="lsd-espera-app-txt">Te recomendamos <strong>descargar la aplicación de Zoom</strong>…</p>
      <div class="lsd-espera-app-bts"><a class="lsd-espera-app-btn"><svg></svg>Descargar para iPhone</a></div>
      <p class="lsd-espera-app-alt">¿Usas Android? <a>Descárgala aquí</a></p>
    </div>
  </div>
  <div class="lsd-espera-deco">AQUÍ VA TU DECORACIÓN</div>
</div>`;

// ctx: { lanzamiento, marca, producto, textos: { titulo, subtitulo, mensaje }, logo, video, narrativa, diseno, contexto }
export function promptEspera(ctx = {}) {
  const t = ctx.textos || {};
  const bloques = [
    `Eres diseñador web y de motion. Diseña la PANTALLA DE ESPERA del directo del lanzamiento «${ctx.lanzamiento || 'el lanzamiento'}»${ctx.marca ? ` de ${ctx.marca}` : ''}${ctx.producto ? ` (producto: ${ctx.producto})` : ''}.`,
    `Es lo que ve la gente los 59 minutos antes del directo al abrir la página: tapa toda la pantalla, con una cuenta atrás de minutos y segundos. Al llegar a cero entran solas a Zoom. Tiene que crear expectación, ser coherente con la historia del lanzamiento y verse perfecta en el móvil (la mayoría entra desde el móvil) y en el ordenador.`,
    ctx.narrativa || '',
    ctx.diseno ? `ESTILO VISUAL DE LA MARCA (colores, tipografías, sensación):\n${ctx.diseno}` : '',
    ctx.contexto ? `CONTEXTO DE LA MARCA Y EL PRODUCTO:\n${ctx.contexto}` : '',
    `TEXTOS ACTUALES (no los cambies; si quieres proponer otros, dímelos aparte y los cambio yo en el dashboard):
- Titular: «${t.titulo || '¡Empezamos en unos minutos!'}»
- Debajo del titular: «${t.subtitulo || 'Prepárate'}»
- Mensaje: «${t.mensaje || 'Quédate aquí, serás redirigida al directo en cuanto el contador llegue a cero.'}»
- Logo: ${ctx.logo ? ctx.logo : 'no hay'} · Vídeo: ${ctx.video ? 'sí (el contador se hace pequeño y el vídeo destaca)' : 'no'}`,
    `ESTRUCTURA HTML (la genera la página; NO la puedes cambiar, solo vestirla con CSS):\n${ESTRUCTURA_ESPERA}`,
    `QUÉ TIENES QUE DEVOLVER: exactamente dos bloques de código, sin nada más dentro.

1) Un bloque \`\`\`css con el CSS:
- Todas las reglas empiezan por #lsd-espera (para no tocar el resto de la página). Ya hay un diseño base: tu CSS va después y lo pisa.
- Fondo en #lsd-espera (background). Colores rápidos con estas variables en #lsd-espera: --lsd-espera-fondo, --lsd-espera-titulo, --lsd-espera-acento (contador y botón de Zoom), --lsd-espera-texto.
- Fuentes: si usas Google Fonts, empieza con @import url('https://fonts.googleapis.com/css2?family=…&display=swap');
- Animaciones con @keyframes de nombre propio (empiezan por esp-), suaves y en bucle; respeta @media (prefers-reduced-motion:reduce).
- Para la decoración: .lsd-espera-deco (va debajo del contenido, ocupa todo el ancho; dale alto o ponla en position:fixed detrás del contenido con z-index:-1 o pointer-events:none).
- Contraste suficiente: el contador y el mensaje se tienen que leer de un vistazo. Pruébalo a 375 px de ancho: nada se sale ni se corta, sin scroll horizontal.
- No ocultes la cuenta atrás, el mensaje ni el aviso de Zoom (.lsd-espera-app): son necesarios.

2) Un bloque \`\`\`html con la decoración (va dentro de .lsd-espera-deco):
- Solo HTML y SVG en línea (ilustraciones, siluetas, partículas, luces…). Sin <script>, sin onclick ni otros on…, sin <iframe>. Se anima con el CSS de arriba.
- Imágenes solo con URL https absolutas (si necesitas una que no tengo, dímelo y la subo a GHL).
- Ligera: menos de 30 KB.`,
    'Antes del código, en 3-4 líneas, explícame la idea del diseño y cómo conecta con la narrativa del lanzamiento.',
  ];
  return bloques.filter(Boolean).join('\n\n');
}
