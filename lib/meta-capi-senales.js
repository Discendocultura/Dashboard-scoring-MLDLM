// Señales de calidad para Meta (Conversions API), de la tarea programada GET /api/meta-capi?key=…&c=… (cada 30-60 min):
//   · LeadCualificado       → el lead llega a «Caliente» (o más) en la puntuación de AlquimIA
//   · Schedule              → tiene llamada agendada: la reservó el lead en el calendario de GHL o la agendó el setter IA
//   · SeQuedoHastaLaOferta  → estuvo en el directo hasta la oferta (señal «_final» de cualquier directo)
// Del lanzamiento en curso. Cada persona cuenta una vez por lanzamiento y señal (lo ya mandado se guarda). Todo va en un
// solo envío a Meta: pocas llamadas, dentro del límite de Cloudflare.
import { getConfig } from './config-store.js';
import { allLeads, currentLaunch } from './digest.js';
import { calendarEvents } from './ghl.js';
import { leerJSON, guardarJSON } from './store.js';
import { enviarLoteMeta, sanitizeMetaCapi } from './meta-capi.js';
import { enrichLead } from '../public/js/metrics.js';
import { ESTADOS } from '../public/js/scoring.js';
import { sigDirecto } from '../public/js/videos.js';
import { calendarioDeUrl } from '../public/js/llamadas.js';

const CLAVE_HECHOS = 'lsd_meta_capi_hechos';
const MAX_HECHOS = 20000;
const UMBRAL = ESTADOS.find((e) => e.id === 'caliente').min;

// Qué toca mandar de cada lead (puro, para las pruebas). citas: Set de contactId con cita reservada en el calendario.
export function senalesDe(leads, code, citas = new Set()) {
  const out = [];
  for (const l of leads) {
    const datos = { email: l.email, telefono: l.phone, nombre: l.name, externalId: l.id };
    if (l.score >= UMBRAL) out.push({ tipo: 'cualificado', eventId: `cualif-${code}-${l.id}`, datos, custom: { content_name: code, puntuacion: l.score } });
    if (citas.has(l.id) || l.s?.setter?.cita) out.push({ tipo: 'llamada', eventId: `llamada-${code}-${l.id}`, datos, custom: { content_name: code, origen: citas.has(l.id) ? 'reserva' : 'setter' } });
    const n = l.s?.nVideos || 1;
    if (Array.from({ length: n }, (_, i) => l.s?.[`${sigDirecto(i + 1)}_final`]).some(Boolean)) out.push({ tipo: 'oferta', eventId: `oferta-${code}-${l.id}`, datos, custom: { content_name: code } });
  }
  return out;
}

export async function enviarSenales({ ahora = Date.now() } = {}) {
  const config = await getConfig({ fresh: true });
  const cfg = sanitizeMetaCapi(config.metaCapi);
  if (!cfg.activo) return { accion: 'nada', motivo: 'Conversions API apagada' };
  if (!['cualificado', 'llamada', 'oferta'].some((k) => cfg.eventos[k])) return { accion: 'nada', motivo: 'Señales de calidad apagadas' };
  const code = currentLaunch(config);
  const l = code ? config.launches[code] : null;
  if (!l?.registroTag) return { accion: 'nada', motivo: 'Sin lanzamiento en curso' };
  const leads = (await allLeads(l.registroTag, l.compraDateField ? [l.compraDateField] : [])).map((c) => enrichLead(c, code, config));
  // Reservas del calendario de llamadas hechas en los últimos 7 días (Meta no acepta eventos más antiguos).
  const citas = new Set();
  const calendarId = cfg.eventos.llamada ? calendarioDeUrl(l.llamadaUrl) : '';
  if (calendarId) {
    const ev = await calendarEvents({ calendarId, startTime: ahora - 7 * 86_400_000, endTime: ahora + 60 * 86_400_000 }).catch(() => []);
    for (const e of ev) if (e.contactId && !e.deleted && !/cancel/i.test(e.status)) citas.add(e.contactId);
  }
  const hechos = await leerJSON(CLAVE_HECHOS, () => ({ ids: [] })).catch(() => ({ ids: [] }));
  const ya = new Set(hechos?.ids || []);
  const nuevas = senalesDe(leads, code, citas).filter((x) => cfg.eventos[x.tipo] && !ya.has(x.eventId)).slice(0, 2000);
  if (!nuevas.length) return { accion: 'nada', code, leads: leads.length, motivo: 'Nada nuevo' };
  const r = await enviarLoteMeta(nuevas.map((x) => ({ ...x, cuando: ahora })), { config: { metaCapi: cfg }, etiqueta: 'Señales de calidad' });
  if (r.enviados) {
    const ids = [...nuevas.slice(0, r.enviados).map((x) => x.eventId), ...(hechos?.ids || [])].slice(0, MAX_HECHOS);
    await guardarJSON(CLAVE_HECHOS, { ids }, { motivo: 'Meta CAPI: señales enviadas' });
  }
  const cuenta = (t) => nuevas.slice(0, r.enviados).filter((x) => x.tipo === t).length;
  return { accion: 'enviar', code, leads: leads.length, enviados: r.enviados, cualificados: cuenta('cualificado'), llamadas: cuenta('llamada'), oferta: cuenta('oferta'), ...(r.motivo ? { motivo: r.motivo } : {}) };
}
