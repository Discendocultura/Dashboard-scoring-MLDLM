// Productos de cada cliente (Configuración → 📦 Productos): lo que vende, a qué precio y qué etiqueta de GHL lleva quien
// lo compra; y, si lo vende a otros precios, sus ofertas (cada una con su precio y su etiqueta). De aquí bebe la
// Inteligencia de negocio: cuánto factura cada producto y cada oferta, y qué compran después sus clientes.
// Lo usan el navegador (la ventana) y el servidor (handlers/productos.js y lib/negocio.js).
//   catálogo: { ivaPct, productos: [{ id, nombre, tipo, cobro, precio, iva, etiqueta, fechaCampo, embudos, siguiente,
//              ofertas: [{ id, nombre, precio, etiqueta }], planes }] }
// precio: el normal, sin descuentos (lo que paga, con o sin IVA según `iva`: 'incluido' | 'mas' | 'sin').
// cobro: 'unico' (un pago) | 'recurrente' (membresía). Una membresía tiene hasta 3 planes (tiers, p. ej. Básico, Pro
//   y VIP) y cada plan, su precio y su etiqueta de GHL en cada periodo que se use (mensual, trimestral, semestral,
//   anual): planes: [{ id, nombre, precios: { mes|trimestre|semestre|anio: { precio, etiqueta } } }]. Su `precio`
//   es el primero que haya (para las cifras de siempre). Cada alta cuenta como un cobro de su periodo.
export const MAX_PRODUCTOS = 40;
export const MAX_OFERTAS = 12;
export const MAX_PLANES = 3;
export const PERIODOS = [
  { id: 'mes', nombre: 'Mensual', corto: '/mes', meses: 1 },
  { id: 'trimestre', nombre: 'Trimestral', corto: '/trimestre', meses: 3 },
  { id: 'semestre', nombre: 'Semestral', corto: '/semestre', meses: 6 },
  { id: 'anio', nombre: 'Anual', corto: '/año', meses: 12 },
];
export const MODOS_COBRO = [
  { id: 'unico', ico: '💳', nombre: 'Pago único', texto: 'Se paga una vez (aunque sea a plazos)' },
  { id: 'recurrente', ico: '🔁', nombre: 'Recurrente (membresía)', texto: 'Se paga cada mes, trimestre, semestre o año, con hasta 3 planes' },
];
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

export function sanitizePlan(pl) {
  const precios = {};
  for (const per of PERIODOS) {
    const x = pl?.precios?.[per.id];
    const precio = num(x?.precio);
    const tag = etiqueta(x?.etiqueta);
    if (precio || tag) precios[per.id] = { precio, etiqueta: tag };
  }
  return { id: idValido(pl?.id) ? pl.id : nuevoId('pl'), nombre: limpio(pl?.nombre, 40), precios };
}

export function sanitizeProducto(p) {
  const ofertas = (Array.isArray(p?.ofertas) ? p.ofertas : []).slice(0, MAX_OFERTAS).map(sanitizeOferta).filter((o) => o.nombre || o.precio || o.etiqueta);
  const cobro = p?.cobro === 'recurrente' ? 'recurrente' : 'unico';
  const planes = cobro === 'recurrente'
    ? (Array.isArray(p?.planes) ? p.planes : []).slice(0, MAX_PLANES).map(sanitizePlan).filter((pl) => pl.nombre || Object.keys(pl.precios).length)
    : [];
  // Una membresía: su precio «normal» es el primero que haya (mensual del primer plan, si lo tiene).
  const primero = planes.flatMap((pl) => PERIODOS.map((per) => pl.precios[per.id]?.precio || 0)).find(Boolean) || 0;
  return {
    id: idValido(p?.id) ? p.id : nuevoId('p'),
    nombre: limpio(p?.nombre, 60),
    tipo: TIPOS_PRODUCTO.some((t) => t.id === p?.tipo) ? p.tipo : 'otro',
    cobro,
    precio: cobro === 'recurrente' ? primero : num(p?.precio),
    iva: MODOS_IVA.some((m) => m.id === p?.iva) ? p.iva : 'incluido',
    etiqueta: etiqueta(p?.etiqueta),
    fechaCampo: str(p?.fechaCampo, 80),
    embudos: [...new Set((Array.isArray(p?.embudos) ? p.embudos : []).map((x) => str(x, 40)).filter(Boolean))].slice(0, 20),
    siguiente: str(p?.siguiente, 40),
    ofertas,
    planes,
  };
}

// Cada forma de comprarlo con su precio y su etiqueta: las ofertas y, en una membresía, cada plan en cada periodo
// (id «plan.periodo», p. ej. «pl-x.anio»). Es lo que la Inteligencia de negocio cuenta como «a qué precio se vendió».
export function variantesDe(p) {
  const planes = (p.planes || []).flatMap((pl) => PERIODOS.filter((per) => pl.precios?.[per.id]).map((per) => ({
    id: `${pl.id}.${per.id}`, nombre: `${pl.nombre || 'Plan'} · ${per.nombre.toLowerCase()}`, precio: pl.precios[per.id].precio,
    etiqueta: pl.precios[per.id].etiqueta, plan: pl.id, periodo: per.id,
  })));
  return [...planes, ...(p.ofertas || [])];
}
// Lo que equivale al mes (para comparar planes): 300 € al año → 25 €/mes.
export const alMes = (precio, periodo) => (precio ? Math.round((precio / (PERIODOS.find((x) => x.id === periodo)?.meses || 1)) * 100) / 100 : 0);

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
export const etiquetasDe = (p) => [...new Set([p.etiqueta, ...variantesDe(p).map((o) => o.etiqueta)].filter(Boolean))];

// Con qué precio lo compró alguien (por sus etiquetas): la oferta si tiene su etiqueta (si tiene varias, la más
// barata: es la que pagó), y si no el precio normal. → { oferta: id | '', importe } | null si no lo compró.
export function compraDe(tags, p, ivaPct = IVA_DEF) {
  const t = new Set((tags || []).map((x) => String(x).toLowerCase()));
  const ofertas = variantesDe(p).filter((o) => o.etiqueta && t.has(o.etiqueta)).sort((a, b) => a.precio - b.precio);
  if (ofertas.length) return { oferta: ofertas[0].id, importe: sinIva(ofertas[0].precio || p.precio, p.iva, ivaPct) };
  if (p.etiqueta && t.has(p.etiqueta)) return { oferta: '', importe: sinIva(p.precio, p.iva, ivaPct) };
  return null;
}

// Qué le falta a un producto para que cuente bien (en la ventana se enseña al lado de cada uno).
export function faltasProducto(p) {
  const out = [];
  if (p.cobro === 'recurrente') {
    if (!p.planes?.length) out.push('los planes de la membresía');
    else if (!p.precio) out.push('el precio de algún plan');
    for (const v of variantesDe(p)) if (v.plan && v.precio && !v.etiqueta && !p.etiqueta) out.push(`la etiqueta de «${v.nombre}»`);
  } else if (!p.precio) out.push('el precio');
  if (!p.etiqueta && !variantesDe(p).some((o) => o.etiqueta)) out.push('la etiqueta de compra');
  for (const o of p.ofertas) if (!o.etiqueta) out.push(`la etiqueta de la oferta «${o.nombre || 'sin nombre'}»`);
  return out;
}
