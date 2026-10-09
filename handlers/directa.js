// Embudos de venta directa / producto de entrada (low ticket).
//   GET  /api/directa?d=<id>&preset=30d|7d|…&desde=&hasta=&fresh=1  (dashboard) → métricas del rango
//   POST { op: 'visita', d, pagina, v }  (pública: bloque data-lsd-directa de tracker.js) → visitante único
// Las ventas salen de la etiqueta de compra (y la de cada bump, upsell y downsell); las visitas, de D1;
// la inversión, de Meta (campañas con el filtro). Se guarda 5 minutos para todo el equipo.
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { metaConfigured } from '../lib/meta.js';
import { marcarVisitaDirecta } from '../lib/entradas.js';
import { metricasDirectaRango } from '../lib/directa.js';
import { pendientesDirecta, conParte, PAGINA_IDS } from '../public/js/directa.js';
import { rangoDe } from '../public/js/embudo-vsl.js';
import { dayInMadrid } from '../public/js/scoring.js';
import { json, readBody, errorResponse, CORS_HEADERS } from '../lib/http.js';

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });
const directaDe = (config, id) => (config.directas && Object.hasOwn(config.directas, id) ? config.directas[id] : null);

export async function GET(request) {
  try {
    await requireSession(request, { permiso: ['metricas', 'leads'] });
    const url = new URL(request.url);
    const id = url.searchParams.get('d') || '';
    const config = await getConfig();
    const d = directaDe(config, id);
    if (!d) throw bad('Embudo no encontrado', 404);
    const hoy = dayInMadrid(new Date().toISOString());
    const rango = rangoDe({ preset: url.searchParams.get('preset') || '30d', mes: url.searchParams.get('mes') || '', semana: url.searchParams.get('semana') || 0, desde: url.searchParams.get('desde') || '', hasta: url.searchParams.get('hasta') || '' }, hoy);
    const fresh = url.searchParams.get('fresh') === '1';
    const valor = await metricasDirectaRango(id, d, rango, { fresh });
    return json({ id, nombre: d.name, ...valor, pendientes: pendientesDirecta(d), metaConectado: metaConfigured() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const body = await readBody(request);
    if (body.op !== 'visita') return json({ error: 'Operación no válida' }, 400, CORS_HEADERS);
    const id = String(body.d || '');
    const pagina = String(body.pagina || '');
    const v = String(body.v || '');
    if (!PAGINA_IDS.includes(pagina) || !/^[A-Za-z0-9]{6,40}$/.test(v)) return json({ error: 'Datos no válidos' }, 400, CORS_HEADERS);
    const config = await getConfig();
    const d = directaDe(config, id);
    if (!d || !conParte(d, 'visitas')) return json({ ok: true }, 200, CORS_HEADERS);
    await marcarVisitaDirecta(id, pagina, v);
    return json({ ok: true }, 200, CORS_HEADERS);
  } catch (e) {
    return errorResponse(e, CORS_HEADERS);
  }
}
