// Cloudflare Pages Functions: todas las rutas /api/* pasan por el router común.
import { route } from '../../lib/router.js';

export const onRequest = (context) => route(context.request, context.env, context);
