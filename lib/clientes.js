// Registro de clientes (Custom Value lsd_clientes en el GHL del cliente principal).
// El principal siempre existe (variables de siempre); el resto: { id, nombre, locationId, metaAdAccount, color }.
// Los tokens nunca se guardan aquí: van en Cloudflare como GHL_TOKEN_<ID> (y META_/ZOOM_ si hace falta).
import { getCustomValue, saveCustomValue } from './ghl.js';
import { enPrincipal, principal, CLIENTE_ID_RE } from './cliente.js';

const NAME = 'lsd_clientes';
let cache = null;
const str = (v, max) => String(v ?? '').trim().slice(0, max);

export function sanitizeCliente(c) {
  const id = str(c?.id, 24).toLowerCase();
  if (!CLIENTE_ID_RE.test(id)) throw Object.assign(new Error('id'), { status: 400, publicMessage: 'El código del cliente debe tener de 2 a 24 letras minúsculas, números o guiones (empezando por letra)' });
  const color = str(c?.color, 7);
  return {
    id,
    nombre: str(c?.nombre, 60) || id,
    locationId: str(c?.locationId, 40).replace(/[^A-Za-z0-9]/g, ''),
    metaAdAccount: str(c?.metaAdAccount, 30).replace(/[^0-9]/g, ''),
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : '',
    creado: str(c?.creado, 40) || new Date().toISOString(),
  };
}

export async function listClientes({ fresh = false } = {}) {
  if (!fresh && cache && cache.at > Date.now() - 30_000) return cache.value;
  const cv = await enPrincipal(() => getCustomValue(NAME));
  let guardados = [];
  try { guardados = cv?.value ? JSON.parse(cv.value) : []; } catch { console.error('Registro de clientes corrupto'); }
  const p = principal();
  const delPrincipal = (Array.isArray(guardados) ? guardados : []).find((c) => c?.id === p.id) || {};
  const otros = (Array.isArray(guardados) ? guardados : []).filter((c) => c?.id && c.id !== p.id).map((c) => {
    try { return sanitizeCliente(c); } catch { return null; }
  }).filter(Boolean);
  const value = [{ ...p, nombre: delPrincipal.nombre || p.nombre, color: delPrincipal.color || '' }, ...otros];
  cache = { at: Date.now(), value };
  return value;
}

export async function saveClientes(list) {
  const value = list.map(({ principal: esPrincipal, ...c }) => (esPrincipal ? { id: c.id, nombre: c.nombre, color: c.color || '' } : sanitizeCliente(c)));
  await enPrincipal(() => saveCustomValue(NAME, JSON.stringify(value)));
  cache = null;
  return listClientes({ fresh: true });
}

export async function clientePorId(id) {
  return (await listClientes()).find((c) => c.id === id) || null;
}

// Para el navegador: lo justo para el desplegable.
export const clientePublico = (c) => ({ id: c.id, nombre: c.nombre, color: c.color || '', principal: Boolean(c.principal) });
