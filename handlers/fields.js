// Campos personalizados de GHL: los de fecha (para "Fecha compra Raíces") o, con ?todos, todos
// (para elegir las preguntas de la encuesta que se analizan en Métricas).
import { requireRole } from '../lib/auth.js';
import { listDateFields, listFields } from '../lib/ghl.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    await requireRole(request, { admin: true });
    const todos = new URL(request.url).searchParams.has('todos');
    return json({ fields: todos ? await listFields() : await listDateFields() });
  } catch (e) {
    return errorResponse(e);
  }
}
