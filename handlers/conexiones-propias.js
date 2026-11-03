// Conexiones propias del cliente (AlquimIA → Conexiones): su Zoom, su SendFlow y su Vimeo, pegados por él mismo.
//   GET  /api/conexiones-propias                         → (equipo, «config») { zoom, sendflow, vimeo }: conectada, desde dónde, resumen
//   POST /api/conexiones-propias { op: 'guardar', servicio, datos } → comprueba (Zoom y Vimeo) y guarda cifrado
//   POST /api/conexiones-propias { op: 'quitar', servicio }         → vuelve a lo de antes (Cloudflare, la agencia o nada)
import { requireSession } from '../lib/auth.js';
import { json, readBody, errorResponse } from '../lib/http.js';
import { env } from '../lib/env.js';
import { clienteActual } from '../lib/cliente.js';
import { estadoPropias, datosLimpios, guardarConexion, borrarConexion, SERVICIOS } from '../lib/conexiones-propias.js';
import { zoomDeCliente, probarVarsZoom } from '../lib/zoom.js';
import { sendflowDeCliente } from '../lib/sendflow.js';
import { vimeoConfigurado } from '../lib/vimeo.js';

const useMock = () => env.GHL_MOCK === '1';
const bad = (msg) => Object.assign(new Error(msg), { status: 400, publicMessage: msg });

// Qué usa ahora cada servicio, sin enseñar claves: 'alquimia' (pegada aquí), 'propio' (Cloudflare del cliente),
// 'agencia' o 'ninguno'.
async function estado() {
  const propias = await estadoPropias();
  const zoom = zoomDeCliente();
  const sf = sendflowDeCliente();
  // En el cliente principal, «las de la agencia» son las suyas de siempre (las variables sin sufijo).
  const usa = (d) => (d.desde === 'alquimia' ? 'alquimia' : clienteActual().principal && d.cual === 'agencia' ? 'propio' : d.cual);
  return {
    zoom: { ...propias.zoom, usa: usa(zoom) },
    sendflow: { ...propias.sendflow, usa: usa(sf) },
    vimeo: { ...propias.vimeo, usa: propias.vimeo.conectada ? 'alquimia' : vimeoConfigurado() ? 'propio' : 'ninguno' },
  };
}

async function comprobar(servicio, v, { fetchFn = fetch } = {}) {
  if (useMock()) return;
  if (servicio === 'zoom') {
    const r = await probarVarsZoom({ ZOOM_ACCOUNT_ID: v.accountId, ZOOM_CLIENT_ID: v.clientId, ZOOM_CLIENT_SECRET: v.clientSecret }, { fetchFn });
    if (!r.ok) throw bad(r.error);
  } else if (servicio === 'vimeo') {
    const res = await fetchFn('https://api.vimeo.com/me', { headers: { Authorization: `bearer ${v.token}`, Accept: 'application/vnd.vimeo.*+json;version=3.4' }, signal: AbortSignal.timeout(15_000) });
    if (res.status === 401) throw bad('Vimeo no reconoce el token: vuelve a copiarlo entero (developer.vimeo.com → My apps → tu app → Generate access token).');
    if (!res.ok) throw bad(`Vimeo ha respondido con un error (${res.status}). Prueba otra vez en un minuto.`);
  } else if (v.apiKey.length < 10) {
    throw bad('Esa clave de SendFlow es demasiado corta: cópiala entera de SendFlow → «API Keys».');
  }
  // SendFlow no se prueba aquí: bloquea la clave si se le pide mucho. La tarjeta pulsa «Probar conexión» después.
}

export async function GET(request) {
  try {
    await requireSession(request, { permiso: 'config' });
    return json(await estado());
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    await requireSession(request, { permiso: 'config' });
    const body = await readBody(request);
    const servicio = String(body.servicio || '');
    if (!SERVICIOS[servicio]) throw bad('Conexión desconocida');
    if (body.op === 'quitar') {
      await borrarConexion(servicio);
      return json({ ok: true, ...(await estado()) });
    }
    if (body.op !== 'guardar') throw bad('Operación no válida');
    const v = datosLimpios(servicio, body.datos);
    await comprobar(servicio, v);
    await guardarConexion(servicio, v);
    return json({ ok: true, ...(await estado()) });
  } catch (e) {
    return errorResponse(e);
  }
}
