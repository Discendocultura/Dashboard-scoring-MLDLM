// Pipeline de GHL ligado a una venta directa (⚙️ Configurar el embudo → «Pipeline de GHL»): el tablero de Comercial.
//   GET  /api/pipeline?d=<embudo>[&fresh=1] → { ligado, pipeline, etapaEntrada, oportunidades, total, truncado }
//   POST { d, op: 'mover', oppId, contactId, etapa } → mueve la oportunidad a otra etapa del mismo pipeline
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { getPipelines, searchOpportunities, updateOpportunity } from '../lib/ghl.js';
import { cacheCompartida, leerCompartida, guardarCompartida } from '../lib/store.js';
import { json, readBody, errorResponse } from '../lib/http.js';
import { pipelineLigadoDe } from '../public/js/directa.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });
const ID_RE = /^[A-Za-z0-9_-]{2,64}$/;
const PAGINAS = 20; // hasta 2.000 oportunidades (las más nuevas primero; Cloudflare deja 50 peticiones por visita)

function permisos(e) {
  if (/GHL 401|GHL 403|not authorized|scope/i.test(String(e.message))) return bad('El token de GHL no tiene permiso para las oportunidades: añade «opportunities» (lectura y escritura) a la integración privada.', 502);
  return e;
}

// El embudo y su pipeline elegido (null si no está ligado).
async function contexto(id) {
  const config = await getConfig();
  const d = config.directas && Object.hasOwn(config.directas, id) ? config.directas[id] : null;
  if (!d) throw bad('Embudo no encontrado', 404);
  if (!pipelineLigadoDe(d)) return { d, pipeline: null };
  const p = (await getPipelines().catch((e) => { throw permisos(e); })).find((x) => x.id === d.compraPipeline);
  if (!p) throw bad('El pipeline elegido ya no está en GHL: elige otro en ⚙️ Configurar el embudo → «Pipeline de GHL».', 404);
  const stages = [...(p.stages || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((s) => ({ id: s.id, name: s.name, color: s.color || '' }));
  return { d, pipeline: { id: p.id, name: p.name, stages } };
}

const estadoDe = (nombre) => (/^(✅\s*)?(venta|ganad|won)/i.test(nombre) ? 'won' : /perdid|lost/i.test(nombre) ? 'lost' : 'open');

// Las oportunidades del pipeline, compartidas 2 minutos por el equipo (`fresh`: se vuelven a leer de GHL).
async function oportunidadesDe(id, pipeline, fresh = false) {
  return cacheCompartida(`pipeline|${id}|${pipeline.id}`, 2 * 60_000, async () => {
    const ops = [];
    let total = null;
    for (let page = 1; page <= PAGINAS; page++) {
      const r = await searchOpportunities({ pipelineId: pipeline.id, limit: 100, page, order: 'added_desc' }).catch((e) => { throw permisos(e); });
      total ??= r.total;
      ops.push(...r.opportunities);
      if (r.opportunities.length < 100) break;
    }
    return { total: total ?? ops.length, ops };
  }, { fresh });
}

export async function GET(request) {
  try {
    await requireSession(request, { permiso: ['leads', 'llamadas'] });
    const url = new URL(request.url);
    const id = url.searchParams.get('d') || '';
    const { d, pipeline } = await contexto(id);
    if (!pipeline) return json({ ligado: false });
    const fresh = url.searchParams.get('fresh') === '1';
    const base = await oportunidadesDe(id, pipeline, fresh);
    const oportunidades = base.ops.map((o) => ({ id: o.id, contactId: o.contactId, name: o.name || '', etapa: o.pipelineStageId, status: o.status || 'open', createdAt: o.createdAt || '', phone: o.phone || '' }));
    return json({ ligado: true, pipeline, etapaEntrada: d.compraEtapa || '', oportunidades, total: base.total, truncado: base.total > oportunidades.length });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    await requireSession(request, { permiso: ['llamadas', 'leads'] });
    const body = await readBody(request);
    if (body.op !== 'mover') throw bad('Operación no válida');
    const id = String(body.d || '');
    const { pipeline } = await contexto(id);
    if (!pipeline) throw bad('Este embudo no está ligado a un pipeline de GHL');
    const contactId = String(body.contactId || '');
    const oppId = String(body.oppId || '');
    if (!ID_RE.test(contactId) || !ID_RE.test(oppId)) throw bad('Oportunidad no válida');
    const st = pipeline.stages.find((x) => x.id === String(body.etapa || ''));
    if (!st) throw bad('Esa etapa no está en el pipeline');
    // Solo oportunidades de este pipeline (la del contacto que manda el navegador tiene que estar en él).
    const r = await searchOpportunities({ pipelineId: pipeline.id, contactId, limit: 20 }).catch((e) => { throw permisos(e); });
    if (!r.opportunities.some((o) => o.id === oppId)) throw bad('Esa oportunidad no está en el pipeline de este embudo', 403);
    const status = estadoDe(st.name);
    await updateOpportunity(oppId, { pipelineId: pipeline.id, pipelineStageId: st.id, status }).catch((e) => { throw permisos(e); });
    // Que el resto del equipo lo vea ya en su nueva fase: se cambia en la copia compartida (sin volver a leer de GHL).
    const clave = `pipeline|${id}|${pipeline.id}`;
    const copia = await leerCompartida(clave, 2 * 60_000);
    const o = copia?.ops?.find((x) => x.id === oppId);
    if (o) { Object.assign(o, { pipelineStageId: st.id, status }); await guardarCompartida(clave, copia); }
    return json({ ok: true, etapa: st.id, status });
  } catch (e) {
    return errorResponse(e);
  }
}
