// Ventas cruzadas → «Hoy»: el pipeline de GHL del embudo con los alumnos de cada fase (para llamarles con contexto).
//   GET /api/cruzadas?parte=pipelines → { pipelines: [{ id, nombre, etapas: [nombres] }] }  (configuración)
//   GET /api/cruzadas?x=<embudo>[&fresh=1] → { pipeline, etapas: [{ id, nombre, n, items }], completo } | { motivo }
//   POST /api/cruzadas { op: 'por-contactar', x, contactos: [{ id, nombre }] } (quien configura) → mete esos alumnos en
//     la fase «Por contactar» del pipeline (si no la hay, la primera), solo a los que aún no están en él. Va por
//     tandas de 20 (cada alumno son 2 llamadas a GHL: ¿ya está? y crearlo; Cloudflare deja 50 por visita).
// El pipeline se busca por su nombre (el elegido en la configuración; si no, «Ventas cruzadas»).
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { getPipelines, searchOpportunities, createOpportunity, updateOpportunity, addContactNote } from '../lib/ghl.js';
import { RESULTADOS, etapasPipeline, etapaDestino } from '../public/js/llamadas.js';
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
    const body = await readBody(request);
    if (body.op === 'mover') return await mover(request, body);
    await requireSession(request, { permiso: 'config' });
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

// «Mover de etapa» desde «Hoy» (las mismas opciones que al anotar una llamada de un lanzamiento: Venta, Pendiente de
// pago, Seguimiento, No compra, No contesta, Reagendar): mueve (o crea) su oportunidad en el pipeline de ventas cruzadas
// y deja la nota en su ficha de GHL. No hay cita que marcar.
async function mover(request, body) {
  const s = await requireSession(request, { permiso: ['hoy', 'llamadas'] });
  const r = RESULTADOS.find((x) => x.id === body.resultado);
  if (!r) return json({ error: 'Resultado no válido' }, 400);
  const contactId = String(body.contactId || '');
  if (!/^[A-Za-z0-9_-]{2,64}$/.test(contactId)) return json({ error: 'Contacto no válido' }, 400);
  const motivo = r.id === 'perdido' ? String(body.motivo || '').trim().slice(0, 60) : '';
  if (r.id === 'perdido' && !motivo) return json({ error: 'Indica el motivo por el que no compra' }, 400);
  const notas = String(body.notas || '').trim().slice(0, 2000);
  const config = await getConfig();
  const id = String(body.x || '');
  const raw = config.cruzadas && Object.hasOwn(config.cruzadas, id) ? config.cruzadas[id] : null;
  if (!raw) return json({ error: 'Embudo no encontrado' }, 404);
  const c = sanitizeCruzada(raw);
  const nombre = c.llamadasPipeline || PIPELINE_CRUZADAS;
  const pipe = (await getPipelines()).find((p) => norm(p.name) === norm(nombre));
  if (!pipe) return json({ error: `No encuentro el pipeline «${nombre}» en GHL.` }, 400);
  const opp = (await searchOpportunities({ pipelineId: pipe.id, contactId, limit: 1 })).opportunities[0];
  const etapa = etapaDestino(r.id, etapasPipeline(pipe), opp?.pipelineStageId);
  if (!etapa) return json({ error: `El pipeline «${pipe.name}» no tiene una fase para «${r.label}».` }, 400);
  if (opp) await updateOpportunity(opp.id, { pipelineId: pipe.id, pipelineStageId: etapa, status: r.status });
  else {
    const com = comercialDe(contactId, c.comerciales);
    await createOpportunity({ pipelineId: pipe.id, pipelineStageId: etapa, contactId, name: `${String(body.nombre || 'Alumno').trim().slice(0, 80)}${com ? ` · ${com.nombre}` : ''}`.slice(0, 100), status: r.status });
  }
  const quien = s.user?.nombre || (s.role === 'admin' ? 'Admin' : 'Setter');
  const avisos = [];
  await addContactNote(contactId, `🔁 Ventas cruzadas: ${r.icon} ${r.label}${motivo ? ` · Motivo: ${motivo}` : ''}${notas ? `\n${notas}` : ''}\n— ${quien}, desde AlquimIA`)
    .catch((e) => avisos.push(`No se pudo guardar la nota en GHL (${String(e.message).slice(0, 120)}).`));
  const fase = (pipe.stages || []).find((x) => x.id === etapa);
  return json({ etapa: { id: etapa, nombre: fase?.name || '' }, avisos });
}
