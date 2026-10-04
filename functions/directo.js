// Cloudflare Pages Functions: enlace puente al directo de Zoom.
import { route } from '../lib/router.js';

export const onRequest = (context) => route(context.request, context.env);
