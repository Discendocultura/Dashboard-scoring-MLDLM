// Endpoint público al que llaman las páginas de vídeo (tracker.js) cuando el lead llega
// al 50% o al 90% de un vídeo. Pone la etiqueta correspondiente al contacto en GHL.
import { addTags, getContact, findContactByEmail } from '../lib/ghl.js';
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
    const okVideo = esVsl ? video === 'vsl' : VIDEOS.includes(video);
    if (!okVideo || !THRESHOLDS.includes(p)) return json({ error: 'Datos no válidos' }, 400, CORS_HEADERS);
    if (!esVsl && !config.launches[launch]) return json({ error: 'Lanzamiento desconocido' }, 404, CORS_HEADERS);

    let contact = null;
    if (typeof cid === 'string' && /^[A-Za-z0-9]{6,40}$/.test(cid)) contact = await getContact(cid);
    if (!contact && isEmail(email)) contact = await findContactByEmail(email);
    if (!contact) return json({ ok: false, reason: 'contacto no encontrado' }, 200, CORS_HEADERS);

    const tags = THRESHOLDS.filter((t) => t <= p).map((t) => tagFor(launch, `${video}_${t}`));
    await addTags(contact.id, tags);
    { const a = marcarActividad('video'); ctx?.waitUntil?.(a); }
    return json({ ok: true }, 200, CORS_HEADERS);
  } catch (e) {
    return errorResponse(e, CORS_HEADERS);
  }
}
