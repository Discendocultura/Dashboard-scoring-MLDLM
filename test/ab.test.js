import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumenAb, compararTasas } from '../public/js/ab.js';

test('A/B: veredicto según los datos', () => {
  assert.equal(resumenAb({ a: { visitas: 10, conversiones: 1 } }).veredicto.tipo, 'sin-datos');
  assert.equal(resumenAb({ a: { visitas: 40, conversiones: 4 }, b: { visitas: 40, conversiones: 8 } }).veredicto.tipo, 'pocos');
  const gana = resumenAb({ a: { visitas: 1000, conversiones: 100 }, b: { visitas: 1000, conversiones: 150 } });
  assert.equal(gana.veredicto.tipo, 'gana');
  assert.equal(gana.veredicto.ganadora, 'b');
  assert.ok(Math.abs(gana.filas[1].mejora - 0.5) < 1e-9);
  assert.equal(resumenAb({ a: { visitas: 500, conversiones: 50 }, b: { visitas: 500, conversiones: 55 } }).veredicto.tipo, 'empate');
  // Más conversiones que visitas (p. ej. recargar la de gracias): se recorta
  assert.equal(resumenAb({ a: { visitas: 5, conversiones: 9 }, b: { visitas: 5, conversiones: 1 } }).filas[0].conversiones, 5);
  const c = compararTasas({ visitas: 1000, conversiones: 100 }, { visitas: 1000, conversiones: 150 });
  assert.ok(c.p < 0.01 && c.z > 3);
});

const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
test('A/B: el servidor apunta visitas y conversiones por variante, una vez por visitante', async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  const { route } = await import('../lib/router.js');
  const call = async (path, { method = 'GET', body, cookie } = {}) => {
    const r = await route(new Request(`http://localhost${path}`, { method, headers: { 'content-type': 'text/plain', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }), ENV);
    return { status: r.status, data: await r.json().catch(() => null), headers: r.headers };
  };
  const login = await call('/api/login', { method: 'POST', body: { password: 'admin' } });
  const admin = login.headers.get('set-cookie').split(';')[0];
  const cfg = (await call('/api/config', { cookie: admin })).data.config;
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...cfg, launches: { ...cfg.launches, abt: { name: 'AB', registroTag: 'registro-ab', inicioCaptacion: '2026-10-01' } } } });
  const post = (body) => call('/api/ab', { method: 'POST', body });
  for (const [v, va] of [['visit00a1', 'a'], ['visit00a2', 'a'], ['visit00b1', 'b']]) assert.equal((await post({ op: 'visita', ambito: 'lanz', ref: 'abt', variante: va, v })).status, 200);
  await post({ op: 'visita', ambito: 'lanz', ref: 'abt', variante: 'b', v: 'visit00a1' }); // la primera manda
  await post({ op: 'conversion', ambito: 'lanz', ref: 'abt', variante: 'b', v: 'visit00b1', cid: 'contacto123' });
  await post({ op: 'conversion', ambito: 'lanz', ref: 'abt', variante: 'b', v: 'visit00b1' });
  assert.equal((await post({ op: 'visita', ambito: 'lanz', ref: 'no-existe', variante: 'a', v: 'visit00z9' })).status, 404);
  assert.equal((await post({ op: 'visita', ambito: 'lanz', ref: 'abt', variante: 'B C', v: 'visit00z9' })).status, 400);
  assert.equal((await call('/api/ab?ambito=lanz&ref=abt')).status, 401, 'los resultados, solo con sesión');
  const { data } = await call('/api/ab?ambito=lanz&ref=abt', { cookie: admin });
  assert.equal(data.variantes.a.visitas, 2);
  assert.equal(data.variantes.b.visitas, 1);
  assert.equal(data.variantes.b.conversiones, 1);
  assert.deepEqual(data.variantes.b.contactos, ['contacto123']);
  assert.equal((await call('/api/ab', { method: 'POST', cookie: admin, body: { op: 'reiniciar', ambito: 'lanz', ref: 'abt' } })).status, 200);
  assert.deepEqual((await call('/api/ab?ambito=lanz&ref=abt', { cookie: admin })).data.variantes, {});
});
