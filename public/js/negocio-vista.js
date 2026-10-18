// Inteligencia de negocio: el HTML de la pestaña (dashboard y portal del cliente), a partir de GET /api/negocio.
//   negocioHtml(d, { periodo, cargando }) → texto HTML
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

export function negocioHtml(d) {
  if (!d || d.vacio) return negocioVacio(d);
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
    ${tarjeta('⚖️', 'LTV ÷ CAC', n.ltvCac == null ? '–' : x1(n.ltvCac), `<small class="${n.ltvCac >= 3 ? 'ng-bien' : n.ltvCac != null && n.ltvCac < 1.5 ? 'ng-mal' : ''}">${n.ltvCac == null ? 'Hace falta inversión y precios' : n.ltvCac >= 3 ? 'Sano: puedes invertir más' : n.ltvCac < 1.5 ? 'Ajustado: sube el valor o baja el coste' : 'Bien: vigila el coste por cliente'}</small>`, 'Cuántas veces recuperas lo que cuesta conseguir un cliente. A partir de 3 es sano')}
  </div>`;

  const recos = d.recomendaciones?.length ? `<section class="ng-sec"><h3>🧭 Qué haría ahora para facturar más</h3><div class="ng-recos">${d.recomendaciones.map((r) => `<div class="ng-reco"><span class="ng-reco-ico" aria-hidden="true">${esc(r.ico)}</span><div><strong>${esc(r.titulo)}</strong><p>${esc(r.texto)}</p></div></div>`).join('')}</div></section>` : '';

  const c = d.ciclo;
  const maxT = Math.max(1, ...c.tramos.map((t) => t.n));
  const totM = c.momentos.reduce((t, m) => t + m.n, 0);
  const ciclo = `<section class="ng-sec card"><h3>⏱️ Ciclo de compra ${pocos(c.pocos)}</h3>
    ${c.n ? `<p class="ng-grande"><strong>${c.mediana === 0 ? 'El mismo día' : `${num(c.mediana)} ${c.mediana === 1 ? 'día' : 'días'}`}</strong> <span class="muted">pasan normalmente desde que alguien se registra hasta que compra</span></p>
    <div class="ng-barras">${c.tramos.map((t) => `<div class="ng-barra-f"><span>${esc(t.label)}</span><span class="ng-barra"><i style="width:${Math.round((t.n / maxT) * 100)}%"></i></span><b>${num(t.n)}</b></div>`).join('')}</div>
    ${c.cobertura != null && c.cobertura < 0.9 ? `<p class="muted small">Con ${pct(c.cobertura)} de las compras (las que tienen fecha de compra). Para que sea exacto, guarda la fecha de compra en un campo de GHL desde el workflow de compra.</p>` : ''}`
    : '<p class="muted">Aparece cuando las compras tengan fecha (un campo de fecha de compra en GHL, puesto por el workflow de compra).</p>'}
    ${totM ? `<h4>¿Cuándo compran en tus lanzamientos?</h4><div class="ng-momentos">${c.momentos.map((m) => `<div><strong>${pct(m.n / totM)}</strong><span>${esc(m.label)}</span></div>`).join('')}</div>` : ''}
  </section>`;

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

  const fila = (e) => `<tr data-ng-embudo="${esc(e.id)}" class="${e.pierde ? 'pierde' : e.mejor ? 'mejor' : ''}">
    <td><span class="ng-emb">${TIPO_ICO[e.tipo] || '•'} <strong>${esc(e.nombre)}</strong>${e.mejor ? ' <span title="El que mejor ROAS da">🏆</span>' : ''}${e.pierde ? ' <span title="Pierde dinero: vuelve menos de lo que se invierte">⚠️</span>' : ''}</span><small class="muted">${e.activo ? '● Activo' : 'Parado'}</small></td>
    <td class="num">${e.registros ? num(e.registros) : '–'}</td><td class="num">${num(e.ventas)}</td><td class="num">${e.sinPrecios ? '<span title="Faltan los precios en su configuración">💶 sin precio</span>' : eur(e.facturacion)}</td>
    <td class="num">${eur(e.cpl)}</td><td class="num">${x1(e.roas)}</td><td class="num">${e.registros ? pct(e.conversion) : '–'}</td>
    <td class="num">${e.tendencia == null ? '–' : `<span class="ng-tend ${e.tendencia >= 0 ? 'up' : 'down'}" title="ROAS del último ${e.tipo === 'lanzamientos' ? 'lanzamiento frente al anterior' : 'trimestre frente al anterior'}">${e.tendencia >= 0 ? '▲' : '▼'} ${Math.round(Math.abs(e.tendencia) * 100)} %</span>`}</td></tr>`;
  const embudos = d.embudos.length ? `<section class="ng-sec card"><h3>🧩 Cada embudo</h3><div class="table-scroll"><table class="metric-table ng-tabla">
    <thead><tr><th>Embudo</th><th class="num">Registros</th><th class="num">Ventas</th><th class="num">Facturación</th><th class="num">Coste por lead</th><th class="num">ROAS</th><th class="num">Conversión</th><th class="num">Tendencia</th></tr></thead>
    <tbody>${d.embudos.map(fila).join('')}</tbody></table></div><p class="muted small">Pulsa un embudo para abrirlo. 🏆 el que mejor ROAS da · ⚠️ vuelve menos de lo que se invierte.</p></section>` : '';

  return `${calc}${aviso}${d.pocos ? '<p class="ng-aviso suave">🌱 Aún hay pocas ventas: tómate estas cifras como orientativas hasta que haya más histórico.</p>' : ''}${kpis}${recos}<div class="ng-dos">${ciclo}${recompra}</div>${actividad}${embudos}`;
}
