// Pestaña Carrito: un día por cada día del carrito, con sus hitos automáticos y la estrategia a mano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diasCarrito, sanitizeCarritoNotas } from '../public/js/carrito.js';
import { sanitizeConfig } from '../lib/config-store.js';

const L = {
  fechaDirecto: '2026-11-02', horaDirecto: '19:00', aperturaCarrito: '2026-11-02T21:00', cierreCarrito: '2026-11-08T23:59',
  oferta: { bonus: [
    { id: 'b1', tipo: 'bar_48h', nombre: 'Guía', objetivo: 'acelera' },
    { id: 'b2', tipo: 'bar_24h', nombre: 'Sesión', hasta: '2026-11-04T00:00' },
    { id: 'b3', tipo: 'bonus', nombre: 'Comunidad' },
  ], garantia: { dias15: true } },
  ventaBarra: { activa: true, tramos: [{ texto: 'Llévate la guía {cuenta}', hasta: '2026-11-04T21:00' }, { texto: 'Último día para entrar', hasta: '2026-11-08T23:59', conBoton: true }] },
  carritoNotas: { '2026-11-05': 'Email de testimonios' },
};

test('carrito: días de la apertura al cierre con hitos de fechas, bonus y barra de venta', () => {
  const r = diasCarrito(L);
  assert.deepEqual(r.faltan, []);
  assert.equal(r.garantia, 'Garantía de 15 días');
  assert.deepEqual(r.dias.map((d) => d.day), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  assert.deepEqual(r.dias.map((d) => d.etiqueta), ['Apertura', '', '', '', '', 'Penúltimo día', 'Último día']);
  const txt = (i) => r.dias[i].auto.map((a) => a.texto).join(' | ');
  assert.match(txt(0), /Abre el carrito \(21:00\)/);
  assert.match(txt(0), /Barra de la página de venta: «Llévate la guía ⏱» \(solo texto\)/);
  assert.match(txt(1), /Último día del Bonus de acción rápida 24 h: Sesión \(acaba a las 23:59\)/); // acaba a las 00:00 del día 4
  assert.match(txt(2), /Último día del Bonus de acción rápida 48 h: Guía \(acaba a las 21:00\) · 🚀 Acelera el resultado/);
  assert.match(txt(2), /Barra de la página de venta: «Último día para entrar»$/);
  assert.equal(txt(3), 'Bonus activos: Comunidad');
  assert.equal(r.dias[3].nota, 'Email de testimonios');
  assert.match(txt(6), /Cierre del carrito \(23:59\)/);
  assert.doesNotMatch(r.dias.map((d) => d.auto.map((a) => a.texto).join()).join(), /Último día del Bonus: Comunidad/); // el de todo el carrito lo dice el cierre
});

test('carrito: sin fechas dice qué falta; notas saneadas y guardadas en la configuración', () => {
  assert.deepEqual(diasCarrito({}).faltan, ['la apertura del carrito (o la fecha y hora del directo)', 'el cierre del carrito']);
  assert.deepEqual(diasCarrito({ ...L, cierreCarrito: '' }).dias, []);
  assert.deepEqual(sanitizeCarritoNotas({ '2026-11-05': '  hola ', mal: 'x', '2026-11-06': '   ' }), { '2026-11-05': 'hola' });
  const cfg = sanitizeConfig({ launches: { 'nov-26': { name: 'Nov', registroTag: 'r', carritoNotas: { '2026-11-05': 'Email' } } } });
  assert.deepEqual(cfg.launches['nov-26'].carritoNotas, { '2026-11-05': 'Email' });
});
