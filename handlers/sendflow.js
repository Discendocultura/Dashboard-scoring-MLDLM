// Conexión con SendFlow (grupos de WhatsApp).
//   GET /api/sendflow?op=probar[&reintentar=1] → { configurada, variable, ok, campanas, analitica, error, freno, formato }
// Solo quien configura (permiso «config»). Hace como mucho 2 peticiones a SendFlow (campañas y una analítica),
// guardadas unos minutos, y no llama nada mientras SendFlow tenga la clave bloqueada (su límite es estricto).
import { requireSession } from '../lib/auth.js';
import { sendflowConfigurado, variableSendflow, campanasSendflow, analiticaSendflow, formatoClave, frenoSendflow, quitarFreno } from '../lib/sendflow.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    await requireSession(request, { permiso: 'config' });
    const url = new URL(request.url);
    if ((url.searchParams.get('op') || 'probar') !== 'probar') return json({ error: 'Operación no válida' }, 400);
    const variable = variableSendflow();
    if (!sendflowConfigurado()) return json({ configurada: false, variable, ok: false });
    // «He cambiado la clave»: se puede volver a probar antes de tiempo, salvo si SendFlow la tiene bloqueada.
    let freno = await frenoSendflow();
    if (freno && !freno.bloqueo && url.searchParams.get('reintentar') === '1') { await quitarFreno(); freno = null; }
    if (freno) return json({ configurada: true, variable, ok: false, freno, formato: formatoClave() });
    let campanas;
    try {
      campanas = await campanasSendflow();
    } catch (e) {
      return json({ configurada: true, variable, ok: false, error: e.publicMessage || e.message, freno: e.freno || null, formato: formatoClave() });
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
