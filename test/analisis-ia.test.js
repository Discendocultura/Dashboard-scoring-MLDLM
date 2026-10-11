// Plan → Tareas → «🧠 Análisis del lanzamiento»: qué lanzamiento se analiza y el prompt para Claude con el conector.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lanzamientoAAnalizar, promptAnalisis } from '../public/js/analisis-ia.js';
import { PLANTILLA } from '../public/js/tareas.js';

const L = [
  ['oct26', { name: 'Octubre 2026', inicioCaptacion: '2026-10-21', fechaDirecto: '2026-10-29', cierreCarrito: '2026-11-02T23:59' }],
  ['jun26', { name: 'Junio 2026', inicioCaptacion: '2026-06-01', fechaDirecto: '2026-06-10', cierreCarrito: '2026-06-15T23:59' }],
  ['mar26', { name: 'Marzo 2026', inicioCaptacion: '2026-03-01', fechaDirecto: '2026-03-10', cierreCarrito: '2026-03-15T23:59' }],
  ['nov25', { name: 'Noviembre 2025', inicioCaptacion: '2025-11-01', fechaDirecto: '2025-11-10', cierreCarrito: '2025-11-15T23:59' }],
];

test('en preparación se analiza el último que cerró, comparado con los dos anteriores', () => {
  const a = lanzamientoAAnalizar(L, 'oct26', '2026-10-11');
  assert.equal(a.objetivo[0], 'jun26');
  assert.deepEqual(a.anteriores.map(([c]) => c), ['mar26', 'nov25']);
  assert.equal(a.cerrado, false);
});

test('si el abierto ya cerró, se analiza él', () => {
  const a = lanzamientoAAnalizar(L, 'oct26', '2026-11-05');
  assert.equal(a.objetivo[0], 'oct26');
  assert.equal(a.cerrado, true);
  assert.deepEqual(a.anteriores.map(([c]) => c), ['jun26', 'mar26']);
});

test('sin ninguno cerrado: nada que analizar', () => {
  assert.equal(lanzamientoAAnalizar([L[0]], 'oct26', '2026-10-11').objetivo, null);
  assert.equal(lanzamientoAAnalizar([], '', '2026-10-11').objetivo, null);
});

test('prompt: usa las herramientas del conector con los códigos y pide mejoras accionables y razonadas', () => {
  const a = lanzamientoAAnalizar(L, 'oct26', '2026-10-11');
  const p = promptAnalisis({ cliente: { id: 'mldlm', nombre: 'Me lo dijo la matrona' }, producto: 'Raíces', objetivo: a.objetivo, anteriores: a.anteriores, siguiente: { code: 'oct26', name: 'Octubre 2026' } });
  assert.match(p, /«Junio 2026» \(código jun26\) de Me lo dijo la matrona \(programa «Raíces»\)/);
  assert.match(p, /el siguiente, «Octubre 2026» \(código oct26\)/);
  assert.match(p, /ver_embudos \(cliente: "mldlm"\)/);
  assert.match(p, /metricas_embudo del lanzamiento jun26 y de «Marzo 2026» \(código mar26\) y «Noviembre 2025» \(código nov25\)/);
  for (const t of ['encuesta_para_copy (jun26)', 'emails_lanzamiento (jun26)', 'tareas_lanzamiento (jun26, incluir_hechas: true)', 'marca_y_narrativa (jun26)']) assert.ok(p.includes(t), t);
  assert.match(p, /CUELLO DE BOTELLA/);
  assert.match(p, /MEJORAS PARA EL PRÓXIMO LANZAMIENTO/);
  assert.match(p, /Por qué: el dato que la justifica y tu razonamiento/);
  assert.match(p, /ICE/);
  assert.match(p, /OBJETIVOS PARA EL PRÓXIMO/);
  assert.match(p, /CHECKLIST DE PREPARACIÓN/);
  assert.match(p, /directo 2026-06-10, cierre 2026-06-15/);
  assert.doesNotMatch(p, /\n{3,}/);
});

test('tarea de preparación en la plantilla', () => {
  assert.ok(PLANTILLA.some((t) => t.fase === 'preparacion' && /Analizar con Claude el lanzamiento anterior/.test(t.titulo)));
});
