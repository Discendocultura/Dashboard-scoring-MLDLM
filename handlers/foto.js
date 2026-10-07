// Fotos de perfil del equipo. Cada una se guarda aparte (D1, o un "Custom Value" de GHL sin D1)
// (lsd_foto_<id>) como data URL pequeña (la reduce el navegador antes de subirla).
import { getSession } from '../lib/auth.js';
import { storeGet } from '../lib/store.js';
import { json, errorResponse } from '../lib/http.js';
import { FOTO_RE, fotoKey } from '../lib/users.js';

export async function GET(request) {
  try {
    // Las fotos son comunes a todos los clientes: basta con haber entrado.
    if (!(await getSession(request))) return json({ error: 'No autorizado' }, 401);
    const u = new URL(request.url).searchParams.get('u') || '';
    if (!/^u[0-9a-f]{12}$/.test(u)) return json({ error: 'No encontrado' }, 404);
    const m = FOTO_RE.exec((await storeGet(fotoKey(u)))?.value || '');
    if (!m) return json({ error: 'No encontrado' }, 404);
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    // La URL lleva la versión (?v=), así que se puede guardar en caché mucho tiempo.
    return new Response(bytes, { headers: { 'content-type': `image/${m[1]}`, 'cache-control': 'private, max-age=31536000, immutable' } });
  } catch (e) {
    return errorResponse(e);
  }
}
