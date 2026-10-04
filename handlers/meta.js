// Inversión en Meta Ads durante el lanzamiento (desde el inicio de captación hasta el inicio del
// siguiente lanzamiento o hoy) y nombres de campañas / anuncios para la tabla de origen.
import { requireRole } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { adSpend, metaConfigured } from '../lib/meta.js';
import { json, errorResponse } from '../lib/http.js';
import { nextLaunchStart } from '../public/js/metrics.js';

const today = () => new Date().toISOString().slice(0, 10);
const dayBefore = (d) => new Date(Date.parse(`${d}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

export async function GET(request) {
  try {
    await requireRole(request);
    if (!metaConfigured()) return json({ configured: false });
    const code = new URL(request.url).searchParams.get('launch');
    const config = await getConfig();
    const launch = config.launches[code];
    if (!launch?.inicioCaptacion) return json({ configured: true, error: 'Falta el inicio de captación del lanzamiento' });
    const next = nextLaunchStart(config, code);
    const until = next ? dayBefore(next) : today();
    const data = await adSpend({ since: launch.inicioCaptacion, until: until < launch.inicioCaptacion ? launch.inicioCaptacion : until, filter: launch.metaFiltro || '' });
    return json({ configured: true, since: launch.inicioCaptacion, until, ...data });
  } catch (e) {
    return errorResponse(e);
  }
}
