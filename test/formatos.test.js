import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { videosDe, nombreVideo, nVideos } from '../public/js/videos.js';
import { signalsFor, score, nextStepFor, isValidSignalTag, grabacionActual } from '../public/js/scoring.js';
import { phaseAt, phasesFor, redirectFor, madridToEpoch } from '../public/js/page.js';
import { hitosLanzamiento } from '../public/js/calendario.js';
import { auditarLanzamiento } from '../public/js/auditor.js';

const plf = {
  formato: 'plf', clase1At: '2026-11-01T10:00', clase2At: '2026-11-03T10:00',
  fechaDirecto: '2026-11-05', horaDirecto: '19:00', replayUrl: 'https://ejemplo.com/plc1', replayVideoUrl: 'https://vimeo.com/1',
  videos: [
    { fecha: '2026-11-07', hora: '19:00', replayUrl: 'https://ejemplo.com/plc2', replayVideoUrl: 'https://vimeo.com/2' },
    { fecha: '2026-11-09', hora: '19:00', replayUrl: 'https://ejemplo.com/plc3' },
    { fecha: '2026-11-11', hora: '19:00', zoomMeetingId: '123456789', replayUrl: 'https://ejemplo.com/plc4' },
  ],
  cierreCarrito: '2026-11-15T23:59', compraTag: 'compra', compraDateField: 'fc',
};

test('formatos: vídeos de cada formato con sus nombres', () => {
  assert.equal(nVideos('webinar'), 1);
  assert.equal(nVideos({ formato: 'v3' }), 3);
  assert.equal(nVideos({}), 1); // los de siempre son webinar
  assert.deepEqual(videosDe(plf).map((v) => v.nombre), ['PLC 1', 'PLC 2', 'PLC 3', 'PLC 4']);
  assert.equal(nombreVideo('v2', 2), 'Vídeo 2');
  assert.equal(videosDe(plf)[0].fecha, '2026-11-05'); // el 1 usa los campos de siempre
  assert.equal(videosDe(plf)[3].venta, true);
  assert.ok(isValidSignalTag('nov26_directo4_final') && isValidSignalTag('nov26_replay3_75'));
});

test('formatos: puntuación y siguiente paso miran el vídeo de venta', () => {
  const tags = ['x_replay_90', 'x_replay2_90', 'x_replay3_90'];
  const s = signalsFor(tags, 'x', plf, {});
  assert.equal(s.nVideos, 4);
  assert.equal(nextStepFor(s), 'grabacion'); // aún no ha visto el PLC 4
  const s4 = signalsFor([...tags, 'x_directo4_asistio', 'x_directo4_final'], 'x', plf, {});
  assert.equal(nextStepFor(s4), 'cierre');
  assert.ok(score(s4) > score(s));
  // Webinar: igual que siempre
  const w = signalsFor(['x_directo_asistio', 'x_directo_final'], 'x', { fechaDirecto: '2026-11-05' }, {});
  assert.equal(score(w), 30);
  assert.equal(nextStepFor(w), 'cierre');
  // Compra el día del vídeo de venta
  const c = signalsFor(['compra'], 'x', { ...plf, inicioCaptacion: '2026-10-20' }, { cf: { fc: '2026-11-11' } });
  assert.equal(c.compra_directo, true);
  // WhatsApp: la página del último vídeo ya publicado
  assert.equal(grabacionActual(plf, '2026-11-08'), 'https://ejemplo.com/plc2');
  assert.equal(grabacionActual(plf, '2026-11-01'), 'https://ejemplo.com/plc1');
});

test('formatos: fases de la página preclase con varios vídeos', () => {
  const at = (dt) => phaseAt(plf, madridToEpoch(dt)).id;
  assert.equal(at('2026-11-04T12:00'), 'c2');
  assert.equal(at('2026-11-05T12:00'), 'dia_directo');
  assert.equal(at('2026-11-05T20:00'), 'en_directo');
  assert.equal(at('2026-11-06T12:00'), 'v1');
  assert.equal(at('2026-11-07T20:00'), 'en_directo2');
  assert.equal(at('2026-11-08T12:00'), 'v2');
  assert.equal(at('2026-11-11T18:00'), 'dia_directo4');
  assert.equal(at('2026-11-13T12:00'), 'replay');
  assert.equal(at('2026-11-16T12:00'), 'cerrado');
  assert.equal(redirectFor(plf, 'v2'), 'grabacion2');
  assert.equal(redirectFor(plf, 'en_directo3'), 'grabacion3'); // PLC 3 es grabado
  assert.equal(redirectFor(plf, 'en_directo4'), 'directo4'); // PLC 4 en directo (Zoom)
  assert.equal(redirectFor(plf, 'replay'), 'grabacion4');
  assert.equal(redirectFor({}, 'replay'), 'grabacion');
  assert.equal(redirectFor({}, 'en_directo'), 'directo');
  assert.ok(phasesFor(plf).some((p) => p.id === 'v3' && /PLC 3/.test(p.label)));
  assert.equal(phasesFor({}).length, 7);
});

test('formatos: calendario y auditor', () => {
  const h = hitosLanzamiento(plf);
  assert.deepEqual(h.filter((x) => /^directo/.test(x.id)).map((x) => x.titulo), ['PLC 1', 'PLC 2', 'PLC 3', 'PLC 4 (venta) en directo']);
  assert.equal(h.find((x) => x.id === 'carrito').day, '2026-11-11');
  const sinFecha = { ...plf, videos: [{ fecha: '' }, plf.videos[1], plf.videos[2]] };
  const a = auditarLanzamiento({ launch: sinFecha, code: 'x', hoy: '2026-11-01', tareas: [], users: [], roles: [] });
  assert.ok(a.some((x) => x.titulo === 'Falta el día del PLC 2' && x.accion.id === 'cfg-v2-fecha'));
  assert.ok(a.some((x) => x.titulo === 'Falta el vídeo del PLC 3'));
});

let route;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  setEnv({ GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SESSION_SECRET: 'test-secret-test-secret', DB: crearD1Local() });
  ({ route } = await import('../lib/router.js'));
});

test('formatos: embudo PLF, sus vídeos se guardan y la página da sus enlaces', async () => {
  const call = async (path, { method = 'GET', body, cookie } = {}) => {
    const res = await route(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'text/plain' }, body: body ? JSON.stringify(body) : undefined }), {});
    return { status: res.status, data: await res.json().catch(() => null), res };
  };
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const cfg = (await call('/api/config', { cookie: admin })).data.config;
  const body = {
    ...cfg,
    embudos: [...cfg.embudos, { id: 'plf-prim', tipo: 'lanzamientos', nombre: 'PLF primavera', formato: 'plf' }],
    launches: { ...cfg.launches, prim: { ...plf, name: 'Primavera', registroTag: 'registro-prim', embudo: 'plf-prim', inicioCaptacion: '2026-10-20' } },
  };
  const saved = (await call('/api/config', { method: 'POST', cookie: admin, body })).data.config;
  assert.equal(saved.embudos.find((e) => e.id === 'plf-prim').formato, 'plf');
  assert.equal(saved.launches.prim.formato, 'plf');
  assert.equal(saved.launches.prim.videos.length, 3);
  assert.equal(saved.launches.prim.videos[2].zoomMeetingId, '123456789');
  // El embudo sin formato es webinar y sus lanzamientos no guardan vídeos de más
  assert.equal(saved.embudos.find((e) => e.id === 'lanz')?.formato ?? 'webinar', 'webinar');
  const page = (await call('/api/page?l=prim&cid=mock0001')).data;
  assert.match(page.links.directo4, /\/directo\?l=prim&v=4/);
  assert.equal(page.links.grabacion3, 'https://ejemplo.com/plc3?cid=mock0001');
  assert.ok('replay2' in page.videos && 'replay4' in page.videos);
  assert.ok(page.directos.directo4 > page.directos.directo);
  // Seguimiento del vídeo 2
  assert.equal((await call('/api/track', { method: 'POST', body: { launch: 'prim', video: 'replay2', pct: 50, cid: 'mock0001' } })).status, 200);
});
