// Gestión de usuarios del equipo (solo admin) y cambio de la propia contraseña (cualquiera con usuario).
import { requireSession } from '../lib/auth.js';
import {
  listUsers, saveUsers, actualizarUsuarios, hashPassword, checkPassword, generatePassword, newId, normEmail, publicUser, sendAccessEmail, FOTO_RE, FOTO_MAX, fotoKey,
} from '../lib/users.js';
import { storeSet, reintentando } from '../lib/store.js';
import { clienteActual } from '../lib/cliente.js';
import { listClientes } from '../lib/clientes.js';
import { json, readBody, errorResponse, isEmail } from '../lib/http.js';
import { rolExiste } from '../lib/roles.js';
import { iniciarAlta, confirmarAlta, comprobarCodigo, quitarDosPasos, esAdminEnAlguno } from '../lib/dos-pasos.js';
import { getSeguridad } from '../lib/seguridad.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });
// Enlace al dashboard ya en este cliente (los que no son el principal llevan ?c=).
export const dashboardUrl = (request, hash = '') => {
  const c = clienteActual();
  return `${new URL(request.url).origin}/${c.principal ? '' : `?c=${encodeURIComponent(c.id)}`}${hash}`;
};

// Equipo de este cliente (quien tiene acceso). El superadmin recibe además a todo el mundo y la
// lista de clientes, para dar accesos a varios clientes a la vez.
export async function GET(request) {
  try {
    const s = await requireSession(request, { admin: true });
    const users = await listUsers({ fresh: true });
    return json({
      users: users.filter((u) => u.rol).map(publicUser),
      ...(s.superadmin ? { todos: users.map(publicUser), clientes: (await listClientes()).map((c) => ({ id: c.id, nombre: c.nombre })) } : {}),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// ¿Puede la admin de este cliente tocar la cuenta (contraseña, activar, borrar) de esta persona?
// Solo si la persona no trabaja en otros clientes (si no, lo hace el superadmin).
const soloAqui = (u, cid) => !u.superadmin && Object.keys(u.accesos || {}).every((k) => k === cid);

// Envía el email de acceso; si falla, el usuario se guarda igual y se devuelve la contraseña para darla a mano.
async function deliver(user, password, request, nuevo) {
  try {
    await sendAccessEmail(user, password, dashboardUrl(request), { nuevo });
    user.accesoEnviado = new Date().toISOString();
    return { emailEnviado: true };
  } catch (e) {
    console.error('Email de acceso', e);
    return { emailEnviado: false, emailError: e.publicMessage || String(e.message || e).slice(0, 200) };
  }
}

export async function POST(request) {
  try {
    const body = await readBody(request);
    // Si otra persona guarda el equipo a la vez, se repite sobre lo último guardado
    // (los emails van después del primer guardado, así que no se repiten).
    return await reintentando(() => procesar(request, body));
  } catch (e) {
    return errorResponse(e);
  }
}

// Tras enviar el email de acceso: anota el envío y el contacto de GHL sin pisar otros cambios.
const anotarEnvio = (user) => actualizarUsuarios((us) => {
  const u = us.find((x) => x.id === user.id);
  if (!u) return;
  if (user.accesoEnviado) u.accesoEnviado = user.accesoEnviado;
  if (user.contactId && !u.contactId) u.contactId = user.contactId;
}, 'email de acceso').catch((e) => console.error('Anotar envío', e.message));

async function procesar(request, body) {
  const op = String(body.op || '');

  // Cambiar mi contraseña (cualquier usuario con email, también del rol equipo).
  if (op === 'mi-clave') {
    const s = await requireSession(request, { cliente: true });
    if (!s.uid) throw bad('Entraste con la contraseña general: no tienes usuario propio');
    const nueva = String(body.nueva || '').trim();
    if (nueva.length < 8) throw bad('La contraseña nueva debe tener al menos 8 caracteres');
    const users = await listUsers({ fresh: true });
    const me = users.find((u) => u.id === s.uid);
    if (!me || !(await checkPassword(me, String(body.actual || '').trim()))) throw bad('La contraseña actual no es correcta', 403);
    Object.assign(me, await hashPassword(nueva));
    await saveUsers(users);
    return json({ ok: true });
  }

  // Campanita: hasta cuándo ha visto las notificaciones (para contar solo las nuevas en todos sus dispositivos).
  if (op === 'notif-visto') {
    const s = await requireSession(request, { cliente: true });
    if (!s.uid) throw bad('Entraste con la contraseña general: no tienes usuario propio');
    const users = await listUsers({ fresh: true });
    const me = users.find((u) => u.id === s.uid);
    if (!me) throw bad('Usuario no encontrado', 404);
    me.notifVisto = new Date().toISOString();
    await saveUsers(users);
    return json({ ok: true, notifVisto: me.notifVisto });
  }

  // Verificación en dos pasos (Mi cuenta): iniciar → activar con el primer código; quitar pide contraseña y código.
  if (op === 'mi-2fa-iniciar' || op === 'mi-2fa-activar' || op === 'mi-2fa-quitar') {
    const s = await requireSession(request, { cliente: true });
    if (!s.uid) throw bad('Entraste con la contraseña general: no tienes usuario propio');
    if (op === 'mi-2fa-iniciar') return json(await iniciarAlta(s.uid));
    if (op === 'mi-2fa-activar') return json({ ok: true, codigosRecuperacion: await confirmarAlta(s.uid, body.codigo) });
    const me = (await listUsers({ fresh: true })).find((u) => u.id === s.uid);
    if (!me || !(await checkPassword(me, String(body.actual || '').trim()))) throw bad('La contraseña no es correcta', 403);
    if (me.totp?.activo && !(await comprobarCodigo(me.id, body.codigo)).ok) throw bad('El código no es correcto', 403);
    if ((await getSeguridad()).exigir2fa && esAdminEnAlguno(me)) throw bad('Para los admins es obligatoria: no se puede quitar (sí volver a activarla con otro móvil)');
    await quitarDosPasos(me.id);
    return json({ ok: true });
  }

  if (op === 'mi-foto') {
    const s = await requireSession(request, { cliente: true });
    if (!s.uid) throw bad('Entraste con la contraseña general: no tienes usuario propio');
    const foto = String(body.foto || '');
    if (foto && (!FOTO_RE.test(foto) || foto.length > FOTO_MAX)) throw bad('La foto no es válida o es demasiado grande');
    const users = await listUsers({ fresh: true });
    const me = users.find((u) => u.id === s.uid);
    if (!me) throw bad('Usuario no encontrado', 404);
    if (foto) {
      await storeSet(fotoKey(me.id), foto);
      me.foto = Date.now().toString(36); // versión: cambia la URL para que no se vea la foto vieja
    } else {
      me.foto = null;
    }
    await saveUsers(users);
    return json({ ok: true, user: publicUser(me) });
  }

  const s = await requireSession(request, { admin: true });
  const cid = clienteActual().id;
  const users = await listUsers({ fresh: true });
  const find = () => {
    const u = users.find((x) => x.id === body.id);
    if (!u) throw bad('Usuario no encontrado', 404);
    return u;
  };
  const puedeCuenta = (u) => {
    if (!s.superadmin && !soloAqui(u, cid)) throw bad('Esta persona trabaja también en otros clientes: su cuenta la gestiona el superadmin', 403);
  };

  if (op === 'crear') {
    const nombre = String(body.nombre || '').trim().slice(0, 80);
    const email = normEmail(body.email);
    const rol = (await rolExiste(body.rol)) ? body.rol : 'setter';
    if (!nombre) throw bad('Falta el nombre');
    if (!isEmail(email)) throw bad('El email no es válido');
    const existe = users.find((u) => u.email === email);
    if (existe) {
      // Ya tiene usuario (p. ej. alguien de la agencia): solo se le da acceso a este cliente.
      if (existe.rol) throw bad('Ya hay un usuario con ese email en el equipo');
      existe.accesos = { ...(existe.accesos || {}), [cid]: rol };
      await saveUsers(users);
      return json({ user: publicUser({ ...existe, rol }), anadido: true });
    }
    if (users.length >= 200) throw bad('Máximo 200 usuarios');
    const password = generatePassword();
    const user = { id: newId('u'), nombre, email, accesos: { [cid]: rol }, rol, activo: true, ...(await hashPassword(password)), createdAt: new Date().toISOString(), creadoPor: s.user?.nombre || s.role, _cid: cid };
    users.push(user);
    await saveUsers(users); // primero se guarda: si el email falla, el usuario ya existe
    const sent = body.enviar === false ? { emailEnviado: false } : await deliver(user, password, request, true);
    await anotarEnvio(user);
    return json({ user: publicUser(user), password, ...sent });
  }

  if (op === 'regenerar') {
    const user = find();
    puedeCuenta(user);
    const password = generatePassword();
    Object.assign(user, await hashPassword(password));
    await saveUsers(users);
    const sent = await deliver(user, password, request, false);
    await anotarEnvio(user);
    return json({ user: publicUser(user), password, ...sent });
  }

  if (op === 'editar') {
    const user = find();
    if (body.nombre != null) user.nombre = String(body.nombre).trim().slice(0, 80) || user.nombre;
    if (body.rol != null && (await rolExiste(body.rol))) {
      if (user.id === s.uid && body.rol !== 'admin') throw bad('No puedes quitarte a ti misma el rol de admin');
      if (user.superadmin) throw bad('El superadmin es admin en todos los clientes');
      user.accesos = { ...(user.accesos || {}), [cid]: body.rol };
      user.rol = body.rol;
    }
    if (typeof body.activo === 'boolean') {
      if (user.id === s.uid && !body.activo) throw bad('No puedes desactivar tu propio usuario');
      puedeCuenta(user);
      user.activo = body.activo;
    }
    await saveUsers(users);
    return json({ user: publicUser(user) });
  }

  // Quitar la verificación en dos pasos de alguien que ha perdido el móvil (la vuelve a activar al entrar).
  if (op === 'quitar-2fa') {
    const user = find();
    puedeCuenta(user);
    if (user.superadmin && !s.superadmin) throw bad('La del superadmin solo la puede quitar otro superadmin', 403);
    await quitarDosPasos(user.id, `verificación en dos pasos quitada a ${user.nombre}`);
    return json({ ok: true });
  }

  if (op === 'borrar') {
    const user = find();
    if (user.id === s.uid) throw bad('No puedes borrar tu propio usuario');
    if (user.superadmin && !s.superadmin) throw bad('Al superadmin solo lo puede quitar otro superadmin', 403);
    // Si trabaja en otros clientes, solo se le quita de este; si no, se borra su usuario.
    const otros = Object.keys(user.accesos || {}).filter((k) => k !== cid);
    if (otros.length || user.superadmin) {
      delete user.accesos[cid];
      await saveUsers(users);
      return json({ ok: true, quitadoDeCliente: true });
    }
    await saveUsers(users.filter((u) => u.id !== user.id));
    return json({ ok: true });
  }

  // Superadmin: accesos de una persona a todos los clientes ({ cliente: rol | '' }) y si es superadmin.
  if (op === 'accesos') {
    if (!s.superadmin) throw bad('Solo el superadmin puede dar acceso a otros clientes', 403);
    const user = find();
    const validos = new Set((await listClientes()).map((c) => c.id));
    const accesos = {};
    for (const [k, v] of Object.entries(body.accesos || {})) if (validos.has(k) && /^[a-z][a-z0-9-]{1,23}$/.test(String(v || ''))) accesos[k] = String(v);
    user.accesos = accesos;
    if (typeof body.superadmin === 'boolean') {
      if (user.id === s.uid && !body.superadmin) throw bad('No puedes quitarte a ti mismo el superadmin');
      user.superadmin = body.superadmin;
    }
    await saveUsers(users);
    return json({ user: publicUser({ ...user, rol: undefined }) });
  }

  throw bad('Operación no válida');
}
