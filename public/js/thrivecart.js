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
  if (/upsell|one.?time.?offer|(^|[^a-zà-ÿñ])oto([^a-zà-ÿñ]|$)/.test(x)) return 'upsell'; // «OTO», no «otoño»
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
    const x = m.get(clave) || { clave, nombre: v.producto || (clave === 'Sin nombre' ? 'Sin nombre de producto' : clave), ventas: 0, importe: 0, ultima: 0 };
    x.ventas++; x.importe = Math.round((x.importe + v.importe) * 100) / 100; x.ultima = Math.max(x.ultima, v.fecha);
    m.set(clave, x);
  }
  return [...m.values()].sort((a, b) => b.ultima - a.ultima);
}
// ¿Es esta venta de uno de los productos elegidos? (por id o por nombre, sin distinguir mayúsculas)
// Un número es el ID del producto en ThriveCart (exacto); un texto, su nombre o parte de él («raices» vale para
// «Raíces · pago único»), sin distinguir mayúsculas ni tildes.
export const normProd = (x) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
export const deProductos = (v, productos = []) => {
  const lista = productos.map(normProd).filter(Boolean);
  if (!v.productoId && !v.producto) return lista.includes('sin nombre'); // ventas sin nombre de producto: también se pueden elegir
  const id = normProd(v.productoId);
  const nombre = normProd(v.producto);
  return lista.some((x) => (/^\d+$/.test(x) ? x === id : x === id || x === nombre || (x.length >= 4 && x !== 'sin nombre' && nombre.includes(x))));
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

// Qué columna es cada cosa (cabeceras en inglés o español, como las exporte ThriveCart). Cada lista va por
// preferencia: primero la cabecera más clara (p. ej. «Order total» antes que «Amount»); `no` descarta cabeceras.
const COLS = {
  email: { si: [/e-?mail/] },
  importe: { si: [/^(order )?total$|^grand.?total$/, /order.?total|total.?paid|^total/, /^(amount|importe|price|precio|cantidad)$/, /amount|importe|price|precio|revenue|paid|cantidad/], no: /refund|reembols|bump|upsell|downsell|tax|iva|fee|comisi|discount|descuento|coupon|cup[oó]n|shipping|env[ií]o|item|línea|linea|\bid$/ },
  item: { si: [/item.?name|charge.?name|line.?item|concepto|art[ií]culo/] },
  importeItem: { si: [/item.?(amount|price|total)|line.?(amount|total)|importe.?(de )?(la )?l[ií]nea/] },
  producto: { si: [/base.?product.?name|product.?name|nombre.?del.?producto|^product$|^producto$/, /base.?product|product|producto/, /^item$|purchase|description|descripci|offer|oferta|^course$|^curso$|pass|plan$/], no: /\bid\b|\bid$|_id|bump|upsell|downsell|type|tipo/ },
  productoId: { si: [/base.?product.?id|product.?id|id.?(del )?producto/] },
  linea: { si: [/item.?type|line.?type|charge.?type|purchase.?type|tipo.?de.?(l[ií]nea|art[ií]culo|producto|compra)/] },
  fecha: { si: [/^date$|^fecha$/, /date|fecha|time|created/], no: /next|pr[oó]xim|refund|reembols|birth|nacim/ },
  pedido: { si: [/order.?id|^order$|pedido/, /transaction.?id|invoice|^id$|referencia/] },
  tipo: { si: [/transaction.?type|^type$|^tipo$|event/], no: /item|line|charge|purchase|l[ií]nea/ },
  estado: { si: [/status|estado/] },
  nombre: { si: [/^name$|customer.?name|full.?name|nombre.?(del )?cliente|^nombre$/, /first.?name|nombre/], no: /product|producto|item|bump/ },
  moneda: { si: [/currency|moneda/] },
};
export function columnasCsv(cab = []) {
  const n = cab.map((h) => String(h).trim().toLowerCase());
  const out = {};
  const usadas = () => Object.values(out);
  for (const [k, { si, no }] of Object.entries(COLS)) {
    for (const re of si) {
      const i = n.findIndex((h, j) => !usadas().includes(j) && re.test(h) && !(no && no.test(h)));
      if (i >= 0) { out[k] = i; break; }
    }
  }
  // Columnas de bump (una fila por pedido con «Bump», «Bump amount»…): nombres/sí-no y sus importes, por orden.
  const bumps = { nombre: [], importe: [] };
  n.forEach((h, j) => {
    if (usadas().includes(j) || !/bump/.test(h) || /\bid$|_id|\bid\b/.test(h)) return;
    (/amount|price|precio|importe|total|cost|coste/.test(h) ? bumps.importe : bumps.nombre).push(j);
  });
  if (bumps.nombre.length || bumps.importe.length) out.bumps = bumps;
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
// mdy: el archivo pone el mes primero (10/21/2026, como en EE. UU.).
export function fechaTexto(v = '', { mdy = false } = {}) {
  const s = String(v).trim();
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:,?[ T](\d{1,2}):(\d{2}))?\s*(am|pm)?/i.exec(s);
  if (dmy) {
    const [d, m] = mdy ? [dmy[2], dmy[1]] : [dmy[1], dmy[2]];
    let h = Number(dmy[4] || 12);
    if (dmy[6]) h = (h % 12) + (/pm/i.test(dmy[6]) ? 12 : 0);
    return Date.parse(`${dmy[3]}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${String(h).padStart(2, '0')}:${dmy[5] || '00'}:00+02:00`);
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (iso && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return Date.parse(`${iso[1]}-${iso[2]}-${iso[3]}T${(iso[4] || '12').padStart(2, '0')}:${iso[5] || '00'}:00+02:00`);
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}
// ¿El archivo pone el mes delante? Si alguna fecha tiene el primer número > 12 es día/mes; si el segundo, mes/día.
function mesPrimero(valores = []) {
  let dm = false; let md = false;
  for (const v of valores) {
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{4}/.exec(String(v).trim());
    if (!m) continue;
    if (Number(m[1]) > 12) dm = true;
    if (Number(m[2]) > 12) md = true;
  }
  return md && !dm;
}
const SI = /^(s[ií]|yes|y|true|1|x|✓|comprado|purchased)$/i;
const NO = /^(no|n|false|0|-|—)?$/i;
// Filas del CSV → ventas. ThriveCart puede exportar una fila por producto del pedido (el principal, cada bump, cada
// upsell) o una por pedido con columnas de bump: las filas del mismo pedido se juntan en una venta con sus líneas,
// así se sabe el importe del pedido, qué bump llevó y cuánto (las que no se entienden se cuentan aparte).
export function ventasDeCsv(texto) {
  const filas = leerCsv(texto);
  if (filas.length < 2) return { ventas: [], descartadas: 0, columnas: {}, cabecera: filas[0] || [], resumen: { productos: [], extras: [], pedidos: 0, filas: 0 } };
  const cab = filas[0];
  const col = columnasCsv(cab);
  const mdy = col.fecha != null && mesPrimero(filas.slice(1).map((f) => f[col.fecha]));
  const filasOk = [];
  let descartadas = 0;
  for (const f of filas.slice(1)) {
    const c = (k) => (col[k] != null ? String(f[col[k]] ?? '').trim() : '');
    const email = c('email').toLowerCase();
    const importe = importeTexto(c('importe'));
    const fecha = fechaTexto(c('fecha'), { mdy });
    const estado = `${c('tipo')} ${c('estado')}`.toLowerCase();
    if (!email || importe == null || !fecha || /fail|declin|pend|abandon|fallid|rechaz|cancel|void|anulad/.test(estado)) { descartadas++; continue; }
    const reembolso = /refund|reembols|devoluci/.test(estado) || importe < 0;
    const nombreLinea = (c('item') || c('producto')).slice(0, 120);
    const impLinea = importeTexto(c('importeItem'));
    // Bumps en columnas propias de la misma fila
    const bumps = [];
    if (col.bumps) {
      const n = Math.max(col.bumps.nombre.length, col.bumps.importe.length);
      for (let i = 0; i < n; i++) {
        const jn = col.bumps.nombre[i];
        const ji = col.bumps.importe[i];
        const val = jn != null ? String(f[jn] ?? '').trim() : '';
        const imp = ji != null ? importeTexto(f[ji]) : null;
        if ((jn != null && NO.test(val)) || (jn == null && !imp)) continue;
        const nombre = (val && !SI.test(val) ? val : String(cab[jn ?? ji]).replace(/\s*(amount|price|precio|importe|total|cost|coste)\s*/gi, ' ').trim() || 'Bump').slice(0, 120);
        bumps.push({ nombre, tipo: 'bump', importe: Math.round((imp || 0) * 100) / 100, id: '' });
      }
    }
    filasOk.push({
      email, fecha, reembolso, importe: Math.abs(importe), pedido: c('pedido').slice(0, 60), nombre: c('nombre').slice(0, 80),
      moneda: (c('moneda') || 'EUR').toUpperCase().slice(0, 8), producto: c('producto').slice(0, 120), productoId: c('productoId').slice(0, 40),
      linea: { nombre: nombreLinea, tipoTxt: c('linea'), importe: impLinea != null ? Math.abs(impLinea) : null }, bumps,
    });
  }
  // Juntar por pedido. Si la columna es de cobro/factura/transacción (un número por fila, también para cada bump) o no
  // hay, se juntan las compras del mismo email hechas con menos de 5 minutos de diferencia. Los reembolsos van aparte.
  const porPedido = col.pedido != null && /order|pedido/i.test(String(cab[col.pedido]));
  const grupos = new Map();
  const ultimo = new Map(); // email|tipo → { k, fecha } del último grupo
  for (const r of [...filasOk].sort((a, b) => a.fecha - b.fecha)) {
    const t = r.reembolso ? 'r' : 'c';
    let k;
    if (porPedido && r.pedido) k = `${t}|${r.pedido}`;
    else {
      const u = ultimo.get(`${r.email}|${t}`);
      k = t === 'c' && u && r.fecha - u.fecha <= 5 * 60_000 ? u.k : `${t}|${r.email}|${r.fecha}|${grupos.size}`;
      ultimo.set(`${r.email}|${t}`, { k, fecha: r.fecha });
    }
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(r);
  }
  // Sin columna de tipo de línea: es producto principal lo que alguna vez se compró solo o va primero en su pedido;
  // lo demás que va en el mismo pedido es un bump (o upsell/downsell si lo dice el nombre).
  const principales = new Set();
  for (const g of grupos.values()) if (g[0].linea.nombre) principales.add(g[0].linea.nombre.toLowerCase());
  const tipoDe = (r, i, g) => {
    const t = tipoLinea(r.linea.tipoTxt, r.linea.nombre);
    if (r.linea.tipoTxt || t !== 'producto' || g.length === 1) return t;
    const primero = g.findIndex((x) => principales.has(x.linea.nombre.toLowerCase()) && tipoLinea('', x.linea.nombre) === 'producto');
    return i === (primero < 0 ? 0 : primero) ? 'producto' : 'bump';
  };
  const ventas = [];
  for (const g of grupos.values()) {
    const p = g[0];
    const tipo = p.reembolso ? 'reembolso' : 'cobro';
    // ¿El importe de cada fila es el de su línea o el total del pedido repetido? Con columna de importe de línea, la
    // otra es el total; si todas las filas traen lo mismo y hay importe de línea, también.
    const conImpLinea = g.some((r) => r.linea.importe != null);
    const repetido = !conImpLinea && g.length > 1 && col.item != null && g.every((r) => r.importe === p.importe);
    const total = conImpLinea || repetido ? p.importe : g.reduce((t, r) => t + r.importe, 0);
    let lineas = [];
    if (tipo === 'cobro') {
      // Con el total repetido y sin importe por línea no se sabe cuánto fue cada cosa: todo al producto principal.
      lineas = g.map((r, i) => {
        const t = tipoDe(r, i, g);
        const imp = r.linea.importe ?? (repetido ? (t === 'producto' ? total : 0) : conImpLinea ? 0 : r.importe);
        return { nombre: r.linea.nombre, tipo: t, importe: Math.round(imp * 100) / 100, id: '' };
      });
      const extraCols = g.flatMap((r) => r.bumps);
      if (extraCols.length) {
        lineas.push(...extraCols);
        // Una fila por pedido con columnas de bump: el importe de la fila es el pedido entero; el producto, lo que queda.
        const principal = lineas.find((l) => l.tipo === 'producto');
        if (principal && g.length === 1 && !conImpLinea) principal.importe = Math.round(Math.max(0, total - extraCols.reduce((t, l) => t + l.importe, 0)) * 100) / 100;
      }
      lineas = lineas.filter((l) => l.nombre || l.importe).slice(0, 12)
        .map((l) => (l.nombre || l.tipo === 'producto' ? l : { ...l, nombre: `${l.tipo === 'bump' ? 'Bump' : l.tipo === 'upsell' ? 'Upsell' : 'Downsell'} de ${String(l.importe).replace('.', ',')} €` }));
    }
    const prin = tipo === 'cobro' ? g[lineas.findIndex((l) => l.tipo === 'producto')] || p : p;
    const imp = Math.round((tipo === 'reembolso' ? -total : total) * 100) / 100;
    ventas.push({
      id: ['csv', p.pedido, tipo, imp.toFixed(2), p.email, p.fecha].join('|').slice(0, 200),
      evento: `csv.${tipo}`, tipo, pedido: p.pedido, email: p.email, nombre: p.nombre, importe: imp, moneda: p.moneda,
      producto: prin.producto || prin.linea.nombre || lineas.find((l) => l.tipo === 'producto')?.nombre || '', productoId: prin.productoId, prueba: false, fecha: p.fecha, importada: true,
      ...(lineas.length ? { lineas } : {}),
    });
  }
  ventas.sort((a, b) => a.fecha - b.fecha);
  // Resumen para la vista previa: productos principales y extras (bumps, upsells) que se han entendido.
  const cuenta = (pares) => [...pares.reduce((m, [k, x]) => m.set(k, { ...x, n: (m.get(k)?.n || 0) + 1 }), new Map()).values()].sort((a, b) => b.n - a.n);
  const cobros = ventas.filter((v) => v.tipo === 'cobro');
  const resumen = {
    filas: filas.length - 1, pedidos: cobros.length, reembolsos: ventas.length - cobros.length, mesPrimero: mdy, porPedido,
    productos: cuenta(cobros.map((v) => [v.producto.toLowerCase(), { nombre: v.producto || 'Sin nombre' }])),
    extras: cuenta(cobros.flatMap((v) => (v.lineas || []).filter((l) => l.tipo !== 'producto').map((l) => [`${l.tipo}|${l.nombre.toLowerCase()}`, { tipo: l.tipo, nombre: l.nombre }]))),
  };
  return { ventas, descartadas, columnas: col, cabecera: cab, resumen };
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
  const lineas = tipo === 'cobro' && Array.isArray(v.lineas) ? v.lineas.slice(0, 12).filter((l) => l && typeof l === 'object').map((l) => ({
    nombre: txt(l.nombre, 120), tipo: ['producto', 'bump', 'upsell', 'downsell'].includes(l.tipo) ? l.tipo : 'producto', importe: Math.round((Number(l.importe) || 0) * 100) / 100, id: txt(l.id, 40),
  })) : [];
  return { id: ['csv', pedido, tipo, imp.toFixed(2), email, fecha].join('|').slice(0, 200), evento: `csv.${tipo}`, tipo, pedido, email, nombre: txt(v.nombre, 80), importe: imp, moneda: txt(v.moneda, 8).toUpperCase() || 'EUR', producto: txt(v.producto, 120), productoId: txt(v.productoId, 40), prueba: false, fecha, importada: true, ...(lineas.length ? { lineas } : {}) };
}
// Al volver a importar, lo importado antes de los mismos pedidos o del mismo email y día se sustituye:
// así un CSV leído antes fila a fila (cada bump como venta suelta) se corrige con el nuevo.
export function sinImportadasDe(lista = [], nuevas = []) {
  const dia = (ms) => new Date(ms).toISOString().slice(0, 10);
  const pedidos = new Set(nuevas.map((v) => v.pedido).filter(Boolean));
  const emailDia = new Set(nuevas.map((v) => `${v.email}|${dia(v.fecha)}`));
  return lista.filter((x) => !x.importada || !(pedidos.has(x.pedido) || emailDia.has(`${x.email}|${dia(x.fecha)}`)));
}
