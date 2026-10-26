import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeCruzada, productosDe, pasaFiltro, oportunidades, pendientesCruzada, productosListos, etiquetasX, ofertaPara, ofertasPropuestas, combinaciones, cruces,
  prioritarioDe, comercialDe, totalReparto, repartoIgual, porCantidad,
} from '../public/js/cruzadas.js';

test('ventas cruzadas: productos con su etiqueta, qué tiene cada alumno, filtros y a quién ofrecer qué', () => {
  const c = sanitizeCruzada({ name: '<b>Cruzadas</b>', productos: [
    { id: 'reto', nombre: 'Reto ovulación', tag: ' Compra-Reto ', otras: ['reto-oferta', { tag: 'compra-reto' }, ''] },
    { id: 'raices', nombre: 'Raíces', tag: 'clienta-raices' },
    { nombre: 'Sin etiqueta' },
    { nombre: '', tag: '' },
  ] });
  assert.equal(c.name, 'bCruzadas/b');
  assert.equal(c.productos.length, 3); // el vacío fuera
  assert.equal(c.productos[0].tag, 'compra-reto');
  assert.deepEqual(c.productos[0].otras, [{ tag: 'reto-oferta' }]); // sin repetir la principal ni vacías
  assert.deepEqual(etiquetasX(c.productos[0]), ['compra-reto', 'reto-oferta']);
  assert.deepEqual(productosListos(c).map((p) => p.id), ['reto', 'raices']);
  assert.deepEqual(pendientesCruzada(c), ['«Sin etiqueta» no tiene etiqueta de compra.']);
  assert.ok(pendientesCruzada({ productos: [] })[0].includes('al menos 2'));

  const prods = productosListos(c);
  const al = (id, tags, extra = {}) => ({ id, name: id, email: `${id}@x.es`, phone: '+34 600 11 22 33', tiene: productosDe({ tags }, prods), ...extra });
  const ana = al('ana', ['Reto-Oferta']); // por la otra etiqueta, y sin importar mayúsculas
  const bea = al('bea', ['compra-reto', 'clienta-raices']);
  const cris = al('cris', ['clienta-raices']);
  assert.deepEqual(ana.tiene, ['reto']);
  assert.deepEqual(bea.tiene, ['reto', 'raices']);
  // Tiene el reto y no Raíces → Ana
  assert.deepEqual([ana, bea, cris].filter((a) => pasaFiltro(a, { reto: 'si', raices: 'no' })).map((a) => a.id), ['ana']);
  assert.deepEqual([ana, bea, cris].filter((a) => pasaFiltro(a, {}, 'bea')).map((a) => a.id), ['bea']);
  assert.ok(pasaFiltro(ana, {}, '600 11')); // por teléfono
  assert.deepEqual(oportunidades([ana, bea, cris], prods), [{ tiene: 'reto', falta: 'raices', n: 1 }, { tiene: 'raices', falta: 'reto', n: 1 }]);
});

test('ventas cruzadas: ofertas por tipo de alumno, Hoy/Llamadas y porcentajes (combinaciones y paso entre productos)', () => {
  const c = sanitizeCruzada({ productos: [{ id: 'reto', nombre: 'Reto', tag: 'r' }, { id: 'raices', nombre: 'Raíces', tag: 'ra' }, { id: 'sueno', nombre: 'Sueño', tag: 's' }],
    ofertas: [{ tiene: 'reto', ofrece: 'raices', precio: '297 €', mensaje: 'Hola {nombre} <b>' }, { tiene: 'reto', ofrece: 'reto' }, { tiene: 'nada', ofrece: 'raices' }, { tiene: 'raices', ofrece: 'sueno' }],
    llamadas: true, llamadaUrl: 'http://inseguro.es', llamadasPipeline: 'Cruzadas 2026' });
  assert.equal(c.ofertas.length, 2); // fuera la que ofrece lo mismo y la de un producto que no existe
  assert.equal(c.ofertas[0].mensaje, 'Hola {nombre} b');
  assert.equal(c.llamadas, true);
  assert.equal(c.llamadaUrl, ''); // solo https
  assert.equal(c.llamadasPipeline, 'Cruzadas 2026');
  assert.equal(sanitizeCruzada({}).llamadas, false);
  const a = (tiene) => ({ tiene });
  assert.equal(ofertaPara(a(['reto']), c.ofertas).ofrece, 'raices');
  assert.equal(ofertaPara(a(['reto', 'raices']), c.ofertas).ofrece, 'sueno'); // ya tiene Raíces: la siguiente que le encaja
  assert.equal(ofertaPara(a(['reto', 'raices', 'sueno']), c.ofertas), null);
  const prods = productosListos(c);
  const alumnos = [a(['reto']), a(['reto']), a(['reto', 'raices']), a(['raices']), a(['reto', 'raices', 'sueno'])];
  // Combinaciones exactas en % de los alumnos
  const comb = combinaciones(alumnos, prods);
  assert.deepEqual(comb[0], { ids: ['reto'], n: 2, pct: 0.4 });
  assert.equal(comb.reduce((t, x) => t + x.n, 0), 5);
  // De quien tiene el reto (4): 2 ya tienen Raíces (50 %) y a 2 les falta
  const reto2raices = cruces(alumnos, prods).find((x) => x.de === 'reto' && x.a === 'raices');
  assert.deepEqual(reto2raices, { de: 'reto', a: 'raices', base: 4, tienen: 2, pct: 0.5, faltan: 2, pctFaltan: 0.5 });
  assert.equal(cruces(alumnos, prods)[0].faltan, 3); // de más a menos oportunidad (reto → sueño)
  // Propuestas de oferta: una por producto de partida, sin repetir las que ya hay
  const prop = ofertasPropuestas(alumnos, prods, []);
  assert.equal(new Set(prop.map((o) => o.tiene)).size, prop.length);
  assert.ok(!ofertasPropuestas(alumnos, prods, prop).length);
});

test('ventas cruzadas: producto prioritario, reparto entre comerciales y % por cuántos productos', () => {
  const c = sanitizeCruzada({ productos: [{ id: 'reto', nombre: 'Reto', tag: 'r', prioritario: true }, { id: 'raices', nombre: 'Raíces', tag: 'ra', prioritario: true }, { id: 'sueno', nombre: 'Sueño', tag: 's' }],
    ofertas: [{ tiene: 'reto', ofrece: 'sueno', precio: '50 €' }, { tiene: 'sueno', ofrece: 'raices', precio: '797 €' }],
    comerciales: [{ nombre: 'Ana', uid: 'u1', pct: 60 }, { nombre: 'Luis', pct: 40.4 }, { nombre: '', pct: 10 }, { nombre: 'Eva', pct: 300 }] });
  // Solo un prioritario (el primero marcado)
  assert.deepEqual(c.productos.map((p) => p.prioritario), [true, false, false]);
  assert.equal(prioritarioDe(c), 'reto');
  // Comerciales: sin nombre fuera, % entre 0 y 100
  assert.deepEqual(c.comerciales.map((x) => [x.nombre, x.uid, x.pct]), [['Ana', 'u1', 60], ['Luis', '', 40], ['Eva', '', 100]]);
  assert.equal(totalReparto(c.comerciales), 200);
  // Con prioritario: a quien no lo tiene, SIEMPRE ese primero (aunque haya otra oferta que le encaje)
  const of = ofertaPara({ tiene: ['sueno'] }, c.ofertas, 'reto');
  assert.equal(of.ofrece, 'reto');
  assert.equal(of.prioritaria, true);
  assert.equal(ofertaPara({ tiene: ['reto'] }, c.ofertas, 'reto').ofrece, 'sueno'); // ya lo tiene: la oferta normal
  // Si una oferta lleva al prioritario, se usa esa (con su precio)
  assert.equal(ofertaPara({ tiene: ['sueno'] }, c.ofertas, 'raices').precio, '797 €');
  // Reparto: siempre el mismo comercial para el mismo alumno, y en proporción a su %
  const cs = [{ id: 'a', pct: 70 }, { id: 'b', pct: 30 }];
  assert.equal(comercialDe('abc123', cs).id, comercialDe('abc123', cs).id);
  const n = { a: 0, b: 0 };
  for (let i = 0; i < 5000; i++) n[comercialDe(`c${i}x`, cs).id]++;
  assert.ok(Math.abs(n.a / 5000 - 0.7) < 0.03, JSON.stringify(n));
  assert.equal(comercialDe('x', []), null);
  assert.deepEqual(repartoIgual(3), [34, 33, 33]);
  assert.equal(repartoIgual(7).reduce((t, x) => t + x, 0), 100);
  // % de alumnos con 1, 2… y todos los productos
  const prods = productosListos(c);
  const cant = porCantidad([{ tiene: ['reto'] }, { tiene: ['reto'] }, { tiene: ['reto', 'sueno'] }, { tiene: ['reto', 'raices', 'sueno'] }], prods);
  assert.deepEqual(cant.map((x) => [x.n, x.alumnos, x.pct, x.todos]), [[1, 2, 0.5, false], [2, 1, 0.25, false], [3, 1, 0.25, true]]);
  // Propuestas de oferta: con prioritario, primero hacia él
  assert.equal(ofertasPropuestas([{ tiene: ['sueno'] }, { tiene: ['raices'] }], prods, [], 'reto')[0].ofrece, 'reto');
});

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

test('ventas cruzadas (API): se crea el embudo, sus etiquetas valen para leer alumnos y tiene sus tareas', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  // Antes de configurarlo, esa etiqueta no es de ningún embudo
  assert.equal((await call('/api/leads?tag=upsell-curso-sueno', { cookie: admin })).status, 403);
  const c = (await call('/api/config', { cookie: admin })).data;
  const r = await call('/api/config', { method: 'POST', cookie: admin, body: { ...c.config, _version: c.version,
    embudos: [...c.config.embudos, { id: 'cruzadas', tipo: 'cruzadas', nombre: 'Ventas cruzadas' }],
    cruzadas: { cruzadas: { name: 'Ventas cruzadas', productos: [{ nombre: 'Raíces', tag: 'clienta-raices', otras: [{ tag: 'et-compra-raices-vsl' }] }, { nombre: 'Curso del sueño', tag: 'upsell-curso-sueno' }] } } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.config.embudos.some((e) => e.id === 'cruzadas' && e.tipo === 'cruzadas'));
  assert.equal(r.data.config.cruzadas.cruzadas.productos.length, 2);
  // Ya se pueden leer sus alumnos por cada etiqueta (también las «otras»)
  for (const tag of ['clienta-raices', 'et-compra-raices-vsl', 'upsell-curso-sueno']) assert.equal((await call(`/api/leads?tag=${tag}`, { cookie: admin })).status, 200, tag);
  // Sus tareas de partida
  const t = await call('/api/tareas', { method: 'POST', cookie: admin, body: { l: 'cruzadas', op: 'plantilla' } });
  assert.equal(t.status, 200, JSON.stringify(t.data));
  assert.ok(t.data.tareas.some((x) => x.titulo.includes('guion de llamada')));
  // Un embudo «cruzadas» sin su configuración no se guarda en el menú
  const c2 = (await call('/api/config', { cookie: admin })).data;
  const r2 = await call('/api/config', { method: 'POST', cookie: admin, body: { ...c2.config, _version: c2.version, embudos: [...c2.config.embudos, { id: 'otro-x', tipo: 'cruzadas', nombre: 'X' }] } });
  assert.ok(!r2.data.config.embudos.some((e) => e.id === 'otro-x'));
});

test('ventas cruzadas (API): pipelines para elegir y el tablero de «Hoy» por fases', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const p = await call('/api/cruzadas?parte=pipelines', { cookie: admin });
  assert.equal(p.status, 200);
  assert.ok(p.data.pipelines.some((x) => x.nombre === 'Leads Lanzamientos' && x.etapas.length));
  assert.equal((await call('/api/cruzadas?x=no-existe', { cookie: admin })).status, 404);
  // Sin pipeline «Ventas cruzadas» en GHL: lo dice (para recomendar crearlo)
  const c = (await call('/api/config', { cookie: admin })).data;
  const base = { name: 'Ventas cruzadas', productos: [{ nombre: 'Raíces', tag: 'clienta-raices' }, { nombre: 'Sueño', tag: 'upsell-curso-sueno' }], llamadas: true, llamadasPipeline: 'Cruzadas 2027' };
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...c.config, _version: c.version,
    embudos: [...c.config.embudos.filter((e) => e.id !== 'xh'), { id: 'xh', tipo: 'cruzadas', nombre: 'X Hoy' }], cruzadas: { ...c.config.cruzadas, xh: base } } });
  const sin = await call('/api/cruzadas?x=xh', { cookie: admin });
  assert.deepEqual(sin.data, { motivo: 'sin_pipeline', buscado: 'Cruzadas 2027' });
  // Con un pipeline elegido: sus fases con los alumnos de cada una
  const c2 = (await call('/api/config', { cookie: admin })).data;
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...c2.config, _version: c2.version, cruzadas: { ...c2.config.cruzadas, xh: { ...base, llamadasPipeline: 'Leads Lanzamientos' } } } });
  const hoy = await call('/api/cruzadas?x=xh&fresh=1', { cookie: admin });
  assert.equal(hoy.status, 200, JSON.stringify(hoy.data));
  assert.equal(hoy.data.pipeline.nombre, 'Leads Lanzamientos');
  assert.ok(hoy.data.etapas.length);
  assert.equal(hoy.data.total, hoy.data.etapas.reduce((t, e) => t + e.n, 0));
  // Sin sesión, nada
  assert.equal((await call('/api/cruzadas?x=xh')).status, 401);
});

test('ventas cruzadas (API): sus productos entran solos en Mi negocio → Productos', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const antes = (await call('/api/productos', { cookie: admin })).data.catalogo.productos;
  const c = (await call('/api/config', { cookie: admin })).data;
  const r = await call('/api/config', { method: 'POST', cookie: admin, body: { ...c.config, _version: c.version,
    embudos: [...c.config.embudos.filter((e) => e.id !== 'xcat'), { id: 'xcat', tipo: 'cruzadas', nombre: 'X Cat' }],
    cruzadas: { ...c.config.cruzadas, xcat: { name: 'X Cat', productos: [{ nombre: 'Mentoría VIP', tag: 'compra-mentoria', otras: [{ tag: 'mentoria-bf' }] }, { nombre: 'Taller', tag: 'compra-taller-x' }] } } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.catalogoNuevos, 2);
  const cat = (await call('/api/productos', { cookie: admin })).data.catalogo.productos;
  assert.equal(cat.length, antes.length + 2);
  const m = cat.find((p) => p.nombre === 'Mentoría VIP');
  assert.equal(m.etiqueta, 'compra-mentoria');
  assert.deepEqual(m.ofertas.map((o) => o.etiqueta), ['mentoria-bf']);
  assert.deepEqual(m.embudos, ['xcat']);
  // Volver a guardar no los duplica
  const c2 = (await call('/api/config', { cookie: admin })).data;
  const r2 = await call('/api/config', { method: 'POST', cookie: admin, body: { ...c2.config, _version: c2.version } });
  assert.equal(r2.data.catalogoNuevos, 0);
  assert.equal((await call('/api/productos', { cookie: admin })).data.catalogo.productos.length, cat.length);
});

test('ventas cruzadas (API): meter a los alumnos en «Por contactar» (sin repetir a los que ya están)', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const c = (await call('/api/config', { cookie: admin })).data;
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...c.config, _version: c.version,
    embudos: [...c.config.embudos.filter((e) => e.id !== 'xpc'), { id: 'xpc', tipo: 'cruzadas', nombre: 'X PC' }],
    cruzadas: { ...c.config.cruzadas, xpc: { name: 'X PC', productos: [{ nombre: 'A', tag: 'clienta-raices' }, { nombre: 'B', tag: 'upsell-curso-sueno' }], llamadas: true, comerciales: [{ nombre: 'Vicky', pct: 100 }] } } } });
  const contactos = [{ id: 'cx1', nombre: 'Ana Díaz' }, { id: 'cx2', nombre: 'Eva Ruiz' }];
  const r = await call('/api/cruzadas', { method: 'POST', cookie: admin, body: { op: 'por-contactar', x: 'xpc', contactos } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual([r.data.creados, r.data.yaEstaban, r.data.etapa, r.data.pipeline], [2, 0, 'Por contactar', 'Ventas cruzadas']);
  // Otra vez: ya estaban, no se duplican
  const r2 = await call('/api/cruzadas', { method: 'POST', cookie: admin, body: { op: 'por-contactar', x: 'xpc', contactos } });
  assert.deepEqual([r2.data.creados, r2.data.yaEstaban], [0, 2]);
  // Salen en «Hoy», en «Por contactar», con el comercial en el nombre
  const hoy = await call('/api/cruzadas?x=xpc&fresh=1', { cookie: admin });
  const pc = hoy.data.etapas.find((e) => e.nombre === 'Por contactar');
  assert.equal(pc.n, 2);
  assert.ok(pc.items.some((it) => it.nombre === 'Ana Díaz · Vicky'));
  // Como mucho 20 por tanda, y solo quien configura
  const muchos = Array.from({ length: 30 }, (_, i) => ({ id: `cy${i}`, nombre: `P${i}` }));
  assert.equal((await call('/api/cruzadas', { method: 'POST', cookie: admin, body: { op: 'por-contactar', x: 'xpc', contactos: muchos } })).data.creados, 20);
  const setter = (await call('/api/login', { method: 'POST', body: { password: 'setter' } })).res.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/cruzadas', { method: 'POST', cookie: setter, body: { op: 'por-contactar', x: 'xpc', contactos } })).status, 403);
});

test('ventas cruzadas (API): «Mover de etapa» con las mismas opciones que una llamada (y nota en GHL)', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const c = (await call('/api/config', { cookie: admin })).data;
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...c.config, _version: c.version,
    embudos: [...c.config.embudos.filter((e) => e.id !== 'xmv'), { id: 'xmv', tipo: 'cruzadas', nombre: 'X MV' }],
    cruzadas: { ...c.config.cruzadas, xmv: { name: 'X MV', productos: [{ nombre: 'A', tag: 'clienta-raices' }], llamadas: true } } } });
  const mover = (body, cookie = admin) => call('/api/cruzadas', { method: 'POST', cookie, body: { op: 'mover', x: 'xmv', ...body } });
  // Sin oportunidad: se crea en la fase del resultado
  const r = await mover({ contactId: 'cmv1', nombre: 'Luz Mar', resultado: 'seguimiento', notas: 'Llamar el lunes' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.etapa.nombre, 'Seguimiento');
  // Con oportunidad: se mueve; «No contesta» avanza 1 → 2
  assert.equal((await mover({ contactId: 'cmv1', resultado: 'noshow' })).data.etapa.nombre, 'No contesta 1');
  assert.equal((await mover({ contactId: 'cmv1', resultado: 'noshow' })).data.etapa.nombre, 'No contesta 2');
  assert.equal((await mover({ contactId: 'cmv1', resultado: 'venta' })).data.etapa.nombre, 'Venta');
  const hoy = await call('/api/cruzadas?x=xmv&fresh=1', { cookie: admin });
  assert.equal(hoy.data.etapas.find((e) => e.nombre === 'Venta').items.filter((it) => it.contactId === 'cmv1').length, 1);
  // «No compra» pide motivo; resultado o contacto no válidos, fuera
  assert.equal((await mover({ contactId: 'cmv1', resultado: 'perdido' })).status, 400);
  assert.equal((await mover({ contactId: 'cmv1', resultado: 'perdido', motivo: 'Precio' })).data.etapa.nombre, 'Perdido');
  assert.equal((await mover({ contactId: 'cmv1', resultado: 'otro' })).status, 400);
  assert.equal((await mover({ contactId: '../x', resultado: 'venta' })).status, 400);
  // La setter (con Hoy/Llamadas) también puede moverlos
  const setter = (await call('/api/login', { method: 'POST', body: { password: 'setter' } })).res.headers.get('set-cookie').split(';')[0];
  assert.equal((await mover({ contactId: 'cmv2', resultado: 'seguimiento' }, setter)).status, 200);
  // A cualquier fase del pipeline por su id (al arrastrar la tarjeta o desde «Mover de etapa»)
  const etapas = hoy.data.etapas;
  const porContactar = etapas.find((e) => /por contactar/i.test(e.nombre)) || etapas[0];
  const m = await mover({ contactId: 'cmv1', etapa: porContactar.id });
  assert.equal(m.status, 200, JSON.stringify(m.data));
  assert.deepEqual([m.data.etapa.id, m.data.status], [porContactar.id, 'open']);
  const venta = etapas.find((e) => e.nombre === 'Venta');
  assert.equal((await mover({ contactId: 'cmv1', etapa: venta.id })).data.status, 'won');
  assert.equal((await mover({ contactId: 'cmv1', etapa: 'otraFase' })).status, 400);
  const tras = await call('/api/cruzadas?x=xmv&fresh=1', { cookie: admin });
  assert.ok(tras.data.etapas.find((e) => e.id === venta.id).items.some((it) => it.contactId === 'cmv1'));
});

test('venta directa (API): Comercial → Llamadas usa el pipeline elegido en el embudo', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const c = (await call('/api/config', { cookie: admin })).data;
  const guardar = async (directa) => {
    const cur = (await call('/api/config', { cookie: admin })).data;
    return call('/api/config', { method: 'POST', cookie: admin, body: { ...cur.config, _version: cur.version,
      embudos: [...cur.config.embudos.filter((e) => e.id !== 'dll'), { id: 'dll', tipo: 'directa', nombre: 'D LL' }],
      directas: { ...(cur.config.directas || {}), dll: directa } } });
  };
  void c;
  // Sin calendario: dice dónde ponerlo
  await guardar({ name: 'D LL', precio: 27, compraTag: 'compra-guia-sueno' });
  const sin = await call('/api/llamadas?l=dll', { cookie: admin });
  assert.equal(sin.data.configurado, false);
  assert.match(sin.data.motivo, /Enlace para reservar llamada/);
  // Con calendario y el pipeline de la oportunidad de compra elegido
  const r = await guardar({ name: 'D LL', precio: 27, compraTag: 'compra-guia-sueno', llamadaUrl: 'https://api.leadconnectorhq.com/widget/booking/cal123', compraPipeline: 'pipeLanz' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const ll = await call('/api/llamadas?l=dll', { cookie: admin });
  assert.equal(ll.status, 200, JSON.stringify(ll.data));
  assert.equal(ll.data.pipeline?.name, 'Leads Lanzamientos');
  // Sin pipeline elegido: «Leads evergreen»
  await guardar({ name: 'D LL', precio: 27, compraTag: 'compra-guia-sueno', llamadaUrl: 'https://api.leadconnectorhq.com/widget/booking/cal123' });
  assert.equal((await call('/api/llamadas?l=dll', { cookie: admin })).data.pipeline?.name, 'Leads evergreen');
});
