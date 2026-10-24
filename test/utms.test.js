import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pasosUtms, arbolUtms, nivelUtms, ordenarUtms, utmDe, calidad } from '../public/js/utms.js';

const lead = (src, s = {}) => ({ src, s });
const launch = { nClases: 2, vip: true };

test('UTMs: pasos del embudo en orden según el tipo', () => {
  assert.deepEqual(pasosUtms('lanz', launch, { producto: 'Raíces' }).map((p) => p.id), ['leads', 'encuesta', 'clases', 'vip', 'directo', 'compra']);
  assert.equal(pasosUtms('lanz', launch, { producto: 'Raíces' }).at(-1).label, 'Compró Raíces');
  assert.deepEqual(pasosUtms('lanz', { preclase: false, vip: false }).map((p) => p.id), ['leads', 'encuesta', 'directo', 'compra']);
  assert.deepEqual(pasosUtms('vsl', { llamadaTag: 'x' }).map((p) => p.id), ['leads', 'vio', 'vio75', 'llamada', 'compra']);
  assert.deepEqual(pasosUtms('directa', { upsellPrincipal: { tags: ['raices'] } }).map((p) => p.id), ['leads', 'extras', 'compra']);
  // Las UTM de GHL (term/content) y las de la venta directa (adset/ad), igual
  assert.deepEqual(utmDe({ src: { campaign: 'c', term: 's', content: 'a' } }), utmDe({ src: { campaign: 'c', adset: 's', ad: 'a' } }));
});

test('UTMs: árbol campaña › conjunto › anuncio con el embudo, coste por paso y calidad', () => {
  const pasos = pasosUtms('lanz', launch);
  const leads = [
    lead({ campaign: 'C1', term: 'S1', content: 'A1' }, { encuesta: true, vip: true, directo_asistio: true, compra: true, clase1: 90 }),
    lead({ campaign: 'C1', term: 'S1', content: 'A1' }, { encuesta: true }),
    lead({ campaign: 'C1', term: 'S1', content: 'A2' }, {}),
    lead({ campaign: 'C1', term: 'S2', content: 'A3' }, { encuesta: true, vip: true }),
    lead({}, { compra: true }),
  ];
  const a = arbolUtms(leads, pasos, { names: { C1: 'Captación', A1: 'Vídeo testimonio' }, spendBy: { C1: 100, A1: 40 } });
  assert.equal(a.total.leads, 5);
  assert.equal(a.sinUtm.leads, 1);
  const c = a.campanas[0];
  assert.equal(c.label, 'Captación');
  assert.deepEqual([c.leads, c.n.encuesta, c.n.vip, c.n.compra], [4, 3, 2, 1]);
  assert.equal(c.coste.leads, 25); // 100 € / 4 leads
  assert.equal(c.coste.compra, 100);
  assert.equal(c.hijos[0].key, 'S1');
  const a1 = c.hijos[0].hijos.find((x) => x.key === 'A1');
  assert.equal(a1.label, 'Vídeo testimonio');
  assert.equal(a1.coste.vip, 40);
  assert.ok(a1.pocos); // menos de 10 leads: orientativo
  // A1 (con compra) tiene más calidad que A2 (no hace nada)
  const anuncios = nivelUtms(a, 'ad');
  assert.equal(anuncios.length, 3);
  assert.equal(anuncios.find((x) => x.key === 'A1').ruta, 'Captación › S1');
  assert.ok(anuncios.find((x) => x.key === 'A1').calidad > anuncios.find((x) => x.key === 'A2').calidad);
  assert.equal(anuncios.find((x) => x.key === 'A2').calidad, 0);
  assert.equal(ordenarUtms(anuncios, 'calidad', pasos)[0].key, 'A1');
  assert.equal(ordenarUtms(anuncios, 'compras', pasos)[0].key, 'A1');
  // Todo hecho = 100
  assert.equal(calidad({ leads: 1, n: { leads: 1, encuesta: 1, clases: 1, vip: 1, directo: 1, compra: 1 } }, pasos), 100);
});

test('UTMs: semáforo de calidad del lead por su encuesta', async () => {
  const { puntuadorEncuesta, colorSemaforo } = await import('../public/js/utms.js');
  const { perfilesCompradoras } = await import('../public/js/metrics.js');
  const preguntas = [{ id: 'tiempo', tipo: 'opcion' }];
  const L = (tiempo, compra, src = { campaign: 'C', term: 'S', content: 'A' }) => ({ src, cf: { tiempo }, s: { compra } });
  const leads = [
    ...Array.from({ length: 20 }, (_, i) => L('Más de 1 año', i < 8, { campaign: 'C', term: 'S', content: 'BUENO' })),
    ...Array.from({ length: 20 }, (_, i) => L('Menos de 6 meses', i < 1, { campaign: 'C', term: 'S', content: 'MALO' })),
    L('', false),
  ];
  const punt = puntuadorEncuesta(perfilesCompradoras(leads, preguntas, 'compra'));
  assert.equal(colorSemaforo(punt(leads[0])), 'verde');
  assert.equal(colorSemaforo(punt(leads[25])), 'rojo');
  assert.equal(punt(leads.at(-1)), null); // sin encuesta: sin color
  const a = arbolUtms(leads, pasosUtms('lanz', { preclase: false, vip: false }), { encuesta: punt });
  const ads = nivelUtms(a, 'ad');
  assert.equal(ads.find((x) => x.key === 'BUENO').semaforo.color, 'verde');
  assert.equal(ads.find((x) => x.key === 'MALO').semaforo.color, 'rojo');
  assert.equal(ads.find((x) => x.key === 'BUENO').semaforo.verde, 20);
  // Sin compras de las que aprender, no hay semáforo
  assert.equal(puntuadorEncuesta(perfilesCompradoras(leads.map((l) => ({ ...l, s: { compra: false } })), preguntas)), null);
});

test('UTMs: ordenar por leads más baratos (CPL) y por avatar comprador', () => {
  const pasos = pasosUtms('lanz', { preclase: false, vip: false });
  const f = [
    { key: 'caro', leads: 10, n: { compra: 0 }, coste: { leads: 5 }, semaforo: { media: 0.7, pocos: false } },
    { key: 'barato', leads: 10, n: { compra: 0 }, coste: { leads: 2 }, semaforo: { media: 1.4, pocos: false } },
    { key: 'sinGasto', leads: 50, n: { compra: 0 }, coste: {}, semaforo: { media: 2, pocos: true } },
  ];
  assert.deepEqual(ordenarUtms(f, 'cpl', pasos).map((x) => x.key), ['barato', 'caro', 'sinGasto']);
  // Avatar: el que más se parece a quien compra, y los de pocas respuestas al final
  assert.deepEqual(ordenarUtms(f, 'avatar', pasos).map((x) => x.key), ['barato', 'caro', 'sinGasto']);
});

test('UTMs: el gasto de Meta se encuentra aunque las UTM lleven el nombre en vez del id', () => {
  const pasos = pasosUtms('lanz', { preclase: false, vip: false });
  const a = arbolUtms([lead({ campaign: 'Captación Octubre', term: 'Mujeres 30-40', content: 'Vídeo testimonio' }, {})], pasos,
    { names: { 111: 'Captación octubre', 222: 'Mujeres 30-40', 333: 'Vídeo testimonio' }, spendBy: { 111: 50, 222: 30, 333: 10 } });
  const c = a.campanas[0];
  assert.equal(c.spend, 50);
  assert.equal(c.hijos[0].spend, 30);
  assert.equal(c.hijos[0].hijos[0].coste.leads, 10);
});

test('UTMs: solo las campañas del lanzamiento; el id y el nombre van en la misma fila', () => {
  const lead = (campaign, adset = '', ad = '') => ({ s: {}, src: { campaign, term: adset, content: ad } });
  const leads = [lead('C1'), lead('Captación camino-octubre26'), lead('Captación camino-abril26'), lead('')];
  const a = arbolUtms(leads, pasosUtms('lanz', { preclase: false, vip: false }), { names: { C1: 'Captación camino-octubre26' }, spendBy: { C1: 100 }, filtro: 'camino-octubre26' });
  assert.deepEqual(a.campanas.map((c) => [c.label, c.leads, c.coste.leads]), [['Captación camino-octubre26', 2, 50]]);
  assert.equal(a.sinUtm.leads, 2); // la del lanzamiento anterior y la que no trae UTM
  assert.equal(a.total.leads, 4);
});

test('utms: el prompt para Claude lleva cada campaña/conjunto/anuncio y el cruce VIP → compra', async () => {
  const { pasosUtms, arbolUtms, promptUtms, cruceVipCompra } = await import('../public/js/utms.js');
  const L = (camp, ad, vip, compra) => ({ s: { vip, compra }, src: { campaign: camp, adset: 's1', ad }, cf: {} });
  const leads = [L('c1', 'a1', true, true), L('c1', 'a1', true, false), L('c1', 'a2', false, false), L('c1', 'a2', false, true), L('c1', 'a2', false, false)];
  const cruce = cruceVipCompra(leads);
  assert.deepEqual([cruce.vip.n, cruce.vip.compran, cruce.noVip.n, cruce.noVip.compran], [2, 1, 3, 1]);
  const pasos = pasosUtms('lanz', { precioVip: 27 }, { producto: 'Raíces' });
  const a = arbolUtms(leads, pasos, { names: { c1: 'Campaña 1', s1: 'Conjunto 1', a1: 'Anuncio A', a2: 'Anuncio B' }, spendBy: { c1: 100, a1: 40, a2: 60 } });
  const p = promptUtms(a, pasos, { negocio: 'Prueba', embudo: 'El Camino', producto: 'Raíces', precioVip: 27, precioPrograma: 997, inversion: 100, cruce });
  assert.match(p, /\| Campaña \| Campaña 1 \|/);
  assert.match(p, /\| Anuncio \| Anuncio B \| Campaña 1 › Conjunto 1 \| 60 € \| 3 \| 20 € \|/);
  assert.match(p, /Con entrada VIP: 2 leads, compran 1 \(50 %\)/);
  assert.match(p, /Correlación VIP → compra/);
});

test('UTMs: respuestas a la encuesta de cada fila, pregunta a pregunta, frente a todos los leads', async () => {
  const { encuestaUtm } = await import('../public/js/utms.js');
  const preguntas = [{ id: 'q1', name: '¿Cuánto llevas buscando?', tipo: 'opciones' }, { id: 'q2', name: 'Otra', tipo: 'opciones' }];
  const l = (q1) => ({ s: {}, cf: q1 ? { q1 } : {} });
  const fila = [l('Más de 2 años'), l('Más de 2 años'), l('Menos de 1 año'), l('')];
  const todos = [...fila, l('Menos de 1 año'), l('Menos de 1 año'), l('Menos de 1 año'), l('Más de 2 años')];
  const r = encuestaUtm(fila, preguntas, todos);
  assert.equal(r.respondieron, 3);
  assert.equal(r.total, 4);
  assert.equal(r.preguntas.length, 1, 'sin respuestas, la pregunta no sale');
  const [mas, menos] = r.preguntas[0].opciones;
  assert.equal(mas.respuesta, 'Más de 2 años');
  assert.ok(Math.abs(mas.pct - 2 / 3) < 1e-9 && Math.abs(mas.pctTodos - 3 / 7) < 1e-9);
  assert.equal(mas.diferencia, 23.8);
  assert.equal(menos.n, 1);
});
