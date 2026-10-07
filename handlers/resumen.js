// Resumen para el propio cliente (portal de solo lectura del rol «Cliente»; la agencia también lo ve).
//   GET /api/resumen[?fresh=1] → cifras agregadas de cada embudo (sin datos personales de los leads)
import { requireSession } from '../lib/auth.js';
import { resumenParaCliente } from '../lib/resumen.js';
import { clienteActual } from '../lib/cliente.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    const s = await requireSession(request, { permiso: 'resumen', cliente: true });
    // Recalcular a demanda solo la agencia (el cliente ve lo de los últimos 15 minutos).
    const fresh = new URL(request.url).searchParams.has('fresh') && s.role === 'admin';
    return json({ cliente: clienteActual().nombre, ...(await resumenParaCliente({ fresh })) });
  } catch (e) {
    return errorResponse(e);
  }
}
