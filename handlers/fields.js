// Campos personalizados de tipo fecha de GHL (para elegir el campo "Fecha compra Raíces").
import { requireRole } from '../lib/auth.js';
import { listDateFields } from '../lib/ghl.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    await requireRole(request, { permiso: 'config' });
    return json({ fields: await listDateFields() });
  } catch (e) {
    return errorResponse(e);
  }
}
