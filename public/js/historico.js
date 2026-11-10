// 🗂️ Histórico de lanzamientos: la tabla para comparar todos los lanzamientos (de todos los embudos) fase a fase.
// Columnas: cada lanzamiento; filas: el embudo en orden (lanzamiento → captación → calentamiento → directo → venta → economía).
// En cada fila se marca el mejor lanzamiento y, en cada celda, cuánto cambia frente al lanzamiento anterior.
// Lo usan el navegador (app.js) y los tests.

const div = (a, b) => (a != null && b ? a / b : null);
const F = (f) => f.fases || {};
const E = (f) => f.eco || {};
const dias = (a, b) => (a && b ? Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000) : null);

// fmt: n (número), eur, pct (0–1), x (ROAS), dia (fecha), txt. mejor: 'mas' | 'menos' | null. sub: el % que acompaña.
export const SECCIONES_HISTORICO = [
  { id: 'lanz', ico: '📅', titulo: 'El lanzamiento', filas: [
    { id: 'embudo', label: 'Embudo', fmt: 'txt', v: (f) => f.embudoNombre || '' },
    { id: 'formato', label: 'Formato', fmt: 'txt', v: (f) => f.formato || '' },
    { id: 'inicio', label: 'Abre la captación', fmt: 'dia', v: (f) => f.fechas?.inicio || '' },
    { id: 'directo', label: 'Directo', fmt: 'dia', v: (f) => f.fechas?.directo || '' },
    { id: 'cierre', label: 'Cierre del carrito', fmt: 'dia', v: (f) => f.fechas?.cierre || '' },
    { id: 'diasCapt', label: 'Días de captación', fmt: 'n', v: (f) => dias(f.fechas?.inicio, f.fechas?.directo) },
  ] },
  { id: 'capt', ico: '📣', titulo: 'Captación', filas: [
    { id: 'inversion', label: 'Inversión en anuncios', fmt: 'eur', v: (f) => E(f).inversion ?? null },
    { id: 'registros', label: 'Registros', fmt: 'n', mejor: 'mas', barra: true, v: (f) => F(f).registros ?? null },
    { id: 'cpl', label: 'Coste por registro', fmt: 'eur', mejor: 'menos', v: (f) => E(f).cpl ?? null },
    { id: 'frio', label: 'Tráfico frío', fmt: 'n', v: (f) => F(f).frio ?? null, sub: (f) => div(F(f).frio, F(f).registros), subTxt: 'de los registros' },
    { id: 'templado', label: 'Tráfico templado (ya en tu lista)', fmt: 'n', v: (f) => F(f).templado ?? null, sub: (f) => div(F(f).templado, F(f).registros), subTxt: 'de los registros' },
  ] },
  { id: 'cal', ico: '🔥', titulo: 'Calentamiento', filas: [
    { id: 'encuesta', label: 'Responden la encuesta', fmt: 'n', v: (f) => F(f).encuesta ?? null, sub: (f) => div(F(f).encuesta, F(f).registros), mejorSub: 'mas' },
    { id: 'vip', label: 'Compran la VIP', fmt: 'n', mejor: 'mas', barra: true, v: (f) => F(f).vip ?? null, sub: (f) => div(F(f).vip, F(f).registros), mejorSub: 'mas' },
    { id: 'cpVip', label: 'Coste por VIP', fmt: 'eur', mejor: 'menos', v: (f) => E(f).cpVip ?? null },
    { id: 'clase1', label: 'Ven la clase 1', fmt: 'n', barra: true, v: (f) => F(f).clase1 ?? null, sub: (f) => div(F(f).clase1, F(f).registros), mejorSub: 'mas' },
    { id: 'clase2', label: 'Ven la clase 2', fmt: 'n', barra: true, v: (f) => F(f).clase2 ?? null, sub: (f) => div(F(f).clase2, F(f).registros), mejorSub: 'mas' },
    { id: 'clase3', label: 'Ven la clase 3', fmt: 'n', barra: true, v: (f) => F(f).clase3 ?? null, sub: (f) => div(F(f).clase3, F(f).registros), mejorSub: 'mas' },
  ] },
  { id: 'dir', ico: '🎥', titulo: 'El directo', filas: [
    { id: 'click', label: 'Pulsan el enlace del directo', fmt: 'n', v: (f) => F(f).click ?? null, sub: (f) => div(F(f).click, F(f).registros), mejorSub: 'mas' },
    { id: 'live', label: 'Entran al directo', fmt: 'n', barra: true, v: (f) => F(f).live ?? null, sub: (f) => div(F(f).live, F(f).registros), mejorSub: 'mas' },
    { id: 'liveFinal', label: 'Se quedan hasta la oferta', fmt: 'n', barra: true, v: (f) => F(f).liveFinal ?? null, sub: (f) => div(F(f).liveFinal, F(f).live), subTxt: 'de los que entran', mejorSub: 'mas' },
    { id: 'replay', label: 'Ven la grabación', fmt: 'n', v: (f) => F(f).replay ?? null, sub: (f) => div(F(f).replay, F(f).registros), mejorSub: 'mas' },
  ] },
  { id: 'venta', ico: '🛒', titulo: 'La venta', filas: [
    { id: 'inicioPago', label: 'Inician el pago', fmt: 'n', v: (f) => F(f).inicioPago || null, sub: (f) => div(F(f).inicioPago || null, F(f).registros), mejorSub: 'mas' },
    { id: 'compra', label: 'Ventas', fmt: 'n', mejor: 'mas', barra: true, v: (f) => F(f).compra ?? null },
    { id: 'convVenta', label: 'Conversión a venta', fmt: 'pct', mejor: 'mas', v: (f) => div(F(f).compra, F(f).registros), ayuda: 'ventas / registros' },
    { id: 'convLive', label: 'Compran de los que entran al directo', fmt: 'pct', mejor: 'mas', v: (f) => div(F(f).compraLive, F(f).live) },
    { id: 'convVip', label: 'Compran de los VIP', fmt: 'pct', mejor: 'mas', v: (f) => div(F(f).compraVip, F(f).vip) },
    { id: 'unico', label: 'Pago único', fmt: 'n', v: (f) => F(f).unico ?? null, sub: (f) => div(F(f).unico, F(f).compra), subTxt: 'de las ventas' },
    { id: 'fraccionado', label: 'Pago fraccionado', fmt: 'n', v: (f) => F(f).fraccionado || null, sub: (f) => div(F(f).fraccionado || null, F(f).compra), subTxt: 'de las ventas' },
  ] },
  { id: 'eco', ico: '💰', titulo: 'Economía', filas: [
    { id: 'facturacion', label: 'Facturación total', fmt: 'eur', mejor: 'mas', barra: true, destacada: true, v: (f) => E(f).facturacion ?? null },
    { id: 'programa', label: 'Del programa', fmt: 'eur', v: (f) => E(f).programa ?? null },
    { id: 'fvip', label: 'De la VIP', fmt: 'eur', v: (f) => E(f).vip ?? null },
    { id: 'bumps', label: 'De los bumps', fmt: 'eur', v: (f) => E(f).bumps ?? null },
    { id: 'entradas', label: 'De las entradas', fmt: 'eur', v: (f) => E(f).entradas ?? null },
    { id: 'ticket', label: 'Ticket medio', fmt: 'eur', mejor: 'mas', v: (f) => E(f).ticket ?? null },
    { id: 'cac', label: 'Coste por venta', fmt: 'eur', mejor: 'menos', v: (f) => E(f).cac ?? null },
    { id: 'roas', label: 'ROAS', fmt: 'x', mejor: 'mas', destacada: true, v: (f) => E(f).roas ?? null },
    { id: 'beneficio', label: 'Beneficio (facturación − inversión)', fmt: 'eur', mejor: 'mas', v: (f) => E(f).beneficio ?? null },
  ] },
];

// Lo que más importa comparar, arriba del todo (el «podio»).
export const PODIO = [
  { fila: 'facturacion', ico: '🏆', titulo: 'Más facturación' },
  { fila: 'roas', ico: '🚀', titulo: 'Mejor ROAS' },
  { fila: 'convVenta', ico: '🎯', titulo: 'Mejor conversión a venta' },
  { fila: 'cpl', ico: '💸', titulo: 'Registro más barato' },
];

const todasFilas = () => SECCIONES_HISTORICO.flatMap((s) => s.filas);
const esNum = (v) => typeof v === 'number' && Number.isFinite(v);

// El índice del mejor valor de una fila (o -1 si no hay con qué comparar).
export function mejorDe(valores, mejor) {
  if (!mejor) return -1;
  const ok = valores.map((v, i) => [v, i]).filter(([v]) => esNum(v));
  if (ok.length < 2) return -1;
  ok.sort((a, b) => (mejor === 'mas' ? b[0] - a[0] : a[0] - b[0]));
  return ok[0][0] === ok[1][0] ? -1 : ok[0][1];
}

// Cambio frente al anterior (relativo; en porcentajes, en puntos).
export function cambio(actual, anterior, fmt) {
  if (!esNum(actual) || !esNum(anterior)) return null;
  if (fmt === 'pct') return { puntos: (actual - anterior) * 100 };
  if (!anterior) return null;
  return { rel: (actual - anterior) / Math.abs(anterior) };
}

const nf = (n, d = 0) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' });
export function formato(v, fmt) {
  if (v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) return '–';
  if (fmt === 'txt') return String(v);
  if (fmt === 'dia') { const d = new Date(`${v}T12:00:00Z`); return Number.isNaN(d) ? String(v) : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }); }
  if (fmt === 'eur') return `${nf(v, Math.abs(v) >= 100 ? 0 : 2)} €`;
  if (fmt === 'pct') return `${nf(v * 100, v * 100 >= 10 ? 1 : 2)} %`;
  if (fmt === 'x') return `${nf(v, 2)}x`;
  return nf(v);
}
const pctTxt = (p) => (p == null ? '' : `${nf(p * 100, p * 100 >= 10 ? 0 : 1)} %`);

// Lanzamientos visibles con el filtro (embudo y los que se han quitado) y en el orden elegido.
export function lanzamientosVisibles(d, { embudo = '', ocultos = new Set(), orden = 'recientes' } = {}) {
  const lista = (d.lanzamientos || []).filter((f) => (!embudo || f.embudo === embudo) && !ocultos.has(f.code));
  const ord = [...lista].sort((a, b) => String(b.fechas?.inicio || '').localeCompare(String(a.fechas?.inicio || '')));
  return orden === 'antiguos' ? ord.reverse() : ord;
}

const ESTADO = { captacion: ['📥', 'Captando'], carrito: ['🛒', 'Carrito abierto'], cerrado: ['✅', 'Cerrado'] };

// `esc`: el escapado de HTML del navegador.
export function historicoHtml(d, { embudo = '', ocultos = new Set(), orden = 'recientes', esc = (s) => String(s) } = {}) {
  const todos = d.lanzamientos || [];
  if (!todos.length) return '<div class="card empty hl-vacio"><h3>🗂️ Aún no hay lanzamientos</h3><p class="muted">Cuando empiece la captación del primero, aparecerá aquí con todo su embudo.</p></div>';
  const cols = lanzamientosVisibles(d, { embudo, ocultos, orden });
  const listos = cols.filter((f) => !f.pendiente && !f.error);
  // El «anterior» de cada columna es el lanzamiento que empezó justo antes (sea cual sea el orden de la tabla).
  const cronologico = [...listos].sort((a, b) => String(a.fechas?.inicio || '').localeCompare(String(b.fechas?.inicio || '')));
  const anteriorDe = new Map(cronologico.map((f, i) => [f.code, cronologico[i - 1] || null]));

  // Podio
  const podio = PODIO.map((p) => {
    const fila = todasFilas().find((x) => x.id === p.fila);
    const vals = listos.map((f) => fila.v(f));
    // En el podio siempre hay uno (si empatan, el más reciente).
    const ok = vals.map((v, i) => [v, i]).filter(([v]) => esNum(v)).sort((a, b) => (fila.mejor === 'mas' ? b[0] - a[0] : a[0] - b[0]) || String(listos[b[1]].fechas?.inicio || '').localeCompare(String(listos[a[1]].fechas?.inicio || '')));
    if (!ok.length || (fila.mejor === 'mas' && !ok[0][0])) return ''; // nada que celebrar con un 0
    const unico = ok[0][1];
    const f = listos[unico];
    return `<div class="hl-podio-c" data-hl-fila="${p.fila}"><span class="hl-podio-ico" aria-hidden="true">${p.ico}</span><span class="hl-podio-t">${esc(p.titulo)}</span><strong>${esc(formato(vals[unico], fila.fmt))}</strong><span class="hl-podio-l">${esc(f.nombre)}</span></div>`;
  }).join('');

  // Chips: embudos y lanzamientos (pulsar uno lo quita o lo vuelve a poner en la comparativa)
  const embs = d.embudos || [];
  const chipsEmb = embs.length > 1 ? `<div class="hl-chips" role="group" aria-label="Embudo"><button type="button" class="hl-chip${!embudo ? ' on' : ''}" data-hl-embudo="">Todos los embudos</button>${embs.map((e) => `<button type="button" class="hl-chip${embudo === e.id ? ' on' : ''}" data-hl-embudo="${esc(e.id)}">🚀 ${esc(e.nombre)}</button>`).join('')}</div>` : '';
  const chipsLanz = `<div class="hl-chips hl-chips-l" role="group" aria-label="Lanzamientos que comparar">${todos.filter((f) => !embudo || f.embudo === embudo).map((f) => `<button type="button" class="hl-chip hl-chip-l${ocultos.has(f.code) ? '' : ' on'}" data-hl-lanz="${esc(f.code)}" aria-pressed="${!ocultos.has(f.code)}">${ocultos.has(f.code) ? '＋' : '✓'} ${esc(f.nombre)}</button>`).join('')}</div>`;

  const cab = cols.map((f) => {
    const [ico, txt] = ESTADO[f.estado] || ['', ''];
    // El nombre, abajo del todo: al bajar por la tabla, la cabecera fija siempre lo enseña.
    return `<th scope="col" class="hl-col${f.pendiente ? ' pend' : ''}"><div class="hl-col-cab">
      <span class="hl-col-meta">${f.pendiente ? '<span class="hl-calc"><span class="hl-spin" aria-hidden="true"></span> Calculando…</span>' : f.error ? `<span class="hl-err" title="${esc(f.error)}">⚠️ No se pudo calcular</span>` : `<button type="button" class="hl-act" data-hl-fresh="${esc(f.code)}" title="Volver a calcular este lanzamiento con los datos de ahora" aria-label="Actualizar ${esc(f.nombre)}">↻</button>`}${f.embudoNombre && embs.length > 1 ? `<span class="hl-col-emb">${esc(f.embudoNombre)}</span>` : ''}${txt ? `<span class="hl-estado hl-estado-${esc(f.estado)}">${ico} ${txt}</span>` : ''}</span>
      ${f.parcial ? '<span class="hl-err" title="Hay más registros de los que se pueden descargar de una vez">Cifras de una parte de los registros</span>' : ''}
      <strong>${esc(f.nombre)}</strong></div></th>`;
  }).join('');

  const cuerpo = SECCIONES_HISTORICO.map((s) => {
    const filas = s.filas.map((fila) => {
      const vals = cols.map((f) => (f.pendiente || f.error ? null : fila.v(f)));
      if (vals.every((v) => v == null || v === '')) return '';
      const iMejor = mejorDe(vals, fila.mejor);
      const subs = fila.sub ? cols.map((f) => (f.pendiente || f.error ? null : fila.sub(f))) : [];
      const iMejorSub = fila.sub && !fila.mejor ? mejorDe(subs, fila.mejorSub) : -1;
      const max = fila.barra ? Math.max(...vals.filter(esNum), 0) : 0;
      const celdas = cols.map((f, i) => {
        const v = vals[i];
        if (f.pendiente) return '<td class="hl-c pend"><span class="hl-skel"></span></td>';
        const ant = anteriorDe.get(f.code);
        const c = fila.fmt !== 'txt' && fila.fmt !== 'dia' && ant ? cambio(v, fila.v(ant), fila.fmt) : null;
        let delta = '';
        if (c) {
          const n = c.puntos ?? c.rel * 100;
          if (Math.abs(n) >= 0.5) {
            const bueno = !fila.mejor ? null : (fila.mejor === 'mas') === n > 0;
            delta = `<span class="hl-delta${bueno === true ? ' bien' : bueno === false ? ' mal' : ''}" title="Frente a ${esc(ant.nombre)}">${n > 0 ? '▲' : '▼'} ${c.puntos != null ? `${nf(Math.abs(n), 1)} pts` : `${nf(Math.abs(n))} %`}</span>`;
          }
        }
        const sub = fila.sub && subs[i] != null ? `<span class="hl-sub${i === iMejorSub ? ' top' : ''}">${pctTxt(subs[i])}${fila.subTxt ? ` ${esc(fila.subTxt)}` : ''}</span>` : '';
        const barra = fila.barra && esNum(v) && max ? `<span class="hl-barra" aria-hidden="true"><span style="width:${Math.max(3, Math.round((v / max) * 100))}%"></span></span>` : '';
        const top = i === iMejor;
        return `<td class="hl-c${top ? ' top' : ''}${fila.fmt === 'txt' || fila.fmt === 'dia' ? ' hl-c-txt' : ''}"><span class="hl-v">${top ? '<span class="hl-corona" aria-label="El mejor">👑</span>' : ''}${esc(formato(v, fila.fmt))}</span>${sub}${delta}${barra}</td>`;
      }).join('');
      return `<tr class="${fila.destacada ? 'hl-dest' : ''}"><th scope="row" class="hl-f">${esc(fila.label)}${fila.ayuda ? `<small>${esc(fila.ayuda)}</small>` : ''}</th>${celdas}</tr>`;
    }).join('');
    return filas ? `<tbody class="hl-sec hl-sec-${s.id}"><tr class="hl-sec-t"><th scope="rowgroup" colspan="${cols.length + 1}"><span aria-hidden="true">${s.ico}</span> ${esc(s.titulo)}</th></tr>${filas}</tbody>` : '';
  }).join('');

  const pend = d.pendientes ? `<p class="hl-progreso"><span class="hl-spin" aria-hidden="true"></span> Calculando ${d.pendientes} ${d.pendientes === 1 ? 'lanzamiento' : 'lanzamientos'} (uno a uno, con todos sus registros)…</p>` : '';
  return `${pend}${podio ? `<div class="hl-podio">${podio}</div>` : ''}
    <div class="hl-filtros">${chipsEmb}
      <div class="hl-filtros-fila">${chipsLanz}
        <label class="hl-orden"><span class="sr-only">Orden</span><select data-hl-orden><option value="recientes"${orden === 'recientes' ? ' selected' : ''}>Más recientes primero</option><option value="antiguos"${orden === 'antiguos' ? ' selected' : ''}>Más antiguos primero</option></select></label>
      </div>
    </div>
    ${cols.length ? `<div class="hl-tabla-w"><table class="hl-tabla"><thead><tr><th scope="col" class="hl-esq">Fase del embudo</th>${cab}</tr></thead>${cuerpo}</table></div>
    <p class="muted small hl-nota">👑 el mejor de cada fila · ▲▼ frente al lanzamiento anterior (en verde si mejora) · las mismas cifras que Métricas, solo con los registros de cada lanzamiento.</p>`
    : '<div class="card empty"><p class="muted">Elige al menos un lanzamiento para comparar.</p></div>'}`;
}
