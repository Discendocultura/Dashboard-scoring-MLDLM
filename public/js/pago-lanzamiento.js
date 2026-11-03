// Lanzamiento de pago: la entrada al evento (reto, webinar, masterclass…) se paga. Quien compra la entrada es el
// «registro» (la etiqueta de registro del lanzamiento = compró la entrada). Lo propio de este tipo:
//   · coste por entrada vendida (CPA) y ROAS de las entradas: si es 1x o más, los anuncios se pagan solos
//     («autoliquidable») y todo lo que venda después del programa es beneficio
//   · calidad de quien compra la entrada: cuántas aparecen (directo o grabación), su puntuación media y la «nota
//     por entrada» (0-10), que dice qué anuncio trae compradoras de entrada que luego compran
//   · conversión entrada → programa y ROAS total (entradas + VIP + programa)
import { sinIva, ivaPct } from './pago.js';
import { videosDe } from './videos.js';
import { watched } from './scoring.js';

export const esDePago = (launch) => launch?.entradaPago === true;
export const entradaSinIva = (launch) => sinIva(launch?.precioEntrada, launch?.iva?.entrada, ivaPct(launch));

// ¿La compradora de la entrada participó? (entró a algún directo o vio al menos un cuarto de alguna grabación)
export function participo(s, launch) {
  return videosDe(launch).some((v) => s?.[`${v.directo}_asistio`] || s?.[`${v.directo}_final`] || watched(s || {}, v.replay) >= 25);
}

// leads: los de la etiqueta de registro (= compraron la entrada), ya enriquecidos (s, score, estado).
// → { entradas, precioEntrada, ingresosEntradas, cpaEntrada, roasEntradas, autoliquidable, beneficioEntradas,
//     participan, pctParticipan, puntuacionMedia, notaEntrada, calientes, compraPrograma, convPrograma,
//     roasTotal, facturacionTotal, faltanParaAutoliquidar }
export function metricasPago(leads = [], launch = {}, { inversion = 0, facturacionPrograma = 0, facturacionVip = 0, bumps = [] } = {}) {
  const entradas = leads.length;
  const precio = entradaSinIva(launch);
  // Con los bump offers de la entrada (hasta 4): lo que deja de verdad cada compra de entrada.
  const ingresosBumps = bumps.reduce((t, b) => t + (Number(b.facturacion) || 0), 0);
  const ingresosEntradas = entradas * precio + ingresosBumps;
  const inv = Number(inversion) || 0;
  const participan = leads.filter((l) => participo(l.s, launch)).length;
  const puntuacionMedia = entradas ? leads.reduce((t, l) => t + (Number(l.score) || 0), 0) / entradas : null;
  const compraPrograma = leads.filter((l) => l.s?.compra).length;
  const facturacionTotal = ingresosEntradas + (Number(facturacionVip) || 0) + (Number(facturacionPrograma) || 0);
  return {
    entradas, precioEntrada: precio, ingresosEntradas, ingresosBumps, ticketEntrada: entradas ? ingresosEntradas / entradas : null,
    bumps: bumps.map((b) => ({ nombre: b.nombre, precio: b.precio, n: b.n, pct: b.pct, facturacion: b.facturacion })),
    cpaEntrada: inv && entradas ? inv / entradas : null,
    roasEntradas: inv ? ingresosEntradas / inv : null,
    autoliquidable: inv > 0 && ingresosEntradas >= inv,
    beneficioEntradas: ingresosEntradas - inv,
    // Cuántas entradas más harían falta para que los anuncios se paguen solos (al coste por entrada de ahora).
    faltanParaAutoliquidar: inv > 0 && precio > 0 && ingresosEntradas < inv ? Math.ceil((inv - ingresosEntradas) / precio) : 0,
    participan, pctParticipan: entradas ? participan / entradas : null,
    puntuacionMedia, notaEntrada: puntuacionMedia == null ? null : Math.round(puntuacionMedia) / 10,
    calientes: leads.filter((l) => ['caliente', 'muy-caliente'].includes(l.estado?.id)).length,
    compraPrograma, convPrograma: entradas ? compraPrograma / entradas : null,
    facturacionTotal, roasTotal: inv ? facturacionTotal / inv : null,
  };
}

// Texto corto para el resumen y el agente: cómo va la parte de pago.
export function textoPago(p) {
  if (!p?.entradas) return 'Aún no se ha vendido ninguna entrada.';
  const eur = (v) => `${(Math.round(v * 100) / 100).toLocaleString('es-ES')} €`;
  const partes = [`${p.entradas} entradas vendidas`];
  if (p.cpaEntrada != null) partes.push(`a ${eur(p.cpaEntrada)} cada una`);
  if (p.roasEntradas != null) partes.push(p.autoliquidable ? `los anuncios ya se pagan solos (ROAS de entradas ${p.roasEntradas.toFixed(2).replace(".", ",")}x)` : `faltan ${p.faltanParaAutoliquidar} entradas para que los anuncios se paguen solos`);
  if (p.pctParticipan != null) partes.push(`participa el ${Math.round(p.pctParticipan * 100)} %`);
  return `${partes.join(', ')}.`;
}
