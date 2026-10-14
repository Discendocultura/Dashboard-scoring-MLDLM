import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeColumnas, sanitizeConfigTableros, tablerosDe, tableroDeTarea, columnaDeTarea, colocar, GENERAL } from '../public/js/tableros.js';

test('tableros: columnas (siempre una «hecha»), General de serie y columna de cada tarea', () => {
  const cols = sanitizeColumnas([{ nombre: 'Idea' }, { nombre: 'Guion' }, { nombre: '' }, { nombre: 'Publicado' }]);
  assert.deepEqual(cols.map((c) => [c.nombre, c.hecha]), [['Idea', false], ['Guion', false], ['Publicado', true]]);
  assert.equal(sanitizeColumnas([]).length, 3); // vacío → las de serie
  const cfg = sanitizeConfigTableros({ tableros: [{ id: 'cont', proyecto: 'mldlm', nombre: 'Contenido', columnas: cols }] });
  const tabs = tablerosDe(cfg, 'mldlm');
  assert.deepEqual(tabs.map((b) => b.id), [GENERAL, 'cont']);
  assert.equal(tablerosDe(cfg, 'otro').length, 1);
  const cont = tabs[1];
  assert.equal(tableroDeTarea({ opTablero: 'cont' }, tabs).id, 'cont');
  assert.equal(tableroDeTarea({ opTablero: 'borrado' }, tabs).id, GENERAL);
  assert.equal(columnaDeTarea({ hecha: true }, cont), cols[2].id);
  assert.equal(columnaDeTarea({}, cont), cols[0].id);
  assert.equal(columnaDeTarea({ opColumna: cols[1].id }, cont), cols[1].id);
  assert.equal(columnaDeTarea({ estado: 'revision' }, tabs[0]), 'revision');
  // Hecha pero guardada en una columna que no es de hecha (p. ej. la marcó desde su lanzamiento) → la de hecha.
  assert.equal(columnaDeTarea({ opColumna: cols[0].id, hecha: true }, cont), cols[2].id);
  assert.deepEqual(colocar({}, cont, cols[2].id), { opTablero: 'cont', opColumna: cols[2].id, hecha: true, estado: 'hecha' });
  assert.equal(colocar({}, tabs[0], 'revision').estado, 'revision');
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

test('tableros (API): el superadmin crea un tablero con plantilla, crea tareas en él y las mueve de columna', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const post = (body) => call('/api/operativa', { method: 'POST', cookie: admin, body });
  let r = await post({ op: 'plantilla-guardar', plantilla: { nombre: 'Contenido', columnas: [{ nombre: 'Idea' }, { nombre: 'Edición' }, { nombre: 'Publicado', hecha: true }] } });
  assert.equal(r.data.plantillas.length, 1);
  r = await post({ op: 'tablero-guardar', tablero: { proyecto: 'mldlm', nombre: 'Contenido', columnas: r.data.plantillas[0].columnas } });
  const tab = r.data.tableros.find((b) => b.nombre === 'Contenido');
  assert.ok(tab);
  // Tarea nueva en ese tablero del cliente
  r = await post({ op: 'crear', tarea: { titulo: 'Reel de la clase 1', proyecto: 'mldlm', opTablero: tab.id } });
  const id = r.data.tarea.id;
  let g = (await call('/api/operativa', { cookie: admin })).data;
  let t = g.tareas.find((x) => x.id === id);
  assert.equal(t.cliente, 'mldlm');
  assert.equal(t.opTablero, tab.id);
  assert.ok(g.tableros.some((b) => b.id === tab.id));
  // A «Edición» y después a «Publicado» (cuenta como hecha)
  r = await post({ op: 'columna', cliente: 'mldlm', code: t.code, id, columna: tab.columnas[1].id });
  assert.equal(r.data.tarea.hecha, false);
  r = await post({ op: 'columna', cliente: 'mldlm', code: t.code, id, columna: tab.columnas[2].id });
  assert.equal(r.data.tarea.hecha, true);
  assert.equal(r.data.tarea.estado, 'hecha');
  // Al General (de vuelta sin hacer)
  r = await post({ op: 'columna', cliente: 'mldlm', code: t.code, id, tablero: GENERAL, columna: 'pendiente' });
  assert.equal(r.data.tarea.opTablero, GENERAL);
  assert.equal(r.data.tarea.hecha, false);
  // El General no se borra; el creado, sí (sus tareas vuelven al General)
  assert.equal((await post({ op: 'tablero-borrar', proyecto: 'mldlm', tableroId: GENERAL })).status, 400);
  r = await post({ op: 'tablero-borrar', proyecto: 'mldlm', tableroId: tab.id });
  assert.ok(!r.data.tableros.some((b) => b.id === tab.id));
  // Quien no es de la agencia no entra
  const setter = (await call('/api/login', { method: 'POST', body: { password: 'setter' } })).res.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/operativa', { method: 'POST', cookie: setter, body: { op: 'tablero-guardar', tablero: { proyecto: 'mldlm', nombre: 'X' } } })).status, 403);
});
