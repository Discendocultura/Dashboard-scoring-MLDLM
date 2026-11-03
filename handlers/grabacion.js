// Grabación automática del directo (Zoom → Vimeo → página de replay).
//   GET  /api/grabacion?key=DIGEST_KEY[&c=<cliente>] → tarea programada cada 15-30 min (cron-job.org): avanza un paso.
//   POST /api/grabacion { op: 'avanzar', code? } (permiso de configuración) → botón «Buscar la grabación ahora».
import { requireRole, fallaClaveTarea } from '../lib/auth.js';
import { env } from '../lib/env.js';
import { avanzarGrabaciones } from '../lib/grabacion.js';
import { json, readBody, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    const key = new URL(request.url).searchParams.get('key') || '';
    { const falla = fallaClaveTarea(key, env.DIGEST_KEY); if (falla) return json({ error: 'No autorizado', motivo: falla }, 401); }
    return json(await avanzarGrabaciones());
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    await requireRole(request, { permiso: 'config' });
    const body = await readBody(request);
    if (body.op !== 'avanzar') return json({ error: 'Operación no válida' }, 400);
    return json(await avanzarGrabaciones({ code: String(body.code || '') }));
  } catch (e) {
    return errorResponse(e);
  }
}
