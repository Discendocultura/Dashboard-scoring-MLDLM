import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimar, medias, curvaCpl, supuestosEscenario, inversionRecomendada, proyeccion, percentil, resumenManual, planificar } from '../public/js/calculadora.js';
import { sanitizeConfig } from '../lib/config-store.js';

const L = (fecha, registros, inversion, vip, ventas, factPrograma, extra = {}) => ({
  fecha, registros, inversion, vip, ventas, facturacionPrograma: factPrograma, precioVip: 47, ...extra,
});
const hist = [
  L('2025-03-01', 2000, 6000, 200, 60, 60000, { llamadas: 120, ventasLlamada: 30 }),
  L('2025-09-01', 3000, 12000, 330, 105, 105000, { llamadas: 200, ventasLlamada: 50 }),
  L('2026-03-01', 4000, 20000, 420, 120, 126000, { llamadas: 260, ventasLlamada: 70 }),
  L('2026-05-01', 50, 100, 5, 1, 1000), // menos de 100 registros: no cuenta
];

test('planificador: medias ponderadas por volumen y recencia, con intervalo', () => {
  assert.equal(percentil([1, 2, 3, 4], 0.5), 2.5);
  const M = medias(hist);
  assert.equal(M.n, 3);
  assert.equal(M.leads, 9000);
  // El más reciente pesa más: el CPL medio queda más cerca de 5 € que de 3 €.
  assert.ok(M.cpl.valor > 4 && M.cpl.valor < 5, M.cpl.valor);
  assert.ok(M.convVenta.bajo < M.convVenta.valor && M.convVenta.valor < M.convVenta.alto);
  assert.ok(M.convVenta.valor > 0.03 && M.convVenta.valor < 0.036);
  assert.ok(Math.abs(M.ticket.valor - 1030) < 30);
  assert.ok(M.pctLlamada.valor > 0.06 && M.pctLlamada.valor < 0.067);
  assert.equal(M.pctShow, null); // nadie apuntó las llamadas hechas
  assert.ok(['alta', 'media'].includes(M.fiabilidad));
  // Un solo lanzamiento: ±20 % como mínimo.
  const uno = estimar([{ num: 30, den: 1000, w: 1 }], { tasa: true });
  assert.ok(uno.bajo < 0.03 * 0.84 && uno.alto >= 0.036 && uno.bajo > 0);
  const grande = estimar([{ num: 3000, den: 100000, w: 1 }], { tasa: true });
  assert.ok(Math.abs(grande.bajo - 0.025) < 1e-9 && Math.abs(grande.alto - 0.036) < 1e-9);
  assert.equal(medias([]).fiabilidad, 'sin datos');
});

test('planificador: curva de CPL e inversión recomendada', () => {
  const M = medias(hist);
  // CPL 3 → 4 → 5 con inversión 6k → 12k → 20k: sube al escalar.
  assert.ok(M.curva && M.curva.b > 0.3 && M.curva.b < 0.6, M.curva?.b);
  const esc = supuestosEscenario(M, 'neutro');
  const factLead = esc.convVip * 47 + esc.convVenta * esc.ticket;
  const rec = inversionRecomendada(M, { factLead, roasObjetivo: 4 });
  assert.equal(rec.motivo, 'curva');
  // En la inversión recomendada, el CPL deja justo el ROAS 4.
  assert.ok(Math.abs(factLead / M.curva.cpl(rec.valor) - 4) < 0.01 || rec.tope);
  // Sin curva (inversiones iguales): media reciente, +20 % si sobra ROAS.
  assert.equal(curvaCpl([L('a', 1000, 5000, 0, 30, 30000), L('b', 1000, 5000, 0, 30, 30000), L('c', 1000, 5000, 0, 30, 30000)]), null);
  const M2 = medias([L('2026-01-01', 1000, 5000, 0, 30, 30000)]);
  const r2 = inversionRecomendada(M2, { factLead: 30, roasObjetivo: 2.5 }); // ROAS 6
  assert.equal(r2.motivo, 'escalar');
  assert.equal(Math.round(r2.valor), 6000);
  assert.equal(inversionRecomendada(M2, { factLead: 10, roasObjetivo: 2.5 }).motivo, 'revisar');
});

test('planificador: proyección, escenarios y equipo de llamadas', () => {
  const h = resumenManual({ id: 'p1', nombre: 'Raíces 25', registros: 4000, inversion: 12000, vip: 400, ventas: 120, facturacion: 120000, llamadas: 400, shows: 280, ventasLlamada: 70, diasCarrito: 6 });
  assert.equal(h.manual, true);
  assert.equal(h.cpl, 3);
  assert.equal(h.pctCierre, 0.25);
  const M = medias([h]);
  const neutro = supuestosEscenario(M, 'neutro');
  const malo = supuestosEscenario(M, 'desfavorable');
  const bueno = supuestosEscenario(M, 'favorable');
  assert.equal(neutro.cpl, 3);
  assert.ok(malo.cpl > 3 && bueno.cpl < 3);
  assert.ok(malo.convVenta < neutro.convVenta && bueno.convVenta > neutro.convVenta);
  // Un supuesto escrito sustituye al dato.
  assert.equal(supuestosEscenario(M, 'neutro', { cpl: 5 }).cpl, 5);

  const esc = { cpl: 3, convVip: 0, convVenta: 0.03, ticket: 1000, pctLlamada: 0.1, pctShow: 0.7, pctCierre: 0.25 };
  const r = proyeccion(esc, { inversion: 12000 });
  assert.equal(r.necesario.registros, 4000);
  assert.equal(r.necesario.ventas, 120);
  assert.equal(r.necesario.facturacion, 120000);
  const p = planificar(r, esc, { roasObjetivo: 3, diasCaptacion: 20, pctLlamada: 0.1, pctShow: 0.7, pctCierre: 0.25, llamadasDia: 8, diasCarrito: 6, costePersona: 1000, comision: 0.1 });
  assert.equal(p.leads, 4000);
  assert.equal(p.cplMaxRoas, 10); // 30 € por lead / ROAS 3
  assert.equal(p.inversionDia, 600);
  assert.equal(p.agendadas, 400);
  assert.equal(p.hechas, 280);
  assert.equal(p.ventasLlamada, 70);
  assert.equal(p.personas, 13); // pico 400/6×1,5 = 100 llamadas/día → 13 personas a 8 al día
  assert.equal(p.beneficio, 120000 - 12000 - 13000 - 7000);
  assert.equal(planificar(r, esc, {}).personas, null);
  assert.equal(planificar(proyeccion(esc, {}), esc), null); // sin inversión no hay plan
  // Con curva, el CPL sube con la inversión.
  const curva = { cpl: (inv) => 3 * (inv / 12000) ** 0.5 };
  assert.equal(proyeccion(esc, { inversion: 48000, curva, cplNeutro: 3 }).cpl, 6);
});

test('planificador: el histórico a mano se guarda saneado en el embudo', () => {
  const c = sanitizeConfig({ embudos: [{ id: 'mldlm', tipo: 'lanzamientos', nombre: 'MLDLM', historico: [
    { id: 'h1', nombre: 'Raíces 25', registros: '4000', ventas: 120, facturacion: -5, llamadas: 400 },
    { id: 'mal id!', nombre: '', registros: 0 },
  ] }] });
  const e = c.embudos.find((x) => x.id === 'mldlm');
  assert.equal(e.historico.length, 1);
  assert.equal(e.historico[0].registros, 4000);
  assert.equal(e.historico[0].facturacion, 0);
});
