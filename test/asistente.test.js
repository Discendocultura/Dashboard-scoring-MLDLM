import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
let route;
let enviado = [];
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
  const { usarClaudeFalso } = await import('../lib/claude.js');
  usarClaudeFalso(({ system, messages, effort }) => { enviado.push({ system, messages, effort }); return `Respuesta (${effort})`; });
});
async function call(path, { method = 'GET', body, cookie } = {}) {
  const res = await route(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'text/plain' }, body: body ? JSON.stringify(body) : undefined }), ENV);
  return { status: res.status, data: await res.json().catch(() => null) };
}
const login = async (password) => {
  const res = await route(new Request('http://localhost/api/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password }) }), ENV);
  return res.headers.get('set-cookie')?.split(';')[0];
};

test('asistente: preguntas y resumen con cifras agregadas, sin datos personales', async () => {
  const admin = await login('admin');
  assert.equal((await call('/api/asistente', { cookie: admin })).data.activo, true);
  // Un lanzamiento con los leads del mock (etiqueta demo)
  const cfg = (await call('/api/config', { cookie: admin })).data.config;
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...cfg, launches: { demo: { name: 'Octubre', registroTag: 'registro-webinar-demo', vipTag: 'compra-vip-demo', compraTag: 'clienta-raices', precioVip: 27, precioPrograma: 997, inicioCaptacion: '2026-09-28', fechaDirecto: '2026-10-20' } } } });
  enviado = [];
  const r = await call('/api/asistente', { method: 'POST', cookie: admin, body: { op: 'preguntar', pregunta: '¿Cómo va?', anteriores: [{ pregunta: 'Hola', respuesta: 'Hola, dime' }] } });
  assert.equal(r.status, 200);
  assert.equal(r.data.respuesta, 'Respuesta (medium)');
  const todo = JSON.stringify(enviado);
  assert.match(todo, /Octubre/); // el lanzamiento va
  assert.match(todo, /registros/);
  assert.doesNotMatch(todo, /@/); // ningún email
  assert.doesNotMatch(todo, /\+34|\b6\d{8}\b/); // ningún teléfono
  assert.equal(enviado[0].messages.at(-1).content, '¿Cómo va?');
  assert.equal(enviado[0].messages.filter((m) => m.role === 'user').length, 3); // datos, pregunta anterior y la nueva
  const res = await call('/api/asistente', { method: 'POST', cookie: admin, body: { op: 'resumen', l: 'demo' } });
  assert.equal(res.status, 200);
  assert.doesNotMatch(JSON.stringify(enviado.at(-1)), /@/);
  assert.equal((await call('/api/asistente', { method: 'POST', cookie: admin, body: { op: 'resumen', l: 'no-existe' } })).status, 404);
});

test('asistente: permisos y borrador de WhatsApp solo con nombre de pila y comportamiento', async () => {
  const setter = await login('setter');
  // La setter no ve cifras: no puede preguntar, pero sí pedir borradores
  assert.equal((await call('/api/asistente', { method: 'POST', cookie: setter, body: { op: 'preguntar', pregunta: '¿Facturación?' } })).status, 403);
  enviado = [];
  const r = await call('/api/asistente', { method: 'POST', cookie: setter, body: { op: 'whatsapp', plantilla: 'Hola {nombre}, aquí la grabación: {link_grabacion}', fase: 'Grabación', perfil: { nombre: 'Lucía Pérez García', email: 'lucia@x.com', telefono: '600111222', comportamiento: ['Clase 1: vio el 75%'], estado: 'Caliente' } } });
  assert.equal(r.status, 200);
  assert.equal(r.data.texto, 'Respuesta (low)');
  const todo = JSON.stringify(enviado);
  assert.match(todo, /Lucía/);
  assert.doesNotMatch(todo, /Pérez|lucia@x\.com|600111222/);
  assert.match(todo, /\{link_grabacion\}/);
  assert.equal((await call('/api/asistente', { method: 'POST', body: { op: 'preguntar', pregunta: 'x' } })).status, 401);
});

test('asistente: sin clave fuera del modo de prueba avisa de cómo activarlo', async () => {
  const { setEnv, env } = await import('../lib/env.js');
  const { preguntarClaude, usarClaudeFalso, iaConfigurada } = await import('../lib/claude.js');
  usarClaudeFalso(null);
  const antes = env.GHL_MOCK;
  setEnv({ GHL_MOCK: '0' });
  delete env.ANTHROPIC_API_KEY;
  try {
    assert.equal(iaConfigurada(), false);
    await assert.rejects(preguntarClaude({ system: 's', messages: [{ role: 'user', content: 'x' }] }), /ANTHROPIC_API_KEY/);
  } finally {
    setEnv({ GHL_MOCK: antes });
  }
});
