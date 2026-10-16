# Pone los efectos de sonido del catálogo en props.json según las animaciones: whoosh al entrar cada tarjeta,
# sello en el «GRATIS», tictac en contadores y clic en el botón de la llamada a la acción.
# Uso: python3 scripts/efectos_auto.py proyectos/NOMBRE musica/ARCHIVO.mp3
import json, sys
proy, musica = sys.argv[1], sys.argv[2]
p = json.load(open(f'{proy}/props.json'))
ef = []
for a in p.get('animaciones', []):
    s = a['start']
    if a['tipo'] == 'apagon':
        ef.append({'archivo': 'sonidos/apagon.mp3', 'en': round(s - 0.1, 2), 'db': -10})
        continue
    ef.append({'archivo': 'sonidos/whoosh.mp3', 'en': round(max(0, s - 0.1), 2), 'db': -16})
    for fase in a.get('fases', []):
        if 'sello' in fase:
            ef.append({'archivo': 'sonidos/sello.mp3', 'en': round(s + fase['sello'] - 0.24, 2), 'db': -9})
    if a['tipo'] == 'cartel' and a.get('sello'):
        ef.append({'archivo': 'sonidos/sello.mp3', 'en': round(s + a.get('selloEn', 1.2) - 0.24, 2), 'db': -9})
    if a['tipo'] in ('contador', 'cifra'):
        ef.append({'archivo': 'sonidos/contador.mp3', 'en': round(s, 2), 'db': -14})
    if a['tipo'] in ('cta', 'boton') and a.get('toque') is not None:
        ef.append({'archivo': 'sonidos/click.mp3', 'en': round(s + a['toque'], 2), 'db': -10})
cat = {m['archivo']: m for m in json.load(open('musica/catalogo.json'))}
p['sonido'] = {'musica': musica, 'musica_db': cat.get(musica, {}).get('musica_db', -9), 'efectos': sorted(ef, key=lambda x: x['en'])}
json.dump(p, open(f'{proy}/props.json', 'w'), ensure_ascii=False, indent=1)
print(f"{len(ef)} efectos en {proy}")
