import { test } from 'node:test';
import assert from 'node:assert/strict';
import { semanasDelMes, rangoDe, enrichVsl, computeVsl, porSemanas, porDias } from '../public/js/embudo-vsl.js';

const vsl = { vioTag: 'et-ve-vsl-raices', compraTag: 'et-compra-raices-vsl', compraDateField: 'fc', registroDateField: '', precioPrograma: 1000, precioFraccionado: 1200, fraccionadoTag: 'frac' };

test('semanas del mes: 1ª a 5ª', () => {
  assert.deepEqual(semanasDelMes('2026-02').map((w) => [w.n, w.desde, w.hasta]), [[1, '2026-02-01', '2026-02-07'], [2, '2026-02-08', '2026-02-14'], [3, '2026-02-15', '2026-02-21'], [4, '2026-02-22', '2026-02-28']]);
  assert.deepEqual(semanasDelMes('2026-10').at(-1), { n: 5, desde: '2026-10-29', hasta: '2026-10-31' });
});

test('rangos: presets, mes y semana, personalizado', () => {
  const hoy = '2026-10-06';
  assert.deepEqual(rangoDe({ preset: '7d' }, hoy), { desde: '2026-09-30', hasta: hoy });
  assert.deepEqual(rangoDe({ preset: 'mes-actual' }, hoy), { desde: '2026-10-01', hasta: '2026-10-31' });
  assert.deepEqual(rangoDe({ preset: 'mes-pasado' }, hoy), { desde: '2026-09-01', hasta: '2026-09-30' });
  assert.deepEqual(rangoDe({ preset: 'mes', mes: '2026-08', semana: 3 }, hoy), { desde: '2026-08-15', hasta: '2026-08-21' });
  assert.deepEqual(rangoDe({ preset: 'personalizado', desde: '2026-10-05', hasta: '2026-10-01' }, hoy), { desde: '2026-10-01', hasta: '2026-10-05' });
  assert.deepEqual(rangoDe({}, hoy), { desde: '2026-09-07', hasta: hoy });
});

test('señales y métricas de la VSL', () => {
  const mk = (id, tags, dateAdded, cf = {}, src = {}) => enrichVsl({ id, name: id, email: '', phone: '600111222', tags, dateAdded, cf, src }, vsl);
  const leads = [
    mk('a', ['et-ve-vsl-raices', 'vsl_vsl_25', 'vsl_vsl_50', 'vsl_vsl_75', 'vsl_vsl_90', 'et-compra-raices-vsl'], '2026-10-02T10:00:00Z', { fc: '2026-10-03T10:00:00Z' }, { medium: 'paid', campaign: '1' }),
    mk('b', ['et-ve-vsl-raices'], '2026-10-03T10:00:00Z'),
    mk('c', [], '2026-10-09T10:00:00Z'),
    // Se registró en septiembre y compró en octubre (a plazos)
    mk('d', ['et-compra-raices-vsl', 'frac'], '2026-09-20T10:00:00Z', { fc: '2026-10-04T10:00:00Z' }),
  ];
  assert.equal(leads[0].s.pct, 90);
  assert.equal(leads[0].estado, 'compro');
  assert.equal(leads[0].s.origen, 'publi');
  assert.equal(leads[1].estado, 'vio');
  assert.equal(leads[2].estado, 'novio');
  assert.equal(leads[2].phoneWa, '34600111222');
  const m = computeVsl(leads, { desde: '2026-10-01', hasta: '2026-10-07' }, vsl, { inversion: 500 });
  assert.equal(m.registros, 2);
  assert.equal(m.vio, 2);
  assert.equal(m.vio90, 1);
  assert.equal(m.ventas, 2); // a y d
  assert.equal(m.ingresos, 2200);
  assert.equal(m.cpl, 250);
  assert.equal(m.roas, 4.4);
  const sem = porSemanas(leads, { desde: '2026-10-01', hasta: '2026-10-31' }, vsl);
  assert.equal(sem.length, 5);
  assert.equal(sem[0].m.registros, 2);
  assert.equal(sem[1].m.registros, 1);
  const dias = porDias(leads, { desde: '2026-10-01', hasta: '2026-10-04' });
  assert.deepEqual(dias.map((d) => [d.registros, d.ventas]), [[0, 0], [1, 0], [1, 1], [0, 1]]);
});
