export const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function html(body, status = 200) {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

// Acepta JSON aunque venga como text/plain (sendBeacon evita así el preflight CORS).
export async function readBody(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}

// En los endpoints públicos (los que responden con CORS_HEADERS: páginas de GHL) no se manda el detalle
// técnico del error (respuestas de GHL, Zoom…): solo el mensaje para la persona.
export function errorResponse(err, headers = {}) {
  if (err instanceof Response) return err;
  console.error(err);
  const publico = headers === CORS_HEADERS;
  // En público, un fallo de GHL no dice nada de tokens ni variables: solo que no se pudo.
  const mensaje = publico && err.ghlStatus ? 'No se ha podido completar. Inténtalo de nuevo en unos minutos.' : err.publicMessage || 'Error interno';
  return json({ error: mensaje, ...(publico ? {} : { detail: String(err.message || err) }) }, err.status || 500, headers);
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
