// Llamadas de valoración: citas del calendario de GHL + pipeline «Leads Lanzamientos».
//   GET  /api/llamadas?l=<código>  → citas del lanzamiento, su etapa en el pipeline y el resultado anotado
//   POST /api/llamadas { l, op: 'resultado', eventId, contactId, nombre, startTime, resultado, motivo, notas }
//        → mueve la oportunidad de etapa, marca la cita (realizada / no se presentó…) y deja una nota en GHL.
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import {
  getPipelines, searchOpportunities, getContact, createOpportunity, updateOpportunity, calendarEvents, getCalendar,
  updateAppointmentStatus, addContactNote,
} from '../lib/ghl.js';
import { leerJSON, guardarJSON, reintentando } from '../lib/store.js';
import { RESULTADOS, MOTIVOS, PIPELINE_POR_DEFECTO, etapasPipeline, etapaDestino, calendarioDeUrl } from '../public/js/llamadas.js';
import { json, readBody, errorResponse, mapLimit } from '../lib/http.js';
import { embudoDe } from '../lib/embudos.js';
import { cachePorCliente } from '../lib/cliente.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });
const DAY = 86_400_000;
const MAX_PAGINAS_OPP = 5; // 500 oportunidades
const MAX_CONTACTOS = 20; // fichas que se piden aparte (teléfono de quien no está en el pipeline)
const pipeCache = cachePorCliente();

// Pipeline de llamadas: el de los lanzamientos o el que tenga configurado la VSL.
const nombrePipeline = (config, launch) => (launch?.esVsl ? launch.llamadasPipeline : config.llamadasPipeline) || PIPELINE_POR_DEFECTO;
async function pipelineLanzamientos(config, launch) {
  if (!pipeCache.get() || pipeCache.get().at < Date.now() - 10 * 60_000) pipeCache.set({ at: Date.now(), list: await getPipelines() });
  const want = String(nombrePipeline(config, launch)).trim().toLowerCase();
  return pipeCache.get().list.find((p) => String(p.name).trim().toLowerCase() === want) || null;
}

const storeName = (code) => `lsd_llamadas_${code}`;
async function getResultados(code) {
  const r = await leerJSON(storeName(code), () => ({}));
  return r && typeof r === 'object' && !Array.isArray(r) ? r : {};
}
// Leer-cambiar-guardar con reintento si otra persona anota a la vez.
const cambiarResultados = (code, fn, motivo) => reintentando(async () => {
  const resultados = await getResultados(code);
  const out = fn(resultados);
  await guardarJSON(storeName(code), resultados, { motivo });
  return out;
});

// Los errores de permisos de GHL se explican en claro.
function permisos(e) {
  if (/GHL 401|GHL 403|not authorized|scope/i.test(String(e.message))) {
    return bad('El token de GHL no tiene permiso para calendarios u oportunidades. En GHL → Ajustes → Integraciones privadas, añade a la integración los permisos de «calendars», «calendars/events» y «opportunities» (lectura y escritura).', 502);
  }
  return e;
}

async function contexto(code) {
  const config = await getConfig();
  const launch = embudoDe(config, code);
  if (!launch) throw bad('Lanzamiento no encontrado', 404);
  const calendarId = calendarioDeUrl(launch.llamadaUrl);
  return { config, launch, calendarId };
}

export async function GET(request) {
  try {
    await requireSession(request, { permiso: 'llamadas' });
    const code = new URL(request.url).searchParams.get('l') || '';
    const { config, launch, calendarId } = await contexto(code);
    if (!calendarId) return json({ configurado: false, motivo: launch.esVsl ? 'Pon en Configuración de la VSL → Embudo el «Enlace para reservar llamada» (el del calendario de GHL).' : 'Pon en Configuración → Lanzamiento el «Enlace para reservar llamada» (el del calendario de GHL).' });
    const pipeline = await pipelineLanzamientos(config, launch).catch((e) => { throw permisos(e); });
    const now = Date.now();
    // La VSL está siempre abierta: sus últimos 60 días.
    const desde = launch.esVsl ? now - 60 * DAY : launch.inicioCaptacion ? Math.min(Date.parse(`${launch.inicioCaptacion}T00:00:00Z`) - 7 * DAY, now - 7 * DAY) : now - 45 * DAY;
    const hasta = now + 30 * DAY;
    const [eventos, calendario, resultados] = await Promise.all([
      calendarEvents({ calendarId, startTime: desde, endTime: hasta }).catch((e) => { throw permisos(e); }),
      getCalendar(calendarId).catch(() => null),
      getResultados(code),
    ]);
    const citas = eventos.filter((e) => !e.deleted).sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
    // Oportunidad de cada contacto en el pipeline y total por etapa.
    const opps = {};
    let etapas = [];
    // Se lee el pipeline entero por páginas (no una búsqueda por cita: con muchas citas se pasaba del
    // límite de peticiones de Cloudflare). Si es muy grande, lo que falte se busca contacto a contacto.
    let completo = false;
    let porEtapa = {};
    if (pipeline) {
      const ids = [...new Set(citas.map((c) => c.contactId).filter(Boolean))];
      const todas = [];
      for (let page = 1; page <= MAX_PAGINAS_OPP; page++) {
        const r = await searchOpportunities({ pipelineId: pipeline.id, limit: 100, page });
        const nuevas = r.opportunities.filter((o) => !todas.some((x) => x.id === o.id));
        if (r.opportunities.length && !nuevas.length) break; // GHL no pagina: se completa contacto a contacto
        todas.push(...nuevas);
        if (r.opportunities.length < 100 || (r.total != null && todas.length >= r.total)) { completo = true; break; }
      }
      for (const o of todas) {
        if (!(o.contactId in opps)) opps[o.contactId] = o;
        porEtapa[o.pipelineStageId] = (porEtapa[o.pipelineStageId] || 0) + 1;
      }
      if (!completo) {
        const faltan = ids.filter((id) => !(id in opps)).slice(0, 8); // con el límite de peticiones de Cloudflare
        await mapLimit(faltan, 4, async (id) => { opps[id] = (await searchOpportunities({ pipelineId: pipeline.id, contactId: id, limit: 5 })).opportunities[0] || null; });
      }
    }
    // Teléfono y email de quien no está en el pipeline (para poder escribirle por WhatsApp).
    const contactos = {};
    // Pipeline muy grande (no cabe entero): menos fichas aparte para no pasar del límite de peticiones.
    const sinOpp = [...new Set(citas.map((c) => c.contactId).filter((id) => id && !opps[id]?.phone))].slice(0, completo || !pipeline ? MAX_CONTACTOS : 10);
    await mapLimit(sinOpp, 4, async (id) => { const c = await getContact(id).catch(() => null); if (c) contactos[id] = { phone: c.phone || '', email: c.email || '', tags: c.tags || [], src: c.src || {} }; });
    if (pipeline) {
      etapas = await mapLimit([...pipeline.stages].sort((a, b) => a.position - b.position), 3, async (s) => ({
        id: s.id, name: s.name, color: s.color || '', total: completo ? porEtapa[s.id] || 0 : (await searchOpportunities({ pipelineId: pipeline.id, pipelineStageId: s.id, limit: 1 })).total ?? null,
      }));
    }
    return json({
      configurado: true,
      calendario: { id: calendarId, name: calendario?.name || 'Calendario de llamadas' },
      pipeline: pipeline ? { id: pipeline.id, name: pipeline.name, stages: etapas } : null,
      llamadas: citas.map((c) => ({ ...c, opp: opps[c.contactId] || null, contacto: contactos[c.contactId] || null, resultado: resultados[c.id] || null })),
      wa: resultados._wa || {},
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const s = await requireSession(request, { permiso: 'llamadas' });
    const body = await readBody(request);
    const code = String(body.l || '');
    if (body.op === 'wa') {
      // Registro de que se ha enviado el WhatsApp de una fase (para verlo en el dashboard).
      const contactId = String(body.contactId || '');
      if (!/^[A-Za-z0-9_-]{2,64}$/.test(contactId)) throw bad('Contacto no válido');
      await contexto(code);
      const wa = await cambiarResultados(code, (resultados) => {
        resultados._wa = { ...(resultados._wa || {}), [contactId]: { fase: String(body.fase || '').slice(0, 30), en: new Date().toISOString(), por: s.user?.nombre || s.role } };
        return resultados._wa[contactId];
      }, 'WhatsApp enviado');
      return json({ wa });
    }
    if (body.op !== 'resultado') throw bad('Operación no válida');
    const { config, launch } = await contexto(code);
    const r = RESULTADOS.find((x) => x.id === body.resultado);
    if (!r) throw bad('Resultado no válido');
    const eventId = String(body.eventId || '');
    const contactId = String(body.contactId || '');
    if (!/^[A-Za-z0-9_-]{2,64}$/.test(eventId) || !/^[A-Za-z0-9_-]{2,64}$/.test(contactId)) throw bad('Cita o contacto no válidos');
    const motivo = r.id === 'perdido' ? String(body.motivo || '').trim().slice(0, 60) : '';
    if (r.id === 'perdido' && !motivo) throw bad('Indica el motivo por el que no compra');
    const notas = String(body.notas || '').trim().slice(0, 2000);
    const quien = s.user?.nombre || (s.role === 'admin' ? 'Admin' : 'Setter');
    const avisos = [];

    // 1) Pipeline: mover (o crear) la oportunidad de la persona.
    const pipeline = await pipelineLanzamientos(config, launch).catch((e) => { throw permisos(e); });
    let etapaNueva = null;
    if (!pipeline) avisos.push(`No existe el pipeline «${nombrePipeline(config, launch)}» en GHL: no se ha movido la etapa.`);
    else {
      const etapas = etapasPipeline(pipeline);
      const opp = (await searchOpportunities({ pipelineId: pipeline.id, contactId, limit: 5 }).catch((e) => { throw permisos(e); })).opportunities[0];
      etapaNueva = etapaDestino(r.id, etapas, opp?.pipelineStageId);
      if (!etapaNueva) avisos.push('El pipeline no tiene una etapa para este resultado.');
      else if (opp) await updateOpportunity(opp.id, { pipelineId: pipeline.id, pipelineStageId: etapaNueva, status: r.status }).catch((e) => { throw permisos(e); });
      else await createOpportunity({ pipelineId: pipeline.id, pipelineStageId: etapaNueva, contactId, name: String(body.nombre || 'Llamada de valoración').slice(0, 100), status: r.status }).catch((e) => { throw permisos(e); });
    }
    // 2) Cita: realizada / no se presentó / cancelada (si falla, no bloquea lo demás).
    await updateAppointmentStatus(eventId, r.cita).catch((e) => avisos.push(`No se pudo marcar la cita en el calendario (${String(e.message).slice(0, 120)}).`));
    // 3) Nota en el contacto para que quede en su ficha de GHL.
    const cuando = body.startTime ? new Date(body.startTime).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    await addContactNote(contactId, `📞 Llamada de valoración${cuando ? ` (${cuando})` : ''}: ${r.icon} ${r.label}${motivo ? ` · Motivo: ${motivo}` : ''}${notas ? `\n${notas}` : ''}\n— ${quien}, desde el dashboard`)
      .catch((e) => avisos.push(`No se pudo guardar la nota en GHL (${String(e.message).slice(0, 120)}).`));
    // 4) Registro propio para las métricas.
    const resultado = await cambiarResultados(code, (resultados) => {
      resultados[eventId] = { resultado: r.id, motivo, notas, contactId, por: quien, en: new Date().toISOString(), etapa: etapaNueva };
      return resultados[eventId];
    }, `Resultado de llamada: ${r.label}`);
    return json({ resultado, avisos, motivos: MOTIVOS });
  } catch (e) {
    return errorResponse(e);
  }
}
