import { test } from 'node:test';
import assert from 'node:assert/strict';
import { piezasImagenes, mockupsDe, promptMockup, promptMaestra, promptEdicion, promptMagnificImagenes, horaTxt, ventanaGrabacion } from '../public/js/imagenes-ia.js';

const L = {
  name: 'Octubre', fechaDirecto: '2026-10-20', horaDirecto: '19:00', aperturaCarrito: '2026-10-20T20:30', cierreCarrito: '2026-10-27T21:00', formato: 'webinar',
  oferta: { bonus: [
    { id: 'b1', tipo: 'bar_24h', nombre: 'Guía de batch cooking' },
    { id: 'b2', tipo: 'bonus', nombre: 'Comunidad' },
    { id: 'b3', tipo: 'bar_48h', nombre: 'Sesión de dudas', hasta: '2026-10-22T21:00' },
  ] },
};

test('imágenes: piezas del lanzamiento con el nombre del producto, de cada BAR y la grabación de 48 h', () => {
  const p = piezasImagenes(L, { producto: 'Raíces' });
  const ids = p.map((x) => x.id);
  assert.deepEqual(ids, ['grabacion', 'grabacion-48', 'grabacion-ultimo', 'abiertas', 'bonus-b1-dia', 'bonus-b1-horas', 'bonus-b3-dia', 'bonus-b3-horas', 'producto-dia', 'producto-horas', 'producto-hora']);
  assert.equal(p.find((x) => x.id === 'abiertas').destacado, 'Raíces');
  assert.equal(p.find((x) => x.id === 'producto-hora').titular, 'Última hora para entrar en Raíces');
  assert.equal(p.find((x) => x.id === 'producto-dia').subtitulo, 'Solo hasta las 21.00h');
  assert.equal(p.find((x) => x.id === 'bonus-b3-dia').destacado, 'Sesión de dudas');
  assert.equal(p.find((x) => x.id === 'bonus-b3-horas').subtitulo, 'Solo hasta las 21.00h');
  assert.ok(!ids.some((x) => x.includes('b2')), 'el bonus normal no caduca antes del cierre');
  for (const id of ['grabacion', 'grabacion-48', 'grabacion-ultimo']) assert.equal(p.find((x) => x.id === id).mockup, 'grabacion');
  const g = ventanaGrabacion(L);
  if (g.desde != null) assert.equal(g.hasta - g.desde, 48 * 3_600_000);
});

test('imágenes: un mockup por cosa y prompts con el texto exacto', () => {
  const p = piezasImagenes(L, { producto: 'Raíces' });
  const m = mockupsDe(p);
  assert.deepEqual(m.map((x) => x.id), ['grabacion', 'producto', 'bonus:b1', 'bonus:b3']);
  const ctx = { marca: 'Mi marca', producto: 'Raíces', diseno: 'Colores: azul marino y dorado', logo: 'https://x/logo.png', lanzamiento: 'Octubre' };
  assert.match(promptMockup('grabacion', ctx), /GRABACIÓN/);
  assert.match(promptMockup('bonus:b1', ctx, L.oferta.bonus[0]), /Guía de batch cooking/);
  assert.match(promptMaestra(p[0], ctx), /azul marino/);
  const ed = promptEdicion(p.at(-1));
  assert.match(ed, /Mantén TODO igual/);
  assert.match(ed, /«Última hora para entrar en Raíces»/);
  const todo = promptMagnificImagenes(p, ctx);
  assert.match(todo, /simulate_cost/);
  assert.match(todo, /EDITANDO la maestra/);
  assert.equal(horaTxt(null), '');
});

test('imágenes: sin oferta ni producto no falla', () => {
  const p = piezasImagenes({});
  assert.ok(p.some((x) => x.titular === 'Último día para entrar en el programa'));
  assert.ok(!p.some((x) => x.id.startsWith('bonus-')));
});
