// Informe diario automático por email (Configuración → Informes): los días de captación, los datos de
// captación (registros, entradas VIP, CPL, ROAS…); los días de carrito, los de venta (ventas del día,
// totales, por día, facturación, ROAS…). Solo lo que el lanzamiento tiene activado: sin entrada VIP no se
// habla de VIP, sin inversión no hay CPL ni ROAS, etc. Lo usan lib/informe-diario.js (envío) y la vista previa.
import { conVip, clasesDe } from './videos.js';
import { dayInMadrid } from './scoring.js';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const DIA = 86_400_000;
export const sumarDias = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
const entre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DIA);

// Fase del lanzamiento el día `dia` (el informe de cada mañana cuenta el día anterior).
//   captación: desde el inicio de captación hasta el día antes del directo · carrito: del directo al cierre.
export function faseInforme(l, dia) {
  const ini = l?.inicioCaptacion || '';
  const directo = l?.fechaDirecto || '';
  const cierre = String(l?.cierreCarrito || '').slice(0, 10) || (directo ? sumarDias(directo, 6) : '');
  if (!ini || ini > dia) return null;
  // Sin fecha del directo: captación solo hasta el fin de captación (si no, saldría un informe cada día para siempre).
  if (!directo) return !l.finCaptacion || dia <= l.finCaptacion ? 'captacion' : null;
  if (dia < directo) return 'captacion';
  if (dia <= cierre) return 'carrito';
  return null;
}

// Totales que se guardan cada día (para «+N ayer» cuando GHL no da la fecha exacta).
export const fotoTotales = (m) => ({ registros: m.total, vip: m.vip, ventas: m.compra, facturacion: Math.round(m.eco.facturacion), inversion: Math.round(m.eco.inversion || 0) });

const n0 = (n) => (n == null || !Number.isFinite(n) ? '–' : Math.round(n).toLocaleString('es-ES'));
const eur = (n) => (n == null || !Number.isFinite(n) ? '–' : `${n.toLocaleString('es-ES', { maximumFractionDigits: n >= 100 ? 0 : 2 })} €`);
const pct = (a, b) => (b ? `${(Math.round((a / b) * 1000) / 10).toLocaleString('es-ES')} %` : '–');
const x2 = (r) => (r == null ? '–' : `${r.toFixed(2).replace('.', ',')}x`);
const mas = (n) => (n == null ? '' : `+${n0(n)} ayer`);

// Datos del informe: { fase, titulo, asunto, intro, destacados: [{ label, valor, sub }], secciones: [{ titulo, filas: [[etiqueta, valor, nota]] }], tabla }
//   m: computeMetrics · leads (enriquecidos) · fotos: { día: totales } (días anteriores) · dia: el día que se cuenta (ayer)
export function datosInforme({ l, m, leads = [], fase, dia, fotos = {}, producto = 'el programa' }) {
  const anterior = fotos[sumarDias(dia, -1)] || null;
  const vip = conVip(l);
  const inv = m.eco.inversion || 0;
  const directo = l.fechaDirecto || '';
  const cierre = String(l.cierreCarrito || '').slice(0, 10) || (directo ? sumarDias(directo, 6) : '');
  // Altas y ventas por día, en una sola pasada (antes se recorrían todos los leads por cada día).
  const porDiaAlta = new Map();
  const porDiaVenta = new Map();
  for (const x of leads) {
    const a = x.dateAdded ? dayInMadrid(String(x.dateAdded)) : '';
    if (a) porDiaAlta.set(a, (porDiaAlta.get(a) || 0) + 1);
    if (x.s?.compra && x.s.fecha_compra) porDiaVenta.set(x.s.fecha_compra, (porDiaVenta.get(x.s.fecha_compra) || 0) + 1);
  }
  const registrosDia = (d) => porDiaAlta.get(d) || 0;
  const deltaFoto = (k, actual) => (anterior && anterior[k] != null ? Math.max(0, actual - anterior[k]) : null);
  const objetivos = (m.objetivos || []).map((o) => [`🎯 ${o.label}`, `${o.unit === 'eur' ? eur(o.actual) : n0(o.actual)} de ${o.unit === 'eur' ? eur(o.meta) : n0(o.meta)}`, `${Math.round(o.pct * 100)} %`]);
  const secciones = [];
  if (fase === 'captacion') {
    const nuevos = deltaFoto('registros', m.total) ?? registrosDia(dia);
    const nuevosVip = vip ? deltaFoto('vip', m.vip) : null;
    const diaN = entre(l.inicioCaptacion, dia) + 1;
    // El email se lee el día después de `dia` (cuenta lo de ayer): los días que faltan, desde hoy.
    const faltan = directo ? entre(dia, directo) - 1 : null;
    const destacados = [
      { label: 'Registros', valor: n0(m.total), sub: mas(nuevos) },
      ...(vip ? [{ label: 'Entradas VIP', valor: n0(m.vip), sub: [nuevosVip != null ? mas(nuevosVip) : '', pct(m.vip, m.total)].filter(Boolean).join(' · ') }] : []),
      ...(inv ? [{ label: 'CPL', valor: eur(m.eco.cpl), sub: `${eur(inv)} invertidos` }] : []),
      ...(inv ? [{ label: 'ROAS', valor: x2(m.eco.roas), sub: `${eur(m.eco.facturacion)} facturados` }] : []),
    ];
    secciones.push({ titulo: '📥 Registros', filas: [
      ['Registros totales', n0(m.total), mas(nuevos)],
      ...(m.frio || m.templado ? [['Tráfico frío / templado', `${n0(m.frio)} / ${n0(m.templado)}`, 'nuevos en la base / ya estaban']] : []),
      ...(l.publiTag ? [['De publicidad / orgánico', `${n0(m.origen.publi.leads)} / ${n0(m.origen.organico.leads)}`, '']] : []),
      ...(m.encuestaActiva && m.encuesta ? [['Encuesta respondida', n0(m.encuesta), pct(m.encuesta, m.total)]] : []),
    ] });
    if (vip) {
      secciones.push({ titulo: '⭐ Entrada VIP', filas: [
        ['Entradas VIP vendidas', n0(m.vip), [nuevosVip != null ? mas(nuevosVip) : '', `${pct(m.vip, m.total)} de los registros`].filter(Boolean).join(' · ')],
        ['Facturación VIP', eur(m.eco.facturacionVip), ''],
        ...(m.bumps || []).filter((b) => b.tipo === 'vip' && b.n).map((b) => [`Bump · ${b.nombre}`, n0(b.n), pct(b.n, m.vip)]),
        ...(inv ? [['Coste por entrada VIP', eur(m.eco.cpVip), '']] : []),
      ] });
    }
    if (inv) {
      secciones.push({ titulo: '📣 Publicidad', filas: [
        ['Inversión', eur(inv), m.eco.inversionFuente === 'meta' ? 'Meta' : 'puesta a mano'],
        ['CPL medio', eur(m.eco.cpl), ''],
        ...(m.eco.cplFrio ? [['CPL de tráfico frío', eur(m.eco.cplFrio), '']] : []),
        ['ROAS hasta ahora', x2(m.eco.roas), `${eur(m.eco.facturacion)} facturados`],
        ...(m.eco.publi ? [['ROAS solo de publicidad', x2(m.eco.publi.roas), '']] : []),
      ] });
    }
    const clases = clasesDe(l).map((c, i) => [`Vieron la clase ${i + 1}`, n0(m[c]), pct(m[c], m.total)]).filter((f) => f[1] !== '0');
    if (clases.length) secciones.push({ titulo: '🎬 Clases', filas: clases });
    if (objetivos.length) secciones.push({ titulo: '🎯 Objetivos', filas: objetivos });
    // Registros por día (últimos 7 días de captación).
    const dias = [];
    for (let d = dia, i = 0; i < 7 && d >= l.inicioCaptacion; i++, d = sumarDias(d, -1)) {
      const f = fotos[d];
      const fAnt = fotos[sumarDias(d, -1)];
      dias.push([d, f && fAnt ? Math.max(0, f.registros - fAnt.registros) : d === dia && nuevos != null ? nuevos : registrosDia(d)]);
    }
    return {
      fase, destacados, secciones,
      tabla: { titulo: '📅 Registros por día', cabecera: ['Día', 'Registros'], filas: dias.map(([d, n]) => [d, n0(n)]) },
      titulo: `Captación · ${l.name}`,
      intro: `Día ${diaN} de captación${faltan != null ? ` · ${faltan <= 0 ? 'hoy es el directo' : faltan === 1 ? 'mañana es el directo' : `faltan ${faltan} días para el directo`}` : ''}. Datos hasta el final del ${fechaLarga(dia)}.`,
      asunto: `📥 ${l.name}: ${n0(m.total)} registros (${mas(nuevos)})${vip ? ` · ${n0(m.vip)} VIP` : ''}${inv ? ` · CPL ${eur(m.eco.cpl)}` : ''}`,
    };
  }
  // Carrito.
  const ventasDia = (d) => porDiaVenta.get(d) || 0;
  const conFecha = porDiaVenta.size > 0;
  const nuevasVentas = conFecha ? ventasDia(dia) : deltaFoto('ventas', m.compra);
  const diasCarrito = [];
  for (let d = directo; d && d <= dia; d = sumarDias(d, 1)) {
    const f = fotos[d];
    const fAnt = fotos[sumarDias(d, -1)];
    const n = conFecha ? ventasDia(d) : f && fAnt ? Math.max(0, f.ventas - fAnt.ventas) : null;
    diasCarrito.push([d, n]);
  }
  const quedan = cierre ? entre(dia, cierre) - 1 : null; // desde hoy (el email se lee el día después)
  const destacados = [
    { label: 'Ventas ayer', valor: n0(nuevasVentas), sub: '' },
    { label: 'Ventas totales', valor: n0(m.compra), sub: pct(m.compra, m.total) + ' de los registros' },
    { label: 'Facturación', valor: eur(m.eco.facturacion), sub: inv ? `${eur(inv)} invertidos` : '' },
    ...(inv ? [{ label: 'ROAS', valor: x2(m.eco.roas), sub: m.eco.cac ? `CAC ${eur(m.eco.cac)}` : '' }] : []),
  ];
  secciones.push({ titulo: `🛒 Ventas de ${producto}`, filas: [
    ['Ventas ayer', n0(nuevasVentas), ''],
    ['Ventas totales', n0(m.compra), `${pct(m.compra, m.total)} de los registros`],
    ...(m.pago?.fraccionado?.n ? [['Pago único / a plazos', `${n0(m.pago.unico.n)} / ${n0(m.pago.fraccionado.n)}`, '']] : []),
    ...(m.live ? [['Compraron de las que vieron el directo', n0(m.compraLive), pct(m.compraLive, m.live)]] : []),
    ...(vip && m.vip ? [['Compraron de las VIP', n0(m.compraVip), pct(m.compraVip, m.vip)]] : []),
    ...(m.llamada ? [['Compraron tras una llamada', n0(m.compraLlamada), pct(m.compraLlamada, m.llamada)]] : []),
    ...(m.inicioPago ? [['Iniciaron el pago', n0(m.inicioPago), `${pct(m.compraInicioPago, m.inicioPago)} acabaron comprando`]] : []),
  ] });
  secciones.push({ titulo: '💶 Facturación', filas: [
    ['Facturación total', eur(m.eco.facturacion), 'sin IVA'],
    [`${producto[0].toUpperCase()}${producto.slice(1)}`, eur(m.eco.facturacionPrograma), ''],
    ...(vip ? [['Entradas VIP', eur(m.eco.facturacionVip), `${n0(m.vip)} vendidas`]] : []),
    ...(m.eco.facturacionBumps ? [['Bump offers', eur(m.eco.facturacionBumps), (m.bumps || []).filter((b) => b.n).map((b) => `${b.nombre}: ${b.n}`).join(' · ')]] : []),
    ...(inv ? [['Inversión', eur(inv), ''], ['ROAS', x2(m.eco.roas), ''], ['CAC (coste por venta)', eur(m.eco.cac), ''], ['Beneficio (facturación − publicidad)', eur(m.eco.beneficio), '']] : []),
  ] });
  if (objetivos.length) secciones.push({ titulo: '🎯 Objetivos', filas: objetivos });
  return {
    fase, destacados, secciones,
    tabla: { titulo: '📅 Ventas por día del carrito', cabecera: ['Día', 'Ventas'], filas: diasCarrito.map(([d, n]) => [d, n == null ? '–' : n0(n)]), nota: conFecha ? '' : 'Sin campo de fecha de compra: las ventas de cada día salen de la diferencia con el total del día anterior (desde que se activó el informe).' },
    titulo: `Carrito · ${l.name}`,
    intro: `${quedan == null ? '' : quedan < 0 ? 'El carrito cerró ayer. ' : quedan === 0 ? 'Hoy cierra el carrito. ' : `Quedan ${quedan + 1} días de carrito. `}Datos hasta el final del ${fechaLarga(dia)}.`,
    asunto: `🛒 ${l.name}: ${n0(nuevasVentas)} ventas ayer · ${n0(m.compra)} en total${inv ? ` · ROAS ${x2(m.eco.roas)}` : ` · ${eur(m.eco.facturacion)}`}`,
  };
}

const fmtLargo = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fmtCorto = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export const fechaLarga = (d) => fmtLargo.format(new Date(`${d}T12:00:00Z`));

// Cuerpo del email (HTML con estilos en línea, legible en cualquier gestor de correo).
export function informeHtml(d, { color = '#860d0e', url = '' } = {}) {
  const tarjeta = (x) => `<td style="padding:6px;width:${Math.floor(100 / Math.max(1, d.destacados.length))}%;vertical-align:top"><div style="border:1px solid #eadfd8;border-radius:12px;padding:12px 14px;background:#fffaf6">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#8a817b">${esc(x.label)}</div>
    <div style="font-size:24px;font-weight:800;color:${color};margin:2px 0">${esc(x.valor)}</div>
    ${x.sub ? `<div style="font-size:12px;color:#6b625d">${esc(x.sub)}</div>` : ''}</div></td>`;
  const seccion = (s) => `<h3 style="margin:22px 0 8px;font-size:15px">${esc(s.titulo)}</h3>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px">${s.filas.map(([a, b, c]) => `<tr><td style="padding:7px 0;border-bottom:1px solid #f0e8e2;color:#4a423d">${esc(a)}</td><td style="padding:7px 0;border-bottom:1px solid #f0e8e2;text-align:right;font-weight:700;white-space:nowrap">${esc(b)}</td><td style="padding:7px 0 7px 10px;border-bottom:1px solid #f0e8e2;color:#8a817b;font-size:12px;text-align:right">${esc(c || '')}</td></tr>`).join('')}</table>`;
  const t = d.tabla;
  const tabla = t?.filas?.length ? `<h3 style="margin:22px 0 8px;font-size:15px">${esc(t.titulo)}</h3>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px"><tr>${t.cabecera.map((h, i) => `<th style="text-align:${i ? 'right' : 'left'};font-size:11px;text-transform:uppercase;color:#8a817b;padding:6px 0;border-bottom:2px solid #eadfd8">${esc(h)}</th>`).join('')}</tr>
    ${t.filas.map(([dia, v]) => `<tr><td style="padding:6px 0;border-bottom:1px solid #f0e8e2">${esc(fmtCorto.format(new Date(`${dia}T12:00:00Z`)))}</td><td style="padding:6px 0;border-bottom:1px solid #f0e8e2;text-align:right;font-weight:700">${esc(v)}</td></tr>`).join('')}</table>
    ${t.nota ? `<p style="font-size:12px;color:#8a817b;margin:6px 0 0">${esc(t.nota)}</p>` : ''}` : '';
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#241f1c;line-height:1.45">
    <p style="margin:0 0 4px;font-size:13px;color:#6b625d">${esc(d.intro)}</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:10px -6px 0"><tr>${d.destacados.map(tarjeta).join('')}</tr></table>
    ${d.secciones.map(seccion).join('')}
    ${tabla}
    ${url ? `<p style="margin:22px 0 0"><a href="${esc(url)}" style="color:${color};font-weight:700">Abrir el dashboard →</a></p>` : ''}
  </div>`;
}

// Emails de la pestaña Informes (máx. 10, válidos y sin repetir).
export function sanitizeInformes(i = {}) {
  const emails = [...new Set((Array.isArray(i?.emails) ? i.emails : []).map((e) => String(e || '').trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 120))].slice(0, 10);
  return { emails, captacion: i?.captacion !== false, carrito: i?.carrito !== false };
}
