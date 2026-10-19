// LabIA (el setter IA de WhatsApp) en Hoy → LabIA: su pipeline de GHL con los leads de cada etapa.
// Lo leemos directamente de GHL (el mismo pipeline que mueve LabIA), sin pedirle nada a LabIA.
// Las etapas llevan un icono que dice quién lleva al lead (igual que en LabIA): 🤖 = la IA, 👩/🧑/👨 = una persona.
//   pipelineLabia(config, { fresh }) → { pipeline, etapas, ahora, totales, teTocan, actualizado } | { motivo, pipelines }
import { getPipelines, searchOpportunities } from './ghl.js';
import { cacheCompartida } from './store.js';

export const tipoEtapa = (nombre) => (/🤖/u.test(nombre || '') ? 'ia' : /👩|🧑|👨/u.test(nombre || '') ? 'equipo' : 'otra');
// Con esta etiqueta la IA ha pedido que una persona siga la conversación, esté en la etapa que esté.
const PIDE_PERSONA = ['setter-ia-humano', 'ia-humano'];
const MAX_PAGINAS = 15; // 1.500 oportunidades como mucho (Cloudflare deja 50 peticiones por visita)
const MAX_LISTA = 40;
const CADUCA = 5 * 60_000;

// El de Conexiones (si sigue existiendo) o el primero con alguna etapa 🤖.
export function elegirPipeline(pipelines, pedido = '') {
  return pipelines.find((p) => p.id === pedido) || pipelines.find((p) => (p.stages || []).some((s) => tipoEtapa(s.name) === 'ia')) || null;
}

async function todasLasOportunidades(pipelineId) {
  const out = [];
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const { opportunities } = await searchOpportunities({ pipelineId, limit: 100, page, order: 'added_desc' });
    out.push(...opportunities);
    if (opportunities.length < 100) break;
  }
  return out;
}

export async function pipelineLabia(config, { fresh = false } = {}) {
  // La lista de pipelines también en caché (antes se pedía a GHL en cada visita aunque lo demás estuviera guardado).
  const pipelines = await cacheCompartida('labia-pipelines', CADUCA, getPipelines, { fresh });
  const pipe = elegirPipeline(pipelines, config?.setterIa?.pipelineId || '');
  if (!pipe) return { motivo: 'sin_pipeline', pipelines: pipelines.map((p) => ({ id: p.id, nombre: p.name })) };
  return cacheCompartida(`labia-pipe|${pipe.id}`, CADUCA, async () => {
    const opps = await todasLasOportunidades(pipe.id);
    const etapas = (pipe.stages || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((s) => ({ id: s.id, nombre: s.name, tipo: tipoEtapa(s.name), color: s.color || '' }));
    const tipoDe = new Map(etapas.map((e) => [e.id, e.tipo]));
    const nombreDe = new Map(etapas.map((e) => [e.id, e.nombre]));
    const abiertas = opps.filter((o) => (o.status || 'open') === 'open');
    const pidePersona = (o) => (o.tags || []).some((t) => PIDE_PERSONA.includes(String(t).toLowerCase()));
    // Quién lo lleva ahora: la persona si la IA lo ha pasado (etiqueta) o si está en una etapa 👩.
    const quien = (o) => (pidePersona(o) || tipoDe.get(o.pipelineStageId) === 'equipo' ? 'equipo' : tipoDe.get(o.pipelineStageId) === 'ia' ? 'ia' : 'otra');
    const teTocan = abiertas.filter((o) => quien(o) === 'equipo')
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, MAX_LISTA)
      .map((o) => ({ contactId: o.contactId, nombre: o.name || '', telefono: o.phone || '', etapa: nombreDe.get(o.pipelineStageId) || '', pide: pidePersona(o), desde: o.createdAt || '' }));
    return {
      pipeline: { id: pipe.id, nombre: pipe.name },
      // En las etapas de la IA y del equipo, los abiertos; en las demás (venta, perdido…), todos los que hay.
      etapas: etapas.map((e) => ({ ...e, n: (e.tipo === 'otra' ? opps : abiertas).filter((o) => o.pipelineStageId === e.id).length })),
      ahora: { ia: abiertas.filter((o) => quien(o) === 'ia').length, equipo: abiertas.filter((o) => quien(o) === 'equipo').length, otra: abiertas.filter((o) => quien(o) === 'otra').length },
      totales: { oportunidades: opps.length, abiertas: abiertas.length, ganadas: opps.filter((o) => o.status === 'won').length, perdidas: opps.filter((o) => o.status === 'lost').length, completo: opps.length < MAX_PAGINAS * 100 },
      teTocan,
      actualizado: new Date().toISOString(),
    };
  }, { fresh });
}
