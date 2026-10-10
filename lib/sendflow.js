// SendFlow (grupos de WhatsApp de lanzamientos y meteóricos) a través de su API oficial, SendAPI.
// Clave: en SendFlow → «API Keys». Va como secreto en Cloudflare: SENDFLOW_API_KEY (cliente principal)
// o SENDFLOW_API_KEY_<CLIENTE> (el resto). Nunca en el código ni en el chat.
// Base: https://sendflow.pro/sendapi (se puede cambiar con SENDFLOW_BASE_URL). Auth: Bearer.
import { env } from './env.js';
import { clienteActual, envCliente, sufijo } from './cliente.js';

const useMock = () => env.GHL_MOCK === '1';
const base = () => String(env.SENDFLOW_BASE_URL || 'https://sendflow.pro/sendapi').replace(/\/+$/, '');
const clave = () => envCliente('SENDFLOW_API_KEY');
export const sendflowConfigurado = () => useMock() || Boolean(clave());
// Nombre de la variable de Cloudflare de este cliente (para enseñarlo en el dashboard).
export const variableSendflow = (c = clienteActual()) => (c.principal ? 'SENDFLOW_API_KEY' : `SENDFLOW_API_KEY_${sufijo(c.id)}`);

function errorSendflow(status, txt) {
  const msg = status === 401 || status === 403
    ? 'SendFlow rechaza la clave: revisa que esté bien copiada y que tu plan incluya SendAPI.'
    : status === 404 ? 'SendFlow no encuentra eso (¿campaña borrada?).'
      : status === 429 ? 'SendFlow pide ir más despacio (demasiadas peticiones): prueba en un minuto.'
        : `SendFlow ha respondido con un error (${status}).`;
  return Object.assign(new Error(`SendFlow ${status}: ${String(txt).slice(0, 300)}`), { status: 502, publicMessage: msg, sendflowStatus: status });
}

// Petición a SendAPI con su clave (y un límite de 20 s para no colgar el dashboard).
export async function sendflow(path, { method = 'GET', body } = {}) {
  if (useMock()) return mockSendflow(path, { method, body });
  if (!clave()) throw Object.assign(new Error('SendFlow sin clave'), { status: 400, publicMessage: `Falta la clave de SendFlow (variable ${variableSendflow()} en Cloudflare).` });
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
  if (!res.ok) throw errorSendflow(res.status, txt);
  try { return txt ? JSON.parse(txt) : null; } catch { return txt; }
}

// Lo que devuelve SendFlow puede venir como lista o dentro de { data } / { releases }: siempre una lista.
const lista = (r, k) => (Array.isArray(r) ? r : Array.isArray(r?.[k]) ? r[k] : Array.isArray(r?.data) ? r.data : []);
const idDe = (x) => String(x?.id ?? x?._id ?? x?.releaseId ?? '');

// Campañas de SendFlow: [{ id, nombre, tipo, archivada }].
export async function campanasSendflow() {
  return lista(await sendflow('/releases'), 'releases').map((r) => ({
    id: idDe(r), nombre: String(r?.name ?? r?.title ?? idDe(r)), tipo: String(r?.type || ''), archivada: Boolean(r?.archived),
  })).filter((r) => r.id);
}

// Analítica de una campaña: { entradas, salidas, clics } con total y por día (AAAA-MM-DD).
// SendFlow da las fechas como ddmmyyyy.
export async function analiticaSendflow(id) {
  const r = await sendflow(`/releases/${encodeURIComponent(id)}/analytics`);
  const d = r?.data && !r.add ? r.data : r;
  const dias = (x) => Object.fromEntries(Object.entries(x?.dates || {}).map(([k, n]) => [/^\d{8}$/.test(k) ? `${k.slice(4)}-${k.slice(2, 4)}-${k.slice(0, 2)}` : k, Number(n) || 0]));
  const parte = (x) => ({ total: Number(x?.total) || 0, porDia: dias(x) });
  return { entradas: parte(d?.add), salidas: parte(d?.remove), clics: parte(d?.clicks) };
}

// ---------- Datos de prueba (GHL_MOCK=1) ----------
function mockSendflow(path) {
  if (path === '/releases') return [
    { id: 'rel-demo', name: 'Webinar octubre · Grupos', type: 'WhatsRelease', archived: false },
    { id: 'rel-bf', name: 'Black Friday 2026', type: 'WhatsRelease', archived: false },
  ];
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
