// Grabación automática del directo: cuando acaba, la grabación de Zoom (en la nube) se sube sola a Vimeo y, cuando
// Vimeo la tiene lista, se pone como vídeo de la grabación de ese directo (la página de replay la enseña sola).
// Lo mueve una tarea programada cada 15-30 min (/api/grabacion?key=…&c=<cliente>); cada llamada avanza un paso:
//   esperando (Zoom aún procesa) → subiendo (Vimeo la descarga y la convierte) → lista (puesta en la configuración)
// Nunca pisa un vídeo puesto a mano. Se apaga por lanzamiento (Configuración → Grabación: grabacionAuto = false).
import { getConfig, saveConfig } from './config-store.js';
import { currentLaunch } from './digest.js';
import { clienteActual } from './cliente.js';
import { zoomConfigured, grabacionDe } from './zoom.js';
import { vimeoConfigurado, subirDesdeUrl, estadoVideo } from './vimeo.js';
import { leerCompartida, guardarCompartida, reintentando, versionDe } from './store.js';
import { avisarTelegram } from './telegram.js';
import { escapeHtml } from './http.js';
import { videosDe, esEnDirecto } from '../public/js/videos.js';
import { madridToEpoch } from '../public/js/page.js';
import { dayInMadrid } from '../public/js/scoring.js';

const MIN = 60_000;
const ESPERA_INICIO = 60 * MIN; // no se busca antes de 1 h después de empezar
const VENTANA = 4 * 24 * 60 * MIN; // ni más de 4 días después
const SIN_GRABACION = 6 * 60 * MIN; // a las 6 h sin grabación en la nube, se avisa (una vez)
const TTL = 30 * 24 * 60 * MIN;

// Los directos de un lanzamiento que tocan ahora. → [{ k, nombre, id, inicio (ms), fecha }]
export function directosPendientes(l, ahora) {
  if (!l || l.grabacionAuto === false) return [];
  return videosDe(l).filter((v) => esEnDirecto(v) && v.zoomMeetingId && !v.replayVideoUrl && v.fecha && v.hora)
    .map((v) => ({ k: v.k, nombre: v.nombre, id: v.zoomMeetingId, fecha: v.fecha, inicio: madridToEpoch(`${v.fecha}T${v.hora}`) }))
    .filter((v) => v.inicio && ahora >= v.inicio + ESPERA_INICIO && ahora <= v.inicio + VENTANA);
}

// Pone el vídeo en el lanzamiento (si sigue vacío). → true si lo ha puesto
async function ponerVideo(code, k, link) {
  return reintentando(async () => {
    const actual = await getConfig({ fresh: true });
    const l = actual.launches[code];
    if (!l) return false;
    const v = videosDe(l)[k - 1];
    if (!v || v.replayVideoUrl) return false;
    const nuevo = k === 1 ? { ...l, replayVideoUrl: link }
      : { ...l, videos: Array.from({ length: Math.max(k - 1, (l.videos || []).length) }, (_, i) => (i === k - 2 ? { ...(l.videos?.[i] || {}), replayVideoUrl: link } : l.videos?.[i] || {})) };
    await saveConfig({ ...actual, launches: { ...actual.launches, [code]: nuevo } }, { version: versionDe(actual), motivo: `Grabación automática del ${v.nombre}` });
    return true;
  });
}

/**
 * Avanza un paso cada directo pendiente del lanzamiento en curso (o del pedido).
 * → { code, pasos: [{ k, video, estado, detalle }] }
 */
export async function avanzarGrabaciones({ code: pedido = '', ahora = Date.now(), avisar = true } = {}) {
  const c = clienteActual();
  if (!zoomConfigured() || !vimeoConfigurado()) return { code: null, pasos: [], motivo: !vimeoConfigurado() ? 'Falta conectar Vimeo (VIMEO_TOKEN en Cloudflare)' : 'Zoom no está conectado' };
  const config = await getConfig({ fresh: true });
  const code = pedido && config.launches[pedido] ? pedido : currentLaunch(config, dayInMadrid(new Date(ahora).toISOString()));
  const l = code ? config.launches[code] : null;
  const pasos = [];
  const aviso = (t) => (avisar ? avisarTelegram(t) : 0);
  const titulo = (v) => `<b>${escapeHtml(c.nombre)}</b> · ${escapeHtml(l.name)}${videosDe(l).length > 1 ? ` · ${escapeHtml(v.nombre)}` : ''}`;
  for (const v of directosPendientes(l, ahora)) {
    const CLAVE = `grabacion|${code}|${v.k}`;
    const st = (await leerCompartida(CLAVE, TTL).catch(() => null)) || { estado: 'esperando' };
    const paso = (estado, detalle = '') => pasos.push({ k: v.k, video: v.nombre, estado, detalle });
    try {
      if (st.estado === 'lista' || st.estado === 'error' || st.estado === 'sin') { paso(st.estado, st.detalle || ''); continue; }
      if (st.estado === 'subiendo') {
        const e = await estadoVideo(st.uri);
        if (e.estado === 'lista') {
          const link = e.link || st.link;
          const puesta = await ponerVideo(code, v.k, link);
          await guardarCompartida(CLAVE, { ...st, estado: 'lista', link, en: ahora });
          paso('lista', link);
          if (puesta) await aviso(`🎬 ${titulo(v)}\nLa grabación ya está en Vimeo y puesta en su página de replay.\n${escapeHtml(link)}`);
        } else if (e.estado === 'error' || ahora - st.en > SIN_GRABACION) {
          const detalle = e.estado === 'error' ? 'Vimeo no ha podido procesar el vídeo' : 'Vimeo lleva más de 6 h procesándolo';
          await guardarCompartida(CLAVE, { ...st, estado: 'error', detalle, en: ahora });
          paso('error', detalle);
          await aviso(`⚠️ ${titulo(v)}\nGrabación automática: ${detalle}. Súbela a mano y pon su enlace en Configuración → Grabación.`);
        } else paso('subiendo', 'Vimeo está procesando el vídeo');
        continue;
      }
      // esperando: ¿hay grabación de esta sesión en la nube de Zoom?
      const g = await grabacionDe(v.id);
      const deEsteDirecto = g && (!g.inicio || g.inicio.slice(0, 10) === v.fecha);
      if (!g || !deEsteDirecto) {
        if (ahora - v.inicio > SIN_GRABACION) {
          const detalle = 'No hay grabación en la nube de Zoom de este directo (¿se grabó en el ordenador?)';
          await guardarCompartida(CLAVE, { estado: 'sin', detalle, en: ahora });
          paso('sin', detalle);
          await aviso(`⚠️ ${titulo(v)}\n${detalle}. Súbela a Vimeo a mano y pon su enlace en Configuración → Grabación.`);
        } else paso('esperando', 'Aún no hay grabación en Zoom');
        continue;
      }
      if (!g.listo) { paso('esperando', g.motivo || 'Zoom aún la está procesando'); continue; }
      const sub = await subirDesdeUrl({ url: g.url, nombre: `${l.name}${videosDe(l).length > 1 ? ` · ${v.nombre}` : ''} · ${v.fecha}` });
      await guardarCompartida(CLAVE, { estado: 'subiendo', uri: sub.uri, link: sub.link, en: ahora });
      paso('subiendo', 'Enviada a Vimeo');
    } catch (e) {
      paso('fallo', String(e.publicMessage || e.message).slice(0, 200)); // se reintenta en la siguiente llamada
    }
  }
  return { code, pasos };
}
