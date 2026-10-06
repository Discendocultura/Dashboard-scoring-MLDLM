// Datos públicos de las páginas del embudo VSL (los lee vsl.js en las páginas de GHL).
//   GET /api/vsl?cid=<id>
// Devuelve el vídeo de la VSL, cuándo aparecen los botones, sus textos y enlaces (con el ID
// de la lead para seguir midiendo) y los vídeos de las páginas de gracias.
import { getConfig } from '../lib/config-store.js';
import { json, errorResponse, CORS_HEADERS } from '../lib/http.js';
import { withContactId } from '../public/js/scoring.js';

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const v = (await getConfig()).vsl;
    const cid = /^[A-Za-z0-9]{6,40}$/.test(url.searchParams.get('cid') || '') ? url.searchParams.get('cid') : '';
    return json({
      video: v.vslVideoUrl || '',
      botonSegundos: v.botonSegundos || 0,
      textos: { compra: v.textoCompra, llamada: v.textoLlamada },
      links: {
        compra: withContactId(v.ventaUrl || v.raicesUrl, cid),
        llamada: v.llamadaUrl || '',
      },
      embeds: { gracias: v.graciasVideoUrl || '', agenda: v.agendaVideoUrl || '' },
    }, 200, { ...CORS_HEADERS, 'cache-control': 'public, max-age=60' });
  } catch (e) {
    return errorResponse(e, CORS_HEADERS);
  }
}
