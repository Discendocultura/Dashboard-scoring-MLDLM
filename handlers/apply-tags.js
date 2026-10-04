// Añade etiquetas de señales (p. ej. `nov26_directo_asistio`, `nov26_wa_enviado`) a varios
// contactos. Solo admite etiquetas con el formato del dashboard, nunca etiquetas arbitrarias.
// `remove` solo puede quitar etiquetas de resultado de la setter (`<código>_res_…`).
import { requireRole } from '../lib/auth.js';
import { addTags, removeTags } from '../lib/ghl.js';
import { json, readBody, errorResponse, mapLimit } from '../lib/http.js';
import { isValidSignalTag } from '../public/js/scoring.js';

export async function POST(request) {
  try {
    await requireRole(request);
    const { items } = await readBody(request);
    if (!Array.isArray(items) || items.length === 0 || items.length > 40) {
      return json({ error: 'Envía entre 1 y 40 contactos por petición' }, 400);
    }
    const okTag = (t) => typeof t === 'string' && isValidSignalTag(t);
    for (const it of items) {
      const tags = it?.tags || [];
      const remove = it?.remove || [];
      if (typeof it?.id !== 'string' || !Array.isArray(tags) || !Array.isArray(remove) || (!tags.length && !remove.length)
        || !tags.every(okTag) || !remove.every((t) => okTag(t) && /_res_[a-z_]+$/.test(t))) {
        return json({ error: 'Etiquetas no permitidas' }, 400);
      }
    }
    const results = await mapLimit(items, 4, async (it) => {
      try {
        if (it.remove?.length) await removeTags(it.id, it.remove);
        if (it.tags?.length) await addTags(it.id, it.tags);
        return { id: it.id, ok: true };
      } catch (e) {
        console.error(e);
        return { id: it.id, ok: false };
      }
    });
    return json({ results });
  } catch (e) {
    return errorResponse(e);
  }
}
