// Calendario del cliente: el mismo en todos sus embudos. Devuelve las tareas con fecha y los eventos
// de todos los lanzamientos, VSL y meteóricos (cada uno con el código de su embudo). Los hitos los
// calcula el navegador con la configuración.
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { getTareas } from '../lib/tareas.js';
import { getEventos } from '../lib/eventos.js';
import { json, errorResponse } from '../lib/http.js';

const MAX_EMBUDOS = 120;

export async function GET(request) {
  try {
    await requireSession(request);
    const config = await getConfig();
    const codes = [...Object.keys(config.launches || {}), ...Object.keys(config.vsls || {}), ...Object.keys(config.meteoricos || {})].slice(0, MAX_EMBUDOS);
    const porCodigo = await Promise.all(codes.map(async (code) => {
      const [tareas, eventos] = await Promise.all([getTareas(code).catch(() => []), getEventos(code).catch(() => [])]);
      return {
        tareas: tareas.filter((t) => t.fecha).map((t) => ({ ...t, code })),
        eventos: eventos.map((e) => ({ ...e, code })),
      };
    }));
    return json({ tareas: porCodigo.flatMap((x) => x.tareas), eventos: porCodigo.flatMap((x) => x.eventos) });
  } catch (e) {
    return errorResponse(e);
  }
}
