// Comentarios de la preclase (muro debajo de cada clase).
//   GET  /api/comentarios?l=<código>&cid=…           (pública, la llama tracker.js) → por clase: sus preguntas,
//        si está abierta (la clase ya se puede ver) y los comentarios visibles; `mio` marca los de la lead.
//   POST /api/comentarios { launch, clase, pregunta, texto, cid | email }  (pública) → publica el comentario
//        (con el nombre de pila de la lead) y le pone la etiqueta <código>_comento (suma en su puntuación).
//        Si en GHL no tiene nombre → { needsName: true }: el panel se lo pide y lo reenvía como `nombre` (se guarda en su ficha).
//   GET  /api/comentarios?l=<código>&todo=1          (dashboard) → todos, también los ocultos, con su contacto.
//   POST /api/comentarios { op: 'ocultar' | 'mostrar' | 'destacar' | 'quitar-destacado' | 'responder' | 'borrar',
//        l, id, texto? }  (dashboard; permiso de Leads) → moderación y respuesta del equipo.
import { dentroDelLimite } from '../lib/intentos.js';
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { addTags, findContactByEmail, getContact, upsertContact } from '../lib/ghl.js';
import { nombrePila } from '../lib/access.js';
import { comentar, comentariosDe, moderar, muroDe, MAX_TEXTO } from '../lib/comentarios.js';
import { clienteActual } from '../lib/cliente.js';
import { json, readBody, errorResponse, isEmail, CORS_HEADERS } from '../lib/http.js';
import { tagFor } from '../public/js/scoring.js';
import { recursosDe, tieneRecurso, clasesConComentarios } from '../public/js/recursos.js';
import { madridToEpoch } from '../public/js/page.js';

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const lanzamientoDe = (config, code) => (Object.hasOwn(config.launches, code) ? config.launches[code] : null);
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });
const CID_RE = /^[A-Za-z0-9]{6,40}$/;

// Lo que necesita la página: por clase, sus preguntas, si ya se puede comentar y el muro.
function muro(launch, lista, contacto) {
  const r = recursosDe(launch).comentarios;
  const ahora = Date.now();
  const clases = {};
  for (const k of clasesConComentarios(recursosDe(launch))) {
    const at = madridToEpoch(launch[`${k}At`]);
    clases[k] = { preguntas: r.clases[k].preguntas, pestana: r.clases[k].pestana || '', abierta: Boolean(launch[`${k}Url`]) && (at == null || ahora >= at), ...muroDe(lista, k, contacto) };
  }
  return { firma: r.firma || clienteActual().nombre, titulo: r.titulo || '', clases };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('l') || '';
    const config = await getConfig();
    const launch = lanzamientoDe(config, code);
    if (url.searchParams.get('todo')) {
      await requireSession(request, { permiso: ['leads', 'metricas', 'hoy'] });
      if (!launch) return json({ activa: false, comentarios: [] });
      const r = recursosDe(launch).comentarios;
      return json({ activa: tieneRecurso(launch, 'comentarios'), firma: r.firma || clienteActual().nombre, clases: r.clases, comentarios: await comentariosDe(code) });
    }
    if (!launch || !tieneRecurso(launch, 'comentarios')) return json({ activa: false }, 200, CORS_HEADERS);
    const cid = url.searchParams.get('cid') || '';
    return json({ activa: true, ...muro(launch, await comentariosDe(code), CID_RE.test(cid) ? cid : '') }, 200, { ...CORS_HEADERS, 'cache-control': 'no-store' });
  } catch (e) {
    return errorResponse(e, CORS_HEADERS);
  }
}

export async function POST(request) {
  try {
    const body = await readBody(request);
    if (body.op) return await moderacion(request, body);
    const { launch: code, clase, pregunta, cid, email } = body;
    const texto = String(body.texto ?? '').replace(/\r/g, '').trim();
    if (!(await dentroDelLimite(request, 'comentario', 20))) return json({ error: 'Has enviado muchos comentarios seguidos: espera un minuto.' }, 429, CORS_HEADERS);
    const config = await getConfig();
    const launch = lanzamientoDe(config, String(code || ''));
    if (!launch || !tieneRecurso(launch, 'comentarios')) return json({ error: 'Los comentarios no están abiertos' }, 404, CORS_HEADERS);
    const { clases } = muro(launch, [], '');
    const k = String(clase || '');
    if (!clases[k]) return json({ error: 'Clase no válida' }, 400, CORS_HEADERS);
    if (!clases[k].abierta) return json({ error: 'Esta clase aún no está disponible' }, 403, CORS_HEADERS);
    if (!clases[k].preguntas.some((q) => q.id === pregunta)) return json({ error: 'Elige a qué pregunta respondes' }, 400, CORS_HEADERS);
    if (texto.length < 2) return json({ error: 'Escribe tu respuesta' }, 400, CORS_HEADERS);
    if (texto.length > MAX_TEXTO) return json({ error: `Máximo ${MAX_TEXTO} caracteres` }, 400, CORS_HEADERS);
    // Quién es: con su ID (de la página), o con el email con el que se registró.
    let contacto = typeof cid === 'string' && CID_RE.test(cid) ? await getContact(cid) : null;
    if (!contacto && isEmail(email)) contacto = await findContactByEmail(email);
    if (!contacto) return json({ error: 'No te encontramos: entra con el email con el que te registraste' }, 404, CORS_HEADERS);
    // Firma con su nombre de pila de GHL. Si no lo tiene (se registró solo con el email), se le pide una vez
    // y se guarda en su ficha (solo si está vacío: no se pisa el de nadie desde este formulario público).
    let nombre = nombrePila(contacto.firstName);
    if (!nombre) {
      nombre = nombrePila(body.nombre);
      if (!nombre) return json({ ok: false, needsName: true, error: 'Escribe tu nombre para firmar tu respuesta.' }, 200, CORS_HEADERS);
      if (contacto.email) await upsertContact({ email: contacto.email, firstName: nombre }).catch((e) => console.error('Nombre del comentario', e.message));
    }
    const c = await comentar(code, { clase: k, pregunta, contacto: contacto.id, nombre, texto });
    // Cuenta en su puntuación (señal «comentó»). Si falla, el comentario ya está publicado.
    await addTags(contacto.id, [tagFor(code, 'comento')]).catch((e) => console.error('Etiqueta de comentario', e.message));
    return json({ ok: true, activa: true, ...muro(launch, await comentariosDe(code), contacto.id), nuevo: c.id }, 200, CORS_HEADERS);
  } catch (e) {
    return errorResponse(e, CORS_HEADERS);
  }
}

async function moderacion(request, body) {
  const s = await requireSession(request, { permiso: 'leads' });
  const code = String(body.l || '');
  const config = await getConfig();
  if (!lanzamientoDe(config, code)) throw bad('Lanzamiento no encontrado', 404);
  const id = String(body.id || '');
  const op = String(body.op);
  const cambios = {
    ocultar: { oculto: true }, mostrar: { oculto: false }, destacar: { destacado: true }, 'quitar-destacado': { destacado: false },
  }[op];
  let c;
  if (cambios) c = await moderar(code, id, cambios);
  else if (op === 'responder') c = await moderar(code, id, { respuesta: String(body.texto ?? '').trim().slice(0, MAX_TEXTO) });
  else if (op === 'borrar') { if (s.role !== 'admin') throw bad('Solo el administrador puede borrar comentarios', 403); await moderar(code, id, {}, { borrar: true }); }
  else throw bad('Operación no válida');
  return json({ ok: true, comentario: c });
}
