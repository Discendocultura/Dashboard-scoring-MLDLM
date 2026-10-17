// Lo que hace el asistente «Nuevo lanzamiento» además de guardar la configuración (permiso «config»):
//   POST /api/nuevo-lanzamiento
//     { op: 'tareas', l: <nuevo>, de: <anterior> }    → copia las tareas del anterior con las fechas movidas → { copiadas }
//     { op: 'whatsapp', l: <nuevo>, de: <anterior> }  → copia los mensajes del grupo (en borrador, fechas movidas y enlaces
//                                                        del nuevo) si el nuevo aún no tiene → { copiados }
//     { op: 'etiqueta', tag }                          → crea la etiqueta en GHL si no existe → { creada, existia }
//     { op: 'sendflow', nombre }                       → crea la campaña de grupos en SendFlow → { id, nombre }
//     { op: 'deshacer', l, sendflow?: bool }          → borra el lanzamiento recién creado (24 h como mucho), sus salas de
//                                                        Zoom, sus tareas y sus mensajes en borrador, y la campaña de
//                                                        SendFlow si la creó el asistente → { hecho: [], avisos: [] }
// Las fechas se mueven con el lanzamiento ya guardado (lo que hay en el servidor manda).
import { requireSession } from '../lib/auth.js';
import { getConfig, saveConfig } from '../lib/config-store.js';
import { getTareas, saveTareas, sanitizeTarea, MAX_TAREAS } from '../lib/tareas.js';
import { leerSecuencia, guardarSecuencia } from '../lib/calentamiento.js';
import { listTags, createTag } from '../lib/ghl.js';
import { crearCampanaSendflow, borrarCampanaSendflow, sendflowConfigurado } from '../lib/sendflow.js';
import { borrarReunion, zoomConfigured } from '../lib/zoom.js';
import { listUsers, newId } from '../lib/users.js';
import { reintentando, versionDe, guardarJSON } from '../lib/store.js';

import { copiarTareas, copiarMensajes, cambiosEnlaces, desplazamiento } from '../public/js/lanzamiento-rapido.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });
const TAG_RE = /^[\p{L}\p{N} _.-]{2,80}$/u;
const DESHACER_MS = 24 * 3_600_000;

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
      const copia = copiarMensajes(origen.mensajes, m, cambiosEnlaces(prev, nuevo, de, code));
      const fechas = copia.reduce((t, x) => t + (x.fechasCambiadas || 0), 0);
      const { mensajes } = await guardarSecuencia(code, copia);
      return json({ copiados: mensajes.length, fechas });
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

    if (body.op === 'deshacer') {
      const code = String(body.l || '');
      const config = await getConfig({ fresh: true });
      const l = config.launches[code];
      if (!l) throw bad('Ese lanzamiento ya no existe', 404);
      if (!(Date.now() - Date.parse(l.createdAt || 0) < DESHACER_MS)) throw bad('Solo se puede deshacer en las 24 horas siguientes a crearlo. Bórralo desde Configuración.');
      const sec = await leerSecuencia(code);
      if (sec.mensajes.some((x) => x.estado === 'programado')) throw bad('Ya hay mensajes del grupo programados en SendFlow: cancélalos antes en Crear → Grupo de WhatsApp.');
      const hecho = [];
      const avisos = [];
      const salas = [l.zoomMeetingId, ...(l.videos || []).map((v) => v.zoomMeetingId)].filter(Boolean);
      if (salas.length && zoomConfigured()) {
        for (const id of salas) {
          try { await borrarReunion(id); hecho.push(`Sala de Zoom ${id} borrada`); } catch (e) { avisos.push(`No se pudo borrar la sala de Zoom ${id}: bórrala en Zoom`); }
        }
      }
      if (l.sendflowId && body.sendflow && sendflowConfigurado()) {
        try { await borrarCampanaSendflow(l.sendflowId); hecho.push('Campaña de SendFlow borrada'); } catch { avisos.push('No se pudo borrar la campaña de SendFlow: bórrala en SendFlow'); }
      }
      if ((await getTareas(code)).length) { await saveTareas(code, [], 'deshacer nuevo lanzamiento'); hecho.push('Tareas borradas'); }
      if (sec.mensajes.length) { await guardarJSON(`lsd_calentamiento_${code}`, { mensajes: [] }, { version: null, motivo: 'deshacer nuevo lanzamiento' }); hecho.push('Mensajes del grupo borrados'); }
      await reintentando(async () => {
        const actual = await getConfig({ fresh: true });
        const { [code]: _, ...resto } = actual.launches;
        await saveConfig({ ...actual, launches: resto }, { version: versionDe(actual), motivo: `Deshacer el lanzamiento ${code}` });
      });
      hecho.push('Lanzamiento borrado');
      if (l.registroTag) avisos.push(`La etiqueta «${l.registroTag}» se queda en GHL (no molesta; bórrala allí si quieres).`);
      return json({ hecho, avisos });
    }

    return json({ error: 'Operación no válida' }, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
