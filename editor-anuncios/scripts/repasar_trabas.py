# Segunda pasada de transcripción para destapar trabas y repeticiones que Whisper «limpia».
# Uso: python3 -I scripts/repasar_trabas.py proyectos/NOMBRE
#
# Whisper, al transcribir el audio entero, a veces escribe una repetición una sola vez y alarga la palabra para cubrir
# el hueco: en Claves 4 «más de 60… más de 60… más de 60.000» salió como «más(1,2 s) de(1 s) 60.000», y
# «y que ahora vas a poder viv… y que ahora vas a poder vivir» como «vas a(1,7 s) poder vivir».
# Este repaso busca esas señales (palabras demasiado largas para sus letras, o huecos con voz entre palabras),
# vuelve a transcribir solo ese trozo, de silencio a silencio, y si sale con más palabras lo sustituye.
# Después, detectar_erratas.py ya ve la repetición y propone cortarla.
#
# Trabaja sobre la transcripción sin cortar (transcripcion_sin_cortes.json si ya se cortó, si no transcripcion_bruto.json)
# y su audio (audio16k.wav). Guarda la original como transcripcion_whisper.json y apunta lo cambiado en repaso.json.
import difflib, json, os, re, shutil, subprocess, sys, unicodedata
import numpy as np, soundfile as sf, whisper

proy = sys.argv[1].rstrip('/')
tr = f'{proy}/transcripcion_sin_cortes.json' if os.path.exists(f'{proy}/transcripcion_sin_cortes.json') else f'{proy}/transcripcion_bruto.json'
if not os.path.exists(f'{proy}/transcripcion_whisper.json'):
    shutil.copy(tr, f'{proy}/transcripcion_whisper.json')
words = json.load(open(tr))['words']
audio, sr = sf.read(f'{proy}/audio16k.wav', dtype='float32')
if audio.ndim > 1:
    audio = audio.mean(1)
dur_audio = len(audio) / sr


def norm(t):
    t = unicodedata.normalize('NFD', t.lower())
    return re.sub(r'[^a-zñ0-9]', '', ''.join(c for c in t if unicodedata.category(c) != 'Mn'))


def letras(t):
    return len(re.sub(r'[^\wñáéíóúü]', '', t.lower()))


# silencios cortos (≥ 0,15 s): los trozos se cortan por ahí, nunca a mitad de palabra
log = subprocess.run(['ffmpeg', '-hide_banner', '-i', f'{proy}/audio16k.wav', '-af', 'silencedetect=n=-40dB:d=0.15', '-f', 'null', '-'],
                     capture_output=True, text=True).stderr
sil = list(zip([float(x) for x in re.findall(r'silence_start: ([\d.]+)', log)], [float(x) for x in re.findall(r'silence_end: ([\d.]+)', log)]))
medios = [(a + b) / 2 for a, b in sil]


def con_voz(a, b):
    """Fracción de [a, b] que no es silencio."""
    callado = sum(max(0, min(b, y) - max(a, x)) for x, y in sil)
    return 1 - callado / max(b - a, 1e-6)


# 1. señales: palabra demasiado larga para sus letras (descontando el silencio que tenga dentro) o hueco con voz
sospechas = []
for i, w in enumerate(words):
    d = (w['end'] - w['start']) * con_voz(w['start'], w['end'])
    if d > max(0.75, 0.12 * letras(w['text']) + 0.35):
        sospechas.append((w['start'], w['end'], f"«{w['text']}» dura {w['end'] - w['start']:.1f} s"))
    if i + 1 < len(words):
        a, b = w['end'], words[i + 1]['start']
        if b - a > 0.5 and con_voz(a, b) > 0.5:
            sospechas.append((a, b, f'hueco con voz de {b - a:.1f} s tras «{w["text"]}»'))


# 2. ventana de silencio a silencio alrededor de cada sospecha (unos 2 s a cada lado, como mucho 10 s en total)
def ventana(a, b):
    antes = [m for m in medios if m <= a - 1.5]
    despues = [m for m in medios if m >= b + 1.5]
    ini = max(antes[-1] if antes else 0.0, a - 4)
    fin = min(despues[0] if despues else dur_audio, b + 4)
    return ini, fin


ventanas = []
for a, b, motivo in sorted(sospechas):
    ini, fin = ventana(a, b)
    if ventanas and ini <= ventanas[-1][1]:
        ventanas[-1] = (ventanas[-1][0], max(ventanas[-1][1], fin), ventanas[-1][2] + [motivo])
    else:
        ventanas.append((ini, fin, [motivo]))

if not ventanas:
    print('Sin señales de repeticiones escondidas.')
    json.dump([], open(f'{proy}/repaso.json', 'w'))
    sys.exit()

# 3. transcribir cada trozo suelto, con y sin el prompt de muletillas, y quedarse con la versión más literal
modelo = whisper.load_model('medium')
PROMPT = 'Eh... bueno, pues, eh, mmm... es que, es que lo, lo que quiero decir, o sea...'
repaso = []
for ini, fin, motivos in ventanas:
    trozo = audio[int(ini * sr):int(fin * sr)]
    versiones = []
    for prompt in (None, PROMPT):
        r = modelo.transcribe(trozo, language='es', word_timestamps=True, initial_prompt=prompt, condition_on_previous_text=False)
        ws = [{'text': x['word'].strip(), 'start': round(ini + x['start'], 3), 'end': round(ini + x['end'], 3)}
              for s in r['segments'] for x in s['words'] if x['word'].strip()]
        # palabras apiladas en el mismo instante: alucinación, fuera
        ws = [x for x in ws if x['end'] - x['start'] >= 0.04]
        versiones.append(ws)
    nueva = max(versiones, key=len)   # a igualdad, la que va sin prompt
    dentro = [k for k, w in enumerate(words) if w['start'] >= ini - 0.05 and w['end'] <= fin + 0.05]
    vieja = [words[k] for k in dentro]
    cambio = {'inicio': round(ini, 2), 'fin': round(fin, 2), 'motivos': motivos,
              'antes': ' '.join(w['text'] for w in vieja), 'despues': ' '.join(w['text'] for w in nueva)}
    if dentro and len(nueva) > len(vieja):
        # solo se cambian los tramos donde el trozo tiene MÁS palabras (lo que Whisper se había comido);
        # el resto se queda como estaba, para no perder palabras bien transcritas la primera vez
        # en los bordes, fuera lo que ya está en la transcripción de fuera de la ventana (si no, sale «a a tu ritmo»)
        nueva = [w for w in nueva if w['start'] >= words[dentro[0]]['start'] - 0.05 and w['end'] <= words[dentro[-1]]['end'] + 0.05]
        sm = difflib.SequenceMatcher(None, [norm(w['text']) for w in vieja], [norm(w['text']) for w in nueva], autojunk=False)
        mezcla, añadido = [], False
        for op, i1, i2, j1, j2 in sm.get_opcodes():
            if op == 'equal' or (op in ('insert', 'replace') and j2 - j1 > i2 - i1):
                mezcla += nueva[j1:j2]          # tiempos del trozo: son coherentes entre sí
                añadido |= op != 'equal'
            else:
                mezcla += vieja[i1:i2]          # palabras que el trozo se comió: se quedan las de antes
        mezcla.sort(key=lambda w: w['start'])
        if añadido:
            words[dentro[0]:dentro[-1] + 1] = mezcla
            cambio['despues'] = ' '.join(w['text'] for w in mezcla)
            cambio['aplicado'] = True
    cambio.setdefault('aplicado', False)
    repaso.append(cambio)
    marca = 'CAMBIADO' if cambio['aplicado'] else 'igual   '
    print(f"{ini:6.2f}–{fin:6.2f} {marca} {'; '.join(motivos)}\n   antes:   {cambio['antes']}\n   después: {cambio['despues']}")

json.dump({'texto': ' '.join(w['text'] for w in words), 'words': words}, open(tr, 'w'), ensure_ascii=False, indent=1)
json.dump(repaso, open(f'{proy}/repaso.json', 'w'), ensure_ascii=False, indent=1)
print(f"{sum(c['aplicado'] for c in repaso)} de {len(repaso)} trozos cambiados en {tr}")
