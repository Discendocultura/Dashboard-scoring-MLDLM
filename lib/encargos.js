// 🤖 Encargos a Claude («Crear con IA» en Crear → Automatizaciones): lo que alguien pide desde AlquimIA y Claude hace
// después en GHL desde el navegador, con la suscripción de Claude (nunca la API). AlquimIA no puede manejar el
// navegador: guarda el encargo y una tarea programada de Cowork lo recoge con «trabajo_pendiente», lo monta y lo
// cierra con «actualizar_encargo». Al terminarlo, el workflow queda «Creada» con su URL en la automatización.
// Se guarda por cliente: lsd_encargos = { items: [{ id, tipo, l, ref, titulo, prompt, estado, url, nota, por, at,
//   actualizado: { por, at } }] }. Estados: pendiente → haciendo → hecho | error (o cancelado).
import { leerJSON, guardarJSON, reintentando, versionDe } from './store.js';
import { getConfig, saveConfig } from './config-store.js';
import { clienteActual } from './cliente.js';
import { env } from './env.js';
import { newId } from './users.js';
import { sanitizeAutomatizaciones } from '../public/js/automatizaciones.js';

const CLAVE = 'lsd_encargos';
const MAX = 120;
const MAX_PROMPT = 30_000;
// Un encargo «haciendo» que lleva tanto sin moverse se da por abandonado (la tarea de Cowork se cortó) y vuelve a salir.
export const ATASCADO_MS = 2 * 3_600_000;
export const ESTADOS_ENCARGO = ['pendiente', 'haciendo', 'hecho', 'error', 'cancelado'];
const GRUPO = { lanzamientos: 'launches', vsl: 'vsls', directa: 'directas', meteorico: 'meteoricos' };
const fallo = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });
const REF_RE = /^[\w-]{1,60}$/;

// Workflows del cliente en GHL (para «Abrir en la IA de GHL»).
export function urlWorkflowsGhl() {
  const c = clienteActual();
  const loc = c.principal ? env.GHL_LOCATION_ID : c.locationId;
  return loc ? `https://app.gohighlevel.com/v2/location/${encodeURIComponent(loc)}/automation/workflows` : '';
}

const limpiar = (it) => ({
  id: String(it.id), tipo: GRUPO[it.tipo] ? it.tipo : 'lanzamientos', l: String(it.l || '').slice(0, 80), ref: String(it.ref || '').slice(0, 60),
  titulo: String(it.titulo || '').slice(0, 160), prompt: String(it.prompt || '').slice(0, MAX_PROMPT),
  estado: ESTADOS_ENCARGO.includes(it.estado) ? it.estado : 'pendiente', url: /^https:\/\/\S+$/i.test(String(it.url || '')) ? String(it.url).slice(0, 600) : '',
  nota: String(it.nota || '').slice(0, 1500), por: String(it.por || '').slice(0, 80), at: String(it.at || ''),
  ...(it.actualizado?.at ? { actualizado: { por: String(it.actualizado.por || '').slice(0, 80), at: String(it.actualizado.at) } } : {}),
});
async function leer() {
  const d = await leerJSON(CLAVE, () => ({ items: [] }));
  return { d, items: (Array.isArray(d.items) ? d.items : []).filter((x) => x?.id).map(limpiar) };
}
function cambiar(fn) {
  return reintentando(async () => {
    const { d, items } = await leer();
    const r = await fn(items);
    await guardarJSON(CLAVE, { items: items.slice(0, MAX) }, { version: versionDe(d), motivo: 'Encargos a Claude' });
    return r;
  });
}
const activo = (x) => x.estado === 'pendiente' || x.estado === 'haciendo';
export const atascado = (x, ahora = Date.now()) => x.estado === 'haciendo' && ahora - Date.parse(x.actualizado?.at || x.at || 0) > ATASCADO_MS;

export async function listarEncargos({ l = '' } = {}) {
  const { items } = await leer();
  return l ? items.filter((x) => x.l === l) : items;
}

// Nuevo encargo (o el que ya había abierto para esa misma automatización, actualizado).
export async function encargar({ tipo = 'lanzamientos', l, ref, titulo, prompt }, quien) {
  if (!GRUPO[tipo]) throw fallo('Tipo de embudo no válido');
  if (!REF_RE.test(String(ref || '')) || !String(l || '')) throw fallo('Falta la automatización');
  const p = String(prompt || '').trim();
  if (p.length < 40) throw fallo('Falta el prompt de la automatización');
  const config = await getConfig();
  if (!config[GRUPO[tipo]]?.[l]) throw fallo('Embudo no encontrado', 404);
  const ahora = new Date().toISOString();
  return cambiar((items) => {
    const ya = items.find((x) => x.l === l && x.ref === ref && x.tipo === tipo && activo(x));
    if (ya?.estado === 'haciendo' && !atascado(ya)) throw fallo('Claude ya la está montando: espera a que termine.', 409);
    if (ya) { Object.assign(ya, { titulo: String(titulo || ya.titulo), prompt: p.slice(0, MAX_PROMPT), estado: 'pendiente', nota: '', actualizado: { por: quien, at: ahora } }); return ya; }
    const it = limpiar({ id: newId('en'), tipo, l, ref, titulo, prompt: p, estado: 'pendiente', por: quien, at: ahora });
    items.unshift(it);
    return it;
  });
}

export function cancelarEncargo(id, quien) {
  return cambiar((items) => {
    const x = items.find((y) => y.id === id);
    if (!x) throw fallo('Encargo no encontrado', 404);
    if (!activo(x)) throw fallo('Este encargo ya está cerrado.');
    Object.assign(x, { estado: 'cancelado', actualizado: { por: quien, at: new Date().toISOString() } });
    return x;
  });
}

// Lo que pide Claude: los pendientes (y los atascados), del más antiguo al más nuevo.
export async function encargosPendientes(ahora = Date.now()) {
  const { items } = await leer();
  return items.filter((x) => x.estado === 'pendiente' || atascado(x, ahora)).reverse();
}

// Claude avisa de cómo va: haciendo (lo ha cogido), hecho (con la URL) o error (con la nota).
// Al terminar, la automatización del embudo queda «Creada» con su URL.
export async function actualizarEncargo(id, { estado, url = '', nota = '' }, quien) {
  if (!['haciendo', 'hecho', 'error'].includes(estado)) throw fallo('Estado: haciendo, hecho o error.');
  if (estado === 'hecho' && !/^https:\/\/\S+$/i.test(String(url || '').trim())) throw fallo('Para cerrarlo como hecho, pasa la URL del workflow en GHL.');
  const x = await cambiar((items) => {
    const it = items.find((y) => y.id === id);
    if (!it) throw fallo('Encargo no encontrado', 404);
    if (it.estado === 'cancelado') throw fallo('Lo cancelaron en AlquimIA: no lo hagas.', 409);
    if (it.estado === 'hecho') throw fallo('Ya está hecho.', 409);
    Object.assign(it, { estado, ...(url ? { url: String(url).trim().slice(0, 600) } : {}), nota: String(nota || '').slice(0, 1500), actualizado: { por: quien, at: new Date().toISOString() } });
    return { ...it };
  });
  if (estado === 'hecho') await marcarCreada(x);
  return x;
}

async function marcarCreada(x) {
  const grupo = GRUPO[x.tipo];
  await reintentando(async () => {
    const actual = await getConfig({ fresh: true });
    const obj = actual[grupo]?.[x.l];
    if (!obj) return;
    const a = sanitizeAutomatizaciones(obj.automatizaciones) || { origen: 'cero', items: {} };
    const prev = a.items?.[x.ref] || {};
    const datos = sanitizeAutomatizaciones({ ...a, items: { ...(a.items || {}), [x.ref]: { ...prev, estado: prev.estado === 'probada' ? 'probada' : 'creada', url: x.url } } });
    await saveConfig({ ...actual, [grupo]: { ...actual[grupo], [x.l]: { ...obj, automatizaciones: datos } } }, { version: versionDe(actual), motivo: `Automatización creada por Claude: ${x.titulo}` });
  });
}
