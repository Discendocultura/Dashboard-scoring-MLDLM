#!/usr/bin/env bash
# Uso: scripts/muestra.sh PLANTILLA → out/muestra_PLANTILLA.png (gancho + palabra grande sobre fondo neutro)
set -euo pipefail
P=$1; CHROME=${CHROME:-/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell}
mkdir -p out
for f in 40 100; do
  npx remotion still src/index.jsx Anuncio "out/m_${P}_$f.png" --frame=$f --props="{\"plantilla\":\"$P\"}" --browser-executable="$CHROME" >/dev/null
done
ffmpeg -loglevel error -y -i "out/m_${P}_40.png" -i "out/m_${P}_100.png" -filter_complex "[0]scale=540:-1[a];[1]scale=540:-1[b];[a][b]hstack" "out/muestra_$P.png"
rm -f out/m_${P}_*.png
echo "out/muestra_$P.png"
