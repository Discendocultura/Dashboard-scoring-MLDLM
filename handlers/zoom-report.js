// Asistencia al directo según el informe de participantes de Zoom (cuenta Pro o superior).
//   GET /api/zoom-report?launch=<código>&v=<n>             → lee el informe de Zoom (permiso «zoom») y guarda los
//       minutos de cada asistente (por email) para la duración media de Métricas → Consumo de vídeos.
//   GET /api/zoom-report?launch=<código>&v=<n>&guardado=1  → lo guardado en la última sincronización, sin llamar a
//       Zoom (permiso de Métricas o de Zoom): { minutos: { email: min }, en }.
import { requireRole, requireSession } from '../lib/auth.js';
import { leerJSON, guardarJSON } from '../lib/store.js';
import { getConfig } from '../lib/config-store.js';
import { attendance, zoomConfigured } from '../lib/zoom.js';
import { json, errorResponse } from '../lib/http.js';
import { videosDe } from '../public/js/videos.js';
import { entraronAlDirecto } from '../lib/entradas.js';

export async function GET(request) {
  try {
    const url0 = new URL(request.url);
    if (url0.searchParams.get('guardado')) {
      await requireSession(request, { permiso: ['metricas', 'zoom'] });
      const k0 = Number(url0.searchParams.get('v')) || 1;
      return json((await leerJSON(claveMinutos(url0.searchParams.get('launch') || '', k0))) || { minutos: {}, en: null });
    }
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
    const minutos = Object.fromEntries(informe.attendees.filter((a) => a.minutes > 0).map((a) => [a.email, a.minutes]));
    await guardarJSON(claveMinutos(code, v.k), { minutos, en: new Date().toISOString() }).catch((e) => console.error('Minutos de Zoom', e.message));
    return json({ ...informe, entraron });
  } catch (e) {
    return errorResponse(e);
  }
}

const claveMinutos = (code, k) => `lsd_zoom_min_${code}_${k}`;
