import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pasosEmbudo, anchosEmbudo, fondoCapa } from '../public/js/embudo-visual.js';

test('embudo visual: pasos del lanzamiento con conversión, coste e ingresos', () => {
  const l = (s) => ({ s });
  const leads = [
    l({ encuesta: true, clase1_25: true, vip: true, directo_asistio: true, compra: true }),
    l({ encuesta: true, clase1_25: true, vip: true, replay_50: true, replay_25: true }),
    l({ encuesta: true }),
    l({}),
  ];
  const launch = { encuestaTag: 'enc', vip: true };
  const p = pasosEmbudo(leads, launch, { visitasRegistro: 10, inversion: 100, producto: 'Raíces', ingresosVip: 54 });
  assert.deepEqual(p.map((x) => [x.id, x.n]), [['visitas', 10], ['registros', 4], ['encuesta', 3], ['clases', 2], ['vip', 2], ['video', 2], ['compra', 1]]);
  const reg = p.find((x) => x.id === 'registros');
  assert.equal(reg.pctPrev, 0.4);
  assert.equal(reg.perdidos, 6);
  assert.equal(reg.coste, 25);
  assert.equal(p.find((x) => x.id === 'vip').ingresos, 54);
  assert.deepEqual(p.find((x) => x.id === 'video').detalle, ['1 en directo', '1 solo la grabación']);
  assert.equal(p.at(-1).label, 'Compraron Raíces');
  assert.equal(p.at(-1).pctTotal, 0.25);
  // Sin visitas, encuesta ni VIP: esos pasos no salen
  assert.deepEqual(pasosEmbudo(leads, { vip: false, preclase: false }).map((x) => x.id), ['registros', 'video', 'compra']);
  const w = anchosEmbudo(p);
  assert.equal(w[0], 100);
  assert.ok(w.every((x) => x >= 42 && x <= 100));
  // La VIP va al lado: el vídeo «pasa» de las clases, no de la VIP, y el embudo nunca se ensancha
  const vip = p.find((x) => x.id === 'vip');
  assert.equal(vip.lateral, true);
  assert.equal(vip.pctPrev, 0.5); // sobre los registros
  assert.equal(p.find((x) => x.id === 'video').pctPrev, 1);
  assert.ok(w.every((x, i) => fondoCapa(x, w[i + 1]) < x), 'cada capa se estrecha hacia abajo');
  // Un paso con más gente que el anterior no dice «pasa el 150 %»
  const raro = pasosEmbudo([l({ replay_25: true, replay_50: true }), l({ replay_25: true })], { preclase: true, encuestaTag: 'e' });
  assert.equal(raro.find((x) => x.id === 'video').pctPrev, null);
});
