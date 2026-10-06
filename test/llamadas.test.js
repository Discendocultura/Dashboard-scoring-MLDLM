import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etapasPipeline, etapaDestino, calendarioDeUrl, metricasLlamadas } from '../public/js/llamadas.js';

const pipeline = { stages: ['Registrado', 'Contactado', 'Agenda llamada', '❌ No contesta 1', '❌ No contesta 2', '❌ No contesta 3', 'Seguimiento', 'Venta', 'Perdido'].map((name, i) => ({ id: `s${i}`, name, position: i })) };

test('llamadas: etapas del pipeline por nombre y etapa según el resultado', () => {
  const e = etapasPipeline(pipeline);
  assert.deepEqual([e.registrado, e.agenda, e.seguimiento, e.venta, e.perdido], ['s0', 's2', 's6', 's7', 's8']);
  assert.deepEqual(e.nocontesta, ['s3', 's4', 's5']);
  assert.equal(etapaDestino('venta', e, 's2'), 's7');
  assert.equal(etapaDestino('noshow', e, 's2'), 's3');
  assert.equal(etapaDestino('noshow', e, 's3'), 's4');
  assert.equal(etapaDestino('noshow', e, 's5'), 's5');
  assert.equal(etapaDestino('reagendar', e, 's4'), 's2');
  assert.equal(etapaDestino('inventado', e, 's2'), null);
  assert.equal(calendarioDeUrl('https://api.leadconnectorhq.com/widget/booking/khFQ93627bQMAeGt6Iuu'), 'khFQ93627bQMAeGt6Iuu');
});

test('llamadas: asistencia, cierre y motivos de no compra', () => {
  const now = 1_000_000;
  const L = (start, resultado, motivo) => ({ start, resultado: resultado ? { resultado, motivo } : null });
  const m = metricasLlamadas([
    L(1, 'venta'), L(2, 'venta'), L(3, 'perdido', 'Precio'), L(4, 'perdido', 'Precio'), L(5, 'perdido', 'Pareja'),
    L(6, 'seguimiento'), L(7, 'noshow'), L(8, 'noshow'), L(9, null), L(now + 5, null), { start: 10, cancelada: true },
  ], now);
  assert.equal(m.reservadas, 11);
  assert.equal(m.canceladas, 1);
  assert.equal(m.pctCancel, 1 / 11);
  assert.equal(m.shows, 6);
  assert.equal(m.noshow, 2);
  assert.equal(m.pctShow, 6 / 8);
  assert.equal(m.pctNoshow, 2 / 8);
  assert.equal(m.conversion, 2 / 6);
  assert.equal(m.agendadas, 10);
  assert.equal(m.proximas, 1);
  assert.equal(m.realizadas, 6);
  assert.equal(m.sinResultado, 1);
  assert.equal(m.asistencia, 6 / 8);
  assert.equal(m.cierre, 2 / 6);
  assert.deepEqual(m.motivos, [['Precio', 2], ['Pareja', 1]]);
});
