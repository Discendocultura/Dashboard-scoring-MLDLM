// Pantalla de enhorabuena: siguientes pasos de cada tipo de embudo y el email a quien lo crea.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { siguientesPasos } from '../public/js/siguientes-pasos.js';

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
const cookieDe = (r) => r.res.headers.get('set-cookie')?.split(';')[0];

test('siguientes pasos: lanzamiento (etiqueta, páginas de cero o propias, Zoom) y otros tipos', () => {
  const l = siguientesPasos({ embudo: { tipo: 'lanzamientos', paginasOrigen: 'cero', waOrigen: 'cero' }, launch: { registroTag: 'registro-x-nov26', zoomMeetingId: '812' } });
  const titulos = l.map((p) => p.titulo);
  assert.ok(titulos.includes('Crea la etiqueta «registro-x-nov26» en GHL'));
  assert.ok(titulos.includes('Crea las páginas en GHL'));
  assert.ok(titulos.includes('Revisa la sala de Zoom'));
  assert.match(l.find((p) => p.titulo === 'Crea las páginas en GHL').detalle, /Extender sección/);
  const propias = siguientesPasos({ embudo: { tipo: 'lanzamientos' }, launch: {} }).map((p) => p.titulo);
  assert.ok(propias.includes('Conecta tus páginas') && propias.includes('Crea la sala de Zoom'));
  for (const tipo of ['vsl', 'meteorico', 'directa']) assert.ok(siguientesPasos({ embudo: { tipo } }).length >= 3, tipo);
  for (const p of l) assert.ok(p.icono && p.titulo && p.detalle);
});

test('POST /api/siguientes-pasos: manda el email a quien lo crea (y sin email, lo dice)', async () => {
  const admin = cookieDe(await call('/api/login', { method: 'POST', body: { password: 'admin' } }));
  const cfg = (await call('/api/config', { cookie: admin })).data.config;
  const guardado = await call('/api/config', { method: 'POST', cookie: admin, body: { ...cfg, embudos: [...cfg.embudos, { id: 'camino', tipo: 'lanzamientos', nombre: 'El Camino', formato: 'webinar' }], launches: { ...cfg.launches, 'camino-nov26': { name: 'Noviembre', embudo: 'camino', registroTag: 'registro-camino-nov26', fechaDirecto: '2026-11-17' } } } });
  assert.equal(guardado.status, 200, JSON.stringify(guardado.data));
  // Contraseña general: no hay email.
  const sin = await call('/api/siguientes-pasos', { method: 'POST', cookie: admin, body: { embudo: 'camino', launch: 'camino-nov26' } });
  assert.equal(sin.status, 200);
  assert.equal(sin.data.enviado, false);
  assert.ok(sin.data.pasos.length >= 5);
  // Con usuario: le llega.
  const nuevo = await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'crear', nombre: 'Laura Pérez', email: 'laura@ejemplo.com', rol: 'admin', enviar: false } });
  assert.equal(nuevo.status, 200, JSON.stringify(nuevo.data));
  const laura = cookieDe(await call('/api/login', { method: 'POST', body: { email: 'laura@ejemplo.com', password: nuevo.data.password } }));
  const { sentEmails } = await import('../lib/mock.js');
  const antes = sentEmails.length;
  const ok = await call('/api/siguientes-pasos', { method: 'POST', cookie: laura, body: { embudo: 'camino', launch: 'camino-nov26' } });
  assert.equal(ok.data.enviado, true, JSON.stringify(ok.data));
  assert.equal(ok.data.email, 'laura@ejemplo.com');
  const email = sentEmails.at(-1);
  assert.equal(sentEmails.length, antes + 1);
  assert.match(email.subject, /Lanzamiento creado/);
  assert.match(email.html, /Enhorabuena, Laura/);
  assert.match(email.html, /registro-camino-nov26/);
  // Errores y permisos.
  assert.equal((await call('/api/siguientes-pasos', { method: 'POST', cookie: laura, body: { embudo: 'no-existe' } })).status, 404);
  assert.equal((await call('/api/siguientes-pasos', { method: 'POST', cookie: laura, body: { embudo: 'camino', launch: 'no' } })).status, 404);
  const setter = cookieDe(await call('/api/login', { method: 'POST', body: { password: 'setter' } }));
  assert.equal((await call('/api/siguientes-pasos', { method: 'POST', cookie: setter, body: { embudo: 'camino' } })).status, 403);
});
