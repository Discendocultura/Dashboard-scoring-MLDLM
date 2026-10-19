// Informe diario por email a los emails de Configuración → Informes: los días de captación, los datos de
// captación; los días de carrito, los de venta (public/js/informe-diario.js decide qué entra según lo que
// tenga activado el lanzamiento). Se manda una vez al día por lanzamiento desde la tarea de cada mañana
// del cliente (/api/agencia?key=…&c=…) y, a mano, desde la pestaña Informes («Enviar ahora»).
import { getConfig } from './config-store.js';
import { metricasLanzamiento } from './resumen.js';
import { adSpend, metaConfigured } from './meta.js';
import { findContactByEmail, upsertContact, sendEmail } from './ghl.js';
import { emailLayout } from './users.js';
import { leerJSON, guardarJSON, reintentando, conVersion } from './store.js';
import { clienteActual } from './cliente.js';
import { faseInforme, datosInforme, informeHtml, fotoTotales, sumarDias } from '../public/js/informe-diario.js';
import { nombreProducto } from '../public/js/producto.js';
import { dayInMadrid } from '../public/js/scoring.js';

const clave = (code) => `lsd_informe_diario_${code}`;
const hoyMadrid = () => dayInMadrid(new Date().toISOString());

// Lanzamientos en captación o carrito el día `dia` (con su fase), si esa fase tiene el informe activado.
export function lanzamientosConInforme(config, dia) {
  const inf = config.informes || {};
  return Object.entries(config.launches || {})
    .map(([code, l]) => ({ code, l, fase: faseInforme(l, dia) }))
    .filter((x) => x.fase && inf[x.fase] !== false);
}

// Datos y HTML del informe de un lanzamiento (y guarda la «foto» de los totales del día contado).
export async function prepararInforme(config, code, { dia = sumarDias(hoyMadrid(), -1), url = '', guardarFoto = true } = {}) {
  const l = config.launches[code];
  const fase = faseInforme(l, dia) || faseInforme(l, hoyMadrid()) || 'captacion';
  const { leads, m } = await metricasLanzamiento(config, code);
  const reg = await leerJSON(clave(code), () => ({}));
  const fotos = reg?.fotos || {};
  // Lo gastado en Meta el día que se cuenta (para el CPL de ese día); sin Meta, sale de la foto del día anterior.
  let inversionDia = null;
  if (fase === 'captacion' && metaConfigured()) {
    try { inversionDia = (await adSpend({ since: dia, until: dia, filter: l.metaFiltro || code })).total || null; } catch (e) { console.error('Informe diario (Meta)', e.message); }
  }
  const datos = datosInforme({ l, m, leads, fase, dia, fotos, producto: nombreProducto(config), inversionDia });
  if (guardarFoto) {
    await reintentando(async () => {
      const r = await leerJSON(clave(code), () => ({}));
      // Solo los últimos 60 días.
      const f = Object.fromEntries(Object.entries({ ...(r?.fotos || {}), [dia]: fotoTotales(m) }).sort(([a], [b]) => a.localeCompare(b)).slice(-60));
      await guardarJSON(clave(code), conVersion({ ...(r || {}), fotos: f }, r), { motivo: 'Totales del informe diario' });
    }).catch((e) => console.error('Informe diario (foto)', e.message));
  }
  const marca = config.marca || {};
  const color = /^#[0-9a-f]{6}$/i.test(marca.color || '') ? marca.color : '#860d0e';
  return { code, fase, datos, html: informeHtml(datos, { color, url }), asunto: datos.asunto };
}

// Contacto de GHL de cada email (se crea si no existe, como el resto de emails del dashboard). Se recuerda
// en D1 (lsd_informe_contactos): cada envío cuesta una sola llamada a GHL en vez de dos o tres.
const CONTACTOS = 'lsd_informe_contactos';
async function contactoDe(email, conocidos) {
  if (conocidos[email]) return conocidos[email];
  const c = await findContactByEmail(email);
  const id = c?.id || (await upsertContact({ email, firstName: '', lastName: '', source: `Informes de AlquimIA ${clienteActual().nombre}` }))?.id;
  if (!id) throw new Error(`GHL no ha devuelto el contacto de ${email}`);
  conocidos[email] = id;
  return id;
}

async function enviarA(emails, inf) {
  const html = await emailLayout(inf.datos.titulo, inf.html);
  const conocidos = { ...((await leerJSON(CONTACTOS, () => ({}))) || {}) };
  const antes = JSON.stringify(conocidos);
  const resultados = [];
  for (const email of emails) {
    try {
      await sendEmail(await contactoDe(email, conocidos), { subject: inf.asunto, html });
      resultados.push({ email, ok: true });
    } catch (e) {
      // Si el contacto guardado ya no existe en GHL, la próxima vez se busca de nuevo.
      if (/404|not found/i.test(String(e.message))) delete conocidos[email];
      resultados.push({ email, ok: false, error: String(e.publicMessage || e.message).slice(0, 160) });
    }
  }
  if (JSON.stringify(conocidos) !== antes) {
    const vivos = Object.fromEntries(Object.entries(conocidos).filter(([e]) => emails.includes(e)));
    await guardarJSON(CONTACTOS, vivos, { motivo: 'Contactos de los informes' }).catch(() => {});
  }
  return resultados;
}

// Tarea de cada mañana: un informe por lanzamiento en captación o carrito (con el día de ayer), una vez al día.
export async function informesDiariosPendientes(origin) {
  const config = await getConfig({ fresh: true });
  const emails = config.informes?.emails || [];
  if (!emails.length) return { enviados: [], motivo: 'Sin emails en Configuración → Informes' };
  const hoy = hoyMadrid();
  const ayer = sumarDias(hoy, -1);
  const out = [];
  let hecho = false;
  for (const { code } of lanzamientosConInforme(config, ayer)) {
    const reg = await leerJSON(clave(code), () => ({}));
    if (reg?.ultimo === hoy) { out.push({ code, ya: true }); continue; }
    // Uno por llamada (cada uno descarga todos los leads del lanzamiento): si hay dos a la vez, el siguiente
    // sale en la próxima ejecución de la tarea (pon la tarea cada 15-30 min por la mañana, o dos tareas).
    if (hecho) { out.push({ code, pendiente: true }); continue; }
    hecho = true;
    const inf = await prepararInforme(config, code, { dia: ayer, url: `${origin}/` });
    const r = await enviarA(emails, inf);
    if (r.some((x) => x.ok)) {
      await reintentando(async () => {
        const x = await leerJSON(clave(code), () => ({}));
        await guardarJSON(clave(code), conVersion({ ...(x || {}), ultimo: hoy }, x), { motivo: 'Informe diario enviado' });
      }).catch(() => {});
    }
    out.push({ code, fase: inf.fase, asunto: inf.asunto, resultados: r });
  }
  return { enviados: out };
}

// «Enviar ahora» (pestaña Informes): el del lanzamiento elegido con los datos hasta ayer, sin marcar el día como enviado.
export async function enviarInformeAhora(code, origin) {
  const config = await getConfig({ fresh: true });
  if (!config.launches[code]) throw Object.assign(new Error('Lanzamiento no encontrado'), { status: 404, publicMessage: 'Lanzamiento no encontrado' });
  const emails = config.informes?.emails || [];
  if (!emails.length) throw Object.assign(new Error('Sin emails'), { status: 400, publicMessage: 'Añade al menos un email y guarda antes de enviar.' });
  const inf = await prepararInforme(config, code, { url: `${origin}/`, guardarFoto: false });
  return { fase: inf.fase, asunto: inf.asunto, resultados: await enviarA(emails, inf) };
}
