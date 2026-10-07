import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
let route;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
});
const call = async (path, cookie) => {
  const res = await route(new Request(`http://localhost${path}`, { headers: cookie ? { cookie } : {} }), ENV);
  return { status: res.status, data: await res.json().catch(() => null) };
};
const login = async (password) => {
  const res = await route(new Request('http://localhost/api/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password }) }), ENV);
  return res.headers.get('set-cookie')?.split(';')[0];
};

test('ficha del lead: encuesta, formulario de la llamada y otros datos de GHL', async () => {
  const setter = await login('setter');
  const r = await call('/api/ficha?cid=mock00003', setter);
  assert.equal(r.status, 200);
  assert.equal(r.data.contacto.id, 'mock00003');
  // Encuesta: las preguntas configuradas con su respuesta (las de opciones múltiples, unidas)
  assert.ok(r.data.encuesta.length >= 4);
  assert.ok(r.data.encuesta.every((x) => x.pregunta && x.respuesta));
  // Formulario de la llamada (campos que no son de la encuesta), con su nombre de GHL
  const motivo = r.data.otros.find((x) => x.campo === '¿Qué te gustaría resolver en la llamada?');
  assert.ok(motivo?.valor);
  // Los campos de la encuesta no se repiten en «otros»
  assert.ok(!r.data.otros.some((x) => x.campo.startsWith('¿Cuál es tu edad')));
  assert.equal((await call('/api/ficha?cid=noexiste123', setter)).status, 404);
  assert.equal((await call('/api/ficha?cid=mock00003')).status, 401);
});
