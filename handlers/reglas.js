// Reglas de seguimiento y bandeja de decisiones.
//   GET  /api/reglas?key=DIGEST_KEY[&c=]   → tarea programada (cada 30-60 min): una cosa por llamada (lib/reglas.js)
//   GET  /api/reglas (sesión)              → { reglas, items } para la bandeja
//   POST { op: 'reglas', reglas }           → guardarlas (permiso de configuración)
//   POST { op: 'decidir', id, si }          → ✅ (hace la primera tanda) o ❌ (permiso «hoy» o «leads»)
//   POST { op: 'continuar', id }            → la siguiente tanda de una aprobada
//   POST { op: 'revisar' }                  → buscar propuestas nuevas ahora (permiso de configuración)
import { requireSession, fallaClaveTarea } from '../lib/auth.js';
import { env } from '../lib/env.js';
import { leerReglas, guardarReglas, leerBandeja, decidir, continuar, revisarReglas } from '../lib/reglas.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const dashboardUrl = (request) => new URL('/', request.url).toString();

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.has('key')) {
      const falla = fallaClaveTarea(url.searchParams.get('key') || '', env.DIGEST_KEY);
      if (falla) return json({ error: 'No autorizado', motivo: falla }, 401);
      return json(await revisarReglas({ url: dashboardUrl(request) }));
    }
    await requireSession(request, { permiso: ['hoy', 'leads', 'config'] });
    const [reglas, b] = await Promise.all([leerReglas(), leerBandeja()]);
    return json({ reglas, items: b.items.slice().reverse().slice(0, 40), dia: b.dia });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const body = await readBody(request);
    if (body.op === 'reglas' || body.op === 'revisar') {
      await requireSession(request, { permiso: 'config' });
      if (body.op === 'reglas') { await guardarReglas(body.reglas); return json({ reglas: await leerReglas() }); }
      return json(await revisarReglas({ url: dashboardUrl(request), avisar: false }));
    }
    const s = await requireSession(request, { permiso: ['hoy', 'leads'] });
    const por = s.user?.nombre || (s.role === 'admin' ? 'Admin' : 'Equipo');
    const id = String(body.id || '');
    if (body.op === 'decidir') return json(await decidir(id, body.si === true, { por }));
    if (body.op === 'continuar') return json(await continuar(id, { por }));
    return json({ error: 'Operación no válida' }, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
