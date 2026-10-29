import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.GHL_MOCK = '1';
process.env.SESSION_SECRET = 'test-secret-test-secret';
const { directosAbiertos, deLaReunion } = await import('../lib/zoom-inscripcion.js');
const { autoCtx, automatizacionesDe } = await import('../public/js/automatizaciones.js');

test('zoom al registrarse: solo los directos con reunión de Zoom que no han pasado', () => {
  const futuro = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  const pasado = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
  assert.deepEqual(directosAbiertos({ fechaDirecto: futuro, horaDirecto: '19:00', zoomMeetingId: '81234567890' }).map((x) => x.k), [1]);
  assert.deepEqual(directosAbiertos({ fechaDirecto: futuro, horaDirecto: '19:00' }), [], 'sin reunión de Zoom');
  assert.deepEqual(directosAbiertos({ fechaDirecto: pasado, horaDirecto: '19:00', zoomMeetingId: '81234567890' }), [], 'ya pasó');
  assert.equal(deLaReunion('https://us06web.zoom.us/w/81234567890?tk=x', '812 3456 7890'), true);
});

test('zoom al registrarse: el webhook va en el workflow de registro solo si hay URL', () => {
  const l = { name: 'Oct', fechaDirecto: '2026-11-20', horaDirecto: '19:00', registroTag: 'registrado-webinar-201126' };
  const con = automatizacionesDe(autoCtx('lanzamientos', l, { code: 'oct', zoomWebhook: 'https://d/api/zoom-registro?c=x&k=y' })).find((x) => x.id === 'registro');
  const c = autoCtx('lanzamientos', l, { code: 'oct', zoomWebhook: 'https://d/api/zoom-registro?c=x&k=y' });
  assert.ok(con.acciones(c).some((a) => a.includes('Webhook') && a.includes('https://d/api/zoom-registro?c=x&k=y&l=oct')));
  const sin = autoCtx('lanzamientos', l, { code: 'oct' });
  assert.ok(!automatizacionesDe(sin).find((x) => x.id === 'registro').acciones(sin).some((a) => a.includes('Webhook')));
});

test('zoom-registro: la URL del webhook sale con la dirección principal (no con la antigua)', async () => {
  const { dominioLogin } = await import('../lib/dominio.js');
  assert.equal(dominioLogin({ DOMINIO_LOGIN: 'alquimia.tenaxdigital.com' }), 'alquimia.tenaxdigital.com');
  const src = (await import('node:fs')).readFileSync(new URL('../handlers/zoom-registro.js', import.meta.url), 'utf8');
  assert.match(src, /data\.discendocultura\.com' \? 'alquimia\.tenaxdigital\.com'/);
});

test('zoom-registro: los errores de Zoom se explican en claro', async () => {
  const { explicarZoom } = await import('../handlers/zoom-registro.js');
  assert.match(explicarZoom('Zoom 404: {"code":3001,"message":"Meeting does not exist"}', '812 3456'), /no existe en la cuenta de Zoom/);
  assert.match(explicarZoom('Zoom 400: {"code":304,"message":"Registration has not been enabled"}', '1'), /Registro: obligatorio/);
  assert.match(explicarZoom('Zoom 400: {"code":3027,"message":"El anfitrión no se puede registrar."}'), /anfitrión/);
  assert.match(explicarZoom('Zoom 400: {"code":4711,"message":"Invalid access token, does not contain scopes"}'), /permiso/);
});

test('zoom-registro: la clave se lee aunque GHL la codifique otra vez', async () => {
  const { claveDe } = await import('../handlers/zoom-registro.js');
  assert.equal(claveDe('zoomreg:mldlm.abc_D-1'), 'zoomreg:mldlm.abc_D-1');
  assert.equal(claveDe('zoomreg%3Amldlm.abc_D-1'), 'zoomreg:mldlm.abc_D-1');
  assert.equal(claveDe(' "zoomreg%253Amldlm.abc_D-1" '), 'zoomreg:mldlm.abc_D-1');
  const { setEnv } = await import('../lib/env.js');
  setEnv({ SESSION_SECRET: 'test-secret-test-secret' });
  const { signToken, verifyToken } = await import('../lib/auth.js');
  const t = await signToken('zoomreg:mldlm');
  assert.equal(await verifyToken(claveDe(encodeURIComponent(encodeURIComponent(t)))), 'zoomreg:mldlm');
});

test('zoom: los datos de la lead para Zoom (todos los clientes y caminos)', async () => {
  const { datosRegistrante } = await import('../lib/zoom-inscripcion.js');
  assert.deepEqual(datosRegistrante({ email: 'Ana@X.com', name: 'Ana López Ruiz', firstName: 'Ana', phone: '+34600' }), { email: 'ana@x.com', firstName: 'Ana', lastName: 'López Ruiz', phone: '+34600' });
  assert.deepEqual(datosRegistrante({ email: 'sin@nombre.com', name: 'sin@nombre.com' }), { email: 'sin@nombre.com', firstName: 'sin', lastName: '', phone: '' });
  assert.equal(datosRegistrante(null, 'b@c.com').firstName, 'b');
});

test('zoom: con la misma reunión periódica para el día 1 y el día 2, se inscribe en las dos sesiones de una vez', async () => {
  const { setEnv } = await import('../lib/env.js');
  setEnv({ GHL_MOCK: '1', SESSION_SECRET: 'test-secret-test-secret' });
  const mock = await import('../lib/mock.js');
  const { inscribirEnDirecto, ocurrenciasDelLanzamiento } = await import('../lib/zoom-inscripcion.js');
  const { entradaDe } = await import('../lib/entradas.js');
  const dia = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const launch = { formato: 'v2', fechaDirecto: dia(5), horaDirecto: '19:00', zoomMeetingId: '83482996867', registroTag: 'reg', videos: [{ fecha: dia(6), hora: '19:00', zoomMeetingId: '83482996867' }] };
  // Sesiones en Zoom: las de los dos días (y una de otro mes que no es de este lanzamiento)
  const { milestones } = await import('../public/js/page.js');
  const [v1, v2] = milestones(launch).videos.map((v) => v.inicio);
  mock.zoomSesiones.set('83482996867', [{ id: 's1', inicio: v1 }, { id: 's2', inicio: v2 }, { id: 's9', inicio: v2 + 30 * 86_400_000 }]);
  assert.deepEqual(await ocurrenciasDelLanzamiento(launch, '83482996867'), ['s1', 's2']);
  const contact = { id: 'cidAB12345', email: 'ana@x.com', name: 'Ana', tags: ['reg'] };
  const r = await inscribirEnDirecto('res-nov', launch, 1, { cid: contact.id, contact });
  assert.ok(r.ok);
  assert.deepEqual(mock.zoomInscritoEn.get('83482996867|ana@x.com'), ['s1', 's2']);
  // El enlace vale para los dos días: el día 2 ya no vuelve a llamar a Zoom
  assert.match((await entradaDe('res-nov', 2, contact.id)).join_url, /#o=s1-s2$/);
  mock.zoomInscritoEn.clear();
  const r2 = await inscribirEnDirecto('res-nov', launch, 2, { cid: contact.id, contact });
  assert.equal(r2.ya, true);
  assert.equal(mock.zoomInscritoEn.size, 0);
  assert.doesNotMatch(r2.joinUrl, /#/);
  // Una reunión normal (sin sesiones): como siempre
  assert.deepEqual(await ocurrenciasDelLanzamiento({ fechaDirecto: dia(5), horaDirecto: '19:00', zoomMeetingId: '81111111111' }, '81111111111'), []);
});
