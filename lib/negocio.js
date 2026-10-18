// Inteligencia de negocio: el histórico de todos los embudos del cliente en «fotos» (una por pieza: cada
// lanzamiento, cada mes de una VSL o de una venta directa y cada meteórico), guardadas en lsd_negocio_<id>.
// Las cerradas se calculan una vez y no se vuelven a pedir a GHL; las que siguen en curso, como mucho cada 6 h.
// Cada visita calcula como mucho una que falte (un lanzamiento, o todos los meses de una VSL de golpe): así no
// se pasa de las 50 peticiones de Cloudflare. El navegador vuelve a pedir mientras queden pendientes.
//   negocio({ periodo, embudos, calcular }) → { ...agregar(), pendientes, total }
import { getConfig } from './config-store.js';
import { storeGetPrefijo, guardarJSON, leerJSON } from './store.js';
import { metricasLanzamiento, estadoLanzamiento, todosLosLeads } from './resumen.js';
import { compradorasDe } from './directa.js';
import { inversionMeteorico } from './meteorico-inversion.js';
import { adSpendPorMes, metaConfigured } from './meta.js';
import { agregar } from './negocio-calc.js';
import { leerMarca } from './marca.js';
import { productoDeEmbudo, nombreDeProducto } from '../public/js/marca.js';
import { importeCompra } from '../public/js/metrics.js';
import { vipSinIva, todosLosBumps, precioBump, importeVenta } from '../public/js/pago.js';
import { enrichVsl, importeVsl } from '../public/js/embudo-vsl.js';
import { metricasDirecta } from '../public/js/directa.js';
import { faseMeteorico, esVentaMeteorico } from '../public/js/meteorico.js';
import { videoVenta } from '../public/js/videos.js';
import { dayInMadrid, dayOfDateField } from '../public/js/scoring.js';

const PREFIJO = 'lsd_negocio_';
const MESES_VSL = 12; // meses de VSL y venta directa hacia atrás (más el actual)
const EN_CURSO = 6 * 3_600_000;
const REINTENTO = 6 * 3_600_000; // una pieza que falló no se reintenta hasta pasadas 6 h
const MAX_COMPRAS = 4000;
const DIA = 86_400_000;
const sumarDias = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DIA);
const finDeMes = (mes) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0, 12)).toISOString().slice(0, 10);
const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const clave = (id) => `${PREFIJO}${id.replace(/[^a-z0-9_-]/gi, '_')}`;

function mesesHasta(hoy, n = MESES_VSL) {
  const out = [];
  const d = new Date(`${hoy.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  for (; d.toISOString().slice(0, 7) <= hoy.slice(0, 7); d.setUTCMonth(d.getUTCMonth() + 1)) out.push(d.toISOString().slice(0, 7));
  return out;
}

// Lo que debería haber: cada pieza con su grupo (lo que se calcula junto en una visita).
export function piezasEsperadas(config, hoy) {
  const out = [];
  const nombreEmb = (id) => config.embudos.find((e) => e.id === id)?.nombre || '';
  for (const [code, l] of Object.entries(config.launches || {})) {
    if (!l.inicioCaptacion || l.inicioCaptacion > hoy) continue;
    const embudo = l.embudo || config.embudos.find((e) => e.tipo === 'lanzamientos')?.id || '';
    const cierre = String(l.cierreCarrito || '').slice(0, 10);
    out.push({ id: `l-${code}`, grupo: `l-${code}`, tipo: 'lanzamiento', code, embudo, embudoNombre: nombreEmb(embudo), nombre: l.name || code, desde: l.inicioCaptacion, hasta: cierre && cierre < hoy ? cierre : hoy, cerrada: estadoLanzamiento(l, hoy) === 'cerrado' });
  }
  for (const [tipo, mapa] of [['vsl', config.vsls || {}], ['directa', config.directas || {}]]) {
    for (const id of Object.keys(mapa)) {
      if (!config.embudos.some((e) => e.id === id)) continue;
      for (const mes of mesesHasta(hoy)) {
        const fin = finDeMes(mes);
        out.push({ id: `${tipo[0]}-${id}-${mes}`, grupo: `${tipo[0]}-${id}`, tipo, code: id, embudo: id, embudoNombre: nombreEmb(id), nombre: `${nombreEmb(id) || mapa[id].name || id} · ${mes}`, mes, desde: `${mes}-01`, hasta: fin < hoy ? fin : hoy, cerrada: fin < hoy });
      }
    }
  }
  for (const [code, m] of Object.entries(config.meteoricos || {})) {
    const fase = faseMeteorico(m).id;
    if (fase === 'preparacion' || fase === 'calentamiento') continue;
    const embudo = m.embudo || (m.lanzamiento && config.launches?.[m.lanzamiento]?.embudo) || '';
    out.push({ id: `m-${code}`, grupo: `m-${code}`, tipo: 'meteorico', code, embudo, embudoNombre: nombreEmb(embudo), nombre: m.name || code, desde: String(m.apertura || '').slice(0, 10), hasta: String(m.cierre || m.apertura || '').slice(0, 10) || hoy, cerrada: fase === 'cerrada' });
  }
  return out;
}

const base = (e) => ({ id: e.id, tipo: e.tipo, embudo: e.embudo, embudoNombre: e.embudoNombre, nombre: e.nombre, desde: e.desde, hasta: e.hasta, cerrada: e.cerrada, at: new Date().toISOString() });

async function fotoLanzamiento(config, e) {
  const l = config.launches[e.code];
  const { leads, m } = await metricasLanzamiento(config, e.code);
  const diaVenta = videoVenta(l)?.fecha || l.fechaDirecto || '';
  const cierre = String(l.cierreCarrito || '').slice(0, 10);
  const bumps = todosLosBumps(l);
  const compras = [];
  for (const x of leads) {
    if (!x.s.compra && !x.s.vip) continue;
    const importe = (x.s.compra ? importeCompra(x, l) : 0) + (x.s.vip ? vipSinIva(l) : 0)
      + bumps.filter((b) => x.s.bumps?.includes(b.id)).reduce((t, b) => t + precioBump(b, l), 0);
    const dia = x.s.compra ? x.s.fecha_compra || '' : '';
    // Desde que se registró en ESTE lanzamiento (si ya era contacto, desde que empezó la captación).
    const alta = dayInMadrid(x.dateAdded || '');
    const reg = alta && alta > l.inicioCaptacion ? alta : l.inicioCaptacion;
    const ciclo = dia && reg && dia >= reg ? diasEntre(reg, dia) : null;
    const momento = !dia || !diaVenta ? null : dia <= diaVenta ? 'directo' : dia === sumarDias(diaVenta, 1) ? 'primero' : cierre && dia >= cierre ? 'ultimo' : 'medio';
    compras.push([x.id, r2(importe), dia, ciclo, momento]);
  }
  return { ...base(e), registros: m.total, ventas: m.compra, facturacion: r2(m.eco.facturacion), inversion: m.eco.inversion ? r2(m.eco.inversion) : null, compras: compras.slice(0, MAX_COMPRAS) };
}

// Todos los meses de una VSL de una vez: una descarga de sus leads y una consulta a Meta.
async function fotosVsl(config, grupo, hoy) {
  const id = grupo[0].code;
  const v = { ...config.vsls[id], id };
  const desde = sumarDias(grupo[0].desde, -183);
  const leads = (await todosLosLeads(v.registroTag, [v.compraDateField, v.registroDateField], { desde })).map((c) => enrichVsl(c, v, { pais: config.defaultCountryCode }));
  let inv = {};
  if (metaConfigured()) { try { inv = await adSpendPorMes({ since: grupo[0].desde, until: hoy, filter: v.metaFiltro || '' }); } catch (err) { console.error('Meta por mes', err.message); } }
  return grupo.map((e) => {
    const r = { desde: e.desde, hasta: e.hasta };
    const dentro = (d) => d && d >= r.desde && d <= r.hasta;
    const ventas = leads.filter((x) => dentro(x.fCompra));
    const inversion = inv[e.mes] || Number(v.inversionMes) || null;
    return {
      ...base(e), registros: leads.filter((x) => dentro(x.fReg)).length, ventas: ventas.length,
      facturacion: r2(ventas.reduce((t, x) => t + importeVsl(x, v), 0)), inversion: inversion ? r2(inversion) : null,
      compras: ventas.slice(0, MAX_COMPRAS).map((x) => [x.id, r2(importeVsl(x, v)), x.fCompra, x.fReg && x.fCompra >= x.fReg ? diasEntre(x.fReg, x.fCompra) : null, null]),
    };
  });
}

async function fotosDirecta(config, grupo, hoy) {
  const id = grupo[0].code;
  const d = config.directas[id];
  const todas = await compradorasDe(d);
  let inv = {};
  if (metaConfigured() && d.partes?.meta) { try { inv = await adSpendPorMes({ since: grupo[0].desde, until: hoy, filter: d.metaFiltro || id }); } catch (err) { console.error('Meta por mes', err.message); } }
  return grupo.map((e) => {
    const rango = { desde: e.desde, hasta: e.hasta };
    const invMes = inv[e.mes] || (d.inversionDia ? d.inversionDia * (diasEntre(e.desde, e.hasta) + 1) : null);
    const m = metricasDirecta(todas, d, rango, { inversion: invMes });
    const alta = new Map(todas.map((c) => [c.id, dayInMadrid(c.dateAdded || '')]));
    return {
      ...base(e), registros: 0, ventas: m.ventas, facturacion: r2(m.facturacion), inversion: invMes ? r2(invMes) : null,
      compras: m.compradores.slice(0, MAX_COMPRAS).map((c) => { const a = alta.get(c.id); return [c.id, r2(c.importe), c.dia, a && c.dia >= a ? diasEntre(a, c.dia) : null, null]; }),
    };
  });
}

async function fotoMeteorico(config, e) {
  const m = config.meteoricos[e.code];
  const [contactos, foto, { inversion }] = await Promise.all([
    m.compraTag ? todosLosLeads(m.compraTag, [m.compraDateField].filter(Boolean)) : [],
    leerJSON(`lsd_meteo_previo_${e.code}`, () => null),
    inversionMeteorico(m, e.code),
  ]);
  const previo = foto ? new Set(foto.ids) : null;
  const ventas = contactos.filter((c) => esVentaMeteorico(c, m, previo));
  const fracc = (c) => Boolean(m.fraccionadoTag) && (c.tags || []).some((t) => String(t).toLowerCase() === m.fraccionadoTag);
  const importe = (c) => importeVenta({ fraccionado: fracc(c) }, m, { unico: m.precio, fraccionado: m.precioFraccionado });
  const inv = inversion != null ? inversion : Number(m.inversion) || null;
  return {
    ...base(e), registros: 0, ventas: ventas.length, facturacion: r2(ventas.reduce((t, c) => t + importe(c), 0)), inversion: inv ? r2(inv) : null,
    compras: ventas.slice(0, MAX_COMPRAS).map((c) => [c.id, r2(importe(c)), (m.compraDateField && dayOfDateField(c.cf?.[m.compraDateField])) || e.hasta, null, null]),
  };
}

// Lo que falta por calcular (o por actualizar): grupos en orden, primero los cerrados más recientes.
export function pendientesDe(esperadas, guardadas, ahora = Date.now()) {
  const falta = (e) => {
    const g = guardadas[e.id];
    if (!g) return true;
    if (g.error) return ahora - Date.parse(g.at) > REINTENTO;
    if (!g.cerrada) return e.cerrada || ahora - Date.parse(g.at) > EN_CURSO; // al cerrarse, una última foto
    return false;
  };
  const grupos = new Map();
  for (const e of esperadas) if (falta(e)) grupos.set(e.grupo, [...(grupos.get(e.grupo) || []), e]);
  return [...grupos.values()].sort((a, b) => b[0].hasta.localeCompare(a[0].hasta));
}

async function calcularGrupo(config, grupo, esperadas, hoy) {
  const e = grupo[0];
  // VSL y venta directa: todos sus meses de una vez (también los ya guardados, para no repetir la descarga).
  const todosMeses = esperadas.filter((x) => x.grupo === e.grupo);
  try {
    const fotos = e.tipo === 'lanzamiento' ? [await fotoLanzamiento(config, e)]
      : e.tipo === 'vsl' ? await fotosVsl(config, todosMeses, hoy)
        : e.tipo === 'directa' ? await fotosDirecta(config, todosMeses, hoy)
          : [await fotoMeteorico(config, e)];
    for (const f of fotos) await guardarJSON(clave(f.id), f, { version: null, motivo: 'Inteligencia de negocio' });
    return fotos;
  } catch (err) {
    console.error('Inteligencia de negocio', e.id, err.message);
    const fallos = grupo.map((x) => ({ ...base(x), error: String(err.publicMessage || err.message).slice(0, 200) }));
    for (const f of fallos) await guardarJSON(clave(f.id), f, { version: null, motivo: 'Inteligencia de negocio' });
    return fallos;
  }
}

export async function negocio({ periodo = '12m', embudos = null, calcular = true } = {}) {
  const config = await getConfig();
  const hoy = dayInMadrid(new Date().toISOString());
  const esperadas = piezasEsperadas(config, hoy).filter((e) => !embudos || !e.embudo || embudos.includes(e.embudo));
  const filas = await storeGetPrefijo(PREFIJO);
  const guardadas = {};
  for (const txt of Object.values(filas)) { try { const p = JSON.parse(txt); if (p?.id) guardadas[p.id] = p; } catch { /* corrupta: se recalcula */ } }
  let pend = pendientesDe(esperadas, guardadas);
  if (calcular && pend.length) {
    for (const f of await calcularGrupo(config, pend[0], esperadas, hoy)) guardadas[f.id] = f;
    pend = pendientesDe(esperadas, guardadas);
  }
  const ids = new Set(esperadas.map((e) => e.id));
  const piezas = Object.values(guardadas).filter((p) => ids.has(p.id) && !p.error);
  const emb = config.embudos.filter((e) => !embudos || embudos.includes(e.id)).map((e) => ({ id: e.id, tipo: e.tipo, nombre: e.nombre }));
  const grupos = new Set(esperadas.map((e) => e.grupo));
  // El producto de cada embudo (Marca y avatar): el elegido o, si solo hay uno, ese.
  const productos = {};
  try {
    const m = await leerMarca();
    for (const e of config.embudos) {
      const p = productoDeEmbudo(m, e.id);
      if (p) productos[e.id] = { id: p.id, nombre: nombreDeProducto(p, m.productos.indexOf(p)) };
    }
  } catch (err) { console.error('Inteligencia de negocio: marca', err.message); }
  return { ...agregar(piezas, { periodo, hoy, embudos: emb, productos }), pendientes: pend.length, total: grupos.size };
}
