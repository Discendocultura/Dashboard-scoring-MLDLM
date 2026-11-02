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

test('avisos: compras VIP con otra etiqueta que la de Configuración', async () => {
  const { enrichLead, computeMetrics, avisosLanzamiento } = await import('../public/js/metrics.js');
  const launch = { registroTag: 'reg', vipTag: 'et-compra-entrada-vip', precioVip: 9 };
  const config = { launches: { x: launch } };
  const leads = [{ id: 'a', tags: ['reg', 'et-entrada-vip-29octubre26'] }, { id: 'b', tags: ['reg', 'et-compra-entrada-vip'] }].map((c) => enrichLead({ name: '', email: '', phone: '', ...c }, 'x', config));
  const m = computeMetrics(leads, launch);
  assert.equal(m.vip, 1);
  const av = avisosLanzamiento(leads, launch, m).join(' ');
  assert.match(av, /1 lead con «et-entrada-vip-29octubre26» pero sin la etiqueta VIP de Configuración \(«et-compra-entrada-vip»\)/);
});

test('qué predice la compra: conclusiones útiles, combinaciones y sin señales obvias', async () => {
  const { insightsCompra, fraseSenal } = await import('../public/js/metrics.js');
  const leads = [];
  const add = (n, s) => { for (let i = 0; i < n; i++) leads.push({ s: { ...s } }); };
  // Clase 1 + directo: compran mucho; solo una de las dos: algo; ninguna: casi nada. La encuesta no cambia nada.
  add(20, { clase: true, directo: true, compra: true, compra_directo: true, inicio_pago: { veces: 2 } });
  add(20, { clase: true, directo: true, encuesta: false });
  add(10, { clase: true, compra: true, inicio_pago: { veces: 1 }, venta_visita: { veces: 3 } });
  add(30, { clase: true, encuesta: true });
  add(10, { directo: true, compra: true, inicio_pago: { veces: 1 } });
  add(30, { directo: true });
  add(4, { compra: true, encuesta: true });
  add(96, { encuesta: true, inicio_pago: { veces: 1 } });
  const tests = [['Vio ≥50% de la clase 1', (l) => l.s.clase], ['Asistió al directo', (l) => l.s.directo], ['Rellenó la encuesta', (l) => l.s.encuesta]];
  const r = insightsCompra(leads, tests);
  assert.equal(r.compras, 44);
  assert.equal(r.top[0].frase, 'vieron ≥50% de la clase 1');
  assert.ok(r.top.every((f) => f.veces >= 1.5 && !('fn' in f)));
  assert.equal(r.combos.length, 1);
  assert.match(r.combos[0].a, /clase 1/);
  assert.ok(r.combos[0].conv > r.top[0].convCon);
  assert.ok(r.retrato.every((f) => f.pctCompradoras > f.pctLeads));
  assert.equal(r.sinNada, 0);
  assert.equal(r.decision.enDirecto, 20);
  assert.equal(r.decision.checkoutRepetido, 20);
  assert.equal(r.decision.aLasPuertas, 96);
  assert.equal(r.decision.visitasMedia, 3);
  assert.equal(fraseSenal('Directo hasta el final'), 'vieron el directo hasta el final');
  assert.equal(fraseSenal('Contactada por WhatsApp'), 'recibieron tu WhatsApp');
});

test('computeMetrics: lo obvio (pago, enlace del directo) no entra en las conclusiones', async () => {
  const { computeMetrics } = await import('../public/js/metrics.js');
  const leads = Array.from({ length: 60 }, (_, i) => ({
    s: { compra: i < 12, inicio_pago: i < 30 ? { veces: 1 } : null, directo_click: i < 40, directo_asistio: i < 25, clase1_50: i % 2 === 0 },
    estado: { id: 'templado' },
  }));
  const m = computeMetrics(leads, { formato: 'webinar', nClases: 1 });
  assert.ok(m.lift.find((r) => r.label.startsWith('Inició el pago')).obvia);
  const frases = [...m.insights.top, ...m.insights.retrato, ...m.insights.pocoImporta].map((f) => f.frase);
  assert.ok(frases.length);
  assert.ok(frases.every((f) => !/pago|enlace/i.test(f)));
});

test('retrato de quien compra: rasgos agregados de la encuesta, sin ruido de respuestas libres sueltas', async () => {
  const { perfilesCompradoras, retratoComprador } = await import('../public/js/metrics.js');
  const preguntas = [{ id: 'edad', name: '¿Cuál es tu edad actual?', tipo: 'edad' }, { id: 'tiempo', name: '¿Cuánto tiempo llevas buscando embarazo?', tipo: 'opciones' }, { id: 'freno', name: '¿Qué crees que está retrasando el positivo?', tipo: 'texto' }];
  const leads = [];
  for (let i = 0; i < 400; i++) {
    const mayor = i % 2 === 0; // 38-40 años y más de 1 año: compran mucho más
    const compra = mayor ? i % 5 === 0 : i % 25 === 1;
    leads.push({ s: { compra }, cf: { edad: mayor ? 39 : 28, tiempo: mayor ? ['Más de 1 año'] : ['0 - 6 meses'], freno: i % 40 === 0 ? `Algo concreto ${i}` : i % 40 === 2 ? 'Algo raro' : 'El estrés' } });
  }
  const r = perfilesCompradoras(leads, preguntas, 'compra');
  const rt = retratoComprador(leads, preguntas, r);
  assert.deepEqual(rt.traits.map(([id]) => id).sort(), ['edad', 'tiempo']);
  assert.ok(rt.traits.some(([, v]) => v === 'Más de 1 año'));
  assert.ok(rt.encajan.indice > 1.5);
  assert.ok(rt.encajan.pesoCompras > rt.encajan.pesoLeads);
  assert.ok(rt.antiTraits.length);
  // «Algo raro» lo dan 10 de 400 (menos del 5 %): no es un patrón.
  const freno = r.preguntas.find((x) => x.p.id === 'freno').rows;
  assert.ok(freno.find((x) => x.respuesta === 'Algo raro').pocos);
  assert.ok(r.avatares.every((a) => a.traits.every(([, v]) => !/^Algo/.test(v))));
});
