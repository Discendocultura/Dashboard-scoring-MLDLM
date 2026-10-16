import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventoDeTarea, enlaceCalendario, icsDeEvento, calendarioValido } from '../public/js/mi-calendario.js';
import { sanitizeConfigTableros } from '../public/js/tableros.js';

const T = { titulo: 'Revisar emails', clienteNombre: 'Raíces', fecha: '2026-10-20', notasTexto: 'Mirar asuntos' };

test('mi calendario: evento de una tarea (todo el día o con hora)', () => {
  const ev = eventoDeTarea(T, { url: 'https://x/#operativa' });
  assert.equal(ev.titulo, 'Revisar emails · Raíces');
  assert.equal(ev.dia, '2026-10-20');
  assert.equal(ev.hora, '');
  assert.match(ev.notas, /Mirar asuntos/);
  assert.match(ev.notas, /https:\/\/x\/#operativa/);
  assert.equal(eventoDeTarea({ titulo: 'Sin fecha' }, { hoy: '2026-10-16' }).dia, '2026-10-16', 'sin fecha: hoy');
  assert.equal(eventoDeTarea(T, { hora: '25:x' }).hora, '');
});

test('mi calendario: enlaces de Google y Outlook y archivo .ics', () => {
  const g = new URL(enlaceCalendario('google', eventoDeTarea(T)));
  assert.equal(g.hostname, 'calendar.google.com');
  assert.equal(g.searchParams.get('dates'), '20261020/20261021');
  assert.equal(g.searchParams.get('text'), 'Revisar emails · Raíces');
  const gh = new URL(enlaceCalendario('google', eventoDeTarea(T, { hora: '10:30' })));
  assert.equal(gh.searchParams.get('dates'), '20261020T083000Z/20261020T093000Z', '10:30 en Madrid (verano) = 08:30 UTC');
  const o = new URL(enlaceCalendario('outlook', eventoDeTarea(T)));
  assert.equal(o.searchParams.get('allday'), 'true');
  assert.equal(o.searchParams.get('startdt'), '2026-10-20');
  assert.equal(enlaceCalendario('apple', eventoDeTarea(T)), null);
  const ics = icsDeEvento(eventoDeTarea(T, { hora: '10:30' }), 'op-1@x');
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /DTSTART:20261020T083000Z/);
  assert.match(ics, /SUMMARY:Revisar emails · Raíces/);
});

test('mi calendario: se guarda por persona y solo valores válidos', () => {
  assert.ok(calendarioValido('google') && !calendarioValido('yahoo'));
  const c = sanitizeConfigTableros({ calendario: { u1: 'google', u2: 'yahoo', 'mal id!': 'apple' } });
  assert.deepEqual(c.calendario, { u1: 'google' });
});
