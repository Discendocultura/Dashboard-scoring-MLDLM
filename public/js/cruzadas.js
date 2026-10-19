// Embudo de ventas cruzadas: a quien ya es alumno de un producto, venderle otro. En su configuración se eligen los
// productos del negocio con su etiqueta de GHL (la que lleva quien lo compra) y, si lo vende con otras etiquetas
// (ofertas, ediciones), también esas. Con eso se sabe qué tiene cada alumno y las closers / setters filtran por
// «tiene esto y no tiene aquello» para llamar con contexto.
// Lo usan el navegador (configuración y pestaña Alumnos) y el servidor (lib/config-store.js).
//   config.cruzadas[id] = { name, productos: [{ id, nombre, tag, otras: [{ tag }] }], notas }
// (las etiquetas van en campos «tag» para que /api/leads las reconozca como del embudo).
export const MAX_PRODUCTOS_X = 12;
export const MAX_OTRAS_X = 8;

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const limpio = (v, max) => str(v, max).replace(/[<>]/g, '');
const etiqueta = (v) => str(v, 100).toLowerCase();
const idValido = (v) => /^[a-z0-9-]{1,40}$/.test(String(v || ''));
export const nuevoIdX = () => `x-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function sanitizeProductoX(p) {
  const tag = etiqueta(p?.tag);
  const otras = [...new Set((Array.isArray(p?.otras) ? p.otras : []).map((o) => etiqueta(typeof o === 'string' ? o : o?.tag)).filter((t) => t && t !== tag))]
    .slice(0, MAX_OTRAS_X).map((t) => ({ tag: t }));
  return { id: idValido(p?.id) ? p.id : nuevoIdX(), nombre: limpio(p?.nombre, 60), tag, otras };
}

export function sanitizeCruzada(c) {
  const productos = (Array.isArray(c?.productos) ? c.productos : []).slice(0, MAX_PRODUCTOS_X).map(sanitizeProductoX)
    .filter((p) => p.nombre || p.tag || p.otras.length);
  const ids = new Set();
  for (const p of productos) { if (ids.has(p.id)) p.id = nuevoIdX(); ids.add(p.id); }
  return { name: limpio(c?.name, 60) || 'Ventas cruzadas', productos, notas: limpio(c?.notas, 1000) };
}

// Las etiquetas de un producto (la principal y las otras).
export const etiquetasX = (p) => [...new Set([p.tag, ...(p.otras || []).map((o) => o.tag)].filter(Boolean))];
// Los productos que cuentan (con nombre y al menos una etiqueta).
export const productosListos = (c) => (c?.productos || []).filter((p) => p.nombre && etiquetasX(p).length);

// Qué falta para que el embudo funcione (en la configuración y en la pestaña).
export function pendientesCruzada(c) {
  const out = [];
  const listos = productosListos(c);
  if (listos.length < 2) out.push('Añade al menos 2 productos con su etiqueta: así se ve quién tiene uno y no el otro.');
  for (const p of c?.productos || []) {
    if (!p.nombre) out.push('Hay un producto sin nombre.');
    else if (!etiquetasX(p).length) out.push(`«${p.nombre}» no tiene etiqueta de compra.`);
  }
  return out;
}

// De cada contacto (con sus etiquetas), los ids de los productos que tiene.
export function productosDe(contacto, productos) {
  const t = new Set((contacto?.tags || []).map((x) => String(x).toLowerCase()));
  return productos.filter((p) => etiquetasX(p).some((e) => t.has(e))).map((p) => p.id);
}

// Filtro: { [productoId]: 'si' | 'no' } (sin clave = da igual) y texto. `alumno.tiene` = ids de sus productos.
export function pasaFiltro(alumno, filtro = {}, texto = '') {
  for (const [id, v] of Object.entries(filtro)) {
    const lo = alumno.tiene.includes(id);
    if ((v === 'si' && !lo) || (v === 'no' && lo)) return false;
  }
  const q = String(texto || '').trim().toLowerCase();
  if (!q) return true;
  const digitos = q.replace(/\D/g, '');
  return [alumno.name, alumno.email].some((x) => String(x || '').toLowerCase().includes(q))
    || (digitos.length >= 4 && String(alumno.phone || '').replace(/\D/g, '').includes(digitos));
}

// Oportunidades: para cada par (A, B), cuántos tienen A y no B (a quién ofrecerle B). De más a menos.
export function oportunidades(alumnos, productos) {
  const out = [];
  for (const a of productos) {
    for (const b of productos) {
      if (a.id === b.id) continue;
      const n = alumnos.filter((x) => x.tiene.includes(a.id) && !x.tiene.includes(b.id)).length;
      if (n) out.push({ tiene: a.id, falta: b.id, n });
    }
  }
  return out.sort((x, y) => y.n - x.n);
}

// Tareas de partida del embudo (Plan → Tareas → «Crear tareas del embudo»).
export function tareasCruzada(c, { hoy } = {}) {
  const f = (n) => {
    if (!hoy) return '';
    const d = new Date(`${hoy}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const nombres = productosListos(c).map((p) => p.nombre);
  const T = [
    ['productos', 'preparacion', `Revisar que cada producto tiene su etiqueta de compra en GHL${nombres.length ? ` (${nombres.join(', ')})` : ''}`, 0, 'tecnico'],
    ['guion', 'preparacion', 'Preparar el guion de llamada de cada salto (qué tiene, qué le falta y por qué le encaja)', 1, 'admin'],
    ['lista', 'seguimiento', 'Elegir en Alumnos a quién llamar esta semana (filtro: tiene uno y no el otro)', 2, 'setter'],
    ['llamadas', 'seguimiento', 'Llamar y anotar el resultado de cada alumno en su ficha de GHL', 3, 'setter'],
    ['revision', 'optimizacion', 'Revisar cuántos han pasado al siguiente producto y ajustar el guion', 14, 'admin'],
  ];
  return T.map(([clave, fase, titulo, dias, rol]) => ({ clave: `cruzadas:${clave}`, fase, titulo, notas: '', fecha: f(dias), rol }));
}

// Guía de lo que hay que tener en GHL («＋ Nuevo embudo» y su ⚙️).
export function guiaCruzadas() {
  return [
    { titulo: '1 · Las etiquetas de compra en GHL', pasos: [
      'Cada producto tiene que poner una <strong>etiqueta</strong> a quien lo compra (en el workflow del pago), p. ej. <code>compra-reto</code>, <code>alumna-raices</code>.',
      'Si lo vendes con varias etiquetas (ofertas, ediciones, el mismo producto en otro embudo), apúntalas todas: cuentan como el mismo producto.',
    ] },
    { titulo: '2 · En AlquimIA', pasos: [
      'En la <strong>⚙️ Configuración</strong> del embudo elige los productos y su etiqueta (o tráelos de <em>Mi negocio → Productos</em>).',
      'En <strong>Alumnos</strong> verás a todos los que tienen alguno, qué tiene cada uno y qué le falta. Filtra por «tiene esto» y «no tiene esto» para saber a quién llamar y qué ofrecerle.',
    ] },
  ];
}
