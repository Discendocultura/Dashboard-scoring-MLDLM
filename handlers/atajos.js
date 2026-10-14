// Accesos rápidos del cliente (menú lateral «🔗 Accesos rápidos»): enlaces a mano (Drive, GHL, Canva…).
//   GET  /api/atajos → { enlaces, puedeEditar }  (los «solo admin» solo los ve el admin)
//   POST /api/atajos { enlaces }  (quien puede configurar) → guarda la lista entera (orden incluido)
import { requireSession, tienePermiso } from '../lib/auth.js';
import { leerJSON, guardarJSON } from '../lib/store.js';
import { json, readBody, errorResponse } from '../lib/http.js';
import { sanitizeAtajos } from '../public/js/atajos.js';

const CLAVE = 'lsd_atajos';
const esAdmin = (s) => s.role === 'admin';
const puedeEditar = (s) => esAdmin(s) || tienePermiso(s, 'config');

export async function GET(request) {
  try {
    const s = await requireSession(request);
    const todos = sanitizeAtajos(await leerJSON(CLAVE, () => []));
    return json({ enlaces: esAdmin(s) ? todos : todos.filter((a) => !a.soloAdmin), puedeEditar: puedeEditar(s), esAdmin: esAdmin(s) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const s = await requireSession(request);
    if (!puedeEditar(s)) return json({ error: 'Tu rol no puede editar los accesos rápidos' }, 403);
    const body = await readBody(request);
    let enlaces = sanitizeAtajos(body.enlaces);
    // Quien no es admin no ve los «solo admin»: se conservan tal cual (al final) para no borrarlos sin querer.
    if (!esAdmin(s)) enlaces = [...enlaces.map((a) => ({ ...a, soloAdmin: false })), ...sanitizeAtajos(await leerJSON(CLAVE, () => [])).filter((a) => a.soloAdmin)];
    await guardarJSON(CLAVE, enlaces, { motivo: 'Accesos rápidos' });
    return json({ ok: true, enlaces: esAdmin(s) ? enlaces : enlaces.filter((a) => !a.soloAdmin) });
  } catch (e) {
    return errorResponse(e);
  }
}
