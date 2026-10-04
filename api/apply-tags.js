// Añade etiquetas de señales (p. ej. `nov26_directo_asistio`, `nov26_wa_enviado`) a varios
// contactos. Solo admite etiquetas con el formato del dashboard, nunca etiquetas arbitrarias.
import { requireRole } from '../lib/auth.js';
import { addTags } from '../lib/ghl.js';
import { json, readBody, errorResponse, mapLimit } from '../lib/http.js';
import { isValidSignalTag } from '../public/js/scoring.js';

export async function POST(request) {
  try {
    requireRole(request);
    const { items } = await readBody(request);
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      return json({ error: 'Envía entre 1 y 50 contactos por petición' }, 400);
    }
    for (const it of items) {
      if (typeof it?.id !== 'string' || !Array.isArray(it.tags) || !it.tags.length || !it.tags.every((t) => typeof t === 'string' && isValidSignalTag(t))) {
        return json({ error: 'Etiquetas no permitidas' }, 400);
      }
    }
    const results = await mapLimit(items, 4, async (it) => {
      try {
        await addTags(it.id, it.tags);
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
