// Asistencia al directo según el informe de participantes de Zoom (cuenta Pro o superior).
import { requireRole } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { attendance, zoomConfigured } from '../lib/zoom.js';
import { json, errorResponse } from '../lib/http.js';
import { videosDe } from '../public/js/videos.js';
import { entraronAlDirecto } from '../lib/entradas.js';

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
    // Y quién pulsó el enlace / entró por el dashboard (se apunta en D1 para no gastar llamadas a GHL en el directo).
    const [informe, entraron] = await Promise.all([attendance(v.zoomMeetingId), entraronAlDirecto(code, v.k).catch(() => [])]);
    return json({ ...informe, entraron });
  } catch (e) {
    return errorResponse(e);
  }
}
