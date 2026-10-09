import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escenarios, proyectar, percentil, noLlega, resumenManual, supuestosLlamadas, planificar } from '../public/js/calculadora.js';
import { sanitizeConfig } from '../lib/config-store.js';

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

test('planificador: histórico a mano, CPL máximo, inversión y equipo de llamadas', () => {
  const h = resumenManual({ id: 'p1', nombre: 'Raíces 25', registros: 4000, inversion: 12000, vip: 400, ventas: 120, facturacion: 120000, llamadas: 400, shows: 280, ventasLlamada: 70, diasCarrito: 6 });
  assert.equal(h.manual, true);
  assert.equal(h.cpl, 3);
  assert.equal(h.ticket, 1000);
  assert.equal(h.roas, 10);
  assert.equal(h.pctLlamada, 0.1);
  assert.equal(h.pctShow, 0.7);
  assert.equal(h.pctCierre, 0.25);
  const s = supuestosLlamadas([h]);
  assert.equal(s.pctLlamada, 0.1);
  assert.equal(s.diasCarrito, 6);

  const esc = { cpl: 3, convVip: 0, convVenta: 0.03, ticket: 1000 };
  const r = proyectar({ ventas: 120 }, esc, {}, { roasObjetivo: 3 });
  const p = planificar(r, esc, { roasObjetivo: 3, diasCaptacion: 20, pctLlamada: 0.1, pctShow: 0.7, pctCierre: 0.25, llamadasDia: 8, diasCarrito: 6, costePersona: 1000, comision: 0.1 });
  assert.equal(p.leads, 4000);
  assert.equal(p.cplMaxRoas, 10); // 30 € por lead / ROAS 3
  assert.equal(p.inversion, 12000);
  assert.equal(p.inversionDia, 600);
  assert.equal(p.agendadas, 400);
  assert.equal(p.hechas, 280);
  assert.equal(p.ventasLlamada, 70);
  assert.equal(p.personas, 13); // pico 400/6×1,5 = 100 llamadas/día → 13 personas a 8 al día
  assert.equal(p.costeEquipo, 13000);
  assert.equal(p.comisiones, 7000);
  assert.equal(p.beneficio, 120000 - 12000 - 13000 - 7000);
  assert.ok(p.equilibrio > 0 && p.equilibrio < 120);
  // Sin datos de llamadas: no inventa el equipo.
  assert.equal(planificar(r, esc, {}).personas, null);
  assert.equal(planificar({}, esc), null);
});

test('planificador: el histórico a mano se guarda saneado en el embudo', () => {
  const c = sanitizeConfig({ embudos: [{ id: 'mldlm', tipo: 'lanzamientos', nombre: 'MLDLM', historico: [
    { id: 'h1', nombre: 'Raíces 25', registros: '4000', inversion: '12.000', ventas: 120, facturacion: -5, llamadas: 400 },
    { id: 'mal id!', nombre: '', registros: 0 },
  ] }] });
  const e = c.embudos.find((x) => x.id === 'mldlm');
  assert.equal(e.historico.length, 1);
  assert.equal(e.historico[0].registros, 4000);
  assert.equal(e.historico[0].facturacion, 0);
  assert.equal(e.historico[0].llamadas, 400);
});
