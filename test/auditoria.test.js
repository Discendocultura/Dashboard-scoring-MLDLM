// Fallos encontrados en la auditoría completa del dashboard (octubre 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeConfig } from '../lib/config-store.js';
import { dinero, sanitizePago, planesActivos } from '../public/js/pago.js';
import { nextLaunchStart, ventasPorDia } from '../public/js/metrics.js';
import { dayOfDateField } from '../public/js/scoring.js';
import { esVentaMeteorico } from '../public/js/meteorico.js';

test('importes con punto de miles se guardan bien', () => {
  const cfg = sanitizeConfig({ launches: { 'raices-2610': {
    precioPrograma: '1.164', precioFraccionado: '1.164,50', inversion: '2.500', precioVip: '27',
    objetivos: { registros: '1.000', facturacion: '10.000' }, calculadora: { presupuesto: '3.000', convVip: '2,5' },
  } } });
  const l = cfg.launches['raices-2610'];
  assert.equal(l.precioPrograma, 1164);
  assert.equal(l.precioFraccionado, 1164.5);
  assert.equal(l.inversion, 2500);
  assert.equal(l.precioVip, 27);
  assert.equal(l.objetivos.registros, 1000);
  assert.equal(l.objetivos.facturacion, 10000);
  assert.equal(l.calculadora.presupuesto, 3000);
  assert.equal(l.calculadora.convVip, 2.5);
  assert.equal(dinero('97.5'), 97.5);
  assert.equal(dinero(1164.5), 1164.5);
  const pago = sanitizePago({ tipo: 'suscripcion', planes: { anual: { activo: true, precio: '1.200' } } });
  assert.equal(planesActivos({ pago })[0].precio, 1200);
});

test('el lanzamiento de otro embudo no corta las ventas', () => {
  const config = { launches: {
    a1: { embudo: 'A', inicioCaptacion: '2026-01-05' },
    a2: { embudo: 'A', inicioCaptacion: '2026-03-01' },
    b1: { embudo: 'B', inicioCaptacion: '2026-01-20' },
  } };
  assert.equal(nextLaunchStart(config, 'a1'), '2026-03-01');
  assert.equal(nextLaunchStart(config, 'b1'), '');
});

test('ventas por día: una venta tras 60 días no rompe la vista', () => {
  const lead = (d) => ({ s: { compra: true, fecha_compra: d } });
  const r = ventasPorDia([lead('2026-01-12'), lead('2026-04-30')], { fechaDirecto: '2026-01-10', compraDateField: 'f', precioPrograma: 100 });
  assert.equal(r.days.length, 60);
  assert.equal(r.days.reduce((t, d) => t + d.n, 0), 1);
  assert.equal(r.despues, 1);
});

test('fecha de compra: medianoche, hora real y marcas de tiempo', () => {
  assert.equal(dayOfDateField('2026-11-27T23:00:00.000Z'), '2026-11-28'); // medianoche en España
  assert.equal(dayOfDateField('2026-03-11T00:00:00.000Z'), '2026-03-11');
  assert.equal(dayOfDateField('2026-03-11T20:30:00.000Z'), '2026-03-11'); // compra a las 21:30 en España
  assert.equal(dayOfDateField('2026-03-11'), '2026-03-11');
  assert.equal(dayOfDateField(1773187200000), '2026-03-11');
  assert.equal(dayOfDateField('1773187200'), '2026-03-11'); // segundos
  const m = { compraTag: 'c', compraDateField: 'f', calentamiento: '2026-11-25', apertura: '2026-11-26T10:00', cierre: '2026-11-28T23:59' };
  assert.equal(esVentaMeteorico({ tags: ['c'], cf: { f: '2026-11-27T23:00:00.000Z' } }, m), true);
  assert.equal(esVentaMeteorico({ tags: ['c'], cf: { f: Date.parse('2026-11-27T12:00:00Z') } }, m), true);
});
