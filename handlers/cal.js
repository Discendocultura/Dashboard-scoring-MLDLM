// Calendario de suscripción (Google Calendar, iPhone…).
//   GET /api/cal            → (con sesión) { url, webcal } enlace privado de esta persona
//   GET /api/cal?t=<token>  → archivo .ics con hitos, eventos y tareas; se actualiza solo
//   GET /api/cal?op=1       → (con sesión de la Operativa) { url, webcal } enlace privado con SUS tareas de la Operativa
//        (las de todos los proyectos que tiene asignadas, con fecha); con ?t=… (token «calop:») → el .ics
import { contrasenaGeneralActiva } from '../lib/seguridad.js';
import { requireSession, getSession, signToken, verifyToken } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { conProducto, nombreProducto } from '../public/js/producto.js';
import { getEventos } from '../lib/eventos.js';
import { getTareas } from '../lib/tareas.js';
import { findUser, rolEn } from '../lib/users.js';
import { clienteActual } from '../lib/cliente.js';
import { hitosLanzamiento, icsCalendar, EVENTO_TIPOS } from '../public/js/calendario.js';
import { esMia, addDays } from '../public/js/tareas.js';
import { dayInMadrid } from '../public/js/scoring.js';
import { json, errorResponse } from '../lib/http.js';
import { richToText } from '../public/js/richtext.js';
import { todasLasTareas, puedeOperativa, visiblesOperativa } from '../lib/operativa.js';
import { cacheCompartida } from '../lib/store.js';
import { configDeEmbudos, embudosPermitidos } from '../lib/embudos.js';
import { asignadaA, PROYECTO_AGENCIA } from '../public/js/operativa.js';
import { ROL_CLIENTE, ROL_OPERATIVA } from '../public/js/roles.js';

// Lanzamientos que interesan: los que tienen alguna fecha en los últimos 90 días o en el futuro (máx. 4).
function relevantes(config) {
  const desde = addDays(dayInMadrid(new Date().toISOString()), -90);
  return Object.entries(config.launches)
    .map(([code, l]) => ({ code, l, last: hitosLanzamiento(l).map((h) => h.day).sort().pop() || '' }))
    .filter((x) => !x.last || x.last >= desde)
    .sort((a, b) => b.last.localeCompare(a.last))
    .slice(0, 4);
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('t');
    if (url.searchParams.get('op') === '1') return feedOperativa(request, url, token);
    if (!token) {
      const s = await requireSession(request);
      const t = await signToken(`cal:${s.uid || s.role}`);
      const c = clienteActual();
      const feed = `${url.origin}/api/cal?t=${encodeURIComponent(t)}${c.principal ? '' : `&c=${encodeURIComponent(c.id)}`}`;
      return json({ url: feed, webcal: feed.replace(/^https?:/, 'webcal:') });
    }
    const who = (await verifyToken(token))?.match(/^cal:(.+)$/)?.[1];
    if (!who) return new Response('Enlace no válido', { status: 403 });
    let sess;
    // La contraseña general de setter solo da acceso al cliente principal (igual que al iniciar sesión).
    if (who === 'setter' && !clienteActual().principal) return new Response('Sin acceso a este cliente', { status: 403 });
    // Las contraseñas generales desactivadas por el superadmin tampoco sirven para el calendario.
    if ((who === 'admin' || who === 'setter') && !(await contrasenaGeneralActiva())) return new Response('Enlace no válido', { status: 403 });
    if (who === 'admin' || who === 'setter') sess = { role: who, uid: '' };
    else {
      const u = await findUser(who);
      if (!u || u.activo === false || !u.rol) return new Response('Usuario desactivado o sin acceso a este cliente', { status: 403 });
      if (u.rol === ROL_CLIENTE || u.rol === ROL_OPERATIVA) return new Response('Sin acceso al calendario del equipo', { status: 403 });
      sess = { role: u.rol, uid: u.id, embudos: embudosPermitidos(u, clienteActual().id, u.rol) };
    }
    const config = configDeEmbudos(await getConfig(), sess.embudos);
    const items = [];
    for (const { code, l } of relevantes(config)) {
      const [eventos, tareas] = await Promise.all([getEventos(code), getTareas(code)]);
      const tag = ` · ${l.name}`;
      for (const h of hitosLanzamiento(l)) items.push({ uid: `${code}-${h.id}@${clienteActual().id}`, titulo: conProducto(`${h.icon} ${h.titulo}${tag}`, nombreProducto(config)), day: h.day, time: h.time, minutos: h.minutos });
      for (const e of eventos) {
        const tipo = EVENTO_TIPOS.find((t) => t.id === e.tipo);
        items.push({ uid: `${code}-${e.id}@${clienteActual().id}`, titulo: `${tipo?.icon || '📌'} ${e.titulo}${tag}`, day: e.fecha, fin: e.fin, time: e.hora, minutos: 60, notas: e.notas });
      }
      for (const t of tareas) {
        if (!t.fecha || (sess.role !== 'admin' && !esMia(t, sess))) continue;
        items.push({ uid: `${code}-${t.id}@${clienteActual().id}`, titulo: `${t.hecha ? '✅' : '☐'} ${t.titulo}${tag}`, day: t.fecha, notas: [richToText(t.notas), `Márcala en ${url.origin}/#tareas`].filter(Boolean).join('\n\n') });
      }
    }
    return new Response(icsCalendar(`Lanzamientos · ${clienteActual().nombre}`, items), {
      headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store', 'content-disposition': `inline; filename="lanzamientos-${clienteActual().id}.ics"` },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// Sus tareas de la Operativa (todos los proyectos), como calendario al que suscribirse.
async function feedOperativa(request, url, token) {
  if (!token) {
    // Como el resto de la Operativa: vale también el perfil «Solo Operativa» (requireSession lo rechazaría).
    const s = await getSession(request);
    if (!s) return json({ error: 'No autorizado' }, 401);
    if (!s.uid || !puedeOperativa(s)) return json({ error: 'Solo para quien usa la Operativa con su usuario' }, 403);
    // Con la marca de su último cambio de contraseña: al cambiarla, los enlaces anteriores dejan de valer.
    const t = await signToken(`calop:${s.uid}:${s.user?.sesionesDesde || 0}`);
    const feed = `${url.origin}/api/cal?op=1&t=${encodeURIComponent(t)}`;
    return json({ url: feed, webcal: feed.replace(/^https?:/, 'webcal:') });
  }
  const [, uid, marca] = (await verifyToken(token))?.match(/^calop:([^:]+):(\d+)$/) || [];
  if (!uid) return new Response('Enlace no válido', { status: 403 });
  const user = await findUser(uid);
  if (!user || user.activo === false) return new Response('Usuario desactivado', { status: 403 });
  if (String(user.sesionesDesde || 0) !== marca) return new Response('Enlace caducado: crea uno nuevo en la Operativa → 📅 Mi calendario', { status: 403 });
  const s = { uid, user, superadmin: Boolean(user.superadmin) };
  if (!puedeOperativa(s)) return new Response('Sin acceso a la Operativa', { status: 403 });
  const desde = addDays(dayInMadrid(new Date().toISOString()), -30);
  const items = visiblesOperativa(await cacheCompartida('op-tareas-feed', 5 * 60_000, todasLasTareas), s)
    .filter((t) => t.fecha && t.fecha >= desde && asignadaA(t, uid, t.cliente === PROYECTO_AGENCIA ? '' : rolEn(user, t.cliente)))
    .map((t) => ({ uid: `op-${t.cliente}-${t.code}-${t.id}@lanzamientos`, titulo: `${t.hecha ? '✅' : '☐'} ${t.titulo} · ${t.clienteNombre || t.cliente}`, day: t.fecha, notas: [richToText(t.notas || ''), `Ábrela en ${url.origin}/#operativa`].filter(Boolean).join('\n\n') }));
  return new Response(icsCalendar('Mis tareas · Operativa', items), {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store', 'content-disposition': 'inline; filename="mis-tareas.ics"' },
  });
}
