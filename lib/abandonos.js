// Carritos abandonados (ThriveCart y Hotmart avisan cuando alguien deja el pago a medias). Con la opción activa
// (Conexiones → Carrito abandonado), AlquimIA:
//   · guarda el abandono (para ver cuántos hay y cuántos se recuperan),
//   · busca a la persona en GHL por su email (si no está, la crea; si está, NO le cambia el nombre ni el teléfono;
//     solo le pone el teléfono si no tenía) y le pone la etiqueta (por defecto «carrito-abandonado»),
//   · y cuando esa persona compra, le quita la etiqueta: el workflow de GHL espera un rato y, si la sigue teniendo,
//     manda la plantilla de WhatsApp.
import { leerJSON, guardarJSON, reintentando } from './store.js';
import { getConfig } from './config-store.js';
import { findContactByEmail, upsertContact, setContactPhone, addTags, removeTags } from './ghl.js';
import { deProductos } from '../public/js/thrivecart.js';

export const CLAVE_ABANDONOS = 'lsd_abandonos';
const MAX = 3000;
export const ETIQUETA_DEF = 'carrito-abandonado';

// IDs de producto de todos los embudos del cliente (ThriveCart tal cual, Hotmart como «hm:<id>»).
export function productosDeEmbudos(config = {}) {
  const ids = new Set();
  const add = (tc = [], hm = []) => { for (const x of tc || []) ids.add(String(x)); for (const x of hm || []) ids.add(`hm:${x}`); };
  for (const l of Object.values(config.launches || {})) { add(l.tcProductos, l.hmProductos); add(l.tcPrograma, l.hmPrograma); }
  for (const g of ['vsls', 'directas', 'meteoricos']) for (const o of Object.values(config[g] || {})) add(o.tcProductos, o.hmProductos);
  for (const c of Object.values(config.cruzadas || {})) for (const p of c.productos || []) add(p.tcId ? [p.tcId] : [], p.hmId ? [p.hmId] : []);
  return [...ids];
}

// Un abandono que llega por aviso: { fuente, email, nombre, telefono, producto, productoId, fecha }.
export async function registrarAbandono(a) {
  const config = await getConfig();
  const cfg = config.carritoAbandonado || {};
  if (!cfg.activo || !a?.email) return { ok: true, ignorado: 'desactivado' };
  const mios = productosDeEmbudos(config);
  if (cfg.soloEmbudos !== false && mios.length && !deProductos(a, mios)) return { ok: true, ignorado: 'otro producto' };
  const etiqueta = cfg.etiqueta || ETIQUETA_DEF;
  let contacto = await findContactByEmail(a.email);
  if (!contacto) {
    const [first, ...rest] = String(a.nombre || '').trim().split(/\s+/);
    contacto = await upsertContact({ email: a.email, firstName: first || '', lastName: rest.join(' '), source: `Carrito abandonado (${a.fuente})` });
  }
  if (contacto && a.telefono && !contacto.phone) await setContactPhone(contacto.id, a.telefono).catch(() => {});
  if (contacto) await addTags(contacto.id, [etiqueta]);
  await reintentando(async () => {
    const dato = (await leerJSON(CLAVE_ABANDONOS, () => ({ lista: [] }))) || { lista: [] };
    dato.lista = [...(dato.lista || []), { ...a, contactId: contacto?.id || '', recuperado: false }].slice(-MAX);
    await guardarJSON(CLAVE_ABANDONOS, dato, { motivo: `Carrito abandonado: ${a.producto || a.productoId}` });
  });
  return { ok: true, etiquetado: Boolean(contacto) };
}

// Alguien ha comprado: sus abandonos de los últimos 14 días quedan recuperados y se le quita la etiqueta.
export async function compraTrasAbandono(email) {
  const cfg = (await getConfig()).carritoAbandonado || {};
  if (!cfg.activo || !email) return false;
  const e = String(email).toLowerCase();
  const dato = (await leerJSON(CLAVE_ABANDONOS, () => ({ lista: [] }))) || { lista: [] };
  const desde = Date.now() - 14 * 86_400_000;
  const suyos = (dato.lista || []).filter((x) => x.email === e && !x.recuperado && x.fecha >= desde);
  if (!suyos.length) return false;
  await reintentando(async () => {
    const d = (await leerJSON(CLAVE_ABANDONOS, () => ({ lista: [] }))) || { lista: [] };
    d.lista = (d.lista || []).map((x) => (x.email === e && !x.recuperado && x.fecha >= desde ? { ...x, recuperado: true, recuperadoEn: Date.now() } : x));
    await guardarJSON(CLAVE_ABANDONOS, d, { motivo: 'Carrito recuperado' });
  });
  const id = suyos.find((x) => x.contactId)?.contactId || (await findContactByEmail(e))?.id;
  if (id) await removeTags(id, [cfg.etiqueta || ETIQUETA_DEF]).catch(() => {});
  return true;
}

// Resumen para Conexiones: los últimos `dias` días.
export async function resumenAbandonos(dias = 30) {
  const dato = (await leerJSON(CLAVE_ABANDONOS, () => ({ lista: [] }))) || { lista: [] };
  const desde = Date.now() - dias * 86_400_000;
  const l = (dato.lista || []).filter((x) => x.fecha >= desde);
  return {
    total: l.length, recuperados: l.filter((x) => x.recuperado).length,
    ultimos: l.slice(-8).reverse().map((x) => ({ fecha: x.fecha, fuente: x.fuente, producto: x.producto, recuperado: x.recuperado, nombre: String(x.nombre || '').split(' ')[0] })),
  };
}
