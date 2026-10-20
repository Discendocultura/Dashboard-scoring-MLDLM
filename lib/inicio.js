// Inicio del cliente: la foto de todos sus embudos de un vistazo.
//   · lista: qué embudos y qué meteóricos recientes hay (sin pedir nada a GHL).
//   · embudo: las cifras de un embudo (el último lanzamiento empezado o la VSL de los últimos 30 días),
//     las mismas que el portal del cliente (cacheadas 15 min).
//   · meteorico: las cifras de un meteórico reciente (abierto, en calentamiento o cerrado hace < 30 días).
//   · agenda: próximos hitos (14 días) y tareas vencidas de todos los embudos.
// El navegador pide cada embudo y cada meteórico por separado: cada petición tiene su propio límite de
// peticiones a GHL en Cloudflare (50 en el plan gratuito) y un embudo con muchos leads no tumba a los demás.
// Los avisos del carrito los calcula el navegador con las ventas de cada embudo.
import { configDeEmbudos, puedeVerCodigo } from './embudos.js';
import { getConfig } from './config-store.js';
import { cachePorCliente } from './cliente.js';
import { resumenEmbudo, todosLosLeads } from './resumen.js';
import { storeGetPrefijo, leerJSON, cacheCompartida } from './store.js';
import { inversionMeteorico } from './meteorico-inversion.js';
import { metricasMeteorico, faseMeteorico, hitosMeteorico } from '../public/js/meteorico.js';
import { hitosLanzamiento } from '../public/js/calendario.js';
import { vencida } from '../public/js/tareas.js';
import { dayInMadrid } from '../public/js/scoring.js';
import { rangoDe } from '../public/js/embudo-vsl.js';
import { avisosTodosLosEmbudos } from './publicidad.js';

const DIA = 86_400_000;
const CADUCA = 15 * 60_000;
const sumarDias = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
const MAX_METEOS = 4;
export const PARTES_INICIO = ['lista', 'embudo', 'meteorico', 'agenda', 'anuncios', 'previo'];
const cacheMeteo = cachePorCliente();
const cacheAgenda = cachePorCliente();
// Al cambiar una tarea (completarla desde el Inicio, p. ej.), la agenda se vuelve a leer.
export const olvidarAgenda = () => cacheAgenda.set(null);
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });

const lista = (txt) => {
  try { const v = JSON.parse(txt || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};

// Sin periodo: los abiertos, en calentamiento o cerrados hace menos de 30 días. Con periodo: los que
// estuvieron abiertos algún día del periodo (y, si llega a hoy, los que están en calentamiento).
function meteoricosRecientes(config, hoy, rango = null) {
  return Object.entries(config.meteoricos || {})
    .filter(([, m]) => {
      const f = faseMeteorico(m).id;
      const apertura = String(m.apertura || '').slice(0, 10);
      const cierre = String(m.cierre || '').slice(0, 10);
      if (rango) return (f === 'calentamiento' && rango.hasta >= hoy) || (apertura && apertura <= rango.hasta && (!cierre || cierre >= rango.desde));
      return f !== 'preparacion' && (f !== 'cerrada' || (cierre && cierre >= sumarDias(hoy, -30)));
    })
    .sort((a, b) => String(b[1].apertura).localeCompare(String(a[1].apertura)))
    .slice(0, MAX_METEOS);
}

// Periodo del Inicio (mismo selector que Métricas). Sin periodo o «30d»: como siempre.
const PERIODOS_INICIO = ['hoy', '30d', '90d', 'mes-actual', 'mes-pasado', 'personalizado'];
const esDia = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');

// `embudos`: los asignados a quien lo pide (null = todos). Lo calculado y guardado en caché es de todos; se filtra al final.
export async function inicioCliente({ parte = 'lista', id = '', fresh = false, periodo = '30d', desde = '', hasta = '', embudos = null } = {}) {
  const completa = await getConfig();
  const config = configDeEmbudos(completa, embudos);
  const hoy = dayInMadrid(new Date().toISOString());
  const p = PERIODOS_INICIO.includes(periodo) && (periodo !== 'personalizado' || (esDia(desde) && esDia(hasta))) ? periodo : '30d';
  const rango = rangoDe({ preset: p, desde, hasta }, hoy);
  if (parte === 'lista') {
    return {
      hoy,
      embudos: config.embudos.filter((e) => e.tipo === 'lanzamientos' || (e.tipo === 'vsl' && config.vsls?.[e.id]) || (e.tipo === 'directa' && config.directas?.[e.id])).map((e) => ({ id: e.id, tipo: e.tipo, nombre: e.nombre })),
      periodo: p, rango,
      meteoricos: meteoricosRecientes(config, hoy, p === '30d' ? null : rango).map(([code, m]) => ({ code, nombre: m.name })),
    };
  }
  if (parte === 'embudo') {
    if (!config.embudos.some((e) => e.id === id)) throw bad('Embudo no encontrado', 404);
    return { embudo: await resumenEmbudo({ embudo: id, fresh, periodo: p, desde: rango.desde, hasta: rango.hasta }) };
  }
  if (parte === 'meteorico') return { meteorico: await meteoricoInicio(config, id, fresh) };
  if (parte === 'previo') return { previo: await previoInicio(config, id, hoy, rango) };
  if (parte === 'agenda') {
    const a = await agenda(completa, hoy, fresh);
    if (!embudos) return a;
    const ok = (x) => puedeVerCodigo(completa, x.code, embudos);
    const vencidas = a.vencidas.lista.filter(ok);
    return { ...a, hitos: a.hitos.filter(ok), vencidas: { total: vencidas.length, lista: vencidas }, deHoy: (a.deHoy || []).filter(ok), proximas: { ...a.proximas, lista: a.proximas.lista.filter(ok) }, enMarcha: { ...a.enMarcha, lista: a.enMarcha.lista.filter(ok) } };
  }
  if (parte === 'anuncios') {
    const r = await avisosTodosLosEmbudos(completa, { fresh });
    return { anuncios: embudos ? { ...r, embudos: (r.embudos || []).filter((x) => embudos.includes(x.embudo)) } : r };
  }
  throw bad('Parte del inicio no válida');
}

// Con qué comparar cada embudo (el ▲▼ de las cifras del Inicio):
//   · VSL y venta directa: los mismos días justo antes del periodo (otro cálculo, guardado 15 min como el actual).
//   · Lanzamiento: el lanzamiento anterior del mismo embudo; meteórico (id «m:<código>»): el anterior del mismo sitio.
//     Salen de las fotos de Inteligencia de negocio (sin pedir nada a GHL); si aún no hay foto, sin comparación.
// → { facturacion, ventas, inversion, registros, de } o null.
const fotoNegocio = (id) => leerJSON(`lsd_negocio_${id.replace(/[^a-z0-9_-]/gi, '_')}`, () => null);
const cifrasFoto = (f, de) => (f && Number.isFinite(f.facturacion) ? { facturacion: f.facturacion, ventas: f.ventas || 0, inversion: f.inversion ?? null, registros: f.registros || 0, de } : null);
async function previoInicio(config, id, hoy, rango) {
  if (id.startsWith('m:')) {
    const code = id.slice(2);
    const m = Object.hasOwn(config.meteoricos || {}, code) ? config.meteoricos[code] : null;
    if (!m) throw bad('Meteórico no encontrado', 404);
    const ap = String(m.apertura || '');
    const prev = Object.entries(config.meteoricos).filter(([c, x]) => c !== code && (x.embudo || x.lanzamiento || '') === (m.embudo || m.lanzamiento || '') && String(x.apertura || '') < ap)
      .sort((a, b) => String(b[1].apertura).localeCompare(String(a[1].apertura)))[0];
    return prev ? cifrasFoto(await fotoNegocio(`m-${prev[0]}`), prev[1].name || prev[0]) : null;
  }
  const e = config.embudos.find((x) => x.id === id);
  if (!e) throw bad('Embudo no encontrado', 404);
  if (e.tipo === 'lanzamientos') {
    const lanz = Object.entries(config.launches).filter(([, l]) => (l.embudo || config.embudos.find((x) => x.tipo === 'lanzamientos')?.id) === e.id && l.inicioCaptacion && l.inicioCaptacion <= hoy)
      .sort((a, b) => b[1].inicioCaptacion.localeCompare(a[1].inicioCaptacion));
    const i = lanz.findIndex(([, l]) => l.inicioCaptacion <= rango.hasta);
    const prev = i >= 0 ? lanz[i + 1] : null;
    return prev ? cifrasFoto(await fotoNegocio(`l-${prev[0]}`), prev[1].name || prev[0]) : null;
  }
  const dias = Math.round((Date.parse(`${rango.hasta}T12:00:00Z`) - Date.parse(`${rango.desde}T12:00:00Z`)) / DIA) + 1;
  const hasta = sumarDias(rango.desde, -1);
  const r = await resumenEmbudo({ embudo: id, periodo: 'personalizado', desde: sumarDias(hasta, -(dias - 1)), hasta });
  return r?.kpis ? { facturacion: r.kpis.facturacion || 0, ventas: r.kpis.ventas || 0, inversion: r.kpis.inversion ?? null, registros: r.kpis.registros || 0, de: `${dias} días anteriores` } : null;
}

async function meteoricoInicio(config, code, fresh) {
  const m = Object.hasOwn(config.meteoricos || {}, code) ? config.meteoricos[code] : null;
  if (!m) throw bad('Meteórico no encontrado', 404);
  const todo = cacheMeteo.get() || {};
  if (!fresh && todo[code] && todo[code].at > Date.now() - CADUCA) return todo[code].value;
  const value = await cacheCompartida(`inicio-meteo|${code}`, CADUCA, async () => {
    const [contactos, foto, { inversion }] = await Promise.all([
      m.compraTag ? todosLosLeads(m.compraTag, [m.compraDateField].filter(Boolean)) : [],
      leerJSON(`lsd_meteo_previo_${code}`, () => null),
      inversionMeteorico(m, code),
    ]);
    const r = metricasMeteorico(contactos, m, { previo: foto ? new Set(foto.ids) : null, inversion });
    return { calculadoEn: Date.now(), code, nombre: m.name, fase: faseMeteorico(m).id, embudo: m.embudo || '', lanzamiento: m.lanzamiento || '', ventas: r.ventas, facturacion: r.facturacion, inversion: r.inversion, roas: r.roas, objetivos: r.objetivos };
  }, { fresh });
  cacheMeteo.set({ ...todo, [code]: { at: Date.now(), value } }); // solo se guarda si ha ido bien
  return value;
}

// Próximos hitos (14 días) y tareas vencidas de todos los embudos (dos consultas a D1).
async function agenda(config, hoy, fresh) {
  const hit = cacheAgenda.get();
  if (!fresh && hit && hit.at > Date.now() - CADUCA) return hit.value;
  const hasta = sumarDias(hoy, 14);
  const hitos = [
    ...Object.entries(config.launches).flatMap(([code, l]) => hitosLanzamiento(l).filter((h) => !h.suave).map((h) => ({ ...h, code, nombre: l.name }))),
    ...Object.entries(config.meteoricos || {}).flatMap(([code, m]) => hitosMeteorico(m).map((h) => ({ ...h, code, nombre: m.name }))),
  ].filter((h) => h.day >= hoy && h.day <= hasta)
    .sort((a, b) => `${a.day}${a.time || ''}`.localeCompare(`${b.day}${b.time || ''}`))
    .slice(0, 12)
    .map((h) => ({ code: h.code, nombre: h.nombre, titulo: h.titulo, icon: h.icon || '', dia: h.day, hora: h.time || '' }));
  const tareas = await storeGetPrefijo('lsd_tareas_');
  const codigos = [...Object.keys(config.launches), ...Object.keys(config.vsls || {}), ...Object.keys(config.meteoricos || {}), ...Object.keys(config.directas || {}), ...Object.keys(config.cruzadas || {})];
  const nombreDe = (c) => config.launches[c]?.name || config.vsls?.[c]?.name || config.meteoricos?.[c]?.name || config.directas?.[c]?.name || config.cruzadas?.[c]?.name || c;
  const todas = codigos.flatMap((c) => lista(tareas[`lsd_tareas_${c}`]).filter((t) => t?.id && !t.hecha).map((t) => ({ t, code: c })));
  const corta = ({ t, code }) => ({ code, nombre: nombreDe(code), titulo: t.titulo, fecha: t.fecha || '', id: t.id, fase: t.fase || '', ...(t.asignado ? { asignado: t.asignado } : {}), ...(t.bloqueo ? { bloqueo: String(t.bloqueo).slice(0, 120) } : {}) });
  const porFecha = (a, b) => (a.fecha || '9').localeCompare(b.fecha || '9');
  const vencidas = todas.filter(({ t }) => vencida(t, hoy)).map(corta).sort(porFecha);
  // Lo que toca esta semana (hoy y los 7 días siguientes) y lo que está en marcha: para revisar o bloqueado.
  const semana = sumarDias(hoy, 7);
  const proximas = todas.filter(({ t }) => t.fecha && t.fecha >= hoy && t.fecha <= semana).map(corta).sort(porFecha);
  const enMarcha = todas.filter(({ t }) => t.estado === 'revision' || t.bloqueo).map((x) => ({ ...corta(x), estado: x.t.bloqueo ? 'bloqueada' : 'revision' })).sort(porFecha);
  // «Tus tareas de hoy» (Inicio): las vencidas y las de hoy, con a quién van (cada persona ve las suyas), y
  // cuántas pendientes tiene cada persona o rol en total (para «Ver las N →»).
  const deHoy = todas.filter(({ t }) => t.fecha && t.fecha <= hoy).map(corta).sort(porFecha).slice(0, 200);
  const pendientesPor = {};
  for (const { t } of todas) { const quien = t.asignado?.tipo === 'rol' ? t.asignado.rol : t.asignado?.id; const k = t.asignado?.tipo && quien ? `${t.asignado.tipo}:${quien}` : 'nadie'; pendientesPor[k] = (pendientesPor[k] || 0) + 1; }
  const value = { hitos, vencidas: { total: vencidas.length, lista: vencidas.slice(0, 12) }, proximas: { total: proximas.length, lista: proximas.slice(0, 8) },
    enMarcha: { total: enMarcha.length, lista: enMarcha.slice(0, 6) }, pendientes: todas.length, deHoy, pendientesPor, calculadoEn: Date.now() };
  cacheAgenda.set({ at: Date.now(), value });
  return value;
}
