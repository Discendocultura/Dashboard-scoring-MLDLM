import test from 'node:test';
import assert from 'node:assert/strict';
import { adivinarMapa, normalizar, aplicarFoto, metricasMembresia, tagDePlan, etiquetasPendientes, fechaDe, importeDe, waDe, rellenar, precioMes } from '../public/js/membresia.js';
import { enlaceLector, esDatosSkool, ORIGEN_SKOOL } from '../public/js/skool-lector.js';
import { htmlDeTexto } from '../handlers/membresia.js';

const DIA = 86_400_000;
// Filas como las deja el lector (claves «planas» del JSON de Skool).
const filas = [
  { 'user.id': 'u1', 'user.firstName': 'Ana', 'user.lastName': 'Ruiz', 'user.metadata.email': 'ana@ejemplo.com', 'member.tier': 'VIP', 'member.price': '9900', 'member.billingInterval': 'month', 'member.approvedAt': '2026-05-01T10:00:00Z', 'user.metadata.points': '320', 'user.metadata.level': '5', 'user.lastActiveAt': '2026-11-09T10:00:00Z', 'member.ltv': '59400' },
  { 'user.id': 'u2', 'user.firstName': 'Bea', 'user.lastName': 'Gil', 'user.metadata.email': 'bea@ejemplo.com', 'member.tier': 'Estándar', 'member.price': '2900', 'member.billingInterval': 'month', 'member.approvedAt': '2026-10-20T10:00:00Z', 'user.metadata.points': '12', 'user.metadata.level': '2', 'user.lastActiveAt': '2026-10-01T10:00:00Z', 'member.ltv': '2900' },
];

test('membresía: adivina qué clave es cada dato y normaliza (céntimos, fechas, plan)', () => {
  const mapa = adivinarMapa(filas);
  assert.equal(mapa.email, 'user.metadata.email');
  assert.equal(mapa.plan, 'member.tier');
  assert.equal(mapa.precio, 'member.price');
  assert.equal(mapa.alta, 'member.approvedAt');
  assert.equal(mapa.puntos, 'user.metadata.points');
  assert.equal(mapa.ultima, 'user.lastActiveAt');
  assert.equal(mapa.centimos, true);
  const a = normalizar(filas[0], mapa);
  assert.equal(a.email, 'ana@ejemplo.com');
  assert.equal(a.nombre, 'Ana Ruiz');
  assert.equal(a.plan, 'VIP');
  assert.equal(a.precio, 99);
  assert.equal(a.ltv, 594);
  assert.equal(a.intervalo, 'mes');
  assert.equal(a.puntos, 320);
  assert.equal(a.alta, Date.parse('2026-05-01T10:00:00Z'));
  assert.equal(normalizar({ x: 'no-es-email' }, { email: 'x' }), null);
});

test('membresía: utilidades de fechas, importes, WhatsApp y mensajes', () => {
  assert.equal(fechaDe(1793948328), 1793948328000);
  assert.equal(fechaDe('2026-11-03 10:00:00'), Date.parse('2026-11-03T10:00:00'));
  assert.equal(fechaDe('hola'), null);
  assert.equal(importeDe('€14,90/mes'), 14.9);
  assert.equal(importeDe('1,490.00'), 1490);
  assert.equal(importeDe(2900, true), 29);
  assert.equal(waDe('612 345 678'), '34612345678');
  assert.equal(waDe('+52 55 1234 5678'), '525512345678');
  assert.equal(waDe('123'), '');
  assert.equal(rellenar('Hola {nombre}, tu plan {plan}', { nombre: 'Ana Ruiz', plan: 'VIP' }), 'Hola Ana, tu plan VIP');
  assert.equal(precioMes({ precio: 120, intervalo: 'año' }), 10);
  assert.equal(precioMes({ plan: 'VIP' }, { VIP: { importe: 99, intervalo: 'mes' } }), 99);
});

test('membresía: altas, bajas (solo con lectura completa), cambios de plan y vueltas', () => {
  const t0 = Date.parse('2026-10-01T10:00:00Z');
  const a = (email, plan, extra = {}) => ({ email, nombre: email.split('@')[0], plan, precio: plan === 'VIP' ? 99 : 29, intervalo: 'mes', alta: t0 - 60 * DIA, ...extra });
  const r1 = aplicarFoto({}, [a('ana@x.com', 'VIP'), a('bea@x.com', 'Estándar'), a('cris@x.com', 'Estándar')], { ahora: t0 });
  assert.equal(r1.primera, true);
  assert.equal(r1.altas.length, 3);
  assert.equal(r1.estado.eventos.length, 0); // la primera lectura es el punto de partida, no son altas del mes
  // Lectura a medias (completa: false): quien falta NO se da de baja.
  const parcial = aplicarFoto(r1.estado, [a('ana@x.com', 'VIP')], { ahora: t0 + DIA, completa: false });
  assert.equal(parcial.bajas.length, 0);
  // Lectura completa: Cris se ha ido, Bea sube a VIP, Dani es nueva.
  const r2 = aplicarFoto(r1.estado, [a('ana@x.com', 'VIP'), a('bea@x.com', 'VIP'), a('dani@x.com', 'Estándar')], { ahora: t0 + 10 * DIA });
  assert.deepEqual(r2.bajas, ['cris@x.com']);
  assert.deepEqual(r2.altas, ['dani@x.com']);
  assert.deepEqual(r2.cambios, [{ email: 'bea@x.com', de: 'Estándar', a: 'VIP' }]);
  assert.equal(r2.estado.alumnos['cris@x.com'].activo, false);
  assert.equal(r1.estado.alumnos['cris@x.com'].activo, true); // no modifica el estado anterior
  // Skool la marca como baja (estado) aunque salga en la lista; y luego vuelve.
  const r3 = aplicarFoto(r2.estado, [a('ana@x.com', 'VIP', { baja: true }), a('bea@x.com', 'VIP'), a('dani@x.com', 'Estándar')], { ahora: t0 + 12 * DIA });
  assert.deepEqual(r3.bajas, ['ana@x.com']);
  const r4 = aplicarFoto(r3.estado, [a('ana@x.com', 'VIP'), a('bea@x.com', 'VIP'), a('dani@x.com', 'Estándar'), a('cris@x.com', 'Estándar')], { ahora: t0 + 14 * DIA });
  assert.deepEqual(r4.vuelven.sort(), ['ana@x.com', 'cris@x.com']);
  assert.equal(r4.estado.alumnos['ana@x.com'].activo, true);
});

test('membresía: MRR, churn y LTV por plan, más activos y en riesgo', () => {
  const ahora = Date.parse('2026-11-10T10:00:00Z');
  const estado = {
    alumnos: {
      'a@x.com': { email: 'a@x.com', plan: 'VIP', precio: 99, intervalo: 'mes', alta: ahora - 200 * DIA, ltv: 600, puntos: 300, ultima: ahora - DIA, activo: true },
      'b@x.com': { email: 'b@x.com', plan: 'VIP', precio: 990, intervalo: 'año', alta: ahora - 100 * DIA, ltv: 990, puntos: 50, ultima: ahora - 20 * DIA, activo: true },
      'c@x.com': { email: 'c@x.com', plan: 'Estándar', precio: 29, intervalo: 'mes', alta: ahora - 40 * DIA, ltv: 58, puntos: 5, ultima: ahora - 3 * DIA, activo: true },
      'd@x.com': { email: 'd@x.com', plan: 'Estándar', precio: 29, intervalo: 'mes', alta: ahora - 90 * DIA, ltv: 87, activo: false, bajaEn: ahora - 5 * DIA },
    },
    eventos: [
      { t: ahora - 5 * DIA, tipo: 'baja', email: 'd@x.com', plan: 'Estándar', mes: 29 },
      { t: ahora - 2 * DIA, tipo: 'alta', email: 'c@x.com', plan: 'Estándar', mes: 29 },
      { t: ahora - 90 * DIA, tipo: 'baja', email: 'z@x.com', plan: 'VIP', mes: 99 }, // fuera de los 30 días
    ],
  };
  const m = metricasMembresia(estado, { ahora, ltvExtra: { 'c@x.com': 100 } });
  assert.equal(m.activos, 3);
  assert.equal(m.mrr, 99 + 82.5 + 29);
  assert.equal(m.bajas, 1);
  assert.equal(m.altas, 1);
  assert.equal(m.mrrPerdido, 29);
  const est = m.filas.find((f) => f.plan === 'Estándar');
  assert.equal(est.activos, 1);
  assert.equal(est.churn, 0.5); // 1 baja de 2 (1 activo + 1 que se fue)
  const vip = m.filas.find((f) => f.plan === 'VIP');
  assert.equal(vip.churn, 0);
  assert.equal(vip.ltvMedio, 795);
  assert.equal(m.masActivos[0].email, 'a@x.com');
  assert.deepEqual(m.enRiesgo.map((a) => a.email), ['b@x.com']);
  assert.equal(m.ltvTotal, 600 + 990 + 158 + 87);
  assert.deepEqual(m.bajasRecientes.map((a) => a.email), ['d@x.com']);
});

test('membresía: etiqueta de GHL por plan y lo que falta por poner o quitar', () => {
  const cfg = { prefijo: 'alumno', etiquetas: { VIP: 'membresia-vip' }, tagBaja: 'membresia-baja' };
  assert.equal(tagDePlan(cfg, 'VIP'), 'membresia-vip');
  assert.equal(tagDePlan(cfg, 'Estándar Plus'), 'alumno-estandar-plus');
  assert.equal(tagDePlan(cfg, 'Sin plan'), '');
  const estado = { alumnos: {
    'a@x.com': { email: 'a@x.com', plan: 'VIP', activo: true, tags: ['membresia-vip'] },
    'b@x.com': { email: 'b@x.com', plan: 'VIP', activo: true, tags: ['alumno-estandar'] },
    'c@x.com': { email: 'c@x.com', plan: 'Estándar', activo: false, tags: ['alumno-estandar'] },
  } };
  assert.deepEqual(etiquetasPendientes(estado, cfg), [
    { email: 'b@x.com', poner: ['membresia-vip'], quitar: ['alumno-estandar'] },
    { email: 'c@x.com', poner: ['membresia-baja'], quitar: ['alumno-estandar'] },
  ]);
});

test('membresía: el marcador de Skool y los datos que acepta AlquimIA', () => {
  const href = enlaceLector('https://alquimia.pages.dev', 'mldlm');
  assert.ok(href.startsWith('javascript:'));
  const codigo = decodeURIComponent(href.slice('javascript:'.length));
  assert.doesNotThrow(() => new Function(codigo)); // es JavaScript válido
  assert.ok(codigo.includes('"https://alquimia.pages.dev","mldlm"'));
  assert.ok(ORIGEN_SKOOL.test('https://www.skool.com'));
  assert.ok(!ORIGEN_SKOOL.test('https://skool.com.malo.es'));
  assert.ok(esDatosSkool({ tipo: 'alquimia-skool', filas: [{ a: 1 }] }));
  assert.ok(!esDatosSkool({ tipo: 'otro', filas: [] }));
  assert.ok(!esDatosSkool({ tipo: 'alquimia-skool', filas: [[1]] }));
  assert.equal(htmlDeTexto('Hola <b>Ana</b>\nmira https://x.es\n\nAdiós'), '<p>Hola &lt;b&gt;Ana&lt;/b&gt;<br>mira <a href="https://x.es">https://x.es</a></p><p>Adiós</p>');
});

test('membresía: cruce con GHL (resumen) y a quien no está en GHL no se le intenta etiquetar', async () => {
  const { resumenGhl } = await import('../public/js/membresia.js');
  const al = [
    { email: 'a@x.com', enGhl: true, telefono: '612345678' },
    { email: 'b@x.com', enGhl: false },
    { email: 'c@x.com' },
  ];
  assert.deepEqual(resumenGhl(al), { total: 3, enGhl: 1, noEsta: 1, sinCruzar: 1, conMovil: 1 });
  const estado = { alumnos: Object.fromEntries(al.map((a) => [a.email, { ...a, plan: 'VIP', activo: true }])) };
  assert.deepEqual(etiquetasPendientes(estado, {}).map((p) => p.email), ['a@x.com', 'c@x.com']);
});

test('membresía: solo en Discendo, tendencia del MRR y altas/bajas por semana', async () => {
  const { conMembresia } = await import('../public/js/membresia.js');
  assert.equal(conMembresia('discendo'), true);
  assert.equal(conMembresia('mldlm'), false);
  assert.equal(conMembresia(''), false);
  const ahora = Date.parse('2026-11-10T10:00:00Z');
  const estado = {
    alumnos: { 'a@x.com': { email: 'a@x.com', plan: 'VIP', precio: 100, intervalo: 'mes', activo: true }, 'b@x.com': { email: 'b@x.com', plan: 'VIP', precio: 100, intervalo: 'mes', activo: true } },
    eventos: [{ t: ahora - 3 * DIA, tipo: 'alta', email: 'b@x.com', plan: 'VIP', mes: 100 }, { t: ahora - 10 * DIA, tipo: 'baja', email: 'c@x.com', plan: 'VIP', mes: 50 }],
  };
  const m = metricasMembresia(estado, { ahora });
  assert.equal(m.mrr, 200);
  assert.equal(m.mrrAntes, 150); // 200 − 100 (alta) + 50 (baja)
  assert.equal(Math.round(m.crecimiento * 1000) / 1000, 0.333);
  assert.equal(m.semanas.length, 12);
  assert.deepEqual([m.semanas[11].altas, m.semanas[11].bajas, m.semanas[10].bajas], [1, 0, 1]);
});

test('membresía: el plan es el dato que viene en todos (no el primero que se llama «plan»), con respaldo y diagnóstico', async () => {
  const { candidatosPlan, repartoPlan, diagnosticoSkool, adivinarMapa: adivinar, normalizar: norm, aplicarFoto: foto } = await import('../public/js/membresia.js');
  // «member.planName» solo lo traen 3 de 10 (los que cambiaron de plan); «member.tierName» lo traen todos.
  const filas = Array.from({ length: 10 }, (_, i) => ({
    'user.email': `a${i}@x.com`, 'user.firstName': `A${i}`, 'user.country': i % 2 ? 'ES' : 'MX',
    'member.tierName': i < 3 ? 'VIP' : 'Estándar', ...(i < 3 ? { 'member.planName': 'VIP anual' } : {}), 'member.tierId': String(100 + (i < 3 ? 1 : 2)),
  }));
  const c = candidatosPlan(filas);
  assert.equal(c[0].clave, 'member.tierName');
  assert.ok(!c.some((x) => x.clave === 'user.country' && x.pista));
  assert.ok(!c.some((x) => x.clave === 'member.tierId'));
  const mapa = adivinar(filas);
  assert.equal(mapa.plan, 'member.tierName');
  assert.deepEqual(repartoPlan(filas, mapa), [{ valor: 'Estándar', n: 7 }, { valor: 'VIP', n: 3 }]);
  // Con el dato malo, 7 sin plan; con respaldo, ninguno.
  assert.equal(repartoPlan(filas, { ...mapa, plan: 'member.planName' }).find((x) => x.valor === 'Sin plan').n, 7);
  assert.equal(norm(filas[5], { email: 'user.email', plan: 'member.planName', planAlt: 'member.tierName' }).plan, 'Estándar');
  // Arreglar el plan («Sin plan» → «VIP») no cuenta como cambio de plan.
  const r1 = foto({}, [{ email: 'a@x.com', plan: 'Sin plan' }], { ahora: 1.8e12 });
  const r2 = foto(r1.estado, [{ email: 'a@x.com', plan: 'VIP' }], { ahora: 1.8e12 + 1000 });
  assert.equal(r2.cambios.length, 0);
  assert.equal(r2.estado.alumnos['a@x.com'].plan, 'VIP');
  // El diagnóstico no lleva emails ni nombres.
  const d = diagnosticoSkool(filas);
  assert.ok(d.includes('member.tierName'));
  assert.ok(!/a\d@x\.com/.test(d));
  assert.ok(!/A\d\b/.test(d.split('\n').find((l) => l.startsWith('user.firstName'))));
});
