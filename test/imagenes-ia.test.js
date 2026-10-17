import { test } from 'node:test';
import assert from 'node:assert/strict';
import { piezasImagenes, promptImagen, promptMagnificImagenes, horaTxt, ventanaGrabacion, paletaMarca, bloqueVisual, describirMockup } from '../public/js/imagenes-ia.js';

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
  assert.equal(horaTxt(null), '');
});

test('imágenes: cada prompt es completo y lleva su propio mockup (sin pasos aparte)', () => {
  const p = piezasImagenes(L, { producto: 'Raíces' });
  const ctx = { marca: 'Mi marca', producto: 'Raíces', logo: 'https://x/logo.png', lanzamiento: 'Octubre' };
  const graba = promptImagen(p[2], ctx);
  assert.match(graba, /MOCKUP realista en 3D: un portátil y un móvil que muestran la GRABACIÓN/);
  assert.match(graba, /«Último día para ver»/);
  assert.doesNotMatch(graba, /adjunt|maestra/i);
  assert.match(promptImagen(p.find((x) => x.id === 'bonus-b1-dia'), ctx), /el bonus «Guía de batch cooking»/);
  assert.match(promptImagen(p.at(-1), ctx), /el programa «Raíces» como un pack premium/);
  assert.match(promptImagen(p.at(-1), ctx), /«Última hora para entrar en Raíces»/);
  const todo = promptMagnificImagenes(p, ctx);
  assert.match(todo, /simulate_cost/);
  assert.match(todo, /Mockup: el bonus «Sesión de dudas»/);
  assert.match(describirMockup('producto', ctx), /logo/);
});

test('imágenes: colores y tipografías de Marca con su papel, sin repetirse, y el logo del lanzamiento', () => {
  const r = { color1: '#1B2A4A', color2: '#C9A227', color3: '#B3261E', colorFondo: '#0F1A2E', colorTexto: '#F4EFE3', fuenteTitulos: 'Playfair Display', fuenteTexto: 'Lato' };
  const pal = paletaMarca(r);
  assert.equal(pal.acento, '#B3261E');
  assert.equal(paletaMarca({ color1: 'rojo' }), null, 'solo códigos #RRGGBB');
  for (const x of ['#0F1A2E', '#F4EFE3', '#B3261E', '#C9A227', 'Playfair Display', 'Lato']) assert.ok(bloqueVisual(pal).includes(x), x);
  const p = piezasImagenes(L, { producto: 'Raíces' });
  const diseno = 'ESTILO VISUAL\n- Color principal: #1B2A4A\n- ¿Cómo es tu estilo? (elige varios): Elegante\n- Lo que NO quieres ver en el diseño: stock genérico';
  const m = promptImagen(p[0], { diseno, paleta: pal, logo: 'https://x/logo-lanz.png' });
  assert.equal(m.split('#1B2A4A').length - 1, 1);
  assert.match(m, /stock genérico/);
  assert.match(m, /LOGO DEL LANZAMIENTO: https:\/\/x\/logo-lanz\.png/);
  assert.match(m, /Arriba: el logo del lanzamiento/);
  assert.match(promptImagen(p[0], { logo: 'https://x/l.png', logoDeMarca: true }), /Logo de la marca/);
  assert.match(promptImagen(p[0], { lanzamiento: 'Octubre' }), /nombre del lanzamiento \(«Octubre»\)/);
});

test('imágenes: sin oferta ni producto no falla', () => {
  const p = piezasImagenes({});
  assert.ok(p.some((x) => x.titular === 'Último día para entrar en el programa'));
  assert.ok(!p.some((x) => x.id.startsWith('bonus-')));
});

test('imágenes: la grabación no dura más que el carrito (y sin carrito largo no sale «solo 48 horas»)', () => {
  const corto = { ...L, cierreCarrito: '2026-10-21T21:00' };
  const g = ventanaGrabacion(corto);
  assert.ok(g.hasta - g.desde < 48 * 3_600_000 && !g.horas48);
  assert.ok(!piezasImagenes(corto).some((p) => p.id === 'grabacion-48'));
  assert.ok(ventanaGrabacion(L).horas48);
});
