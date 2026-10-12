// Movimiento del dashboard: discreto y solo cuando aporta.
//   · Al entrar en una vista (o subpestaña), sus tarjetas aparecen escalonadas, las barras crecen y lo que está más
//     abajo aparece al llegar con el scroll. Fuera de ese momento (refrescos automáticos, escribir en un campo…)
//     no se anima nada, para que no parpadee.
//   · Las cifras grandes (KPI) cuentan hasta su valor la primera vez y cuando cambian.
//   · Botones con onda al pulsar.
// Con «reducir movimiento» del sistema no se hace nada de esto.
const REDUCIR = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const VENTANA = 1400; // ms tras entrar en una vista en los que lo nuevo se anima
const TARJETAS = '.card, .kpi, .notice, .inicio-emb, .hoy-item, .em-dia, .cfg-sec, .tit-var, .gw-dia, .tf-sub, .av-card, .ie-sec, .cfg-pend, .ag-cli, .ag-hero';
const BARRAS = '.ag-barra > span, .funnel-bar > span, .obj-bar > span, .enc-op-bar > span, .gan-bar > *, .vm-paso-bar > *, .tf-bar > *, .of-barra > *, .mi-barra > *, .ficha-score-bar > *, .split-bar > *';
const BARRAS_V = '.dd-bar';
const MAX_ESCALON = 10;

let entradaHasta = 0;
const enVentana = () => performance.now() < entradaHasta;
const abrirVentana = () => { entradaHasta = performance.now() + VENTANA; };

// Lo que está por debajo de la pantalla se anima al llegar a ello (también si se salta con un scroll rápido).
const pendientes = new Set();
let revisando = 0;
function revisarPendientes() {
  revisando = 0;
  const limite = innerHeight - 40;
  for (const el of pendientes) {
    if (!el.isConnected) { pendientes.delete(el); continue; }
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue; // en una pestaña oculta: cuando se vea
    if (r.top < limite) { pendientes.delete(el); el.classList.remove('anim-espera'); el.classList.add('anim-in'); }
  }
}
const programarRevision = () => { if (!revisando && pendientes.size) revisando = requestAnimationFrame(revisarPendientes); };

function animarTarjetas(raiz) {
  const nuevas = [...(raiz.matches?.(TARJETAS) ? [raiz] : []), ...raiz.querySelectorAll(TARJETAS)]
    .filter((el) => !el.closest('dialog') && !el.classList.contains('anim-in'));
  const alto = innerHeight;
  let i = 0;
  for (const el of nuevas) {
    // Solo el primer nivel de tarjetas: las de dentro de otra que ya se anima, no (sería un baile).
    if (el.parentElement?.closest(TARJETAS) && nuevas.includes(el.parentElement.closest(TARJETAS))) continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    el.style.setProperty('--anim-i', String(Math.min(i++, MAX_ESCALON)));
    if (r.top > alto) { el.classList.add('anim-espera'); pendientes.add(el); } else el.classList.add('anim-in');
  }
  for (const b of raiz.querySelectorAll(BARRAS)) b.classList.add('anim-barra');
  for (const b of raiz.querySelectorAll(BARRAS_V)) b.classList.add('anim-barra-v');
}

// ---------- Cifras que cuentan ----------
// «1.850», «5671 €», «3,78x», «0,81 €», «11,1 %», «7.9%»: el primer número del texto, con su formato.
const NUM_RE = /-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:[.,]\d+)?/;
function leerNumero(txt) {
  const m = txt.match(NUM_RE);
  if (!m) return null;
  const s = m[0];
  let dec = 0; let miles = false; let coma = true; let v;
  if (/^\-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) { miles = true; dec = (s.split(',')[1] || '').length; v = Number(s.replace(/\./g, '').replace(',', '.')); }
  else if (s.includes(',')) { dec = s.split(',')[1].length; v = Number(s.replace(',', '.')); }
  else if (s.includes('.')) { coma = false; dec = s.split('.')[1].length; v = Number(s); }
  else v = Number(s);
  if (!Number.isFinite(v)) return null;
  return { v, dec, miles, coma, antes: txt.slice(0, m.index), despues: txt.slice(m.index + s.length) };
}
function escribirNumero(n, f) {
  let s = Math.abs(n).toFixed(f.dec);
  let [ent, frac] = s.split('.');
  if (f.miles) ent = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  s = frac ? `${ent}${f.coma ? ',' : '.'}${frac}` : ent;
  return `${f.antes}${n < 0 ? '-' : ''}${s}${f.despues}`;
}
const ultimos = new Map(); // etiqueta del KPI → último valor mostrado
function contar(el) {
  const kpi = el.closest('.kpi');
  const clave = `${location.hash}|${kpi?.querySelector('.kpi-label')?.textContent.trim() || ''}|${el.closest('section[id^="view-"]')?.id || ''}`;
  const nodo = [...el.childNodes].find((n) => n.nodeType === 3 && NUM_RE.test(n.data));
  if (!nodo) return;
  const final = nodo.data;
  const f = leerNumero(final);
  if (!f) return;
  const previo = ultimos.get(clave);
  ultimos.set(clave, f.v);
  if (previo === f.v || Math.abs(f.v) < 1 && previo == null && f.dec === 0) return;
  const desde = previo ?? 0;
  const ini = performance.now();
  const dur = 700;
  const paso = (t) => {
    if (!nodo.isConnected || nodo.data !== el._animTxt) return;
    const p = Math.min(1, (t - ini) / dur);
    const e = 1 - (1 - p) ** 3;
    el._animTxt = nodo.data = p < 1 ? escribirNumero(desde + (f.v - desde) * e, f) : final;
    if (p < 1) requestAnimationFrame(paso);
  };
  el._animTxt = nodo.data = escribirNumero(desde, f);
  if (previo != null) el.classList.add('anim-cambio');
  requestAnimationFrame(paso);
  setTimeout(() => el.classList.remove('anim-cambio'), 1200);
}

// ---------- Onda al pulsar ----------
function onda(e) {
  const b = e.target.closest('.btn, .tb-btn, .em-fase, .hoy-chip, .hoy-temp, .subview-tab');
  if (!b || b.disabled) return;
  const r = b.getBoundingClientRect();
  const o = document.createElement('span');
  o.className = 'anim-onda';
  const d = Math.max(r.width, r.height) * 2;
  o.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
  b.classList.add('anim-con-onda');
  b.appendChild(o);
  setTimeout(() => o.remove(), 650);
}

export function iniciarAnimaciones(raiz = document.querySelector('#app') || document.body) {
  if (REDUCIR || !raiz || raiz._animado) return;
  raiz._animado = true;
  document.documentElement.classList.add('con-anim');
  abrirVentana();
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      // Se enseña una vista, una subpestaña de Métricas o un apartado: se abre la ventana de animación.
      if (m.type === 'attributes') {
        const t = m.target;
        if (!t.hidden && (t.matches('section[id^="view-"], [data-msub], .tab-panel, .subviews'))) { abrirVentana(); animarTarjetas(t); programarRevision(); }
        continue;
      }
      // Cuando llegan los datos (se quita un «Cargando…»), lo que se pinta también entra con movimiento.
      for (const n of m.removedNodes) if (n.textContent?.includes('Cargando')) { abrirVentana(); break; }
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (enVentana()) animarTarjetas(n);
        if (n.matches?.('.kpi-value')) contar(n);
        for (const k of n.querySelectorAll?.('.kpi-value') || []) contar(k);
      }
    }
  });
  mo.observe(raiz, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('pointerdown', onda, { passive: true });
  addEventListener('scroll', programarRevision, { passive: true, capture: true });
  addEventListener('resize', programarRevision, { passive: true });
  // Cambiar de embudo en la barra lateral o volver al Inicio también es «entrar».
  document.addEventListener('click', (e) => { if (e.target.closest('#sb-items [data-embudo], #sb-inicio, .view-tab, .subview-tab, [data-msub-btn]')) abrirVentana(); }, true);
  requestAnimationFrame(() => animarTarjetas(raiz));
}
