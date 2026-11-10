// 📬 Email diario (página completa del menú lateral, solo en los clientes de CLIENTES_EMAIL_DIARIO): el calendario de
// emails del mes, el editor de cada día (revisar, aprobar, saltar, con la vista previa en vivo), las fechas límite, el
// envío en lotes, los CTA, el registro de lo que hace la tarea de las 20:00 y «Cómo funciona» (con el prompt de la
// tarea de Cowork). Datos: /api/email-diario. Lógica común: email-diario.js. Iconos: los de línea de icons.js.
import { TIPOS, ESTADOS, BLOQUEADO, bloqueoDe, proximoCierre, tipoSugerido, estimarLotes, htmlEmail, sumarDias, diasEntre, conEmailDiario } from './email-diario.js';
import { icon } from './icons.js';

const WD = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const PESTANAS = [['cal', 'calendar', 'Calendario'], ['fechas', 'flag', 'Fechas límite'], ['envio', 'mail', 'Envío y lotes'], ['ctas', 'link', 'CTAs'], ['registro', 'history', 'Registro'], ['como', 'book', 'Cómo funciona']];
// Los pasos de cada email, de la IA a la bandeja de entrada.
const PASOS = [['pencil', 'Borrador'], ['eye', 'Revisado'], ['check', 'Aprobado'], ['clock', 'Programado'], ['mail', 'Enviado']];
const ICO_ENT = { cronica: 'book', tertulia: 'live', vive: 'globe' };
const may = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const fecha = (d, o) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { timeZone: 'UTC', ...o });
const fLarga = (d) => may(fecha(d, { weekday: 'long', day: 'numeric', month: 'long' }));
const fCorta = (d) => fecha(d, { day: 'numeric', month: 'short' });
const pct = (x) => (x == null ? '–' : `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`);
const i = (n, cls = '') => icon(n, cls);

export function montarEmailDiario({ api, esc, cliente, ls }) {
  const body = document.getElementById('evg-body');
  const dlg = document.getElementById('evg-editor');
  const st = { datos: null, mes: '', tab: ls?.get('lsd_evg_tab') || 'cal', abierto: null, audiencia: null, msg: '', error: '', ocupado: false, ctasEdit: null, modo: null };

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
  const textoResultado = (r) => ({ simulacion: `Simulación: ${r.resumen}.`, programado: `Programado en GHL: ${r.resumen}.`, error: r.motivo, aviso: r.motivo, nada: r.motivo }[r.accion] || '');

  // ---------- Piezas ----------
  const pasoDe = (e) => (e && (e.subject || e.body) ? ESTADOS[e.status]?.paso ?? 0 : -1);
  const pasos = (e, { compacto = false } = {}) => {
    const p = pasoDe(e);
    return `<ol class="evg-pasos-linea${compacto ? ' is-compacto' : ''}" aria-label="Estado del email">${PASOS.map(([ico, t], k) => `<li class="${k <= p ? 'is-hecho' : k === p + 1 ? 'is-ahora' : ''}"${k === p + 1 ? ' aria-current="step"' : ''}><span class="evg-paso-ico">${i(k <= p ? 'check' : ico)}</span><span class="evg-paso-t">${t}</span></li>`).join('')}</ol>`;
  };
  const tileFecha = (dia, cls = '') => `<span class="evg-tile ${cls}"><small>${esc(fecha(dia, { weekday: 'short' }).replace('.', ''))}</small><b>${Number(dia.slice(8))}</b><small>${esc(fecha(dia, { month: 'short' }).replace('.', ''))}</small></span>`;
  const tipoChip = (tipo, { sugerido = false } = {}) => { const t = TIPOS[tipo]; return t ? `<span class="evg-tipo${sugerido ? ' is-sug' : ''}" style="--c:${t.color}">${i(t.icono)}<span>${esc(t.corto)}</span></span>` : ''; };
  const estadoPill = (e) => { const s = ESTADOS[e.status] || ESTADOS.borrador; return `<span class="evg-pill" style="--c:${s.color}">${i(s.icono)}${esc(s.label)}</span>`; };
  const avisoHtml = () => `${st.msg ? `<div class="evg-toast is-ok" role="status">${i('check')}<span>${esc(st.msg)}</span><button type="button" class="evg-toast-x" data-evg-cerrar-msg aria-label="Cerrar">${i('x')}</button></div>` : ''}${st.error ? `<div class="evg-toast is-err" role="alert">${i('alert')}<span>${esc(st.error)}</span><button type="button" class="evg-toast-x" data-evg-cerrar-msg aria-label="Cerrar">${i('x')}</button></div>` : ''}`;

  // ---------- Pintar ----------
  function pintar() {
    const d = st.datos;
    if (!d) { body.innerHTML = st.error ? `<div class="evg-toast is-err">${i('alert')}<span>${esc(st.error)}</span></div>` : `<div class="evg-cargando">${i('mail')}<span>Cargando el calendario…</span></div>`; return; }
    body.innerHTML = `
      ${cabecera(d)}
      ${cifras(d)}
      ${avisoHtml()}
      <nav class="evg-tabs" role="tablist">${PESTANAS.map(([id, ico, t]) => `<button type="button" role="tab" class="evg-tab${st.tab === id ? ' is-on' : ''}" data-evg-tab="${id}" aria-selected="${st.tab === id}">${i(ico)}<span>${t}</span></button>`).join('')}</nav>
      <div class="evg-panel" data-tab="${st.tab}">${{ cal: vistaCalendario, fechas: vistaFechas, envio: vistaEnvio, ctas: vistaCtas, registro: vistaRegistro, como: vistaComo }[st.tab](d, d.estado.config)}</div>`;
    if (st.abierto && dlg.open) pintarEditor(); // solo si sigue abierto (refresca su estado tras guardar)
  }

  function cabecera(d) {
    const e = d.emails[d.manana];
    const b = bloqueoDe(d.estado.bloqueos, d.manana);
    const real = d.estado.config.modo === 'real';
    let titulo; let sub; let tono = '';
    if (b) { titulo = 'Mañana no sale email'; sub = `Está en la franja bloqueada «${b.label}».`; tono = 'is-bloq'; }
    else if (e?.skip) { titulo = 'Mañana no sale email'; sub = 'El día está saltado.'; tono = 'is-salto'; }
    else if (!e?.subject && !e?.body) { titulo = 'Falta el borrador de mañana'; sub = 'Lo deja la IA a las 07:00, o lo escribes tú ahora.'; tono = 'is-falta'; }
    else { titulo = e.subject || 'Sin asunto'; sub = e.status === 'aprobado' ? 'Aprobado: se programa hoy a las 20:00.' : BLOQUEADO.has(e.status) ? `${ESTADOS[e.status].label}: sale a las ${e.sendTime || d.estado.config.sendTime}.` : d.admin ? 'Pendiente de tu aprobación.' : 'Pendiente de que lo apruebe una persona admin.'; }
    return `<section class="evg-hero ${tono}">
      <div class="evg-hero-fecha">${tileFecha(d.manana, 'is-grande')}</div>
      <div class="evg-hero-txt">
        <span class="evg-kicker">${i('sun')} Mañana · ${esc(fLarga(d.manana))}</span>
        <h3 class="evg-hero-t">${esc(titulo)}</h3>
        ${e?.type && !tono ? `<div class="evg-hero-tipo">${tipoChip(e.type)}${e.origen === 'ia' ? `<span class="evg-pill" style="--c:var(--tone-live)">${i('bot')}IA</span>` : ''}</div>` : ''}
        <p class="evg-hero-sub">${esc(sub)}</p>
        ${tono ? '' : pasos(e)}
      </div>
      <div class="evg-hero-acc">
        <span class="evg-modo ${real ? 'is-real' : ''}" title="${real ? 'La tarea de las 20:00 programa de verdad en GHL' : 'La tarea de las 20:00 solo apunta en el registro lo que haría: no toca GHL'}"><i class="evg-latido" aria-hidden="true"></i>${real ? 'Envío real' : 'Simulación'}</span>
        <button type="button" class="btn primary evg-btn-grande" data-evg-abrir="${esc(d.manana)}">${i(e?.subject ? 'eye' : 'pencil')}${e?.subject ? 'Revisar el de mañana' : 'Escribir el de mañana'}</button>
      </div>
    </section>`;
  }
  function cifras(d) {
    const delMes = Object.entries(d.emails).filter(([x, e]) => x.startsWith(st.mes) && (e.subject || e.body));
    const pend = delMes.filter(([x, e]) => x >= d.manana && ['borrador', 'listo'].includes(e.status)).length;
    const aprob = delMes.filter(([, e]) => e.status === 'aprobado').length;
    const env = delMes.filter(([, e]) => BLOQUEADO.has(e.status)).length;
    const conM = delMes.map(([, e]) => e.m?.apertura).filter((x) => x != null);
    const ap = conM.length ? conM.reduce((a, b) => a + b, 0) / conM.length : null;
    const k = (ico, tono, v, t) => `<div class="evg-kpi" style="--c:${tono}"><span class="evg-kpi-ico">${i(ico)}</span><div><b>${v}</b><small>${t}</small></div></div>`;
    return `<div class="evg-kpis">${k('pencil', 'var(--tone-accent)', delMes.length, 'escritos este mes')}${k('eye', 'var(--tone-vip)', pend, 'por revisar')}${k('check', 'var(--tone-info)', aprob, 'aprobados')}${k('mail', 'var(--tone-live)', env, 'programados o enviados')}${k('chart', 'var(--tone-buy)', pct(ap), 'apertura media')}</div>`;
  }

  function vistaCalendario(d) {
    const [y, m] = st.mes.split('-').map(Number);
    const dias = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
    const titulo = may(new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
    const { entregables, bloqueos } = d.estado;
    let celdas = '<div class="evg-hueco"></div>'.repeat(offset);
    for (let n = 1; n <= dias; n++) {
      const dia = `${st.mes}-${String(n).padStart(2, '0')}`;
      const e = d.emails[dia];
      const b = bloqueoDe(bloqueos, dia);
      const con = e && (e.subject || e.body);
      const pasado = dia < d.hoy;
      const tipo = e?.type || (b || pasado ? null : tipoSugerido(entregables, dia));
      const color = TIPOS[tipo]?.color || 'var(--border-strong)';
      const cierres = entregables.filter((x) => x.date === dia);
      celdas += `<button type="button" class="evg-dia${dia === d.hoy ? ' is-hoy' : ''}${dia === d.manana ? ' is-manana' : ''}${pasado ? ' is-pasado' : ''}${b ? ' is-bloq' : ''}${e?.skip ? ' is-salto' : ''}${con ? ' is-con' : ' is-vacio'}" style="--c:${color}" data-evg-abrir="${dia}" aria-label="${esc(fLarga(dia))}">
        <span class="evg-dn"><b>${n}</b>${cierres.map((x) => `<span class="evg-cierre" title="Cierra la entrada a ${esc(x.name)}">${i('flag')}</span>`).join('')}${e?.origen === 'ia' && con ? `<span class="evg-ia" title="Lo redactó la IA">${i('bot')}</span>` : ''}</span>
        ${b ? `<span class="evg-marca">${i('lock')}<span>${esc(b.label)}</span></span>` : e?.skip ? `<span class="evg-marca">${i('ban')}<span>Saltado</span></span>` : tipoChip(tipo, { sugerido: !con })}
        ${con && !b ? `<span class="evg-asunto">${esc(e.subject || 'Sin asunto')}</span>${estadoPill(e)}` : b || e?.skip || pasado ? '' : `<span class="evg-mas">${i('plus')}Escribir</span>`}
      </button>`;
    }
    const delMes = Object.entries(d.emails).filter(([x]) => x.startsWith(st.mes));
    const nSalto = delMes.filter(([, e]) => e.skip).length;
    return `<div class="evg-calcab">
        <div class="evg-mesnav"><button type="button" class="evg-nav" data-evg-mes="-1" aria-label="Mes anterior">${i('arrow', 'evg-izq')}</button><b>${esc(titulo)}</b><button type="button" class="evg-nav" data-evg-mes="1" aria-label="Mes siguiente">${i('arrow')}</button>${st.mes !== d.hoy.slice(0, 7) ? `<button type="button" class="btn ghost small" data-evg-mes="hoy">Hoy</button>` : ''}</div>
        <div class="evg-resumen-mes"><span class="evg-pill" style="--c:#d93025">${i('ban')}${nSalto} saltado${nSalto === 1 ? '' : 's'}</span><span class="evg-pill" style="--c:#1f2a44">${i('lock')}${bloqueos.length} franja${bloqueos.length === 1 ? '' : 's'}</span></div>
      </div>
      <div class="evg-ley">${Object.keys(TIPOS).map((k) => tipoChip(k)).join('')}<span class="evg-ley-sep"></span><span class="evg-ley-i">${i('flag')}Cierre de entrada</span><span class="evg-ley-i">${i('bot')}Redactado por la IA</span></div>
      <div class="evg-grid">${WD.map((w, k) => `<div class="evg-wd${k > 4 ? ' is-finde' : ''}">${w}</div>`).join('')}${celdas}</div>
      ${vistaBloqueos(d)}`;
  }
  function vistaBloqueos(d) {
    const lista = [...d.estado.bloqueos].sort((a, b) => a.from.localeCompare(b.from));
    return `<section class="evg-card">
      <header class="evg-card-cab"><span class="evg-card-ico" style="--c:#1f2a44">${i('lock')}</span><div><h3>Franjas bloqueadas</h3><p>Esos días no se redacta ni se programa nada: lanzamientos, captación, emails que ya salen por otro lado…</p></div></header>
      ${lista.length ? `<ul class="evg-franjas">${lista.map((b) => `<li><span class="evg-franja-ico">${i('lock')}</span><div><b>${esc(b.label)}</b><small>${esc(fCorta(b.from))} → ${esc(fCorta(b.to))} · ${diasEntre(b.from, b.to) + 1} días</small></div>${d.admin ? `<button type="button" class="evg-icono-btn" data-evg-bloq-x="${esc(b.id)}" title="Quitar la franja" aria-label="Quitar la franja">${i('trash')}</button>` : ''}</li>`).join('')}</ul>` : '<p class="evg-vacio">No hay franjas bloqueadas.</p>'}
      ${d.admin ? `<div class="evg-fila evg-fila-bloq"><label class="evg-campo"><span>Nombre</span><input id="evg-bloq-nombre" placeholder="Captación lanzamiento marzo"></label><label class="evg-campo"><span>Desde</span><input type="date" id="evg-bloq-desde"></label><label class="evg-campo"><span>Hasta</span><input type="date" id="evg-bloq-hasta"></label><button type="button" class="btn primary" data-evg-bloq-add>${i('lock')}Bloquear</button></div>` : ''}
    </section>`;
  }

  function vistaFechas(d) {
    const dis = d.admin ? '' : ' disabled';
    return `<p class="evg-intro">${i('bulb')}<span>El tema del mes y la fecha de cierre de cada entregable. Los emails de <b>urgencia</b> salen solos en los 7 días antes del cierre y los de <b>curiosidad</b> entre 8 y 21 días antes. La IA usa el tema y las notas para redactarlos.</span></p>
      <div class="evg-ents">${d.estado.entregables.map((x) => {
        const k = x.date ? diasEntre(d.hoy, x.date) : null;
        const urg = k != null && k >= 0 && k <= 7;
        const frac = k == null || k < 0 ? 0 : Math.max(0.04, 1 - Math.min(k, 30) / 30);
        return `<section class="evg-ent${urg ? ' is-urgente' : ''}" data-evg-ent="${esc(x.id)}">
          <header class="evg-ent-cab"><span class="evg-card-ico" style="--c:${urg ? '#d9480f' : 'var(--accent)'}">${i(ICO_ENT[x.id] || 'flag')}</span><h3>${esc(x.name)}</h3>
            <span class="evg-anillo" style="--p:${frac}" title="${k == null ? 'Sin fecha' : k < 0 ? 'Cerrada' : `Faltan ${k} días`}"><b>${k == null ? '–' : k < 0 ? '✓' : k}</b><small>${k == null ? 'sin fecha' : k < 0 ? 'cerrada' : k === 1 ? 'día' : 'días'}</small></span></header>
          <label class="evg-campo"><span>Tema del mes</span><input data-k="topic" value="${esc(x.topic)}" placeholder="La caída de Constantinopla"${dis}></label>
          <label class="evg-campo"><span>Fecha límite de entrada</span><input type="date" data-k="date" value="${esc(x.date)}"${dis}></label>
          <label class="evg-campo"><span>Notas para la IA <small>opcional</small></span><textarea data-k="desc" rows="3" placeholder="Qué es, qué incluye, qué no hay que contar…"${dis}>${esc(x.desc)}</textarea></label>
        </section>`;
      }).join('')}</div>
      ${d.admin ? `<div class="evg-pie-acc"><button type="button" class="btn primary" data-evg-guardar="fechas">${i('save')}Guardar las fechas límite</button></div>` : '<p class="evg-vacio">Solo una persona admin cambia las fechas límite.</p>'}`;
  }

  function vistaEnvio(d, c) {
    const dis = d.admin ? '' : ' disabled';
    const a = st.audiencia;
    const modo = st.modo || c.modo;
    const est = a?.contactos != null ? estimarLotes(a.contactos, c.lotes, c.sendTime) : null;
    const nBarras = est ? Math.min(est.lotes, 40) : 0;
    const campo = (id, t, v, extra = '') => `<label class="evg-campo"><span>${t}</span><input id="evg-c-${id}" value="${esc(v)}"${extra}${dis}></label>`;
    return `<div class="evg-modos" role="radiogroup" aria-label="Simulación o envío real">
        <label class="evg-modo-card${modo !== 'real' ? ' is-on' : ''}"><input type="radio" name="evg-modo" value="simulacion"${modo !== 'real' ? ' checked' : ''}${dis}><span class="evg-modo-ico" style="--c:#c98a00">${i('flask')}</span><span><b>Simulación</b><small>A las 20:00 solo apunta en el registro lo que programaría. No toca GHL.</small></span></label>
        <label class="evg-modo-card is-real${modo === 'real' ? ' is-on' : ''}"><input type="radio" name="evg-modo" value="real"${modo === 'real' ? ' checked' : ''}${dis}><span class="evg-modo-ico" style="--c:#138a4b">${i('rocket')}</span><span><b>Envío real</b><small>A las 20:00 crea la campaña en GHL con el email aprobado de mañana y la programa en lotes.</small></span></label>
      </div>
      <section class="evg-card">
        <header class="evg-card-cab"><span class="evg-card-ico" style="--c:var(--tone-live)">${i('box')}</span><div><h3>Envío en lotes</h3><p>Siempre en lotes pequeños, para que los proveedores de correo no lo vean como spam.</p></div></header>
        <div class="evg-lotes">
          <label class="evg-num"><span>Contactos por lote</span><input type="number" id="evg-c-tamano" min="10" max="2000" value="${c.lotes.tamano}"${dis}></label>
          <span class="evg-lotes-x">${i('clock')}</span>
          <label class="evg-num"><span>Minutos entre lotes</span><input type="number" id="evg-c-cada" min="1" max="120" value="${c.lotes.cada}"${dis}></label>
        </div>
        ${est ? `<div class="evg-tren" aria-label="${est.lotes} lotes">${Array.from({ length: nBarras }, (_, k) => `<i style="--k:${k}"></i>`).join('')}${est.lotes > nBarras ? `<span>+${est.lotes - nBarras}</span>` : ''}</div>
          <p class="evg-tren-pie"><span>${i('play')}${esc(c.sendTime)} · primer lote</span><b>${a.contactos.toLocaleString('es-ES')} contactos · ${est.lotes} ${est.lotes === 1 ? 'lote' : 'lotes'}</b><span>${i('flag')}${esc(est.fin)}${est.otroDia ? ' (día siguiente)' : ''} · último</span></p>
          ${est.otroDia ? `<p class="evg-aviso">${i('alert')}Son demasiados lotes para un día: sube el tamaño o baja los minutos.</p>` : ''}` : a?.error ? `<p class="evg-aviso">${i('alert')}${esc(a.error)}</p>` : '<p class="evg-vacio">Elige la etiqueta de audiencia para ver cuánto tarda en salir.</p>'}
      </section>
      <section class="evg-card">
        <header class="evg-card-cab"><span class="evg-card-ico" style="--c:var(--tone-info)">${i('user')}</span><div><h3>Remitente y audiencia</h3><p>Quién lo envía y a qué etiqueta de GHL llega.</p></div></header>
        <div class="evg-form">
          ${campo('fromName', 'Nombre del remitente', c.fromName)}${campo('fromEmail', 'Email del remitente', c.fromEmail, ' type="email" placeholder="hola@tudominio.com"')}${campo('replyTo', 'Responder a <small>opcional</small>', c.replyTo)}
          ${campo('audienceTag', `Etiqueta que lo recibe${a?.contactos != null ? ` <small>${a.contactos.toLocaleString('es-ES')} contactos</small>` : ''}`, c.audienceTag, ' list="evg-etiquetas" placeholder="Busca una etiqueta de GHL"')}
          ${campo('sendTime', 'Hora de envío por defecto', c.sendTime, ' type="time"')}${campo('ghlUserId', 'Usuario de GHL que programa <small>su id</small>', c.ghlUserId)}
        </div>
        <datalist id="evg-etiquetas">${(a?.etiquetas || []).map((t) => `<option value="${esc(t)}"></option>`).join('')}</datalist>
        <label class="evg-campo"><span>Pie legal <small>se añade al final de cada email</small></span><textarea id="evg-c-pie" rows="4"${dis}>${esc(c.pie)}</textarea></label>
      </section>
      ${d.admin ? `<div class="evg-pie-acc"><button type="button" class="btn ghost" data-evg-op="simular">${i('flask')}Probar la tarea de las 20:00</button>${c.modo === 'real' ? `<button type="button" class="btn ghost" data-evg-op="programar-ahora">${i('rocket')}Programar ahora el de mañana</button>` : ''}<button type="button" class="btn primary" data-evg-guardar="envio">${i('save')}Guardar</button></div>` : '<p class="evg-vacio">Solo una persona admin cambia el envío.</p>'}`;
  }

  function vistaCtas(d) {
    const ctas = st.ctasEdit || d.estado.ctas;
    const dis = d.admin ? '' : ' disabled';
    return `<p class="evg-intro">${i('link')}<span>Los botones de los emails. Cada email elige el suyo y la IA los ve con su id.</span></p>
      <div class="evg-ctas">${ctas.map((c, k) => `<div class="evg-cta" data-evg-cta="${k}">
        <span class="evg-cta-boton" aria-hidden="true">${esc(c.name || 'Texto del botón')}</span>
        <div class="evg-cta-campos"><label class="evg-campo"><span>Texto del botón</span><input data-k="name" value="${esc(c.name)}" placeholder="Entrar a Claves"${dis}></label><label class="evg-campo"><span>Enlace</span><input data-k="url" value="${esc(c.url)}" placeholder="https://…"${dis}></label><label class="evg-campo"><span>Para qué emails</span><input data-k="use" value="${esc(c.use)}" placeholder="Urgencia y curiosidad"${dis}></label></div>
        ${d.admin ? `<button type="button" class="evg-icono-btn" data-evg-cta-x="${k}" title="Quitar" aria-label="Quitar el CTA">${i('trash')}</button>` : ''}
      </div>`).join('') || `<div class="evg-vacio-grande">${i('link')}<p>Aún no hay CTAs. Añade los enlaces de compra, del grupo de WhatsApp y de las clases.</p></div>`}</div>
      ${d.admin ? `<div class="evg-pie-acc"><button type="button" class="btn ghost" data-evg-cta-add>${i('plus')}Añadir CTA</button><button type="button" class="btn primary" data-evg-guardar="ctas">${i('save')}Guardar los CTAs</button></div>` : ''}`;
  }

  function vistaRegistro(d) {
    const T = { programado: ['rocket', '#138a4b'], simulación: ['flask', '#c98a00'], aviso: ['alert', '#d9480f'], error: ['x', '#c0362c'], aprobado: ['check', '#2f6aa8'], desaprobado: ['refresh', '#8c857e'], 'sin envío': ['ban', '#8c857e'] };
    return d.registro.length ? `<ol class="evg-linea">${d.registro.map((r) => { const [ico, c] = T[r.accion] || ['history', '#8c857e']; return `<li style="--c:${c}"><span class="evg-linea-ico">${i(ico)}</span><div class="evg-linea-txt"><p><b>${esc(may(r.accion))}</b>${r.dia ? ` · email del ${esc(fCorta(r.dia))}` : ''}</p>${r.detalle ? `<p class="evg-linea-det">${esc(r.detalle)}</p>` : ''}<small>${esc(new Date(r.at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }))}${r.quien ? ` · ${esc(r.quien)}` : ''}</small></div></li>`; }).join('')}</ol>`
      : `<div class="evg-vacio-grande">${i('history')}<p>Aquí sale lo que hace cada tarde la tarea de las 20:00 y cada aprobación.</p></div>`;
  }

  function vistaComo() {
    const url = `${location.origin}/api/email-diario?c=${encodeURIComponent(cliente())}&key=TU_DIGEST_KEY&tarea=`;
    const f = (hora, ico, c, t, txt) => `<li style="--c:${c}"><span class="evg-flujo-hora">${hora}</span><span class="evg-flujo-ico">${i(ico)}</span><b>${t}</b><p>${txt}</p></li>`;
    return `<ol class="evg-flujo">
        ${f('07:00', 'bot', 'var(--tone-live)', 'La IA escribe', 'Cowork redacta el email de mañana con tu voz, tu estructura y tus ejemplos, y lo deja aquí como borrador.')}
        ${f('Durante el día', 'eye', 'var(--tone-vip)', 'Lo revisas', 'Lo abres, cambias lo que haga falta y miras la vista previa tal cual llegará.')}
        ${f('Cuando esté listo', 'check', 'var(--tone-info)', 'Admin lo aprueba', 'Sin aprobar no se programa nada. Si cambia el texto después, hay que volver a aprobarlo.')}
        ${f('20:00', 'rocket', 'var(--tone-accent)', 'AlquimIA lo programa', 'En GHL, para su hora del día siguiente y siempre en lotes pequeños. Ya no se puede cambiar.')}
        ${f('Después', 'chart', 'var(--tone-buy)', 'Mides', 'AlquimIA lee de GHL los entregados, la apertura, los clics y las bajas de cada email.')}
      </ol>
      <p class="evg-intro">${i('flask')}<span><b>La prueba</b> la haces tú a mano desde GHL («Enviar prueba») antes de activar el envío real.</span></p>
      <div class="evg-dos">
        <section class="evg-card"><header class="evg-card-cab"><span class="evg-card-ico" style="--c:var(--tone-live)">${i('bot')}</span><div><h3>La tarea de Cowork</h3><p>Cada día a las 07:00, en el proyecto con tu guía de estilo, tu estructura y tus ejemplos, y el conector de AlquimIA activado.</p></div></header>
          <pre class="evg-pre" id="evg-prompt">${esc(promptCowork(cliente()))}</pre><button type="button" class="btn ghost" data-evg-copiar="evg-prompt">${i('clipboard')}Copiar el texto</button></section>
        <section class="evg-card"><header class="evg-card-cab"><span class="evg-card-ico" style="--c:var(--tone-accent)">${i('clock')}</span><div><h3>Las tareas de AlquimIA</h3><p>En cron-job.org, hora de Madrid, como el resumen diario. Cambia TU_DIGEST_KEY por tu DIGEST_KEY. No dependen de ningún ordenador.</p></div></header>
          <ul class="evg-cron"><li><span class="evg-cron-hora">20:00</span><div><b>Programar el de mañana</b><code>${esc(url)}programar</code></div></li><li><span class="evg-cron-hora">12:00</span><div><b>Aviso si mañana no está listo</b><code>${esc(url)}revisar</code></div></li></ul></section>
      </div>`;
  }

  // ---------- Editor de un día (con la vista previa en vivo) ----------
  function pintarEditor() {
    const d = st.datos;
    const dia = st.abierto;
    const e = d.emails[dia] || { type: tipoSugerido(d.estado.entregables, dia), subject: '', preheader: '', body: '', cta: '', sendTime: '', status: 'borrador', skip: false };
    const b = bloqueoDe(d.estado.bloqueos, dia);
    const cerrado = BLOQUEADO.has(e.status);
    const dis = cerrado || st.ocupado ? ' disabled' : '';
    const cierre = proximoCierre(d.estado.entregables, dia);
    const avisos = [
      b && ['lock', `Este día está en la franja bloqueada «${b.label}»: no se programa nada.`],
      e.skip && ['ban', 'Día saltado: no se programa nada.'],
      e.nota && ['refresh', e.nota],
      cerrado && ['clock', `${ESTADOS[e.status].label}: GHL ya tiene esta versión y no se puede cambiar.`],
    ].filter(Boolean);
    dlg.innerHTML = `<div class="evg-ed">
      <header class="evg-ed-cab">${tileFecha(dia)}<div class="evg-ed-tit"><h3>${esc(fLarga(dia))}</h3><p>${cierre ? `${i('flag')} Próximo cierre: <b>${esc(cierre.name)}</b> el ${esc(fCorta(cierre.date))}${cierre.topic ? ` · ${esc(cierre.topic)}` : ''}` : 'Sin fechas límite cerca'}</p></div>
        <button type="button" class="evg-icono-btn" data-evg-cerrar aria-label="Cerrar">${i('x')}</button></header>
      ${pasos(e.subject || e.body ? e : null, { compacto: true })}
      <p class="evg-ed-quien">${e.origen === 'ia' ? `<span class="evg-pill" style="--c:var(--tone-live)">${i('bot')}Redactado por la IA</span>` : ''}${e.aprobado ? `<span class="evg-pill" style="--c:var(--tone-info)">${i('check')}Aprobado por ${esc(e.aprobado.por)}</span>` : ''}${e.editado?.por ? `<span class="muted">Último cambio: ${esc(e.editado.por)}</span>` : ''}</p>
      ${avisos.map(([ico, t]) => `<p class="evg-aviso">${i(ico)}${esc(t)}</p>`).join('')}
      <div class="evg-ed-cols">
        <div class="evg-ed-form">
          <fieldset class="evg-tipos"${dis}><legend>Tipo de email</legend>${Object.entries(TIPOS).map(([k, t]) => `<label class="evg-tipo-op" style="--c:${t.color}" title="${esc(t.pista)}"><input type="radio" name="evg-e-type" value="${k}"${k === e.type ? ' checked' : ''}>${i(t.icono)}<span>${esc(t.corto)}</span></label>`).join('')}</fieldset>
          <label class="evg-campo"><span>Asunto <small class="evg-cuenta${e.subject.length > 50 ? ' is-largo' : ''}" id="evg-e-cuenta">${e.subject.length}/50</small></span><input id="evg-e-subject" value="${esc(e.subject)}" maxlength="150" placeholder="Corto y con gancho"${dis}></label>
          <label class="evg-campo"><span>Preheader <small>el texto que se ve junto al asunto</small></span><input id="evg-e-preheader" value="${esc(e.preheader)}"${dis}></label>
          <label class="evg-campo"><span>Cuerpo <small>línea en blanco entre párrafos · **negrita** · [CTA] donde va el botón</small></span><textarea id="evg-e-body" rows="13"${dis}>${esc(e.body)}</textarea></label>
          <div class="evg-form evg-form-2">
            <label class="evg-campo"><span>Botón (CTA)</span><select id="evg-e-cta"${dis}><option value="">Sin botón</option>${d.estado.ctas.map((c) => `<option value="${esc(c.id)}"${c.id === e.cta ? ' selected' : ''}>${esc(c.name || c.id)}</option>`).join('')}</select></label>
            <label class="evg-campo"><span>Hora de envío</span><input type="time" id="evg-e-sendTime" value="${esc(e.sendTime || d.estado.config.sendTime)}"${dis}></label>
          </div>
          ${e.m ? `<div class="evg-met">${[['mail', 'Entregados', (e.m.entregados || 0).toLocaleString('es-ES')], ['eye', 'Apertura', pct(e.m.apertura)], ['link', 'Clics', pct(e.m.ctr)], ['logout', 'Bajas', e.m.bajas || 0]].map(([ico, t, v]) => `<div>${i(ico)}<b>${v}</b><small>${t}</small></div>`).join('')}</div>` : ''}
        </div>
        <div class="evg-ed-vista">
          <div class="evg-correo">
            <div class="evg-correo-barra"><i></i><i></i><i></i><span>Vista previa</span></div>
            <div class="evg-correo-cab"><span class="evg-correo-av">${esc((d.estado.config.fromName || '?').charAt(0).toUpperCase())}</span><div><b>${esc(d.estado.config.fromName || 'Remitente')}</b><small>${esc(d.estado.config.fromEmail || '')}</small></div><span class="evg-correo-hora" id="evg-v-hora">${esc(e.sendTime || d.estado.config.sendTime)}</span></div>
            <p class="evg-correo-asunto" id="evg-v-asunto">${esc(e.subject || 'Sin asunto')}</p>
            <p class="evg-correo-pre" id="evg-v-pre">${esc(e.preheader || '')}</p>
            <iframe class="evg-iframe" id="evg-v-frame" title="Vista previa del email" sandbox></iframe>
          </div>
        </div>
      </div>
      <footer class="evg-ed-acc">
        ${cerrado ? '<span class="muted">Ya está en GHL: no se puede cambiar.</span>' : `<button type="button" class="btn ghost" data-evg-ed="saltar">${i(e.skip ? 'refresh' : 'ban')}${e.skip ? 'Reactivar este día' : 'Saltar este día'}</button>
        <span class="evg-ed-acc-der">
          <button type="button" class="btn ghost" data-evg-ed="guardar">${i('save')}Guardar</button>
          ${e.status === 'aprobado' ? (d.admin ? `<button type="button" class="btn ghost" data-evg-ed="desaprobar">${i('refresh')}Quitar la aprobación</button>` : '') : `${e.status !== 'listo' ? `<button type="button" class="btn ghost" data-evg-ed="listo">${i('eye')}Listo para revisar</button>` : ''}${d.admin ? `<button type="button" class="btn evg-aprobar" data-evg-ed="aprobar">${i('check')}Aprobar para el envío</button>` : ''}`}
        </span>`}
      </footer>
    </div>`;
    if (!dlg.open) dlg.showModal();
    vistaEnVivo();
  }
  const leerEditor = () => {
    const v = (id) => dlg.querySelector(`#evg-e-${id}`)?.value ?? '';
    return { type: dlg.querySelector('input[name="evg-e-type"]:checked')?.value || null, subject: v('subject'), preheader: v('preheader'), body: v('body'), cta: v('cta'), sendTime: v('sendTime') === st.datos.estado.config.sendTime ? '' : v('sendTime') };
  };
  function vistaEnVivo() {
    const f = dlg.querySelector('#evg-v-frame');
    if (!f) return;
    const e = { ...(st.datos.emails[st.abierto] || {}), ...leerEditor() };
    f.srcdoc = htmlEmail(e, { ctas: st.datos.estado.ctas, pie: st.datos.estado.config.pie, preheader: e.preheader });
    dlg.querySelector('#evg-v-asunto').textContent = e.subject || 'Sin asunto';
    dlg.querySelector('#evg-v-pre').textContent = e.preheader || '';
    dlg.querySelector('#evg-v-hora').textContent = e.sendTime || st.datos.estado.config.sendTime;
    const n = e.subject.length;
    const cuenta = dlg.querySelector('#evg-e-cuenta');
    cuenta.textContent = `${n}/50`;
    cuenta.classList.toggle('is-largo', n > 50);
  }
  let tVista = 0;
  dlg.addEventListener('input', () => { clearTimeout(tVista); tVista = setTimeout(vistaEnVivo, 220); });
  dlg.addEventListener('change', () => vistaEnVivo());

  // ---------- Eventos ----------
  body.addEventListener('change', (ev) => {
    if (ev.target.name === 'evg-modo') { st.modo = ev.target.value; for (const c of body.querySelectorAll('.evg-modo-card')) c.classList.toggle('is-on', c.querySelector('input').checked); }
  });
  body.addEventListener('input', (ev) => {
    const c = ev.target.closest('[data-evg-cta]');
    if (c && ev.target.dataset.k === 'name') c.querySelector('.evg-cta-boton').textContent = ev.target.value || 'Texto del botón';
  });
  body.addEventListener('click', async (ev) => {
    const el = ev.target.closest('button');
    if (!el) return;
    const d = st.datos;
    if ('evgCerrarMsg' in el.dataset) { st.msg = ''; st.error = ''; pintar(); return; }
    if (el.dataset.evgTab) { st.tab = el.dataset.evgTab; ls?.set('lsd_evg_tab', st.tab); st.msg = ''; pintar(); if (st.tab === 'envio' && !st.audiencia) cargarAudiencia(); return; }
    if (el.dataset.evgMes) {
      if (el.dataset.evgMes === 'hoy') { cargar(d.hoy.slice(0, 7)); return; }
      const [y, m] = st.mes.split('-').map(Number);
      const n = new Date(Date.UTC(y, m - 1 + Number(el.dataset.evgMes), 1));
      cargar(`${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}`);
      return;
    }
    if (el.dataset.evgAbrir) { st.abierto = el.dataset.evgAbrir; pintarEditor(); return; }
    if (el.dataset.evgOp) { await post(el.dataset.evgOp); return; }
    if (el.dataset.evgCopiar) { const t = document.getElementById(el.dataset.evgCopiar).textContent; try { await navigator.clipboard.writeText(t); el.innerHTML = `${i('check')}Copiado`; } catch { window.prompt('Copia el texto:', t); } return; }
    if ('evgBloqAdd' in el.dataset) {
      const label = body.querySelector('#evg-bloq-nombre').value.trim() || 'Bloqueado';
      const from = body.querySelector('#evg-bloq-desde').value;
      const to = body.querySelector('#evg-bloq-hasta').value;
      if (!from || !to || to < from) { st.error = 'Pon la fecha de inicio y la de fin (la de fin, igual o posterior).'; pintar(); return; }
      await post('ajustes', { bloqueos: [...d.estado.bloqueos, { id: Date.now().toString(36), label, from, to }] }, `Franja «${label}» bloqueada.`);
      return;
    }
    if (el.dataset.evgBloqX) { await post('ajustes', { bloqueos: d.estado.bloqueos.filter((b) => b.id !== el.dataset.evgBloqX) }, 'Franja quitada.'); return; }
    if ('evgCtaAdd' in el.dataset) { st.ctasEdit = [...leerCtas(), { id: `cta${Date.now().toString(36)}`, name: '', url: '', use: '' }]; pintar(); return; }
    if (el.dataset.evgCtaX) { const l = leerCtas(); l.splice(Number(el.dataset.evgCtaX), 1); st.ctasEdit = l; pintar(); return; }
    if (el.dataset.evgGuardar === 'ctas') { const r = await post('ajustes', { ctas: leerCtas() }, 'CTAs guardados.'); if (r) { st.ctasEdit = null; pintar(); } return; }
    if (el.dataset.evgGuardar === 'fechas') {
      const entregables = d.estado.entregables.map((x) => { const c = body.querySelector(`[data-evg-ent="${x.id}"]`); const v = (k) => c.querySelector(`[data-k="${k}"]`).value; return { ...x, topic: v('topic'), date: v('date'), desc: v('desc') }; });
      await post('ajustes', { entregables }, 'Fechas límite guardadas. Los tipos de urgencia y curiosidad se recalculan solos en los días sin tipo.');
      return;
    }
    if (el.dataset.evgGuardar === 'envio') {
      const v = (id) => body.querySelector(`#evg-c-${id}`).value;
      const modo = body.querySelector('input[name="evg-modo"]:checked')?.value || 'simulacion';
      if (modo === 'real' && d.estado.config.modo !== 'real' && !window.confirm('¿Activar el envío real? Desde esta tarde, a las 20:00, AlquimIA programará en GHL el email aprobado de mañana para toda la etiqueta. Haz antes la prueba a mano desde GHL.')) return;
      const r = await post('ajustes', { config: { fromEmail: v('fromEmail'), fromName: v('fromName'), replyTo: v('replyTo'), audienceTag: v('audienceTag'), sendTime: v('sendTime'), ghlUserId: v('ghlUserId'), pie: v('pie'), lotes: { tamano: Number(v('tamano')), cada: Number(v('cada')) }, modo } }, 'Envío guardado.');
      if (r) { st.modo = null; st.audiencia = null; cargarAudiencia(); }
    }
  });
  const leerCtas = () => [...body.querySelectorAll('[data-evg-cta]')].map((f, k) => ({ id: (st.ctasEdit || st.datos.estado.ctas)[k]?.id || `cta${k + 1}`, name: f.querySelector('[data-k="name"]').value, url: f.querySelector('[data-k="url"]').value, use: f.querySelector('[data-k="use"]').value }));

  dlg.addEventListener('click', async (ev) => {
    if (ev.target === dlg || ev.target.closest('[data-evg-cerrar]')) { st.abierto = null; dlg.close(); return; }
    const b = ev.target.closest('[data-evg-ed]');
    if (!b) return;
    const dia = st.abierto;
    const acc = b.dataset.evgEd;
    if (acc === 'guardar') await post('email', { dia, email: leerEditor() }, 'Guardado.');
    else if (acc === 'listo') await post('email', { dia, email: { ...leerEditor(), status: 'listo' } }, 'Marcado como listo para revisar.');
    else if (acc === 'saltar') await post('saltar', { dia, skip: !st.datos.emails[dia]?.skip }, st.datos.emails[dia]?.skip ? 'Día reactivado.' : 'Día saltado: no saldrá email.');
    else if (acc === 'desaprobar') await post('desaprobar', { dia }, 'Aprobación quitada: no se programará.');
    else if (acc === 'aprobar') {
      const r = await post('email', { dia, email: leerEditor() });
      if (r) await post('aprobar', { dia }, `Aprobado. Se programa a las 20:00 del ${fCorta(sumarDias(dia, -1))}.`);
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
