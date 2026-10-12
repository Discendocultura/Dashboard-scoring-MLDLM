import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pasosEquipo, estadoProceso, SECCIONES_MARCA, SECCIONES_PRODUCTO } from '../public/js/marca.js';

const val = (q) => (q.tipo === 'opciones' ? q.opciones[0] : q.tipo === 'varias' ? [q.opciones[0]] : q.tipo === 'color' ? '#aa3355' : 'x');
const obligatorias = (secs) => Object.fromEntries(secs.flatMap((s) => s.preguntas).filter((q) => !q.opcional).map((q) => [q.id, val(q)]));

test('proceso de marca: etapas en orden, sin producto pide el primero y los documentos son opcionales', () => {
  const p = pasosEquipo({ respuestas: {}, productos: [], docs: [], embudos: {} }, [{ id: 'lanz' }]);
  assert.deepEqual(p.map((x) => x.etapaN), [1, 1, 1, 2, 3, 4, 5]);
  assert.equal(p.find((x) => x.etapa === 'productos').tipo, 'producto-nuevo');
  assert.equal(p.find((x) => x.id === 'docs').estado, 'opcional');
  const e = estadoProceso(p);
  assert.equal(e.lista, false);
  assert.ok(!e.faltan.some((x) => x.id === 'docs'));
});

test('proceso de marca: con todo lo obligatorio, la ficha y un producto, está lista', () => {
  const m = { respuestas: obligatorias(SECCIONES_MARCA), productos: [{ id: 'pa', respuestas: obligatorias(SECCIONES_PRODUCTO), ficha: '' }], docs: [], embudos: {} };
  let e = estadoProceso(pasosEquipo(m, [{ id: 'lanz' }]));
  assert.deepEqual(e.faltan.map((x) => x.id), ['f:pa']);
  m.productos[0].ficha = '# Ficha';
  e = estadoProceso(pasosEquipo(m, [{ id: 'lanz' }]));
  assert.equal(e.lista, true);
  assert.equal(e.pct, 100);
  // Con dos productos, cada embudo tiene que tener el suyo.
  m.productos.push({ id: 'pb', respuestas: obligatorias(SECCIONES_PRODUCTO), ficha: '# B' });
  e = estadoProceso(pasosEquipo(m, [{ id: 'lanz' }, { id: 'vsl' }]));
  assert.deepEqual(e.faltan.map((x) => x.id), ['embudos']);
  m.embudos = { lanz: 'pa', vsl: 'pb' };
  assert.equal(estadoProceso(pasosEquipo(m, [{ id: 'lanz' }, { id: 'vsl' }])).lista, true);
});
