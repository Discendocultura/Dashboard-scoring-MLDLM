// API de solo lectura para el setter IA (proyecto aparte). Protegida con su propia clave:
//   Authorization: Bearer <SETTER_API_KEY>   (secreto en Cloudflare → Variables y secretos; o SETTER_API_KEY_<CLIENTE>
//   para un cliente concreto, y SETTER_API_CLIENTES para limitar a qué clientes abre la general)
//   GET /api/setter/marca?c=<cliente>[&producto=<id o nombre>][&e=<embudo>]
//       ficha de marca y avatar, oferta y testimonios del producto (funciona sin lanzamiento)
//   GET /api/setter/lanzamiento?c=&l=<código | auto>[&e=<embudo>][&producto=]
//       fechas, fase actual, oferta, enlaces de pago y la encuesta (preguntas y opciones)
//   GET /api/setter/lead?c=&l=&cid=<id del contacto en GHL>
//       encuesta, preclase, directo, VIP, inicio de pago, compra, origen y puntuación con su temperatura
//   GET /api/setter/estado?c=   → { ok, cliente }: para que LabIA sepa que está conectado (y con qué cliente)
// Solo para los clientes con LabIA contratado en AlquimIA (Agencia → Clientes): al resto, 403 { sinLabia: true }.
// Respuesta: { texto, version, … } (JSON) o, con &formato=texto, solo el texto. Sin emails ni teléfonos.
// Lleva ETag (= version): si el setter manda If-None-Match con la que ya tiene y nada ha cambiado, 304 sin cuerpo.
import { env } from '../lib/env.js';
import { safeEqual } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { leerMarca } from '../lib/marca.js';
import { clienteActual, envCliente } from '../lib/cliente.js';
import { currentLaunch } from '../lib/digest.js';
import { getContactCompleto, aplicarCamposFormulario, listAllFields } from '../lib/ghl.js';
import { visitaDe } from '../lib/entradas.js';
import { json, errorResponse } from '../lib/http.js';
import { labiaAqui } from '../lib/clientes.js';
import { elegirProducto, listaProductos, textoMarca, textoLanzamiento, textoLead, datosLead, faseActual } from '../lib/setter-api.js';
import { nombreDeProducto } from '../public/js/marca.js';
import { nombreProducto } from '../public/js/producto.js';

const mal = (status, error) => json({ error }, status);
// Clave: la del cliente (SETTER_API_KEY_<CLIENTE>) si existe; si no, la general SETTER_API_KEY, que solo vale para los
// clientes de SETTER_API_CLIENTES (ids separados por comas) si se pone esa lista. Así una clave dada a un tercero para
// un proyecto no abre los leads de los demás.
const claveGeneral = () => String(env.SETTER_API_KEY || '').trim();
function claveDelCliente() {
  const propia = String(envCliente('SETTER_API_KEY') || '').trim();
  if (propia && propia !== claveGeneral()) return propia;
  const lista = String(env.SETTER_API_CLIENTES || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  return !lista.length || lista.includes(clienteActual().id) ? claveGeneral() : '';
}
function autorizado(request) {
  const clave = claveDelCliente();
  const dada = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return clave.length >= 24 && dada && safeEqual(dada, clave);
}
// Huella corta del contenido (FNV-1a de 32 bits): cambia si cambia cualquier cosa de la respuesta.
export function huella(txt) {
  let h = 0x811c9dc5;
  for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
function responder(request, url, texto, extra = {}) {
  const comoTexto = url.searchParams.get('formato') === 'texto';
  const version = huella(JSON.stringify([comoTexto, extra, texto]));
  const etag = `"${version}"`;
  const headers = { etag, 'cache-control': 'no-store' };
  const pedida = (request.headers.get('if-none-match') || '').split(',').map((x) => x.trim().replace(/^W\//, ''));
  if (pedida.includes(etag)) return new Response(null, { status: 304, headers });
  if (comoTexto) return new Response(texto, { headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' } });
  const res = json({ cliente: clienteActual().id, ...extra, version, texto });
  res.headers.set('etag', etag);
  return res;
}

// Las preguntas de la encuesta del cliente con sus opciones (las de GHL; si no, las del mock/configuración).
async function preguntasEncuesta(config) {
  const ps = config.encuesta || [];
  if (!ps.length) return [];
  const campos = await listAllFields().catch(() => []);
  return ps.map((p) => ({ ...p, opciones: campos.find((f) => f.id === p.id)?.opciones || p.opciones || [] }));
}
// l=auto: el lanzamiento en curso; con &e=<embudo>, el de ese embudo (con dos productos a la vez, no se mezclan).
function lanzamientoPedido(config, l, embudo = '') {
  const deEmbudo = embudo ? { ...config, launches: Object.fromEntries(Object.entries(config.launches).filter(([, x]) => x.embudo === embudo)) } : config;
  const code = l === 'auto' || !l ? currentLaunch(deEmbudo) : l;
  return code && Object.hasOwn(config.launches, code) ? code : '';
}

export async function GET(request) {
  try {
    const clave = claveDelCliente();
    if (!clave) return mal(503, 'Falta configurar SETTER_API_KEY en Cloudflare');
    if (clave.length < 24) return mal(503, 'SETTER_API_KEY tiene que tener al menos 24 caracteres');
    if (!autorizado(request)) return mal(401, 'Clave no válida');
    const url = new URL(request.url);
    const ruta = url.pathname.replace(/\/$/, '').split('/').pop();
    const config = await getConfig();
    // La información extra de AlquimIA es solo para quien tiene LabIA contratado en este cliente.
    if (!(await labiaAqui(config))) return json({ error: `«${clienteActual().nombre}» no tiene LabIA activado en AlquimIA (Agencia → Clientes → «LabIA contratado»)`, sinLabia: true }, 403);
    if (ruta === 'estado') return json({ ok: true, cliente: clienteActual().nombre });

    if (ruta === 'marca') {
      const m = await leerMarca();
      const producto = elegirProducto(m, { pedido: url.searchParams.get('producto') || '', embudo: url.searchParams.get('e') || '' });
      const nombre = producto ? nombreDeProducto(producto, m.productos.indexOf(producto)) : nombreProducto(config);
      return responder(request, url, textoMarca({ cliente: clienteActual().nombre, m, producto, config }), { producto: { id: producto?.id || '', nombre }, productos: listaProductos(m) });
    }

    const code = lanzamientoPedido(config, url.searchParams.get('l'), url.searchParams.get('e') || '');
    if (!code) return mal(404, 'Lanzamiento no encontrado (usa l=<código> o l=auto)');
    const l = config.launches[code];

    if (ruta === 'lanzamiento') {
      const [m, preguntas] = await Promise.all([leerMarca(), preguntasEncuesta(config)]);
      const producto = elegirProducto(m, { pedido: url.searchParams.get('producto') || '', embudo: l.embudo || '' });
      const nombre = producto ? nombreDeProducto(producto, m.productos.indexOf(producto)) : nombreProducto(config);
      const fase = faseActual(l);
      return responder(request, url, textoLanzamiento({ code, l, preguntas, nombre }), { lanzamiento: code, fase: fase.id, producto: nombre });
    }

    if (ruta === 'lead') {
      const cid = String(url.searchParams.get('cid') || '');
      if (!/^[A-Za-z0-9]{6,40}$/.test(cid)) return mal(400, 'Falta cid (el id del contacto en GHL)');
      const [contact, preguntas, inicioPago, ventaVisita] = await Promise.all([
        getContactCompleto(cid), preguntasEncuesta(config), visitaDe(code, cid, 'pago').catch(() => null), visitaDe(code, cid, 'venta').catch(() => null),
      ]);
      if (!contact) return mal(404, 'Contacto no encontrado en GHL');
      aplicarCamposFormulario(contact, config.formAds);
      const extra = { inicioPago, ventaVisita };
      const d = datosLead({ contact, code, config, extra });
      return responder(request, url, textoLead({ contact, code, config, extra, preguntas, datos: d }), {
        lanzamiento: code, cid, puntos: d.puntos, temperatura: d.temperatura.id, compro: Boolean(d.s.compra), inicioPago: Boolean(d.s.inicio_pago && !d.s.compra),
      });
    }
    return mal(404, 'Ruta no encontrada: marca, lanzamiento o lead');
  } catch (e) {
    return errorResponse(e);
  }
}
