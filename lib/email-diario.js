// 📬 Email diario evergreen, en el servidor: guardar el calendario, las reglas de aprobación, la tarea de las 20:00
// que programa en GHL el email aprobado de mañana (en lotes) y las métricas de lo enviado. La lógica sin servidor
// (tipos, franjas, lotes, HTML) está en public/js/email-diario.js.
// Se guarda por cliente: lsd_evg_estado (configuración, fechas límite, CTAs y franjas), lsd_evg_emails_<AAAA-MM>
// (los emails de cada mes) y lsd_evg_log (registro de lo que hace la tarea y de cada aprobación).
import { leerJSON, guardarJSON, reintentando } from './store.js';
import { dayInMadrid } from '../public/js/scoring.js';
import { tasas } from '../public/js/emails.js';
import {
  CONFIG_DEFECTO, BLOQUEADO, limpiarConfig, limpiarEntregables, limpiarCtas, limpiarBloqueos, limpiarEmail, emailVacio,
  tipoSugerido, bloqueoDe, proximoCierre, cambiaTexto, tieneTexto, decidirProgramacion, sendAtGhl, estimarLotes, htmlEmail,
  sumarDias, mesDe, esDia, TIPOS,
} from '../public/js/email-diario.js';
import * as ghl from './ghl.js';

const K_ESTADO = 'lsd_evg_estado';
const K_LOG = 'lsd_evg_log';
const kMes = (mes) => `lsd_evg_emails_${mes}`;
const MAX_LOG = 300;
const fallo = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });
export const hoyMadrid = (ahora = new Date()) => dayInMadrid(ahora.toISOString());

export async function leerEstado() {
  const e = (await leerJSON(K_ESTADO)) || {};
  return { config: limpiarConfig({ ...CONFIG_DEFECTO, ...(e.config || {}) }), entregables: limpiarEntregables(e.entregables), ctas: limpiarCtas(e.ctas), bloqueos: limpiarBloqueos(e.bloqueos) };
}
// cambios: { config?, entregables?, ctas?, bloqueos? } (solo lo que venga; el resto se queda).
export function guardarEstado(cambios) {
  return reintentando(async () => {
    const e = (await leerJSON(K_ESTADO)) || {};
    if (cambios.config) e.config = limpiarConfig({ ...CONFIG_DEFECTO, ...(e.config || {}), ...cambios.config, lotes: { ...(e.config?.lotes || {}), ...(cambios.config.lotes || {}) } });
    if (cambios.entregables) e.entregables = limpiarEntregables(cambios.entregables);
    if (cambios.ctas) e.ctas = limpiarCtas(cambios.ctas);
    if (cambios.bloqueos) e.bloqueos = limpiarBloqueos(cambios.bloqueos);
    await guardarJSON(K_ESTADO, e, { motivo: 'Email diario: ajustes' });
    return leerEstado();
  });
}

export async function emailsDelMes(mes) {
  return (await leerJSON(kMes(mes)))?.emails || {};
}
// Los emails de varios meses (de `desde` a `hasta`, días AAAA-MM-DD).
export async function emailsEntre(desde, hasta) {
  const meses = [];
  for (let m = mesDe(desde); m <= mesDe(hasta); m = mesDe(sumarDias(`${m}-28`, 7))) meses.push(m);
  const out = {};
  for (const m of meses) Object.assign(out, await emailsDelMes(m));
  return Object.fromEntries(Object.entries(out).filter(([d]) => d >= desde && d <= hasta));
}
// Cambia un día con fn(email actual | null) → email nuevo (o lo que devuelva fn: { email, resultado }).
function cambiarDia(dia, fn, motivo) {
  if (!esDia(dia)) throw fallo('Día no válido');
  return reintentando(async () => {
    const doc = (await leerJSON(kMes(mesDe(dia)))) || {};
    doc.emails = doc.emails || {};
    const nuevo = await fn(doc.emails[dia] || null);
    if (nuevo === null) delete doc.emails[dia];
    else doc.emails[dia] = nuevo;
    await guardarJSON(kMes(mesDe(dia)), doc, { motivo });
    return nuevo;
  });
}

export async function registrar(accion, dia, { ok = true, detalle = '', quien = '' } = {}) {
  await reintentando(async () => {
    const log = (await leerJSON(K_LOG)) || { items: [] };
    log.items = [{ at: new Date().toISOString(), accion, dia: dia || '', ok, detalle: String(detalle).slice(0, 1500), quien }, ...(log.items || [])].slice(0, MAX_LOG);
    await guardarJSON(K_LOG, log);
  }).catch((e) => console.error('Email diario: registro', e.message));
}
export async function leerRegistro(n = 60) {
  return ((await leerJSON(K_LOG))?.items || []).slice(0, n);
}

// Guardar el texto de un día (persona en AlquimIA u «ia» por el conector). Reglas:
//  · Programado o enviado: no se toca (GHL ya tiene esa versión).
//  · La IA no escribe en días saltados ni bloqueados, ni pisa un email aprobado.
//  · Si un email aprobado cambia de texto, vuelve a borrador: hay que aprobarlo otra vez.
export async function guardarEmail(dia, cambios, { quien = '', origen = 'persona', estado = null } = {}) {
  const est = estado || await leerEstado();
  return cambiarDia(dia, (actual) => {
    const prev = actual || emailVacio(tipoSugerido(est.entregables, dia));
    if (BLOQUEADO.has(prev.status)) throw fallo(`El email del ${dia} ya está ${prev.status === 'enviado' ? 'enviado' : 'programado en GHL'}: no se puede cambiar.`, 409);
    if (origen === 'ia') {
      const b = bloqueoDe(est.bloqueos, dia);
      if (b) throw fallo(`El ${dia} está en la franja bloqueada «${b.label}»: no se redacta email.`, 409);
      if (prev.skip) throw fallo(`El ${dia} está saltado: no se redacta email.`, 409);
      if (prev.status === 'aprobado') throw fallo(`El email del ${dia} ya está aprobado: no lo cambio. Si hay que rehacerlo, que una persona lo pase a borrador.`, 409);
      if (prev.origen === 'persona' && tieneTexto(prev)) throw fallo(`El email del ${dia} lo ha escrito o cambiado una persona: no lo piso.`, 409);
    }
    const limpio = limpiarEmail({ ...prev, ...cambios });
    if (limpio.cta && !est.ctas.some((c) => c.id === limpio.cta)) limpio.cta = '';
    const vuelveABorrador = prev.status === 'aprobado' && cambiaTexto(prev, limpio);
    // Aprobar va aparte (solo admin). Una persona puede marcarlo «listo para revisar» o devolverlo a borrador.
    let status = prev.status || 'borrador';
    if (origen === 'ia' || vuelveABorrador) status = 'borrador';
    else if (['borrador', 'listo'].includes(cambios.status)) status = cambios.status;
    const nuevo = { ...prev, ...limpio, status, origen: origen === 'ia' ? 'ia' : prev.origen || 'persona', editado: { por: quien, at: new Date().toISOString() } };
    if (vuelveABorrador) { delete nuevo.aprobado; nuevo.nota = 'Se cambió después de aprobarlo: hay que volver a aprobarlo.'; } else delete nuevo.nota;
    if (!tieneTexto(nuevo) && !nuevo.skip && !nuevo.type && !nuevo.ghlId) return null; // un día vacío no se guarda
    return nuevo;
  }, origen === 'ia' ? `Email diario: borrador de la IA (${dia})` : `Email diario: ${dia}`);
}

// Aprobar (solo admin): con asunto y cuerpo, sin saltar ni bloquear.
export async function aprobar(dia, quien) {
  const est = await leerEstado();
  const r = await cambiarDia(dia, (e) => {
    if (!e || !tieneTexto(e) || !e.subject || !e.body) throw fallo('Para aprobarlo hace falta el asunto y el cuerpo.');
    if (BLOQUEADO.has(e.status)) throw fallo('Ya está programado.', 409);
    if (e.skip) throw fallo('Este día está saltado: reactívalo antes de aprobar.');
    const b = bloqueoDe(est.bloqueos, dia);
    if (b) throw fallo(`El día está en la franja bloqueada «${b.label}».`);
    const n = { ...e, status: 'aprobado', aprobado: { por: quien, at: new Date().toISOString() } };
    delete n.nota;
    return n;
  }, `Email diario: aprobado ${dia}`);
  await registrar('aprobado', dia, { quien, detalle: r.subject });
  return r;
}
export async function quitarAprobacion(dia, quien) {
  const r = await cambiarDia(dia, (e) => {
    if (!e || e.status !== 'aprobado') throw fallo('No está aprobado.');
    const n = { ...e, status: 'borrador' };
    delete n.aprobado;
    return n;
  }, `Email diario: sin aprobar ${dia}`);
  await registrar('desaprobado', dia, { quien });
  return r;
}

// ---------- Tarea de las 20:00: programar en GHL el email aprobado de mañana ----------
// En «simulación» no llama a GHL: apunta en el registro lo que haría. En «real»: crea (o actualiza, si ya existía) la
// campaña con el HTML del calendario y la programa a su hora en lotes. Si algo falla, el email sigue aprobado y la
// tarea siguiente (o «Programar ahora») lo reintenta sin duplicar: la campaña ya creada se reutiliza (ghlId).
export async function tareaProgramar({ ahora = new Date(), dia: diaPedido = '', simular = false } = {}) {
  const dia = diaPedido || sumarDias(hoyMadrid(ahora), 1);
  const est = await leerEstado();
  const emails = await emailsDelMes(mesDe(dia));
  const d = decidirProgramacion({ ...est, emails }, dia);
  if (d.accion !== 'programar') {
    await registrar(d.accion === 'aviso' ? 'aviso' : 'sin envío', dia, { ok: d.accion !== 'aviso', detalle: d.motivo, quien: 'tarea 20:00' });
    return { dia, ...d };
  }
  const e = emails[dia];
  const c = est.config;
  const hora = e.sendTime || c.sendTime;
  const sendAt = sendAtGhl(dia, hora);
  const nombre = `Email diario · ${dia} · ${e.subject}`.slice(0, 200);
  const html = htmlEmail(e, { ctas: est.ctas, pie: c.pie, preheader: e.preheader });
  const contactos = await ghl.countByTag(c.audienceTag).catch(() => null);
  const lotes = contactos == null ? null : estimarLotes(contactos, c.lotes, hora);
  const resumen = `«${e.subject}» a la etiqueta «${c.audienceTag}»${contactos != null ? ` (${contactos.toLocaleString('es-ES')} contactos)` : ''}, el ${dia} a las ${hora}, en lotes de ${c.lotes.tamano} cada ${c.lotes.cada} min${lotes ? ` (${lotes.lotes} ${lotes.lotes === 1 ? 'lote' : 'lotes'}: termina hacia las ${lotes.fin}${lotes.otroDia ? ' del día siguiente' : ''})` : ''}`;
  const avisoDiario = contactos != null && lotes?.pasaDiario ? ` Ojo: son más de 25.000 contactos, el límite diario de GHL con dominio compartido.` : '';
  if (c.modo !== 'real' || simular) {
    await registrar('simulación', dia, { detalle: `Se programaría ${resumen}.${avisoDiario} No se ha llamado a GHL (${simular ? 'prueba de la tarea' : 'modo simulación'}).`, quien: simular ? 'prueba' : 'tarea 20:00' });
    return { dia, accion: 'simulacion', resumen };
  }
  try {
    const tagId = await ghl.etiquetaId(c.audienceTag);
    if (!tagId) throw fallo(`La etiqueta «${c.audienceTag}» no existe en GHL.`);
    let camp = e.ghlId ? await ghl.actualizarCampanaEmail(e.ghlId, { nombre, html, userId: c.ghlUserId }) : await ghl.crearCampanaEmail({ nombre, html, userId: c.ghlUserId });
    // Guardar el id antes de programar: si programar falla, el reintento usa la misma campaña (no se duplica).
    if (!e.ghlId) await cambiarDia(dia, (x) => ({ ...x, ghlId: camp.id, sourceId: camp.sourceId || x.sourceId || '' }), `Email diario: campaña creada ${dia}`);
    const p = await ghl.programarCampanaEmail(camp.id, { sendAt, tagId, subject: e.subject, previewText: e.preheader, fromName: c.fromName, fromEmail: c.fromEmail, replyTo: c.replyTo, userId: c.ghlUserId, lotes: c.lotes });
    camp = { ...camp, sourceId: p.sourceId || camp.sourceId };
    await cambiarDia(dia, (x) => ({ ...x, status: 'programado', ghlId: camp.id, sourceId: camp.sourceId || x.sourceId || '', programado: { at: new Date().toISOString(), sendAt, lotes: c.lotes, contactos } }), `Email diario: programado ${dia}`);
    await registrar('programado', dia, { detalle: `Programado en GHL: ${resumen}. Campaña ${camp.id}.${avisoDiario}`, quien: 'tarea 20:00' });
    return { dia, accion: 'programado', resumen, campana: camp.id };
  } catch (err) {
    const msg = err.publicMessage || err.message;
    await registrar('error', dia, { ok: false, detalle: `No se ha podido programar: ${msg}`, quien: 'tarea 20:00' });
    return { dia, accion: 'error', motivo: msg };
  }
}

// Tarea de control (p. ej. a las 12:00): avisa si mañana no tiene borrador o no está aprobado (aún hay tiempo).
export async function tareaRevisar({ ahora = new Date() } = {}) {
  const dia = sumarDias(hoyMadrid(ahora), 1);
  const est = await leerEstado();
  const d = decidirProgramacion({ ...est, emails: await emailsDelMes(mesDe(dia)) }, dia);
  if (d.accion === 'aviso') await registrar('aviso', dia, { ok: false, detalle: `${d.motivo} Aún hay tiempo antes de las 20:00.`, quien: 'revisión' });
  return { dia, ...d };
}

// Lo enviado: pasa a «enviado» cuando llega su día y lee sus estadísticas de GHL (los de los últimos 30 días, como
// mucho 8 por llamada, para no pasar del límite de Cloudflare).
export async function actualizarMetricas({ ahora = new Date() } = {}) {
  const hoy = hoyMadrid(ahora);
  const { config } = await leerEstado();
  const emails = await emailsEntre(sumarDias(hoy, -30), hoy);
  const ahoraHHMM = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false }).format(ahora);
  const yaSalio = (d, e) => d < hoy || (d === hoy && ahoraHHMM >= (e.sendTime || config.sendTime));
  const pendientes = Object.entries(emails).filter(([d, e]) => e.sourceId && BLOQUEADO.has(e.status) && yaSalio(d, e))
    .sort((a, b) => String(a[1].m?.at || '').localeCompare(String(b[1].m?.at || ''))).slice(0, 8);
  let n = 0;
  for (const [d, e] of pendientes) {
    const stats = await ghl.getEmailStats('email-campaigns', e.sourceId).catch(() => null);
    if (!stats) continue;
    await cambiarDia(d, (x) => ({ ...x, status: 'enviado', m: { ...tasas(stats), at: new Date().toISOString() } }), `Email diario: métricas ${d}`);
    n++;
  }
  return { actualizados: n };
}

// Lo que necesita la IA para redactar el email de un día (herramienta «email_diario_contexto» del conector).
export async function contextoParaIA(dia) {
  const est = await leerEstado();
  const desde = sumarDias(dia, -14);
  const emails = await emailsEntre(desde, sumarDias(dia, 7));
  const e = emails[dia] || null;
  const b = bloqueoDe(est.bloqueos, dia);
  const cierre = proximoCierre(est.entregables, dia);
  const tipo = e?.type || tipoSugerido(est.entregables, dia);
  const puede = !b && !e?.skip && !(e && (BLOQUEADO.has(e.status) || e.status === 'aprobado'));
  return {
    dia, puedeRedactar: puede,
    motivo: b ? `Franja bloqueada «${b.label}»: no se redacta.` : e?.skip ? 'Día saltado: no se redacta.' : e && e.status === 'aprobado' ? 'Ya está aprobado: no se cambia.' : e && BLOQUEADO.has(e.status) ? 'Ya está programado.' : '',
    tipo: tipo ? { id: tipo, nombre: TIPOS[tipo].label, pista: TIPOS[tipo].pista } : { id: null, nombre: 'Sin tipo', pista: 'Elige el enfoque que mejor encaje (o usa prueba social).' },
    proximoCierre: cierre ? { entregable: cierre.name, tema: cierre.topic, fecha: cierre.date, diasQueFaltan: Math.round((Date.parse(`${cierre.date}T12:00:00Z`) - Date.parse(`${dia}T12:00:00Z`)) / 86_400_000), notas: cierre.desc } : null,
    entregables: est.entregables.map((x) => ({ nombre: x.name, tema: x.topic, cierre: x.date })),
    ctas: est.ctas.filter((x) => x.url).map((x) => ({ id: x.id, nombre: x.name, url: x.url, usarEn: x.use })),
    actual: e ? { asunto: e.subject, preheader: e.preheader, cuerpo: e.body, cta: e.cta, estado: e.status } : null,
    hora: e?.sendTime || est.config.sendTime,
    recientes: Object.entries(emails).filter(([d, x]) => d < dia && x.subject).sort((a, b2) => b2[0].localeCompare(a[0])).slice(0, 10).map(([d, x]) => ({ dia: d, tipo: x.type, asunto: x.subject })),
    proximos: Object.entries(emails).filter(([d, x]) => d > dia && x.subject).sort((a, b2) => a[0].localeCompare(b2[0])).map(([d, x]) => ({ dia: d, tipo: x.type, asunto: x.subject })),
    reglas: 'El pie legal lo añade AlquimIA: no lo escribas. Escribe el cuerpo en texto (párrafos separados por una línea en blanco); **negrita** vale; pon [CTA] en una línea sola donde vaya el botón del CTA (si no, va al final). Asunto de 50 caracteres como mucho. Testimonios solo con nombre de pila. Nada de jerga interna de lanzamiento («carrito»…). Queda como borrador: una persona lo revisa y lo aprueba en AlquimIA.',
  };
}
