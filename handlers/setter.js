// API de solo lectura para el setter IA (proyecto aparte). Protegida con su propia clave:
//   Authorization: Bearer <SETTER_API_KEY>   (secreto en Cloudflare → Variables y secretos)
//   GET /api/setter/marca?c=<cliente>[&producto=<id o nombre>][&e=<embudo>]
//       ficha de marca y avatar, oferta y testimonios del producto (funciona sin lanzamiento)
//   GET /api/setter/lanzamiento?c=&l=<código | auto>[&producto=]
//       fechas, fase actual, oferta, enlaces de pago y la encuesta (preguntas y opciones)
//   GET /api/setter/lead?c=&l=&cid=<id del contacto en GHL>
//       encuesta, preclase, directo, VIP, inicio de pago, compra, origen y puntuación con su temperatura
// Respuesta: { texto, … } (JSON) o, con &formato=texto, solo el texto. Sin emails ni teléfonos.
import { env } from '../lib/env.js';
import { safeEqual } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { leerMarca } from '../lib/marca.js';
import { clienteActual } from '../lib/cliente.js';
import { currentLaunch } from '../lib/digest.js';
import { getContactCompleto, aplicarCamposFormulario, listAllFields } from '../lib/ghl.js';
import { visitaDe } from '../lib/entradas.js';
import { json, errorResponse } from '../lib/http.js';
import { elegirProducto, listaProductos, textoMarca, textoLanzamiento, textoLead, datosLead, faseActual } from '../lib/setter-api.js';
import { nombreDeProducto } from '../public/js/marca.js';
import { nombreProducto } from '../public/js/producto.js';

const mal = (status, error) => json({ error }, status);
function autorizado(request) {
  const clave = String(env.SETTER_API_KEY || '').trim();
  const dada = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return clave.length >= 24 && dada && safeEqual(dada, clave);
}
const responder = (url, texto, extra = {}) => (url.searchParams.get('formato') === 'texto'
  ? new Response(texto, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
  : json({ cliente: clienteActual().id, ...extra, texto }));

// Las preguntas de la encuesta del cliente con sus opciones (las de GHL; si no, las del mock/configuración).
async function preguntasEncuesta(config) {
  const ps = config.encuesta || [];
  if (!ps.length) return [];
  const campos = await listAllFields().catch(() => []);
  return ps.map((p) => ({ ...p, opciones: campos.find((f) => f.id === p.id)?.opciones || p.opciones || [] }));
}
function lanzamientoPedido(config, l) {
  const code = l === 'auto' || !l ? currentLaunch(config) : l;
  return code && Object.hasOwn(config.launches, code) ? code : '';
}

export async function GET(request) {
  try {
    if (!String(env.SETTER_API_KEY || '').trim()) return mal(503, 'Falta configurar SETTER_API_KEY en Cloudflare');
    if (!autorizado(request)) return mal(401, 'Clave no válida');
    const url = new URL(request.url);
    const ruta = url.pathname.replace(/\/$/, '').split('/').pop();
    const config = await getConfig();

    if (ruta === 'marca') {
      const m = await leerMarca();
      const producto = elegirProducto(m, { pedido: url.searchParams.get('producto') || '', embudo: url.searchParams.get('e') || '' });
      const nombre = producto ? nombreDeProducto(producto, m.productos.indexOf(producto)) : nombreProducto(config);
      return responder(url, textoMarca({ cliente: clienteActual().nombre, m, producto, config }), { producto: { id: producto?.id || '', nombre }, productos: listaProductos(m) });
    }

    const code = lanzamientoPedido(config, url.searchParams.get('l'));
    if (!code) return mal(404, 'Lanzamiento no encontrado (usa l=<código> o l=auto)');
    const l = config.launches[code];

    if (ruta === 'lanzamiento') {
      const [m, preguntas] = await Promise.all([leerMarca(), preguntasEncuesta(config)]);
      const producto = elegirProducto(m, { pedido: url.searchParams.get('producto') || '', embudo: l.embudo || '' });
      const nombre = producto ? nombreDeProducto(producto, m.productos.indexOf(producto)) : nombreProducto(config);
      const fase = faseActual(l);
      return responder(url, textoLanzamiento({ code, l, preguntas, nombre }), { lanzamiento: code, fase: fase.id, producto: nombre });
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
      return responder(url, textoLead({ contact, code, config, extra, preguntas }), {
        lanzamiento: code, cid, puntos: d.puntos, temperatura: d.temperatura.id, compro: Boolean(d.s.compra), inicioPago: Boolean(d.s.inicio_pago && !d.s.compra),
      });
    }
    return mal(404, 'Ruta no encontrada: marca, lanzamiento o lead');
  } catch (e) {
    return errorResponse(e);
  }
}
