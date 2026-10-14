# Mezcla final: voz limpia + música con ducking (baja sola cuando hablas) + efectos de sonido.
# Uso: python3 scripts/mezclar.py proyectos/NOMBRE   (lee props.json → sonido)
import json, subprocess, sys
proy = sys.argv[1]
p = json.load(open(f'{proy}/props.json')); s = p['sonido']; dur = p['duracion']
ff = ['ffmpeg', '-loglevel', 'error', '-y', '-i', f'{proy}/voz_limpia.wav', '-i', s['musica']]
for e in s['efectos']: ff += ['-i', e['archivo']]
fx = ''.join(f"[{i + 2}:a]volume={e['db']}dB,adelay={int(e['en'] * 1000)}|{int(e['en'] * 1000)}[e{i}];" for i, e in enumerate(s['efectos']))
n = len(s['efectos'])
grafo = (f"[0:a]atrim=0:{dur},highpass=f=80,acompressor=threshold=-20dB:ratio=2.5:attack=10:release=150,"
         f"loudnorm=I=-14:TP=-1.5:LRA=9,afade=t=out:st={dur - 0.4}:d=0.4,asplit=2[voz][sc];"
         f"[1:a]atrim=0:{dur},volume={s['musica_db']}dB,afade=t=in:d=0.3,afade=t=out:st={dur - 1.5}:d=1.5[mus];"
         f"[mus][sc]sidechaincompress=threshold=0.03:ratio=4:attack=40:release=500[musd];" + fx +
         ''.join(f'[e{i}]' for i in range(n)) + f"amix=inputs={n}:normalize=0[sfx];"
         f"[voz][musd][sfx]amix=inputs=3:normalize=0:duration=first,volume=3.5dB,alimiter=limit=0.89:level=false[out]")
subprocess.run(ff + ['-filter_complex', grafo, '-map', '[out]', '-ar', '48000', '-ac', '2', f'{proy}/mezcla.wav'], check=True)
print(f'Listo: {proy}/mezcla.wav')
