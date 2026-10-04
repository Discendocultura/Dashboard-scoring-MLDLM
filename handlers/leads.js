// Devuelve una página (100) de leads con la etiqueta indicada. El navegador va pidiendo
// páginas con el cursor hasta tenerlas todas, así escala a miles de leads sin timeouts.
import { requireRole } from '../lib/auth.js';
import { contactsByTag } from '../lib/ghl.js';
import { getConfig } from '../lib/config-store.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    await requireRole(request);
    const url = new URL(request.url);
    const tag = (url.searchParams.get('tag') || '').trim();
    if (!tag) return json({ error: 'Falta la etiqueta' }, 400);
    const rawCursor = url.searchParams.get('cursor');
    let cursor = null;
    if (rawCursor) {
      try {
        cursor = JSON.parse(rawCursor);
      } catch {
        return json({ error: 'Cursor no válido' }, 400);
      }
    }
    // Solo se envían al navegador los campos de fecha de compra configurados.
    const fields = [...new Set(Object.values((await getConfig()).launches).map((l) => l.compraDateField).filter(Boolean))];
    return json(await contactsByTag(tag, cursor, fields));
  } catch (e) {
    return errorResponse(e);
  }
}
