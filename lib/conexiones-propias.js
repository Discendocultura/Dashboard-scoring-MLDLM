// Conexiones propias de cada cliente (Zoom, SendFlow y Vimeo), pegadas por el propio cliente en AlquimIA →
// Conexiones, como la credencial de Hotmart: cifradas en su espacio (D1), nunca a la vista ni en Cloudflare.
// Mandan sobre las variables de Cloudflare (ZOOM_*_<ID>, SENDFLOW_API_KEY_<ID>, VIMEO_TOKEN_<ID>), que siguen valiendo
// para los clientes que ya las tenían (Me lo dijo la matrona y Discendo no tienen que volver a conectar nada).
// Se cargan una vez por petición (cargarConexiones, en el router) y se leen sin esperar (conexionPropia), porque
// zoom.js, sendflow.js y vimeo.js leen sus claves de forma síncrona.
import { clienteActual } from './cliente.js';
import { leerJSON, guardarJSON } from './store.js';
import { cifrar, descifrar } from './totp.js';

export const CLAVE_PROPIAS = 'lsd_conexiones_propias';
export const SERVICIOS = {
  zoom: ['accountId', 'clientId', 'clientSecret', 'hostEmail'],
  sendflow: ['apiKey'],
  vimeo: ['token'],
};
const OBLIGATORIOS = { zoom: ['accountId', 'clientId', 'clientSecret'], sendflow: ['apiKey'], vimeo: ['token'] };
const DURA = 30_000;
const cache = new Map(); // id del cliente → { at, valor: { zoom: {…}, sendflow: {…}, vimeo: {…} } }

// Cifradas: el objeto entero de cada servicio. Sin cifrar: cuándo se guardó y un resumen que se puede enseñar.
export async function cargarConexiones({ fresh = false } = {}) {
  const id = clienteActual().id;
  const c = cache.get(id);
  if (!fresh && c && c.at > Date.now() - DURA) return c.valor;
  const guardado = (await leerJSON(CLAVE_PROPIAS, () => null).catch(() => null)) || {};
  const valor = {};
  for (const s of Object.keys(SERVICIOS)) {
    if (!guardado[s]?.cifrado) continue;
    try { const v = JSON.parse((await descifrar(guardado[s].cifrado)) || 'null'); if (v) valor[s] = v; } catch { /* clave de cifrado cambiada: hay que volver a pegarla */ }
  }
  cache.set(id, { at: Date.now(), valor, info: guardado });
  return valor;
}

// La conexión propia del cliente (ya cargada en esta petición), o null.
export const conexionPropia = (servicio, c = clienteActual()) => cache.get(c.id)?.valor?.[servicio] || null;

// Lo que se puede enseñar en Conexiones (sin claves): conectada, cuándo y un resumen.
export async function estadoPropias() {
  await cargarConexiones({ fresh: true });
  const info = cache.get(clienteActual().id)?.info || {};
  const valor = cache.get(clienteActual().id)?.valor || {};
  return Object.fromEntries(Object.keys(SERVICIOS).map((s) => [s, valor[s] ? { conectada: true, guardada: info[s]?.guardada || '', resumen: info[s]?.resumen || '' } : { conectada: false }]));
}

const limpio = (v, max = 400) => String(v ?? '').trim().replace(/^["']|["']$/g, '').trim().slice(0, max);
export function datosLimpios(servicio, datos = {}) {
  if (!SERVICIOS[servicio]) throw Object.assign(new Error('servicio'), { status: 400, publicMessage: 'Conexión desconocida' });
  const v = {};
  for (const k of SERVICIOS[servicio]) if (limpio(datos[k])) v[k] = limpio(datos[k]);
  if (v.apiKey) v.apiKey = v.apiKey.replace(/^bearer\s+/i, '');
  if (v.token) v.token = v.token.replace(/^bearer\s+/i, '');
  const faltan = OBLIGATORIOS[servicio].filter((k) => !v[k]);
  if (faltan.length) throw Object.assign(new Error('faltan'), { status: 400, publicMessage: 'Faltan datos: rellena todos los campos obligatorios.' });
  return v;
}

const resumenDe = (servicio, v) => (servicio === 'zoom' ? `Account ID ${v.accountId}${v.hostEmail ? ` · anfitrión ${v.hostEmail}` : ''}`
  : servicio === 'sendflow' ? `Clave …${v.apiKey.slice(-4)}` : `Token …${v.token.slice(-4)}`);

export async function guardarConexion(servicio, v) {
  const prev = (await leerJSON(CLAVE_PROPIAS, () => null)) || {};
  await guardarJSON(CLAVE_PROPIAS, { ...prev, [servicio]: { cifrado: await cifrar(JSON.stringify(v)), guardada: new Date().toISOString(), resumen: resumenDe(servicio, v) } }, { motivo: `Conexiones: ${servicio} propio` });
  await cargarConexiones({ fresh: true });
}

export async function borrarConexion(servicio) {
  const prev = (await leerJSON(CLAVE_PROPIAS, () => null)) || {};
  const { [servicio]: _, ...resto } = prev;
  await guardarJSON(CLAVE_PROPIAS, resto, { motivo: `Conexiones: ${servicio} propio quitado` });
  await cargarConexiones({ fresh: true });
}

// Clientes dados de alta a partir de hoy: sin conexión propia, no usan las de la agencia a escondidas (salvo que el
// superadmin lo elija en su alta). Los de antes siguen como estaban.
export const CORTE_AGENCIA = Date.parse('2026-11-04T00:00:00Z');
export const usaAgenciaSinElegir = (c) => Boolean(c.principal) || !(Date.parse(c.creado || '') >= CORTE_AGENCIA);
