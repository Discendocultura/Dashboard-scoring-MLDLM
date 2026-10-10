// Conexión con SendFlow (grupos de WhatsApp).
//   GET /api/sendflow?op=probar → { configurada, variable, ok, campanas: [...], analitica: { id, ok, error } , error }
// Solo quien configura (permiso «config»): sirve para comprobar que la clave funciona.
import { requireSession } from '../lib/auth.js';
import { sendflowConfigurado, variableSendflow, campanasSendflow, analiticaSendflow } from '../lib/sendflow.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    await requireSession(request, { permiso: 'config' });
    const op = new URL(request.url).searchParams.get('op') || 'probar';
    if (op !== 'probar') return json({ error: 'Operación no válida' }, 400);
    const variable = variableSendflow();
    if (!sendflowConfigurado()) return json({ configurada: false, variable, ok: false });
    let campanas;
    try {
      campanas = await campanasSendflow();
    } catch (e) {
      return json({ configurada: true, variable, ok: false, error: e.publicMessage || e.message });
    }
    // La analítica es lo que más falla con claves antiguas (403): se prueba con la primera campaña.
    const primera = campanas.find((c) => !c.archivada) || campanas[0];
    let analitica = null;
    if (primera) {
      try {
        const a = await analiticaSendflow(primera.id);
        analitica = { id: primera.id, nombre: primera.nombre, ok: true, entradas: a.entradas.total, salidas: a.salidas.total, clics: a.clics.total };
      } catch (e) {
        analitica = { id: primera.id, nombre: primera.nombre, ok: false, error: e.publicMessage || e.message };
      }
    }
    return json({ configurada: true, variable, ok: true, campanas: campanas.slice(0, 100), total: campanas.length, analitica });
  } catch (e) {
    return errorResponse(e);
  }
}
