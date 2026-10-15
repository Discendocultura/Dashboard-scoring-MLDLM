# Mezcla final: voz limpia + música con ducking (baja sola cuando hablas) + efectos de sonido.
# Uso: python3 scripts/mezclar.py proyectos/NOMBRE   (lee props.json → sonido)
import json, os, re, subprocess, sys
proy = sys.argv[1]
p = json.load(open(f'{proy}/props.json')); s = p['sonido']; dur = p['duracion']
desde = s.get('musica_desde', 0)   # segundo de la música en el que empieza (para que acabe con su final natural)
ff = ['ffmpeg', '-loglevel', 'error', '-y', '-i', f'{proy}/voz_limpia.wav', '-i', s['musica']]
for e in s['efectos']: ff += ['-i', e['archivo']]
# todo a 48 kHz: con frecuencias distintas (voz 192k tras loudnorm, música 44,1k) la mezcla salía más corta
fx = ''.join(f"[{i + 2}:a]aresample=48000,volume={e['db']}dB,adelay={int(e['en'] * 1000)}|{int(e['en'] * 1000)}[e{i}];" for i, e in enumerate(s['efectos']))
n = len(s['efectos'])
grafo = (f"[0:a]atrim=0:{dur},highpass=f=80,acompressor=threshold=-20dB:ratio=2.5:attack=10:release=150,"
         f"loudnorm=I=-14:TP=-1.5:LRA=9,aresample=48000,afade=t=out:st={dur - 0.4}:d=0.4,asplit=2[voz][sc];"
         f"[1:a]atrim={desde}:{desde + dur},asetpts=PTS-STARTPTS,aresample=48000,volume={s['musica_db']}dB,afade=t=in:d=0.3,afade=t=out:st={dur - 1.5}:d=1.5[mus];"
         f"[mus][sc]sidechaincompress=threshold=0.03:ratio=4:attack=40:release=500[musd];" + fx +
         ''.join(f'[e{i}]' for i in range(n)) + f"amix=inputs={n}:normalize=0[sfx];"
         f"[musd]apad[musp];[sfx]apad[sfxp];[voz][musp][sfxp]amix=inputs=3:normalize=0:duration=first,atrim=0:{dur}[out]")
subprocess.run(ff + ['-filter_complex', grafo, '-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_f32le', f'{proy}/mezcla_sin_nivelar.wav'], check=True)

# Nivel final: se mide la sonoridad de la mezcla y se ajusta a -14,5 LUFS con un limitador de picos
OBJETIVO = -14.5
log = subprocess.run(['ffmpeg', '-hide_banner', '-i', f'{proy}/mezcla_sin_nivelar.wav', '-af', 'ebur128', '-f', 'null', '-'],
                     capture_output=True, text=True).stderr
medido = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', log)[-1])
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', f'{proy}/mezcla_sin_nivelar.wav', '-af',
                f'volume={OBJETIVO - medido:.2f}dB,alimiter=limit=0.89:level=false', '-ar', '48000', f'{proy}/mezcla.wav'], check=True)
os.remove(f'{proy}/mezcla_sin_nivelar.wav')
print(f'Listo: {proy}/mezcla.wav (de {medido:.1f} a {OBJETIVO} LUFS)')
