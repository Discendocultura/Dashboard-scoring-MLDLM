// Email diario evergreen (📬 en el menú lateral): un email al día a una etiqueta de GHL, con urgencias por las fechas
// límite de los entregables del mes. Lo redacta la IA (tarea de Cowork con la suscripción de Claude, por el conector:
// «guardar_borrador_email»), lo aprueba una persona admin en AlquimIA y AlquimIA lo programa en GHL a las 20:00 del
// día anterior, siempre en lotes pequeños. Sin pantalla: lo usan el panel, el servidor y las pruebas.

// De momento solo Discendo; para dárselo a otro cliente, añade aquí su código.
export const CLIENTES_EMAIL_DIARIO = ['discendo'];
export const conEmailDiario = (clienteId) => CLIENTES_EMAIL_DIARIO.includes(String(clienteId || ''));

export const TIPOS = {
  urgencia: { label: 'Urgencia · fecha límite', corto: 'Urgencia', color: '#d9480f', icono: 'clock', ico: '⏳', pista: 'Los 7 días antes del cierre de una entrada: recuerda la fecha límite' },
  curiosidad: { label: 'Curiosidad · tema del mes', corto: 'Curiosidad', color: '#7c4dcc', icono: 'sparkle', ico: '✨', pista: 'Entre 8 y 21 días antes de un cierre: despierta interés por el tema' },
  prueba: { label: 'Prueba social', corto: 'Prueba social', color: '#14866d', icono: 'chat', ico: '💬', pista: 'Caso o testimonio de un miembro (solo nombre de pila)' },
  whatsapp: { label: 'Grupo de WhatsApp · oferta flash', corto: 'WhatsApp', color: '#1f9d55', icono: 'whatsapp', ico: '📲', pista: 'Invitación al grupo con oferta flash' },
  clase: { label: 'Clase en directo', corto: 'Clase en directo', color: '#c2255c', icono: 'live', ico: '🎙️', pista: 'Invitación a una clase en directo próxima' },
};
export const ESTADOS = {
  borrador: { label: 'Borrador', color: '#8c857e', icono: 'pencil', paso: 0 },
  listo: { label: 'Listo para revisar', color: '#c98a00', icono: 'eye', paso: 1 },
  aprobado: { label: 'Aprobado', color: '#2f6aa8', icono: 'check', paso: 2 },
  programado: { label: 'Programado en GHL', color: '#6b4fc8', icono: 'clock', paso: 3 },
  enviado: { label: 'Enviado', color: '#138a4b', icono: 'mail', paso: 4 },
};
// Un email programado o enviado ya no se toca: GHL envía la versión del momento de programar y no se puede cancelar
// por la API.
export const BLOQUEADO = new Set(['programado', 'enviado']);

export const ENTREGABLES = [
  { id: 'cronica', name: 'La Crónica' },
  { id: 'tertulia', name: 'La Tertulia · masterclass en directo' },
  { id: 'vive', name: 'Vive la Historia' },
];
// Lotes, con lo que admite GHL (help.gohighlevel.com, «How to batch schedule email campaigns» y «LC Email»):
//  · el intervalo, de 1 minuto como mínimo (no admite segundos); aquí, en minutos, hasta 2 horas;
//  · GHL recomienda empezar con lotes de 50-100 emails: por defecto, 100 cada minuto;
//  · como techo de seguridad, 500 envíos por minuto (GHL permite hasta 1.000 con intervalos de 1 minuto) y 2.000 por lote;
//  · el envío diario de una subcuenta con dominio compartido es de 25.000 como mucho (menos en sus primeros 7 días).
export const LOTES_DEFECTO = { tamano: 100, cada: 1 };
export const LOTE_MIN = 10;
export const LOTE_MAX = 2000;
export const CADA_MAX = 120;
export const MAX_POR_MINUTO = 500;
export const LIMITE_DIARIO_GHL = 25000;
// El mayor lote que cabe con ese intervalo sin pasar de MAX_POR_MINUTO.
export const loteMaximo = (cada) => Math.min(LOTE_MAX, MAX_POR_MINUTO * Math.max(1, cada));
export const CONFIG_DEFECTO = {
  fromEmail: '', fromName: '', replyTo: '', audienceTag: '', sendTime: '09:00', ghlUserId: '', pie: '',
  lotes: { ...LOTES_DEFECTO }, modo: 'simulacion',
};

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const txt = (v, max) => String(v ?? '').replace(/\r/g, '').slice(0, max);
const linea = (v, max) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
export const esDia = (d) => DIA_RE.test(String(d || '')) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`));
export const esHora = (h) => HORA_RE.test(String(h || ''));

export function sumarDias(dia, n) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
export const mesDe = (dia) => String(dia).slice(0, 7);

// ---------- Configuración (limpia) ----------
export function limpiarConfig(c = {}) {
  return {
    fromEmail: linea(c.fromEmail, 120), fromName: linea(c.fromName, 80), replyTo: linea(c.replyTo, 120),
    audienceTag: linea(c.audienceTag, 120), sendTime: esHora(c.sendTime) ? c.sendTime : '09:00',
    ghlUserId: linea(c.ghlUserId, 40).replace(/[^A-Za-z0-9]/g, ''), pie: txt(c.pie, 3000),
    lotes: limpiarLotes(c.lotes || {}),
    modo: c.modo === 'real' ? 'real' : 'simulacion',
  };
}
// Fuera de rango, el valor por defecto; un lote demasiado grande para su intervalo, se baja al máximo permitido.
export function limpiarLotes(lotes = {}) {
  const ent = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : null; };
  const c = ent(lotes.cada);
  const cada = c != null && c >= 1 && c <= CADA_MAX ? c : LOTES_DEFECTO.cada;
  const t = ent(lotes.tamano);
  const tamano = t != null && t >= LOTE_MIN && t <= LOTE_MAX ? Math.min(t, loteMaximo(cada)) : Math.min(LOTES_DEFECTO.tamano, loteMaximo(cada));
  return { tamano, cada };
}
export function limpiarEntregables(lista = []) {
  return ENTREGABLES.map((e) => {
    const x = (Array.isArray(lista) ? lista : []).find((y) => y?.id === e.id) || {};
    return { id: e.id, name: linea(x.name, 80) || e.name, topic: linea(x.topic, 200), date: esDia(x.date) ? x.date : '', desc: txt(x.desc, 2000) };
  });
}
export function limpiarCtas(lista = []) {
  return (Array.isArray(lista) ? lista : []).slice(0, 30).map((c, i) => ({
    id: linea(c?.id, 20).replace(/[^A-Za-z0-9_-]/g, '') || `cta${i + 1}`,
    name: linea(c?.name, 80), url: /^https?:\/\//i.test(String(c?.url || '').trim()) ? linea(c.url, 600) : '', use: linea(c?.use, 120),
  }));
}
export function limpiarBloqueos(lista = []) {
  return (Array.isArray(lista) ? lista : []).filter((b) => esDia(b?.from) && esDia(b?.to) && b.from <= b.to).slice(0, 50)
    .map((b, i) => ({ id: linea(b.id, 20) || `b${i + 1}`, label: linea(b.label, 80) || 'Bloqueado', from: b.from, to: b.to }));
}

// ---------- Reglas del calendario ----------
// Franja bloqueada en la que cae el día (no se redacta ni se programa nada).
export const bloqueoDe = (bloqueos = [], dia) => bloqueos.find((b) => dia >= b.from && dia <= b.to) || null;
// El cierre más próximo (hoy o después).
export const proximoCierre = (entregables = [], dia) => entregables.filter((e) => e.date && diasEntre(dia, e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
// Tipo automático: urgencia a 7 días o menos de un cierre; curiosidad entre 8 y 21. Si no, lo elige una persona.
export function tipoSugerido(entregables = [], dia) {
  let curiosidad = false;
  for (const e of entregables) {
    if (!e.date) continue;
    const k = diasEntre(dia, e.date);
    if (k >= 0 && k <= 7) return 'urgencia';
    if (k > 7 && k <= 21) curiosidad = true;
  }
  return curiosidad ? 'curiosidad' : null;
}
export const emailVacio = (tipo = null) => ({ type: tipo, subject: '', preheader: '', body: '', cta: '', sendTime: '', status: 'borrador', skip: false });
export function limpiarEmail(e = {}) {
  return {
    type: Object.hasOwn(TIPOS, e.type) ? e.type : null,
    subject: linea(e.subject, 150), preheader: linea(e.preheader, 200), body: txt(e.body, 30000).trim(),
    cta: linea(e.cta, 20), sendTime: esHora(e.sendTime) ? e.sendTime : '', skip: Boolean(e.skip),
  };
}
export const tieneTexto = (e) => Boolean(e && (e.subject || e.body));
const CAMPOS_TEXTO = ['type', 'subject', 'preheader', 'body', 'cta', 'sendTime'];
// ¿Cambia el texto (lo que se enviaría)? Si un email aprobado cambia, vuelve a borrador y hay que aprobarlo otra vez.
export const cambiaTexto = (a = {}, b = {}) => CAMPOS_TEXTO.some((k) => String(a[k] ?? '') !== String(b[k] ?? ''));

// ---------- Programación en GHL ----------
// «2026-11-11 09:00 AM» (el formato de sendAt de GHL, en la zona horaria de la campaña).
export function sendAtGhl(dia, hora) {
  const [h, m] = hora.split(':').map(Number);
  const h12 = h % 12 || 12;
  return `${dia} ${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
// Cuánto tarda en salir a toda la audiencia en lotes: { lotes, minutos, fin: 'HH:MM' (puede pasar de medianoche) }.
export function estimarLotes(contactos, { tamano, cada }, hora = '09:00') {
  const n = Math.max(0, Math.round(Number(contactos) || 0));
  const lotes = Math.max(1, Math.ceil(n / tamano));
  const minutos = (lotes - 1) * cada;
  const [h, m] = hora.split(':').map(Number);
  const t = h * 60 + m + minutos;
  return { lotes, minutos, fin: `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, otroDia: t >= 24 * 60, porMinuto: Math.round(tamano / cada), pasaDiario: n > LIMITE_DIARIO_GHL };
}
// Qué hace la tarea de las 20:00 con el email del día siguiente. → { accion: 'programar' | 'nada' | 'aviso', motivo }
export function decidirProgramacion(estado, dia) {
  const e = estado.emails?.[dia];
  const b = bloqueoDe(estado.bloqueos, dia);
  if (b) return { accion: 'nada', motivo: `Franja bloqueada: «${b.label}».` };
  if (e?.skip) return { accion: 'nada', motivo: 'Día saltado.' };
  if (e && BLOQUEADO.has(e.status)) return { accion: 'nada', motivo: 'Ya estaba programado.' };
  if (!e || !tieneTexto(e)) return { accion: 'aviso', motivo: 'No hay email para mañana: no se programa nada.' };
  if (e.status !== 'aprobado') return { accion: 'aviso', motivo: `El email de mañana no está aprobado (está en «${ESTADOS[e.status]?.label || e.status}»): no se programa.` };
  const c = estado.config || {};
  const falta = [!c.audienceTag && 'la etiqueta de audiencia', !c.fromEmail && 'el email del remitente', !c.fromName && 'el nombre del remitente', !c.ghlUserId && 'el usuario de GHL', !e.subject && 'el asunto', !e.body && 'el cuerpo'].filter(Boolean);
  if (falta.length) return { accion: 'aviso', motivo: `Falta ${falta.join(', ')}: no se programa.` };
  return { accion: 'programar', motivo: '' };
}

// ---------- El HTML que va a GHL ----------
const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enlazar = (t) => t.replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)»"']/g, (u) => `<a href="${u}" style="color:#8a5a12">${u}</a>`);
// Párrafos (línea en blanco), saltos de línea, **negrita**, enlaces sueltos, el botón del CTA donde ponga [CTA] (o al
// final) y el pie legal. El texto se escapa: lo que se escribe es texto, no HTML.
export function htmlEmail(email, { ctas = [], pie = '', preheader = '' } = {}) {
  const cta = ctas.find((c) => c.id === email.cta && c.url);
  const boton = cta ? `<p style="margin:28px 0;text-align:center"><a href="${escH(cta.url)}" style="display:inline-block;padding:14px 26px;background:#1f1a12;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">${escH(cta.name || 'Entrar')}</a></p>` : '';
  const parrafo = (p) => `<p style="margin:0 0 16px">${enlazar(escH(p.trim()).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')).replace(/\n/g, '<br>')}</p>`;
  const partes = String(email.body || '').split(/\n\s*\n/).filter((p) => p.trim());
  let cuerpo = partes.map((p) => (p.trim() === '[CTA]' ? boton : parrafo(p))).join('');
  if (boton && !partes.some((p) => p.trim() === '[CTA]')) cuerpo += boton;
  const pieH = pie.trim() ? `<div style="margin-top:36px;padding-top:16px;border-top:1px solid #e5e0d5;font-size:12px;color:#8a8170">${pie.trim().split(/\n\s*\n/).map((p) => `<p style="margin:0 0 8px">${enlazar(escH(p)).replace(/\n/g, '<br>')}</p>`).join('')}</div>` : '';
  const pre = preheader ? `<div style="display:none;max-height:0;overflow:hidden">${escH(preheader)}</div>` : '';
  return `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff">${pre}<div style="max-width:600px;margin:0 auto;padding:24px 20px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#2a2118">${cuerpo}${pieH}</div></body></html>`;
}
