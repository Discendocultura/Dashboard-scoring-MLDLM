// Resumen para el propio cliente (portal de solo lectura del rol «Cliente»; la agencia también lo ve).
//   GET /api/resumen[?fresh=1] → cifras agregadas de cada embudo (sin datos personales de los leads) y el catálogo de embudos
//   GET /api/resumen?embudo=<id>[&l=<lanzamiento>][&periodo=7d|30d|90d|mes-actual|mes-pasado] → ese embudo
import { requireSession } from '../lib/auth.js';
import { resumenParaCliente, resumenEmbudo } from '../lib/resumen.js';
import { clienteActual } from '../lib/cliente.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    const s = await requireSession(request, { permiso: 'resumen', cliente: true });
    // Recalcular a demanda solo la agencia (el cliente ve lo de los últimos 15 minutos).
    const url = new URL(request.url);
    const fresh = url.searchParams.has('fresh') && s.role === 'admin';
    // Un embudo concreto (el cliente elige cuál ver; en lanzamientos, cuál; en VSL, el periodo).
    const embudo = url.searchParams.get('embudo');
    if (embudo) {
      return json({ cliente: clienteActual().nombre, detalle: await resumenEmbudo({ embudo, l: url.searchParams.get('l') || '', periodo: url.searchParams.get('periodo') || '30d', fresh }) });
    }
    return json({ cliente: clienteActual().nombre, ...(await resumenParaCliente({ fresh })) });
  } catch (e) {
    return errorResponse(e);
  }
}
