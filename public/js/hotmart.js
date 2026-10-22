// Hotmart → AlquimIA: cada venta (también las de SeQura y a plazos), con lo que paga la clienta (bruto) y lo que le
// llega a la productora (neto: su comisión, ya sin la tarifa de Hotmart, SeQura, afiliados ni coproductores).
// Llegan por dos caminos que se juntan sin repetir: su API (ventas + comisiones, lo más fiable) y su aviso (webhook
// «Postback 2.0», al momento). Cada venta tiene la misma forma que las de ThriveCart (thrivecart.js) más `neto`, para
// sumarlas juntas en las métricas. El producto va como «hm:<id>» para no chocar con los ID de ThriveCart.

const num = (v) => {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const txt = (v, max = 160) => String(v ?? '').trim().slice(0, max);
const r2 = (n) => Math.round(n * 100) / 100;
export const MAX_VENTAS_HM = 6000;

// Estado de una compra → cobro, reembolso (devolución, contracargo) o nada (pendiente, cancelada antes de cobrar…).
export function tipoHotmart(estado = '') {
  const e = String(estado).toUpperCase();
  if (/REFUND|CHARGEBACK|PROTEST|DISPUTE/.test(e)) return 'reembolso';
  if (/APPROVED|COMPLETE|PRODUCER_ACCEPTED/.test(e)) return 'cobro';
  return 'otro';
}
// La comisión de la productora (lo neto que le llega): la de origen PRODUCER; si no viene, null (no se inventa).
export function netoProductora(comisiones = []) {
  const c = (Array.isArray(comisiones) ? comisiones : []).find((x) => String(x?.source || x?.commission_as || '').toUpperCase() === 'PRODUCER');
  if (!c) return null;
  const v = num(c.commission?.value ?? c.value);
  return v == null ? null : r2(v);
}

// Venta resumida a partir de los datos de una compra (de la API o del aviso, ya normalizados).
function venta({ tx, recurrencia, tipo, email, nombre, importe, neto, moneda, producto, productoId, fecha, metodo, cuotas, bumpDe, evento }) {
  const signo = tipo === 'reembolso' ? -1 : 1;
  const imp = r2(signo * Math.abs(importe || 0));
  const net = neto == null ? null : r2(signo * Math.abs(neto));
  return {
    id: ['hm', tx, recurrencia > 1 ? `r${recurrencia}` : '', tipo === 'reembolso' ? 'reembolso' : ''].filter(Boolean).join('|').slice(0, 200),
    fuente: 'hotmart', evento, tipo, pedido: tx, email, nombre, importe: imp, neto: net,
    moneda: moneda || 'EUR', producto, productoId: productoId ? `hm:${productoId}` : '', prueba: false, fecha,
    ...(metodo ? { metodo } : {}), ...(cuotas > 1 ? { cuotas } : {}), ...(bumpDe ? { bumpDe } : {}),
  };
}

// Una compra de la API (GET /payments/api/v1/sales/history) con su comisión (GET /sales/commissions) → venta(s).
// Si se devolvió, salen dos: el cobro y su reembolso (así cuadra con lo cobrado en su día).
export function ventasDeApi(item = {}, comisiones = []) {
  const p = item.purchase || {};
  const tx = txt(p.transaction, 60);
  const email = txt(item.buyer?.email, 200).toLowerCase();
  if (!tx || !email) return [];
  const tipo = tipoHotmart(p.status);
  if (tipo === 'otro') return [];
  const base = {
    tx, recurrencia: num(p.recurrency_number) || 0, email, nombre: txt(item.buyer?.name, 80),
    importe: num(p.price?.value) || 0, neto: netoProductora(comisiones), moneda: txt(p.price?.currency_code, 8).toUpperCase(),
    producto: txt(item.product?.name, 120), productoId: txt(item.product?.id, 40),
    fecha: num(p.approved_date) || num(p.order_date) || Date.now(),
    metodo: txt(p.payment?.type || p.payment?.method, 40), cuotas: num(p.payment?.installments_number) || 1,
    bumpDe: p.order_bump?.is_order_bump ? txt(p.order_bump.parent_purchase_transaction, 60) : '', evento: `api.${txt(p.status, 30).toLowerCase()}`,
  };
  const cobro = venta({ ...base, tipo: 'cobro' });
  return tipo === 'reembolso' ? [cobro, venta({ ...base, tipo: 'reembolso', fecha: num(p.refund_date) || base.fecha })] : [cobro];
}

// El aviso de Hotmart (Postback 2.0: { event, data: { buyer, product, purchase, commissions } }) → venta, o null.
export function ventaDeAvisoHotmart(b = {}) {
  const evento = txt(b.event, 60).toUpperCase();
  const tipo = /REFUND|CHARGEBACK|PROTEST|DISPUTE/.test(evento) ? 'reembolso' : /PURCHASE_(APPROVED|COMPLETE)/.test(evento) ? 'cobro' : 'otro';
  if (tipo === 'otro') return null;
  const d = b.data || {};
  const p = d.purchase || {};
  const tx = txt(p.transaction, 60);
  const email = txt(d.buyer?.email, 200).toLowerCase();
  if (!tx || !email) return null;
  const prueba = /sandbox|test/i.test(String(b.version_env || b.environment || '')) || d.purchase?.is_test === true;
  const v = venta({
    tx, recurrencia: num(p.recurrence_number) || 0, tipo, email, nombre: txt(d.buyer?.name, 80),
    importe: num(p.price?.value) || num(p.full_price?.value) || 0, neto: netoProductora(d.commissions),
    moneda: txt(p.price?.currency_value || p.price?.currency_code, 8).toUpperCase(),
    producto: txt(d.product?.name, 120), productoId: txt(d.product?.id, 40),
    fecha: tipo === 'reembolso' ? num(b.creation_date) || Date.now() : num(p.approved_date) || num(p.order_date) || num(b.creation_date) || Date.now(),
    metodo: txt(p.payment?.type, 40), cuotas: num(p.payment?.installments_number) || 1,
    bumpDe: p.order_bump?.is_order_bump ? txt(p.order_bump.parent_purchase_transaction, 60) : '', evento: evento.toLowerCase(),
  });
  return prueba ? { ...v, prueba: true } : v;
}

// Guarda o mejora una venta: la misma (mismo id) se sustituye si la nueva trae el neto y la vieja no (el aviso llega
// antes que la comisión de la API, o al revés). Devuelve { lista, cambio }.
export function guardarVentaHm(lista = [], v) {
  if (!v) return { lista, cambio: false };
  const i = lista.findIndex((x) => x.id === v.id);
  if (i >= 0) {
    const x = lista[i];
    const mejor = (x.neto == null && v.neto != null) || (!x.producto && v.producto) || (!x.bumpDe && v.bumpDe);
    if (!mejor) return { lista, cambio: false };
    const nueva = [...lista];
    nueva[i] = { ...x, ...v, neto: v.neto ?? x.neto };
    return { lista: nueva, cambio: true };
  }
  return { lista: [...lista, v].sort((a, b) => a.fecha - b.fecha).slice(-MAX_VENTAS_HM), cambio: true };
}

// Los bumps de Hotmart son compras aparte con su «compra madre»: se juntan en ella como líneas (para el % de bump y
// para que cuenten con el producto del embudo). La madre suma su importe y su neto.
export function plegarBumps(ventas = []) {
  const porTx = new Map();
  const out = [];
  for (const v of ventas) if (!v.bumpDe && v.tipo === 'cobro') porTx.set(v.pedido, { ...v, lineas: [{ nombre: v.producto, tipo: 'producto', importe: v.importe, id: v.productoId }] });
  for (const v of ventas) {
    const madre = v.bumpDe && v.tipo === 'cobro' ? porTx.get(v.bumpDe) : null;
    if (madre) {
      madre.lineas.push({ nombre: v.producto, tipo: 'bump', importe: v.importe, id: v.productoId });
      madre.importe = r2(madre.importe + v.importe);
      if (madre.neto != null || v.neto != null) madre.neto = r2((madre.neto || 0) + (v.neto || 0));
    }
  }
  for (const v of ventas) {
    if (!v.bumpDe && v.tipo === 'cobro') out.push(porTx.get(v.pedido));
    else if (!(v.bumpDe && v.tipo === 'cobro' && porTx.has(v.bumpDe))) out.push(v); // bump sin su madre o reembolsos: tal cual
  }
  return out;
}

// Aviso de carrito abandonado de Hotmart (PURCHASE_OUT_OF_SHOPPING_CART) → { fuente, email, nombre, telefono, producto, productoId, fecha }.
export function abandonoDeAvisoHotmart(b = {}) {
  if (!/OUT_OF_SHOPPING_CART|ABANDON/i.test(String(b.event || ''))) return null;
  const d = b.data || {};
  const email = txt(d.buyer?.email, 200).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return null;
  const tel = d.buyer?.phone || d.buyer?.checkout_phone || [d.buyer?.phone_local_code, d.buyer?.phone_number].filter(Boolean).join('');
  return {
    fuente: 'hotmart', email, nombre: txt(d.buyer?.name, 80), telefono: txt(tel, 30),
    producto: txt(d.product?.name, 120), productoId: d.product?.id ? `hm:${txt(d.product.id, 40)}` : '', fecha: num(b.creation_date) || Date.now(),
  };
}
