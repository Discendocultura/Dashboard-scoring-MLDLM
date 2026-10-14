import test from 'node:test';
import assert from 'node:assert/strict';
import { leerRef, refTarea, refTablero, tokenComentario, enlacesEnTexto, filtrarEnlaces } from '../public/js/enlaces.js';
import { sanitizeRich, richToEmail, richToText } from '../public/js/richtext.js';

test('enlaces con @: referencias de tarea y tablero', () => {
  assert.deepEqual(leerRef(refTarea('mldlm', '_agencia', 'ta1')), { tipo: 'tarea', cliente: 'mldlm', code: '_agencia', id: 'ta1' });
  assert.deepEqual(leerRef(refTablero('mldlm', 'general')), { tipo: 'tablero', proyecto: 'mldlm', id: 'general' });
  assert.equal(leerRef('#tarea:solo|dos'), null);
  assert.equal(leerRef('javascript:alert(1)'), null);
  assert.equal(leerRef('#tarea:a"b|c|d'), null);
});

test('enlaces con @: en comentarios se guardan como texto y se muestran como enlace', () => {
  const tok = tokenComentario('Subir [facturas]\n', refTarea('c1', 'demo', 't9'));
  assert.equal(tok, '@[Subir facturas](#tarea:c1|demo|t9)');
  assert.equal(enlacesEnTexto(`Mira ${tok}`), 'Mira <a href="#tarea:c1|demo|t9" class="enlace-int e-tarea">Subir facturas</a>');
  assert.equal(enlacesEnTexto('@[x](#tarea:a|b)'), '@[x](#tarea:a|b)'); // referencia incompleta: se queda como texto
});

test('enlaces con @: la descripción los conserva (sin abrir otra pestaña) y en emails quedan como texto', () => {
  const html = sanitizeRich('<p>Ver <a href="#tablero:c1|general" target="_blank" onclick="x()">General</a></p>');
  assert.equal(html, '<p>Ver <a href="#tablero:c1|general" class="enlace-int e-tablero">General</a></p>');
  assert.equal(richToEmail(html), '<p>Ver «General»</p>');
});

test('enlaces con @: buscar por palabras sin tildes', () => {
  const items = [{ ref: 'a', titulo: 'Facturas del mes', sub: 'Discendo' }, { ref: 'b', titulo: 'Publicación Instagram', sub: 'MLDLM' }];
  assert.deepEqual(filtrarEnlaces(items, 'publicacion').map((x) => x.ref), ['b']);
  assert.deepEqual(filtrarEnlaces(items, 'mes disc').map((x) => x.ref), ['a']);
  assert.equal(filtrarEnlaces(items, '').length, 2);
});

test('texto plano de una descripción con enlaces: sin «&nbsp;» a la vista', () => {
  assert.equal(richToText('<p>Ver <a href="#tarea:a|b|c" class="enlace-int e-tarea">Uno</a>&nbsp;y más</p>').replace(/\u00a0/g, ' ').trim(), 'Ver Uno y más');
});
