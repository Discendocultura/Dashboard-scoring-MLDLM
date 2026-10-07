import { test } from 'node:test';
import assert from 'node:assert/strict';

test('asistencia por tipo de tráfico: global, frío y templado', async () => {
  const { asistenciaPorTrafico } = await import('../public/js/metrics.js');
  const s = (o) => ({ s: { clase1_50: true, ...o }, estado: { id: 'templado' } });
  const leads = [
    s({ trafico: 'frio', directo_asistio: true }), s({ trafico: 'frio' }), s({ trafico: 'frio' }), s({ trafico: 'frio' }),
    s({ trafico: 'templado', directo_asistio: true, compra: true }), s({ trafico: 'templado', directo_asistio: true }),
  ];
  const r = asistenciaPorTrafico(leads, { fechaDirecto: '2026-11-05' }, { origen: false });
  assert.deepEqual(r.grupos.map((g) => g.total), [6, 4, 2]);
  const asist = r.pasos.find((p) => p.label === 'Asistieron al directo');
  assert.deepEqual(asist.n, { global: 3, frio: 1, templado: 2 });
  assert.deepEqual(r.pasos.find((p) => p.label === 'Compraron').n, { global: 1, frio: 0, templado: 1 });
  // Con varios vídeos, un paso por vídeo
  const plf = asistenciaPorTrafico(leads, { formato: 'plf' });
  assert.ok(plf.pasos.some((p) => p.label === 'PLC 4 en directo'));
});

test('asistencia por tipo de tráfico: también publicidad y orgánico', async () => {
  const { asistenciaPorTrafico } = await import('../public/js/metrics.js');
  const s = (o) => ({ s: { ...o }, estado: { id: 'templado' } });
  const leads = [s({ origen: 'publi', directo_asistio: true }), s({ origen: 'publi' }), s({ origen: 'organico', directo_asistio: true })];
  const r = asistenciaPorTrafico(leads, { fechaDirecto: '2026-11-05' }, { trafico: false });
  assert.deepEqual(r.grupos.map((g) => g.id), ['global', 'publi', 'organico']);
  assert.deepEqual(r.pasos.find((p) => p.label === 'Asistieron al directo').n, { global: 2, publi: 1, organico: 1 });
});

test('resumen de la encuesta: % por opción y respuestas libres', async () => {
  const { resumenEncuesta } = await import('../public/js/metrics.js');
  const preguntas = [{ id: 'tiempo', name: '¿Cuánto tiempo?', tipo: 'opciones' }, { id: 'libre', name: '¿Qué te bloquea?', tipo: 'texto' }, { id: 'edad', name: 'Edad', tipo: 'edad' }];
  const L = (cf, compra = false) => ({ id: Math.random().toString(36), name: 'X', cf, s: { compra } });
  const leads = [
    L({ tiempo: ['0 - 6 meses'], libre: 'El estrés', edad: 33 }, true),
    L({ tiempo: ['0 - 6 meses'], libre: 'el estrés.', edad: 41 }),
    L({ tiempo: ['Más de 1 año'], libre: 'Mis hormonas', edad: 29 }),
    L({}),
  ];
  const r = resumenEncuesta(leads, preguntas);
  assert.equal(r.total, 4);
  assert.equal(r.respondieron, 3);
  const t = r.preguntas[0];
  assert.equal(t.respondieron, 3);
  assert.deepEqual(t.opciones.map((o) => [o.respuesta, o.n, Math.round(o.pct * 100), o.compras]), [['0 - 6 meses', 2, 67, 1], ['Más de 1 año', 1, 33, 0]]);
  const libre = r.preguntas[1];
  assert.equal(libre.libres.length, 3); // todas las respuestas tal cual
  assert.deepEqual(libre.opciones.map((o) => [o.respuesta, o.n]), [['El estrés', 2]]); // «El estrés» y «el estrés.» son la misma
  assert.deepEqual(r.preguntas[2].opciones.map((o) => o.respuesta), ['Menos de 30 años', '30 a 34 años', 'Más de 40 años']);
});

test('métricas de tráfico: CPM, CTR, CPC, visitas y conversión de la página de registro', async () => {
  const { resumenTrafico } = await import('../public/js/metrics.js');
  const m = { total: 200, frio: 150, vip: 20, compra: 10, eco: { inversion: 1000, roas: 3 }, origen: { publi: { leads: 160 }, organico: { leads: 40 } } };
  const t = resumenTrafico(m, { stats: { impresiones: 100000, clics: 2000, visitas: 1600, registrosMeta: 150 } });
  assert.equal(t.cpm, 10);
  assert.equal(t.ctr, 0.02);
  assert.equal(t.cpc, 0.5);
  assert.equal(t.cargan, 0.8);
  assert.equal(t.conversionPagina, 160 / 1600); // registros de publicidad / visitas
  assert.equal(t.cpl, 5);
  assert.equal(t.cplPubli, 1000 / 160);
  assert.equal(t.cac, 100);
  // Sin Meta: solo lo que sale de la inversión manual
  const sin = resumenTrafico({ ...m, origen: { publi: { leads: 0 }, organico: { leads: 0 } } }, null);
  assert.equal(sin.impresiones, null);
  assert.equal(sin.conversionPagina, null);
  assert.equal(sin.cpl, 5);
  assert.equal(sin.cplPubli, null);
});
