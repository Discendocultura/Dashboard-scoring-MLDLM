// Varios clientes en un mismo dashboard: cada petición se atiende «dentro» de un cliente
// (AsyncLocalStorage), y GHL, Meta, Zoom, la configuración, las tareas… usan el de esa petición.
// El cliente principal usa las variables de siempre (GHL_TOKEN, GHL_LOCATION_ID…); el resto,
// las mismas con su sufijo (GHL_TOKEN_<ID>…), y su subcuenta (locationId) va en el registro.
import { AsyncLocalStorage } from 'node:async_hooks';
import { env } from './env.js';

const als = new AsyncLocalStorage();
export const CLIENTE_ID_RE = /^[a-z][a-z0-9-]{1,23}$/;

export const principalId = () => (CLIENTE_ID_RE.test(env.CLIENTE_PRINCIPAL || '') ? env.CLIENTE_PRINCIPAL : 'mldlm');
export const principal = () => ({ id: principalId(), nombre: env.CLIENTE_PRINCIPAL_NOMBRE || 'Me lo dijo la matrona', principal: true });

export const clienteActual = () => als.getStore() || principal();
export const runCliente = (cliente, fn) => als.run(cliente, fn);
// Lo común a todos los clientes (usuarios, fotos, registro de clientes) vive en el GHL del principal.
export const enPrincipal = (fn) => als.run(principal(), fn);

// Variable de entorno de un cliente: la base para el principal, BASE_<ID> para el resto.
export const sufijo = (id) => String(id).toUpperCase().replace(/-/g, '_');
export function envCliente(base, c = clienteActual()) {
  if (c.principal) return env[base];
  return env[`${base}_${sufijo(c.id)}`];
}

// Caché separada por cliente (configuración, roles, pipelines…).
export function cachePorCliente() {
  const m = new Map();
  return {
    get: () => m.get(clienteActual().id) || null,
    set: (v) => { m.set(clienteActual().id, v); return v; },
  };
}
