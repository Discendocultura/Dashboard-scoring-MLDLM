// Comprueba si un email está registrado (para el formulario de las páginas de vídeo
// cuando el lead llega desde el grupo de WhatsApp y el enlace no lleva su ID).
import { findContactByEmail } from '../lib/ghl.js';
import { json, readBody, errorResponse, isEmail, CORS_HEADERS } from '../lib/http.js';

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request) {
  try {
    const { email } = await readBody(request);
    if (!isEmail(email)) return json({ found: false }, 200, CORS_HEADERS);
    const contact = await findContactByEmail(email);
    return json({ found: Boolean(contact) }, 200, CORS_HEADERS);
  } catch (e) {
    return errorResponse(e, CORS_HEADERS);
  }
}
