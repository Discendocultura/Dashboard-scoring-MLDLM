// Inscripción en Zoom al registrarse (webhook del workflow de registro de GHL): cada persona queda inscrita en la
// reunión de su directo con su enlace personal desde el primer momento, repartido durante la captación (y no todas a
// la vez a la hora del directo). La preclase y el enlace del directo siguen inscribiendo a quien falte; nadie se
// inscribe dos veces (si ya lo está, no se llama a Zoom).
//   GET  /api/zoom-registro            → (equipo, permiso «config») { url } la URL para el webhook de GHL
//   POST /api/zoom-registro?c=…&k=…    → (GHL) el contacto: contact_id en el cuerpo, o «cid» como parámetro o como
//        encabezado (webhook personalizado: cid = {{contact.id}}); &l=<código> opcional: si no, los
//        lanzamientos cuya etiqueta de registro tiene y cuyo directo no ha pasado. Responde siempre el motivo en claro
//        (se ve en el historial del workflow de GHL).
//   POST /api/zoom-registro?probar=1   → (equipo) { email, l } prueba con un contacto ya existente.
import { requireSession, signToken, verifyToken } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { getContact, findContactByEmail } from '../lib/ghl.js';
import { hasTag } from '../lib/access.js';
import { clienteActual } from '../lib/cliente.js';
import { directosAbiertos, inscribirEnDirecto } from '../lib/zoom-inscripcion.js';
import { zoomConfigured } from '../lib/zoom.js';
import { json, readBody, errorResponse } from '../lib/http.js';
import { dentroDelLimite } from '../lib/intentos.js';
import { env } from '../lib/env.js';
import { dominioLogin } from '../lib/dominio.js';

const valor = () => `zoomreg:${clienteActual().id}`;

export async function GET(request) {
  try {
    await requireSession(request, { permiso: 'config' });
    const url = new URL(request.url);
    const k = await signToken(valor());
    // Con la dirección principal (DOMINIO_LOGIN, p. ej. alquimia.tenaxdigital.com), aunque se abra AlquimIA desde otra.
    // La antigua (data.discendocultura.com) ya no se usa para los enlaces nuevos: aunque no esté puesta la variable.
    const dom = dominioLogin(env) || (url.hostname === 'data.discendocultura.com' ? 'alquimia.tenaxdigital.com' : '');
    const origen = dom && !/^(localhost|127\.0\.0\.1)$/.test(url.hostname) ? `https://${dom}` : url.origin;
    return json({ url: `${origen}/api/zoom-registro?c=${encodeURIComponent(clienteActual().id)}&k=${encodeURIComponent(k)}` });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const url = new URL(request.url);
    // Prueba desde AlquimIA (Configuración → Captación → Página de registro): el equipo pone un email y ve qué pasaría.
    if (url.searchParams.get('probar')) {
      await requireSession(request, { permiso: 'config' });
      const body = await readBody(request);
      const email = String(body.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, motivo: 'email no válido' }, 400);
      const contact = await findContactByEmail(email);
      if (!contact) return json({ ok: false, motivo: 'contacto no encontrado', detalle: `No hay ningún contacto con ${email} en el CRM de este cliente.` });
      return json(await inscribirRegistro({ cid: contact.id, contact, pedido: String(body.l || '') }));
    }
    if ((await verifyToken(url.searchParams.get('k'))) !== valor()) return json({ ok: false, motivo: 'enlace no válido', detalle: 'La URL del webhook no es de este cliente o está incompleta: cópiala de nuevo de AlquimIA.' }, 403);
    if (!(await dentroDelLimite(request, 'zoomreg', 600))) return json({ ok: false, motivo: 'demasiadas peticiones' }, 429);
    const body = await readBody(request);
    const cid = String(body.contact_id || body.contactId || body.contact?.id || body.customData?.cid || body.customData?.contact_id || body.cid || body.id || url.searchParams.get('cid') || request.headers.get('cid') || request.headers.get('contact_id') || '').trim();
    if (!/^[A-Za-z0-9]{6,40}$/.test(cid)) return json({ ok: false, motivo: 'falta contact_id', detalle: 'GHL no ha mandado el ID del contacto: en el webhook, añade en «Datos personalizados» cid = Contact ID.' }, 400);
    const r = await inscribirRegistro({ cid, pedido: url.searchParams.get('l') || '' });
    if (!r.ok) console.error('zoom-registro', clienteActual().id, JSON.stringify(r).slice(0, 600));
    return json(r);
  } catch (e) {
    return errorResponse(e);
  }
}

// Inscribe al contacto en los directos abiertos con Zoom de sus lanzamientos y explica cada fallo en claro.
// → { ok, inscripciones: [{ l, k, ok, ya?, motivo?, detalle? }], motivo?, detalle? }
export async function inscribirRegistro({ cid, contact = null, pedido = '' }) {
  if (!zoomConfigured()) return { ok: false, motivo: 'sin zoom', detalle: 'Este cliente no tiene Zoom conectado en AlquimIA (Agencia → Clientes → su Zoom).', inscripciones: [] };
  const config = await getConfig();
  contact ||= await getContact(cid);
  if (!contact) return { ok: false, motivo: 'contacto no encontrado', detalle: 'El contacto no está en el CRM de este cliente (¿la URL del webhook es de otro cliente?).', inscripciones: [] };
  if (!contact.email) return { ok: false, motivo: 'contacto sin email', detalle: 'El contacto no tiene email: Zoom lo necesita para inscribirlo.', inscripciones: [] };
  if (pedido && !Object.hasOwn(config.launches, pedido)) return { ok: false, motivo: 'lanzamiento no encontrado', detalle: `No hay ningún lanzamiento «${pedido}» en este cliente.`, inscripciones: [] };
  const codes = pedido ? [pedido] : Object.keys(config.launches).filter((c) => config.launches[c].registroTag && hasTag(contact, config.launches[c].registroTag));
  if (!codes.length) return { ok: false, motivo: 'sin etiqueta de registro', detalle: 'El contacto aún no tiene la etiqueta de registro de ningún lanzamiento: pon el webhook después de «Añadir etiqueta» o usa la URL con &l= (la de AlquimIA ya lo lleva).', inscripciones: [] };
  const hechas = [];
  // Como mucho 4 inscripciones por aviso (cabe de sobra en el límite de llamadas de Cloudflare).
  for (const code of codes.slice(0, 3)) {
    const launch = config.launches[code];
    const abiertos = directosAbiertos(launch);
    if (!abiertos.length) hechas.push({ l: code, ok: false, motivo: 'sin directo abierto', detalle: 'Ningún directo de este lanzamiento tiene su ID de Zoom puesto (o ya han pasado).' });
    for (const { k, meetingId } of abiertos) {
      if (hechas.length >= 4) break;
      try {
        const r = await inscribirEnDirecto(code, launch, k, { cid, contact, confiarRegistro: Boolean(pedido) });
        hechas.push({ l: code, k, ok: r.ok, ...(r.ya ? { ya: true } : {}), ...(r.motivo ? { motivo: r.motivo, detalle: DETALLE[r.motivo] || '' } : {}) });
      } catch (e) {
        hechas.push({ l: code, k, ok: false, motivo: 'zoom', detalle: explicarZoom(e.message, meetingId) });
      }
    }
  }
  const ok = hechas.some((x) => x.ok);
  return { ok, inscripciones: hechas, ...(ok ? {} : { motivo: hechas[0]?.motivo || 'sin inscripciones', detalle: hechas.find((x) => x.detalle)?.detalle || '' }) };
}

const DETALLE = {
  'sin registro': 'El contacto no tiene la etiqueta de registro de este lanzamiento.',
  'sin zoom': 'Este directo no tiene ID de Zoom o el cliente no tiene Zoom conectado.',
  'contacto sin email': 'El contacto no tiene email.',
  zoom: 'Zoom no ha devuelto el enlace personal (¿la reunión tiene el registro activado?).',
};

// El error de Zoom, en claro (el texto original va al final para poder buscarlo).
export function explicarZoom(msg = '', meetingId = '') {
  const m = String(msg);
  const id = String(meetingId).replace(/\D/g, '');
  const base = /Zoom 404|3001|does not exist|not found/i.test(m) ? `La reunión ${id} no existe en la cuenta de Zoom que usa AlquimIA para este cliente (¿se creó en otra cuenta de Zoom o se borró?).`
    : /registration|3043|304|not enabled/i.test(m) ? `La reunión ${id} no tiene activado el registro: en Zoom, edítala y marca «Registro: obligatorio».`
    : /Zoom 401|invalid.?(client|token|access)|4700|4711|scope/i.test(m) ? 'La app de Zoom de este cliente no tiene permiso para inscribir (necesita «meeting:write:registrant» o «meeting:write») o sus claves no valen.'
    : /Zoom 429/i.test(m) ? 'Zoom ha limitado las peticiones: se volverá a intentar en la preclase.'
    : 'Zoom no ha dejado inscribirla.';
  return `${base} (${m.slice(0, 160)})`;
}
