import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANTILLA } from '../public/js/tareas.js';
import { procesoDeTarea, conProceso, esProcesoDeSerie } from '../public/js/procesos-tarea.js';
import { sanitizeRich } from '../public/js/richtext.js';

test('todas las tareas habituales tienen su proceso paso a paso', () => {
  for (const t of PLANTILLA) {
    const html = procesoDeTarea(t.titulo);
    assert.ok(html, `sin proceso: ${t.titulo}`);
    assert.match(html, /<ol><li>/);
    assert.match(html, /Está hecha cuando/);
    assert.equal(sanitizeRich(html), html, `el editor lo deja igual: ${t.titulo}`);
  }
});

test('reconoce títulos retocados y las tareas creadas a mano', () => {
  for (const titulo of [
    'Revisar precios y enlaces de pago (entrada VIP, Raíces pago único y fraccionado)',
    'Contactar por WhatsApp a las leads calientes de «Setteo hoy»',
    'Nuevos anuncios: guiones para vídeos e imágenes estáticas',
    'Revisión oferta Raíces y precios',
    'Edición clases previas 1 y 2',
    'Reunión de coordinación con equipo',
  ]) assert.ok(procesoDeTarea(titulo), titulo);
  assert.equal(procesoDeTarea('Comprar café'), '');
});

test('conProceso: solo rellena descripciones vacías', () => {
  const t = { titulo: 'Probar el enlace del directo y la sala de Zoom', notas: '' };
  assert.match(conProceso(t).notas, /Paso a paso/);
  assert.equal(conProceso({ ...t, notas: '<p>Mis notas</p>' }).notas, '<p>Mis notas</p>');
  assert.equal(conProceso({ ...t, notas: '<p><br></p>' }).notas.includes('Paso a paso'), true);
  assert.ok(esProcesoDeSerie(conProceso(t)));
  assert.equal(esProcesoDeSerie({ ...t, notas: '<p>x</p>' }), false);
});
