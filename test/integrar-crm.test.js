import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limpiarCuentaMeta, ayudaMetaHtml, pasosIntegrarCrm, pistaError, META_EMAIL_AGENCIA } from '../public/js/integrar-crm.js';

test('limpiarCuentaMeta: deja solo el número de la cuenta', () => {
  assert.equal(limpiarCuentaMeta('act_123456789'), '123456789');
  assert.equal(limpiarCuentaMeta(' 1234 5678 '), '12345678');
  assert.equal(limpiarCuentaMeta('https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=987654321&business_id=55'), '987654321');
  assert.equal(limpiarCuentaMeta(''), '');
});

test('ayudaMetaHtml: qué poner, dónde y el acceso a la agencia', () => {
  const h = ayudaMetaHtml();
  assert.match(h, /sin <code>act_<\/code>/);
  assert.ok(h.includes(META_EMAIL_AGENCIA));
  assert.match(h, /Cuentas publicitarias/);
  assert.match(h, /Antes, el cliente tiene que darnos acceso/);
});

test('pasosIntegrarCrm: 5 pasos con la variable del cliente y datos escapados', () => {
  const { variable, pasos } = pasosIntegrarCrm({ id: 'clinica-sol', nombre: 'Sol <b>', locationId: 'abc123' });
  assert.equal(variable, 'GHL_TOKEN_CLINICA_SOL');
  assert.deepEqual(pasos.map((p) => p.id), ['subcuenta', 'integracion', 'token', 'cloudflare', 'desplegar']);
  assert.ok(pasos[3].html.includes('GHL_TOKEN_CLINICA_SOL'));
  assert.ok(pasos[0].html.includes('abc123'));
  assert.ok(pasos[0].html.includes('Sol &lt;b&gt;'));
});

test('pistaError: lleva al paso que hay que revisar', () => {
  assert.equal(pistaError('Falta conectar el GHL de «Sol»: añade GHL_TOKEN_SOL en Cloudflare').paso, 'desplegar');
  assert.equal(pistaError('GoHighLevel ha rechazado el token: revisa…').paso, 'integracion');
  assert.equal(pistaError('Location not found').paso, 'subcuenta');
  assert.equal(pistaError('algo raro').paso, null);
});

test('mensaje para el cliente y pasos de Meta (cuenta de la agencia o portfolio propio)', async () => {
  const { mensajeClienteMeta, pasosMeta } = await import('../public/js/integrar-crm.js');
  const m = mensajeClienteMeta('Ana');
  assert.match(m, /^Hola Ana:/);
  assert.ok(m.includes(META_EMAIL_AGENCIA));
  assert.match(m, /Control total/);
  const ag = pasosMeta({ id: 'sol', nombre: 'Sol "&"' }, 'agencia');
  assert.deepEqual(ag.map((p) => p.id), ['meta-pedir', 'meta-asignar', 'meta-cuenta']);
  assert.ok(ag.at(-1).campo);
  assert.match(ag[1].html, /Usuarios del sistema/);
  const pr = pasosMeta({ id: 'clinica-sol', nombre: 'Sol' }, 'propio');
  assert.deepEqual(pr.map((p) => p.id), ['meta-app', 'meta-usuario', 'meta-activos', 'meta-token', 'meta-cloudflare', 'meta-desplegar', 'meta-cuenta']);
  assert.ok(pr[4].html.includes('META_ACCESS_TOKEN_CLINICA_SOL'));
  assert.match(pr[3].html, /ads_read/);
  assert.match(ayudaMetaHtml(), /Copiar mensaje para el cliente/);
});

test('Zoom y SendFlow: de la agencia sin pasos; propio con sus pasos y variables exactas', async () => {
  const { pasosDe, SCOPES_ZOOM, SERVICIOS, ETAPAS } = await import('../public/js/integrar-crm.js');
  const c = { id: 'clinica-sol', nombre: 'Sol', locationId: 'x' };
  assert.deepEqual(ETAPAS, ['crm', 'meta', 'zoom', 'sendflow']);
  assert.equal(pasosDe('zoom', 'agencia', c).length, 0);
  assert.equal(pasosDe('sendflow', 'ninguno', c).length, 0);
  assert.equal(pasosDe('meta', 'ninguno', c).length, 0);
  const z = pasosDe('zoom', 'propio', c);
  assert.equal(z.length, 8);
  const zc = z.find((p) => p.id === 'zoom-cloudflare').html;
  for (const v of ['ZOOM_ACCOUNT_ID_CLINICA_SOL', 'ZOOM_CLIENT_ID_CLINICA_SOL', 'ZOOM_CLIENT_SECRET_CLINICA_SOL']) assert.ok(zc.includes(v), v);
  for (const sc of SCOPES_ZOOM) assert.ok(z.find((p) => p.id === 'zoom-scopes').html.includes(sc), sc);
  const sf = pasosDe('sendflow', 'propio', c);
  assert.ok(sf.find((p) => p.id === 'sf-cloudflare').html.includes('SENDFLOW_API_KEY_CLINICA_SOL'));
  assert.equal(new Set([...z, ...sf, ...pasosDe('meta', 'propio', c), ...pasosDe('crm', '', c)].map((p) => p.id)).size, 8 + 4 + 7 + 5); // ids únicos
  assert.deepEqual(SERVICIOS.zoom.opciones.map((o) => o.id), ['agencia', 'propio', 'ninguno']);
});
