// Leads → Encuesta → «🧠 Analizar con Claude»: el prompt con las respuestas abiertas para sacar patrones y ganchos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anonimizar, libresAgrupadas, promptEncuesta } from '../public/js/encuesta-ia.js';
import { PLANTILLA } from '../public/js/tareas.js';

const R = {
  total: 120, respondieron: 80,
  preguntas: [
    { p: { id: 'q1', name: '¿Cuánto tiempo llevas buscando?', tipo: 'opciones' }, respondieron: 80, opciones: [{ respuesta: 'Más de 1 año', n: 50, compras: 6, pct: 0.625 }], libres: [] },
    { p: { id: 'q2', name: '¿Qué es lo que más te preocupa?', tipo: 'texto' }, respondieron: 5, opciones: [], libres: [
      { id: 'a', nombre: 'Ana López', texto: 'No saber si estoy ovulando', compra: false },
      { id: 'b', nombre: 'Bea', texto: 'no saber si estoy  ovulando', compra: false },
      { id: 'c', nombre: 'Carla', texto: 'Que se me pase el arroz, escríbeme a carla@mail.com o al 612 345 678', compra: true },
      { id: 'd', nombre: 'Dani', texto: '.', compra: false },
      { id: 'e', nombre: 'Eva', texto: 'El estrés', compra: false },
    ] },
  ],
};

test('anonimizar: quita emails y teléfonos', () => {
  assert.equal(anonimizar('a carla@mail.com o +34 612 345 678 ya'), 'a [email] o [teléfono] ya');
  assert.doesNotMatch(anonimizar('llámame al 612345678'), /\d{6}/);
  assert.doesNotMatch(anonimizar('x@y.es'), /@/);
  assert.equal(anonimizar('Tengo 35 años y 2 hijos'), 'Tengo 35 años y 2 hijos'); // los números normales se quedan
});

test('libresAgrupadas: junta repetidas, quita las vacías y pone primero las de compradoras', () => {
  const g = libresAgrupadas(R.preguntas[1].libres);
  assert.equal(g.length, 3);
  assert.equal(g[0].compras, 1);
  assert.match(g[0].texto, /arroz/);
  assert.equal(g[1].n, 2);
});

test('prompt: datos, [COMPRÓ], repetidas, sin nombres ni datos personales, ficha, narrativa y lo que pide', () => {
  const { prompt, incluidas, total } = promptEncuesta(R, { marca: 'MLDLM', producto: 'Raíces', lanzamiento: 'Octubre', contexto: 'FICHA AVATAR', narrativa: 'NARRATIVA DEL LANZAMIENTO: «El Camino»' });
  assert.equal(incluidas, 3);
  assert.equal(total, 3);
  assert.match(prompt, /80 de 120 registrados/);
  assert.match(prompt, /lanzamiento «Octubre» \(Raíces · MLDLM\)/);
  assert.match(prompt, /- \[COMPRÓ\] Que se me pase el arroz/);
  assert.match(prompt, /No saber si estoy ovulando \(×2\)/);
  assert.match(prompt, /Más de 1 año: 63 % · 6 compraron/);
  assert.match(prompt, /<pregunta texto="¿Qué es lo que más te preocupa\?" respuestas="5">/);
  assert.match(prompt, /FICHA AVATAR/);
  assert.match(prompt, /«El Camino»/);
  assert.match(prompt, /COMPRADORAS FRENTE AL RESTO/);
  assert.match(prompt, /10 asuntos de email/);
  assert.match(prompt, /ACTUALIZACIÓN DE LA FICHA DEL AVATAR/);
  for (const x of ['Ana López', 'Carla', 'carla@mail.com', '612 345 678']) assert.ok(!prompt.includes(x), x);
});

test('prompt: con muchas respuestas recorta (y lo dice) sin pasarse del máximo', () => {
  const libres = Array.from({ length: 500 }, (_, i) => ({ texto: `Respuesta número ${i} bastante larga para ocupar espacio`, compra: i === 499 }));
  const { prompt, incluidas, total } = promptEncuesta({ total: 500, respondieron: 500, preguntas: [{ p: { id: 'q', name: 'Q', tipo: 'texto' }, respondieron: 500, opciones: [], libres }] }, { max: 2000 });
  assert.equal(total, 500);
  assert.ok(incluidas > 0 && incluidas < 500);
  assert.match(prompt, new RegExp(`van ${incluidas} de 500 respuestas`));
  assert.match(prompt, /\[COMPRÓ\] Respuesta número 499/); // la compradora entra aunque sea la última
});

test('sin respuestas libres: el prompt lo dice', () => {
  const { prompt, total } = promptEncuesta({ total: 10, respondieron: 0, preguntas: [] });
  assert.equal(total, 0);
  assert.match(prompt, /no hay respuestas de texto libre/);
});

test('tarea de cierre en la plantilla', () => {
  assert.ok(PLANTILLA.some((t) => t.fase === 'cierre' && /Analizar con Claude las respuestas abiertas de la encuesta/.test(t.titulo)));
});
