// Operativa de la agencia: junta las tareas de todos los embudos de todos los clientes y las del proyecto
// «Agencia» (lo interno), con lo justo para la vista general. Las tareas siguen guardadas en su proyecto
// (lsd_tareas_<código> de cada cliente): aquí solo se leen y se cambian en su sitio.
import { conProceso, esProcesoDeSerie, NOTA_PROCESO_EMAIL } from '../public/js/procesos-tarea.js';
import { storeGetPrefijo, leerJSON, guardarJSON, reintentando, conVersion } from './store.js';
import { listClientes } from './clientes.js';
import { runCliente, enPrincipal } from './cliente.js';
import { getConfig } from './config-store.js';
import { embudoDe } from './embudos.js';
import { getTareas, saveTareas } from './tareas.js';
import { listUsersRaw, rolEn, ensureContact, guardarContactos, emailLayout } from './users.js';
import { sendEmail } from './ghl.js';
import { escapeHtml } from './http.js';
import { sanitizeRich, richToEmail } from '../public/js/richtext.js';
import { sanitizeConfigTableros, tablerosDe, colocar, GENERAL, copiaRecurrente } from '../public/js/tableros.js';
import { proximaTrasHecho } from '../public/js/procesos.js';
import { estadoOp, estaBloqueada, asignadaA, agruparPorFecha, diasDeRetraso, PROYECTO_AGENCIA, CODIGO_AGENCIA, ESTADO_IDS } from '../public/js/operativa.js';
import { dayInMadrid } from '../public/js/scoring.js';

export const CLAVE_AGENCIA = 'lsd_operativa_agencia';
export const CLAVE_TABLEROS = 'lsd_operativa_tableros';
const CLAVE_AVISO = 'lsd_operativa_aviso';
const MAX_AGENCIA = 1500;
const DIAS_HECHAS = 14; // las hechas se ven unos días (para el tablero) y luego desaparecen de aquí
const hoyMadrid = () => dayInMadrid(new Date().toISOString());
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });

export const esDeAgencia = (s) => Boolean(s?.superadmin || s?.user?.agencia);

// Lo que viaja al navegador de cada tarea.
function resumen(t, p) {
  return {
    id: t.id, titulo: t.titulo, notas: t.notas || '', fase: t.fase || '', fecha: t.fecha || '', estado: estadoOp(t), hecha: Boolean(t.hecha),
    hechaEn: t.hechaEn || '', bloqueo: t.hecha ? '' : t.bloqueo || '', opTablero: t.opTablero || '', opColumna: t.opColumna || '', ...(Number.isFinite(t.opOrden) ? { opOrden: t.opOrden } : {}),
    etiquetas: Array.isArray(t.etiquetas) ? t.etiquetas : [], prioridad: t.prioridad || '', checklist: Array.isArray(t.checklist) ? t.checklist : [], repetir: t.repetir?.tipo ? t.repetir : null, repiteDe: t.repiteDe || '', asignado: t.asignado || null,
    comentarios: (t.comentarios || []).map((c) => ({ id: c.id, uid: c.uid || '', nombre: c.nombre, texto: c.texto, en: c.en })),
    ...p,
  };
}

// Embudo (del menú lateral) al que pertenece un código: un lanzamiento va en su embudo de lanzamientos; una VSL,
// venta directa o meteórico es su propio embudo (o el del lanzamiento del que cuelga). { id, nombre, tipo }.
export function embudoDeCodigo(config, code) {
  const lista = Array.isArray(config.embudos) ? config.embudos : [];
  const de = (id, def) => { const e = lista.find((x) => x.id === id); return { id: id || def.id, nombre: e?.nombre || def.nombre, tipo: e?.tipo || def.tipo }; };
  const l = config.launches?.[code];
  if (l) return de(l.embudo || lista.find((x) => x.tipo === 'lanzamientos')?.id || 'lanz', { id: 'lanz', nombre: 'Lanzamientos', tipo: 'lanzamientos' });
  if (config.vsls?.[code]) return de(code, { id: code, nombre: config.vsls[code].name || 'VSL', tipo: 'vsl' });
  if (config.directas?.[code]) return de(code, { id: code, nombre: config.directas[code].name || 'Venta directa', tipo: 'directa' });
  const m = config.meteoricos?.[code];
  if (m) return m.lanzamiento ? embudoDeCodigo(config, m.lanzamiento) : de(m.embudo, { id: m.embudo || code, nombre: 'Meteóricos', tipo: 'meteorico' });
  return { id: code, nombre: code, tipo: '' };
}

// Todas las tareas: [{ …tarea, cliente, clienteNombre, color, code, embudo, embudoId, embudoNombre, embudoTipo }]. Una lectura por cliente (todas sus
// listas de tareas de una vez) más su configuración, para el nombre de cada embudo.
export async function todasLasTareas() {
  const clientes = await listClientes();
  const limite = new Date(Date.now() - DIAS_HECHAS * 86_400_000).toISOString();
  const out = [];
  await Promise.all(clientes.map((c) => runCliente(c, async () => {
    try {
      const [mapa, config] = await Promise.all([storeGetPrefijo('lsd_tareas_'), getConfig()]);
      for (const [clave, valor] of Object.entries(mapa)) {
        const code = clave.slice('lsd_tareas_'.length);
        const emb = embudoDe(config, code);
        if (!emb) continue; // embudo borrado
        let lista;
        try { lista = JSON.parse(valor); } catch { continue; }
        if (!Array.isArray(lista)) continue;
        for (const t of lista) {
          if (!t?.id || (t.hecha && String(t.hechaEn || '') < limite)) continue;
          const grupo = embudoDeCodigo(config, code);
          out.push(resumen(conProceso(t), { cliente: c.id, clienteNombre: c.nombre, color: c.color || '', code, embudo: emb.name || emb.nombre || code, embudoId: grupo.id, embudoNombre: grupo.nombre, embudoTipo: grupo.tipo }));
        }
      }
    } catch (e) { console.error('Operativa', c.id, e.message); }
  })));
  // Lista de la Operativa: las de la agencia y las creadas aquí en el tablero de un cliente (con su `proyecto`).
  for (const t of await tareasAgencia()) {
    if (t.hecha && String(t.hechaEn || '') < limite) continue;
    const c = t.proyecto && clientes.find((x) => x.id === t.proyecto);
    out.push(resumen(t, c
      ? { cliente: c.id, clienteNombre: c.nombre, color: c.color || '', code: CODIGO_AGENCIA, embudo: 'Operativa', embudoId: CODIGO_AGENCIA, embudoNombre: 'Tareas de la Operativa', embudoTipo: '' }
      : { cliente: PROYECTO_AGENCIA, clienteNombre: 'Agencia', color: '', code: CODIGO_AGENCIA, embudo: 'Interno', embudoId: CODIGO_AGENCIA, embudoNombre: 'Interno', embudoTipo: '' }));
  }
  return out;
}

export async function tareasAgencia() {
  const v = await leerJSON(CLAVE_AGENCIA, () => []);
  return Array.isArray(v) ? v : [];
}

// Lo que ve cada persona: el superadmin, todo; el resto, lo asignado a ella o a su rol en ese cliente.
export function visiblesPara(tareas, s) {
  if (s.superadmin) return tareas;
  const u = s.user;
  return tareas.filter((t) => asignadaA(t, u?.id, t.cliente === PROYECTO_AGENCIA ? '' : rolEn(u || {}, t.cliente)));
}

// Cambia una tarea en su sitio (la lista de su embudo o la de la agencia), con reintento si otro guarda a la vez.
export async function cambiarTarea({ cliente, code, id }, fn) {
  if (code === CODIGO_AGENCIA || cliente === PROYECTO_AGENCIA) {
    return reintentando(async () => {
      const lista = await leerJSON(CLAVE_AGENCIA, () => []);
      const arr = Array.isArray(lista) ? lista : [];
      const t = arr.find((x) => x.id === id);
      if (!t) throw bad('Esa tarea ya no existe', 404);
      const r = await fn(t, arr);
      await guardarJSON(CLAVE_AGENCIA, conVersion(arr.filter((x) => !x._borrar), lista), { motivo: 'Operativa (agencia)' });
      return r ?? t;
    });
  }
  const c = (await listClientes()).find((x) => x.id === cliente);
  if (!c) throw bad('Proyecto no encontrado', 404);
  return runCliente(c, () => reintentando(async () => {
    const tareas = await getTareas(code);
    const t = tareas.find((x) => x.id === id);
    if (!t) throw bad('Esa tarea ya no existe (¿la han borrado en su proyecto?)', 404);
    const r = await fn(t, tareas);
    await saveTareas(code, tareas, 'Operativa');
    return r ?? t;
  }));
}

// Orden a mano de una columna: [{ cliente, code, id }] en el orden nuevo → cada tarea guarda su posición (opOrden).
// Una escritura por lista (la de la agencia y la de cada embudo que aparezca). `puede(t, ref)` lanza si no puede tocarla.
export async function ordenarTareas(refs, puede) {
  const grupos = new Map();
  refs.forEach((r, i) => {
    const deAgencia = r.code === CODIGO_AGENCIA || r.cliente === PROYECTO_AGENCIA;
    const k = deAgencia ? '_agencia' : `${r.cliente}|${r.code}`;
    if (!grupos.has(k)) grupos.set(k, { cliente: deAgencia ? PROYECTO_AGENCIA : r.cliente, code: deAgencia ? CODIGO_AGENCIA : r.code, pos: new Map() });
    grupos.get(k).pos.set(r.id, { n: i + 1, ref: r });
  });
  const aplicar = (arr, g) => { for (const t of arr) { const v = g.pos.get(t.id); if (v) { puede(t, v.ref); t.opOrden = v.n; } } };
  let n = 0;
  for (const g of grupos.values()) {
    if (g.code === CODIGO_AGENCIA) {
      await reintentando(async () => {
        const lista = await leerJSON(CLAVE_AGENCIA, () => []);
        const arr = Array.isArray(lista) ? lista : [];
        aplicar(arr, g);
        await guardarJSON(CLAVE_AGENCIA, conVersion(arr, lista), { motivo: 'Operativa: orden de una columna' });
      });
    } else {
      const c = (await listClientes()).find((x) => x.id === g.cliente);
      if (!c) continue;
      await runCliente(c, () => reintentando(async () => {
        const tareas = await getTareas(g.code);
        aplicar(tareas, g);
        await saveTareas(g.code, tareas, 'Operativa: orden');
      }));
    }
    n += g.pos.size;
  }
  return n;
}

// Tableros y plantillas (comunes a toda la agencia).
export async function getTableros() {
  return sanitizeConfigTableros(await leerJSON(CLAVE_TABLEROS, () => ({})));
}
export async function cambiarTableros(fn, motivo) {
  return reintentando(async () => {
    const actual = await leerJSON(CLAVE_TABLEROS, () => ({}));
    const cfg = sanitizeConfigTableros(actual);
    fn(cfg);
    const limpio = sanitizeConfigTableros(cfg);
    await guardarJSON(CLAVE_TABLEROS, conVersion(limpio, actual), { motivo });
    return limpio;
  });
}
// Tarea que se repite y se acaba de completar: añade a su lista la siguiente (una sola vez por tarea) y la devuelve.
export function repetirSiToca(t, lista, hoy = hoyMadrid()) {
  if (!t.hecha || !t.repetir?.tipo || t.repeticionCreada) return null;
  const siguiente = proximaTrasHecho(t.fecha || hoy, t.repetir, hoy);
  if (!siguiente) return null;
  const n = copiaRecurrente(t, { hoy, siguiente, id: `${t.id.startsWith('ta') ? 'ta' : 't'}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` });
  t.repeticionCreada = n.id;
  lista.push(n);
  return n;
}
export const resumenTarea = resumen;

// Lleva una tarea a una columna (y, si se indica, a otro tablero de su proyecto), con hecha / estado al día.
export function moverATablero(t, cfg, proyecto, { tablero, columna }, por) {
  const tabs = tablerosDe(cfg, proyecto);
  const tab = tabs.find((b) => b.id === (tablero || t.opTablero || GENERAL)) || tabs[0];
  const pos = colocar(t, tab, columna);
  const era = Boolean(t.hecha);
  Object.assign(t, pos);
  if (t.hecha) t.bloqueo = '';
  if (t.hecha !== era) { t.hechaPor = t.hecha ? por : ''; t.hechaEn = t.hecha ? new Date().toISOString() : ''; }
}

export async function crearTareaAgencia(input, por) {
  return reintentando(async () => {
    const lista = await leerJSON(CLAVE_AGENCIA, () => []);
    const arr = Array.isArray(lista) ? lista : [];
    if (arr.length >= MAX_AGENCIA) throw bad(`Como mucho ${MAX_AGENCIA} tareas en el proyecto Agencia.`);
    const t = { id: `ta${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...camposAgencia(input),
      // Creada en el tablero de un cliente: es de ese proyecto (si no, de la agencia).
      ...(input?.proyecto && input.proyecto !== PROYECTO_AGENCIA ? { proyecto: String(input.proyecto) } : {}),
      ...(input?.opTablero ? { opTablero: String(input.opTablero).slice(0, 24) } : {}), estado: 'pendiente', hecha: false, hechaEn: '', hechaPor: '', comentarios: [], creadaPor: por, creadaEn: new Date().toISOString() };
    arr.push(t);
    await guardarJSON(CLAVE_AGENCIA, conVersion(arr, lista), { motivo: 'Operativa: tarea nueva (agencia)' });
    return t;
  });
}

// Importar tareas de golpe (un tablero importado): una sola escritura de la lista de la Operativa.
export async function crearTareasAgencia(nuevas, por) {
  return reintentando(async () => {
    const lista = await leerJSON(CLAVE_AGENCIA, () => []);
    const arr = Array.isArray(lista) ? lista : [];
    if (arr.length + nuevas.length > MAX_AGENCIA) throw bad(`Como mucho ${MAX_AGENCIA} tareas en la Operativa (hay ${arr.length}).`);
    const ahora = new Date().toISOString();
    const hechas = nuevas.map((x, i) => ({ id: `ta${Date.now().toString(36)}${i.toString(36)}${Math.random().toString(36).slice(2, 5)}`, ...x, comentarios: [], creadaPor: por, creadaEn: ahora }));
    arr.push(...hechas);
    await guardarJSON(CLAVE_AGENCIA, conVersion(arr, lista), { motivo: `Operativa: tablero importado (${hechas.length} tareas)` });
    return hechas;
  });
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export function camposAgencia(input) {
  const titulo = String(input?.titulo ?? '').trim().slice(0, 200);
  if (!titulo) throw bad('La tarea necesita un título');
  return {
    titulo,
    notas: sanitizeRich(input?.notas),
    fecha: ISO_DAY.test(String(input?.fecha || '')) ? input.fecha : '',
    asignado: input?.asignado?.tipo === 'persona' && /^[A-Za-z0-9_-]{1,40}$/.test(String(input.asignado.id || '')) ? { tipo: 'persona', id: String(input.asignado.id) } : null,
    fase: '',
  };
}

export function ponerEstado(t, estado, { por }) {
  if (!ESTADO_IDS.includes(estado)) throw bad('Estado no válido');
  const era = Boolean(t.hecha);
  t.estado = estado;
  t.hecha = estado === 'hecha';
  if (t.hecha) t.bloqueo = ''; // al terminarla, deja de estar bloqueada
  if (t.hecha !== era) { t.hechaPor = t.hecha ? por : ''; t.hechaEn = t.hecha ? new Date().toISOString() : ''; }
}

// Marca de bloqueada: con motivo la bloquea (sin moverla de columna); vacío la desbloquea.
export function ponerBloqueo(t, motivo) {
  if (t.hecha) throw bad('Una tarea hecha no se puede bloquear');
  t.bloqueo = String(motivo || '').trim().slice(0, 200);
  if (t.estado === 'bloqueado' || t.estado === 'en-curso') t.estado = 'pendiente'; // estados antiguos
}

// ---------- Emails ----------
const fechaLarga = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '');
const lineaTarea = (t, hoy) => `<li style="margin:0 0 10px"><strong>${escapeHtml(t.titulo)}</strong><br><span style="font-size:13px;color:#7a6458">${escapeHtml(t.clienteNombre)}${t.embudo ? ` · ${escapeHtml(t.embudo)}` : ''}${t.fecha ? ` · ${t.fecha < hoy ? `<b style="color:#b3261e">vencida hace ${diasDeRetraso(t.fecha, hoy)} día${diasDeRetraso(t.fecha, hoy) === 1 ? '' : 's'}</b>` : `para el ${escapeHtml(fechaLarga(t.fecha))}`}` : ''}${estaBloqueada(t) ? ` · ⛔ bloqueada: ${escapeHtml(t.bloqueo)}` : ''}</span>${esProcesoDeSerie(t) ? NOTA_PROCESO_EMAIL : t.notas ? `<div style="font-size:14px;margin-top:6px">${richToEmail(t.notas)}</div>` : ''}</li>`;

// Aviso al asignar una tarea desde la Operativa (a la persona, por email; desde el GHL principal).
export async function avisarAsignada(t, uid, { url, por }) {
  return enPrincipal(async () => {
    const users = await listUsersRaw({ fresh: true });
    const u = users.find((x) => x.id === uid && x.activo !== false && x.email);
    if (!u) return false;
    const had = u.contactId;
    const contactId = await ensureContact(u);
    const nombre = String(u.nombre || '').split(/\s+/)[0];
    const body = `<p>Hola ${escapeHtml(nombre)},</p><p><strong>${escapeHtml(por)}</strong> te ha asignado una tarea:</p><ul style="padding-left:18px">${lineaTarea(t, hoyMadrid())}</ul>`;
    await sendEmail(contactId, { subject: `Nueva tarea: ${t.titulo}`.slice(0, 120), html: await emailLayout('Nueva tarea', body, { url, button: 'Abrir la Operativa' }) });
    if (!had) await guardarContactos([u]);
    return true;
  });
}

// Cada mañana (una vez al día): a cada persona del equipo de la agencia, sus tareas vencidas y las de hoy.
export async function avisosDiarios(url) {
  const hoy = hoyMadrid();
  const ya = await leerJSON(CLAVE_AVISO, () => ({}));
  if (ya?.dia === hoy) return { enviados: 0, motivo: 'Ya enviado hoy' };
  const [tareas, users] = await Promise.all([todasLasTareas(), enPrincipal(() => listUsersRaw({ fresh: true }))]);
  const equipo = users.filter((u) => (u.agencia || u.superadmin) && u.activo !== false && u.email);
  let enviados = 0;
  const conContacto = [];
  await enPrincipal(async () => {
    for (const u of equipo) {
      const suyas = visiblesPara(tareas, { superadmin: false, user: u });
      const g = agruparPorFecha(suyas, hoy);
      const bloqueadas = suyas.filter((t) => estaBloqueada(t) && !g.vencidas.includes(t) && !g.hoy.includes(t));
      if (!g.vencidas.length && !g.hoy.length) continue;
      try {
        const had = u.contactId;
        const contactId = await ensureContact(u);
        if (!had) conContacto.push(u);
        const nombre = String(u.nombre || '').split(/\s+/)[0];
        const bloque = (titulo, lista) => (lista.length ? `<h3 style="margin:18px 0 8px;font-size:16px">${titulo} (${lista.length})</h3><ul style="padding-left:18px">${lista.map((t) => lineaTarea(t, hoy)).join('')}</ul>` : '');
        const body = `<p>Buenos días, ${escapeHtml(nombre)}. Esto es lo tuyo para hoy:</p>${bloque('⏰ Vencidas', g.vencidas)}${bloque('📅 Para hoy', g.hoy)}${bloque('⛔ Bloqueadas', bloqueadas)}<p style="font-size:13px;color:#7a6458">Cámbiales el estado o la fecha en la Operativa en cuanto avances.</p>`;
        const asunto = g.vencidas.length ? `⏰ Tienes ${g.vencidas.length} tarea${g.vencidas.length === 1 ? '' : 's'} vencida${g.vencidas.length === 1 ? '' : 's'}${g.hoy.length ? ` y ${g.hoy.length} para hoy` : ''}` : `📅 Tus ${g.hoy.length} tarea${g.hoy.length === 1 ? '' : 's'} de hoy`;
        await sendEmail(contactId, { subject: asunto, html: await emailLayout('Tu día en la agencia', body, { url, button: 'Abrir la Operativa' }) });
        enviados++;
      } catch (e) { console.error('Aviso operativa', u.nombre, e.message); }
    }
  });
  if (conContacto.length) await guardarContactos(conContacto);
  await guardarJSON(CLAVE_AVISO, { dia: hoy, enviados }, { motivo: 'Avisos de la Operativa' }).catch(() => {});
  return { enviados, equipo: equipo.length };
}
