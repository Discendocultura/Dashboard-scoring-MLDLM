import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  signalsFor, score, estadoFor, nextStepFor, buildMessage, waPhone, isValidSignalTag, launchCodesFromTags,
} from '../public/js/scoring.js';

const s = (tags, vip = 'compra-vip') => signalsFor(tags, 'nov26', vip);

test('lead sin actividad es frío y va a la grabación', () => {
  const sig = s(['registro']);
  assert.equal(score(sig), 0);
  assert.equal(estadoFor(0).id, 'frio');
  assert.equal(nextStepFor(sig), 'grabacion');
});

test('VIP + directo hasta el final es muy caliente y va a cierre', () => {
  const sig = s(['compra-vip', 'nov26_directo_click', 'nov26_directo_asistio', 'nov26_directo_60', 'nov26_directo_final']);
  assert.equal(score(sig), 70);
  assert.equal(estadoFor(score(sig)).id, 'muy-caliente');
  assert.equal(nextStepFor(sig), 'cierre');
});

test('grabación al 50% → raíces; al 90% → cierre y caliente', () => {
  assert.equal(nextStepFor(s(['nov26_replay_50'])), 'raices');
  const full = s(['nov26_replay_50', 'nov26_replay_90']);
  assert.equal(nextStepFor(full), 'cierre');
  assert.equal(estadoFor(score(full)).id, 'caliente');
});

test('directo y grabación no se suman, cuenta el mejor', () => {
  const sig = s(['nov26_directo_asistio', 'nov26_replay_90', 'nov26_replay_50']);
  assert.equal(score(sig), 40);
});

test('las etiquetas de otro lanzamiento no cuentan', () => {
  assert.equal(score(s(['oct26_clase1_90', 'oct26_replay_90'])), 0);
});

test('mensaje con nombre y enlaces personalizados', () => {
  const msg = buildMessage('Hola {nombre}, mira {link_grabacion} {link_x}', {
    nombre: 'Ana', contactId: 'abc123', launch: { replayUrl: 'https://x.com/replay?a=1' },
  });
  assert.equal(msg, 'Hola Ana, mira https://x.com/replay?a=1&cid=abc123 {link_x}');
});

test('teléfonos para wa.me', () => {
  assert.equal(waPhone('+34 600 11 22 33'), '34600112233');
  assert.equal(waPhone('600112233'), '34600112233');
  assert.equal(waPhone('0052 55 1234 5678'), '525512345678');
  assert.equal(waPhone(''), '');
});

test('validación de etiquetas de señales', () => {
  assert.ok(isValidSignalTag('nov26_clase1_50'));
  assert.ok(isValidSignalTag('webinar-oct_wa_enviado'));
  assert.ok(!isValidSignalTag('cliente-vip'));
  assert.ok(!isValidSignalTag('nov26_borrar_todo'));
  assert.ok(!isValidSignalTag('NOV 26_clase1_50'));
  assert.deepEqual(launchCodesFromTags(['nov26_clase1_50', 'otra', 'oct26_wa_enviado']), ['nov26', 'oct26']);
});
