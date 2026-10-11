// Campos personalizados de tipo fecha de GHL (para elegir el campo "Fecha compra Raíces").
import { requireRole } from '../lib/auth.js';
import { listDateFields, listTextFields, listSurveyFields, getPipelines } from '../lib/ghl.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    await requireRole(request, { permiso: 'config' });
    const tipo = new URL(request.url).searchParams.get('tipo');
    // texto: campos de texto (formularios de Meta) · encuesta: los que puede usar una pregunta · si no, fechas.
    // pipelines: pipelines de oportunidades con sus etapas (venta directa: la oportunidad del workflow de compra).
    if (tipo === 'pipelines') return json({ pipelines: (await getPipelines()).map((p) => ({ id: p.id, name: p.name, stages: (p.stages || []).map((x) => ({ id: x.id, name: x.name })) })) });
    return json({ fields: tipo === 'texto' ? await listTextFields() : tipo === 'encuesta' ? await listSurveyFields() : await listDateFields() });
  } catch (e) {
    return errorResponse(e);
  }
}
