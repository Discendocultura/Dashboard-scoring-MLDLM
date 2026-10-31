// Análisis del directo con Claude (Métricas → Consumo de vídeos → Retención → Directo):
//   GET  /api/directo-ia?launch=<código>&k=<n> → lo guardado: { analisis, transcripcion: { fuente, frases, desfase, en },
//        claude (hay clave), zoom (hay Zoom y reunión) }.
//   POST /api/directo-ia { launch, k, texto?, desfase?, regenerar? } → hace el análisis (o devuelve el guardado si no
//        ha cambiado nada) con la curva guardada al «Sincronizar Zoom» y la transcripción: la que se pega (texto), la
//        guardada o la de la grabación en la nube de Zoom. Sin transcripción: { sinTranscripcion, motivo } (la pantalla pide pegarla).
// Se guarda en lsd_directo_tx_<código>_<k> (la transcripción) y lsd_directo_ia_<código>_<k> (el análisis).
import { requireSession } from '../lib/auth.js';
import { leerJSON, guardarJSON } from '../lib/store.js';
import { getConfig } from '../lib/config-store.js';
import { json, readBody, errorResponse } from '../lib/http.js';
import { transcripcionDelDirecto, zoomConfigured } from '../lib/zoom.js';
import { MODELO, claveClaude, claudeConfigurado, leerTranscripcion, porMinuto, promptDirecto, limpiarAnalisis, firma, pedirAClaude, analisisDePrueba } from '../lib/directo-ia.js';
import { claveMinutos } from './zoom-report.js';
import { videosDe } from '../public/js/videos.js';
import { env } from '../lib/env.js';

const claveTx = (code, k) => `lsd_directo_tx_${code}_${k}`;
const claveIa = (code, k) => `lsd_directo_ia_${code}_${k}`;
const MAX_TEXTO = 2_000_000;
const resumenTx = (tx) => (tx ? { fuente: tx.fuente, frases: tx.segs.length, desfase: tx.desfase, en: tx.en } : null);
const desfaseValido = (d) => Math.max(-120, Math.min(240, Math.round(Number(d) || 0)));

async function lanzamientoYVideo(code, kRaw) {
  const config = await getConfig();
  const launch = Object.hasOwn(config.launches, String(code || '')) ? config.launches[code] : null;
  if (!launch) throw json({ error: 'Lanzamiento desconocido' }, 404);
  const k = Math.min(Math.max(Number(kRaw) || 1, 1), 4);
  return { config, launch, k, video: videosDe(launch)[k - 1] || null };
}

export async function GET(request) {
  try {
    await requireSession(request, { permiso: ['metricas', 'zoom'] });
    const url = new URL(request.url);
    const code = url.searchParams.get('launch') || '';
    const { k, video } = await lanzamientoYVideo(code, url.searchParams.get('k'));
    const [analisis, tx] = await Promise.all([leerJSON(claveIa(code, k)), leerJSON(claveTx(code, k))]);
    return json({ analisis, transcripcion: resumenTx(tx), claude: claudeConfigurado(), zoom: zoomConfigured() && Boolean(video?.zoomMeetingId) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    await requireSession(request, { permiso: ['metricas', 'zoom'] });
    const { launch: code, k: kRaw, texto, desfase, regenerar } = await readBody(request);
    const { config, launch, k, video } = await lanzamientoYVideo(code, kRaw);
    const curva = (await leerJSON(claveMinutos(code, k)))?.curva;
    if (!curva?.valores?.length) return json({ error: 'Aún no hay curva de este directo: pulsa antes «Sincronizar Zoom».' }, 400);
    if (!claudeConfigurado()) return json({ error: 'Falta la clave de Claude: añade ANTHROPIC_API_KEY (tipo Secret) en Cloudflare y vuelve a desplegar.' }, 400);

    // La transcripción: la pegada, la guardada (con el desfase nuevo, si se cambia) o la de Zoom.
    let tx = await leerJSON(claveTx(code, k));
    if (typeof texto === 'string' && texto.trim()) {
      if (texto.length > MAX_TEXTO) return json({ error: 'La transcripción es demasiado larga (máximo 2 MB).' }, 400);
      const segs = leerTranscripcion(texto);
      if (!segs.length) return json({ error: 'No encuentro los tiempos en la transcripción: tiene que ser el archivo .vtt de Zoom o un texto con el minuto de cada frase (por ejemplo «00:12:34 Ana: …»).' }, 400);
      tx = { fuente: 'pegada', segs: segs.map((x) => [x.seg, x.texto]), desfase: desfaseValido(desfase), en: new Date().toISOString() };
      await guardarJSON(claveTx(code, k), tx);
    } else if (!tx) {
      if (!zoomConfigured() || !video?.zoomMeetingId) return json({ sinTranscripcion: true, motivo: 'Este directo no tiene reunión de Zoom configurada, así que no se puede sacar la transcripción de su grabación.' });
      const z = await transcripcionDelDirecto(video.zoomMeetingId, { inicio: curva.inicio });
      const segs = z.ok ? leerTranscripcion(z.vtt) : [];
      if (!segs.length) return json({ sinTranscripcion: true, motivo: z.motivo || 'La transcripción de Zoom está vacía.' });
      tx = { fuente: 'zoom', segs: segs.map((x) => [x.seg, x.texto]), desfase: desfaseValido(z.desfase), en: new Date().toISOString() };
      await guardarJSON(claveTx(code, k), tx);
    } else if (desfase != null && desfaseValido(desfase) !== tx.desfase) {
      tx = { ...tx, desfase: desfaseValido(desfase) };
      await guardarJSON(claveTx(code, k), tx);
    }

    const segs = tx.segs.map(([seg, t]) => ({ seg, texto: t }));
    const f = firma(curva, segs, tx.desfase);
    const guardado = await leerJSON(claveIa(code, k));
    if (guardado?.firma === f && !regenerar) return json({ analisis: guardado, transcripcion: resumenTx(tx), reutilizado: true });

    const minutos = porMinuto(segs, tx.desfase);
    const clave = claveClaude();
    let r;
    let prueba = false;
    if (!clave && env.GHL_MOCK === '1') {
      r = limpiarAnalisis(analisisDePrueba(curva, minutos), curva);
      prueba = true;
    } else {
      const { json: crudo, modelo } = await pedirAClaude(promptDirecto(curva, minutos, { nombre: video?.nombre, lanzamiento: launch.name, marca: config.marca?.producto }), { clave });
      r = { ...limpiarAnalisis(crudo, curva), modelo };
    }
    const analisis = { ...r, modelo: r.modelo || MODELO, prueba, firma: f, fuente: tx.fuente, en: new Date().toISOString() };
    await guardarJSON(claveIa(code, k), analisis);
    return json({ analisis, transcripcion: resumenTx(tx), reutilizado: false });
  } catch (e) {
    return errorResponse(e);
  }
}
