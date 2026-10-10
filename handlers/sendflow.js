// Conexión con SendFlow (grupos de WhatsApp).
//   GET /api/sendflow?op=probar[&reintentar=1] → { configurada, variable, ok, campanas, analitica, error, freno, formato }
//   GET /api/sendflow?op=campanas            → { campanas } (para elegir la de cada lanzamiento o meteórico)
//   GET /api/sendflow?op=grupos&l=<código>   → entradas, salidas y clics por día y los grupos de su campaña
//   GET /api/sendflow?op=miembros&l=<código> → CSV con los participantes actuales (el cruce con GHL lo hace el navegador)
//   GET /api/sendflow?op=vigilar&key=DIGEST_KEY[&c=<cliente>] → una pasada de la vigilancia (tarea cada 15 min)
//   GET /api/sendflow?op=cuentas            → cuentas de WhatsApp de SendFlow (para los avisos)
//   GET /api/sendflow?op=calentamiento&l=<código> → secuencia de mensajes del grupo (permiso carrito, config o métricas)
//   GET /api/sendflow?op=votos&l=<código>&id=<mensaje> → votos de una encuesta enviada
//   POST { op: 'calentamiento-guardar' | 'programar' | 'cancelar' | 'marcar-cancelado', l, … } (permiso config)
// Solo quien configura (permiso «config»). Hace como mucho 2 peticiones a SendFlow (campañas y una analítica),
// guardadas unos minutos, y no llama nada mientras SendFlow tenga la clave bloqueada (su límite es estricto).
import { requireSession } from '../lib/auth.js';
import { sendflowConfigurado, variableSendflow, campanasSendflow, analiticaSendflow, gruposSendflow, exportarMiembros, cuentasSendflow, formatoClave, frenoSendflow, quitarFreno } from '../lib/sendflow.js';
import { getConfig } from '../lib/config-store.js';
import { leerCompartida } from '../lib/store.js';
import { env } from '../lib/env.js';
import { csvMiembrosMock } from '../lib/mock.js';
import { fallaClaveTarea } from '../lib/auth.js';
import { vigilarGrupos, estadoVigilancia } from '../lib/vigia-grupos.js';
import { leerSecuencia, guardarSecuencia, programarSecuencia, cancelarMensaje, marcarCancelado, votosEncuesta } from '../lib/calentamiento.js';
import { readBody } from '../lib/http.js';
import { json, errorResponse } from '../lib/http.js';

const embDe = (config, code) => (config.launches && Object.hasOwn(config.launches, code) ? config.launches[code] : null)
  || (config.meteoricos && Object.hasOwn(config.meteoricos, code) ? config.meteoricos[code] : null);

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
      vigilancia: await estadoVigilancia(id),
    });
  } catch (e) {
    return json({ vinculada: true, conectado: true, id, error: e.publicMessage || e.message, freno: e.freno || null });
  }
}

// Participantes de los grupos: el CSV pasa tal cual al navegador (sin leerlo aquí: puede tener decenas de miles
// de filas y el plan gratuito de Cloudflare solo da 10 ms de CPU). Solo se descargan enlaces de Firebase/Google.
const URL_EXPORT_OK = /^https:\/\/(firebasestorage\.googleapis\.com|storage\.googleapis\.com|[a-z0-9-]+\.firebasestorage\.app)\//i;
async function miembrosDe(code) {
  const config = await getConfig();
  const emb = (config.launches && Object.hasOwn(config.launches, code) ? config.launches[code] : null)
    || (config.meteoricos && Object.hasOwn(config.meteoricos, code) ? config.meteoricos[code] : null);
  if (!emb) return json({ error: 'No encontrado' }, 404);
  if (!emb.sendflowId) return json({ error: 'Este lanzamiento no tiene su campaña de SendFlow' }, 400);
  if (!sendflowConfigurado()) return json({ error: 'SendFlow no está conectado (Cuenta → Conexiones)' }, 400);
  const csv = (body, at) => new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store', 'x-exportado': String(at) } });
  if (env.GHL_MOCK === '1') { const e = await exportarMiembros(emb.sendflowId); return csv(csvMiembrosMock(), e.at); }
  for (const fresh of [false, true]) {
    const e = await exportarMiembros(emb.sendflowId, { fresh });
    if (!URL_EXPORT_OK.test(e.url)) return json({ error: 'SendFlow ha devuelto un enlace de descarga desconocido' }, 502);
    const res = await fetch(e.url, { signal: AbortSignal.timeout(60_000) });
    if (res.ok) return csv(res.body, e.at);
    // El enlace caducó: se pide otra exportación (solo una vez).
  }
  return json({ error: 'No se pudo descargar la lista de participantes de SendFlow' }, 502);
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const op = url.searchParams.get('op') || 'probar';
    if (op === 'vigilar') {
      const key = url.searchParams.get('key') || '';
      { const falla = fallaClaveTarea(key, env.DIGEST_KEY); if (falla) return json({ error: 'No autorizado', motivo: falla }, 401); }
      if (!sendflowConfigurado()) return json({ vigiladas: 0, motivo: 'SendFlow no está conectado' });
      return json(await vigilarGrupos(await getConfig({ fresh: true }), { dashboardUrl: new URL('/', request.url).toString() }));
    }
    if (op === 'miembros') {
      await requireSession(request, { permiso: ['hoy', 'leads', 'metricas'] });
      try { return await miembrosDe(String(url.searchParams.get('l') || '')); } catch (e) { return json({ error: e.publicMessage || e.message }, e.status || 502); }
    }
    if (op === 'calentamiento' || op === 'votos') {
      await requireSession(request, { permiso: ['carrito', 'config', 'metricas'] });
      const code = String(url.searchParams.get('l') || '');
      const emb = embDe(await getConfig(), code);
      if (!emb) return json({ error: 'No encontrado' }, 404);
      if (op === 'votos') return json(await votosEncuesta(code, String(url.searchParams.get('id') || '')));
      return json({ ...(await leerSecuencia(code)), sendflowId: emb.sendflowId || '', conectado: sendflowConfigurado() });
    }
    if (op === 'grupos') {
      await requireSession(request, { permiso: 'metricas' });
      return await gruposDe(String(url.searchParams.get('l') || ''));
    }
    await requireSession(request, { permiso: 'config' });
    if (op === 'cuentas') {
      if (!sendflowConfigurado()) return json({ conectado: false, cuentas: [] });
      try { return json({ conectado: true, cuentas: await cuentasSendflow() }); } catch (e) { return json({ conectado: true, cuentas: [], error: e.publicMessage || e.message }); }
    }
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

export async function POST(request) {
  try {
    await requireSession(request, { permiso: 'config' });
    const body = await readBody(request);
    const code = String(body.l || '');
    const emb = embDe(await getConfig(), code);
    if (!emb) return json({ error: 'No encontrado' }, 404);
    if (body.op === 'calentamiento-guardar') return json(await guardarSecuencia(code, body.mensajes));
    if (body.op === 'marcar-cancelado') return json(await marcarCancelado(code, String(body.id || '')));
    if (!emb.sendflowId) return json({ error: 'Primero elige la campaña de SendFlow de este lanzamiento' }, 400);
    if (!sendflowConfigurado()) return json({ error: 'SendFlow no está conectado (Cuenta → Conexiones)' }, 400);
    if (body.op === 'programar') return json(await programarSecuencia(code, emb.sendflowId, Array.isArray(body.ids) ? body.ids.map(String) : []));
    if (body.op === 'cancelar') return json(await cancelarMensaje(code, String(body.id || '')));
    return json({ error: 'Operación no válida' }, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
