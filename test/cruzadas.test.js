import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCruzada, productosDe, pasaFiltro, oportunidades, pendientesCruzada, productosListos, etiquetasX } from '../public/js/cruzadas.js';

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
