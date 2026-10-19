// Ventas cruzadas → «Hoy»: el pipeline de GHL del embudo con los alumnos de cada fase (para llamarles con contexto).
//   GET /api/cruzadas?parte=pipelines → { pipelines: [{ id, nombre, etapas: [nombres] }] }  (configuración)
//   GET /api/cruzadas?x=<embudo>[&fresh=1] → { pipeline, etapas: [{ id, nombre, n, items }], completo } | { motivo }
// El pipeline se busca por su nombre (el elegido en la configuración; si no, «Ventas cruzadas»).
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { getPipelines, searchOpportunities } from '../lib/ghl.js';
import { cacheCompartida } from '../lib/store.js';
import { PIPELINE_CRUZADAS } from '../public/js/cruzadas.js';
import { json, errorResponse } from '../lib/http.js';

const MAX_PAGINAS = 10; // 1.000 oportunidades (Cloudflare deja 50 peticiones por visita)
const MAX_POR_ETAPA = 60;
const norm = (s) => String(s || '').trim().toLowerCase();

export async function GET(request) {
  try {
    const q = new URL(request.url).searchParams;
    if (q.get('parte') === 'pipelines') {
      await requireSession(request, { permiso: 'config' });
      const lista = await getPipelines();
      return json({ pipelines: lista.map((p) => ({ id: p.id, nombre: p.name, etapas: [...(p.stages || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((s) => s.name) })) });
    }
    await requireSession(request, { permiso: ['hoy', 'llamadas'] });
    const id = q.get('x') || '';
    const config = await getConfig();
    const c = config.cruzadas && Object.hasOwn(config.cruzadas, id) ? config.cruzadas[id] : null;
    if (!c) return json({ error: 'Embudo no encontrado' }, 404);
    const nombre = c.llamadasPipeline || PIPELINE_CRUZADAS;
    const pipe = (await getPipelines()).find((p) => norm(p.name) === norm(nombre));
    if (!pipe) return json({ motivo: 'sin_pipeline', buscado: nombre });
    const valor = await cacheCompartida(`cruzadas-pipe|${pipe.id}`, 3 * 60_000, async () => {
      const opps = [];
      let completo = false;
      for (let page = 1; page <= MAX_PAGINAS; page++) {
        const { opportunities } = await searchOpportunities({ pipelineId: pipe.id, limit: 100, page, order: 'added_desc' });
        const nuevas = opportunities.filter((o) => !opps.some((x) => x.id === o.id));
        opps.push(...nuevas);
        if (opportunities.length < 100 || !nuevas.length) { completo = true; break; }
      }
      const etapas = [...(pipe.stages || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((s) => {
        const suyas = opps.filter((o) => o.pipelineStageId === s.id);
        return {
          id: s.id, nombre: s.name, color: s.color || '', n: suyas.length,
          items: suyas.slice(0, MAX_POR_ETAPA).map((o) => ({ contactId: o.contactId || '', nombre: o.name || o.contact?.name || '', telefono: o.phone || o.contact?.phone || '', desde: o.lastStageChangeAt || o.updatedAt || o.createdAt || '', estado: o.status || 'open' })),
        };
      });
      return { pipeline: { id: pipe.id, nombre: pipe.name }, etapas, total: opps.length, completo, actualizado: new Date().toISOString() };
    }, { fresh: q.get('fresh') === '1' });
    return json(valor);
  } catch (e) {
    return errorResponse(e);
  }
}
