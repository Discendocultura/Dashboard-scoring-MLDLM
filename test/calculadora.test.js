import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escenarios, proyectar, percentil, noLlega } from '../public/js/calculadora.js';

const hist = [
  { registros: 2000, cpl: 3, convVip: 0.10, convVenta: 0.03, ticket: 900 },
  { registros: 3000, cpl: 4, convVip: 0.12, convVenta: 0.04, ticket: 1000 },
  { registros: 2500, cpl: 5, convVip: 0.08, convVenta: 0.05, ticket: 1100 },
  { registros: 0, cpl: null, convVip: null, convVenta: null, ticket: null }, // sin datos: no cuenta
];

test('calculadora: escenarios con percentiles del histórico', () => {
  assert.equal(percentil([1, 2, 3, 4], 0.5), 2.5);
  const e = escenarios(hist);
  assert.equal(e.n, 3);
  assert.equal(e.neutro.cpl, 4);
  assert.equal(e.favorable.cpl, 3.5); // CPL bajo
  assert.equal(e.desfavorable.cpl, 4.5);
  assert.ok(e.favorable.convVenta > e.neutro.convVenta && e.neutro.convVenta > e.desfavorable.convVenta);
  // Un supuesto manual sustituye al histórico (±20 %)
  const m = escenarios(hist, { cpl: 6 });
  assert.equal(m.neutro.cpl, 6);
  assert.ok(Math.abs(m.favorable.cpl - 4.8) < 1e-9);
  assert.equal(m.fuente.cpl, 'manual');
  // Sin histórico ni supuestos: nada
  assert.equal(escenarios([]).neutro.cpl, null);
  // Con uno solo: ±20 %
  assert.ok(Math.abs(escenarios([hist[0]]).favorable.convVenta - 0.036) < 1e-9);
});

test('calculadora: registros, inversión y CPL para llegar al objetivo', () => {
  const esc = { cpl: 4, convVip: 0.1, convVenta: 0.04, ticket: 1000 };
  const p = proyectar({ ventas: 100, registros: 2000 }, esc, { registros: 1000, inversion: 3000 }, { precioVip: 27, roasObjetivo: 2, diasCaptacion: 10 });
  assert.equal(p.manda, 'ventas');
  assert.equal(p.necesario.registros, 2500);
  assert.equal(p.necesario.inversion, 10000);
  assert.equal(p.faltan, 1500);
  assert.equal(p.porDia, 150);
  assert.equal(p.inversionPendiente, 7000);
  assert.ok(Math.abs(p.cplMax - 42.7) < 1e-9); // 0,1×27 + 0,04×1000
  assert.ok(Math.abs(p.cplRecomendado - 21.35) < 1e-9);
  // Proyector: con presupuesto de 8.000 € → 1000 + 5000/4 = 2250 registros → 90 ventas (no llega)
  const b = proyectar({ ventas: 100 }, esc, { registros: 1000, inversion: 3000 }, { presupuesto: 8000 });
  assert.equal(b.conPresupuesto.registros, 2250);
  assert.deepEqual(noLlega({ ventas: 100 }, b.conPresupuesto), ['ventas']);
  // Al ritmo actual
  const r = proyectar({ ventas: 100 }, esc, { registros: 1000 }, { ritmoDiario: 200, diasCaptacion: 10 });
  assert.equal(r.alRitmo.registros, 3000);
  assert.deepEqual(noLlega({ ventas: 100 }, r.alRitmo), []);
  // Sin conversión conocida no se puede calcular
  assert.equal(proyectar({ ventas: 10 }, { cpl: 4 }).calculable, false);
});
