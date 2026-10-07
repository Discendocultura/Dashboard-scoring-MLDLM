// Enruta /api/<nombre> y /directo a los handlers. Lo usan Cloudflare (functions/) y el servidor local.
import * as access from '../handlers/access.js';
import * as agencia from '../handlers/agencia.js';
import * as applyTags from '../handlers/apply-tags.js';
import * as cal from '../handlers/cal.js';
import * as clientes from '../handlers/clientes.js';
import * as config from '../handlers/config.js';
import * as digest from '../handlers/digest.js';
import * as directo from '../handlers/directo.js';
import * as eventos from '../handlers/eventos.js';
import * as fields from '../handlers/fields.js';
import * as foto from '../handlers/foto.js';
import * as health from '../handlers/health.js';
import * as historialH from '../handlers/historial.js';
import * as ics from '../handlers/ics.js';
import * as identify from '../handlers/identify.js';
import * as informe from '../handlers/informe.js';
import * as leads from '../handlers/leads.js';
import * as llamadas from '../handlers/llamadas.js';
import * as login from '../handlers/login.js';
import * as logout from '../handlers/logout.js';
import * as me from '../handlers/me.js';
import * as meta from '../handlers/meta.js';
import * as page from '../handlers/page.js';
import * as plantillas from '../handlers/plantillas.js';
import * as rendimiento from '../handlers/rendimiento.js';
import * as resumen from '../handlers/resumen.js';
import * as roles from '../handlers/roles.js';
import * as seguridad from '../handlers/seguridad.js';
import * as tags from '../handlers/tags.js';
import * as tareas from '../handlers/tareas.js';
import * as track from '../handlers/track.js';
import * as usuarios from '../handlers/usuarios.js';
import * as vsl from '../handlers/vsl.js';
import * as zoomReport from '../handlers/zoom-report.js';
import { setEnv } from './env.js';
import { principal, runCliente } from './cliente.js';
import { clientePorId } from './clientes.js';
import { json } from './http.js';

const API = {
  access, agencia, 'apply-tags': applyTags, cal, clientes, config, digest, eventos, fields, foto, health, historial: historialH, ics, identify, informe, leads, llamadas, login, logout, me, meta, page, plantillas, rendimiento, resumen, roles, seguridad, tags, tareas, track, usuarios, vsl, 'zoom-report': zoomReport,
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
  // Cliente de la petición: ?c= (páginas públicas de GHL) o la cabecera x-cliente (dashboard).
  // Sin indicar, el principal (así las páginas y enlaces de siempre siguen funcionando).
  const url = new URL(request.url);
  const pedido = (url.searchParams.get('c') || request.headers.get('x-cliente') || '').trim().toLowerCase();
  let cliente = principal();
  if (pedido && pedido !== cliente.id) {
    try {
      cliente = await clientePorId(pedido);
    } catch (e) {
      return json({ error: 'No se pudo leer la lista de clientes', detail: String(e.message || e) }, 502);
    }
    if (!cliente) return json({ error: 'Cliente no encontrado', cliente: pedido }, 404);
  }
  return runCliente(cliente, () => handler(request, ctx));
}
