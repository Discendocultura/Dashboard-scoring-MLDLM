# Editor de anuncios

Editor para montar anuncios verticales (1080×1920) de busto parlante con la plantilla de cada marca:
subtítulos palabra a palabra, cartel del gancho, palabras grandes, zooms, animaciones en Remotion
sincronizadas con lo que se dice, voz sin ruido, música con ducking y efectos de sonido.

Basado en el manual «Reels con Claude Code», con Remotion como motor gráfico en lugar de subtítulos ASS.

La skill `editar-anuncio` (`.claude/skills/editar-anuncio/SKILL.md` en la raíz del repo) guía todo el proceso.

## Plantillas de marca (`plantillas/`)

Cada anuncio elige la suya en `props.json → "plantilla"`. Claves: `primario`, `oscuro`, `acento`, `claro`,
`fuenteTitulos`, `fuenteSubs` y medidas. El código usa solo esas claves, nunca colores fijos.

- `claves`: Claves de la Historia y la Actualidad. Burdeos `#7B1E22`, burdeos oscuro `#5C1418`, dorado `#B8913A`,
  crema `#F7F3EC`. Playfair Display en títulos; subtítulos en Inter 800 (se leen mejor en el móvil).
- `discendo`: navy `#062942`, naranja `#FFA500`, blanco. Poppins en todo.
- `mldlm`: Me lo dijo la matrona · El Camino. Burdeos `#860d0e`, burdeos oscuro `#5e0909`, tierra `#c49b79`,
  crema `#fbf6f1`; el resto de la paleta en `extra`. Lato 900 en todo. Guía completa (componentes y narrativa
  del Camino de Santiago: sendero punteado, concha, mojones, catedral) en `plantillas/mldlm-guia.md`:
  léela antes de diseñar animaciones para esta marca.

Colores secundarios de una marca: en `extra` (`e.extra.pastel`…). Si la marca tiene guía de estilo, guárdala como
`plantillas/NOMBRE-guia.md`.

Nueva plantilla: `plantillas/NOMBRE.json` + registrarla en `plantillas/index.js` + fuentes en `src/fuentes.js`.
`scripts/muestra.sh NOMBRE` genera una imagen de muestra.

## Estilos de edición (`ediciones/`)

Independientes de la paleta: `props.json → "edicion"`.

- `clasico`: subtítulos con los colores de la marca, gancho arriba, animaciones de `src/Animaciones.jsx` en la franja de
  arriba o a la altura del pecho (nunca tapan la cara).
- `impacto`: subtítulos blancos con sombra suave (la palabra que suena, algo más grande), gancho y botón de registro
  abajo del todo, y escenas a pantalla completa de `src/Impacto.jsx` que tapan la imagen mientras la voz sigue:
  - `broll` `{src | imagen, rotulo?}`: vídeo o imagen a pantalla completa con zoom lento.
  - `frase` `{texto, destacar[], antetitulo?}`: palabras que entran una a una; las destacadas en acento y cursiva.
  - `cifra` `{hasta, prefijo, sufijo, etiqueta}`, `cronologia` `{titulo, hitos[{anio, texto}]}`,
    `cartel` `{antetitulo, titulo, lineas[{texto, en}], sello, selloEn}`, `boton` `{texto, toque, subtexto}`.
  Mientras hay una escena de texto (`frase`, `cifra`, `cronologia`, `cartel`) no se ponen subtítulos encima.
  Ritmo: no más de ~6 s seguidos sin volver a la cara.

B-rolls: los clips van en `broll/` (en el repo, para reutilizarlos gratis) con su ficha en `broll/catalogo.json`;
`public/broll` es un enlace a esa carpeta (`ln -s ../broll public/broll` si falta).

## Música y efectos

- `musica/catalogo.json`: músicas ya generadas (estilo, marca, duración, puntos de corte, prompt y dónde se usaron).
  Reutilizarlas es gratis.
- `sonidos/catalogo.json`: efectos de sonido reutilizables con su volumen recomendado.

## Qué hace falta en la sesión

- Node + `npm i` en esta carpeta. Chromium ya viene en los contenedores de Claude Code
  (`/opt/pw-browsers/...`); en otro equipo, exporta `CHROME=/ruta/al/chrome` o quítalo de `montar.sh`.
- Python: `pip install openai-whisper noisereduce soundfile`.
- Dominios permitidos en la red del entorno: `openaipublic.azureedge.net` (modelo de Whisper),
  `drive.usercontent.google.com` y `drive.google.com` (vídeos de Drive, compartidos «cualquiera con el enlace»),
  `pikaso.cdnpk.net` (descargas de Magnific).

## Flujo para cada anuncio

1. Descarga el bruto a `brutos/` (nunca se toca el original).
2. `scripts/preparar.sh brutos/VIDEO.MP4 proyectos/NOMBRE [x_recorte] [duracion]`
   → copia de trabajo vertical en `public/NOMBRE.mp4`, voz limpia y transcripción.
   `x_recorte` es el borde izquierdo del recorte 9:16 sobre el 4K horizontal (1272 centra la cara en los
   vídeos del set actual). Comprueba un fotograma antes de seguir.
3. **Cortes de erratas:** `scripts/detectar_erratas.py` propone qué quitar (trabas, repeticiones, reinicios de frase,
   muletillas, pausas largas a mitad de frase, silencios al principio y al final); se revisa con el usuario, la lista
   aprobada va a `cortes.json` y `scripts/aplicar_cortes.py` corta vídeo, voz y transcripción a la vez. Los puntos de corte
   (`cortes_aplicados.json`) se tapan con un salto de zoom.
4. **Primera pasada de subtítulos:** enseña la transcripción comparada con el guion. Corrige `words.json`:
   las frases del guion llevan su texto exacto; lo improvisado se subtitula tal cual se dijo;
   los errores de Whisper se corrigen (p. ej. «historias y memorizar» → «Historia sin memorizar»).
5. Crea `proyectos/NOMBRE/props.json` copiando el de `ad4-la-resistencia` y cambia:
   `plantilla`, `video`, `duracion`, `words`, `gancho`, `grandes`, `zooms`, `animaciones` y `sonido`.
6. Revisa fotogramas clave con `npx remotion still ... --frame=N` antes de dar nada por bueno.
7. `scripts/montar.sh proyectos/NOMBRE` → `salidas/NOMBRE_1080p.mp4` (<30 MB, se puede enviar por el chat)
   y `salidas/NOMBRE_maxima.mp4`.

## Piezas de `props.json`

- `gancho`: texto literal del cartel (4,5 s).
- `grandes`: `{text, start, dur}`. Los subtítulos se ocultan mientras están en pantalla. 2–4 por anuncio.
- `zooms`: `{tipo: "zoom"|"salto", start, dur}`. Lentos en frases clave; saltos en frases cortas.
- `animaciones` (`src/Animaciones.jsx`), cada una con `start` y `dur` en segundos:
  - `titulares`: avalancha de titulares (exceso de información).
  - `apagon`: se va la luz y queda un foco sobre la cara.
  - `cinta`: cinta de noticias que se tacha.
  - `linea`: línea del tiempo con `hitos`.
  - `evento`: tarjeta con `fases` (`desde`, `antetitulo`, `titulo`, `linea`, `sello`, `tachado`, `tachaEn`).
  - `multitud` + `contador` (`hasta`, `etiqueta`): personas que llenan la pantalla y cifra que sube.
  - `cta`: botón «Reserva tu plaza gratis» con toque, chip de grupo privado y flecha (`toque`, `grupo`, `final`).
- `sonido`: `musica`, `musica_db` (−9 deja la música ~14 dB bajo la voz) y `efectos` `{archivo, en, db}`.

## Reglas

1. El original no se toca nunca: se trabaja sobre copias y carpetas nuevas por anuncio.
2. Subtítulos siempre en dos pasadas (transcripción revisada contra el guion).
3. En estilo clásico nada tapa la cara: animaciones en la franja superior (y < 380) o a la altura del pecho; el gancho arriba.
   En estilo impacto las escenas tapan la pantalla a propósito, pero cortas (2–4 s) y alternando con la cara.
4. Revisar fotogramas antes de entregar.
5. Nada de pago sin ver el coste: con Magnific, `simulate_cost` antes de generar y pedir el sí.
   Referencia (oct 2026): música Google Lyria 3 Pro 45 s = 160 créditos; efecto de 2 s = 10; de 1 s = 5.
6. Volumen final en torno a −14/−15 LUFS.
7. Lo aprendido en cada anuncio se añade aquí.

## Lo aprendido

- Whisper con `initial_prompt` del guion alucinó el principio del AD 4. El prompt corto de muletillas de `transcribir.py`
  no alucina y hace que Whisper escriba las trabas y repeticiones en vez de limpiarlas.
- Whisper alarga las palabras y se come los silencios: las pausas se miden en el audio (silencedetect), no en la transcripción.
- Whisper marca las dudas con puntos suspensivos («menos...»): no son final de frase.
- El audio de la Sony sale bajo (−36 dB de media) y con ruido de fondo a −71 dB: la limpieza por puerta
  espectral (`limpiar_voz.py`) lo baja a −89 dB sin tocar la voz.
- La música de Lyria salió de 59 s aunque se pidieran 45: se recorta y se funde al final.
- Las palabras grandes a la altura del pecho chocaban con el micro; van en y≈1560, en color claro con raya de acento.
- El acento (dorado) sobre la chaqueta oscura se lee mal: en textos grandes usar el color claro con contorno oscuro.
- MLDLM (octubre 2026, 5 anuncios de El Camino): la locutora lleva ropa roja o de colores; la palabra que suena va en
  píldora clara (`subRealce: "pildora"`), porque en color tierra no se leía sobre la chaqueta roja.
- Los brutos de 2–2,5 min en 4K tardan ~15 min en prepararse y otros ~20 en montarse. Una tarea en segundo plano dura como
  mucho 2 h: lanza la cola con `setsid nohup scripts/cola.sh … &` y espera por tramos.
- Nunca montes con Remotion mientras Whisper transcribe otro vídeo: se queda sin memoria (SIGKILL). Usa `scripts/cola.sh`.
- Una espera con `pgrep -f "texto"` se encuentra a sí misma (el texto va en su propia línea de órdenes): espera por PID.
- La mezcla salía más corta que el vídeo porque voz (192 kHz tras loudnorm), música (44,1 kHz) y efectos iban a
  frecuencias distintas: todo se pasa a 48 kHz. Comprueba siempre que vídeo y audio duran lo mismo.
- Si la mezcla sale corta y se une con -shortest, el vídeo también se recorta: no reutilices ese _maxima con SOLO_AUDIO.
- La música de MLDLM sale más fuerte que la de Claves: musica_db -14. El nivel final se ajusta solo a -14,5 LUFS.
- Los anuncios de más de 1 min no caben en 30 MB en H.264: la entrega va en HEVC con el bitrate justo (`_entrega.mp4`).
- Whisper repitió cuatro veces «sentirte feliz por ti» donde el guion dice «triste»: era una errata real de la locutora
  (cambiaba el sentido) y se cortó. Si Whisper insiste en una palabra distinta del guion, es que se dijo así.
- Erratas que el detector no ve y hay que buscar a mano: comentarios antes de empezar («Tú dime»), coletillas al final
  («Vale.») y reinicios separados por coma («tus probabilidades, las probabilidades»).
- Estilo Impacto (Claves 2 y 3, octubre 2026): ~5 B-rolls nuevos por anuncio y reutilizar los del catálogo cuando encajan
  (Claves 3 reutilizó 3 de Claves 2). Coste real: 240 créditos por clip nuevo (Seedream 5 Pro 100 + Kling 2.5 720p 140).
  Los vídeos de stock premium cuestan 600 y su CDN (`videocdn.cdnpk.net`) está bloqueado por defecto.
- Revisa la imagen antes de animarla, y el clip animado antes de usarlo: el momento bueno puede estar a mitad del clip
  (la tele se apaga entre los segundos 1,5 y 3): usa `desde` en `broll`.
- Si el rodaje empieza con charla («no grabes esto», «es cuando yo diga…»), Whisper puede perderse y dejar de transcribir
  el resto. `transcribir.py` ya va sin condition_on_previous_text; si aun así falta texto, transcribe desde donde empieza
  el anuncio y suma ese desfase a los tiempos.
- En subtítulos blancos, agrandar la palabra con `scale` la monta sobre la de al lado: se agranda con el tamaño de letra.
- En Claves 3 el plató baja las luces justo en «apagón cultural»: en esos momentos se deja la cara a la vista, sin B-roll.

