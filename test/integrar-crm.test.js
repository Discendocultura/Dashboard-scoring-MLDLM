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

test('mensaje para el cliente y pasos de Meta', async () => {
  const { mensajeClienteMeta, pasosMeta } = await import('../public/js/integrar-crm.js');
  const m = mensajeClienteMeta('Ana');
  assert.match(m, /^Hola Ana:/);
  assert.ok(m.includes(META_EMAIL_AGENCIA));
  assert.match(m, /Control total/);
  const pasos = pasosMeta({ nombre: 'Sol "&"' });
  assert.deepEqual(pasos.map((p) => p.id), ['meta-pedir', 'meta-aceptar', 'meta-cuenta']);
  assert.ok(pasos[0].html.includes('Sol &quot;&amp;&quot;'));
  assert.equal(pasos[2].campo, true);
  assert.match(ayudaMetaHtml(), /Copiar mensaje para el cliente/);
});
