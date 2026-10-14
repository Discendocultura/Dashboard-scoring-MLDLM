// Biblioteca de procesos de la agencia (solo superadmin): el «cómo se hace» de todo, con pasos, vídeos y
// enlaces. Común a todos los clientes (cliente «_agencia», clave lsd_procesos). No son tareas: es la
// documentación que se consulta (y que más adelante podrán enlazar las tareas de cada embudo).
//   { secciones: [{ id, titulo }], procesos: [{ id, seccion, titulo, html, asana, actualizado, por,
//     proyectos: [cliente…] (vacío = general, para todos), responsable, fecha, repetir: { tipo, n }, hecho, hechoEn, subtareas: [{ id, texto, hecha }],
//     comentarios: [{ id, porId, por, en, texto }], actividad: [{ en, por, txt }] }] }
// Como una tarea de Asana: responsable, fecha (que puede repetirse), descripción, subtareas y comentarios.
// Lo usan el navegador (panel) y el servidor (para limpiar lo que llega). Se importa desde Asana con un
// archivo .json (el contenido no va en el código: el repositorio es público).
import { sanitizeRich, safeHref, richToText } from './richtext.js';

export const MAX_PROCESOS = 400;
export const MAX_SECCIONES = 40;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const limpio = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const nuevoIdProceso = () => `pr${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const idSeccion = (titulo) => limpio(titulo, 60).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'general';

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
const PROYECTO_RE = /^[a-z][a-z0-9-]{1,23}$/; // id de un cliente del dashboard
// ¿Se ve en este proyecto? Los generales (sin proyecto), en todos. proyecto: '' = todos · '_general' = solo los generales.
export const enProyecto = (p, proyecto) => (!proyecto ? true : proyecto === '_general' ? !p.proyectos?.length : !p.proyectos?.length || p.proyectos.includes(proyecto));
export const REPETIR = [
  { id: '', label: 'No se repite' },
  { id: 'diaria', label: 'Cada día' },
  { id: 'laborables', label: 'Cada día laborable (L-V)' },
  { id: 'semanal', label: 'Cada semana' },
  { id: 'quincenal', label: 'Cada 2 semanas' },
  { id: 'mensual', label: 'Cada mes' },
  { id: 'dias', label: 'Cada N días' },
];
export const MAX_SUBTAREAS = 50;
export const MAX_COMENTARIOS = 300;
const MAX_ACTIVIDAD = 150;
const idCorto = () => Math.random().toString(36).slice(2, 10);

// Además del tipo: el día concreto. Semanal → días de la semana (uno o varios: 0 = domingo … 6 = sábado);
// cada 2 semanas → un día de la semana; mensual → el día del mes (1-31, -1 = el último) o «el primer / segundo /
// tercer / cuarto / último <día de la semana>» (ord + dsem). Sin día concreto, como hasta ahora (desde la fecha).
export const DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 0].map((id) => ({ id, nombre: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][id], corto: 'DLMXJVS'[id] }));
export const ORDINALES = [{ id: 1, label: 'primer' }, { id: 2, label: 'segundo' }, { id: 3, label: 'tercer' }, { id: 4, label: 'cuarto' }, { id: -1, label: 'último' }];
const esDsem = (x) => Number.isInteger(x) && x >= 0 && x <= 6;
export function sanitizeRepetir(r) {
  const tipo = REPETIR.some((x) => x.id === r?.tipo) ? r.tipo : '';
  const out = { tipo, n: tipo === 'dias' ? Math.min(365, Math.max(1, Math.round(Number(r?.n) || 1))) : 0 };
  if ((tipo === 'semanal' || tipo === 'quincenal') && Array.isArray(r?.dias)) {
    const ds = [...new Set(r.dias.map(Number).filter(esDsem))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    if (ds.length) out.dias = tipo === 'quincenal' ? [ds[0]] : ds;
  }
  if (tipo === 'mensual') {
    const ord = Number(r?.ord); const dsem = Number(r?.dsem); const dia = Number(r?.dia);
    if (ORDINALES.some((o) => o.id === ord) && esDsem(dsem)) Object.assign(out, { ord, dsem });
    else if (dia === -1 || (Number.isInteger(dia) && dia >= 1 && dia <= 31)) out.dia = dia;
  }
  return out;
}
export const sumarDias = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
function sumarMes(d) {
  const [y, m, dd] = d.split('-').map(Number);
  const ult = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // último día del mes siguiente
  return `${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, '0')}-${String(Math.min(dd, ult)).padStart(2, '0')}`;
}
const dsemDe = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
const dosCifras = (n) => String(n).padStart(2, '0');
// El día que toca en un mes (m: 1-12) según la regla mensual (día del mes o «primer lunes», «último viernes»…).
function diaDelMes(y, m, r) {
  const ult = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let dia;
  if (r.ord) {
    if (r.ord > 0) dia = 1 + ((r.dsem - dsemDe(`${y}-${dosCifras(m)}-01`) + 7) % 7) + (r.ord - 1) * 7;
    else dia = ult - ((dsemDe(`${y}-${dosCifras(m)}-${ult}`) - r.dsem + 7) % 7);
  } else dia = r.dia === -1 ? ult : Math.min(r.dia, ult);
  return `${y}-${dosCifras(m)}-${dosCifras(dia)}`;
}
// ¿Esa fecha cae en el día que marca la regla? (sin día concreto, cualquiera vale)
export function encajaEnRepetir(fecha, repetir) {
  const r = sanitizeRepetir(repetir);
  if (!DIA_RE.test(fecha || '')) return false;
  if (r.dias) return r.dias.includes(dsemDe(fecha));
  if (r.tipo === 'laborables') return ![0, 6].includes(dsemDe(fecha));
  if (r.tipo === 'mensual' && (r.ord || r.dia)) { const [y, m] = fecha.split('-').map(Number); return diaDelMes(y, m, r) === fecha; }
  return true;
}
// La primera fecha de la regla desde un día (ese mismo si encaja): para colocar la tarea al elegir el día concreto.
export function primeraFechaRepetir(desde, repetir) {
  if (encajaEnRepetir(desde, repetir)) return desde;
  const r = sanitizeRepetir(repetir);
  if (r.dias) { let d = sumarDias(desde, 1); while (!r.dias.includes(dsemDe(d))) d = sumarDias(d, 1); return d; } // el próximo de esos días (también cada 2 semanas)
  return siguienteFecha(desde, repetir);
}
// La siguiente fecha de un proceso que se repite (o '' si no se repite).
export function siguienteFecha(fecha, repetir) {
  const r = sanitizeRepetir(repetir);
  if (!r.tipo || !DIA_RE.test(fecha || '')) return '';
  if (r.tipo === 'diaria') return sumarDias(fecha, 1);
  if (r.tipo === 'laborables') { let d = sumarDias(fecha, 1); while ([0, 6].includes(dsemDe(d))) d = sumarDias(d, 1); return d; }
  if (r.dias) {
    let d = sumarDias(fecha, 1);
    while (!r.dias.includes(dsemDe(d))) d = sumarDias(d, 1); // como mucho 7 vueltas
    return r.tipo === 'quincenal' ? sumarDias(d, 7) : d;
  }
  if (r.tipo === 'semanal') return sumarDias(fecha, 7);
  if (r.tipo === 'quincenal') return sumarDias(fecha, 14);
  if (r.tipo === 'mensual' && (r.ord || r.dia)) {
    const [y, m] = fecha.split('-').map(Number);
    const este = diaDelMes(y, m, r);
    return este > fecha ? este : diaDelMes(m === 12 ? y + 1 : y, (m % 12) + 1, r);
  }
  if (r.tipo === 'mensual') return sumarMes(fecha);
  return sumarDias(fecha, r.n);
}
// Al marcar como hecho uno que se repite: la próxima fecha que no haya pasado ya.
export function proximaTrasHecho(fecha, repetir, hoy) {
  let d = siguienteFecha(fecha, repetir);
  for (let i = 0; d && d < hoy && i < 800; i++) d = siguienteFecha(d, repetir);
  return d;
}
// 'vencida' | 'hoy' | 'manana' | 'semana' | 'futura' | '' (sin fecha o hecho).
export function estadoFecha(p, hoy) {
  if (!p?.fecha || (p.hecho && !p.repetir?.tipo)) return '';
  if (p.fecha < hoy) return 'vencida';
  if (p.fecha === hoy) return 'hoy';
  if (p.fecha === sumarDias(hoy, 1)) return 'manana';
  return p.fecha <= sumarDias(hoy, 7) ? 'semana' : 'futura';
}
const listaY = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : xs[0] || '');
const nombreDsem = (id) => DIAS_SEMANA.find((x) => x.id === id)?.nombre || '';
export function textoRepetir(rep) {
  const r = sanitizeRepetir(rep);
  if (r.tipo === 'dias') return `Cada ${r.n} día${r.n === 1 ? '' : 's'}`;
  if (r.tipo === 'semanal' && r.dias) return r.dias.length === 7 ? 'Cada día' : `Cada semana: ${listaY(r.dias.map(nombreDsem))}`;
  if (r.tipo === 'quincenal' && r.dias) return `Cada 2 semanas, el ${nombreDsem(r.dias[0])}`;
  if (r.tipo === 'mensual' && r.ord) return `Cada mes, el ${ORDINALES.find((o) => o.id === r.ord).label} ${nombreDsem(r.dsem)}`;
  if (r.tipo === 'mensual' && r.dia) return r.dia === -1 ? 'Cada mes, el último día' : `Cada mes, el día ${r.dia}`;
  return REPETIR.find((x) => x.id === r.tipo)?.label || '';
}

export function sanitizeProceso(p, secciones = []) {
  const id = ID_RE.test(String(p?.id || '')) ? String(p.id) : nuevoIdProceso();
  const seccion = secciones.some((s) => s.id === p?.seccion) ? p.seccion : secciones[0]?.id || 'general';
  return {
    id, seccion,
    titulo: limpio(p?.titulo, 160) || 'Proceso sin título',
    html: sanitizeRich(p?.html || ''),
    asana: safeHref(p?.asana) && /^https:\/\/app\.asana\.com\//.test(p.asana) ? p.asana : '',
    actualizado: limpio(p?.actualizado, 30),
    por: limpio(p?.por, 60),
    proyectos: [...new Set((Array.isArray(p?.proyectos) ? p.proyectos : []).map(String).filter((x) => PROYECTO_RE.test(x)))].slice(0, 30),
    responsable: ID_RE.test(String(p?.responsable || '')) ? String(p.responsable) : '',
    fecha: DIA_RE.test(p?.fecha || '') ? p.fecha : '',
    repetir: sanitizeRepetir(p?.repetir),
    hecho: Boolean(p?.hecho),
    hechoEn: limpio(p?.hechoEn, 30),
    subtareas: (Array.isArray(p?.subtareas) ? p.subtareas : []).slice(0, MAX_SUBTAREAS)
      .map((x) => ({ id: ID_RE.test(String(x?.id || '')) ? String(x.id) : idCorto(), texto: limpio(x?.texto, 300), hecha: Boolean(x?.hecha) })).filter((x) => x.texto),
    comentarios: (Array.isArray(p?.comentarios) ? p.comentarios : []).slice(-MAX_COMENTARIOS)
      .map((c) => ({ id: ID_RE.test(String(c?.id || '')) ? String(c.id) : idCorto(), porId: ID_RE.test(String(c?.porId || '')) ? String(c.porId) : '', por: limpio(c?.por, 60) || 'Alguien', en: limpio(c?.en, 30), texto: String(c?.texto ?? '').trim().slice(0, 4000) }))
      .filter((c) => c.texto),
    actividad: (Array.isArray(p?.actividad) ? p.actividad : []).slice(-MAX_ACTIVIDAD).map((a) => ({ en: limpio(a?.en, 30), por: limpio(a?.por, 60), txt: limpio(a?.txt, 200) })).filter((a) => a.txt),
  };
}
export const nuevoIdCorto = idCorto;

export function sanitizeBiblioteca(b) {
  const vistas = new Set();
  const secciones = (Array.isArray(b?.secciones) ? b.secciones : []).slice(0, MAX_SECCIONES)
    .map((s) => ({ id: ID_RE.test(String(s?.id || '')) ? String(s.id) : idSeccion(s?.titulo), titulo: limpio(s?.titulo, 60) || 'Sin sección' }))
    .filter((s) => !vistas.has(s.id) && vistas.add(s.id));
  if (!secciones.length) secciones.push({ id: 'general', titulo: 'General' });
  const ids = new Set();
  const procesos = (Array.isArray(b?.procesos) ? b.procesos : []).slice(0, MAX_PROCESOS)
    .map((p) => sanitizeProceso(p, secciones)).filter((p) => !ids.has(p.id) && ids.add(p.id));
  return { secciones, procesos };
}

// Importar (archivo .json): añade las secciones nuevas y actualiza los procesos con el mismo id; el resto se queda.
export function fusionar(actual, entrante) {
  const a = sanitizeBiblioteca(actual);
  const e = sanitizeBiblioteca(entrante);
  const secciones = [...a.secciones.filter((s) => s.id !== 'general' || a.procesos.some((p) => p.seccion === 'general')), ...e.secciones.filter((s) => !a.secciones.some((x) => x.id === s.id))];
  const nuevos = new Map(e.procesos.map((p) => [p.id, p]));
  // Del archivo se toma el contenido (título, sección, descripción y enlace); lo de trabajo (responsable, fechas,
  // subtareas, comentarios y actividad) se queda como estaba.
  const contenido = (p, n) => ({ ...p, titulo: n.titulo, seccion: n.seccion, html: n.html, asana: n.asana || p.asana, proyectos: n.proyectos?.length ? n.proyectos : p.proyectos });
  const procesos = [...a.procesos.map((p) => (nuevos.has(p.id) ? contenido(p, nuevos.get(p.id)) : p)), ...e.procesos.filter((p) => !a.procesos.some((x) => x.id === p.id))];
  return { biblioteca: sanitizeBiblioteca({ secciones, procesos }), nuevos: e.procesos.filter((p) => !a.procesos.some((x) => x.id === p.id)).length, actualizados: e.procesos.filter((p) => a.procesos.some((x) => x.id === p.id)).length };
}

// ¿Tiene contenido? (los que en Asana estaban vacíos salen como «por documentar»).
export const documentado = (p) => richToText(p?.html).trim().length > 0 || /data-video=/.test(p?.html || '');
export const tieneVideo = (p) => /data-video=/.test(p?.html || '');

// Búsqueda sin tildes ni mayúsculas, en el título y el texto.
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function buscarProcesos(procesos, q) {
  const t = norm(q).trim();
  if (!t) return procesos;
  const palabras = t.split(/\s+/);
  return procesos.filter((p) => { const txt = norm(`${p.titulo} ${richToText(p.html)}`); return palabras.every((w) => txt.includes(w)); });
}
