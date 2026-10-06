// Campos personalizados de tipo fecha de GHL (para elegir el campo "Fecha compra Raíces").
import { requireRole } from '../lib/auth.js';
import { listDateFields, listTextFields } from '../lib/ghl.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    await requireRole(request, { permiso: 'config' });
    const texto = new URL(request.url).searchParams.get('tipo') === 'texto';
    return json({ fields: texto ? await listTextFields() : await listDateFields() });
  } catch (e) {
    return errorResponse(e);
  }
}
