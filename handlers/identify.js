// Comprueba si un email está registrado (formulario de acceso de la página de recursos y de los
// vídeos cuando el lead llega sin su ID, p. ej. desde el grupo de WhatsApp).
// Con `launch`, además comprueba que tenga la etiqueta de registro de ese lanzamiento.
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
    const [contact, config] = await Promise.all([findContactByEmail(email), launch ? getConfig() : null]);
    const registroTag = config?.launches?.[launch]?.registroTag;
    const registered = Boolean(contact) && (!registroTag || contact.tags.map((t) => t.toLowerCase()).includes(registroTag));
    return json({ found: Boolean(contact), registered }, 200, CORS_HEADERS);
  } catch (e) {
    return errorResponse(e, CORS_HEADERS);
  }
}
