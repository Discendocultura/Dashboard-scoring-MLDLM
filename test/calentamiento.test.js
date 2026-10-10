import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { parsearSecuencia, faltaMensaje, cuerpoSendflow, promptCalentamiento } from '../public/js/calentamiento.js';
import { mensajeAntes } from '../lib/vigia-grupos.js';
import { madridToEpoch } from '../public/js/page.js';

const PEGADO = `Aquí tienes la secuencia:

### 2026-11-03 19:00 | texto | mencionar
Hola grupo 👋
¿Preparadas para mañana?

### 2026-11-04 10:00 | encuesta | varias
¿Qué te preocupa más?
- El sueño
- La lactancia
- Volver al trabajo

### 2026-11-04 20:00 | nota
Archivo: (pon aquí el enlace)
Guion: Hola, soy Sara. Mañana empezamos.

### 2026-11-05 9:30 | video
Archivo: https://assets.cdn.filesafe.space/abc/video.mp4
Guion: Sara en la consulta.
Texto: Mira esto 👇`;

test('calentamiento: lee la respuesta de Claude (texto, encuesta, nota de voz, vídeo)', () => {
  const m = parsearSecuencia(PEGADO);
  assert.deepEqual(m.map((x) => [x.at, x.tipo]), [['2026-11-03T19:00', 'texto'], ['2026-11-04T10:00', 'encuesta'], ['2026-11-04T20:00', 'nota'], ['2026-11-05T09:30', 'video']]);
  assert.equal(m[0].mencionar, true);
  assert.equal(m[0].texto, 'Hola grupo 👋\n¿Preparadas para mañana?');
  assert.deepEqual(m[1].encuesta, { pregunta: '¿Qué te preocupa más?', opciones: ['El sueño', 'La lactancia', 'Volver al trabajo'], multiple: true });
  assert.equal(m[2].url, ''); // «(pon aquí el enlace)» no es un enlace
  assert.match(m[2].guion, /soy Sara/);
  assert.equal(m[3].url, 'https://assets.cdn.filesafe.space/abc/video.mp4');
  assert.equal(m[3].texto, 'Mira esto 👇');
  const ahora = Date.UTC(2026, 9, 10);
  assert.deepEqual(faltaMensaje(m[2], ahora), ['el enlace del archivo']);
  assert.deepEqual(faltaMensaje(m[1], ahora), []);
  assert.deepEqual(faltaMensaje({ ...m[0], at: '2026-10-01T10:00' }, ahora), ['una hora futura']);
});

test('calentamiento: lo que se manda a SendFlow por cada tipo', () => {
  const [texto, encuesta, nota, video] = parsearSecuencia(PEGADO);
  const t = cuerpoSendflow(texto, 'rel1');
  assert.equal(t.type, 'extendedTextMessage');
  assert.equal(t.scheduledTo, new Date(madridToEpoch('2026-11-03T19:00')).toISOString());
  assert.deepEqual(t.options, { mentionAllParticipants: true, mentionAllSkipAdmins: true });
  const e = cuerpoSendflow(encuesta, 'rel1');
  assert.deepEqual([e.type, e.pollName, e.values.length, e.selectableCount], ['pollMessage', '¿Qué te preocupa más?', 3, 0]);
  const n = cuerpoSendflow({ ...nota, url: 'https://x.com/a.ogg' }, 'rel1');
  assert.deepEqual([n.type, n.ptt, n.url], ['audioMessage', true, 'https://x.com/a.ogg']);
  const v = cuerpoSendflow(video, 'rel1');
  assert.deepEqual([v.type, v.caption], ['videoMessage', 'Mira esto 👇']);
});

test('calentamiento: el prompt lleva los datos del lanzamiento y el formato', () => {
  const p = promptCalentamiento({ name: 'Octubre', inicioCaptacion: '2026-10-20', fechaDirecto: '2026-11-04', horaDirecto: '19:00', precioVip: 27, cierreCarrito: '2026-11-10T23:59', precioPrograma: 997, oferta: { entregables: [{ nombre: 'Curso' }], bonus: [{ nombre: 'Sesión grupal' }] } }, { producto: 'Raíces', desde: '2026-10-20', hasta: '2026-11-10', ya: [{ at: '2026-10-25T10:00', tipo: 'texto', texto: 'Bienvenida' }] });
  for (const t of ['skill de copy', 'Raíces', '27 €', '997 €', 'Sesión grupal', '### AAAA-MM-DD HH:MM | encuesta', 'Bienvenida', 'nota']) assert.ok(p.includes(t), t);
});

test('calentamiento: el detector de fuga encuentra el mensaje enviado justo antes', () => {
  const ms = [{ estado: 'programado', at: '2026-11-04T19:00', tipo: 'texto', texto: 'A' }, { estado: 'programado', at: '2026-11-04T20:30', tipo: 'texto', texto: 'B' }, { estado: 'borrador', at: '2026-11-04T20:40', tipo: 'texto' }];
  const desde = madridToEpoch('2026-11-04T20:45');
  assert.equal(mensajeAntes(ms, desde, desde + 30 * 60_000).texto, 'B');
  assert.equal(mensajeAntes(ms, madridToEpoch('2026-11-05T10:00'), madridToEpoch('2026-11-05T10:30')), null);
});

const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
let route;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
});
const call = async (path, { method = 'GET', body, cookie } = {}) => {
  const res = await route(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'text/plain' }, body: body ? JSON.stringify(body) : undefined }), ENV);
  return { status: res.status, data: await res.json().catch(() => null) };
};

test('calentamiento: guardar, programar en SendFlow (solo lo listo), cancelar y votos', async () => {
  const admin = (await route(new Request('http://localhost/api/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password: 'admin' }) }), ENV)).headers.get('set-cookie').split(';')[0];
  const setter = (await route(new Request('http://localhost/api/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password: 'setter' }) }), ENV)).headers.get('set-cookie').split(';')[0];
  const cfg = (await call('/api/config', { cookie: admin })).data.config;
  assert.equal((await call('/api/config', { method: 'POST', cookie: admin, body: { ...cfg, launches: { oct: { name: 'Octubre', registroTag: 'r', sendflowId: 'rel-demo' } } } })).status, 200);
  const futuro = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  const msgs = parsearSecuencia(PEGADO.replace(/2026-11-0\d/g, futuro)).map((m) => ({ ...m, estado: 'borrador' }));
  assert.equal((await call('/api/sendflow', { method: 'POST', cookie: setter, body: { op: 'calentamiento-guardar', l: 'oct', mensajes: msgs } })).status, 403);
  let d = (await call('/api/sendflow', { method: 'POST', cookie: admin, body: { op: 'calentamiento-guardar', l: 'oct', mensajes: msgs } })).data;
  assert.equal(d.mensajes.length, 4);
  d = (await call('/api/sendflow', { method: 'POST', cookie: admin, body: { op: 'programar', l: 'oct', ids: d.mensajes.map((m) => m.id) } })).data;
  assert.equal(d.programados, 3); // la nota de voz no: le falta el enlace
  const prog = d.mensajes.filter((m) => m.estado === 'programado');
  assert.ok(prog.every((m) => m.actionId.startsWith('act-')));
  // Lo programado no se pisa al guardar borradores
  d = (await call('/api/sendflow', { method: 'POST', cookie: admin, body: { op: 'calentamiento-guardar', l: 'oct', mensajes: d.mensajes.map((m) => ({ ...m, texto: 'cambiado', estado: 'borrador' })) } })).data;
  assert.equal(d.mensajes.filter((m) => m.estado === 'programado').length, 3);
  assert.ok(d.mensajes.filter((m) => m.estado === 'programado').every((m) => m.texto !== 'cambiado'));
  // Cancelar uno
  const uno = d.mensajes.find((m) => m.estado === 'programado' && m.tipo === 'texto');
  d = (await call('/api/sendflow', { method: 'POST', cookie: admin, body: { op: 'cancelar', l: 'oct', id: uno.id } })).data;
  assert.equal(d.mensajes.find((m) => m.id === uno.id).estado, 'cancelado');
  // Votos de la encuesta
  const enc = d.mensajes.find((m) => m.tipo === 'encuesta');
  const v = (await call(`/api/sendflow?op=votos&l=oct&id=${enc.id}`, { cookie: admin })).data;
  assert.equal(v.total, 57);
  assert.deepEqual(v.votos.map((x) => x.n), [31, 19, 7]);
  // El setter (permiso carrito) puede verlo
  assert.equal((await call('/api/sendflow?op=calentamiento&l=oct', { cookie: setter })).data.mensajes.length, 4);
});

test('calentamiento: el día del directo, solo recordatorio, temario y enlace de acceso en todos los mensajes', async () => {
  const { faltaEnlaceDirecto } = await import('../public/js/calentamiento.js');
  const directos = [{ nombre: 'El webinar en directo', at: '2026-11-04T19:00', url: 'https://leads-mldlm.pages.dev/directo?l=oct' }];
  const p = promptCalentamiento({ name: 'Octubre', fechaDirecto: '2026-11-04', horaDirecto: '19:00' }, { producto: 'Raíces', directos, temario: '- Por qué se despierta\n- Las 3 rutinas' });
  for (const t of ['EL DÍA DEL DIRECTO', 'ÚNICAMENTE', 'HOY es el día', 'TODOS los mensajes de ese día llevan el enlace', 'https://leads-mldlm.pages.dev/directo?l=oct', 'Las 3 rutinas', 'no se vende']) assert.ok(p.includes(t), t);
  assert.ok(!p.includes('[TEMARIO DE LA MASTERCLASS]'));
  assert.ok(promptCalentamiento({ name: 'X' }, { directos }).includes('[TEMARIO DE LA MASTERCLASS]'));
  // Varios directos (lanzamiento de 3 vídeos)
  assert.ok(promptCalentamiento({ name: 'X' }, { directos: [...directos, { nombre: 'Vídeo 3', at: '2026-11-06T19:00', url: 'https://x/directo?l=oct&v=3' }] }).includes('CADA UNO DE LOS DÍAS DE DIRECTO'));
  // Aviso en los mensajes de ese día sin el enlace
  assert.ok(faltaEnlaceDirecto({ at: '2026-11-04T10:00', tipo: 'texto', texto: '¡Hoy es el día!' }, directos));
  assert.equal(faltaEnlaceDirecto({ at: '2026-11-04T10:00', tipo: 'texto', texto: 'Entra aquí: https://leads-mldlm.pages.dev/directo?l=oct' }, directos), null);
  assert.equal(faltaEnlaceDirecto({ at: '2026-11-03T10:00', tipo: 'texto', texto: 'Mañana' }, directos), null);
  assert.equal(faltaEnlaceDirecto({ at: '2026-11-04T10:00', tipo: 'encuesta' }, directos), null);
});
