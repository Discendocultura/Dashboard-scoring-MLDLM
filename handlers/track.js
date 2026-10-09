// Endpoint público al que llaman las páginas de vídeo (tracker.js) cuando el lead llega
// al 50% o al 90% de un vídeo. Pone la etiqueta correspondiente al contacto en GHL.
import { addTags, findContactByEmail } from '../lib/ghl.js';
import { getConfig } from '../lib/config-store.js';
import { marcarActividad } from '../lib/actividad.js';
import { json, readBody, errorResponse, isEmail, CORS_HEADERS } from '../lib/http.js';
import { VIDEOS, THRESHOLDS, tagFor } from '../public/js/scoring.js';

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request, ctx) {
  try {
    const { launch, video, pct, cid, email } = await readBody(request);
    const p = Number(pct);
    // La VSL tiene un único vídeo («vsl»); los lanzamientos, clase 1, clase 2 y grabación.
    const config = await getConfig();
    const esVsl = Boolean(config.vsls?.[launch]);
    // Recursos de la preclase: la música (0 = la reprodujo, 50 y 90 = cuánto escuchó) y el descargable (0 = lo abrió).
    const recurso = !esVsl && (video === 'musica' ? [0, 50, 90].includes(p) : video === 'descarga' ? p === 0 : false);
    const okVideo = esVsl ? video === 'vsl' : VIDEOS.includes(video);
    if (!recurso && (!okVideo || !THRESHOLDS.includes(p))) return json({ error: 'Datos no válidos' }, 400, CORS_HEADERS);
    if (!esVsl && !Object.hasOwn(config.launches, launch)) return json({ error: 'Lanzamiento desconocido' }, 404, CORS_HEADERS);

    const tags = video === 'musica' ? ['play', 50, 90].filter((t, i) => [0, 50, 90][i] <= p).map((t) => tagFor(launch, `musica_${t}`))
      : video === 'descarga' ? [tagFor(launch, 'descarga')]
        : THRESHOLDS.filter((t) => t <= p).map((t) => tagFor(launch, `${video}_${t}`));
    // Con su ID se etiqueta directamente (una llamada a GHL en vez de dos: antes se buscaba el contacto).
    // Si GHL no lo encuentra, se prueba con el email.
    let hecho = false;
    if (typeof cid === 'string' && /^[A-Za-z0-9]{6,40}$/.test(cid)) {
      try {
        await addTags(cid, tags);
        hecho = true;
      } catch (e) {
        if (!(e.status === 404 || [400, 404, 422].includes(e.ghlStatus))) throw e;
      }
    }
    if (!hecho) {
      const contact = isEmail(email) ? await findContactByEmail(email) : null;
      if (!contact) return json({ ok: false, reason: 'contacto no encontrado' }, 200, CORS_HEADERS);
      await addTags(contact.id, tags);
    }
    { const a = marcarActividad('video'); ctx?.waitUntil?.(a); }
    return json({ ok: true }, 200, CORS_HEADERS);
  } catch (e) {
    return errorResponse(e, CORS_HEADERS);
  }
}
