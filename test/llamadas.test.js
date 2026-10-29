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

test('llamadas: pendiente de pago y fase de cada persona según su última llamada', async () => {
  const { fasesPorContacto } = await import('../public/js/llamadas.js');
  const e = etapasPipeline(pipeline);
  assert.equal(etapaDestino('pendiente_pago', e, 's2'), 's6'); // sin etapa propia → Seguimiento
  const conEtapa = etapasPipeline({ stages: [...pipeline.stages, { id: 'pp', name: 'Pendiente de pago', position: 9 }] });
  assert.equal(etapaDestino('pendiente_pago', conEtapa, 's2'), 'pp');
  const now = 1000;
  const f = fasesPorContacto([
    { contactId: 'a', start: 100, resultado: { resultado: 'noshow' } }, { contactId: 'a', start: 2000 }, // reservó otra → próxima
    { contactId: 'b', start: 100, resultado: { resultado: 'pendiente_pago' } },
    { contactId: 'c', start: 500 },
    { contactId: 'd', start: 500, cancelada: true },
    { contactId: 'e', start: 100 }, { contactId: 'e', start: 300, resultado: { resultado: 'venta' } },
  ], now);
  assert.deepEqual([...f].map(([k, v]) => [k, v.fase]), [['a', 'proxima'], ['b', 'pendiente_pago'], ['c', 'pendiente'], ['d', 'cancelada'], ['e', 'venta']]);
  const { buildMessage } = await import('../public/js/scoring.js');
  assert.equal(buildMessage('Hola {nombre}, el {dia_llamada} a las {hora_llamada} {otra}', { nombre: 'Ana', extra: { dia_llamada: 'lunes', hora_llamada: '10:00' } }), 'Hola Ana, el lunes a las 10:00 {otra}');
});

test('llamadas: la misma lead con varias citas vivas (y cuál reservó la última)', async () => {
  const { citasRepetidas } = await import('../public/js/llamadas.js');
  const c = (id, contactId, startTime, creada, extra = {}) => ({ id, contactId, startTime, creada, status: 'confirmed', ...extra });
  const rep = citasRepetidas([
    c('a', 'elena', '2026-10-31T12:20:00+01:00', '2026-10-29T20:28:05Z'),
    c('b', 'elena', '2026-10-31T11:00:00+01:00', '2026-10-29T20:29:19Z'),
    c('c', 'elena', '2026-10-31T09:00:00+01:00', '2026-10-29T20:29:52Z'),
    c('d', 'ana', '2026-10-31T10:00:00+01:00', '2026-10-29T10:00:00Z'),
    c('e', 'ana', '2026-10-30T10:00:00+01:00', '2026-10-28T10:00:00Z', { status: 'cancelled' }),
    c('f', 'eva', '2026-10-30T10:00:00+01:00', '2026-10-28T10:00:00Z', { resultado: { resultado: 'show' } }),
    c('g', 'eva', '2026-10-31T10:00:00+01:00', '2026-10-29T10:00:00Z'),
  ]);
  assert.deepEqual([...rep.keys()], ['elena']);
  assert.deepEqual(rep.get('elena').citas.map((x) => x.id), ['c', 'b', 'a']);
  assert.equal(rep.get('elena').ultima, 'c');
});
