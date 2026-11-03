import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metricasPago, esDePago, entradaSinIva, participo, textoPago } from '../public/js/pago-lanzamiento.js';
import { computeMetrics } from '../public/js/metrics.js';
import { sanitizeConfig } from '../lib/config-store.js';

const launch = { formato: 'reto3', entradaPago: true, precioEntrada: 27, iva: { entrada: 'mas', pct: 21 }, videos: [] };
const lead = (s, score = 10, estado = 'frio') => ({ s, score, estado: { id: estado } });

test('Lanzamiento de pago: coste por entrada, ROAS de entradas, calidad y paso al programa', () => {
  assert.ok(esDePago(launch));
  assert.equal(entradaSinIva(launch), 27);
  assert.equal(entradaSinIva({ precioEntrada: 24.2, iva: { entrada: 'incluido', pct: 21 } }), 20);
  assert.ok(participo({ directo2_asistio: true }, launch)); // día 2 del reto
  assert.ok(!participo({}, launch));
  const leads = [lead({ directo_asistio: true, compra: true }, 80, 'muy-caliente'), lead({ replay3_50: true }, 45, 'caliente'), lead({}, 5), lead({}, 0)];
  const p = metricasPago(leads, launch, { inversion: 200, facturacionPrograma: 997 });
  assert.equal(p.entradas, 4);
  assert.equal(p.ingresosEntradas, 108);
  assert.equal(p.cpaEntrada, 50);
  assert.equal(p.roasEntradas, 0.54);
  assert.equal(p.autoliquidable, false);
  assert.equal(p.faltanParaAutoliquidar, 4); // (200 - 108) / 27 → 4 entradas más
  assert.deepEqual([p.participan, p.pctParticipan, p.calientes, p.compraPrograma, p.convPrograma], [2, 0.5, 2, 1, 0.25]);
  assert.equal(p.notaEntrada, 3.3); // puntuación media 32,5 → 3,3 / 10
  assert.equal(p.roasTotal, (108 + 997) / 200);
  assert.ok(metricasPago(leads, launch, { inversion: 100 }).autoliquidable);
  assert.match(textoPago(p), /4 entradas vendidas, a 50 € cada una, faltan 4 entradas/);
});

test('Lanzamiento de pago: el embudo lo marca, el lanzamiento lo hereda y las métricas suman las entradas', () => {
  const c = sanitizeConfig({
    embudos: [{ id: 'reto', tipo: 'lanzamientos', nombre: 'Reto de pago', formato: 'reto5', entradaPago: true }, { id: 'web', tipo: 'lanzamientos', nombre: 'Webinar', formato: 'webinar' }],
    launches: { r1: { name: 'Reto', embudo: 'reto', registroTag: 'compro-entrada', precioEntrada: '27', iva: { entrada: 'mas' } }, w1: { name: 'Web', embudo: 'web', registroTag: 'reg' } },
  });
  assert.equal(c.embudos.find((e) => e.id === 'reto').entradaPago, true);
  assert.equal(c.embudos.find((e) => e.id === 'web').entradaPago, undefined);
  assert.equal(c.launches.r1.entradaPago, true);
  assert.equal(c.launches.r1.precioEntrada, 27);
  assert.equal(c.launches.w1.entradaPago, false);
  const leads = [{ s: { compra: false }, score: 20, estado: { id: 'templado' } }, { s: {}, score: 0, estado: { id: 'frio' } }];
  const m = computeMetrics(leads, c.launches.r1, { metaSpend: 30 });
  assert.equal(m.eco.facturacionEntradas, 54);
  assert.equal(m.entrada.entradas, 2);
  assert.equal(m.entrada.roasEntradas, 54 / 30);
  assert.equal(computeMetrics(leads, c.launches.w1, { metaSpend: 30 }).entrada, undefined);
});

test('Lanzamiento de pago: hasta 4 bump offers en la compra de la entrada, en la facturación y en la tarjeta', async () => {
  const bumps = [1, 2, 3, 4, 5].map((i) => ({ id: `b${i}`, nombre: `Bump ${i}`, precio: '10', iva: 'mas', tag: `bump-${i}` }));
  const c = sanitizeConfig({
    embudos: [{ id: 'reto', tipo: 'lanzamientos', nombre: 'Reto de pago', formato: 'reto5', entradaPago: true }, { id: 'web', tipo: 'lanzamientos', nombre: 'Webinar', formato: 'webinar' }],
    launches: { r1: { name: 'Reto', embudo: 'reto', registroTag: 'compro-entrada', precioEntrada: '27', iva: { entrada: 'mas' }, entradaBumps: bumps }, w1: { name: 'Web', embudo: 'web', registroTag: 'reg', entradaBumps: bumps } },
  });
  assert.equal(c.launches.r1.entradaBumps.length, 4); // como mucho 4
  const { signalsFor } = await import('../public/js/scoring.js');
  const leads = [['compro-entrada', 'bump-1', 'bump-2'], ['compro-entrada', 'bump-1'], ['compro-entrada']]
    .map((tags) => ({ s: signalsFor(tags, 'r1', c.launches.r1, {}), score: 0, estado: { id: 'frio' } }));
  const m = computeMetrics(leads, c.launches.r1, { metaSpend: 100 });
  const b1 = m.bumps.find((b) => b.id === 'b1');
  assert.deepEqual([b1.tipo, b1.n, b1.base, b1.facturacion], ['entrada', 2, 3, 20]);
  assert.equal(m.eco.facturacionBumps, 30);
  assert.equal(m.eco.facturacion, 3 * 27 + 30);
  assert.equal(m.entrada.ingresosBumps, 30);
  assert.equal(m.entrada.ticketEntrada, (81 + 30) / 3);
  assert.equal(m.entrada.bumps.length, 4);
  // En un lanzamiento que no es de pago, no cuentan
  assert.ok(!computeMetrics(leads, c.launches.w1, { metaSpend: 100 }).bumps.some((b) => b.tipo === 'entrada'));
});
