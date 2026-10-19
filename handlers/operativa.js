// Operativa de la agencia («el Asana de operativa»): todas las tareas de todos los proyectos.
// El equipo de la agencia y los admin de un proyecto (estos, solo para sus proyectos). El superadmin ve y cambia todo;
// el admin de un proyecto, todo lo de ese proyecto (tareas, responsables, tableros); el resto, solo lo que tiene asignado.
//   GET  /api/operativa → { tareas, equipo: [{ id, nombre }], proyectos: [{ id, nombre, color }], yo, superadmin, agencia,
//        gestiona: [id de los proyectos que gestiona] }
//   POST { op: 'estado', cliente, code, id, estado }  (pendiente | revision | hecha)
//   POST { op: 'bloqueo', …, motivo }  (marca de bloqueada; motivo vacío = desbloquear)  · { op: 'fecha', …, fecha }
//   POST { op: 'asignar', …, uid }   (superadmin o admin del proyecto; uid '' = sin asignar; avisa por email)
//   POST { op: 'comentar', …, texto } · { op: 'borrar-comentario', …, cid }
//   POST { op: 'titulo', …, titulo }  (cambiar el nombre de la tarea)
//   POST { op: 'descripcion', …, notas }  (texto con formato: negrita, listas, enlaces, vídeos)
//   POST { op: 'crear', tarea: { titulo, notas, fecha, asignado, proyecto?, opTablero? } }  → tarea nueva (de la
//        agencia o, con `proyecto`, del tablero de ese cliente)
//   POST { op: 'editar', …, tarea } · { op: 'borrar', … }  (solo las creadas en la Operativa)
//   POST { op: 'columna', …, columna, tablero? }  → la lleva a esa columna (y a otro tablero: superadmin o admin del proyecto)
//   POST { op: 'ordenar', orden: [{ cliente, code, id }] }  → la columna en ese orden (de arriba abajo)
//   POST { op: 'tablero-guardar', tablero } · { op: 'tablero-borrar', proyecto, tableroId }
//        · { op: 'tablero-orden', proyecto, ids: [tableroId] }  (orden de las pestañas)
//        · { op: 'tablero-defecto', proyecto, tableroId }  (el que se abre al entrar en el proyecto; '' = el General)
//        (superadmin o admin del proyecto) · { op: 'plantilla-guardar', plantilla } · { op: 'plantilla-borrar', plantillaId }  (solo superadmin)
//   POST { op: 'etiquetas', …, etiquetas: [id] } · { op: 'prioridad', …, prioridad } · { op: 'checklist', …, checklist }
//        · { op: 'repetir', …, repetir: { tipo, n } }  (al completarla se crea la siguiente: respuesta `nueva`)
//   POST { op: 'mi-calendario', calendario }  (google | outlook | apple | '' : el suyo, para «Añadir a mi calendario»)
//   POST { op: 'importar-tablero', proyecto, nombre, archivo }  → tablero nuevo con sus columnas y tareas (solo superadmin;
//        archivo: el .json propio o el export de Asana, ver public/js/tableros-import.js)
//   POST { op: 'etiqueta-crear', nombre, color }  (equipo de la agencia) · { op: 'etiqueta-editar', id, nombre, color }
//        · { op: 'etiqueta-borrar', id }  (solo superadmin)
import { getSession } from '../lib/auth.js';
import { calendarioValido } from '../public/js/mi-calendario.js';
import { listClientes } from '../lib/clientes.js';
import { enPrincipal } from '../lib/cliente.js';
import { listUsersRaw, rolEn, newId } from '../lib/users.js';
import { todasLasTareas, visiblesOperativa, proyectosQueGestiona, proyectosSoloOperativa, puedeOperativa, clienteDeTarea, cambiarTarea, crearTareaAgencia, crearTareasAgencia, camposAgencia, ponerEstado, ponerBloqueo, ordenarTareas, avisarAsignada, avisarMencionOp, esTableroEmbudo, tableroEmbudoDeCodigo, esDeAgencia, getTableros, cambiarTableros, moverATablero, repetirSiToca, resumenTarea } from '../lib/operativa.js';
import { COLUMNAS_SERIE, tablerosDe, ordenarTableros, alFinal, MAX_ORDENAR, sanitizeTablero, sanitizeColumnas, GENERAL, sanitizeChecklist, prioridadValida, MAX_ETIQUETAS_TAREA, COLORES_ETIQUETA } from '../public/js/tableros.js';
import { sanitizeRepetir } from '../public/js/procesos.js';
import { PROYECTO_AGENCIA, CODIGO_AGENCIA, asignadaA } from '../public/js/operativa.js';
import { json, readBody, errorResponse } from '../lib/http.js';
import { leerJSON, guardarJSON } from '../lib/store.js';
import { sanitizeRich, richToText } from '../public/js/richtext.js';
import { personasEn, comentarioPlano } from '../public/js/enlaces.js';
import { normalizarImportacion, personaDe } from '../public/js/tableros-import.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

async function sesion(request) {
  const s = await getSession(request);
  if (!s) throw bad('No autorizado', 401);
  if (!puedeOperativa(s)) throw bad('La Operativa es para el equipo de la agencia, los admin de cada proyecto y quien tiene el perfil «Solo Operativa»', 403);
  return s;
}
// Personas a las que se puede asignar: el equipo de la agencia (`agencia: true`, valen para cualquier proyecto) y quien
// tiene acceso a alguno de los proyectos que ve (con `proyectos`: en cuáles, para ofrecerla solo en esas tareas).
async function equipoPara(s) {
  const ve = s.superadmin ? null : new Set([...Object.keys(s.user?.accesos || {})]);
  const todos = (await enPrincipal(() => listUsersRaw())).filter((u) => u.activo !== false);
  const out = [];
  for (const u of todos) {
    const agencia = Boolean(u.agencia || u.superadmin);
    const proyectos = Object.keys(u.accesos || {}).filter((cid) => !ve || ve.has(cid));
    if (agencia || proyectos.length) out.push({ id: u.id, nombre: u.nombre, ...(agencia ? { agencia: true } : { proyectos }) });
  }
  return out;
}
// ¿Se le puede asignar una tarea de ese proyecto? Si es de la agencia, siempre; si no, si tiene acceso a ese proyecto.
const asignable = (u, cid) => Boolean(u && (u.agencia || (cid !== PROYECTO_AGENCIA && u.proyectos?.includes(cid))));
// Tableros que ve: los de sus proyectos (y los de la agencia si es del equipo). Las plantillas, solo el superadmin.
const claveDefecto = (s) => s.uid || '_general'; // con la contraseña general (sin usuario), uno común
// El ancho de las columnas de los tableros de cada persona: { 'proyecto|tablero': { columna: px } }.
const claveAnchos = (s) => `lsd_op_anchos_${claveDefecto(s).replace(/[^A-Za-z0-9_-]/g, '_')}`;
export function sanitizeAnchos(a) {
  const out = {};
  for (const [k, cols] of Object.entries(a && typeof a === 'object' ? a : {}).slice(0, 300)) {
    if (!cols || typeof cols !== 'object' || String(k).length > 120) continue;
    const limpias = Object.fromEntries(Object.entries(cols).slice(0, 40).map(([id, px]) => [String(id).slice(0, 60), Math.round(Number(px))]).filter(([, px]) => px >= 200 && px <= 900));
    if (Object.keys(limpias).length) out[String(k)] = limpias;
  }
  return out;
}
function tablerosPara(s, cfg, proyectos) {
  // Del proyecto por defecto, solo el suyo (el de los demás no le importa).
  cfg = { ...cfg, proyectoDefecto: cfg.proyectoDefecto?.[claveDefecto(s)] || '', calendario: undefined, miCalendario: cfg.calendario?.[claveDefecto(s)] || '' };
  if (s.superadmin) return cfg;
  const ids = new Set(proyectos.map((p) => p.id));
  const porDefecto = Object.fromEntries(Object.entries(cfg.porDefecto || {}).filter(([p]) => ids.has(p)));
  return { ...cfg, tableros: cfg.tableros.filter((b) => ids.has(b.proyecto)), porDefecto, ...(esDeAgencia(s) ? {} : { plantillas: [] }) };
}
async function proyectosPara(s) {
  const clientes = await listClientes();
  const mios = s.superadmin ? clientes : clientes.filter((c) => rolEn(s.user || {}, c.id));
  return [...mios.map((c) => ({ id: c.id, nombre: c.nombre, color: c.color || '' })), ...(esDeAgencia(s) ? [{ id: PROYECTO_AGENCIA, nombre: 'Agencia', color: '' }] : [])];
}

export async function GET(request) {
  try {
    const s = await sesion(request);
    const [tareas, equipo, proyectos, tableros, misAnchos] = await Promise.all([todasLasTareas(), equipoPara(s), proyectosPara(s), getTableros(), enPrincipal(() => leerJSON(claveAnchos(s), () => ({})))]);
    const visibles = visiblesOperativa(tareas, s);
    // El tablero de cada embudo (con el nombre de su lanzamiento en curso), de los proyectos que ve.
    const tablerosEmbudo = [];
    for (const t of visibles) {
      if (!t.tableroEmbudo || tablerosEmbudo.some((b) => b.proyecto === t.cliente && b.id === t.tableroEmbudo.id)) continue;
      tablerosEmbudo.push({ proyecto: t.cliente, id: t.tableroEmbudo.id, nombre: t.tableroEmbudo.nombre, columnas: COLUMNAS_SERIE.map((c) => ({ ...c })), virtual: true });
    }
    return json({
      tareas: visibles, tablerosEmbudo, equipo, yo: s.uid || '', superadmin: Boolean(s.superadmin), agencia: esDeAgencia(s),
      gestiona: proyectosQueGestiona(s), ...tablerosPara(s, tableros, proyectos), proyectos, misAnchos: sanitizeAnchos(misAnchos),
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
    const gestiona = proyectosQueGestiona(s);
    const agencia = esDeAgencia(s);
    // ¿Gestiona ese proyecto? El superadmin, todos; el admin de un proyecto, los suyos.
    const esAdminDe = (cid) => Boolean(s.superadmin || (cid && cid !== PROYECTO_AGENCIA && gestiona.includes(cid)));
    // ¿Puede tocarla? El superadmin y el admin del proyecto, todas; el resto, las suyas (a su nombre o a su rol en ese cliente).
    // Quien no es de la agencia nunca toca las internas de la agencia.
    const puedeTocar = (t, r) => {
      if (s.superadmin) return true;
      const cid = clienteDeTarea(t, r);
      if (cid !== r.cliente) return false; // la referencia no cuadra con la tarea
      if (!agencia && cid === PROYECTO_AGENCIA) return false;
      return esAdminDe(cid) || proyectosSoloOperativa(s).includes(cid) || asignadaA(t, s.uid, cid === PROYECTO_AGENCIA ? '' : rolEn(s.user || {}, cid));
    };
    const suya = (t) => puedeTocar(t, ref);
    const comprobar = (t) => { if (!suya(t)) throw bad('Solo puedes cambiar las tareas que tienes asignadas', 403); };

    // Etiquetas (comunes a toda la Operativa): cualquiera que entre las crea; editarlas o borrarlas, el superadmin.
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
      return json({ ok: true, ...tablerosPara(s, cfg, await proyectosPara(s)), nueva });
    }
    // Su proyecto por defecto (con el que se le abre la Operativa); '' = ninguno.
    // Su calendario para «Añadir a mi calendario» ('' = preguntar cada vez).
    if (body.op === 'mi-calendario') {
      const c = String(body.calendario || '');
      if (c && !calendarioValido(c)) throw bad('Calendario no válido');
      const cfg = await cambiarTableros((x) => { x.calendario ||= {}; if (c) x.calendario[claveDefecto(s)] = c; else delete x.calendario[claveDefecto(s)]; }, 'Operativa: mi calendario');
      return json({ ok: true, miCalendario: cfg.calendario?.[claveDefecto(s)] || '' });
    }
    if (body.op === 'mis-anchos') {
      const anchos = sanitizeAnchos(body.anchos);
      await enPrincipal(() => guardarJSON(claveAnchos(s), anchos, { version: null, motivo: 'Operativa: ancho de columnas' }));
      return json({ ok: true, misAnchos: anchos });
    }
    if (body.op === 'mi-proyecto-defecto') {
      const p = String(body.proyecto || '');
      if (p && !(await proyectosPara(s)).some((x) => x.id === p)) throw bad('No tienes acceso a ese proyecto', 403);
      const cfg = await cambiarTableros((c) => { if (p) c.proyectoDefecto[claveDefecto(s)] = p; else delete c.proyectoDefecto[claveDefecto(s)]; }, 'Operativa: proyecto por defecto');
      return json({ ok: true, proyectoDefecto: cfg.proyectoDefecto[claveDefecto(s)] || '' });
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
      const cfg = await cambiarTableros((c) => { c.tableros.push(alFinal(c.tableros, nuevo)); }, `Operativa: tablero importado «${nombre}»`);
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
    // Tableros: el superadmin y el admin de ese proyecto. Plantillas: solo el superadmin.
    if (/^(tablero|plantilla)-/.test(String(body.op))) {
      const proyectoOp = body.op === 'tablero-guardar' ? String(body.tablero?.proyecto || '') : String(body.proyecto || '');
      if (!s.superadmin && (/^plantilla-/.test(body.op) || !esAdminDe(proyectoOp))) throw bad('Solo el superadmin o el admin del proyecto cambia sus tableros', 403);
      const cfg = await cambiarTableros((c) => {
        if (body.op === 'tablero-guardar') {
          const t = sanitizeTablero(body.tablero);
          if (!t.proyecto) throw bad('Falta el proyecto del tablero');
          const i = c.tableros.findIndex((x) => x.proyecto === t.proyecto && x.id === t.id);
          if (i >= 0) c.tableros[i] = { ...t, ...(Number.isFinite(c.tableros[i].orden) ? { orden: c.tableros[i].orden } : {}) };
          else c.tableros.push(alFinal(c.tableros, t));
        } else if (body.op === 'tablero-orden') {
          const n = ordenarTableros(c, String(body.proyecto || ''), body.ids);
          c.tableros = n.tableros;
        } else if (body.op === 'tablero-defecto') {
          const p = String(body.proyecto || '');
          const id = String(body.tableroId || '');
          if (id && id !== GENERAL && !esTableroEmbudo(id) && !c.tableros.some((x) => x.proyecto === p && x.id === id)) throw bad('Ese tablero ya no existe', 404);
          if (id && id !== GENERAL) c.porDefecto[p] = id; else delete c.porDefecto[p];
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
      return json({ ok: true, ...tablerosPara(s, cfg, await proyectosPara(s)) });
    }
    if (body.op === 'ordenar') {
      const refs = (Array.isArray(body.orden) ? body.orden : []).slice(0, MAX_ORDENAR)
        .map((r) => ({ cliente: String(r?.cliente || ''), code: String(r?.code || ''), id: String(r?.id || '') })).filter((r) => r.id && r.code);
      if (!refs.length) throw bad('No hay tareas que ordenar');
      const n = await ordenarTareas(refs, (t, r) => {
        if (!s.superadmin && !puedeTocar(t, r)) throw bad('Solo puedes ordenar las tareas que tienes asignadas', 403);
      });
      return json({ ok: true, ordenadas: n });
    }
    if (body.op === 'crear') {
      const proyecto = String(body.tarea?.proyecto || (agencia ? PROYECTO_AGENCIA : gestiona[0] || ''));
      if (proyecto === PROYECTO_AGENCIA && !agencia) throw bad('No tienes acceso a ese proyecto', 403);
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
    let mencionar = null; // { uids, texto, donde }: a quién avisar de que le han mencionado con «@»
    // Solo se avisa a quien puede estar en la tarea: el equipo de la agencia y la gente con acceso a ese proyecto.
    const posibles = ['comentar', 'descripcion'].includes(body.op) ? await equipoPara(s) : [];
    const mencionables = (texto, cid) => personasEn(texto).filter((uid) => uid !== s.uid && asignable(posibles.find((u) => u.id === uid), cid));
    const t = await cambiarTarea(ref, async (t, lista) => {
      if (body.op === 'estado' && body.estado === 'bloqueado') { comprobar(t); ponerBloqueo(t, body.bloqueo); } else if (body.op === 'estado') {
        comprobar(t);
        ponerEstado(t, String(body.estado || ''), { por });
        t.opColumna = ''; // su columna sale del estado (la de hecha / la primera) en el tablero en que esté
        delete t.opOrden; // en la columna nueva va detrás de las ordenadas a mano (hasta que se coloque)
      } else if (body.op === 'columna') {
        comprobar(t);
        // El tablero de un embudo es «el suyo» para sus tareas aunque no lo tengan guardado.
        const deEmbudo = ref.code !== CODIGO_AGENCIA && (!t.opTablero || t.opTablero === GENERAL || esTableroEmbudo(t.opTablero));
        const otro = body.tablero && body.tablero !== (t.opTablero || GENERAL) && !(esTableroEmbudo(body.tablero) && deEmbudo);
        if (otro && !esAdminDe(ref.cliente)) throw bad('Solo el superadmin o el admin del proyecto mueve tareas de un tablero a otro', 403);
        // Una tarea del lanzamiento, sin tablero indicado: se mueve dentro del tablero de su embudo.
        const tablero = body.tablero || (deEmbudo ? await tableroEmbudoDeCodigo(ref.code) : '');
        moverATablero(t, cfgTableros, ref.cliente, { tablero, columna: String(body.columna || '') }, por);
        delete t.opOrden;
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
        if (!esAdminDe(ref.cliente) || !puedeTocar(t, ref)) throw bad('Solo el superadmin o el admin del proyecto reparte las tareas', 403);
        const uid = String(body.uid || '');
        if (uid && !asignable((await equipoPara(s)).find((u) => u.id === uid), clienteDeTarea(t, ref))) throw bad('Esa persona no tiene acceso a este proyecto', 400);
        const antes = t.asignado?.tipo === 'persona' ? t.asignado.id : '';
        t.asignado = uid ? { tipo: 'persona', id: uid } : null;
        if (uid && uid !== antes && uid !== s.uid) avisar = uid;
      } else if (body.op === 'titulo') {
        comprobar(t);
        const titulo = String(body.titulo ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
        if (!titulo) throw bad('La tarea necesita un título');
        t.titulo = titulo;
      } else if (body.op === 'descripcion') {
        comprobar(t);
        const antes = new Set(personasEn(t.notas));
        t.notas = sanitizeRich(body.notas);
        const nuevas = mencionables(t.notas, clienteDeTarea(t, ref)).filter((uid) => !antes.has(uid));
        if (nuevas.length) mencionar = { uids: nuevas, texto: richToText(t.notas).slice(0, 600), donde: 'la descripción' };
      } else if (body.op === 'comentar') {
        comprobar(t);
        const texto = String(body.texto ?? '').replace(/\r/g, '').trim().slice(0, 2000);
        if (!texto) throw bad('El comentario está vacío');
        const menciones = mencionables(texto, clienteDeTarea(t, ref));
        t.comentarios = [...(Array.isArray(t.comentarios) ? t.comentarios : []), { id: newId('c'), uid: s.uid || '', nombre: por, texto, en: new Date().toISOString(), menciones }].slice(-100);
        if (menciones.length) mencionar = { uids: menciones, texto: comentarioPlano(texto), donde: 'un comentario' };
      } else if (body.op === 'borrar-comentario') {
        const c = (t.comentarios || []).find((x) => x.id === body.cid);
        if (!c) throw bad('Ese comentario ya no existe', 404);
        if (!(esAdminDe(ref.cliente) && suya(t)) && c.uid !== s.uid) throw bad('Solo puedes borrar tus comentarios', 403);
        t.comentarios = t.comentarios.filter((x) => x !== c);
      } else if (body.op === 'editar' || body.op === 'borrar') {
        if (ref.code !== CODIGO_AGENCIA) throw bad('Las tareas de un lanzamiento se editan en su proyecto', 400);
        if (clienteDeTarea(t, ref) !== ref.cliente || (!agencia && ref.cliente === PROYECTO_AGENCIA)) throw bad('Solo puedes editar tus tareas', 403);
        if (!s.superadmin && t.creadaPor !== por && !suya(t)) throw bad('Solo puedes editar tus tareas', 403);
        if (body.op === 'borrar') t._borrar = true;
        else {
          const c = camposAgencia({ ...t, ...body.tarea, asignado: esAdminDe(ref.cliente) ? body.tarea?.asignado : t.asignado });
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
    let mencionados = 0;
    if (mencionar) {
      const proyecto = ref.cliente === PROYECTO_AGENCIA ? 'Agencia' : (await listClientes()).find((c) => c.id === ref.cliente)?.nombre || '';
      mencionados = await avisarMencionOp({ ...t, clienteNombre: proyecto }, mencionar.uids, { url, por, texto: mencionar.texto, donde: mencionar.donde }).catch((e) => { console.error('Mención', e.message); return 0; });
    }
    return json({ ok: true, tarea: t, mencionados, ...(nueva ? { nueva: resumenTarea(nueva, { cliente: ref.cliente, code: ref.code }) } : {}) });
  } catch (e) {
    return errorResponse(e);
  }
}
