// Gestión de usuarios del equipo (solo admin) y cambio de la propia contraseña (cualquiera con usuario).
import { requireSession } from '../lib/auth.js';
import {
  ROLES, listUsers, saveUsers, hashPassword, checkPassword, generatePassword, newId, normEmail, publicUser, sendAccessEmail,
} from '../lib/users.js';
import { json, readBody, errorResponse, isEmail } from '../lib/http.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });
const dashboardUrl = (request) => `${new URL(request.url).origin}/`;

export async function GET(request) {
  try {
    await requireSession(request, { admin: true });
    return json({ users: (await listUsers({ fresh: true })).map(publicUser) });
  } catch (e) {
    return errorResponse(e);
  }
}

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
    const op = String(body.op || '');

    // Cambiar mi contraseña (cualquier usuario con email, también del rol equipo).
    if (op === 'mi-clave') {
      const s = await requireSession(request, { equipo: true });
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

    const s = await requireSession(request, { admin: true });
    const users = await listUsers({ fresh: true });
    const find = () => {
      const u = users.find((x) => x.id === body.id);
      if (!u) throw bad('Usuario no encontrado', 404);
      return u;
    };

    if (op === 'crear') {
      const nombre = String(body.nombre || '').trim().slice(0, 80);
      const email = normEmail(body.email);
      const rol = ROLES.includes(body.rol) ? body.rol : 'equipo';
      if (!nombre) throw bad('Falta el nombre');
      if (!isEmail(email)) throw bad('El email no es válido');
      if (users.some((u) => u.email === email)) throw bad('Ya hay un usuario con ese email');
      if (users.length >= 50) throw bad('Máximo 50 usuarios');
      const password = generatePassword();
      const user = { id: newId('u'), nombre, email, rol, activo: true, ...(await hashPassword(password)), createdAt: new Date().toISOString(), creadoPor: s.user?.nombre || s.role };
      users.push(user);
      await saveUsers(users); // primero se guarda: si el email falla, el usuario ya existe
      const sent = body.enviar === false ? { emailEnviado: false } : await deliver(user, password, request, true);
      await saveUsers(users);
      return json({ user: publicUser(user), password, ...sent });
    }

    if (op === 'regenerar') {
      const user = find();
      const password = generatePassword();
      Object.assign(user, await hashPassword(password));
      await saveUsers(users);
      const sent = await deliver(user, password, request, false);
      await saveUsers(users);
      return json({ user: publicUser(user), password, ...sent });
    }

    if (op === 'editar') {
      const user = find();
      if (body.nombre != null) user.nombre = String(body.nombre).trim().slice(0, 80) || user.nombre;
      if (ROLES.includes(body.rol)) {
        if (user.id === s.uid && body.rol !== 'admin') throw bad('No puedes quitarte a ti misma el rol de admin');
        user.rol = body.rol;
      }
      if (typeof body.activo === 'boolean') {
        if (user.id === s.uid && !body.activo) throw bad('No puedes desactivar tu propio usuario');
        user.activo = body.activo;
      }
      await saveUsers(users);
      return json({ user: publicUser(user) });
    }

    if (op === 'borrar') {
      const user = find();
      if (user.id === s.uid) throw bad('No puedes borrar tu propio usuario');
      await saveUsers(users.filter((u) => u.id !== user.id));
      return json({ ok: true });
    }

    throw bad('Operación no válida');
  } catch (e) {
    return errorResponse(e);
  }
}
