// Enruta /api/<nombre> y /directo a los handlers. Lo usan Cloudflare (functions/) y el servidor local.
import * as access from '../handlers/access.js';
import * as applyTags from '../handlers/apply-tags.js';
import * as config from '../handlers/config.js';
import * as directo from '../handlers/directo.js';
import * as fields from '../handlers/fields.js';
import * as health from '../handlers/health.js';
import * as identify from '../handlers/identify.js';
import * as leads from '../handlers/leads.js';
import * as login from '../handlers/login.js';
import * as logout from '../handlers/logout.js';
import * as me from '../handlers/me.js';
import * as tags from '../handlers/tags.js';
import * as track from '../handlers/track.js';
import * as zoomReport from '../handlers/zoom-report.js';
import { setEnv } from './env.js';
import { json } from './http.js';

const API = {
  access, 'apply-tags': applyTags, config, fields, health, identify, leads, login, logout, me, tags, track, 'zoom-report': zoomReport,
};

// `ctx` (Cloudflare) permite terminar tareas después de responder (ctx.waitUntil).
export async function route(request, envSource, ctx) {
  setEnv(envSource);
  const { pathname } = new URL(request.url);
  let mod = null;
  if (pathname === '/directo') mod = directo;
  else if (pathname.startsWith('/api/')) mod = API[pathname.slice(5).replace(/\/$/, '')] || null;
  if (!mod) return json({ error: 'No encontrado' }, 404);
  const handler = mod[request.method];
  if (!handler) return json({ error: 'Método no permitido' }, 405);
  return handler(request, ctx);
}
