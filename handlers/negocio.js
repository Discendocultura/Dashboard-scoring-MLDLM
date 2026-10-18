// Inteligencia de negocio (menú lateral, debajo de Inicio): el histórico de todos los embudos del cliente.
//   GET /api/negocio?periodo=12m|ano|todo → { vacio } | { numeros, previo, recomendaciones, ciclo, recompra, actividad, serie, embudos, pendientes, total }
// Cada visita calcula como mucho una pieza que falte (ver lib/negocio.js): mientras `pendientes` > 0, el navegador vuelve a pedir.
// La ven quien tiene Métricas y el rol Cliente (solo mirar); quien tiene embudos asignados, solo los suyos.
import { requireSession, tienePermiso } from '../lib/auth.js';
import { negocio } from '../lib/negocio.js';
import { PERIODOS_NEGOCIO } from '../lib/negocio-calc.js';
import { ROL_CLIENTE } from '../public/js/roles.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    const s = await requireSession(request, { cliente: true });
    if (s.role !== ROL_CLIENTE && !tienePermiso(s, 'metricas')) return json({ error: 'Tu rol no tiene acceso a las métricas del negocio.' }, 403);
    const q = new URL(request.url).searchParams;
    const periodo = PERIODOS_NEGOCIO.includes(q.get('periodo')) ? q.get('periodo') : '12m';
    return json(await negocio({ periodo, embudos: s.embudos || null }));
  } catch (e) {
    return errorResponse(e);
  }
}
