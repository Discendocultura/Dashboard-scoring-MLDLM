// Roles configurables (Custom Value lsd_roles). Si no existe, se usan los de serie.
import { getCustomValue, saveCustomValue } from './ghl.js';
import { cachePorCliente } from './cliente.js';
import { ROLES_POR_DEFECTO, sanitizeRoles, completarPermisosNuevos, PERMISO_IDS } from '../public/js/roles.js';

const NAME = 'lsd_roles';
const cache = cachePorCliente(); // una por cliente

export async function getRoles({ fresh = false } = {}) {
  const hit = cache.get();
  if (!fresh && hit && hit.at > Date.now() - 30_000) return hit.value;
  const cv = await getCustomValue(NAME);
  let value = ROLES_POR_DEFECTO.map((r) => ({ ...r, permisos: [...r.permisos] }));
  if (cv?.value) {
    try {
      const parsed = sanitizeRoles(completarPermisosNuevos(JSON.parse(cv.value)));
      if (parsed.length || JSON.parse(cv.value).length === 0) value = parsed;
    } catch {
      console.error('Roles de GHL corruptos, se usan los de serie');
    }
  }
  cache.set({ at: Date.now(), value });
  return value;
}

export async function saveRoles(list) {
  const value = sanitizeRoles(list);
  await saveCustomValue(NAME, JSON.stringify(value.map((r) => ({ ...r, vistos: PERMISO_IDS }))));
  cache.set({ at: Date.now(), value });
  return value;
}

export async function rolExiste(id) {
  return id === 'admin' || (await getRoles()).some((r) => r.id === id);
}
