// Mi negocio → 📦 Productos: el catálogo del cliente (precio, etiqueta de compra y ofertas de cada producto).
//   GET  /api/productos → { catalogo, puedeEditar }
//   POST /api/productos { catalogo } (quien puede configurar) → guarda el catálogo entero
// De aquí bebe la Inteligencia de negocio (lib/negocio.js): al cambiar precios o etiquetas, se recalcula sola.
import { requireSession, tienePermiso } from '../lib/auth.js';
import { leerJSON, guardarJSON } from '../lib/store.js';
import { json, readBody, errorResponse } from '../lib/http.js';
import { sanitizeCatalogo } from '../public/js/productos.js';

export const CLAVE_PRODUCTOS = 'lsd_productos';
const puedeEditar = (s) => s.role === 'admin' || tienePermiso(s, 'config');

export async function GET(request) {
  try {
    const s = await requireSession(request);
    if (!puedeEditar(s) && !tienePermiso(s, 'metricas')) return json({ error: 'Tu rol no tiene acceso a los productos.' }, 403);
    return json({ catalogo: sanitizeCatalogo(await leerJSON(CLAVE_PRODUCTOS, () => ({}))), puedeEditar: puedeEditar(s) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const s = await requireSession(request);
    if (!puedeEditar(s)) return json({ error: 'Tu rol no puede editar los productos.' }, 403);
    const body = await readBody(request);
    const catalogo = sanitizeCatalogo(body.catalogo);
    await guardarJSON(CLAVE_PRODUCTOS, catalogo, { motivo: 'Productos' });
    return json({ ok: true, catalogo });
  } catch (e) {
    return errorResponse(e);
  }
}
