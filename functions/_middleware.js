// Cloudflare Pages: /.well-known/oauth-* (metadatos del conector de Claude) no es una carpeta de functions/;
// este middleware los atiende con el router común. Todo lo demás sigue igual (context.next()).
// public/_routes.json limita las funciones a /, /index.html, /api/*, /directo y /.well-known/oauth-* (el resto de
// estáticos no pasa por aquí).
// La pantalla de entrar (/ e /index.html) se abre siempre en la dirección principal (ver redirigirALogin): quien llega
// por otra (la antigua o la .pages.dev) va a esa. La API, tracker.js y demás siguen respondiendo en todas.
import { route } from '../lib/router.js';
import { redirigirALogin } from '../lib/dominio.js';

export const onRequest = (context) => {
  const url = new URL(context.request.url);
  if (/^\/\.well-known\/(oauth-protected-resource|oauth-authorization-server|openid-configuration)/.test(url.pathname)) return route(context.request, context.env, context);
  return redirigirALogin(context.request, context.env) || context.next();
};
