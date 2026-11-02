// Vigilante: cada día (y a demanda) revisa el lanzamiento en curso de un cliente como lo haría una persona
// el día antes de un directo:
//   1) el auditor completo (fechas, etiquetas, enlaces, Zoom de cada directo, carrito, tareas…);
//   2) un simulacro de las páginas publicadas en GHL: que abren (HTTP 200), que llevan el código de
//      AlquimIA (tracker.js, con ?c=<cliente> si no es el principal) y el bloque que les toca
//      (login, preclase, grabación, venta, pago);
// y avisa por Telegram solo de lo NUEVO (o de todo lo crítico si queda poco para un hito).
// Cada página es una petición: como mucho MAX_PAGINAS, para no pasar del límite de Cloudflare (50).
import { getConfig } from './config-store.js';
import { clienteActual } from './cliente.js';
import { listTags } from './ghl.js';
import { getTareas } from './tareas.js';
import { listUsers } from './users.js';
import { getRoles } from './roles.js';
import { zoomConfigured } from './zoom.js';
import { currentLaunch } from './digest.js';
import { leerCompartida, guardarCompartida } from './store.js';
import { avisarTelegram } from './telegram.js';
import { escapeHtml } from './http.js';
import { env } from './env.js';
import { auditarLanzamiento, proximoHito, diasHasta } from '../public/js/auditor.js';
import { videosDe, nClases } from '../public/js/videos.js';
import { dayInMadrid } from '../public/js/scoring.js';

export const MAX_PAGINAS = 8;
const TIMEOUT = 8000;

// Las páginas publicadas del lanzamiento y la marca que tiene que llevar cada una.
export function paginasDe(l) {
  const out = [];
  const add = (url, label, marca) => {
    const u = String(url || '').trim();
    if (/^https?:\/\//i.test(u) && !out.some((p) => p.url === u)) out.push({ url: u, label, marca });
  };
  if (nClases(l) >= 1 || l.preclaseTipo === 'recursos') {
    add(l.loginUrl, 'Página de login', 'data-lsd-login');
    add(l.recursosUrl, 'Página preclase', 'data-lsd-page');
  }
  for (const v of videosDe(l)) add(v.replayUrl, videosDe(l).length > 1 ? `Página del ${v.nombre}` : 'Página de la grabación', 'data-lsd-page');
  add(l.raicesUrl, 'Página de venta', 'data-lsd-venta');
  add(l.paginaPagoUrl, 'Página de pago', 'data-lsd-pago');
  return out.slice(0, MAX_PAGINAS);
}

// GHL a veces mete el código de los bloques escapado dentro de JSON (\" o ") o como entidades (&quot;).
const normalizar = (html) => String(html || '')
  .replace(/\\u002[fF]/g, '/').replace(/\\u0022/g, '"').replace(/\\u003[cC]/g, '<').replace(/\\u003[eE]/g, '>')
  .replace(/\\"/g, '"').replace(/\\\//g, '/').replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&amp;/g, '&');

// Qué le falta a una página (texto ya descargado). → [{ nivel, titulo, detalle }]
export function revisarPaginaHtml(html, { marca, clienteId = '', principal = true } = {}) {
  const t = normalizar(html);
  const out = [];
  const scripts = [...t.matchAll(/<script[^>]+src=["']?([^"'\s>]*tracker\.js[^"'\s>]*)/gi)].map((m) => m[1]);
  const conTracker = scripts.length > 0 || /tracker\.js/i.test(t);
  if (!conTracker) {
    out.push({ nivel: 'critico', titulo: 'No tiene el código de AlquimIA', detalle: 'Falta el <script> de tracker.js (pie de página o bloque de código): la página no medirá ni enseñará nada.' });
    return out;
  }
  if (!principal && clienteId && scripts.length && !scripts.some((s) => new RegExp(`[?&]c=${clienteId.replace(/[-]/g, '\\-')}(?:&|$)`).test(s))) {
    out.push({ nivel: 'critico', titulo: `El código no lleva ?c=${clienteId}`, detalle: 'Sin él la página lee los datos del cliente principal y no los de este. Copia de nuevo el código de «Códigos para GHL».' });
  }
  if (marca && !new RegExp(`${marca}(?:[\\s=>/"']|$)`, 'i').test(t)) {
    out.push({ nivel: 'importante', titulo: `No tiene el bloque de AlquimIA (${marca})`, detalle: 'Falta el bloque de código de esta página («Códigos para GHL»). Si está en un popup o se carga tarde, ignóralo.' });
  }
  return out;
}

// Descarga una página como lo haría un navegador. → { ok, status, html, error }
async function descargar(url, fetchFn) {
  try {
    const res = await fetchFn(url, {
      redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 AlquimIA-Vigilante', Accept: 'text/html' },
    });
    const html = res.ok ? (await res.text()).slice(0, 3_000_000) : '';
    return { ok: res.ok, status: res.status, html };
  } catch (e) {
    return { ok: false, status: 0, html: '', error: e.name === 'TimeoutError' ? `no responde en ${TIMEOUT / 1000} s` : String(e.message || e).slice(0, 120) };
  }
}

// Modo de pruebas (GHL_MOCK): páginas inventadas; una URL con «rota» da 404 y con «sin-codigo», sin tracker.js.
const fetchPrueba = async (url) => {
  if (/rota/.test(url)) return new Response('', { status: 404 });
  const marca = /venta/.test(url) ? '<div data-lsd-venta></div>' : /pago/.test(url) ? '<div data-lsd-pago></div>' : /login|acceso/.test(url) ? '<form data-lsd-login></form>' : '<div data-lsd-page="recursos"></div>';
  return new Response(/sin-codigo/.test(url) ? '<html><body>Hola</body></html>' : `<html><body>${marca}<script src="https://alquimia.example/tracker.js"></script></body></html>`, { status: 200 });
};
const fetchPorDefecto = (...a) => (env.GHL_MOCK === '1' ? fetchPrueba(...a) : fetch(...a));

// Simulacro: abre cada página publicada y la revisa. → [{ url, label, ok, status, problemas: [...] }]
export async function simulacro(l, { fetchFn = fetchPorDefecto, clienteId = '', principal = true } = {}) {
  return Promise.all(paginasDe(l).map(async (p) => {
    const r = await descargar(p.url, fetchFn);
    if (!r.ok) {
      return { ...p, ok: false, status: r.status, problemas: [{ nivel: 'critico', titulo: r.status ? `No abre (error ${r.status})` : 'No abre', detalle: r.error || (r.status === 404 ? '¿Se ha despublicado o ha cambiado la URL?' : 'Revisa que esté publicada.') }] };
    }
    const problemas = revisarPaginaHtml(r.html, { marca: p.marca, clienteId, principal });
    return { ...p, ok: !problemas.length, status: r.status, problemas };
  }));
}

// Cada problema con su clave (para avisar solo de lo nuevo).
const clave = (x) => `${x.area}|${x.titulo}`;

/**
 * Vigila el lanzamiento en curso del cliente actual.
 *   fetchFn: para el simulacro (pruebas) · avisar: manda Telegram · forzar: avisa de todo aunque no sea nuevo
 * → { code, nombre, hoy, problemas: [...], paginas: [...], nuevos: n, avisado: nº chats, motivo }
 */
export async function vigilar({ code: pedido = '', hoy = dayInMadrid(new Date().toISOString()), fetchFn = fetchPorDefecto, avisar = true, forzar = false, url = '' } = {}) {
  const c = clienteActual();
  const config = await getConfig({ fresh: true });
  const code = pedido && config.launches[pedido] ? pedido : currentLaunch(config, hoy);
  if (!code) return { cliente: c.id, code: null, problemas: [], paginas: [], nuevos: 0, avisado: 0, motivo: 'Sin lanzamiento en curso' };
  const l = config.launches[code];
  const embudo = config.embudos.find((e) => e.id === l.embudo);
  const [tags, tareas, users, roles] = await Promise.all([
    listTags().catch(() => null), getTareas(code).catch(() => null), listUsers().catch(() => []), getRoles().catch(() => []),
  ]);
  const auditoria = auditarLanzamiento({
    launch: l, code, otros: Object.entries(config.launches).filter(([k]) => k !== code), tareas, users, roles, hoy,
    tagsGhl: tags, leads: null, pestanas: embudo?.pestanas || null, zoom: zoomConfigured(), meta: null, llamadas: null,
  }).filter((x) => x.nivel !== 'aviso' || x.area !== 'Tareas');
  const paginas = await simulacro(l, { fetchFn, clienteId: c.id, principal: Boolean(c.principal) });
  const problemas = [
    ...paginas.flatMap((p) => p.problemas.map((x) => ({ ...x, area: 'Simulacro', titulo: `${p.label}: ${x.titulo}`, url: p.url }))),
    ...auditoria,
  ];

  // Lo ya avisado (por lanzamiento): solo se repite lo crítico cuando el próximo hito está a ≤2 días.
  const CLAVE = `vigilante|${code}`;
  const previo = (await leerCompartida(CLAVE, 30 * 86_400_000).catch(() => null)) || { avisados: [] };
  const ya = new Set(previo.avisados || []);
  const ph = proximoHito(l, hoy);
  const cerca = ph && diasHasta(ph.d, hoy) <= 2;
  const relevantes = problemas.filter((x) => x.nivel !== 'aviso');
  const aAvisar = relevantes.filter((x) => forzar || !ya.has(clave(x)) || (cerca && x.nivel === 'critico'));
  const nuevos = relevantes.filter((x) => !ya.has(clave(x))).length;
  let avisado = 0;
  if (avisar && aAvisar.length) {
    avisado = await avisarTelegram(textoVigilante({ cliente: c, launch: l, problemas: aAvisar, paginas, ph, hoy, url }));
  }
  // Se guarda lo que sigue abierto: si algo se arregla y vuelve a fallar, se avisa otra vez.
  await guardarCompartida(CLAVE, { en: Date.now(), avisados: relevantes.map(clave) }).catch(() => {});
  return {
    cliente: c.id, code, nombre: l.name, hoy, proximoHito: ph ? { label: ph.label, dia: ph.d } : null,
    problemas, paginas: paginas.map(({ url: u, label, ok, status, problemas: pr }) => ({ url: u, label, ok, status, problemas: pr })),
    nuevos, avisado, avisados: aAvisar.length,
  };
}

const ICONO = { critico: '🔴', importante: '🟠', aviso: '🟡' };
export function textoVigilante({ cliente, launch, problemas, paginas, ph, hoy, url = '' }) {
  const h = escapeHtml;
  const enlace = url ? `${url}${cliente.principal ? '' : `?c=${encodeURIComponent(cliente.id)}`}` : '';
  const okPag = paginas.filter((p) => p.ok).length;
  const n = ph ? diasHasta(ph.d, hoy) : null;
  return [
    `🛡 <b>Vigilante · ${h(cliente.nombre)}</b> · ${h(launch.name)}`,
    ph ? `⏭ ${h(ph.label)} ${n === 0 ? 'HOY' : n === 1 ? 'mañana' : `en ${n} días`}` : '',
    paginas.length ? `Simulacro: ${okPag}/${paginas.length} páginas bien` : '',
    '',
    ...problemas.slice(0, 15).map((x) => `${ICONO[x.nivel] || '•'} ${h(x.titulo)}${x.detalle ? `\n   <i>${h(String(x.detalle).slice(0, 180))}</i>` : ''}`),
    problemas.length > 15 ? `… y ${problemas.length - 15} más` : '',
    enlace ? `\n<a href="${h(enlace)}">Abrir el auditor</a>` : '',
  ].filter((x) => x !== '').join('\n');
}
