// Quién está editando la configuración de los embudos (para que dos personas no se pisen los cambios).
// La configuración se guarda entera, así que hay un solo «turno» por cliente: lo tiene una pestaña (`sesion`, un id
// aleatorio de cada pestaña) y lo mantiene con un latido cada ~20 s; si deja de latir, caduca solo.
//   POST /api/editando { op: 'entrar', sesion, que } → { ok, version } | { ocupado: { nombre, que, desde, yo } }
//   POST /api/editando { op: 'tomar', sesion, que }  → { ok, version } (echa a quien lo tuviera)
// `version`: la de la configuración guardada; si el navegador tiene otra, la vuelve a leer antes de editar.
//   POST /api/editando { op: 'latido', sesion, que } → { ok } | { expulsado: { nombre } } (otra persona tomó el control)
//   POST /api/editando { op: 'salir', sesion }       → { ok }
import { requireSession } from '../lib/auth.js';
import { leerJSON, guardarJSON, versionDe } from '../lib/store.js';
import { getConfig } from '../lib/config-store.js';
import { json, readBody, errorResponse } from '../lib/http.js';

export const CLAVE_EDITANDO = 'lsd_editando_config';
export const CADUCA_MS = 90 * 1000; // sin latido en este tiempo, el turno queda libre
const LATIDO_MIN_MS = 10 * 1000; // no se escribe en cada latido si el anterior es muy reciente

const activo = (t, ahora) => Boolean(t?.sesion) && ahora - (Number(t.latido) || 0) < CADUCA_MS;
const limpio = (v, max) => String(v ?? '').trim().slice(0, max).replace(/[<>]/g, '');

export async function POST(request) {
  try {
    const s = await requireSession(request, { tecnico: true });
    const body = await readBody(request);
    const sesion = String(body.sesion || '');
    if (!/^[A-Za-z0-9-]{8,40}$/.test(sesion)) return json({ error: 'Falta la sesión' }, 400);
    const ahora = Date.now();
    const t = await leerJSON(CLAVE_EDITANDO, () => null);
    const mio = t?.sesion === sesion;
    const ocupadoPorOtro = !mio && activo(t, ahora);
    const nuevo = () => ({ sesion, uid: s.uid || '', nombre: s.user?.nombre || 'Admin', que: limpio(body.que, 80), desde: mio ? t.desde : ahora, latido: ahora });
    const guardar = (v, motivo) => guardarJSON(CLAVE_EDITANDO, v, { version: null, motivo });

    switch (body.op) {
      case 'entrar':
        if (ocupadoPorOtro) return json({ ocupado: { nombre: t.nombre, que: t.que, desde: t.desde, yo: Boolean(s.uid) && t.uid === s.uid } });
        await guardar(nuevo(), 'Editando la configuración');
        return json({ ok: true, version: versionDe(await getConfig({ fresh: true })) });
      case 'tomar':
        await guardar({ ...nuevo(), quitadoA: ocupadoPorOtro ? t.nombre : '' }, 'Toma el control de la configuración');
        return json({ ok: true, version: versionDe(await getConfig({ fresh: true })) });
      case 'latido':
        if (ocupadoPorOtro) return json({ expulsado: { nombre: t.nombre } });
        if (!mio || ahora - (Number(t.latido) || 0) > LATIDO_MIN_MS) await guardar(nuevo(), 'Editando la configuración');
        return json({ ok: true });
      case 'salir':
        if (mio) await guardar(null, 'Deja de editar la configuración');
        return json({ ok: true });
      default:
        return json({ error: 'Operación desconocida' }, 400);
    }
  } catch (e) {
    return errorResponse(e);
  }
}
