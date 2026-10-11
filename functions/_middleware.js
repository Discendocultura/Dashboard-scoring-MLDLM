// Cloudflare Pages: /.well-known/oauth-* (metadatos del conector de Claude) no es una carpeta de functions/;
// este middleware los atiende con el router común. Todo lo demás sigue igual (context.next()).
// public/_routes.json limita las funciones a /api/*, /directo y /.well-known/oauth-* (los estáticos no pasan por aquí).
import { route } from '../lib/router.js';

export const onRequest = (context) => {
  const { pathname } = new URL(context.request.url);
  if (/^\/\.well-known\/(oauth-protected-resource|oauth-authorization-server|openid-configuration)/.test(pathname)) return route(context.request, context.env, context);
  return context.next();
};
