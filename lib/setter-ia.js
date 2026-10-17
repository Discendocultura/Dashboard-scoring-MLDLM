// Cifras del setter IA (proyecto aparte) para Rendimiento del equipo. El setter las da en
//   GET <url del setter>/api/dashboard/resumen?c=<cliente>&desde=AAAA-MM-DD&hasta=AAAA-MM-DD
//   Authorization: Bearer <RESUMEN_KEY_<CLIENTE> del setter>
// Aquí esa misma clave va en Cloudflare como SETTER_RESUMEN_KEY_<CLIENTE> (o SETTER_RESUMEN_KEY para el principal).
// Se guardan 10 min (el setter también las guarda 5): abrir Rendimiento no le pregunta cada vez.
import { env } from './env.js';
import { clienteActual, envCliente, sufijo } from './cliente.js';
import { cacheCompartida } from './store.js';

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
export const CIFRAS_SETTER = ['respondieron', 'conversaciones_activas', 'pasadas_a_persona', 'citas', 'bajas', 'tiempo_respuesta_mediana_seg', 'mensajes_ia'];

export function claveResumenSetter() {
  const c = clienteActual();
  return String(envCliente('SETTER_RESUMEN_KEY') || env[`SETTER_RESUMEN_KEY_${sufijo(c.id)}`] || '').trim();
}

// Solo números (o null) y la fecha de actualización: nada más del setter pasa al navegador.
export function limpiarResumen(d) {
  const out = {};
  for (const k of CIFRAS_SETTER) { const n = Number(d?.[k]); out[k] = d?.[k] == null || !Number.isFinite(n) ? null : Math.max(0, Math.round(n)); }
  out.actualizado = typeof d?.actualizado === 'string' && !Number.isNaN(Date.parse(d.actualizado)) ? d.actualizado : '';
  return out;
}

export function rangoValido(desde, hasta) {
  if (!DIA_RE.test(desde) || !DIA_RE.test(hasta) || desde > hasta) return false;
  return (Date.parse(hasta) - Date.parse(desde)) / 86_400_000 <= 400;
}

// { configurado, falta?, cifras?, error? }
export async function resumenSetterIa(config, desde, hasta, { fresh = false } = {}) {
  const url = config?.setterIa?.url || '';
  const clave = claveResumenSetter();
  if (env.GHL_MOCK === '1' && url) {
    return { configurado: true, cifras: limpiarResumen({ respondieron: 38, conversaciones_activas: 9, pasadas_a_persona: 6, citas: 11, bajas: 2, tiempo_respuesta_mediana_seg: 74, mensajes_ia: 412, actualizado: new Date().toISOString() }) };
  }
  if (!url || !clave) return { configurado: false, falta: !url ? 'url' : 'clave' };
  try {
    const cifras = await cacheCompartida(`setter-ia|${desde}|${hasta}`, 10 * 60_000, async () => {
      const res = await fetch(`${url}/api/dashboard/resumen?c=${encodeURIComponent(clienteActual().id)}&desde=${desde}&hasta=${hasta}`, {
        headers: { authorization: `Bearer ${clave}`, accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 401) throw new Error('El setter no acepta la clave: revisa que SETTER_RESUMEN_KEY_… sea igual que RESUMEN_KEY_… del setter');
      if (res.status === 503) throw new Error('El setter aún no tiene la clave de este cliente (RESUMEN_KEY_…)');
      if (!res.ok) throw new Error(`El setter respondió con un error (${res.status})`);
      return limpiarResumen(await res.json());
    }, { fresh });
    return { configurado: true, cifras };
  } catch (e) {
    return { configurado: true, error: e.name === 'TimeoutError' ? 'El setter tarda demasiado en responder' : e.message };
  }
}
