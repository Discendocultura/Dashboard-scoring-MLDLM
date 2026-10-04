import { getRole } from '../lib/auth.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    const role = await getRole(request);
    return role ? json({ role }) : json({ error: 'No autorizado' }, 401);
  } catch (e) {
    return errorResponse(e);
  }
}
