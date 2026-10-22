// Carrito abandonado: la etiqueta la pone AlquimIA cuando una registrada llega a la página de pago (handlers/visita.js,
// la de cada lanzamiento: «carritoAbandonadoTag» en Configuración) y dispara el workflow de recuperación de GHL.
// Aquí, cuando compra por ThriveCart o Hotmart (su aviso de venta), se le quita esa etiqueta: así el workflow ya no le
// escribe aunque falle la etiqueta de compra en GHL. Solo si tiene alguna de esas etiquetas (1-2 llamadas a GHL).
import { getConfig } from './config-store.js';
import { findContactByEmail, removeTags } from './ghl.js';

export async function quitarCarritoAbandonado(email) {
  if (!email) return false;
  const config = await getConfig();
  const etiquetas = [...new Set(Object.values(config.launches || {}).map((l) => String(l.carritoAbandonadoTag || '').toLowerCase()).filter(Boolean))];
  if (!etiquetas.length) return false;
  const c = await findContactByEmail(email);
  const tiene = (c?.tags || []).map((t) => String(t).toLowerCase()).filter((t) => etiquetas.includes(t));
  if (!c || !tiene.length) return false;
  await removeTags(c.id, tiene);
  return true;
}
