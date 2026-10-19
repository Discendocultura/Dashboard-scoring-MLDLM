// Inteligencia de negocio: el HTML de la pestaña (dashboard y portal del cliente), a partir de GET /api/negocio.
//   negocioHtml(d, { producto }) → texto HTML. Arriba, «🌐 Todo el negocio» y un botón por producto (data-ng-producto):
//   con uno elegido, su ficha (productoHtml); si no, la vista general con «📦 Tus productos».
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => (n == null || !Number.isFinite(n) ? '–' : n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2 }));
const num = (n) => (n == null || !Number.isFinite(n) ? '–' : Math.round(n).toLocaleString('es-ES'));
const pct = (n) => (n == null || !Number.isFinite(n) ? '–' : `${Math.round(n * 100)} %`);
const x1 = (n) => (n == null || !Number.isFinite(n) ? '–' : `${n.toFixed(1).replace('.', ',')}x`);
const mesTxt = (m) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
export const PERIODOS_TXT = { '12m': 'Últimos 12 meses', ano: 'Este año', todo: 'Todo el histórico' };
const TIPO_ICO = { lanzamientos: '🚀', vsl: '🎬', directa: '🛒', meteorico: '⚡' };
const pocos = (b) => (b ? '<span class="ng-pocos" title="Con tan pocos datos, tómalo como orientativo">Pocos datos todavía</span>' : '');

// Cambio frente al periodo anterior: ▲ verde si mejora (en costes, si baja).
function delta(actual, antes, { menosEsMejor = false } = {}) {
  if (actual == null || antes == null || !antes) return '';
  const c = (actual - antes) / Math.abs(antes);
  if (!Number.isFinite(c) || Math.abs(c) < 0.005) return '<small class="ng-delta">= que antes</small>';
  const bueno = menosEsMejor ? c < 0 : c > 0;
  return `<small class="ng-delta ${bueno ? 'up' : 'down'}">${c > 0 ? '▲' : '▼'} ${Math.round(Math.abs(c) * 100)} % <span>vs periodo anterior</span></small>`;
}

function tarjeta(ico, titulo, valor, extra, ayuda) {
  return `<div class="ng-kpi" title="${esc(ayuda)}"><span class="ng-kpi-ico" aria-hidden="true">${ico}</span><span class="ng-kpi-t">${esc(titulo)}</span><strong>${valor}</strong>${extra || ''}</div>`;
}

export function negocioVacio(d = {}) {
  const calc = d.pendientes > 0;
  return `<div class="ng-vacio card"><span class="ng-vacio-ico" aria-hidden="true">📊</span>
    <h3>A medida que tengamos datos de tu negocio, verás aquí tus métricas</h3>
    <p class="muted">Facturación, lo que deja cada cliente, coste por lead, ROAS, ciclo de compra y qué hacer para facturar más. Aparecen en cuanto haya un lanzamiento con registros o un mes de una VSL o una venta directa.</p>
    ${calc ? `<p class="ng-calc">⏳ Revisando tu histórico… ${d.total - d.pendientes} de ${d.total}</p>` : ''}</div>`;
}

// Icono del producto: ⚡ meteórico, 📦 producto de Marca y avatar; si es un embudo sin producto, el de su tipo (🚀, 🎬…).
const ICO_CATALOGO = { principal: '⭐', entrada: '🚪', continuidad: '🔁', otro: '📦' };
const icoProd = (p) => (p.tipo === 'catalogo' ? ICO_CATALOGO[p.tipoProducto] || '📦' : p.tipo === 'meteorico' ? '⚡' : p.tipo === 'directa' ? '🛒' : p.tipo === 'embudo' ? TIPO_ICO[p.embudos?.[0]?.tipo] || '🧩' : '📦');
const nomProd = (p) => (p.tipo === 'meteorico' ? p.nombre.replace(/^⚡\s*/, '') : p.nombre);
const prodIco = (p) => `${icoProd(p)} `;
// «Mejora tus datos»: la nota de calidad y lo que falta, cada cosa con lo que ganas y un botón a donde se pone.
function calidadHtml(c) {
  if (!c?.total) return '';
  const pend = c.items.filter((x) => !x.ok);
  const boton = (x) => (x.accion === 'productos' ? `<button type="button" class="btn small primary" data-abrir-productos>${esc(x.boton)} →</button>`
    : x.accion.startsWith('config:') ? `<button type="button" class="btn small" data-ng-config="${esc(x.accion.slice(7))}">${esc(x.boton)} →</button>`
      : `<small class="muted">${esc(x.boton)}</small>`);
  return `<section class="ng-sec ng-calidad card config-only">
    <div class="ng-cal-cab"><div class="ng-anillo ng-cal-anillo" style="--p:${c.pct}"><div><strong>${c.pct}%</strong><span>datos completos</span></div></div>
      <div><h3>🧪 Mejora tus datos</h3><p class="muted">${pend.length ? `Cuanto más completos, más exactas las cifras y mejores las recomendaciones. Te faltan <b>${pend.length}</b> ${pend.length === 1 ? 'cosa' : 'cosas'}:` : '✓ Tus datos están completos: las cifras y las recomendaciones son tan buenas como pueden ser.'}</p></div></div>
    ${pend.length ? `<div class="ng-cal-lista">${pend.map((x) => `<div class="ng-cal-item"><span class="ng-cal-ico" aria-hidden="true">${x.ico}</span><div><strong>${esc(x.titulo)}</strong><p>${esc(x.texto)}</p><small>✨ Verás: ${esc(x.gana)}</small></div>${boton(x)}</div>`).join('')}</div>` : ''}
    ${c.hechos ? `<p class="ng-cal-ok">${c.items.filter((x) => x.ok).map((x) => `<span>✓ ${esc(x.titulo)}</span>`).join('')}</p>` : ''}
  </section>`;
}

const recosHtml = (lista, titulo) => (lista?.length ? `<section class="ng-sec"><h3>${titulo}</h3><div class="ng-recos">${lista.map((r) => `<div class="ng-reco"><span class="ng-reco-ico" aria-hidden="true">${esc(r.ico)}</span><div><strong>${esc(r.titulo)}</strong><p>${esc(r.texto)}</p></div></div>`).join('')}</div></section>` : '');
// Anillo con el % de la facturación.
const anillo = (x, txt = 'de tu facturación') => `<div class="ng-anillo" style="--p:${Math.round(Math.max(0, Math.min(1, x || 0)) * 100)}"><div><strong>${pct(x)}</strong><span>${txt}</span></div></div>`;
// Mini gráfica de barras (facturación por mes).
const mini = (serie) => {
  if (!serie?.length) return '';
  const max = Math.max(1, ...serie.map((m) => m.facturacion));
  return `<span class="ng-spark" aria-hidden="true">${serie.map((m) => `<i style="height:${Math.max(4, Math.round((m.facturacion / max) * 100))}%" title="${esc(mesTxt(m.mes))}: ${eur(m.facturacion)}"></i>`).join('')}</span>`;
};

// Selector de arriba: todo el negocio o un producto.
function selectorProductos(d, sel) {
  if (!d.productos?.length) return '';
  return `<nav class="ng-prods" aria-label="Ver el negocio entero o un producto">
    <button type="button" class="ng-prod-tab${sel ? '' : ' on'}" data-ng-producto=""><span class="ng-pt-ico">🌐</span><span><strong>Todo el negocio</strong><small>${eur(d.numeros.facturacion)}</small></span></button>
    ${d.productos.map((p) => `<button type="button" class="ng-prod-tab${sel === p.id ? ' on' : ''}" data-ng-producto="${esc(p.id)}"><span class="ng-pt-ico">${icoProd(p)}</span><span><strong>${esc(nomProd(p))}</strong><small>${p.sinPrecios ? 'sin precio' : eur(p.facturacion)}${p.cuota != null ? ` · ${pct(p.cuota)}` : ''}</small></span><i class="ng-pt-barra" style="width:${Math.round((p.cuota || 0) * 100)}%"></i></button>`).join('')}
    <button type="button" class="ng-prod-tab ng-prod-nuevo config-only" data-abrir-productos><span class="ng-pt-ico">＋</span><span><strong>Añadir producto</strong><small>Mi negocio → Productos</small></span></button>
  </nav>`;
}

// En la vista general: una tarjeta por producto (se pulsa para ver su ficha).
// Si los productos salen de los embudos (sin catálogo), una invitación a definirlos en Mi negocio → Productos.
const ctaCatalogo = (d) => (d.fuenteProductos === 'catalogo' ? '' : `<div class="ng-cta-cat config-only"><span aria-hidden="true">📦</span><div><strong>Afina esto con tus productos</strong><p>Pon en <b>Mi negocio → Productos</b> cada producto con su precio, la etiqueta de quien lo compra y sus ofertas: verás lo que factura cada uno, a qué precio se vende y qué compran después tus clientes.</p></div><button type="button" class="btn primary" data-abrir-productos>Poner mis productos</button></div>`);

function tarjetasProductos(d) {
  if (!d.productos?.length) return ctaCatalogo(d);
  return `<section class="ng-sec"><h3>📦 Tus productos <small class="muted">· pulsa uno para ver su ficha</small></h3>${ctaCatalogo(d)}<div class="ng-pcards">${d.productos.map((p) => `<button type="button" class="ng-pcard" data-ng-producto="${esc(p.id)}">
      <span class="ng-pcard-cab"><strong>${prodIco(p)}${esc(nomProd(p))}</strong>${p.recomendaciones?.length ? `<span class="ng-pcard-recos" title="Recomendaciones para este producto">💡 ${p.recomendaciones.length}</span>` : ''}</span>
      <span class="ng-pcard-cifra">${p.calculando ? '<small class="muted">⏳ Calculando…</small>' : p.sinPrecios ? '💶 sin precio' : eur(p.facturacion)}${delta(p.facturacion, p.previo?.facturacion)}</span>
      <span class="ng-pcard-cuota"><span class="ng-barra"><i style="width:${Math.round((p.cuota || 0) * 100)}%"></i></span><small>${pct(p.cuota)} de lo que facturas</small></span>
      <span class="ng-pcard-datos"><span><b>${num(p.ventas)}</b> ventas</span><span><b>${p.roas == null ? '–' : x1(p.roas)}</b> ROAS</span><span><b>${eur(p.ticket)}</b> ticket</span>${p.ciclo?.n ? `<span title="Del registro a la compra (mediana)">⏱️ <b>${p.ciclo.mediana === 0 ? 'mismo día' : `${num(p.ciclo.mediana)} d`}</b></span>` : ''}</span>
      ${mini(p.serie)}
      <span class="ng-pcard-ver">Ver ficha →</span></button>`).join('')}
      <button type="button" class="ng-pcard ng-pcard-nuevo config-only" data-abrir-productos><span class="ng-pcard-mas" aria-hidden="true">＋</span><strong>Añadir un producto</strong><small>Con su precio, la etiqueta de quien lo compra y sus ofertas. Así ves lo que factura cada uno y qué compran después.</small><span class="ng-pcard-ver">Añadir producto →</span></button></div></section>`;
}

// La ficha de un producto.
function productoHtml(d, p) {
  const prev = p.previo || {};
  const kpis = `<div class="ng-kpis">
    ${tarjeta('💰', 'Facturación', p.sinPrecios ? '💶 sin precio' : eur(p.facturacion), `${delta(p.facturacion, prev.facturacion)}<small>${num(p.clientes)} clientes · ${num(p.ventas)} ventas</small>`, 'Lo facturado (sin IVA) por este producto en el periodo')}
    ${tarjeta('🎟️', 'Ticket medio', eur(p.ticket), '<small>Lo que paga de media cada compra</small>', 'Facturación ÷ ventas de este producto')}
    ${tarjeta('💎', 'Lo que deja quien lo compra', eur(p.ltvComprador), '<small>Sumando todo lo que te compra después · todo el histórico</small>', 'De media, lo que te paga en total (este y tus otros productos) quien ha comprado este producto')}
    ${tarjeta('📈', 'ROAS', p.inversion ? x1(p.roas) : '–', p.inversion ? delta(p.roas, prev.roas) || `<small>${eur(p.inversion)} invertidos</small>` : '<small>Sin inversión en anuncios</small>', 'Facturación ÷ inversión en anuncios de sus embudos')}
    ${tarjeta('🎯', 'Coste por lead', eur(p.cpl), p.cpl == null ? '<small>Sin anuncios o sin registros</small>' : delta(p.cpl, prev.cpl, { menosEsMejor: true }) || '<small>Inversión ÷ registros</small>', 'La inversión en anuncios dividida entre sus registros')}
    ${tarjeta('🛒', 'Conversión', p.conversion == null ? '–' : pct(p.conversion), p.conversion == null ? '<small>Se vende sin registro previo</small>' : delta(p.conversion, prev.conversion) || `<small>De ${num(p.registros)} registros</small>`, 'Ventas ÷ registros')}
  </div>`;
  const camino = (lista, ico, vacio) => (lista.length
    ? `<ul class="ng-flujo-l">${lista.map((x) => `<li><span>${esc(x.nombre)}</span><b>${num(x.n)}</b></li>`).join('')}</ul>`
    : `<div class="ng-flujo-vacio"><span aria-hidden="true">${ico}</span>${vacio}</div>`);
  const o = p.objetivo;
  const objetivo = o ? `<div class="ng-objetivo">
      <div class="ng-objetivo-t"><span aria-hidden="true">🎯</span><div><small>El producto al que quiere llevar</small><strong>${esc(o.nombre)}</strong></div></div>
      <div class="ng-objetivo-d"><strong>${pct(o.pct)}</strong><span>${num(o.n)} de ${num(p.compradores)} compradores también lo han comprado${o.dias != null ? ` · a los ${num(o.dias)} días de media` : ''}</span>
        <span class="ng-barra"><i style="width:${Math.round((o.pct || 0) * 100)}%"></i></span></div>
    </div>` : '';
  const viaje = `<section class="ng-sec card"><h3>🧭 El viaje de sus clientes ${pocos(p.compradores < MIN_VIAJE)}</h3>
    ${objetivo}
    <div class="ng-flujo">
      <div class="ng-flujo-c"><h4>Antes compraron</h4>${camino(p.antes.top, '🚪', p.tipo === 'catalogo' && p.sinFecha && !p.antes.top.length && p.tambien?.length ? 'Sin fechas de compra no se sabe el orden.' : 'Es su primera compra contigo: una puerta de entrada.')}</div>
      <span class="ng-flujo-f" aria-hidden="true">→</span>
      <div class="ng-flujo-yo"><span aria-hidden="true">${icoProd(p)}</span><strong>${esc(nomProd(p))}</strong><small>${num(p.compradores)} compradores</small></div>
      <span class="ng-flujo-f" aria-hidden="true">→</span>
      <div class="ng-flujo-c"><h4>Después compran</h4>${camino(p.despues.top, '🌱', 'Aún nadie ha comprado otra cosa después.')}</div>
    </div>
    ${p.tambien?.length ? `<p class="ng-tambien"><b>También te compran:</b> ${p.tambien.map((x) => `<span>${esc(x.nombre)} <b>${num(x.n)}</b></span>`).join('')}</p>` : ''}
    <div class="ng-mini">
      <div><strong>${pct(p.despues.pct)}</strong><span>compra otra cosa después</span></div>
      <div><strong>${p.despues.dias == null ? '–' : `${num(p.despues.dias)} días`}</strong><span>hasta esa compra</span></div>
      <div><strong>${p.ciclo.n ? (p.ciclo.mediana === 0 ? 'Mismo día' : `${num(p.ciclo.mediana)} días`) : '–'}</strong><span>del registro a la compra</span></div>
    </div></section>`;
  const maxO = Math.max(1, ...(p.ofertas || []).map((x) => x.ventas));
  const ofertas = p.ofertas?.length ? `<section class="ng-sec card"><h3>🏷️ A qué precio se vende</h3>
    <div class="ng-ofertas">${p.ofertas.map((x) => `<div class="ng-oferta${x.id ? '' : ' normal'}"><span class="ng-oferta-n"><strong>${esc(x.nombre)}</strong><small>${eur(x.precio)} sin IVA</small></span>
      <span class="ng-barra"><i style="width:${Math.round((x.ventas / maxO) * 100)}%"></i></span><span class="ng-oferta-c"><b>${num(x.ventas)}</b> ventas · ${pct(x.pct)}<small>${eur(x.facturacion)}</small></span></div>`).join('')}</div>
    ${p.precioLista && p.ticket ? `<p class="muted small">Precio medio real: <b>${eur(p.ticket)}</b> (el normal, ${eur(p.precioLista)}) · sin IVA.</p>` : ''}</section>` : '';
  const maxS = Math.max(1, ...p.serie.map((m) => m.facturacion));
  const serie = p.serie.length > 1 ? `<section class="ng-sec card"><h3>📅 Facturación por mes</h3><div class="ng-serie" role="img" aria-label="Facturación por mes de ${esc(p.nombre)}">${p.serie.map((m) => `<div class="ng-mes" title="${esc(mesTxt(m.mes))}: ${eur(m.facturacion)}"><span class="ng-roas">${m.facturacion >= 1000 ? `${Math.round(m.facturacion / 1000)}k` : ''}</span><span class="ng-cols"><i class="f solo" style="height:${Math.round((m.facturacion / maxS) * 100)}%"></i></span><span class="ng-mes-t">${esc(mesTxt(m.mes))}</span></div>`).join('')}</div></section>` : '';
  const embs = d.embudos.filter((e) => p.embudos.some((x) => x.id === e.id));
  const tabla = embs.length && p.tipo !== 'meteorico' ? tablaEmbudos(embs, `🧩 Sus embudos`) : '';
  return `<section class="ng-phero">
      <div class="ng-phero-t"><span class="ng-phero-ico">${icoProd(p)}</span><div><h3>${esc(nomProd(p))}</h3>
        <p>${p.tipo === 'catalogo' && p.precioLista ? `Precio normal ${eur(p.precioLista)} sin IVA${p.ofertas?.length ? ` · ${p.ofertas.length - 1} ${p.ofertas.length === 2 ? 'oferta' : 'ofertas'}` : ''}${p.embudos.length ? ' · ' : ''}` : ''}${p.tipo === 'meteorico' ? 'Meteórico' : p.embudos.length ? `Se vende en ${p.embudos.map((e) => `${TIPO_ICO[e.tipo] || '•'} ${esc(e.nombre)}`).join(' · ')}` : ''}${p.lanzamientos ? ` · ${num(p.lanzamientos)} ${p.lanzamientos === 1 ? 'lanzamiento' : 'lanzamientos'} en el periodo` : ''}</p>
        ${pocos(p.pocos)}</div></div>
      ${d.productos.length > 1 ? anillo(p.cuota) : ''}
    </section>
    ${p.sinPrecios ? `<p class="ng-aviso">💶 Este producto tiene ventas sin precio: ponlo en ${p.tipo === 'catalogo' ? 'Mi negocio → Productos' : 'la configuración de su embudo'} para ver lo que factura.</p>` : ''}
    ${p.calculando ? '<p class="ng-aviso suave">⏳ Contando sus compras en GHL (por su etiqueta)… Se completa solo en unos segundos.</p>' : ''}
    ${p.tipo === 'catalogo' && p.sinFecha && d.periodo !== 'todo' ? `<p class="ng-aviso suave">📅 ${num(p.sinFecha)} de sus compras no tienen fecha: solo cuentan en «Todo el histórico». ${p.conFechaCampo ? 'Revisa que el workflow de compra rellene su campo de fecha.' : 'Elige su campo de fecha de compra en Mi negocio → Productos.'}</p>` : ''}
    ${kpis}${recosHtml(p.recomendaciones, `💡 Qué haría con ${esc(nomProd(p))}`) || '<p class="ng-aviso suave">✅ Nada urgente con este producto. Las recomendaciones aparecen cuando los datos lo justifican.</p>'}
    ${ofertas}${viaje}${cicloHtml(p.ciclo, `⏱️ Ciclo de compra · ${esc(nomProd(p))}`)}${segundaHtml({ diasSegunda: p.objetivo?.dias ?? p.despues.dias, mediaSegunda: null, pct: p.objetivo?.pct ?? p.despues.pct, nSegunda: p.objetivo?.n ?? p.despues.n, tramosSegunda: null }, { titulo: `⏩ De ${esc(nomProd(p))} a ${p.objetivo ? `«${esc(p.objetivo.nombre)}»` : 'su siguiente compra'}`, siguiente: p.objetivo?.nombre || p.despues.top[0]?.nombre || '' })}${serie}${tabla}`;
}
const MIN_VIAJE = 10;

export function negocioHtml(d, { producto = '' } = {}) {
  if (!d || d.vacio) return negocioVacio(d);
  const prod = producto && d.productos?.find((x) => x.id === producto);
  if (prod) {
    const calcP = d.pendientes > 0 ? `<div class="ng-progreso"><span>⏳ Revisando tu histórico: ${d.total - d.pendientes} de ${d.total}. Las cifras se completan solas.</span></div>` : '';
    return `${selectorProductos(d, prod.id)}${calcP}${productoHtml(d, prod)}`;
  }
  const n = d.numeros;
  const p = d.previo || {};
  const calc = d.pendientes > 0 ? `<div class="ng-progreso"><span>⏳ Revisando tu histórico: ${d.total - d.pendientes} de ${d.total}. Las cifras se completan solas.</span><span class="ng-barra"><i style="width:${Math.round(((d.total - d.pendientes) / Math.max(1, d.total)) * 100)}%"></i></span></div>` : '';
  const aviso = n.sinPrecios ? '<p class="ng-aviso">💶 Hay ventas sin precio: pon los precios en la configuración de cada embudo para ver la facturación, el ROAS y lo que deja cada cliente.</p>' : '';

  const kpis = `<div class="ng-kpis">
    ${tarjeta('💰', 'Facturación', eur(n.facturacion), `${delta(n.facturacion, p.facturacion)}<small>${num(n.clientes)} clientes · ${num(n.ventas)} ventas</small>`, 'Lo facturado (sin IVA) por todos los embudos en el periodo')}
    ${tarjeta('💎', 'Lo que deja un cliente (LTV)', eur(n.ltv), '<small>De media, sumando todo lo que compra · todo el histórico</small>', 'Lo que paga de media un cliente a lo largo de su vida contigo: todas sus compras de todos los embudos')}
    ${tarjeta('🎯', 'Coste por lead medio', eur(n.cpl), delta(n.cpl, p.cpl, { menosEsMejor: true }) || '<small>Inversión ÷ registros</small>', 'La inversión en anuncios dividida entre los registros de los embudos con inversión')}
    ${tarjeta('📈', 'ROAS medio', x1(n.roas), delta(n.roas, p.roas) || '<small>Lo que vuelve por cada euro</small>', 'Facturación ÷ inversión en anuncios, en los embudos con inversión')}
    ${tarjeta('🧲', 'Coste por cliente (CAC)', eur(n.cac), delta(n.cac, p.cac, { menosEsMejor: true }) || `<small>${num(n.nuevos)} clientes nuevos</small>`, 'La inversión en anuncios dividida entre los clientes nuevos (su primera compra es de este periodo)')}
    ${tarjeta('🎟️', 'Ticket medio', eur(n.ticket), '<small>Lo que paga de media cada compra</small>', 'Facturación ÷ ventas')}
    ${tarjeta('🛒', 'Conversión', n.conversion == null ? '–' : pct(n.conversion), '<small>De registro a venta</small>', 'Ventas ÷ registros, en los embudos con registros')}
    ${tarjeta('💡', 'Lo que vale cada lead', eur(n.valorLead), '<small>Facturación ÷ registros: lo máximo que puedes pagar por lead sin perder</small>', 'Lo que facturas de media por cada persona que se registra')}
    ${tarjeta('⚖️', 'LTV ÷ CAC', n.ltvCac == null ? '–' : x1(n.ltvCac), `<small class="${n.ltvCac >= 3 ? 'ng-bien' : n.ltvCac != null && n.ltvCac < 1.5 ? 'ng-mal' : ''}">${n.ltvCac == null ? 'Hace falta inversión y precios' : n.ltvCac >= 3 ? 'Sano: puedes invertir más' : n.ltvCac < 1.5 ? 'Ajustado: sube el valor o baja el coste' : 'Bien: vigila el coste por cliente'}</small>`, 'Cuántas veces recuperas lo que cuesta conseguir un cliente. A partir de 3 es sano')}
  </div>`;

  const recos = recosHtml(d.recomendaciones, '🧭 Qué haría ahora para facturar más');

  const ciclo = cicloHtml(d.ciclo, '⏱️ Ciclo de compra · todo el negocio');

  const r = d.recompra;
  const recompra = `<section class="ng-sec card"><h3>🔁 El cliente a lo largo del tiempo ${pocos(r.pocos)}</h3>
    <div class="ng-mini">
      <div><strong>${pct(r.pct)}</strong><span>vuelve a comprar (${num(r.repiten)} de ${num(r.clientes)})</span></div>
      <div><strong>${eur(r.ltvRepite)}</strong><span>deja quien repite</span></div>
      <div><strong>${eur(r.ltvUnaVez)}</strong><span>deja quien compra una vez</span></div>
      <div><strong>${r.diasSegunda == null ? '–' : `${num(r.diasSegunda)} días`}</strong><span>hasta su segunda compra</span></div>
    </div>
    ${r.caminos.length ? `<h4>El camino más habitual entre productos</h4><ol class="ng-caminos">${r.caminos.map((x) => `<li><span>${esc(x.camino)}</span><b>${num(x.n)} ${x.n === 1 ? 'cliente' : 'clientes'}</b></li>`).join('')}</ol>` : '<p class="muted small">Cuando haya clientes que compren en más de un embudo o lanzamiento, verás aquí qué producto lleva al siguiente.</p>'}
  </section>`;

  const a = d.actividad;
  const maxS = Math.max(1, ...d.serie.flatMap((m) => [m.facturacion, m.inversion]));
  const actividad = `<section class="ng-sec card"><h3>📅 Actividad</h3>
    <div class="ng-mini">
      <div><strong>${num(a.lanzamientos)}</strong><span>lanzamientos en total</span></div>
      <div><strong>${num(a.ultimoAno)}</strong><span>en los últimos 12 meses</span></div>
      <div><strong>${num(a.activos)} <small>de ${num(a.embudos)}</small></strong><span>embudos activos</span></div>
    </div>
    ${d.serie.length ? `<h4>Facturación e inversión por mes</h4><div class="ng-serie" role="img" aria-label="Facturación e inversión por mes">${d.serie.map((m) => `<div class="ng-mes" title="${esc(mesTxt(m.mes))}: ${eur(m.facturacion)} facturados, ${eur(m.inversion)} invertidos${m.roas != null ? `, ROAS ${x1(m.roas)}` : ''}">
      <span class="ng-roas">${m.roas ? x1(m.roas) : ''}</span>
      <span class="ng-cols"><i class="f" style="height:${Math.round((m.facturacion / maxS) * 100)}%"></i><i class="v" style="height:${Math.round((m.inversion / maxS) * 100)}%"></i></span>
      <span class="ng-mes-t">${esc(mesTxt(m.mes))}</span></div>`).join('')}</div>
      <p class="ng-leyenda"><span><i class="f"></i> Facturación</span><span><i class="v"></i> Inversión</span><span>ROAS encima de cada mes</span></p>` : ''}
  </section>`;

  const embudos = d.embudos.length ? tablaEmbudos(d.embudos, '🧩 Cada embudo') : '';

  return `${selectorProductos(d, '')}${calc}${aviso}${d.pocos ? '<p class="ng-aviso suave">🌱 Aún hay pocas ventas: tómate estas cifras como orientativas hasta que haya más histórico.</p>' : ''}${kpis}${recos}${calidadHtml(d.calidad)}${tarjetasProductos(d)}${ciclo}${recompra}${segundaHtml(d.recompra)}${actividad}${embudos}`;
}

// La tabla de embudos (general y en la ficha de un producto).
function tablaEmbudos(lista, titulo) {
  const fila = (e) => `<tr data-ng-embudo="${esc(e.id)}" class="${e.pierde ? 'pierde' : e.mejor ? 'mejor' : ''}">
    <td><span class="ng-emb">${TIPO_ICO[e.tipo] || '•'} <strong>${esc(e.nombre)}</strong>${e.mejor ? ' <span title="El que mejor ROAS da">🏆</span>' : ''}${e.pierde ? ' <span title="Pierde dinero: vuelve menos de lo que se invierte">⚠️</span>' : ''}</span><small class="muted">${e.activo ? '● Activo' : 'Parado'}</small></td>
    <td class="num">${e.registros ? num(e.registros) : '–'}</td><td class="num">${num(e.ventas)}</td><td class="num">${e.sinPrecios ? '<span title="Faltan los precios en su configuración">💶 sin precio</span>' : eur(e.facturacion)}</td>
    <td class="num">${eur(e.cpl)}</td><td class="num">${x1(e.roas)}</td><td class="num">${e.registros ? pct(e.conversion) : '–'}</td>
    <td class="num">${e.tendencia == null ? '–' : `<span class="ng-tend ${e.tendencia >= 0 ? 'up' : 'down'}" title="ROAS del último ${e.tipo === 'lanzamientos' ? 'lanzamiento frente al anterior' : 'trimestre frente al anterior'}">${e.tendencia >= 0 ? '▲' : '▼'} ${Math.round(Math.abs(e.tendencia) * 100)} %</span>`}</td></tr>`;
  return `<section class="ng-sec card"><h3>${titulo}</h3><div class="table-scroll"><table class="metric-table ng-tabla">
    <thead><tr><th>Embudo</th><th class="num">Registros</th><th class="num">Ventas</th><th class="num">Facturación</th><th class="num">Coste por lead</th><th class="num">ROAS</th><th class="num">Conversión</th><th class="num">Tendencia</th></tr></thead>
    <tbody>${lista.map(fila).join('')}</tbody></table></div><p class="muted small">Pulsa un embudo para abrirlo. 🏆 el que mejor ROAS da · ⚠️ vuelve menos de lo que se invierte.</p></section>`;
}

// El ciclo de compra (de todo el negocio o de un producto): cuántos días pasan del registro a la compra, por tramos,
// y, en los lanzamientos, en qué momento del carrito se compra.
function cicloHtml(c, titulo) {
  if (!c) return '';
  const totT = c.tramos.reduce((t, x) => t + x.n, 0) || 1;
  const maxT = Math.max(1, ...c.tramos.map((t) => t.n));
  const totM = c.momentos.reduce((t, m) => t + m.n, 0);
  const dias = (x) => (x == null ? '–' : x === 0 ? 'El mismo día' : `${num(x)} ${Math.round(x) === 1 ? 'día' : 'días'}`);
  return `<section class="ng-sec card ng-ciclo"><h3>${titulo} ${pocos(c.pocos)}</h3>
    ${c.n ? `<div class="ng-cifras">
        <div class="ng-cifra destaca"><strong>${dias(c.mediana)}</strong><span>lo normal, del registro a la compra</span></div>
        <div class="ng-cifra"><strong>${c.media == null ? '–' : c.media < 0.5 ? 'Menos de 1 día' : `${c.media.toFixed(1).replace('.', ',').replace(',0', '')} días`}</strong><span>de media</span></div>
        <div class="ng-cifra"><strong>${pct(c.semana)}</strong><span>compra en la primera semana</span></div>
        <div class="ng-cifra"><strong>${pct(c.mismoDia)}</strong><span>compra el mismo día</span></div>
      </div>
    <div class="ng-barras">${c.tramos.map((t) => `<div class="ng-barra-f"><span>${esc(t.label)}</span><span class="ng-barra"><i style="width:${Math.round((t.n / maxT) * 100)}%"></i></span><b>${num(t.n)} <small>${pct(t.n / totT)}</small></b></div>`).join('')}</div>
    <p class="muted small">Con ${num(c.n)} compras${c.cobertura != null && c.cobertura < 0.9 ? ` (el ${pct(c.cobertura)}, las que tienen fecha de compra). Para que sea exacto, guarda la fecha de compra en un campo de GHL desde el workflow de compra` : ''}.</p>`
    : '<p class="muted">Aparece cuando las compras tengan fecha (un campo de fecha de compra en GHL, puesto por el workflow de compra).</p>'}
    ${totM ? `<h4>¿Cuándo compran en tus lanzamientos?</h4><div class="ng-momentos">${c.momentos.map((m) => `<div><strong>${pct(m.n / totM)}</strong><span>${esc(m.label)}</span></div>`).join('')}</div>` : ''}
  </section>`;
}

// Del primer producto al siguiente: cuánto tardan (lo normal, la media y por tramos) y cómo acortarlo.
function sugerenciasSegunda(dias, pctRepite, siguiente = '') {
  const s = [];
  const p = siguiente ? `«${esc(siguiente)}»` : 'el siguiente producto';
  if (dias != null && dias > 90) s.push(['🪜', 'Pon un paso intermedio', `Tardan ${num(dias)} días: entre medias, ofrece algo pequeño (un taller, la comunidad, un reto) para que no se enfríen.`]);
  s.push(['🎁', 'Oferta solo para compradores, con fecha límite', `En los primeros 7 días tras comprar, ${p} con un precio o un bonus que solo tienen ellos.`]);
  s.push(['📄', 'Ofrécelo en la página de gracias y en el email de bienvenida', 'Es cuando más ganas tienen: un botón «Siguiente paso» en la página de gracias y en el primer email.']);
  s.push(['💬', 'WhatsApp a mitad de camino', `${dias ? `Hacia el día ${Math.max(3, Math.round(dias / 2))}` : 'A la semana'}, pregunta qué tal le va y cuéntale cómo seguir con ${p}.`]);
  if (pctRepite != null && pctRepite < 0.1) s.push(['🎟️', 'Acceso anticipado al próximo lanzamiento', 'Invita a tus compradores antes que a nadie (con un precio de cliente): vuelven más.']);
  return s.slice(0, 4);
}
function segundaHtml(r, { titulo = '⏩ De la primera compra a la siguiente', siguiente = '' } = {}) {
  if (!r) return '';
  const maxT = Math.max(1, ...(r.tramosSegunda || []).map((t) => t.n));
  const dias = (x) => (x == null ? '–' : `${num(x)} ${Math.round(x) === 1 ? 'día' : 'días'}`);
  return `<section class="ng-sec card ng-segunda"><h3>${titulo}</h3>
    ${r.nSegunda ? `<div class="ng-cifras">
        <div class="ng-cifra destaca"><strong>${dias(r.diasSegunda)}</strong><span>tardan normalmente en comprar otro producto</span></div>
        ${r.mediaSegunda != null ? `<div class="ng-cifra"><strong>${dias(r.mediaSegunda)}</strong><span>de media</span></div>` : ''}
        <div class="ng-cifra"><strong>${pct(r.pct)}</strong><span>compra un segundo producto</span></div>
        <div class="ng-cifra"><strong>${num(r.nSegunda)}</strong><span>clientes que lo han hecho</span></div>
      </div>
      <div class="ng-barras">${(r.tramosSegunda || []).map((t) => `<div class="ng-barra-f"><span>${esc(t.label)}</span><span class="ng-barra"><i style="width:${Math.round((t.n / maxT) * 100)}%"></i></span><b>${num(t.n)}</b></div>`).join('')}</div>`
      : '<p class="muted">Aún no hay clientes con dos compras de productos distintos (con fecha). Mientras, esto ayuda a que llegue la segunda:</p>'}
    <h4>🚀 Cómo acortarlo</h4>
    <div class="ng-sugs">${sugerenciasSegunda(r.diasSegunda, r.pct, siguiente).map(([i, t, x]) => `<div class="ng-sug"><span aria-hidden="true">${i}</span><div><strong>${esc(t)}</strong><p>${x}</p></div></div>`).join('')}</div>
  </section>`;
}
