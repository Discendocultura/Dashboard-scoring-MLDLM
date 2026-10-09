// Visitas a la página de venta y a la de pago intermedia (bloques data-lsd-venta y data-lsd-pago de tracker.js).
//   POST /api/visita { launch: código | 'auto', cid, pagina: 'venta' | 'pago' }  (pública) → apunta la visita en
//        D1 (sin llamar a GHL: al abrir el carrito entran cientos a la vez). Llegar a la de pago = inició el pago.
//   GET  /api/visita?l=<código>  (dashboard) → { visitas, pago: { contacto → { primera, ultima, veces } } }.
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { currentLaunch } from '../lib/digest.js';
import { marcarVisita, visitasDe } from '../lib/entradas.js';
import { json, readBody, errorResponse, CORS_HEADERS } from '../lib/http.js';

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const lanzamiento = (config, code) => {
  const c = code === 'auto' || !code ? currentLaunch(config) : String(code);
  return c && Object.hasOwn(config.launches, c) ? c : null;
};

export async function POST(request) {
  try {
    const { launch, cid, pagina } = await readBody(request);
    if (typeof cid !== 'string' || !/^[A-Za-z0-9]{6,40}$/.test(cid)) return json({ error: 'Datos no válidos' }, 400, CORS_HEADERS);
    const code = lanzamiento(await getConfig(), launch);
    if (!code) return json({ error: 'Lanzamiento desconocido' }, 404, CORS_HEADERS);
    await marcarVisita(code, cid, Date.now(), pagina === 'pago' ? 'pago' : 'venta');
    return json({ ok: true }, 200, CORS_HEADERS);
  } catch (e) {
    return errorResponse(e, CORS_HEADERS);
  }
}

export async function GET(request) {
  try {
    await requireSession(request, { permiso: ['hoy', 'leads', 'llamadas', 'metricas'] });
    const code = lanzamiento(await getConfig(), new URL(request.url).searchParams.get('l'));
    if (!code) return json({ visitas: {}, pago: {} });
    const [visitas, pago] = await Promise.all([visitasDe(code), visitasDe(code, 'pago')]);
    return json({ code, visitas, pago });
  } catch (e) {
    return errorResponse(e);
  }
}
