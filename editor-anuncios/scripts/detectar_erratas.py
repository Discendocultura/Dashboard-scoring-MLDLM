# Busca erratas de locución en la transcripción y propone cortes.
# Uso: python3 scripts/detectar_erratas.py proyectos/NOMBRE
# Lee transcripcion_bruto.json, guion.txt y voz_limpia.wav; escribe cortes_propuestos.json.
#
# Detecta:
#   toma         frase o párrafo repetido para hacerlo mejor (se queda la última toma), según el guion
#   repeticion   palabras o trozos de frase dichos dos veces seguidas («de de», «por eso hemos por eso hemos»)
#   reinicio     frase empezada, cortada y vuelta a empezar («por eso hem… por eso hemos creado»)
#   trabada      palabra a medias antes de la buena («pens… pensamiento»)
#   muletilla    «eh», «mmm», «em»…
#   pausa        silencio largo a mitad de frase (se acorta, no se elimina). Se mide en el audio, porque
#                Whisper alarga las palabras y se come los silencios.
#   inicio/final silencio antes de la primera palabra o después de la última (se deja un margen)
# Cada propuesta lleva una confianza: «alta» si la repetición no está en el guion, «revisar» si el guion
# también repite esas palabras o si es una pausa. Nada se corta sin revisar la lista.
import json, os, re, subprocess, sys, unicodedata

proy = sys.argv[1]
words = json.load(open(f'{proy}/transcripcion_bruto.json'))['words']
try:
    guion = open(f'{proy}/guion.txt').read()
except FileNotFoundError:
    guion = ''

MULETILLAS = {'eh', 'ehh', 'ehm', 'em', 'emm', 'mm', 'mmm', 'hmm', 'ah', 'uh', 'um'}
PAUSA_MAX, PAUSA_DEJAR = 0.8, 0.3   # pausas a mitad de frase de más de 0,8 s se dejan en 0,3 s


def norm(t):
    t = unicodedata.normalize('NFD', t.lower())
    return re.sub(r'[^a-zñ0-9]', '', ''.join(c for c in t if unicodedata.category(c) != 'Mn'))


n = [norm(w['text']) for w in words]
g = [norm(x) for x in guion.split()]
# Final de frase: punto, interrogación o exclamación. Los puntos suspensivos son una duda, no un final.
fin_frase = [bool(re.search(r'[.?!]$', w['text'])) and not re.search(r'(\.\.\.|…)$', w['text']) for w in words]


def veces(seq, ngram):
    k = len(ngram)
    return sum(1 for i in range(len(seq) - k + 1) if seq[i:i + k] == ngram)


def contexto(i, j):
    return ' '.join(w['text'] for w in words[max(0, i - 3):min(len(words), j + 4)])


cortes, usado = [], set()


def proponer(i, j, tipo, confianza, inicio=None, fin=None):
    """Quita las palabras i..j-1 (o el tramo [inicio, fin] si se da)."""
    if any(k in usado for k in range(i, j)):
        return
    usado.update(range(i, j))
    cortes.append({'inicio': round(inicio if inicio is not None else words[i]['start'], 3),
                   'fin': round(fin if fin is not None else words[j]['start'], 3),
                   'tipo': tipo, 'confianza': confianza,
                   'quitado': ' '.join(w['text'] for w in words[i:j]) if j > i else '(silencio)',
                   'contexto': contexto(i, j)})


# tomas repetidas: se sigue la posición de cada trío de palabras en el guion; si la locutora vuelve atrás
# (repite una frase o un párrafo para hacerlo mejor), se quita el intento anterior y se queda la última toma.
def posiciones():
    sitios = {}
    for j in range(len(g) - 2):
        sitios.setdefault(tuple(g[j:j + 3]), []).append(j)
    pos, ultima = [None] * len(n), -1
    for i in range(len(n) - 2):
        cand = sitios.get(tuple(n[i:i + 3]))
        if cand:
            pos[i] = min(cand, key=lambda j: (abs(j - (ultima + 1)), j))
            ultima = pos[i]
    return pos


if g:
    pos, maximo, desde = posiciones(), -1, 0
    for i, p in enumerate(pos):
        if p is None:
            continue
        if p < maximo - 3:   # ha vuelto atrás al menos 4 palabras del guion: nueva toma
            k = next((k for k in range(desde, i) if pos[k] is not None and pos[k] >= p), None)
            if k is not None:
                proponer(k, i, 'toma', 'alta')
            maximo, desde = p, i
        else:
            maximo = max(maximo, p)

for i in range(len(words)):
    if not n[i]:
        continue
    # muletillas
    if n[i] in MULETILLAS:
        proponer(i, i + 1, 'muletilla', 'alta', fin=words[i + 1]['start'] if i + 1 < len(words) else words[i]['end'])
        continue
    # repetición inmediata de 1 a 6 palabras (la más larga primero); se quita la primera vez
    for k in range(6, 0, -1):
        a, b = n[i:i + k], n[i + k:i + 2 * k]
        if len(b) == k and a == b and all(a):
            en_guion = veces(g, a + a) > 0
            proponer(i, i + k, 'repeticion', 'revisar' if en_guion else 'alta')
            break
    else:
        # palabra a medias: es el principio de la siguiente
        if i + 1 < len(words) and 1 <= len(n[i]) < len(n[i + 1]) and n[i + 1].startswith(n[i]):
            proponer(i, i + 1, 'trabada', 'alta')
            continue
        # reinicio: las 2 palabras siguientes vuelven a aparecer pronto, sin fin de frase en medio,
        # y en la transcripción salen más veces que en el guion
        for j in range(i + 2, min(i + 9, len(words) - 1)):
            if any(fin_frase[i:j]):
                break
            par = n[i:i + 2]
            if n[j:j + 2] == par and all(par) and veces(n, par) > veces(g, par):
                proponer(i, j, 'reinicio', 'alta' if veces(g, par) == 0 or j - i <= 4 else 'revisar')
                break

# pausas largas: silencios reales de la voz (silencedetect), no huecos de la transcripción
def silencios(wav, umbral_db=-45, minimo=0.4):
    log = subprocess.run(['ffmpeg', '-hide_banner', '-i', wav, '-af', f'silencedetect=n={umbral_db}dB:d={minimo}', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    ini = [float(m) for m in re.findall(r'silence_start: ([\d.]+)', log)]
    fin = [float(m) for m in re.findall(r'silence_end: ([\d.]+)', log)]
    return list(zip(ini, fin + [None] * (len(ini) - len(fin))))


def recorte_pausa(a, b, dejar, tipo, i):
    cortes.append({'inicio': round(a, 3), 'fin': round(b, 3), 'tipo': tipo, 'confianza': 'alta' if tipo != 'pausa' else 'revisar',
                   'quitado': f'(silencio de {b - a:.1f} s)', 'contexto': contexto(i, i)})


wav = f'{proy}/voz_limpia.wav'
if os.path.exists(wav) and words:
    primera, ultima = words[0]['start'], words[-1]['end']
    for a, b in silencios(wav):
        if b is None:                                   # silencio hasta el final del audio
            b = a + 999
        if a < 0.05 and b - a > 0.4:                     # antes de empezar a hablar: dejar 0,15 s
            recorte_pausa(a, b - 0.15, 0.15, 'inicio', 0)
        elif a >= ultima - 0.05:                         # después de la última palabra: dejar 0,4 s
            if b - a > 0.6:
                recorte_pausa(a + 0.4, b, 0.4, 'final', len(words) - 1)
        elif b - a > PAUSA_MAX:
            antes = max(k for k in range(len(words)) if words[k]['start'] < a)
            if not fin_frase[antes]:
                medio = (a + b) / 2
                recorte_pausa(medio - (b - a - PAUSA_DEJAR) / 2, medio + (b - a - PAUSA_DEJAR) / 2, PAUSA_DEJAR, 'pausa', antes)

cortes.sort(key=lambda c: c['inicio'])
json.dump(cortes, open(f'{proy}/cortes_propuestos.json', 'w'), ensure_ascii=False, indent=1)
if not cortes:
    print('No se han encontrado erratas.')
for c in cortes:
    print(f"{c['inicio']:7.2f}–{c['fin']:6.2f}  {c['tipo']:<10} {c['confianza']:<8} quitar «{c['quitado']}»   …{c['contexto']}…")
