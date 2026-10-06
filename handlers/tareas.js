// Tareas por lanzamiento. Todos los roles las ven; admin crea, edita y borra; el resto marca las suyas.
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { getTareas, saveTareas, sanitizeTarea, avisarAsignaciones, MAX_TAREAS } from '../lib/tareas.js';
import { listUsers, newId } from '../lib/users.js';
import { plantillaTareas, puedeMarcar } from '../public/js/tareas.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });
const actor = (s) => s.user?.nombre || (s.role === 'admin' ? 'Admin' : 'Setter');

async function launchOf(code) {
  const config = await getConfig();
  const launch = config.launches[code];
  if (!launch) throw bad('Lanzamiento no encontrado', 404);
  return launch;
}

// Lista mínima de personas para mostrar y asignar (sin emails para el rol equipo).
const team = (users, s) => users.filter((u) => u.activo !== false).map((u) => ({ id: u.id, nombre: u.nombre, rol: u.rol, ...(s.role === 'admin' ? { email: u.email } : {}) }));

export async function GET(request) {
  try {
    const s = await requireSession(request, { equipo: true });
    const code = new URL(request.url).searchParams.get('l') || '';
    await launchOf(code);
    const [tareas, users] = await Promise.all([getTareas(code), listUsers()]);
    return json({ tareas, users: team(users, s), me: { role: s.role, uid: s.uid } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const s = await requireSession(request, { equipo: true });
    const body = await readBody(request);
    const code = String(body.l || '');
    const launch = await launchOf(code);
    const op = String(body.op || '');
    const tareas = await getTareas(code); // lectura fresca: cada operación modifica la última versión
    const users = await listUsers({ fresh: true });
    const now = new Date().toISOString();
    const find = () => {
      const t = tareas.find((x) => x.id === body.id);
      if (!t) throw bad('Esa tarea ya no existe (¿la ha borrado alguien?)', 404);
      return t;
    };
    const dashboardUrl = `${new URL(request.url).origin}/#tareas`;
    let nuevasAsignadas = [];

    if (op === 'marcar' || op === 'estado') {
      const t = find();
      if (!puedeMarcar(t, s)) throw bad('Solo puedes cambiar tus tareas o las de tu rol', 403);
      // marcar: hecha sí/no. estado: columna del tablero (pendiente | en-curso | hecha).
      const estado = op === 'marcar' ? (body.hecha ? 'hecha' : 'pendiente') : String(body.estado || '');
      if (!['pendiente', 'en-curso', 'hecha'].includes(estado)) throw bad('Estado no válido');
      const eraHecha = Boolean(t.hecha);
      t.estado = estado;
      t.hecha = estado === 'hecha';
      if (t.hecha !== eraHecha) {
        t.hechaPor = t.hecha ? actor(s) : '';
        t.hechaEn = t.hecha ? now : '';
      }
      if (estado === 'en-curso') { t.enCursoPor = actor(s); t.enCursoEn = now; }
    } else {
      if (s.role !== 'admin') throw bad('Solo el administrador puede crear, editar o borrar tareas', 403);
      if (op === 'crear') {
        if (tareas.length >= MAX_TAREAS) throw bad(`Máximo ${MAX_TAREAS} tareas por lanzamiento`);
        const t = { id: newId('t'), ...sanitizeTarea(body.tarea, users), hecha: false, hechaPor: '', hechaEn: '', creadaPor: actor(s), creadaEn: now };
        tareas.push(t);
        nuevasAsignadas = [t];
      } else if (op === 'editar') {
        const t = find();
        const before = JSON.stringify(t.asignado || null);
        Object.assign(t, sanitizeTarea(body.tarea, users), { editadaEn: now });
        if (JSON.stringify(t.asignado || null) !== before) nuevasAsignadas = [t];
      } else if (op === 'borrar') {
        const t = find();
        tareas.splice(tareas.indexOf(t), 1);
      } else if (op === 'borrar-varias') {
        const ids = new Set(Array.isArray(body.ids) ? body.ids.slice(0, MAX_TAREAS).map(String) : []);
        if (!ids.size) throw bad('No hay tareas seleccionadas');
        const quedan = tareas.filter((t) => !ids.has(t.id));
        tareas.splice(0, tareas.length, ...quedan);
      } else if (op === 'borrar-todas') {
        tareas.splice(0, tareas.length);
      } else if (op === 'plantilla') {
        const existentes = new Set(tareas.map((t) => t.titulo));
        const nuevas = plantillaTareas(launch).filter((t) => !existentes.has(t.titulo));
        if (tareas.length + nuevas.length > MAX_TAREAS) throw bad(`Máximo ${MAX_TAREAS} tareas por lanzamiento`);
        for (const t of nuevas) tareas.push({ id: newId('t'), ...t, notas: '', hecha: false, hechaPor: '', hechaEn: '', creadaPor: actor(s), creadaEn: now });
      } else {
        throw bad('Operación no válida');
      }
    }

    await saveTareas(code, tareas);
    const aviso = nuevasAsignadas.length && body.avisar !== false
      ? await avisarAsignaciones(nuevasAsignadas, { launchName: launch.name, dashboardUrl, exceptUid: s.uid })
      : { enviados: 0, errores: [] };
    return json({ tareas, aviso });
  } catch (e) {
    return errorResponse(e);
  }
}
