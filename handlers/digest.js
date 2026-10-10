// Resumen diario por email.
//   GET  /api/digest?key=DIGEST_KEY → lo llama cada mañana un programador de tareas gratuito (cron-job.org
//        o un Cron Trigger de Cloudflare).
//   POST /api/digest (sesión de admin) → botón "Enviar resumen de prueba" del dashboard.
import { requireRole, fallaClaveTarea } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { sendDigest, sendDigestUnaVez } from '../lib/digest.js';
import { env } from '../lib/env.js';
import { json, errorResponse } from '../lib/http.js';

const dashboardUrl = (request) => new URL('/', request.url).toString();

export async function GET(request) {
  try {
    const key = new URL(request.url).searchParams.get('key') || '';
    { const falla = fallaClaveTarea(key, env.DIGEST_KEY); if (falla) return json({ error: 'No autorizado', motivo: falla }, 401); }
    return json(await sendDigestUnaVez(await getConfig({ fresh: true }), dashboardUrl(request)));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    await requireRole(request, { permiso: 'config' });
    return json(await sendDigest(await getConfig({ fresh: true }), dashboardUrl(request)));
  } catch (e) {
    return errorResponse(e);
  }
}
