import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enGruposDe } from '../public/js/grupos-wa.js';

test('grupos de WhatsApp: sin teléfono en la mayoría de leads, cuentan las personas de los grupos (no el cruce)', () => {
  const lead = (phone, enGrupo) => ({ phone, s: { enGrupo } });
  // La Resistencia: 84 leads, solo 4 con teléfono (los 4 en el grupo) y 70 personas en los grupos
  const pocos = [...Array(4)].map(() => lead('+34600111222', true)).concat([...Array(80)].map(() => lead('', false)));
  assert.deepEqual(enGruposDe(pocos, { personas: 70 }), { n: 70, exacto: false, conTelefono: 4 });
  // Con teléfono en la mayoría: el cruce exacto
  const muchos = [...Array(8)].map((_, i) => lead('+34600111222', i < 3)).concat([lead('', false), lead('', false)]);
  assert.deepEqual(enGruposDe(muchos, { personas: 70 }), { n: 3, exacto: true, conTelefono: 8 });
  // Nunca más que los leads
  assert.equal(enGruposDe([lead('', false)], { personas: 70 }).n, 1);
});
