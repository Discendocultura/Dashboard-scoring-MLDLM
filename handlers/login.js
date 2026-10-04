import { roleForPassword, sessionCookie } from '../lib/auth.js';
import { json, readBody, errorResponse } from '../lib/http.js';

export async function POST(request) {
  try {
    const { password } = await readBody(request);
    const role = roleForPassword(password);
    if (!role) {
      await new Promise((r) => setTimeout(r, 800)); // frena intentos por fuerza bruta
      return json({ error: 'Contraseña incorrecta' }, 401);
    }
    return json({ role }, 200, { 'set-cookie': await sessionCookie(role) });
  } catch (e) {
    return errorResponse(e);
  }
}
