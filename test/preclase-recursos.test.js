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
    listaRecursos: [{ nombre: 'Vídeo 1', tipo: 'video', url: 'https://vimeo.com/1', at: '' }, { nombre: 'Sin enlace', tipo: 'enlace', url: '', at: '' }, { nombre: 'Audio', tipo: 'audio', url: 'https://x.com/a.mp3', at: '' }] };
  assert.equal(nClases(launch), 0);
  assert.equal(tieneRecurso(launch, 'descargable'), false);
  assert.deepEqual(etapasPreclase(launch, nClases(launch)).map((e) => e.id), ['r1', 'r3', 'directo']);
  assert.equal(nClases({ ...launch, preclaseTipo: 'clases' }), 2);
});
