#!/usr/bin/env bash
# Monta varios proyectos de uno en uno (Remotion se queda sin memoria si van a la vez).
# Uso: scripts/cola.sh proyectos/A proyectos/B ...   (SOLO_AUDIO=1 delante de un nombre: "audio:proyectos/A")
for P in "$@"; do
  if [[ "$P" == audio:* ]]; then P=${P#audio:}; SOLO=1; else SOLO=0; fi
  echo "== $(date +%H:%M) $P"
  SOLO_AUDIO=$SOLO scripts/montar.sh "$P" > "$P.montaje.log" 2>&1 && echo "$(date +%H:%M) $P montado" || echo "$(date +%H:%M) $P FALLO"
done
