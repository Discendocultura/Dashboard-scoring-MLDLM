// ThriveCart → AlquimIA: cada venta, reembolso o cuota llega por su aviso (webhook) y se guarda resumida. Con eso
// AlquimIA sabe lo que se cobró de verdad (con cupones, bumps y plazos), resta los reembolsos y asigna cada venta a su
// lead por el email, aunque falle la etiqueta en GHL.
// ThriveCart manda el aviso como formulario (claves planas tipo «customer[email]», «order[total]» en céntimos).

const num = (v) => {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const euros = (str, cents) => {
  const s = num(str);
  if (s != null) return s;
  const c = num(cents);
  return c != null ? c / 100 : 0;
};
const txt = (v, max = 160) => String(v ?? '').trim().slice(0, max);

// Tipo de evento: cobro (venta, cuota, renovación), reembolso o cancelación (sin dinero).
export function tipoEvento(evento = '') {
  const e = String(evento).toLowerCase();
  if (/refund/.test(e)) return 'reembolso';
  if (/cancel/.test(e)) return 'cancelacion';
  if (/success|rebill|subscription_payment|payment/.test(e)) return 'cobro';
  return 'otro';
}

// Del aviso de ThriveCart (cuerpo ya leído, claves planas o anidadas) a una venta resumida, o null si no vale.
export function ventaDeWebhook(b = {}) {
  const g = (...ks) => {
    for (const k of ks) {
      const partes = k.split('.');
      let v = b;
      for (const p of partes) v = v == null ? undefined : v[p];
      if (v != null && v !== '') return v;
      const plano = partes.length > 1 ? b[`${partes[0]}${partes.slice(1).map((p) => `[${p}]`).join('')}`] : undefined;
      if (plano != null && plano !== '') return plano;
    }
    return '';
  };
  const evento = txt(g('event', 'event_type'), 60);
  const tipo = tipoEvento(evento);
  if (tipo === 'otro') return null;
  const email = txt(g('customer.email', 'customer_email', 'email'), 200).toLowerCase();
  const pedido = txt(g('order_id', 'order.id', 'invoice_id'), 60);
  if (!pedido && !email) return null;
  let importe = 0;
  if (tipo === 'reembolso') importe = -Math.abs(euros(g('refund.amount_str', 'refund_amount_str'), g('refund.amount', 'refund_amount')));
  else if (tipo === 'cobro') importe = euros(g('order.total_str', 'order_total_str', 'total_str'), g('order.total', 'order_total', 'total'));
  const ts = num(g('order_timestamp', 'timestamp'));
  const fechaTxt = txt(g('order_date', 'date'), 40);
  const fecha = ts ? (ts < 1e12 ? ts * 1000 : ts) : (Date.parse(fechaTxt) || Date.now());
  const producto = txt(g('base_product_name', 'base_product_label', 'product_name', 'order.product_name'), 120);
  const lineas = tipo === 'cobro' ? lineasPedido(b, producto, importe) : [];
  return {
    id: [evento, pedido, txt(g('invoice_id'), 40), importe.toFixed(2), fecha].join('|').slice(0, 200),
    evento, tipo, pedido, email,
    nombre: txt(g('customer.name', 'customer_name', 'customer.first_name'), 80),
    importe: Math.round(importe * 100) / 100,
    moneda: txt(g('currency'), 8).toUpperCase() || 'EUR',
    producto, productoId: txt(g('base_product', 'product_id'), 40),
    prueba: String(g('mode')).toLowerCase() === 'test',
    fecha,
    ...(lineas.length ? { lineas } : {}),
  };
}

// Qué es cada línea del pedido: el producto, un bump, un upsell o un downsell.
export const tipoLinea = (t = '', nombre = '') => {
  const x = `${t} ${nombre}`.toLowerCase();
  if (/bump/.test(x)) return 'bump';
  if (/downsell/.test(x)) return 'downsell';
  if (/upsell|oto/.test(x)) return 'upsell';
  return 'producto';
};
// Las líneas del pedido (order.charges en ThriveCart): nombre, tipo e importe de cada una. Llegan anidadas (JSON) o
// planas (formulario: «order[charges][0][name]»). Sin líneas, una sola con el producto principal.
export function lineasPedido(b = {}, producto = '', total = 0) {
  let charges = b?.order?.charges;
  if (charges && !Array.isArray(charges) && typeof charges === 'object') charges = Object.values(charges);
  if (!Array.isArray(charges)) {
    const porIndice = {};
    for (const [k, v] of Object.entries(b || {})) {
      const m = /^order\[charges\]\[(\d+)\]\[(\w+)\]$/.exec(k);
      if (m) (porIndice[m[1]] ||= {})[m[2]] = v;
    }
    charges = Object.keys(porIndice).sort((a, c) => a - c).map((i) => porIndice[i]);
  }
  const out = charges.filter((c) => c && typeof c === 'object').map((c) => {
    const nombre = txt(c.name || c.label || c.item_name || c.product_name, 120);
    const imp = euros(c.amount_str ?? c.total_str, c.amount ?? c.total);
    return { nombre, tipo: tipoLinea(c.type || c.item_type || '', nombre), importe: Math.round(imp * 100) / 100, id: txt(c.item_id || c.reference || c.id, 40) };
  }).filter((l) => l.nombre || l.importe).slice(0, 12);
  return out.length ? out : (producto || total ? [{ nombre: producto, tipo: 'producto', importe: Math.round(total * 100) / 100, id: '' }] : []);
}
// Productos que han llegado en las ventas (para elegir los de cada lanzamiento): [{ clave, nombre, ventas, importe }]
export function productosVistos(ventas = []) {
  const m = new Map();
  for (const v of ventas) {
    if (v.prueba || v.tipo !== 'cobro') continue;
    const clave = v.productoId || v.producto || 'Sin nombre';
    const x = m.get(clave) || { clave, nombre: v.producto || clave, ventas: 0, importe: 0, ultima: 0 };
    x.ventas++; x.importe = Math.round((x.importe + v.importe) * 100) / 100; x.ultima = Math.max(x.ultima, v.fecha);
    m.set(clave, x);
  }
  return [...m.values()].sort((a, b) => b.ultima - a.ultima);
}
// ¿Es esta venta de uno de los productos elegidos? (por id o por nombre, sin distinguir mayúsculas)
export const deProductos = (v, productos = []) => {
  const set = new Set(productos.map((x) => String(x).toLowerCase()));
  return set.has(String(v.productoId || '').toLowerCase()) || set.has(String(v.producto || '').toLowerCase());
};

// Añade una venta a la lista (sin repetir el mismo aviso) y se queda con las más recientes.
export const MAX_VENTAS = 4000;
export function anadirVenta(lista = [], v) {
  if (!v || lista.some((x) => x.id === v.id)) return { lista, nueva: false };
  return { lista: [...lista, v].sort((a, b) => a.fecha - b.fecha).slice(-MAX_VENTAS), nueva: true };
}

// Resumen de un lanzamiento: las ventas reales (no de prueba) entre `desde` y `hasta` (ms), y cuáles son de sus leads.
//   emails: Set de emails (en minúscula) de los leads del lanzamiento.
//   productos: los de ThriveCart elegidos para el lanzamiento → cuentan sus ventas (aunque el email no esté registrado),
//   en todo el periodo; sus reembolsos, por el pedido o el email. Sin elegir: las ventas de los emails de sus leads.
export function resumenThrivecart(ventas = [], emails = new Set(), { desde = 0, hasta = Infinity, productos = [] } = {}) {
  const dentro = ventas.filter((v) => !v.prueba && v.fecha >= desde && v.fecha <= hasta && v.tipo !== 'cancelacion');
  const porProd = productos.length > 0;
  const cobrosProd = porProd ? dentro.filter((v) => v.tipo === 'cobro' && deProductos(v, productos)) : [];
  const pedidosProd = new Set(cobrosProd.map((v) => v.pedido).filter(Boolean));
  const emailsProd = new Set(cobrosProd.map((v) => v.email));
  const deLeads = porProd
    ? dentro.filter((v) => (v.tipo === 'cobro' ? deProductos(v, productos) : (v.pedido && pedidosProd.has(v.pedido)) || (!v.pedido && emailsProd.has(v.email))))
    : dentro.filter((v) => emails.has(v.email));
  const suma = (arr) => Math.round(arr.reduce((t, v) => t + (v.importe || 0), 0) * 100) / 100;
  const cobros = deLeads.filter((v) => v.tipo === 'cobro');
  const reembolsos = deLeads.filter((v) => v.tipo === 'reembolso');
  const porProducto = {};
  for (const v of deLeads) {
    const k = v.producto || 'Sin nombre';
    porProducto[k] ||= { producto: k, cobros: 0, importe: 0 };
    if (v.tipo === 'cobro') porProducto[k].cobros++;
    porProducto[k].importe = Math.round((porProducto[k].importe + v.importe) * 100) / 100;
  }
  const fuera = porProd ? [] : dentro.filter((v) => v.tipo === 'cobro' && v.email && !emails.has(v.email));
  // Bumps, upsells y downsells (de las líneas de cada pedido): cuántos y cuánto, por nombre.
  const extras = {};
  let pedidosConLineas = 0;
  for (const v of cobros) {
    if (!v.lineas?.length) continue;
    pedidosConLineas++;
    for (const l of v.lineas.filter((x) => x.tipo !== 'producto')) {
      const k = `${l.tipo}|${l.nombre}`;
      extras[k] ||= { tipo: l.tipo, nombre: l.nombre || l.tipo, n: 0, importe: 0 };
      extras[k].n++; extras[k].importe = Math.round((extras[k].importe + l.importe) * 100) / 100;
    }
  }
  const sinRegistro = porProd ? new Set(cobros.map((v) => v.email).filter((e) => e && !emails.has(e))).size : 0;
  return {
    porProductos: porProd, sinRegistro,
    extras: Object.values(extras).sort((a, b) => b.importe - a.importe).map((x) => ({ ...x, pct: pedidosConLineas ? x.n / pedidosConLineas : null })),
    pedidosConLineas,
    cobros: cobros.length, cobrado: suma(cobros), reembolsos: reembolsos.length, reembolsado: -suma(reembolsos),
    neto: suma(deLeads), compradoras: new Set(cobros.map((v) => v.email)).size,
    porProducto: Object.values(porProducto).sort((a, b) => b.importe - a.importe),
    fuera: { cobros: fuera.length, importe: suma(fuera) },
    // Quien compró y no se le devolvió todo (lo que cuenta para comparar con las etiquetas de GHL).
    emailsCompra: new Set([...new Set(cobros.map((v) => v.email))].filter((e) => deLeads.filter((v) => v.email === e).reduce((t, v) => t + v.importe, 0) > 0.009)),
  };
}

// ---- Importar ventas anteriores (CSV exportado de ThriveCart) ----
// ThriveCart solo avisa de las ventas nuevas: las de antes de pegar la dirección se traen con su exportación en CSV.

// CSV → filas (array de arrays), con comillas y saltos de línea dentro de comillas. Separador , o ; (el que haya).
export function leerCsv(texto = '') {
  const t = String(texto).replace(/^﻿/, '');
  const primera = t.split(/\r?\n/, 1)[0] || '';
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';
  const filas = [];
  let fila = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') comillas = false; else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some((x) => x.trim())) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  fila.push(campo);
  if (fila.some((x) => x.trim())) filas.push(fila);
  return filas;
}

// Qué columna es cada cosa (cabeceras en inglés o español, como las exporte ThriveCart).
const COLS = {
  email: [/e-?mail/],
  importe: [/^(order )?total|amount|importe|cantidad|price|precio|revenue|paid/],
  producto: [/product|producto/],
  fecha: [/date|fecha|time|created/],
  pedido: [/order.?id|invoice|transaction.?id|^id$|pedido|referencia/],
  tipo: [/^type$|^tipo$|status|estado|event/],
  nombre: [/^name$|customer name|nombre|first.?name/],
  moneda: [/currency|moneda/],
};
export function columnasCsv(cab = []) {
  const n = cab.map((h) => String(h).trim().toLowerCase());
  const out = {};
  for (const [k, res] of Object.entries(COLS)) {
    const i = n.findIndex((h, j) => !Object.values(out).includes(j) && res.some((re) => re.test(h)) && !(k === 'importe' && /refund|reembolso/.test(h)));
    if (i >= 0) out[k] = i;
  }
  return out;
}
// «9,00 €», «€9.00», «1.234,50», «1,234.50» → número.
export function importeTexto(v = '') {
  let s = String(v).replace(/[^\d,.-]/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
// «2026-10-21 14:03», «21/10/2026 14:03», «Oct 21, 2026» → ms (hora de España si no la trae).
export function fechaTexto(v = '') {
  const s = String(v).trim();
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (dmy) return Date.parse(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}T${(dmy[4] || '12').padStart(2, '0')}:${dmy[5] || '00'}:00+02:00`);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (iso && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return Date.parse(`${iso[1]}-${iso[2]}-${iso[3]}T${(iso[4] || '12').padStart(2, '0')}:${iso[5] || '00'}:00+02:00`);
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}
// Filas del CSV → ventas (las que no se entienden se cuentan aparte).
export function ventasDeCsv(texto) {
  const filas = leerCsv(texto);
  if (filas.length < 2) return { ventas: [], descartadas: 0, columnas: {}, cabecera: filas[0] || [] };
  const cab = filas[0];
  const col = columnasCsv(cab);
  const ventas = [];
  let descartadas = 0;
  for (const f of filas.slice(1)) {
    const c = (k) => (col[k] != null ? String(f[col[k]] ?? '').trim() : '');
    const email = c('email').toLowerCase();
    const importe = importeTexto(c('importe'));
    const fecha = fechaTexto(c('fecha'));
    if (!email || importe == null || !fecha) { descartadas++; continue; }
    const tipoTxt = c('tipo').toLowerCase();
    const reembolso = /refund|reembols|devoluci/.test(tipoTxt) || importe < 0;
    if (/fail|declin|pend|abandon|fallid|rechaz/.test(tipoTxt)) { descartadas++; continue; }
    const tipo = reembolso ? 'reembolso' : 'cobro';
    const imp = Math.round((reembolso ? -Math.abs(importe) : importe) * 100) / 100;
    const pedido = c('pedido').slice(0, 60);
    ventas.push({
      id: ['csv', pedido, tipo, imp.toFixed(2), email, fecha].join('|').slice(0, 200),
      evento: `csv.${tipo}`, tipo, pedido, email, nombre: c('nombre').slice(0, 80), importe: imp,
      moneda: (c('moneda') || 'EUR').toUpperCase().slice(0, 8), producto: c('producto').slice(0, 120), productoId: '', prueba: false, fecha, importada: true,
    });
  }
  return { ventas, descartadas, columnas: col, cabecera: cab };
}
// ¿Ya está esta venta (por su aviso o por otra importación)? Mismo email, mismo tipo, mismo importe y mismo día
// (y mismo pedido si ambos lo tienen).
export function yaEsta(lista = [], v) {
  const dia = (ms) => new Date(ms).toISOString().slice(0, 10);
  return lista.some((x) => x.email === v.email && x.tipo === v.tipo && Math.abs(x.importe - v.importe) < 0.01 && dia(x.fecha) === dia(v.fecha)
    && (!x.pedido || !v.pedido || x.pedido === v.pedido));
}
// Limpia una venta que llega del navegador (importación) antes de guardarla.
export function ventaImportada(v = {}) {
  const email = txt(v.email, 200).toLowerCase();
  const importe = Number(v.importe);
  const fecha = Number(v.fecha);
  if (!/^[^@\s]+@[^@\s]+$/.test(email) || !Number.isFinite(importe) || !Number.isFinite(fecha) || fecha < 1.5e12 || fecha > Date.now() + 86_400_000) return null;
  const tipo = v.tipo === 'reembolso' ? 'reembolso' : 'cobro';
  const imp = Math.round((tipo === 'reembolso' ? -Math.abs(importe) : Math.abs(importe)) * 100) / 100;
  const pedido = txt(v.pedido, 60);
  return { id: ['csv', pedido, tipo, imp.toFixed(2), email, fecha].join('|').slice(0, 200), evento: `csv.${tipo}`, tipo, pedido, email, nombre: txt(v.nombre, 80), importe: imp, moneda: txt(v.moneda, 8).toUpperCase() || 'EUR', producto: txt(v.producto, 120), productoId: '', prueba: false, fecha, importada: true };
}
