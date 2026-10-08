// Campos personalizados de tipo fecha de GHL (para elegir el campo "Fecha compra Raíces").
import { requireRole } from '../lib/auth.js';
import { listDateFields, listTextFields, listSurveyFields } from '../lib/ghl.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    await requireRole(request, { permiso: 'config' });
    const tipo = new URL(request.url).searchParams.get('tipo');
    // texto: campos de texto (formularios de Meta) · encuesta: los que puede usar una pregunta · si no, fechas.
    return json({ fields: tipo === 'texto' ? await listTextFields() : tipo === 'encuesta' ? await listSurveyFields() : await listDateFields() });
  } catch (e) {
    return errorResponse(e);
  }
}
