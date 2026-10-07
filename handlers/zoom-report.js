// Asistencia al directo según el informe de participantes de Zoom (cuenta Pro o superior).
import { requireRole } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { attendance, zoomConfigured } from '../lib/zoom.js';
import { json, errorResponse } from '../lib/http.js';
import { videosDe } from '../public/js/videos.js';

export async function GET(request) {
  try {
    await requireRole(request, { permiso: 'zoom' });
    if (!zoomConfigured()) return json({ error: 'Zoom no está configurado (faltan las variables ZOOM_*)' }, 400);
    const url = new URL(request.url);
    const code = url.searchParams.get('launch');
    const launch = (await getConfig()).launches[code];
    // Vídeo del lanzamiento (&v=2…; sin él, el webinar / vídeo 1).
    const v = videosDe(launch)[(Number(url.searchParams.get('v')) || 1) - 1];
    if (!v?.zoomMeetingId) return json({ error: `${v?.nombre || 'Este lanzamiento'} no tiene ID de reunión de Zoom` }, 400);
    return json(await attendance(v.zoomMeetingId));
  } catch (e) {
    return errorResponse(e);
  }
}
