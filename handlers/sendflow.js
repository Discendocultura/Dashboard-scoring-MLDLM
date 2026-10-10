// Conexión con SendFlow (grupos de WhatsApp).
//   GET /api/sendflow?op=probar[&reintentar=1] → { configurada, variable, ok, campanas, analitica, error, freno, formato }
//   GET /api/sendflow?op=campanas            → { campanas } (para elegir la de cada lanzamiento o meteórico)
//   GET /api/sendflow?op=grupos&l=<código>   → entradas, salidas y clics por día y los grupos de su campaña
// Solo quien configura (permiso «config»). Hace como mucho 2 peticiones a SendFlow (campañas y una analítica),
// guardadas unos minutos, y no llama nada mientras SendFlow tenga la clave bloqueada (su límite es estricto).
import { requireSession } from '../lib/auth.js';
import { sendflowConfigurado, variableSendflow, campanasSendflow, analiticaSendflow, gruposSendflow, formatoClave, frenoSendflow, quitarFreno } from '../lib/sendflow.js';
import { getConfig } from '../lib/config-store.js';
import { leerCompartida } from '../lib/store.js';
import { json, errorResponse } from '../lib/http.js';

// Entradas, salidas y clics por día (AAAA-MM-DD) y los grupos de la campaña de un lanzamiento o meteórico.
async function gruposDe(code) {
  const config = await getConfig();
  const emb = (config.launches && Object.hasOwn(config.launches, code) ? config.launches[code] : null)
    || (config.meteoricos && Object.hasOwn(config.meteoricos, code) ? config.meteoricos[code] : null);
  if (!emb) return json({ error: 'No encontrado' }, 404);
  if (!emb.sendflowId) return json({ vinculada: false, conectado: sendflowConfigurado() });
  if (!sendflowConfigurado()) return json({ vinculada: true, conectado: false });
  const id = emb.sendflowId;
  try {
    const a = await analiticaSendflow(id);
    // Los grupos son opcionales (si fallan, se enseña igualmente la analítica).
    let grupos = null;
    try { grupos = await gruposSendflow(id); } catch (e) { console.error('SendFlow grupos', e.message); }
    const nombre = (await leerCompartida('sendflow-campanas', 7 * 86_400_000))?.find((c) => c.id === id)?.nombre || '';
    const dias = [...new Set([...Object.keys(a.entradas.porDia), ...Object.keys(a.salidas.porDia), ...Object.keys(a.clics.porDia)])].sort();
    return json({
      vinculada: true, conectado: true, id, nombre,
      entradas: a.entradas.total, salidas: a.salidas.total, clics: a.clics.total,
      porDia: dias.map((d) => ({ dia: d, entradas: a.entradas.porDia[d] || 0, salidas: a.salidas.porDia[d] || 0, clics: a.clics.porDia[d] || 0 })),
      grupos,
    });
  } catch (e) {
    return json({ vinculada: true, conectado: true, id, error: e.publicMessage || e.message, freno: e.freno || null });
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const op = url.searchParams.get('op') || 'probar';
    if (op === 'grupos') {
      await requireSession(request, { permiso: 'metricas' });
      return await gruposDe(String(url.searchParams.get('l') || ''));
    }
    await requireSession(request, { permiso: 'config' });
    if (op === 'campanas') {
      if (!sendflowConfigurado()) return json({ conectado: false, campanas: [] });
      try {
        return json({ conectado: true, campanas: await campanasSendflow() });
      } catch (e) {
        return json({ conectado: true, campanas: [], error: e.publicMessage || e.message });
      }
    }
    if (op !== 'probar') return json({ error: 'Operación no válida' }, 400);
    const variable = variableSendflow();
    if (!sendflowConfigurado()) return json({ configurada: false, variable, ok: false });
    // «He cambiado la clave»: se puede volver a probar antes de tiempo, salvo si SendFlow la tiene bloqueada.
    let freno = await frenoSendflow();
    if (freno && !freno.bloqueo && url.searchParams.get('reintentar') === '1') { await quitarFreno(); freno = null; }
    if (freno) return json({ configurada: true, variable, ok: false, freno, formato: formatoClave() });
    let campanas;
    try {
      campanas = await campanasSendflow();
    } catch (e) {
      return json({ configurada: true, variable, ok: false, error: e.publicMessage || e.message, freno: e.freno || null, formato: formatoClave() });
    }
    // La analítica es lo que más falla con claves antiguas (403): se prueba con la primera campaña.
    const primera = campanas.find((c) => !c.archivada) || campanas[0];
    let analitica = null;
    if (primera) {
      try {
        const a = await analiticaSendflow(primera.id);
        analitica = { id: primera.id, nombre: primera.nombre, ok: true, entradas: a.entradas.total, salidas: a.salidas.total, clics: a.clics.total };
      } catch (e) {
        analitica = { id: primera.id, nombre: primera.nombre, ok: false, error: e.publicMessage || e.message };
      }
    }
    return json({ configurada: true, variable, ok: true, campanas: campanas.slice(0, 100), total: campanas.length, analitica });
  } catch (e) {
    return errorResponse(e);
  }
}
