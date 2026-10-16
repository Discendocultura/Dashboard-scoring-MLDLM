// Inscripción en Zoom al registrarse (webhook del workflow de registro de GHL): cada persona queda inscrita en la
// reunión de su directo con su enlace personal desde el primer momento, repartido durante la captación (y no todas a
// la vez a la hora del directo). La preclase y el enlace del directo siguen inscribiendo a quien falte; nadie se
// inscribe dos veces (si ya lo está, no se llama a Zoom).
//   GET  /api/zoom-registro            → (equipo, permiso «config») { url } la URL para el webhook de GHL
//   POST /api/zoom-registro?c=…&k=…    → (GHL) el contacto: contact_id en el cuerpo, o «cid» como parámetro o como
//        encabezado (webhook personalizado: cid = {{contact.id}}); &l=<código> opcional: si no, los
//        lanzamientos cuya etiqueta de registro tiene y cuyo directo no ha pasado.
import { requireSession, signToken, verifyToken } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { getContact } from '../lib/ghl.js';
import { hasTag } from '../lib/access.js';
import { clienteActual } from '../lib/cliente.js';
import { directosAbiertos, inscribirEnDirecto } from '../lib/zoom-inscripcion.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const valor = () => `zoomreg:${clienteActual().id}`;

export async function GET(request) {
  try {
    await requireSession(request, { permiso: 'config' });
    const url = new URL(request.url);
    const k = await signToken(valor());
    return json({ url: `${url.origin}/api/zoom-registro?c=${encodeURIComponent(clienteActual().id)}&k=${encodeURIComponent(k)}` });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const url = new URL(request.url);
    if ((await verifyToken(url.searchParams.get('k'))) !== valor()) return json({ error: 'Enlace no válido' }, 403);
    const body = await readBody(request);
    const cid = String(body.contact_id || body.contactId || body.contact?.id || body.id || url.searchParams.get('cid') || request.headers.get('cid') || request.headers.get('contact_id') || '').trim();
    if (!/^[A-Za-z0-9]{6,40}$/.test(cid)) return json({ ok: false, motivo: 'falta contact_id' }, 400);
    const [config, contact] = await Promise.all([getConfig(), getContact(cid)]);
    if (!contact) return json({ ok: false, motivo: 'contacto no encontrado' }, 404);
    const pedido = url.searchParams.get('l') || '';
    const codes = pedido
      ? (Object.hasOwn(config.launches, pedido) ? [pedido] : [])
      : Object.keys(config.launches).filter((c) => config.launches[c].registroTag && hasTag(contact, config.launches[c].registroTag));
    const hechas = [];
    for (const code of codes.slice(0, 3)) {
      const launch = config.launches[code];
      for (const { k } of directosAbiertos(launch)) {
        const r = await inscribirEnDirecto(code, launch, k, { cid, contact });
        hechas.push({ l: code, k, ok: r.ok, ...(r.ya ? { ya: true } : {}), ...(r.motivo ? { motivo: r.motivo } : {}) });
      }
    }
    return json({ ok: hechas.some((x) => x.ok), inscripciones: hechas, ...(hechas.length ? {} : { motivo: 'sin directo abierto con Zoom para sus etiquetas' }) });
  } catch (e) {
    return errorResponse(e);
  }
}
