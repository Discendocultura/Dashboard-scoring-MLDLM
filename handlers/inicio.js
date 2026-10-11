// Inicio del cliente (todos sus embudos de un vistazo).
//   GET /api/inicio?parte=lista | parte=embudo&id=… | parte=meteorico&id=… | parte=agenda | parte=anuncios  [&periodo=…&desde=&hasta=] [&fresh=1]
import { requireSession } from '../lib/auth.js';
import { inicioCliente } from '../lib/inicio.js';
import { clienteActual } from '../lib/cliente.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    await requireSession(request, { permiso: 'metricas' });
    const url = new URL(request.url);
    const parte = url.searchParams.get('parte') || 'lista';
    return json({ cliente: clienteActual().nombre, parte, ...(await inicioCliente({ parte, id: url.searchParams.get('id') || '', fresh: url.searchParams.has('fresh'), periodo: url.searchParams.get('periodo') || '30d', desde: url.searchParams.get('desde') || '', hasta: url.searchParams.get('hasta') || '' })) });
  } catch (e) {
    return errorResponse(e);
  }
}
