// URLs propuestas para las páginas de un embudo creado de cero (＋ Nuevo embudo → Páginas y WhatsApp).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { slugUrl, dominioValido, urlsPropuestas, enlacesLanzamiento, conEnlacesPropuestos, urlsTexto } from '../public/js/urls-paginas.js';
import { promptCalentamiento } from '../public/js/calentamiento.js';

test('urls: nombre y dominio limpios', () => {
  assert.equal(slugUrl('Webinar «El Camino» de Mañana'), 'webinar-el-camino-de-manana');
  assert.equal(slugUrl('  PLF   primavera!! '), 'plf-primavera');
  assert.equal(dominioValido('MiDominio.com/'), 'https://midominio.com');
  assert.equal(dominioValido('http://www.midominio.es/algo?x=1'), 'https://www.midominio.es');
  assert.equal(dominioValido('localhost'), '');
  assert.equal(dominioValido(''), '');
});

test('urls: lanzamiento con registro orgánico y de publicidad; sin preclase no hay login ni preclase', () => {
  const u = urlsPropuestas('lanzamientos', { dominio: 'midominio.com', nombre: 'El Camino' });
  assert.deepEqual(u.map((x) => x.url), [
    'https://midominio.com/el-camino-registro', 'https://midominio.com/el-camino-registro-ads', 'https://midominio.com/el-camino-gracias',
    'https://midominio.com/el-camino-acceso', 'https://midominio.com/el-camino-preclase', 'https://midominio.com/el-camino-replay',
    'https://midominio.com/el-camino-inscripcion', 'https://midominio.com/el-camino-pago',
    'https://midominio.com/el-camino-bienvenida', 'https://midominio.com/el-camino-cita-confirmada',
  ]);
  assert.equal(u.filter((x) => x.pagina === 'registro').length, 2);
  const sin = urlsPropuestas('lanzamientos', { dominio: 'midominio.com', nombre: 'el-camino' }, { preclase: false });
  assert.ok(!sin.some((x) => x.id === 'login' || x.id === 'preclase'));
  assert.deepEqual(urlsPropuestas('lanzamientos', { dominio: '', nombre: 'x' }), []);
  // Venta directa sin upsell; VSL sin llamadas
  assert.ok(!urlsPropuestas('directa', { dominio: 'a.com', nombre: 'guia' }, { partes: { upsell: false, downsell: true } }).some((x) => x.id === 'upsell'));
  assert.equal(urlsPropuestas('directa', { dominio: 'a.com', nombre: 'guia' })[0].url, 'https://a.com/guia');
  assert.ok(!urlsPropuestas('vsl', { dominio: 'a.com', nombre: 'v' }, { sinLlamadas: true }).some((x) => x.id === 'gracias-llamada'));
  assert.match(urlsTexto(u), /^Registro · orgánico[^\n]*: https:\/\/midominio\.com\/el-camino-registro\n/);
});

test('urls: rellenan los enlaces del lanzamiento (lo suyo manda) y van en los mensajes del grupo', () => {
  const u = urlsPropuestas('lanzamientos', { dominio: 'midominio.com', nombre: 'el-camino' });
  assert.deepEqual(enlacesLanzamiento(u), {
    graciasUrl: 'https://midominio.com/el-camino-gracias', loginUrl: 'https://midominio.com/el-camino-acceso', recursosUrl: 'https://midominio.com/el-camino-preclase',
    replayUrl: 'https://midominio.com/el-camino-replay', raicesUrl: 'https://midominio.com/el-camino-inscripcion', paginaPagoUrl: 'https://midominio.com/el-camino-pago',
  });
  const l = conEnlacesPropuestos({ name: 'Octubre', raicesUrl: 'https://otra.com/venta', clase1At: '2026-10-20T10:00' }, u);
  assert.equal(l.raicesUrl, 'https://otra.com/venta');
  assert.equal(l.recursosUrl, 'https://midominio.com/el-camino-preclase');
  const p = promptCalentamiento(l, { directos: [{ nombre: 'El webinar', at: '2026-10-25T19:00', url: 'https://d/directo' }] });
  assert.match(p, /A DÓNDE LLEVA CADA MENSAJE[\s\S]*la página preclase → https:\/\/midominio\.com\/el-camino-preclase[\s\S]*la página de la grabación → https:\/\/midominio\.com\/el-camino-replay[\s\S]*la página de venta → https:\/\/otra\.com\/venta/);
  assert.doesNotMatch(promptCalentamiento({ name: 'Sin enlaces' }), /A DÓNDE LLEVA/);
});

// Servidor: el embudo guarda si las páginas / mensajes son de cero y el dominio y nombre de las URLs.
const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
let route;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
});
test('urls: el embudo guarda el origen de páginas y mensajes y sus URLs (limpias)', async () => {
  const call = async (path, { method = 'GET', body, cookie } = {}) => { const r = await route(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'text/plain' }, body: body ? JSON.stringify(body) : undefined }), ENV); return { status: r.status, data: await r.json().catch(() => null), res: r }; };
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const { data: cur } = await call('/api/config', { cookie: admin });
  const nuevo = { id: 'el-camino', tipo: 'lanzamientos', nombre: 'El Camino', formato: 'webinar', paginasOrigen: 'cero', waOrigen: 'propios', urls: { dominio: 'MiDominio.com/', nombre: 'El Camino' }, pestanas: ['leads', 'paginas'] };
  const malo = { id: 'otro', tipo: 'lanzamientos', nombre: 'Otro', paginasOrigen: 'quizas', urls: { dominio: 'nada', nombre: 'x' } };
  const r = await call('/api/config', { method: 'POST', cookie: admin, body: { ...cur.config, _version: cur.version, embudos: [...cur.config.embudos, nuevo, malo] } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const e = r.data.config.embudos.find((x) => x.id === 'el-camino');
  assert.equal(e.paginasOrigen, 'cero');
  assert.equal(e.waOrigen, 'propios');
  assert.deepEqual(e.urls, { dominio: 'https://midominio.com', nombre: 'el-camino' });
  const o = r.data.config.embudos.find((x) => x.id === 'otro');
  assert.equal(o.paginasOrigen, undefined);
  assert.equal(o.urls, undefined);
});

test('páginas con IA: gracias por comprar en todos los embudos y gracias por agendar donde hay llamadas', async () => {
  const { paginasDe } = await import('../public/js/paginas.js');
  for (const tipo of ['lanzamientos', 'vsl', 'meteorico']) assert.ok(paginasDe(tipo).some((p) => p.id === 'gracias-compra'), tipo);
  assert.ok(paginasDe('directa').some((p) => p.id === 'gracias' && /comprar/.test(p.nombre)));
  assert.ok(paginasDe('lanzamientos').some((p) => p.id === 'gracias-llamada'));
  assert.ok(!paginasDe('vsl', { sinLlamadas: true }).some((p) => p.id === 'gracias-llamada'));
  assert.ok(urlsPropuestas('meteorico', { dominio: 'a.com', nombre: 'bf' }).some((x) => x.url === 'https://a.com/bf-bienvenida'));
});
