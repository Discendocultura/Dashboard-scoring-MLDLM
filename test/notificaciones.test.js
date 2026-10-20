import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quiereNotif, sanitizePrefsNotif, tiposPara, TIPOS_NOTIF } from '../public/js/notificaciones.js';
import { avisosDeCambio } from '../lib/operativa.js';
import { limpiarAviso } from '../lib/buzon.js';

test('notificaciones: por defecto, menciones a la campanita y por email', () => {
  assert.equal(quiereNotif({}, 'mencion', 'campana'), true);
  assert.equal(quiereNotif({}, 'mencion', 'email'), true);
  assert.equal(quiereNotif({}, 'comentario', 'email'), false);
  assert.equal(quiereNotif({}, 'vencida', 'email'), false); // ese canal no existe para ese aviso
  assert.equal(quiereNotif({ mencion: { email: false } }, 'mencion', 'email'), false);
  assert.equal(quiereNotif({ mencion: { email: false } }, 'mencion', 'campana'), true);
});

test('notificaciones: preferencias limpias y avisos según quién es', () => {
  assert.deepEqual(sanitizePrefsNotif({ mencion: { email: false, sms: true }, raro: { campana: true }, vencida: { email: true, campana: 'no' } }), { mencion: { email: false } });
  const todos = tiposPara({}).map((t) => t.id);
  assert.ok(todos.includes('mencion') && !todos.includes('atascado') && !todos.includes('equipo'));
  assert.ok(tiposPara({ agencia: true }).some((t) => t.id === 'resumen-dia'));
  assert.ok(TIPOS_NOTIF.filter((t) => t.sugerida).length >= 3);
});

test('avisosDeCambio: terminada, bloqueada, fecha y comentario', () => {
  const previo = { hecha: false, fecha: '2026-10-20', bloqueo: '', asignado: 'u2', creadaPor: 'Ana' };
  const t = { titulo: 'X', hecha: true, fecha: '2026-10-20', asignado: { tipo: 'persona', id: 'u2' }, comentarios: [] };
  assert.deepEqual(avisosDeCambio('estado', previo, t).map((a) => a.tipo), ['completada']);
  assert.deepEqual(avisosDeCambio('bloqueo', previo, { ...t, hecha: false, bloqueo: 'Falta el logo' }).map((a) => [a.tipo, a.texto]), [['bloqueada', 'Falta el logo']]);
  assert.deepEqual(avisosDeCambio('fecha', previo, { ...t, hecha: false, fecha: '2026-10-25' }).map((a) => a.tipo), ['fecha']);
  const com = { ...t, hecha: false, comentarios: [{ texto: 'Hola @[Bea](#persona:u3)' }] };
  assert.deepEqual(avisosDeCambio('comentar', previo, com, { uid: 'u1' }).map((a) => [a.tipo, a.texto]), [['comentario', 'Hola @Bea']]);
  assert.deepEqual(avisosDeCambio('comentar', previo, com, { uid: 'u1', mencionados: ['u2'] }), []); // ya le llega la mención
  assert.deepEqual(avisosDeCambio('comentar', previo, com, { uid: 'u2' }), []); // su propio comentario
});

test('buzón: el aviso se guarda recortado y con su enlace', () => {
  const a = limpiarAviso({ tipo: 'mencion', por: 'Ana', titulo: 'T'.repeat(300), texto: 'hola', ir: { tipo: 'raro', cliente: 'c', code: '_agencia', id: 'ta1' } });
  assert.equal(a.titulo.length, 200);
  assert.equal(a.ir.tipo, 'tarea');
  assert.ok(a.id && a.en);
});
