// Eventos propios del calendario. Todos los roles los ven; solo admin los crea, edita y borra.
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { embudoDe } from '../lib/embudos.js';
import { reintentando } from '../lib/store.js';
import { getEventos, saveEventos, sanitizeEvento, MAX_EVENTOS } from '../lib/eventos.js';
import { newId } from '../lib/users.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });

// Los eventos van atados a un embudo: un lanzamiento, una VSL o un meteórico.
async function checkLaunch(code) {
  if (!embudoDe(await getConfig(), code)) throw bad('Embudo no encontrado', 404);
}

export async function GET(request) {
  try {
    await requireSession(request);
    const code = new URL(request.url).searchParams.get('l') || '';
    await checkLaunch(code);
    return json({ eventos: await getEventos(code) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const s = await requireSession(request, { permiso: 'tareas_gestion' });
    const body = await readBody(request);
    const code = String(body.l || '');
    await checkLaunch(code);
    // Leer-cambiar-guardar con reintento si otra persona guarda a la vez.
    const eventos = await reintentando(async () => {
      const eventos = await getEventos(code);
      const find = () => {
        const ev = eventos.find((x) => x.id === body.id);
        if (!ev) throw bad('Ese evento ya no existe', 404);
        return ev;
      };
      if (body.op === 'crear') {
        if (eventos.length >= MAX_EVENTOS) throw bad(`Máximo ${MAX_EVENTOS} eventos por lanzamiento`);
        eventos.push({ id: newId('e'), ...sanitizeEvento(body.evento), creadoPor: s.user?.nombre || 'Admin', creadoEn: new Date().toISOString() });
      } else if (body.op === 'editar') {
        Object.assign(find(), sanitizeEvento(body.evento));
      } else if (body.op === 'borrar') {
        eventos.splice(eventos.indexOf(find()), 1);
      } else {
        throw bad('Operación no válida');
      }
      await saveEventos(code, eventos);
      return eventos;
    });
    return json({ eventos });
  } catch (e) {
    return errorResponse(e);
  }
}
