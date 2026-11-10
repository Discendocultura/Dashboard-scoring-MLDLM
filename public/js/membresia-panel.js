// Panel de la membresía de Skool (Configuración → 🎓 Membresía), en el navegador:
//  · «Actualizar alumnos»: abre la página de Miembros de Skool y, con el marcador «AlquimIA · Skool» (skool-lector.js),
//    los miembros vuelven aquí. Antes de guardar se ve qué es cada dato y qué cambia (altas, bajas, cambios de plan).
//  · Cifras de negocio: MRR, ARR, ARPU, churn de 30 días (total y por plan), MRR perdido, LTV medio y esperado, vida
//    media, antigüedad, más activos, en riesgo y bajas recientes.
//  · Etiquetas de GHL por plan (y de baja): se sincronizan desde aquí y disparan los flujos de GHL (venta cruzada…).
//  · Alumnos, como una pestaña de setter: segmentos, búsqueda, y a cada uno WhatsApp o email (desde GHL).
import { CAMPOS, clavesDe, adivinarMapa, normalizar, metricasMembresia, tagDePlan, etiquetasPendientes, SEGMENTOS, rellenar, waDe, precioMes, EMAIL_RE } from './membresia.js';
import { enlaceLector, esDatosSkool, ORIGEN_SKOOL } from './skool-lector.js';

const DIA = 86_400_000;
const eur = (n) => (n == null || !Number.isFinite(n) ? '–' : n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2 }));
const pct = (x) => (x == null || !Number.isFinite(x) ? '–' : `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`);
const num = (n) => (n == null || !Number.isFinite(n) ? '–' : n.toLocaleString('es-ES'));
const fecha = (t) => (t ? new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' }) : '–');
function hace(t, ahora = Date.now()) {
  if (!t) return '–';
  const d = Math.floor((ahora - t) / DIA);
  if (d <= 0) return 'hoy';
  if (d === 1) return 'ayer';
  if (d < 31) return `hace ${d} días`;
  const m = Math.round(d / 30.44);
  return m < 12 ? `hace ${m} ${m === 1 ? 'mes' : 'meses'}` : `hace ${Math.round(m / 12)} ${Math.round(m / 12) === 1 ? 'año' : 'años'}`;
}
const antig = (t, ahora = Date.now()) => { if (!t) return '–'; const m = (ahora - t) / (30.44 * DIA); return m < 1 ? `${Math.max(1, Math.round((ahora - t) / DIA))} d` : m < 12 ? `${Math.round(m)} m` : `${(m / 12).toLocaleString('es-ES', { maximumFractionDigits: 1 })} a`; };

export function montarMembresia({ api, esc, notice, progress, ls, puedeConfig, cliente, abrir }) {
  const body = document.getElementById('ms-body');
  const st = { datos: null, cargando: false, vista: ls.get('lsd_ms_vista') || 'resumen', seg: 'todos', plan: '', q: '', importacion: null, skoolTab: null };

  async function cargar() {
    st.cargando = true;
    try { st.datos = await api('/api/membresia'); } catch (e) { notice(e.message, true); st.datos = st.datos || { alumnos: [], eventos: [], cfg: {}, ltvExtra: {} }; }
    st.cargando = false;
    pintar();
  }
  const cfg = () => st.datos?.cfg || {};
  const estado = () => ({ alumnos: Object.fromEntries((st.datos?.alumnos || []).map((a) => [a.email, a])), eventos: st.datos?.eventos || [] });
  const metricas = () => metricasMembresia(estado(), { precios: cfg().precios || {}, ltvExtra: st.datos?.ltvExtra || {} });
  const ltvDe = (a) => Math.round(((a.ltv ?? 0) + (st.datos?.ltvExtra?.[a.email] || 0)) * 100) / 100;

  // ---------- Recibir los datos del lector de Skool ----------
  function recibir(d) {
    if (!esDatosSkool(d)) return notice('Eso no son datos del lector de Skool.', true);
    const mapa = { ...adivinarMapa(d.filas), ...(cfg().mapa || {}) };
    // Un mapa guardado de otra lectura con claves que ya no vienen: se vuelve a adivinar ese dato.
    const claves = new Set(clavesDe(d.filas).map((c) => c.clave));
    const adiv = adivinarMapa(d.filas);
    for (const k of Object.keys(mapa)) if (typeof mapa[k] === 'string' && !claves.has(mapa[k])) { if (adiv[k]) mapa[k] = adiv[k]; else delete mapa[k]; }
    st.importacion = { datos: d, mapa, preview: null, completa: true };
    st.vista = 'importar';
    abrir();
    pintar();
    previsualizar();
  }
  async function previsualizar() {
    const imp = st.importacion;
    if (!imp || !puedeConfig()) return;
    const alumnos = imp.datos.filas.map((f) => normalizar(f, imp.mapa)).filter(Boolean);
    imp.alumnos = alumnos;
    if (!alumnos.length) { imp.preview = null; pintar(); return; }
    try { imp.preview = await api('/api/membresia', { method: 'POST', body: { op: 'foto', alumnos, completa: imp.completa } }); } catch (e) { imp.preview = { error: e.message }; }
    // Por defecto, «trae a todos» solo si no faltan muchos de los activos (una lectura a medias daría de baja a media comunidad).
    if (imp.preview && imp.completa && !imp.tocadoCompleta && imp.preview.activosAntes && imp.preview.bajas > Math.max(5, imp.preview.activosAntes * 0.2)) {
      imp.completa = false;
      imp.aviso = true;
      return previsualizar();
    }
    pintar();
  }
  window.addEventListener('message', (e) => {
    if (!ORIGEN_SKOOL.test(e.origin) || !esDatosSkool(e.data)) return;
    try { e.source?.postMessage({ tipo: 'alquimia-skool-ok' }, e.origin); } catch { /* la pestaña de Skool ya no está */ }
    if (st.importacion?.datos?.at === e.data.at) return; // el lector lo repite hasta que contestamos
    if (e.data.cliente && cliente() && e.data.cliente !== cliente()) return notice('Esos alumnos de Skool son de otro cliente: cambia de cliente y vuelve a pulsar el marcador.', true);
    if (!st.datos) cargar().then(() => recibir(e.data)); else recibir(e.data);
  });

  // ---------- Pintar ----------
  function kpi(label, valor, sub = '', clase = '') {
    return `<div class="ms-kpi ${clase}"><span class="ms-kpi-l">${esc(label)}</span><strong class="ms-kpi-v">${valor}</strong>${sub ? `<span class="ms-kpi-s">${sub}</span>` : ''}</div>`;
  }
  function pestanas() {
    const v = st.vista === 'importar' ? 'resumen' : st.vista;
    const tabs = [['resumen', '📊 Resumen'], ['alumnos', '🎓 Alumnos'], ...(puedeConfig() ? [['planes', '🏷️ Planes y etiquetas']] : [])];
    return `<div class="ms-tabs" role="tablist">${tabs.map(([id, l]) => `<button type="button" role="tab" class="ms-tab${v === id ? ' activa' : ''}" aria-selected="${v === id}" data-ms-vista="${id}">${l}</button>`).join('')}</div>`;
  }
  function barra() {
    const d = st.datos || {};
    const ult = d.ultimaLectura ? `Última lectura de Skool: <strong>${hace(d.ultimaLectura)}</strong> (${fecha(d.ultimaLectura)})` : 'Aún no se ha leído Skool';
    return `<div class="ms-barra"><p class="muted small">${ult}${d.comunidad ? ` · comunidad «${esc(d.comunidad)}»` : ''}</p>
      ${puedeConfig() ? `<div class="ms-barra-bts"><button type="button" class="btn primary" data-ms="actualizar">🔄 Actualizar alumnos</button><button type="button" class="btn" data-ms="pegar">📋 Pegar los datos de Skool</button></div>` : ''}</div>`;
  }
  function guia() {
    const c = cfg();
    const href = enlaceLector(location.origin, cliente() || '');
    return `<details class="ms-guia"${st.datos?.lecturas ? '' : ' open'}><summary><strong>Cómo se leen los alumnos de Skool</strong> <span class="muted small">(Skool no tiene conexión directa: se leen con tu sesión, desde tu navegador)</span></summary>
      <ol>
        <li><strong>Una sola vez:</strong> arrastra este botón a tu barra de marcadores → <a class="ms-marcador" href="${esc(href)}" title="Arrástralo a la barra de marcadores (no lo pulses aquí)" onclick="event.preventDefault()">📥 AlquimIA · Skool</a> <span class="muted small">(si no ves la barra: Ctrl/Cmd + Mayús + B)</span></li>
        <li>Pulsa <strong>🔄 Actualizar alumnos</strong>: se abre la página de <strong>Miembros</strong> de tu comunidad en Skool (con tu sesión de administrador).</li>
        <li>En esa pestaña, pulsa el marcador <strong>📥 AlquimIA · Skool</strong>. Lee todos los miembros, página a página, y los manda aquí. Revisas lo que cambia y guardas.</li>
      </ol>
      <label class="field"><span>Dirección de Miembros de tu comunidad en Skool</span><input id="ms-url" type="url" placeholder="https://www.skool.com/tu-comunidad/-/members" value="${esc(c.urlSkool || '')}"></label>
      <p class="muted small">No se guarda tu contraseña de Skool ni se toca nada allí: solo se lee lo que ves como administrador. Si tu navegador no deja mandar los datos solos, el marcador te da un botón «Copiar» y aquí usas <strong>📋 Pegar los datos de Skool</strong>.</p>
    </details>`;
  }

  function vistaImportar() {
    const imp = st.importacion;
    const d = imp.datos;
    const claves = clavesDe(d.filas);
    const opt = (sel) => `<option value="">— No viene —</option>${claves.map((c) => `<option value="${esc(c.clave)}"${c.clave === sel ? ' selected' : ''}>${esc(c.clave)} · ${esc(c.ejemplos.join(' | ').slice(0, 60))}</option>`).join('')}`;
    const p = imp.preview;
    const muestra = (imp.alumnos || []).slice(0, 5);
    const resumen = !p ? '<p class="muted">Calculando qué cambia…</p>' : p.error ? `<p class="ms-error">${esc(p.error)}</p>` : `
      <div class="ms-kpis ms-kpis-imp">
        ${kpi('Leídos de Skool', num(p.leidos))}
        ${kpi(p.primera ? 'Alumnos de partida' : 'Altas', num(p.altas), p.primera ? 'primera lectura: punto de partida' : '', 'ms-ok')}
        ${p.primera ? '' : kpi('Bajas', num(p.bajas), imp.completa ? 'no salen en Skool o figuran como baja' : 'solo las que Skool marca como baja', p.bajas ? 'ms-mal' : '')}
        ${p.primera ? '' : kpi('Cambian de plan', num(p.cambios))}
        ${p.vuelven ? kpi('Vuelven', num(p.vuelven), '', 'ms-ok') : ''}
      </div>
      ${p.muestra?.cambios?.length ? `<p class="small">Cambios de plan: ${p.muestra.cambios.slice(0, 8).map((c) => `${esc(c.email)} (${esc(c.de)} → ${esc(c.a)})`).join(' · ')}</p>` : ''}
      ${p.muestra?.bajas?.length ? `<p class="small">Bajas: ${p.muestra.bajas.slice(0, 12).map(esc).join(' · ')}${p.bajas > 12 ? '…' : ''}</p>` : ''}`;
    return `<section class="ms-imp">
      <h3>Revisa la lectura de Skool antes de guardarla</h3>
      <p class="muted small">${num(d.filas.length)} miembros leídos en ${num(d.paginas)} ${d.paginas === 1 ? 'página' : 'páginas'} de «${esc(d.comunidad || 'Skool')}». Comprueba que la cifra coincide con la de Skool. Abajo, qué dato de Skool es cada cosa: AlquimIA lo adivina y puedes corregirlo (se recuerda para la próxima vez).</p>
      ${imp.aviso ? '<p class="ms-aviso">⚠️ Faltan muchos de los alumnos activos: puede que la lectura esté a medias (por ejemplo, Skool enseñaba un filtro). Por seguridad, de momento nadie se da de baja por no salir. Si de verdad están todos, marca la casilla.</p>' : ''}
      <label class="ms-check"><input type="checkbox" id="ms-completa"${imp.completa ? ' checked' : ''}><span>Esta lectura trae <strong>a todos los alumnos activos</strong>: quien no salga, se da de baja.</span></label>
      ${resumen}
      <details class="ms-mapa"${imp.alumnos?.length ? '' : ' open'}><summary>Qué dato de Skool es cada cosa</summary>
        <div class="ms-mapa-grid">${CAMPOS.map((c) => `<label class="field"><span>${esc(c.label)}${c.obligatorio ? ' *' : ''}</span><select data-ms-mapa="${c.id}">${opt(imp.mapa[c.id])}</select></label>`).join('')}</div>
        <label class="ms-check"><input type="checkbox" id="ms-centimos"${imp.mapa.centimos ? ' checked' : ''}><span>Los importes vienen en céntimos (2900 = 29 €)</span></label>
      </details>
      ${muestra.length ? `<div class="ms-tabla-wrap"><table class="ms-tabla"><thead><tr><th>Alumno</th><th>Plan</th><th>Precio</th><th>LTV</th><th>Alta</th><th>Puntos</th><th>Última conexión</th></tr></thead><tbody>${muestra.map((a) => `<tr><td>${esc(a.nombre || '–')}<br><span class="muted small">${esc(a.email)}</span></td><td>${esc(a.plan)}</td><td>${a.precio != null ? `${eur(a.precio)}/${a.intervalo}` : '–'}</td><td>${eur(a.ltv)}</td><td>${fecha(a.alta)}</td><td>${num(a.puntos)}</td><td>${hace(a.ultima)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="ms-error">Sin el email no se puede guardar: elige arriba qué dato es el email.</p>'}
      <div class="ms-imp-bts"><button type="button" class="btn primary" data-ms="guardar-foto"${imp.alumnos?.length && p && !p.error ? '' : ' disabled'}>Guardar ${num(imp.alumnos?.length || 0)} alumnos</button><button type="button" class="btn ghost" data-ms="cancelar-foto">Cancelar</button></div>
    </section>`;
  }

  function vistaResumen() {
    const al = st.datos?.alumnos || [];
    if (!al.length) {
      return `<div class="ms-vacio"><span aria-hidden="true">🎓</span><div><strong>Tu membresía de Skool, aquí</strong><p class="muted">Lee tus alumnos de Skool y verás tu MRR, el churn de cada plan, quién está más activo, quién se está enfriando y a quién escribir.${puedeConfig() ? ' Sigue los pasos de arriba.' : ' Pídele a quien configura AlquimIA que lea los alumnos.'}</p></div></div>`;
    }
    const m = metricas();
    const c = cfg();
    const maxAnt = Math.max(1, ...m.antiguedad.map((x) => x.n));
    const pend = etiquetasPendientes(estado(), c);
    const lecturaUnica = (st.datos?.lecturas || 0) < 2;
    const fila = (a, extra) => `<li><button type="button" class="ms-mini" data-ms-ver="${esc(a.email)}"><span class="ms-mini-n">${esc(a.nombre || a.email)}</span><span class="ms-mini-x">${esc(a.plan)} · ${extra}</span></button></li>`;
    return `
      <div class="ms-kpis">
        ${kpi('Alumnos activos', num(m.activos), `${num(m.total - m.activos)} bajas en total`)}
        ${kpi('MRR', eur(m.mrr), `ARR ${eur(m.arr)}`, 'ms-dest')}
        ${kpi('Ingreso medio por alumno', eur(m.arpu), 'al mes (ARPU)')}
        ${kpi(`Churn ${m.ventana} días`, lecturaUnica ? '–' : pct(m.churn), lecturaUnica ? 'sale a partir de la 2.ª lectura' : `${num(m.bajas)} bajas · ${eur(m.mrrPerdido)} de MRR perdido`, m.churn > 0.08 ? 'ms-mal' : '')}
        ${kpi(`Altas ${m.ventana} días`, lecturaUnica ? '–' : num(m.altas), lecturaUnica ? '' : `neto ${m.neto >= 0 ? '+' : ''}${num(m.neto)}`, m.neto >= 0 ? 'ms-ok' : 'ms-mal')}
        ${kpi('LTV medio', eur(m.ltvMedio), `${eur(m.ltvTotal)} cobrado en total`)}
      </div>
      ${m.sinPrecio ? `<p class="ms-aviso">⚠️ ${num(m.sinPrecio)} alumnos activos sin precio: Skool no lo trae para su plan. Ponlo en <button type="button" class="link-btn" data-ms-vista="planes">Planes y etiquetas</button> para que cuenten en el MRR.</p>` : ''}
      <h3 class="ms-h">Por plan</h3>
      <div class="ms-tabla-wrap"><table class="ms-tabla ms-planes"><thead><tr><th>Plan</th><th>Activos</th><th>MRR</th><th>% del MRR</th><th>ARPU</th><th>Altas</th><th>Bajas</th><th>Churn ${m.ventana} d</th><th>LTV medio</th><th>LTV esperado</th><th>Vida media</th><th>Etiqueta GHL</th></tr></thead>
      <tbody>${m.filas.map((f) => `<tr><td><strong>${esc(f.plan)}</strong></td><td>${num(f.activos)}</td><td>${eur(f.mrr)}</td><td><span class="ms-barrita"><span style="width:${m.mrr ? Math.round((f.mrr / m.mrr) * 100) : 0}%"></span></span>${m.mrr ? pct(f.mrr / m.mrr) : '–'}</td><td>${eur(f.arpu)}</td><td>${lecturaUnica ? '–' : num(f.altas)}</td><td>${lecturaUnica ? '–' : num(f.bajas)}</td><td class="${f.churn > 0.08 ? 'ms-mal-t' : ''}">${lecturaUnica ? '–' : pct(f.churn)}</td><td>${eur(f.ltvMedio)}</td><td title="Lo que paga al mes ÷ churn mensual">${f.ltvEsperado != null ? eur(f.ltvEsperado) : '–'}</td><td>${f.vidaMeses ? `${f.vidaMeses.toLocaleString('es-ES')} meses` : '–'}</td><td><code>${esc(tagDePlan(c, f.plan) || '—')}</code></td></tr>`).join('')}</tbody></table></div>
      ${puedeConfig() ? `<div class="ms-sync"><div><strong>Etiquetas de GHL</strong> <span class="muted small">Cada alumno lleva la de su plan (y las bajas, la de baja${c.tagBaja ? ` «${esc(c.tagBaja)}»` : ': ponla en Planes y etiquetas'}). Es lo que dispara tus flujos de GHL.</span></div>${pend.length ? `<button type="button" class="btn primary" data-ms="sincronizar">🏷️ Poner etiquetas a ${num(pend.length)} ${pend.length === 1 ? 'alumno' : 'alumnos'}</button>` : '<span class="ms-ok-t">✅ Todas al día</span>'}</div>` : ''}
      <div class="ms-cols">
        <section class="ms-card"><h3 class="ms-h">Antigüedad de los activos</h3><ul class="ms-barras">${m.antiguedad.map((x) => `<li><span>${esc(x.label)}</span><span class="ms-barrita"><span style="width:${Math.round((x.n / maxAnt) * 100)}%"></span></span><strong>${num(x.n)}</strong></li>`).join('')}</ul></section>
        <section class="ms-card"><h3 class="ms-h">🔥 Más activos</h3>${m.conActividad ? `<ol class="ms-lista">${m.masActivos.map((a) => fila(a, `${num(a.puntos)} pts`)).join('')}</ol>` : '<p class="muted small">Skool no ha traído puntos ni última conexión (elige esos datos al revisar la próxima lectura).</p>'}</section>
        <section class="ms-card"><h3 class="ms-h">⚠️ En riesgo <span class="muted small">sin entrar 14+ días</span></h3>${m.enRiesgo.length ? `<ol class="ms-lista">${m.enRiesgo.slice(0, 10).map((a) => fila(a, hace(a.ultima))).join('')}</ol>${m.enRiesgo.length > 10 ? `<button type="button" class="link-btn" data-ms-seg="riesgo">Ver los ${num(m.enRiesgo.length)} →</button>` : ''}` : `<p class="muted small">${m.conActividad ? 'Nadie: todos han entrado en las últimas 2 semanas. 👏' : 'Hace falta la última conexión de Skool.'}</p>`}</section>
        <section class="ms-card"><h3 class="ms-h">👋 Bajas recientes <span class="muted small">para recuperar</span></h3>${m.bajasRecientes.length ? `<ol class="ms-lista">${m.bajasRecientes.slice(0, 10).map((a) => fila(a, `${hace(a.bajaEn)} · LTV ${eur(ltvDe(a))}`)).join('')}</ol>` : '<p class="muted small">Ninguna en los últimos 30 días.</p>'}</section>
      </div>`;
  }

  function filtrados() {
    const ahora = Date.now();
    const seg = SEGMENTOS.find((s) => s.id === st.seg) || SEGMENTOS[0];
    const q = st.q.trim().toLowerCase();
    let l = (st.datos?.alumnos || []).filter((a) => seg.f(a, ahora) && (!st.plan || a.plan === st.plan) && (!q || `${a.nombre} ${a.email}`.toLowerCase().includes(q)));
    l = l.sort(seg.orden || ((a, b) => (b.alta || 0) - (a.alta || 0)));
    return l;
  }
  function vistaAlumnos() {
    const al = st.datos?.alumnos || [];
    if (!al.length) return vistaResumen();
    const ahora = Date.now();
    const planes = [...new Set(al.map((a) => a.plan))].sort();
    const l = filtrados();
    const c = cfg();
    const pagina = l.slice(0, st.limite || 100);
    return `
      <div class="ms-segs">${SEGMENTOS.map((s) => { const n = al.filter((a) => s.f(a, ahora)).length; return `<button type="button" class="ms-seg${st.seg === s.id ? ' activa' : ''}" data-ms-seg="${s.id}"><span aria-hidden="true">${s.ico}</span> ${esc(s.label)} <strong>${num(n)}</strong></button>`; }).join('')}</div>
      <div class="ms-filtros"><input type="search" id="ms-q" placeholder="Buscar por nombre o email" value="${esc(st.q)}"><select id="ms-plan"><option value="">Todos los planes</option>${planes.map((p) => `<option${p === st.plan ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select><span class="muted small">${num(l.length)} ${l.length === 1 ? 'alumno' : 'alumnos'}</span></div>
      <ul class="ms-alumnos">${pagina.map((a) => {
        const wa = waDe(a.telefono);
        const ult = (a.contactos || []).at(-1);
        return `<li class="ms-al${a.activo === false ? ' baja' : ''}" data-email="${esc(a.email)}">
          <div class="ms-al-q"><strong>${esc(a.nombre || a.email)}</strong><span class="ms-badge">${esc(a.plan)}</span>${a.activo === false ? `<span class="ms-badge mal">Baja ${hace(a.bajaEn)}</span>` : ''}<br><span class="muted small">${esc(a.email)}${a.telefono ? ` · ${esc(a.telefono)}` : ''}</span></div>
          <div class="ms-al-d"><span title="Antigüedad">🗓️ ${antig(a.alta)}</span><span title="Lo que ha pagado en total">💶 ${eur(ltvDe(a))}</span>${precioMes(a, c.precios || {}) ? `<span title="Lo que paga al mes">${eur(precioMes(a, c.precios || {}))}/mes</span>` : ''}${a.puntos != null ? `<span title="Puntos en Skool">⭐ ${num(a.puntos)}</span>` : ''}${a.ultima ? `<span title="Última conexión en Skool">👀 ${hace(a.ultima)}</span>` : ''}${ult ? `<span class="muted" title="Último mensaje desde aquí">${ult.canal === 'wa' ? '💬' : '✉️'} ${hace(ult.t)}</span>` : ''}</div>
          <div class="ms-al-a">${wa ? `<a class="btn small wa" href="https://wa.me/${esc(wa)}?text=${encodeURIComponent(rellenar(c.mensajeWa || 'Hola {nombre}, ', a))}" target="_blank" rel="noopener" data-ms-wa="${esc(a.email)}">💬 WhatsApp</a>` : `<button type="button" class="btn small" data-ms-tel="${esc(a.email)}" title="Busca su móvil en GHL">📱 Buscar móvil</button>`}<button type="button" class="btn small" data-ms-email="${esc(a.email)}">✉️ Email</button></div>
        </li>`;
      }).join('')}</ul>
      ${l.length > pagina.length ? `<p class="ms-mas"><button type="button" class="btn" data-ms="mas">Ver más (${num(l.length - pagina.length)})</button></p>` : ''}
      ${l.length && l.some((a) => !a.telefono) ? `<p class="muted small">Skool no da el móvil: «📱 Buscar móvil» lo trae de su ficha de GHL (por su email). <button type="button" class="link-btn" data-ms="moviles">Buscar el de los ${num(Math.min(50, l.filter((a) => !a.telefono).length))} primeros de la lista</button></p>` : ''}`;
  }

  function vistaPlanes() {
    const c = cfg();
    const planes = [...new Set((st.datos?.alumnos || []).map((a) => a.plan))].sort();
    return `<section class="ms-planes-cfg">
      <p class="muted small">Cada plan con su etiqueta de GHL (la que dispara su flujo: bienvenida, venta cruzada, subida de plan…). Si la dejas vacía, se usa <code>${esc(c.prefijo || 'alumno')}-&lt;plan&gt;</code>. El precio solo hace falta si Skool no lo trae.</p>
      <div class="ms-grid2"><label class="field"><span>Prefijo de las etiquetas</span><input id="ms-prefijo" value="${esc(c.prefijo || 'alumno')}" maxlength="40"></label>
      <label class="field"><span>Etiqueta para las bajas <small>(dispara el flujo de recuperación)</small></span><input id="ms-tagbaja" value="${esc(c.tagBaja || '')}" placeholder="membresia-baja" maxlength="80"></label></div>
      ${planes.length ? `<div class="ms-tabla-wrap"><table class="ms-tabla"><thead><tr><th>Plan (como sale en Skool)</th><th>Etiqueta de GHL</th><th>Precio si Skool no lo trae</th></tr></thead><tbody>${planes.map((p) => `<tr data-ms-plan="${esc(p)}"><td><strong>${esc(p)}</strong></td><td><input class="ms-in-tag" value="${esc(c.etiquetas?.[p] || '')}" placeholder="${esc(tagDePlan({ prefijo: c.prefijo }, p))}" maxlength="80"></td><td class="ms-precio"><input class="ms-in-precio" type="number" min="0" step="0.01" value="${c.precios?.[p]?.importe ?? ''}" placeholder="–"> € / <select class="ms-in-int"><option value="mes"${c.precios?.[p]?.intervalo === 'año' ? '' : ' selected'}>mes</option><option value="año"${c.precios?.[p]?.intervalo === 'año' ? ' selected' : ''}>año</option></select></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Los planes aparecen aquí cuando leas los alumnos de Skool.</p>'}
      <h3 class="ms-h">Mensajes por defecto</h3>
      <p class="muted small">Con <code>{nombre}</code> (nombre de pila) y <code>{plan}</code>. Se pueden cambiar antes de enviar cada uno.</p>
      <label class="field"><span>WhatsApp</span><textarea id="ms-msg-wa" rows="2" maxlength="1000" placeholder="Hola {nombre}, ">${esc(c.mensajeWa || '')}</textarea></label>
      <label class="field"><span>Asunto del email</span><input id="ms-asunto" maxlength="150" value="${esc(c.asunto || '')}"></label>
      <label class="field"><span>Texto del email</span><textarea id="ms-cuerpo" rows="5" maxlength="5000">${esc(c.cuerpo || '')}</textarea></label>
      <p><button type="button" class="btn primary" data-ms="guardar-cfg">Guardar</button></p>
    </section>`;
  }

  function pintar() {
    if (!body) return;
    if (!st.datos) { body.innerHTML = '<p class="muted">Cargando la membresía…</p>'; return; }
    const v = st.importacion ? 'importar' : st.vista;
    body.innerHTML = `${barra()}${puedeConfig() ? guia() : ''}${st.importacion ? '' : pestanas()}<div class="ms-vista">${v === 'importar' ? vistaImportar() : v === 'alumnos' ? vistaAlumnos() : v === 'planes' && puedeConfig() ? vistaPlanes() : vistaResumen()}</div>`;
  }

  // ---------- Acciones ----------
  async function guardarCfg(parcial) {
    const r = await api('/api/membresia', { method: 'POST', body: { op: 'cfg', cfg: parcial } });
    st.datos.cfg = r.cfg;
    return r.cfg;
  }
  async function enLotes(emails, op, etiqueta) {
    const res = [];
    for (let i = 0; i < emails.length; i += 10) {
      progress?.(i, emails.length, etiqueta);
      const { results } = await api('/api/membresia', { method: 'POST', body: { op, emails: emails.slice(i, i + 10) } });
      res.push(...results);
    }
    progress?.(emails.length, emails.length, etiqueta);
    return res;
  }
  function correo(email) {
    const a = (st.datos?.alumnos || []).find((x) => x.email === email);
    if (!a) return;
    const c = cfg();
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog ms-email-dlg';
    dlg.innerHTML = `<form method="dialog"><header class="dialog-head"><h2>✉️ Email a ${esc(a.nombre || a.email)}</h2><button class="btn ghost" value="cancel" aria-label="Cerrar">✕</button></header>
      <div class="dialog-body"><p class="muted small">Se envía desde GHL (su conversación queda en la ficha del contacto) a <strong>${esc(a.email)}</strong>.</p>
      <label class="field"><span>Asunto</span><input name="asunto" required maxlength="150" value="${esc(rellenar(c.asunto || '', a))}"></label>
      <label class="field"><span>Texto</span><textarea name="texto" rows="8" required maxlength="5000">${esc(rellenar(c.cuerpo || `Hola {nombre},\n\n`, a))}</textarea></label></div>
      <footer class="dialog-foot"><button class="btn ghost" value="cancel">Cancelar</button><button class="btn primary" value="enviar">Enviar</button></footer></form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', async () => {
      const f = dlg.querySelector('form');
      const asunto = f.asunto.value.trim();
      const texto = f.texto.value.trim();
      const enviar = dlg.returnValue === 'enviar';
      dlg.remove();
      if (!enviar) return;
      try {
        const r = await api('/api/membresia', { method: 'POST', body: { op: 'email', email, asunto, texto } });
        a.contactos = r.contactos;
        notice(`Email enviado a ${a.nombre || a.email}.`);
        pintar();
      } catch (e) { notice(e.message, true); }
    });
    dlg.showModal();
  }

  body?.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-ms],[data-ms-vista],[data-ms-seg],[data-ms-email],[data-ms-tel],[data-ms-wa],[data-ms-ver]');
    if (!t) return;
    if (t.dataset.msVista) { st.vista = t.dataset.msVista; ls.set('lsd_ms_vista', st.vista); pintar(); return; }
    if (t.dataset.msSeg) { st.seg = t.dataset.msSeg; st.vista = 'alumnos'; st.limite = 100; pintar(); return; }
    if (t.dataset.msVer) { st.vista = 'alumnos'; st.seg = SEGMENTOS.some((s) => s.id === 'bajas') && (st.datos.alumnos.find((a) => a.email === t.dataset.msVer)?.activo === false) ? 'bajas' : 'todos'; st.q = t.dataset.msVer; pintar(); return; }
    if (t.dataset.msEmail) { correo(t.dataset.msEmail); return; }
    if (t.dataset.msWa) {
      const a = st.datos.alumnos.find((x) => x.email === t.dataset.msWa);
      api('/api/membresia', { method: 'POST', body: { op: 'apuntar', email: t.dataset.msWa, canal: 'wa' } }).then((r) => { if (a) a.contactos = r.contactos; }).catch(() => {});
      return; // el enlace abre WhatsApp
    }
    if (t.dataset.msTel) {
      t.disabled = true;
      try {
        const [r] = await enLotes([t.dataset.msTel], 'contacto', 'Buscando en GHL');
        const a = st.datos.alumnos.find((x) => x.email === t.dataset.msTel);
        if (r?.ok && r.telefono) { a.telefono = r.telefono; pintar(); } else notice(r?.ok ? 'Su ficha de GHL no tiene móvil.' : `No se ha podido: ${r?.motivo || 'error'}.`, !r?.ok);
      } catch (err) { notice(err.message, true); }
      t.disabled = false;
      return;
    }
    const op = t.dataset.ms;
    if (op === 'actualizar') {
      const url = document.getElementById('ms-url')?.value.trim() || cfg().urlSkool;
      if (!/^https:\/\/([a-z0-9-]+\.)*skool\.com\//i.test(url || '')) { notice('Pon primero la dirección de Miembros de tu comunidad en Skool (https://www.skool.com/…/-/members).', true); document.getElementById('ms-url')?.focus(); return; }
      if (url !== cfg().urlSkool) guardarCfg({ urlSkool: url }).catch(() => {});
      st.skoolTab = window.open(url, 'skool-miembros');
      notice('En la pestaña de Skool, pulsa el marcador «📥 AlquimIA · Skool».');
      return;
    }
    if (op === 'pegar') {
      let txt = '';
      try { txt = await navigator.clipboard.readText(); } catch { txt = window.prompt('Pega aquí lo que copió el marcador de Skool:') || ''; }
      let d = null;
      try { d = JSON.parse(txt); } catch { /* no es JSON */ }
      if (!esDatosSkool(d)) { notice('En el portapapeles no hay datos del marcador de Skool. Pulsa «Copiar para AlquimIA» en Skool y vuelve a probar.', true); return; }
      recibir(d);
      return;
    }
    if (op === 'cancelar-foto') { st.importacion = null; pintar(); return; }
    if (op === 'guardar-foto') {
      const imp = st.importacion;
      t.disabled = true;
      try {
        await guardarCfg({ mapa: imp.mapa });
        const r = await api('/api/membresia', { method: 'POST', body: { op: 'foto', alumnos: imp.alumnos, completa: imp.completa, confirmar: true, comunidad: imp.datos.comunidad } });
        notice(r.primera ? `Membresía lista: ${r.altas} alumnos.` : `Membresía actualizada: ${r.altas} altas, ${r.bajas} bajas y ${r.cambios} cambios de plan.`);
        st.importacion = null;
        st.vista = 'resumen';
        await cargar();
      } catch (err) { notice(err.message, true); t.disabled = false; }
      return;
    }
    if (op === 'sincronizar') {
      const pend = etiquetasPendientes(estado(), cfg());
      if (!pend.length) return;
      if (!window.confirm(`Se pondrá en GHL la etiqueta de su plan a ${pend.length} alumnos (y la de baja a las bajas). Eso dispara los flujos de GHL que tengas con esas etiquetas. ¿Seguimos?`)) return;
      t.disabled = true;
      try {
        const res = await enLotes(pend.map((p) => p.email), 'etiquetar', 'Poniendo etiquetas en GHL');
        const ok = res.filter((r) => r.ok).length;
        const noGhl = res.filter((r) => r.motivo === 'no está en GHL').length;
        notice(`Etiquetas puestas a ${ok} alumnos${noGhl ? ` · ${noGhl} no están en GHL (no se crean)` : ''}${res.length - ok - noGhl ? ` · ${res.length - ok - noGhl} con error` : ''}.`, ok < res.length && !noGhl);
        await cargar();
      } catch (err) { notice(err.message, true); t.disabled = false; }
      return;
    }
    if (op === 'moviles') {
      const emails = filtrados().filter((a) => !a.telefono).slice(0, 50).map((a) => a.email);
      try {
        const res = await enLotes(emails, 'contacto', 'Buscando móviles en GHL');
        for (const r of res) { const a = st.datos.alumnos.find((x) => x.email === r.email); if (a && r.telefono) a.telefono = r.telefono; }
        notice(`Móvil encontrado para ${res.filter((r) => r.telefono).length} de ${res.length}.`);
        pintar();
      } catch (err) { notice(err.message, true); }
      return;
    }
    if (op === 'mas') { st.limite = (st.limite || 100) + 100; pintar(); return; }
    if (op === 'guardar-cfg') {
      const etiquetas = {}; const precios = {};
      for (const tr of body.querySelectorAll('[data-ms-plan]')) {
        const p = tr.dataset.msPlan;
        const tag = tr.querySelector('.ms-in-tag').value.trim().toLowerCase();
        if (tag) etiquetas[p] = tag;
        const imp = tr.querySelector('.ms-in-precio').value;
        if (imp !== '') precios[p] = { importe: Number(imp), intervalo: tr.querySelector('.ms-in-int').value };
      }
      try {
        await guardarCfg({ prefijo: document.getElementById('ms-prefijo').value.trim(), tagBaja: document.getElementById('ms-tagbaja').value.trim().toLowerCase(), etiquetas, precios, mensajeWa: document.getElementById('ms-msg-wa').value, asunto: document.getElementById('ms-asunto').value, cuerpo: document.getElementById('ms-cuerpo').value });
        notice('Planes y etiquetas guardados.');
        pintar();
      } catch (err) { notice(err.message, true); }
    }
  });
  body?.addEventListener('change', (e) => {
    const imp = st.importacion;
    if (e.target.dataset.msMapa && imp) { if (e.target.value) imp.mapa[e.target.dataset.msMapa] = e.target.value; else delete imp.mapa[e.target.dataset.msMapa]; previsualizar(); pintar(); return; }
    if (e.target.id === 'ms-centimos' && imp) { imp.mapa.centimos = e.target.checked; previsualizar(); return; }
    if (e.target.id === 'ms-completa' && imp) { imp.completa = e.target.checked; imp.tocadoCompleta = true; imp.aviso = false; previsualizar(); return; }
    if (e.target.id === 'ms-plan') { st.plan = e.target.value; pintar(); }
    if (e.target.id === 'ms-url') { const u = e.target.value.trim(); if (!u || /^https:\/\/([a-z0-9-]+\.)*skool\.com\//i.test(u)) guardarCfg({ urlSkool: u }).catch(() => {}); }
  });
  let tq = null;
  body?.addEventListener('input', (e) => {
    if (e.target.id !== 'ms-q') return;
    clearTimeout(tq);
    tq = setTimeout(() => { st.q = e.target.value; const pos = e.target.selectionStart; pintar(); const q = document.getElementById('ms-q'); q?.focus(); q?.setSelectionRange(pos, pos); }, 250);
  });

  return {
    abrir: () => { pintar(); cargar(); },
    recibir,
    _st: st,
    EMAIL_RE,
  };
}
