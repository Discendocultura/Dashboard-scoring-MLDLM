// Código para el nombre de las campañas de Meta de VSL, venta directa y meteóricos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codigoMeta, choquesMeta, ejemploCampana } from '../public/js/meta-codigo.js';

test('código por tipo de embudo', () => {
  assert.equal(codigoMeta('vsl', 'raices'), 'VSL-raices');
  assert.equal(codigoMeta('directa', 'Guía Fertilidad'), 'DIR-guia-fertilidad');
  assert.equal(codigoMeta('meteorico', 'bf26'), 'MET-bf26');
  assert.equal(codigoMeta('vsl', ''), '');
  // Sin repetir el tipo: la VSL «vsl» llamada «VSL Raíces» → VSL-raices; la «vsl-raices» → VSL-raices.
  assert.equal(codigoMeta('vsl', 'vsl', 'VSL Raíces'), 'VSL-raices');
  assert.equal(codigoMeta('vsl', 'vsl-raices'), 'VSL-raices');
  assert.equal(codigoMeta('vsl', 'vsl', ''), 'VSL-vsl');
  assert.equal(ejemploCampana('VSL-raices'), 'VSL-raices · Captación · Frío');
});

test('choques con los filtros de otros embudos (uno contiene al otro, sin mayúsculas ni acentos)', () => {
  const otros = [{ nombre: 'Octubre', filtro: 'camino-oct26' }, { nombre: 'VSL vieja', filtro: 'vsl' }, { nombre: 'Guía', filtro: 'DIR-guia' }];
  assert.deepEqual(choquesMeta('VSL-raices', otros), ['VSL vieja']);
  assert.deepEqual(choquesMeta('dir-guía-fertilidad', otros), ['Guía']);
  assert.deepEqual(choquesMeta('MET-bf26', otros), []);
  assert.deepEqual(choquesMeta('', otros), []);
});
