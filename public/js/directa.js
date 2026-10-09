// Embudo de venta directa / producto de entrada (low ticket), siempre abierto:
//   anuncio → página de venta → checkout (con bump offers) → compra → upsell (y downsell si dice que no).
// No hay registro ni leads: lo que importa es cuánto cuesta cada venta (CPA), el ticket medio que dejan
// los bumps, upsells y downsells, y si el embudo se paga solo (ROAS ≥ 1). Cada extra tiene su etiqueta
// de GHL (la pone el workflow de su pago) y así se cuenta qué % de compradoras lo coge.
// Lo usan el navegador, el servidor y los tests.
import { dinero, MODOS_IVA, IVA_DEF, sinIva, sanitizeBumps } from './pago.js';
import { dayInMadrid, dayOfDateField } from './scoring.js';
import { addDay } from './embudo-vsl.js';

// Partes que puede llevar el embudo (se eligen al crearlo y se cambian en su configuración).
export const PARTES_DIRECTA = [
  { id: 'bumps', ico: '➕', label: 'Bump offers en el checkout', desc: 'Casillas de «añadir también…» en el formulario de pago. Puede haber varios, cada uno con su precio y su etiqueta.' },
  { id: 'upsell', ico: '⬆️', label: 'Upsell después de comprar', desc: 'Una página con una oferta mayor justo después del pago (un clic para añadirla).' },
  { id: 'downsell', ico: '⬇️', label: 'Downsell si dice que no al upsell', desc: 'Una oferta más pequeña o más barata para quien rechaza el upsell.' },
  { id: 'visitas', ico: '👀', label: 'Medir las visitas a las páginas', desc: 'Un código para GHL en cada página (venta, checkout, upsell, downsell): da la conversión de cada paso.' },
  { id: 'meta', ico: '📣', label: 'Inversión de Meta automática', desc: 'Suma el gasto de las campañas que contienen el texto del filtro: CPA, ROAS y beneficio sin escribir nada.' },
];
export const PARTE_IDS = PARTES_DIRECTA.map((p) => p.id);
export const partesPorDefecto = () => ({ bumps: true, upsell: true, downsell: false, visitas: true, meta: true });
export const conParte = (d, id) => Boolean(d?.partes?.[id]);

// Páginas del embudo que se pueden medir (bloque <div data-lsd-directa="…"> de tracker.js).
export const PAGINAS_DIRECTA = [
  { id: 'venta', label: 'Página de venta' },
  { id: 'checkout', label: 'Checkout (formulario de pago)' },
  { id: 'upsell', label: 'Página del upsell', parte: 'upsell' },
  { id: 'downsell', label: 'Página del downsell', parte: 'downsell' },
  { id: 'gracias', label: 'Página de gracias / acceso' },
];
export const PAGINA_IDS = PAGINAS_DIRECTA.map((p) => p.id);

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const url = (v) => (/^https?:\/\//i.test(str(v, 600)) ? str(v, 600) : '');
const tag = (v) => str(v, 120).toLowerCase();
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

// Upsells y downsells: como los bumps (nombre, precio, IVA, etiqueta, activo) y además su página.
export const MAX_OFERTAS = 3;
export function sanitizeOfertas(lista, prefijo) {
  if (!Array.isArray(lista)) return [];
  const base = sanitizeBumps(lista.slice(0, MAX_OFERTAS).map((o, i) => ({ ...o, id: /^[a-z0-9_-]{1,24}$/i.test(String(o?.id || '')) ? o.id : `${prefijo}${i + 1}` })));
  const urls = new Map(lista.slice(0, MAX_OFERTAS).map((o, i) => [/^[a-z0-9_-]{1,24}$/i.test(String(o?.id || '')) ? String(o.id) : `${prefijo}${i + 1}`, url(o?.url)]));
  return base.map((o) => ({ ...o, url: urls.get(o.id) || '' }));
}

// Limpia la configuración que llega del navegador.
export function sanitizeDirecta(d = {}) {
  const partes = {};
  for (const id of PARTE_IDS) partes[id] = d?.partes ? Boolean(d.partes[id]) : partesPorDefecto()[id];
  const pct = Number(d?.iva?.pct);
  return {
    name: str(d?.name, 80) || 'Venta directa',
    producto: str(d?.producto, 80),
    precio: dinero(d?.precio),
    iva: { pct: Number.isFinite(pct) && d?.iva?.pct !== '' && d?.iva?.pct != null ? Math.min(100, Math.max(0, pct)) : IVA_DEF, producto: MODOS_IVA.includes(d?.iva?.producto) ? d.iva.producto : '' },
    compraTag: tag(d?.compraTag),
    compraDateField: str(d?.compraDateField, 40).replace(/[^A-Za-z0-9]/g, ''),
    partes,
    bumps: sanitizeBumps(d?.bumps),
    upsells: sanitizeOfertas(d?.upsells, 'up'),
    downsells: sanitizeOfertas(d?.downsells, 'down'),
    ventaUrl: url(d?.ventaUrl), checkoutUrl: url(d?.checkoutUrl), graciasUrl: url(d?.graciasUrl),
    metaFiltro: str(d?.metaFiltro, 80),
    // Inversión escrita a mano (€ al día) para cuando Meta no está conectado.
    inversionDia: dinero(d?.inversionDia),
    objetivoCpa: dinero(d?.objetivoCpa), objetivoRoas: Math.max(0, Math.min(100, Number(String(d?.objetivoRoas ?? '').replace(',', '.')) || 0)),
    objetivoVentasMes: Math.max(0, Math.floor(Number(d?.objetivoVentasMes) || 0)),
    notas: str(d?.notas, 2000),
    createdAt: str(d?.createdAt, 40) || new Date().toISOString(),
  };
}

// Extras que cuentan (parte activada, oferta activa y con etiqueta), con su tipo.
export function extrasActivos(d) {
  const de = (parte, lista, tipo) => (conParte(d, parte) ? (lista || []).filter((o) => o.activo !== false && o.tag).map((o) => ({ ...o, tipo })) : []);
  return [...de('bumps', d?.bumps, 'bump'), ...de('upsell', d?.upsells, 'upsell'), ...de('downsell', d?.downsells, 'downsell')];
}
const pctIva = (d) => (Number.isFinite(Number(d?.iva?.pct)) ? Number(d.iva.pct) : IVA_DEF);
// Precios sin IVA (la facturación y el ROAS van sin IVA).
export const precioProductoSinIva = (d) => sinIva(d?.precio, d?.iva?.producto, pctIva(d));
export const precioExtraSinIva = (o, d) => sinIva(o?.precio, o?.iva, pctIva(d));

const tiene = (c, t) => Boolean(t) && (c.tags || []).some((x) => String(x).toLowerCase() === String(t).toLowerCase());
// Día de la compra: el campo de fecha de compra o, sin él, el día en que se creó el contacto
// (en un embudo de venta directa el contacto nace en el checkout, al pagar).
export function diaCompra(c, d) {
  const f = d?.compraDateField ? dayOfDateField(c.cf?.[d.compraDateField]) : '';
  return f || (c.dateAdded ? dayInMadrid(c.dateAdded) : '');
}

// Días del rango, en orden (máx. 400).
export function diasDe({ desde, hasta }) {
  const out = [];
  if (!isDay(desde) || !isDay(hasta)) return out;
  for (let d = desde; d <= hasta && out.length < 400; d = addDay(d, 1)) out.push(d);
  return out;
}

const div = (a, b) => (b ? a / b : null);

// Métricas del embudo en un rango de días. `contactos`: los que tienen la etiqueta de compra.
// `visitas`: { total: { venta, checkout, … }, porDia: { día: { venta, checkout, … } } } (visitantes únicos nuevos).
// `inversion`: gasto de Meta en el rango (o null: entonces la manual × días).
export function metricasDirecta(contactos, d, rango, { visitas = null, inversion = null } = {}) {
  const dias = diasDe(rango);
  const ventas = contactos.filter((c) => tiene(c, d.compraTag)).map((c) => ({ c, dia: diaCompra(c, d) })).filter((v) => v.dia && v.dia >= rango.desde && v.dia <= rango.hasta);
  const n = ventas.length;
  const precio = precioProductoSinIva(d);
  const extras = extrasActivos(d);
  const ups = extras.filter((o) => o.tipo === 'upsell');
  // El downsell solo se ofrece a quien dice que no al upsell: su % es sobre las que no cogieron ningún upsell.
  const sinUpsell = ventas.filter((v) => !ups.some((o) => tiene(v.c, o.tag)));
  const filas = extras.map((o) => {
    const base = o.tipo === 'downsell' && ups.length ? sinUpsell.length : n;
    const conEl = ventas.filter((v) => tiene(v.c, o.tag)).length;
    const p = precioExtraSinIva(o, d);
    return { id: o.id, tipo: o.tipo, nombre: o.nombre || o.tag, precio: p, n: conEl, base, pct: div(conEl, base), facturacion: conEl * p };
  });
  const facturacionProducto = n * precio;
  const facturacionExtras = filas.reduce((t, f) => t + f.facturacion, 0);
  const facturacion = facturacionProducto + facturacionExtras;
  const inv = inversion != null ? inversion : d.inversionDia ? d.inversionDia * dias.length : null;
  const ticket = div(facturacion, n);
  const vt = visitas?.total || {};
  const porDia = new Map(dias.map((x) => [x, { dia: x, ventas: 0, facturacion: 0, venta: visitas?.porDia?.[x]?.venta || 0, checkout: visitas?.porDia?.[x]?.checkout || 0 }]));
  for (const v of ventas) {
    const fila = porDia.get(v.dia);
    if (!fila) continue;
    fila.ventas += 1;
    fila.facturacion += precio + extras.filter((o) => tiene(v.c, o.tag)).reduce((t, o) => t + precioExtraSinIva(o, d), 0);
  }
  const objetivos = [
    ...(d.objetivoCpa ? [{ id: 'cpa', label: 'CPA máximo', meta: d.objetivoCpa, actual: div(inv || 0, n), menosEsMejor: true, unit: 'eur' }] : []),
    ...(d.objetivoRoas ? [{ id: 'roas', label: 'ROAS mínimo', meta: d.objetivoRoas, actual: inv ? facturacion / inv : null, unit: 'x' }] : []),
    ...(d.objetivoVentasMes ? [{ id: 'ventas', label: 'Ventas al mes', meta: d.objetivoVentasMes, actual: dias.length ? (n / dias.length) * 30 : null, unit: 'n' }] : []),
  ];
  return {
    rango: { desde: rango.desde, hasta: rango.hasta, dias: dias.length },
    ventas: n,
    facturacion, facturacionProducto, facturacionExtras,
    ticket,
    // Lo que sube el ticket medio por los extras (sobre el precio del producto).
    subidaTicket: n && precio ? facturacion / n / precio - 1 : null,
    extras: filas,
    inversion: inv,
    inversionFuente: inversion != null ? 'meta' : d.inversionDia ? 'manual' : '',
    cpa: inv != null && n ? inv / n : null,
    roas: inv ? facturacion / inv : null,
    beneficio: inv != null ? facturacion - inv : null,
    // CPA con el que el embudo se paga solo (ROAS 1): el ticket medio sin IVA.
    cpaEquilibrio: ticket,
    visitas: { venta: vt.venta || 0, checkout: vt.checkout || 0, upsell: vt.upsell || 0, downsell: vt.downsell || 0, gracias: vt.gracias || 0 },
    conversion: {
      ventaCheckout: div(vt.checkout || 0, vt.venta || 0),
      checkoutCompra: div(n, vt.checkout || 0),
      ventaCompra: div(n, vt.venta || 0),
    },
    porDia: [...porDia.values()],
    compradores: ventas.sort((a, b) => b.dia.localeCompare(a.dia)).map(({ c, dia }) => ({
      id: c.id, name: c.name || [c.firstName, c.lastName].filter(Boolean).join(' '), email: c.email || '', phone: c.phone || '', dia,
      extras: extras.filter((o) => tiene(c, o.tag)).map((o) => o.id),
    })),
    sinFechaCompra: !d.compraDateField,
    objetivos,
  };
}

// Lo que falta para que las cifras salgan bien (aviso en la configuración y en Métricas).
export function pendientesDirecta(d) {
  const out = [];
  if (!d?.compraTag) out.push({ campo: 'dc-compraTag', txt: 'Falta la etiqueta de compra del producto (sin ella no se cuenta ninguna venta).' });
  if (!d?.precio) out.push({ campo: 'dc-precio', txt: 'Falta el precio del producto.' });
  else if (!d?.iva?.producto) out.push({ campo: 'dc-iva', txt: 'Di si el precio del producto lleva el IVA incluido, es + IVA o va sin IVA.' });
  const revisar = (parte, lista, nombre) => {
    if (!conParte(d, parte)) return;
    const activos = (lista || []).filter((o) => o.activo !== false);
    if (!activos.length) out.push({ campo: `dc-tab-ofertas`, txt: `Has marcado ${nombre} pero no hay ninguno: añádelo o quítalo de «Qué lleva tu embudo».` });
    for (const o of activos) {
      if (!o.tag) out.push({ campo: 'dc-tab-ofertas', txt: `${nombre} «${o.nombre || 'sin nombre'}»: falta su etiqueta de GHL.` });
      if (!o.precio) out.push({ campo: 'dc-tab-ofertas', txt: `${nombre} «${o.nombre || 'sin nombre'}»: falta el precio.` });
      else if (!o.iva) out.push({ campo: 'dc-tab-ofertas', txt: `${nombre} «${o.nombre || 'sin nombre'}»: di si el precio lleva IVA.` });
    }
  };
  revisar('bumps', d?.bumps, 'Bump offer');
  revisar('upsell', d?.upsells, 'Upsell');
  revisar('downsell', d?.downsells, 'Downsell');
  if (conParte(d, 'meta') && !d?.metaFiltro) out.push({ campo: 'dc-metaFiltro', txt: 'Pon el texto común del nombre de las campañas de Meta (si no, se sumarían todas las campañas de la cuenta).' });
  if (!d?.ventaUrl) out.push({ campo: 'dc-ventaUrl', txt: 'Falta la URL de la página de venta.' });
  return out;
}

// Tareas de la puesta en marcha y del día a día.
export function tareasDirecta(d, { hoy } = {}) {
  const f = (n) => (hoy ? addDay(hoy, n) : '');
  const T = [
    ['producto', 'preparacion', 'Crear el producto y el formulario de pago (checkout) en GHL con su etiqueta de compra', 0, 'tecnico'],
    ['pagina', 'preparacion', 'Revisar en el móvil la página de venta, el botón al checkout y el checkout', 0, 'tecnico'],
    ...(conParte(d, 'bumps') ? [['bumps', 'preparacion', 'Configurar los bump offers en el checkout de GHL (cada uno con su etiqueta en el workflow)', 0, 'tecnico']] : []),
    ...(conParte(d, 'upsell') ? [['upsell', 'preparacion', 'Montar la página del upsell (compra en un clic) y su etiqueta', 1, 'tecnico']] : []),
    ...(conParte(d, 'downsell') ? [['downsell', 'preparacion', 'Montar la página del downsell para quien dice que no al upsell, y su etiqueta', 1, 'tecnico']] : []),
    ['entrega', 'preparacion', 'Comprobar el email de acceso / entrega del producto (y de cada extra)', 1, 'tecnico'],
    ['compra-prueba', 'preparacion', 'Hacer una compra de prueba completa (con bumps, upsell y downsell) y ver que salen las etiquetas', 1, 'admin'],
    ...(conParte(d, 'visitas') ? [['codigos', 'preparacion', 'Pegar los códigos de medición en cada página del embudo (Configuración → Códigos)', 1, 'tecnico']] : []),
    ['anuncios', 'captacion', `Activar los anuncios${d?.metaFiltro ? ` (campañas con «${d.metaFiltro}»)` : ''}`, 2, 'admin'],
    ['cpa', 'captacion', 'Revisar el CPA, el ticket medio y el ROAS de la semana en Métricas', 7, 'admin'],
    ['carrito', 'seguimiento', 'Revisar el email de carrito abandonado (quien llegó al checkout y no pagó)', 3, 'tecnico'],
    ['creatividades', 'optimizacion', 'Probar nuevas creatividades o ganchos en los anuncios', 14, 'admin'],
    ['ofertas', 'optimizacion', 'Revisar el % de cada bump, upsell y downsell: cambiar el que menos convierta', 30, 'admin'],
  ];
  return T.map(([clave, fase, titulo, dias, rol]) => ({ clave: `directa:${clave}`, fase, titulo, notas: '', fecha: f(dias), rol }));
}

// Guía de lo que hay que preparar en GHL (en «＋ Nuevo embudo» y en el ⚙️ del embudo).
export function guiaDirecta(partes = partesPorDefecto()) {
  const on = (p) => Boolean(partes?.[p]);
  const s = [];
  s.push({ titulo: '1 · Producto, checkout y etiquetas en GHL', pasos: [
    'Crea el <strong>producto</strong> y su <strong>formulario de pago</strong> (Sitios → Embudos → paso de pedido / checkout).',
    'En el <strong>workflow de la compra</strong> (disparador: pedido enviado o pago recibido de ese producto) añade la <strong>etiqueta de compra</strong> (p. ej. <code>compra-guia-sueno</code>). Recomendado: guarda también la fecha en un campo «Fecha compra …».',
    ...(on('bumps') ? ['<strong>Bump offers:</strong> añádelos en el paso de pedido (Order bump). En el workflow, una rama por cada bump que ponga <strong>su propia etiqueta</strong> (p. ej. <code>bump-audios</code>): así se sabe qué % de compradoras lo coge.'] : []),
  ] });
  if (on('upsell') || on('downsell')) s.push({ titulo: '2 · Upsell y downsell', pasos: [
    ...(on('upsell') ? ['Después del checkout, un paso de <strong>upsell</strong> (compra en un clic). Su workflow pone la etiqueta del upsell (p. ej. <code>upsell-curso</code>).'] : []),
    ...(on('downsell') ? ['Si dice «no, gracias» al upsell, va al paso de <strong>downsell</strong> con su etiqueta (p. ej. <code>downsell-minicurso</code>). El dashboard calcula su % sobre quien no cogió el upsell.'] : []),
    'Al final, la página de <strong>gracias / acceso</strong> con lo comprado.',
  ] });
  if (on('visitas')) s.push({ titulo: `${s.length + 1} · Medir las visitas`, pasos: [
    'En cada página del embudo (venta, checkout' + (on('upsell') ? ', upsell' : '') + (on('downsell') ? ', downsell' : '') + ' y gracias) pega su bloque de <em>Configuración → Códigos</em>. Cuenta visitantes únicos sin llamar a GHL.',
    'Con eso ves cuánta gente pasa de la página de venta al checkout y del checkout a la compra: dónde se pierde la venta.',
  ] });
  if (on('meta')) s.push({ titulo: `${s.length + 1} · Publicidad de Meta`, pasos: [
    'Pon en el nombre de todas las campañas de este producto un texto común (p. ej. <code>LT-guia</code>) y escríbelo como «filtro de campañas»: la inversión, el CPA y el ROAS salen solos.',
    'Parámetros de URL de los anuncios: <code>utm_source={{site_source_name}}&amp;utm_medium=paid&amp;utm_campaign={{campaign.id}}&amp;utm_term={{adset.id}}&amp;utm_content={{ad.id}}</code>.',
  ] });
  s.push({ titulo: `${s.length + 1} · En el dashboard`, pasos: [
    'Al crearlo se abre su configuración: producto y precio (con o sin IVA), etiqueta de compra, ' + [on('bumps') && 'bumps', on('upsell') && 'upsell', on('downsell') && 'downsell'].filter(Boolean).join(', ') + (on('bumps') || on('upsell') || on('downsell') ? ' (cada uno con su precio y su etiqueta), ' : '') + 'páginas y objetivos (CPA máximo, ROAS).',
    'En <em>Métricas</em>: ventas, facturación, ticket medio, CPA y ROAS por días, semanas o meses, y el % de cada extra.',
  ] });
  return s;
}
