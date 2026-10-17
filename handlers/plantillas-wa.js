// Plantillas de WhatsApp (de pago) desde el dashboard: botón «📨 Plantilla» de un lead y envío masivo a los marcados.
//   GET  /api/plantillas-wa?l=<código>                → { envios: [...] } (para el gasto y el retorno)
//   POST /api/plantillas-wa { l, tag, ids: [≤20] }     → pone a cada contacto la etiqueta de la plantilla (su workflow de
//        GHL la envía) y la de contactada, y apunta el envío con su precio. El navegador manda los grandes de 20 en 20.
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { addTags } from '../lib/ghl.js';
import { registrarActividadEquipo, eventosDeEtiquetas } from '../lib/actividad-equipo.js';
import { leerEnviosPlantillas, registrarEnvioPlantillas } from '../lib/envios-plantillas.js';
import { json, readBody, errorResponse, mapLimit } from '../lib/http.js';
import { tagFor } from '../public/js/scoring.js';

const existe = (config, code) => Boolean(code && (config.launches?.[code] || config.vsls?.[code] || config.meteoricos?.[code] || config.directas?.[code]));

export async function GET(request) {
  try {
    await requireSession(request, { permiso: ['hoy', 'leads', 'rendimiento'] });
    const code = new URL(request.url).searchParams.get('l') || '';
    if (!existe(await getConfig(), code)) return json({ error: 'No encontrado' }, 404);
    return json({ envios: await leerEnviosPlantillas(code) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const s = await requireSession(request, { permiso: ['hoy', 'leads'] });
    const { l: code, tag, ids } = await readBody(request);
    const config = await getConfig();
    if (!existe(config, code)) return json({ error: 'Lanzamiento no encontrado' }, 404);
    const pl = (config.setterIa?.plantillas || []).find((p) => p.tag === tag);
    if (!pl) return json({ error: 'Esa plantilla no está en Conexiones → Setter IA' }, 400);
    if (!Array.isArray(ids) || !ids.length || ids.length > 20 || !ids.every((id) => typeof id === 'string' && /^[A-Za-z0-9]{6,40}$/.test(id))) {
      return json({ error: 'Envía entre 1 y 20 contactos por petición' }, 400);
    }
    // En los lanzamientos, además, «contactada» (cuenta en Rendimiento del equipo como un WhatsApp).
    const wa = config.launches?.[code] ? tagFor(code, 'wa_enviado') : '';
    const results = await mapLimit([...new Set(ids)], 4, async (id) => {
      try { await addTags(id, [tag, ...(wa ? [wa] : [])]); return { id, ok: true }; } catch (e) { console.error(e); return { id, ok: false }; }
    });
    const ok = results.filter((r) => r.ok).map((r) => r.id);
    const por = s.user?.nombre || (s.role === 'admin' ? 'Admin' : 'Setter');
    await registrarEnvioPlantillas(code, { at: new Date().toISOString(), tag, nombre: pl.nombre, ids: ok, precio: pl.precio, por });
    if (wa) {
      for (const [c, eventos] of eventosDeEtiquetas(ok.map((id) => ({ id, tags: [wa] })), { uid: s.uid, nombre: por })) {
        await registrarActividadEquipo(c, eventos).catch((e) => console.error('Actividad del equipo', e.message));
      }
    }
    return json({ results, enviadas: ok.length, coste: Math.round(ok.length * pl.precio * 100) / 100 });
  } catch (e) {
    return errorResponse(e);
  }
}
