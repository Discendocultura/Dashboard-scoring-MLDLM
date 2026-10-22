// API de Hotmart (Hotmart Developers → Credenciales): token con client_id + client_secret + «Basic», y de ahí las
// ventas (sales/history) y lo que le llega a la productora (sales/commissions). Las credenciales de cada cliente se
// guardan cifradas (las pega en AlquimIA → Conexiones → Hotmart); también valen HOTMART_CLIENT_ID / _SECRET / _BASIC
// (con _<CLIENTE> para los que no son el principal) como variables de Cloudflare.
// Cloudflare deja ~50 peticiones por llamada: la sincronización para al llegar a `max` y dice hasta dónde llegó.
import { leerJSON, guardarJSON } from './store.js';
import { cifrar, descifrar } from './totp.js';
import { envCliente, cachePorCliente } from './cliente.js';

export const CLAVE_CRED = 'lsd_hotmart_cred';
const TOKEN_URL = 'https://api-sec-vlc.hotmart.com/security/oauth/token';
const API = 'https://developers.hotmart.com/payments/api/v1';
const tokens = cachePorCliente();

export async function credenciales() {
  const g = (await leerJSON(CLAVE_CRED, () => null)) || {};
  if (g.clientId && g.secreto && g.basic) {
    const [secreto, basic] = await Promise.all([descifrar(g.secreto), descifrar(g.basic)]);
    if (secreto && basic) return { clientId: g.clientId, secreto, basic, origen: 'alquimia' };
  }
  const id = envCliente('HOTMART_CLIENT_ID');
  const sec = envCliente('HOTMART_CLIENT_SECRET');
  const bas = envCliente('HOTMART_BASIC');
  return id && sec && bas ? { clientId: id, secreto: sec, basic: bas, origen: 'cloudflare' } : null;
}
// «Basic» de Hotmart: se pega tal cual (con o sin la palabra «Basic»).
const basicDe = (b) => String(b || '').trim().replace(/^basic\s+/i, '');

export async function token(cred, { fetchFn = fetch } = {}) {
  const c = tokens.get();
  if (c && c.clientId === cred.clientId && c.exp > Date.now() + 60_000) return c.value;
  const url = `${TOKEN_URL}?grant_type=client_credentials&client_id=${encodeURIComponent(cred.clientId)}&client_secret=${encodeURIComponent(cred.secreto)}`;
  const res = await fetchFn(url, { method: 'POST', headers: { Authorization: `Basic ${basicDe(cred.basic)}`, 'Content-Type': 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw Object.assign(new Error('Hotmart no acepta las credenciales'), { status: 400, publicMessage: 'Hotmart no acepta las credenciales: revisa que el Client ID, el Client Secret y el Basic sean de la misma credencial (Hotmart → Herramientas → Credenciales de Hotmart Developers).' });
  }
  tokens.set({ value: data.access_token, clientId: cred.clientId, exp: Date.now() + (Number(data.expires_in) || 3600) * 1000 });
  return data.access_token;
}

// Recorre las páginas de un listado de la API hasta acabar o gastar el presupuesto de peticiones. Si Hotmart rechaza
// la petición (400), prueba con páginas más pequeñas; si sigue, lanza el error con lo que contestó (para saber qué falla).
async function paginas(ruta, params, tk, presupuesto, fetchFn) {
  const items = [];
  let pageToken = '';
  let tam = 500;
  for (;;) {
    if (presupuesto.n <= 0) return { items, completo: false };
    presupuesto.n--;
    const qs = new URLSearchParams({ ...params, max_results: String(tam), ...(pageToken ? { page_token: pageToken } : {}) });
    const res = await fetchFn(`${API}/${ruta}?${qs}`, { headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' } });
    if (res.status === 401) tokens.set(null);
    if (res.status === 400 && tam > 50) { tam = 50; continue; }
    if (!res.ok) {
      const txt = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
      throw Object.assign(new Error(`Hotmart ${ruta}: ${res.status} ${txt}`), { status: 502, hotmart: res.status, publicMessage: `Hotmart no ha contestado bien al pedir «${ruta}» (${res.status})${txt ? `: ${txt}` : ''}.` });
    }
    const data = await res.json();
    items.push(...(data.items || []));
    pageToken = data.page_info?.next_page_token || '';
    if (!pageToken) return { items, completo: true };
  }
}
// Lo mismo, pero un filtro opcional que Hotmart no acepte (400) no para la sincronización: se deja fuera.
async function paginasOpcional(ruta, params, tk, presupuesto, fetchFn) {
  try { return await paginas(ruta, params, tk, presupuesto, fetchFn); } catch (e) {
    if (e.hotmart === 400) return { items: [], completo: true, rechazado: e.publicMessage };
    throw e;
  }
}

// Ventas y comisiones de la productora entre `desde` y `hasta` (ms). Devuelve { compras: [{ item, comisiones }], completo }.
export async function ventasApi(cred, { desde, hasta, max = 40, fetchFn = fetch } = {}) {
  const tk = await token(cred, { fetchFn });
  const presupuesto = { n: max };
  const rango = { start_date: String(Math.floor(desde)), end_date: String(Math.floor(Math.min(hasta, Date.now()))) };
  let completo = true;
  const compras = [];
  // Cobradas (aprobadas y completadas: lo que devuelve sin filtro; esta sí tiene que ir bien)…
  const base = await paginas('sales/history', rango, tk, presupuesto, fetchFn);
  compras.push(...base.items);
  completo &&= base.completo;
  // …y las devueltas o con contracargo (si Hotmart no acepta un filtro, se sigue sin él).
  for (const estado of ['REFUNDED', 'CHARGEBACK', 'PARTIALLY_REFUNDED']) {
    const r = await paginasOpcional('sales/history', { ...rango, transaction_status: estado }, tk, presupuesto, fetchFn);
    compras.push(...r.items);
    completo &&= r.completo;
  }
  // Comisiones: solo las de la productora; si no acepta el filtro, todas (de ellas se coge la de PRODUCER).
  let com = await paginasOpcional('sales/commissions', { ...rango, commission_as: 'PRODUCER' }, tk, presupuesto, fetchFn);
  if (com.rechazado) com = await paginas('sales/commissions', rango, tk, presupuesto, fetchFn);
  completo &&= com.completo;
  const porTx = new Map();
  for (const x of com.items) porTx.set(x.transaction, [...(porTx.get(x.transaction) || []), ...(x.commissions || [])]);
  return { compras: compras.map((item) => ({ item, comisiones: porTx.get(item.purchase?.transaction) || [] })), completo };
}

// Guarda las credenciales (cifradas) tras comprobar que Hotmart las acepta.
export async function guardarCredenciales({ clientId, clientSecret, basic }, { fetchFn = fetch } = {}) {
  const cred = { clientId: String(clientId || '').trim().slice(0, 120), secreto: String(clientSecret || '').trim().slice(0, 200), basic: basicDe(basic).slice(0, 400) };
  if (!cred.clientId || !cred.secreto || !cred.basic) throw Object.assign(new Error('Faltan datos'), { status: 400, publicMessage: 'Pega los tres datos de la credencial: Client ID, Client Secret y Basic.' });
  tokens.set(null);
  await token(cred, { fetchFn });
  const prev = (await leerJSON(CLAVE_CRED, () => null)) || {};
  await guardarJSON(CLAVE_CRED, { ...prev, clientId: cred.clientId, secreto: await cifrar(cred.secreto), basic: await cifrar(cred.basic), guardadas: new Date().toISOString(), error: '' }, { motivo: 'Hotmart: credenciales' });
}
