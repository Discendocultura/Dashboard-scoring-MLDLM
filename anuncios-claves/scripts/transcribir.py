# Transcribe la voz con Whisper (modelo medium, español) y guarda las palabras con sus tiempos
import sys, json, whisper
audio, salida = sys.argv[1:3]
r = whisper.load_model('medium').transcribe(audio, language='es', word_timestamps=True)
words = [{'text': w['word'].strip(), 'start': round(w['start'], 3), 'end': round(w['end'], 3)} for s in r['segments'] for w in s['words']]
json.dump({'texto': r['text'], 'words': words}, open(salida, 'w'), ensure_ascii=False, indent=1)
print(r['text'])
