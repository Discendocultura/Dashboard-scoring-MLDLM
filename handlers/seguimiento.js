// Seguimiento de las compradoras de venta directa que aún no tienen el producto principal (p. ej. del Reto a
// Raíces): la lista de la setter con su etapa en el pipeline donde el workflow de compra crea la oportunidad.
//   GET  /api/seguimiento?d=<embudo>[&fresh=1] → { pipeline, etapaInicial, lista, mensaje }
//   POST { d, op: 'etapa', contactId, etapa, nombre, nota } → mueve (o crea) su oportunidad y deja una nota en GHL
//   POST { d, op: 'wa', contactId } → apunta que se le ha escrito por WhatsApp
//   POST { d, op: 'mensaje', texto } (config) → guarda el mensaje de WhatsApp del seguimiento
import { requireSession } from '../lib/auth.js';
import { getConfig, saveConfig } from '../lib/config-store.js';
import { getPipelines, searchOpportunities, createOpportunity, updateOpportunity, addContactNote } from '../lib/ghl.js';
import { compradorasDe } from '../lib/directa.js';
import { leerJSON, guardarJSON, reintentando, cacheCompartida, versionDe, conVersion } from '../lib/store.js';
import { pipelineDeCompra } from '../public/js/directa.js';
import { listaSeguimiento, MENSAJE_SEGUIMIENTO_DEF } from '../public/js/seguimiento.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });
const ID_RE = /^[A-Za-z0-9_-]{2,64}$/;
const clave = (id) => `lsd_seguimiento_${id}`;
// La copia lleva la versión de lo leído: si otra persona guarda a la vez, `reintentando` lo detecta y repite.
const leer = async (id) => { const r = await leerJSON(clave(id), () => ({})); return conVersion(r && typeof r === 'object' ? { cambios: r.cambios || {}, wa: r.wa || {} } : { cambios: {}, wa: {} }, r); };
const cambiar = (id, fn, motivo) => reintentando(async () => { const r = await leer(id); const out = fn(r); await guardarJSON(clave(id), r, { motivo }); return out; });

function permisos(e) {
  if (/GHL 401|GHL 403|not authorized|scope/i.test(String(e.message))) return bad('El token de GHL no tiene permiso para las oportunidades: añade «opportunities» (lectura y escritura) a la integración privada.', 502);
  return e;
}

async function contexto(id) {
  const config = await getConfig();
  const d = config.directas && Object.hasOwn(config.directas, id) ? config.directas[id] : null;
  if (!d) throw bad('Embudo no encontrado', 404);
  return { config, d };
}

// Pipeline del seguimiento: el de la oportunidad del workflow de compra (elegido o detectado entre las compradoras)
// o, si no hay, el que se llame «Leads evergreen».
async function pipelineDe(d, contactos) {
  const origen = d.compraPipeline && d.compraPipeline !== 'no' ? { pipelineId: d.compraPipeline, stageId: d.compraEtapa || '' } : pipelineDeCompra(contactos);
  const pipes = await getPipelines();
  const p = (origen && pipes.find((x) => x.id === origen.pipelineId)) || pipes.find((x) => /leads evergreen/i.test(x.name)) || null;
  if (!p) return { pipeline: null, etapaInicial: '' };
  const stages = [...(p.stages || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((s) => ({ id: s.id, name: s.name, color: s.color || '' }));
  return { pipeline: { id: p.id, name: p.name, stages }, etapaInicial: origen?.pipelineId === p.id ? origen.stageId : '' };
}

export async function GET(request) {
  try {
    await requireSession(request, { permiso: ['leads', 'llamadas'] });
    const url = new URL(request.url);
    const id = url.searchParams.get('d') || '';
    const { d } = await contexto(id);
    if (!d.upsellPrincipal?.tags?.length) return json({ configurado: false, motivo: 'Elige en ⚙️ Configurar el embudo → «Producto principal al que llevarlas después» sus etiquetas de compra: la lista son las compradoras que aún no lo tienen.' });
    if (!d.compraTag) return json({ configurado: false, motivo: 'Falta la etiqueta de compra del embudo.' });
    // Las compradoras y el pipeline, compartidos 3 minutos por el equipo; los cambios del dashboard se leen siempre.
    const base = await cacheCompartida(`seguimiento|${id}|${d.compraTag}|${d.upsellPrincipal.tags.join(',')}|${d.compraPipeline || ''}|${d.compraEtapa || ''}`, 3 * 60_000, async () => {
      const contactos = await compradorasDe(d, { fresh: url.searchParams.get('fresh') === '1' });
      const { pipeline, etapaInicial } = await pipelineDe(d, contactos).catch((e) => { throw permisos(e); });
      return { contactos, pipeline, etapaInicial };
    }, { fresh: url.searchParams.get('fresh') === '1' });
    const [reg, propio] = await Promise.all([leerJSON(`lsd_directa_compras_${id}`, () => null), leer(id)]);
    const lista = listaSeguimiento(base.contactos, d, { dias: reg?.dias || {}, cambios: propio.cambios, wa: propio.wa, pipelineId: base.pipeline?.id || '' });
    return json({
      configurado: true, pipeline: base.pipeline, etapaInicial: base.etapaInicial,
      principal: d.upsellPrincipal.nombre || '', producto: d.producto || d.name, mensaje: d.mensajeSeguimiento || MENSAJE_SEGUIMIENTO_DEF,
      compradoras: base.contactos.length, lista,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const s = await requireSession(request, { permiso: ['llamadas', 'leads'] });
    const body = await readBody(request);
    const id = String(body.d || '');
    const { config, d } = await contexto(id);
    const quien = s.user?.nombre || (s.role === 'admin' ? 'Admin' : 'Setter');
    if (body.op === 'mensaje') {
      await requireSession(request, { permiso: 'config' });
      const texto = String(body.texto || '').trim().slice(0, 1000);
      // Con la configuración recién leída y su versión (como el resto de guardados parciales): no pisa cambios de otros.
      const nuevo = await reintentando(async () => {
        const actual = await getConfig({ fresh: true });
        const dd = actual.directas?.[id];
        if (!dd) throw bad('Embudo no encontrado', 404);
        return saveConfig({ ...actual, directas: { ...actual.directas, [id]: { ...dd, mensajeSeguimiento: texto } } }, { version: versionDe(actual), motivo: 'Mensaje de seguimiento (venta directa)' });
      });
      return json({ mensaje: texto || MENSAJE_SEGUIMIENTO_DEF, version: versionDe(nuevo) });
    }
    const contactId = String(body.contactId || '');
    if (!ID_RE.test(contactId)) throw bad('Contacto no válido');
    if (body.op === 'wa') {
      const wa = await cambiar(id, (r) => { r.wa[contactId] = { en: new Date().toISOString(), por: quien }; return r.wa[contactId]; }, 'WhatsApp de seguimiento');
      return json({ wa });
    }
    if (body.op !== 'etapa') throw bad('Operación no válida');
    const etapa = String(body.etapa || '');
    const nota = String(body.nota || '').trim().slice(0, 2000);
    const pipelineId = String(body.pipelineId || '');
    if (!ID_RE.test(pipelineId) || !/^[A-Za-z0-9_-]{2,64}$/.test(etapa)) throw bad('Etapa no válida');
    const pipes = await getPipelines().catch((e) => { throw permisos(e); });
    const p = pipes.find((x) => x.id === pipelineId);
    const st = p?.stages?.find((x) => x.id === etapa);
    if (!st) throw bad('Esa etapa no está en el pipeline');
    const avisos = [];
    // 1) La oportunidad de la persona en ese pipeline: se mueve (o se crea si no tiene).
    const opp = (await searchOpportunities({ pipelineId, contactId, limit: 5 }).catch((e) => { throw permisos(e); })).opportunities[0];
    const status = /^venta|ganad|won/i.test(st.name) ? 'won' : /perdid|lost/i.test(st.name) ? 'lost' : 'open';
    if (opp) await updateOpportunity(opp.id, { pipelineId, pipelineStageId: etapa, status }).catch((e) => { throw permisos(e); });
    else {
      await createOpportunity({ pipelineId, pipelineStageId: etapa, contactId, name: String(body.nombre || 'Seguimiento').slice(0, 100), status }).catch((e) => { throw permisos(e); });
      // Esta oportunidad la crea el dashboard hoy: no es la de la compra. Se marca para que no cambie el día de su venta.
      await reintentando(async () => {
        const r = await leerJSON(`lsd_directa_compras_${id}`, () => null);
        if (!r?.dias?.[contactId] || r.op?.[contactId]) return;
        await guardarJSON(`lsd_directa_compras_${id}`, conVersion({ ...r, op: { ...(r.op || {}), [contactId]: 1 } }, r), { motivo: 'Seguimiento: oportunidad creada' });
      }).catch(() => {});
    }
    // 2) Nota en su ficha de GHL.
    await addContactNote(contactId, `📞 Seguimiento ${d.upsellPrincipal?.nombre ? `para ${d.upsellPrincipal.nombre} ` : ''}(${d.name}): ${st.name}${nota ? `\n${nota}` : ''}\n— ${quien}, desde el dashboard`)
      .catch((e) => avisos.push(`No se pudo guardar la nota en GHL (${String(e.message).slice(0, 120)}).`));
    // 3) Registro propio (la lista lo enseña al momento, sin esperar a que GHL lo devuelva en la búsqueda).
    const cambio = await cambiar(id, (r) => { r.cambios[contactId] = { etapa, por: quien, en: new Date().toISOString(), ...(nota ? { nota } : {}) }; return r.cambios[contactId]; }, `Seguimiento: ${st.name}`);
    return json({ cambio, avisos });
  } catch (e) {
    return errorResponse(e);
  }
}
