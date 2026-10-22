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
  return {
    id: [evento, pedido, txt(g('invoice_id'), 40), importe.toFixed(2), fecha].join('|').slice(0, 200),
    evento, tipo, pedido, email,
    nombre: txt(g('customer.name', 'customer_name', 'customer.first_name'), 80),
    importe: Math.round(importe * 100) / 100,
    moneda: txt(g('currency'), 8).toUpperCase() || 'EUR',
    producto, productoId: txt(g('base_product', 'product_id'), 40),
    prueba: String(g('mode')).toLowerCase() === 'test',
    fecha,
  };
}

// Añade una venta a la lista (sin repetir el mismo aviso) y se queda con las más recientes.
export const MAX_VENTAS = 4000;
export function anadirVenta(lista = [], v) {
  if (!v || lista.some((x) => x.id === v.id)) return { lista, nueva: false };
  return { lista: [...lista, v].sort((a, b) => a.fecha - b.fecha).slice(-MAX_VENTAS), nueva: true };
}

// Resumen de un lanzamiento: las ventas reales (no de prueba) entre `desde` y `hasta` (ms), y cuáles son de sus leads.
//   emails: Set de emails (en minúscula) de los leads del lanzamiento.
export function resumenThrivecart(ventas = [], emails = new Set(), { desde = 0, hasta = Infinity } = {}) {
  const dentro = ventas.filter((v) => !v.prueba && v.fecha >= desde && v.fecha <= hasta && v.tipo !== 'cancelacion');
  const deLeads = dentro.filter((v) => emails.has(v.email));
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
  const fuera = dentro.filter((v) => v.tipo === 'cobro' && v.email && !emails.has(v.email));
  return {
    cobros: cobros.length, cobrado: suma(cobros), reembolsos: reembolsos.length, reembolsado: -suma(reembolsos),
    neto: suma(deLeads), compradoras: new Set(cobros.map((v) => v.email)).size,
    porProducto: Object.values(porProducto).sort((a, b) => b.importe - a.importe),
    fuera: { cobros: fuera.length, importe: suma(fuera) },
    // Quien compró y no se le devolvió todo (lo que cuenta para comparar con las etiquetas de GHL).
    emailsCompra: new Set([...new Set(cobros.map((v) => v.email))].filter((e) => deLeads.filter((v) => v.email === e).reduce((t, v) => t + v.importe, 0) > 0.009)),
  };
}
