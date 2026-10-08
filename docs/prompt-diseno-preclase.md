# Prompt para rediseñar la página preclase (5 etapas)

Copia y pega esto en la conversación de Claude donde diseñaste la página del lanzamiento:

---

Vamos a rediseñar el bloque de etapas de la página preclase de «Me lo dijo la matrona». Sigue exactamente la misma narrativa visual, paleta de colores, tipografías, radios, sombras y estilo de botones que ya usamos en la página del lanzamiento (los que ya conoces de esta conversación). No inventes colores nuevos: si necesitas un tono para «bloqueado», usa una versión apagada de los mismos.

**Estructura (5 etapas, en este orden):**

1. **Etapa 1 · Encuesta** (ancho completo). Texto «Antes de ver las clases, cuéntanos un poco sobre ti» y un botón. Cuando ya la ha hecho, un mensaje de gracias con un check.
2. **Etapas 2, 3 y 4 en una fila de 3 columnas** (en móvil, apiladas una debajo de otra, en orden):
   - **Etapa 2 · Clase 1** (lunes): el vídeo y, debajo, la **música** (un reproductor de audio). La música aparece con un candado y el texto «Se desbloquea al ver el 75 % de la clase 1» hasta que la ve.
   - **Etapa 3 · Test** (martes): «Autodiagnóstico: ¿Por qué no te quedas embarazada?», con una frase corta de qué va a descubrir y un botón «Hacer el test» con el mismo diseño que el botón de la encuesta. Mientras está bloqueado, un candado y una cuenta atrás. Hecho: un check «¡Test completado!».
   - **Etapa 4 · Clase 2** (miércoles): el vídeo y, debajo, la **votación**: una pregunta con 3 o 4 opciones en forma de botones grandes. Tras votar se ven barras con el % de cada opción y la suya marcada. Antes del 75 % de la clase 2, un candado.
3. **Etapa 5 · Directo** (ancho completo): titular, fecha y hora, cuenta atrás y botón «Entrar al directo».

**Estados de cada etapa** (diséñalos los tres para cada tarjeta):
- `bloqueada`: tarjeta apagada, candado e indicación de cuándo se abre.
- `disponible`: tarjeta destacada con el color principal; es la que tiene que hacer ahora.
- `hecha`: tarjeta con un check y un aire más tranquilo.
El número de etapa va en un círculo arriba de cada tarjeta, y una línea o camino visual une las etapas 1 → 5.

**Muy importante: el comportamiento lo programa el dashboard.** Usa SOLO HTML y CSS (nada de JavaScript propio) y conserva estos atributos tal cual, porque el código los rellena y los muestra u oculta solo:

- Cada tarjeta de etapa: `<div data-lsd-etapa="encuesta">`, `data-lsd-etapa="clase1"`, `"test"`, `"clase2"`, `"directo"`. El código le pone `data-lsd-estado="bloqueada|disponible|hecha"`, así que da estilo con selectores como `[data-lsd-etapa][data-lsd-estado="hecha"]`.
- Número de etapa: `<span data-lsd-etapa-n="test"></span>` (el código escribe el número).
- Vídeos: `<div data-lsd-video="clase1"></div>` y `<div data-lsd-video="clase2"></div>` (vacíos; el código mete el reproductor o el candado con cuenta atrás).
- Música: `<div data-lsd-audio="musica"></div>` (vacío; el código pinta el candado o el reproductor con clases `.lsd-rec`, `.lsd-rec-lock`, `.lsd-rec-t`, `.lsd-rec-s` que puedes estilizar).
- Votación: `<div data-lsd-votacion></div>` (vacío; el código pinta `.lsd-vot-op` para los botones de opción y `.lsd-vot-res`, `.lsd-vot-res.mio`, `.lsd-vot-total` para los resultados, con la barra en un `<i>` interior). Estiliza esas clases.
- Encuesta: `<div data-lsd-if="encuesta-pendiente">…<a data-lsd-link="encuesta">Rellenar la encuesta</a></div>` y `<div data-lsd-if="encuesta-hecha">…</div>`.
- Test: `<div data-lsd-if="test-bloqueado">🔒 Se abre en <span data-lsd-countdown="test"></span></div>`, `<div data-lsd-if="test-disponible"><a data-lsd-link="test">Hacer el test</a></div>`, `<div data-lsd-if="test-hecho">✓ ¡Test completado!</div>`.
- Directo: `<span data-lsd-text="fechaDirecto"></span>`, `<span data-lsd-text="horaDirecto"></span>`, `<div data-lsd-countdown-boxes="directo"></div>` y `<a data-lsd-link="directo">Entrar al directo</a>`.
- Textos editables desde el dashboard: `<span data-lsd-text="clase1-titulo"></span>`, `clase1-descripcion`, `clase2-titulo`, `clase2-descripcion` (pon un texto de ejemplo dentro; si en el dashboard está vacío, se queda el tuyo).

Entrégame un único bloque de HTML + CSS para pegar en un elemento «Código personalizado» de GHL, responsive (3 columnas en escritorio, 1 en móvil) y con el CSS acotado a un contenedor `.mldlm-etapas` para no afectar al resto de la página. Al final, el script del dashboard ya está en la página (no lo incluyas).
