import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAtajos, servicioDe, agruparAtajos, buscarAtajos } from '../public/js/atajos.js';

test('accesos rápidos: limpieza, icono por servicio, grupos y búsqueda', () => {
  const l = sanitizeAtajos([
    { nombre: 'Carpeta diseños', url: 'https://drive.google.com/drive/folders/abc', grupo: 'Diseño' },
    { url: 'https://app.gohighlevel.com/location/xyz' },
    { nombre: 'Malo', url: 'javascript:alert(1)' },
    { nombre: 'Sin protocolo', url: 'drive.google.com' },
  ]);
  assert.equal(l.length, 2);
  assert.equal(l[1].nombre, 'GoHighLevel'); // sin nombre: el del servicio
  assert.equal(servicioDe(l[0].url).icono, '📁');
  assert.equal(servicioDe('https://docs.google.com/spreadsheets/d/1').servicio, 'Google Sheets');
  assert.equal(servicioDe('https://ejemplo.com/x').servicio, 'ejemplo.com');
  assert.deepEqual(agruparAtajos(l).map((g) => g.grupo), ['', 'Diseño']);
  assert.equal(buscarAtajos(l, 'disenos').length, 1);
  assert.equal(buscarAtajos(l, 'highlevel').length, 1);
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
const login = async (password) => (await call('/api/login', { method: 'POST', body: { password } })).res.headers.get('set-cookie').split(';')[0];

test('accesos rápidos (API): el admin guarda; el equipo los ve sin los «solo admin» y no puede editarlos', async () => {
  const admin = await login('admin');
  const setter = await login('setter');
  assert.equal((await call('/api/atajos')).status, 401);
  let r = await call('/api/atajos', { method: 'POST', cookie: admin, body: { enlaces: [
    { nombre: 'Drive', url: 'https://drive.google.com/x' },
    { nombre: 'Banco', url: 'https://banco.example.com', soloAdmin: true },
  ] } });
  assert.equal(r.status, 200);
  assert.equal(r.data.enlaces.length, 2);
  r = await call('/api/atajos', { cookie: setter });
  assert.deepEqual(r.data.enlaces.map((a) => a.nombre), ['Drive']);
  assert.equal(r.data.puedeEditar, false);
  assert.equal((await call('/api/atajos', { method: 'POST', cookie: setter, body: { enlaces: [] } })).status, 403);
  assert.equal((await call('/api/atajos', { cookie: admin })).data.enlaces.length, 2);
});
