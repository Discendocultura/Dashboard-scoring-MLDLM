# Prompt para arrancar el editor de anuncios en otra sesión de Claude

Pega esto como primer mensaje en una sesión nueva de **Claude Code** (web, escritorio o terminal; no en el chat normal de
claude.ai, que no puede ejecutar ffmpeg, Whisper ni Remotion).

---

Soy el fundador de Discendo (trabajo solo). Quiero que me edites anuncios verticales (Reels / Meta Ads) de una persona
hablando a cámara, con el editor que ya tengo montado. Háblame en español de España y sin jerga técnica.

## 1. Dónde está todo

- Repositorio de GitHub `Discendocultura/Dashboard-scoring-MLDLM`, rama `claude/charming-lovelace-vszxsc`
  (si la PR #1 ya está fusionada, usa la rama principal). Clónalo o trabaja sobre él.
- Carpeta `editor-anuncios/`: el editor (Remotion + Whisper + ffmpeg). **Lee entero `editor-anuncios/CLAUDE.md` antes de
  nada**: tiene las piezas, las reglas y todo lo aprendido.
- Skill `.claude/skills/editar-anuncio/SKILL.md`: el paso a paso de cada anuncio. Síguela siempre que te pida editar
  un anuncio, montar un reel o similar.
- En el repo están las plantillas de color, los estilos de edición, las músicas, los efectos de sonido y los B-rolls ya
  generados (con sus catálogos). Los vídeos en bruto y los montados NO (están en `.gitignore`): se descargan de Drive.

## 2. Preparar el entorno (hazlo tú y avísame solo si algo falla)

1. `cd editor-anuncios && npm i`
2. `pip3 install --break-system-packages openai-whisper noisereduce soundfile` (si `import whisper, noisereduce` falla).
3. ffmpeg instalado. Chromium: en los contenedores de Claude Code ya está en
   `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell` (en otro equipo, `export CHROME=/ruta`).
4. Red del entorno (Allowed domains): `openaipublic.azureedge.net` (modelo de Whisper), `drive.usercontent.google.com`,
   `drive.google.com` (descargar vídeos) y `pikaso.cdnpk.net` (descargas de Magnific). Opcional: `videocdn.cdnpk.net`
   (vídeos de stock). `docs.google.com` está bloqueado: los docs se leen con el conector de Google Drive.
   Comprueba con `curl -sS -o /dev/null -w "%{http_code}"` y, si alguno da 000 o 403, dime que lo añada en
   «Edit → Network access» del entorno.
5. Conectores que tienen que estar activos: **Google Drive** (buscar vídeos, guiones e instrucciones) y **Magnific**
   (imágenes, vídeos con IA, música y efectos; es de pago).
6. Los vídeos de Drive tienen que estar compartidos como «Cualquier persona con el enlace · Lector».

## 3. Cómo trabajamos (resumen de la skill)

1. **Paleta, siempre lo primero**, en cada anuncio (aunque parezca obvia): `claves` (burdeos #7B1E22, dorado #B8913A,
   crema #F7F3EC, Playfair + Inter), `discendo` (navy #062942, naranja #FFA500, Poppins) o `mldlm` (burdeos #860d0e,
   tierra #c49b79, crema #fbf6f1, Lato; guía en `plantillas/mldlm-guia.md`), o una nueva.
2. **Estilo de edición, siempre después**: Clásico, Impacto (B-rolls a pantalla completa), Nativo (TikTok), Documental,
   Noticiero, Explicador (pantalla dividida con pizarra) o Íntimo. Enséñame la tabla y recomiéndame 3.
3. Material de Drive → `scripts/preparar.sh` (copia vertical, voz sin ruido, transcripción y repaso de trabas).
   Vídeos de estudio en 4K: x_recorte 1272. Vídeos de móvil ya verticales: x_recorte 0.
4. **Cortes**: toda frase o trozo dicho dos veces por una traba se corta (se queda la última versión), además de
   muletillas, reinicios, pausas largas, tomas fallidas y charla de rodaje. Primero `repasar_trabas.py` (Whisper
   «limpia» repeticiones), luego `detectar_erratas.py`, enséñame la tabla, pregúntame y `aplicar_cortes.py`.
   Después vuelve a transcribir para comprobar que no queda ninguna repetición.
5. Subtítulos con el texto del guion (si no hay guion, la transcripción corregida a mano).
6. Propuesta de gancho (3 opciones), escenas sincronizadas con lo que se dice, B-rolls y música; fotogramas de prueba
   en una hoja antes de montar. Revisa siempre los fotogramas tú: que nada tape la cara ni se salga.
7. Montaje con `scripts/cola.sh` (de uno en uno), comprobación de volumen (−14/−15 LUFS) y duración, y me envías
   `salidas/NOMBRE_entrega.mp4` (cabe en el chat). Cambios solo de sonido: `SOLO_AUDIO=1 scripts/montar.sh`.
8. Al acabar: apunta lo aprendido en `CLAUDE.md`, commit y push a la rama.

## 4. Reglas que no se saltan

- El original no se toca nunca.
- **Nada de pago sin preguntarme** con el coste exacto (`simulate_cost`) y mis créditos (`account_balance`).
  Referencia: imagen Seedream 5 Pro 100 · vídeo Kling 2.5 720p 5 s 140 (≈240 por B-roll) · música Lyria 3 Pro 160 ·
  efecto de sonido 5–10 · vídeo de stock ~600. Antes de generar, mira si en `broll/catalogo.json` o
  `musica/catalogo.json` hay algo que sirva gratis.
- Pregúntame con opciones (tu recomendación la primera) en: paleta, estilo, cortes, gancho, música y gastos.
- Nunca montes con Remotion mientras Whisper transcribe (se queda sin memoria). Las tareas largas, en segundo plano
  con `setsid nohup … &`, y espera por el log, nunca con `pgrep -f`.
- Avísame de que la mezcla está medida pero no escuchada.

## 5. Cosas aprendidas que más importan

- Whisper con el audio entero escribe una sola vez las repeticiones y alarga la palabra: por eso existe el repaso.
- Si «Anuncio X 1» y «Anuncio X 2» pesan lo mismo, compara el md5: pueden ser el mismo archivo.
- Las instrucciones de un doc con imágenes: el conector solo da el texto; las imágenes se deducen por los nombres
  de la carpeta. Pregúntame si hay dudas sobre qué vídeo o qué imagen va con qué.
- Si la persona enseña objetos a cámara (p. ej. la cápsula y el minion del vídeo del cuerpo lúteo), no tapes esos
  tramos con escenas a pantalla completa.
- Magnific admite 8 vídeos a la vez; el resto da «parallel limit» sin cobrar: se relanzan a los 10 min.
  Kling rechaza a veces cuerpos humanos (filtro): se usa la imagen con movimiento hecho en Remotion.
- Los subtítulos blancos no se leen sobre fondos crema: las escenas con subtítulos van sobre burdeos.
- En MLDLM la locutora viste de colores: palabra que suena en píldora clara.

## 6. Dónde lo dejamos (octubre 2026)

- Entregados: AD 4 de La Resistencia (Clásico), 5 anuncios de MLDLM «El Camino» (Clásico), Claves 2 y 3 (Impacto),
  Claves 1 Documental, Claves 2 Nativo, Claves 3 Explicador, Claves 4 Noticiero, MLDLM «edad» (Impacto) y
  el vídeo del cuerpo lúteo (Impacto, sin música).
- Créditos de Magnific: quedaban unos 9.400 (compruébalo con `account_balance`).

Cuando termines de preparar el entorno, dime que está listo y pregúntame qué anuncio editamos.
