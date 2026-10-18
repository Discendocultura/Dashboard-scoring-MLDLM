// Productos de cada cliente (Mi negocio → 📦 Productos): lo que vende, a qué precio y qué etiqueta de GHL lleva quien
// lo compra; y, si lo vende a otros precios, sus ofertas (cada una con su precio y su etiqueta). De aquí bebe la
// Inteligencia de negocio: cuánto factura cada producto y cada oferta, y qué compran después sus clientes.
// Lo usan el navegador (la ventana) y el servidor (handlers/productos.js y lib/negocio.js).
//   catálogo: { ivaPct, productos: [{ id, nombre, tipo, precio, iva, etiqueta, fechaCampo, embudos, siguiente,
//              ofertas: [{ id, nombre, precio, etiqueta }] }] }
// precio: el normal, sin descuentos (lo que paga, con o sin IVA según `iva`: 'incluido' | 'mas' | 'sin').
export const MAX_PRODUCTOS = 40;
export const MAX_OFERTAS = 12;
export const IVA_DEF = 21;
export const TIPOS_PRODUCTO = [
  { id: 'principal', ico: '⭐', nombre: 'Producto principal', texto: 'El que más quieres vender (p. ej. tu programa).' },
  { id: 'entrada', ico: '🚪', nombre: 'De entrada', texto: 'Barato, para que te conozcan (un reto, una guía, un taller).' },
  { id: 'continuidad', ico: '🔁', nombre: 'Para después', texto: 'Lo que compran tus clientes después (comunidad, nivel 2, mentoría).' },
  { id: 'otro', ico: '📦', nombre: 'Otro', texto: 'Cualquier otro producto o servicio.' },
];
export const MODOS_IVA = [
  { id: 'incluido', nombre: 'IVA incluido', texto: 'El precio que paga ya lleva el IVA' },
  { id: 'mas', nombre: '+ IVA', texto: 'Al precio se le suma el IVA' },
  { id: 'sin', nombre: 'Sin IVA', texto: 'No lleva IVA (p. ej. vendes fuera de España)' },
];

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const limpio = (v, max) => str(v, max).replace(/[<>]/g, '');
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0; };
const etiqueta = (v) => str(v, 100).toLowerCase();
const idValido = (v) => /^[a-z0-9-]{1,40}$/.test(String(v || ''));
export const nuevoId = (pre = 'p') => `${pre}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function sanitizeOferta(o) {
  return { id: idValido(o?.id) ? o.id : nuevoId('o'), nombre: limpio(o?.nombre, 60), precio: num(o?.precio), etiqueta: etiqueta(o?.etiqueta) };
}

export function sanitizeProducto(p) {
  const ofertas = (Array.isArray(p?.ofertas) ? p.ofertas : []).slice(0, MAX_OFERTAS).map(sanitizeOferta).filter((o) => o.nombre || o.precio || o.etiqueta);
  return {
    id: idValido(p?.id) ? p.id : nuevoId('p'),
    nombre: limpio(p?.nombre, 60),
    tipo: TIPOS_PRODUCTO.some((t) => t.id === p?.tipo) ? p.tipo : 'otro',
    precio: num(p?.precio),
    iva: MODOS_IVA.some((m) => m.id === p?.iva) ? p.iva : 'incluido',
    etiqueta: etiqueta(p?.etiqueta),
    fechaCampo: str(p?.fechaCampo, 80),
    embudos: [...new Set((Array.isArray(p?.embudos) ? p.embudos : []).map((x) => str(x, 40)).filter(Boolean))].slice(0, 20),
    siguiente: str(p?.siguiente, 40),
    ofertas,
  };
}

export function sanitizeCatalogo(c) {
  const productos = (Array.isArray(c?.productos) ? c.productos : []).slice(0, MAX_PRODUCTOS).map(sanitizeProducto).filter((p) => p.nombre);
  const ids = new Set(productos.map((p) => p.id));
  for (const p of productos) if (!ids.has(p.siguiente) || p.siguiente === p.id) p.siguiente = '';
  const iva = Number(c?.ivaPct);
  return { ivaPct: Number.isFinite(iva) && iva >= 0 && iva <= 50 ? iva : IVA_DEF, productos };
}

// Lo que se factura de verdad (sin IVA), que es lo que cuenta la Inteligencia de negocio.
export function sinIva(precio, iva, pct = IVA_DEF) {
  if (!precio) return 0;
  return iva === 'incluido' ? Math.round((precio / (1 + pct / 100)) * 100) / 100 : precio;
}

// Las etiquetas que dicen que alguien lo ha comprado (la del producto y las de sus ofertas).
export const etiquetasDe = (p) => [...new Set([p.etiqueta, ...p.ofertas.map((o) => o.etiqueta)].filter(Boolean))];

// Con qué precio lo compró alguien (por sus etiquetas): la oferta si tiene su etiqueta (si tiene varias, la más
// barata: es la que pagó), y si no el precio normal. → { oferta: id | '', importe } | null si no lo compró.
export function compraDe(tags, p, ivaPct = IVA_DEF) {
  const t = new Set((tags || []).map((x) => String(x).toLowerCase()));
  const ofertas = p.ofertas.filter((o) => o.etiqueta && t.has(o.etiqueta)).sort((a, b) => a.precio - b.precio);
  if (ofertas.length) return { oferta: ofertas[0].id, importe: sinIva(ofertas[0].precio || p.precio, p.iva, ivaPct) };
  if (p.etiqueta && t.has(p.etiqueta)) return { oferta: '', importe: sinIva(p.precio, p.iva, ivaPct) };
  return null;
}

// Qué le falta a un producto para que cuente bien (en la ventana se enseña al lado de cada uno).
export function faltasProducto(p) {
  const out = [];
  if (!p.precio) out.push('el precio');
  if (!p.etiqueta && !p.ofertas.some((o) => o.etiqueta)) out.push('la etiqueta de compra');
  for (const o of p.ofertas) if (!o.etiqueta) out.push(`la etiqueta de la oferta «${o.nombre || 'sin nombre'}»`);
  return out;
}
