import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeCruzada, productosDe, pasaFiltro, oportunidades, pendientesCruzada, productosListos, etiquetasX, ofertaPara, ofertasPropuestas, combinaciones, cruces,
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
  const base = { name: 'Ventas cruzadas', productos: [{ nombre: 'Raíces', tag: 'clienta-raices' }, { nombre: 'Sueño', tag: 'upsell-curso-sueno' }], llamadas: true };
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...c.config, _version: c.version,
    embudos: [...c.config.embudos.filter((e) => e.id !== 'xh'), { id: 'xh', tipo: 'cruzadas', nombre: 'X Hoy' }], cruzadas: { ...c.config.cruzadas, xh: base } } });
  const sin = await call('/api/cruzadas?x=xh', { cookie: admin });
  assert.deepEqual(sin.data, { motivo: 'sin_pipeline', buscado: 'Ventas cruzadas' });
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
