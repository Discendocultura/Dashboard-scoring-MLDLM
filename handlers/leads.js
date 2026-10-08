// Devuelve una página (100) de leads con la etiqueta indicada. El navegador va pidiendo
// páginas con el cursor hasta tenerlas todas, así escala a miles de leads sin timeouts.
import { requireRole } from '../lib/auth.js';
import { contactsByTag, aplicarCamposFormulario } from '../lib/ghl.js';
import { getConfig } from '../lib/config-store.js';
import { json, errorResponse } from '../lib/http.js';

// Todas las etiquetas que aparecen en la configuración de lanzamientos, VSL y meteóricos (campos «…Tag»).
function etiquetasDeEmbudos(config) {
  const out = new Set();
  const recorrer = (o, prof = 0) => {
    if (!o || typeof o !== 'object' || prof > 5) return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string' && /tag$/i.test(k) && v.trim()) out.add(v.trim().toLowerCase());
      else if (v && typeof v === 'object') recorrer(v, prof + 1);
    }
  };
  for (const grupo of [config.launches, config.vsls, config.meteoricos]) recorrer(grupo);
  return out;
}

export async function GET(request) {
  try {
    await requireRole(request, { permiso: ['hoy', 'llamadas', 'leads', 'metricas', 'objetivos', 'avatar', 'comparar'] });
    const url = new URL(request.url);
    const tag = (url.searchParams.get('tag') || '').trim();
    if (!tag) return json({ error: 'Falta la etiqueta' }, 400);
    const config = await getConfig();
    // Solo etiquetas de los embudos configurados (registro, VIP, compra, encuesta, planes…): no cualquier
    // etiqueta de la subcuenta de GHL.
    if (!etiquetasDeEmbudos(config).has(tag.toLowerCase())) return json({ error: 'Esa etiqueta no es de ningún embudo configurado' }, 403);
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
    const formAds = config.formAds || {};
    const fields = [...new Set(Object.values(config.launches)
      .map((l) => l.compraDateField).concat(Object.values(config.vsls || {}).flatMap((v) => [v.compraDateField, v.registroDateField]), (config.encuesta || []).map((p) => p.id), formAds.campaign, formAds.adset, formAds.ad).filter(Boolean))];
    const page = await contactsByTag(tag, cursor, fields);
    page.contacts = page.contacts.map((c) => aplicarCamposFormulario(c, formAds));
    return json(page);
  } catch (e) {
    return errorResponse(e);
  }
}
