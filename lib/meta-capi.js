// Conversions API de Meta: AlquimIA manda a Meta, desde el servidor, lo que el píxel del navegador no ve o pierde
// (bloqueadores, iOS, compras en Hotmart o ThriveCart), para que las campañas aprendan de quien de verdad compra:
//   · Purchase          → cada cobro de Hotmart o ThriveCart, con su valor y moneda.
//   · VioClase1         → quien ve al menos la mitad de la clase 1 (evento propio: conversión personalizada en Meta).
//   · EntroAlDirecto    → quien entra al directo desde AlquimIA (evento propio).
// Los datos personales van cifrados (SHA-256), como pide Meta. Cada evento lleva un event_id fijo (p. ej. el de la venta)
// para que Meta no lo cuente dos veces si llega repetido o también desde el píxel con el mismo id.
// Configuración (Conexiones → Meta → Conversions API): el ID del píxel (o «conjunto de datos») y qué eventos se mandan.
// Token: META_CAPI_TOKEN (o META_CAPI_TOKEN_<CLIENTE>); si no, el de los anuncios (META_ACCESS_TOKEN…) si tiene acceso al píxel.
import { env } from './env.js';
import { envCliente, clienteActual } from './cliente.js';
import { getConfig } from './config-store.js';
import { leerJSON, guardarJSON } from './store.js';
import { EVENTOS_CAPI, sanitizeMetaCapi } from '../public/js/meta-capi.js';

export { EVENTOS_CAPI, sanitizeMetaCapi };

const VERSION = () => env.META_API_VERSION || 'v24.0';
const CLAVE_LOG = 'lsd_meta_capi_log';
const MAX_LOG = 30;
export const enviados = []; // modo de prueba (GHL_MOCK): lo que se habría mandado

export const tokenCapi = () => String(envCliente('META_CAPI_TOKEN') || env.META_CAPI_TOKEN || (clienteActual().meta === 'agencia' ? env.META_ACCESS_TOKEN : envCliente('META_ACCESS_TOKEN') || env.META_ACCESS_TOKEN) || '').trim();

// ---- Datos de la persona, normalizados y cifrados como pide Meta ----
async function sha256(t) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const quitarTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
export function normalizar({ email, telefono, nombre, apellido, pais = 'es', externalId } = {}) {
  const em = String(email || '').trim().toLowerCase();
  let ph = String(telefono || '').replace(/\D/g, '');
  if (ph && ph.length === 9 && /^[6789]/.test(ph)) ph = `34${ph}`; // móvil o fijo español sin prefijo
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  const fn = quitarTildes(partes[0] || '').toLowerCase().replace(/[^a-zñ]/g, '');
  const ln = quitarTildes(apellido || partes.slice(1).join(' ')).toLowerCase().replace(/[^a-zñ]/g, '');
  return { em: /.+@.+\..+/.test(em) ? em : '', ph: ph.length >= 8 ? ph : '', fn, ln, country: String(pais || '').toLowerCase().slice(0, 2), external_id: String(externalId || '').trim() };
}
export async function userData(datos = {}) {
  const n = normalizar(datos);
  const ud = {};
  for (const k of ['em', 'ph', 'fn', 'ln', 'country', 'external_id']) if (n[k]) ud[k] = [await sha256(n[k])];
  if (datos.ip) ud.client_ip_address = String(datos.ip).slice(0, 64);
  if (datos.ua) ud.client_user_agent = String(datos.ua).slice(0, 400);
  if (/^fb\.\d\.\d+\.\S+$/.test(String(datos.fbp || ''))) ud.fbp = String(datos.fbp).slice(0, 200);
  if (/^fb\.\d\.\d+\.\S+$/.test(String(datos.fbc || ''))) ud.fbc = String(datos.fbc).slice(0, 300);
  return ud;
}

// Lo del navegador que ayuda a Meta a reconocer a la persona (IP, navegador y las cookies del píxel que manda tracker.js).
export const datosNavegador = (request, body = {}) => ({
  ip: request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '',
  ua: request.headers.get('user-agent') || '', fbp: body.fbp, fbc: body.fbc,
});

// En el registro: las compras, las pruebas y los errores (no cada entrada al directo: a la hora del directo serían cientos).
async function apuntar(r) {
  if (r.ok && !r.prueba && r.evento !== 'Purchase') return;
  try {
    const log = await leerJSON(CLAVE_LOG, () => []);
    await guardarJSON(CLAVE_LOG, [{ en: new Date().toISOString(), ...r }, ...(Array.isArray(log) ? log : [])].slice(0, MAX_LOG), { motivo: 'Meta CAPI' });
  } catch { /* el registro no es imprescindible */ }
}
export const ultimosEnvios = () => leerJSON(CLAVE_LOG, () => []).then((l) => (Array.isArray(l) ? l : []));

/**
 * Manda un evento a Meta si la Conversions API está activa para este cliente y ese tipo de evento.
 *   tipo: 'compras' | 'clase1' | 'directo' · eventId: fijo para no duplicar · datos: email, telefono, nombre, externalId, ip, ua, fbp, fbc
 *   custom: { value, currency, content_name, … } · url: la página · cuando: ms
 * → { enviado: bool, motivo? }  (nunca lanza: un fallo de Meta no puede romper una venta ni la entrada al directo)
 */
export async function enviarEventoMeta({ tipo, eventId, datos = {}, custom = {}, url = '', cuando = Date.now(), config = null }) {
  try {
    const cfg = sanitizeMetaCapi((config || await getConfig()).metaCapi);
    const prueba = tipo === 'prueba'; // «Enviar evento de prueba» de Conexiones: aunque esté apagada, con el píxel puesto
    if (!cfg.pixelId) return { enviado: false, motivo: 'Falta el ID del píxel' };
    if (!prueba && !cfg.activo) return { enviado: false, motivo: 'Conversions API apagada' };
    if (!prueba && !cfg.eventos[tipo]) return { enviado: false, motivo: 'Ese evento está apagado' };
    const token = tokenCapi();
    if (!token && env.GHL_MOCK !== '1') return { enviado: false, motivo: 'Falta el token (META_CAPI_TOKEN)' };
    const evento = {
      event_name: prueba ? 'PruebaAlquimIA' : EVENTOS_CAPI[tipo].nombre, event_time: Math.floor(cuando / 1000), event_id: String(eventId).slice(0, 100),
      action_source: tipo === 'compras' && !datos.ua ? 'system_generated' : 'website',
      ...(url ? { event_source_url: String(url).slice(0, 500) } : {}),
      user_data: await userData(datos),
      ...(Object.keys(custom).length ? { custom_data: custom } : {}),
    };
    const ud = evento.user_data; // el país solo no identifica a nadie
    const identifica = ['em', 'ph', 'external_id', 'fbp', 'fbc'].some((k) => ud[k]) || (ud.client_ip_address && ud.client_user_agent);
    if (!identifica) return { enviado: false, motivo: 'Sin datos de la persona' };
    const cuerpo = { data: [evento], ...(cfg.testCode ? { test_event_code: cfg.testCode } : {}) };
    if (env.GHL_MOCK === '1' && !token) {
      enviados.push({ pixel: cfg.pixelId, ...cuerpo });
      await apuntar({ evento: evento.event_name, ok: true, prueba: prueba || Boolean(cfg.testCode) });
      return { enviado: true };
    }
    const res = await fetch(`https://graph.facebook.com/${VERSION()}/${cfg.pixelId}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(8000),
    });
    const r = await res.json().catch(() => ({}));
    const ok = res.ok && r.events_received >= 1;
    await apuntar({ evento: evento.event_name, ok, prueba: prueba || Boolean(cfg.testCode), ...(ok ? {} : { error: String(r.error?.error_user_msg || r.error?.message || res.status).slice(0, 200) }) });
    return ok ? { enviado: true } : { enviado: false, motivo: r.error?.message || `Meta ${res.status}` };
  } catch (e) {
    await apuntar({ evento: tipo, ok: false, error: String(e.message).slice(0, 200) });
    return { enviado: false, motivo: e.message };
  }
}
