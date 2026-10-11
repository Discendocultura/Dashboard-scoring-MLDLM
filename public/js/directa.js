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

// { nombre, tags: [] } (máx. 10 etiquetas, sin repetir ni la de compra de este embudo) · sin etiquetas: null.
export function sanitizeUpsellPrincipal(u, compraTag = '') {
  const propia = tag(compraTag);
  const tags = [...new Set((Array.isArray(u?.tags) ? u.tags : []).map(tag).filter((t) => t && t !== propia))].slice(0, 10);
  return tags.length ? { nombre: str(u?.nombre, 80), tags } : null;
}

// Cuántas compradoras han pasado después al producto principal (tienen alguna de sus etiquetas), en el periodo
// (las que compraron en él) y en total (todas las compradoras del embudo). → null si no está configurado.
export function upsellAlPrincipal(contactos, d, ventasPeriodo) {
  const u = d?.upsellPrincipal;
  if (!u?.tags?.length) return null;
  const pasa = (c) => u.tags.some((t) => tiene(c, t));
  const todas = contactos.filter((c) => tiene(c, d.compraTag));
  const cuenta = (lista) => { const n = lista.filter(pasa).length; return { n, de: lista.length, pct: div(n, lista.length) }; };
  return { nombre: u.nombre || '', tags: u.tags, periodo: cuenta(ventasPeriodo.map((v) => v.c)), total: cuenta(todas) };
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
    // Asunto (o parte) del email que envía el workflow de compra: fecha la compra de quien ya era contacto.
    emailCompra: str(d?.emailCompra, 120),
    // Oportunidad que crea el workflow de compra (vacío: se detecta sola entre las compradoras).
    compraPipeline: str(d?.compraPipeline, 40).replace(/[^A-Za-z0-9_-]/g, ''),
    compraEtapa: str(d?.compraEtapa, 60).replace(/[^A-Za-z0-9_-]/g, ''),
    // Producto principal al que se quiere llevar a las compradoras más tarde (upsell posterior): sus etiquetas de compra.
    upsellPrincipal: sanitizeUpsellPrincipal(d?.upsellPrincipal, d?.compraTag),
    // Mensaje de WhatsApp del seguimiento a las que no tienen el producto principal ({nombre}, {producto}, {principal}, {setter}).
    mensajeSeguimiento: str(d?.mensajeSeguimiento, 1000),
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
// Día de la compra: el campo de fecha de compra; si no hay, el que apuntó el servidor al ver la etiqueta de
// compra por primera vez (c.diaCompra: ver lib/directa.js); y si no, el día en que se creó el contacto.
// (Con solo el día de alta, quien ya era contacto y compra hoy contaría el día que se dio de alta.)
export function diaCompra(c, d) {
  const f = d?.compraDateField ? dayOfDateField(c.cf?.[d.compraDateField]) : '';
  return f || c.diaCompra || (c.dateAdded ? dayInMadrid(c.dateAdded) : '');
}

// Días de compra sin campo de fecha. `reg`: { desde, ultima, dias: { contactId: día } } (lo guardado) · ahora: ISO
// La primera vez, cada compradora con su día de alta (como antes). Después, cada compradora NUEVA: si el contacto
// es nuevo, su día de alta; si ya existía, el día en que GHL lo actualizó (al ponerle la etiqueta) o, si es
// anterior a la última vez que miramos, hoy. → { reg, cambios }
export function apuntarCompras(reg, contactos, ahora, dia) {
  const dias = { ...(reg?.dias || {}) };
  const desde = reg?.ultima || '';
  let cambios = !reg;
  for (const c of contactos) {
    if (!c?.id || dias[c.id]) continue;
    cambios = true;
    const alta = c.dateAdded || '';
    if (!reg) { dias[c.id] = dia(alta || ahora); continue; }
    const ref = alta && alta >= desde ? alta : c.dateUpdated && c.dateUpdated >= desde ? c.dateUpdated : ahora;
    dias[c.id] = dia(ref);
  }
  return { reg: { ...(reg || {}), desde: reg?.desde || ahora, ultima: cambios ? ahora : reg?.ultima || ahora, dias }, cambios };
}

// Pipeline y etapa donde el workflow de compra crea una oportunidad (la hora exacta de la compra): la pareja
// más repetida entre las compradoras, si la tiene al menos el 40 % (y 3 o más). → { pipelineId, stageId } | null
export function pipelineDeCompra(contactos = []) {
  const n = new Map();
  let con = 0;
  for (const c of contactos) {
    const pares = [...new Set(c?.opps || [])];
    if (pares.length) con += 1;
    for (const p of pares) n.set(p, (n.get(p) || 0) + 1);
  }
  const [par, veces] = [...n.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  if (!par || veces < 3 || veces < contactos.length * 0.4) return null;
  const [pipelineId, stageId] = par.split(':');
  return { pipelineId, stageId: stageId || '', cubre: veces, de: contactos.length, conOportunidad: con };
}

// Hora de compra por contacto con las oportunidades del workflow de compra (la más reciente de cada una).
// `ids`: Set de compradoras. → { contactId: ISO }
export function fechasDeOportunidades(opps = [], ids = null) {
  const out = {};
  for (const o of opps) {
    if (!o?.contactId || !o.createdAt || (ids && !ids.has(o.contactId))) continue;
    if (!out[o.contactId] || o.createdAt > out[o.contactId]) out[o.contactId] = o.createdAt;
  }
  return out;
}

// Compras cuyo día es una estimación (el contacto ya existía y no hay campo de fecha): se pueden fechar con el
// email de compra. Solo las recientes (su contacto se actualizó en los últimos `dias` días) y aún sin comprobar.
export function comprasDudosas(contactos, reg, ahora, dias = 14) {
  const limite = new Date(Date.parse(ahora) - dias * 86_400_000).toISOString();
  return contactos.filter((c) => c?.id && !reg?.email?.[c.id] && c.dateUpdated && c.dateUpdated >= limite
    && c.dateAdded && Date.parse(c.dateUpdated) - Date.parse(c.dateAdded) > 3600_000);
}

// El email de compra (el asunto contiene `asunto`, sin mayúsculas, acentos ni emojis): la fecha del primero. → ISO | ''
const normEmail = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function fechaEmailCompra(emails = [], asunto = '') {
  const a = normEmail(asunto);
  if (!a) return '';
  return emails.filter((e) => e.saliente !== false && normEmail(e.asunto).includes(a)).map((e) => e.fecha).filter(Boolean).sort()[0] || '';
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
    compradores: ventas.sort((a, b) => b.dia.localeCompare(a.dia)).map(({ c, dia }) => {
      const suyos = extras.filter((o) => tiene(c, o.tag));
      return {
        id: c.id, name: c.name || [c.firstName, c.lastName].filter(Boolean).join(' '), email: c.email || '', phone: c.phone || '', dia,
        extras: suyos.map((o) => o.id),
        // Lo que ha pagado (sin IVA) y de qué campaña / conjunto / anuncio viene (UTM o campos del formulario de Meta).
        importe: precio + suyos.reduce((t, o) => t + precioExtraSinIva(o, d), 0),
        ...(d.upsellPrincipal?.tags?.some((t) => tiene(c, t)) ? { principal: true } : {}),
        ...(c.src?.campaign || c.src?.term || c.src?.content ? { src: { campaign: c.src.campaign || '', adset: c.src.term || '', ad: c.src.content || '' } } : {}),
      };
    }),
    sinFechaCompra: !d.compraDateField,
    upsellPrincipal: upsellAlPrincipal(contactos, d, ventas),
    // Con campo: las ventas del periodo que aún no lo tienen relleno (compraron antes de crearlo) y se fechan por la etiqueta/email.
    sinCampoRelleno: d.compraDateField ? ventas.filter((v) => !dayOfDateField(v.c.cf?.[d.compraDateField])).length : 0,
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

// Anuncios ganadores de la venta directa: los que traen ventas al MENOR coste por venta (CAC) y MÁS ventas.
//   compradores: los de metricasDirecta (con src e importe) · meta: { names, spendBy, estructura } de Meta
//   level: 'ad' | 'adset' | 'campaign' · orden: 'cac' (menor CAC primero) | 'ventas' (más ventas primero)
//   minVentas: para entrar en el ranking por CAC (con 1 venta el CAC es suerte)
// → { filas: [{ id, label, campaign, adset, ventas, facturacion, spend, cac, roas, ganador }], sinAnuncio, conGasto }
export function ganadoresDirecta(compradores = [], meta = {}, level = 'ad', { orden = 'cac', minVentas = 2 } = {}) {
  const names = meta?.names || {};
  const spendBy = meta?.spendBy || {};
  const est = meta?.estructura || {};
  const g = new Map();
  let sinAnuncio = 0;
  for (const c of compradores) {
    const id = c.src?.[level];
    if (!id) { sinAnuncio++; continue; }
    const x = g.get(id) || { id, ventas: 0, facturacion: 0, campaign: c.src.campaign, adset: c.src.adset };
    x.ventas++;
    x.facturacion += Number(c.importe) || 0;
    g.set(id, x);
  }
  // Lo que gasta sin vender también se ve (al final): es lo primero que hay que apagar.
  for (const [id, e] of Object.entries(est)) {
    if (e.nivel === level && !g.has(id) && (Number(spendBy[id]) || 0) > 0) g.set(id, { id, ventas: 0, facturacion: 0, campaign: e.campaign || '', adset: e.adset || '' });
  }
  const filas = [...g.values()].map((x) => {
    const spend = Number(spendBy[x.id]) || null;
    const e = est[x.id] || {};
    const camp = level === 'campaign' ? '' : e.campaign || x.campaign;
    const set = level === 'ad' ? e.adset || x.adset : '';
    return {
      id: x.id, label: names[x.id] || `${{ ad: 'Anuncio', adset: 'Conjunto', campaign: 'Campaña' }[level] || ''} ${x.id} (no sale en las campañas de este embudo en Meta)`.trim(), campaign: camp ? names[camp] || camp : '', adset: set ? names[set] || set : '',
      ventas: x.ventas, facturacion: x.facturacion, spend, cac: spend && x.ventas ? spend / x.ventas : null, roas: spend ? x.facturacion / spend : null,
    };
  });
  const enRanking = (f) => f.cac != null && f.ventas >= minVentas;
  const grupo = (f) => (enRanking(f) ? 0 : f.ventas ? 1 : 2);
  filas.sort((a, b) => {
    if (orden === 'ventas') return (b.ventas - a.ventas) || ((a.cac ?? Infinity) - (b.cac ?? Infinity)) || ((b.spend || 0) - (a.spend || 0));
    return (grupo(a) - grupo(b)) || ((a.cac ?? Infinity) - (b.cac ?? Infinity)) || (b.ventas - a.ventas) || ((b.spend || 0) - (a.spend || 0));
  });
  // Ganadores: los 3 mejores con ventas suficientes (por CAC, o por ventas si se ordena así).
  const top = filas.filter(enRanking).slice().sort((a, b) => (orden === 'ventas' ? (b.ventas - a.ventas) || (a.cac - b.cac) : (a.cac - b.cac) || (b.ventas - a.ventas))).slice(0, 3).map((f) => f.id);
  for (const f of filas) f.ganador = top.indexOf(f.id) + 1 || 0;
  return { filas, sinAnuncio, conGasto: Object.keys(spendBy).length > 0 };
}
