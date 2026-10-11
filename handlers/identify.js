// Comprueba si un email está registrado (formulario de acceso de la página de recursos y de los
// vídeos cuando el lead llega sin su ID, p. ej. desde el grupo de WhatsApp).
// Con `launch`, además comprueba que tenga la etiqueta de registro de ese lanzamiento.
import { dentroDelLimite } from '../lib/intentos.js';
import { findContactByEmail } from '../lib/ghl.js';
import { getConfig } from '../lib/config-store.js';
import { json, readBody, errorResponse, isEmail, CORS_HEADERS } from '../lib/http.js';

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request) {
  try {
    const { email, launch } = await readBody(request);
    if (!isEmail(email)) return json({ found: false, registered: false }, 200, CORS_HEADERS);
    if (!(await dentroDelLimite(request, 'identificar', 60))) return json({ found: false, registered: false, error: 'rate' }, 429, CORS_HEADERS);
    const [contact, config] = await Promise.all([findContactByEmail(email), launch ? getConfig() : null]);
    const registroTag = config?.launches?.[launch]?.registroTag;
    const registered = Boolean(contact) && (!registroTag || contact.tags.map((t) => t.toLowerCase()).includes(registroTag));
    // `found` ya no dice si el email existe en GHL (servía para averiguar si alguien es contacto del cliente).
    return json({ found: registered, registered }, 200, CORS_HEADERS);
  } catch (e) {
    return errorResponse(e, CORS_HEADERS);
  }
}
