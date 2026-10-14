#!/usr/bin/env bash
# Uso: scripts/montar.sh proyectos/NOMBRE
# Renderiza con Remotion, mezcla el audio y saca la versión para Meta (1080p, <30 MB).
set -euo pipefail
PROY=$1; NOMBRE=$(basename "$PROY")
CHROME=${CHROME:-/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell}
npx remotion render src/index.jsx Anuncio "salidas/${NOMBRE}_video.mp4" --props="$PROY/props.json" \
  --browser-executable="$CHROME" --codec=h264 --crf=18 --concurrency=4 --muted
python3 scripts/mezclar.py "$PROY"
ffmpeg -loglevel error -y -i "salidas/${NOMBRE}_video.mp4" -i "$PROY/mezcla.wav" -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "salidas/${NOMBRE}_maxima.mp4"
cd salidas
ffmpeg -loglevel error -y -i "${NOMBRE}_maxima.mp4" -c:v libx264 -preset slow -b:v 5000k -pass 1 -an -f mp4 /dev/null
ffmpeg -loglevel error -y -i "${NOMBRE}_maxima.mp4" -c:v libx264 -preset slow -b:v 5000k -maxrate 7000k -bufsize 10000k -pass 2 \
  -c:a aac -b:a 192k -movflags +faststart "${NOMBRE}_1080p.mp4"
rm -f ffmpeg2pass*
echo "Listo: salidas/${NOMBRE}_1080p.mp4"
