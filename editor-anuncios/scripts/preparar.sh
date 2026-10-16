#!/usr/bin/env bash
# Uso: scripts/preparar.sh brutos/VIDEO.MP4 proyectos/NOMBRE [x_recorte] [duracion]
# Crea la copia de trabajo vertical 1080x1920 a 25 fps (sin tocar el original),
# limpia el ruido de la voz y transcribe con Whisper.
set -euo pipefail
BRUTO=$1; PROY=$2; X=${3:-1272}; DUR=${4:-}
NOMBRE=$(basename "$PROY"); mkdir -p "$PROY" public
T=${DUR:+-t $DUR}
ffmpeg -loglevel error -y $T -i "$BRUTO" -map 0:v:0 -an \
  -vf "crop=ih*9/16:ih:$X:0,scale=1080:1920:flags=lanczos,fps=25,format=yuv420p" \
  -c:v libx264 -preset medium -crf 16 -movflags +faststart "public/$NOMBRE.mp4"
ffmpeg -loglevel error -y -i "$BRUTO" -map 0:a:0 -ac 1 -ar 48000 -c:a pcm_f32le "$PROY/voz_original.wav"
# Perfil de ruido: último segundo y medio del bruto (normalmente silencio). Cámbialo si no lo es.
LEN=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$BRUTO")
python3 -I scripts/limpiar_voz.py "$PROY/voz_original.wav" "$PROY/voz_limpia.wav" $(python3 -c "print($LEN-1.6, $LEN-0.1)")
ffmpeg -loglevel error -y -i "$PROY/voz_limpia.wav" -af "highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11" -ac 1 -ar 16000 "$PROY/audio16k.wav"
python3 -I scripts/transcribir.py "$PROY/audio16k.wav" "$PROY/transcripcion_bruto.json"
# segunda pasada: destapa las repeticiones que Whisper escribe una sola vez (palabras demasiado largas)
python3 -I scripts/repasar_trabas.py "$PROY"
echo "Listo: public/$NOMBRE.mp4 y $PROY/transcripcion_bruto.json"
