// SendFlow (grupos de WhatsApp de lanzamientos y meteóricos) a través de su API oficial, SendAPI.
// Clave: en SendFlow → «API Keys». Va como secreto en Cloudflare: SENDFLOW_API_KEY (cliente principal)
// o SENDFLOW_API_KEY_<CLIENTE> (el resto). Nunca en el código ni en el chat.
// Base: https://sendflow.pro/sendapi (se puede cambiar con SENDFLOW_BASE_URL). Auth: Bearer.
import { env } from './env.js';
import { clienteActual, envCliente, sufijo } from './cliente.js';
import { cacheCompartida, leerCompartida, guardarCompartida } from './store.js';

const useMock = () => env.GHL_MOCK === '1';
const base = () => String(env.SENDFLOW_BASE_URL || 'https://sendflow.pro/sendapi').replace(/\/+$/, '');
// La clave limpia: sin espacios ni saltos de línea, sin comillas y sin «Bearer » si se pegó con él.
const limpia = (k) => String(k || '').trim().replace(/^["']|["']$/g, '').replace(/^bearer\s+/i, '').trim();
const claveCruda = () => envCliente('SENDFLOW_API_KEY');
const clave = () => limpia(claveCruda());
export const sendflowConfigurado = () => useMock() || Boolean(clave());
// Nombre de la variable de Cloudflare de este cliente (para enseñarlo en el dashboard).
export const variableSendflow = (c = clienteActual()) => (c.principal ? 'SENDFLOW_API_KEY' : `SENDFLOW_API_KEY_${sufijo(c.id)}`);

// Cómo está la clave guardada (sin enseñarla): para detectar errores al copiarla.
export function formatoClave() {
  const k = String(claveCruda() || '');
  return {
    largo: limpia(k).length,
    espacios: k !== k.trim() || /\s/.test(limpia(k)),
    comillas: /^\s*["']|["']\s*$/.test(k),
    conBearer: /^\s*["']?\s*bearer\s+/i.test(k),
    prefijo: /^send_api-/i.test(limpia(k)),
  };
}

// ---------- Límite de SendAPI ----------
// SendFlow bloquea la clave (30 min o más, y cada vez más) si se le hacen demasiadas peticiones seguidas.
// Así que: (1) entre una petición y la siguiente pasan al menos 3 s (lo sabe todo el equipo, vía D1);
// (2) si SendFlow responde 429 o 403, se deja de llamar durante un rato («freno»), sin insistir.
const PAUSA_MS = 3_000;
// El freno va con cada clave (una huella, nunca la clave): con una clave nueva se empieza de cero.
const huella = (k) => { let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const FRENO_DE = () => `sendflow-freno|${huella(clave())}`;
export async function frenoSendflow() {
  const f = await leerCompartida(FRENO_DE(), 6 * 3_600_000);
  return f && f.hasta > Date.now() ? f : null;
}
async function ponerFreno(status, txt) {
  const bloqueo = status === 429 || /rate|limit|bloque|block|excess|excesso/i.test(txt);
  const min = bloqueo ? 35 : 10;
  const f = { hasta: Date.now() + min * 60_000, status, bloqueo };
  await guardarCompartida(FRENO_DE(), f);
  return f;
}
export const quitarFreno = () => guardarCompartida(FRENO_DE(), { hasta: 0 });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperarTurno() {
  const ultima = Number(await leerCompartida('sendflow-ultima', 60_000)) || 0;
  const espera = ultima + PAUSA_MS - Date.now();
  if (espera > 0) await dormir(Math.min(espera, PAUSA_MS));
  await guardarCompartida('sendflow-ultima', Date.now());
}
const horaEs = (ms) => new Date(ms).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
const errorFreno = (f) => Object.assign(new Error('SendFlow en pausa'), {
  status: 503, freno: f,
  publicMessage: f.bloqueo
    ? `SendFlow ha bloqueado la clave un rato por exceso de peticiones. El dashboard no le pedirá nada hasta las ${horaEs(f.hasta)} para no alargar el bloqueo.`
    : `SendFlow ha rechazado la clave (${f.status}). El dashboard espera hasta las ${horaEs(f.hasta)} antes de volver a intentarlo, para no provocar un bloqueo.`,
});

function errorSendflow(status, txt) {
  const msg = status === 401 || status === 403
    ? 'SendFlow rechaza la clave: revisa que esté bien copiada y que tu plan incluya SendAPI.'
    : status === 404 ? 'SendFlow no encuentra eso (¿campaña borrada?).'
      : status === 429 ? 'SendFlow pide ir más despacio (demasiadas peticiones).'
        : `SendFlow ha respondido con un error (${status}).`;
  return Object.assign(new Error(`SendFlow ${status}: ${String(txt).slice(0, 300)}`), { status: 502, publicMessage: msg, sendflowStatus: status });
}

// Petición a SendAPI (Authorization: Bearer <clave>), respetando el límite y con 20 s como máximo.
export async function sendflow(path, { method = 'GET', body } = {}) {
  if (useMock()) return mockSendflow(path, { method, body });
  if (!clave()) throw Object.assign(new Error('SendFlow sin clave'), { status: 400, publicMessage: `Falta la clave de SendFlow (variable ${variableSendflow()} en Cloudflare).` });
  const f = await frenoSendflow();
  if (f) throw errorFreno(f);
  await esperarTurno();
  let res;
  try {
    res = await fetch(`${base()}${path}`, {
      method,
      headers: { authorization: `Bearer ${clave()}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw Object.assign(new Error(`SendFlow sin respuesta: ${e.message}`), { status: 502, publicMessage: 'No se ha podido conectar con SendFlow (no responde). Prueba en un momento.' });
  }
  const txt = await res.text();
  if (res.status === 429 || res.status === 403 || res.status === 401) {
    const freno = await ponerFreno(res.status, txt);
    const e = errorSendflow(res.status, txt);
    if (freno.bloqueo) e.publicMessage = errorFreno(freno).publicMessage;
    e.freno = freno;
    throw e;
  }
  if (!res.ok) throw errorSendflow(res.status, txt);
  try { return txt ? JSON.parse(txt) : null; } catch { return txt; }
}

// Lo que devuelve SendFlow puede venir como lista o dentro de { data } / { releases }: siempre una lista.
const lista = (r, k) => (Array.isArray(r) ? r : Array.isArray(r?.[k]) ? r[k] : Array.isArray(r?.data) ? r.data : []);
const idDe = (x) => String(x?.id ?? x?._id ?? x?.releaseId ?? '');

// Campañas de SendFlow: [{ id, nombre, tipo, archivada }].
export async function campanasSendflow({ fresh = false } = {}) {
  return cacheCompartida('sendflow-campanas', 10 * 60_000, async () => campanasDe(await sendflow('/releases')), { fresh });
}
const campanasDe = (r) => lista(r, 'releases').map((r) => ({
    id: idDe(r), nombre: String(r?.name ?? r?.title ?? idDe(r)), tipo: String(r?.type || ''), archivada: Boolean(r?.archived),
  })).filter((r) => r.id);

// Analítica de una campaña: { entradas, salidas, clics } con total y por día (AAAA-MM-DD).
// SendFlow da las fechas como ddmmyyyy.
export function analiticaSendflow(id, { fresh = false } = {}) {
  return cacheCompartida(`sendflow-analitica|${id}`, 5 * 60_000, async () => analiticaDe(await sendflow(`/releases/${encodeURIComponent(id)}/analytics`)), { fresh });
}
function analiticaDe(r) {
  const d = r?.data && !r.add ? r.data : r;
  const dias = (x) => Object.fromEntries(Object.entries(x?.dates || {}).map(([k, n]) => [/^\d{8}$/.test(k) ? `${k.slice(4)}-${k.slice(2, 4)}-${k.slice(0, 2)}` : k, Number(n) || 0]));
  const parte = (x) => ({ total: Number(x?.total) || 0, porDia: dias(x) });
  return { entradas: parte(d?.add), salidas: parte(d?.remove), clics: parte(d?.clicks) };
}

// Grupos de una campaña: [{ id, nombre, personas, lleno }] (guardado 10 min).
export function gruposSendflow(id, { fresh = false } = {}) {
  return cacheCompartida(`sendflow-grupos|${id}`, 10 * 60_000, async () => lista(await sendflow(`/releases/${encodeURIComponent(id)}/groups`), 'groups').map((g) => ({
    id: String(g?.id ?? g?._id ?? g?.gid ?? ''), nombre: String(g?.name ?? g?.subject ?? ''),
    personas: Number(g?.count ?? g?.participants ?? g?.size ?? 0) || 0, lleno: Boolean(g?.full),
  })), { fresh });
}

// ---------- Datos de prueba (GHL_MOCK=1) ----------
function mockSendflow(path) {
  if (path === '/releases') return [
    { id: 'rel-demo', name: 'Webinar octubre · Grupos', type: 'WhatsRelease', archived: false },
    { id: 'rel-bf', name: 'Black Friday 2026', type: 'WhatsRelease', archived: false },
  ];
  const g = path.match(/^\/releases\/([^/]+)\/groups$/);
  if (g) return [1, 2, 3, 4].map((n) => ({ id: `g${n}`, name: `Grupo ${n} · Webinar`, count: n < 4 ? 1024 : 310, full: n < 4 }));
  const m = path.match(/^\/releases\/([^/]+)\/analytics$/);
  if (m) {
    const hoy = new Date();
    const fecha = (n) => { const d = new Date(hoy.getTime() - n * 86_400_000); return `${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}${d.getUTCFullYear()}`; };
    const serie = (f) => Object.fromEntries([...Array(10)].map((_, i) => [fecha(i), f(i)]));
    const add = serie((i) => 120 + ((i * 37) % 90));
    const rem = serie((i) => 6 + ((i * 7) % 12));
    const cli = serie((i) => 180 + ((i * 53) % 120));
    const tot = (o) => Object.values(o).reduce((t, n) => t + n, 0);
    return { add: { total: tot(add), dates: add }, remove: { total: tot(rem), dates: rem }, clicks: { total: tot(cli), dates: cli } };
  }
  throw errorSendflow(404, 'mock');
}
