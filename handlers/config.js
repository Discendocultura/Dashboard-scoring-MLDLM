import { requireRole, requireSession, tienePermiso } from '../lib/auth.js';
import { PERMISOS_DATOS } from '../public/js/roles.js';
import { getConfig, saveConfig } from '../lib/config-store.js';
import { zoomConfigured } from '../lib/zoom.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const EQUIPO_FIELDS = ['name', 'inicioCaptacion', 'finCaptacion', 'fechaDirecto', 'horaDirecto', 'clase1At', 'clase2At', 'replayAt', 'aperturaCarrito', 'cierreCarrito', 'createdAt'];
function equipoConfig(config) {
  const launches = {};
  for (const [code, l] of Object.entries(config.launches)) launches[code] = Object.fromEntries(EQUIPO_FIELDS.map((k) => [k, l[k] ?? '']));
  return { launches, templates: {}, accesos: [], digestEmail: '', defaultCountryCode: config.defaultCountryCode };
}

export async function GET(request) {
  try {
    const ses = await requireSession(request);
    const role = ses.role;
    const config = await getConfig({ fresh: new URL(request.url).searchParams.has('fresh') });
    // El equipo solo ve las tareas: le basta con el nombre y las fechas de cada lanzamiento.
    if (!tienePermiso(ses, [...PERMISOS_DATOS, 'config'])) return json({ role, config: equipoConfig(config), zoomConfigured: false });
    return json({ role, config, zoomConfigured: zoomConfigured() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    await requireRole(request, { permiso: 'config' });
    const config = await saveConfig(await readBody(request));
    return json({ config });
  } catch (e) {
    return errorResponse(e);
  }
}
