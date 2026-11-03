// Páginas con Claude y biblioteca de bloques (Crear → Páginas). Permiso de configuración.
//   POST { op: 'crear', prompt, codigos: [[título, código]] } → { html, cambios, avisos, modelo }
//   POST { op: 'revisar', html, codigos }                     → la revisión de un HTML hecho fuera (pegado)
//   GET  /api/paginas-ia?bloques=1                            → { cliente: [...], agencia: [...] | null }
//   POST { op: 'bloque', bloque: { nombre, html, pagina, notas }, agencia? } · { op: 'borrar-bloque', id, agencia? }
// La biblioteca de la agencia (común a todos los clientes) solo la ve y la toca el equipo de la agencia (superadmin).
import { requireSession } from '../lib/auth.js';
import { crearPaginaConClaude, listarBloques, guardarBloque, borrarBloque } from '../lib/paginas-ia.js';
import { revisarHtmlPagina } from '../public/js/revisar-codigos.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const codigosValidos = (c) => (Array.isArray(c) ? c : []).slice(0, 30)
  .filter((x) => Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'string')
  .map(([t, c2]) => [t.slice(0, 200), c2.slice(0, 20_000)]);

export async function GET(request) {
  try {
    const s = await requireSession(request, { permiso: 'config' });
    const [cliente, agencia] = await Promise.all([listarBloques(false), s.superadmin ? listarBloques(true) : null]);
    return json({ cliente, agencia });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const s = await requireSession(request, { permiso: 'config' });
    const body = await readBody(request);
    const agencia = body.agencia === true;
    if (agencia && !s.superadmin) return json({ error: 'La biblioteca de la agencia es solo del equipo de la agencia.' }, 403);
    if (body.op === 'crear') return json(await crearPaginaConClaude({ prompt: body.prompt, codigos: codigosValidos(body.codigos) }));
    if (body.op === 'revisar') return json(revisarHtmlPagina(String(body.html || '').slice(0, 300_000), codigosValidos(body.codigos)));
    if (body.op === 'bloque') return json({ bloque: await guardarBloque(body.bloque, { agencia, por: s.user?.nombre || 'Admin' }) });
    if (body.op === 'borrar-bloque') { await borrarBloque(String(body.id || ''), { agencia }); return json({ ok: true }); }
    return json({ error: 'Operación no válida' }, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
