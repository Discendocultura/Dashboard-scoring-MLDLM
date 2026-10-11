// Email «¿Y ahora qué?» a quien acaba de crear un embudo o un lanzamiento (pantalla de enhorabuena).
//   POST /api/siguientes-pasos { embudo: <id>, launch?: <código> } → { enviado, email, pasos } · permiso «config»
// Sale desde el GHL de la agencia (como la recuperación de contraseña), con el remitente «Equipo Estelabs» si
// EMAIL_REMITENTE está puesto; el contenido lleva la marca y el nombre del cliente.
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { enPrincipal, clienteActual } from '../lib/cliente.js';
import { listUsers, ensureContact, emailLayout, guardarContactos } from '../lib/users.js';
import { sendEmail } from '../lib/ghl.js';
import { env } from '../lib/env.js';
import { siguientesPasos } from '../public/js/siguientes-pasos.js';
import { json, readBody, errorResponse, escapeHtml } from '../lib/http.js';

const remitente = () => {
  const dir = String(env.EMAIL_REMITENTE || '').trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(dir) ? `Equipo Estelabs <${dir}>` : undefined;
};

export function emailPasos({ nombre, que, cliente, pasos }) {
  const hola = String(nombre || '').trim().split(/\s+/)[0];
  return `<p>${hola ? `¡Enhorabuena, ${escapeHtml(hola)}!` : '¡Enhorabuena!'} 🎉</p>
    <p>Ya está creado ${escapeHtml(que)} en el dashboard de <strong>${escapeHtml(cliente)}</strong>. Esto es lo que toca ahora, en este orden:</p>
    <ol style="padding-left:20px;margin:0">${pasos.map((p) => `<li style="margin:0 0 12px"><strong>${p.icono} ${escapeHtml(p.titulo)}</strong><br><span style="color:#5a4a42">${escapeHtml(p.detalle)}</span></li>`).join('')}</ol>
    <p style="font-size:13px;color:#7a6458">Vas a ver lo mismo en el dashboard: lo que falte te lo marca la barra «Listo para lanzar» de Configuración.</p>`;
}

export async function POST(request) {
  try {
    const s = await requireSession(request, { permiso: 'config' });
    const b = await readBody(request);
    const config = await getConfig();
    const embudo = config.embudos.find((e) => e.id === b.embudo);
    if (!embudo) return json({ error: 'Embudo no encontrado' }, 404);
    const code = String(b.launch || '');
    const launch = code ? config.launches[code] || null : null;
    if (code && !launch) return json({ error: 'Lanzamiento no encontrado' }, 404);
    const pasos = siguientesPasos({ embudo, launch });
    if (!s.user?.email) return json({ enviado: false, motivo: 'Has entrado con la contraseña general: no hay email al que mandarlo.', pasos });
    const que = launch ? `el lanzamiento «${launch.name}»` : `el embudo «${embudo.nombre}»`;
    const dashboardUrl = `${new URL(request.url).origin}/${clienteActual().principal ? '' : `?c=${encodeURIComponent(clienteActual().id)}`}`;
    // El email con la marca del cliente; el envío, desde el GHL de la agencia.
    const html = await emailLayout(launch ? '¡Nuevo lanzamiento creado!' : '¡Nuevo embudo creado!', emailPasos({ nombre: s.user.nombre, que, cliente: clienteActual().nombre, pasos }), { url: dashboardUrl, button: 'Abrir el dashboard' });
    const subject = `🎉 ${launch ? 'Lanzamiento' : 'Embudo'} creado: tus siguientes pasos`;
    try {
      await enPrincipal(async () => {
        const users = await listUsers({ fresh: true });
        const u = users.find((x) => x.id === s.user.id);
        if (!u) throw new Error('Usuario no encontrado');
        const nuevo = !u.contactId;
        const contactId = await ensureContact(u);
        const emailFrom = remitente();
        try { await sendEmail(contactId, { subject, html, emailFrom }); } catch (e) {
          if (!emailFrom) throw e;
          await sendEmail(contactId, { subject, html });
        }
        if (nuevo) await guardarContactos([u]);
      });
    } catch (e) {
      console.error('Email de siguientes pasos', e.message || e);
      return json({ enviado: false, motivo: 'No se pudo enviar el email ahora.', email: s.user.email, pasos });
    }
    return json({ enviado: true, email: s.user.email, pasos });
  } catch (e) {
    return errorResponse(e);
  }
}
