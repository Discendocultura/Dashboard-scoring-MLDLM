// Cifras del setter IA para la pestaña Rendimiento del equipo.
//   GET /api/setter-ia?desde=AAAA-MM-DD&hasta=AAAA-MM-DD[&fresh=1] → { configurado, cifras?, error?, falta? }
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { resumenSetterIa, rangoValido } from '../lib/setter-ia.js';
import { json, errorResponse } from '../lib/http.js';
import { labiaAqui } from '../lib/clientes.js';

export async function GET(request) {
  try {
    await requireSession(request, { permiso: 'rendimiento' });
    const q = new URL(request.url).searchParams;
    const desde = q.get('desde') || '';
    const hasta = q.get('hasta') || '';
    if (!rangoValido(desde, hasta)) return json({ error: 'Fechas no válidas' }, 400);
    const config = await getConfig();
    // Sin LabIA contratado, ni sus cifras.
    if (!(await labiaAqui(config))) return json({ configurado: false, sinLabia: true });
    return json(await resumenSetterIa(config, desde, hasta, { fresh: q.has('fresh') }));
  } catch (e) {
    return errorResponse(e);
  }
}
