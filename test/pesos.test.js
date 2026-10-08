import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proponerPesos, sanitizePesos, PESOS_SERIE, PESOS_CLASICOS } from '../public/js/pesos.js';
import { score } from '../public/js/scoring.js';
import { sanitizeConfig } from '../lib/config-store.js';

const lead = (s, compra) => ({ s: { clases: ['clase1', 'clase2'], nVideos: 1, ...s, compra } });

test('pesos: de serie la puntuación no cambia; con otros pesos sí y sigue sobre 100', () => {
  const s = { clases: ['clase1', 'clase2'], clase1_90: true, clase2_90: true, vip: true, directo_asistio: true, directo_60: true, directo_final: true, nVideos: 1 };
  assert.equal(score(s), score(s, PESOS_CLASICOS)); // sin recursos de la preclase: el reparto de siempre
  assert.equal(score(s), 100);
  const soloVip = { clases: ['clase1', 'clase2'], vip: true, nVideos: 1 };
  assert.equal(score(soloVip), 30);
  assert.equal(score(soloVip, { clases: 20, vip: 50, video: 30 }), 50);
  assert.equal(score({ ...soloVip, conVip: false, vip: false, directo_asistio: true }, { clases: 20, vip: 50, video: 30 }), Math.round((15 * 30 / 40) * 100 / 50));
});

test('pesos: más peso a lo que separa a compradoras de no compradoras', () => {
  const leads = [];
  // VIP: el 60 % compra con VIP y el 5 % sin ella. Clases: casi no separa. Vídeo: separa algo.
  for (let i = 0; i < 100; i++) leads.push(lead({ vip: true, clase1_50: i % 2 === 0, directo_asistio: i % 3 === 0 }, i < 60));
  for (let i = 0; i < 300; i++) leads.push(lead({ vip: false, clase1_50: i % 2 === 0, directo_asistio: i % 3 === 0 }, i < 15));
  const p = proponerPesos(leads);
  assert.equal(p.pesos.clases + p.pesos.vip + p.pesos.video, 100);
  assert.ok(p.pesos.vip > PESOS_CLASICOS.vip, JSON.stringify(p.pesos));
  assert.ok(p.pesos.clases <= 15, JSON.stringify(p.pesos));
  assert.match(proponerPesos(leads.slice(0, 5)).motivo, /al menos 10 ventas/);
});

test('pesos: se guardan validados en la configuración', () => {
  assert.equal(sanitizePesos({ clases: 200, vip: 30, video: 40 }), null);
  assert.deepEqual(sanitizeConfig({ pesosScore: { clases: 20, vip: 40, video: 40 } }).pesosScore, { clases: 20, musica: 5, test: 10, votacion: 5, vip: 40, video: 40 });
  assert.equal(sanitizeConfig({}).pesosScore, null);
});

test('pesos con recursos de la preclase: música, test y votación cuentan solo si el lanzamiento los tiene', () => {
  const R = { musica: true, test: true, votacion: true };
  const todo = { clases: ['clase1', 'clase2'], clase1_90: true, clase2_90: true, vip: true, directo_asistio: true, directo_60: true, directo_final: true, nVideos: 1, recursos: R, musica_90: true, test: true, voto: true };
  assert.equal(score(todo), 100);
  const sinExtras = { ...todo, musica_90: false, test: false, voto: false };
  assert.equal(score(sinExtras), 80); // 20 + 25 + 35
  assert.equal(score({ ...sinExtras, musica_50: true }), Math.round(80 + 5 * 2 / 3));
  assert.equal(score({ ...todo, recursos: {} }), 100); // sin recursos: 30/30/40
  assert.equal(PESOS_SERIE.clases + PESOS_SERIE.musica + PESOS_SERIE.test + PESOS_SERIE.votacion + PESOS_SERIE.vip + PESOS_SERIE.video, 100);
});
