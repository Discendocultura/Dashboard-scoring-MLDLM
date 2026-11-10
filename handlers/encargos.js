// 🤖 Encargos a Claude («Crear con IA» en Crear → Automatizaciones). Permiso de configuración.
//   GET  /api/encargos?l=<código>                         → { items, ghl: URL de los workflows en GHL }
//   POST { op: 'encargar', tipo, l, ref, titulo, prompt } → { encargo } (Claude lo recoge con la tarea de Cowork)
//   POST { op: 'cancelar', id }                            → { encargo }
import { requireSession } from '../lib/auth.js';
import { json, readBody, errorResponse } from '../lib/http.js';
import { listarEncargos, encargar, cancelarEncargo, urlWorkflowsGhl } from '../lib/encargos.js';

const quienEs = (s) => s.user?.nombre || s.user?.email || (s.role === 'admin' ? 'Admin' : 'Equipo');

export async function GET(request) {
  try {
    await requireSession(request, { permiso: 'config' });
    const l = new URL(request.url).searchParams.get('l') || '';
    return json({ items: await listarEncargos({ l }), ghl: urlWorkflowsGhl() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const s = await requireSession(request, { permiso: 'config' });
    const body = await readBody(request);
    if (body.op === 'encargar') return json({ encargo: await encargar({ tipo: body.tipo, l: String(body.l || ''), ref: String(body.ref || ''), titulo: body.titulo, prompt: body.prompt }, quienEs(s)) });
    if (body.op === 'cancelar') return json({ encargo: await cancelarEncargo(String(body.id || ''), quienEs(s)) });
    return json({ error: 'Operación desconocida' }, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
