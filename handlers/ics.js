// Archivo de calendario (.ics) del directo para Apple Calendar, Outlook, etc.
//   GET /api/ics?l=<código|auto>  → todos los directos del lanzamiento (uno por vídeo con fecha)
import { getConfig } from '../lib/config-store.js';
import { currentLaunch } from '../lib/digest.js';
import { errorResponse } from '../lib/http.js';
import { milestones, icsFile, directosCalendario } from '../public/js/page.js';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const config = await getConfig();
    const asked = url.searchParams.get('l') || 'auto';
    const code = asked === 'auto' ? currentLaunch(config) : asked;
    const launch = code && config.launches[code];
    const start = launch ? milestones(launch).directo : null;
    if (start == null) return new Response('Directo no configurado', { status: 404 });
    // Todos los directos del lanzamiento en el mismo archivo (en uno de 2 días, los 2).
    const live = `${url.origin}/directo?l=${encodeURIComponent(code)}`;
    const eventos = directosCalendario(launch, milestones(launch), live).map((d) => ({ ...d, uid: d.k === 1 ? `${code}@lead-scoring` : `${code}-${d.k}@lead-scoring` }));
    const body = icsFile({ eventos });
    return new Response(body, {
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': `attachment; filename="${code}.ics"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
