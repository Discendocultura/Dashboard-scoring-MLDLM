# Anuncios · Claves de la Historia y la Actualidad

Plantilla para montar anuncios verticales (1080×1920) de busto parlante con el estilo de Claves:
subtítulos palabra a palabra, cartel del gancho, palabras grandes, zooms, animaciones en Remotion
sincronizadas con lo que se dice, voz sin ruido, música con ducking y efectos de sonido.

Basado en el manual «Reels con Claude Code», con Remotion como motor gráfico en lugar de subtítulos ASS.

## Estilo de marca (`estilos/claves.json`)

- Burdeos `#7B1E22` · Burdeos oscuro `#5C1418` · Dorado `#B8913A` · Crema `#F7F3EC`
- Títulos, gancho y palabras grandes: Playfair Display. Subtítulos: Inter 800 en mayúsculas
  (se lee mejor en el móvil); la palabra que suena va en dorado.

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
3. **Primera pasada:** enseña la transcripción comparada con el guion. Corrige `words.json`:
   las frases del guion llevan su texto exacto; lo improvisado se subtitula tal cual se dijo;
   los errores de Whisper se corrigen (p. ej. «historias y memorizar» → «Historia sin memorizar»).
4. Crea `proyectos/NOMBRE/props.json` copiando el de `ad4-la-resistencia` y cambia:
   `video`, `duracion`, `words`, `gancho`, `grandes`, `zooms`, `animaciones` y `sonido`.
5. Revisa fotogramas clave con `npx remotion still ... --frame=N` antes de dar nada por bueno.
6. `scripts/montar.sh proyectos/NOMBRE` → `salidas/NOMBRE_1080p.mp4` (<30 MB, se puede enviar por el chat)
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
3. Nada tapa la cara: animaciones en la franja superior (y < 380) o a la altura del pecho; el gancho arriba.
4. Revisar fotogramas antes de entregar.
5. Nada de pago sin ver el coste: con Magnific, `simulate_cost` antes de generar y pedir el sí.
   Referencia (oct 2026): música Google Lyria 3 Pro 45 s = 160 créditos; efecto de 2 s = 10; de 1 s = 5.
6. Volumen final en torno a −14/−15 LUFS.
7. Lo aprendido en cada anuncio se añade aquí.

## Lo aprendido

- Whisper con `initial_prompt` del guion alucinó el principio del AD 4: transcribir sin prompt y con el audio normalizado.
- El audio de la Sony sale bajo (−36 dB de media) y con ruido de fondo a −71 dB: la limpieza por puerta
  espectral (`limpiar_voz.py`) lo baja a −89 dB sin tocar la voz.
- La música de Lyria salió de 59 s aunque se pidieran 45: se recorta y se funde al final.
- Las palabras grandes a la altura del pecho chocaban con el micro; van en y≈1560, en crema con raya dorada.
- El dorado sobre la chaqueta oscura se lee mal: en textos grandes usar crema con contorno burdeos.
