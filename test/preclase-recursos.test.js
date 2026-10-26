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

test('consumo de los recursos de la lista: señales, puntos y textos', async () => {
  const { signalsFor, score, tagFor } = await import('../public/js/scoring.js');
  const { listaConsumo, textoRecurso, nivelRecurso } = await import('../public/js/recursos.js');
  const launch = { preclaseTipo: 'recursos', nClases: 0, preclase: true, vip: false, fechaDirecto: '2026-11-03', horaDirecto: '19:00',
    listaRecursos: [{ nombre: 'Leyenda', tipo: 'video', url: 'https://vimeo.com/1' }, { nombre: 'Mapa', tipo: 'audio', url: 'https://x/a.mp3' }, { nombre: 'Guía', tipo: 'descargable', url: 'https://x/g.pdf' }, { nombre: '', tipo: 'video', url: '' }] };
  const lista = listaConsumo(launch);
  assert.deepEqual(lista.map((x) => x.n), [1, 2, 3]);
  const tags = ['rec1_abrio', 'rec1_50', 'rec1_90', 'rec2_abrio', 'rec3_abrio'].map((t) => tagFor('resis', t));
  const s = signalsFor(tags, 'resis', launch, { tags, cf: {} });
  assert.ok(s.rec1_90 && s.rec2_abrio && !s.rec2_50 && s.rec3_abrio);
  assert.deepEqual(s.lista.map((x) => x.n), [1, 2, 3]);
  assert.equal(textoRecurso(s, lista[0]), 'lo vio entero');
  assert.equal(textoRecurso(s, lista[1]), 'le dio al play');
  assert.equal(textoRecurso(s, lista[2]), 'lo descargó');
  assert.equal(nivelRecurso(s, lista[1]), 0.4);
  // Los recursos puntúan (ocupan el bloque de las clases): más consumo, más puntos
  const nada = signalsFor([], 'resis', launch, { tags: [], cf: {} });
  assert.ok(score(s) > score(nada));
});
