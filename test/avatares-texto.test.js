import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparaMedia, etiquetaRespuesta, deCada, conclusionesAvatares } from '../public/js/avatares-texto.js';

test('avatares en palabras: comparación con la media, etiquetas y «X de cada N»', () => {
  assert.equal(comparaMedia(1.9), 'compran casi el doble que la media');
  assert.equal(comparaMedia(1.4), 'compran un 40 % más que la media');
  assert.equal(comparaMedia(1), 'compran como la media');
  assert.equal(comparaMedia(0.4), 'compran un 60 % menos que la media');
  assert.equal(comparaMedia(3.2), 'compran 3 veces más que la media');
  assert.equal(etiquetaRespuesta({ pocos: true, indice: 3 }).texto, 'Aún pocas personas');
  assert.equal(etiquetaRespuesta({ indice: 1.3 }).tono, 'mas');
  assert.equal(etiquetaRespuesta({ indice: 0.7 }).tono, 'menos');
  assert.equal(deCada(0.25), '1 de cada 4');
  assert.equal(deCada(0.3), '3 de cada 10');
  assert.equal(deCada(0.08), '8 de cada 100');
  assert.equal(deCada(0), 'ninguna');
});

test('conclusiones: solo respuestas con datos suficientes, las que más compran y la que menos', () => {
  const r = { preguntas: [{ p: { name: '¿Edad?' }, rows: [
    { respuesta: '30 a 34', leads: 40, compras: 8, indice: 2, pocos: false },
    { respuesta: 'Más de 40', leads: 50, compras: 2, indice: 0.4, pocos: false },
    { respuesta: 'Menos de 30', leads: 3, compras: 3, indice: 9, pocos: true },
  ] }] };
  const c = conclusionesAvatares(r, { que: 'compran' });
  assert.equal(c.length, 2);
  assert.match(c[0].texto, /«30 a 34» a «¿Edad\?» compran casi el doble que la media \(8 de 40 compran\)/);
  assert.equal(c[1].tono, 'menos');
  assert.ok(!c.some((x) => x.texto.includes('Menos de 30')));
});
