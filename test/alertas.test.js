import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertasCarrito } from '../public/js/alertas.js';
import { madridToEpoch } from '../public/js/page.js';

const launch = {
  fechaDirecto: '2026-10-20', horaDirecto: '19:00', aperturaCarrito: '2026-10-20T21:00', cierreCarrito: '2026-10-27T23:59', formato: 'webinar',
  objetivos: { ventas: 100 },
  oferta: { entregables: [], bonus: [{ id: 'b', tipo: 'bar_48h', nombre: 'Masterclass' }, { id: 't', tipo: 'bonus', nombre: 'Comunidad' }] },
};

test('alertas del carrito: ritmo, bonus que caduca y cierre', () => {
  const a = alertasCarrito(launch, 10, madridToEpoch('2026-10-22T10:00'));
  assert.ok(a.some((x) => /Ritmo por debajo/.test(x.texto) && x.nivel === 'alta'));
  assert.ok(a.some((x) => /«Masterclass» caduca hoy a las 21:00/.test(x.texto)));
  assert.ok(!a.some((x) => /Comunidad/.test(x.texto)));
  assert.ok(alertasCarrito(launch, 10, madridToEpoch('2026-10-27T10:00')).some((x) => /Hoy cierra el carrito/.test(x.texto)));
  assert.deepEqual(alertasCarrito(launch, 10, madridToEpoch('2026-10-19T10:00')), []); // carrito sin abrir
  assert.ok(!alertasCarrito(launch, 60, madridToEpoch('2026-10-22T10:00')).some((x) => /Ritmo/.test(x.texto))); // va bien
});
