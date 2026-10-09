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
  const launch = { ...cfg, iva: { vip: 'mas', programa: 'mas' }, precioPrograma: 997, precioFraccionado: 1164 };
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

test('origen del lead: publicidad, orgánico o sin etiqueta; y canal por utm_source', async () => {
  const { computeMetrics, bySource } = await import('../public/js/metrics.js');
  const cfg = { compraTag: 'clienta', publiTag: 'lead-publi', organicoTag: 'lead-organico' };
  const lead = (tags, source = '') => ({ s: signalsFor(tags, 'nov26', cfg), estado: { id: 'frio' }, src: { source } });
  const leads = [lead(['lead-publi', 'clienta'], 'facebook'), lead(['lead-publi'], 'Facebook'), lead(['lead-organico'], 'instagram'), lead([])];
  const m = computeMetrics(leads, { ...cfg, iva: { vip: 'mas', programa: 'mas' }, precioPrograma: 100 });
  assert.deepEqual([m.origen.publi.leads, m.origen.organico.leads, m.origen.sinEtiqueta.leads, m.origen.total.leads], [2, 1, 1, 4]);
  assert.equal(m.origen.publi.compras, 1);
  assert.equal(m.origen.publi.importe, 100);
  const canales = bySource(leads, 'source');
  assert.deepEqual(canales.map((g) => [g.label, g.leads]), [['facebook', 2], ['instagram', 1], ['Sin canal (sin utm_source)', 1]]);
});

test('CAC y ROAS de publicidad, objetivos, respuestas de la encuesta y avisos', async () => {
  const { computeMetrics, porRespuesta, avisosLanzamiento } = await import('../public/js/metrics.js');
  const cfg = { compraTag: 'clienta', vipTag: 'vip', publiTag: 'publi', organicoTag: 'org', unicoTag: 'tc', fraccionadoTag: 'hm' };
  const lead = (tags, cf = {}) => ({ s: signalsFor(tags, 'nov26', cfg), estado: { id: 'frio' }, cf });
  const leads = [
    lead(['publi', 'vip', 'clienta', 'tc'], { q: 'Más de 2 años', m: ['A', 'B'] }),
    lead(['publi'], { q: 'Más de 2 años' }), lead(['org', 'clienta'], { q: 'Menos de 6 meses', m: ['A'] }), lead([]),
  ];
  const launch = { ...cfg, iva: { vip: 'mas', programa: 'mas' }, precioVip: 27, precioPrograma: 1000, inversion: 500, objetivos: { ventas: 4, registros: 0 } };
  const m = computeMetrics(leads, launch);
  assert.equal(m.eco.publi.cac, 500);
  assert.equal(m.eco.publi.facturacion, 1027);
  assert.equal(m.eco.publi.cpl, 250);
  assert.deepEqual(m.objetivos.map((o) => [o.label, o.actual, o.meta]), [['Ventas de Raíces', 2, 4]]);
  assert.deepEqual(porRespuesta(leads, 'q').map((r) => [r.respuesta, r.leads, r.compras]), [['Más de 2 años', 2, 1], ['Menos de 6 meses', 1, 1], ['', 1, 0]]);
  assert.deepEqual(porRespuesta(leads, 'm').map((r) => [r.respuesta, r.leads]), [['A', 2], ['B', 1], ['', 2]]);
  const avisos = avisosLanzamiento(leads, launch, m);
  assert.ok(avisos.some((a) => a.startsWith('1 ventas de Raíces sin etiqueta de pago')));
  assert.ok(avisos.some((a) => a.startsWith('1 leads sin etiqueta')));
  assert.ok(avisos.some((a) => a.startsWith('Falta en Configuración')));
});

test('encuesta: la edad va por tramos y el texto libre se agrupa sin mayúsculas', async () => {
  const { porRespuesta } = await import('../public/js/metrics.js');
  const lead = (cf, compra = false) => ({ s: { compra, vip: false }, cf });
  const leads = [lead({ e: 29 }), lead({ e: '36' }, true), lead({ e: 41 }), lead({ e: 'treinta' }), lead({ t: 'El estrés' }), lead({ t: 'el estrés.' }, true), lead({ t: 'Mis hormonas' })];
  assert.deepEqual(porRespuesta(leads, { id: 'e', tipo: 'edad' }).map((r) => [r.respuesta, r.leads, r.compras]),
    [['Menos de 30 años', 1, 0], ['35 a 37 años', 1, 1], ['Más de 40 años', 1, 0], ['', 4, 1]]);
  assert.deepEqual(porRespuesta(leads, { id: 't', tipo: 'texto' }).filter((r) => r.respuesta).map((r) => [r.respuesta, r.leads, r.compras]),
    [['El estrés', 2, 1], ['Mis hormonas', 1, 0]]);
});

test('perfiles de compradoras: avatares con las combinaciones que más compran', async () => {
  const { perfilesCompradoras, describirAvatar } = await import('../public/js/metrics.js');
  const P = [{ id: 'e', tipo: 'edad', name: 'Edad' }, { id: 't', tipo: 'opciones', name: '¿Cuánto tiempo llevas buscando embarazo?' }];
  const leads = [];
  for (let i = 0; i < 200; i++) {
    const e = [28, 36, 42][i % 3];
    const t = ['Más de 1 año', '0 - 6 meses'][(i >> 1) % 2];
    const compra = e === 36 && t === 'Más de 1 año' ? i % 2 === 0 || i % 5 === 0 : i % 25 === 0;
    leads.push({ s: { compra, vip: false }, cf: { e, t: [t] } });
  }
  const r = perfilesCompradoras(leads, P);
  assert.ok(r.avatares.length >= 1);
  const top = r.avatares[0];
  assert.deepEqual(top.traits.map(([, v]) => v).sort(), ['35 a 37 años', 'Más de 1 año']);
  assert.ok(top.indice > 2);
  assert.equal(describirAvatar(top.traits, P), 'Tiene 35 a 37 años y lleva más de 1 año buscando embarazo.');
  assert.equal(r.preguntas[0].rows.map((x) => x.respuesta).join(','), 'Menos de 30 años,35 a 37 años,Más de 40 años');
});

test('anuncios ganadores: ranking por ventas con campaña, conjunto, coste por venta y ROAS', async () => {
  const { rankingGanadores } = await import('../public/js/metrics.js');
  const L = (content, term, campaign, s) => ({ src: { content, term, campaign }, s });
  const leads = [
    L('a1', 's1', 'c1', { compra: true }), L('a1', 's1', 'c1', { vip: true }), L('a1', 's1', 'c1', {}),
    L('a2', 's2', 'c1', { compra: true, fraccionado: true }), L('a2', 's2', 'c1', { compra: true }),
    L('a3', 's2', 'c2', {}), L('', '', '', { compra: true }),
  ];
  const launch = { iva: { vip: 'mas', programa: 'mas' }, precioPrograma: 1000, precioFraccionado: 1200, precioVip: 10 };
  const r = rankingGanadores(leads, launch, 'ad', { a2: 'Reel matrona', c1: 'Webinar frío', s2: 'Lookalike' }, { a2: 300 });
  assert.deepEqual(r.map((x) => x.id), ['a2', 'a1', 'a3']);
  assert.equal(r[0].label, 'Reel matrona');
  assert.equal(r[0].campaign, 'Webinar frío');
  assert.equal(r[0].adset, 'Lookalike');
  assert.equal(r[0].ingresos, 2200);
  assert.equal(r[0].cac, 150);
  assert.ok(Math.abs(r[0].roas - 2200 / 300) < 1e-9);
  assert.equal(r[1].ingresos, 1010);
  assert.deepEqual(rankingGanadores(leads, launch, 'campaign').map((x) => [x.id, x.compras]), [['c1', 3], ['c2', 0]]);
});

test('avisos a la admin: tareas vencidas del resto del equipo', async () => {
  const { vencidasEquipo } = await import('../public/js/tareas.js');
  const users = [{ id: 'u1', nombre: 'Quique', rol: 'admin' }, { id: 'u2', nombre: 'Ana', rol: 'tecnico' }];
  const t = (id, fecha, asignado, hecha = false) => ({ id, titulo: id, fecha, asignado, hecha });
  const r = vencidasEquipo([
    t('a', '2026-10-01', { tipo: 'persona', id: 'u2' }),
    t('b', '2026-10-04', { tipo: 'rol', rol: 'setter' }),
    t('c', '2026-10-01', { tipo: 'persona', id: 'u1' }), // admin: no
    t('d', '2026-10-01', { tipo: 'rol', rol: 'admin' }), // admin: no
    t('e', '2026-10-01', { tipo: 'rol', rol: 'setter' }, true), // completada
    t('f', '2026-10-06', { tipo: 'rol', rol: 'setter' }), // vence hoy: aún no
    t('g', '2026-10-01', null), // sin asignar
  ], users, '2026-10-06');
  assert.deepEqual(r.map((x) => [x.tarea.id, x.quien, x.dias]), [['a', 'Ana', 5], ['b', 'Rol Setter', 2]]);
});

test('subcategorías de Preparación: la elegida manda; si no, se deduce del título', async () => {
  const { subDe } = await import('../public/js/tareas.js');
  assert.equal(subDe({ titulo: 'Revisar precios y enlaces de pago' }), 'oferta');
  assert.equal(subDe({ titulo: 'Crear la reunión de Zoom y pegar su ID' }), 'herramientas');
  assert.equal(subDe({ titulo: 'Programar los emails del lanzamiento' }), 'comunicacion');
  assert.equal(subDe({ titulo: 'Reunión de coordinación con equipo' }), 'equipo');
  assert.equal(subDe({ titulo: 'Algo raro' }), 'otras');
  assert.equal(subDe({ titulo: 'Programar los emails', sub: 'equipo' }), 'equipo');
  assert.equal(subDe({ titulo: 'Programar los emails', sub: 'inventada' }), 'comunicacion');
});

test('IVA y bump offers de la VIP: facturación y ROAS sin IVA; % de VIP que compra cada bump', async () => {
  const { computeMetrics, avisosLanzamiento } = await import('../public/js/metrics.js');
  const { sanitizeBumps, precioBump } = await import('../public/js/pago.js');
  const cfg = {
    vipTag: 'vip', compraTag: 'clienta', precioVip: 121, precioPrograma: 1000, inversion: 100,
    iva: { pct: 21, vip: 'incluido', programa: 'mas' },
    vipBumps: sanitizeBumps([
      { id: 'b1', nombre: 'Guía', precio: '9', iva: 'mas', tag: 'bump-guia' },
      { id: 'b2', nombre: 'Apagado', precio: '20', iva: 'mas', tag: 'bump-off', activo: false },
    ]),
  };
  const lead = (tags) => ({ s: signalsFor(tags, 'nov26', cfg), estado: { id: 'frio' } });
  const leads = [lead(['vip', 'bump-guia']), lead(['vip']), lead(['vip', 'bump-guia', 'bump-off']), lead(['vip']), lead(['bump-guia']), lead(['clienta'])];
  const m = computeMetrics(leads, cfg);
  assert.equal(m.vip, 4);
  assert.equal(m.bumps.length, 1); // el desactivado no cuenta
  assert.equal(m.bumps[0].n, 2); // el que no es VIP tampoco
  assert.equal(m.bumps[0].pct, 0.5);
  assert.equal(precioBump({ precio: 9, iva: 'mas' }, cfg), 9);
  assert.ok(Math.abs(precioBump({ precio: 10.89, iva: 'incluido' }, cfg) - 9) < 1e-9);
  // VIP 121 € con IVA = 100 sin IVA; bump 9 + IVA = 9; programa 1000 + IVA = 1000.
  assert.ok(Math.abs(m.eco.facturacionVip - 400) < 1e-9);
  assert.equal(m.eco.facturacionBumps, 18);
  assert.ok(Math.abs(m.eco.facturacion - (400 + 18 + 1000)) < 1e-9);
  assert.ok(Math.abs(m.eco.roas - 14.18) < 1e-9);
  // Sin elegir el IVA, se avisa.
  const sinElegir = { ...cfg, iva: { pct: 21, vip: '', programa: 'mas' } };
  assert.ok(avisosLanzamiento(leads, sinElegir, computeMetrics(leads, sinElegir)).some((a) => a.includes('IVA') && a.includes('entrada VIP')));
});

test('bump offers del pago único y del fraccionado: % sobre las ventas de cada tipo', async () => {
  const { computeMetrics } = await import('../public/js/metrics.js');
  const { sanitizeBumps } = await import('../public/js/pago.js');
  const cfg = {
    compraTag: 'clienta', fraccionadoTag: 'hotmart', unicoTag: 'thrive', precioPrograma: 1000, precioFraccionado: 1200,
    iva: { pct: 21, programa: 'mas' },
    unicoBumps: sanitizeBumps([{ id: 'u1', nombre: 'Sesión', precio: 50, iva: 'mas', tag: 'bump-u' }]),
    fraccionadoBumps: sanitizeBumps([{ id: 'f1', nombre: 'Plantillas', precio: '30,25', iva: 'incluido', tag: 'bump-f' }]),
  };
  const lead = (tags) => ({ s: signalsFor(tags, 'nov26', cfg), estado: { id: 'frio' } });
  const leads = [lead(['clienta', 'thrive', 'bump-u']), lead(['clienta', 'thrive']), lead(['clienta', 'hotmart', 'bump-f', 'bump-u']), lead(['bump-u'])];
  const m = computeMetrics(leads, cfg);
  const u = m.bumps.find((b) => b.id === 'u1');
  const f = m.bumps.find((b) => b.id === 'f1');
  assert.deepEqual([u.n, u.base, u.pct], [1, 2, 0.5]); // el fraccionado con la etiqueta del único no cuenta
  assert.deepEqual([f.n, f.base, f.pct], [1, 1, 1]);
  assert.ok(Math.abs(m.eco.facturacionBumps - (50 + 25)) < 1e-9); // 30,25 con IVA = 25 sin IVA
  assert.ok(Math.abs(m.eco.facturacion - (2000 + 1200 + 75)) < 1e-9);
});
