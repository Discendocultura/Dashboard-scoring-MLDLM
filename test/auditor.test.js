import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditarLanzamiento, auditarVsl, proximoHito } from '../public/js/auditor.js';

const base = {
  name: 'Oct', registroTag: 'reg-oct', compraTag: 'compra', vipTag: 'vip', compraDateField: 'f',
  inicioCaptacion: '2026-10-01', clase1At: '2026-10-20T09:00', clase2At: '2026-10-22T09:00', fechaDirecto: '2026-10-29', horaDirecto: '19:00', cierreCarrito: '2026-11-03T23:59',
  llamadaUrl: 'https://cal', whatsappUrl: 'https://wa', loginUrl: 'https://l', recursosUrl: 'https://r', clase1Url: 'https://v1', clase2Url: 'https://v2', zoomMeetingId: '123',
  raicesUrl: 'https://p', ventaUrl: 'https://pay', precioPrograma: 900, replayUrl: 'https://g', replayVideoUrl: 'https://gv', vipUrl: 'https://vip', precioVip: 9,
  snapshot: { tags: { vipTag: 'vip', compraTag: 'compra' } },
};
const titulos = (r) => r.map((x) => `${x.nivel}:${x.titulo}`);

test('auditor: lanzamiento completo y a tiempo no da problemas', () => {
  const r = auditarLanzamiento({ launch: base, hoy: '2026-10-05', tareas: [{ id: 't', titulo: 'x', fecha: '2026-10-10', asignado: { tipo: 'rol', rol: 'setter' } }], users: [{ id: 'u', rol: 'setter' }], zoom: true, tagsGhl: ['reg-oct', 'compra', 'vip'] });
  assert.deepEqual(titulos(r), []);
});

test('auditor: la urgencia sube al acercarse el hito y detecta lo repetido y lo vencido', () => {
  const l = { ...base, clase1Url: '', zoomMeetingId: '999', registroTag: 'reg-sep' };
  const otros = [['sep', { name: 'Septiembre', registroTag: 'reg-sep', zoomMeetingId: '999', createdAt: '2026-09-01' }]];
  const lejos = auditarLanzamiento({ launch: l, otros, hoy: '2026-10-01', zoom: true });
  assert.ok(titulos(lejos).includes('aviso:Falta el vídeo de la clase 1')); // a 19 días
  const cerca = auditarLanzamiento({ launch: l, otros, hoy: '2026-10-18', zoom: true });
  assert.ok(titulos(cerca).includes('critico:Falta el vídeo de la clase 1')); // a 2 días
  assert.ok(titulos(cerca).some((t) => t.startsWith('critico:La etiqueta de registro es la misma')));
  assert.ok(titulos(cerca).some((t) => t.includes('El ID de Zoom es el mismo')));
  const tareas = [{ id: 'a', titulo: 'Subir vídeos', fecha: '2026-10-15' }, { id: 'b', titulo: 'Ayer', fecha: '2026-10-17', asignado: { tipo: 'rol', rol: 'tecnico' } }];
  const t = auditarLanzamiento({ launch: base, hoy: '2026-10-18', tareas, zoom: true });
  assert.ok(titulos(t).includes('critico:Tarea vencida: «Subir vídeos»'));
  assert.ok(titulos(t).includes('importante:Tarea vencida: «Ayer»'));
  assert.ok(titulos(t).some((x) => x.startsWith('aviso:1 tarea sin responsable')));
  assert.equal(t[0].nivel, 'critico'); // ordenado por gravedad
  assert.deepEqual(t.find((x) => x.titulo.includes('Subir')).accion, { tipo: 'tarea', id: 'a' });
});

test('auditor: fechas, etiquetas que no existen en GHL y datos', () => {
  const r = auditarLanzamiento({ launch: { ...base, fechaDirecto: '', clase2At: '2026-10-10T09:00' }, hoy: '2026-10-05', tagsGhl: ['compra', 'vip'], leads: [], zoom: true });
  const t = titulos(r);
  assert.ok(t.includes('critico:Falta el día del webinar en directo'));
  assert.ok(t.some((x) => x.startsWith('critico:Fechas descolocadas')));
  assert.ok(t.includes('critico:La etiqueta «reg-oct» todavía no existe en GHL'));
  assert.ok(t.includes('critico:La captación ha empezado y no hay ningún registro'));
  assert.equal(r.find((x) => x.titulo.startsWith('La etiqueta «reg-oct»')).accion.id, 'cfg-registro');
});

test('auditor VSL y próximo hito', () => {
  const r = auditarVsl({ vsl: { registroTag: 'r', compraTag: '', vslVideoUrl: '' }, hoy: '2026-10-05', leads: [] });
  const t = titulos(r);
  assert.ok(t.includes('critico:Falta la etiqueta de compra'));
  assert.ok(t.includes('critico:Falta el vídeo de la VSL'));
  assert.ok(t.includes('critico:No hay ningún registro'));
  assert.equal(proximoHito(base, '2026-10-21').label, 'la clase 2');
});
