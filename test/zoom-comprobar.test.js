import { test } from 'node:test';
import assert from 'node:assert/strict';

const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
test('zoom: comprobar las reuniones de un lanzamiento (solo lectura, con sesión)', async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  const { route } = await import('../lib/router.js');
  const { guardarInscripcion } = await import('../lib/entradas.js');
  const call = async (path, { method = 'GET', body, cookie } = {}) => {
    const r = await route(new Request(`http://localhost${path}`, { method, headers: { 'content-type': 'text/plain', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }), ENV);
    return { status: r.status, data: await r.json().catch(() => null), headers: r.headers };
  };
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).headers.get('set-cookie').split(';')[0];
  const cfg = (await call('/api/config', { cookie: admin })).data.config;
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...cfg, launches: { ...cfg.launches, res: { name: 'Res', registroTag: 'reg-res', formato: 'v2', fechaDirecto: '2026-11-03', horaDirecto: '19:00', zoomMeetingId: '83482996867', videos: [{ fecha: '2026-11-04', hora: '19:00', zoomMeetingId: '87044291509' }] } } } });
  await guardarInscripcion('res', 1, 'cidA123456', 'https://us06web.zoom.us/w/83482996867?tk=a&pwd=x');
  await guardarInscripcion('res', 2, 'cidA123456', 'https://us06web.zoom.us/w/87044291509?tk=b');
  assert.equal((await call('/api/zoom-registro?op=comprobar&l=res')).status, 401);
  const { data } = await call('/api/zoom-registro?op=comprobar&l=res', { cookie: admin });
  assert.deepEqual(data.directos.map((d) => [d.k, d.meetingId, d.enlacesGuardados.total, d.enlacesGuardados.conCodigo]).slice(0, 1), [[1, '83482996867', 1, 1]]);
  assert.equal(data.directos[0].reunion.conCodigo, true);
  // El del día 2: de su reunión y sin el código dentro
  const { resumenEnlaces } = await import('../lib/entradas.js');
  assert.deepEqual(await resumenEnlaces('res', 2), { total: 1, conCodigo: 0, reuniones: { 87044291509: 1 } });
  // Reinscribir en la reunión buena a quien tiene guardado el enlace de otra
  await guardarInscripcion('res', 1, 'mock00001', 'https://us06web.zoom.us/w/99999999999?tk=viejo');
  const r = await call('/api/zoom-registro?op=reinscribir', { method: 'POST', cookie: admin, body: { l: 'res', k: 1 } });
  assert.equal(r.status, 200);
  assert.equal(r.data.hechas, 1);
  assert.equal(r.data.pendientes, 0);
  assert.deepEqual((await resumenEnlaces('res', 1)).reuniones, { 83482996867: 2 });
  assert.equal((await call('/api/zoom-registro?op=reinscribir', { method: 'POST', body: { l: 'res', k: 1 } })).status, 401);
});
