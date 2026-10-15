---
name: editar-anuncio
description: Edita un anuncio vertical (Reels, Meta Ads) de busto parlante a partir de un vídeo en bruto y su guion, con el editor de editor-anuncios/ (Remotion + Whisper + ffmpeg) - cortes de trabas y erratas, subtítulos palabra a palabra, gancho, palabras grandes, zooms, animaciones sincronizadas con lo que se dice, limpieza de ruido, música y efectos de sonido. Lo primero, pregunta qué paleta de colores (plantilla de marca) usar o crea una nueva y si reutilizar una música del catálogo o generar otra. Úsala cuando pidan "editar un anuncio", "montar un reel", "edita el AD 2", "haz un anuncio con este vídeo" o similar.
---

# Editar un anuncio

Trabajas dentro de `editor-anuncios/` (lee su `CLAUDE.md` antes de empezar: tiene las piezas de `props.json`,
las reglas y lo aprendido en anuncios anteriores). Habla con el usuario en español de España, sin jerga técnica.

Reglas que no se saltan nunca:
- El original no se toca: se trabaja sobre copias en `brutos/`, `public/` y `proyectos/NOMBRE/`.
- Nada de pago sin permiso: antes de generar con Magnific, `simulate_cost` y pregunta con el coste exacto
  y los créditos disponibles (`account_balance`).
- Revisa fotogramas con `Read` antes de enseñar o entregar nada: que nada tape la cara ni se salga.
- Pregunta con `AskUserQuestion` en los puntos marcados con **PREGUNTA**; pon tu recomendación la primera.

## 1. Paleta de colores (lo primero, siempre)

Antes de cualquier otra cosa (comprobar el entorno, descargar el vídeo, transcribir…) pregunta qué paleta usar.
Pregúntalo **en cada anuncio**, aunque la marca parezca obvia por el guion o se haya usado otra en el anuncio anterior.
Si el usuario ya la nombró en su mensaje, ponla la primera como recomendada, pero confírmala igualmente.
No sigas con el resto de pasos hasta tener la respuesta.

Lee las plantillas de `editor-anuncios/plantillas/*.json` (campos `nombre`, `_que_es`, colores y fuentes) y pregunta ya,
sin esperar a nada más:

**PREGUNTA**: «¿Qué paleta de colores uso para este anuncio?» — una opción por plantilla existente, con sus colores
y tipografía en la descripción (recomienda la de la marca del guion si se sabe), y una opción «Crear una paleta nueva».
Si hay más de 3 plantillas, pon las 3 más probables y la de crear nueva; el usuario puede escribir otra en «Otro».

Cuando elija, genera la muestra de esa paleta (`scripts/muestra.sh PLANTILLA`, antes `npm i` en `editor-anuncios/` si falta
`node_modules`) y envíala con `SendUserFile` para que la confirme.

Si la plantilla tiene guía (`plantillas/NOMBRE-guia.md`), léela: las animaciones nuevas deben seguir su narrativa visual
y sus colores secundarios (`e.extra`).

Si elige crear una nueva:
1. **PREGUNTA** nombre de la marca, colores (principal, oscuro, acento y claro, en hexadecimal) y tipografía de títulos y de subtítulos.
   Si la marca está en el Dashboard de datos (`marca_y_narrativa`), propón sus colores.
2. Crea `plantillas/NOMBRE.json` copiando `claves.json` y cambiando `nombre`, `_que_es`, colores y fuentes
   (colores secundarios en `extra`). Si te pasa una guía de estilo, guárdala tal cual en `plantillas/NOMBRE-guia.md`.
3. Regístrala en `plantillas/index.js`. Instala la fuente con `npm i @fontsource/FUENTE` (nombre en minúsculas y con guiones)
   e impórtala en `src/fuentes.js` (pesos 700, 800 y 800-italic si existen).
4. Genera su muestra, enséñala y ajusta hasta que le guste.

## 2. Entorno

1. Si falta `editor-anuncios/node_modules`, ejecuta `npm i` dentro de `editor-anuncios/`. Si `python3 -c "import whisper, noisereduce"`
   falla, ejecuta `pip3 install --break-system-packages openai-whisper noisereduce soundfile`.
2. Comprueba la red con `curl -sS -o /dev/null -w "%{http_code}"` contra `https://openaipublic.azureedge.net`,
   `https://drive.usercontent.google.com` y `https://pikaso.cdnpk.net`. Un `000` o un 403 significa que está bloqueado:
   dile al usuario que añada esos dominios (y `drive.google.com`) en **Allowed domains** del entorno
   (menú del entorno en la barra de título → Edit → Network access) y espera a que lo confirme.

## 3. Material

**PREGUNTA** (si no lo ha dicho ya): dónde está el vídeo y cuál es el guion (texto pegado, o doc y número de AD).
- Drive: busca el archivo con el conector de Google Drive. El vídeo se descarga con
  `curl -L -o brutos/NOMBRE.MP4 "https://drive.usercontent.google.com/download?id=ID&export=download&confirm=t"`;
  si devuelve una página HTML de inicio de sesión, pide que lo compartan como «Cualquier persona con el enlace · Lector».
- Guarda el guion en `proyectos/NOMBRE/guion.txt`. Si el guion del doc está cortado, pregunta cómo acaba.
- `ffprobe` el bruto: resolución, fps, HDR (`color_transfer` arib-std-b67/smpte2084 = HDR) y audio.

## 4. Copia de trabajo, cortes y transcripción

1. Extrae un fotograma del bruto y elige `x_recorte` para centrar la cara en el recorte 9:16 (1272 para el set actual en 4K).
2. `scripts/preparar.sh brutos/NOMBRE.MP4 proyectos/NOMBRE X [duracion]` (la duración corta los silencios muertos del final).
   Comprueba un fotograma de `public/NOMBRE.mp4`.
3. **Cortes de erratas** (trabas, palabras repetidas, frases reempezadas, muletillas, pausas largas a mitad de frase
   y silencios al principio y al final):
   - `python3 -I scripts/detectar_erratas.py proyectos/NOMBRE` → `cortes_propuestos.json`.
   - Revisa cada propuesta escuchando el contexto con la transcripción y el guion: descarta las repeticiones que son
     intencionadas (énfasis, anáforas del guion) y añade a mano cualquier errata que se le haya escapado
     (Whisper a veces «limpia» una traba; si el texto no cuadra con el guion en un punto, mira ahí).
   - Enseña una tabla: segundo, tipo, qué se quita y el contexto.
   **PREGUNTA**: «¿Aplico estos cortes?» — opciones: todos los propuestos (recomendado), solo los de confianza alta,
   elegir uno a uno, ninguno.
   - Guarda la lista aprobada en `proyectos/NOMBRE/cortes.json` y ejecuta `python3 -I scripts/aplicar_cortes.py proyectos/NOMBRE`.
     Corta vídeo, voz y transcripción a la vez (las versiones sin cortar quedan como `*_sin_cortes`; se puede relanzar con otra lista).
   - Verifica: duración de vídeo y voz iguales, y transcribe de nuevo la voz cortada para comprobar que la errata ya no está.
   - Cada punto de `cortes_aplicados.json → puntos_corte` es un salto de imagen: tápalo con un zoom
     `{"tipo": "salto", "start": punto, "dur": 1.5}` (alterna con tramos sin zoom para que no quede siempre ampliado).
4. Compara la transcripción (ya cortada) con el guion y enseña una tabla con lo que cambia (frases improvisadas, errores de Whisper).
   Crea `proyectos/NOMBRE/words.json`: frases del guion con su texto exacto, lo improvisado tal cual se dijo,
   errores de Whisper corregidos, cifras unidas (`60` + `.000` → `60.000`) y sin muletillas.

## 5. Propuesta de montaje

**PREGUNTA**: el gancho. Propón 3 opciones a partir del guion (recomendada la primera).

Propón en una tabla, con segundos, lo que vas a poner y por qué encaja con lo que se dice en ese momento:
2–4 palabras grandes, 2–4 zooms lentos y 2–3 saltos, y las animaciones (las de `src/Animaciones.jsx`, o nuevas si el guion
lo pide: escríbelas en ese archivo con los colores de la plantilla `e.primario/e.oscuro/e.acento/e.claro`, nunca colores fijos).
Escribe `proyectos/NOMBRE/props.json` (con `"plantilla"`), renderiza 4–5 fotogramas clave con `npx remotion still`,
revísalos y envíalos en una sola hoja (`ffmpeg ... hstack`).

## 6. Música

Lee `musica/catalogo.json`.

**PREGUNTA**: «¿Qué música le ponemos?» con estas opciones:
- Una opción por cada música del catálogo que encaje con la marca y el tono (título, estilo y en qué anuncios se usó).
- «Generar una nueva: …» con un estilo concreto que propongas tú según el guion (p. ej. «documental tenso que se abre a épico»,
  «lo-fi cálido y cercano»), con su coste (`simulate_cost` de `audio_music_generate`, Google Lyria 3 Pro, ~45 s; suele ser 160 créditos).
- «Sin música».

Si elige generar: escribe un prompt en inglés que siga la estructura del guion por segundos (como el del catálogo), genera,
espera con `creations_wait`, descarga el WAV con `creations_deliver` (perfil `wav_48k`) y conviértelo a MP3 en
`musica/NOMBRE.mp3`. Añádelo a `musica/catalogo.json` (archivo, título, marca, estilo, duración, puntos de corte, coste, prompt, usada_en).
Si reutiliza, añade el proyecto a su `usada_en`.

**PREGUNTA**: efectos de sonido. Reutilizar los de `sonidos/catalogo.json` (gratis) o generar alguno nuevo (con su coste).
Colócalos en `props.json → sonido.efectos` en el segundo de cada animación (el golpe del sello llega a los 0,24 s: adelántalo).

## 7. Montaje y entrega

1. `scripts/montar.sh proyectos/NOMBRE` (unos 5 minutos).
2. Comprueba el volumen (`ebur128`, objetivo −14/−15 LUFS) y revisa 4 fotogramas del resultado.
3. Envía `salidas/NOMBRE_1080p.mp4` con `SendUserFile` (pesa menos de 30 MB). Avisa de que no has escuchado la mezcla, solo la has medido.
4. Aplica los cambios que pida. Los de sonido solo necesitan `python3 scripts/mezclar.py` y volver a unir audio y vídeo,
   sin volver a renderizar.

## 8. Guardar

1. Añade a `editor-anuncios/CLAUDE.md` → «Lo aprendido» lo nuevo de este anuncio.
2. Haz commit de `proyectos/NOMBRE/` (sin WAV), las plantillas, músicas, efectos y animaciones nuevas, y súbelo a la rama de trabajo.
   Los vídeos no se suben (están en `.gitignore`).
