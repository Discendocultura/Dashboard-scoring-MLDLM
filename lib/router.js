// Enruta /api/<nombre> y /directo a los handlers. Lo usan Cloudflare (functions/) y el servidor local.
import * as access from '../handlers/access.js';
import * as agencia from '../handlers/agencia.js';
import * as applyTags from '../handlers/apply-tags.js';
import * as cal from '../handlers/cal.js';
import * as clientes from '../handlers/clientes.js';
import * as config from '../handlers/config.js';
import * as digest from '../handlers/digest.js';
import * as directo from '../handlers/directo.js';
import * as directa from '../handlers/directa.js';
import * as eventos from '../handlers/eventos.js';
import * as emailsH from '../handlers/emails.js';
import * as calendario from '../handlers/calendario.js';
import * as ciclo from '../handlers/ciclo.js';
import * as fields from '../handlers/fields.js';
import * as foto from '../handlers/foto.js';
import * as health from '../handlers/health.js';
import * as historialH from '../handlers/historial.js';
import * as ics from '../handlers/ics.js';
import * as zoomRegistro from '../handlers/zoom-registro.js';
import * as thrivecartH from '../handlers/thrivecart.js';
import * as hotmartH from '../handlers/hotmart.js';
import * as setterApi from '../handlers/setter.js';
import * as setterIa from '../handlers/setter-ia.js';
import * as labiaH from '../handlers/labia.js';
import * as negocioH from '../handlers/negocio.js';
import * as plantillasWa from '../handlers/plantillas-wa.js';
import * as identify from '../handlers/identify.js';
import * as informe from '../handlers/informe.js';
import * as informeDiario from '../handlers/informe-diario.js';
import * as procesosH from '../handlers/procesos.js';
import * as operativaH from '../handlers/operativa.js';
import * as leads from '../handlers/leads.js';
import * as llamadas from '../handlers/llamadas.js';
import * as login from '../handlers/login.js';
import * as logout from '../handlers/logout.js';
import * as me from '../handlers/me.js';
import * as meta from '../handlers/meta.js';
import * as marca from '../handlers/marca.js';
import * as mcp from '../handlers/mcp.js';
import * as oauthH from '../handlers/oauth.js';
import * as page from '../handlers/page.js';
import * as plantillas from '../handlers/plantillas.js';
import * as publicidadH from '../handlers/publicidad.js';
import * as rendimiento from '../handlers/rendimiento.js';
import * as ficha from '../handlers/ficha.js';
import * as meteorico from '../handlers/meteorico.js';
import * as nuevoLanzamientoH from '../handlers/nuevo-lanzamiento.js';
import * as resumen from '../handlers/resumen.js';
import * as inicio from '../handlers/inicio.js';
import * as votacion from '../handlers/votacion.js';
import * as comentariosH from '../handlers/comentarios.js';
import * as atajosH from '../handlers/atajos.js';
import * as productosH from '../handlers/productos.js';
import * as editandoH from '../handlers/editando.js';
import * as cruzadasH from '../handlers/cruzadas.js';
import * as directoZoom from '../handlers/directo-zoom.js';
import * as zoomSala from '../handlers/zoom-sala.js';
import * as endirecto from '../handlers/endirecto.js';
import * as visita from '../handlers/visita.js';
import * as abH from '../handlers/ab.js';
import * as roles from '../handlers/roles.js';
import * as seguridad from '../handlers/seguridad.js';
import * as pipelineH from '../handlers/pipeline.js';
import * as seguimientoH from '../handlers/seguimiento.js';
import * as sendflowH from '../handlers/sendflow.js';
import * as siguientesPasosH from '../handlers/siguientes-pasos.js';
import * as tags from '../handlers/tags.js';
import * as telegramH from '../handlers/telegram.js';
import * as tareas from '../handlers/tareas.js';
import * as track from '../handlers/track.js';
import * as retencionH from '../handlers/retencion.js';
import * as usuarios from '../handlers/usuarios.js';
import * as vsl from '../handlers/vsl.js';
import * as zoomReport from '../handlers/zoom-report.js';
import * as directoIa from '../handlers/directo-ia.js';
import { setEnv } from './env.js';
import { principal, runCliente, EJEMPLO_ID, clienteEjemplo } from './cliente.js';
import { clientePorId } from './clientes.js';
import { json } from './http.js';
import { verComoUid } from './auth.js';
import * as verComoH from '../handlers/vercomo.js';

const API = {
  ab: abH, access, agencia, 'apply-tags': applyTags, comentarios: comentariosH, atajos: atajosH, 'directo-zoom': directoZoom, 'directo-ia': directoIa, endirecto, visita, cal, calendario, ciclo, clientes, config, digest, directa, emails: emailsH, eventos, ficha, fields, foto, health, historial: historialH, ics, identify, informe, 'informe-diario': informeDiario, inicio, leads, llamadas, login, logout, marca, mcp, me, meta, meteorico, 'nuevo-lanzamiento': nuevoLanzamientoH, page, operativa: operativaH, plantillas, procesos: procesosH, publicidad: publicidadH, rendimiento, resumen, roles, pipeline: pipelineH, seguimiento: seguimientoH, seguridad, sendflow: sendflowH, 'siguientes-pasos': siguientesPasosH, tags, tareas, telegram: telegramH, track, retencion: retencionH, usuarios, votacion, vsl, 'zoom-report': zoomReport, 'zoom-sala': zoomSala, 'zoom-registro': zoomRegistro, thrivecart: thrivecartH, hotmart: hotmartH, 'setter/marca': setterApi, 'setter/lanzamiento': setterApi, 'setter/lead': setterApi, 'setter/estado': setterApi, 'setter-ia': setterIa, labia: labiaH, negocio: negocioH, productos: productosH, editando: editandoH, cruzadas: cruzadasH, 'plantillas-wa': plantillasWa, vercomo: verComoH,
};
// Mientras el superadmin usa «Ver como», solo se consulta: nada de cambios (salvo salir de ahí, entrar y salir de la cuenta).
const LIBRES_VER_COMO = new Set(['vercomo', 'logout', 'login']);
// En el ejemplo solo se puede salir y guardar lo propio de cada usuario (su progreso del onboarding y los avisos vistos).
const LIBRES_EJEMPLO = new Set(['logout', 'login', 'usuarios']);
const OPS_USUARIO_EJEMPLO = new Set(['onboarding', 'notif-visto', 'aviso-2fa-ocultar', 'mis-avisos']);
// En el ejemplo todos entran como admin: nada de lo común de la agencia (equipo, seguridad, clientes, historial…) ni de lo
// que usa credenciales reales (SendFlow, Zoom, Telegram, setter, conector de Claude). Solo datos del ejemplo.
const VETADOS_EJEMPLO = new Set(['seguridad', 'roles', 'clientes', 'agencia', 'historial', 'vercomo', 'sendflow', 'telegram', 'mcp', 'digest',
  'informe', 'informe-diario', 'operativa', 'procesos', 'atajos', 'directo-zoom', 'zoom-sala', 'zoom-registro', 'thrivecart', 'hotmart', 'zoom-report', 'directo-ia', 'setter-ia', 'setter/marca',
  'setter/lanzamiento', 'setter/lead', 'setter/estado', 'labia', 'plantillas-wa', 'plantillas', 'access', 'identify', 'cal', 'endirecto']);

// `ctx` (Cloudflare) permite terminar tareas después de responder (ctx.waitUntil).
export async function route(request, envSource, ctx) {
  setEnv(envSource);
  const { pathname } = new URL(request.url);
  // Conector de Claude: metadatos OAuth (/.well-known/…) y /api/oauth/* (siempre en el cliente principal:
  // las conexiones son de la agencia; cada herramienta elige luego su cliente).
  if (pathname.startsWith('/.well-known/oauth-protected-resource')) return oauthH.metadatosRecurso(request);
  if (pathname.startsWith('/.well-known/oauth-authorization-server') || pathname.startsWith('/.well-known/openid-configuration')) return oauthH.metadatosServidor(request);
  if (pathname.startsWith('/api/oauth/')) return runCliente(principal(), () => oauthH.oauth(request));
  let mod = null;
  if (pathname === '/directo') mod = directo;
  else if (pathname.startsWith('/api/')) mod = API[pathname.slice(5).replace(/\/$/, '')] || null;
  if (!mod) return json({ error: 'No encontrado' }, 404);
  const handler = mod[request.method];
  if (!handler) return json({ error: 'Método no permitido' }, 405);
  const nombre = pathname.slice(5).replace(/\/$/, '');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !LIBRES_VER_COMO.has(nombre) && pathname.startsWith('/api/') && (await verComoUid(request))) {
    return json({ error: 'Estás viendo AlquimIA como otra persona: es solo para mirar, no se puede cambiar nada. Pulsa «Volver a mi cuenta» arriba.', verComo: true }, 403);
  }
  // Cliente de la petición: ?c= (páginas públicas de GHL) o la cabecera x-cliente (dashboard).
  // Sin indicar, el principal (así las páginas y enlaces de siempre siguen funcionando).
  const url = new URL(request.url);
  const pedido = (url.searchParams.get('c') || request.headers.get('x-cliente') || '').trim().toLowerCase();
  let cliente = principal();
  if (pedido === EJEMPLO_ID) {
    // El ejemplo es para mirar: se puede leer todo, pero no se guarda nada (salvo el progreso del onboarding de cada
    // usuario, que vive aparte, y salir).
    let op = '';
    if (nombre === 'usuarios' && request.method === 'POST') { try { op = String((await request.clone().json())?.op || ''); } catch { /* sin cuerpo */ } }
    if (VETADOS_EJEMPLO.has(nombre) || pathname === '/directo') return json({ error: 'Esto no está en el ejemplo.', ejemplo: true }, 403);
    if (nombre === 'usuarios' && request.method === 'GET') return json({ users: [] }); // el ejemplo no tiene equipo
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && (!LIBRES_EJEMPLO.has(nombre) || (nombre === 'usuarios' && !OPS_USUARIO_EJEMPLO.has(op)))) {
      return json({ error: 'Esto es un ejemplo con datos inventados: aquí no se guarda nada. Vuelve a lo tuyo para hacer cambios.', ejemplo: true }, 403);
    }
    return runCliente(clienteEjemplo(), () => handler(request, ctx));
  }
  if (pedido && pedido !== cliente.id) {
    try {
      cliente = await clientePorId(pedido);
    } catch (e) {
      return json({ error: 'No se pudo leer la lista de clientes', detail: String(e.message || e) }, 502);
    }
    if (!cliente) return json({ error: 'No encontrado' }, 404); // sin decir qué id: que no sirva para adivinar clientes
  }
  return runCliente(cliente, () => handler(request, ctx));
}
