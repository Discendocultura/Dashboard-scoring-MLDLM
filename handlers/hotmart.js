// Hotmart → AlquimIA. Dos caminos que se juntan sin repetir (mismo id por compra):
//   · API (lo más fiable): con la credencial de Hotmart Developers, las ventas y la comisión exacta de la productora.
//   · Aviso (webhook Postback 2.0): al momento, en una dirección firmada por cliente (como la de ThriveCart).
//   GET  /api/hotmart                      → (equipo, «config») estado: dirección del aviso, credencial, ventas, última sincronización
//   GET  /api/hotmart?op=ventas&desde&hasta → (equipo) ventas del periodo (ms); si hace >10 min de la última, sincroniza antes
//   POST /api/hotmart?op=credenciales      → (equipo, «config») { clientId, clientSecret, basic }: comprueba, guarda cifrado y trae 30 días
//   POST /api/hotmart?op=borrar            → (equipo, «config») quita la credencial
//   POST /api/hotmart?op=sincronizar       → (equipo, «config») { desde, hasta } trae ese tramo (para el histórico, mes a mes)
//   HEAD/POST /api/hotmart?c=…&k=…         → (Hotmart) el aviso de cada compra, reembolso o contracargo
import { requireSession, signToken, verifyToken } from '../lib/auth.js';
import { clienteActual } from '../lib/cliente.js';
import { leerJSON, guardarJSON, reintentando } from '../lib/store.js';
import { json, readBody, errorResponse } from '../lib/http.js';
import { dentroDelLimite } from '../lib/intentos.js';
import { env } from '../lib/env.js';
import { dominioLogin } from '../lib/dominio.js';
import { ventasDeApi, ventaDeAvisoHotmart, guardarVentaHm, plegarBumps } from '../public/js/hotmart.js';
import { credenciales, ventasApi, guardarCredenciales, CLAVE_CRED } from '../lib/hotmart-api.js';
import { claveDe } from './zoom-registro.js';

const CLAVE = 'lsd_hotmart_ventas';
const valor = () => `hotmart:${clienteActual().id}`;
const CADA = 10 * 60_000;

// Junta en lo guardado las compras que trae la API (y el reembolso sin comisión usa la de su cobro).
export function fusionar(lista, compras) {
  let out = lista;
  let nuevas = 0;
  for (const { item, comisiones } of compras) {
    for (let v of ventasDeApi(item, comisiones)) {
      if (v.tipo === 'reembolso' && v.neto == null) {
        const cobro = out.find((x) => x.pedido === v.pedido && x.tipo === 'cobro' && x.neto != null);
        if (cobro) v = { ...v, neto: -Math.abs(cobro.neto) };
      }
      const r = guardarVentaHm(out, v);
      if (r.cambio) { out = r.lista; nuevas++; }
    }
  }
  return { lista: out, nuevas };
}

// Trae de la API el tramo [desde, hasta] y lo guarda. Devuelve { nuevas, completo }.
export async function sincronizar({ desde, hasta, max = 40, fetchFn } = {}) {
  const cred = await credenciales();
  if (!cred) return { nuevas: 0, completo: true, sinCredencial: true };
  try {
    const { compras, completo } = await ventasApi(cred, { desde, hasta, max, fetchFn });
    const nuevas = await reintentando(async () => {
      const dato = (await leerJSON(CLAVE, () => ({ ventas: [] }))) || { ventas: [] };
      const r = fusionar(dato.ventas || [], compras);
      dato.ventas = r.lista;
      dato.ultimaSync = Date.now();
      dato.syncHasta = Math.max(dato.syncHasta || 0, completo ? hasta : desde);
      dato.syncError = '';
      await guardarJSON(CLAVE, dato, { motivo: `Hotmart: ${r.nuevas} ventas de la API` });
      return r.nuevas;
    });
    return { nuevas, completo };
  } catch (e) {
    const dato = (await leerJSON(CLAVE, () => ({ ventas: [] }))) || { ventas: [] };
    dato.ultimaSync = Date.now();
    dato.syncError = e.publicMessage || e.message;
    await guardarJSON(CLAVE, dato, { motivo: 'Hotmart: error al sincronizar' }).catch(() => {});
    throw e;
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('op') === 'ventas') {
      await requireSession(request);
      const desde = Number(url.searchParams.get('desde')) || 0;
      const hasta = Number(url.searchParams.get('hasta')) || Date.now() + 86_400_000;
      let dato = (await leerJSON(CLAVE, () => ({ ventas: [] }))) || { ventas: [] };
      // Al día: si hace más de 10 min, trae desde la última sincronización (con 3 días de margen) hasta ahora.
      if (Date.now() - (dato.ultimaSync || 0) > CADA && (await credenciales())) {
        const ini = Math.max(desde, (dato.syncHasta || Date.now() - 30 * 86_400_000) - 3 * 86_400_000);
        await sincronizar({ desde: ini, hasta: Date.now(), max: 30 }).catch(() => {});
        dato = (await leerJSON(CLAVE, () => ({ ventas: [] }))) || { ventas: [] };
      }
      const ventas = plegarBumps((dato.ventas || []).filter((v) => v.fecha >= desde && v.fecha <= hasta));
      return json({ ventas, ultimaSync: dato.ultimaSync || null, syncError: dato.syncError || '' });
    }
    await requireSession(request, { permiso: 'config' });
    const k = await signToken(valor());
    const dom = dominioLogin(env) || (url.hostname === 'data.discendocultura.com' ? 'alquimia.tenaxdigital.com' : '');
    const origen = dom && !/^(localhost|127\.0\.0\.1)$/.test(url.hostname) ? `https://${dom}` : url.origin;
    const [dato, g, cred] = await Promise.all([leerJSON(CLAVE, () => ({ ventas: [] })), leerJSON(CLAVE_CRED, () => null), credenciales()]);
    const ventas = (dato?.ventas || []).filter((v) => !v.prueba);
    const ultima = ventas.at(-1);
    return json({
      url: `${origen}/api/hotmart?c=${encodeURIComponent(clienteActual().id)}&k=${encodeURIComponent(k).replace(/%3A/gi, ':')}`,
      credencial: cred ? { origen: cred.origen, clientId: `…${cred.clientId.slice(-4)}`, guardadas: g?.guardadas || null } : null,
      total: ventas.length,
      ultima: ultima ? { fecha: ultima.fecha, tipo: ultima.tipo, producto: ultima.producto, importe: ultima.importe, neto: ultima.neto } : null,
      ultimaSync: dato?.ultimaSync || null, syncError: dato?.syncError || '', syncHasta: dato?.syncHasta || null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}

export async function POST(request) {
  try {
    const url = new URL(request.url);
    const op = url.searchParams.get('op');
    if (op === 'credenciales' || op === 'borrar' || op === 'sincronizar') {
      await requireSession(request, { permiso: 'config' });
      const body = await readBody(request);
      if (op === 'borrar') {
        await guardarJSON(CLAVE_CRED, { borradas: new Date().toISOString() }, { motivo: 'Hotmart: credenciales quitadas' });
        return json({ ok: true });
      }
      if (op === 'credenciales') {
        await guardarCredenciales(body);
        const r = await sincronizar({ desde: Date.now() - 30 * 86_400_000, hasta: Date.now() }).catch((e) => ({ error: e.publicMessage || e.message }));
        return json({ ok: true, ...r });
      }
      const hasta = Math.min(Number(body.hasta) || Date.now(), Date.now());
      const desde = Math.max(Number(body.desde) || hasta - 30 * 86_400_000, hasta - 400 * 86_400_000);
      return json({ ok: true, ...(await sincronizar({ desde, hasta })) });
    }
    if ((await verifyToken(claveDe(url.searchParams.get('k')))) !== valor()) return json({ ok: false, motivo: 'enlace no válido' }, 403);
    if (!(await dentroDelLimite(request, 'hotmart', 1200))) return json({ ok: false, motivo: 'demasiadas peticiones' }, 429);
    const venta = ventaDeAvisoHotmart(await readBody(request));
    if (!venta) return json({ ok: true, ignorado: true }); // otros avisos (carrito abandonado, suscripción…): se contesta bien
    const nueva = await reintentando(async () => {
      const dato = (await leerJSON(CLAVE, () => ({ ventas: [] }))) || { ventas: [] };
      const r = guardarVentaHm(dato.ventas || [], venta);
      if (r.cambio) { dato.ventas = r.lista; await guardarJSON(CLAVE, dato, { motivo: `Hotmart: ${venta.tipo} ${venta.producto}` }); }
      return r.cambio;
    });
    return json({ ok: true, guardada: nueva });
  } catch (e) {
    return errorResponse(e);
  }
}
