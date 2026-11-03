// Atribución propia (lib/origen.js): tracker.js manda de qué anuncio llegó la persona en cuanto sabe quién es.
//   POST /api/origen { cid?, email?, p: primer toque, u: último toque }  (pública) → { ok }
//   GET  /api/origen (Conexiones, permiso de configuración) → { personas, conAnuncio, ultimos7, params }
// Sin llamar a GHL: solo D1. Con límite de peticiones por IP.
import { dentroDelLimite } from '../lib/intentos.js';
import { guardarOrigen, resumenOrigenes } from '../lib/origen.js';
import { requireSession } from '../lib/auth.js';
import { PARAMS_ANUNCIO } from '../public/js/origen.js';
import { json, readBody, errorResponse, CORS_HEADERS } from '../lib/http.js';

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request) {
  try {
    await requireSession(request, { permiso: 'config' });
    return json({ ...(await resumenOrigenes()), params: PARAMS_ANUNCIO });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const b = await readBody(request);
    if (!b || typeof b !== 'object' || (!b.cid && !b.email) || !b.p) return json({ error: 'Datos no válidos' }, 400, CORS_HEADERS);
    if (!(await dentroDelLimite(request, 'origen', 120))) return json({ ok: true }, 200, CORS_HEADERS);
    const ok = await guardarOrigen({ email: b.email, cid: b.cid, primero: b.p, ultimo: b.u });
    return json({ ok }, 200, CORS_HEADERS);
  } catch (e) {
    return errorResponse(e, CORS_HEADERS);
  }
}
