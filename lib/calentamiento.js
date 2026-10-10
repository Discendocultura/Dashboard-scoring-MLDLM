// Secuencia de mensajes del grupo de WhatsApp de un lanzamiento o meteórico, y su programación en SendFlow.
// Se guarda en D1 (lsd_calentamiento_<código>). Lo programado no se puede editar desde el dashboard: se cancela.
import { leerJSON, guardarJSON, reintentando, cacheCompartida } from './store.js';
import { sendflow } from './sendflow.js';
import { sanitizeMensaje, faltaMensaje, cuerpoSendflow } from '../public/js/calentamiento.js';

const clave = (code) => `lsd_calentamiento_${code}`;
const MAX_MENSAJES = 150;
export const MAX_POR_TANDA = 8; // por petición (límite de SendAPI y de Cloudflare); el navegador va pidiendo tandas

export async function leerSecuencia(code) {
  const v = await leerJSON(clave(code), () => ({ mensajes: [] }));
  return { mensajes: Array.isArray(v?.mensajes) ? v.mensajes : [] };
}

// Guarda los borradores que manda el navegador; lo programado (o cancelado) se queda como está en el servidor.
export async function guardarSecuencia(code, entrantes) {
  return reintentando(async () => {
    const actual = await leerSecuencia(code);
    const fijos = actual.mensajes.filter((m) => m.estado === 'programado' || m.estado === 'cancelado');
    const idsFijos = new Set(fijos.map((m) => m.id));
    const borradores = (Array.isArray(entrantes) ? entrantes : []).filter((m) => !idsFijos.has(m?.id)).slice(0, MAX_MENSAJES)
      .map((m) => ({ ...sanitizeMensaje(m), estado: m?.estado === 'error' ? 'error' : 'borrador', error: m?.estado === 'error' ? String(m.error || '').slice(0, 300) : '' }));
    const mensajes = [...fijos, ...borradores].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    await guardarJSON(clave(code), { mensajes }, { motivo: `calentamiento del grupo de ${code}` });
    return { mensajes };
  });
}

// Programa en SendFlow los mensajes indicados (listos, en borrador o con error), como mucho MAX_POR_TANDA.
export async function programarSecuencia(code, releaseId, ids, ahora = Date.now()) {
  const { mensajes } = await leerSecuencia(code);
  const quiero = new Set(ids || []);
  const cola = mensajes.filter((m) => quiero.has(m.id) && (m.estado === 'borrador' || m.estado === 'error') && !faltaMensaje(m, ahora).length);
  const resultados = {};
  let frenado = null;
  for (const m of cola.slice(0, MAX_POR_TANDA)) {
    try {
      const r = await sendflow('/actions/send-message', { method: 'POST', body: cuerpoSendflow(m, releaseId) });
      const actionId = String(r?.actionId ?? r?.id ?? r?.data?.actionId ?? r?.data?.id ?? '');
      resultados[m.id] = { estado: 'programado', actionId, programadoEn: new Date().toISOString(), error: '' };
    } catch (e) {
      resultados[m.id] = { estado: 'error', error: String(e.publicMessage || e.message).slice(0, 300) };
      if (e.freno || e.status === 503) { frenado = e.publicMessage || e.message; break; }
    }
  }
  const out = await reintentando(async () => {
    const actual = await leerSecuencia(code);
    const nuevos = actual.mensajes.map((m) => (resultados[m.id] ? { ...m, ...resultados[m.id] } : m));
    await guardarJSON(clave(code), { mensajes: nuevos }, { motivo: `calentamiento de ${code}: ${Object.values(resultados).filter((r) => r.estado === 'programado').length} programados en SendFlow` });
    return nuevos;
  });
  const pendientes = cola.filter((m) => !resultados[m.id]).length;
  return { mensajes: out, programados: Object.values(resultados).filter((r) => r.estado === 'programado').length, errores: Object.values(resultados).filter((r) => r.estado === 'error').length, pendientes, frenado };
}

// Cancela en SendFlow un mensaje programado.
export async function cancelarMensaje(code, id) {
  const { mensajes } = await leerSecuencia(code);
  const m = mensajes.find((x) => x.id === id);
  if (!m || m.estado !== 'programado') throw Object.assign(new Error('No programado'), { status: 400, publicMessage: 'Ese mensaje no está programado.' });
  if (!m.actionId) throw Object.assign(new Error('Sin actionId'), { status: 400, publicMessage: 'SendFlow no devolvió la referencia de este envío: cancélalo en SendFlow (Acciones).' });
  try {
    await sendflow('/actions/cancel', { method: 'POST', body: { actions: [m.actionId] } });
  } catch (e) {
    if (e.sendflowStatus === 404 || e.sendflowStatus === 405) throw Object.assign(new Error('Cancelar no disponible'), { status: 400, publicMessage: 'SendFlow no deja cancelarlo desde aquí: cancélalo en SendFlow (Acciones programadas) y luego márcalo como cancelado.' });
    throw e;
  }
  return marcarCancelado(code, id);
}
// Marcarlo como cancelado sin llamar a SendFlow (cuando se ha cancelado allí a mano).
export async function marcarCancelado(code, id) {
  return reintentando(async () => {
    const actual = await leerSecuencia(code);
    const mensajes = actual.mensajes.map((x) => (x.id === id ? { ...x, estado: 'cancelado' } : x));
    await guardarJSON(clave(code), { mensajes }, { motivo: `calentamiento de ${code}: mensaje cancelado` });
    return { mensajes };
  });
}

// Votos de una encuesta ya enviada (guardados 10 min).
export async function votosEncuesta(code, id) {
  const { mensajes } = await leerSecuencia(code);
  const m = mensajes.find((x) => x.id === id);
  if (!m?.actionId || m.tipo !== 'encuesta') throw Object.assign(new Error('Sin encuesta'), { status: 400, publicMessage: 'Esa encuesta aún no se ha programado.' });
  return cacheCompartida(`sf-votos|${m.actionId}`, 10 * 60_000, async () => {
    const r = await sendflow(`/actions/${encodeURIComponent(m.actionId)}/poll-votes`);
    const s = r?.summary || r?.data?.summary || {};
    const opciones = m.encuesta?.opciones || [];
    const conteo = s.counts || s.byOption || s.options || {};
    const votos = opciones.map((o, i) => ({ opcion: o, n: Number(Array.isArray(conteo) ? (conteo[i]?.count ?? conteo[i]?.votes ?? conteo[i]) : (conteo[o] ?? 0)) || 0 }));
    return { total: Number(s.total ?? s.totalVotes ?? votos.reduce((t, v) => t + v.n, 0)) || 0, votos };
  });
}
