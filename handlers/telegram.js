// Bot de Telegram de la agencia.
//   POST /api/telegram (de Telegram, con la cabecera X-Telegram-Bot-Api-Secret-Token) → webhook: comandos
//        /start <código> (vincular), /estado, /resumen [cliente], /hoy, /ayuda y botones de clientes.
//   GET  /api/telegram (superadmin) → { configurado, bot, webhook, chats }
//   POST /api/telegram (superadmin) { op: 'conectar' }            → registra el webhook y los comandos del menú
//                                   { op: 'vincular' }            → enlace t.me/<bot>?start=<código> (15 min)
//                                   { op: 'desvincular', chatId } · { op: 'prueba' } → mensaje a los chats vinculados
// Solo responde a chats privados vinculados por un superadmin. El token va en Cloudflare (TELEGRAM_BOT_TOKEN).
import { requireSuperadmin, safeEqual } from '../lib/auth.js';
import { enPrincipal } from '../lib/cliente.js';
import { listClientes } from '../lib/clientes.js';
import { resumenAgencia, resumenDeCliente } from '../lib/agencia.js';
import {
  telegramConfigurado, tg, secretoWebhook, enviarMensaje, leerVinculos, cambiarVinculos, chatAutorizado, chatsActivos, avisarTelegram,
  parsearComando, buscarCliente, textoEstado, textoCliente, textoHoy, AYUDA, COMANDOS,
} from '../lib/telegram.js';
import { json, readBody, errorResponse } from '../lib/http.js';
import { dayInMadrid } from '../public/js/scoring.js';

const VINCULO_MS = 15 * 60_000;
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
const urlDashboard = (request) => `${new URL(request.url).origin}/`;
const botonesClientes = (clientes) => {
  const filas = [];
  for (let i = 0; i < clientes.length; i += 2) filas.push(clientes.slice(i, i + 2).map((c) => ({ text: c.nombre.slice(0, 30), callback_data: `r:${c.id}`.slice(0, 64) })));
  return filas;
};

// ---- Webhook ----
async function resumenUno(chatId, c, request) {
  await tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
  const r = await resumenDeCliente(c);
  await enviarMensaje(chatId, textoCliente(r, { hoy: dayInMadrid(new Date().toISOString()), url: urlDashboard(request) }));
}

async function atender(update, request) {
  const cb = update.callback_query;
  const msg = update.message || cb?.message;
  const chat = msg?.chat;
  if (!chat || chat.type !== 'private') return;
  const chatId = chat.id;
  const texto = cb ? '' : String(update.message?.text || '');
  const { cmd, arg } = parsearComando(texto);

  // Vincular: /start <código> (el enlace que da el dashboard).
  if (cmd === 'start' && arg) {
    const desde = update.message.from || {};
    const v = await cambiarVinculos((v) => {
      const c = v.codigos.find((x) => safeEqual(x.codigo, arg));
      if (!c) return null;
      v.codigos = v.codigos.filter((x) => x !== c);
      v.chats = v.chats.filter((x) => String(x.chatId) !== String(chatId));
      v.chats.push({ chatId, nombre: String(desde.first_name || '').slice(0, 60), usuario: String(desde.username || '').slice(0, 60), uid: c.uid, por: c.por, en: new Date().toISOString() });
      return c;
    }, 'vincular Telegram');
    await enviarMensaje(chatId, v ? `✅ Listo, ${v.por ? `${v.por}` : ''}: este chat ya está vinculado a AlquimIA.\n\n${AYUDA}` : '⛔ Ese enlace no vale o ha caducado (dura 15 minutos). Pide otro en AlquimIA: Agencia → Telegram.');
    return;
  }
  const autorizado = await chatAutorizado(chatId);
  if (!autorizado) {
    if (cb) await tg('answerCallbackQuery', { callback_query_id: cb.id }).catch(() => {});
    await enviarMensaje(chatId, '🔒 Este chat no está vinculado. Vincúlalo desde AlquimIA: Agencia → Telegram → «Vincular mi Telegram».');
    return;
  }
  const url = urlDashboard(request);
  if (cb) {
    await tg('answerCallbackQuery', { callback_query_id: cb.id }).catch(() => {});
    const id = String(cb.data || '').replace(/^r:/, '');
    const c = (await listClientes()).find((x) => x.id === id);
    if (c) await resumenUno(chatId, c, request);
    return;
  }
  if (cmd === 'estado') {
    await tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
    await enviarMensaje(chatId, textoEstado(await resumenAgencia({ maxCalcular: 1, caduca: 6 * 3_600_000 }), { url }));
  } else if (cmd === 'hoy') {
    await enviarMensaje(chatId, textoHoy(await resumenAgencia({ maxCalcular: 0 }), { url }));
  } else if (cmd === 'resumen') {
    const clientes = await listClientes();
    const c = arg ? buscarCliente(clientes, arg) : (clientes.length === 1 ? clientes[0] : null);
    if (c) await resumenUno(chatId, c, request);
    else await enviarMensaje(chatId, arg ? `No encuentro «${arg}». ¿Cuál quieres?` : '¿De qué cliente?', { botones: botonesClientes(clientes) });
  } else {
    // /start sin código, /ayuda, /help o cualquier texto: la ayuda.
    await enviarMensaje(chatId, AYUDA);
  }
}

async function webhook(request, ctx) {
  const secreto = request.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!telegramConfigurado() || !safeEqual(secreto, await secretoWebhook())) return json({ error: 'No autorizado' }, 401);
  let update;
  try { update = await request.json(); } catch { return json({ ok: true }); }
  // Siempre 200 a Telegram (si no, repite el mensaje); lo lento, después de responder.
  const trabajo = enPrincipal(() => atender(update, request)).catch((e) => console.error('Telegram', e.message || e));
  if (ctx?.waitUntil) ctx.waitUntil(trabajo); else await trabajo;
  return json({ ok: true });
}

// ---- Dashboard (superadmin) ----
export async function GET(request) {
  try {
    await requireSuperadmin(request);
    if (!telegramConfigurado()) return json({ configurado: false, chats: [] });
    const [bot, info, chats] = await Promise.all([tg('getMe').catch(() => null), tg('getWebhookInfo').catch(() => null), chatsActivos()]);
    const esperado = `${new URL(request.url).origin}/api/telegram`;
    return json({
      configurado: true, bot: bot?.username || '', webhook: info?.url === esperado, webhookUrl: info?.url || '', error: info?.last_error_message || '',
      chats: chats.map((c) => ({ chatId: String(c.chatId), nombre: c.nombre, usuario: c.usuario, por: c.por, en: c.en })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request, ctx) {
  try {
    if (request.headers.has('x-telegram-bot-api-secret-token')) return await webhook(request, ctx);
    const s = await requireSuperadmin(request);
    const body = await readBody(request);
    if (!telegramConfigurado()) return json({ error: 'Falta TELEGRAM_BOT_TOKEN en Cloudflare (y «Retry deployment»).' }, 400);
    if (body.op === 'conectar') {
      await tg('setWebhook', { url: `${new URL(request.url).origin}/api/telegram`, secret_token: await secretoWebhook(), allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
      await tg('setMyCommands', { commands: COMANDOS, language_code: 'es' }).catch(() => {});
      await tg('setMyCommands', { commands: COMANDOS }).catch(() => {});
      const bot = await tg('getMe');
      return json({ ok: true, bot: bot.username });
    }
    if (body.op === 'vincular') {
      const bot = await tg('getMe');
      const codigo = hex(12);
      await cambiarVinculos((v) => { v.codigos.push({ codigo, hasta: Date.now() + VINCULO_MS, uid: s.uid || '', por: s.user?.nombre || 'Admin' }); }, 'código para vincular Telegram');
      return json({ enlace: `https://t.me/${bot.username}?start=${codigo}`, caduca: VINCULO_MS / 60_000 });
    }
    if (body.op === 'desvincular') {
      const id = String(body.chatId || '');
      await cambiarVinculos((v) => { v.chats = v.chats.filter((c) => String(c.chatId) !== id); }, 'desvincular Telegram');
      return json({ ok: true });
    }
    if (body.op === 'prueba') {
      const n = await avisarTelegram(`✅ Prueba de AlquimIA: los avisos llegan bien.\n\n${AYUDA}`);
      return json({ enviados: n, chats: (await leerVinculos()).chats.length });
    }
    return json({ error: 'Operación no válida' }, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
