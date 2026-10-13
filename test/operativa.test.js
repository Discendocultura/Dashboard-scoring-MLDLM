import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoOp, agruparPorFecha, resumenProyecto, cargaPorPersona, asignadaA } from '../public/js/operativa.js';
import { visiblesPara, ponerEstado, camposAgencia } from '../lib/operativa.js';

const hoy = '2026-10-13';
const T = [
  { id: '1', cliente: 'mldlm', titulo: 'Vencida de Ana', fecha: '2026-10-10', asignado: { tipo: 'persona', id: 'ana' } },
  { id: '2', cliente: 'mldlm', titulo: 'Hoy, rol técnico', fecha: hoy, asignado: { tipo: 'rol', rol: 'tecnico' } },
  { id: '3', cliente: 'discendo', titulo: 'De Luis bloqueada', fecha: '2026-10-15', estado: 'bloqueado', bloqueo: 'esperando', asignado: { tipo: 'persona', id: 'luis' } },
  { id: '4', cliente: '_agencia', titulo: 'Facturas', fecha: '', asignado: { tipo: 'persona', id: 'ana' } },
  { id: '5', cliente: 'mldlm', titulo: 'Hecha', hecha: true, asignado: { tipo: 'persona', id: 'ana' } },
];

test('operativa: cada persona ve solo lo suyo (a su nombre o a su rol en ese cliente); el superadmin, todo', () => {
  const ana = { superadmin: false, user: { id: 'ana', accesos: { mldlm: 'tecnico' } } };
  assert.deepEqual(visiblesPara(T, ana).map((t) => t.id), ['1', '2', '4', '5']);
  const luis = { superadmin: false, user: { id: 'luis', accesos: { discendo: 'equipo' } } };
  assert.deepEqual(visiblesPara(T, luis).map((t) => t.id), ['3']);
  assert.equal(visiblesPara(T, { superadmin: true }).length, 5);
  assert.equal(asignadaA(T[1], 'ana', ''), false); // por rol solo con el rol de ese cliente
});

test('operativa: estados, «Mi día» por fecha, semáforo del proyecto y carga por persona', () => {
  assert.equal(estadoOp({ hecha: true, estado: 'en-curso' }), 'hecha');
  assert.equal(estadoOp({ estado: 'revision' }), 'revision');
  assert.equal(estadoOp({ estado: 'raro' }), 'pendiente');
  const g = agruparPorFecha(T, hoy);
  assert.deepEqual([g.vencidas.length, g.hoy.length, g.semana.length, g.sinFecha.length], [1, 1, 1, 1]);
  assert.equal(resumenProyecto(T.filter((t) => t.cliente === 'discendo'), hoy).semaforo, 'bloqueado');
  assert.equal(resumenProyecto(T.filter((t) => t.cliente === 'mldlm'), hoy).semaforo, 'retraso');
  assert.equal(resumenProyecto([], hoy).semaforo, 'vacio');
  assert.deepEqual(cargaPorPersona(T, hoy).map((x) => [x.uid, x.abiertas, x.vencidas]), [['ana', 2, 1], ['luis', 1, 0]]);
});

test('operativa: «Bloqueado» pide motivo; «Hecho» apunta quién y cuándo; tareas de agencia con título', () => {
  const t = { titulo: 'x' };
  assert.throws(() => ponerEstado(t, 'bloqueado', { por: 'Ana' }), /por qué/);
  ponerEstado(t, 'bloqueado', { por: 'Ana', bloqueo: 'falta el vídeo' });
  assert.equal(t.bloqueo, 'falta el vídeo');
  ponerEstado(t, 'hecha', { por: 'Ana' });
  assert.ok(t.hecha && t.hechaPor === 'Ana' && t.hechaEn && !t.bloqueo);
  assert.throws(() => ponerEstado(t, 'otro', { por: 'Ana' }), /no válido/);
  assert.throws(() => camposAgencia({ titulo: '  ' }), /título/);
  assert.deepEqual(camposAgencia({ titulo: 'Facturas', fecha: 'mal', asignado: { tipo: 'persona', id: 'ana' } }).asignado, { tipo: 'persona', id: 'ana' });
});
