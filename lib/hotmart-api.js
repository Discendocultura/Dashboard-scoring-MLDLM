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

// Formas de pedir un listado, de la más completa a la más simple. Hotmart contesta «invalid_parameter» (400) a
// combinaciones que no le gustan y su documentación no siempre coincide; se prueba la siguiente y la que funciona se
// recuerda (por cliente y listado) para las próximas veces. Sin fechas, se filtra aquí por la fecha de cada compra.
const formaBuena = cachePorCliente();
function formas(rango, extra) {
  return [
    { ...rango, ...extra, max_results: '500' },
    { ...rango, ...extra, max_results: '50' },
    { ...rango, ...extra },
    { ...extra, max_results: '50', _sinFechas: true },
    { ...extra, _sinFechas: true },
  ];
}
const fechaItem = (x) => Number(x?.purchase?.approved_date || x?.purchase?.order_date || x?.date || 0);

// Recorre las páginas de un listado hasta acabar o gastar el presupuesto de peticiones. Devuelve { items, completo }.
async function paginas(ruta, rango, extra, tk, presupuesto, fetchFn, { desde = 0, cid = '' } = {}) {
  const lista = formas(rango, extra);
  const clave = `${cid}|${ruta}|${Object.keys(extra).sort().join(',')}`; // por credencial: otra nueva vuelve a probar desde el principio
  const recordadas = formaBuena.get() || {};
  let i = recordadas[clave] ?? 0;
  const intentos = [];
  for (; i < lista.length; i++) {
    const { _sinFechas, ...params } = lista[i];
    const items = [];
    let pageToken = '';
    let rechazada = false;
    let pagina = 0;
    let soloToken = false; // la página siguiente pedida solo con su «page_token» (si con los filtros la rechaza)
    for (;;) {
      if (presupuesto.n <= 0) return { items, completo: false };
      presupuesto.n--;
      pagina++;
      const qs = new URLSearchParams(pageToken && soloToken ? { page_token: pageToken, ...(params.max_results ? { max_results: params.max_results } : {}) } : { ...params, ...(pageToken ? { page_token: pageToken } : {}) });
      const res = await fetchFn(`${API}/${ruta}?${qs}`, { headers: { Authorization: `Bearer ${tk}`, Accept: 'application/json' } });
      if (res.status === 401) tokens.set(null);
      if (res.status === 400 && !pageToken) { intentos.push(Object.keys(params).join('+') || 'sin parámetros'); rechazada = true; break; }
      if (res.status === 400 && pageToken) {
        // Rechaza una página siguiente: se reintenta solo con su token; si tampoco, se queda con lo que ya trajo.
        if (!soloToken) { soloToken = true; pagina--; continue; }
        formaBuena.set({ ...recordadas, [clave]: i });
        return { items, completo: true, aviso: `Hotmart no dio la página ${pagina} de «${ruta}»: se guardan las ${items.length} primeras.` };
      }
      if (!res.ok) {
        const txt = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
        throw Object.assign(new Error(`Hotmart ${ruta}: ${res.status} ${txt}`), { status: 502, hotmart: res.status, publicMessage: `Hotmart no ha contestado bien al pedir «${ruta}», página ${pagina}, con ${Object.keys(params).join('+') || 'sin parámetros'} (${res.status})${txt ? `: ${txt}` : ''}.` });
      }
      const data = await res.json();
      const lote = data.items || [];
      // Sin fechas en la petición: solo las del periodo; si la página entera es anterior, ya no hace falta seguir.
      const dentro = _sinFechas ? lote.filter((x) => !fechaItem(x) || (fechaItem(x) >= desde && fechaItem(x) <= Number(rango.end_date))) : lote;
      items.push(...dentro);
      pageToken = data.page_info?.next_page_token || '';
      const todasAntes = _sinFechas && lote.length && lote.every((x) => fechaItem(x) && fechaItem(x) < desde);
      if (!pageToken || todasAntes) {
        formaBuena.set({ ...recordadas, [clave]: i });
        return { items, completo: true };
      }
    }
    if (!rechazada) break;
  }
  throw Object.assign(new Error(`Hotmart ${ruta}: 400 en todas las formas`), { status: 502, hotmart: 400, publicMessage: `Hotmart no acepta ninguna forma de pedir «${ruta}» (probado: ${intentos.join(' · ')}). Revisa que la credencial sea de tipo «API Hotmart» de la cuenta de productora.` });
}
// Lo mismo, pero un filtro opcional que Hotmart no acepte no para la sincronización: se deja fuera.
async function paginasOpcional(ruta, rango, extra, tk, presupuesto, fetchFn, opc) {
  try { return await paginas(ruta, rango, extra, tk, presupuesto, fetchFn, opc); } catch (e) {
    if (e.hotmart === 400) return { items: [], completo: true, rechazado: e.publicMessage };
    throw e;
  }
}

// Ventas y comisiones de la productora entre `desde` y `hasta` (ms). Devuelve { compras: [{ item, comisiones }], completo }.
export async function ventasApi(cred, { desde, hasta, max = 40, fetchFn = fetch } = {}) {
  const tk = await token(cred, { fetchFn });
  const presupuesto = { n: max };
  // Hasta 2 minutos antes de ahora: una fecha «del futuro» para el reloj de Hotmart la hace rechazar la petición.
  const rango = { start_date: String(Math.floor(desde)), end_date: String(Math.floor(Math.min(hasta, Date.now() - 120_000))) };
  let completo = true;
  const compras = [];
  // Cobradas (aprobadas y completadas: lo que devuelve sin filtro; esta sí tiene que ir bien)…
  const opc = { desde, cid: cred.clientId };
  const base = await paginas('sales/history', rango, {}, tk, presupuesto, fetchFn, opc);
  compras.push(...base.items);
  completo &&= base.completo;
  // …y las devueltas o con contracargo (si Hotmart no acepta un filtro, se sigue sin él).
  for (const estado of ['REFUNDED', 'CHARGEBACK', 'PARTIALLY_REFUNDED']) {
    const r = await paginasOpcional('sales/history', rango, { transaction_status: estado }, tk, presupuesto, fetchFn, opc);
    compras.push(...r.items);
    completo &&= r.completo;
  }
  // Comisiones: solo las de la productora; si no acepta el filtro, todas (de ellas se coge la de PRODUCER).
  let com = await paginasOpcional('sales/commissions', rango, { commission_as: 'PRODUCER' }, tk, presupuesto, fetchFn, opc);
  if (com.rechazado) com = await paginasOpcional('sales/commissions', rango, {}, tk, presupuesto, fetchFn, opc);
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
