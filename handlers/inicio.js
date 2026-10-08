// Inicio del cliente (todos sus embudos de un vistazo).
//   GET /api/inicio?parte=lista | parte=embudo&id=… | parte=meteorico&id=… | parte=agenda  [&fresh=1]
import { requireSession } from '../lib/auth.js';
import { inicioCliente } from '../lib/inicio.js';
import { clienteActual } from '../lib/cliente.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    await requireSession(request, { permiso: 'metricas' });
    const url = new URL(request.url);
    const parte = url.searchParams.get('parte') || 'lista';
    return json({ cliente: clienteActual().nombre, parte, ...(await inicioCliente({ parte, id: url.searchParams.get('id') || '', fresh: url.searchParams.has('fresh') })) });
  } catch (e) {
    return errorResponse(e);
  }
}
