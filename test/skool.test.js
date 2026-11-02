import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miembrosDeCsv, ventaSkool, juntarSkool, resumenSkool, tagAlumno, precioSkool } from '../public/js/skool.js';

test('Skool: CSV de miembros (inglés) → miembros con nivel, precio, intervalo y LTV', () => {
  const csv = 'FirstName,LastName,Email,JoinedDate,Tier,Price,LTV\n'
    + 'Ana,López,ANA@x.com,2026-10-16 10:00:00,Premium,$14/month,$28\n'
    + 'Eva,Ruiz,eva@x.com,10/17/2026,VIP,$140/year,$140\n'
    + 'Eva,Ruiz,eva@x.com,10/17/2026,VIP,$140/year,$140\n'
    + 'Sin,Email,,2026-10-16,Premium,$14/month,$14\n';
  const r = miembrosDeCsv(csv);
  assert.equal(r.miembros.length, 2);
  const [ana, eva] = r.miembros;
  assert.equal(ana.email, 'ana@x.com');
  assert.equal(ana.nombre, 'Ana López');
  assert.deepEqual([ana.nivel, ana.precio, ana.intervalo, ana.ltv, ana.moneda], ['Premium', 14, 'mes', 28, 'USD']);
  assert.deepEqual([eva.nivel, eva.precio, eva.intervalo], ['VIP', 140, 'año']);
  assert.equal(new Date(eva.fecha).getUTCDate(), 17);
});

test('Skool: cabeceras en español y precios en euros', () => {
  const r = miembrosDeCsv('Nombre;Correo electrónico;Se unió;Nivel;Precio;Valor de por vida\nLuz;luz@x.com;16/10/2026;Estándar;14,00 €/mes;14,00 €\n');
  assert.deepEqual([r.miembros[0].nivel, r.miembros[0].precio, r.miembros[0].ltv, r.miembros[0].moneda], ['Estándar', 14, 14, 'EUR']);
  assert.deepEqual(precioSkool('$14/mes'), { importe: 14, intervalo: 'mes', moneda: 'USD' });
});

test('Skool: venta en euros con el cambio, sustitución al reimportar, reparto por nivel y etiqueta', () => {
  const f = Date.parse('2026-10-16T12:00:00Z');
  const a = ventaSkool({ email: 'a@x.com', fecha: f, nivel: 'Premium', precio: 14, intervalo: 'mes', ltv: 28, moneda: 'USD' }, { cambio: 0.9 });
  assert.deepEqual([a.fuente, a.importe, a.precio, a.producto, a.plan, a.moneda], ['skool', 25.2, 12.6, 'Skool · Premium', 'Premium', 'EUR']);
  const b = ventaSkool({ email: 'b@x.com', fecha: f, nivel: 'VIP', precio: 120, intervalo: 'año', ltv: null, moneda: 'EUR' });
  assert.equal(b.importe, 120); // sin LTV, su precio
  assert.equal(ventaSkool({ email: 'mal', fecha: f }), null);
  const j1 = juntarSkool([], [a, b]);
  const j2 = juntarSkool(j1.lista, [{ ...a, importe: 37.8, ltv: 37.8 }]);
  assert.deepEqual([j2.nuevos, j2.actualizados, j2.lista.length], [0, 1, 2]);
  const r = resumenSkool(j2.lista, { desde: f - 1, hasta: f + 1, emails: new Set(['a@x.com']) });
  assert.equal(r.total, 2);
  assert.equal(r.cobrado, 157.8);
  assert.equal(r.mrr, 22.6); // 12,6 al mes + 120 / 12
  assert.equal(r.registrados, 1);
  assert.equal(r.sinLtv, 1);
  assert.equal(resumenSkool(j2.lista, { desde: f + 10 }).total, 0);
  assert.equal(tagAlumno('alumno-claves', 'Premium'), 'alumno-claves-premium');
  assert.equal(tagAlumno('Alumno Claves', 'Estándar VIP'), 'alumno-claves-estandar-vip');
});
