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
