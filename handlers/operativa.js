// Operativa de la agencia («el Asana de operativa»): todas las tareas de todos los proyectos.
// Solo el equipo de la agencia. El superadmin ve y cambia todo; el resto, solo lo que tiene asignado.
//   GET  /api/operativa → { tareas, equipo: [{ id, nombre }], proyectos: [{ id, nombre, color }], yo, superadmin }
//   POST { op: 'estado', cliente, code, id, estado }  (pendiente | revision | hecha)
//   POST { op: 'bloqueo', …, motivo }  (marca de bloqueada; motivo vacío = desbloquear)  · { op: 'fecha', …, fecha }
//   POST { op: 'asignar', …, uid }   (solo superadmin; uid '' = sin asignar; avisa por email)
//   POST { op: 'comentar', …, texto } · { op: 'borrar-comentario', …, cid }
//   POST { op: 'descripcion', …, notas }  (texto con formato: negrita, listas, enlaces, vídeos)
//   POST { op: 'crear', tarea: { titulo, notas, fecha, asignado, proyecto?, opTablero? } }  → tarea nueva (de la
//        agencia o, con `proyecto`, del tablero de ese cliente)
//   POST { op: 'editar', …, tarea } · { op: 'borrar', … }  (solo las creadas en la Operativa)
//   POST { op: 'columna', …, columna, tablero? }  → la lleva a esa columna (y a otro tablero: solo superadmin)
//   POST { op: 'tablero-guardar', tablero } · { op: 'tablero-borrar', proyecto, tableroId }
//        · { op: 'plantilla-guardar', plantilla } · { op: 'plantilla-borrar', plantillaId }  (solo superadmin)
//   POST { op: 'etiquetas', …, etiquetas: [id] } · { op: 'prioridad', …, prioridad } · { op: 'checklist', …, checklist }
//        · { op: 'repetir', …, repetir: { tipo, n } }  (al completarla se crea la siguiente: respuesta `nueva`)
//   POST { op: 'importar-tablero', proyecto, nombre, archivo }  → tablero nuevo con sus columnas y tareas (solo superadmin;
//        archivo: el .json propio o el export de Asana, ver public/js/tableros-import.js)
//   POST { op: 'etiqueta-crear', nombre, color }  (equipo de la agencia) · { op: 'etiqueta-editar', id, nombre, color }
//        · { op: 'etiqueta-borrar', id }  (solo superadmin)
import { getSession } from '../lib/auth.js';
import { listClientes } from '../lib/clientes.js';
import { enPrincipal } from '../lib/cliente.js';
import { listUsersRaw, rolEn, newId } from '../lib/users.js';
import { todasLasTareas, visiblesPara, cambiarTarea, crearTareaAgencia, crearTareasAgencia, camposAgencia, ponerEstado, ponerBloqueo, avisarAsignada, esDeAgencia, getTableros, cambiarTableros, moverATablero, repetirSiToca, resumenTarea } from '../lib/operativa.js';
import { tablerosDe, sanitizeTablero, sanitizeColumnas, GENERAL, sanitizeChecklist, prioridadValida, MAX_ETIQUETAS_TAREA, COLORES_ETIQUETA } from '../public/js/tableros.js';
import { sanitizeRepetir } from '../public/js/procesos.js';
import { PROYECTO_AGENCIA, CODIGO_AGENCIA, asignadaA } from '../public/js/operativa.js';
import { json, readBody, errorResponse } from '../lib/http.js';
import { sanitizeRich } from '../public/js/richtext.js';
import { normalizarImportacion, personaDe } from '../public/js/tableros-import.js';

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
    const [tareas, equipo, clientes, tableros] = await Promise.all([todasLasTareas(), equipoAgencia(), listClientes(), getTableros()]);
    const visibles = visiblesPara(tareas, s);
    const mios = s.superadmin ? clientes : clientes.filter((c) => rolEn(s.user || {}, c.id));
    return json({
      tareas: visibles, equipo, yo: s.uid || '', superadmin: Boolean(s.superadmin), ...tableros,
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

    // Etiquetas (comunes a toda la agencia): cualquiera del equipo las crea; editarlas o borrarlas, el superadmin.
    if (/^etiqueta-/.test(String(body.op))) {
      if (body.op !== 'etiqueta-crear' && !s.superadmin) throw bad('Solo el superadmin cambia o borra etiquetas', 403);
      let nueva = '';
      const cfg = await cambiarTableros((c) => {
        const nombre = String(body.nombre || '').trim().slice(0, 30);
        const color = Object.hasOwn(COLORES_ETIQUETA, body.color) ? body.color : 'gris';
        if (body.op === 'etiqueta-crear') {
          if (!nombre) throw bad('Ponle un nombre a la etiqueta');
          const ya = c.etiquetas.find((e) => e.nombre.toLowerCase() === nombre.toLowerCase());
          if (ya) { nueva = ya.id; return; }
          nueva = `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
          c.etiquetas.push({ id: nueva, nombre, color });
        } else if (body.op === 'etiqueta-editar') {
          const e = c.etiquetas.find((x) => x.id === body.id);
          if (!e) throw bad('Esa etiqueta ya no existe', 404);
          if (nombre) e.nombre = nombre;
          e.color = color;
        } else if (body.op === 'etiqueta-borrar') c.etiquetas = c.etiquetas.filter((x) => x.id !== body.id);
        else throw bad('Operación no válida');
      }, `Operativa: ${body.op}`);
      return json({ ok: true, ...cfg, nueva });
    }
    // Importar un tablero entero (columnas + tareas) en un proyecto: solo el superadmin.
    if (body.op === 'importar-tablero') {
      if (!s.superadmin) throw bad('Solo el superadmin importa tableros', 403);
      const proyecto = String(body.proyecto || '');
      if (proyecto !== PROYECTO_AGENCIA && !(await listClientes()).some((c) => c.id === proyecto)) throw bad('Elige el cliente al que va el tablero');
      let imp;
      try { imp = normalizarImportacion(body.archivo, { incluirCompletadas: Boolean(body.incluirCompletadas) }); } catch (e) { throw bad(e.message || 'Archivo no válido'); }
      const nombre = String(body.nombre || imp.nombre || 'Tablero importado').trim().slice(0, 40);
      const nuevo = sanitizeTablero({ proyecto, nombre, columnas: imp.columnas });
      const cfg = await cambiarTableros((c) => { c.tableros.push(nuevo); }, `Operativa: tablero importado «${nombre}»`);
      const equipo = (await enPrincipal(() => listUsersRaw())).filter((u) => (u.agencia || u.superadmin) && u.activo !== false);
      const sinAsignar = new Set();
      const tareas = imp.tareas.map((x) => {
        const col = nuevo.columnas[x.columna] || nuevo.columnas[0];
        const u = personaDe(x.asignado, equipo);
        if (x.asignado && !u) sinAsignar.add(x.asignado);
        return {
          ...camposAgencia({ titulo: x.titulo, notas: x.notas, fecha: x.fecha }), ...(proyecto !== PROYECTO_AGENCIA ? { proyecto } : {}),
          asignado: u ? { tipo: 'persona', id: u.id } : null, opTablero: nuevo.id, opColumna: col.id, checklist: sanitizeChecklist(x.checklist), prioridad: prioridadValida(x.prioridad),
          estado: col.hecha ? 'hecha' : 'pendiente', hecha: Boolean(col.hecha), hechaEn: col.hecha ? new Date().toISOString() : '', hechaPor: col.hecha ? por : '',
        };
      });
      if (tareas.length) await crearTareasAgencia(tareas, por);
      return json({ ok: true, ...cfg, tablero: nuevo, tareas: tareas.length, sinAsignar: [...sinAsignar] });
    }
    // Tableros y plantillas: solo el superadmin.
    if (/^(tablero|plantilla)-/.test(String(body.op))) {
      if (!s.superadmin) throw bad('Solo el superadmin cambia los tableros', 403);
      const cfg = await cambiarTableros((c) => {
        if (body.op === 'tablero-guardar') {
          const t = sanitizeTablero(body.tablero);
          if (!t.proyecto) throw bad('Falta el proyecto del tablero');
          const i = c.tableros.findIndex((x) => x.proyecto === t.proyecto && x.id === t.id);
          if (i >= 0) c.tableros[i] = t; else c.tableros.push(t);
        } else if (body.op === 'tablero-borrar') {
          if (body.tableroId === GENERAL) throw bad('El tablero General no se borra (puedes cambiar sus columnas)');
          c.tableros = c.tableros.filter((x) => !(x.proyecto === body.proyecto && x.id === body.tableroId));
        } else if (body.op === 'plantilla-guardar') {
          const p = { id: String(body.plantilla?.id || ''), nombre: String(body.plantilla?.nombre || ''), columnas: sanitizeColumnas(body.plantilla?.columnas) };
          const i = c.plantillas.findIndex((x) => x.id === p.id);
          if (i >= 0) c.plantillas[i] = p; else c.plantillas.push(p);
        } else if (body.op === 'plantilla-borrar') c.plantillas = c.plantillas.filter((x) => x.id !== body.plantillaId);
        else throw bad('Operación no válida');
      }, `Operativa: ${body.op}`);
      return json({ ok: true, ...cfg });
    }
    if (body.op === 'crear') {
      const proyecto = String(body.tarea?.proyecto || PROYECTO_AGENCIA);
      const clientes = await listClientes();
      const cli = clientes.find((c) => c.id === proyecto);
      if (proyecto !== PROYECTO_AGENCIA && (!cli || (!s.superadmin && !rolEn(s.user || {}, proyecto)))) throw bad('No tienes acceso a ese proyecto', 403);
      const tabs = tablerosDe(await getTableros(), proyecto);
      const opTablero = tabs.some((b) => b.id === body.tarea?.opTablero) ? body.tarea.opTablero : GENERAL;
      const t = await crearTareaAgencia({ ...body.tarea, proyecto, opTablero }, por);
      if (t.asignado?.id && t.asignado.id !== s.uid) await avisarAsignada({ ...t, clienteNombre: cli?.nombre || 'Agencia', embudo: cli ? 'Operativa' : 'Interno' }, t.asignado.id, { url, por }).catch((e) => console.error('Aviso', e.message));
      return json({ ok: true, tarea: t });
    }
    const cfgTableros = ['columna', 'etiquetas'].includes(body.op) ? await getTableros() : null;
    let nueva = null; // la siguiente de una tarea que se repite, si al completarla se ha creado
    let avisar = '';
    const t = await cambiarTarea(ref, async (t, lista) => {
      if (body.op === 'estado' && body.estado === 'bloqueado') { comprobar(t); ponerBloqueo(t, body.bloqueo); } else if (body.op === 'estado') {
        comprobar(t);
        ponerEstado(t, String(body.estado || ''), { por });
        t.opColumna = ''; // su columna sale del estado (la de hecha / la primera) en el tablero en que esté
      } else if (body.op === 'columna') {
        comprobar(t);
        const otro = body.tablero && body.tablero !== (t.opTablero || GENERAL);
        if (otro && !s.superadmin) throw bad('Solo el superadmin mueve tareas de un tablero a otro', 403);
        moverATablero(t, cfgTableros, ref.cliente, { tablero: body.tablero, columna: String(body.columna || '') }, por);
      } else if (body.op === 'etiquetas') {
        comprobar(t);
        const ids = (Array.isArray(body.etiquetas) ? body.etiquetas : []).map(String).filter((id) => cfgTableros.etiquetas.some((e) => e.id === id));
        t.etiquetas = [...new Set(ids)].slice(0, MAX_ETIQUETAS_TAREA);
      } else if (body.op === 'prioridad') {
        comprobar(t);
        t.prioridad = prioridadValida(body.prioridad);
      } else if (body.op === 'checklist') {
        comprobar(t);
        t.checklist = sanitizeChecklist(body.checklist);
      } else if (body.op === 'repetir') {
        comprobar(t);
        const rep = sanitizeRepetir(body.repetir);
        t.repetir = rep.tipo ? rep : null;
        if (!rep.tipo) delete t.repeticionCreada;
      } else if (body.op === 'bloqueo') {
        comprobar(t);
        ponerBloqueo(t, body.motivo);
      } else if (body.op === 'fecha') {
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
        if (ref.code !== CODIGO_AGENCIA) throw bad('Las tareas de un lanzamiento se editan en su proyecto', 400);
        if (!s.superadmin && t.creadaPor !== por && !suya(t)) throw bad('Solo puedes editar tus tareas', 403);
        if (body.op === 'borrar') t._borrar = true;
        else {
          const c = camposAgencia({ ...t, ...body.tarea, asignado: s.superadmin ? body.tarea?.asignado : t.asignado });
          const antes = t.asignado?.id || '';
          Object.assign(t, c);
          if (c.asignado?.id && c.asignado.id !== antes && c.asignado.id !== s.uid) avisar = c.asignado.id;
        }
      } else throw bad('Operación no válida');
      // Completada y se repite: se crea la siguiente en su misma lista.
      if (['estado', 'columna'].includes(body.op)) nueva = repetirSiToca(t, lista);
      return { ...t };
    });
    if (avisar) {
      const proyecto = ref.cliente === PROYECTO_AGENCIA ? 'Agencia' : (await listClientes()).find((c) => c.id === ref.cliente)?.nombre || ref.cliente;
      await avisarAsignada({ ...t, clienteNombre: proyecto, embudo: '' }, avisar, { url, por }).catch((e) => console.error('Aviso', e.message));
    }
    return json({ ok: true, tarea: t, ...(nueva ? { nueva: resumenTarea(nueva, { cliente: ref.cliente, code: ref.code }) } : {}) });
  } catch (e) {
    return errorResponse(e);
  }
}
