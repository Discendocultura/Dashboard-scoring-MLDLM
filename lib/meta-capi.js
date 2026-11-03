// Conversions API de Meta: AlquimIA manda a Meta, desde el servidor, lo que el píxel del navegador no ve o pierde
// (bloqueadores, iOS, compras en Hotmart o ThriveCart, ventas cerradas por WhatsApp), para que las campañas aprendan de
// quien de verdad compra (eventos en public/js/meta-capi.js):
//   · Purchase              → cada cobro (Hotmart, ThriveCart, CSV de clientes) con su valor, si es la primera compra o
//                             una renovación/cuota, y lo que esa persona lleva gastado (ltv).
//   · LeadCualificado, Schedule, SeQuedoHastaLaOferta → de la tarea programada (lib/meta-capi-senales.js).
//   · EntroAlDirecto, VioClase1 → al momento (directo-zoom.js, track.js).
// Los datos personales van cifrados (SHA-256), como pide Meta. Cada evento lleva un event_id fijo para que Meta no lo
// cuente dos veces. Meta solo acepta eventos de los últimos 7 días: las compras antiguas de un CSV van a una audiencia
// de clientes con su valor (para audiencias parecidas a quien más gasta), con el token de los anuncios.
// Token de la Conversions API, por orden: el guardado en Conexiones (cifrado), META_CAPI_TOKEN(_<CLIENTE>) en
// Cloudflare y, si no hay ninguno, el de los anuncios (puede no tener permiso sobre el píxel: «Comprobar» lo dice).
import { env } from './env.js';
import { envCliente, clienteActual } from './cliente.js';
import { getConfig } from './config-store.js';
import { leerJSON, guardarJSON } from './store.js';
import { cifrar, descifrar } from './totp.js';
import { tokenAnuncios, cuentaMeta } from './meta.js';
import { origenesPorEmail } from './origen.js';
import { EVENTOS_CAPI, sanitizeMetaCapi } from '../public/js/meta-capi.js';

export { EVENTOS_CAPI, sanitizeMetaCapi };

const VERSION = () => env.META_API_VERSION || 'v24.0';
const CLAVE_LOG = 'lsd_meta_capi_log';
const CLAVE_TOKEN = 'lsd_meta_capi_token';
const CLAVE_AUDIENCIA = 'lsd_meta_capi_audiencia';
const MAX_LOG = 30;
const SIETE_DIAS = 7 * 86_400_000;
export const enviados = []; // modo de prueba (GHL_MOCK): lo que se habría mandado
export const audienciaMock = []; // modo de prueba: lo que se habría subido a la audiencia de clientes
const mock = () => env.GHL_MOCK === '1';

// ---- Token ----
export async function tokenCapi() {
  const g = await leerJSON(CLAVE_TOKEN, () => null).catch(() => null);
  const propio = g?.token ? await descifrar(g.token) : '';
  if (propio) return { token: propio, origen: 'propio', final: g.final || '' };
  const cf = String(envCliente('META_CAPI_TOKEN') || env.META_CAPI_TOKEN || '').trim();
  if (cf) return { token: cf, origen: 'cloudflare', final: cf.slice(-4) };
  const ads = clienteActual().meta === 'agencia' ? env.META_ACCESS_TOKEN : envCliente('META_ACCESS_TOKEN') || env.META_ACCESS_TOKEN;
  if (ads) return { token: String(ads).trim(), origen: 'anuncios', final: String(ads).trim().slice(-4) };
  return { token: '', origen: '', final: '' };
}
export async function guardarTokenCapi(token) {
  const t = String(token || '').trim();
  if (!/^[A-Za-z0-9_-]{30,600}$/.test(t)) throw Object.assign(new Error('Token no válido'), { status: 400, publicMessage: 'Eso no parece un token de Meta: cópialo entero desde el Administrador de eventos (empieza por «EAA…»).' });
  await guardarJSON(CLAVE_TOKEN, { token: await cifrar(t), final: t.slice(-4), guardado: new Date().toISOString() }, { motivo: 'Meta CAPI: token' });
}
export const quitarTokenCapi = () => guardarJSON(CLAVE_TOKEN, { token: '' }, { motivo: 'Meta CAPI: quitar token' });

// «Comprobar»: ¿este token puede escribir en este píxel? Pregunta a Meta por el píxel (sin mandar ningún evento).
export async function comprobarConexion(pixelId) {
  const { token, origen } = await tokenCapi();
  if (!pixelId) return { ok: false, motivo: 'Falta el ID del píxel.' };
  if (!token) return { ok: false, motivo: 'Falta el token: pégalo arriba (paso 2).' };
  if (mock()) return { ok: true, nombre: 'Píxel de prueba', origen };
  try {
    const res = await fetch(`https://graph.facebook.com/${VERSION()}/${pixelId}?fields=id,name&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) });
    const r = await res.json().catch(() => ({}));
    if (res.ok && r.id) return { ok: true, nombre: r.name || '', origen };
    const msg = r.error?.message || `Meta ${res.status}`;
    return { ok: false, origen, motivo: origen === 'anuncios'
      ? `El token de los anuncios no sirve para este píxel (${msg}). Genera uno en el píxel (paso 2) y pégalo arriba.`
      : `Meta dice: ${msg}. Revisa que el token sea de este píxel y que el ID esté bien.` };
  } catch (e) {
    return { ok: false, origen, motivo: `No se ha podido hablar con Meta: ${e.message}` };
  }
}

// Nota de calidad de Meta (Event Match Quality, de 0 a 10) de cada evento del píxel, de la API de calidad de conjuntos
// de datos. → { ok, eventos: [{ evento, nota }] } o { ok: false, motivo } (si Meta no la da, se ve en el Administrador).
export async function notaCalidadMeta(pixelId) {
  const { token } = await tokenCapi();
  if (!pixelId || !token) return { ok: false, motivo: 'Falta el píxel o el token.' };
  if (mock()) return { ok: true, eventos: [{ evento: 'Purchase', nota: 8.1 }, { evento: 'LeadCualificado', nota: 6.4 }] };
  try {
    const u = new URL(`https://graph.facebook.com/${VERSION()}/dataset_quality`);
    u.searchParams.set('dataset_id', pixelId);
    u.searchParams.set('fields', 'web{event_name,event_match_quality{composite_score}}');
    u.searchParams.set('access_token', token);
    const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, motivo: `Meta no ha dado la nota (${r.error?.message || res.status}). Mírala en el Administrador de eventos → Resumen → «Calidad de la coincidencia de eventos».` };
    const eventos = (r.web || r.data?.[0]?.web || []).map((e) => ({ evento: e.event_name, nota: Number(e.event_match_quality?.composite_score) })).filter((e) => e.evento && Number.isFinite(e.nota));
    return { ok: true, eventos };
  } catch (e) {
    return { ok: false, motivo: e.message };
  }
}

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
// El país solo no identifica a nadie: hace falta email, teléfono, id, cookie de Meta o IP + navegador.
const identifica = (ud) => ['em', 'ph', 'external_id', 'fbp', 'fbc'].some((k) => ud[k]) || Boolean(ud.client_ip_address && ud.client_user_agent);

// Lo del navegador que ayuda a Meta a reconocer a la persona (IP, navegador y las cookies del píxel que manda tracker.js).
export const datosNavegador = (request, body = {}) => ({
  ip: request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '',
  ua: request.headers.get('user-agent') || '', fbp: body.fbp, fbc: body.fbc,
});

// En el registro: las compras, los lotes, las pruebas y los errores (no cada entrada al directo: serían cientos).
async function apuntar(r) {
  if (r.ok && !r.prueba && r.evento !== 'Purchase' && !r.n) return;
  try {
    const log = await leerJSON(CLAVE_LOG, () => []);
    await guardarJSON(CLAVE_LOG, [{ en: new Date().toISOString(), ...r }, ...(Array.isArray(log) ? log : [])].slice(0, MAX_LOG), { motivo: 'Meta CAPI' });
  } catch { /* el registro no es imprescindible */ }
}
export const ultimosEnvios = () => leerJSON(CLAVE_LOG, () => []).then((l) => (Array.isArray(l) ? l : []));

// Lo que lleva gastado una persona (cobros menos reembolsos) en todas las pasarelas que guarda AlquimIA.
export async function ltvDe(email, extra = []) {
  const em = String(email || '').trim().toLowerCase();
  if (!em) return 0;
  const [hm, tc, sk] = await Promise.all(['lsd_hotmart_ventas', 'lsd_thrivecart_ventas', 'lsd_skool_miembros'].map((k) => leerJSON(k, () => ({ ventas: [] })).catch(() => ({ ventas: [] }))));
  const vistos = new Set();
  let total = 0;
  for (const v of [...(hm?.ventas || []), ...(tc?.ventas || []), ...(sk?.ventas || []), ...extra]) {
    if (String(v.email || '').toLowerCase() !== em || v.prueba || vistos.has(v.id)) continue;
    vistos.add(v.id);
    if (v.tipo === 'cobro') total += Math.abs(Number(v.importe) || 0);
    else if (v.tipo === 'reembolso') total -= Math.abs(Number(v.importe) || 0);
  }
  return Math.max(0, Math.round(total * 100) / 100);
}
// ¿Primera compra o renovación/cuota? (Hotmart: recurrencia > 1; ThriveCart: aviso de suscripción o de plazo.)
export const tipoVenta = (v = {}) => (Number(v.recurrencia) > 1 || /subscription|rebill|recurring|payment_plan|instal/i.test(String(v.evento || '')) ? 'renovacion' : 'primera');

// Valor del cliente a su campaña de origen: a cada evento (sobre todo compras posteriores y renovaciones) se le añade
// el identificador del clic del anuncio que trajo a la persona (fbc, del fbclid que guardó tracker.js en su primera
// visita) y, en custom_data, de qué campaña y anuncio vino. Así Meta lo asigna a esa campaña.
export async function conOrigen(lista = []) {
  const emails = lista.filter((x) => x.datos?.email).map((x) => x.datos.email);
  if (!emails.length) return lista;
  let mapa;
  try { mapa = await origenesPorEmail(emails); } catch { return lista; }
  return lista.map((x) => {
    const o = mapa.get(String(x.datos?.email || '').trim().toLowerCase());
    if (!o) return x;
    const t = o.primero?.fbclid ? o.primero : o.ultimo?.fbclid ? o.ultimo : o.primero;
    const fbc = !x.datos.fbc && t?.fbclid ? `fb.1.${Number(t.en) || Date.now()}.${t.fbclid}` : x.datos.fbc;
    const origen = Object.fromEntries(Object.entries({ origen_campana: o.primero?.campaign, origen_conjunto: o.primero?.term, origen_anuncio: o.primero?.content, origen_anuncio_id: o.primero?.adId }).filter(([, v]) => v));
    return { ...x, datos: { ...x.datos, ...(fbc ? { fbc } : {}) }, custom: { ...(x.custom || {}), ...origen } };
  });
}

// Calidad de los datos que mandamos (lo que Meta usa para reconocer a la persona): % de eventos con cada dato.
export function calidadDatos(eventos = []) {
  if (!eventos.length) return null;
  const pct = (k) => Math.round((eventos.filter((e) => e.user_data?.[k]).length / eventos.length) * 100);
  return { email: pct('em'), telefono: pct('ph'), clic: pct('fbc'), cookie: pct('fbp'), ip: pct('client_ip_address') };
}

// Un evento ya armado (para mandarlo solo o en lote). null si no hay con qué reconocer a la persona.
async function armar({ tipo, eventId, datos = {}, custom = {}, url = '', cuando = Date.now() }) {
  const prueba = tipo === 'prueba';
  const ud = await userData(datos);
  if (!identifica(ud)) return null;
  return {
    event_name: prueba ? 'PruebaAlquimIA' : EVENTOS_CAPI[tipo].nombre, event_time: Math.floor(cuando / 1000), event_id: String(eventId).slice(0, 100),
    action_source: ['compras', 'cualificado', 'llamada', 'oferta', 'lead', 'pago'].includes(tipo) && !datos.ua ? 'system_generated' : 'website',
    ...(url ? { event_source_url: String(url).slice(0, 500) } : {}),
    user_data: ud,
    ...(Object.keys(custom).length ? { custom_data: custom } : {}),
  };
}

// Manda a Meta una lista de eventos ya armados (hasta 1000 por llamada). → { ok, recibidos, motivo? }
async function mandar(cfg, eventos, { prueba = false } = {}) {
  const { token } = await tokenCapi();
  if (!token && !mock()) return { ok: false, motivo: 'Falta el token de la Conversions API (paso 2 de Conexiones)' };
  const cuerpo = { data: eventos, ...(cfg.testCode ? { test_event_code: cfg.testCode } : {}) };
  if (mock()) { enviados.push({ pixel: cfg.pixelId, ...cuerpo }); return { ok: true, recibidos: eventos.length }; }
  const res = await fetch(`https://graph.facebook.com/${VERSION()}/${cfg.pixelId}/events?access_token=${encodeURIComponent(token)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(10000),
  });
  const r = await res.json().catch(() => ({}));
  const ok = res.ok && r.events_received >= 1;
  return ok ? { ok, recibidos: r.events_received, prueba } : { ok: false, motivo: String(r.error?.error_user_msg || r.error?.message || `Meta ${res.status}`).slice(0, 200) };
}

/**
 * Manda un evento a Meta si la Conversions API está activa para este cliente y ese tipo de evento.
 *   tipo: clave de EVENTOS_CAPI o 'prueba' · eventId: fijo para no duplicar
 *   datos: email, telefono, nombre, externalId, ip, ua, fbp, fbc · custom: { value, currency, … } · cuando: ms
 * → { enviado: bool, motivo? }  (nunca lanza: un fallo de Meta no puede romper una venta ni la entrada al directo)
 */
export async function enviarEventoMeta({ tipo, eventId, datos = {}, custom = {}, url = '', cuando = Date.now(), config = null }) {
  try {
    const cfg = sanitizeMetaCapi((config || await getConfig()).metaCapi);
    const prueba = tipo === 'prueba'; // «Enviar evento de prueba» de Conexiones: aunque esté apagada, con el píxel puesto
    if (!cfg.pixelId) return { enviado: false, motivo: 'Falta el ID del píxel' };
    if (!prueba && !cfg.activo) return { enviado: false, motivo: 'Conversions API apagada' };
    if (!prueba && !cfg.eventos[tipo]) return { enviado: false, motivo: 'Ese evento está apagado' };
    const [conO] = prueba ? [{ tipo, eventId, datos, custom, url, cuando }] : await conOrigen([{ tipo, eventId, datos, custom, url, cuando }]);
    const evento = await armar(conO);
    if (!evento) return { enviado: false, motivo: 'Sin datos de la persona' };
    const r = await mandar(cfg, [evento]);
    await apuntar({ evento: evento.event_name, ok: r.ok, prueba: prueba || Boolean(cfg.testCode), calidad: calidadDatos([evento]), ...(r.ok ? {} : { error: r.motivo }) });
    return r.ok ? { enviado: true } : { enviado: false, motivo: r.motivo };
  } catch (e) {
    await apuntar({ evento: tipo, ok: false, error: String(e.message).slice(0, 200) });
    return { enviado: false, motivo: e.message };
  }
}

// Varios eventos de golpe (tarea programada y CSV): [{ tipo, eventId, datos, custom, cuando }] → { enviados, motivo? }
export async function enviarLoteMeta(lista, { config = null, etiqueta = '' } = {}) {
  const cfg = sanitizeMetaCapi((config || await getConfig()).metaCapi);
  if (!cfg.pixelId || !cfg.activo) return { enviados: 0, motivo: cfg.pixelId ? 'Conversions API apagada' : 'Falta el ID del píxel' };
  const armados = (await Promise.all((await conOrigen(lista.filter((x) => cfg.eventos[x.tipo]))).map(armar))).filter(Boolean);
  let total = 0;
  for (let i = 0; i < armados.length; i += 1000) {
    const parte = armados.slice(i, i + 1000);
    const r = await mandar(cfg, parte).catch((e) => ({ ok: false, motivo: e.message }));
    if (!r.ok) { await apuntar({ evento: etiqueta || 'Lote', ok: false, n: parte.length, error: r.motivo }); return { enviados: total, motivo: r.motivo }; }
    total += parte.length;
  }
  if (total) await apuntar({ evento: etiqueta || 'Lote', ok: true, n: total, prueba: Boolean(cfg.testCode), calidad: calidadDatos(armados) });
  return { enviados: total };
}

// ---- CSV de clientes ----
// filas: [{ email, telefono, nombre, importe, moneda, producto, fecha (ms), pedido, reembolso }]
//   · compras de los últimos 7 días → Purchase (con su valor y el ltv de la persona)
//   · todas → audiencia de clientes con su valor de vida (LOOKALIKE_VALUE), con el token de los anuncios
export async function importarClientesCsv(filas = [], { config = null, ahora = Date.now() } = {}) {
  const cfg = sanitizeMetaCapi((config || await getConfig()).metaCapi);
  const limpias = filas.slice(0, 20000).map((f) => ({
    email: String(f.email || '').trim().toLowerCase().slice(0, 200), telefono: String(f.telefono || '').slice(0, 40), nombre: String(f.nombre || '').slice(0, 120),
    importe: Math.abs(Number(f.importe) || 0), moneda: String(f.moneda || 'EUR').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'EUR',
    producto: String(f.producto || '').slice(0, 120), fecha: Number(f.fecha) || 0, pedido: String(f.pedido || '').slice(0, 80), reembolso: f.reembolso === true,
  })).filter((f) => (f.email || f.telefono) && f.fecha);
  // Valor de vida por persona (lo del CSV): cobros menos reembolsos.
  const porPersona = new Map();
  for (const f of limpias) {
    const k = f.email || f.telefono;
    const p = porPersona.get(k) || { email: f.email, telefono: f.telefono, nombre: f.nombre, ltv: 0 };
    p.ltv += f.reembolso ? -f.importe : f.importe;
    if (!p.telefono && f.telefono) p.telefono = f.telefono;
    porPersona.set(k, p);
  }
  const recientes = limpias.filter((f) => !f.reembolso && f.importe > 0 && ahora - f.fecha < SIETE_DIAS - 3_600_000 && f.fecha <= ahora + 86_400_000); // fechas sin hora: las de hoy salen a mediodía
  const compras = recientes.length ? await enviarLoteMeta(recientes.map((f) => ({
    tipo: 'compras', eventId: `csv-${f.pedido || `${f.email || f.telefono}-${f.fecha}-${f.importe}`}`, cuando: Math.min(f.fecha, ahora),
    datos: { email: f.email, telefono: f.telefono, nombre: f.nombre },
    custom: { value: f.importe, currency: f.moneda, content_name: f.producto, tipo_venta: 'csv', ltv: Math.max(0, Math.round((porPersona.get(f.email || f.telefono)?.ltv || 0) * 100) / 100) },
  })), { config: { metaCapi: cfg }, etiqueta: 'Compras del CSV' }) : { enviados: 0 };
  const audiencia = await subirAudienciaClientes([...porPersona.values()].filter((p) => p.ltv > 0));
  return { filas: limpias.length, personas: porPersona.size, recientes: recientes.length, compras, audiencia };
}

// Audiencia «AlquimIA · Clientes con su valor» (basada en valor): la crea la primera vez y le añade las personas.
export async function subirAudienciaClientes(personas = []) {
  if (!personas.length) return { subidas: 0, motivo: 'Nadie con compras en el CSV' };
  const token = tokenAnuncios();
  const cuenta = cuentaMeta();
  if (!mock() && (!token || !cuenta)) return { subidas: 0, motivo: 'Falta conectar la cuenta de anuncios de Meta (Conexiones → Meta)' };
  const filas = [];
  for (const p of personas.slice(0, 10000)) {
    const n = normalizar({ email: p.email, telefono: p.telefono });
    if (!n.em && !n.ph) continue;
    filas.push([n.em ? await sha256(n.em) : '', n.ph ? await sha256(n.ph) : '', Math.round(p.ltv * 100) / 100]);
  }
  if (mock()) { audienciaMock.push(...filas); return { subidas: filas.length, audiencia: 'AlquimIA · Clientes con su valor' }; }
  try {
    const g = await leerJSON(CLAVE_AUDIENCIA, () => null).catch(() => null);
    let id = g?.cuenta === cuenta ? g.id : '';
    const base = `https://graph.facebook.com/${VERSION()}`;
    if (!id) {
      const res = await fetch(`${base}/act_${cuenta}/customaudiences?access_token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'AlquimIA · Clientes con su valor', subtype: 'CUSTOM', customer_file_source: 'USER_PROVIDED_ONLY', is_value_based: true, description: 'Clientes subidos desde AlquimIA con lo que lleva gastado cada uno' }),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || !r.id) return { subidas: 0, motivo: `Meta no ha creado la audiencia: ${r.error?.error_user_msg || r.error?.message || res.status}. Si es la primera vez, acepta las condiciones de audiencias personalizadas en el Administrador de anuncios.` };
      id = r.id;
      await guardarJSON(CLAVE_AUDIENCIA, { id, cuenta, creada: new Date().toISOString() }, { motivo: 'Meta CAPI: audiencia de clientes' });
    }
    const res = await fetch(`${base}/${id}/users?access_token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: { schema: ['EMAIL', 'PHONE', 'LOOKALIKE_VALUE'], data: filas } }),
    });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) return { subidas: 0, motivo: `Meta no ha aceptado la lista: ${r.error?.error_user_msg || r.error?.message || res.status}` };
    await apuntar({ evento: 'Audiencia de clientes', ok: true, n: filas.length });
    return { subidas: filas.length, audiencia: 'AlquimIA · Clientes con su valor' };
  } catch (e) {
    return { subidas: 0, motivo: e.message };
  }
}
