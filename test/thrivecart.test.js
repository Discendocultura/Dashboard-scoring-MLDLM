import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ventaDeWebhook, anadirVenta, resumenThrivecart, tipoEvento } from '../public/js/thrivecart.js';

// Aviso de ThriveCart tal como llega (formulario con claves planas).
const aviso = (extra = {}) => ({
  event: 'order.success', mode: 'live', order_id: '123', invoice_id: '9', currency: 'EUR', order_timestamp: '1792400000',
  base_product: '7', base_product_name: 'Entrada VIP El Camino', 'customer[email]': 'Ana@Ejemplo.com', 'customer[name]': 'Ana',
  // Como lo manda ThriveCart: el total sin IVA y el IVA aparte (9 € pagados = 7,43 + 1,57)
  'order[total]': '743', 'order[total_str]': '7.43', 'order[tax]': '157', 'order[tax_str]': '1.57', ...extra,
});

test('thrivecart: del aviso a una venta (importe, email, producto, fecha)', () => {
  const v = ventaDeWebhook(aviso());
  assert.equal(v.tipo, 'cobro');
  assert.equal(v.importe, 9);
  assert.equal(v.email, 'ana@ejemplo.com');
  assert.equal(v.producto, 'Entrada VIP El Camino');
  assert.equal(v.fecha, 1792400000 * 1000);
  assert.equal(ventaDeWebhook(aviso({ 'order[total_str]': '' })).importe, 9, 'sin total_str: céntimos / 100');
  const r = ventaDeWebhook(aviso({ event: 'order.refund', 'refund[amount]': '900', 'refund[amount_str]': '9.00' }));
  assert.equal(r.tipo, 'reembolso');
  assert.equal(r.importe, -9);
  assert.equal(ventaDeWebhook({ event: 'cart.abandoned', 'customer[email]': 'x@y.z' }), null);
  assert.equal(tipoEvento('order.subscription_payment'), 'cobro');
  assert.equal(ventaDeWebhook(aviso({ mode: 'test' })).prueba, true);
});

test('thrivecart: sin repetir avisos y resumen del lanzamiento (leads, reembolsos, fuera, pruebas)', () => {
  let lista = [];
  for (const b of [aviso(), aviso(), aviso({ order_id: '124', 'customer[email]': 'otra@x.com', 'order[total_str]': '97.00', 'order[tax_str]': '0', 'order[tax]': '0' }),
    aviso({ event: 'order.refund', 'refund[amount_str]': '9.00' }), aviso({ order_id: '125', mode: 'test', 'order[total_str]': '50.00', 'order[tax_str]': '0', 'order[tax]': '0' })]) {
    lista = anadirVenta(lista, ventaDeWebhook(b)).lista;
  }
  assert.equal(lista.length, 4, 'el aviso repetido no se guarda dos veces');
  const r = resumenThrivecart(lista, new Set(['ana@ejemplo.com']));
  assert.equal(r.cobros, 1);
  assert.equal(r.cobrado, 9);
  assert.equal(r.reembolsado, 9);
  assert.equal(r.neto, 0);
  assert.deepEqual(r.fuera, { cobros: 1, importe: 97 });
  assert.equal(r.emailsCompra.size, 0, 'con todo devuelto no cuenta como compradora');
  assert.equal(resumenThrivecart(lista, new Set(['ana@ejemplo.com']), { desde: Date.now() }).cobros, 0, 'fuera del periodo');
});

// Servidor: dirección firmada por cliente, HEAD, aviso y consulta.
const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
let route;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
});
test('thrivecart: la dirección de aviso guarda las ventas y AlquimIA las lee', async () => {
  const call = async (path, { method = 'GET', body, cookie, form } = {}) => {
    const headers = { ...(cookie ? { cookie } : {}), 'content-type': form ? 'application/x-www-form-urlencoded' : 'text/plain' };
    const r = await route(new Request(`http://localhost${path}`, { method, headers, body: form ? new URLSearchParams(form).toString() : body ? JSON.stringify(body) : undefined }), ENV);
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const login = await route(new Request('http://localhost/api/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password: 'admin' }) }), ENV);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const { data: cx } = await call('/api/thrivecart', { cookie });
  assert.match(cx.url, /\/api\/thrivecart\?c=[^&]+&k=thrivecart:/);
  const path = cx.url.replace(/^https?:\/\/[^/]+/, '');
  assert.equal((await route(new Request(`http://localhost${path}`, { method: 'HEAD' }), ENV)).status, 200);
  assert.equal((await call(path.replace(/k=[^&]+/, 'k=malo'), { method: 'POST', form: aviso() })).status, 403);
  const ok = await call(path, { method: 'POST', form: aviso() });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.guardada, true);
  assert.equal((await call(path, { method: 'POST', form: aviso() })).data.guardada, false, 'el mismo aviso dos veces no duplica');
  const { data } = await call('/api/thrivecart?op=ventas&desde=0', { cookie });
  assert.equal(data.ventas.length, 1);
  assert.equal(data.ventas[0].importe, 9);
  assert.equal((await call('/api/thrivecart?op=ventas')).status, 401, 'sin sesión no se leen las ventas');
  // Importar del CSV: lo que ya llegó por aviso no se repite
  const imp = await call('/api/thrivecart?op=importar', { method: 'POST', cookie, body: { ventas: [
    { email: 'ana@ejemplo.com', tipo: 'cobro', importe: 9, fecha: 1792400000 * 1000, producto: 'Entrada VIP El Camino' },
    { email: 'eva@x.com', tipo: 'cobro', importe: 497, fecha: Date.now() - 3600_000, producto: 'Raíces', pedido: '777' },
    { email: 'malo', tipo: 'cobro', importe: 1, fecha: Date.now() },
  ] } });
  assert.deepEqual([imp.data.nuevas, imp.data.repetidas, imp.data.descartadas], [1, 1, 1]);
  assert.equal((await call('/api/thrivecart?op=importar', { method: 'POST', body: { ventas: [] } })).status, 401);
});

test('thrivecart CSV: columnas en inglés o español, importes con € o coma, reembolsos y fallidas', async () => {
  const { ventasDeCsv, importeTexto, fechaTexto, yaEsta } = await import('../public/js/thrivecart.js');
  assert.equal(importeTexto('9,00 €'), 9);
  assert.equal(importeTexto('€1,234.50'), 1234.5);
  assert.equal(importeTexto('1.234,50'), 1234.5);
  assert.equal(new Date(fechaTexto('21/10/2026 14:03')).toISOString(), '2026-10-21T12:03:00.000Z');
  const csv = 'Order ID,Date,Customer name,Customer email,Product,Amount,Status\n'
    + '101,2026-10-21 10:00,Ana,ANA@x.com,"Entrada VIP, El Camino","€9.00",Paid\n'
    + '102,2026-10-21 11:00,Eva,eva@x.com,Raíces,497.00,Refunded\n'
    + '103,2026-10-21 12:00,Luz,luz@x.com,Raíces,497.00,Failed\n'
    + '104,,Sin,fecha@x.com,Raíces,10,Paid\n';
  const r = ventasDeCsv(csv);
  assert.equal(r.ventas.length, 2);
  assert.equal(r.descartadas, 2);
  assert.deepEqual(r.ventas.map((v) => [v.email, v.tipo, v.importe, v.producto]), [['ana@x.com', 'cobro', 9, 'Entrada VIP, El Camino'], ['eva@x.com', 'reembolso', -497, 'Raíces']]);
  const sc = ventasDeCsv('Fecha;Email;Producto;Importe;Estado\n21/10/2026;a@b.com;VIP;9,00 €;Completado\n');
  assert.equal(sc.ventas[0].importe, 9);
  // Ya llegó por aviso: mismo email, tipo, importe y día → no se repite
  assert.equal(yaEsta([{ email: 'ana@x.com', tipo: 'cobro', importe: 9, fecha: Date.parse('2026-10-21T15:00:00Z'), pedido: '' }], r.ventas[0]), true);
});

test('thrivecart: cada lanzamiento cuenta solo sus productos y los bumps salen del pedido', async () => {
  const { ventaDeWebhook, resumenThrivecart, productosVistos, anadirVenta } = await import('../public/js/thrivecart.js');
  const pedido = (id, email, prod, charges, ev = 'order.success') => ventaDeWebhook({ event: ev, mode: 'live', order_id: id, order_timestamp: '1792400000', base_product: prod === 'VIP Camino' ? '11' : '22', base_product_name: prod,
    customer: { email }, order: { total_str: String(charges.reduce((t, c) => t + c[1], 0)), charges: charges.map(([name, amount, type]) => ({ name, amount: amount * 100, type })) }, refund: { amount_str: '9.00' } });
  let lista = [];
  for (const v of [
    pedido('1', 'a@x.com', 'VIP Camino', [['VIP Camino', 9, 'product'], ['Guía otoño', 10, 'bump']]),
    pedido('2', 'b@x.com', 'VIP Camino', [['VIP Camino', 9, 'product']]),
    pedido('3', 'c@x.com', 'Curso Resistencia', [['Curso Resistencia', 97, 'product']]),
    pedido('2', 'b@x.com', 'VIP Camino', [], 'order.refund'),
  ]) lista = anadirVenta(lista, v).lista;
  const vistos = productosVistos(lista);
  assert.deepEqual(vistos.map((p) => p.nombre).sort(), ['Curso Resistencia', 'VIP Camino']);
  // Elegido «VIP Camino» (por su id): solo sus ventas, aunque c@x.com esté registrada; el reembolso de su pedido resta
  const r = resumenThrivecart(lista, new Set(['a@x.com', 'c@x.com']), { productos: ['11'] });
  assert.equal(r.porProductos, true);
  assert.equal(r.cobros, 2);
  assert.equal(r.cobrado, 28);
  assert.equal(r.reembolsado, 9);
  assert.equal(r.sinRegistro, 1, 'b@x.com compró sin registrarse');
  assert.deepEqual(r.extras.map((x) => [x.tipo, x.nombre, x.n, x.importe]), [['bump', 'Guía otoño', 1, 10]]);
  assert.equal(r.extras[0].pct, 0.5, '1 de 2 pedidos con el bump');
  // Por nombre también vale
  assert.equal(resumenThrivecart(lista, new Set(), { productos: ['curso resistencia'] }).cobrado, 97);
});

test('thrivecart CSV: una fila por producto del pedido → un pedido con sus bumps; o columnas de bump; fechas de EE. UU.', async () => {
  const { ventasDeCsv, resumenThrivecart, sinImportadasDe } = await import('../public/js/thrivecart.js');
  // Una fila por línea con columna de tipo
  const csv = 'Order ID,Date,Customer email,Product ID,Product name,Item type,Item name,Amount,Status\n'
    + '1,10/21/2026 10:00,a@x.com,11,Entrada VIP,product,Entrada VIP,9.00,Paid\n'
    + '1,10/21/2026 10:00,a@x.com,11,Entrada VIP,bump,Guía otoño,10.00,Paid\n'
    + '2,10/21/2026 11:00,b@x.com,11,Entrada VIP,product,Entrada VIP,9.00,Paid\n'
    + '2,10/21/2026 11:00,b@x.com,11,Entrada VIP,bump,Masterclass,7.00,Paid\n'
    + '3,10/22/2026 09:00,c@x.com,11,Entrada VIP,product,Entrada VIP,9.00,Paid\n';
  const r = ventasDeCsv(csv);
  assert.equal(r.ventas.length, 3, '5 filas → 3 pedidos');
  assert.equal(r.resumen.mesPrimero, true);
  assert.equal(new Date(r.ventas[0].fecha).toISOString().slice(0, 10), '2026-10-21');
  assert.deepEqual(r.ventas.map((v) => [v.importe, v.producto, v.productoId]), [[19, 'Entrada VIP', '11'], [16, 'Entrada VIP', '11'], [9, 'Entrada VIP', '11']]);
  const res = resumenThrivecart(r.ventas, new Set(), { productos: ['11'] });
  assert.equal(res.cobrado, 44);
  assert.deepEqual(res.extras.map((e) => [e.nombre, e.n, e.importe, Math.round(e.pct * 100)]), [['Guía otoño', 1, 10, 33], ['Masterclass', 1, 7, 33]]);
  // Sin columna de tipo: lo que va con el producto principal en el mismo pedido es un bump
  const sinTipo = ventasDeCsv('Order ID,Date,Email,Product,Amount\n7,2026-10-21,a@x.com,Entrada VIP,9\n7,2026-10-21,a@x.com,Guía otoño,10\n8,2026-10-21,b@x.com,Entrada VIP,9\n');
  assert.deepEqual(sinTipo.ventas.map((v) => [v.producto, v.importe, (v.lineas || []).filter((l) => l.tipo === 'bump').map((l) => l.nombre).join()]), [['Entrada VIP', 19, 'Guía otoño'], ['Entrada VIP', 9, '']]);
  // Una fila por pedido con columnas de bump
  const cols = ventasDeCsv('Order ID,Date,Email,Product,Order total,Bump,Bump amount\n9,21/10/2026,a@x.com,Entrada VIP,19,Yes,10\n10,21/10/2026,b@x.com,Entrada VIP,9,No,\n');
  assert.deepEqual(cols.ventas[0].lineas.map((l) => [l.tipo, l.importe]), [['producto', 9], ['bump', 10]]);
  assert.equal(cols.resumen.extras[0].n, 1);
  // Volver a importar: lo importado antes de esos pedidos se sustituye
  const viejo = [{ importada: true, pedido: '1', email: 'a@x.com', fecha: r.ventas[0].fecha, importe: 10 }, { pedido: '1', email: 'a@x.com', fecha: 1, importe: 19 }];
  assert.equal(sinImportadasDe(viejo, r.ventas).length, 1, 'se queda la que llegó por aviso');
});

test('thrivecart: ventas sin nombre de producto se pueden elegir y sus bumps se nombran por el precio', async () => {
  const { ventasDeCsv, resumenThrivecart } = await import('../public/js/thrivecart.js');
  const r = ventasDeCsv('Order ID,Date,Email,Amount\n1,2026-10-21,a@x.com,9\n1,2026-10-21,a@x.com,10\n2,2026-10-21,b@x.com,9\n2,2026-10-21,b@x.com,7\n3,2026-10-21,c@x.com,9\n');
  const res = resumenThrivecart(r.ventas, new Set(), { productos: ['Sin nombre'] });
  assert.equal(res.cobros, 3);
  assert.equal(res.cobrado, 44);
  assert.deepEqual(res.extras.map((e) => [e.nombre, e.n]).sort(), [['Bump de 10 €', 1], ['Bump de 7 €', 1]]);
  assert.equal(ventasDeCsv('Date,Email,Item,Amount\n2026-10-21,a@x.com,Entrada VIP,9\n').ventas[0].producto, 'Entrada VIP');
});

test('thrivecart CSV: con un número por cobro (transacción), el bump se junta con su compra por email y hora', async () => {
  const { ventasDeCsv, sinImportadasDe } = await import('../public/js/thrivecart.js');
  const r = ventasDeCsv('Transaction ID,Date,Email,Amount,Status\nt1,2026-10-21 10:00,a@x.com,9,Paid\nt2,2026-10-21 10:01,a@x.com,10,Paid\nt3,2026-10-21 12:00,a@x.com,9,Paid\nt4,2026-10-21 10:00,b@x.com,9,Paid\n');
  assert.equal(r.resumen.porPedido, false);
  assert.deepEqual(r.ventas.map((v) => [v.email, v.importe, (v.lineas || []).length]), [['a@x.com', 19, 2], ['b@x.com', 9, 1], ['a@x.com', 9, 1]]);
  // Lo importado antes fila a fila (t2 como venta suelta) se sustituye al reimportar
  const viejo = [{ importada: true, pedido: 't2', email: 'a@x.com', fecha: Date.parse('2026-10-21T08:01:00Z'), importe: 10 }];
  assert.equal(sinImportadasDe(viejo, r.ventas).length, 0);
});

test('thrivecart: el producto se elige por su ID (exacto) o por su nombre (o parte, sin tildes)', async () => {
  const { deProductos } = await import('../public/js/thrivecart.js');
  const v = { productoId: '15', producto: 'Raíces · pago único' };
  assert.equal(deProductos(v, ['15']), true);
  assert.equal(deProductos(v, ['1']), false, 'un ID tiene que ser exacto');
  assert.equal(deProductos(v, ['raices']), true);
  assert.equal(deProductos(v, ['RAÍCES · PAGO ÚNICO']), true);
  assert.equal(deProductos(v, ['vip']), false);
  assert.equal(deProductos({ productoId: '', producto: '' }, ['Sin nombre']), true);
  assert.equal(deProductos({ productoId: '', producto: 'Sin nombre de algo' }, ['Sin nombre']), false);
});

test('thrivecart: el ID de producto se guarda en todos los embudos con venta (VSL, venta directa, meteórico, cruzadas)', async () => {
  const { sanitizeConfig } = await import('../lib/config-store.js');
  const c = sanitizeConfig({
    launches: { l1: { registroTag: 'r', tcProductos: ['12'], tcPrograma: ['15', ' 15 '] } },
    vsls: { vsl: { registroTag: 'v', tcProductos: ['21'] } },
    embudos: [{ id: 'lanzamientos', tipo: 'lanzamientos' }, { id: 'vsl', tipo: 'vsl' }, { id: 'dir1', tipo: 'directa', name: 'D' }, { id: 'met', tipo: 'meteorico', name: 'M' }, { id: 'x1', tipo: 'cruzadas', name: 'X' }],
    directas: { dir1: { name: 'D', tcProductos: ['31', '32'] } },
    meteoricos: { m1: { name: 'M', embudo: 'met', tcProductos: ['41'] } },
    cruzadas: { x1: { productos: [{ nombre: 'Reto', tag: 'compra-reto', tcId: '51' }] } },
  });
  assert.deepEqual(c.launches.l1.tcProductos, ['12']);
  assert.deepEqual(c.launches.l1.tcPrograma, ['15']);
  assert.deepEqual(c.vsls.vsl.tcProductos, ['21']);
  assert.deepEqual(c.directas.dir1.tcProductos, ['31', '32']);
  assert.deepEqual(c.meteoricos.m1.tcProductos, ['41']);
  assert.equal(c.cruzadas.x1.productos[0].tcId, '51');
});

test('ThriveCart: el producto no se lee de una columna de precio y, con bumps, el principal es lo que se compra solo', async () => {
  const { ventasDeCsv, repararVentas, deProductos, resumenThrivecart } = await import('../public/js/thrivecart.js');
  const csv = 'Order ID,Date,Email,Product price,Item name,Item amount\n1,2026-10-21,a@x.com,7.43,Entrada VIP,8.99\n2,2026-10-21,b@x.com,9.00,Alimentación fértil,10.89\n2,2026-10-21,b@x.com,9.00,Entrada VIP,8.99\n';
  const r = ventasDeCsv(csv).ventas;
  assert.deepEqual(r.map((v) => v.producto), ['Entrada VIP', 'Entrada VIP']);
  assert.deepEqual(r[1].lineas.map((l) => `${l.tipo}:${l.nombre}`), ['bump:Alimentación fértil', 'producto:Entrada VIP']);
  // Las ya guardadas con esos fallos se reparan al leerlas, y lo elegido antes («7.43») sigue valiendo.
  const viejas = [
    { tipo: 'cobro', importada: true, email: 'a@x.com', importe: 8.99, producto: '7.43', fecha: 1, lineas: [{ nombre: 'Entrada VIP', tipo: 'producto', importe: 8.99 }] },
    { tipo: 'cobro', importada: true, email: 'b@x.com', importe: 19.88, producto: '9.00', fecha: 2, lineas: [{ nombre: 'Alimentación fértil', tipo: 'producto', importe: 10.89 }, { nombre: 'Entrada VIP', tipo: 'bump', importe: 8.99 }] },
  ];
  const rep = repararVentas(viejas);
  assert.deepEqual(rep.map((v) => v.producto), ['Entrada VIP', 'Entrada VIP']);
  assert.deepEqual(rep[1].lineas.map((l) => l.tipo), ['bump', 'producto']);
  assert.ok(deProductos(rep[0], ['7.43']) && deProductos(rep[1], ['9.00']));
  const res = resumenThrivecart(rep, new Set(), { productos: ['Entrada VIP'] });
  assert.equal(res.cobros, 2);
  assert.deepEqual(res.extras.map((e) => `${e.nombre}:${e.n}`), ['Alimentación fértil:1']);
});

test('ThriveCart: el aviso suma el IVA, los bumps por su item_type, y las VIP por aviso cuentan con lo elegido por el CSV', async () => {
  const { ventaDeWebhook, repararVentas, resumenThrivecart } = await import('../public/js/thrivecart.js');
  // Aviso nuevo: total y líneas sin IVA, el IVA aparte; type «single» e item_type el tipo de verdad
  const v = ventaDeWebhook({ event: 'order.success', order_id: '9', base_product: '29', base_product_name: 'Entrada VIP', 'customer[email]': 'a@x.com',
    'order[total]': '2543', 'order[tax]': '534', 'order[charges][0][name]': 'Entrada VIP', 'order[charges][0][amount]': '743', 'order[charges][0][type]': 'single', 'order[charges][0][item_type]': 'product',
    'order[charges][1][name]': '5 errores', 'order[charges][1][amount]': '900', 'order[charges][1][type]': 'single', 'order[charges][1][item_type]': 'bump',
    'order[charges][2][name]': 'Alimentación fértil', 'order[charges][2][amount]': '900', 'order[charges][2][type]': 'single', 'order[charges][2][item_type]': 'bump' });
  assert.equal(v.importe, 30.77);
  assert.equal(v.impuesto, 5.34);
  assert.deepEqual(v.lineas.map((l) => `${l.tipo}:${l.importe}`), ['producto:8.99', 'bump:10.89', 'bump:10.89']);
  // Guardados antes: CSV con el producto mal leído («7.43») y avisos sin IVA, con otro ID y los bumps como producto
  const csv = { tipo: 'cobro', importada: true, evento: 'csv.cobro', email: 'c@x.com', importe: 8.99, producto: '7.43', fecha: 1, lineas: [{ nombre: 'Entrada VIP', tipo: 'producto', importe: 8.99 }] };
  const aviso = (email, importe, lineas) => ({ tipo: 'cobro', evento: 'order.success', email, importe, producto: 'Entrada VIP', productoId: '29', fecha: 2, lineas });
  const viejas = [csv, aviso('d@x.com', 7.43, [{ nombre: 'Entrada VIP', tipo: 'producto', importe: 7.43 }]),
    aviso('e@x.com', 25.43, [{ nombre: '5 errores', tipo: 'producto', importe: 9 }, { nombre: 'Alimentación fértil', tipo: 'producto', importe: 9 }, { nombre: 'Entrada VIP', tipo: 'producto', importe: 7.43 }])];
  const rep = repararVentas(viejas);
  assert.deepEqual(rep.map((x) => x.importe), [8.99, 8.99, 30.77]);
  assert.deepEqual(rep[2].lineas.map((l) => l.tipo), ['bump', 'bump', 'producto']);
  // En Configuración están «26» (otro ID) y «7.43» (el del CSV): los avisos con el ID 29 también cuentan, por su nombre
  const r = resumenThrivecart(rep, new Set(), { productos: ['26', '7.43'] });
  assert.equal(r.cobros, 3);
  assert.equal(r.cobrado, 48.75);
  assert.deepEqual(r.extras.map((e) => `${e.nombre}:${e.n}`).sort(), ['5 errores:1', 'Alimentación fértil:1']);
  // Un aviso nuevo (con su IVA) no se toca
  assert.equal(repararVentas([v])[0].importe, 30.77);
});

test('ThriveCart: un IVA de menos de 5 céntimos no es un IVA (se estima) y la muestra del aviso no lleva datos personales', async () => {
  const { ventaDeWebhook, repararVentas, muestraAviso } = await import('../public/js/thrivecart.js');
  const v = ventaDeWebhook({ event: 'order.success', order_id: '5', base_product: '29', base_product_name: 'Entrada VIP', 'customer[email]': 'a@x.com', 'order[total]': '743', 'order[tax]': '0.21' });
  assert.equal(v.importe, 7.43);
  assert.equal('impuesto' in v, false);
  assert.equal(repararVentas([v])[0].importe, 8.99);
  // Guardadas con impuesto 0 (sin IVA de verdad): también se estiman
  assert.equal(repararVentas([{ ...v, impuesto: 0 }])[0].importe, 8.99);
  const m = muestraAviso({ event: 'order.success', 'customer[email]': 'a@x.com', 'customer[name]': 'Ana', order: { total: '743', tax: '0.21' } });
  assert.equal(m['order[tax]'], '0.21');
  assert.equal(m.event, 'order.success');
  assert.ok(!Object.keys(m).some((k) => /email|name/.test(k)));
});
