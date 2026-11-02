import { test, before } from 'node:test';
import assert from 'node:assert/strict';

before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  setEnv({ GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret', DIGEST_KEY: 'clave-larga-de-prueba-123', DB: crearD1Local() });
});

test('grabación: qué directos tocan (1 h después y hasta 4 días, con Zoom y sin vídeo)', async () => {
  const { directosPendientes } = await import('../lib/grabacion.js');
  const { madridToEpoch } = await import('../public/js/page.js');
  const l = { formato: 'v2', fechaDirecto: '2026-11-03', horaDirecto: '19:00', zoomMeetingId: '111', videos: [{ fecha: '2026-11-04', hora: '19:00', zoomMeetingId: '222', replayVideoUrl: 'https://vimeo.com/1' }] };
  const t = madridToEpoch('2026-11-03T19:00');
  assert.deepEqual(directosPendientes(l, t + 30 * 60_000), []);
  assert.deepEqual(directosPendientes(l, t + 2 * 3_600_000).map((v) => v.k), [1]); // el 2 ya tiene vídeo
  assert.deepEqual(directosPendientes(l, t + 5 * 86_400_000), []);
  assert.deepEqual(directosPendientes({ ...l, grabacionAuto: false }, t + 2 * 3_600_000), []);
});

test('grabación: Zoom → Vimeo → puesta en la página de replay, paso a paso y sin pisar', async () => {
  const mock = await import('../lib/mock.js');
  const { getConfig, saveConfig } = await import('../lib/config-store.js');
  const { avanzarGrabaciones } = await import('../lib/grabacion.js');
  const { madridToEpoch } = await import('../public/js/page.js');
  const actual = await getConfig({ fresh: true });
  const embudo = actual.embudos.find((e) => e.tipo === 'lanzamientos')?.id;
  await saveConfig({ ...actual, launches: { ...actual.launches, grab: { name: 'Grab', embudo, registroTag: 'reg-grab', inicioCaptacion: '2026-10-01', fechaDirecto: '2026-11-03', horaDirecto: '19:00', zoomMeetingId: '81112223334', cierreCarrito: '2026-11-10T23:59' } } });
  const ahora = madridToEpoch('2026-11-03T21:00');
  // 1) Zoom aún no tiene la grabación
  let r = await avanzarGrabaciones({ code: 'grab', ahora, avisar: false });
  assert.equal(r.pasos[0].estado, 'esperando');
  // 2) Zoom la tiene → se manda a Vimeo
  mock.zoomGrabaciones.set('81112223334', { listo: true, url: 'https://zoom.us/rec/download/x?access_token=t', inicio: '2026-11-03T19:01' });
  r = await avanzarGrabaciones({ code: 'grab', ahora: ahora + 60_000, avisar: false });
  assert.equal(r.pasos[0].estado, 'subiendo');
  const [subido] = [...mock.vimeoVideos.values()].filter((v) => v.desde.includes('zoom.us/rec'));
  assert.ok(subido);
  // 3) Vimeo aún procesando → sigue; luego lista → se pone en la configuración
  r = await avanzarGrabaciones({ code: 'grab', ahora: ahora + 120_000, avisar: false });
  assert.equal(r.pasos[0].estado, 'subiendo');
  subido.estado = 'complete';
  r = await avanzarGrabaciones({ code: 'grab', ahora: ahora + 180_000, avisar: false });
  assert.equal(r.pasos[0].estado, 'lista');
  assert.equal((await getConfig({ fresh: true })).launches.grab.replayVideoUrl, subido.link);
  // 4) Con vídeo ya puesto, ya no toca nada
  r = await avanzarGrabaciones({ code: 'grab', ahora: ahora + 240_000, avisar: false });
  assert.deepEqual(r.pasos, []);
});

test('grabación: sin grabación en la nube a las 6 h, avisa una vez; y la ruta pide la clave', async () => {
  const { getConfig, saveConfig } = await import('../lib/config-store.js');
  const { avanzarGrabaciones } = await import('../lib/grabacion.js');
  const { madridToEpoch } = await import('../public/js/page.js');
  const actual = await getConfig({ fresh: true });
  await saveConfig({ ...actual, launches: { ...actual.launches, sing: { name: 'Sin', registroTag: 'reg-sin', fechaDirecto: '2026-11-03', horaDirecto: '19:00', zoomMeetingId: '82223334445' } } });
  const r = await avanzarGrabaciones({ code: 'sing', ahora: madridToEpoch('2026-11-04T02:00'), avisar: false });
  assert.equal(r.pasos[0].estado, 'sin');
  const r2 = await avanzarGrabaciones({ code: 'sing', ahora: madridToEpoch('2026-11-04T03:00'), avisar: false });
  assert.equal(r2.pasos[0].estado, 'sin'); // se queda así (no vuelve a avisar)
  const { GET } = await import('../handlers/grabacion.js');
  assert.equal((await GET(new Request('http://localhost/api/grabacion?key=mala'))).status, 401);
  assert.equal((await GET(new Request('http://localhost/api/grabacion?key=clave-larga-de-prueba-123'))).status, 200);
});
