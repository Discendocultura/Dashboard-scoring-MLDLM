// Rendimiento del equipo de un lanzamiento o VSL (pestaña «Rendimiento del equipo»).
//   GET /api/rendimiento?l=<código o id de VSL> → { eventos: [WhatsApps y resultados con quién y cuándo], llamadas: {resultados},
//       equipo: [{ nombre, rol }] (todo el equipo del cliente, también quien aún no tiene actividad) }
// El navegador lo cruza con los leads (fecha de registro, compra) para el tiempo de respuesta y las ventas.
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { leerActividadEquipo } from '../lib/actividad-equipo.js';
import { leerJSON } from '../lib/store.js';
import { listUsers } from '../lib/users.js';
import { ROL_CLIENTE, ROL_OPERATIVA } from '../public/js/roles.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    await requireSession(request, { permiso: 'rendimiento' });
    const code = new URL(request.url).searchParams.get('l') || '';
    const config = await getConfig();
    if (!config.launches[code] && !config.vsls?.[code]) return json({ error: 'No encontrado' }, 404);
    const [eventos, llamadas, usuarios] = await Promise.all([leerActividadEquipo(code), leerJSON(`lsd_llamadas_${code}`, () => ({})), listUsers().catch(() => [])]);
    // El equipo de este cliente (sin la agencia, los clientes ni quien solo ve la Operativa), para que salga aunque esté a cero.
    const equipo = usuarios.filter((u) => u.activo !== false && !u.superadmin && u.rol && ![ROL_CLIENTE, ROL_OPERATIVA].includes(u.rol))
      .map((u) => ({ nombre: String(u.nombre || '').trim(), rol: u.rol })).filter((u) => u.nombre);
    return json({ eventos, llamadas: llamadas || {}, equipo });
  } catch (e) {
    return errorResponse(e);
  }
}
