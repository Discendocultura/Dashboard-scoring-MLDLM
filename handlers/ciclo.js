// Ciclo de compra de TODAS las compradoras del producto principal (no solo las del lanzamiento):
// días desde que el contacto se creó en GHL hasta su fecha de compra.
//   GET /api/ciclo?l=<código del lanzamiento o de la VSL>[&fresh=1]
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { embudoDe } from '../lib/embudos.js';
import { todosLosLeads } from '../lib/resumen.js';
import { clienteActual } from '../lib/cliente.js';
import { cicloDeContactos } from '../public/js/ciclo.js';
import { json, errorResponse } from '../lib/http.js';

const cache = new Map();
const TTL = 60 * 60_000; // cambia despacio: una hora

export async function GET(request) {
  try {
    await requireSession(request, { permiso: ['metricas', 'leads'] });
    const url = new URL(request.url);
    const emb = embudoDe(await getConfig(), url.searchParams.get('l') || '');
    if (!emb) return json({ error: 'Embudo no encontrado' }, 404);
    const { compraTag, compraDateField } = emb;
    if (!compraTag || !compraDateField) return json({ ciclo: null, motivo: 'Falta la etiqueta de compra o el campo de fecha de compra.' });
    const clave = `${clienteActual().id}:${compraTag}:${compraDateField}`;
    const hit = cache.get(clave);
    if (!url.searchParams.has('fresh') && hit && hit.at > Date.now() - TTL) return json(hit.value);
    const contactos = await todosLosLeads(compraTag, [compraDateField]);
    const value = { ciclo: cicloDeContactos(contactos, compraDateField), compradoras: contactos.length, etiqueta: compraTag, actualizado: new Date().toISOString() };
    cache.set(clave, { at: Date.now(), value });
    return json(value);
  } catch (e) {
    return errorResponse(e);
  }
}
