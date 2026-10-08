import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signalsFor, tagFor, fotosPendientes } from '../public/js/scoring.js';
import { sanitizeConfig } from '../lib/config-store.js';

test('encuesta fija: misma etiqueta en todos los lanzamientos, con foto de quien ya la tenía', () => {
  const c = sanitizeConfig({ launches: {
    oct: { name: 'Oct', registroTag: 'reg-oct', encuestaTag: 'encuesta-rellenada', createdAt: '2026-09-01T00:00:00Z' },
    nov: { name: 'Nov', registroTag: 'reg-nov', encuestaTag: 'encuesta-rellenada', createdAt: '2026-10-08T00:00:00Z' },
  } });
  assert.equal(c.launches.oct.encuestaCompartida, false); // la primera no necesita foto de la encuesta
  assert.equal(c.launches.nov.encuestaCompartida, true);
  assert.ok(!fotosPendientes(c.launches.oct).some((f) => f.field === 'encuestaTag'));
  assert.ok(fotosPendientes(c.launches.nov).some((f) => f.field === 'encuestaTag'));
  const nov = { ...c.launches.nov, snapshot: { at: 'x', counts: {}, tags: { encuestaTag: 'encuesta-rellenada' } } };
  assert.ok(!fotosPendientes(nov).some((f) => f.field === 'encuestaTag'));
  // Señales: la rellenó en este lanzamiento / en uno anterior
  const nueva = signalsFor(['reg-nov', 'encuesta-rellenada'], 'nov', nov);
  assert.equal(nueva.encuesta, true);
  const vieja = signalsFor(['reg-nov', 'encuesta-rellenada', tagFor('nov', 'encuesta_previo')], 'nov', nov);
  assert.equal(vieja.encuesta, false);
  assert.equal(vieja.encuesta_anterior, true);
});
