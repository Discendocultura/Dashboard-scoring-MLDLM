import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeListaRecursos, etapasPreclase, tieneRecurso, nRecursosValido } from '../public/js/recursos.js';
import { nClases } from '../public/js/videos.js';

test('preclase de varios recursos: la lista tiene los que pide el embudo y se limpia', () => {
  const l = sanitizeListaRecursos([{ nombre: 'Guía', tipo: 'descargable', url: 'https://x.com/a.pdf', at: '2026-10-21T10:00' }, { tipo: 'raro', url: 'javascript:alert(1)' }], 4);
  assert.equal(l.length, 4);
  assert.deepEqual(l[0], { nombre: 'Guía', tipo: 'descargable', url: 'https://x.com/a.pdf', at: '2026-10-21T10:00', texto: '' });
  assert.equal(l[1].tipo, 'video');
  assert.equal(l[1].url, '');
  assert.equal(nRecursosValido(50), 12);
  assert.equal(nRecursosValido(0), 3);
});

test('preclase de varios recursos: sin clases ni recursos de clase, y cada recurso es una etapa', () => {
  const launch = { preclase: true, preclaseTipo: 'recursos', nClases: 2, recursosPre: { descargable: { activo: true, url: 'https://x.com/b.pdf' } },
    listaRecursos: [{ nombre: 'Vídeo 1', tipo: 'video', url: 'https://vimeo.com/1', at: '' }, { nombre: 'Sin enlace', tipo: 'enlace', url: '', at: '' }, { nombre: 'Audio', tipo: 'audio', url: 'https://x.com/a.mp3', at: '' }, { nombre: '', tipo: 'video', url: '', at: '' }] };
  assert.equal(nClases(launch), 0);
  assert.equal(tieneRecurso(launch, 'descargable'), false);
  // El que aún no tiene enlace también es etapa (sale bloqueado); el hueco vacío, no.
  assert.deepEqual(etapasPreclase(launch, nClases(launch)).map((e) => e.id), ['r1', 'r2', 'r3', 'directo']);
  assert.equal(nClases({ ...launch, preclaseTipo: 'clases' }), 2);
});

import { fasesDe, aplicaTarea, PLANTILLA } from '../public/js/tareas.js';
import { paginasDe } from '../public/js/paginas.js';

test('tareas y columnas según la preclase del lanzamiento', () => {
  assert.deepEqual(fasesDe('lanz', { preclase: false }).map((f) => f.id), ['preparacion', 'captacion', 'directo', 'carrito', 'cierre']);
  assert.equal(fasesDe('lanz', { preclaseTipo: 'recursos' }).find((f) => f.id === 'clases').label, 'Recursos preclase');
  assert.equal(fasesDe('lanz', {}).find((f) => f.id === 'clases').label, 'Clases previas');
  const sin = PLANTILLA.filter((x) => aplicaTarea(x, { preclase: false }));
  assert.ok(!sin.some((x) => x.fase === 'clases'));
  assert.ok(sin.some((x) => x.fase === 'preparacion' && /preclase/i.test(x.titulo))); // las de preparación siguen
  assert.ok(!PLANTILLA.filter((x) => aplicaTarea(x, { nClases: 1 })).some((x) => /clase 2/i.test(x.titulo)));
  assert.ok(aplicaTarea({ titulo: 'x', cond: 'recursos' }, { preclaseTipo: 'recursos' }));
  assert.ok(!aplicaTarea({ titulo: 'x', cond: 'recursos' }, {}));
});

test('prompts de páginas según la preclase', () => {
  assert.ok(!paginasDe('lanzamientos', { preclase: 'no' }).some((p) => ['login', 'preclase'].includes(p.id)));
  assert.equal(paginasDe('lanzamientos', { preclase: 'recursos' }).find((p) => p.id === 'preclase').nombre, 'Página preclase (recursos)');
});
