// Entrar en el dashboard.
//   POST { email, password }        → usuario del equipo. Si usa verificación en dos pasos: { dosPasos, alta?, ticket }
//   POST { ticket, codigo }         → segundo paso (código de la app o de recuperación)
//   POST { ticket, op: '2fa-iniciar' } → (alta obligatoria al entrar) secreto para la app
//   POST { password }               → contraseña general (si el superadmin no la ha desactivado)
// Tras 5 fallos seguidos con un email (o 20 desde una misma conexión) se bloquea 15 minutos.
import { roleForPassword, sessionCookie, signToken, verifyToken } from '../lib/auth.js';
import { listUsers, actualizarUsuarios, checkPassword, normEmail, publicUser } from '../lib/users.js';
import { json, readBody, errorResponse } from '../lib/http.js';
import { env } from '../lib/env.js';
import { setActor } from '../lib/cliente.js';
import { bloqueado, fallo, acierto, ipDe, mensajeBloqueo } from '../lib/intentos.js';
import { contrasenaGeneralActiva } from '../lib/seguridad.js';
import { necesitaDosPasos, iniciarAlta, confirmarAlta, comprobarCodigo } from '../lib/dos-pasos.js';

const slow = () => new Promise((r) => setTimeout(r, 800)); // frena intentos por fuerza bruta
const TICKET_MS = 10 * 60_000;

// Ticket del segundo paso, firmado: «2fa|uid|caducidad|tipo». tipo: codigo (ya la tiene) | alta (tiene que activarla).
const nuevoTicket = (uid, tipo) => signToken(`2fa|${uid}|${Date.now() + TICKET_MS}|${tipo}`);
async function leerTicket(t) {
  const v = await verifyToken(t);
  if (!v) return null;
  const [p, uid, exp, tipo] = v.split('|');
  return p === '2fa' && Number(exp) > Date.now() && uid ? { uid, tipo } : null;
}

async function entrar(user, extra = {}) {
  setActor(user.nombre);
  const lastLogin = new Date().toISOString();
  if (!extra.yaGuardado) {
    await actualizarUsuarios((us) => { const u = us.find((x) => x.id === user.id); if (u) u.lastLogin = lastLogin; }, 'acceso')
      .catch(() => {}); // no impedimos el acceso si falla este guardado
  }
  user.lastLogin = lastLogin;
  const { yaGuardado: _y, ...resto } = extra;
  // El rol de la cookie no cuenta para los usuarios con email (se lee del usuario en cada petición).
  return json({ role: user.rol, user: publicUser(user), ...resto }, 200, {
    'set-cookie': await sessionCookie(user.rol || 'usuario', user.id),
  });
}

async function segundoPaso(request, body) {
  const t = await leerTicket(body.ticket);
  if (!t) return json({ error: 'La verificación ha caducado: vuelve a escribir tu email y contraseña', caducado: true }, 401);
  const claves = [`2fa:${t.uid}`, `ip:${ipDe(request)}`];
  const seg = await bloqueado(claves);
  if (seg) return json({ error: mensajeBloqueo(seg), bloqueado: seg }, 429);
  const user = (await listUsers({ fresh: true })).find((u) => u.id === t.uid);
  if (!user || user.activo === false) return json({ error: 'Usuario no encontrado o desactivado' }, 401);

  setActor(user.nombre); // para el historial de cambios
  if (t.tipo === 'alta') {
    // Es obligatoria y aún no la tiene: la activa ahora mismo.
    if (body.op === '2fa-iniciar') return json(await iniciarAlta(user.id));
    try {
      const codigos = await confirmarAlta(user.id, body.codigo);
      await acierto(claves);
      user.totp = { activo: true };
      return entrar(user, { codigosRecuperacion: codigos });
    } catch (e) {
      if (e.status !== 400) throw e;
      await fallo(claves);
      return json({ error: e.publicMessage }, 401);
    }
  }
  const r = await comprobarCodigo(user.id, body.codigo);
  if (!r.ok) {
    await fallo(claves);
    await slow();
    return json({ error: 'El código no es correcto' }, 401);
  }
  await acierto(claves);
  return entrar(user, { yaGuardado: true, ...(r.recuperacion ? { recuperacionQuedan: r.quedan } : {}) });
}

export async function POST(request) {
  try {
    const body = await readBody(request);
    if (body.ticket) return await segundoPaso(request, body);
    const { email, password } = body;
    const ip = ipDe(request);
    // Usuario del equipo: email + contraseña.
    if (normEmail(email)) {
      const claves = [`email:${normEmail(email)}`, `ip:${ip}`];
      const seg = await bloqueado(claves);
      if (seg) return json({ error: mensajeBloqueo(seg), bloqueado: seg }, 429);
      const users = await listUsers({ fresh: true });
      const user = users.find((u) => u.email === normEmail(email));
      if (!user || !(await checkPassword(user, String(password || '').trim()))) {
        await fallo(claves);
        await slow();
        return json({ error: 'Email o contraseña incorrectos' }, 401);
      }
      if (user.activo === false) return json({ error: 'Tu usuario está desactivado: habla con la administradora' }, 403);
      await acierto(claves);
      if (await necesitaDosPasos(user)) {
        const alta = !user.totp?.activo;
        return json({ dosPasos: true, alta, ticket: await nuevoTicket(user.id, alta ? 'alta' : 'codigo') });
      }
      return entrar(user);
    }
    // Contraseña general (admin / setter) de las variables de Cloudflare.
    if (!(await contrasenaGeneralActiva())) {
      return json({ error: 'La contraseña general está desactivada: entra con tu email y tu contraseña' }, 403);
    }
    if (!(env.ADMIN_PASSWORD || '').trim() && !(env.SETTER_PASSWORD || '').trim()) {
      return json({ error: 'El servidor no tiene contraseñas configuradas: revisa ADMIN_PASSWORD en Cloudflare y vuelve a desplegar' }, 500);
    }
    const claves = [`general:${ip}`, `ip:${ip}`];
    const seg = await bloqueado(claves);
    if (seg) return json({ error: mensajeBloqueo(seg), bloqueado: seg }, 429);
    const role = roleForPassword(password);
    if (!role) {
      await fallo(claves);
      await slow();
      return json({ error: 'Contraseña incorrecta' }, 401);
    }
    await acierto(claves);
    return json({ role }, 200, { 'set-cookie': await sessionCookie(role) });
  } catch (e) {
    return errorResponse(e);
  }
}
