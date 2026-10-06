import { getSession } from '../lib/auth.js';
import { publicUser } from '../lib/users.js';
import { getRoles } from '../lib/roles.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    const s = await getSession(request);
    if (!s) return json({ error: 'No autorizado' }, 401);
    const roles = (await getRoles()).map((r) => ({ id: r.id, label: r.label }));
    return json({ role: s.role, user: s.user ? publicUser(s.user) : null, permisos: s.permisos || [], roles });
  } catch (e) {
    return errorResponse(e);
  }
}
