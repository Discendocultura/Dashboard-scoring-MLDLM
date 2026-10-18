// Dirección principal del dashboard (la del login): DOMINIO_LOGIN en las variables de Cloudflare; por defecto
// alquimia.tenaxdigital.com, y «-» para no redirigir. Solo se redirige la pantalla de entrar (GET de / o /index.html):
// lo demás (API, tracker.js, oferta.js, /directo, marca.html…) sigue respondiendo en todas las direcciones, porque las
// páginas de GHL, LabIA, las tareas programadas y los conectores usan la antigua.
const POR_DEFECTO = 'alquimia.tenaxdigital.com';
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

export function dominioLogin(env = {}) {
  const d = String(env.DOMINIO_LOGIN ?? POR_DEFECTO).trim().toLowerCase();
  return d && d !== '-' && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : '';
}

// Response 302 a la dirección principal (con la misma ruta y parámetros), o null si no toca.
export function redirigirALogin(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const url = new URL(request.url);
  if (url.pathname !== '/' && url.pathname !== '/index.html') return null;
  const destino = dominioLogin(env);
  if (!destino || url.hostname === destino || LOCAL.test(url.hostname)) return null;
  return new Response(null, { status: 302, headers: { location: `https://${destino}${url.pathname}${url.search}`, 'cache-control': 'no-store' } });
}
