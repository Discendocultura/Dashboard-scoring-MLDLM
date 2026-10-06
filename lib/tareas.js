// Tareas de cada lanzamiento: se guardan en un "Custom Value" de GHL por lanzamiento (lsd_tareas_<código>).
import { getCustomValue, saveCustomValue, sendEmail } from './ghl.js';
import { FASE_IDS, FASES, SUB_IDS } from '../public/js/tareas.js';
import { listUsers, saveUsers, ensureContact, emailLayout } from './users.js';
import { getRoles } from './roles.js';
import { labelRol, ROL_ID_RE } from '../public/js/roles.js';
import { escapeHtml } from './http.js';
import { sanitizeRich, richToEmail } from '../public/js/richtext.js';

export const MAX_TAREAS = 300;
const name = (code) => `lsd_tareas_${code}`;
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function getTareas(code) {
  const cv = await getCustomValue(name(code));
  if (!cv?.value) return [];
  try {
    const parsed = JSON.parse(cv.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error(`Tareas de ${code} corruptas, se ignoran`);
    return [];
  }
}

export const saveTareas = (code, tareas) => saveCustomValue(name(code), JSON.stringify(tareas));

// Asignación: { tipo: 'persona', id } | { tipo: 'rol', rol } | null.
export function sanitizeAsignado(a, users) {
  if (a?.tipo === 'rol' && (a.rol === 'admin' || ROL_ID_RE.test(String(a.rol || '')))) return { tipo: 'rol', rol: a.rol };
  if (a?.tipo === 'persona' && users.some((u) => u.id === a.id)) return { tipo: 'persona', id: a.id };
  return null;
}

// Campos editables de una tarea.
export function sanitizeTarea(input, users) {
  const titulo = str(input?.titulo, 200);
  if (!titulo) throw Object.assign(new Error('Falta el título'), { status: 400, publicMessage: 'La tarea necesita un título' });
  return {
    titulo,
    notas: sanitizeRich(input?.notas),
    fase: FASE_IDS.includes(input?.fase) ? input.fase : 'preparacion',
    sub: SUB_IDS.includes(input?.sub) ? input.sub : '', // subcategoría (solo se usa en Preparación; vacío = automática)
    fecha: ISO_DAY.test(String(input?.fecha || '').trim()) ? String(input.fecha).trim() : '',
    asignado: sanitizeAsignado(input?.asignado, users),
  };
}

// Personas a las que avisar de una asignación (sin incluir a quien la hace).
export function destinatarios(asignado, users, exceptUid = '') {
  if (!asignado) return [];
  const activos = users.filter((u) => u.activo !== false && u.id !== exceptUid);
  if (asignado.tipo === 'persona') return activos.filter((u) => u.id === asignado.id);
  return activos.filter((u) => u.rol === asignado.rol);
}

export function asignadoLabel(asignado, users, roles = []) {
  if (!asignado) return 'Sin asignar';
  if (asignado.tipo === 'rol') return `Rol ${labelRol(asignado.rol, roles)}`;
  return users.find((u) => u.id === asignado.id)?.nombre || 'Persona eliminada';
}

// ---------- Comentarios ----------
export const MAX_COMENTARIOS = 100;
export const MAX_COMENTARIO = 2000;
const mismo = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Personas mencionadas: las activas cuyo «@Nombre completo» aparece en el texto.
export function mencionesDe(texto, users) {
  const t = mismo(texto);
  return users.filter((u) => u.activo !== false && u.nombre && t.includes(`@${mismo(u.nombre)}`)).map((u) => u.id);
}

// Email a quien mencionan en un comentario (no a quien lo escribe).
export async function avisarMencion(t, c, { launchName, dashboardUrl, exceptUid }) {
  const users = await listUsers({ fresh: true });
  let enviados = 0;
  let changed = false;
  for (const u of users.filter((x) => c.menciones.includes(x.id) && x.id !== exceptUid && x.activo !== false)) {
    try {
      if (!u.contactId) changed = true;
      const contactId = await ensureContact(u);
      const texto = escapeHtml(c.texto).replace(/\n/g, '<br>');
      const body = `<p>Hola ${escapeHtml(String(u.nombre || '').split(/\s+/)[0])},</p><p><strong>${escapeHtml(c.nombre)}</strong> te ha mencionado en la tarea <strong>${escapeHtml(t.titulo)}</strong> (${escapeHtml(launchName)}):</p><blockquote style="margin:0 0 12px;padding:10px 14px;background:#fff;border-left:3px solid #c49b79;border-radius:6px">${texto}</blockquote>`;
      await sendEmail(contactId, { subject: `${c.nombre} te ha mencionado: ${t.titulo}`.slice(0, 120), html: emailLayout('Te han mencionado', body, { url: dashboardUrl, button: 'Ver la tarea' }) });
      enviados++;
    } catch (e) {
      console.error('Aviso de mención', e);
    }
  }
  if (changed) await saveUsers(users).catch(() => {});
  return enviados;
}

const fechaLarga = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '');

// Envía un email por cada tarea nueva asignada a cada destinatario (una sola petición por persona).
export async function avisarAsignaciones(tareas, { launchName, dashboardUrl, exceptUid }) {
  const [users, roles] = await Promise.all([listUsers({ fresh: true }), getRoles()]);
  const porPersona = new Map();
  for (const t of tareas) {
    for (const u of destinatarios(t.asignado, users, exceptUid)) {
      if (!porPersona.has(u.id)) porPersona.set(u.id, { user: u, tareas: [] });
      porPersona.get(u.id).tareas.push(t);
    }
  }
  let enviados = 0;
  const errores = [];
  let changed = false;
  for (const { user, tareas: ts } of porPersona.values()) {
    try {
      const had = user.contactId;
      const contactId = await ensureContact(user);
      if (!had) changed = true;
      const lista = ts.map((t) => {
        const fase = FASES.find((f) => f.id === t.fase);
        return `<li style="margin:0 0 10px"><strong>${escapeHtml(t.titulo)}</strong><br><span style="font-size:13px;color:#7a6458">${fase ? `${fase.icon} ${escapeHtml(fase.label)}` : ''}${t.fecha ? ` · para el ${escapeHtml(fechaLarga(t.fecha))}` : ''}${t.asignado?.tipo === 'rol' ? ` · asignada a tu rol (${escapeHtml(labelRol(t.asignado.rol, roles))})` : ''}</span>${t.notas ? `<div style="font-size:14px;margin-top:6px">${richToEmail(t.notas)}</div>` : ''}</li>`;
      }).join('');
      const nombre = String(user.nombre || '').split(/\s+/)[0];
      const subject = ts.length === 1 ? `Nueva tarea: ${ts[0].titulo}`.slice(0, 120) : `Tienes ${ts.length} tareas nuevas · ${launchName}`;
      const body = `<p>Hola ${escapeHtml(nombre)},</p><p>Tienes ${ts.length === 1 ? 'una tarea nueva' : `${ts.length} tareas nuevas`} en <strong>${escapeHtml(launchName)}</strong>:</p><ul style="padding-left:18px">${lista}</ul><p style="font-size:13px;color:#7a6458">Cuando la termines, márcala como hecha en la pestaña Tareas.</p>`;
      await sendEmail(contactId, { subject, html: emailLayout(ts.length === 1 ? 'Nueva tarea' : 'Tareas nuevas', body, { url: dashboardUrl, button: 'Ver mis tareas' }) });
      enviados++;
    } catch (e) {
      console.error('Aviso de tarea', e);
      errores.push(user.nombre);
    }
  }
  if (changed) await saveUsers(users).catch(() => {});
  return { enviados, errores };
}
