// Vigilancia de los grupos de WhatsApp (SendFlow) durante la captación y el carrito.
// La lanza cada 15 min una tarea gratuita (cron-job.org) que abre /api/sendflow?op=vigilar&key=DIGEST_KEY&c=<cliente>.
// En cada pasada, por cada campaña activa (máx. 3, para no pasarse del límite de SendAPI):
//   1. lee la analítica y los grupos de SendFlow y guarda una «foto» (entradas, salidas y clics acumulados);
//   2. comprueba que el enlace de entrada al grupo responde;
//   3. busca problemas comparando con las fotos anteriores:
//      · enlace caído · todos los grupos llenos · clics sin entradas (la gente pulsa pero no entra)
//      · fuga: pico de salidas en la última media hora frente a lo normal de las últimas 24 h;
//   4. avisa (email al del resumen diario y, si se configura, WhatsApp) sin repetir el mismo aviso en 3 h.
import { leerCompartida, guardarCompartida } from './store.js';
import { analiticaSendflow, gruposSendflow, frenoSendflow, sendflow } from './sendflow.js';
import { findContactByEmail, sendEmail } from './ghl.js';
import { emailLayout } from './users.js';
import { dayInMadrid } from '../public/js/scoring.js';
import { addDay } from '../public/js/embudo-vsl.js';

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
const MAX_CAMPANAS = 3;
const ESPERA_AVISO = { fuga: HORA, defecto: 3 * HORA };
// Por WhatsApp solo llegan los fallos (la gente no puede entrar): enlace roto, grupos llenos o clics sin entradas.
// Los picos de salidas se ven en el dashboard (y por email, si está activado).
export const FALLOS = ['enlace', 'llenos', 'clics'];

// Campañas que se vigilan hoy: lanzamientos desde el inicio de la captación hasta el cierre del carrito (o una
// semana tras el directo) y meteóricos desde el calentamiento hasta el día después del cierre.
export function campanasActivas(config, hoy = dayInMadrid(new Date().toISOString())) {
  const out = [];
  for (const [code, l] of Object.entries(config.launches || {})) {
    if (!l.sendflowId || !l.inicioCaptacion || l.inicioCaptacion > hoy) continue;
    const fin = String(l.cierreCarrito || '').slice(0, 10) || (l.fechaDirecto ? addDay(l.fechaDirecto, 7) : addDay(l.inicioCaptacion, 30));
    if (hoy <= fin) out.push({ code, nombre: l.name || code, id: l.sendflowId, enlace: l.whatsappUrl || '', tipo: 'lanzamiento' });
  }
  for (const [code, m] of Object.entries(config.meteoricos || {})) {
    if (!m.sendflowId) continue;
    const desde = m.calentamiento || String(m.apertura || '').slice(0, 10);
    const hasta = addDay(String(m.cierre || m.apertura || '').slice(0, 10) || desde, 1);
    if (desde && desde <= hoy && hoy <= hasta) out.push({ code, nombre: m.name || code, id: m.sendflowId, enlace: m.whatsappUrl || '', tipo: 'meteórico' });
  }
  return out.slice(0, MAX_CAMPANAS);
}

// La foto más cercana a un momento (y no posterior).
const fotoEn = (serie, t) => [...serie].reverse().find((f) => f.t <= t) || null;
const hora = (t) => new Date(t).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });

// Problemas a partir de la serie de fotos [{ t, e, s, c }] (ordenada), los grupos y el estado del enlace.
export function detectarAlertas(serie, { ahora = Date.now(), grupos = null, enlace = null } = {}) {
  const out = [];
  const ult = serie.at(-1);
  if (enlace && !enlace.ok) out.push({ tipo: 'enlace', nivel: 'alta', texto: `El enlace de entrada al grupo no funciona (${enlace.detalle}). Revisa el enlace de SendFlow: la publicidad está llevando gente a un enlace roto.` });
  if (grupos?.length && grupos.every((g) => g.lleno)) out.push({ tipo: 'llenos', nivel: 'alta', texto: `Los ${grupos.length} grupos de la campaña están llenos. Revisa en SendFlow que se cree el siguiente grupo (o crea uno a mano).` });
  if (!ult) return out;
  // Clics sin entradas en la última hora.
  const hace1h = fotoEn(serie, ahora - HORA);
  if (hace1h && ult.t - hace1h.t >= 40 * MIN) {
    const clics = ult.c - hace1h.c;
    const entradas = ult.e - hace1h.e;
    if (clics >= 15 && entradas === 0) out.push({ tipo: 'clics', nivel: 'alta', texto: `${clics} clics en el enlace en la última hora y nadie ha entrado al grupo. Puede que el enlace esté roto o los grupos llenos.` });
  }
  // Fuga: salidas de la última media hora frente a la media de cada media hora de las últimas 24 h.
  const hace30 = fotoEn(serie, ahora - 30 * MIN);
  const hace24h = fotoEn(serie, ahora - DIA) || serie[0];
  if (hace30 && ult.t - hace30.t >= 20 * MIN && hace24h && hace30.t > hace24h.t) {
    const salidas = ult.s - hace30.s;
    const tramos = (hace30.t - hace24h.t) / (30 * MIN);
    const media = tramos >= 2 ? (hace30.s - hace24h.s) / tramos : 0;
    if (salidas >= Math.max(10, 3 * media)) {
      out.push({ tipo: 'fuga', nivel: 'media', salidas, desde: hace30.t, hasta: ult.t, texto: `Pico de salidas: ${salidas} personas se han salido del grupo entre las ${hora(hace30.t)} y las ${hora(ult.t)} (lo normal son ${Math.round(media)} cada media hora). ¿Qué se mandó justo antes?` });
    }
  }
  return out;
}

// Salidas y entradas por hora de las últimas 24 h, a partir de la serie (para la gráfica del dashboard).
export function porHora(serie, ahora = Date.now()) {
  const out = [];
  for (let h = 23; h >= 0; h--) {
    const fin = ahora - h * HORA;
    const a = fotoEn(serie, fin - HORA);
    const b = fotoEn(serie, fin);
    if (!a || !b || b.t <= a.t) continue;
    out.push({ hasta: fin, entradas: b.e - a.e, salidas: b.s - a.s, clics: b.c - a.c });
  }
  return out;
}

// ¿Responde el enlace de entrada? (sin seguir la redirección hasta WhatsApp: basta con que no dé error)
async function comprobarEnlace(url) {
  if (!/^https:\/\//i.test(url)) return null;
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'Mozilla/5.0 (vigilancia del dashboard)' } });
    return r.status < 400 ? { ok: true, status: r.status } : { ok: false, status: r.status, detalle: `responde con error ${r.status}` };
  } catch (e) {
    return { ok: false, status: 0, detalle: e.name === 'TimeoutError' ? 'no responde' : 'no se puede abrir' };
  }
}

async function avisar(config, camp, alertas, dashboardUrl) {
  const enviados = [];
  const titulo = `${alertas.some((a) => a.nivel === 'alta') ? '🚨' : '⚠️'} Grupos de WhatsApp · ${camp.nombre}`;
  const av = config.sendflowAvisos || {};
  if (av.email !== false && config.digestEmail) {
    try {
      const c = await findContactByEmail(config.digestEmail);
      if (c) {
        const body = `<p>La vigilancia de los grupos de WhatsApp del ${camp.tipo} <strong>${camp.nombre}</strong> ha detectado:</p><ul>${alertas.map((a) => `<li>${a.texto}</li>`).join('')}</ul>`;
        await sendEmail(c.id, { subject: titulo, html: await emailLayout(titulo, body, { url: dashboardUrl, button: 'Abrir el dashboard' }) });
        enviados.push('email');
      }
    } catch (e) { console.error('Aviso por email', e.message); }
  }
  const fallos = alertas.filter((a) => FALLOS.includes(a.tipo));
  if (av.telefono && av.cuentaId && fallos.length) {
    try {
      await sendflow(`/send-text-message/${encodeURIComponent(av.cuentaId)}`, { method: 'POST', body: { phoneNumber: av.telefono, text: `🚨 Grupos de WhatsApp · ${camp.nombre}\n\n${fallos.map((a) => `• ${a.texto}`).join('\n')}` } });
      enviados.push('whatsapp');
    } catch (e) { console.error('Aviso por WhatsApp', e.message); }
  }
  return enviados;
}

// Una pasada de la vigilancia para el cliente actual.
export async function vigilarGrupos(config, { ahora = Date.now(), dashboardUrl = '' } = {}) {
  const campanas = campanasActivas(config, dayInMadrid(new Date(ahora).toISOString()));
  if (!campanas.length) return { vigiladas: 0 };
  if (await frenoSendflow()) return { vigiladas: 0, motivo: 'SendFlow tiene la clave en pausa' };
  const resumen = [];
  for (const camp of campanas) {
    try {
      const a = await analiticaSendflow(camp.id, { fresh: true });
      let grupos = null;
      try { grupos = await gruposSendflow(camp.id, { fresh: true }); } catch { /* sin grupos: se vigila lo demás */ }
      const enlace = camp.enlace ? await comprobarEnlace(camp.enlace) : null;
      const serie = ((await leerCompartida(`sf-serie|${camp.id}`, 7 * DIA)) || []).filter((f) => f.t > ahora - 3 * DIA);
      serie.push({ t: ahora, e: a.entradas.total, s: a.salidas.total, c: a.clics.total });
      await guardarCompartida(`sf-serie|${camp.id}`, serie);
      const alertas = detectarAlertas(serie, { ahora, grupos, enlace });
      // Sin repetir el mismo aviso: 1 h para las fugas y 3 h para lo demás.
      const ultimos = (await leerCompartida(`sf-avisado|${camp.id}`, 7 * DIA)) || {};
      const nuevas = alertas.filter((x) => !(ultimos[x.tipo] > ahora - (ESPERA_AVISO[x.tipo] || ESPERA_AVISO.defecto)));
      let enviados = [];
      if (nuevas.length) {
        enviados = await avisar(config, camp, nuevas, dashboardUrl);
        for (const x of nuevas) ultimos[x.tipo] = ahora;
        await guardarCompartida(`sf-avisado|${camp.id}`, ultimos);
        const hist = (await leerCompartida(`sf-alertas|${camp.id}`, 30 * DIA)) || [];
        await guardarCompartida(`sf-alertas|${camp.id}`, [...nuevas.map((x) => ({ ...x, t: ahora, enviados })), ...hist].slice(0, 50));
      }
      await guardarCompartida(`sf-estado|${camp.id}`, { t: ahora, enlace, llenos: grupos ? grupos.filter((g) => g.lleno).length : null, grupos: grupos ? grupos.length : null, activas: alertas.map((x) => x.tipo) });
      resumen.push({ code: camp.code, alertas: alertas.map((x) => x.tipo), avisadas: nuevas.map((x) => x.tipo), enviados });
    } catch (e) {
      resumen.push({ code: camp.code, error: e.publicMessage || e.message });
      if (e.freno) break; // SendFlow ha frenado: no se sigue con las demás
    }
  }
  return { vigiladas: resumen.length, campanas: resumen };
}

// Lo que enseña el dashboard: última comprobación, estado, entradas y salidas por hora y los avisos.
export async function estadoVigilancia(id, ahora = Date.now()) {
  const [serie, estado, alertas] = await Promise.all([
    leerCompartida(`sf-serie|${id}`, 7 * DIA), leerCompartida(`sf-estado|${id}`, 7 * DIA), leerCompartida(`sf-alertas|${id}`, 30 * DIA),
  ]);
  return { ultima: estado?.t || null, estado: estado || null, porHora: porHora(serie || [], ahora), alertas: (alertas || []).slice(0, 15) };
}
