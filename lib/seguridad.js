// Ajustes de seguridad de la agencia (Equipo → Seguridad, solo superadmin). Comunes a todos los clientes.
//   contrasenaGeneral: si se puede entrar con ADMIN_PASSWORD / SETTER_PASSWORD (las de Cloudflare)
//   exigir2fa: los admins (y el superadmin) tienen que usar la verificación en dos pasos
import { env } from './env.js';
import { storeGet, storeSet } from './store.js';

const NAME = 'lsd_seguridad';
const DEF = { contrasenaGeneral: true, exigir2fa: false };
let cache = null;

export async function getSeguridad({ fresh = false } = {}) {
  if (!fresh && cache && cache.at > Date.now() - 30_000) return cache.value;
  let value = { ...DEF };
  try {
    const cv = await storeGet(NAME);
    if (cv?.value) value = { ...DEF, ...JSON.parse(cv.value) };
  } catch (e) {
    console.error('Seguridad', e.message);
  }
  cache = { at: Date.now(), value };
  return value;
}

export async function saveSeguridad(input) {
  const value = { contrasenaGeneral: input.contrasenaGeneral !== false, exigir2fa: Boolean(input.exigir2fa) };
  await storeSet(NAME, JSON.stringify(value), { motivo: 'Ajustes de seguridad' });
  cache = { at: Date.now(), value };
  return value;
}

// ¿Vale la contraseña general? Con REACTIVAR_CONTRASENA_GENERAL=1 en Cloudflare vuelve a valer
// (por si el superadmin se queda sin acceso).
export async function contrasenaGeneralActiva() {
  if (env.REACTIVAR_CONTRASENA_GENERAL === '1') return true;
  return (await getSeguridad()).contrasenaGeneral !== false;
}
