// Emails de un embudo (lanzamiento, VSL o meteórico) leídos de GHL con sus estadísticas.
// Qué emails son de cada embudo: los que llevan en el nombre (de la campaña o del workflow) alguno de
// los textos de «Emails de este embudo» (config `emailFiltro`, separados por comas). Sin filtro, en
// lanzamientos y meteóricos: las campañas enviadas durante sus fechas. Las estadísticas de GHL son
// acumuladas (desde que se envió el email), no por fechas.
import { listEmailCampaigns, getEmailCampaign, listWorkflowCampaigns, getWorkflowCampaign, getEmailStats } from './ghl.js';
import { clienteActual } from './cliente.js';
import { filtrosEmail, coincideFiltro, tasas, ventanaEmails, conIndicadores, resumenEmails } from '../public/js/emails.js';
import { addDays } from '../public/js/tareas.js';

const TTL = 10 * 60_000;
const MAX_EMAILS = 80;
const MAX_PAGINAS = 15;
// Peticiones a GHL como mucho en una carga: Cloudflare corta a las 50 por petición en el plan gratuito.
// Si no caben todos los emails, se muestran los más recientes y se avisa.
const PRESUPUESTO = 40;
const cache = new Map();

// Ejecuta `fn` sobre la lista con como mucho `k` a la vez (GHL limita ~100 peticiones / 10 s).
async function enLotes(lista, k, fn) {
  const out = [];
  for (let i = 0; i < lista.length; i += k) out.push(...await Promise.all(lista.slice(i, i + k).map(fn)));
  return out;
}

const sinPermiso = (e) => /GHL (401|403)/.test(e?.message || '');
export const AVISO_PERMISOS = 'El token de GHL no tiene permiso para leer los emails: en GHL → Ajustes → Integraciones privadas, edita la integración del dashboard y marca «View Email Campaigns» (emails/campaigns.readonly) y «View Email Stats» (emails/stats.readonly). Después actualiza el token en Cloudflare si GHL te da uno nuevo.';

// Campañas (emails sueltos): por filtro de nombre o, sin filtro, por la ventana de fechas.
async function campanas(filtros, ventana, b) {
  const vistas = new Map();
  const busquedas = filtros.length ? filtros : [''];
  for (const search of busquedas) {
    for (let p = 0; p < MAX_PAGINAS; p++) {
      if (b.n >= PRESUPUESTO / 4) { b.parcial = true; break; } // para listar, como mucho una cuarta parte
      b.n++;
      const { campaigns, total } = await listEmailCampaigns({ search: search || undefined, offset: p * 20, limit: 20, status: 'sent' });
      let antiguas = false;
      for (const c of campaigns) {
        const dia = String(c.updatedAt || c.createdAt || '').slice(0, 10);
        if (!filtros.length && ventana) {
          if (dia < ventana.desde) { antiguas = true; continue; }
          if (dia > ventana.hasta) continue;
        } else if (!coincideFiltro(c.name, filtros)) continue;
        vistas.set(c.id, { ...c, dia });
      }
      if (antiguas || campaigns.length < 20 || (p + 1) * 20 >= total || vistas.size >= MAX_EMAILS) break;
    }
  }
  return [...vistas.values()].slice(0, MAX_EMAILS);
}

// Emails de los workflows cuyo nombre coincide con el filtro (un email por paso de envío).
async function emailsDeWorkflows(filtros, b) {
  if (!filtros.length) return [];
  const vistos = new Map();
  for (const search of filtros) {
    if (b.n >= PRESUPUESTO / 2) { b.parcial = true; break; }
    b.n++;
    const { campaigns } = await listWorkflowCampaigns({ search, limit: 20 });
    for (const w of campaigns) if (coincideFiltro(w.name, filtros) && !w.deleted) vistos.set(w.id, w);
  }
  const nDet = Math.min(vistos.size, 15, Math.max(0, Math.floor((PRESUPUESTO - b.n) / 4)));
  if (nDet < vistos.size) b.parcial = true;
  b.n += nDet;
  const detalles = await enLotes([...vistos.values()].slice(0, nDet), 5, (w) => getWorkflowCampaign(w.id).then((d) => ({ w, d })).catch(() => ({ w, d: null })));
  return detalles.flatMap(({ w, d }) => (d?.subSources || []).map((s) => ({ w, s })));
}

export async function emailsDeEmbudo(code, emb, { fresh = false } = {}) {
  const filtros = filtrosEmail(emb.emailFiltro);
  const ventana = filtros.length ? null : ventanaEmails(emb, addDays);
  const clave = `${clienteActual().id}:${code}:${filtros.join('|')}:${ventana ? `${ventana.desde}_${ventana.hasta}` : ''}`;
  const hit = cache.get(clave);
  if (!fresh && hit && hit.at > Date.now() - TTL) return hit.value;
  if (!filtros.length && !ventana) {
    return { emails: [], resumen: resumenEmails([]), sinFiltro: true, criterio: '' };
  }
  let value;
  try {
    const b = { n: 0, parcial: false };
    const camps = await campanas(filtros, ventana, b);
    const pasos = await emailsDeWorkflows(filtros, b);
    // Lo que queda del presupuesto: cada campaña son 2 peticiones (detalle + estadísticas), cada paso 1.
    const resto = PRESUPUESTO - b.n;
    const nCamp = Math.min(camps.length, Math.floor((pasos.length ? resto / 2 : resto) / 2));
    const nPasos = Math.min(pasos.length, MAX_EMAILS, resto - 2 * nCamp);
    if (nCamp < camps.length || nPasos < pasos.length) b.parcial = true;
    const deCampanas = await enLotes(camps.slice(0, nCamp), 5, async (c) => {
      const [det, stats] = await Promise.all([getEmailCampaign(c.id).catch(() => null), getEmailStats('email-campaigns', c.sourceId).catch(() => ({}))]);
      return { id: c.id, tipo: 'campana', nombre: c.name, asunto: det?.subject || '', fecha: c.dia, ...tasas(stats) };
    });
    const deWorkflows = await enLotes(pasos.slice(0, nPasos), 5, async ({ w, s }) => {
      const stats = await getEmailStats('workflow-campaigns', w.sourceId, s.id).catch(() => ({}));
      return { id: `${w.id}:${s.id}`, tipo: 'workflow', nombre: s.name, workflow: w.name, asunto: s.subject || '', fecha: '', ...tasas(stats) };
    });
    const emails = conIndicadores([...deCampanas, ...deWorkflows].filter((e) => e.enviados || e.entregados));
    emails.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || a.nombre.localeCompare(b.nombre, 'es'));
    value = {
      emails, resumen: resumenEmails(emails.filter((e) => e.entregados)),
      criterio: (filtros.length ? `Campañas y workflows con «${filtros.join('», «')}» en el nombre` : `Campañas enviadas entre el ${ventana.desde} y el ${ventana.hasta}`)
        + (b.parcial ? ' · hay más emails de los que caben en una carga: se muestran los más recientes (afina el filtro para ver otros)' : ''),
      parcial: b.parcial,
      actualizado: new Date().toISOString(),
    };
  } catch (e) {
    if (sinPermiso(e)) throw Object.assign(new Error('Sin permiso de emails'), { status: 403, publicMessage: AVISO_PERMISOS });
    if (e.sinApiEmails) throw Object.assign(new Error(e.message), { status: 502, publicMessage: e.publicMessage });
    throw e;
  }
  cache.set(clave, { at: Date.now(), value });
  return value;
}
