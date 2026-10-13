// Operativa de la agencia («el Asana de operativa»): todas las tareas de todos los proyectos en un solo sitio.
// No es otra lista: lee las tareas de cada embudo de cada cliente (lsd_tareas_<código>) y las del proyecto
// «Agencia» (lsd_operativa_agencia, lo interno que no es de ningún cliente). Cada persona del equipo ve solo lo
// que tiene asignado (a ella o a su rol en ese cliente); el superadmin, todo.
// Lo usan el navegador (panel) y el servidor (lib/operativa.js).

// Tres columnas: por hacer, esperando el visto bueno y hecho. «Bloqueada» no es una columna: es una marca
// (con su motivo) que se pone o se quita sin moverla de sitio.
export const ESTADOS_OP = [
  { id: 'pendiente', label: 'Pendiente', icon: '📝' },
  { id: 'revision', label: 'Para revisar', icon: '👀' },
  { id: 'hecha', label: 'Hecho', icon: '✅' },
];
export const ESTADO_IDS = ESTADOS_OP.map((e) => e.id);
export const PROYECTO_AGENCIA = '_agencia'; // «cliente» de las tareas internas de la agencia
export const CODIGO_AGENCIA = 'agencia';

// Estado de una tarea (las antiguas solo tienen `hecha`; las que estaban «en curso» o «bloqueadas» van a Pendiente).
export const estadoOp = (t) => (t?.hecha ? 'hecha' : t?.estado === 'revision' ? 'revision' : 'pendiente');
// ¿Está bloqueada? (marca con motivo; las hechas ya no cuentan).
export const estaBloqueada = (t) => !t?.hecha && Boolean(String(t?.bloqueo || '').trim());

const sumar = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// ¿Es suya? Asignada a la persona o a su rol en ese cliente (rol = el que tiene en ese proyecto).
export function asignadaA(t, uid, rol) {
  const a = t?.asignado;
  if (!a || !uid) return false;
  if (a.tipo === 'persona') return a.id === uid;
  return a.tipo === 'rol' && Boolean(rol) && a.rol === rol;
}

// «Mi día»: lo que no está hecho, agrupado por cuándo toca.
export function agruparPorFecha(tareas, hoy) {
  const g = { vencidas: [], hoy: [], semana: [], despues: [], sinFecha: [] };
  const fin = sumar(hoy, 7);
  for (const t of tareas) {
    if (estadoOp(t) === 'hecha') continue;
    if (!t.fecha) g.sinFecha.push(t);
    else if (t.fecha < hoy) g.vencidas.push(t);
    else if (t.fecha === hoy) g.hoy.push(t);
    else if (t.fecha <= fin) g.semana.push(t);
    else g.despues.push(t);
  }
  const porFecha = (a, b) => String(a.fecha).localeCompare(String(b.fecha));
  for (const k of Object.keys(g)) g[k].sort(porFecha);
  return g;
}

// Semáforo de un proyecto: 'bloqueado' (algo parado) · 'retraso' (vencidas) · 'ok' (al día) · 'vacio'.
export function resumenProyecto(tareas, hoy) {
  const abiertas = tareas.filter((t) => estadoOp(t) !== 'hecha');
  const vencidas = abiertas.filter((t) => t.fecha && t.fecha < hoy).length;
  const bloqueadas = abiertas.filter(estaBloqueada).length;
  const porEstado = Object.fromEntries(ESTADO_IDS.map((e) => [e, tareas.filter((t) => estadoOp(t) === e).length]));
  const semaforo = !tareas.length ? 'vacio' : bloqueadas ? 'bloqueado' : vencidas ? 'retraso' : 'ok';
  return { total: tareas.length, abiertas: abiertas.length, vencidas, bloqueadas, porEstado, semaforo };
}

// Carga por persona: [{ uid, abiertas, vencidas }] de más a menos vencidas.
export function cargaPorPersona(tareas, hoy) {
  const m = new Map();
  for (const t of tareas) {
    if (estadoOp(t) === 'hecha' || t.asignado?.tipo !== 'persona') continue;
    const x = m.get(t.asignado.id) || { uid: t.asignado.id, abiertas: 0, vencidas: 0 };
    x.abiertas++;
    if (t.fecha && t.fecha < hoy) x.vencidas++;
    m.set(t.asignado.id, x);
  }
  return [...m.values()].sort((a, b) => b.vencidas - a.vencidas || b.abiertas - a.abiertas);
}

export const diasDeRetraso = (fecha, hoy) => Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${fecha}T12:00:00Z`)) / 86_400_000);
