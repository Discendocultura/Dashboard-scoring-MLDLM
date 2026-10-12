// Emails de un embudo con su asunto, apertura, CTR y CTOR, medias e indicadores (Métricas → Emails).
//   GET /api/emails?l=<código del lanzamiento, VSL o meteórico>[&fresh=1]  → la lista de emails (sin estadísticas)
//   GET /api/emails?l=<código>&stats=<clave>,<clave>…[&fresh=1]            → estadísticas de una tanda (como mucho 8)
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { embudoDe } from '../lib/embudos.js';
import { listaEmails, statsEmails } from '../lib/emails.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    await requireSession(request, { permiso: 'metricas' });
    const url = new URL(request.url);
    const code = url.searchParams.get('l') || '';
    const emb = embudoDe(await getConfig(), code);
    if (!emb) return json({ error: 'Embudo no encontrado' }, 404);
    const fresh = url.searchParams.has('fresh');
    if (url.searchParams.has('stats')) return json({ stats: await statsEmails(url.searchParams.get('stats').split(','), { fresh }) });
    return json(await listaEmails(code, emb, { fresh }));
  } catch (e) {
    return errorResponse(e);
  }
}
