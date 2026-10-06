// Tareas por lanzamiento. Todos los roles las ven; admin crea, edita y borra; el resto marca las suyas.
import { requireSession, tienePermiso } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { getTareas, saveTareas, sanitizeTarea, sanitizeAsignado, avisarAsignaciones, MAX_TAREAS } from '../lib/tareas.js';
import { listUsers, newId } from '../lib/users.js';
import { puedeMarcar, FASE_IDS } from '../public/js/tareas.js';
import { getColumnas, saveColumnas, sanitizeColumnas } from '../lib/columnas.js';
import { getHabituales, saveHabituales, enlazar, guardarDesdeTarea, quitar, tareasDesdePlantilla } from '../lib/habituales.js';
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
const team = (users, s) => users.filter((u) => u.activo !== false).map((u) => ({ id: u.id, nombre: u.nombre, rol: u.rol, ...(tienePermiso(s, 'tareas_gestion') ? { email: u.email } : {}) }));

export async function GET(request) {
  try {
    const s = await requireSession(request);
    const code = new URL(request.url).searchParams.get('l') || '';
    await launchOf(code);
    const [tareas, users, habituales, columnas] = await Promise.all([getTareas(code), listUsers(), getHabituales(), getColumnas()]);
    return json({ tareas: enlazar(tareas, habituales), users: team(users, s), columnas, me: { role: s.role, uid: s.uid } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const s = await requireSession(request);
    const body = await readBody(request);
    const code = String(body.l || '');
    const launch = await launchOf(code);
    const op = String(body.op || '');
    const tareas = await getTareas(code); // lectura fresca: cada operación modifica la última versión
    const users = await listUsers({ fresh: true });
    const habituales = await getHabituales();
    let habCambio = false;
    enlazar(tareas, habituales);
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
      if (!tienePermiso(s, 'tareas_gestion')) throw bad('Tu rol no puede crear, editar ni borrar tareas', 403);
      if (op === 'columnas') {
        // Columnas extra del tablero (comunes a todos los lanzamientos).
        const columnas = sanitizeColumnas(body.columnas);
        await saveColumnas(columnas);
        return json({ tareas: enlazar(tareas, habituales), columnas });
      }
      if (op === 'mover') {
        // Mover una tarjeta a otra columna del tablero: una fase o una columna extra.
        const t = find();
        const destino = String(body.columna || '');
        if (FASE_IDS.includes(destino)) { t.fase = destino; t.columna = ''; } else {
          if (!(await getColumnas()).some((c) => c.id === destino)) throw bad('Esa columna ya no existe');
          t.columna = destino;
        }
        if (t.hecha) { t.hecha = false; t.estado = 'pendiente'; t.hechaPor = ''; t.hechaEn = ''; }
        t.editadaEn = now;
      } else if (op === 'crear') {
        if (tareas.length >= MAX_TAREAS) throw bad(`Máximo ${MAX_TAREAS} tareas por lanzamiento`);
        const t = { id: newId('t'), ...sanitizeTarea(body.tarea, users), hecha: false, hechaPor: '', hechaEn: '', creadaPor: actor(s), creadaEn: now };
        tareas.push(t);
        nuevasAsignadas = [t];
        if (body.tarea?.habitual) { guardarDesdeTarea(habituales, t, launch, users, newId); habCambio = true; }
      } else if (op === 'editar') {
        const t = find();
        const before = JSON.stringify(t.asignado || null);
        Object.assign(t, sanitizeTarea(body.tarea, users), { editadaEn: now });
        if (JSON.stringify(t.asignado || null) !== before) nuevasAsignadas = [t];
        // Marcada como habitual: la plantilla se actualiza con lo último (texto, fase, fecha y a quién).
        if (body.tarea?.habitual) { guardarDesdeTarea(habituales, t, launch, users, newId); habCambio = true; } else if (t.habId) { quitar(habituales, t); habCambio = true; }
      } else if (op === 'asignar') {
        // Reasignar varias tareas a la vez (p. ej. todas las de «Rol Admin» a una persona).
        const ids = new Set(Array.isArray(body.ids) ? body.ids.slice(0, MAX_TAREAS).map(String) : []);
        if (!ids.size) throw bad('No hay tareas seleccionadas');
        const asignado = sanitizeAsignado(body.asignado, users);
        for (const t of tareas) {
          if (!ids.has(t.id) || JSON.stringify(t.asignado || null) === JSON.stringify(asignado)) continue;
          t.asignado = asignado;
          t.editadaEn = now;
          nuevasAsignadas.push(t);
          if (t.habId) { guardarDesdeTarea(habituales, t, launch, users, newId); habCambio = true; }
        }
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
        const nuevas = tareasDesdePlantilla(habituales, launch, tareas, users);
        if (tareas.length + nuevas.length > MAX_TAREAS) throw bad(`Máximo ${MAX_TAREAS} tareas por lanzamiento`);
        for (const t of nuevas) tareas.push({ id: newId('t'), ...t, hecha: false, hechaPor: '', hechaEn: '', creadaPor: actor(s), creadaEn: now });
      } else {
        throw bad('Operación no válida');
      }
    }

    await saveTareas(code, tareas);
    if (habCambio) await saveHabituales(habituales);
    const aviso = nuevasAsignadas.length && body.avisar !== false
      ? await avisarAsignaciones(nuevasAsignadas, { launchName: launch.name, dashboardUrl, exceptUid: s.uid })
      : { enviados: 0, errores: [] };
    return json({ tareas, aviso });
  } catch (e) {
    return errorResponse(e);
  }
}
