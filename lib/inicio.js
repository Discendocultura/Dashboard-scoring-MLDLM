// Inicio del cliente: la foto de todos sus embudos de un vistazo.
//   · lista: qué embudos y qué meteóricos recientes hay (sin pedir nada a GHL).
//   · embudo: las cifras de un embudo (el último lanzamiento empezado o la VSL de los últimos 30 días),
//     las mismas que el portal del cliente (cacheadas 15 min).
//   · meteorico: las cifras de un meteórico reciente (abierto, en calentamiento o cerrado hace < 30 días).
//   · agenda: próximos hitos (14 días) y tareas vencidas de todos los embudos.
// El navegador pide cada embudo y cada meteórico por separado: cada petición tiene su propio límite de
// peticiones a GHL en Cloudflare (50 en el plan gratuito) y un embudo con muchos leads no tumba a los demás.
// Los avisos del carrito los calcula el navegador con las ventas de cada embudo.
import { getConfig } from './config-store.js';
import { cachePorCliente } from './cliente.js';
import { resumenEmbudo, todosLosLeads } from './resumen.js';
import { storeGetPrefijo, leerJSON } from './store.js';
import { inversionMeteorico } from './meteorico-inversion.js';
import { metricasMeteorico, faseMeteorico, hitosMeteorico } from '../public/js/meteorico.js';
import { hitosLanzamiento } from '../public/js/calendario.js';
import { vencida } from '../public/js/tareas.js';
import { dayInMadrid } from '../public/js/scoring.js';

const DIA = 86_400_000;
const CADUCA = 15 * 60_000;
const sumarDias = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
const MAX_METEOS = 4;
export const PARTES_INICIO = ['lista', 'embudo', 'meteorico', 'agenda'];
const cacheMeteo = cachePorCliente();
const cacheAgenda = cachePorCliente();
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });

const lista = (txt) => {
  try { const v = JSON.parse(txt || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};

function meteoricosRecientes(config, hoy) {
  return Object.entries(config.meteoricos || {})
    .filter(([, m]) => { const f = faseMeteorico(m).id; const cierre = String(m.cierre || '').slice(0, 10); return f !== 'preparacion' && (f !== 'cerrada' || (cierre && cierre >= sumarDias(hoy, -30))); })
    .sort((a, b) => String(b[1].apertura).localeCompare(String(a[1].apertura)))
    .slice(0, MAX_METEOS);
}

export async function inicioCliente({ parte = 'lista', id = '', fresh = false } = {}) {
  const config = await getConfig();
  const hoy = dayInMadrid(new Date().toISOString());
  if (parte === 'lista') {
    return {
      hoy,
      embudos: config.embudos.filter((e) => e.tipo === 'lanzamientos' || (e.tipo === 'vsl' && config.vsls?.[e.id])).map((e) => ({ id: e.id, tipo: e.tipo, nombre: e.nombre })),
      meteoricos: meteoricosRecientes(config, hoy).map(([code, m]) => ({ code, nombre: m.name })),
    };
  }
  if (parte === 'embudo') {
    if (!config.embudos.some((e) => e.id === id)) throw bad('Embudo no encontrado', 404);
    return { embudo: await resumenEmbudo({ embudo: id, fresh }) };
  }
  if (parte === 'meteorico') return { meteorico: await meteoricoInicio(config, id, fresh) };
  if (parte === 'agenda') return agenda(config, hoy, fresh);
  throw bad('Parte del inicio no válida');
}

async function meteoricoInicio(config, code, fresh) {
  const m = Object.hasOwn(config.meteoricos || {}, code) ? config.meteoricos[code] : null;
  if (!m) throw bad('Meteórico no encontrado', 404);
  const todo = cacheMeteo.get() || {};
  if (!fresh && todo[code] && todo[code].at > Date.now() - CADUCA) return todo[code].value;
  const [contactos, foto, { inversion }] = await Promise.all([
    m.compraTag ? todosLosLeads(m.compraTag, [m.compraDateField].filter(Boolean)) : [],
    leerJSON(`lsd_meteo_previo_${code}`, () => null),
    inversionMeteorico(m, code),
  ]);
  const r = metricasMeteorico(contactos, m, { previo: foto ? new Set(foto.ids) : null, inversion });
  const value = { code, nombre: m.name, fase: faseMeteorico(m).id, embudo: m.embudo || '', lanzamiento: m.lanzamiento || '', ventas: r.ventas, facturacion: r.facturacion, inversion: r.inversion, roas: r.roas, objetivos: r.objetivos };
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
  const codigos = [...Object.keys(config.launches), ...Object.keys(config.vsls || {}), ...Object.keys(config.meteoricos || {})];
  const nombreDe = (c) => config.launches[c]?.name || config.vsls?.[c]?.name || config.meteoricos?.[c]?.name || c;
  const vencidas = codigos.flatMap((c) => lista(tareas[`lsd_tareas_${c}`]).filter((t) => vencida(t, hoy)).map((t) => ({ code: c, nombre: nombreDe(c), titulo: t.titulo, fecha: t.fecha, id: t.id })))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const value = { hitos, vencidas: { total: vencidas.length, lista: vencidas.slice(0, 12) } };
  cacheAgenda.set({ at: Date.now(), value });
  return value;
}
