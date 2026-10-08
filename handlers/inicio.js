// Inicio del cliente (todos sus embudos de un vistazo). GET /api/inicio?parte=embudos|meteoricos|agenda[&fresh=1]
import { requireSession } from '../lib/auth.js';
import { inicioCliente } from '../lib/inicio.js';
import { clienteActual } from '../lib/cliente.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    await requireSession(request, { permiso: 'metricas' });
    const url = new URL(request.url);
    const parte = url.searchParams.get('parte') || 'embudos';
    return json({ cliente: clienteActual().nombre, parte, ...(await inicioCliente({ parte, fresh: url.searchParams.has('fresh') })) });
  } catch (e) {
    return errorResponse(e);
  }
}
