// Entrada al directo sin atascos a la hora exacta (la llama tracker.js desde la pantalla de espera):
//   POST /api/directo-zoom { op: 'prep', launch, k, cid } → la inscribe en Zoom y devuelve su enlace personal
//        { ok, joinUrl }. Se hace la primera vez que entra en la preclase (cualquier día antes del directo:
//        así la carga se reparte en la semana) y, si no, en la pantalla de espera. Solo leads registradas en
//        el lanzamiento. Si ya estaba inscrita, no llama a nadie.
//   POST /api/directo-zoom { op: 'espera', … } → apunta que abrió la pantalla de espera (panel «En directo»).
//   POST /api/directo-zoom { op: 'click', launch, k, cid } → apunta que entró (sin llamar a GHL: la
//        etiqueta <código>_directo_click se pone al sincronizar Zoom en el dashboard).
import { getConfig } from '../lib/config-store.js';
import { getContact } from '../lib/ghl.js';
import { hasTag } from '../lib/access.js';
import { addRegistrant, zoomConfigured } from '../lib/zoom.js';
import { entradaDe, guardarInscripcion, marcarEntrada, marcarEspera } from '../lib/entradas.js';
import { json, readBody, errorResponse, CORS_HEADERS } from '../lib/http.js';
import { videosDe, esEnDirecto } from '../public/js/videos.js';
import { milestones } from '../public/js/page.js';

// ¿El enlace personal de Zoom (…/w/<id>?tk=…) es de esta reunión? Si no se ve el número, se da por bueno.
export const deLaReunion = (url, meetingId) => {
  const id = /\/w\/(\d+)/.exec(String(url || ''))?.[1];
  return !id || !meetingId || id === String(meetingId).replace(/\D/g, '');
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const VENTANA_ANTES = 65 * 60_000; // la pantalla de espera empieza 59 min antes
const VENTANA_DESPUES = 4 * 3600_000;
// La inscripción se puede hacer desde que se abre la preclase (hasta 30 días antes del directo).
const VENTANA_PREP = 30 * 24 * 3600_000;

export async function POST(request) {
  try {
    const { op, launch: code, k: kRaw, cid } = await readBody(request);
    if (!['prep', 'click', 'espera'].includes(op) || typeof cid !== 'string' || !/^[A-Za-z0-9]{6,40}$/.test(cid)) return json({ error: 'Datos no válidos' }, 400, CORS_HEADERS);
    const config = await getConfig();
    const launch = Object.hasOwn(config.launches, String(code || '')) ? config.launches[code] : null;
    if (!launch) return json({ error: 'Lanzamiento desconocido' }, 404, CORS_HEADERS);
    const k = Math.min(Math.max(Number(kRaw) || 1, 1), 4);
    const vid = videosDe(launch)[k - 1];
    if (!vid || (k > 1 && !esEnDirecto(vid))) return json({ error: 'Ese vídeo no es en directo' }, 400, CORS_HEADERS);
    const inicio = milestones(launch).videos[k - 1]?.inicio;
    const now = Date.now();
    if (inicio == null || now < inicio - (op === 'prep' ? VENTANA_PREP : VENTANA_ANTES) || now > inicio + VENTANA_DESPUES) return json({ ok: false, motivo: 'fuera de hora' }, 200, CORS_HEADERS);

    if (op === 'espera') {
      await marcarEspera(code, k, cid);
      return json({ ok: true }, 200, CORS_HEADERS);
    }
    if (op === 'click') {
      await marcarEntrada(code, k, cid);
      return json({ ok: true }, 200, CORS_HEADERS);
    }
    // op: 'prep'
    // Ya inscrita: su enlace, si es de la reunión configurada ahora (si se cambió la reunión, se reinscribe).
    const ya = await entradaDe(code, k, cid);
    if (ya?.join_url && deLaReunion(ya.join_url, vid.zoomMeetingId)) return json({ ok: true, joinUrl: ya.join_url }, 200, CORS_HEADERS);
    if (!vid.zoomMeetingId || !zoomConfigured()) return json({ ok: false, motivo: 'sin zoom' }, 200, CORS_HEADERS);
    const contact = await getContact(cid);
    if (!contact?.email) return json({ ok: false, motivo: 'contacto no encontrado' }, 200, CORS_HEADERS);
    if (launch.registroTag && !hasTag(contact, launch.registroTag)) return json({ ok: false, motivo: 'sin registro' }, 200, CORS_HEADERS);
    const [firstName, ...rest] = (contact.name || '').split(' ');
    const joinUrl = await addRegistrant(vid.zoomMeetingId, { email: contact.email, firstName, lastName: rest.join(' ') });
    if (!joinUrl) return json({ ok: false, motivo: 'zoom' }, 200, CORS_HEADERS);
    await guardarInscripcion(code, k, cid, joinUrl);
    return json({ ok: true, joinUrl }, 200, CORS_HEADERS);
  } catch (e) {
    return errorResponse(e, CORS_HEADERS);
  }
}
