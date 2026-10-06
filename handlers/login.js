import { roleForPassword, sessionCookie } from '../lib/auth.js';
import { listUsers, saveUsers, checkPassword, normEmail, publicUser } from '../lib/users.js';
import { json, readBody, errorResponse } from '../lib/http.js';
import { env } from '../lib/env.js';

const slow = () => new Promise((r) => setTimeout(r, 800)); // frena intentos por fuerza bruta

export async function POST(request) {
  try {
    const { email, password } = await readBody(request);
    // Usuario del equipo: email + contraseña.
    if (normEmail(email)) {
      const users = await listUsers({ fresh: true });
      const user = users.find((u) => u.email === normEmail(email));
      if (!user || !(await checkPassword(user, String(password || '').trim()))) {
        await slow();
        return json({ error: 'Email o contraseña incorrectos' }, 401);
      }
      if (user.activo === false) return json({ error: 'Tu usuario está desactivado: habla con la administradora' }, 403);
      user.lastLogin = new Date().toISOString();
      await saveUsers(users).catch(() => {}); // no impedimos el acceso si falla este guardado
      // El rol de la cookie no cuenta para los usuarios con email (se lee del usuario en cada petición).
      return json({ role: user.rol, user: publicUser(user) }, 200, { 'set-cookie': await sessionCookie(user.rol || 'usuario', user.id) });
    }
    // Contraseña general (admin / setter) de las variables de Cloudflare.
    if (!(env.ADMIN_PASSWORD || '').trim() && !(env.SETTER_PASSWORD || '').trim()) {
      return json({ error: 'El servidor no tiene contraseñas configuradas: revisa ADMIN_PASSWORD en Cloudflare y vuelve a desplegar' }, 500);
    }
    const role = roleForPassword(password);
    if (!role) {
      await slow();
      return json({ error: 'Contraseña incorrecta' }, 401);
    }
    return json({ role }, 200, { 'set-cookie': await sessionCookie(role) });
  } catch (e) {
    return errorResponse(e);
  }
}
