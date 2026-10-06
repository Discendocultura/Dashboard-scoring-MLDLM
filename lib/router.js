// Enruta /api/<nombre> y /directo a los handlers. Lo usan Cloudflare (functions/) y el servidor local.
import * as access from '../handlers/access.js';
import * as applyTags from '../handlers/apply-tags.js';
import * as cal from '../handlers/cal.js';
import * as config from '../handlers/config.js';
import * as digest from '../handlers/digest.js';
import * as directo from '../handlers/directo.js';
import * as eventos from '../handlers/eventos.js';
import * as fields from '../handlers/fields.js';
import * as health from '../handlers/health.js';
import * as ics from '../handlers/ics.js';
import * as identify from '../handlers/identify.js';
import * as leads from '../handlers/leads.js';
import * as llamadas from '../handlers/llamadas.js';
import * as login from '../handlers/login.js';
import * as logout from '../handlers/logout.js';
import * as me from '../handlers/me.js';
import * as meta from '../handlers/meta.js';
import * as page from '../handlers/page.js';
import * as roles from '../handlers/roles.js';
import * as tags from '../handlers/tags.js';
import * as tareas from '../handlers/tareas.js';
import * as track from '../handlers/track.js';
import * as usuarios from '../handlers/usuarios.js';
import * as zoomReport from '../handlers/zoom-report.js';
import { setEnv } from './env.js';
import { json } from './http.js';

const API = {
  access, 'apply-tags': applyTags, cal, config, digest, eventos, fields, health, ics, identify, leads, llamadas, login, logout, me, meta, page, roles, tags, tareas, track, usuarios, 'zoom-report': zoomReport,
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
