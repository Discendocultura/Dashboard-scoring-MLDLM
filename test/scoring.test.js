import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  signalsFor, score, estadoFor, nextStepFor, buildMessage, waPhone, isValidSignalTag, launchCodesFromTags,
} from '../public/js/scoring.js';

const s = (tags) => signalsFor(tags, 'nov26', { vipTag: 'compra-vip', compraTag: 'clienta-raices' });

test('lead sin actividad es frío y va a la grabación', () => {
  const sig = s(['registro']);
  assert.equal(score(sig), 0);
  assert.equal(estadoFor(0).id, 'frio');
  assert.equal(nextStepFor(sig), 'grabacion');
});

test('VIP + directo hasta el final es muy caliente y va a cierre', () => {
  const sig = s(['compra-vip', 'nov26_directo_click', 'nov26_directo_asistio', 'nov26_directo_60', 'nov26_directo_final']);
  assert.equal(score(sig), 70);
  assert.equal(estadoFor(score(sig)).id, 'muy-caliente');
  assert.equal(nextStepFor(sig), 'cierre');
});

test('grabación al 50% → raíces; al 90% → cierre y caliente', () => {
  assert.equal(nextStepFor(s(['nov26_replay_50'])), 'raices');
  const full = s(['nov26_replay_50', 'nov26_replay_90']);
  assert.equal(nextStepFor(full), 'cierre');
  assert.equal(estadoFor(score(full)).id, 'caliente');
});

test('directo y grabación no se suman, cuenta el mejor', () => {
  const sig = s(['nov26_directo_asistio', 'nov26_replay_90', 'nov26_replay_50']);
  assert.equal(score(sig), 40);
});

test('las etiquetas de otro lanzamiento no cuentan', () => {
  assert.equal(score(s(['oct26_clase1_90', 'oct26_replay_90'])), 0);
});

test('mensaje con nombre y enlaces personalizados', () => {
  const msg = buildMessage('Hola {nombre}, mira {link_grabacion} {link_x}', {
    nombre: 'Ana', contactId: 'abc123', launch: { replayUrl: 'https://x.com/replay?a=1' },
  });
  assert.equal(msg, 'Hola Ana, mira https://x.com/replay?a=1&cid=abc123 {link_x}');
});

test('teléfonos para wa.me', () => {
  assert.equal(waPhone('+34 600 11 22 33'), '34600112233');
  assert.equal(waPhone('600112233'), '34600112233');
  assert.equal(waPhone('0052 55 1234 5678'), '525512345678');
  assert.equal(waPhone(''), '');
});

test('validación de etiquetas de señales', () => {
  assert.ok(isValidSignalTag('nov26_clase1_50'));
  assert.ok(isValidSignalTag('webinar-oct_wa_enviado'));
  assert.ok(!isValidSignalTag('cliente-vip'));
  assert.ok(!isValidSignalTag('nov26_borrar_todo'));
  assert.ok(!isValidSignalTag('NOV 26_clase1_50'));
  assert.deepEqual(launchCodesFromTags(['nov26_clase1_50', 'otra', 'oct26_wa_enviado']), ['nov26', 'oct26']);
});

test('porcentajes intermedios 25/75', () => {
  const sig = s(['nov26_clase1_25', 'nov26_clase1_50', 'nov26_clase1_75', 'nov26_clase2_25', 'nov26_replay_25']);
  assert.equal(score(sig), 12 + 4 + 10);
  assert.equal(nextStepFor(s(['nov26_replay_25', 'nov26_replay_50', 'nov26_replay_75'])), 'raices');
  assert.ok(isValidSignalTag('nov26_replay_75'));
});

test('VIP y compras anteriores al lanzamiento no cuentan', () => {
  const antigua = s(['compra-vip', 'nov26_vip_previo', 'clienta-raices', 'nov26_compra_previo']);
  assert.equal(antigua.vip, false);
  assert.equal(antigua.vip_anterior, true);
  assert.equal(antigua.compra, false);
  assert.equal(antigua.clienta_anterior, true);
  assert.equal(score(antigua), 0);
  // la foto de otro lanzamiento no afecta a este
  assert.equal(s(['compra-vip', 'oct26_vip_previo']).vip, true);
  const nueva = s(['compra-vip', 'clienta-raices']);
  assert.ok(nueva.vip && nueva.compra);
  assert.equal(nextStepFor(nueva), 'comprado');
  assert.ok(isValidSignalTag('nov26_compra_previo'));
});

test('fecha de compra: compra del lanzamiento, en directo y clientas anteriores', () => {
  const cfg = { compraTag: 'clienta-raices', compraDateField: 'F', inicioCaptacion: '2026-10-01', fechaDirecto: '2026-10-15', finVentas: '2026-12-01' };
  const sig = (cf, tags = ['clienta-raices'], extra = {}) => signalsFor(tags, 'nov26', cfg, { cf: { F: cf }, ...extra });
  assert.ok(sig('2026-10-15T00:00:00.000Z').compra_directo);            // medianoche UTC
  assert.ok(sig('2026-10-14T22:00:00.000Z').compra_directo);            // medianoche en España
  assert.ok(sig(Date.UTC(2026, 9, 15)).compra_directo);                 // milisegundos
  const despues = sig('2026-10-17T00:00:00.000Z');
  assert.ok(despues.compra && !despues.compra_directo);
  const antigua = sig('2026-03-02T00:00:00.000Z');
  assert.ok(!antigua.compra && antigua.clienta_anterior);
  assert.ok(!sig('2026-12-05T00:00:00.000Z').compra);                   // compró en el siguiente lanzamiento
  // con la foto marcada pero con fecha dentro del lanzamiento, manda la fecha
  assert.ok(sig('2026-10-20T00:00:00.000Z', ['clienta-raices', 'nov26_compra_previo']).compra);
  // sin etiqueta de compra no hay compra aunque haya fecha
  assert.ok(!sig('2026-10-20T00:00:00.000Z', []).compra);
});

test('tráfico frío / templado según la fecha de alta en GHL', () => {
  const cfg = { inicioCaptacion: '2026-10-01' };
  const t = (dateAdded) => signalsFor([], 'nov26', cfg, { dateAdded }).trafico;
  assert.equal(t('2026-09-30T21:59:00.000Z'), 'templado');  // 23:59 del 30/09 en España
  assert.equal(t('2026-09-30T22:01:00.000Z'), 'frio');      // 00:01 del 01/10 en España
  assert.equal(t('2025-01-01T10:00:00.000Z'), 'templado');
  assert.equal(signalsFor([], 'nov26', {}, { dateAdded: '2025-01-01T10:00:00Z' }).trafico, '');
});

test('variables de enlace: página de venta y enlace de pago', () => {
  const launch = { raicesUrl: 'https://x.com/raices', ventaUrl: 'https://pay.x.com/checkout', ventaFraccionadoUrl: 'https://pay.hotmart.com/X1' };
  assert.equal(buildMessage('{link_pago_fraccionado}', { contactId: 'c1', launch }), 'https://pay.hotmart.com/X1?cid=c1');
  const msg = buildMessage('{link_pagina_venta} | {link_pago} | {link_raices}', { nombre: 'A', contactId: 'c1', launch });
  assert.equal(msg, 'https://x.com/raices?cid=c1 | https://pay.x.com/checkout?cid=c1 | https://x.com/raices?cid=c1');
});

test('llamada agendada: etiqueta fija sin las de antes, o marcada por la setter', () => {
  const cfg = { llamadaTag: 'llamada-agendada' };
  assert.equal(signalsFor(['llamada-agendada'], 'nov26', cfg).llamada, true);
  assert.equal(signalsFor(['llamada-agendada', 'nov26_llamada_previo'], 'nov26', cfg).llamada, false);
  assert.equal(signalsFor(['nov26_res_llamada'], 'nov26', {}).llamada, true);
  assert.equal(signalsFor(['registro'], 'nov26', cfg).llamada, false);
  assert.ok(isValidSignalTag('nov26_llamada_previo'));
});

test('ventas por día del carrito según la fecha de compra', async () => {
  const { ventasPorDia } = await import('../public/js/metrics.js');
  const lead = (compra, fecha) => ({ s: { compra, fecha_compra: compra ? fecha : '' } });
  const launch = { fechaDirecto: '2026-10-29', compraDateField: 'f1', cierreCarrito: '2026-11-01T23:59' };
  const v = ventasPorDia([lead(true, '2026-10-29'), lead(true, '2026-10-29'), lead(true, '2026-11-01'), lead(true, '2026-10-20'), lead(true, ''), lead(false)], launch);
  assert.deepEqual(v.days.map((d) => [d.day, d.n]), [['2026-10-29', 2], ['2026-10-30', 0], ['2026-10-31', 0], ['2026-11-01', 1]]);
  assert.equal(v.antes, 1);
  assert.equal(v.sinFecha, 1);
  assert.equal(v.total, 5);
  assert.equal(ventasPorDia([], { fechaDirecto: '2026-10-29' }), null);
});

test('facturación de Raíces con precio de pago único y fraccionado', async () => {
  const { computeMetrics, ventasPorDia } = await import('../public/js/metrics.js');
  const cfg = { compraTag: 'clienta', fraccionadoTag: 'hotmart', unicoTag: 'thrivecart' };
  const lead = (tags) => ({ s: signalsFor(tags, 'nov26', cfg), estado: { id: 'frio' } });
  const leads = [lead(['clienta']), lead(['clienta', 'hotmart']), lead(['hotmart']), lead([]), lead(['clienta', 'thrivecart'])];
  const launch = { ...cfg, precioPrograma: 997, precioFraccionado: 1164 };
  const m = computeMetrics(leads, launch);
  assert.equal(m.compra, 3);
  assert.equal(m.compraFraccionado, 1);
  assert.equal(m.compraUnico, 1);
  assert.deepEqual([m.pago.unico.n, m.pago.fraccionado.n, m.pago.sinEtiqueta.n], [1, 1, 1]);
  assert.equal(m.pago.unico.n + m.pago.fraccionado.n + m.pago.sinEtiqueta.n, m.pago.total.n);
  assert.equal(m.eco.facturacionPrograma, 997 * 2 + 1164);
  assert.equal(m.pago.fraccionado.importe, 1164);
  assert.equal(computeMetrics(leads, { ...launch, precioFraccionado: 0 }).eco.facturacionPrograma, 997 * 3);
  assert.equal(ventasPorDia(leads, { ...launch, fechaDirecto: '2026-10-29', compraDateField: 'f' }).importe, 997 * 2 + 1164);
});
