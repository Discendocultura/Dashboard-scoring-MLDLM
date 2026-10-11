// Seguimiento comercial de las compradoras de un producto de venta directa que aún NO tienen el producto
// principal (upsell posterior, p. ej. del Reto a Raíces): la lista que trabaja la setter una a una, con su
// etapa en el pipeline (el mismo donde el workflow de compra crea la oportunidad, p. ej. «Leads evergreen»).
// Lo usan /api/seguimiento y la vista Compradoras → «Seguimiento».
import { dayInMadrid } from './scoring.js';

export const MENSAJE_SEGUIMIENTO_DEF = 'Hola {nombre} 👋 Soy {setter}. Vi que hiciste {producto} y quería saber qué tal te está yendo: ¿has podido empezar? Si te quedan dudas o quieres dar el siguiente paso con {principal}, aquí estoy 😊';

const tiene = (c, t) => Boolean(t) && (c.tags || []).some((x) => String(x).toLowerCase() === String(t).toLowerCase());

// Mensaje de WhatsApp con sus huecos rellenos.
export function mensajeSeguimiento(plantilla, { nombre = '', producto = '', principal = '', setter = '' } = {}) {
  const t = String(plantilla || MENSAJE_SEGUIMIENTO_DEF);
  return t.replace(/\{nombre\}/g, nombre || '').replace(/\{producto\}/g, producto || 'el producto').replace(/\{principal\}/g, principal || 'el programa').replace(/\{setter\}/g, setter || 'del equipo')
    .replace(/ {2,}/g, ' ').replace(/ ([,.!?])/g, '$1');
}

// Etapa de cada compradora en el pipeline de seguimiento: la de su oportunidad (pares «pipeline:etapa» que
// trae la búsqueda de contactos) o la que se haya puesto desde el dashboard después (más reciente).
export function etapaDe(c, pipelineId, cambio = null) {
  if (cambio?.etapa) return cambio.etapa;
  const par = (c.opps || []).find((p) => String(p).startsWith(`${pipelineId}:`));
  return par ? par.split(':')[1] : '';
}

// Lista de seguimiento: compradoras del embudo SIN ninguna etiqueta del producto principal.
//   dias: { contactId: día de compra } (lo apuntado por el dashboard) · cambios: { contactId: { etapa, por, en, nota } }
//   → [{ id, name, email, phone, dia, diasDesde, extras, src, etapa, cambio, wa }], de la compra más reciente a la más antigua
export function listaSeguimiento(contactos, d, { dias = {}, cambios = {}, wa = {}, pipelineId = '', hoy = dayInMadrid(new Date().toISOString()) } = {}) {
  const principal = d?.upsellPrincipal?.tags || [];
  const extras = [...(d?.bumps || []), ...(d?.upsells || []), ...(d?.downsells || [])].filter((o) => o?.tag);
  return contactos
    .filter((c) => tiene(c, d.compraTag) && !principal.some((t) => tiene(c, t)))
    .map((c) => {
      const dia = dias[c.id] || (c.dateAdded ? dayInMadrid(c.dateAdded) : '');
      return {
        id: c.id, name: c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || '', email: c.email || '', phone: c.phone || '',
        dia, diasDesde: dia ? Math.max(0, Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${dia}T12:00:00Z`)) / 86_400_000)) : null,
        extras: extras.filter((o) => tiene(c, o.tag)).map((o) => o.nombre || o.tag),
        ...(c.src?.campaign || c.src?.content ? { src: { campaign: c.src.campaign || '', adset: c.src.term || '', ad: c.src.content || '' } } : {}),
        etapa: etapaDe(c, pipelineId, cambios[c.id]),
        ...(cambios[c.id] ? { cambio: cambios[c.id] } : {}),
        ...(wa[c.id] ? { wa: wa[c.id] } : {}),
      };
    })
    .sort((a, b) => String(b.dia).localeCompare(String(a.dia)) || a.name.localeCompare(b.name));
}

// Personas por etapa ('' = sin oportunidad en el pipeline).
export function porEtapa(lista) {
  const n = {};
  for (const x of lista) n[x.etapa] = (n[x.etapa] || 0) + 1;
  return n;
}
