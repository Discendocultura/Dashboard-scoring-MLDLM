import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cicloDeContactos, cicloCompra, diasHastaCompra, textoDias } from '../public/js/ciclo.js';

const c = (alta, compra) => ({ dateAdded: `${alta}T10:00:00.000Z`, cf: { f: compra ? `${compra}T00:00:00.000Z` : '' } });

test('ciclo de compra: días desde la creación del contacto hasta la compra', () => {
  assert.equal(diasHastaCompra(c('2026-10-01', '2026-10-01'), 'f'), 0);
  assert.equal(diasHastaCompra(c('2026-09-01', '2026-10-15'), 'f'), 44);
  assert.equal(diasHastaCompra(c('2026-10-20', '2026-10-15'), 'f'), null); // compró antes de existir (importada)
  assert.equal(diasHastaCompra(c('2026-10-20', ''), 'f'), null);
  const r = cicloDeContactos([c('2026-10-01', '2026-10-01'), c('2026-10-01', '2026-10-05'), c('2026-09-01', '2026-10-15'), c('2025-09-01', '2026-10-15'), c('2026-10-20', '')], 'f');
  assert.equal(r.n, 4);
  assert.equal(r.sinFecha, 1);
  assert.equal(r.mediana, 44);
  assert.equal(r.tramos.find((t) => t.id === 'd0').n, 1);
  assert.equal(r.tramos.find((t) => t.id === 'd7').n, 1);
  assert.equal(r.tramos.find((t) => t.id === 'mas').n, 1);
  assert.equal(cicloCompra([]).media, null);
  assert.equal(textoDias(23), '23 días');
  assert.equal(textoDias(1), '1 día');
  assert.equal(textoDias(120), '3,9 meses');
});
