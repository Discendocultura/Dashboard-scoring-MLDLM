// Endpoint público del formulario de acceso de la página de recursos (tracker.js).
// Respuesta: { ok: true } si puede ver las clases, o { ok: false, needs: 'signup' } si no tiene la
// etiqueta de registro del lanzamiento y hay que pedirle nombre y móvil para registrarla.
import { getConfig } from '../lib/config-store.js';
import { ensureRegistered } from '../lib/access.js';
import { json, readBody, errorResponse, isEmail, CORS_HEADERS } from '../lib/http.js';

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request) {
  try {
    const { email, launch: code, name, phone, website } = await readBody(request);
    if (website) return json({ ok: false }, 200, CORS_HEADERS); // campo trampa para bots
    if (!isEmail(email)) return json({ ok: false, error: 'email' }, 200, CORS_HEADERS);
    const config = await getConfig();
    const launch = config.launches[code];
    if (!launch?.registroTag) return json({ ok: false, error: 'launch' }, 404, CORS_HEADERS);
    const result = await ensureRegistered(launch, { email, name, phone }, config);
    if (result.status === 'needs_signup') return json({ ok: false, needs: 'signup', known: result.known }, 200, CORS_HEADERS);
    return json({ ok: true, status: result.status }, 200, CORS_HEADERS);
  } catch (e) {
    return errorResponse(e, CORS_HEADERS);
  }
}
