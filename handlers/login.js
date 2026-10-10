// Entrar en el dashboard.
//   POST { email, password }        → usuario del equipo. Si usa verificación en dos pasos: { dosPasos, alta?, ticket }
//   POST { ticket, codigo }         → segundo paso (código de la app o de recuperación)
//   POST { ticket, op: '2fa-iniciar' } → (alta obligatoria al entrar) secreto para la app
//   POST { password }               → contraseña general (si el superadmin no la ha desactivado)
//   POST { op: 'recuperar', email } → «¿Olvidaste tu contraseña?»: email (desde el GHL principal) con un enlace
//                                     de un solo uso que caduca en 1 hora. Responde igual exista o no el email.
//   POST { op: 'restablecer', token, nueva } → pone la contraseña nueva (y cierra las sesiones abiertas)
// Tras 5 fallos seguidos con un email (o 20 desde una misma conexión) se bloquea 15 minutos.
import { roleForPassword, sessionCookie, signToken, verifyToken } from '../lib/auth.js';
import { listUsers, actualizarUsuarios, checkPassword, normEmail, publicUser, hashPassword, ensureContact } from '../lib/users.js';
import { sendEmail } from '../lib/ghl.js';
import { enPrincipal } from '../lib/cliente.js';
import { safeEqual } from '../lib/auth.js';
import { escapeHtml } from '../lib/http.js';
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

// ---- ¿Olvidaste tu contraseña? ----
const RESET_MS = 60 * 60_000;
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (t) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t))));
const OK_RECUPERAR = { ok: true, mensaje: 'Si ese email tiene acceso, te acabamos de enviar un enlace para crear una contraseña nueva. Mira también en spam.' };

function emailRecuperar(nombre, url) {
  const n = escapeHtml(String(nombre || '').trim().split(/\s+/)[0] || '');
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2340;line-height:1.55">
  <div style="background:linear-gradient(135deg,#0a0c24,#2a1460);color:#fff;padding:26px 24px;border-radius:14px 14px 0 0">
    <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#a3a8c9">Acceso privado</div>
    <div style="font-size:26px;font-weight:800;margin-top:6px">Data driven <span style="color:#ff9a3c">growth</span></div>
  </div>
  <div style="background:#f7f7fb;padding:24px;border:1px solid #e4e5f0;border-top:0;border-radius:0 0 14px 14px">
    <h2 style="margin:0 0 12px;font-size:20px;color:#14162e">Crea tu contraseña nueva</h2>
    <p style="margin:0 0 10px">Hola${n ? ` ${n}` : ''} 👋</p>
    <p style="margin:0 0 10px">Hemos recibido una petición para cambiar la contraseña de tu acceso. Pulsa el botón y elige una nueva:</p>
    <p style="margin:22px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#ff7a18;color:#fff;padding:14px 26px;border-radius:12px;text-decoration:none;font-weight:bold">Crear contraseña nueva →</a></p>
    <p style="margin:0 0 6px;font-size:13px;color:#5b6080">El enlace caduca en 1 hora y solo se puede usar una vez.</p>
    <p style="margin:0;font-size:13px;color:#5b6080">Si no lo has pedido tú, ignora este email: tu contraseña no cambia.</p>
    <p style="margin:20px 0 0">Un saludo,<br><strong>Equipo Estelabs</strong></p>
  </div>
</div>`;
}

// Remitente del email de recuperación: «Equipo Estelabs <EMAIL_REMITENTE>». Sin la variable, el de GHL por defecto
// (la API de GHL solo deja cambiar el nombre junto con la dirección).
export const NOMBRE_REMITENTE = 'Equipo Estelabs';
function remitenteRecuperar() {
  const dir = String(env.EMAIL_REMITENTE || '').trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(dir) ? `${NOMBRE_REMITENTE} <${dir}>` : undefined;
}

async function recuperar(request, body) {
  const email = normEmail(body.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Escribe tu email' }, 400);
  const claves = [`rec:${email}`, `ip:${ipDe(request)}`];
  const seg = await bloqueado(claves);
  if (seg) return json({ error: mensajeBloqueo(seg), bloqueado: seg }, 429);
  await fallo(claves); // cuenta las peticiones: como mucho 5 seguidas por email
  const user = (await listUsers({ fresh: true })).find((u) => u.email === email && u.activo !== false);
  if (!user) { await slow(); return json(OK_RECUPERAR); }
  const token = hex(crypto.getRandomValues(new Uint8Array(24)));
  const hash = await sha256(token);
  await actualizarUsuarios((us) => { const u = us.find((x) => x.id === user.id); if (u) u.reset = { hash, exp: Date.now() + RESET_MS }; }, 'recuperar contraseña');
  const url = `${new URL(request.url).origin}/?reset=${user.id}.${token}`;
  try {
    await enPrincipal(async () => {
      const contactId = await ensureContact(user);
      const msg = { subject: 'Crea tu contraseña nueva', html: emailRecuperar(user.nombre, url) };
      const emailFrom = remitenteRecuperar();
      // Si GHL no acepta el remitente (dirección sin verificar), se envía con el remitente por defecto: que llegue igual.
      try { await sendEmail(contactId, { ...msg, emailFrom }); } catch (e) {
        if (!emailFrom) throw e;
        console.error('Remitente del email de recuperación rechazado', e.message || e);
        await sendEmail(contactId, msg);
      }
    });
  } catch (e) {
    console.error('Email de recuperación', e.message || e); // sin decir si el email existe
  }
  return json(OK_RECUPERAR);
}

async function restablecer(request, body) {
  const [uid, token] = String(body.token || '').split('.');
  const nueva = String(body.nueva || '').trim();
  const claves = [`reset:${ipDe(request)}`, `ip:${ipDe(request)}`];
  const seg = await bloqueado(claves);
  if (seg) return json({ error: mensajeBloqueo(seg), bloqueado: seg }, 429);
  if (nueva.length < 8) return json({ error: 'La contraseña nueva debe tener al menos 8 caracteres' }, 400);
  const hash = await sha256(token || '');
  const ok = await actualizarUsuarios(async (us) => {
    const u = us.find((x) => x.id === uid);
    if (!u?.reset || u.activo === false || u.reset.exp < Date.now() || !safeEqual(u.reset.hash, hash)) return false;
    Object.assign(u, await hashPassword(nueva)); // también cierra las sesiones abiertas
    delete u.reset;
    return true;
  }, 'contraseña nueva (recuperación)');
  if (!ok) {
    await fallo(claves);
    await slow();
    return json({ error: 'El enlace no es válido o ha caducado. Pide otro desde «¿Olvidaste tu contraseña?».' }, 400);
  }
  await acierto(claves);
  return json({ ok: true });
}

export async function POST(request) {
  try {
    const body = await readBody(request);
    if (body.ticket) return await segundoPaso(request, body);
    if (body.op === 'recuperar') return await recuperar(request, body);
    if (body.op === 'restablecer') return await restablecer(request, body);
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
