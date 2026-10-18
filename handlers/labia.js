// Hoy → LabIA: el pipeline del setter IA con los leads de cada etapa y las cifras del setter (últimos 7 días).
//   GET /api/labia[?fresh=1]          → { pipeline, etapas, ahora, totales, teTocan, cifras } | { motivo }
//   GET /api/labia?parte=pipelines    → { pipelines: [{ id, nombre }] } (Conexiones, para elegir el de LabIA)
// Solo en los clientes con LabIA contratado (Agencia → Clientes).
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { getPipelines } from '../lib/ghl.js';
import { labiaAqui } from '../lib/clientes.js';
import { pipelineLabia } from '../lib/labia.js';
import { resumenSetterIa } from '../lib/setter-ia.js';
import { json, errorResponse } from '../lib/http.js';

const dia = (ms) => new Date(ms).toISOString().slice(0, 10);

export async function GET(request) {
  try {
    const q = new URL(request.url).searchParams;
    const config = await getConfig();
    if (q.get('parte') === 'pipelines') {
      await requireSession(request, { permiso: 'config' });
      return json({ pipelines: (await getPipelines()).map((p) => ({ id: p.id, nombre: p.name })) });
    }
    await requireSession(request, { permiso: ['hoy', 'llamadas', 'rendimiento'] });
    if (!(await labiaAqui(config))) return json({ motivo: 'sin_labia' });
    const fresh = q.has('fresh');
    const ahora = Date.now();
    const [pipe, setter] = await Promise.all([
      pipelineLabia(config, { fresh }).catch((e) => ({ motivo: 'error', error: e.publicMessage || 'GHL no responde ahora mismo: pulsa «Actualizar» en un minuto.' })),
      resumenSetterIa(config, dia(ahora - 6 * 86_400_000), dia(ahora), { fresh }),
    ]);
    return json({ ...pipe, setter, url: config.setterIa?.url || '' });
  } catch (e) {
    return errorResponse(e);
  }
}
