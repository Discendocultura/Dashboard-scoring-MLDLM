// Embudo de ventas cruzadas: a quien ya es alumno de un producto, venderle otro. En su configuración se eligen los
// productos del negocio con su etiqueta de GHL (la que lleva quien lo compra) y, si lo vende con otras etiquetas
// (ofertas, ediciones), también esas. Con eso se sabe qué tiene cada alumno y las closers / setters filtran por
// «tiene esto y no tiene aquello» para llamar con contexto.
// Lo usan el navegador (configuración y pestaña Alumnos) y el servidor (lib/config-store.js).
//   config.cruzadas[id] = { name, productos: [{ id, nombre, tag, otras: [{ tag }], prioritario }], notas, ofertas,
//                           llamadas, llamadaUrl, llamadasPipeline, comerciales: [{ id, nombre, uid, pct }] }
// (las etiquetas van en campos «tag» para que /api/leads las reconozca como del embudo).
export const MAX_PRODUCTOS_X = 12;
export const MAX_OTRAS_X = 8;
export const MAX_OFERTAS_X = 20;
export const MAX_COMERCIALES_X = 10;

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const limpio = (v, max) => str(v, max).replace(/[<>]/g, '');
const etiqueta = (v) => str(v, 100).toLowerCase();
const idValido = (v) => /^[a-z0-9-]{1,40}$/.test(String(v || ''));
export const nuevoIdX = () => `x-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function sanitizeProductoX(p) {
  const tag = etiqueta(p?.tag);
  const otras = [...new Set((Array.isArray(p?.otras) ? p.otras : []).map((o) => etiqueta(typeof o === 'string' ? o : o?.tag)).filter((t) => t && t !== tag))]
    .slice(0, MAX_OTRAS_X).map((t) => ({ tag: t }));
  const tcId = String(p?.tcId ?? '').trim().slice(0, 40); // ID del producto en ThriveCart (opcional)
  return { id: idValido(p?.id) ? p.id : nuevoIdX(), nombre: limpio(p?.nombre, 60), tag, otras, prioritario: p?.prioritario === true, ...(tcId ? { tcId } : {}) };
}

// «Hoy» y «Llamadas»: el pipeline de GHL que se recomienda crear para las ventas cruzadas, con sus fases.
// Los nombres encajan con los que usa la pestaña Llamadas para mover a cada alumno al anotar el resultado.
export const PIPELINE_CRUZADAS = 'Ventas cruzadas';
export const ETAPAS_CRUZADAS = [
  { nombre: 'Por contactar', ico: '🆕', desc: 'Alumnos a los que toca escribir o llamar' },
  { nombre: 'Contactado', ico: '💬', desc: 'Ya le has escrito o llamado' },
  { nombre: 'Agenda llamada', ico: '📅', desc: 'Tiene una llamada reservada' },
  { nombre: 'No contesta 1', ico: '📵', desc: 'No cogió la llamada (1.º intento)' },
  { nombre: 'No contesta 2', ico: '📵', desc: 'Segundo intento sin respuesta' },
  { nombre: 'Seguimiento', ico: '🔁', desc: 'Le interesa pero aún no decide' },
  { nombre: 'Venta', ico: '✅', desc: 'Compró el siguiente producto' },
  { nombre: 'Perdido', ico: '❌', desc: 'No le interesa ahora' },
];
const urlHttps = (v) => { try { const u = new URL(str(v, 500)); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };

export function sanitizeCruzada(c) {
  const productos = (Array.isArray(c?.productos) ? c.productos : []).slice(0, MAX_PRODUCTOS_X).map(sanitizeProductoX)
    .filter((p) => p.nombre || p.tag || p.otras.length);
  const ids = new Set();
  for (const p of productos) { if (ids.has(p.id)) p.id = nuevoIdX(); ids.add(p.id); }
  // Un solo producto prioritario (si se marcan varios, cuenta el primero).
  let hayPrio = false;
  for (const p of productos) { if (p.prioritario && hayPrio) p.prioritario = false; hayPrio ||= p.prioritario; }
  // Comerciales que se reparten los alumnos (nombre, usuario de AlquimIA si lo tiene y % de alumnos).
  const cids = new Set();
  const comerciales = (Array.isArray(c?.comerciales) ? c.comerciales : []).slice(0, MAX_COMERCIALES_X).map((x) => ({
    id: idValido(x?.id) ? x.id : nuevoIdX(), nombre: limpio(x?.nombre, 60), uid: str(x?.uid, 60).replace(/[^\w-]/g, ''),
    pct: Math.max(0, Math.min(100, Math.round(Number(x?.pct) || 0))),
  })).filter((x) => x.nombre).map((x) => { if (cids.has(x.id)) x.id = nuevoIdX(); cids.add(x.id); return x; });
  // Ofertas por tipo de alumno: «si tiene X (y no tiene Y) → ofrécele Y, a este precio, con este mensaje».
  const pids = new Set(productos.map((p) => p.id));
  const ofertas = (Array.isArray(c?.ofertas) ? c.ofertas : []).slice(0, MAX_OFERTAS_X).map((o) => ({
    id: idValido(o?.id) ? o.id : nuevoIdX(), tiene: str(o?.tiene, 40), ofrece: str(o?.ofrece, 40),
    precio: limpio(o?.precio, 80), mensaje: limpio(o?.mensaje, 600),
  })).filter((o) => pids.has(o.tiene) && pids.has(o.ofrece) && o.tiene !== o.ofrece);
  return {
    name: limpio(c?.name, 60) || 'Ventas cruzadas', productos, notas: limpio(c?.notas, 1000), ofertas, comerciales,
    // Hoy (el pipeline) y Llamadas (el calendario de reservas de GHL): solo si se usan.
    llamadas: c?.llamadas === true, llamadaUrl: urlHttps(c?.llamadaUrl), llamadasPipeline: limpio(c?.llamadasPipeline, 80),
  };
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
      'En la <strong>⚙️ Configuración</strong> del embudo elige los productos y su etiqueta (o tráelos de <em>Configuración → Productos</em>).',
      'En <strong>Alumnos</strong> verás a todos los que tienen alguno, qué tiene cada uno y qué le falta. Filtra por «tiene esto» y «no tiene esto» para saber a quién llamar y qué ofrecerle.',
    ] },
  ];
}

// El producto prioritario (el que se recomienda antes que nada), o ''.
export const prioritarioDe = (c) => (c?.productos || []).find((p) => p.prioritario)?.id || '';

// La oferta que toca a un alumno. Si hay producto prioritario y no lo tiene, SIEMPRE ese (con su oferta configurada
// si la hay; si no, una sin precio ni mensaje marcada `prioritaria`). Si no, la primera (por orden) cuyo producto
// tiene y cuyo producto ofrecido aún no tiene.
export function ofertaPara(alumno, ofertas = [], prioritario = '') {
  if (prioritario && !alumno.tiene.includes(prioritario)) {
    return ofertas.find((o) => o.ofrece === prioritario && alumno.tiene.includes(o.tiene))
      || { id: 'prioritario', tiene: '', ofrece: prioritario, precio: '', mensaje: '', prioritaria: true };
  }
  return ofertas.find((o) => alumno.tiene.includes(o.tiene) && !alumno.tiene.includes(o.ofrece)) || null;
}

// Reparto de alumnos entre comerciales según su %: cada alumno va siempre al mismo comercial (sale de su id de
// contacto), sin guardar nada. Si se cambian los %, solo cambian de comercial los alumnos «de la frontera».
const hash = (txt) => { let h = 2166136261; for (const ch of String(txt)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
export function comercialDe(contactId, comerciales = []) {
  const total = comerciales.reduce((t, x) => t + (x.pct || 0), 0);
  if (!contactId || !total) return null;
  let punto = ((hash(contactId) % 10000) / 10000) * total;
  for (const x of comerciales) { if (punto < (x.pct || 0)) return x; punto -= x.pct || 0; }
  return comerciales.findLast((x) => x.pct) || null;
}
// Suma de los % (debe ser 100 para guardar).
export const totalReparto = (comerciales = []) => comerciales.reduce((t, x) => t + (Number(x.pct) || 0), 0);
// Repartir a partes iguales (los que sobran del redondeo, a los primeros): 3 → 34, 33, 33.
export function repartoIgual(n) {
  if (!n) return [];
  const base = Math.floor(100 / n);
  return Array.from({ length: n }, (_, i) => base + (i < 100 - base * n ? 1 : 0));
}

// Cuántos alumnos tienen 1, 2, 3… productos y todos: [{ n, alumnos, pct, todos }] (de 1 al total de productos).
export function porCantidad(alumnos, productos) {
  const con = alumnos.filter((a) => a.tiene.length);
  return productos.map((_, i) => {
    const n = i + 1;
    const k = con.filter((a) => a.tiene.length === n).length;
    return { n, alumnos: k, pct: con.length ? k / con.length : 0, todos: n === productos.length };
  });
}
// Ofertas propuestas a partir de las oportunidades más grandes (para empezar con un clic).
// Con producto prioritario, primero «de cada producto → al prioritario».
export function ofertasPropuestas(alumnos, productos, ya = [], prioritario = '') {
  const hay = new Set(ya.map((o) => `${o.tiene}|${o.ofrece}`));
  const usados = new Set(ya.map((o) => o.tiene));
  const out = [];
  const rutas = oportunidades(alumnos, productos);
  if (prioritario) rutas.sort((a, b) => (b.falta === prioritario) - (a.falta === prioritario));
  for (const r of rutas) {
    if (hay.has(`${r.tiene}|${r.falta}`) || usados.has(r.tiene)) continue;
    usados.add(r.tiene);
    out.push({ id: nuevoIdX(), tiene: r.tiene, ofrece: r.falta, precio: '', mensaje: '' });
  }
  return out;
}

// Combinaciones exactas de productos: qué % de alumnos tiene justo esos (p. ej. «Reto + Raíces», «solo Reto»).
// alumnos: [{ tiene: [ids] }] → [{ ids, n, pct }] de más a menos.
export function combinaciones(alumnos, productos, max = 8) {
  const m = new Map();
  for (const a of alumnos) {
    const k = productos.filter((p) => a.tiene.includes(p.id)).map((p) => p.id).join('+');
    if (k) m.set(k, (m.get(k) || 0) + 1);
  }
  const total = alumnos.filter((a) => a.tiene.length).length;
  return [...m].map(([k, n]) => ({ ids: k.split('+'), n, pct: total ? n / total : 0 })).sort((a, b) => b.n - a.n).slice(0, max);
}

// Tasa de paso entre productos: de quien tiene A, cuántos (y qué %) tienen ya B y cuántos aún no (la oportunidad).
// → [{ de, a, base, tienen, pct, faltan, pctFaltan }] ordenado por la oportunidad (los que faltan).
export function cruces(alumnos, productos) {
  const out = [];
  for (const a of productos) {
    const conA = alumnos.filter((x) => x.tiene.includes(a.id));
    if (!conA.length) continue;
    for (const b of productos) {
      if (a.id === b.id) continue;
      const tienen = conA.filter((x) => x.tiene.includes(b.id)).length;
      out.push({ de: a.id, a: b.id, base: conA.length, tienen, pct: tienen / conA.length, faltan: conA.length - tienen, pctFaltan: (conA.length - tienen) / conA.length });
    }
  }
  return out.sort((x, y) => y.faltan - x.faltan || y.base - x.base);
}
