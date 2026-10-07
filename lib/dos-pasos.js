// Verificación en dos pasos de cada usuario: alta, comprobación del código al entrar y baja.
// En el usuario: totp = { activo, secreto (cifrado), desde, ultimo (último paso usado), recuperacion: [hashes] }
// y, mientras la está activando, totpPendiente (secreto cifrado).
import { actualizarUsuarios } from './users.js';
import { getSeguridad } from './seguridad.js';
import {
  nuevoSecreto, uriTotp, cifrar, descifrar, verificarTotp, nuevosCodigosRecuperacion, hashRecuperacion, usarRecuperacion,
} from './totp.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });

export const esAdminEnAlguno = (u) => Boolean(u.superadmin || u.rol === 'admin' || Object.values(u.accesos || {}).includes('admin'));
// ¿Tiene que pasar por el segundo paso al entrar? (la tiene activada, o es admin y es obligatoria)
export async function necesitaDosPasos(user) {
  if (user.totp?.activo) return true;
  return (await getSeguridad()).exigir2fa && esAdminEnAlguno(user);
}

// Paso 1 del alta: secreto nuevo (para escanear el QR o escribirlo en la app).
export async function iniciarAlta(uid) {
  const secreto = nuevoSecreto();
  const cifrado = await cifrar(secreto);
  const email = await actualizarUsuarios((users) => {
    const u = users.find((x) => x.id === uid);
    if (!u) throw bad('Usuario no encontrado', 404);
    u.totpPendiente = cifrado;
    return u.email;
  }, 'verificación en dos pasos: alta iniciada');
  return { secreto, uri: uriTotp(secreto, email, 'Dashboard agencia') };
}

// Paso 2 del alta: el primer código de la app la activa. Devuelve los códigos de recuperación (solo se ven ahora).
export async function confirmarAlta(uid, codigo) {
  const codigos = nuevosCodigosRecuperacion();
  const hashes = await Promise.all(codigos.map(hashRecuperacion));
  await actualizarUsuarios(async (users) => {
    const u = users.find((x) => x.id === uid);
    if (!u) throw bad('Usuario no encontrado', 404);
    const secreto = await descifrar(u.totpPendiente);
    if (!secreto) throw bad('Vuelve a empezar la activación');
    const paso = await verificarTotp(secreto, codigo);
    if (paso == null) throw bad('El código no es correcto. Mira que la hora del móvil esté en automático y usa el código que se ve ahora.');
    u.totp = { activo: true, secreto: u.totpPendiente, desde: new Date().toISOString(), ultimo: paso, recuperacion: hashes };
    delete u.totpPendiente;
  }, 'verificación en dos pasos activada');
  return codigos;
}

// Código al entrar: el de la app o uno de recuperación (que se gasta). { ok, quedan }
export async function comprobarCodigo(uid, codigo) {
  return actualizarUsuarios(async (users) => {
    const u = users.find((x) => x.id === uid);
    if (!u?.totp?.activo) return { ok: false };
    const secreto = await descifrar(u.totp.secreto);
    const paso = secreto ? await verificarTotp(secreto, codigo, { ultimo: u.totp.ultimo ?? -1 }) : null;
    if (paso != null) {
      u.totp.ultimo = paso;
      u.lastLogin = new Date().toISOString();
      return { ok: true };
    }
    const resto = await usarRecuperacion(u.totp.recuperacion, codigo);
    if (!resto) return { ok: false };
    u.totp.recuperacion = resto;
    u.lastLogin = new Date().toISOString();
    return { ok: true, recuperacion: true, quedan: resto.length };
  }, 'acceso con verificación en dos pasos');
}

export async function quitarDosPasos(uid, motivo = 'verificación en dos pasos desactivada') {
  await actualizarUsuarios((users) => {
    const u = users.find((x) => x.id === uid);
    if (!u) throw bad('Usuario no encontrado', 404);
    delete u.totp;
    delete u.totpPendiente;
  }, motivo);
}
