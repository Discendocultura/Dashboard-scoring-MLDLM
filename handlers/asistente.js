// Asistente de IA (Claude) del dashboard.
//   GET  /api/asistente                                  → { activo } (si hay ANTHROPIC_API_KEY)
//   POST { op: 'preguntar', pregunta, anteriores? }     → { respuesta }   (permiso «Asistente de IA»)
//   POST { op: 'resumen', l }                            → { respuesta }   (resumen narrado del lanzamiento)
//   POST { op: 'whatsapp', perfil, plantilla, fase }     → { texto }       (borrador para un lead; quien hace setteo)
// A Claude solo van cifras agregadas y, en los borradores, nombre de pila y comportamiento (ver lib/asistente.js).
import { requireSession } from '../lib/auth.js';
import { iaConfigurada } from '../lib/claude.js';
import { preguntar, resumenLanzamiento, borradorWhatsapp } from '../lib/asistente.js';
import { json, readBody, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    await requireSession(request);
    return json({ activo: iaConfigurada() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const body = await readBody(request);
    if (body.op === 'preguntar') {
      await requireSession(request, { permiso: 'asistente' });
      const pregunta = String(body.pregunta || '').trim();
      if (!pregunta) return json({ error: 'Escribe una pregunta' }, 400);
      return json({ respuesta: await preguntar(pregunta, Array.isArray(body.anteriores) ? body.anteriores : []) });
    }
    if (body.op === 'resumen') {
      await requireSession(request, { permiso: 'asistente' });
      return json({ respuesta: await resumenLanzamiento(String(body.l || '')) });
    }
    if (body.op === 'whatsapp') {
      await requireSession(request, { permiso: ['hoy', 'leads', 'asistente'] });
      return json({ texto: await borradorWhatsapp({ perfil: body.perfil, plantilla: body.plantilla, fase: body.fase }) });
    }
    return json({ error: 'Operación no válida' }, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
