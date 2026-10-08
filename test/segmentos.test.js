import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidSignalTag, signalsFor, tagFor } from '../public/js/scoring.js';

test('casi compradoras: etiqueta válida del dashboard y señal leída de GHL', () => {
  assert.equal(tagFor('nov26', 'casi_compra'), 'nov26_casi_compra');
  assert.ok(isValidSignalTag('nov26_casi_compra'));
  assert.ok(!isValidSignalTag('casi_compra'));
  assert.equal(signalsFor(['nov26_casi_compra'], 'nov26', {}, {}).casi_compra, true);
});

test('anuncios de todos los lanzamientos: juntos por nombre, con coste por venta y recomendación', async () => {
  const { historicoAnuncios } = await import('../public/js/metrics.js');
  const fila = (label, leads, compras, ingresos, spend) => ({ id: label, label, leads, compras, ingresos, spend, conversion: compras / leads });
  const h = historicoAnuncios([
    { code: 'a', nombre: 'Octubre', filas: [fila('Vídeo testimonio', 100, 6, 6000, 1000), fila('Carrusel', 200, 1, 1000, 1500)] },
    { code: 'b', nombre: 'Enero', filas: [fila('vídeo testimonio', 80, 4, 4000, 800), fila('Imagen', 50, 1, 1000, 300)] },
  ]);
  const v = h.filas[0];
  assert.equal(v.label, 'Vídeo testimonio');
  assert.equal(v.compras, 10);
  assert.equal(v.lanzamientos.length, 2);
  assert.equal(v.cac, 180);
  assert.equal(v.recomendacion, 'reutilizar');
  assert.equal(h.filas.find((f) => f.label === 'Carrusel').recomendacion, 'revisar');
});

test('anuncios: sin ninguna venta no se marca nada para revisar', async () => {
  const { historicoAnuncios } = await import('../public/js/metrics.js');
  const h = historicoAnuncios([{ code: 'a', nombre: 'A', filas: [{ id: '1', label: '1', leads: 50, compras: 0, ingresos: 0, spend: null }] }]);
  assert.equal(h.filas[0].recomendacion, '');
});
