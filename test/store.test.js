import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let store, ghl, env, d1;
before(async () => {
  env = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  d1 = crearD1Local();
  env.setEnv({ GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SESSION_SECRET: 'test-secret-test-secret', DB: d1 });
  store = await import('../lib/store.js');
  ghl = await import('../lib/ghl.js');
});

test('store: migra desde GHL la primera vez y después ya no lo mira', async () => {
  await ghl.saveCustomValue('lsd_prueba', '{"a":1}');
  const r = await store.storeGet('lsd_prueba');
  assert.deepEqual(r, { value: '{"a":1}', version: 1 });
  await ghl.saveCustomValue('lsd_prueba', '{"a":2}'); // lo que cambie en GHL ya no cuenta
  assert.equal((await store.storeGet('lsd_prueba')).value, '{"a":1}');
  const fila = await d1.prepare('SELECT por FROM datos WHERE clave = ?').bind('lsd_prueba').first();
  assert.equal(fila.por, 'migración desde GHL');
  assert.equal(await store.storeGet('lsd_no_existe'), null);
});

test('store: guardado con versión detecta que otra persona guardó antes', async () => {
  const a = await store.leerJSON('lsd_lista', () => []);
  const b = await store.leerJSON('lsd_lista', () => []);
  a.push('de A');
  await store.guardarJSON('lsd_lista', a, { motivo: 'A' });
  b.push('de B');
  await assert.rejects(store.guardarJSON('lsd_lista', b), (e) => e.conflicto && e.status === 409);
  // Con reintento, B vuelve a leer y aplica su cambio sobre lo de A
  await store.reintentando(async () => {
    const l = await store.leerJSON('lsd_lista', () => []);
    l.push('de B');
    await store.guardarJSON('lsd_lista', l);
  });
  assert.deepEqual(await store.leerJSON('lsd_lista'), ['de A', 'de B']);
  // Sin versión (null) guarda siempre
  await store.storeSet('lsd_lista', '["x"]', { version: null });
  assert.deepEqual(await store.leerJSON('lsd_lista'), ['x']);
});

test('store: historial de cambios y copia del valor anterior', async () => {
  const { runCliente, principal } = await import('../lib/cliente.js');
  await runCliente(principal(), async () => {
    const { setActor } = await import('../lib/cliente.js');
    setActor('Sara');
    await store.storeSet('lsd_hist', 'v1', { motivo: 'primero' });
    await store.storeSet('lsd_hist', 'v2', { motivo: 'segundo' });
    await store.storeSet('lsd_hist', 'v3', { motivo: 'tercero' });
    await store.storeSet('lsd_hist', 'v3'); // sin cambios: no cuenta
  });
  const hist = (await d1.prepare('SELECT version, por, motivo FROM historial WHERE clave = ? ORDER BY id').bind('lsd_hist').all()).results;
  assert.deepEqual(hist.map((h) => [h.version, h.por, h.motivo]), [[1, 'Sara', 'primero'], [2, 'Sara', 'segundo'], [3, 'Sara', 'tercero']]);
  // Una copia como mucho cada ~día: la de v1 (antes del segundo cambio)
  const copias = (await d1.prepare('SELECT version, valor FROM copias WHERE clave = ?').bind('lsd_hist').all()).results;
  assert.deepEqual(copias, [{ version: 1, valor: 'v1' }]);
});

test('store: lo común (usuarios) va a la agencia, lo demás al cliente', async () => {
  await store.storeSet('lsd_usuarios', '[]');
  await store.storeSet('lsd_tareas_x', '[]');
  const filas = (await d1.prepare("SELECT cliente, clave FROM datos WHERE clave IN ('lsd_usuarios', 'lsd_tareas_x') ORDER BY clave").all()).results;
  assert.deepEqual(filas.map((f) => [f.clave, f.cliente === store.AGENCIA]), [['lsd_tareas_x', false], ['lsd_usuarios', true]]);
});

test('store: sin D1 todo sigue en GHL', async () => {
  const guardado = env.bindings.DB;
  env.bindings.DB = undefined;
  try {
    assert.equal(store.usaD1(), false);
    assert.equal(await store.storeSet('lsd_sin_d1', 'hola'), null);
    assert.equal((await ghl.getCustomValue('lsd_sin_d1')).value, 'hola');
    assert.deepEqual(await store.storeGet('lsd_sin_d1'), { value: 'hola', version: null });
  } finally {
    env.bindings.DB = guardado;
  }
});

test('historial: cambios, copias, restaurar y exportar (solo admin; agencia solo superadmin)', async () => {
  const { route } = await import('../lib/router.js');
  const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret', DB: d1 };
  const call = async (path, { method = 'GET', body, cookie } = {}) => {
    const res = await route(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'text/plain' }, body: body ? JSON.stringify(body) : undefined }), ENV);
    return { status: res.status, res, data: res.headers.get('content-type')?.includes('json') ? await res.clone().json().catch(() => null) : null };
  };
  const cookie = async (password) => (await call('/api/login', { method: 'POST', body: { password } })).res.headers.get('set-cookie').split(';')[0];
  const admin = await cookie('admin');
  const setter = await cookie('setter');
  // Dos cambios en el calendario de un lanzamiento
  const cfg = (await call('/api/config', { cookie: admin })).data;
  const code = 'hist';
  assert.equal((await call('/api/config', { method: 'POST', cookie: admin, body: { ...cfg.config, launches: { ...cfg.config.launches, hist: { name: 'Historial', registroTag: 'registro-hist' } } } })).status, 200);
  const ev = { titulo: 'Directo de prueba', fecha: '2026-11-03', tipo: 'directo' };
  assert.equal((await call('/api/eventos', { method: 'POST', cookie: admin, body: { l: code, op: 'crear', evento: ev } })).status, 200);
  assert.equal((await call('/api/eventos', { method: 'POST', cookie: admin, body: { l: code, op: 'crear', evento: { ...ev, titulo: 'Otro' } } })).status, 200);
  assert.equal((await call('/api/historial', { cookie: setter })).status, 403);
  const h = (await call('/api/historial', { cookie: admin })).data;
  assert.equal(h.disponible, true);
  const mio = h.cambios.find((c) => c.clave === `lsd_eventos_${code}`);
  assert.equal(mio.por, 'Contraseña general (admin)');
  assert.match(mio.etiqueta, /Eventos del calendario/);
  const copia = h.copias.find((c) => c.clave === `lsd_eventos_${code}`);
  assert.ok(copia);
  // Restaurar la copia (con un solo evento) y deshacer
  assert.equal((await call('/api/historial', { method: 'POST', cookie: admin, body: { op: 'restaurar', id: copia.id } })).status, 200);
  const eventos = (await call(`/api/eventos?l=${code}`, { cookie: admin })).data.eventos;
  assert.deepEqual(eventos.map((e) => e.titulo), ['Directo de prueba']);
  const otraVez = (await call('/api/historial', { cookie: admin })).data;
  assert.ok(otraVez.cambios[0].motivo.startsWith('Restaurada la copia'));
  // Una copia de la agencia no se restaura desde el ámbito del cliente
  await store.storeSet('lsd_usuarios', '[]');
  await store.storeSet('lsd_usuarios', '[{"id":"x"}]', { forzarCopia: true });
  const deAgencia = (await call('/api/historial?ambito=agencia', { cookie: admin })).data.copias.find((c) => c.clave === 'lsd_usuarios');
  assert.equal((await call('/api/historial', { method: 'POST', cookie: admin, body: { op: 'restaurar', id: deAgencia.id } })).status, 404);
  // Exportar
  const exp = await call('/api/historial?exportar=1', { cookie: admin });
  assert.match(exp.res.headers.get('content-disposition'), /attachment/);
  const json = await exp.res.json();
  assert.ok(json.datos.some((d) => d.clave === `lsd_eventos_${code}` && Array.isArray(d.valor)));
});
