// Histórico de lanzamientos (menú lateral, debajo de Inteligencia de negocio): todos los lanzamientos de todos los
// embudos del cliente, con su embudo completo, para compararlos.
//   GET /api/historico[?fresh=<código>] → { lanzamientos, embudos, pendientes, total }
// Cada visita calcula como mucho un lanzamiento que falte (ver lib/historico.js): mientras `pendientes` > 0, el navegador vuelve a pedir.
// Lo ven quien tiene Métricas y el rol Cliente (solo mirar); quien tiene embudos asignados, solo los suyos.
import { requireSession, tienePermiso } from '../lib/auth.js';
import { historicoLanzamientos } from '../lib/historico.js';
import { ROL_CLIENTE } from '../public/js/roles.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    const s = await requireSession(request, { cliente: true });
    if (s.role !== ROL_CLIENTE && !tienePermiso(s, 'metricas')) return json({ error: 'Tu rol no tiene acceso a las métricas del negocio.' }, 403);
    const q = new URL(request.url).searchParams;
    return json(await historicoLanzamientos({ embudos: s.embudos || null, fresh: q.get('fresh') || '' }));
  } catch (e) {
    return errorResponse(e);
  }
}
