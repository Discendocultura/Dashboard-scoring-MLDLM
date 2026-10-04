import { roleForPassword, sessionCookie } from '../lib/auth.js';
import { json, readBody, errorResponse } from '../lib/http.js';
import { env } from '../lib/env.js';

export async function POST(request) {
  try {
    if (!(env.ADMIN_PASSWORD || '').trim() && !(env.SETTER_PASSWORD || '').trim()) {
      return json({ error: 'El servidor no tiene contraseñas configuradas: revisa ADMIN_PASSWORD en Cloudflare y vuelve a desplegar' }, 500);
    }
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
