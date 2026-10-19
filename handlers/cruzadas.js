// Ventas cruzadas → «Hoy»: el pipeline de GHL del embudo con los alumnos de cada fase (para llamarles con contexto).
//   GET /api/cruzadas?parte=pipelines → { pipelines: [{ id, nombre, etapas: [nombres] }] }  (configuración)
//   GET /api/cruzadas?x=<embudo>[&fresh=1] → { pipeline, etapas: [{ id, nombre, n, items }], completo } | { motivo }
//   POST /api/cruzadas { op: 'por-contactar', x, contactos: [{ id, nombre }] } (quien configura) → mete esos alumnos en
//     la fase «Por contactar» del pipeline (si no la hay, la primera), solo a los que aún no están en él. Va por
//     tandas de 20 (cada alumno son 2 llamadas a GHL: ¿ya está? y crearlo; Cloudflare deja 50 por visita).
// El pipeline se busca por su nombre (el elegido en la configuración; si no, «Ventas cruzadas»).
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { getPipelines, searchOpportunities, createOpportunity } from '../lib/ghl.js';
import { cacheCompartida } from '../lib/store.js';
import { PIPELINE_CRUZADAS, sanitizeCruzada, comercialDe } from '../public/js/cruzadas.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const MAX_PAGINAS = 20; // 2.000 oportunidades (Cloudflare deja 50 peticiones por visita)
const MAX_POR_ETAPA = 2000; // todas: la pestaña pinta las primeras de cada columna (y filtra por comercial)
export const TANDA_POR_CONTACTAR = 20;
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

// La fase donde entran los alumnos: «Por contactar» (por su nombre, sin emojis ni mayúsculas) o, si no, la primera.
export const etapaPorContactar = (pipe) => {
  const etapas = [...(pipe.stages || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return etapas.find((e) => /por contactar/i.test(e.name || '')) || etapas[0] || null;
};

export async function POST(request) {
  try {
    await requireSession(request, { permiso: 'config' });
    const body = await readBody(request);
    if (body.op !== 'por-contactar') return json({ error: 'Operación no válida' }, 400);
    const config = await getConfig();
    const id = String(body.x || '');
    const raw = config.cruzadas && Object.hasOwn(config.cruzadas, id) ? config.cruzadas[id] : null;
    if (!raw) return json({ error: 'Embudo no encontrado' }, 404);
    const c = sanitizeCruzada(raw);
    const nombre = c.llamadasPipeline || PIPELINE_CRUZADAS;
    const pipe = (await getPipelines()).find((p) => norm(p.name) === norm(nombre));
    if (!pipe) return json({ error: `No encuentro el pipeline «${nombre}» en GHL: créalo primero (con la fase «Por contactar»).` }, 400);
    const etapa = etapaPorContactar(pipe);
    if (!etapa) return json({ error: `El pipeline «${pipe.name}» no tiene fases.` }, 400);
    const contactos = (Array.isArray(body.contactos) ? body.contactos : []).slice(0, TANDA_POR_CONTACTAR)
      .map((x) => ({ id: String(x?.id || '').slice(0, 60), nombre: String(x?.nombre || '').trim().slice(0, 80) })).filter((x) => x.id);
    let creados = 0;
    let yaEstaban = 0;
    const errores = [];
    for (const ct of contactos) {
      try {
        const { opportunities } = await searchOpportunities({ pipelineId: pipe.id, contactId: ct.id, limit: 1 });
        if (opportunities.length) { yaEstaban++; continue; }
        // El nombre lleva el comercial que le toca (así también se ve en GHL de quién es).
        const com = comercialDe(ct.id, c.comerciales);
        await createOpportunity({ pipelineId: pipe.id, pipelineStageId: etapa.id, contactId: ct.id, name: `${ct.nombre || 'Alumno'}${com ? ` · ${com.nombre}` : ''}`.slice(0, 100) });
        creados++;
      } catch (e) {
        errores.push(String(e.publicMessage || e.message).slice(0, 160));
        if (e.status === 401 || e.status === 403) break; // sin permiso en GHL: no tiene sentido seguir
      }
    }
    return json({ creados, yaEstaban, errores: errores.slice(0, 3), fallidos: errores.length, pipeline: pipe.name, etapa: etapa.name });
  } catch (e) {
    return errorResponse(e);
  }
}
