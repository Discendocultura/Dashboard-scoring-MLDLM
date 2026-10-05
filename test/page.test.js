import { test } from 'node:test';
import assert from 'node:assert/strict';
import { madridToEpoch, phaseAt, milestones, barFor } from '../public/js/page.js';

const launch = {
  clase1At: '2026-10-22T19:00', clase2At: '2026-10-25T19:00',
  fechaDirecto: '2026-10-29', horaDirecto: '19:00', cierreCarrito: '2026-11-02T23:59',
};
const at = (s) => madridToEpoch(s);

test('hora de España a UTC, también con el cambio de hora', () => {
  assert.equal(new Date(at('2026-10-22T19:00')).toISOString(), '2026-10-22T17:00:00.000Z'); // CEST
  assert.equal(new Date(at('2026-10-29T19:00')).toISOString(), '2026-10-29T18:00:00.000Z'); // CET (tras el 25/10)
  assert.match(new Date(at('2026-10-25T02:30')).toISOString(), /^2026-10-25T0[01]:30/); // hora repetida: cualquiera de las dos
});

test('fases de la página en cada momento', () => {
  const ph = (s) => phaseAt(launch, at(s)).id;
  assert.equal(ph('2026-10-21T10:00'), 'pre_c1');
  assert.equal(ph('2026-10-22T19:00'), 'c1');
  assert.equal(ph('2026-10-26T09:00'), 'c2');
  assert.equal(ph('2026-10-29T08:00'), 'dia_directo');
  assert.equal(ph('2026-10-29T19:00'), 'en_directo');
  assert.equal(ph('2026-10-29T23:59'), 'en_directo');
  assert.equal(ph('2026-10-30T00:00'), 'replay');
  assert.equal(ph('2026-11-03T00:00'), 'cerrado');
});

test('la cuenta atrás apunta al siguiente hito y la grabación se abre a las 00:00 del día siguiente', () => {
  const p = phaseAt(launch, at('2026-10-26T09:00'));
  assert.equal(p.countdownTo, at('2026-10-29T19:00'));
  assert.equal(milestones(launch).replay, at('2026-10-30T00:00'));
  assert.equal(milestones({ ...launch, replayAt: '2026-10-30T10:00' }).replay, at('2026-10-30T10:00'));
});

test('mensajes de la barra: configurado o por defecto', () => {
  assert.match(barFor(launch, 'c1').text, /clase 2 se abre/);
  assert.equal(barFor({ barra: { c1: { text: 'Hola', button: 'whatsapp' } } }, 'c1').button, 'whatsapp');
});

test('añadir al calendario: Google Calendar y .ics con la hora del directo', async () => {
  const { googleCalendarUrl, icsFile } = await import('../public/js/page.js');
  const start = madridToEpoch('2026-10-29T19:00');
  const g = new URL(googleCalendarUrl({ title: 'El Camino', start }));
  assert.equal(g.searchParams.get('dates'), '20261029T180000Z/20261029T210000Z');
  const ics = icsFile({ title: 'El Camino', start, url: 'https://x/directo?l=a', uid: 'a@x' });
  assert.match(ics, /DTSTART:20261029T180000Z/);
  assert.match(ics, /BEGIN:VALARM/);
});
