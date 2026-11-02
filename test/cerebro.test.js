import { test } from 'node:test';
import assert from 'node:assert/strict';
import { referencia, referenciaDe, prediccion, comparar, textoPrediccion, textoComparativa, resumenSerie } from '../public/js/cerebro.js';

const r = (formato, convVenta, convDirecto, cpl, registros = 1000) => ({ formato, registros, convVenta, convDirecto, cpl, convVip: 0.05 });

test('cerebro: referencia por formato (mínimo 3 lanzamientos y 100 registros)', () => {
  assert.deepEqual(resumenSerie([0.01, 0.02, 0.03, 0.04]), { n: 4, p25: 0.0175, mediana: 0.025, p75: 0.0325 });
  const ref = referencia([r('webinar', 0.02, 0.3, 2), r('webinar', 0.03, 0.4, 3), r('webinar', 0.04, 0.5, 4), r('v2', 0.05, 0.4, 2), r('webinar', 0.9, 0.9, 1, 50)]);
  assert.equal(ref.webinar.lanzamientos, 3);
  assert.equal(ref.webinar.convVenta.mediana, 0.03);
  assert.equal(ref.v2.convVenta, undefined); // solo 1
  assert.equal(referenciaDe(ref, 'v2').formato, 'todos'); // sin datos suficientes del formato: la de todos
  assert.equal(referenciaDe(ref, 'webinar').formato, 'webinar');
});

test('cerebro: predicción a este ritmo y lo que falta para el objetivo', () => {
  const p = prediccion({ registros: 1000, ritmo: { actualDia: 100, quedan: 5 }, objetivo: { ventas: 40 }, inversion: 2000, convPropia: { valor: 0.02, p25: 0.015, p75: 0.025, n: 3 } });
  assert.deepEqual([p.registrosFinales, p.ventas, p.ventasBajo, p.ventasAlto, p.faltanRegistros, p.eurosExtra, p.llega], [1500, 30, 23, 38, 500, 1000, false]);
  assert.match(textoPrediccion(p, { ventas: 40 }), /unas 30 ventas \(entre 23 y 38\).*faltan unos 500 registros \(≈ 1000 € más/);
  assert.equal(prediccion({ registros: 100 }).sinConversion, true);
});

test('cerebro: la fase donde más se pierde frente a la agencia', () => {
  const ref = referencia([r('webinar', 0.02, 0.3, 2), r('webinar', 0.03, 0.4, 3), r('webinar', 0.04, 0.5, 4)]).webinar;
  const c = comparar({ cpl: 2, convDirecto: 0.2, convVenta: null }, [], ref);
  assert.equal(c.peor.id, 'convDirecto');
  assert.equal(c.filas.find((f) => f.id === 'cpl').vsRef, (3 - 2) / 3); // más barato = mejor
  assert.match(textoComparativa(c), /directo \(«Entran al directo»\): 20 % frente a 40 % de mediana .*\(un 50 % peor/);
});

test('cerebro: ratios desde los resultados guardados (cantidades)', async () => {
  const { ratiosDeResultados } = await import('../public/js/cerebro.js');
  assert.deepEqual(ratiosDeResultados({ registros: 1000, ventas: 20, vip: 50, inversion: 2500, directo: 400, final: 200, clase1: 0 }),
    { registros: 1000, formato: 'webinar', cpl: 2.5, convVip: 0.05, convClase1: null, convDirecto: 0.4, convFinal: 0.2, convVenta: 0.02 });
});
