import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidSignalTag, signalsFor, tagFor } from '../public/js/scoring.js';

test('casi compradoras: etiqueta válida del dashboard y señal leída de GHL', () => {
  assert.equal(tagFor('nov26', 'casi_compra'), 'nov26_casi_compra');
  assert.ok(isValidSignalTag('nov26_casi_compra'));
  assert.ok(!isValidSignalTag('casi_compra'));
  assert.equal(signalsFor(['nov26_casi_compra'], 'nov26', {}, {}).casi_compra, true);
});
