// Operativa de la agencia («el Asana de operativa»): todas las tareas de todos los proyectos.
// Solo el equipo de la agencia. El superadmin ve y cambia todo; el resto, solo lo que tiene asignado.
//   GET  /api/operativa → { tareas, equipo: [{ id, nombre }], proyectos: [{ id, nombre, color }], yo, superadmin }
//   POST { op: 'estado', cliente, code, id, estado, bloqueo? }  · { op: 'fecha', …, fecha }
//   POST { op: 'asignar', …, uid }   (solo superadmin; uid '' = sin asignar; avisa por email)
//   POST { op: 'comentar', …, texto } · { op: 'borrar-comentario', …, cid }
//   POST { op: 'descripcion', …, notas }  (texto con formato: negrita, listas, enlaces, vídeos)
//   POST { op: 'crear', tarea: { titulo, notas, fecha, asignado } }  → tarea del proyecto «Agencia»
//   POST { op: 'editar', …, tarea } · { op: 'borrar', … }  (solo las del proyecto «Agencia»)
import { getSession } from '../lib/auth.js';
import { listClientes } from '../lib/clientes.js';
import { enPrincipal } from '../lib/cliente.js';
import { listUsersRaw, rolEn, newId } from '../lib/users.js';
import { todasLasTareas, visiblesPara, cambiarTarea, crearTareaAgencia, camposAgencia, ponerEstado, avisarAsignada, esDeAgencia } from '../lib/operativa.js';
import { PROYECTO_AGENCIA, asignadaA } from '../public/js/operativa.js';
import { json, readBody, errorResponse } from '../lib/http.js';
import { sanitizeRich } from '../public/js/richtext.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

async function sesion(request) {
  const s = await getSession(request);
  if (!s) throw bad('No autorizado', 401);
  if (!esDeAgencia(s)) throw bad('La Operativa es solo para el equipo de la agencia', 403);
  return s;
}
const equipoAgencia = async () => (await enPrincipal(() => listUsersRaw())).filter((u) => (u.agencia || u.superadmin) && u.activo !== false).map((u) => ({ id: u.id, nombre: u.nombre }));

export async function GET(request) {
  try {
    const s = await sesion(request);
    const [tareas, equipo, clientes] = await Promise.all([todasLasTareas(), equipoAgencia(), listClientes()]);
    const visibles = visiblesPara(tareas, s);
    const mios = s.superadmin ? clientes : clientes.filter((c) => rolEn(s.user || {}, c.id));
    return json({
      tareas: visibles, equipo, yo: s.uid || '', superadmin: Boolean(s.superadmin),
      proyectos: [...mios.map((c) => ({ id: c.id, nombre: c.nombre, color: c.color || '' })), { id: PROYECTO_AGENCIA, nombre: 'Agencia', color: '' }],
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const s = await sesion(request);
    const body = await readBody(request);
    const por = s.user?.nombre || 'Admin';
    const url = `${new URL(request.url).origin}/`;
    const ref = { cliente: String(body.cliente || ''), code: String(body.code || ''), id: String(body.id || '') };
    // ¿Puede tocarla? El superadmin, todas; el resto, las suyas (a su nombre o a su rol en ese cliente).
    const suya = (t) => s.superadmin || asignadaA(t, s.uid, ref.cliente === PROYECTO_AGENCIA ? '' : rolEn(s.user || {}, ref.cliente));
    const comprobar = (t) => { if (!suya(t)) throw bad('Solo puedes cambiar las tareas que tienes asignadas', 403); };

    if (body.op === 'crear') {
      const t = await crearTareaAgencia(body.tarea, por);
      if (t.asignado?.id && t.asignado.id !== s.uid) await avisarAsignada({ ...t, clienteNombre: 'Agencia', embudo: 'Interno' }, t.asignado.id, { url, por }).catch((e) => console.error('Aviso', e.message));
      return json({ ok: true, tarea: t });
    }
    let avisar = '';
    const t = await cambiarTarea(ref, async (t) => {
      if (body.op === 'estado') { comprobar(t); ponerEstado(t, String(body.estado || ''), { por, bloqueo: body.bloqueo }); } else if (body.op === 'fecha') {
        comprobar(t);
        const f = String(body.fecha || '');
        if (f && !ISO_DAY.test(f)) throw bad('Fecha no válida');
        t.fecha = f;
      } else if (body.op === 'asignar') {
        if (!s.superadmin) throw bad('Solo el superadmin reparte las tareas', 403);
        const uid = String(body.uid || '');
        const antes = t.asignado?.tipo === 'persona' ? t.asignado.id : '';
        t.asignado = uid ? { tipo: 'persona', id: uid } : null;
        if (uid && uid !== antes && uid !== s.uid) avisar = uid;
      } else if (body.op === 'descripcion') {
        comprobar(t);
        t.notas = sanitizeRich(body.notas);
      } else if (body.op === 'comentar') {
        comprobar(t);
        const texto = String(body.texto ?? '').replace(/\r/g, '').trim().slice(0, 2000);
        if (!texto) throw bad('El comentario está vacío');
        t.comentarios = [...(Array.isArray(t.comentarios) ? t.comentarios : []), { id: newId('c'), uid: s.uid || '', nombre: por, texto, en: new Date().toISOString(), menciones: [] }].slice(-100);
      } else if (body.op === 'borrar-comentario') {
        const c = (t.comentarios || []).find((x) => x.id === body.cid);
        if (!c) throw bad('Ese comentario ya no existe', 404);
        if (!s.superadmin && c.uid !== s.uid) throw bad('Solo puedes borrar tus comentarios', 403);
        t.comentarios = t.comentarios.filter((x) => x !== c);
      } else if (body.op === 'editar' || body.op === 'borrar') {
        if (ref.cliente !== PROYECTO_AGENCIA) throw bad('Las tareas de un cliente se editan en su proyecto', 400);
        if (!s.superadmin && t.creadaPor !== por && !suya(t)) throw bad('Solo puedes editar tus tareas', 403);
        if (body.op === 'borrar') t._borrar = true;
        else {
          const c = camposAgencia({ ...t, ...body.tarea, asignado: s.superadmin ? body.tarea?.asignado : t.asignado });
          const antes = t.asignado?.id || '';
          Object.assign(t, c);
          if (c.asignado?.id && c.asignado.id !== antes && c.asignado.id !== s.uid) avisar = c.asignado.id;
        }
      } else throw bad('Operación no válida');
      return { ...t };
    });
    if (avisar) {
      const proyecto = ref.cliente === PROYECTO_AGENCIA ? 'Agencia' : (await listClientes()).find((c) => c.id === ref.cliente)?.nombre || ref.cliente;
      await avisarAsignada({ ...t, clienteNombre: proyecto, embudo: '' }, avisar, { url, por }).catch((e) => console.error('Aviso', e.message));
    }
    return json({ ok: true, tarea: t });
  } catch (e) {
    return errorResponse(e);
  }
}
