// ThriveCart → AlquimIA (avisos de venta). Una dirección firmada por cliente, como la del registro de Zoom:
//   GET  /api/thrivecart                 → (equipo, permiso «config») { url, total, ultima } la dirección para ThriveCart
//   GET  /api/thrivecart?op=ventas&desde=…&hasta=… → (equipo) las ventas guardadas en ese periodo (ms)
//   HEAD /api/thrivecart?c=…&k=…         → 200 (ThriveCart comprueba la dirección al guardarla)
//   POST /api/thrivecart?c=…&k=…         → (ThriveCart) un aviso: venta, cuota, reembolso o cancelación
//   POST /api/thrivecart?op=importar     → (equipo, «config») { ventas } las del CSV de ThriveCart (sin repetir las que ya hay)
import { requireSession, signToken, verifyToken } from '../lib/auth.js';
import { clienteActual } from '../lib/cliente.js';
import { leerJSON, guardarJSON, reintentando } from '../lib/store.js';
import { json, readBody, errorResponse } from '../lib/http.js';
import { dentroDelLimite } from '../lib/intentos.js';
import { env } from '../lib/env.js';
import { dominioLogin } from '../lib/dominio.js';
import { ventaDeWebhook, anadirVenta, ventaImportada, yaEsta, sinImportadasDe, MAX_VENTAS } from '../public/js/thrivecart.js';
import { claveDe } from './zoom-registro.js';
import { quitarCarritoAbandonado } from '../lib/abandonos.js';

const CLAVE = 'lsd_thrivecart_ventas';
const valor = () => `thrivecart:${clienteActual().id}`;

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('op') === 'ventas') {
      await requireSession(request);
      const desde = Number(url.searchParams.get('desde')) || 0;
      const hasta = Number(url.searchParams.get('hasta')) || Date.now() + 86_400_000;
      const { ventas = [] } = (await leerJSON(CLAVE, () => ({ ventas: [] }))) || {};
      return json({ ventas: ventas.filter((v) => v.fecha >= desde && v.fecha <= hasta), total: ventas.length });
    }
    await requireSession(request, { permiso: 'config' });
    const k = await signToken(valor());
    const dom = dominioLogin(env) || (url.hostname === 'data.discendocultura.com' ? 'alquimia.tenaxdigital.com' : '');
    const origen = dom && !/^(localhost|127\.0\.0\.1)$/.test(url.hostname) ? `https://${dom}` : url.origin;
    const { ventas = [] } = (await leerJSON(CLAVE, () => ({ ventas: [] }))) || {};
    const ultima = ventas.at(-1);
    return json({
      url: `${origen}/api/thrivecart?c=${encodeURIComponent(clienteActual().id)}&k=${encodeURIComponent(k).replace(/%3A/gi, ':')}`,
      total: ventas.filter((v) => !v.prueba).length,
      ultima: ultima ? { fecha: ultima.fecha, tipo: ultima.tipo, producto: ultima.producto, importe: ultima.importe, prueba: ultima.prueba } : null,
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
    if (url.searchParams.get('op') === 'importar') {
      await requireSession(request, { permiso: 'config' });
      const body = await readBody(request);
      const entrada = (Array.isArray(body.ventas) ? body.ventas : []).slice(0, MAX_VENTAS).map(ventaImportada).filter(Boolean);
      const r = await reintentando(async () => {
        const dato = (await leerJSON(CLAVE, () => ({ ventas: [] }))) || { ventas: [] };
        const antes = (dato.ventas || []).length;
        let lista = sinImportadasDe(dato.ventas || [], entrada);
        const sustituidas = antes - lista.length;
        let nuevas = 0;
        for (const v of entrada) {
          if (yaEsta(lista, v)) continue;
          lista = anadirVenta(lista, v).lista;
          nuevas++;
        }
        if (nuevas || sustituidas) { dato.ventas = lista; await guardarJSON(CLAVE, dato, { motivo: `ThriveCart: ${nuevas} ventas importadas del CSV` }); }
        return { nuevas, repetidas: entrada.length - nuevas, sustituidas };
      });
      return json({ ok: true, ...r, descartadas: (Array.isArray(body.ventas) ? body.ventas.length : 0) - entrada.length });
    }
    if ((await verifyToken(claveDe(url.searchParams.get('k')))) !== valor()) return json({ ok: false, motivo: 'enlace no válido' }, 403);
    if (!(await dentroDelLimite(request, 'thrivecart', 1200))) return json({ ok: false, motivo: 'demasiadas peticiones' }, 429);
    const cuerpo = await readBody(request);
    const venta = ventaDeWebhook(cuerpo);
    if (!venta) return json({ ok: true, ignorado: true }); // otros avisos (p. ej. abandono): se contesta bien y no se guarda
    const nueva = await reintentando(async () => {
      const dato = (await leerJSON(CLAVE, () => ({ ventas: [] }))) || { ventas: [] };
      if (yaEsta((dato.ventas || []).filter((x) => x.importada), venta)) return false; // ya estaba (importada del CSV)
      const r = anadirVenta(dato.ventas || [], venta);
      if (r.nueva) { dato.ventas = r.lista; await guardarJSON(CLAVE, dato, { motivo: `ThriveCart: ${venta.tipo} ${venta.producto}` }); }
      return r.nueva;
    });
    // Quien compra deja de ser un carrito abandonado: se le quita la etiqueta de la página de pago (el workflow ya no le escribe).
    if (venta.tipo === 'cobro' && !venta.prueba) await quitarCarritoAbandonado(venta.email).catch((e) => console.error('Carrito abandonado', e.message));
    return json({ ok: true, guardada: nueva });
  } catch (e) {
    return errorResponse(e);
  }
}
