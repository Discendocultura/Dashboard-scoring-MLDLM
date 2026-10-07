// Rendimiento del equipo de un lanzamiento o VSL (pestaña «Rendimiento del equipo»).
//   GET /api/rendimiento?l=<código o id de VSL> → { eventos: [WhatsApps y resultados con quién y cuándo], llamadas: {resultados} }
// El navegador lo cruza con los leads (fecha de registro, compra) para el tiempo de respuesta y las ventas.
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { leerActividadEquipo } from '../lib/actividad-equipo.js';
import { leerJSON } from '../lib/store.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    await requireSession(request, { permiso: 'rendimiento' });
    const code = new URL(request.url).searchParams.get('l') || '';
    const config = await getConfig();
    if (!config.launches[code] && !config.vsls?.[code]) return json({ error: 'No encontrado' }, 404);
    const [eventos, llamadas] = await Promise.all([leerActividadEquipo(code), leerJSON(`lsd_llamadas_${code}`, () => ({}))]);
    return json({ eventos, llamadas: llamadas || {} });
  } catch (e) {
    return errorResponse(e);
  }
}
