import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claveTelefono, leerMiembros } from '../public/js/grupos-wa.js';

test('grupos de WhatsApp: clave del teléfono (últimos 9 dígitos)', () => {
  assert.equal(claveTelefono('+34 600 11 22 33'), '600112233');
  assert.equal(claveTelefono('0034600112233'), '600112233');
  assert.equal(claveTelefono('600112233'), '600112233');
  assert.equal(claveTelefono('123'), '');
});

test('grupos de WhatsApp: lee el CSV de SendFlow, deduplica y quita a las administradoras', () => {
  const csv = '﻿Position;Group;Name;Number\n1;G1;Ana;34600112233\n2;G2;Ana;34600112233\n3;G1;Eva;34611223344\n4;G3;Luz;+34 622 33 44 55\n0;G1;Admin;34699999999\n0;G2;Admin;34699999999\n0;G3;Admin;34699999999\n';
  const m = leerMiembros(csv);
  assert.equal(m.grupos, 3);
  assert.equal(m.admins, 1);
  assert.equal(m.personas, 3); // Ana (en dos grupos) cuenta una vez
  assert.ok(m.claves.has('600112233') && m.claves.has('622334455') && !m.claves.has('699999999'));
  // Cabecera en portugués y separador coma
  const pt = leerMiembros('Posição,Grupo,Nome,Número\n1,"G1","Bea","5511987654321"');
  assert.equal(pt.personas, 1);
  assert.ok(pt.claves.has('987654321'));
  // Con menos de 3 grupos no se descarta a nadie por estar en todos
  assert.equal(leerMiembros('Position;Group;Name;Number\n1;G1;A;34600000001\n2;G2;A;34600000001').personas, 1);
});
