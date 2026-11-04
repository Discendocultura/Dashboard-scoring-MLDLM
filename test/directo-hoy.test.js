import test from 'node:test';
import assert from 'node:assert/strict';
import { directoPorHora } from '../handlers/directo.js';
import { madridToEpoch } from '../public/js/page.js';

// Lanzamiento de 2 directos (como La Resistencia): cada día su sala de Zoom.
const L = {
  fechaDirecto: '2026-11-03', horaDirecto: '19:00', zoomMeetingId: '111 111 1111', formato: 'v2',
  videos: [{ fecha: '2026-11-04', hora: '19:00', zoomMeetingId: '222 222 2222' }],
};
const t = (s) => madridToEpoch(s);

test('enlace del directo sin número: el día 2 va a la sala del día 2, no a la de ayer', () => {
  assert.equal(directoPorHora(L, t('2026-11-03T12:00')), 1);
  assert.equal(directoPorHora(L, t('2026-11-03T18:30')), 1);
  assert.equal(directoPorHora(L, t('2026-11-03T21:00')), 1); // aún en el directo 1
  assert.equal(directoPorHora(L, t('2026-11-04T10:00')), 2); // día 2 por la mañana
  assert.equal(directoPorHora(L, t('2026-11-04T18:55')), 2); // pantalla de espera del día 2
  assert.equal(directoPorHora(L, t('2026-11-04T19:30')), 2); // en el directo 2
  assert.equal(directoPorHora(L, t('2026-11-06T10:00')), 2); // ya pasaron: el último
});

test('enlace del directo: si el vídeo 2 es grabado (sin Zoom), siempre la sala del 1', () => {
  const grabado = { ...L, videos: [{ fecha: '2026-11-04', hora: '19:00' }] };
  assert.equal(directoPorHora(grabado, t('2026-11-04T18:55')), 1);
});
