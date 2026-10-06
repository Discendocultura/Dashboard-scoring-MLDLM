import { requireRole, requireSession, tienePermiso } from '../lib/auth.js';
import { PERMISOS_DATOS } from '../public/js/roles.js';
import { getConfig, saveConfig } from '../lib/config-store.js';
import { zoomConfigured } from '../lib/zoom.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const EQUIPO_FIELDS = ['name', 'inicioCaptacion', 'finCaptacion', 'fechaDirecto', 'horaDirecto', 'clase1At', 'clase2At', 'replayAt', 'aperturaCarrito', 'cierreCarrito', 'createdAt'];
function equipoConfig(config) {
  const launches = {};
  for (const [code, l] of Object.entries(config.launches)) launches[code] = Object.fromEntries(EQUIPO_FIELDS.map((k) => [k, l[k] ?? '']));
  return { launches, templates: {}, accesos: [], digestEmail: '', defaultCountryCode: config.defaultCountryCode, vsls: Object.fromEntries(Object.entries(config.vsls || {}).map(([id, v]) => [id, { name: v.name }])), embudos: config.embudos };
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
    const body = await readBody(request);
    // Solo los mensajes de WhatsApp (Setteo hoy): basta con el permiso «Editar mensajes de WhatsApp».
    if (body.op === 'plantillas') {
      await requireRole(request, { permiso: 'mensajes' });
      const actual = await getConfig({ fresh: true });
      const templates = { ...actual.templates };
      for (const k of Object.keys(templates)) if (typeof body.templates?.[k] === 'string') templates[k] = body.templates[k];
      const config = await saveConfig({ ...actual, templates, defaultCountryCode: body.defaultCountryCode ?? actual.defaultCountryCode });
      return json({ templates: config.templates, defaultCountryCode: config.defaultCountryCode });
    }
    await requireRole(request, { permiso: 'config' });
    // Si no vienen los embudos (p. ej. un navegador con la versión anterior), se conservan los guardados.
    const actual = !('vsls' in body) || !('embudos' in body) ? await getConfig({ fresh: true }) : null;
    const config = await saveConfig(actual ? { vsls: actual.vsls, embudos: actual.embudos, ...body, ...('vsl' in body && !('vsls' in body) ? { vsls: { ...actual.vsls, vsl: body.vsl } } : {}) } : body);
    return json({ config });
  } catch (e) {
    return errorResponse(e);
  }
}
