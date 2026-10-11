// Bot de Telegram de la agencia: avisos y resúmenes en el móvil.
//   · Se crea con @BotFather y su token va en Cloudflare (TELEGRAM_BOT_TOKEN), nunca en el código ni en un chat.
//   · Telegram llama a POST /api/telegram (webhook) con la cabecera secreta que le damos al conectarlo.
//   · Solo responde a los chats vinculados desde el dashboard (Agencia → Telegram) por un superadmin.
// Los chats vinculados son comunes a todos los clientes (lsd_telegram).
import { env } from './env.js';
import * as mock from './mock.js';
import { signToken } from './auth.js';
import { enPrincipal } from './cliente.js';
import { leerJSON, guardarJSON, reintentando } from './store.js';
import { listUsersRaw } from './users.js';
import { escapeHtml } from './http.js';

const useMock = () => env.GHL_MOCK === '1';
const token = () => String(env.TELEGRAM_BOT_TOKEN || '').trim();
export const telegramConfigurado = () => useMock() || /^\d+:[\w-]{20,}$/.test(token());

export async function tg(metodo, body = {}) {
  if (useMock()) return mock.telegram(metodo, body);
  const res = await fetch(`https://api.telegram.org/bot${token()}/${metodo}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    const err = new Error(`Telegram ${metodo}: ${data.description || res.status}`);
    err.status = 502;
    err.publicMessage = data.error_code === 401 ? 'Telegram no reconoce el token: revisa TELEGRAM_BOT_TOKEN en Cloudflare (y haz «Retry deployment»).' : `Telegram: ${data.description || 'no responde'}`;
    throw err;
  }
  return data.result;
}

// Cabecera secreta del webhook (sale de SESSION_SECRET: no hay que configurar nada más).
export const secretoWebhook = async () => (await signToken('telegram-webhook')).split('.').pop();

// Un mensaje (HTML de Telegram), cortado al máximo que admite. botones: [[{ text, callback_data | url }]]
export const LIMITE = 4000;
export function recortar(texto, max = LIMITE) {
  const t = String(texto || '');
  if (t.length <= max) return t;
  const corte = t.lastIndexOf('\n', max - 20);
  return `${t.slice(0, corte > max / 2 ? corte : max - 20)}\n…`;
}
export const enviarMensaje = (chatId, texto, { botones = null } = {}) => tg('sendMessage', {
  chat_id: chatId, text: recortar(texto), parse_mode: 'HTML', disable_web_page_preview: true,
  ...(botones ? { reply_markup: { inline_keyboard: botones } } : {}),
});

// ---- Chats vinculados ----
const CLAVE = 'lsd_telegram';
export const leerVinculos = () => enPrincipal(() => leerJSON(CLAVE, () => ({ chats: [], codigos: [] })));
export const cambiarVinculos = (fn, motivo) => enPrincipal(() => reintentando(async () => {
  const v = await leerJSON(CLAVE, () => ({ chats: [], codigos: [] }));
  v.chats ||= [];
  v.codigos = (v.codigos || []).filter((c) => c.hasta > Date.now());
  const r = await fn(v);
  await guardarJSON(CLAVE, v, { motivo });
  return r;
}));

// Un chat vale si quien lo vinculó sigue siendo superadmin activo (o fue con la contraseña general de admin).
export async function chatsActivos() {
  const [v, users] = await Promise.all([leerVinculos(), enPrincipal(() => listUsersRaw())]);
  return (v.chats || []).filter((c) => !c.uid || users.some((u) => u.id === c.uid && u.superadmin && u.activo !== false));
}
export async function chatAutorizado(chatId) {
  return (await chatsActivos()).find((c) => String(c.chatId) === String(chatId)) || null;
}

// A todos los chats vinculados (los fallos no paran nada: es un aviso más). → nº de chats a los que llegó.
export async function avisarTelegram(texto, opts) {
  if (!telegramConfigurado()) return 0;
  let n = 0;
  try {
    for (const c of await chatsActivos()) {
      try { await enviarMensaje(c.chatId, texto, opts); n++; } catch (e) { console.error('Aviso por Telegram', e.message); }
    }
  } catch (e) { console.error('Aviso por Telegram', e.message); }
  return n;
}

// ---- Comandos ----
// «/resumen@MiBot clinica sol» → { cmd: 'resumen', arg: 'clinica sol' }; texto sin «/» → { cmd: '', arg: texto }
export function parsearComando(texto) {
  const m = String(texto || '').trim().match(/^\/([a-zA-Z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
  return m ? { cmd: m[1].toLowerCase(), arg: (m[2] || '').trim() } : { cmd: '', arg: String(texto || '').trim() };
}

const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// El cliente que se pide por su código o por su nombre (o el principio de cualquiera de los dos).
export function buscarCliente(clientes, texto) {
  const q = sinTildes(texto).replace(/\s+/g, ' ');
  if (!q) return null;
  const qId = q.replace(/\s+/g, '-');
  return clientes.find((c) => c.id === qId || sinTildes(c.nombre) === q)
    || clientes.find((c) => c.id.startsWith(qId) || sinTildes(c.nombre).startsWith(q))
    || clientes.find((c) => sinTildes(c.nombre).includes(q))
    || null;
}

// ---- Textos ----
const eur = (n) => (n == null ? '–' : `${Math.round(n).toLocaleString('es-ES')} €`);
const num = (n) => (n == null ? '–' : Number(n).toLocaleString('es-ES'));
const fechaCorta = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(/\./g, '') : '');
const diasHasta = (d, hoy) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000);
function cuando(d, hoy) {
  const n = diasHasta(d, hoy);
  return n === 0 ? 'HOY' : n === 1 ? 'mañana' : n > 1 && n < 7 ? `en ${n} días (${fechaCorta(d)})` : fechaCorta(d);
}
const h = escapeHtml;
const urlCliente = (c, url) => (url ? `${url}${c.principal ? '' : `?c=${encodeURIComponent(c.id)}`}` : '');
const criticosDe = (c) => (c.lanzamiento?.auditor?.critico || 0) + (c.vsls || []).reduce((t, v) => t + (v.auditor?.critico || 0), 0);
const vencidasDe = (c) => (c.lanzamiento?.vencidas || 0) + (c.vsls || []).reduce((t, v) => t + (v.vencidas || 0), 0);
function antiguedad(iso, ahora) {
  if (!iso) return '';
  const min = Math.round((ahora - Date.parse(iso)) / 60_000);
  return min < 2 ? 'ahora' : min < 60 ? `hace ${min} min` : min < 48 * 60 ? `hace ${Math.round(min / 60)} h` : `hace ${Math.round(min / 1440)} días`;
}

// Una línea por cliente (para /estado y el resumen de cada mañana).
export function lineaCliente(c, { hoy, url = '', ahora = Date.now() } = {}) {
  const nombre = url ? `<a href="${h(urlCliente(c, url))}">${h(c.nombre)}</a>` : `<b>${h(c.nombre)}</b>`;
  if (c.pendiente) return `⚪️ ${nombre}: aún sin datos (pide /resumen ${h(c.id)})`;
  if (c.error || c.conectado === false) return `⚪️ ${nombre}: ${h(c.error || 'GHL sin conectar')}`;
  const crit = criticosDe(c);
  const venc = vencidasDe(c);
  const l = c.lanzamiento;
  const lineas = [`${crit ? '🔴' : venc ? '🟡' : '🟢'} ${nombre}${c.viejo ? ` <i>(datos de ${antiguedad(c.actualizado, ahora)})</i>` : ''}`];
  if (l) {
    lineas.push(`   ${h(l.nombre)}: ${num(l.registros)} registros · ${num(l.ventas)} ventas${l.roas ? ` · ROAS ${l.roas.toFixed(1)}` : ''}`);
    if (l.proximoHito) lineas.push(`   ⏭ ${h(l.proximoHito.label)} ${cuando(l.proximoHito.dia, hoy)}`);
  }
  for (const v of c.vsls || []) lineas.push(`   VSL ${h(v.nombre)}: ${num(v.registros)} registros · ${num(v.ventas)} ventas`);
  if (!l && !(c.vsls || []).length) lineas.push('   Sin lanzamiento en curso');
  const avisos = [crit ? `${crit} crítico${crit === 1 ? '' : 's'}` : '', venc ? `${venc} tarea${venc === 1 ? '' : 's'} vencida${venc === 1 ? '' : 's'}` : ''].filter(Boolean);
  if (avisos.length) lineas.push(`   ⚠️ ${avisos.join(' · ')}`);
  return lineas.join('\n');
}

// /estado: todos los clientes, primero los que tienen críticos.
export function textoEstado(r, { url = '', ahora = Date.now(), titulo = '📊 <b>Estado de los clientes</b>' } = {}) {
  const orden = [...r.clientes].sort((a, b) => criticosDe(b) - criticosDe(a) || vencidasDe(b) - vencidasDe(a));
  const crit = r.clientes.reduce((t, c) => t + criticosDe(c), 0);
  return [
    titulo,
    crit ? `🔴 ${crit} crítico${crit === 1 ? '' : 's'} en total` : '🟢 Ningún crítico',
    '',
    orden.map((c) => lineaCliente(c, { hoy: r.hoy, url, ahora })).join('\n\n'),
    '',
    '<i>Detalle de uno: /resumen &lt;cliente&gt; · Lo de hoy: /hoy</i>',
  ].join('\n');
}

// /resumen <cliente>: todo lo de ese cliente, recién calculado.
export function textoCliente(c, { hoy, url = '' } = {}) {
  const enlace = url ? `\n\n<a href="${h(urlCliente(c, url))}">Abrir su dashboard</a>` : '';
  if (c.error || c.conectado === false) return `<b>${h(c.nombre)}</b>\n${h(c.error || 'GHL sin conectar')}${enlace}`;
  const out = [`📈 <b>${h(c.nombre)}</b>${c.producto ? ` · ${h(c.producto)}` : ''}`];
  const l = c.lanzamiento;
  if (l) {
    const obj = l.objetivos || {};
    const conObj = (v, o) => `${num(v)}${o ? ` / ${num(o)} (${v != null ? Math.round((v / o) * 100) : 0} %)` : ''}`;
    out.push('', `🚀 <b>${h(l.nombre)}</b>${l.embudo ? ` · ${h(l.embudo)}` : ''}`);
    out.push(`Registros: ${conObj(l.registros, obj.registros)}`);
    if (l.vip != null) out.push(`VIP: ${conObj(l.vip, obj.vip)}`);
    out.push(`Ventas: ${conObj(l.ventas, obj.ventas)}`);
    out.push(`Inversión: ${eur(l.inversion)}${l.inversion7 != null ? ` (7 días: ${eur(l.inversion7)})` : ''}${l.cpl ? ` · CPL ${l.cpl.toFixed(2).replace('.', ',')} €` : ''}`);
    out.push(`Facturación aprox.: ${eur(l.facturacion)}${l.roas ? ` · ROAS ${l.roas.toFixed(1)}` : ''}`);
    if (l.proximoHito) out.push(`⏭ ${h(l.proximoHito.label)} ${cuando(l.proximoHito.dia, hoy)}`);
    const a = l.auditor || {};
    if (a.critico || a.importante) out.push('', `Auditor: ${a.critico ? `🔴 ${a.critico} crítico${a.critico === 1 ? '' : 's'}` : ''}${a.critico && a.importante ? ' · ' : ''}${a.importante ? `🟠 ${a.importante} importante${a.importante === 1 ? '' : 's'}` : ''}`);
    for (const t of a.criticos || []) out.push(`  • ${h(t)}`);
    if (l.vencidas) out.push(`🟡 ${l.vencidas} tarea${l.vencidas === 1 ? '' : 's'} vencida${l.vencidas === 1 ? '' : 's'}`);
  } else {
    out.push('', 'Sin lanzamiento en curso.');
  }
  for (const v of c.vsls || []) {
    out.push('', `🎬 <b>VSL ${h(v.nombre)}</b>: ${num(v.registros)} registros · ${num(v.ventas)} ventas`);
    for (const t of v.auditor?.criticos || []) out.push(`  🔴 ${h(t)}`);
    if (v.vencidas) out.push(`  🟡 ${v.vencidas} tarea${v.vencidas === 1 ? '' : 's'} vencida${v.vencidas === 1 ? '' : 's'}`);
  }
  if (c.alta && c.alta.hechos < c.alta.total) out.push('', `Alta: ${c.alta.hechos}/${c.alta.total} · falta: ${c.alta.pasos.filter((p) => !p.ok).map((p) => h(p.label)).slice(0, 3).join(', ')}`);
  return out.join('\n') + enlace;
}

// /hoy: lo que pasa hoy y mañana en todos los clientes, y lo que hay que resolver ya.
export function textoHoy(r, { url = '' } = {}) {
  const hoyL = [];
  const manana = [];
  const urgente = [];
  for (const c of r.clientes) {
    const nombre = url ? `<a href="${h(urlCliente(c, url))}">${h(c.nombre)}</a>` : `<b>${h(c.nombre)}</b>`;
    const ph = c.lanzamiento?.proximoHito;
    if (ph) {
      const n = diasHasta(ph.dia, r.hoy);
      if (n === 0) hoyL.push(`• ${nombre}: ${h(ph.label)}`);
      else if (n === 1) manana.push(`• ${nombre}: ${h(ph.label)}`);
    }
    const crit = criticosDe(c);
    const venc = vencidasDe(c);
    if (crit || venc) urgente.push(`• ${nombre}: ${[crit ? `🔴 ${crit} crítico${crit === 1 ? '' : 's'}` : '', venc ? `🟡 ${venc} vencida${venc === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}`);
  }
  return [
    `🗓 <b>Hoy, ${fechaCorta(r.hoy)}</b>`,
    '', '<b>Hoy</b>', hoyL.length ? hoyL.join('\n') : 'Ningún hito.',
    '', '<b>Mañana</b>', manana.length ? manana.join('\n') : 'Ningún hito.',
    '', '<b>Para resolver</b>', urgente.length ? urgente.join('\n') : '🟢 Nada pendiente.',
  ].join('\n');
}

export const AYUDA = [
  '🤖 <b>Bot de la agencia</b>',
  '',
  '/estado · cómo va cada cliente (registros, ventas, ROAS, críticos)',
  '/resumen &lt;cliente&gt; · el detalle de uno, recién calculado (sin nombre: te dejo elegir)',
  '/hoy · los hitos de hoy y mañana y lo que hay que resolver',
  '/ayuda · esta lista',
  '',
  'También te aviso solo: el resumen de cada mañana y los picos de salidas de los grupos de WhatsApp.',
].join('\n');

// Comandos que salen en el menú «/» de Telegram (se fijan al conectar el bot).
export const COMANDOS = [
  { command: 'estado', description: 'Cómo va cada cliente' },
  { command: 'resumen', description: 'Detalle de un cliente' },
  { command: 'hoy', description: 'Hitos de hoy y mañana y lo pendiente' },
  { command: 'ayuda', description: 'Qué sé hacer' },
];
