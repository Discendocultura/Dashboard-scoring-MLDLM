// Informe para el cliente.
//   GET  /api/informe?l=<código> | ?v=<id VSL>   (&t=<firma> para el enlace compartible, sin sesión)
//        → página HTML (con botón para guardarla en PDF)
//   POST { op: 'enlace', l | v }  → enlace compartible
//   POST { op: 'enviar', l | v }  → lo manda ya por email a las personas con el rol «Cliente»
import { requireSession } from '../lib/auth.js';
import { informeLanzamiento, informeVslSemana } from '../lib/informe.js';
import { enlaceInforme, tokenValido, enviarInforme } from '../lib/informe-envio.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const que = (p) => (p.v ? `v:${p.v}` : `l:${p.l || ''}`);

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const p = { l: url.searchParams.get('l') || '', v: url.searchParams.get('v') || '' };
    const t = url.searchParams.get('t');
    if (!(t && (await tokenValido(t, que(p))))) await requireSession(request, { permiso: ['metricas', 'resumen'], cliente: true });
    const inf = p.v ? await informeVslSemana(p.v) : await informeLanzamiento(p.l);
    return new Response(inf.html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' } });
  } catch (e) {
    if (e instanceof Response && e.status === 401) return new Response('<p style="font-family:sans-serif">Este enlace no es válido o ha caducado. Pide uno nuevo a la agencia.</p>', { status: 401, headers: { 'content-type': 'text/html; charset=utf-8' } });
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    await requireSession(request, { permiso: ['metricas', 'config'] });
    const body = await readBody(request);
    const origin = new URL(request.url).origin;
    if (body.op === 'enlace') return json({ url: await enlaceInforme(origin, que(body)) });
    if (body.op === 'enviar') return json(await enviarInforme(origin, que(body)));
    return json({ error: 'Operación no válida' }, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
