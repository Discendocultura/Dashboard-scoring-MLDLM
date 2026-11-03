// Skool → AlquimIA: los miembros de la comunidad de pago, importados de su CSV, como ventas reales.
//   GET  /api/skool?op=ventas&desde=…&hasta=…  → (equipo) los miembros guardados que se unieron en ese periodo (ms)
//   POST /api/skool?op=importar { miembros, cambio } → (equipo, «config») guarda o actualiza cada miembro (por su email)
//   POST /api/skool?op=etiquetar { items: [{ email, tag }] } → (equipo, «config») pone la etiqueta de alumno en GHL
//        (≤25 por petición; el contacto se busca por email y, si no está en GHL, se dice y no se crea)
import { requireSession } from '../lib/auth.js';
import { leerJSON, guardarJSON, reintentando } from '../lib/store.js';
import { findContactByEmail, addTags } from '../lib/ghl.js';
import { json, readBody, errorResponse, mapLimit } from '../lib/http.js';
import { ventaSkool, juntarSkool, TAG_ALUMNO_OK } from '../public/js/skool.js';

const CLAVE = 'lsd_skool_miembros';
const MAX = 5000;

export async function GET(request) {
  try {
    await requireSession(request);
    const url = new URL(request.url);
    const desde = Number(url.searchParams.get('desde')) || 0;
    const hasta = Number(url.searchParams.get('hasta')) || Date.now() + 86_400_000;
    const { ventas = [] } = (await leerJSON(CLAVE, () => ({ ventas: [] }))) || {};
    return json({ ventas: ventas.filter((v) => v.fecha >= desde && v.fecha <= hasta), total: ventas.length });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const op = new URL(request.url).searchParams.get('op');
    await requireSession(request, { permiso: 'config' });
    const body = await readBody(request);
    if (op === 'importar') {
      const cambio = Number(body.cambio);
      const entrada = (Array.isArray(body.miembros) ? body.miembros : []).slice(0, MAX)
        .map((m) => ventaSkool(m, { cambio: cambio > 0 && cambio < 10 ? cambio : 1 })).filter(Boolean);
      if (!entrada.length) return json({ error: 'Ningún miembro con email y fecha de alta válidos' }, 400);
      const r = await reintentando(async () => {
        const dato = (await leerJSON(CLAVE, () => ({ ventas: [] }))) || { ventas: [] };
        const j = juntarSkool(dato.ventas || [], entrada);
        await guardarJSON(CLAVE, { ventas: j.lista.slice(-MAX) }, { motivo: `Skool: ${j.nuevos} miembros nuevos, ${j.actualizados} actualizados` });
        return { nuevos: j.nuevos, actualizados: j.actualizados };
      });
      return json({ ok: true, ...r, descartados: (body.miembros?.length || 0) - entrada.length });
    }
    if (op === 'etiquetar') {
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length || items.length > 25) return json({ error: 'Envía entre 1 y 25 miembros por petición' }, 400);
      if (!items.every((it) => typeof it?.email === 'string' && /^[^@\s]+@[^@\s]+$/.test(it.email) && TAG_ALUMNO_OK.test(it.tag || ''))) {
        return json({ error: 'Etiqueta no permitida: solo minúsculas, números y guiones (p. ej. alumno-claves-premium)' }, 400);
      }
      const results = await mapLimit(items, 4, async (it) => {
        try {
          const c = await findContactByEmail(it.email);
          if (!c?.id) return { email: it.email, ok: false, motivo: 'no está en GHL' };
          await addTags(c.id, [it.tag]);
          return { email: it.email, ok: true, id: c.id };
        } catch (e) {
          console.error('Skool etiquetar', e.message);
          return { email: it.email, ok: false, motivo: 'error de GHL' };
        }
      });
      return json({ results });
    }
    return json({ error: 'Operación desconocida' }, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
