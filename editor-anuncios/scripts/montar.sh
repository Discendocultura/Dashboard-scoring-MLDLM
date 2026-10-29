#!/usr/bin/env bash
# Uso: scripts/montar.sh proyectos/NOMBRE
# Renderiza con Remotion, mezcla el audio y saca:
#   NOMBRE_maxima.mp4  calidad máxima
#   NOMBRE_1080p.mp4   H.264 a 5 Mbps (para subir a Meta)
#   NOMBRE_entrega.mp4 HEVC con el tamaño justo para caber en 28,5 MB (se puede enviar por el chat)
# No lances dos montajes a la vez ni mientras Whisper transcribe: Remotion se queda sin memoria.
set -euo pipefail
PROY=$1; NOMBRE=$(basename "$PROY")
CHROME=${CHROME:-/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell}
# SOLO_AUDIO=1 rehace solo el sonido y reutiliza la imagen de salidas/NOMBRE_maxima.mp4 (cambios de música o efectos)
if [ "${SOLO_AUDIO:-0}" = "1" ]; then
  mv "salidas/${NOMBRE}_maxima.mp4" "salidas/${NOMBRE}_video.mp4"
else
  npx remotion render src/index.jsx Anuncio "salidas/${NOMBRE}_video.mp4" --props="$PROY/props.json" \
    --browser-executable="$CHROME" --codec=h264 --crf=18 --concurrency=${CONCURRENCIA:-3} --offthreadvideo-cache-size-in-bytes=1073741824 --muted
fi
python3 scripts/mezclar.py "$PROY"
ffmpeg -loglevel error -y -i "salidas/${NOMBRE}_video.mp4" -i "$PROY/mezcla.wav" -map 0:v:0 -map 1:a \
  -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "salidas/${NOMBRE}_maxima.mp4"
cd salidas
ffmpeg -loglevel error -y -i "${NOMBRE}_maxima.mp4" -c:v libx264 -preset slow -b:v 5000k -pass 1 -an -f mp4 /dev/null
ffmpeg -loglevel error -y -i "${NOMBRE}_maxima.mp4" -c:v libx264 -preset slow -b:v 5000k -maxrate 7000k -bufsize 10000k -pass 2 \
  -c:a aac -b:a 192k -movflags +faststart "${NOMBRE}_1080p.mp4"
rm -f ffmpeg2pass*
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${NOMBRE}_maxima.mp4")
BR=$(python3 -c "print(min(6000, int((28.5*8*1024*1024/$D - 128000)/1000)))")
ffmpeg -loglevel error -y -i "${NOMBRE}_maxima.mp4" -c:v libx265 -preset fast -b:v ${BR}k -x265-params pass=1:log-level=error -an -f mp4 /dev/null
ffmpeg -loglevel error -y -i "${NOMBRE}_maxima.mp4" -c:v libx265 -preset fast -b:v ${BR}k -x265-params pass=2:log-level=error -tag:v hvc1 \
  -c:a aac -b:a 128k -movflags +faststart "${NOMBRE}_entrega.mp4"
rm -f x265_2pass.log* "${NOMBRE}_video.mp4"
echo "Listo: salidas/${NOMBRE}_maxima.mp4, ${NOMBRE}_1080p.mp4 y ${NOMBRE}_entrega.mp4"
