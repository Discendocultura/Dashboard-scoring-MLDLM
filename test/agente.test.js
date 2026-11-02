import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { objetivosDeBrief, ritmoRegistros, piezasLanzamiento, propuestasAgente } from '../public/js/agente.js';

before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  setEnv({ GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret', DIGEST_KEY: 'clave-larga-de-prueba-123', DB: crearD1Local() });
});

const l = { name: 'Nov', inicioCaptacion: '2026-11-01', fechaDirecto: '2026-11-21', horaDirecto: '19:00', aperturaCarrito: '2026-11-21T20:30', cierreCarrito: '2026-11-28T23:59', zoomMeetingId: '', registroUrl: 'https://r', objetivos: { ventas: 40, registros: 2000, inversion: 4000 } };

test('agente: del brief a los objetivos y el ritmo', () => {
  assert.deepEqual(objetivosDeBrief({ ventas: 40, inversion: 4000, conversion: 2 }), { ventas: 40, registros: 2000, inversion: 4000, cplObjetivo: 2, conversion: 2 });
  const r = ritmoRegistros({ registros: 500, objetivo: 2000, inicio: '2026-11-01', fin: '2026-11-20', hoy: '2026-11-10' });
  assert.deepEqual(r, { esperado: 1000, pct: 50, quedan: 10, actualDia: 50, necesarioDia: 150 });
});

test('agente: piezas con su fecha y propuestas (ritmo, coste, piezas atrasadas y regla del carrito)', () => {
  const piezas = piezasLanzamiento(l, { tareas: 0, mensajesGrupo: 0, reglasActivas: 0 });
  assert.ok(piezas.find((p) => p.id === 'registro').hecha);
  assert.deepEqual(piezas.find((p) => p.id === 'zoom1').accion, { tipo: 'zoom', k: 1 });
  assert.equal(piezas.find((p) => p.id === 'zoom1').para, '2026-11-16');
  const p = propuestasAgente({ l, hoy: '2026-11-10', registros: 500, ventas: 0, inversion: 2000, piezas, reglas: [] });
  const t = p.map((x) => x.titulo);
  assert.ok(t.some((x) => /50 % del ritmo/.test(x)), t.join('\n'));
  assert.ok(t.some((x) => /coste por registro va a 4,00/.test(x)));
  assert.ok(t.some((x) => /piezas? sin hacer/.test(x)));
  assert.ok(!t.some((x) => /seguimiento de quien llega al pago/.test(x))); // aún no es el carrito
  const enCarrito = propuestasAgente({ l, hoy: '2026-11-25', registros: 2100, ventas: 10, piezas: [], reglas: [] });
  assert.ok(enCarrito.some((x) => x.accion.tipo === 'regla'));
  assert.ok(enCarrito.some((x) => /mitad del carrito con el 25 %/.test(x.titulo)));
  assert.ok(propuestasAgente({ l: { ...l, objetivos: {} }, hoy: '2026-11-10', piezas: [] }).some((x) => x.accion.tipo === 'brief'));
});

test('agente: brief por la API, propuestas a la bandeja y aprobarlas crea tareas o enciende la regla', async () => {
  const { getConfig, saveConfig } = await import('../lib/config-store.js');
  const actual = await getConfig({ fresh: true });
  await saveConfig({ ...actual, launches: { ...actual.launches, agt: { ...l, registroTag: 'registro-webinar-demo', inicioCaptacion: '2026-10-20', fechaDirecto: '2026-11-03', aperturaCarrito: '2026-11-03T20:30', cierreCarrito: '2099-11-28T23:59' } } });
  const { POST: login } = await import('../handlers/login.js');
  const cookie = (await login(new Request('http://localhost/api/login', { method: 'POST', body: '{"password":"admin"}' }))).headers.get('set-cookie').split(';')[0];
  const { GET, POST } = await import('../handlers/agente.js');
  const r = await (await POST(new Request('http://localhost/api/agente', { method: 'POST', headers: { cookie }, body: JSON.stringify({ op: 'brief', l: 'agt', ventas: 30, inversion: 3000, conversion: 1.5 }) }))).json();
  assert.deepEqual([r.objetivos.ventas, r.objetivos.registros, r.objetivos.inversion], [30, 2000, 3000]);
  const est = await (await GET(new Request('http://localhost/api/agente?l=agt', { headers: { cookie } }))).json();
  assert.ok(est.piezas.length > 5 && est.registros > 0);
  // Pilotaje: a la bandeja (sin repetir)
  const { pilotar } = await import('../lib/agente.js');
  const { leerBandeja, decidir } = await import('../lib/reglas.js');
  const p1 = await pilotar({ avisar: false });
  assert.equal(p1.code, 'agt');
  assert.ok(p1.nuevas >= 1, JSON.stringify(p1));
  assert.equal((await pilotar({ avisar: false })).nuevas, 0);
  const b = await leerBandeja();
  const items = b.items.filter((x) => x.tipo === 'agente');
  for (const it of items) await decidir(it.id, true, { por: 'Test' });
  const b2 = await leerBandeja();
  assert.ok(b2.items.filter((x) => x.tipo === 'agente').every((x) => x.estado === 'hecha'));
  if (items.some((x) => x.accion.tipo === 'regla')) assert.ok((await (await import('../lib/reglas.js')).leerReglas()).find((x) => x.id === 'pago').activa);
  if (items.some((x) => x.accion.tipo === 'tareas')) assert.ok((await (await import('../lib/tareas.js')).getTareas('agt')).length >= 1);
  assert.equal((await GET(new Request('http://localhost/api/agente?key=mala'))).status, 401);
});
