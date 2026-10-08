// Inicio del cliente: la foto de todos sus embudos de un vistazo.
//   · Cifras de lo que está en marcha: el último lanzamiento de cada embudo, las VSL (últimos 30 días)
//     y los meteóricos recientes (abiertos, en calentamiento o cerrados hace menos de 30 días).
//   · Avisos del carrito, próximos hitos (14 días) y tareas vencidas de todos los embudos.
// Va en tres partes que el navegador pide a la vez (cada petición tiene su propio límite de peticiones a
// GHL en Cloudflare): «embudos» (el resumen del portal, cacheado 15 min), «meteoricos» y «agenda» (avisos
// del carrito, hitos y tareas vencidas). Cada parte se cachea 15 min por cliente.
import { getConfig } from './config-store.js';
import { cachePorCliente } from './cliente.js';
import { resumenParaCliente, todosLosLeads } from './resumen.js';
import { storeGetPrefijo, leerJSON } from './store.js';
import { inversionMeteorico } from './meteorico-inversion.js';
import { metricasMeteorico, faseMeteorico, hitosMeteorico } from '../public/js/meteorico.js';
import { hitosLanzamiento } from '../public/js/calendario.js';
import { vencida } from '../public/js/tareas.js';
import { alertasCarrito } from '../public/js/alertas.js';
import { dayInMadrid } from '../public/js/scoring.js';

const caches = { embudos: cachePorCliente(), meteoricos: cachePorCliente(), agenda: cachePorCliente() };
export const PARTES_INICIO = Object.keys(caches);
const DIA = 86_400_000;
const sumarDias = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
const MAX_METEOS = 4;

const lista = (txt) => {
  try { const v = JSON.parse(txt || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};

export async function inicioCliente({ parte = 'embudos', fresh = false } = {}) {
  const cache = caches[parte];
  if (!cache) throw Object.assign(new Error('Parte no válida'), { status: 400, publicMessage: 'Parte del inicio no válida' });
  const hit = cache.get();
  if (!fresh && hit && hit.at > Date.now() - 15 * 60_000) return hit.value;
  const value = await (parte === 'embudos' ? parteEmbudos(fresh) : parte === 'meteoricos' ? parteMeteoricos() : parteAgenda());
  cache.set({ at: Date.now(), value });
  return value;
}

async function parteEmbudos(fresh) {
  const resumen = await resumenParaCliente({ fresh });
  return { hoy: resumen.hoy, generado: new Date().toISOString(), embudos: resumen.embudos };
}

async function parteMeteoricos() {
  const config = await getConfig();
  const hoy = dayInMadrid(new Date().toISOString());

  // Meteóricos recientes (como mucho 4, los más recientes primero).
  const recientes = Object.entries(config.meteoricos || {})
    .filter(([, m]) => { const f = faseMeteorico(m).id; const cierre = String(m.cierre || '').slice(0, 10); return f !== 'preparacion' && (f !== 'cerrada' || (cierre && cierre >= sumarDias(hoy, -30))); })
    .sort((a, b) => String(b[1].apertura).localeCompare(String(a[1].apertura)))
    .slice(0, MAX_METEOS);
  const meteoricos = [];
  for (const [code, m] of recientes) {
    try {
      const [contactos, foto] = await Promise.all([
        m.compraTag ? todosLosLeads(m.compraTag, [m.compraDateField].filter(Boolean)) : [],
        leerJSON(`lsd_meteo_previo_${code}`, () => null),
      ]);
      const { inversion } = await inversionMeteorico(m, code);
      const r = metricasMeteorico(contactos, m, { previo: foto ? new Set(foto.ids) : null, inversion });
      meteoricos.push({ code, nombre: m.name, fase: faseMeteorico(m).id, embudo: m.embudo || '', lanzamiento: m.lanzamiento || '', ventas: r.ventas, facturacion: r.facturacion, inversion: r.inversion, roas: r.roas, objetivos: r.objetivos });
    } catch (e) {
      meteoricos.push({ code, nombre: m.name, error: String(e.publicMessage || e.message).slice(0, 200) });
    }
  }
  return { meteoricos };
}

// Avisos del carrito, próximos hitos y tareas vencidas. Las ventas del carrito salen del resumen de
// embudos (cacheado): si aún no está calculado, los avisos de ritmo esperan a la siguiente carga.
async function parteAgenda() {
  const config = await getConfig();
  const hoy = dayInMadrid(new Date().toISOString());
  const resumen = caches.embudos.get()?.value || { embudos: [] };

  // Avisos del carrito de los lanzamientos con el carrito abierto (con sus ventas del resumen).
  const alertas = [];
  for (const e of resumen.embudos.filter((x) => x.tipo === 'lanzamiento' && x.estado === 'carrito')) {
    for (const a of alertasCarrito(config.launches[e.code], e.kpis.ventas)) alertas.push({ ...a, embudo: e.embudoId, code: e.code, nombre: e.nombre });
  }

  // Próximos hitos (14 días) de todos los embudos.
  const hasta = sumarDias(hoy, 14);
  const hitos = [
    ...Object.entries(config.launches).flatMap(([code, l]) => hitosLanzamiento(l).map((h) => ({ ...h, code, nombre: l.name }))),
    ...Object.entries(config.meteoricos || {}).flatMap(([code, m]) => hitosMeteorico(m).map((h) => ({ ...h, code, nombre: m.name }))),
  ].filter((h) => h.day >= hoy && h.day <= hasta)
    .sort((a, b) => `${a.day}${a.time || ''}`.localeCompare(`${b.day}${b.time || ''}`))
    .slice(0, 12)
    .map((h) => ({ code: h.code, nombre: h.nombre, titulo: h.titulo, icon: h.icon || '', dia: h.day, hora: h.time || '' }));

  // Tareas vencidas de todos los embudos.
  const tareas = await storeGetPrefijo('lsd_tareas_');
  const codigos = [...Object.keys(config.launches), ...Object.keys(config.vsls || {}), ...Object.keys(config.meteoricos || {})];
  const nombreDe = (c) => config.launches[c]?.name || config.vsls?.[c]?.name || config.meteoricos?.[c]?.name || c;
  const vencidas = codigos.flatMap((c) => lista(tareas[`lsd_tareas_${c}`]).filter((t) => vencida(t, hoy)).map((t) => ({ code: c, nombre: nombreDe(c), titulo: t.titulo, fecha: t.fecha, id: t.id })))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  return { alertas, hitos, vencidas: { total: vencidas.length, lista: vencidas.slice(0, 12) } };
}

