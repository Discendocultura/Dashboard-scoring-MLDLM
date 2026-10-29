# Aplica los cortes aprobados a la copia de trabajo: vídeo, voz limpia y transcripción a la vez.
# Uso: python3 scripts/aplicar_cortes.py proyectos/NOMBRE
# Lee proyectos/NOMBRE/cortes.json (lista aprobada, mismo formato que cortes_propuestos.json).
#
# - La primera vez guarda las versiones sin cortar (public/NOMBRE_sin_cortes.mp4, voz_limpia_sin_cortes.wav,
#   transcripcion_sin_cortes.json) y siempre corta a partir de ellas: se puede volver a lanzar con otra lista.
# - Cada borde se ajusta al punto más silencioso cercano y al fotograma, y el audio lleva un fundido de 10 ms
#   para que no haya chasquidos.
# - Escribe cortes_aplicados.json con los puntos de corte en la nueva línea de tiempo (para taparlos con un salto de zoom).
import json, math, os, shutil, subprocess, sys
import numpy as np, soundfile as sf

proy = sys.argv[1].rstrip('/'); nombre = os.path.basename(proy)
FPS = 25
video, video_sc = f'public/{nombre}.mp4', f'public/{nombre}_sin_cortes.mp4'
voz, voz_sc = f'{proy}/voz_limpia.wav', f'{proy}/voz_limpia_sin_cortes.wav'
tr, tr_sc = f'{proy}/transcripcion_bruto.json', f'{proy}/transcripcion_sin_cortes.json'
for actual, original in [(video, video_sc), (voz, voz_sc), (tr, tr_sc)]:
    if not os.path.exists(original):
        shutil.copy(actual, original)

x, sr = sf.read(voz_sc)
dur = len(x) / sr
hop = int(sr * 0.01)
rms = np.sqrt(np.convolve(x ** 2, np.ones(hop) / hop, mode='same'))[::hop]


def silencioso(t, antes, despues):
    a, b = max(0, int((t - antes) * 100)), min(len(rms) - 1, int((t + despues) * 100))
    return (a + int(np.argmin(rms[a:b + 1]))) / 100 if b > a else t


def al_fotograma(t):
    return round(t * FPS) / FPS


SILENCIOS = {'pausa', 'inicio', 'final'}   # recortes de silencio: no quitan palabras aunque Whisper las sitúe dentro
cortes, de_silencio = [], []
for c in sorted(json.load(open(f'{proy}/cortes.json')), key=lambda c: c['inicio']):
    silencio = c.get('tipo') in SILENCIOS
    a = al_fotograma(silencioso(c['inicio'], 0.08, 0.04))
    # si el corte quita palabras, 'fin' es el inicio de la palabra que se queda: el borde solo puede ir hacia atrás
    b = silencioso(c['fin'], 0.04, 0.08) if silencio else silencioso(c['fin'], 0.1, 0.0)
    b = al_fotograma(b) if silencio else math.floor(b * FPS) / FPS
    a, b = max(0.0, a), min(dur, b)
    if b - a < 1 / FPS:
        continue
    if cortes and a <= cortes[-1][1]:
        cortes[-1][1] = max(cortes[-1][1], b)
        de_silencio[-1] = de_silencio[-1] and silencio
    else:
        cortes.append([a, b])
        de_silencio.append(silencio)

tramos, t = [], 0.0
for a, b in cortes:
    if a > t:
        tramos.append((t, a))
    t = b
if dur - t > 1 / FPS:
    tramos.append((t, dur))

f = ''.join(f'[0:v]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS[v{i}];'
            f'[1:a]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS,'
            f'afade=t=in:d=0.01,afade=t=out:st={max(0, b - a - 0.01):.3f}:d=0.01[a{i}];' for i, (a, b) in enumerate(tramos))
k = len(tramos)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', video_sc, '-i', voz_sc, '-filter_complex',
                f + ''.join(f'[v{i}]' for i in range(k)) + f'concat=n={k}:v=1:a=0[v];' +
                ''.join(f'[a{i}]' for i in range(k)) + f'concat=n={k}:v=0:a=1[a]',
                '-map', '[v]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video,
                '-map', '[a]', '-c:a', 'pcm_f32le', voz], check=True)


def nuevo(t):
    return t - sum(min(b, t) - a for a, b in cortes if t > a)


palabras = []
for w in json.load(open(tr_sc))['words']:
    medio = (w['start'] + w['end']) / 2
    if any(a <= medio < b and not sil for (a, b), sil in zip(cortes, de_silencio)):
        continue
    ini, fin = nuevo(w['start']), nuevo(w['end'])
    palabras.append({**w, 'start': round(ini, 3), 'end': round(max(fin, ini + 0.08), 3)})
json.dump({'texto': ' '.join(w['text'] for w in palabras), 'words': palabras}, open(tr, 'w'), ensure_ascii=False, indent=1)

puntos = [round(nuevo(a), 3) for a, b in cortes if 0 < a and b < dur - 0.05]   # ni el inicio ni el final son saltos de imagen
quitado = sum(b - a for a, b in cortes)
json.dump({'cortes_originales': cortes, 'puntos_corte': puntos, 'segundos_quitados': round(quitado, 2),
           'duracion_nueva': round(dur - quitado, 2)}, open(f'{proy}/cortes_aplicados.json', 'w'), indent=1)
print(f'{len(cortes)} cortes, {quitado:.2f} s quitados; duración nueva {dur - quitado:.2f} s.')
print('Puntos de corte en la nueva línea de tiempo (tápalos con un salto de zoom):', puntos)
