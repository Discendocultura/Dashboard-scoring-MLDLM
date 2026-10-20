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
