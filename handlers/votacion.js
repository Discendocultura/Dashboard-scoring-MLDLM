// Votación de la página preclase.
//   POST /api/votacion { launch, cid | email, respuestas: { p1: 'o2', p2: 'texto' } }  (pública, la llama
//        tracker.js) → guarda sus respuestas, pone la etiqueta <código>_voto al contacto y devuelve los
//        resultados (el % de cada opción de las preguntas tipo test). Las tipo test son obligatorias; las
//        libres, opcionales. (Compatibilidad: { opcion } = la respuesta a la pregunta p1.)
//   GET  /api/votacion?l=<código>  (dashboard) → preguntas, resultados y las respuestas de cada contacto.
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { addTags, getContact, findContactByEmail } from '../lib/ghl.js';
import { votar, votosDe, resultadosVotos } from '../lib/votos.js';
import { json, readBody, errorResponse, isEmail, CORS_HEADERS } from '../lib/http.js';
import { tagFor } from '../public/js/scoring.js';
import { recursosDe, tieneRecurso, preguntasValidas } from '../public/js/recursos.js';

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const lanzamientoDe = (config, code) => (Object.hasOwn(config.launches, code) ? config.launches[code] : null);

export async function POST(request) {
  try {
    const { launch: code, cid, email, opcion, respuestas: crudas } = await readBody(request);
    const config = await getConfig();
    const launch = lanzamientoDe(config, String(code || ''));
    if (!launch || !tieneRecurso(launch, 'votacion')) return json({ error: 'No hay votación en este lanzamiento' }, 404, CORS_HEADERS);
    const preguntas = preguntasValidas(recursosDe(launch).votacion);
    const entrada = crudas && typeof crudas === 'object' ? crudas : opcion != null ? { [preguntas[0]?.id]: opcion } : {};
    const respuestas = {};
    for (const q of preguntas) {
      const r = entrada[q.id];
      if (q.tipo === 'libre') {
        const t = typeof r === 'string' ? r.trim().slice(0, 1000) : '';
        if (t) respuestas[q.id] = t;
      } else if (r != null && r !== '') {
        if (!q.opciones.some((o) => o.id === r)) return json({ error: 'Opción no válida' }, 400, CORS_HEADERS);
        respuestas[q.id] = r;
      } else return json({ error: 'Elige una opción en cada pregunta' }, 400, CORS_HEADERS);
    }
    if (!Object.keys(respuestas).length) return json({ error: 'Escribe tu respuesta' }, 400, CORS_HEADERS);
    let contact = null;
    if (typeof cid === 'string' && /^[A-Za-z0-9]{6,40}$/.test(cid)) contact = await getContact(cid);
    if (!contact && isEmail(email)) contact = await findContactByEmail(email);
    if (!contact) return json({ error: 'No te encontramos: entra con el email con el que te registraste' }, 404, CORS_HEADERS);
    await votar(code, contact.id, respuestas);
    await addTags(contact.id, [tagFor(code, 'voto')]).catch((e) => console.error('Etiqueta de voto', e.message));
    return json({ ok: true, misRespuestas: respuestas, resultados: resultadosVotos(await votosDe(code), preguntas) }, 200, CORS_HEADERS);
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
    const preguntas = preguntasValidas(recursosDe(launch).votacion);
    const votos = await votosDe(code);
    return json({ activa: true, preguntas, resultados: resultadosVotos(votos, preguntas), votos });
  } catch (e) {
    return errorResponse(e);
  }
}
