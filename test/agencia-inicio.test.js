// Inicio de la agencia (superadmin): semáforo, totales, urgentes, agenda y equipo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saludCliente, ordenSalud, totalesAgencia, urgentesAgencia, agendaAgencia, equipoAgencia } from '../public/js/agencia-inicio.js';

const base = (id, extra = {}) => ({ id, nombre: id, conectado: true, vsls: [], alta: { hechos: 9, total: 9, pasos: [] }, equipo: { porQuien: {}, lista: [] }, agenda: [], ...extra });
const lanz = (x = {}) => ({ nombre: 'L', registros: 100, ventas: 2, vip: 5, inversion: 1000, facturacion: 3000, roas: 3, objetivos: {}, auditor: { critico: 0, importante: 0, criticos: [] }, vencidas: 0, ...x });

test('semáforo de cada cliente', () => {
  assert.equal(saludCliente(base('a', { lanzamiento: lanz() })).nivel, 'verde');
  assert.equal(saludCliente(base('a', { pendiente: true })).nivel, 'gris');
  assert.equal(saludCliente(base('a', { conectado: false })).nivel, 'rojo');
  assert.equal(saludCliente(base('a', { lanzamiento: lanz({ auditor: { critico: 1, importante: 0, criticos: ['x'] } }) })).nivel, 'rojo');
  assert.equal(saludCliente(base('a', { lanzamiento: lanz({ vencidas: 2 }) })).nivel, 'ambar');
  // ROAS frente al objetivo (facturación ÷ inversión objetivo = 4): 3 → ámbar; 2 → rojo.
  assert.equal(saludCliente(base('a', { lanzamiento: lanz({ objetivos: { facturacion: 4000, inversion: 1000 } }) })).nivel, 'ambar');
  assert.equal(saludCliente(base('a', { lanzamiento: lanz({ roas: 2, objetivos: { facturacion: 4000, inversion: 1000 } }) })).nivel, 'rojo');
  const orden = [base('v', { lanzamiento: lanz() }), base('r', { conectado: false }), base('a', { lanzamiento: lanz({ vencidas: 1 }) })].sort(ordenSalud).map((c) => c.id);
  assert.deepEqual(orden, ['r', 'a', 'v']);
});

test('totales, urgentes, agenda y equipo de la agencia', () => {
  const cl = [
    base('a', { color: '#f00', lanzamiento: lanz({ auditor: { critico: 1, importante: 2, criticos: ['Falta Zoom'] } }), agenda: [{ dia: '2026-10-13', titulo: 'Directo', hora: '19:00' }, { dia: '2026-12-01', titulo: 'Lejos' }],
      equipo: { porQuien: { Ana: 2 }, lista: [{ quien: 'Ana', dias: 5, titulo: 'Anuncios', nombre: 'L' }] } }),
    base('b', { lanzamiento: lanz({ facturacion: 1000, inversion: 1000, roas: 1 }), equipo: { porQuien: { Ana: 1, Luis: 1 }, lista: [] } }),
  ];
  const t = totalesAgencia(cl);
  assert.equal(t.facturacion, 4000); assert.equal(t.inversion, 2000); assert.equal(t.roas, 2); assert.equal(t.enCurso, 2);
  assert.deepEqual(t.salud, { rojo: 1, ambar: 0, verde: 1, gris: 0 });
  const u = urgentesAgencia(cl);
  assert.equal(u[0].nivel, 'critico'); assert.equal(u[0].texto, 'Falta Zoom');
  assert.ok(u.some((x) => x.texto.startsWith('Tarea vencida hace 5 días') && x.nivel === 'importante'));
  const ag = agendaAgencia(cl, '2026-10-12', 14);
  assert.equal(ag.length, 14);
  assert.equal(ag[1].eventos[0].titulo, 'Directo');
  assert.equal(ag.flatMap((d) => d.eventos).length, 1); // lo de diciembre no entra
  assert.deepEqual(equipoAgencia(cl).map((x) => [x.quien, x.n]), [['Ana', 3], ['Luis', 1]]);
});
