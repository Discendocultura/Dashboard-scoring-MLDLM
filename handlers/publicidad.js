// Pestaña «Publicidad» de cada embudo: campañas, conjuntos y anuncios de Meta con sus métricas y avisos.
//   GET /api/publicidad?embudo=<id>&code=<lanzamiento|meteórico>&preset=hoy|30d|90d|mes-actual|mes-pasado|lanzamiento|personalizado&desde=&hasta=&fresh=1
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { publicidadEmbudo, campanasDeEmbudo } from '../lib/publicidad.js';
import { rangoDe } from '../public/js/embudo-vsl.js';
import { dayInMadrid } from '../public/js/scoring.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    await requireSession(request, { permiso: 'metricas' });
    const url = new URL(request.url);
    const q = (k) => url.searchParams.get(k) || '';
    const config = await getConfig();
    const hoy = dayInMadrid(new Date().toISOString());
    let rango = rangoDe({ preset: q('preset') || '30d', desde: q('desde'), hasta: q('hasta') }, hoy);
    // «Todo el lanzamiento»: desde el inicio de captación hasta el siguiente lanzamiento (o hoy).
    if (q('preset') === 'lanzamiento') rango = campanasDeEmbudo(config, q('embudo'), q('code'), hoy).lanzamiento || rango;
    return json(await publicidadEmbudo(config, { embudo: q('embudo'), code: q('code'), rango, fresh: q('fresh') === '1' }));
  } catch (e) {
    return errorResponse(e);
  }
}
