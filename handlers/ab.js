// Tests A/B de páginas de GHL (GHL reparte el tráfico entre las variantes; aquí se mide cada una).
//   POST { op: 'visita' | 'conversion', ambito: 'lanz' | 'directa', ref, variante, v, cid? }  (pública: tracker.js)
//        visita = abrió la página de registro (lanzamiento) o de venta (venta directa) con esa variante;
//        conversion = llegó a la página de gracias (se registró o compró). ref: código del lanzamiento ('auto' = el
//        actual) o id del embudo de venta directa. → { ok, ref } (el lanzamiento resuelto)
//   GET  ?ambito=&ref=  (dashboard) → { variantes: { a: { visitas, conversiones, contactos, primera, ultima }, … } }
//   POST { op: 'reiniciar', ambito, ref }  (dashboard, permiso config) → empieza la prueba de cero
import { dentroDelLimite } from '../lib/intentos.js';
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { currentLaunch } from '../lib/digest.js';
import { marcarAb, resultadosAb, borrarAb } from '../lib/ab.js';
import { VARIANTE_RE } from '../public/js/ab.js';
import { json, readBody, errorResponse, CORS_HEADERS } from '../lib/http.js';

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// La prueba de la que se habla: { clave, ref } o null si el embudo no existe.
function prueba(config, ambito, ref) {
  if (ambito === 'lanz') {
    const code = ref === 'auto' || !ref ? currentLaunch(config) : String(ref);
    return code && Object.hasOwn(config.launches, code) ? { clave: `lanz:${code}`, ref: code } : null;
  }
  if (ambito === 'directa') {
    const id = String(ref || '');
    return config.directas && Object.hasOwn(config.directas, id) ? { clave: `directa:${id}`, ref: id } : null;
  }
  return null;
}

export async function GET(request) {
  try {
    await requireSession(request, { permiso: ['metricas', 'leads'] });
    const url = new URL(request.url);
    const p = prueba(await getConfig(), url.searchParams.get('ambito'), url.searchParams.get('ref'));
    if (!p) return json({ variantes: {} });
    return json({ ref: p.ref, variantes: await resultadosAb(p.clave) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const body = await readBody(request);
    if (body.op === 'reiniciar') {
      await requireSession(request, { permiso: 'config' });
      const p = prueba(await getConfig(), body.ambito, body.ref);
      if (!p) return json({ error: 'Embudo desconocido' }, 404);
      await borrarAb(p.clave);
      return json({ ok: true });
    }
    if (body.op !== 'visita' && body.op !== 'conversion') return json({ error: 'Operación no válida' }, 400, CORS_HEADERS);
    const variante = String(body.variante || '').toLowerCase();
    const v = String(body.v || '');
    const cid = typeof body.cid === 'string' && /^[A-Za-z0-9]{6,40}$/.test(body.cid) ? body.cid : '';
    if (!VARIANTE_RE.test(variante) || !/^[A-Za-z0-9]{6,40}$/.test(v)) return json({ error: 'Datos no válidos' }, 400, CORS_HEADERS);
    // Cada visitante nuevo es una fila en D1: límite por conexión para que nadie la llene ni falsee la prueba.
    if (!(await dentroDelLimite(request, 'ab', 120))) return json({ ok: true }, 200, CORS_HEADERS);
    const p = prueba(await getConfig(), body.ambito, body.ref);
    if (!p) return json({ error: 'Embudo desconocido' }, 404, CORS_HEADERS);
    await marcarAb(p.clave, body.op, variante, v, cid);
    return json({ ok: true, ref: p.ref }, 200, CORS_HEADERS);
  } catch (e) {
    return errorResponse(e, CORS_HEADERS);
  }
}
