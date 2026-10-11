// Bot de Telegram: textos, comandos, vinculación segura y webhook.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { parsearComando, buscarCliente, textoEstado, textoCliente, textoHoy, recortar } from '../lib/telegram.js';

const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
let route;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
});
async function call(path, { method = 'GET', body, cookie, headers = {} } = {}) {
  const res = await route(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'text/plain', ...headers }, body: body ? JSON.stringify(body) : undefined }), ENV);
  return { status: res.status, data: await res.json().catch(() => null), res };
}
const login = async (password) => (await call('/api/login', { method: 'POST', body: { password } })).res.headers.get('set-cookie').split(';')[0];

test('comandos y búsqueda de cliente', () => {
  assert.deepEqual(parsearComando('/resumen@EstelabsBot clínica sol'), { cmd: 'resumen', arg: 'clínica sol' });
  assert.deepEqual(parsearComando('/estado'), { cmd: 'estado', arg: '' });
  assert.deepEqual(parsearComando('hola'), { cmd: '', arg: 'hola' });
  const cl = [{ id: 'mldlm', nombre: 'Me lo dijo la matrona' }, { id: 'clinica-sol', nombre: 'Clínica Sol' }];
  assert.equal(buscarCliente(cl, 'clinica sol').id, 'clinica-sol');
  assert.equal(buscarCliente(cl, 'matrona').id, 'mldlm');
  assert.equal(buscarCliente(cl, 'MLDLM').id, 'mldlm');
  assert.equal(buscarCliente(cl, 'zzz'), null);
  assert.ok(recortar('x\n'.repeat(5000)).length <= 4000);
});

test('textos: estado, detalle de un cliente y hoy (escapados para Telegram)', () => {
  const r = {
    hoy: '2026-11-17',
    clientes: [
      { id: 'mldlm', nombre: 'Me lo dijo <la> matrona', principal: true, conectado: true, lanzamiento: { nombre: 'Noviembre', registros: 1500, ventas: 30, roas: 3.2, proximoHito: { label: 'Webinar en directo', dia: '2026-11-17' }, auditor: { critico: 2, criticos: ['Falta el Zoom'] }, vencidas: 1, objetivos: { ventas: 40 } }, vsls: [] },
      { id: 'clinica-sol', nombre: 'Clínica Sol', conectado: true, lanzamiento: { nombre: 'Dic', registros: 10, ventas: 0, proximoHito: { label: 'Apertura', dia: '2026-11-18' }, auditor: { critico: 0 }, vencidas: 0 }, vsls: [] },
      { id: 'nuevo', nombre: 'Nuevo', pendiente: true },
    ],
  };
  const e = textoEstado(r, { url: 'https://dash.example/' });
  assert.match(e, /🔴 2 críticos en total/);
  assert.match(e, /&lt;la&gt;/);
  assert.ok(e.indexOf('matrona') < e.indexOf('Clínica Sol')); // primero el que tiene críticos
  assert.match(e, /Webinar en directo HOY/);
  assert.match(e, /\?c=clinica-sol/);
  const c = textoCliente(r.clientes[0], { hoy: r.hoy });
  assert.match(c, /Ventas: 30 \/ 40 \(75 %\)/);
  assert.match(c, /Falta el Zoom/);
  const h = textoHoy(r);
  assert.match(h, /<b>Hoy<\/b>\n• <b>Me lo dijo &lt;la&gt; matrona<\/b>: Webinar en directo/);
  assert.match(h, /<b>Mañana<\/b>\n• <b>Clínica Sol<\/b>: Apertura/);
});

test('conectar, vincular con código de un solo uso y responder solo a chats vinculados', async () => {
  const admin = await login('admin');
  const { telegramEnviados } = await import('../lib/mock.js');
  const { secretoWebhook } = await import('../lib/telegram.js');
  const ultimo = () => telegramEnviados.filter((m) => m.metodo === 'sendMessage').at(-1);
  // Solo superadmin
  const setter = await login('setter');
  assert.equal((await call('/api/telegram', { cookie: setter })).status, 403);
  const c = await call('/api/telegram', { method: 'POST', cookie: admin, body: { op: 'conectar' } });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  const hook = telegramEnviados.find((m) => m.metodo === 'setWebhook');
  assert.equal(hook.body.url, 'http://localhost/api/telegram');
  assert.equal(hook.body.secret_token, await secretoWebhook());
  const g = await call('/api/telegram', { cookie: admin });
  assert.equal(g.data.webhook, true);

  const secreto = await secretoWebhook();
  const update = (text, chatId = 555, extra = {}) => call('/api/telegram', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secreto }, body: { update_id: 1, message: { chat: { id: chatId, type: 'private' }, from: { first_name: 'Quique', username: 'quique' }, text }, ...extra } });
  // Secreto malo: fuera.
  assert.equal((await call('/api/telegram', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'malo' }, body: {} })).status, 401);
  // Sin vincular: no da datos.
  assert.equal((await update('/estado')).status, 200);
  assert.match(ultimo().body.text, /no está vinculado/);
  // Código inventado: no.
  await update('/start abc123');
  assert.match(ultimo().body.text, /no vale o ha caducado/);
  // Vincular con el código del dashboard.
  const v = await call('/api/telegram', { method: 'POST', cookie: admin, body: { op: 'vincular' } });
  const codigo = v.data.enlace.split('start=')[1];
  assert.match(v.data.enlace, /^https:\/\/t\.me\/EstelabsPruebaBot\?start=[0-9a-f]{24}$/);
  await update(`/start ${codigo}`);
  assert.match(ultimo().body.text, /vinculado/);
  // De un solo uso.
  await update(`/start ${codigo}`, 777);
  assert.match(ultimo().body.text, /no vale o ha caducado/);
  // Comandos
  await update('/estado');
  assert.match(ultimo().body.text, /Estado de los clientes/);
  assert.equal(ultimo().body.chat_id, 555);
  await update('/hoy');
  assert.match(ultimo().body.text, /<b>Hoy, /);
  await update('/resumen zzz');
  assert.ok(ultimo().body.reply_markup.inline_keyboard[0][0].callback_data.startsWith('r:'));
  await call('/api/telegram', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secreto }, body: { update_id: 2, callback_query: { id: 'cb1', data: 'r:mldlm', message: { chat: { id: 555, type: 'private' } } } } });
  assert.match(ultimo().body.text, /📈 <b>Me lo dijo la matrona<\/b>/);
  // Grupos: ni caso.
  const antes = telegramEnviados.length;
  await call('/api/telegram', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secreto }, body: { message: { chat: { id: -100, type: 'group' }, text: '/estado' } } });
  assert.equal(telegramEnviados.length, antes);
  // Prueba y resumen de la mañana por Telegram.
  assert.equal((await call('/api/telegram', { method: 'POST', cookie: admin, body: { op: 'prueba' } })).data.enviados, 1);
  const g2 = await call('/api/telegram', { cookie: admin });
  assert.equal(g2.data.chats.length, 1);
  assert.equal(g2.data.chats[0].nombre, 'Quique');
  // Desvincular
  await call('/api/telegram', { method: 'POST', cookie: admin, body: { op: 'desvincular', chatId: '555' } });
  await update('/estado');
  assert.match(ultimo().body.text, /no está vinculado/);
});
