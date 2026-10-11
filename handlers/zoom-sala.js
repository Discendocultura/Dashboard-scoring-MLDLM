// Crear la sala de Zoom del directo (Nuevo lanzamiento rápido).
//   POST /api/zoom-sala { topic, fecha: 'AAAA-MM-DD', hora: 'HH:MM', duracion?, copiarDe?: id de la reunión anterior }
//        → { id, joinUrl }. Permiso «config».
import { requireRole } from '../lib/auth.js';
import { crearReunion, zoomConfigured } from '../lib/zoom.js';
import { json, readBody, errorResponse } from '../lib/http.js';

export async function POST(request) {
  try {
    await requireRole(request, { permiso: 'config' });
    if (!zoomConfigured()) return json({ error: 'Zoom no está conectado para este cliente (variables ZOOM_* en Cloudflare).' }, 400);
    const b = await readBody(request);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '') || !/^\d{2}:\d{2}$/.test(b.hora || '')) return json({ error: 'Faltan el día y la hora del directo' }, 400);
    const duracion = Math.min(Math.max(Number(b.duracion) || 120, 30), 600);
    return json(await crearReunion({ topic: String(b.topic || ''), fecha: b.fecha, hora: b.hora, duracion, copiarDe: String(b.copiarDe || '').replace(/\D/g, '') }));
  } catch (e) {
    return errorResponse(e);
  }
}
