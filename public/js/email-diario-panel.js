// 📬 Email diario (página completa del menú lateral, solo en los clientes de CLIENTES_EMAIL_DIARIO): el calendario de
// emails del mes, el editor de cada día (revisar, aprobar, saltar, vista previa), las fechas límite, el envío en lotes,
// los CTA, el registro de lo que hace la tarea de las 20:00 y «Cómo funciona» (con el prompt de la tarea de Cowork).
// Datos: /api/email-diario. Lógica común: email-diario.js.
import { TIPOS, ESTADOS, BLOQUEADO, bloqueoDe, proximoCierre, tipoSugerido, estimarLotes, htmlEmail, sumarDias, diasEntre, conEmailDiario } from './email-diario.js';

const WD = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const PESTANAS = [['cal', '🗓️ Calendario'], ['fechas', '🏁 Fechas límite'], ['envio', '📤 Envío y lotes'], ['ctas', '🔗 CTAs'], ['registro', '🧾 Registro'], ['como', '📖 Cómo funciona']];
const fLarga = (d) => { const t = new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); return t.charAt(0).toUpperCase() + t.slice(1); };
const fCorta = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const pct = (x) => (x == null ? '–' : `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`);

export function montarEmailDiario({ api, esc, cliente, ls }) {
  const body = document.getElementById('evg-body');
  const st = { datos: null, mes: '', tab: ls?.get('lsd_evg_tab') || 'cal', abierto: null, audiencia: null, msg: '', error: '', ocupado: false };

  async function cargar(mes = st.mes) {
    if (!conEmailDiario(cliente())) { body.innerHTML = '<p class="muted">El email diario no está activado en este cliente.</p>'; return; }
    try {
      st.datos = await api(`/api/email-diario${mes ? `?mes=${mes}` : ''}`);
      st.mes = st.datos.mes;
      st.error = '';
    } catch (e) { st.error = e.message; }
    pintar();
    if (st.tab === 'envio' && !st.audiencia) cargarAudiencia();
  }
  async function cargarAudiencia() {
    try { st.audiencia = await api('/api/email-diario?audiencia=1'); } catch (e) { st.audiencia = { error: e.message }; }
    if (st.tab === 'envio') pintar();
  }
  async function post(op, datos = {}, ok = '') {
    st.ocupado = true; st.error = ''; st.msg = '';
    pintar();
    try {
      const r = await api('/api/email-diario', { method: 'POST', body: { op, ...datos } });
      if (r.estado) st.datos.estado = r.estado;
      if (r.registro) st.datos.registro = r.registro;
      if ('email' in r && datos.dia) { if (r.email) st.datos.emails[datos.dia] = r.email; else delete st.datos.emails[datos.dia]; }
      st.msg = ok || (r.resultado ? textoResultado(r.resultado) : '');
      return r;
    } catch (e) { st.error = e.message; return null; } finally { st.ocupado = false; pintar(); }
  }
  const textoResultado = (r) => ({ simulacion: `🧪 Simulación: ${r.resumen}.`, programado: `✅ Programado en GHL: ${r.resumen}.`, error: `❌ ${r.motivo}`, aviso: `⚠️ ${r.motivo}`, nada: `ℹ️ ${r.motivo}` }[r.accion] || '');

  // ---------- Pintar ----------
  function pintar() {
    const d = st.datos;
    if (!d) { body.innerHTML = st.error ? `<p class="evg-err">${esc(st.error)}</p>` : '<p class="muted">Cargando…</p>'; return; }
    const { config } = d.estado;
    body.innerHTML = `
      ${cabecera(d)}
      ${st.msg ? `<p class="evg-ok" role="status">${esc(st.msg)}</p>` : ''}${st.error ? `<p class="evg-err" role="alert">${esc(st.error)}</p>` : ''}
      <nav class="evg-tabs" role="tablist">${PESTANAS.map(([id, t]) => `<button type="button" role="tab" class="evg-tab${st.tab === id ? ' is-on' : ''}" data-evg-tab="${id}" aria-selected="${st.tab === id}">${t}</button>`).join('')}</nav>
      <div class="evg-panel">${{ cal: vistaCalendario, fechas: vistaFechas, envio: vistaEnvio, ctas: vistaCtas, registro: vistaRegistro, como: vistaComo }[st.tab](d, config)}</div>`;
    if (st.abierto) pintarEditor();
  }
  function cabecera(d) {
    const e = d.emails[d.manana];
    const b = bloqueoDe(d.estado.bloqueos, d.manana);
    const real = d.estado.config.modo === 'real';
    let txt;
    if (b) txt = `🔒 Franja bloqueada «${esc(b.label)}»: mañana no sale email.`;
    else if (e?.skip) txt = '🚫 Día saltado: mañana no sale email.';
    else if (!e?.subject && !e?.body) txt = '✍️ Falta el borrador de mañana (lo deja la IA a las 07:00 o lo escribes tú).';
    else if (e.status === 'aprobado') txt = `✅ Aprobado · «${esc(e.subject)}»: se programa hoy a las 20:00.`;
    else if (BLOQUEADO.has(e.status)) txt = `📬 ${esc(ESTADOS[e.status].label)} · «${esc(e.subject)}».`;
    else txt = `👀 Pendiente de aprobar · «${esc(e.subject)}»${d.admin ? '' : ' (lo aprueba una persona admin)'}.`;
    return `<div class="evg-hoy">
      <div><span class="evg-kicker">Mañana · ${esc(fLarga(d.manana))}</span><p class="evg-hoy-t">${txt}</p></div>
      <div class="evg-hoy-btns"><span class="evg-modo ${real ? 'is-real' : ''}" title="${real ? 'La tarea de las 20:00 programa de verdad en GHL' : 'La tarea de las 20:00 solo apunta en el registro lo que haría: no toca GHL'}">${real ? '🟢 Envío real' : '🧪 Simulación'}</span>
        <button type="button" class="btn primary" data-evg-abrir="${esc(d.manana)}">Abrir el de mañana</button></div>
    </div>`;
  }

  function vistaCalendario(d) {
    const [y, m] = st.mes.split('-').map(Number);
    const primero = `${st.mes}-01`;
    const dias = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
    const t0 = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const titulo = t0.charAt(0).toUpperCase() + t0.slice(1);
    const { entregables, bloqueos } = d.estado;
    let celdas = '<div></div>'.repeat(offset);
    for (let i = 1; i <= dias; i++) {
      const dia = `${st.mes}-${String(i).padStart(2, '0')}`;
      const e = d.emails[dia];
      const b = bloqueoDe(bloqueos, dia);
      // El tipo sugerido solo en los días que aún pueden tener email (no en pasados vacíos ni en franjas bloqueadas).
      const tipo = e?.type || (b || dia < d.hoy ? null : tipoSugerido(entregables, dia));
      const t = TIPOS[tipo];
      const cierres = entregables.filter((x) => x.date === dia).map((x) => `<span class="evg-cierre" title="Cierra la entrada a ${esc(x.name)}">🏁</span>`).join('');
      const est = e && (e.subject || e.body) ? ESTADOS[e.status] : null;
      celdas += `<button type="button" class="evg-dia${dia === d.hoy ? ' is-hoy' : ''}${dia < d.hoy ? ' is-pasado' : ''}${b ? ' is-bloq' : ''}${e?.skip ? ' is-salto' : ''}${est ? '' : ' is-vacio'}" data-evg-abrir="${dia}">
        <span class="evg-dn"><b>${i}</b>${cierres}</span>
        ${b ? `<span class="evg-chip evg-chip-bloq">🔒 ${esc(b.label)}</span>` : ''}
        ${e?.skip ? '<span class="evg-chip evg-chip-salto">🚫 Saltado</span>' : ''}
        ${t ? `<span class="evg-chip" style="--c:${t.color}">${t.ico} ${esc(t.label.split(' · ')[0])}</span>` : ''}
        ${est ? `<span class="evg-asunto">${esc(e.subject || 'Sin asunto')}</span><span class="evg-est"><i style="background:${est.color}"></i>${esc(est.label)}${e.origen === 'ia' ? ' · IA' : ''}</span>` : `<span class="evg-mas">${b || e?.skip ? '' : '＋ Escribir'}</span>`}
      </button>`;
    }
    const nSalto = Object.entries(d.emails).filter(([x, e]) => x.startsWith(st.mes) && e.skip).length;
    return `<div class="evg-calcab">
        <div class="evg-mesnav"><button type="button" class="btn ghost" data-evg-mes="-1" aria-label="Mes anterior">‹</button><b>${esc(titulo)}</b><button type="button" class="btn ghost" data-evg-mes="1" aria-label="Mes siguiente">›</button></div>
        <span class="muted">${nSalto} día${nSalto === 1 ? '' : 's'} saltado${nSalto === 1 ? '' : 's'} · ${bloqueos.length} franja${bloqueos.length === 1 ? '' : 's'} bloqueada${bloqueos.length === 1 ? '' : 's'}</span>
      </div>
      <div class="evg-ley">${Object.values(TIPOS).map((t) => `<span><i style="background:${t.color}"></i>${esc(t.label)}</span>`).join('')}<span><i class="evg-i-bloq"></i>Franja bloqueada</span><span><i class="evg-i-salto"></i>Saltado</span><span>🏁 Cierre de entrada</span></div>
      <div class="evg-grid">${WD.map((w) => `<div class="evg-wd">${w}</div>`).join('')}${celdas}</div>
      ${vistaBloqueos(d)}`;
  }
  function vistaBloqueos(d) {
    const lista = [...d.estado.bloqueos].sort((a, b) => a.from.localeCompare(b.from));
    return `<section class="evg-card"><h3>🔒 Franjas bloqueadas <span class="muted">· esos días no se redacta ni se programa nada (lanzamientos, captación…)</span></h3>
      ${lista.length ? `<ul class="evg-lista">${lista.map((b) => `<li><span><b>${esc(b.label)}</b> · ${esc(fCorta(b.from))} → ${esc(fCorta(b.to))}</span>${d.admin ? `<button type="button" class="btn ghost small" data-evg-bloq-x="${esc(b.id)}">Quitar</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted">No hay franjas bloqueadas.</p>'}
      ${d.admin ? `<div class="evg-fila"><input id="evg-bloq-nombre" placeholder="Ej.: Captación lanzamiento marzo"><input type="date" id="evg-bloq-desde" aria-label="Desde"><input type="date" id="evg-bloq-hasta" aria-label="Hasta"><button type="button" class="btn primary" data-evg-bloq-add>Bloquear</button></div>` : ''}
    </section>`;
  }
  function vistaFechas(d) {
    const dis = d.admin ? '' : ' disabled';
    return `<p class="muted">El tema del mes y la fecha de cierre de cada entregable. Los emails de <b>urgencia</b> salen solos en los 7 días antes del cierre y los de <b>curiosidad</b> entre 8 y 21 días antes; la IA usa el tema y las notas para redactarlos.</p>
      <div class="evg-cards">${d.estado.entregables.map((x) => { const k = x.date ? diasEntre(d.hoy, x.date) : null; return `<section class="evg-card" data-evg-ent="${esc(x.id)}">
        <h3>🏁 ${esc(x.name)}</h3><p class="muted">${k == null ? 'Sin fecha de cierre' : k < 0 ? 'Entrada cerrada' : k === 0 ? 'Cierra hoy' : `Cierra en ${k} días`}</p>
        <label class="field"><span>Tema del mes</span><input data-k="topic" value="${esc(x.topic)}" placeholder="Ej.: La caída de Constantinopla"${dis}></label>
        <label class="field"><span>Fecha límite de entrada</span><input type="date" data-k="date" value="${esc(x.date)}"${dis}></label>
        <label class="field"><span>Notas para la IA <small>(opcional)</small></span><textarea data-k="desc" rows="3"${dis}>${esc(x.desc)}</textarea></label>
      </section>`; }).join('')}</div>
      ${d.admin ? '<button type="button" class="btn primary" data-evg-guardar="fechas">Guardar fechas límite</button>' : '<p class="muted">Solo una persona admin cambia las fechas límite.</p>'}`;
  }
  function vistaEnvio(d, c) {
    const dis = d.admin ? '' : ' disabled';
    const a = st.audiencia;
    const est = a?.contactos != null ? estimarLotes(a.contactos, c.lotes, c.sendTime) : null;
    return `<section class="evg-card"><h3>✉️ Remitente y audiencia</h3>
        <div class="evg-form">
          <label class="field"><span>Email del remitente</span><input id="evg-c-fromEmail" value="${esc(c.fromEmail)}" placeholder="hola@tudominio.com"${dis}></label>
          <label class="field"><span>Nombre del remitente</span><input id="evg-c-fromName" value="${esc(c.fromName)}"${dis}></label>
          <label class="field"><span>Responder a <small>(opcional)</small></span><input id="evg-c-replyTo" value="${esc(c.replyTo)}"${dis}></label>
          <label class="field"><span>Etiqueta de GHL que lo recibe</span><input id="evg-c-audienceTag" list="evg-etiquetas" value="${esc(c.audienceTag)}" placeholder="Elige una etiqueta de GHL"${dis}></label>
          <label class="field"><span>Hora de envío por defecto</span><input type="time" id="evg-c-sendTime" value="${esc(c.sendTime)}"${dis}></label>
          <label class="field"><span>Usuario de GHL que programa <small>(su id: Ajustes → Mi perfil)</small></span><input id="evg-c-ghlUserId" value="${esc(c.ghlUserId)}"${dis}></label>
        </div>
        <datalist id="evg-etiquetas">${(a?.etiquetas || []).map((t) => `<option value="${esc(t)}"></option>`).join('')}</datalist>
        ${a?.error ? `<p class="evg-err">${esc(a.error)}</p>` : a?.contactos != null ? `<p class="muted">«${esc(c.audienceTag)}»: <b>${a.contactos.toLocaleString('es-ES')}</b> contactos hoy.</p>` : ''}
        <label class="field"><span>Pie legal <small>(se añade al final de cada email; texto, con una línea en blanco entre párrafos)</small></span><textarea id="evg-c-pie" rows="4"${dis}>${esc(c.pie)}</textarea></label>
      </section>
      <section class="evg-card"><h3>📦 Envío en lotes <span class="muted">· siempre en lotes pequeños, para no caer en spam</span></h3>
        <div class="evg-form">
          <label class="field"><span>Contactos por lote</span><input type="number" id="evg-c-tamano" min="10" max="2000" value="${c.lotes.tamano}"${dis}></label>
          <label class="field"><span>Minutos entre lotes</span><input type="number" id="evg-c-cada" min="1" max="120" value="${c.lotes.cada}"${dis}></label>
        </div>
        ${est ? `<p class="evg-est-lotes">Con ${a.contactos.toLocaleString('es-ES')} contactos: <b>${est.lotes} ${est.lotes === 1 ? 'lote' : 'lotes'}</b>; empieza a las ${esc(c.sendTime)} y el último sale hacia las <b>${esc(est.fin)}</b>${est.otroDia ? ' <b>del día siguiente</b> (son demasiados lotes: sube el tamaño o baja los minutos)' : ''}.</p>` : ''}
      </section>
      <section class="evg-card"><h3>🧪 Simulación o envío real</h3>
        <label class="evg-radio"><input type="radio" name="evg-modo" value="simulacion"${c.modo !== 'real' ? ' checked' : ''}${dis}> <span><b>Simulación</b>: a las 20:00 solo apunta en el registro lo que programaría. No toca GHL.</span></label>
        <label class="evg-radio"><input type="radio" name="evg-modo" value="real"${c.modo === 'real' ? ' checked' : ''}${dis}> <span><b>Envío real</b>: a las 20:00 crea la campaña en GHL con el email aprobado de mañana y la programa en lotes. Programada, ya no se puede cancelar desde AlquimIA.</span></label>
        ${d.admin ? `<div class="evg-fila"><button type="button" class="btn primary" data-evg-guardar="envio">Guardar</button><button type="button" class="btn ghost" data-evg-op="simular">🧪 Probar la tarea de las 20:00 (sin enviar)</button>${c.modo === 'real' ? '<button type="button" class="btn ghost" data-evg-op="programar-ahora">📤 Programar ahora el de mañana</button>' : ''}</div>` : '<p class="muted">Solo una persona admin cambia el envío.</p>'}
      </section>`;
  }
  function vistaCtas(d) {
    const ctas = st.ctasEdit || d.estado.ctas;
    const dis = d.admin ? '' : ' disabled';
    return `<p class="muted">Los enlaces de los botones. Cada email elige el suyo; la IA los ve con su id.</p>
      <div class="evg-ctas">${ctas.map((c, i) => `<div class="evg-fila evg-cta" data-evg-cta="${i}"><input data-k="name" value="${esc(c.name)}" placeholder="Texto del botón (ej.: Entrar a Claves)"${dis}><input data-k="url" value="${esc(c.url)}" placeholder="https://…"${dis}><input data-k="use" value="${esc(c.use)}" placeholder="Para qué emails"${dis}>${d.admin ? `<button type="button" class="btn ghost small" data-evg-cta-x="${i}" aria-label="Quitar">✕</button>` : ''}</div>`).join('') || '<p class="muted">Aún no hay CTAs.</p>'}</div>
      ${d.admin ? '<div class="evg-fila"><button type="button" class="btn ghost" data-evg-cta-add>＋ Añadir CTA</button><button type="button" class="btn primary" data-evg-guardar="ctas">Guardar CTAs</button></div>' : ''}`;
  }
  function vistaRegistro(d) {
    const ICO = { programado: '✅', simulación: '🧪', aviso: '⚠️', error: '❌', aprobado: '👍', desaprobado: '↩️', 'sin envío': 'ℹ️' };
    return d.registro.length ? `<ul class="evg-reg">${d.registro.map((r) => `<li class="${r.ok ? '' : 'is-mal'}"><span class="evg-reg-ico" aria-hidden="true">${ICO[r.accion] || '•'}</span><div><p><b>${esc(r.accion)}</b>${r.dia ? ` · email del ${esc(fCorta(r.dia))}` : ''} <span class="muted">· ${esc(new Date(r.at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }))}${r.quien ? ` · ${esc(r.quien)}` : ''}</span></p>${r.detalle ? `<p class="muted">${esc(r.detalle)}</p>` : ''}</div></li>`).join('')}</ul>` : '<p class="muted">Aún no hay nada en el registro: aquí sale lo que hace cada tarde la tarea de las 20:00 y cada aprobación.</p>';
  }
  function vistaComo() {
    const url = `${location.origin}/api/email-diario?c=${encodeURIComponent(cliente())}&key=TU_DIGEST_KEY&tarea=`;
    return `<ol class="evg-pasos">
        <li><b>07:00 · la IA deja el borrador de mañana.</b> Una tarea programada de Cowork (con tu suscripción de Claude, sin créditos de API) lo redacta con tu guía de estilo, tu estructura y tus ejemplos, y lo guarda aquí por el conector de AlquimIA. No escribe en días bloqueados o saltados, ni pisa lo que haya escrito una persona.</li>
        <li><b>Durante el día · lo revisas aquí.</b> Ábrelo, cambia lo que haga falta y mira la vista previa. Si una persona admin lo aprueba y luego se cambia el texto, vuelve a borrador.</li>
        <li><b>Una persona admin lo aprueba.</b> Sin aprobar no se programa nada.</li>
        <li><b>20:00 · AlquimIA lo programa en GHL</b> para el día siguiente a su hora, siempre en lotes (Envío y lotes). Lo que pasa queda en el Registro. Programado, ya no se puede cambiar.</li>
        <li><b>Después del envío</b>, AlquimIA lee de GHL los entregados, la apertura y los clics de cada email.</li>
        <li><b>La prueba</b> la haces tú a mano desde GHL («Enviar prueba») antes de activar el envío real.</li>
      </ol>
      <section class="evg-card"><h3>🤖 La tarea de Cowork (07:00, cada día)</h3><p class="muted">Pega esto en la tarea programada de Cowork del proyecto que tiene tu guía de estilo, tu estructura y tus ejemplos, con el conector de AlquimIA («Dashboard Datos») activado:</p>
        <pre class="evg-pre" id="evg-prompt">${esc(promptCowork(cliente()))}</pre><button type="button" class="btn ghost" data-evg-copiar="evg-prompt">📋 Copiar</button></section>
      <section class="evg-card"><h3>⏰ Las tareas de AlquimIA (cron-job.org, hora de Madrid)</h3><p class="muted">Como el resumen diario: dos tareas que abren estas direcciones (cambia TU_DIGEST_KEY por tu DIGEST_KEY de Cloudflare). No dependen de tu ordenador.</p>
        <ul class="evg-lista"><li><span><b>20:00</b> · programar el de mañana<br><code>${esc(url)}programar</code></span></li><li><span><b>12:00</b> · aviso si mañana aún no está listo<br><code>${esc(url)}revisar</code></span></li></ul></section>`;
  }

  // ---------- Editor de un día ----------
  function pintarEditor() {
    const dlg = document.getElementById('evg-editor');
    const d = st.datos;
    const dia = st.abierto;
    const e = d.emails[dia] || { type: tipoSugerido(d.estado.entregables, dia), subject: '', preheader: '', body: '', cta: '', sendTime: '', status: 'borrador', skip: false };
    const b = bloqueoDe(d.estado.bloqueos, dia);
    const cerrado = BLOQUEADO.has(e.status);
    const dis = cerrado || st.ocupado ? ' disabled' : '';
    const cierre = proximoCierre(d.estado.entregables, dia);
    const t = TIPOS[e.type];
    const est = ESTADOS[e.status] || ESTADOS.borrador;
    dlg.innerHTML = `<form method="dialog" class="evg-ed">
      <header class="evg-ed-cab"><div><h3>${esc(fLarga(dia))}</h3><p class="muted">${t ? esc(t.pista) : 'Sin tipo'}${cierre ? ` · próximo cierre: ${esc(cierre.name)} (${esc(fCorta(cierre.date))})` : ''}</p></div><button type="button" class="btn ghost" data-evg-cerrar aria-label="Cerrar">✕</button></header>
      ${b ? `<p class="evg-aviso">🔒 Este día está en la franja bloqueada «${esc(b.label)}»: no se programa nada.</p>` : ''}
      ${e.skip ? '<p class="evg-aviso">🚫 Día saltado: no se programa nada.</p>' : ''}
      ${e.nota ? `<p class="evg-aviso">↩️ ${esc(e.nota)}</p>` : ''}
      ${cerrado ? `<p class="evg-aviso">📬 ${esc(est.label)}: GHL ya tiene esta versión y no se puede cambiar.</p>` : ''}
      <p class="evg-ed-est"><i style="background:${est.color}"></i>${esc(est.label)}${e.origen === 'ia' ? ' · redactado por la IA' : ''}${e.aprobado ? ` · aprobado por ${esc(e.aprobado.por)}` : ''}${e.editado?.por ? ` · último cambio: ${esc(e.editado.por)}` : ''}</p>
      <div class="evg-form">
        <label class="field"><span>Tipo</span><select id="evg-e-type"${dis}><option value="">Sin tipo</option>${Object.entries(TIPOS).map(([k, x]) => `<option value="${k}"${k === e.type ? ' selected' : ''}>${x.ico} ${esc(x.label)}</option>`).join('')}</select></label>
        <label class="field"><span>Hora de envío</span><input type="time" id="evg-e-sendTime" value="${esc(e.sendTime || d.estado.config.sendTime)}"${dis}></label>
        <label class="field"><span>CTA</span><select id="evg-e-cta"${dis}><option value="">Sin CTA</option>${d.estado.ctas.map((c) => `<option value="${esc(c.id)}"${c.id === e.cta ? ' selected' : ''}>${esc(c.name || c.id)}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Asunto <small id="evg-e-cuenta">${e.subject.length}/50</small></span><input id="evg-e-subject" value="${esc(e.subject)}" maxlength="150"${dis}></label>
      <label class="field"><span>Preheader</span><input id="evg-e-preheader" value="${esc(e.preheader)}"${dis}></label>
      <label class="field"><span>Cuerpo <small>(párrafos con una línea en blanco; **negrita**; [CTA] en una línea sola donde va el botón)</small></span><textarea id="evg-e-body" rows="14"${dis}>${esc(e.body)}</textarea></label>
      <div class="evg-ed-btns">
        ${cerrado ? '' : `<button type="button" class="btn primary" data-evg-ed="guardar">💾 Guardar</button>
        ${e.status === 'aprobado' ? (d.admin ? '<button type="button" class="btn ghost" data-evg-ed="desaprobar">↩️ Quitar la aprobación</button>' : '') : `<button type="button" class="btn ghost" data-evg-ed="listo">👀 Marcar «listo para revisar»</button>${d.admin ? '<button type="button" class="btn evg-aprobar" data-evg-ed="aprobar">✅ Aprobar para el envío</button>' : ''}`}
        <button type="button" class="btn ghost" data-evg-ed="saltar">${e.skip ? '🔁 Reactivar este día' : '🚫 Saltar este día'}</button>`}
        <button type="button" class="btn ghost" data-evg-ed="vista">👁️ Vista previa</button>
      </div>
      ${e.m ? `<p class="evg-met">📊 Entregados ${(e.m.entregados || 0).toLocaleString('es-ES')} · apertura ${pct(e.m.apertura)} · clics ${pct(e.m.ctr)} · bajas ${e.m.bajas || 0}</p>` : ''}
      <div id="evg-vista"></div>
    </form>`;
    if (!dlg.open) dlg.showModal();
    dlg.querySelector('#evg-e-subject')?.addEventListener('input', (ev) => { dlg.querySelector('#evg-e-cuenta').textContent = `${ev.target.value.length}/50`; });
  }
  const leerEditor = () => {
    const dlg = document.getElementById('evg-editor');
    const v = (id) => dlg.querySelector(`#evg-e-${id}`)?.value ?? '';
    return { type: v('type') || null, subject: v('subject'), preheader: v('preheader'), body: v('body'), cta: v('cta'), sendTime: v('sendTime') === st.datos.estado.config.sendTime ? '' : v('sendTime') };
  };

  // ---------- Eventos ----------
  body.addEventListener('click', async (ev) => {
    const el = ev.target.closest('button');
    if (!el) return;
    const d = st.datos;
    if (el.dataset.evgTab) { st.tab = el.dataset.evgTab; ls?.set('lsd_evg_tab', st.tab); st.msg = ''; pintar(); if (st.tab === 'envio' && !st.audiencia) cargarAudiencia(); return; }
    if (el.dataset.evgMes) { const [y, m] = st.mes.split('-').map(Number); const n = new Date(Date.UTC(y, m - 1 + Number(el.dataset.evgMes), 1)); cargar(`${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}`); return; }
    if (el.dataset.evgAbrir) { st.abierto = el.dataset.evgAbrir; pintarEditor(); return; }
    if (el.dataset.evgOp) { await post(el.dataset.evgOp); return; }
    if (el.dataset.evgCopiar) { try { await navigator.clipboard.writeText(document.getElementById(el.dataset.evgCopiar).textContent); el.textContent = '✓ Copiado'; } catch { window.prompt('Copia el texto:', document.getElementById(el.dataset.evgCopiar).textContent); } return; }
    if ('evgBloqAdd' in el.dataset) {
      const label = body.querySelector('#evg-bloq-nombre').value.trim() || 'Bloqueado';
      const from = body.querySelector('#evg-bloq-desde').value; const to = body.querySelector('#evg-bloq-hasta').value;
      if (!from || !to || to < from) { st.error = 'Pon la fecha de inicio y la de fin (la de fin, igual o posterior).'; pintar(); return; }
      await post('ajustes', { bloqueos: [...d.estado.bloqueos, { id: Date.now().toString(36), label, from, to }] }, `🔒 Franja «${label}» bloqueada.`);
      return;
    }
    if (el.dataset.evgBloqX) { await post('ajustes', { bloqueos: d.estado.bloqueos.filter((b) => b.id !== el.dataset.evgBloqX) }, 'Franja quitada.'); return; }
    if ('evgCtaAdd' in el.dataset) { st.ctasEdit = [...leerCtas(), { id: `cta${Date.now().toString(36)}`, name: '', url: '', use: '' }]; pintar(); return; }
    if (el.dataset.evgCtaX) { const l = leerCtas(); l.splice(Number(el.dataset.evgCtaX), 1); st.ctasEdit = l; pintar(); return; }
    if (el.dataset.evgGuardar === 'ctas') { const r = await post('ajustes', { ctas: leerCtas() }, '🔗 CTAs guardados.'); if (r) st.ctasEdit = null; pintar(); return; }
    if (el.dataset.evgGuardar === 'fechas') {
      const entregables = d.estado.entregables.map((x) => { const c = body.querySelector(`[data-evg-ent="${x.id}"]`); const v = (k) => c.querySelector(`[data-k="${k}"]`).value; return { ...x, topic: v('topic'), date: v('date'), desc: v('desc') }; });
      await post('ajustes', { entregables }, '🏁 Fechas límite guardadas. Los tipos de urgencia y curiosidad se recalculan solos en los días que aún no tienen tipo.');
      return;
    }
    if (el.dataset.evgGuardar === 'envio') {
      const v = (id) => body.querySelector(`#evg-c-${id}`).value;
      const modo = body.querySelector('input[name="evg-modo"]:checked')?.value || 'simulacion';
      if (modo === 'real' && d.estado.config.modo !== 'real' && !window.confirm('¿Activar el envío real? Desde esta tarde, a las 20:00, AlquimIA programará en GHL el email aprobado de mañana para toda la etiqueta. Haz antes la prueba a mano desde GHL.')) return;
      await post('ajustes', { config: { fromEmail: v('fromEmail'), fromName: v('fromName'), replyTo: v('replyTo'), audienceTag: v('audienceTag'), sendTime: v('sendTime'), ghlUserId: v('ghlUserId'), pie: v('pie'), lotes: { tamano: Number(v('tamano')), cada: Number(v('cada')) }, modo } }, '📤 Envío guardado.');
      st.audiencia = null; cargarAudiencia();
    }
  });
  const leerCtas = () => [...body.querySelectorAll('[data-evg-cta]')].map((f, i) => ({ id: (st.ctasEdit || st.datos.estado.ctas)[i]?.id || `cta${i + 1}`, name: f.querySelector('[data-k="name"]').value, url: f.querySelector('[data-k="url"]').value, use: f.querySelector('[data-k="use"]').value }));

  const dlg = document.getElementById('evg-editor');
  dlg.addEventListener('click', async (ev) => {
    if (ev.target === dlg || ev.target.closest('[data-evg-cerrar]')) { dlg.close(); return; }
    const b = ev.target.closest('[data-evg-ed]');
    if (!b) return;
    const dia = st.abierto;
    const acc = b.dataset.evgEd;
    if (acc === 'vista') {
      const e = { ...(st.datos.emails[dia] || {}), ...leerEditor() };
      const f = document.createElement('iframe');
      f.className = 'evg-iframe';
      f.title = 'Vista previa del email';
      f.setAttribute('sandbox', '');
      f.srcdoc = htmlEmail(e, { ctas: st.datos.estado.ctas, pie: st.datos.estado.config.pie, preheader: e.preheader });
      const box = dlg.querySelector('#evg-vista');
      box.innerHTML = `<p class="evg-vista-asunto"><b>${esc(e.subject || 'Sin asunto')}</b> <span class="muted">· ${esc(e.preheader || '')}</span></p>`;
      box.append(f);
      return;
    }
    if (acc === 'guardar') await post('email', { dia, email: leerEditor() }, '💾 Guardado.');
    else if (acc === 'listo') await post('email', { dia, email: { ...leerEditor(), status: 'listo' } }, '👀 Marcado como listo para revisar.');
    else if (acc === 'saltar') await post('saltar', { dia, skip: !st.datos.emails[dia]?.skip }, st.datos.emails[dia]?.skip ? '🔁 Día reactivado.' : '🚫 Día saltado: no saldrá email.');
    else if (acc === 'desaprobar') await post('desaprobar', { dia }, '↩️ Aprobación quitada: no se programará.');
    else if (acc === 'aprobar') {
      const r = await post('email', { dia, email: leerEditor() });
      if (r) await post('aprobar', { dia }, `✅ Aprobado. Se programa a las 20:00 del ${fCorta(sumarDias(dia, -1))}.`);
    }
  });
  dlg.addEventListener('close', () => { st.abierto = null; });

  return { abrir: () => cargar(), recargar: () => cargar() };
}

// El prompt de la tarea programada de Cowork (07:00): redacta el de mañana y lo guarda como borrador.
export function promptCowork(clienteId) {
  return [
    'Cada día a las 07:00 (hora de Madrid). Usa el conector «Dashboard Datos» (AlquimIA).',
    '',
    `1. Llama a «email_diario_contexto» (cliente: "${clienteId}"). Si «puedeRedactar» es false, para y di el motivo: no escribas nada.`,
    '2. Redacta el email de ese día con la guía de estilo, la estructura y los emails de ejemplo de este proyecto (mi voz). Usa el tipo, la próxima fecha límite (entregable, tema, días que faltan y notas) y el CTA que te da la herramienta. No repitas los asuntos de «recientes» ni de «proximos». Sigue sus «reglas».',
    `3. Guárdalo con «guardar_borrador_email» (cliente: "${clienteId}", dia, asunto de 50 caracteres como mucho, preheader, cuerpo, cta y tipo). No escribas el pie legal: lo añade AlquimIA.`,
    '4. Termina con una línea: el día, el asunto y el tipo.',
    '',
    'Nunca apruebes, programes ni envíes nada: lo revisa y lo aprueba una persona en AlquimIA, y AlquimIA lo programa en GHL.',
  ].join('\n');
}
