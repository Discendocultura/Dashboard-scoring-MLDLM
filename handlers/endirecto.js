// Panel «En directo» (Comercial → En directo): lo que pasa el día del webinar, minuto a minuto.
//   GET /api/endirecto?l=<código>  (dashboard) →
//     { directo, apertura, cierre, esperando, inscritas, entraron, entradas: [ms…], visitas: { total, recientes },
//       vip, ventas, leads, ghlActualizado, ghlError }
// Las leads no pasan por aquí: lo miran 3-4 personas del equipo. Lo de la pantalla de espera, el directo y
// la página de venta sale de D1 (gratis); VIP, ventas y leads registradas, de GHL (5 recuentos), guardados 1 minuto y
// compartidos por todos los que tengan el panel abierto. Si GHL falla, se enseña el último dato bueno.
import { cacheCompartida } from '../lib/store.js';
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { countByTag } from '../lib/ghl.js';
import { clienteActual } from '../lib/cliente.js';
import { resumenDirecto, contarVisitasRecientes } from '../lib/entradas.js';
import { json, errorResponse } from '../lib/http.js';
import { milestones, madridToEpoch } from '../public/js/page.js';
import { videosDe, esEnDirecto } from '../public/js/videos.js';
import { tagFor } from '../public/js/scoring.js';

const cacheGhl = new Map();
async function ventasGhl(code, launch) {
  const key = `${clienteActual().id}:${code}`;
  const hit = cacheGhl.get(key);
  if (hit && hit.at > Date.now() - 60_000) return hit;
  try {
    const cuenta = (t) => (t ? countByTag(t) : Promise.resolve(0));
    // Compartido por todos los servidores (varias personas miran el panel a la vez, cada minuto).
    const [vip, vipPrev, compra, compraPrev, leads] = await cacheCompartida(`endirecto|${code}`, 55_000, () => Promise.all([
      cuenta(launch.vipTag), cuenta(launch.vipTag ? tagFor(code, 'vip_previo') : ''),
      cuenta(launch.compraTag), cuenta(launch.compraTag ? tagFor(code, 'compra_previo') : ''),
      // Leads registradas (para el % de asistencia sobre el total).
      cuenta(launch.registroTag),
    ]));
    const v = { at: Date.now(), vip: Math.max(0, vip - vipPrev), ventas: Math.max(0, compra - compraPrev), leads };
    cacheGhl.set(key, v);
    return v;
  } catch (e) {
    console.error('En directo', e);
    return hit ? { ...hit, error: true } : { at: null, vip: null, ventas: null, leads: null, error: true };
  }
}

export async function GET(request) {
  try {
    await requireSession(request, { permiso: 'endirecto' });
    const code = new URL(request.url).searchParams.get('l') || '';
    const config = await getConfig();
    const launch = Object.hasOwn(config.launches, code) ? config.launches[code] : null;
    if (!launch) return json({ error: 'Lanzamiento no encontrado' }, 404);
    const now = Date.now();
    const m = milestones(launch);
    // El directo de hoy (o el siguiente; en lanzamientos de varios vídeos, el primero en directo que no ha terminado).
    const vids = videosDe(launch).map((v, i) => ({ v, mo: m.videos[i] })).filter(({ v }) => v.k === 1 || esEnDirecto(v));
    const actual = vids.find(({ mo }) => mo.inicio != null && (mo.post == null || now < mo.post)) || vids.at(-1);
    const k = actual?.v.k || 1;
    const [d1, visitas, ghl] = await Promise.all([resumenDirecto(code, k, now), contarVisitasRecientes(code, now - 15 * 60_000), ventasGhl(code, launch)]);
    return json({
      code, nombre: launch.name, now, video: actual?.v.nombre || 'Directo', k,
      directo: actual?.mo.inicio ?? null, finDirecto: actual?.mo.post ?? null,
      apertura: madridToEpoch(launch.aperturaCarrito) ?? m.directo ?? null, cierre: m.cierre ?? null,
      ...d1,
      visitas,
      vip: ghl.vip, ventas: ghl.ventas, leads: ghl.leads ?? null, ghlActualizado: ghl.at, ghlError: Boolean(ghl.error),
      conVip: Boolean(launch.vipTag),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
