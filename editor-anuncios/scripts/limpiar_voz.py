# Reducción de ruido por puerta espectral, con perfil de ruido tomado de un tramo sin voz
import sys, soundfile as sf, noisereduce as nr
entrada, salida, ini, fin = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
x, sr = sf.read(entrada)
ruido = x[int(ini * sr):int(fin * sr)]
y = nr.reduce_noise(y=x, sr=sr, y_noise=ruido, stationary=True, prop_decrease=0.9, n_std_thresh_stationary=1.5)
sf.write(salida, y, sr, subtype='FLOAT')
