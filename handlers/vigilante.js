// Vigilante del lanzamiento en curso (auditor + simulacro de las páginas publicadas en GHL).
//   GET  /api/vigilante?key=DIGEST_KEY[&c=<cliente>] → lo llama el programador de tareas (cron-job.org) cada
//        mañana y la víspera de cada directo: avisa por Telegram de lo nuevo (y de lo crítico si el hito está cerca).
//   POST /api/vigilante { op: 'revisar' } (sesión con permiso de configuración) → botón «Revisar ahora» del
//        auditor: devuelve el resultado sin avisar a nadie. { op: 'avisar' } → lo manda también a Telegram.
import { requireRole, fallaClaveTarea } from '../lib/auth.js';
import { env } from '../lib/env.js';
import { vigilar } from '../lib/vigilante.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const dashboardUrl = (request) => new URL('/', request.url).toString();

export async function GET(request) {
  try {
    const key = new URL(request.url).searchParams.get('key') || '';
    { const falla = fallaClaveTarea(key, env.DIGEST_KEY); if (falla) return json({ error: 'No autorizado', motivo: falla }, 401); }
    return json(await vigilar({ url: dashboardUrl(request) }));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    await requireRole(request, { permiso: 'config' });
    const body = await readBody(request);
    if (!['revisar', 'avisar'].includes(body.op)) return json({ error: 'Operación no válida' }, 400);
    return json(await vigilar({ code: String(body.code || ''), url: dashboardUrl(request), avisar: body.op === 'avisar', forzar: body.op === 'avisar' }));
  } catch (e) {
    return errorResponse(e);
  }
}
