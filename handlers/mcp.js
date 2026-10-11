// Servidor MCP del dashboard para Claude (Cowork / claude.ai): POST /api/mcp con JSON-RPC (Streamable HTTP, sin
// estado ni SSE). Pide un token OAuth (ver handlers/oauth.js); sin él responde 401 con dónde conseguirlo.
// Cada herramienta corre en el cliente elegido con la sesión de quien conectó (lib/mcp-tools.js).
import { sesionDeToken, sesionDeGrant } from '../lib/oauth.js';
import { TOOLS, toolPublica, textoSalida } from '../lib/mcp-tools.js';
import { runCliente, principal } from '../lib/cliente.js';
import { listClientes } from '../lib/clientes.js';
import { rolEn } from '../lib/users.js';
import { VERSION } from '../lib/version.js';
import { json } from '../lib/http.js';

export const PROTOCOLOS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'www-authenticate', 'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id' };
const INSTRUCCIONES = `Dashboard de lanzamientos de la agencia (Estelabs): embudos, lanzamientos, métricas, encuesta, ficha de marca y avatar, narrativa, tareas y emails de cada cliente. Solo lectura.
Empieza con «ver_embudos» para saber los clientes y los códigos de los lanzamientos. Antes de escribir copy, lee «marca_y_narrativa». Responde en español de España.`;

const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const err = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

function sinToken(request) {
  const o = new URL(request.url).origin;
  return json({ error: 'invalid_token', error_description: 'Conecta el dashboard desde Claude (Ajustes → Conectores).' }, 401, {
    ...CORS, 'www-authenticate': `Bearer resource_metadata="${o}/.well-known/oauth-protected-resource/api/mcp"`,
  });
}

// Clientes a los que llega la persona (como en /api/me).
async function clientesDe(s) {
  const todos = await listClientes();
  return s.superadmin ? todos : s.user ? todos.filter((c) => rolEn(s.user, c.id)) : todos.filter((c) => c.principal);
}

async function llamarTool(params, ctx) {
  const t = TOOLS.find((x) => x.name === params?.name);
  if (!t) return { error: [-32602, `Herramienta desconocida: ${params?.name}`] };
  const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
  const clientes = await clientesDe(ctx.s);
  const pedido = String(args.cliente || '').trim().toLowerCase();
  const cliente = pedido ? clientes.find((c) => c.id === pedido || c.nombre.toLowerCase() === pedido)
    : clientes.find((c) => c.principal) || clientes[0] || principal();
  const fallo = (texto) => ({ result: { content: [{ type: 'text', text: texto }], isError: true } });
  if (!cliente) return fallo(`No tienes acceso al cliente «${args.cliente}». Tus clientes: ${clientes.map((c) => `${c.nombre} (${c.id})`).join(', ') || 'ninguno'}.`);
  try {
    return await runCliente(cliente, async () => {
      // La sesión en ESE cliente (su rol y permisos allí).
      const s = await sesionDeGrant(ctx.grant, ctx.origin);
      if (!s?.role) return fallo(`No tienes acceso a «${cliente.nombre}».`);
      const v = await t.run(args, { s, clientes, origin: ctx.origin });
      return { result: { content: [{ type: 'text', text: textoSalida(v) }] } };
    });
  } catch (e) {
    if (e instanceof Response) return fallo((await e.json().catch(() => ({}))).error || 'Sin permiso');
    if (!e.publico) console.error('MCP', params.name, e);
    return fallo(e.publico || e.publicMessage || `No se pudo completar: ${e.message || e}`);
  }
}

async function atender(msg, ctx) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return err(msg?.id, -32600, 'Petición no válida');
  const { id, method, params } = msg;
  const notificacion = id === undefined || id === null;
  if (method === 'initialize') {
    const pedido = params?.protocolVersion;
    return ok(id, {
      protocolVersion: PROTOCOLOS.includes(pedido) ? pedido : PROTOCOLOS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'dashboard-estelabs', title: 'Dashboard Datos', version: VERSION.slice(0, 60) },
      instructions: INSTRUCCIONES,
    });
  }
  if (notificacion) return null; // notifications/initialized, cancelled…
  if (method === 'ping') return ok(id, {});
  if (method === 'tools/list') return ok(id, { tools: TOOLS.map(toolPublica) });
  if (method === 'tools/call') {
    const r = await llamarTool(params, ctx);
    return r.error ? err(id, ...r.error) : ok(id, r.result);
  }
  if (method === 'resources/list') return ok(id, { resources: [] });
  if (method === 'prompts/list') return ok(id, { prompts: [] });
  return err(id, -32601, `Método no soportado: ${method}`);
}

export async function POST(request) {
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  const origin = new URL(request.url).origin;
  const ses = bearer ? await sesionDeToken(bearer, origin).catch((e) => { console.error('MCP token', e); return null; }) : null;
  if (!ses) return sinToken(request);
  let body;
  try { body = await request.json(); } catch { return json(err(null, -32700, 'JSON no válido'), 400, CORS); }
  const ctx = { grant: ses.grant, s: ses.s, origin };
  const lista = Array.isArray(body) ? body : [body];
  const respuestas = (await Promise.all(lista.map((m) => atender(m, ctx)))).filter(Boolean);
  if (!respuestas.length) return new Response(null, { status: 202, headers: CORS });
  return json(Array.isArray(body) ? respuestas : respuestas[0], 200, CORS);
}

// Sin flujo de eventos (SSE): el cliente usa solo POST.
export const GET = (request) => (request.headers.get('authorization') ? new Response(null, { status: 405, headers: { ...CORS, allow: 'POST' } }) : sinToken(request));
export const DELETE = () => new Response(null, { status: 405, headers: { ...CORS, allow: 'POST' } });
export const OPTIONS = () => new Response(null, { status: 204, headers: { ...CORS, 'access-control-allow-methods': 'GET, POST, OPTIONS' } });
