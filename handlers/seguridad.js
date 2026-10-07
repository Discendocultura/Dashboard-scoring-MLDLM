// Equipo → Seguridad.
//   GET  /api/seguridad                      → ajustes, quién tiene la verificación en dos pasos y límites de intentos (admin)
//   POST { op: 'guardar', contrasenaGeneral, exigir2fa } → ajustes de la agencia (solo superadmin con usuario propio)
//   POST { op: 'probar-token' }              → qué permisos tiene el token de GHL de este cliente (admin)
import { requireSession } from '../lib/auth.js';
import { env } from '../lib/env.js';
import { listUsers } from '../lib/users.js';
import { getSeguridad, saveSeguridad } from '../lib/seguridad.js';
import { esAdminEnAlguno } from '../lib/dos-pasos.js';
import { comprobarPermisos } from '../lib/ghl.js';
import { usaD1 } from '../lib/store.js';
import { MAX_FALLOS, MAX_FALLOS_IP, BLOQUEO_MS } from '../lib/intentos.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });

export async function GET(request) {
  try {
    await requireSession(request, { admin: true });
    const [seguridad, users] = await Promise.all([getSeguridad({ fresh: true }), listUsers({ fresh: true })]);
    return json({
      seguridad,
      reactivadaPorVariable: env.REACTIVAR_CONTRASENA_GENERAL === '1',
      usuarios: users.filter((u) => u.rol || u.superadmin).map((u) => ({
        id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, superadmin: Boolean(u.superadmin), activo: u.activo !== false,
        dosPasos: Boolean(u.totp?.activo), esAdmin: esAdminEnAlguno(u),
      })),
      limites: { fallos: MAX_FALLOS, fallosIp: MAX_FALLOS_IP, minutos: BLOQUEO_MS / 60_000, compartido: usaD1() },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const body = await readBody(request);
    if (body.op === 'probar-token') {
      await requireSession(request, { admin: true });
      return json({ permisos: await comprobarPermisos() });
    }
    if (body.op !== 'guardar') throw bad('Operación no válida');
    const s = await requireSession(request, { admin: true });
    if (!s.superadmin) throw bad('Solo el superadmin cambia estos ajustes', 403);
    const actual = await getSeguridad({ fresh: true });
    const nuevo = { ...actual, ...('contrasenaGeneral' in body ? { contrasenaGeneral: Boolean(body.contrasenaGeneral) } : {}), ...('exigir2fa' in body ? { exigir2fa: Boolean(body.exigir2fa) } : {}) };
    // Que nadie se quede fuera: para quitar la general hay que haber entrado con un usuario superadmin…
    if (!nuevo.contrasenaGeneral && actual.contrasenaGeneral && !s.uid) {
      throw bad('Para desactivar la contraseña general entra con tu email (un usuario superadmin), no con la general');
    }
    // …y para exigir la verificación, tenerla ya uno mismo.
    if (nuevo.exigir2fa && !actual.exigir2fa && s.uid && !s.user?.totp?.activo) {
      throw bad('Activa antes tu verificación en dos pasos en Mi cuenta');
    }
    return json({ seguridad: await saveSeguridad(nuevo) });
  } catch (e) {
    return errorResponse(e);
  }
}
