import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { agregar, recomendaciones, rangosNegocio } from '../lib/negocio-calc.js';
import { sanitizeCatalogo, sinIva, compraDe, faltasProducto } from '../public/js/productos.js';
import { catalogoDesdeConfig } from '../lib/productos.js';

const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
let route;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
});
async function call(path, { method = 'GET', body, cookie } = {}) {
  const res = await route(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'text/plain' }, body: body ? JSON.stringify(body) : undefined }), ENV);
  return { status: res.status, data: await res.json().catch(() => null), res };
}
const cookieDe = (r) => r.res.headers.get('set-cookie').split(';')[0];

test('inteligencia de negocio: sin datos, vacío', () => {
  assert.deepEqual(agregar([], { hoy: '2026-10-18' }), { vacio: true });
});

test('inteligencia de negocio: LTV, CAC, ciclo, recompra, camino y recomendaciones', () => {
  const hoy = '2026-10-18';
  const P = (o) => ({ cerrada: true, registros: 0, ventas: 0, facturacion: 0, inversion: null, compras: [], ...o });
  const piezas = [
    P({ id: 'l-may', tipo: 'lanzamiento', embudo: 'lanz', embudoNombre: 'Lanzamientos', nombre: 'Mayo', desde: '2026-05-01', hasta: '2026-05-20', registros: 1000, ventas: 20, facturacion: 20000, inversion: 4000,
      compras: Array.from({ length: 20 }, (_, i) => [`c${i}`, 1000, '2026-05-18', i % 5, i < 8 ? 'ultimo' : 'directo']) }),
    P({ id: 'v-vsl-2026-09', tipo: 'vsl', embudo: 'vsl', embudoNombre: 'VSL', nombre: 'VSL · 2026-09', desde: '2026-09-01', hasta: '2026-09-30', registros: 200, ventas: 6, facturacion: 3000, inversion: 2000,
      compras: [['c1', 500, '2026-09-10', 40, null], ['c2', 500, '2026-09-11', 2, null], ['x1', 500, '2026-09-12', 1, null], ['x2', 500, '2026-09-12', 1, null], ['x3', 500, '2026-09-13', 0, null], ['x4', 500, '2026-09-14', 0, null]] }),
  ];
  const a = agregar(piezas, { hoy, embudos: [{ id: 'lanz', tipo: 'lanzamientos', nombre: 'Lanzamientos' }, { id: 'vsl', tipo: 'vsl', nombre: 'VSL' }] });
  assert.equal(a.vacio, false);
  assert.equal(a.numeros.facturacion, 23000);
  assert.equal(a.numeros.clientes, 24);
  assert.equal(a.numeros.nuevos, 24);
  assert.equal(a.numeros.cac, 6000 / 24);
  assert.equal(Math.round(a.numeros.ltv), Math.round(23000 / 24));
  assert.equal(a.numeros.roas, 23000 / 6000);
  assert.equal(a.recompra.repiten, 2);
  assert.deepEqual(a.recompra.caminos[0], { camino: 'Lanzamientos → VSL', n: 2 });
  assert.equal(a.ciclo.n, 26);
  assert.equal(a.ciclo.momentos.find((m) => m.id === 'ultimo').n, 8);
  const mejor = a.embudos.find((e) => e.mejor);
  assert.equal(mejor.id, 'lanz');
  assert.ok(a.recomendaciones.length >= 1 && a.recomendaciones.length <= 3);
  assert.ok(a.recomendaciones.some((r) => /Pasa presupuesto a «Lanzamientos»/.test(r.titulo)));
  // El periodo anterior (12 meses antes) no tiene nada
  assert.equal(a.previo.facturacion, 0);
  assert.deepEqual(rangosNegocio('ano', hoy).actual, { desde: '2026-01-01', hasta: hoy });
  assert.equal(recomendaciones({ ...a, embudos: [] }, []).every((r) => r.titulo && r.texto), true);
});

test('inteligencia de negocio: por producto (de Marca y avatar), con de dónde vienen, adónde van y sus recomendaciones', () => {
  const hoy = '2026-10-18';
  const P = (o) => ({ cerrada: true, registros: 0, ventas: 0, facturacion: 0, inversion: null, compras: [], ...o });
  const piezas = [
    P({ id: 'l-may', tipo: 'lanzamiento', embudo: 'lanz', embudoNombre: 'Lanzamientos', nombre: 'Mayo', desde: '2026-05-01', hasta: '2026-05-20', registros: 1000, ventas: 20, facturacion: 20000, inversion: 4000,
      compras: Array.from({ length: 20 }, (_, i) => [`c${i}`, 1000, '2026-05-18', 3, null]) }),
    P({ id: 'v-vsl-2026-09', tipo: 'vsl', embudo: 'vsl', embudoNombre: 'VSL', nombre: 'VSL · 2026-09', desde: '2026-09-01', hasta: '2026-09-30', registros: 200, ventas: 6, facturacion: 3000, inversion: 4000,
      compras: [['c1', 500, '2026-09-10', 40, null], ['c2', 500, '2026-09-11', 2, null], ['c3', 500, '2026-09-12', 1, null], ['c4', 500, '2026-09-12', 1, null], ['x3', 500, '2026-09-13', 0, null], ['x4', 500, '2026-09-14', 0, null]] }),
    P({ id: 'm-flash', tipo: 'meteorico', embudo: 'lanz', embudoNombre: 'Lanzamientos', nombre: 'Flash', desde: '2026-06-01', hasta: '2026-06-03', ventas: 2, facturacion: 200, compras: [['c5', 100, '2026-06-02', null, null], ['c6', 100, '2026-06-02', null, null]] }),
  ];
  const embudos = [{ id: 'lanz', tipo: 'lanzamientos', nombre: 'Lanzamientos' }, { id: 'vsl', tipo: 'vsl', nombre: 'VSL' }];
  const a = agregar(piezas, { hoy, embudos, productos: { lanz: { id: 'p1', nombre: 'Raíces' } } });
  assert.deepEqual(a.productos.map((p) => p.nombre), ['Raíces', 'VSL', '⚡ Flash']);
  const raices = a.productos[0];
  assert.equal(raices.facturacion, 20000);
  assert.equal(raices.ticket, 1000);
  assert.equal(Math.round(raices.cuota * 100), Math.round((20000 / 23200) * 100));
  assert.equal(raices.roas, 5);
  assert.deepEqual(raices.embudos.map((e) => e.id), ['lanz']);
  // 6 de 20 compran después otra cosa: 4 la VSL y 2 el meteórico
  assert.equal(raices.despues.n, 6);
  assert.deepEqual(raices.despues.top[0], { nombre: 'VSL', n: 4 });
  assert.ok(raices.recomendaciones.some((r) => /Escala/.test(r.titulo)));
  assert.ok(raices.recomendaciones.some((r) => /Ofrece «VSL» justo después/.test(r.titulo)));
  assert.ok(raices.recomendaciones.some((r) => /depende/.test(r.titulo)));
  const vsl = a.productos.find((p) => p.nombre === 'VSL');
  assert.deepEqual(vsl.antes.top[0], { nombre: 'Raíces', n: 4 });
  assert.ok(vsl.recomendaciones.some((r) => /Pierde dinero/.test(r.titulo)));
  // El camino entre productos usa el nombre del producto
  assert.deepEqual(a.recompra.caminos[0], { camino: 'Raíces → VSL', n: 4 });
  for (const p of a.productos) assert.ok(p.recomendaciones.length <= 3 && p.recomendaciones.every((r) => r.titulo && r.texto && r.ico));
});

test('inteligencia de negocio: la venta directa es su propio producto y mide el paso al producto al que lleva', () => {
  const hoy = '2026-10-18';
  const P = (o) => ({ cerrada: true, registros: 0, ventas: 0, facturacion: 0, inversion: null, compras: [], ...o });
  const piezas = [
    P({ id: 'd-reto-2026-03', tipo: 'directa', embudo: 'reto', embudoNombre: 'Reto Ovulación', nombre: 'Reto · 2026-03', desde: '2026-03-01', hasta: '2026-03-31', ventas: 20, facturacion: 540,
      compras: Array.from({ length: 20 }, (_, i) => [`c${i}`, 27, '2026-03-10', 0, null]) }),
    P({ id: 'l-may', tipo: 'lanzamiento', embudo: 'lanz', embudoNombre: 'Lanzamientos', nombre: 'Mayo', desde: '2026-05-01', hasta: '2026-05-20', registros: 500, ventas: 10, facturacion: 9970,
      compras: Array.from({ length: 10 }, (_, i) => [`c${i < 5 ? i : i + 50}`, 997, '2026-05-18', 2, null]) }),
  ];
  const productos = { lanz: { id: 'p1', nombre: 'Raíces' }, reto: { id: 'dir-reto', nombre: 'Reto Ovulación', tipo: 'directa', objetivo: { id: 'p1', nombre: 'Raíces' } } };
  const a = agregar(piezas, { hoy, embudos: [{ id: 'lanz', tipo: 'lanzamientos', nombre: 'Lanzamientos' }, { id: 'reto', tipo: 'directa', nombre: 'Reto Ovulación' }], productos });
  assert.deepEqual(a.productos.map((p) => p.nombre), ['Raíces', 'Reto Ovulación']);
  const reto = a.productos.find((p) => p.nombre === 'Reto Ovulación');
  assert.equal(reto.tipo, 'directa');
  assert.deepEqual({ n: reto.objetivo.n, pct: reto.objetivo.pct, nombre: reto.objetivo.nombre }, { n: 5, pct: 0.25, nombre: 'Raíces' });
  assert.ok(reto.recomendaciones.some((r) => /El 25 % acaba comprando «Raíces»/.test(r.titulo)));
  assert.deepEqual(a.productos.find((p) => p.nombre === 'Raíces').antes.top[0], { nombre: 'Reto Ovulación', n: 5 });
});

test('inteligencia de negocio: con catálogo de productos, compras por etiqueta, ofertas y paso al siguiente producto', () => {
  const hoy = '2026-10-18';
  const productos = [
    { id: 'reto', nombre: 'Reto Ovulación', tipo: 'entrada', precio: 27, iva: 'sin', etiqueta: 'compra-reto', fechaCampo: 'f1', embudos: ['reto'], siguiente: 'raices', ofertas: [] },
    { id: 'raices', nombre: 'Raíces', tipo: 'principal', precio: 997, iva: 'sin', etiqueta: 'clienta-raices', fechaCampo: '', embudos: ['lanz'], siguiente: '', ofertas: [{ id: 'o-bf', nombre: 'Black Friday', precio: 697, etiqueta: 'raices-bf' }] },
  ];
  const fotos = [
    { id: 'c-reto-x', tipo: 'catalogo', producto: 'reto', hasta: hoy, ventas: 20, compras: Array.from({ length: 20 }, (_, i) => [`c${i}`, 27, '2026-03-10', null, '']) },
    // Raíces sin campo de fecha: la fecha sale de su compra en el lanzamiento
    { id: 'c-raices-x', tipo: 'catalogo', producto: 'raices', hasta: hoy, ventas: 12, compras: Array.from({ length: 12 }, (_, i) => [`c${i < 5 ? i : i + 50}`, i < 8 ? 697 : 997, '', null, i < 8 ? 'o-bf' : '']) },
  ];
  const piezas = [{ id: 'l-may', tipo: 'lanzamiento', embudo: 'lanz', embudoNombre: 'Lanzamientos', nombre: 'Mayo', desde: '2026-05-01', hasta: '2026-05-20', cerrada: true, registros: 600, ventas: 12, facturacion: 9576, inversion: 3000,
    compras: Array.from({ length: 12 }, (_, i) => [`c${i < 5 ? i : i + 50}`, 798, '2026-05-18', 2, null]) }];
  const embudos = [{ id: 'lanz', tipo: 'lanzamientos', nombre: 'Lanzamientos' }, { id: 'reto', tipo: 'directa', nombre: 'Reto Ovulación' }];
  const a = agregar(piezas, { hoy, embudos, catalogo: { ivaPct: 21, productos, fotos } });
  assert.equal(a.fuenteProductos, 'catalogo');
  // Todo el negocio sale del catálogo: facturación de las compras por etiqueta; ROAS con la inversión de los embudos
  assert.equal(a.numeros.facturacion, 8 * 697 + 4 * 997 + 20 * 27);
  assert.equal(a.numeros.clientes, 27);
  assert.equal(a.numeros.roas, (8 * 697 + 4 * 997 + 20 * 27) / 3000);
  assert.equal(a.recompra.repiten, 5);
  assert.deepEqual(a.recompra.caminos[0], { camino: 'Reto Ovulación → Raíces', n: 5 });
  // Hasta la segunda compra: 69 días (del reto en marzo al lanzamiento de mayo), en el tramo «1-3 meses»
  assert.equal(a.recompra.diasSegunda, 69);
  assert.equal(a.recompra.tramosSegunda.find((t) => t.id === 's90').n, 5);
  // Ventas cruzadas en %: 15 de 27 solo el reto, 7 solo Raíces, 5 los dos; de las 20 del reto, 15 (75 %) aún sin Raíces
  assert.equal(a.cruzadas.clientes, 27);
  assert.deepEqual(a.cruzadas.combinaciones.map((c) => [c.nombres.join(' + '), c.n]), [['Reto Ovulación', 15], ['Raíces', 7], ['Reto Ovulación + Raíces', 5]]);
  assert.equal(a.cruzadas.combinaciones[2].pct, 5 / 27);
  assert.deepEqual(a.cruzadas.cruces[0], { de: 'reto', a: 'raices', base: 20, tienen: 5, pct: 0.25, faltan: 15, pctFaltan: 0.75, deNombre: 'Reto Ovulación', aNombre: 'Raíces' });
  // Más cifras y «Mejora tus datos»
  assert.equal(a.numeros.ticket, a.numeros.facturacion / a.numeros.ventas);
  assert.equal(a.numeros.conversion, 12 / 600);
  assert.ok(a.calidad.total >= 5 && a.calidad.items.some((x) => x.id === 'prod-fecha' && !x.ok));
  assert.deepEqual(a.productos.map((p) => p.nombre), ['Raíces', 'Reto Ovulación']);
  const raices = a.productos[0];
  assert.equal(raices.ventas, 12);
  assert.equal(raices.facturacion, 8 * 697 + 4 * 997);
  assert.equal(raices.ofertas.find((o) => o.id === 'o-bf').ventas, 8);
  assert.equal(raices.roas, (8 * 697 + 4 * 997) / 3000);
  assert.equal(raices.conversion, 12 / 600);
  assert.ok(raices.recomendaciones.some((r) => /La mayoría lo compra con oferta/.test(r.titulo)));
  assert.deepEqual(raices.antes.top[0], { nombre: 'Reto Ovulación', n: 5 });
  // Su propio ciclo de compra (de su embudo: 2 días del registro a la compra)
  assert.deepEqual({ n: raices.ciclo.n, mediana: raices.ciclo.mediana }, { n: 12, mediana: 2 });
  assert.equal(raices.ciclo.tramos.find((t) => t.id === 'd3').n, 12);
  const reto = a.productos[1];
  assert.equal(reto.ventas, 20);
  assert.deepEqual({ n: reto.objetivo.n, pct: reto.objetivo.pct, nombre: reto.objetivo.nombre }, { n: 5, pct: 0.25, nombre: 'Raíces' });
  assert.equal(reto.objetivo.dias, 69);
  assert.ok(reto.recomendaciones.some((r) => /acaba comprando «Raíces»/.test(r.titulo)));
  // Sin «siguiente» en un producto de entrada, se le pide
  const b = agregar(piezas, { hoy, embudos, catalogo: { ivaPct: 21, productos: productos.map((p) => ({ ...p, siguiente: '' })), fotos } });
  assert.ok(b.productos.find((p) => p.nombre === 'Reto Ovulación').recomendaciones.some((r) => /A qué producto quieres llevarles/.test(r.titulo)));
});

test('productos: se rellenan solos desde los embudos (lanzamiento, venta directa que lleva al principal y meteórico)', () => {
  const config = {
    marca: { producto: 'Raíces' },
    embudos: [{ id: 'lanz', tipo: 'lanzamientos', nombre: 'Lanzamientos' }, { id: 'reto', tipo: 'directa', nombre: 'Reto Ovulación' }, { id: 'vsl', tipo: 'vsl', nombre: 'VSL' }],
    launches: {
      oct: { name: 'Octubre', embudo: 'lanz', inicioCaptacion: '2026-10-01', compraTag: 'clienta-raices', precioPrograma: 997, iva: { programa: 'incluido' }, compraDateField: 'fc' },
      may: { name: 'Mayo', embudo: 'lanz', inicioCaptacion: '2026-05-01', compraTag: 'raices-mayo', precioPrograma: 897 },
    },
    vsls: { vsl: { name: 'VSL Raíces', compraTag: 'et-compra-raices-vsl', precioPrograma: 797 } },
    directas: { reto: { producto: 'Reto Ovulación', precio: 27, iva: { producto: 'exento' }, compraTag: 'compra-reto', upsellPrincipal: { tags: ['clienta-raices'] } } },
    meteoricos: { m1: { name: 'Flash', producto: 'Masterclass', precio: 47, compraTag: 'compra-flash', embudo: 'lanz' } },
  };
  const c = catalogoDesdeConfig(config);
  assert.deepEqual(c.productos.map((p) => p.nombre), ['Raíces', 'Reto Ovulación', 'Masterclass']);
  const raices = c.productos[0];
  assert.deepEqual({ precio: raices.precio, etiqueta: raices.etiqueta, fecha: raices.fechaCampo, emb: raices.embudos }, { precio: 997, etiqueta: 'clienta-raices', fecha: 'fc', emb: ['lanz', 'vsl'] });
  assert.deepEqual(raices.ofertas.map((o) => [o.nombre, o.precio, o.etiqueta]), [['Mayo', 897, 'raices-mayo'], ['VSL Raíces', 797, 'et-compra-raices-vsl']]);
  const reto = c.productos[1];
  assert.deepEqual({ tipo: reto.tipo, iva: reto.iva, siguiente: reto.siguiente }, { tipo: 'entrada', iva: 'sin', siguiente: raices.id });
  assert.equal(catalogoDesdeConfig({ embudos: [] }).productos.length, 0);
});

test('productos: limpieza del catálogo, precio sin IVA y oferta de cada compra', () => {
  const c = sanitizeCatalogo({ productos: [{ nombre: 'Raíces', precio: '997', iva: 'incluido', etiqueta: ' Clienta-Raices ', ofertas: [{ nombre: 'BF', precio: 697, etiqueta: 'raices-bf' }, { nombre: '' }] }, { nombre: '' }] });
  assert.equal(c.productos.length, 1);
  const p = c.productos[0];
  assert.equal(p.etiqueta, 'clienta-raices');
  assert.equal(p.ofertas.length, 1);
  assert.equal(sinIva(121, 'incluido', 21), 100);
  assert.deepEqual(compraDe(['clienta-raices', 'raices-bf'], p, 21), { oferta: p.ofertas[0].id, importe: sinIva(697, 'incluido', 21) });
  assert.deepEqual(compraDe(['clienta-raices'], p, 21), { oferta: '', importe: sinIva(997, 'incluido', 21) });
  assert.equal(compraDe(['otra'], p, 21), null);
  assert.deepEqual(faltasProducto({ ...p, ofertas: [{ nombre: 'X', precio: 1, etiqueta: '' }] }), ['la etiqueta de la oferta «X»']);
});

test('inteligencia de negocio: la API calcula pieza a pieza hasta completar el histórico', async () => {
  const admin = cookieDe(await call('/api/login', { method: 'POST', body: { password: 'admin' } }));
  const c = (await call('/api/config', { cookie: admin })).data;
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...c.config, _version: c.version, launches: { demo: { name: 'Octubre', embudo: 'lanz', registroTag: 'registro-webinar-demo', vipTag: 'compra-vip-demo', compraTag: 'clienta-raices', precioVip: 27, precioPrograma: 997, inicioCaptacion: '2026-09-28', fechaDirecto: '2026-10-20' } } } });
  let d;
  let vueltas = 0;
  do { d = (await call('/api/negocio?periodo=12m', { cookie: admin })).data; vueltas++; } while (d.pendientes > 0 && vueltas < 30);
  assert.equal(d.pendientes, 0, JSON.stringify(d).slice(0, 300));
  assert.ok(d.total >= 2);
  assert.equal(d.vacio, false);
  assert.ok(d.numeros.facturacion > 0);
  assert.ok(d.embudos.length >= 1);
  // La siguiente visita ya no recalcula nada
  const otra = (await call('/api/negocio?periodo=todo', { cookie: admin })).data;
  assert.equal(otra.pendientes, 0);
  // Sin productos guardados, se ponen solos los de sus embudos (el del lanzamiento, con su etiqueta de compra)
  const sembrado = (await call('/api/productos', { cookie: admin })).data.catalogo;
  assert.ok(sembrado.productos.some((p) => p.etiqueta === 'clienta-raices' && p.tipo === 'principal' && p.precio === 997), JSON.stringify(sembrado).slice(0, 300));
  // Con productos en Mi negocio → Productos, salen de ahí (compras por su etiqueta)
  const g = await call('/api/productos', { method: 'POST', cookie: admin, body: { catalogo: { productos: [{ nombre: 'Raíces', precio: 997, iva: 'sin', etiqueta: 'clienta-raices', embudos: ['lanz'] }] } } });
  assert.equal(g.status, 200);
  assert.equal((await call('/api/productos', { cookie: admin })).data.catalogo.productos[0].nombre, 'Raíces');
  let e;
  vueltas = 0;
  do { e = (await call('/api/negocio?periodo=todo', { cookie: admin })).data; vueltas++; } while (e.pendientes > 0 && vueltas < 5);
  assert.equal(e.fuenteProductos, 'catalogo');
  const raices = e.productos.find((p) => p.nombre === 'Raíces');
  assert.ok(raices.ventas > 0 && raices.facturacion === raices.ventas * 997, JSON.stringify(raices).slice(0, 200));
  // Sin sesión, no; el rol Cliente sí (solo mirar); un setter (sin Métricas), no
  assert.equal((await call('/api/negocio')).status, 401);
  const entra = async (email, rol) => {
    const u = (await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'crear', nombre: rol, email, rol, enviar: false } })).data;
    return cookieDe(await call('/api/login', { method: 'POST', body: { email, password: u.password } }));
  };
  assert.equal((await call('/api/negocio', { cookie: await entra('cli@ejemplo.com', 'cliente') })).status, 200);
  const setter = await entra('set@ejemplo.com', 'setter');
  assert.equal((await call('/api/negocio', { cookie: setter })).status, 403);
  assert.equal((await call('/api/productos', { method: 'POST', cookie: setter, body: { catalogo: { productos: [] } } })).status, 403);
});
