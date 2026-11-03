// Cerebro de lanzamientos (servidor): la referencia de la agencia con los resultados de los lanzamientos cerrados de
// TODOS los clientes (solo medianas y cuartiles, nunca datos de un cliente concreto; con 3 lanzamientos como mínimo)
// y los ratios del lanzamiento en marcha. La referencia se guarda 12 h (una lectura de la configuración por cliente).
import { listClientes } from './clientes.js';
import { runCliente, enPrincipal } from './cliente.js';
import { getConfig } from './config-store.js';
import { countByTag } from './ghl.js';
import { leerCompartida, guardarCompartida } from './store.js';
import { tagFor } from '../public/js/scoring.js';
import { referencia, ratiosDeResultados } from '../public/js/cerebro.js';

const CLAVE = 'cerebro|referencia';
const TTL = 12 * 3_600_000;

// Los resultados guardados de los lanzamientos (los calcula el navegador al abrir el planificador o la comparativa).
export const resultadosDe = (config) => Object.values(config.launches || {}).filter((l) => l.resultados?.registros)
  .map((l) => ratiosDeResultados({ ...l.resultados, formato: l.formato || 'webinar' }));

export async function referenciaAgencia({ fresh = false } = {}) {
  return enPrincipal(async () => {
    if (!fresh) { const g = await leerCompartida(CLAVE, TTL).catch(() => null); if (g) return g; }
    const todos = [];
    for (const c of await listClientes({ fresh: true }).catch(() => [])) {
      if (c.ejemplo) continue;
      try { todos.push(...resultadosDe(await runCliente(c, () => getConfig()))); } catch { /* cliente sin configuración */ }
    }
    const ref = { ...referencia(todos), en: new Date().toISOString() };
    await guardarCompartida(CLAVE, ref).catch(() => {});
    return ref;
  });
}

// Ratios del lanzamiento en marcha con lo que se puede contar por etiquetas (4 llamadas a GHL).
export async function ratiosActuales(code, l, { registros, ventas, inversion }) {
  if (!registros) return {};
  const contar = (t) => (t ? countByTag(t).catch(() => null) : Promise.resolve(null));
  const [vipT, vipP, asistio, final] = await Promise.all([
    contar(l.vipTag), contar(l.vipTag ? tagFor(code, 'vip_previo') : ''), contar(tagFor(code, 'directo_asistio')), contar(tagFor(code, 'directo_final')),
  ]);
  const hoy = new Date().toISOString().slice(0, 10);
  const tras = (d) => d && String(d).slice(0, 10) < hoy;
  return {
    cpl: inversion ? inversion / registros : null,
    convVip: l.vipTag && vipT != null ? Math.max(0, vipT - (vipP || 0)) / registros : null,
    // Un 0 justo después del directo suele ser que aún no se ha sincronizado Zoom (o no hay ventas aún): «aún no».
    convDirecto: tras(l.fechaDirecto) && asistio ? asistio / registros : null,
    convFinal: tras(l.fechaDirecto) && final ? final / registros : null,
    convVenta: tras(l.aperturaCarrito || l.fechaDirecto) && ventas ? ventas / registros : null,
  };
}
