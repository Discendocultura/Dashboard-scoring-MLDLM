// Archivo de calendario (.ics) del directo para Apple Calendar, Outlook, etc.
//   GET /api/ics?l=<código|auto>
import { getConfig } from '../lib/config-store.js';
import { currentLaunch } from '../lib/digest.js';
import { errorResponse } from '../lib/http.js';
import { milestones, icsFile } from '../public/js/page.js';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const config = await getConfig();
    const asked = url.searchParams.get('l') || 'auto';
    const code = asked === 'auto' ? currentLaunch(config) : asked;
    const launch = code && config.launches[code];
    const start = launch ? milestones(launch).directo : null;
    if (start == null) return new Response('Directo no configurado', { status: 404 });
    const body = icsFile({ title: launch.name || 'Clase en directo', start, url: `${url.origin}/directo?l=${encodeURIComponent(code)}`, uid: `${code}@lead-scoring` });
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
