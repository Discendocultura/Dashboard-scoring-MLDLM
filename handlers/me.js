import { getSession } from '../lib/auth.js';
import { publicUser } from '../lib/users.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    const s = await getSession(request);
    return s ? json({ role: s.role, user: s.user ? publicUser(s.user) : null }) : json({ error: 'No autorizado' }, 401);
  } catch (e) {
    return errorResponse(e);
  }
}
