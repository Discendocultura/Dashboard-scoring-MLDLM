// Asistencia al directo según el informe de participantes de Zoom (cuenta Pro o superior).
import { requireRole } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { attendance, zoomConfigured } from '../lib/zoom.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    await requireRole(request, { permiso: 'zoom' });
    if (!zoomConfigured()) return json({ error: 'Zoom no está configurado (faltan las variables ZOOM_*)' }, 400);
    const code = new URL(request.url).searchParams.get('launch');
    const launch = (await getConfig()).launches[code];
    if (!launch?.zoomMeetingId) return json({ error: 'Este lanzamiento no tiene ID de reunión de Zoom' }, 400);
    return json(await attendance(launch.zoomMeetingId));
  } catch (e) {
    return errorResponse(e);
  }
}
