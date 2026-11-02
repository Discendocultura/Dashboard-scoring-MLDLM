// Agente de lanzamientos.
//   GET  /api/agente?key=DIGEST_KEY[&c=]    → pilotaje diario (cron-job.org): propuestas a la bandeja + Telegram
//   GET  /api/agente?l=<código> (sesión)     → { ritmo, piezas, propuestas, … } para la pantalla del agente
//   POST { op: 'brief', l, ventas, inversion, conversion } → guarda los objetivos que salen del brief (permiso config)
//   POST { op: 'pilotar' }                  → las propuestas de hoy a la bandeja, ya (permiso config)
import { requireSession, fallaClaveTarea } from '../lib/auth.js';
import { env } from '../lib/env.js';
import { estadoAgente, pilotar } from '../lib/agente.js';
import { getConfig, saveConfig } from '../lib/config-store.js';
import { reintentando, versionDe } from '../lib/store.js';
import { objetivosDeBrief } from '../public/js/agente.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const dashboardUrl = (request) => new URL('/', request.url).toString();

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.has('key')) {
      const falla = fallaClaveTarea(url.searchParams.get('key') || '', env.DIGEST_KEY);
      if (falla) return json({ error: 'No autorizado', motivo: falla }, 401);
      return json(await pilotar({ url: dashboardUrl(request) }));
    }
    await requireSession(request, { permiso: ['config', 'metricas'] });
    return json(await estadoAgente({ code: url.searchParams.get('l') || '' }));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    await requireSession(request, { permiso: 'config' });
    const body = await readBody(request);
    if (body.op === 'pilotar') return json(await pilotar({ url: dashboardUrl(request), avisar: false }));
    if (body.op === 'brief') {
      const code = String(body.l || '');
      const ob = objetivosDeBrief(body);
      if (!ob.ventas) return json({ error: 'Pon cuántas ventas quieres conseguir.' }, 400);
      const config = await reintentando(async () => {
        const actual = await getConfig({ fresh: true });
        const l = actual.launches[code];
        if (!l) throw Object.assign(new Error('No encontrado'), { status: 404, publicMessage: 'Lanzamiento no encontrado' });
        const objetivos = { ...(l.objetivos || {}), ventas: ob.ventas, registros: ob.registros, ...(ob.inversion ? { inversion: ob.inversion } : {}) };
        return saveConfig({ ...actual, launches: { ...actual.launches, [code]: { ...l, objetivos } } }, { version: versionDe(actual), motivo: 'Objetivos del agente (brief)' });
      });
      return json({ objetivos: config.launches[code].objetivos, brief: ob, config, version: versionDe(config) });
    }
    return json({ error: 'Operación no válida' }, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
