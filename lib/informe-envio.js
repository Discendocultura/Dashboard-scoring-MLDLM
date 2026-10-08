// Envío del informe al cliente: por email a las personas con el rol «Cliente» (desde su GHL), con el
// enlace compartible. Automático cada mañana (con el resumen de la agencia): al cerrar el carrito de
// un lanzamiento y, en las VSL que lo tengan activado, los lunes.
import { signToken, verifyToken } from './auth.js';
import { clienteActual } from './cliente.js';
import { getConfig, saveConfig } from './config-store.js';
import { listUsers, ensureContact, emailLayout, guardarContactos } from './users.js';
import { sendEmail } from './ghl.js';
import { escapeHtml } from './http.js';
import { reintentando, versionDe } from './store.js';
import { informeLanzamiento, informeVslSemana } from './informe.js';
import { dayInMadrid } from '../public/js/scoring.js';
import { ROL_CLIENTE } from '../public/js/roles.js';

// Enlace firmado que caduca a los 180 días (cada informe enviado lleva uno nuevo). que = 'l:<código>' o 'v:<id VSL>'.
// Los enlaces antiguos, sin caducidad, siguen valiendo (se anulan cambiando SESSION_SECRET).
export const DIAS_ENLACE_INFORME = 180;
export async function enlaceInforme(origin, que) {
  const hasta = Math.floor(Date.now() / 1000) + DIAS_ENLACE_INFORME * 86_400;
  const t = await signToken(`informe|${clienteActual().id}|${que}|${hasta}`);
  const [tipo, id] = que.split(':');
  const c = clienteActual().principal ? '' : `&c=${encodeURIComponent(clienteActual().id)}`;
  return `${origin}/api/informe?${tipo === 'v' ? 'v' : 'l'}=${encodeURIComponent(id)}${c}&t=${encodeURIComponent(t)}`;
}
export async function tokenValido(t, que) {
  const v = await verifyToken(t);
  const base = `informe|${clienteActual().id}|${que}`;
  if (v === base) return true; // enlace antiguo, sin caducidad
  const m = String(v || '').match(/^(.*)\|(\d+)$/);
  return Boolean(m && m[1] === base && Number(m[2]) > Date.now() / 1000);
}

export async function enviarInforme(origin, que, { extra = [] } = {}) {
  const [tipo, id] = que.split(':');
  const users = (await listUsers({ fresh: true })).filter((u) => u.rol === ROL_CLIENTE && u.activo !== false && u.email);
  const destinatarios = [...users, ...extra];
  const url = await enlaceInforme(origin, que);
  // Sin nadie a quien mandarlo no se calcula (el informe pide todos los leads y Meta: es caro).
  if (!destinatarios.length) return { enviados: 0, destinatarios: 0, url };
  const inf = tipo === 'v' ? await informeVslSemana(id) : await informeLanzamiento(id);
  let enviados = 0;
  let nuevos = false;
  const body = `<p>Hola,</p><p>Ya tienes el informe: <strong>${escapeHtml(inf.asunto)}</strong>. Resultados frente a objetivos, embudo, anuncios ganadores, avatar comprador y aprendizajes.</p>`;
  for (const u of destinatarios) {
    try {
      if (!u.contactId) nuevos = true;
      const cid = await ensureContact(u);
      await sendEmail(cid, { subject: inf.asunto, html: await emailLayout(inf.asunto, body, { url, button: 'Ver el informe' }) });
      enviados++;
    } catch (e) {
      console.error('Informe', e.message);
    }
  }
  if (nuevos) await guardarContactos(users);
  return { enviados, destinatarios: destinatarios.length, url };
}

// Cada mañana: informes pendientes de este cliente.
export async function informesPendientes(origin, hoy = dayInMadrid(new Date().toISOString())) {
  const config = await getConfig({ fresh: true });
  const hechos = [];
  const marcar = async (fn) => reintentando(async () => {
    const actual = await getConfig({ fresh: true });
    fn(actual);
    await saveConfig(actual, { version: versionDe(actual), motivo: 'Informe enviado al cliente' });
  });
  for (const [code, l] of Object.entries(config.launches)) {
    const cierre = String(l.cierreCarrito || '').slice(0, 10);
    // Cerrado ayer o en la última semana, y aún sin mandar.
    if (!cierre || cierre >= hoy || l.informeEnviado || cierre < new Date(Date.parse(`${hoy}T12:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10)) continue;
    const r = await enviarInforme(origin, `l:${code}`);
    if (r.destinatarios) await marcar((c) => { if (c.launches[code]) c.launches[code].informeEnviado = hoy; });
    hechos.push({ tipo: 'lanzamiento', code, ...r });
  }
  const lunes = new Date(`${hoy}T12:00:00Z`).getUTCDay() === 1;
  for (const [id, v] of Object.entries(config.vsls || {})) {
    if (!lunes || !v.informeSemanal || v.informeUltimo === hoy) continue;
    const r = await enviarInforme(origin, `v:${id}`);
    if (r.destinatarios) await marcar((c) => { if (c.vsls[id]) c.vsls[id].informeUltimo = hoy; });
    hechos.push({ tipo: 'vsl', id, ...r });
  }
  return hechos;
}
