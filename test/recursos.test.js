import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRecursos, etapasPreclase, tieneRecurso } from '../public/js/recursos.js';
import { signalsFor } from '../public/js/scoring.js';
import { sanitizeConfig } from '../lib/config-store.js';

const recursosPre = sanitizeRecursos({
  musica: { activo: true, url: 'https://x.com/musica.mp3', tras: 'clase1' },
  test: { activo: true, nombre: 'Autodiagnóstico', url: 'https://ghl.com/test', tag: 'Autodiagnostico-Completado', at: '2026-10-20T10:00' },
  votacion: { activo: true, pregunta: '¿Qué tema quieres?', opciones: 'Ciclo\nAnalíticas\n\nEmociones', tras: 'clase2' },
}, 2);
const launch = { encuestaTag: 'encuesta-x', clase1At: '2026-10-19T10:00', clase2At: '2026-10-21T10:00', recursosPre };

test('recursos de la preclase: limpieza y etapas por fecha', () => {
  assert.equal(recursosPre.test.tag, 'autodiagnostico-completado');
  assert.deepEqual(recursosPre.votacion.opciones.map((o) => o.texto), ['Ciclo', 'Analíticas', 'Emociones']);
  assert.equal(sanitizeRecursos({ musica: { activo: true, url: 'javascript:alert(1)' } }).musica.url, '');
  assert.deepEqual(etapasPreclase(launch, 2).map((e) => `${e.n}:${e.id}`), ['1:encuesta', '2:clase1', '3:test', '4:clase2', '5:directo']);
  assert.ok(tieneRecurso(launch, 'votacion') && tieneRecurso(launch, 'musica') && !tieneRecurso(launch, 'descargable'));
});

test('recursos de la preclase: señales del lead (música, test y voto)', () => {
  const s = signalsFor(['oct26_musica_50', 'oct26_voto', 'autodiagnostico-completado'], 'oct26', launch, {});
  assert.equal(s.musica_50, true);
  assert.equal(s.voto, true);
  assert.equal(s.test, true);
  assert.deepEqual(s.recursos, { musica: true, test: true, votacion: true, descargable: false });
});

test('recursos de la preclase: se guardan con el lanzamiento', () => {
  const cfg = sanitizeConfig({ launches: { 'oct-26': { name: 'Oct', recursosPre } } });
  assert.equal(cfg.launches['oct-26'].recursosPre.test.nombre, 'Autodiagnóstico');
  assert.equal(cfg.launches['oct-26'].recursosPre.votacion.opciones.length, 3);
});
