# Transcribe la voz con Whisper (modelo medium, español) y guarda las palabras con sus tiempos.
# El prompt corto con muletillas y repeticiones hace que Whisper las escriba en vez de «limpiarlas»,
# para poder detectar trabas y cortarlas después.
import sys, json, whisper
audio, salida = sys.argv[1:3]
PROMPT = 'Eh... bueno, pues, eh, mmm... es que, es que lo, lo que quiero decir, o sea...'
r = whisper.load_model('medium').transcribe(audio, language='es', word_timestamps=True, initial_prompt=PROMPT)
words = [{'text': w['word'].strip(), 'start': round(w['start'], 3), 'end': round(w['end'], 3)} for s in r['segments'] for w in s['words']]
json.dump({'texto': r['text'], 'words': words}, open(salida, 'w'), ensure_ascii=False, indent=1)
print(r['text'])
