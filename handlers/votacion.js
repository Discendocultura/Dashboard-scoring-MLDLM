// Votación de la página preclase.
//   POST /api/votacion { launch, cid | email, opcion }  (pública, la llama tracker.js) → vota, pone la
//        etiqueta <código>_voto al contacto y devuelve los resultados (el % de cada opción).
//   GET  /api/votacion?l=<código>  (dashboard) → resultados y el voto de cada contacto.
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { addTags, getContact, findContactByEmail } from '../lib/ghl.js';
import { votar, votosDe, resultadosVotos } from '../lib/votos.js';
import { json, readBody, errorResponse, isEmail, CORS_HEADERS } from '../lib/http.js';
import { tagFor } from '../public/js/scoring.js';
import { recursosDe, tieneRecurso } from '../public/js/recursos.js';

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const lanzamientoDe = (config, code) => (Object.hasOwn(config.launches, code) ? config.launches[code] : null);

export async function POST(request) {
  try {
    const { launch: code, cid, email, opcion } = await readBody(request);
    const config = await getConfig();
    const launch = lanzamientoDe(config, String(code || ''));
    if (!launch || !tieneRecurso(launch, 'votacion')) return json({ error: 'No hay votación en este lanzamiento' }, 404, CORS_HEADERS);
    const v = recursosDe(launch).votacion;
    if (!v.opciones.some((o) => o.id === opcion)) return json({ error: 'Opción no válida' }, 400, CORS_HEADERS);
    let contact = null;
    if (typeof cid === 'string' && /^[A-Za-z0-9]{6,40}$/.test(cid)) contact = await getContact(cid);
    if (!contact && isEmail(email)) contact = await findContactByEmail(email);
    if (!contact) return json({ error: 'No te encontramos: entra con el email con el que te registraste' }, 404, CORS_HEADERS);
    await votar(code, contact.id, opcion);
    await addTags(contact.id, [tagFor(code, 'voto')]).catch((e) => console.error('Etiqueta de voto', e.message));
    return json({ ok: true, miVoto: opcion, resultados: resultadosVotos(await votosDe(code), v.opciones) }, 200, CORS_HEADERS);
  } catch (e) {
    return errorResponse(e, CORS_HEADERS);
  }
}

export async function GET(request) {
  try {
    await requireSession(request, { permiso: ['metricas', 'leads', 'llamadas', 'hoy'] });
    const code = new URL(request.url).searchParams.get('l') || '';
    const config = await getConfig();
    const launch = lanzamientoDe(config, code);
    if (!launch || !tieneRecurso(launch, 'votacion')) return json({ activa: false });
    const v = recursosDe(launch).votacion;
    const votos = await votosDe(code);
    return json({ activa: true, pregunta: v.pregunta, opciones: v.opciones, resultados: resultadosVotos(votos, v.opciones), votos });
  } catch (e) {
    return errorResponse(e);
  }
}
