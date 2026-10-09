import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizePago, planDeTags, importeVenta, resumenPlanes, planesActivos, pendientesPago, enlacePago, conFraccionado } from '../public/js/pago.js';
import { metricasMeteorico } from '../public/js/meteorico.js';
import { computeMetrics } from '../public/js/metrics.js';
import { sanitizeConfig } from '../lib/config-store.js';

const sus = {
  pago: sanitizePago({
    tipo: 'suscripcion',
    planes: {
      mensual: { activo: true, precio: '29', tag: 'Plan-Mensual', url: 'https://pago/m' },
      anual: { activo: true, precio: 240, tag: 'plan-anual', url: 'https://pago/a' },
      trimestral: { activo: false, precio: 80 },
    },
  }),
};

test('sanitizePago: por defecto pago único con fraccionado; suscripción con planes', () => {
  assert.deepEqual(sanitizePago(undefined), { tipo: 'unico', fraccionado: true, planes: {} });
  assert.equal(sanitizePago({ fraccionado: false }).fraccionado, false);
  assert.equal(sus.pago.planes.mensual.tag, 'plan-mensual');
  assert.deepEqual(planesActivos(sus).map((p) => p.id), ['mensual', 'anual']);
  assert.equal(conFraccionado(sus), false);
});

test('importe y plan según las etiquetas', () => {
  assert.equal(planDeTags(['plan-anual', 'x'], sus), 'anual');
  assert.equal(importeVenta({ plan: 'anual' }, sus, {}), 240);
  assert.equal(importeVenta({ plan: '' }, sus, {}), 29); // sin plan: el primero
  const unico = { pago: sanitizePago({}) };
  assert.equal(importeVenta({ fraccionado: true }, unico, { unico: 997, fraccionado: 1164 }), 1164);
  const sinFr = { pago: sanitizePago({ fraccionado: false }) };
  assert.equal(importeVenta({ fraccionado: true }, sinFr, { unico: 997, fraccionado: 1164 }), 997);
});

test('resumenPlanes: altas, facturación y MRR', () => {
  const ventas = [{ p: 'mensual' }, { p: 'mensual' }, { p: 'anual' }, { p: '' }];
  const r = resumenPlanes(ventas, sus, (v) => v.p);
  assert.equal(r.total, 4);
  assert.deepEqual(r.filas.map((f) => [f.label, f.n]), [['Mensual', 2], ['Anual', 1], ['Sin etiqueta de plan', 1]]);
  assert.equal(r.facturacion, 29 * 3 + 240);
  assert.equal(r.mrr, 29 * 3 + 20);
});

test('pendientes y enlace de pago', () => {
  assert.match(pendientesPago({ pago: { tipo: 'suscripcion', planes: {} } })[0], /sin planes/);
  assert.equal(pendientesPago(sus).length, 0);
  assert.equal(enlacePago(sus, 'https://unico'), 'https://pago/m');
  assert.equal(enlacePago({}, 'https://unico'), 'https://unico');
});

test('meteórico en suscripción: facturación por plan', () => {
  const m = { ...sus, compraTag: 'compra', precio: 0 };
  const r = metricasMeteorico([{ id: 1, tags: ['compra', 'plan-anual'] }, { id: 2, tags: ['compra', 'plan-mensual'] }], m);
  assert.equal(r.facturacion, 269);
  assert.equal(r.planes.filas.find((f) => f.id === 'anual').n, 1);
});

test('lanzamiento en suscripción: facturación del programa y planes', () => {
  const launch = { ...sus, iva: { programa: 'mas' }, precioVip: 0 };
  const lead = (s) => ({ s, estado: { id: '' }, outcome: '' });
  const m = computeMetrics([lead({ compra: true, plan: 'anual' }), lead({ compra: true, plan: 'mensual' }), lead({})], launch);
  assert.equal(m.eco.facturacionPrograma, 269);
  assert.equal(m.planes.total, 2);
});

test('la configuración guarda el tipo de pago de lanzamientos, VSL y meteóricos', () => {
  const c = sanitizeConfig({
    embudos: [{ id: 'lanz', tipo: 'lanzamientos', nombre: 'L' }, { id: 'met', tipo: 'meteorico', nombre: 'M' }],
    launches: { oct: { name: 'Oct', pago: { tipo: 'suscripcion', planes: { anual: { activo: true, precio: 240 } } } } },
    vsls: { vsl: { name: 'V', pago: { fraccionado: false } } },
    meteoricos: { bf: { name: 'BF', embudo: 'met', pago: { tipo: 'suscripcion', planes: { mensual: { activo: true, precio: 9.9 } } } } },
  });
  assert.equal(c.launches.oct.pago.tipo, 'suscripcion');
  assert.equal(c.launches.oct.pago.planes.anual.precio, 240);
  assert.equal(c.vsls.vsl.pago.fraccionado, false);
  assert.equal(c.meteoricos.bf.pago.planes.mensual.precio, 9.9);
});
