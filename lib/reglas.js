// Motor de las reglas de seguimiento y la bandeja de decisiones (por cliente).
//   · lsd_reglas: las reglas (public/js/reglas.js).
//   · lsd_bandeja: { items: [propuesta], hechos: { regla: [ids] }, dia: { fecha, [regla]: n } }
//     propuesta: { id, regla, code, titulo, leads: [{ id, nombre, score }], estado, pendientes: [ids], hechas, creada, por }
//       estado: pendiente (espera tu ✅/❌) · aprobada (en marcha) · hecha · descartada
// Cada llamada de la tarea programada hace UNA cosa (por el límite de 50 peticiones de Cloudflare): si hay una propuesta
// aprobada a medias, envía hasta 20; si no, descarga los leads del lanzamiento en curso y crea las propuestas nuevas.
import { getConfig } from './config-store.js';
import { allLeads, currentLaunch } from './digest.js';
import { addTags } from './ghl.js';
import { leerJSON, guardarJSON, reintentando } from './store.js';
import { registrarEnvioPlantillas } from './envios-plantillas.js';
import { getTareas, saveTareas, MAX_TAREAS } from './tareas.js';
import { newId } from './users.js';
import { avisarTelegram } from './telegram.js';
import { clienteActual } from './cliente.js';
import { escapeHtml, mapLimit } from './http.js';
import { enrichLead } from '../public/js/metrics.js';
import { dayInMadrid, tagFor, PLANTILLA_ENVIADA_TAG } from '../public/js/scoring.js';
import { sanitizeReglas, faltaEnRegla, candidatos, tituloPropuesta, CONDICIONES } from '../public/js/reglas.js';

const CLAVE_REGLAS = 'lsd_reglas';
const CLAVE_BANDEJA = 'lsd_bandeja';
export const POR_TANDA = 20;
const MAX_ITEMS = 60;
const MAX_HECHOS = 5000;

export const leerReglas = async () => sanitizeReglas(await leerJSON(CLAVE_REGLAS, () => []));
export const guardarReglas = (reglas, motivo = 'Reglas de seguimiento') => guardarJSON(CLAVE_REGLAS, sanitizeReglas(reglas), { motivo });
const vacia = () => ({ items: [], hechos: {}, dia: { fecha: '' } });
export const leerBandeja = async () => ({ ...vacia(), ...(await leerJSON(CLAVE_BANDEJA, vacia)) });
async function cambiarBandeja(fn, motivo) {
  return reintentando(async () => {
    const b = await leerBandeja();
    const r = await fn(b);
    b.items = b.items.slice(-MAX_ITEMS);
    for (const k of Object.keys(b.hechos)) b.hechos[k] = b.hechos[k].slice(-MAX_HECHOS);
    await guardarJSON(CLAVE_BANDEJA, b, { motivo });
    return r;
  });
}
const hoy = (ahora = Date.now()) => dayInMadrid(new Date(ahora).toISOString());
const usadosHoy = (b, regla, ahora) => (b.dia?.fecha === hoy(ahora) ? Number(b.dia[regla]) || 0 : 0);

// Ejecuta hasta POR_TANDA leads de una propuesta aprobada. → { hechas, restantes }
async function ejecutarTanda(item, config, { ahora = Date.now(), por = 'Reglas' } = {}) {
  const reglas = await leerReglas();
  const regla = reglas.find((r) => r.id === item.regla) || { id: item.regla, accion: item.accion };
  const accion = item.accion || regla.accion;
  const tanda = item.pendientes.slice(0, POR_TANDA);
  let ok = [];
  if (accion.tipo === 'tarea') {
    // Una tarea con la lista de leads (para no llenar el tablero): «Llamar a 8 leads muy calientes».
    const nombres = item.leads.filter((l) => item.pendientes.includes(l.id)).map((l) => `${l.nombre} (${l.score} pts)`);
    await reintentando(async () => {
      const tareas = await getTareas(item.code);
      if (tareas.length >= MAX_TAREAS) throw Object.assign(new Error('Tareas llenas'), { publicMessage: 'El lanzamiento ya tiene el máximo de tareas' });
      tareas.push({
        id: newId('t'), titulo: `Llamar a ${nombres.length} lead${nombres.length === 1 ? '' : 's'}: ${CONDICIONES[item.regla]?.corto || ''}`.slice(0, 200),
        notas: `<p>Propuesto por las reglas de seguimiento. Están en Setting hoy con su ficha.</p><ul>${nombres.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`,
        fase: 'carrito', sub: '', fecha: hoy(ahora), asignado: { tipo: 'rol', rol: accion.rol || 'setter' },
        estado: 'pendiente', hecha: false, hechaPor: '', hechaEn: '', creadaPor: por, creadaEn: new Date(ahora).toISOString(),
      });
      await saveTareas(item.code, tareas, 'Tarea de las reglas de seguimiento');
    });
    ok = [...item.pendientes];
  } else {
    const etiquetas = accion.tipo === 'plantilla'
      ? [accion.tag, PLANTILLA_ENVIADA_TAG, ...(config.launches?.[item.code] ? [tagFor(item.code, 'wa_enviado')] : [])]
      : [accion.tag];
    const res = await mapLimit(tanda, 4, async (id) => {
      try { await addTags(id, etiquetas); return id; } catch (e) { console.error('Regla', e.message); return null; }
    });
    ok = res.filter(Boolean);
    if (accion.tipo === 'plantilla' && ok.length) {
      const pl = (config.plantillasWa || []).find((p) => p.tag === accion.tag);
      await registrarEnvioPlantillas(item.code, { at: new Date(ahora).toISOString(), tag: accion.tag, nombre: pl?.nombre || accion.tag, ids: ok, precio: pl?.precio ?? 0, por }).catch(() => {});
    }
  }
  const procesados = accion.tipo === 'tarea' ? item.pendientes : tanda; // los que fallan no se reintentan (no insistir)
  return cambiarBandeja((b) => {
    const it = b.items.find((x) => x.id === item.id);
    if (!it) return { hechas: 0, restantes: 0 };
    it.pendientes = it.pendientes.filter((id) => !procesados.includes(id));
    it.hechas = (it.hechas || 0) + ok.length;
    it.fallidas = (it.fallidas || 0) + (procesados.length - ok.length);
    if (!it.pendientes.length) { it.estado = 'hecha'; it.hechaEn = new Date(ahora).toISOString(); }
    b.hechos[it.regla] = [...(b.hechos[it.regla] || []), ...ok];
    if (b.dia?.fecha !== hoy(ahora)) b.dia = { fecha: hoy(ahora) };
    b.dia[it.regla] = (Number(b.dia[it.regla]) || 0) + ok.length;
    return { hechas: ok.length, restantes: it.pendientes.length };
  }, 'Bandeja: acción ejecutada');
}

// Aprobar (✅) o descartar (❌) una propuesta. Al aprobar se hace la primera tanda al momento.
export async function decidir(id, si, { por = '', ahora = Date.now() } = {}) {
  const item = await cambiarBandeja((b) => {
    const it = b.items.find((x) => x.id === id);
    if (!it || it.estado !== 'pendiente') return null;
    it.estado = si ? 'aprobada' : 'descartada';
    it.decididaPor = por;
    it.decididaEn = new Date(ahora).toISOString();
    // Descartados: no se vuelven a proponer con esta regla.
    if (!si) b.hechos[it.regla] = [...(b.hechos[it.regla] || []), ...it.pendientes];
    return { ...it };
  }, si ? 'Bandeja: aprobada' : 'Bandeja: descartada');
  if (!item) throw Object.assign(new Error('Ya decidida'), { status: 409, publicMessage: 'Esa propuesta ya no está pendiente (¿la ha decidido otra persona?).' });
  if (!si) return { estado: 'descartada', hechas: 0, restantes: 0 };
  if (item.tipo === 'agente') return { estado: 'aprobada', ...(await ejecutarAgente(item, { por, ahora })) };
  return { estado: 'aprobada', ...(await continuar(id, { por, ahora })) };
}

// Siguiente tanda de una aprobada (el navegador la llama hasta que no quedan).
export async function continuar(id, { por = '', ahora = Date.now() } = {}) {
  const b = await leerBandeja();
  const it = b.items.find((x) => x.id === id);
  if (!it || it.estado !== 'aprobada') return { hechas: 0, restantes: 0 };
  return ejecutarTanda(it, await getConfig(), { ahora, por: por || 'Reglas' });
}

// Tarea programada: una cosa por llamada. → { accion: 'tanda' | 'evaluar' | 'nada', ... }
export async function revisarReglas({ ahora = Date.now(), avisar = true, url = '' } = {}) {
  const reglas = (await leerReglas()).filter((r) => r.activa);
  const b0 = await leerBandeja();
  const enMarcha = b0.items.find((x) => x.estado === 'aprobada' && x.pendientes.length);
  const config = await getConfig({ fresh: true });
  if (enMarcha) return { accion: 'tanda', id: enMarcha.id, ...(await ejecutarTanda(enMarcha, config, { ahora })) };
  if (!reglas.length) return { accion: 'nada', motivo: 'No hay reglas activas' };
  const code = currentLaunch(config, hoy(ahora));
  const l = code ? config.launches[code] : null;
  if (!l?.registroTag) return { accion: 'nada', motivo: 'Sin lanzamiento en curso' };
  const listas = reglas.filter((r) => !faltaEnRegla(r, config.plantillasWa || []));
  if (!listas.length) return { accion: 'nada', motivo: 'Las reglas activas no tienen su acción completa' };
  const leads = (await allLeads(l.registroTag, l.compraDateField ? [l.compraDateField] : [])).map((c) => enrichLead(c, code, config));
  const nuevas = await cambiarBandeja((b) => {
    const out = [];
    for (const r of listas) {
      const ya = new Set([...(b.hechos[r.id] || []), ...b.items.filter((x) => x.regla === r.id && ['pendiente', 'aprobada'].includes(x.estado)).flatMap((x) => x.pendientes)]);
      const queda = Math.max(0, r.max - usadosHoy(b, r.id, ahora) - b.items.filter((x) => x.regla === r.id && x.estado === 'pendiente').reduce((t, x) => t + x.pendientes.length, 0));
      const lista = candidatos(leads, r, ya).slice(0, queda);
      if (!lista.length) continue;
      const it = {
        id: newId('d'), regla: r.id, code, accion: r.accion, titulo: tituloPropuesta(r, lista.length, config.plantillasWa || []),
        leads: lista.map((x) => ({ id: x.id, nombre: String(x.name || x.email || 'Sin nombre').split(/\s+/).slice(0, 2).join(' ').slice(0, 40), score: x.score })),
        pendientes: lista.map((x) => x.id), hechas: 0, estado: r.modo === 'auto' ? 'aprobada' : 'pendiente', creada: new Date(ahora).toISOString(), auto: r.modo === 'auto',
      };
      b.items.push(it);
      out.push(it);
    }
    return out;
  }, 'Bandeja: propuestas nuevas');
  const porAprobar = nuevas.filter((x) => x.estado === 'pendiente');
  let avisado = 0;
  if (avisar && nuevas.length) {
    const c = clienteActual();
    const enlace = url ? `${url}${c.principal ? '' : `?c=${encodeURIComponent(c.id)}`}#bandeja` : '';
    avisado = await avisarTelegram([
      `📥 <b>${escapeHtml(c.nombre)}</b> · ${escapeHtml(l.name)}`,
      ...porAprobar.map((x) => `🟡 Por aprobar: ${escapeHtml(x.titulo)}`),
      ...nuevas.filter((x) => x.auto).map((x) => `🤖 En marcha (automática): ${escapeHtml(x.titulo)}`),
      enlace ? `\n<a href="${escapeHtml(enlace)}">Abrir la bandeja de decisiones</a>` : '',
    ].filter(Boolean).join('\n'));
  }
  return { accion: 'evaluar', code, leads: leads.length, nuevas: nuevas.length, porAprobar: porAprobar.length, avisado };
}

// ---- Propuestas del agente de lanzamientos (public/js/agente.js) ----
// Van a la misma bandeja (tipo 'agente'). Al aprobarlas: crear las tareas propuestas o encender una regla.
export async function anadirPropuestasAgente(code, propuestas, { ahora = Date.now() } = {}) {
  return cambiarBandeja((b) => {
    const ya = new Set(b.items.filter((x) => x.tipo === 'agente').map((x) => `${x.code}|${x.clave}`));
    const nuevas = propuestas.filter((p) => !ya.has(`${code}|${p.clave}`) && p.accion?.tipo !== 'brief').map((p) => ({
      id: newId('d'), tipo: 'agente', regla: 'agente', clave: p.clave, code, titulo: p.titulo, detalle: p.detalle, accion: p.accion,
      leads: [], pendientes: [], hechas: 0, estado: 'pendiente', creada: new Date(ahora).toISOString(),
    }));
    b.items.push(...nuevas);
    return nuevas;
  }, 'Bandeja: propuestas del agente');
}

async function ejecutarAgente(item, { por = '', ahora = Date.now() } = {}) {
  let hechas = 0;
  if (item.accion?.tipo === 'tareas') {
    await reintentando(async () => {
      const tareas = await getTareas(item.code);
      const ya = new Set(tareas.filter((t) => !t.hecha).map((t) => t.titulo));
      const nuevas = (item.accion.tareas || []).filter((t) => t?.titulo && !ya.has(t.titulo)).slice(0, Math.max(0, MAX_TAREAS - tareas.length)).map((t) => ({
        id: newId('t'), titulo: String(t.titulo).slice(0, 200), notas: t.notas ? `<p>${escapeHtml(t.notas)}</p>` : '', fase: 'preparacion', sub: '',
        fecha: /^\d{4}-\d{2}-\d{2}$/.test(t.fecha || '') ? t.fecha : hoy(ahora), asignado: { tipo: 'rol', rol: /^[a-z0-9_-]{2,30}$/.test(t.rol || '') ? t.rol : 'admin' },
        estado: 'pendiente', hecha: false, hechaPor: '', hechaEn: '', creadaPor: por || 'Agente', creadaEn: new Date(ahora).toISOString(),
      }));
      hechas = nuevas.length;
      if (nuevas.length) await saveTareas(item.code, [...tareas, ...nuevas], 'Tareas del agente de lanzamientos');
    });
  } else if (item.accion?.tipo === 'regla') {
    const reglas = await leerReglas();
    await guardarReglas(reglas.map((r) => (r.id === item.accion.regla.id ? { ...r, ...item.accion.regla } : r)), 'Regla encendida por el agente');
    hechas = 1;
  }
  await cambiarBandeja((b) => {
    const it = b.items.find((x) => x.id === item.id);
    if (it) Object.assign(it, { estado: 'hecha', hechas, hechaEn: new Date(ahora).toISOString() });
  }, 'Bandeja: propuesta del agente hecha');
  return { hechas, restantes: 0 };
}
