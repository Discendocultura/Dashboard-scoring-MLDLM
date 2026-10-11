// Métricas de un embudo de venta directa (low ticket) en un rango de días: compras de GHL (etiqueta de
// compra y de cada extra), visitas de D1 e inversión de Meta. Las usan /api/directa, el Inicio y el portal.
import { cacheCompartida, leerJSON, guardarJSON, reintentando } from './store.js';
import { todosLosLeads } from './resumen.js';
import { adSpend, metaConfigured } from './meta.js';
import { visitasDirectaPorHora } from './entradas.js';
import { metricasDirecta, conParte, apuntarCompras, comprasDudosas, fechaEmailCompra, pipelineDeCompra, fechasDeOportunidades } from '../public/js/directa.js';
import { emailsDeContacto, searchOpportunities } from './ghl.js';
import { addDay } from '../public/js/embudo-vsl.js';
import { dayInMadrid } from '../public/js/scoring.js';
import { madridToEpoch } from '../public/js/page.js';

async function visitasDelRango(id, rango) {
  const desde = madridToEpoch(`${rango.desde}T00:00`);
  const hasta = madridToEpoch(`${addDay(rango.hasta, 1)}T00:00`);
  const filas = await visitasDirectaPorHora(id, desde, hasta);
  const total = {};
  const porDia = {};
  for (const f of filas) {
    const dia = dayInMadrid(new Date(f.hora).toISOString());
    total[f.pagina] = (total[f.pagina] || 0) + f.n;
    porDia[dia] = { ...(porDia[dia] || {}), [f.pagina]: (porDia[dia]?.[f.pagina] || 0) + f.n };
  }
  return { total, porDia };
}

async function inversionDelRango(d, id, rango) {
  if (!conParte(d, 'meta') || !metaConfigured()) return { inversion: null, metaError: '' };
  try {
    const r = await adSpend({ since: rango.desde, until: rango.hasta, filter: d.metaFiltro || id });
    // Para «Anuncios ganadores»: nombres, gasto y estructura de las campañas de este embudo.
    return { inversion: r.total || 0, metaError: '', anuncios: { names: r.names, spendBy: r.spendBy, estructura: r.estructura } };
  } catch (e) {
    return { inversion: null, metaError: e.publicMessage || e.message };
  }
}

// El día en que se vio la etiqueta de compra de cada compradora (lsd_directa_compras_<id>). Con el campo de fecha
// de compra, este día solo cuenta para quien no lo tiene relleno (las que compraron antes de crearlo).
// Con el asunto del email de compra, las compras de quien ya era contacto se fechan con ese email (hora exacta).
const MAX_EMAILS_POR_CARGA = 10;
const MAX_PAGINAS_OPS = 10;

// Oportunidad que crea el workflow de compra: su hora de creación es la de la compra (también para quien
// ya era contacto). Pipeline y etapa: los de la configuración o, si no, la pareja más repetida entre las
// compradoras. Se piden de 100 en 100, de las más nuevas a las más antiguas, hasta `desde` (máx. 10 páginas).
async function comprasPorOportunidad(d, contactos, desde) {
  if (d.compraPipeline === 'no') return { fechas: {}, origen: null };
  const origen = d.compraPipeline ? { pipelineId: d.compraPipeline, stageId: d.compraEtapa || '', elegido: true } : pipelineDeCompra(contactos);
  if (!origen) return { fechas: {}, origen: null };
  const ids = new Set(contactos.map((c) => c.id));
  const opps = [];
  for (let page = 1; page <= MAX_PAGINAS_OPS; page++) {
    const r = await searchOpportunities({ pipelineId: origen.pipelineId, pipelineStageId: origen.stageId || undefined, limit: 100, page, order: 'added_desc' });
    opps.push(...r.opportunities);
    const ultima = r.opportunities.at(-1)?.createdAt || '';
    if (r.opportunities.length < 100 || !ultima || ultima < desde) break;
  }
  return { fechas: fechasDeOportunidades(opps, ids), origen };
}

async function conDiasDeCompra(id, contactos, d, rango) {
  const ahora = new Date().toISOString();
  const dia = (iso) => dayInMadrid(iso);
  // Emails de compra de las dudosas (fuera de la escritura, que puede repetirse): { contactId: ISO | '' }
  const actual0 = await leerJSON(`lsd_directa_compras_${id}`, () => null);
  const encontrados = {};
  let avisoEmail = '';
  // 1) Oportunidad del workflow de compra (hora exacta). Un día antes del periodo, por la zona horaria.
  let porOportunidad = { fechas: {}, origen: null };
  try {
    porOportunidad = await comprasPorOportunidad(d, contactos, `${addDay(rango.desde, -1)}T00:00:00Z`);
  } catch (e) {
    avisoEmail = /401|403|scope|not authorized/i.test(String(e.message)) ? 'El token de GHL no puede leer las oportunidades: añade el permiso «View Opportunities» a la integración privada.' : `No se pudieron leer las oportunidades de compra: ${e.message}`;
  }
  // 2) Email de compra, solo para las que no tienen oportunidad.
  if (d.emailCompra) {
    const conOp = new Set([...Object.keys(porOportunidad.fechas), ...Object.keys(actual0?.op || {})]);
    const sinCampo = (d.compraDateField ? contactos.filter((c) => !c.cf?.[d.compraDateField]) : contactos).filter((c) => !conOp.has(c.id));
    const dudosas = comprasDudosas(sinCampo, actual0?.dias ? actual0 : null, ahora).slice(0, MAX_EMAILS_POR_CARGA);
    for (const c of dudosas) {
      try {
        const desde = new Date(Date.parse(c.dateUpdated) - 60 * 86_400_000).toISOString();
        encontrados[c.id] = fechaEmailCompra(await emailsDeContacto(c.id, { desde, hasta: ahora }), d.emailCompra);
      } catch (e) {
        avisoEmail ||= /401|403|scope|not authorized/i.test(String(e.message)) ? 'El token de GHL no puede leer los emails de los contactos: añade el permiso «View Conversation Messages» a la integración privada.' : `No se pudieron leer los emails de compra: ${e.message}`;
        break;
      }
    }
  }
  const dias = await reintentando(async () => {
    const actual = await leerJSON(`lsd_directa_compras_${id}`, () => null);
    const { reg, cambios } = apuntarCompras(actual?.dias ? actual : null, contactos, ahora, dia);
    let conEmail = false;
    for (const [cid, iso] of Object.entries(encontrados)) {
      reg.email = { ...(reg.email || {}), [cid]: iso ? 'si' : 'no' };
      if (iso) reg.dias[cid] = dia(iso);
      conEmail = true;
    }
    // La oportunidad manda sobre la etiqueta y el email (se guarda: aunque luego cambie de etapa, el día se queda).
    for (const [cid, iso] of Object.entries(porOportunidad.fechas)) {
      const nuevo = dia(iso);
      if (reg.dias[cid] === nuevo && reg.op?.[cid]) continue;
      reg.dias[cid] = nuevo;
      reg.op = { ...(reg.op || {}), [cid]: 1 };
      conEmail = true;
    }
    if (cambios || conEmail) await guardarJSON(`lsd_directa_compras_${id}`, reg, { motivo: 'Días de compra (venta directa)' });
    return reg.dias;
  });
  const origen = porOportunidad.origen ? { pipelineId: porOportunidad.origen.pipelineId, stageId: porOportunidad.origen.stageId, elegido: Boolean(porOportunidad.origen.elegido), fechadas: Object.keys(porOportunidad.fechas).length } : null;
  return { contactos: contactos.map(({ opps, ...c }) => (dias[c.id] ? { ...c, diaCompra: dias[c.id] } : c)), avisoEmail, oportunidad: origen };
}

// La configuración entra en la clave de la caché: si cambian precios o etiquetas, se recalcula al momento.
function firma(d) {
  const txt = JSON.stringify([d.compraTag, d.compraDateField, d.precio, d.iva, d.partes, d.bumps, d.upsells, d.downsells, d.metaFiltro, d.inversionDia, d.objetivoCpa, d.objetivoRoas, d.objetivoVentasMes, d.emailCompra, d.compraPipeline, d.compraEtapa, d.upsellPrincipal]);
  let h = 0;
  for (let i = 0; i < txt.length; i++) h = (h * 31 + txt.charCodeAt(i)) | 0;
  return h;
}

// Compartido 5 minutos por todo el equipo (descarga todas las compradoras de GHL).
// Todas las compradoras de un embudo, compartidas 5 minutos por Métricas (cualquier periodo) y Seguimiento:
// cambiar de periodo ya no vuelve a descargar miles de contactos. Solo los campos que se usan (fila de D1 pequeña).
export function compradorasDe(d, { fresh = false } = {}) {
  if (!d?.compraTag) return Promise.resolve([]);
  return cacheCompartida(`directa-compradoras|${d.compraTag}|${d.compraDateField || ''}`, 5 * 60_000, async () => (await todosLosLeads(d.compraTag, [d.compraDateField].filter(Boolean), { conOpps: true }))
    .map(({ id, name, firstName, email, phone, tags, dateAdded, dateUpdated, cf, src, opps }) => ({ id, name, firstName, email, phone, tags, dateAdded, dateUpdated, ...(cf && Object.keys(cf).length ? { cf } : {}), ...(src && (src.campaign || src.content || src.term || src.source) ? { src } : {}), ...(opps?.length ? { opps } : {}) })), { fresh });
}

export function metricasDirectaRango(id, d, rango, { fresh = false } = {}) {
  return cacheCompartida(`directa|${id}|${rango.desde}|${rango.hasta}|${firma(d)}`, 5 * 60_000, async () => {
    // Todas las compradoras (también las que ya eran contactos antes del periodo: compran hoy aunque se dieran de alta hace meses).
    const [todas, visitas, inv] = await Promise.all([
      compradorasDe(d, { fresh }),
      conParte(d, 'visitas') ? visitasDelRango(id, rango) : null,
      inversionDelRango(d, id, rango),
    ]);
    // Aunque haya campo de fecha de compra, quien no lo tiene relleno se sigue fechando por la etiqueta y el email.
    const { contactos, avisoEmail = '', oportunidad = null } = !todas.length ? { contactos: todas } : await conDiasDeCompra(id, todas, d, rango);
    const m = metricasDirecta(contactos, d, rango, { visitas, inversion: inv.inversion });
    return { ...m, compradores: m.compradores.slice(0, 3000), metaError: inv.metaError, anuncios: inv.anuncios || null, avisoEmail, oportunidad };
  }, { fresh });
}

// Para el Inicio y el portal del cliente: cifras clave y el embudo paso a paso.
export async function resumenDeDirecta(id, d, rango, opciones) {
  const m = await metricasDirectaRango(id, d, rango, opciones);
  const extras = m.extras.map((x) => [`${x.tipo === 'bump' ? 'Bump' : x.tipo === 'upsell' ? 'Upsell' : 'Downsell'} · ${x.nombre}`, x.n]);
  return {
    tipo: 'directa', code: id, nombre: d.name, periodo: rango,
    kpis: { ventas: m.ventas, facturacion: m.facturacion, inversion: m.inversion, roas: m.roas, cac: m.cpa, ticket: m.ticket },
    extras: m.extras.map((x) => ({ tipo: x.tipo, nombre: x.nombre, n: x.n, pct: x.pct })),
    upsellPrincipal: m.upsellPrincipal,
    funnel: [
      ...(conParte(d, 'visitas') && m.visitas.venta ? [['Visitaron la página de venta', m.visitas.venta], ['Llegaron al checkout', m.visitas.checkout]] : []),
      ['Compraron', m.ventas], ...extras,
    ],
  };
}
