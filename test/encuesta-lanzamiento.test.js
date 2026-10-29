import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preguntasDe, todasLasPreguntas } from '../public/js/encuesta.js';
import { sanitizeConfig } from '../lib/config-store.js';

test('encuesta por lanzamiento: la suya o, si no tiene, la de siempre; y todas para pedir sus campos', () => {
  const config = {
    encuesta: [{ id: 'edad', name: 'Edad', tipo: 'edad' }],
    launches: { oct: { encuesta: [{ id: 'mot', name: 'Motivación', tipo: 'opciones' }, { id: 'edad', name: 'Edad', tipo: 'edad' }] }, nov: { encuesta: [] } },
  };
  assert.deepEqual(preguntasDe(config, 'oct').map((p) => p.id), ['mot', 'edad']);
  assert.deepEqual(preguntasDe(config, 'nov').map((p) => p.id), ['edad'], 'sin propias, la de siempre');
  assert.deepEqual(preguntasDe(config, config.launches.oct).map((p) => p.id), ['mot', 'edad'], 'también con el lanzamiento');
  assert.deepEqual(preguntasDe(config, null).map((p) => p.id), ['edad'], 'VSL y venta directa: la de siempre');
  assert.deepEqual(todasLasPreguntas(config).map((p) => p.id).sort(), ['edad', 'mot']);
});

test('encuesta por lanzamiento: se guarda limpia con el lanzamiento', () => {
  const out = sanitizeConfig({ launches: { oct: { name: 'Oct', registroTag: 'reg-oct', encuesta: [{ id: 'abc123', name: '¿Motivación?', tipo: 'opciones' }, { id: '', name: 'sin campo' }, { id: 'x$y', name: 'Raro', tipo: 'otro' }] } } });
  assert.deepEqual(out.launches.oct.encuesta, [{ id: 'abc123', name: '¿Motivación?', tipo: 'opciones' }, { id: 'xy', name: 'Raro', tipo: 'opciones' }]);
});
