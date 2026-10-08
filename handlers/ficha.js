// Ficha completa de un lead (Comercial → Llamadas, al pulsar una llamada).
//   GET /api/ficha?cid=<contacto>[&l=<lanzamiento>] → { contacto, encuesta: [{ pregunta, respuesta }], otros: [{ campo, valor }], notas,
//     votacion: { total, preguntas: [{ pregunta, tipo, respuesta, resultados }] } | null }  (votación de la preclase)
// «otros»: el resto de campos personalizados con valor (entre ellos, las respuestas del formulario de
// reserva de la llamada), sin los técnicos que ya usa el dashboard (fechas, IDs de anuncios).
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { getContactCompleto, listAllFields, getContactNotes } from '../lib/ghl.js';
import { json, errorResponse } from '../lib/http.js';
import { votosDe, resultadosVotos } from '../lib/votos.js';
import { tieneRecurso, recursosDe, preguntasValidas } from '../public/js/recursos.js';

const texto = (v) => (Array.isArray(v) ? v.map(texto).filter(Boolean).join(', ') : v == null ? '' : String(v).trim());

export async function GET(request) {
  try {
    await requireSession(request, { permiso: ['llamadas', 'hoy', 'leads'] });
    const url = new URL(request.url);
    const cid = url.searchParams.get('cid') || '';
    const code = url.searchParams.get('l') || '';
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(cid)) return json({ error: 'Contacto no válido' }, 400);
    const [config, c] = await Promise.all([getConfig(), getContactCompleto(cid)]);
    if (!c) return json({ error: 'No se ha encontrado el contacto en GHL' }, 404);
    const campos = await listAllFields().catch(() => []);
    const nombre = new Map(campos.map((f) => [f.id, f]));
    const preguntas = config.encuesta || [];
    // Campos técnicos que el dashboard ya usa por su cuenta: no aportan a la setter.
    const tecnicos = new Set([
      ...Object.values(config.launches || {}).map((l) => l.compraDateField),
      ...Object.values(config.vsls || {}).flatMap((v) => [v.compraDateField, v.registroDateField]),
      config.formAds?.campaign, config.formAds?.adset, config.formAds?.ad,
    ].filter(Boolean));
    const encuesta = preguntas.map((p) => ({ pregunta: p.name || nombre.get(p.id)?.name || p.id, respuesta: texto(c.cf?.[p.id]) }));
    const otros = Object.entries(c.cf || {})
      .filter(([id, v]) => !preguntas.some((p) => p.id === id) && !tecnicos.has(id) && texto(v))
      .map(([id, v]) => ({ campo: nombre.get(id)?.name || id, valor: texto(v), fecha: nombre.get(id)?.tipo === 'DATE' }))
      .sort((a, b) => a.campo.localeCompare(b.campo, 'es'));
    const launch = Object.hasOwn(config.launches || {}, code) ? config.launches[code] : null;
    const [notas, votacion] = await Promise.all([
      getContactNotes(cid).then((n) => n.slice(0, 5)).catch(() => []),
      launch && tieneRecurso(launch, 'votacion') ? votosDe(code).then((votos) => {
        const preguntas = preguntasValidas(recursosDe(launch).votacion);
        const res = resultadosVotos(votos, preguntas);
        const mias = votos[cid] || {};
        return {
          total: res.total,
          preguntas: preguntas.map((q) => ({
            pregunta: q.pregunta, tipo: q.tipo,
            respuesta: q.tipo === 'libre' ? mias[q.id] || '' : q.opciones.find((o) => o.id === mias[q.id])?.texto || '',
            respuestaId: q.tipo === 'libre' ? '' : mias[q.id] || '',
            resultados: res.preguntas[q.id],
          })),
        };
      }).catch(() => null) : null,
    ]);
    return json({
      contacto: { id: c.id, name: c.name, firstName: c.firstName, email: c.email, phone: c.phone, dateAdded: c.dateAdded, src: c.src || null },
      encuesta, otros, notas, votacion,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
