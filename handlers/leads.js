// Devuelve una página (100) de leads con la etiqueta indicada. El navegador va pidiendo
// páginas con el cursor hasta tenerlas todas, así escala a miles de leads sin timeouts.
import { requireRole } from '../lib/auth.js';
import { contactsByTag, aplicarCamposFormulario } from '../lib/ghl.js';
import { getConfig } from '../lib/config-store.js';
import { json, errorResponse } from '../lib/http.js';
import { ENCUESTA_PREGUNTAS } from '../public/js/encuesta.js';

export async function GET(request) {
  try {
    await requireRole(request, { permiso: ['hoy', 'llamadas', 'leads', 'metricas', 'objetivos', 'avatar', 'comparar'] });
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
    // Solo se envían al navegador los campos configurados: fecha de compra y preguntas de la encuesta.
    const config = await getConfig();
    const formAds = config.formAds || {};
    const fields = [...new Set(Object.values(config.launches)
      .map((l) => l.compraDateField).concat(config.vsl?.compraDateField, config.vsl?.registroDateField, ENCUESTA_PREGUNTAS.map((p) => p.id), formAds.campaign, formAds.adset, formAds.ad).filter(Boolean))];
    const page = await contactsByTag(tag, cursor, fields);
    page.contacts = page.contacts.map((c) => aplicarCamposFormulario(c, formAds));
    return json(page);
  } catch (e) {
    return errorResponse(e);
  }
}
