// Calendario del cliente: el mismo en todos sus embudos. Devuelve las tareas con fecha y los eventos
// de todos los lanzamientos, VSL y meteóricos (cada uno con el código de su embudo). Los hitos los
// calcula el navegador con la configuración.
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { storeGetPrefijo } from '../lib/store.js';
import { json, errorResponse } from '../lib/http.js';

const MAX_EMBUDOS = 120;
const lista = (txt) => {
  try { const v = JSON.parse(txt || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};

export async function GET(request) {
  try {
    await requireSession(request);
    const config = await getConfig();
    const codes = [...Object.keys(config.launches || {}), ...Object.keys(config.vsls || {}), ...Object.keys(config.meteoricos || {}), ...Object.keys(config.directas || {})].slice(0, MAX_EMBUDOS);
    // Todas las tareas y todos los eventos del cliente en dos consultas (no dos por embudo).
    const [tareas, eventos] = await Promise.all([storeGetPrefijo('lsd_tareas_'), storeGetPrefijo('lsd_eventos_')]);
    const porCodigo = codes.map((code) => ({
      tareas: lista(tareas[`lsd_tareas_${code}`]).filter((t) => t.fecha).map((t) => ({ ...t, code })),
      eventos: lista(eventos[`lsd_eventos_${code}`]).map((e) => ({ ...e, code })),
    }));
    return json({ tareas: porCodigo.flatMap((x) => x.tareas), eventos: porCodigo.flatMap((x) => x.eventos) });
  } catch (e) {
    return errorResponse(e);
  }
}
