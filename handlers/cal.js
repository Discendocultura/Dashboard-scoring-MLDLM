// Calendario de suscripción (Google Calendar, iPhone…).
//   GET /api/cal            → (con sesión) { url, webcal } enlace privado de esta persona
//   GET /api/cal?t=<token>  → archivo .ics con hitos, eventos y tareas; se actualiza solo
import { requireSession, signToken, verifyToken } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { getEventos } from '../lib/eventos.js';
import { getTareas } from '../lib/tareas.js';
import { findUser } from '../lib/users.js';
import { hitosLanzamiento, icsCalendar, EVENTO_TIPOS } from '../public/js/calendario.js';
import { esMia, addDays } from '../public/js/tareas.js';
import { dayInMadrid } from '../public/js/scoring.js';
import { json, errorResponse } from '../lib/http.js';
import { richToText } from '../public/js/richtext.js';

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
    if (!token) {
      const s = await requireSession(request, { equipo: true });
      const t = await signToken(`cal:${s.uid || s.role}`);
      const feed = `${url.origin}/api/cal?t=${encodeURIComponent(t)}`;
      return json({ url: feed, webcal: feed.replace(/^https?:/, 'webcal:') });
    }
    const who = (await verifyToken(token))?.match(/^cal:(.+)$/)?.[1];
    if (!who) return new Response('Enlace no válido', { status: 403 });
    let sess;
    if (who === 'admin' || who === 'setter') sess = { role: who, uid: '' };
    else {
      const u = await findUser(who);
      if (!u || u.activo === false) return new Response('Usuario desactivado', { status: 403 });
      sess = { role: u.rol, uid: u.id };
    }
    const config = await getConfig();
    const items = [];
    for (const { code, l } of relevantes(config)) {
      const [eventos, tareas] = await Promise.all([getEventos(code), getTareas(code)]);
      const tag = ` · ${l.name}`;
      for (const h of hitosLanzamiento(l)) items.push({ uid: `${code}-${h.id}@mldlm`, titulo: `${h.icon} ${h.titulo}${tag}`, day: h.day, time: h.time, minutos: h.minutos });
      for (const e of eventos) {
        const tipo = EVENTO_TIPOS.find((t) => t.id === e.tipo);
        items.push({ uid: `${code}-${e.id}@mldlm`, titulo: `${tipo?.icon || '📌'} ${e.titulo}${tag}`, day: e.fecha, fin: e.fin, time: e.hora, minutos: 60, notas: e.notas });
      }
      for (const t of tareas) {
        if (!t.fecha || (sess.role !== 'admin' && !esMia(t, sess))) continue;
        items.push({ uid: `${code}-${t.id}@mldlm`, titulo: `${t.hecha ? '✅' : '☐'} ${t.titulo}${tag}`, day: t.fecha, notas: [richToText(t.notas), `Márcala en ${url.origin}/#tareas`].filter(Boolean).join('\n\n') });
      }
    }
    return new Response(icsCalendar('Lanzamientos MLDLM', items), {
      headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store', 'content-disposition': 'inline; filename="lanzamientos-mldlm.ics"' },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
