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

test('imágenes: los colores y tipografías del panel de Marca van en los prompts con su papel', async () => {
  const { paletaMarca, bloqueVisual } = await import('../public/js/imagenes-ia.js');
  const r = { color1: '#1B2A4A', color2: '#C9A227', color3: '#B3261E', colorFondo: '#0F1A2E', colorTexto: '#F4EFE3', fuenteTitulos: 'Playfair Display', fuenteTexto: 'Lato', estilo: ['Elegante'] };
  const p = paletaMarca(r);
  assert.equal(p.acento, '#B3261E');
  assert.equal(paletaMarca({ color1: 'rojo' }), null, 'solo códigos #RRGGBB');
  const b = bloqueVisual(p);
  for (const x of ['#0F1A2E', '#F4EFE3', '#B3261E', '#C9A227', 'Playfair Display', 'Lato']) assert.ok(b.includes(x), x);
  const p0 = piezasImagenes(L, { producto: 'Raíces' });
  const ctx = { marca: 'M', producto: 'Raíces', paleta: p, logo: 'https://x/logo.png' };
  for (const prompt of [promptMaestra(p0[0], ctx), promptMockup('producto', ctx), promptMagnificImagenes(p0, ctx)]) {
    assert.match(prompt, /#B3261E/);
    assert.match(prompt, /Playfair Display/);
    assert.match(prompt, /logo\.png/);
  }
  // Las ediciones heredan el estilo de la maestra (no lo repiten).
  assert.match(promptEdicion(p0[1]), /Mantén TODO igual/);
});

test('imágenes: el logo del lanzamiento va en la maestra, en el mockup del producto y se mantiene en las ediciones', () => {
  const p0 = piezasImagenes(L, { producto: 'Raíces' });
  const ctx = { producto: 'Raíces', logo: 'https://x/logo-lanz.png', lanzamiento: 'Octubre' };
  const m = promptMaestra(p0[0], ctx);
  assert.match(m, /LOGO DEL LANZAMIENTO: https:\/\/x\/logo-lanz\.png/);
  assert.match(m, /Arriba: el logo del lanzamiento/);
  assert.match(promptMockup('producto', ctx), /logo/);
  assert.match(promptEdicion(p0[1]), /El logo se queda igual/);
  assert.match(promptMaestra(p0[0], { ...ctx, logoDeMarca: true }), /Logo de la marca/);
  assert.match(promptMaestra(p0[0], { lanzamiento: 'Octubre' }), /nombre del lanzamiento \(«Octubre»\)/);
});

test('imágenes: los colores no se repiten (el resto del estilo visual sí va)', async () => {
  const { paletaMarca } = await import('../public/js/imagenes-ia.js');
  const p0 = piezasImagenes(L, { producto: 'Raíces' });
  const diseno = 'ESTILO VISUAL\n- Color principal: #2f4a3a\n- Tipografía de los titulares: Playfair Display\n- ¿Cómo es tu estilo? (elige varios): Elegante\n- Lo que NO quieres ver en el diseño: stock genérico';
  const m = promptMaestra(p0[0], { diseno, paleta: paletaMarca({ color1: '#2f4a3a', fuenteTitulos: 'Playfair Display' }) });
  assert.equal(m.split('#2f4a3a').length - 1, 1);
  assert.match(m, /stock genérico/);
  assert.match(m, /Elegante/);
});
