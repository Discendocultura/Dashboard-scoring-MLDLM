// Tests A/B de páginas: cada visitante (id anónimo del navegador) cuenta una vez por prueba con la variante que vio,
// y una vez como conversión (se registró o compró) con esa misma variante. `clave`: «lanz:<código>» o «directa:<id>».
// Con D1, en la tabla ab_eventos; sin D1 (desarrollo local y pruebas), en memoria.
import { db, esquema } from './store.js';
import { clienteActual } from './cliente.js';

const mem = new Map();

// tipo: 'visita' | 'conversion'. La primera vez manda (recargar o volver no cambia la variante ni la fecha).
export async function marcarAb(clave, tipo, variante, visitante, contacto = '', ahora = Date.now()) {
  const d = db();
  if (!d) {
    const k = `${clienteActual().id}|${clave}|${tipo}|${visitante}`;
    if (!mem.has(k)) mem.set(k, { variante, contacto, en: ahora });
    return;
  }
  await esquema(d);
  await d.prepare('INSERT OR IGNORE INTO ab_eventos (cliente, clave, tipo, visitante, variante, contacto, en) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(clienteActual().id, clave, tipo, visitante, variante, contacto || null, ahora).run();
}

// Por variante: { a: { visitas, conversiones, contactos: [ids de quien convirtió], primera, ultima }, b: … }.
export async function resultadosAb(clave) {
  const out = {};
  const fila = (v) => (out[v] ||= { visitas: 0, conversiones: 0, contactos: [], primera: null, ultima: null });
  const anotar = (tipo, variante, contacto, en) => {
    const f = fila(variante);
    if (tipo === 'visita') {
      f.visitas++;
      f.primera = f.primera == null ? en : Math.min(f.primera, en);
      f.ultima = Math.max(f.ultima || 0, en);
    } else {
      f.conversiones++;
      if (contacto && f.contactos.length < 5000) f.contactos.push(contacto);
    }
  };
  const d = db();
  if (!d) {
    const pre = `${clienteActual().id}|${clave}|`;
    for (const [k, x] of mem) if (k.startsWith(pre)) anotar(k.slice(pre.length).split('|')[0], x.variante, x.contacto, x.en);
    return out;
  }
  await esquema(d);
  const { results: grupos } = await d.prepare('SELECT tipo, variante, COUNT(*) AS n, MIN(en) AS primera, MAX(en) AS ultima FROM ab_eventos WHERE cliente = ? AND clave = ? GROUP BY tipo, variante')
    .bind(clienteActual().id, clave).all();
  for (const g of grupos || []) {
    const f = fila(g.variante);
    if (g.tipo === 'visita') { f.visitas = Number(g.n) || 0; f.primera = g.primera; f.ultima = g.ultima; } else f.conversiones = Number(g.n) || 0;
  }
  const { results: conv } = await d.prepare("SELECT variante, contacto FROM ab_eventos WHERE cliente = ? AND clave = ? AND tipo = 'conversion' AND contacto IS NOT NULL LIMIT 20000")
    .bind(clienteActual().id, clave).all();
  for (const c of conv || []) fila(c.variante).contactos.push(c.contacto);
  return out;
}

// Empezar de cero (otra prueba en la misma página): borra lo apuntado de esa prueba.
export async function borrarAb(clave) {
  const d = db();
  if (!d) {
    const pre = `${clienteActual().id}|${clave}|`;
    for (const k of [...mem.keys()]) if (k.startsWith(pre)) mem.delete(k);
    return;
  }
  await esquema(d);
  await d.prepare('DELETE FROM ab_eventos WHERE cliente = ? AND clave = ?').bind(clienteActual().id, clave).run();
}
