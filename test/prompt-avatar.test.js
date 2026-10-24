import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promptAvatar } from '../public/js/prompt-avatar.js';

test('avatar comprador: el prompt para Claude lleva cada pregunta con sus respuestas, la VIP, la compra y el tráfico', () => {
  const preguntas = [{ id: 'q1', name: '¿Cuánto llevas buscando?', tipo: 'opciones' }];
  const l = (q1, s) => ({ s, cf: q1 ? { q1 } : {} });
  const leads = [l('Más de 2 años', { vip: true, compra: true, trafico: 'frio' }), l('Más de 2 años', { vip: true, trafico: 'frio' }), l('Menos de 1 año', { trafico: 'templado' }), l('', {})];
  const txt = promptAvatar(leads, preguntas, { producto: 'Raíces', embudo: 'Lanz', precioVip: 9 });
  assert.match(txt, /Registradas: 4 · respondieron la encuesta: 3 \(75 %\) · compraron la VIP: 2 \(50 %\) · compraron Raíces: 1 \(25 %\)/);
  assert.match(txt, /### ¿Cuánto llevas buscando\?/);
  assert.match(txt, /\| Más de 2 años \| 2 \| 66,7 % \| 2 \| 100 % \| 1 \| 50 % \|/);
  assert.match(txt, /Tráfico frío \(nuevas\): 2 leads · 2 VIP \(100 %\) · 1 compran Raíces \(50 %\)/);
  assert.match(txt, /Entrada VIP → compra: con VIP compran 1 de 2/);
  assert.doesNotMatch(promptAvatar(leads, preguntas, { producto: 'Raíces', conVip: false }), /Compran VIP/);
});
