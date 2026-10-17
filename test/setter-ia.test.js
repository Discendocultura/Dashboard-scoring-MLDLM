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
  assert.ok(!sin.some((a) => a.id.startsWith('setter')));
  const c = autoCtx('lanzamientos', L, { code: 'oct', setterUrl: 'https://setter.x.dev', clienteId: 'mldlm' });
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
