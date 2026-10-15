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
export const CODIGO_AGENCIA = '_agencia'; // «código» de la lista de tareas de la Operativa (las de la agencia y las creadas aquí para un cliente)

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

// Embudos de un cliente con tareas (para el filtro «Cliente → Embudo»): [{ id, nombre, tipo, n }].
export function embudosDe(tareas, cliente) {
  const m = new Map();
  for (const t of tareas) {
    if (t.cliente !== cliente || !t.embudoId) continue;
    const e = m.get(t.embudoId) || { id: t.embudoId, nombre: t.embudoNombre || t.embudoId, tipo: t.embudoTipo || '', n: 0 };
    if (estadoOp(t) !== 'hecha') e.n += 1;
    m.set(t.embudoId, e);
  }
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
export const ICONO_EMBUDO = { lanzamientos: '🚀', vsl: '🎬', directa: '🛒', meteorico: '⚡' };

// Calendario de un mes ('AAAA-MM'): semanas de lunes a domingo, cada día { dia: 'AAAA-MM-DD', delMes }.
export function semanasDelMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  const primero = new Date(Date.UTC(y, m - 1, 1));
  const inicio = new Date(primero.getTime() - ((primero.getUTCDay() + 6) % 7) * 86_400_000);
  const semanas = [];
  for (let d = inicio; ; ) {
    const sem = [];
    for (let i = 0; i < 7; i++) { sem.push({ dia: d.toISOString().slice(0, 10), delMes: d.getUTCMonth() === m - 1 }); d = new Date(d.getTime() + 86_400_000); }
    semanas.push(sem);
    if (d.getUTCMonth() !== m - 1) break;
  }
  return semanas;
}
export const mesMas = (mes, n) => { const [y, m] = mes.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };

// Filtro de tiempo de los tableros: las tareas que tocan en ese rango. Las abiertas con fecha hasta el final del rango
// (también las vencidas: siguen pendientes); las hechas, solo si su fecha cae dentro. Sin fecha, fuera.
export const RANGOS_OP = [
  { id: '', label: 'Todas' },
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'quincena', label: 'Quincena' },
  { id: 'mes', label: 'Mes' },
];
const diaMas = (f, n) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// { desde, hasta } del rango (días AAAA-MM-DD, ambos incluidos), o null para «Todas».
export function limitesRango(rango, hoy) {
  const dow = (new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 lunes … 6 domingo
  if (rango === 'hoy') return { desde: hoy, hasta: hoy };
  if (rango === 'semana') return { desde: diaMas(hoy, -dow), hasta: diaMas(hoy, 6 - dow) };
  if (rango === 'quincena') return { desde: hoy, hasta: diaMas(hoy, 14) };
  if (rango === 'mes') { const [y, m] = hoy.split('-').map(Number); return { desde: `${hoy.slice(0, 7)}-01`, hasta: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }; }
  return null;
}
export function enRango(t, rango, hoy) {
  const l = limitesRango(rango, hoy);
  if (!l) return true;
  if (!t.fecha || t.fecha > l.hasta) return false;
  return estadoOp(t) !== 'hecha' || t.fecha >= l.desde;
}
