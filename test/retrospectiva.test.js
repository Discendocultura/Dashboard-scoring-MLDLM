import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retrospectiva } from '../public/js/retrospectiva.js';

const m = (o) => ({ total: 1000, live: 300, soloReplay: 100, vip: 100, compra: 50, conVip: true, eco: { cpl: 2, facturacion: 50000, roas: 5 }, ...o });

test('retrospectiva: compara con el anterior y propone tareas', () => {
  const r = retrospectiva(m({ total: 700, eco: { cpl: 3, facturacion: 40000, roas: 4 } }), m(), {
    nombrePrev: 'Octubre',
    bonus: [{ id: 'b1', nombre: 'Masterclass', tipo: 'bar_48h', efecto: 2.1 }, { id: 'b2', nombre: 'Guía', tipo: 'bar_24h', efecto: 0.9 }, { id: 'b3', nombre: 'Comunidad', tipo: 'bonus', efecto: 1 }],
  });
  assert.equal(r.filas.find((f) => f.id === 'registros').tono, 'peor');
  assert.equal(r.filas.find((f) => f.id === 'cpl').tono, 'peor');
  const ids = r.aprendizajes.map((a) => a.id);
  assert.ok(ids.includes('registros') && ids.includes('cpl'));
  assert.ok(r.aprendizajes.find((a) => a.id === 'bonus-b1').tarea.titulo.includes('repetir'));
  assert.ok(r.aprendizajes.find((a) => a.id === 'bonus-b2').tarea.titulo.includes('cambiar'));
  assert.ok(!ids.includes('bonus-b3'));
  assert.ok(r.aprendizajes.find((a) => a.id === 'conversion')); // 50/700 > 50/1000 → mejor
});

test('retrospectiva: sin lanzamiento anterior, solo los bonus', () => {
  const r = retrospectiva(m(), null, { bonus: [{ id: 'b', nombre: 'X', tipo: 'bar_24h', efecto: 0.5 }] });
  assert.equal(r.conAnterior, false);
  assert.deepEqual(r.aprendizajes.map((a) => a.id), ['bonus-b']);
});
