// Lo que hace el asistente «Nuevo lanzamiento» además de guardar la configuración (permiso «config»):
//   POST /api/nuevo-lanzamiento
//     { op: 'tareas', l: <nuevo>, de: <anterior> }    → copia las tareas del anterior con las fechas movidas → { copiadas }
//     { op: 'whatsapp', l: <nuevo>, de: <anterior> }  → copia los mensajes del grupo (en borrador, fechas movidas y enlaces
//                                                        del nuevo) si el nuevo aún no tiene → { copiados }
//     { op: 'etiqueta', tag }                          → crea la etiqueta en GHL si no existe → { creada, existia }
//     { op: 'sendflow', nombre }                       → crea la campaña de grupos en SendFlow → { id, nombre }
// Las fechas se mueven con el lanzamiento ya guardado (lo que hay en el servidor manda).
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { getTareas, saveTareas, sanitizeTarea, MAX_TAREAS } from '../lib/tareas.js';
import { leerSecuencia, guardarSecuencia } from '../lib/calentamiento.js';
import { listTags, createTag } from '../lib/ghl.js';
import { crearCampanaSendflow, sendflowConfigurado } from '../lib/sendflow.js';
import { listUsers, newId } from '../lib/users.js';
import { reintentando } from '../lib/store.js';
import { copiarTareas, copiarMensajes, cambiosEnlaces, desplazamiento } from '../public/js/lanzamiento-rapido.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });
const TAG_RE = /^[\p{L}\p{N} _.-]{2,80}$/u;

async function par(body) {
  const config = await getConfig({ fresh: true });
  const code = String(body.l || '');
  const de = String(body.de || '');
  const nuevo = config.launches[code];
  const prev = config.launches[de];
  if (!nuevo || !prev || code === de) throw bad('Lanzamiento no encontrado', 404);
  const m = desplazamiento(prev, nuevo.fechaDirecto, nuevo.horaDirecto);
  if (!m) throw bad('Faltan las fechas del directo para mover las fechas');
  return { code, de, nuevo, prev, m };
}

export async function POST(request) {
  try {
    const s = await requireSession(request, { permiso: 'config' });
    const body = await readBody(request);
    const actor = s.user?.nombre || 'Admin';

    if (body.op === 'tareas') {
      const { code, de, m } = await par(body);
      const origen = await getTareas(de);
      if (!origen.length) return json({ copiadas: 0 });
      const users = await listUsers();
      const ahora = new Date().toISOString();
      const copiadas = await reintentando(async () => {
        const actuales = await getTareas(code);
        const ya = new Set(actuales.map((t) => `${t.titulo}|${t.fase}`));
        const nuevas = copiarTareas(origen, m).filter((t) => !ya.has(`${t.titulo}|${t.fase}`)).slice(0, Math.max(0, MAX_TAREAS - actuales.length))
          .map((t) => ({
            id: newId('t'), ...sanitizeTarea(t, users), ...(t.columna ? { columna: t.columna } : {}), ...(t.habId ? { habId: t.habId, habitual: true } : {}),
            estado: 'pendiente', hecha: false, hechaPor: '', hechaEn: '', creadaPor: actor, creadaEn: ahora,
          }));
        if (nuevas.length) await saveTareas(code, [...actuales, ...nuevas], `tareas copiadas de ${de}`);
        return nuevas.length;
      });
      return json({ copiadas });
    }

    if (body.op === 'whatsapp') {
      const { code, de, nuevo, prev, m } = await par(body);
      const ya = await leerSecuencia(code);
      if (ya.mensajes.length) return json({ copiados: 0, motivo: 'El lanzamiento nuevo ya tiene mensajes' });
      const origen = await leerSecuencia(de);
      if (!origen.mensajes.length) return json({ copiados: 0 });
      const { mensajes } = await guardarSecuencia(code, copiarMensajes(origen.mensajes, m, cambiosEnlaces(prev, nuevo, de, code)));
      return json({ copiados: mensajes.length });
    }

    if (body.op === 'etiqueta') {
      const tag = String(body.tag || '').trim().toLowerCase();
      if (!TAG_RE.test(tag)) throw bad('Etiqueta no válida');
      const tags = await listTags();
      if (tags.some((t) => t.toLowerCase() === tag)) return json({ creada: false, existia: true, tag });
      await createTag(tag);
      return json({ creada: true, existia: false, tag });
    }

    if (body.op === 'sendflow') {
      if (!sendflowConfigurado()) throw bad('SendFlow no está conectado en este cliente (Cuenta → Conexiones).');
      const nombre = String(body.nombre || '').trim().slice(0, 120);
      if (!nombre) throw bad('Falta el nombre de la campaña');
      return json(await crearCampanaSendflow(nombre));
    }

    return json({ error: 'Operación no válida' }, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
