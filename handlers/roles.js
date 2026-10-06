// Roles y permisos (solo admin): GET lista con cuántas personas tienen cada rol; POST guarda la lista.
import { requireSession } from '../lib/auth.js';
import { getRoles, saveRoles } from '../lib/roles.js';
import { listUsers } from '../lib/users.js';
import { sanitizeRoles } from '../public/js/roles.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });

async function conUso(roles) {
  const users = await listUsers({ fresh: true });
  return roles.map((r) => ({ ...r, personas: users.filter((u) => u.rol === r.id).length }));
}

export async function GET(request) {
  try {
    await requireSession(request, { admin: true });
    return json({ roles: await conUso(await getRoles({ fresh: true })), adminPersonas: (await listUsers()).filter((u) => u.rol === 'admin').length });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    await requireSession(request, { admin: true });
    const body = await readBody(request);
    const nuevos = sanitizeRoles(body.roles);
    // No se puede borrar un rol que tiene alguien asignado.
    const users = await listUsers({ fresh: true });
    const actuales = await getRoles({ fresh: true });
    for (const r of actuales) {
      if (nuevos.some((n) => n.id === r.id)) continue;
      const n = users.filter((u) => u.rol === r.id).length;
      if (n) throw bad(`No puedes borrar el rol «${r.label}»: lo tienen ${n} persona${n === 1 ? '' : 's'}. Cámbiales antes el rol en Equipo → Miembros del equipo.`);
    }
    return json({ roles: await conUso(await saveRoles(nuevos)) });
  } catch (e) {
    return errorResponse(e);
  }
}
