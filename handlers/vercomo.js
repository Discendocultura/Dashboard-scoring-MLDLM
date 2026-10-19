// «Ver como» (solo el superadmin): ver el dashboard exactamente como lo ve otra persona registrada, solo para mirar.
//   POST { op: 'empezar', uid } → pone la cookie (4 h como mucho) y devuelve los clientes de esa persona
//   POST { op: 'salir' }        → «Volver a mi cuenta»
// Mientras dura, lib/router.js rechaza cualquier cambio (solo se consulta).
import { getSession, verComoCookie, clearVerComo } from '../lib/auth.js';
import { listUsersRaw, rolEn } from '../lib/users.js';
import { listClientes } from '../lib/clientes.js';
import { enPrincipal } from '../lib/cliente.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });

export async function POST(request) {
  try {
    const body = await readBody(request);
    if (body.op === 'salir') return json({ ok: true }, 200, { 'set-cookie': clearVerComo() });
    if (body.op !== 'empezar') throw bad('Operación no válida');
    const s = await getSession(request, { real: true });
    if (!s) throw bad('No autorizado', 401);
    if (!s.superadmin) throw bad('Solo el superadmin puede ver AlquimIA como otra persona', 403);
    const uid = String(body.uid || '');
    const u = (await enPrincipal(() => listUsersRaw({ fresh: true }))).find((x) => x.id === uid);
    if (!u || u.activo === false) throw bad('Esa persona no existe o está desactivada', 404);
    if (uid === s.uid) throw bad('Esa eres tú');
    const clientes = (await listClientes()).filter((c) => u.superadmin || rolEn(u, c.id));
    return json({ ok: true, nombre: u.nombre, clientes: clientes.map((c) => ({ id: c.id, nombre: c.nombre })) }, 200, { 'set-cookie': await verComoCookie(uid) });
  } catch (e) {
    return errorResponse(e);
  }
}
