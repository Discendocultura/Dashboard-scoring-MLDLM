// Vista de agencia (solo superadmin) y auditor automático de cada mañana.
//   GET  /api/agencia[?fresh=1]          → resumen de todos los clientes (panel de agencia)
//   GET  /api/agencia?key=DIGEST_KEY      → lo llama el programador de tareas cada mañana: manda el resumen
//                                           (críticos del auditor, tareas vencidas, próximos hitos) a los superadmin
//   POST { op: 'enviar' }                 → enviarlo ahora (prueba)
import { db } from '../lib/store.js';
import { requireSuperadmin, fallaClaveTarea } from '../lib/auth.js';
import { env } from '../lib/env.js';
import { enPrincipal, clienteActual } from '../lib/cliente.js';
import { listUsers, ensureContact, emailLayout, guardarContactos } from '../lib/users.js';
import { sendEmail } from '../lib/ghl.js';
import { resumenAgencia, resumenDeCliente } from '../lib/agencia.js';
import { listClientes } from '../lib/clientes.js';
import { informesPendientes } from '../lib/informe-envio.js';
import { getConfig } from '../lib/config-store.js';
import { sendDigestUnaVez } from '../lib/digest.js';
import { json, readBody, errorResponse, escapeHtml } from '../lib/http.js';

const eur = (n) => (n == null ? '–' : `${Math.round(n).toLocaleString('es-ES')} €`);
const fecha = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');

// Email con lo importante de cada cliente: primero los que tienen críticos.
export function htmlResumen(r, dashboardUrl) {
  const filas = [...r.clientes].sort((a, b) => (b.lanzamiento?.auditor.critico || 0) - (a.lanzamiento?.auditor.critico || 0)).map((c) => {
    const url = `${dashboardUrl}${c.principal ? '' : `?c=${encodeURIComponent(c.id)}`}`;
    if (c.error || !c.conectado) return `<li><strong>${escapeHtml(c.nombre)}</strong>: ${escapeHtml(c.error || 'GHL sin conectar')}</li>`;
    const l = c.lanzamiento;
    const vencidas = (l?.vencidas || 0) + (c.vsls || []).reduce((t, v) => t + v.vencidas, 0);
    const criticos = [...(l?.auditor.criticos || []), ...(c.vsls || []).flatMap((v) => v.auditor.criticos.map((t) => `${v.nombre}: ${t}`))];
    const partes = [
      l ? `${escapeHtml(l.nombre)}: ${l.registros ?? '–'} registros · ${l.ventas ?? '–'} ventas${l.roas ? ` · ROAS ${l.roas.toFixed(1)}` : ''}${l.proximoHito ? ` · ${escapeHtml(l.proximoHito.label)} el ${fecha(l.proximoHito.dia)}` : ''}` : 'Sin lanzamiento en curso',
      vencidas ? `<span style="color:#b3261e">${vencidas} tareas vencidas</span>` : '',
      c.alta && c.alta.hechos < c.alta.total ? `alta: ${c.alta.hechos}/${c.alta.total}` : '',
    ].filter(Boolean).join(' · ');
    return `<li style="margin:0 0 12px"><a href="${escapeHtml(url)}" style="color:inherit"><strong>${escapeHtml(c.nombre)}</strong></a> — ${partes}
      ${criticos.length ? `<ul style="margin:4px 0 0;color:#b3261e">${criticos.map((t) => `<li>🔴 ${escapeHtml(t)}</li>`).join('')}</ul>` : ''}</li>`;
  }).join('');
  const totalCriticos = r.clientes.reduce((t, c) => t + (c.lanzamiento?.auditor.critico || 0) + (c.vsls || []).reduce((s, v) => s + v.auditor.critico, 0), 0);
  return {
    subject: totalCriticos ? `Agencia: ${totalCriticos} críticos hoy en ${r.clientes.length} clientes` : `Agencia: todo en orden en ${r.clientes.length} clientes`,
    body: `<p>Resumen de hoy (${escapeHtml(fecha(r.hoy))}) de todos los clientes:</p><ul style="padding-left:18px">${filas}</ul>
      <p style="font-size:13px;color:#7a6458">Inversión de los últimos 7 días: ${r.clientes.map((c) => `${escapeHtml(c.nombre)} ${eur(c.lanzamiento?.inversion7)}`).join(' · ')}</p>`,
    totalCriticos,
  };
}

async function enviar(request) {
  const r = await resumenAgencia();
  const dashboardUrl = new URL('/', request.url).toString();
  const { subject, body, totalCriticos } = htmlResumen(r, dashboardUrl);
  return enPrincipal(async () => {
    const users = (await listUsers({ fresh: true })).filter((u) => u.superadmin && u.activo !== false && u.email);
    let enviados = 0;
    let nuevos = false;
    for (const u of users) {
      try {
        if (!u.contactId) nuevos = true;
        const cid = await ensureContact(u);
        await sendEmail(cid, { subject, html: await emailLayout('Resumen de la agencia', body, { url: dashboardUrl, button: 'Abrir el panel de agencia' }) });
        enviados++;
      } catch (e) {
        console.error('Resumen agencia', e);
      }
    }
    if (nuevos) await guardarContactos(users);
    return { enviados, destinatarios: users.length, criticos: totalCriticos };
  });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    if (key != null) {
      { const falla = fallaClaveTarea(key, env.DIGEST_KEY); if (falla) return json({ error: 'No autorizado', motivo: falla }, 401); }
      // Una tarea programada por cliente (…&c=<cliente>): sus informes automáticos (lanzamientos recién
      // cerrados y VSL los lunes) y su resumen diario. Así cada llamada es pequeña y no se pasa del
      // límite de peticiones de Cloudflare. Sin c=: solo el resumen de la agencia (auditor).
      if (url.searchParams.has('c')) {
        const c = clienteActual();
        const out = { cliente: c.id, informes: [], resumenDiario: null };
        try { out.informes = await informesPendientes(url.origin); } catch (e) { out.errorInformes = String(e.publicMessage || e.message).slice(0, 200); }
        // Limpieza: las marcas de «visita ya contada» del meteórico de hace más de un día ya no hacen falta.
        if (db()) await db().prepare("DELETE FROM intentos WHERE clave LIKE 'visita:%' AND desde < ?").bind(Date.now() - 86_400_000).run().catch(() => {});
        const config = await getConfig({ fresh: true });
        if (config.digestEmail) {
          try { out.resumenDiario = await sendDigestUnaVez(config, new URL('/', request.url).toString()); } catch (e) { out.resumenDiario = { sent: false, error: String(e.publicMessage || e.message).slice(0, 200) }; }
        }
        return json(out);
      }
      return json(await enviar(request));
    }
    await requireSuperadmin(request);
    // ?cliente=<id>: recalcula solo ese cliente (el panel los actualiza de uno en uno).
    const id = url.searchParams.get('cliente');
    if (id) {
      const c = (await listClientes({ fresh: true })).find((x) => x.id === id);
      if (!c) return json({ error: 'Cliente no encontrado' }, 404);
      return json(await resumenDeCliente(c));
    }
    return json(await resumenAgencia({ maxCalcular: 0 }));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    await requireSuperadmin(request);
    const body = await readBody(request);
    if (body.op !== 'enviar') return json({ error: 'Operación no válida' }, 400);
    return json(await enviar(request));
  } catch (e) {
    return errorResponse(e);
  }
}
