// Emails de un embudo (lanzamiento, VSL o meteórico) leídos de GHL con sus estadísticas.
// Qué emails son de cada embudo: los que llevan en el nombre (de la campaña o del workflow) alguno de
// los textos de «Emails de este embudo» (config `emailFiltro`, separados por comas). Sin filtro, en
// lanzamientos y meteóricos: las campañas enviadas durante sus fechas. Las estadísticas de GHL son
// acumuladas (desde que se envió el email), no por fechas.
import { listEmailCampaigns, getEmailCampaign, listWorkflowCampaigns, getWorkflowCampaign, getEmailStats } from './ghl.js';
import { cacheCompartida } from './store.js';
import { filtrosEmail, coincideFiltro, tasas, ventanaEmails } from '../public/js/emails.js';
import { addDays } from '../public/js/tareas.js';

const MAX_EMAILS = 80;
const MAX_PAGINAS = 15;
// Peticiones a GHL como mucho en una carga: Cloudflare corta a las 50 por petición en el plan gratuito.
// Si no caben todos los emails, se muestran los más recientes y se avisa.
const PRESUPUESTO = 40; // lo que puede gastar listar campañas (como mucho una cuarta parte)

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

// ---------- Por partes (lo que usa el dashboard) ----------
// Leer de golpe la lista, el asunto y las estadísticas de 30-40 emails pasaba del límite de Cloudflare (50 peticiones
// y poca CPU por petición) y salía «Error 502». Ahora: 1) la lista de emails del embudo (solo listar, ~10 peticiones)
// y 2) sus estadísticas en tandas de como mucho MAX_TANDA emails, cada tanda en su propia petición.
export const MAX_TANDA = 8;
const PRESUPUESTO_LISTA = 22;
const TTL_COMPARTIDA = 15 * 60_000;

function filtrosYVentana(emb) {
  const filtros = filtrosEmail(emb.emailFiltro);
  const ventana = filtros.length ? null : ventanaEmails(emb, addDays);
  return { filtros, ventana };
}
const criterioDe = (filtros, ventana, parcial) => (filtros.length ? `Campañas y workflows con «${filtros.join('», «')}» en el nombre` : `Campañas enviadas entre el ${ventana.desde} y el ${ventana.hasta}`)
  + (parcial ? ' · hay más emails de los que caben en una carga: se muestran los más recientes (afina el filtro para ver otros)' : '');

// Lista de emails del embudo, sin estadísticas: [{ key, tipo, nombre, fecha, asunto?, workflow? }].
// La clave lleva lo necesario para pedir sus estadísticas: «c.<id>.<sourceId>» (campaña) o «w.<sourceId>.<paso>» (workflow).
export async function listaEmails(code, emb, { fresh = false } = {}) {
  const { filtros, ventana } = filtrosYVentana(emb);
  if (!filtros.length && !ventana) return { items: [], sinFiltro: true, criterio: '' };
  const clave = `emails-lista|${code}|${filtros.join('|')}|${ventana ? `${ventana.desde}_${ventana.hasta}` : ''}`;
  const calcular = async () => {
    const b = { n: 0, parcial: false };
    try {
      const camps = await campanas(filtros, ventana, b);
      const pasos = await emailsDeWorkflowsCon(filtros, b, PRESUPUESTO_LISTA);
      const items = [
        ...camps.map((c) => ({ key: `c.${c.id}.${c.sourceId}`, tipo: 'campana', nombre: c.name, fecha: c.dia })),
        ...pasos.map(({ w, s }) => ({ key: `w.${w.sourceId}.${s.id}`, tipo: 'workflow', nombre: s.name, workflow: w.name, asunto: s.subject || '', fecha: '' })),
      ].filter((x) => /^[cw]\.[\w-]{1,64}\.[\w-]{1,64}$/.test(x.key)).slice(0, MAX_EMAILS);
      return { items, parcial: b.parcial || items.length >= MAX_EMAILS, criterio: criterioDe(filtros, ventana, b.parcial), actualizado: new Date().toISOString() };
    } catch (e) {
      if (sinPermiso(e)) throw Object.assign(new Error('Sin permiso de emails'), { status: 403, publicMessage: AVISO_PERMISOS });
      if (e.sinApiEmails) throw Object.assign(new Error(e.message), { status: 502, publicMessage: e.publicMessage });
      throw e;
    }
  };
  return cacheCompartida(clave, TTL_COMPARTIDA, calcular, { fresh });
}
// Emails de los workflows cuyo nombre coincide con el filtro (un email por paso de envío).
async function emailsDeWorkflowsCon(filtros, b, presupuesto) {
  if (!filtros.length) return [];
  const vistos = new Map();
  for (const search of filtros) {
    if (b.n >= presupuesto / 2) { b.parcial = true; break; }
    b.n++;
    const { campaigns } = await listWorkflowCampaigns({ search, limit: 20 });
    for (const w of campaigns) if (coincideFiltro(w.name, filtros) && !w.deleted) vistos.set(w.id, w);
  }
  const nDet = Math.min(vistos.size, 15, Math.max(0, presupuesto - b.n));
  if (nDet < vistos.size) b.parcial = true;
  b.n += nDet;
  const detalles = await enLotes([...vistos.values()].slice(0, nDet), 5, (w) => getWorkflowCampaign(w.id).then((d) => ({ w, d })).catch(() => ({ w, d: null })));
  return detalles.flatMap(({ w, d }) => (d?.subSources || []).map((s) => ({ w, s })));
}

// Estadísticas (y asunto de las campañas) de una tanda de emails por su clave → { <clave>: { asunto?, enviados, … } }.
export async function statsEmails(claves, { fresh = false } = {}) {
  const lista = [...new Set(claves)].filter((k) => /^[cw]\.[\w-]{1,64}\.[\w-]{1,64}$/.test(k)).slice(0, MAX_TANDA);
  const out = {};
  await enLotes(lista, 4, async (k) => {
    const [t, a, b] = k.split('.');
    out[k] = await cacheCompartida(`emails-stats|${k}`, TTL_COMPARTIDA, async () => {
      if (t === 'c') {
        const [det, stats] = await Promise.all([getEmailCampaign(a).catch(() => null), getEmailStats('email-campaigns', b).catch(() => ({}))]);
        return { asunto: det?.subject || '', ...tasas(stats) };
      }
      return tasas(await getEmailStats('workflow-campaigns', a, b).catch(() => ({})));
    }, { fresh });
  });
  return out;
}
