import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoSetterIa, textoSetterIa, signalsFor, score } from '../public/js/scoring.js';
import { limpiarResumen, rangoValido } from '../lib/setter-ia.js';
import { autoCtx, automatizacionesDe, promptAutomatizacion } from '../public/js/automatizaciones.js';
import { huella } from '../handlers/setter.js';
import { sanitizeConfig } from '../lib/config-store.js';

test('setter IA: estado por las etiquetas setter-ia-*', () => {
  const e = estadoSetterIa(['registrado-webinar-201026', 'Setter-IA-Plantilla', 'setter-ia-activo']);
  assert.equal(e.plantilla, true);
  assert.equal(e.activo, true);
  assert.equal(e.respondio, true);
  assert.match(textoSetterIa(e), /conversando/);
  assert.equal(textoSetterIa(estadoSetterIa(['otra'])), '');
  assert.match(textoSetterIa(estadoSetterIa(['setter-ia-plantilla', 'setter-ia-pausa', 'setter-ia-humano'])), /persona/);
  assert.match(textoSetterIa(estadoSetterIa(['setter-ia-baja', 'setter-ia-activo'])), /no recibir/);
  assert.equal(estadoSetterIa(['setter-ia-plantilla']).respondio, false);
});

test('setter IA: responder suma 5 puntos y la cita deja al menos en «caliente»', () => {
  const base = signalsFor(['reg'], 'oct', {});
  const resp = signalsFor(['reg', 'setter-ia-plantilla', 'setter-ia-activo'], 'oct', {});
  const cita = signalsFor(['reg', 'setter-ia-plantilla', 'setter-ia-cita'], 'oct', {});
  assert.equal(score(resp) - score(base), 5);
  assert.ok(score(cita) >= 40);
  assert.equal(score(signalsFor(['reg', 'setter-ia-plantilla'], 'oct', {})), score(base), 'solo la plantilla no puntúa');
});

test('setter IA: cifras limpias (solo números) y rango de fechas', () => {
  const c = limpiarResumen({ respondieron: '12', citas: 3.4, bajas: -1, mensajes_ia: 'x', plantillas_enviadas: null, email: 'a@b.c', actualizado: '2026-10-17T16:23:59.659Z' });
  assert.equal(c.respondieron, 12);
  assert.equal(c.citas, 3);
  assert.equal(c.bajas, 0);
  assert.equal(c.mensajes_ia, null);
  assert.equal(c.email, undefined);
  assert.equal(c.actualizado, '2026-10-17T16:23:59.659Z');
  assert.ok(rangoValido('2026-10-01', '2026-10-17'));
  assert.ok(!rangoValido('2026-10-17', '2026-10-01'));
  assert.ok(!rangoValido('2024-01-01', '2026-10-17'), 'más de 400 días');
  assert.ok(!rangoValido('ayer', '2026-10-17'));
});

test('setter IA: la dirección se guarda limpia en la configuración', () => {
  assert.equal(sanitizeConfig({ setterIa: { url: 'https://setter-ia.x.workers.dev/#/lead/mldlm/abc' } }).setterIa.url, 'https://setter-ia.x.workers.dev');
  assert.equal(sanitizeConfig({ setterIa: { url: 'https://setter.midominio.com/' } }).setterIa.url, 'https://setter.midominio.com');
  assert.equal(sanitizeConfig({ setterIa: { url: 'http://inseguro.com' } }).setterIa.url, '');
  assert.equal(sanitizeConfig({ setterIa: { url: 'javascript:alert(1)' } }).setterIa.url, '');
  assert.equal(sanitizeConfig({}).setterIa.url, '');
});

test('setter IA: workflows de la plantilla y de la respuesta solo con el setter conectado', () => {
  const L = { name: 'Octubre', fechaDirecto: '2026-10-20', registroTag: 'registrado-webinar-201026' };
  const sin = automatizacionesDe(autoCtx('lanzamientos', L, { code: 'oct' }));
  assert.ok(!sin.some((a) => a.id.startsWith('setter')), 'sin plantillas ni setter, nada');
  const c = autoCtx('lanzamientos', L, { code: 'oct', setterUrl: 'https://setter.x.dev', clienteId: 'mldlm', plantillasWa: [{ nombre: 'Plantilla del setter IA', tag: 'setter-ia-enviar-plantilla' }] });
  const con = automatizacionesDe(c);
  const resp = con.find((a) => a.id === 'setter-respuesta');
  assert.ok(con.find((a) => a.id === 'setter-plantilla'));
  const p = promptAutomatizacion(resp, c);
  assert.match(p, /Customer Replied/);
  assert.match(p, /https:\/\/setter\.x\.dev\/api\/webhook\/ghl\?c=mldlm&k=/);
  assert.match(p, /NO incluye «setter-ia-pausa» ni «setter-ia-baja»/);
  assert.match(promptAutomatizacion(con.find((a) => a.id === 'setter-plantilla'), c), /setter-ia-plantilla/);
});

test('setter IA: API con ETag (304 si no ha cambiado)', async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  const { route } = await import('../lib/router.js');
  const env = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SESSION_SECRET: 'test-secret-test-secret', DB: crearD1Local(), SETTER_API_KEY: 'clave-de-prueba-larga-1234567890' };
  setEnv(env);
  assert.equal(huella('a'), huella('a'));
  assert.notEqual(huella('a'), huella('b'));
  const auth = { authorization: 'Bearer clave-de-prueba-larga-1234567890' };
  const r1 = await route(new Request('http://localhost/api/setter/marca', { headers: auth }), env);
  assert.equal(r1.status, 200);
  const etag = r1.headers.get('etag');
  const body = await r1.json();
  assert.ok(etag && body.version && etag === `"${body.version}"`);
  const r2 = await route(new Request('http://localhost/api/setter/marca', { headers: { ...auth, 'if-none-match': etag } }), env);
  assert.equal(r2.status, 304);
  const r3 = await route(new Request('http://localhost/api/setter/marca', { headers: { ...auth, 'if-none-match': '"otra"' } }), env);
  assert.equal(r3.status, 200);
});

test('plantillas de WhatsApp: una de serie, códigos limpios y sin repetir', async () => {
  const { sanitizePlantillasWa } = await import('../lib/config-store.js');
  assert.deepEqual(sanitizePlantillasWa(undefined), [{ id: 'p1', nombre: 'Plantilla del setter IA', tag: 'setter-ia-enviar-plantilla', precio: 0.06 }]);
  assert.deepEqual(sanitizePlantillasWa([]), [], 'si se quitan todas, no hay botón de plantilla');
  const l = sanitizePlantillasWa([
    { nombre: 'Bienvenida', tag: 'setter-ia-enviar-bienvenida' },
    { nombre: 'Repetida', tag: 'setter-ia-enviar-bienvenida' },
    { nombre: 'Mala', tag: 'setter-ia-baja' },
    { nombre: 'Otra', tag: 'compra-raices' },
  ]);
  assert.deepEqual(l.map((p) => p.tag), ['setter-ia-enviar-bienvenida']);
});

test('plantillas de WhatsApp: envío por lotes, solo las configuradas, y queda apuntado el gasto', async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  setEnv({ GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret', DB: crearD1Local() });
  const { POST: login } = await import('../handlers/login.js');
  const cookieDe = async (password) => (await login(new Request('http://localhost/api/login', { method: 'POST', body: JSON.stringify({ password }) }))).headers.get('set-cookie').split(';')[0];
  const admin = await cookieDe('admin');
  const setter = await cookieDe('setter');
  // Un lanzamiento con dos plantillas (una a 0,08 €).
  const config = await import('../handlers/config.js');
  const actual = await (await config.GET(new Request('http://localhost/api/config', { headers: { cookie: admin } }))).json();
  const cfg = { ...actual.config, _version: actual.version, launches: { demo: { name: 'Demo', registroTag: 'registro-webinar-demo', compraTag: 'clienta-raices' } }, setterIa: { url: '', plantillas: [{ nombre: 'Bienvenida', tag: 'setter-ia-enviar-bienvenida', precio: '0,08' }, { nombre: 'Grabación', tag: 'setter-ia-enviar-grabacion', precio: 0.05 }] } };
  assert.equal((await config.POST(new Request('http://localhost/api/config', { method: 'POST', headers: { cookie: admin }, body: JSON.stringify(cfg) }))).status, 200);
  const { POST, GET } = await import('../handlers/plantillas-wa.js');
  const enviar = (body) => POST(new Request('http://localhost/api/plantillas-wa', { method: 'POST', headers: { cookie: setter }, body: JSON.stringify(body) }));
  const ids = Array.from({ length: 3 }, (_, i) => `mock0000${i + 4}`);
  const r = await enviar({ l: 'demo', tag: 'setter-ia-enviar-bienvenida', ids });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.enviadas, 3);
  assert.equal(d.coste, 0.24);
  assert.equal((await enviar({ l: 'demo', tag: 'setter-ia-enviar-otra', ids })).status, 400, 'una que no está configurada, no');
  assert.equal((await enviar({ l: 'demo', tag: 'setter-ia-baja', ids })).status, 400, 'las de estado del setter, no');
  assert.equal((await enviar({ l: 'demo', tag: 'setter-ia-enviar-bienvenida', ids: Array.from({ length: 21 }, (_, i) => `mock${String(i).padStart(5, '0')}`) })).status, 400, 'de 20 en 20');
  assert.equal((await enviar({ l: 'nada', tag: 'setter-ia-enviar-bienvenida', ids })).status, 404);
  const { addTags } = await import('../lib/ghl.js');
  assert.ok(addTags);
  const g = await (await GET(new Request('http://localhost/api/plantillas-wa?l=demo', { headers: { cookie: setter } }))).json();
  assert.equal(g.envios.length, 1);
  assert.deepEqual(g.envios[0].ids, ids);
  assert.equal(g.envios[0].precio, 0.08);
  // apply-tags ya no pone etiquetas de plantilla (así ningún envío se queda sin apuntar su coste).
  const { POST: aplicar } = await import('../handlers/apply-tags.js');
  assert.equal((await aplicar(new Request('http://localhost/api/apply-tags', { method: 'POST', headers: { cookie: setter }, body: JSON.stringify({ items: [{ id: 'mock00004', tags: ['setter-ia-enviar-bienvenida'] }] }) }))).status, 400);
});

test('plantillas de WhatsApp: gasto, respuestas y retorno (solo compras después de la plantilla)', async () => {
  const { retornoPlantillas, costeEstimado } = await import('../public/js/plantillas-wa.js');
  assert.equal(costeEstimado(312, 0.06), 18.72);
  const lista = [
    { at: '2026-10-10T10:00:00Z', tag: 'a', nombre: 'A', ids: ['l1', 'l2', 'l3'], precio: 0.06 },
    { at: '2026-10-12T10:00:00Z', tag: 'b', nombre: 'B', ids: ['l1', 'l4'], precio: 0.1 },
  ];
  const leads = [
    { id: 'l1', s: { setter: { respondio: true }, compra: true, fecha_compra: '2026-10-11' } },
    { id: 'l2', s: { compra: true, fecha_compra: '2026-10-01' } }, // compró antes de la plantilla: no cuenta
    { id: 'l3', s: {} },
    { id: 'l4', s: { setter: { respondio: true }, compra: true } }, // sin fecha: cuenta
  ];
  const r = retornoPlantillas(lista, leads, { importe: () => 997 });
  assert.equal(r.enviadas, 5);
  assert.equal(r.personas, 4);
  assert.equal(r.coste, 0.38);
  assert.equal(r.respondieron, 2);
  assert.equal(r.compraron, 2);
  assert.equal(r.ingresos, 1994);
  assert.equal(Math.round(r.retorno), 5247);
  assert.equal(r.porPlantilla.b.enviadas, 2);
});

test('plantillas de WhatsApp: workflow por etiqueta, que se quita al enviar', () => {
  const c = autoCtx('lanzamientos', { name: 'Octubre', fechaDirecto: '2026-10-20' }, { code: 'oct', plantillasWa: [{ nombre: 'Bienvenida', tag: 'setter-ia-enviar-bienvenida' }] });
  const lista = automatizacionesDe(c);
  const a = lista.find((x) => x.id === 'setter-plantilla');
  assert.ok(a);
  assert.ok(!lista.some((x) => x.id === 'setter-respuesta'), 'sin dirección del setter no hay workflow de respuesta');
  const p = promptAutomatizacion(a, c);
  assert.match(p, /Contact Tag Added.*«setter-ia-enviar-bienvenida»/);
  assert.match(p, /Quitar la etiqueta que lo disparó/);
  assert.match(p, /NO incluye «setter-ia-baja»/);
});
