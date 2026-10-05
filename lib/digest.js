// Resumen diario del lanzamiento en curso: se envía por email desde GHL.
import { contactsByTag, findContactByEmail, sendEmail } from './ghl.js';
import { enrichLead, computeMetrics, avisosLanzamiento } from '../public/js/metrics.js';
import { dayInMadrid, NEXT_STEPS } from '../public/js/scoring.js';
import { escapeHtml } from './http.js';

// Lanzamiento en curso: el último cuya captación ya ha empezado (o el último creado).
export function currentLaunch(config, today = dayInMadrid(new Date().toISOString())) {
  const entries = Object.entries(config.launches);
  const started = entries.filter(([, l]) => l.inicioCaptacion && l.inicioCaptacion <= today)
    .sort((a, b) => b[1].inicioCaptacion.localeCompare(a[1].inicioCaptacion));
  if (started.length) return started[0][0];
  return entries.sort((a, b) => String(b[1].createdAt).localeCompare(String(a[1].createdAt)))[0]?.[0] || null;
}

async function allLeads(tag, fields) {
  const out = [];
  let cursor = null;
  do {
    const page = await contactsByTag(tag, cursor, fields);
    out.push(...page.contacts);
    cursor = page.cursor;
  } while (cursor);
  return out;
}

export async function buildDigest(config, dashboardUrl) {
  const code = currentLaunch(config);
  if (!code) return null;
  const launch = config.launches[code];
  const fields = launch.compraDateField ? [launch.compraDateField] : [];
  const leads = (await allLeads(launch.registroTag, fields)).map((c) => enrichLead(c, code, config));
  const m = computeMetrics(leads, launch);
  const yesterday = dayInMadrid(new Date(Date.now() - 86_400_000).toISOString());
  const nuevosAyer = leads.filter((l) => dayInMadrid(l.dateAdded) === yesterday).length;
  const ventasAyer = leads.filter((l) => l.s.compra && l.s.fecha_compra === yesterday).length;
  const pendientes = (fn) => leads.filter((l) => fn(l) && !l.s.compra && !l.s.wa_enviado).sort((a, b) => b.score - a.score);
  const calientes = pendientes((l) => l.estado.id === 'muy-caliente');
  const vipSinCompra = pendientes((l) => l.s.vip);
  const avisos = avisosLanzamiento(leads, launch, m);

  const list = (rows) => (rows.length
    ? `<ol>${rows.slice(0, 15).map((l) => `<li><strong>${escapeHtml(l.name || l.email)}</strong> · ${l.score} pts · ${escapeHtml(NEXT_STEPS[l.step])}</li>`).join('')}</ol>${rows.length > 15 ? `<p>…y ${rows.length - 15} más.</p>` : ''}`
    : '<p>Ninguna 🎉</p>');
  const pct = (n, d) => (d ? `${Math.round((n / d) * 1000) / 10}%` : '–');
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#241f1c">
    <h2 style="margin:0 0 4px">Resumen de ${escapeHtml(launch.name)}</h2>
    <p style="margin:0 0 16px;color:#6b625d">${escapeHtml(yesterday)} · <a href="${escapeHtml(dashboardUrl)}">Abrir el dashboard</a></p>
    <table cellpadding="6" style="border-collapse:collapse">
      <tr><td>Registros</td><td><strong>${m.total}</strong> (+${nuevosAyer} ayer)</td></tr>
      <tr><td>Entradas VIP</td><td><strong>${m.vip}</strong> · ${pct(m.vip, m.total)}</td></tr>
      <tr><td>Asistencia al directo</td><td><strong>${m.live}</strong> · ${pct(m.live, m.total)}</td></tr>
      <tr><td>Ventas</td><td><strong>${m.compra}</strong> (+${ventasAyer} ayer) · ${pct(m.compra, m.total)}</td></tr>
      <tr><td>Contactadas por WhatsApp</td><td><strong>${m.setter.contactadas}</strong></td></tr>
    </table>
    ${m.objetivos.length ? `<h3>🎯 Objetivos</h3><table cellpadding="6" style="border-collapse:collapse">${m.objetivos.map((o) => `<tr><td>${escapeHtml(o.label)}</td><td><strong>${o.unit === 'eur' ? `${Math.round(o.actual).toLocaleString('es-ES')} €` : o.actual}</strong> de ${o.unit === 'eur' ? `${Math.round(o.meta).toLocaleString('es-ES')} €` : o.meta} · ${Math.round(o.pct * 100)}%</td></tr>`).join('')}</table>` : ''}
    ${avisos.length ? `<h3>⚠️ Revisa</h3><ul>${avisos.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>` : ''}
    <h3>🔥 Muy calientes sin contactar (${calientes.length})</h3>${list(calientes)}
    <h3>⭐ VIP sin comprar ni contactar (${vipSinCompra.length})</h3>${list(vipSinCompra)}
  </div>`;
  return { code, subject: `Leads ${launch.name}: ${calientes.length} muy calientes por contactar`, html };
}

export async function sendDigest(config, dashboardUrl) {
  if (!config.digestEmail) throw Object.assign(new Error('Falta el email del resumen en la configuración'), { status: 400, publicMessage: 'Configura el email que recibe el resumen diario' });
  const contact = await findContactByEmail(config.digestEmail);
  if (!contact) throw Object.assign(new Error('Email del resumen no encontrado en GHL'), { status: 400, publicMessage: `El email ${config.digestEmail} tiene que existir como contacto en GHL para poder enviarle el resumen` });
  const digest = await buildDigest(config, dashboardUrl);
  if (!digest) return { sent: false, reason: 'No hay lanzamientos' };
  await sendEmail(contact.id, digest);
  return { sent: true, launch: digest.code, subject: digest.subject };
}
