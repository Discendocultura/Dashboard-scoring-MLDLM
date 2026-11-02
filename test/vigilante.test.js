import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { auditarLanzamiento } from '../public/js/auditor.js';
import { revisarPaginaHtml, simulacro, paginasDe, textoVigilante, MAX_PAGINAS } from '../lib/vigilante.js';

before(async () => {
  const { setEnv } = await import('../lib/env.js');
  setEnv({ GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret', DIGEST_KEY: 'clave-larga-de-prueba-123' });
});

const v2 = {
  name: 'Resistencia', formato: 'v2', registroTag: 'r', compraTag: 'c', inicioCaptacion: '2026-10-01', fechaDirecto: '2026-11-03', horaDirecto: '19:00', zoomMeetingId: '111',
  cierreCarrito: '2026-11-10T23:59', aperturaCarrito: '2026-11-05T20:30', videos: [{ fecha: '2026-11-04', hora: '19:00', replayUrl: 'https://p/v2' }],
};
const t = (r) => r.map((x) => `${x.nivel}:${x.titulo}`);

test('auditor: Zoom de cada directo, carrito tarde y espera a la hora en punto', () => {
  const r = t(auditarLanzamiento({ launch: v2, hoy: '2026-11-02', zoom: true }));
  assert.ok(r.includes('importante:Falta el Zoom del Vídeo 2'), r.join('\n'));
  assert.ok(r.some((x) => x.startsWith('importante:El carrito abre 1 día después del Vídeo 2')));
  // Con pantalla de espera pedida para el vídeo 2 → crítico a ≤3 días
  const r2 = t(auditarLanzamiento({ launch: { ...v2, espera: { activa: true, antesMin: 0, directos: [1, 2] } }, hoy: '2026-11-02', zoom: true }));
  assert.ok(r2.includes('critico:Falta el Zoom del Vídeo 2'));
  assert.ok(r2.includes('aviso:La pantalla de espera manda al directo a la hora en punto'));
  // Con su Zoom y el carrito a la hora: nada de esto
  const ok = t(auditarLanzamiento({ launch: { ...v2, aperturaCarrito: '2026-11-04T20:00', videos: [{ ...v2.videos[0], zoomMeetingId: '222' }] }, hoy: '2026-11-02', zoom: true }));
  assert.ok(!ok.some((x) => /Zoom del Vídeo 2|carrito abre/.test(x)));
});

test('simulacro: revisa el código de AlquimIA, el ?c= del cliente y el bloque de cada página', () => {
  const bien = '<div data-lsd-page="recursos"></div><script src="https://a.pages.dev/tracker.js?c=sol"></script>';
  assert.deepEqual(revisarPaginaHtml(bien, { marca: 'data-lsd-page', clienteId: 'sol', principal: false }), []);
  assert.match(revisarPaginaHtml('<html></html>', { marca: 'data-lsd-page' })[0].titulo, /código de AlquimIA/);
  assert.match(revisarPaginaHtml(bien, { marca: 'data-lsd-page', clienteId: 'luna', principal: false })[0].titulo, /\?c=luna/);
  assert.match(revisarPaginaHtml(bien, { marca: 'data-lsd-venta' })[0].titulo, /data-lsd-venta/);
  // Escapado dentro del JSON de GHL
  assert.deepEqual(revisarPaginaHtml('{"html":"\\u003Cdiv data-lsd-venta\\u003E\\u003Cscript src=\\"https:\\u002F\\u002Fa\\u002Ftracker.js\\"\\u003E"}', { marca: 'data-lsd-venta' }), []);
});

test('simulacro: páginas que no abren y límite de peticiones', async () => {
  const l = { ...v2, preclase: true, nClases: 2, loginUrl: 'https://p/login', recursosUrl: 'https://p/rota', raicesUrl: 'https://p/venta', replayUrl: 'https://p/v1' };
  assert.deepEqual(paginasDe(l).map((p) => p.label), ['Página de login', 'Página preclase', 'Página del Vídeo 1', 'Página del Vídeo 2', 'Página de venta']);
  const fetchFn = async (url) => (url.includes('rota') ? new Response('', { status: 404 }) : new Response(`<div data-lsd-login data-lsd-page="x" data-lsd-venta></div><script src="/tracker.js"></script>`));
  const r = await simulacro(l, { fetchFn });
  assert.equal(r.filter((p) => p.ok).length, 4);
  assert.match(r.find((p) => !p.ok).problemas[0].titulo, /error 404/);
  const muchas = { ...l, videos: Array.from({ length: 4 }, (_, i) => ({ replayUrl: `https://p/v${i + 2}` })), formato: 'reto5', paginaPagoUrl: 'https://p/pago' };
  assert.ok(paginasDe(muchas).length <= MAX_PAGINAS);
  const txt = textoVigilante({ cliente: { id: 'sol', nombre: 'Sol' }, launch: l, problemas: [{ nivel: 'critico', titulo: 'Página preclase: No abre <404>' }], paginas: r, ph: { label: 'el directo', d: '2026-11-03' }, hoy: '2026-11-02', url: 'https://x/' });
  assert.match(txt, /Simulacro: 4\/5 páginas bien/);
  assert.match(txt, /mañana/);
  assert.match(txt, /&lt;404&gt;/);
  assert.match(txt, /\?c=sol/);
});

test('/api/vigilante: clave del cron y botón «Revisar ahora»', async () => {
  const { GET, POST } = await import('../handlers/vigilante.js');
  assert.equal((await GET(new Request('http://localhost/api/vigilante?key=mala'))).status, 401);
  const res = await GET(new Request('http://localhost/api/vigilante?key=clave-larga-de-prueba-123'));
  assert.equal(res.status, 200);
  const r = await res.json();
  assert.ok(Array.isArray(r.problemas));
  assert.equal((await POST(new Request('http://localhost/api/vigilante', { method: 'POST', body: '{"op":"revisar"}' }))).status, 401);
});

test('Zoom automático: qué salas se mueven al cambiar el día o la hora del directo', async () => {
  const { salasAMover } = await import('../public/js/videos.js');
  const antes = { a: { name: 'A', formato: 'v2', fechaDirecto: '2026-11-10', horaDirecto: '19:00', zoomMeetingId: '111', videos: [{ fecha: '2026-11-11', hora: '19:00', zoomMeetingId: '222' }] },
    b: { name: 'B', fechaDirecto: '2026-11-20', horaDirecto: '19:00', zoomMeetingId: '333' } };
  const despues = { ...antes, a: { ...antes.a, horaDirecto: '18:30', videos: [{ fecha: '2026-11-12', hora: '19:00', zoomMeetingId: '222' }] } };
  assert.deepEqual(salasAMover(antes, despues, '2026-11-02').map((m) => `${m.id}@${m.fecha}T${m.hora}`), ['111@2026-11-10T18:30', '222@2026-11-12T19:00']);
  // Sala cambiada a la vez que la fecha, directo pasado o sala compartida con otro lanzamiento: no se toca
  assert.deepEqual(salasAMover(antes, { ...antes, a: { ...antes.a, horaDirecto: '18:30', zoomMeetingId: '999' } }, '2026-11-02'), []);
  assert.deepEqual(salasAMover(antes, despues, '2026-11-15'), []);
  assert.deepEqual(salasAMover(antes, { ...despues, b: { ...antes.b, zoomMeetingId: '111' } }, '2026-11-02').map((m) => m.id), ['222']);
});

test('Vigilante: salas de Zoom que no existen, a otra hora o sin registro', async () => {
  const { revisarSalas } = await import('../lib/vigilante.js');
  const salas = { 111: { tipo: 2, inicio: '2026-11-03T19:00', registro: 0 }, 222: { tipo: 2, inicio: '2026-11-05T19:00', registro: 2 } };
  const l = { formato: 'v2', fechaDirecto: '2026-11-03', horaDirecto: '19:00', zoomMeetingId: '111', videos: [{ fecha: '2026-11-04', hora: '19:00', zoomMeetingId: '222' }] };
  const r = await revisarSalas(l, '2026-11-02', { leer: async (id) => salas[id] || null });
  assert.deepEqual(r.map((x) => `${x.nivel}:${x.titulo}`), ['critico:La sala de Zoom del Vídeo 2 está puesta para otro momento', 'critico:La sala de Zoom del Vídeo 2 no tiene registro']);
  const r2 = await revisarSalas({ ...l, zoomMeetingId: '404' }, '2026-11-02', { leer: async (id) => salas[id] || null });
  assert.deepEqual(r2[0].accion, { tipo: 'zoom', k: 1 });
  assert.match(r2[0].titulo, /no existe/);
  // Zoom caído: no se inventa un problema
  assert.deepEqual(await revisarSalas(l, '2026-11-02', { leer: async () => { throw new Error('Zoom 500'); } }), []);
});

test('Zoom automático: al guardar la configuración con otra hora, la sala se mueve en Zoom', async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  setEnv({ DB: crearD1Local() });
  const { POST: login } = await import('../handlers/login.js');
  const cookie = (await login(new Request('http://localhost/api/login', { method: 'POST', body: '{"password":"admin"}' }))).headers.get('set-cookie').split(';')[0];
  const config = await import('../handlers/config.js');
  const { crearReunion, leerReunion } = await import('../lib/zoom.js');
  const z = await crearReunion({ topic: 'x', fecha: '2099-01-10', hora: '19:00' });
  const cur = await (await config.GET(new Request('http://localhost/api/config', { headers: { cookie } }))).json();
  const l = { name: 'Zoom auto', registroTag: 'reg-zoom-auto', fechaDirecto: '2099-01-10', horaDirecto: '19:00', zoomMeetingId: z.id };
  const post = (launches) => config.POST(new Request('http://localhost/api/config', { method: 'POST', headers: { cookie }, body: JSON.stringify({ ...cur.config, launches: { ...cur.config.launches, ...launches } }) }));
  assert.equal((await post({ zauto: l })).status, 200);
  const r = await (await post({ zauto: { ...l, fechaDirecto: '2099-01-11', horaDirecto: '18:30' } })).json();
  assert.deepEqual(r.zoomMovidas.map((m) => m.movida), [true]);
  assert.equal((await leerReunion(z.id)).inicio, '2099-01-11T18:30');
});
