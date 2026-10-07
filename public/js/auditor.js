// Auditor de lanzamientos: revisa configuración, tareas, equipo y datos y dice qué falta, con qué
// urgencia (según lo cerca que está cada hito) y dónde se arregla. Lo usa el navegador.
//   nivel: 'critico' | 'importante' | 'aviso'
//   accion: { tipo: 'campo', id } (Configuración) | { tipo: 'tarea', id } | { tipo: 'vista', v } | { tipo: 'vsl', tab }
import { watched } from './scoring.js';
import { videosDe, nClases, conVip } from './videos.js';
import { SUBTIPOS_VSL, subtipoValido, conPrep } from './embudos-def.js';

const DAY = 86_400_000;
const dia = (v) => String(v || '').slice(0, 10);
const diasHasta = (d, hoy) => (d ? Math.round((Date.parse(`${dia(d)}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / DAY) : null);
const fmt = (d) => new Date(`${dia(d)}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const cuando = (n) => (n == null ? '' : n < 0 ? `hace ${-n} día${n === -1 ? '' : 's'}` : n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`);

// Urgencia de algo que tiene que estar listo antes de un hito: pasado o ≤3 días → crítico; ≤10 → importante.
function urgencia(n, { sinFecha = 'importante' } = {}) {
  if (n == null) return sinFecha;
  if (n <= 3) return 'critico';
  if (n <= 10) return 'importante';
  return 'aviso';
}

// Hitos del lanzamiento con su día.
export function hitosAuditor(l) {
  const directo = dia(l.fechaDirecto);
  const replay = dia(l.replayAt) || (directo ? new Date(Date.parse(`${directo}T12:00:00Z`) + DAY).toISOString().slice(0, 10) : '');
  return {
    captacion: { d: dia(l.inicioCaptacion), label: 'el inicio de la captación' },
    clase1: { d: dia(l.clase1At), label: 'la clase 1' },
    clase2: { d: nClases(l) >= 2 ? dia(l.clase2At) : '', label: 'la clase 2' },
    clase3: { d: nClases(l) >= 3 ? dia(l.clase3At) : '', label: 'la clase 3' },
    directo: { d: directo, label: videosDe(l).length > 1 ? `el ${videosDe(l)[0].nombre}` : 'el webinar en directo' },
    carrito: { d: dia(l.aperturaCarrito) || dia(videosDe(l).at(-1)?.fecha) || directo, label: 'la apertura del carrito' },
    replay: { d: replay, label: 'la grabación' },
    cierre: { d: dia(l.cierreCarrito), label: 'el cierre del carrito' },
  };
}

/**
 * @param {object} p
 *   launch, code, otros: [[code, launch]] (otros lanzamientos), tareas: [] | null, users: [], roles: [],
 *   hoy: 'YYYY-MM-DD', tagsGhl: string[] | null, leads: [] | null (enriquecidos), pestanas: string[] | null,
 *   zoom: bool, meta: { configured, error } | null, llamadas: { configurado, motivo } | null
 */
export function auditarLanzamiento(p) {
  const { launch: l, otros = [], hoy } = p;
  const on = (v) => !p.pestanas || p.pestanas.includes(v);
  const out = [];
  const add = (nivel, area, titulo, detalle = '', accion = null) => out.push({ nivel, area, titulo, detalle, accion });
  const campo = (id) => ({ tipo: 'campo', id });
  const H = hitosAuditor(l);
  const n = (k) => diasHasta(H[k].d, hoy);
  const ya = (k) => H[k].d && H[k].d <= hoy;
  const antesDe = (k) => (H[k].d ? `Hace falta para ${H[k].label} (${fmt(H[k].d)}, ${cuando(n(k))}).` : '');

  // ---- Fechas ----
  for (const [k, id, t] of [['inicioCaptacion', 'cfg-inicio', 'Falta el inicio de la captación'], ['fechaDirecto', 'cfg-directo-fecha', 'Falta el día del webinar en directo'], ['cierreCarrito', 'cfg-cierre', 'Falta el cierre del carrito']]) {
    if (!l[k]) add('critico', 'Fechas', t, 'Sin esta fecha no se calculan las fases, la página preclase, el calendario ni las tareas.', campo(id));
  }
  if (l.fechaDirecto && !l.horaDirecto) add('critico', 'Fechas', 'Falta la hora del webinar en directo', 'La página y los recordatorios no saben a qué hora empieza.', campo('cfg-directo-hora'));
  // Lanzamientos de varios vídeos: cada vídeo con su día, su hora, en orden, y su página y vídeo antes de que toque.
  const vids = videosDe(l);
  for (const v of vids.slice(1)) {
    const nv = diasHasta(v.fecha, hoy);
    if (!v.fecha) add('critico', 'Fechas', `Falta el día del ${v.nombre}`, 'Sin él no se calculan las fases de la página, el calendario ni el carrito.', campo(`cfg-v${v.k}-fecha`));
    else if (!v.hora) add('critico', 'Fechas', `Falta la hora del ${v.nombre}`, 'La página no sabe a qué hora se publica.', campo(`cfg-v${v.k}-hora`));
    const ant = vids[v.k - 2];
    if (v.fecha && ant.fecha && v.fecha < ant.fecha) add('critico', 'Fechas', `El ${v.nombre} es antes que el ${ant.nombre}`, 'Revisa el orden de los días de los vídeos.', campo(`cfg-v${v.k}-fecha`));
    if (v.fecha && (nv == null || nv >= -1)) {
      if (!v.replayVideoUrl) add(urgencia(nv), 'Páginas y vídeos', `Falta el vídeo del ${v.nombre}`, `Sin él la página no lo enseña. ${v.fecha ? `Se publica el ${fmt(v.fecha)} (${cuando(nv)}).` : ''}`, campo(`cfg-v${v.k}-replay-video`));
      if (!v.replayUrl) add(urgencia(nv), 'Páginas y vídeos', `Falta la página del ${v.nombre}`, 'Es adonde manda la página preclase y el WhatsApp cuando toca este vídeo.', campo(`cfg-v${v.k}-replay`));
    }
  }
  for (const [k, id, t] of [1, 2, 3].slice(0, nClases(l)).map((i) => [`clase${i}At`, `cfg-clase${i}-at`, `Falta cuándo se desbloquea la clase ${i}`])) {
    if (!l[k]) add(urgencia(n('directo')), 'Fechas', t, 'La página preclase no sabrá cuándo enseñarla.', campo(id));
  }
  const orden = [['captacion', 'el inicio de captación'], ['clase1', 'la clase 1'], ['clase2', 'la clase 2'], ['clase3', 'la clase 3'], ['directo', 'el directo'], ['cierre', 'el cierre del carrito']].filter(([k]) => H[k].d);
  for (let i = 1; i < orden.length; i++) {
    if (H[orden[i][0]].d < H[orden[i - 1][0]].d) add('critico', 'Fechas', `Fechas descolocadas: ${orden[i][1]} es antes que ${orden[i - 1][1]}`, `${fmt(H[orden[i][0]].d)} frente a ${fmt(H[orden[i - 1][0]].d)}.`, campo('cfg-inicio'));
  }

  // ---- Etiquetas ----
  const existe = (t) => !p.tagsGhl || p.tagsGhl.map((x) => String(x).toLowerCase()).includes(String(t).toLowerCase());
  if (!l.registroTag) add('critico', 'Etiquetas', 'Falta la etiqueta de registro', 'Sin ella no hay leads en el dashboard.', campo('cfg-registro'));
  else {
    const repetida = otros.find(([, o]) => o.registroTag && o.registroTag === l.registroTag);
    if (repetida) add('critico', 'Etiquetas', `La etiqueta de registro es la misma que la de «${repetida[1].name}»`, 'Cada lanzamiento necesita su propia etiqueta de registro, si no se mezclan los leads.', campo('cfg-registro'));
    if (!existe(l.registroTag)) add(ya('captacion') ? 'critico' : urgencia(n('captacion')), 'Etiquetas', `La etiqueta «${l.registroTag}» todavía no existe en GHL`, 'Créala y ponla en el formulario (o su workflow) de registro.', campo('cfg-registro'));
  }
  if (!l.compraTag) add('importante', 'Etiquetas', 'Falta la etiqueta de compra del programa', 'No se contarán las ventas.', campo('cfg-compra'));
  else if (!existe(l.compraTag)) add('importante', 'Etiquetas', `La etiqueta de compra «${l.compraTag}» no existe en GHL`, 'Revisa que el workflow de compra la pone.', campo('cfg-compra'));
  if (conVip(l) && l.vipTag && !existe(l.vipTag)) add('importante', 'Etiquetas', `La etiqueta VIP «${l.vipTag}» no existe en GHL`, '', campo('cfg-vip'));
  const sinFoto = [['vipTag', 'VIP'], ['compraTag', 'compra'], ['llamadaTag', 'llamada']].filter(([f]) => l[f] && (f !== 'vipTag' || conVip(l)) && l.snapshot?.tags?.[f] !== l[f]);
  if (sinFoto.length) add('importante', 'Etiquetas', `Falta la «foto» de ${sinFoto.map(([, t]) => t).join(', ')}`, 'Quien ya tenía esas etiquetas de lanzamientos anteriores cuenta como de este (aviso arriba del dashboard: «Hacer la foto ahora»).', null);
  if (!l.compraDateField) add('importante', 'Etiquetas', 'Falta el campo de fecha de compra', 'Sin él no salen las ventas por día del carrito.', campo('cfg-compra-fecha'));

  // ---- Enlaces y páginas, según el hito para el que hacen falta ----
  const enlaces = [
    ['whatsappUrl', 'cfg-whatsapp-url', 'el enlace del grupo de WhatsApp', 'captacion'],
    // Área de recursos preclase (si el embudo la tiene): sus páginas y la clase 1.
    ...(nClases(l) >= 1 ? [
      ['loginUrl', 'cfg-login-url', 'la página de login', 'clase1'],
      ['recursosUrl', 'cfg-recursos-url', 'la página preclase', 'clase1'],
      ['clase1Url', 'cfg-clase1-url', 'el vídeo de la clase 1', 'clase1'],
    ] : []),
    ...(nClases(l) >= 2 ? [['clase2Url', 'cfg-clase2-url', 'el vídeo de la clase 2', 'clase2']] : []),
    ...(nClases(l) >= 3 ? [['clase3Url', 'cfg-clase3-url', 'el vídeo de la clase 3', 'clase3']] : []),
    ['zoomMeetingId', 'cfg-zoom-id', 'el ID de la reunión de Zoom', 'directo'],
    ['raicesUrl', 'cfg-raices', 'la página de venta', 'carrito'],
    ['ventaUrl', 'cfg-venta', 'el enlace de pago único', 'carrito'],
    ['precioPrograma', 'cfg-precio-programa', 'el precio del programa', 'carrito'],
    ['replayUrl', 'cfg-replay', 'la página de la grabación', 'replay'],
    ['replayVideoUrl', 'cfg-replay-video', 'el vídeo de la grabación', 'replay'],
  ];
  if (conVip(l) && l.vipTag) enlaces.push(['vipUrl', 'cfg-vip-url', 'el enlace de pago de la entrada VIP', 'captacion'], ['precioVip', 'cfg-precio-vip', 'el precio de la VIP', 'captacion']);
  if (on('llamadas')) enlaces.push(['llamadaUrl', 'cfg-llamada', 'el enlace para reservar llamada', 'directo']);
  for (const [k, id, t, hito] of enlaces) {
    if (l[k]) continue;
    const yaPaso = H[hito].d && H[hito].d < hoy && hito !== 'captacion';
    if (yaPaso && ['clase1', 'clase2', 'clase3'].includes(hito)) continue; // ya no tiene arreglo útil
    add(urgencia(n(hito)), 'Enlaces y páginas', `Falta ${t}`, antesDe(hito), campo(id));
  }
  // Repetidos del lanzamiento anterior (copiados al duplicar y sin cambiar).
  const ultimo = otros.slice().sort((a, b) => String(b[1].createdAt).localeCompare(String(a[1].createdAt)))[0]?.[1];
  if (ultimo) {
    for (const [k, id, t, hito] of [['zoomMeetingId', 'cfg-zoom-id', 'El ID de Zoom', 'directo'], ['clase1Url', 'cfg-clase1-url', 'El vídeo de la clase 1', 'clase1'], ['clase2Url', 'cfg-clase2-url', 'El vídeo de la clase 2', 'clase2'], ['replayVideoUrl', 'cfg-replay-video', 'El vídeo de la grabación', 'replay'], ['whatsappUrl', 'cfg-whatsapp-url', 'El grupo de WhatsApp', 'captacion']]) {
      if (l[k] && ultimo[k] && String(l[k]).trim() === String(ultimo[k]).trim()) add(urgencia(n(hito)), 'Enlaces y páginas', `${t} es el mismo que el del lanzamiento «${ultimo.name}»`, '¿Se te ha olvidado cambiarlo al duplicar?', campo(id));
    }
  }

  // ---- Integraciones ----
  if (!p.zoom && l.fechaDirecto && !ya('replay')) add(urgencia(n('directo')), 'Integraciones', 'Zoom no está conectado', 'Sin Zoom no se puede sincronizar quién asistió al directo (variables ZOOM_* en Cloudflare).', null);
  if (p.meta?.error) add('importante', 'Integraciones', 'Error al leer la inversión de Meta', p.meta.error, { tipo: 'vista', v: 'metricas' });
  else if (p.meta?.configured && !l.metaFiltro) add('aviso', 'Integraciones', 'Sin filtro de campañas de Meta', 'Se suma la inversión de todas las campañas de la cuenta, no solo las de este lanzamiento.', campo('cfg-meta-filtro'));
  if (on('llamadas') && p.llamadas && p.llamadas.configurado === false && l.llamadaUrl) add('importante', 'Integraciones', 'Las llamadas no están bien conectadas', p.llamadas.motivo || '', { tipo: 'vista', v: 'llamadas' });

  // ---- Tareas ----
  if (on('tareas') && p.tareas) {
    const pend = p.tareas.filter((t) => !t.hecha);
    if (!p.tareas.length) add(urgencia(n('captacion')), 'Tareas', 'El lanzamiento no tiene tareas', 'En Tareas → «Cargar tareas habituales» se crea la lista de siempre con sus fechas.', { tipo: 'vista', v: 'tareas' });
    const nombre = (t) => {
      const a = t.asignado;
      if (!a) return 'sin asignar';
      if (a.tipo === 'rol') return `rol ${(p.roles || []).find((r) => r.id === a.rol)?.label || a.rol}`;
      return (p.users || []).find((u) => u.id === a.id)?.nombre || 'persona eliminada';
    };
    for (const t of pend.filter((x) => x.fecha && x.fecha < hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))) {
      const atraso = -diasHasta(t.fecha, hoy);
      add(atraso >= 2 ? 'critico' : 'importante', 'Tareas', `Tarea vencida: «${t.titulo}»`, `Era para el ${fmt(t.fecha)} (${atraso} día${atraso === 1 ? '' : 's'} de retraso) · ${nombre(t)}.`, { tipo: 'tarea', id: t.id });
    }
    for (const t of pend.filter((x) => x.fecha && x.fecha >= hoy && diasHasta(x.fecha, hoy) <= 2)) {
      add('aviso', 'Tareas', `Vence ${cuando(diasHasta(t.fecha, hoy))}: «${t.titulo}»`, nombre(t), { tipo: 'tarea', id: t.id });
    }
    const sinAsignar = pend.filter((t) => !t.asignado);
    if (sinAsignar.length) add('aviso', 'Tareas', `${sinAsignar.length} tarea${sinAsignar.length === 1 ? '' : 's'} sin responsable`, sinAsignar.slice(0, 3).map((t) => `«${t.titulo}»`).join(', '), { tipo: 'tarea', id: sinAsignar[0].id });
    const sinFecha = pend.filter((t) => !t.fecha);
    if (sinFecha.length) add('aviso', 'Tareas', `${sinFecha.length} tarea${sinFecha.length === 1 ? '' : 's'} sin fecha límite`, sinFecha.slice(0, 3).map((t) => `«${t.titulo}»`).join(', '), { tipo: 'tarea', id: sinFecha[0].id });
  }

  // ---- Equipo ----
  const activos = (p.users || []).filter((u) => u.activo !== false && u.rol);
  if ((on('hoy') || on('llamadas')) && !activos.some((u) => u.rol === 'setter')) add('aviso', 'Equipo', 'No hay nadie con el rol Setter', 'Nadie recibirá las tareas de setteo ni las llamadas (Equipo → Miembros).', null);

  // ---- Datos reales (si están cargados) ----
  if (p.leads) {
    const L = p.leads;
    if (ya('captacion') && l.registroTag && !L.length) add('critico', 'Datos', 'La captación ha empezado y no hay ningún registro', `Comprueba que el formulario pone la etiqueta «${l.registroTag}».`, { tipo: 'vista', v: 'leads' });
    if (ya('captacion') && !ya('directo') && L.length) {
      const ult = L.map((x) => x.dateAdded).filter(Boolean).sort().at(-1);
      const sinNuevos = ult ? -diasHasta(ult, hoy) : null;
      if (sinNuevos != null && sinNuevos >= 2) add('importante', 'Datos', `Ningún registro nuevo en ${sinNuevos} días`, '¿Se han parado los anuncios o el formulario?', { tipo: 'vista', v: 'metricas' });
    }
    if (ya('clase1') && n('clase1') <= -1 && L.length >= 20 && !L.some((x) => watched(x.s, 'clase1') >= 25)) add('critico', 'Datos', 'Nadie ha visto la clase 1 según el dashboard', 'Revisa el código de la página preclase y que el vídeo de Vimeo sea el correcto.', campo('cfg-clase1-url'));
    if (n('directo') != null && n('directo') <= -1 && L.length && !L.some((x) => x.s.directo_asistio || x.s.directo_click)) add('importante', 'Datos', 'No consta nadie en el directo', 'Pulsa «Sincronizar Zoom» para traer la asistencia.', null);
    const sinFechaCompra = l.compraDateField ? L.filter((x) => x.s.compra && !x.s.fecha_compra).length : 0;
    if (sinFechaCompra) add('importante', 'Datos', `${sinFechaCompra} venta${sinFechaCompra === 1 ? '' : 's'} sin fecha de compra`, 'No salen en las ventas por día: revisa el workflow de compra.', null);
    if ((l.publiTag || l.organicoTag) && L.length >= 10) {
      const sinOrigen = L.filter((x) => !x.s.origen).length;
      if (sinOrigen / L.length > 0.2) add('aviso', 'Datos', `${sinOrigen} leads sin etiqueta de publicidad ni orgánico`, 'Revisa que cada formulario de registro pone la suya.', null);
    }
  }

  return ordenar(out);
}

// VSL: lo básico para que mida y venda.
export function auditarVsl(p) {
  const { vsl: v, hoy } = p;
  const on = (x) => !p.pestanas || p.pestanas.includes(x);
  const out = [];
  const add = (nivel, area, titulo, detalle = '', accion = null) => out.push({ nivel, area, titulo, detalle, accion });
  const tab = (t) => ({ tipo: 'vsl', tab: t });
  const existe = (t) => !p.tagsGhl || p.tagsGhl.map((x) => String(x).toLowerCase()).includes(String(t).toLowerCase());
  if (!v.registroTag) add('critico', 'Etiquetas', 'Falta la etiqueta de registro', 'Sin ella no hay leads.', tab('vembudo'));
  else if (!existe(v.registroTag)) add('critico', 'Etiquetas', `La etiqueta «${v.registroTag}» no existe en GHL`, 'Ponla en el formulario de registro.', tab('vembudo'));
  if (!v.compraTag) add('critico', 'Etiquetas', 'Falta la etiqueta de compra', 'No se contarán las ventas.', tab('vembudo'));
  // Variante del embudo: cambia qué es imprescindible.
  const sub = subtipoValido(v.subtipo);
  const t = SUBTIPOS_VSL[sub];
  if (sub === 'vsl' || sub === 'evergreen') {
    if (!v.vslVideoUrl) add('critico', 'Páginas', `Falta el vídeo ${conPrep('de', t.contenido)}`, `${t.pagina} no tendrá vídeo.`, tab('vpaginas'));
  } else if (sub === 'leadmagnet' && !v.vioTag && !v.vslVideoUrl) {
    add('aviso', 'Etiquetas', 'No se mide quién abre el lead magnet', 'Pon la etiqueta «ha abierto el lead magnet» (workflow al hacer clic en el email) o, si es un vídeo, su URL en Páginas.', tab('vembudo'));
  }
  if (sub === 'llamadas') {
    if (!v.llamadaUrl) add('critico', 'Llamadas', 'Falta el enlace para reservar llamada', 'En un embudo de llamadas es la conversión principal: sin él no hay llamadas.', tab('vembudo'));
    if (!v.llamadasPipeline) add('importante', 'Llamadas', 'Falta el pipeline de las llamadas', 'Sin él no se ven las etapas (show, venta, perdido).', tab('vembudo'));
  } else if (!v.ventaUrl && !v.raicesUrl) add('critico', 'Páginas', 'Falta el enlace de compra', sub === 'leadmagnet' ? 'Los emails y WhatsApp de la secuencia no tendrán a dónde enviar.' : 'El botón de compra de la página no aparecerá.', tab('vembudo'));
  if (!v.vslUrl && sub !== 'llamadas') add('importante', 'Enlaces', `Falta la URL de la ${t.pagina.charAt(0).toLowerCase()}${t.pagina.slice(1)}`, `Los mensajes de WhatsApp «no ha visto ${t.contenido}» no tendrán enlace.`, tab('vembudo'));
  if (on('llamadas') && sub !== 'llamadas' && !v.llamadaUrl) add('importante', 'Llamadas', 'Falta el enlace para reservar llamada', 'Sin él no hay botón de llamada ni pestaña de Llamadas.', tab('vembudo'));
  if (on('llamadas') && p.llamadas?.configurado === false) add('importante', 'Llamadas', 'Las llamadas no están bien conectadas', p.llamadas.motivo || '', tab('vembudo'));
  if (!v.precioPrograma) add('importante', 'Precios', 'Falta el precio', 'La facturación y el ROAS saldrán a 0.', tab('vembudo'));
  if (!v.compraDateField) add('aviso', 'Fechas', 'Sin campo de fecha de compra', 'Las ventas se fechan con la fecha de alta del contacto.', tab('vembudo'));
  if (!v.registroDateField) add('aviso', 'Fechas', 'Sin campo de fecha de registro', 'Quien ya existía en GHL cuenta con su fecha de alta antigua.', tab('vembudo'));
  if (p.meta?.configured && !v.metaFiltro) add('aviso', 'Integraciones', 'Sin filtro de campañas de Meta', 'Se suma la inversión de toda la cuenta.', tab('vembudo'));
  if (p.leads) {
    const ult = p.leads.map((x) => x.fReg).filter(Boolean).sort().at(-1);
    const dias = ult ? -diasHasta(ult, hoy) : null;
    if (sub === 'llamadas' && p.leads.length >= 20 && p.llamadas?.configurado && Array.isArray(p.llamadas.llamadas) && !p.llamadas.llamadas.length) add('importante', 'Llamadas', `${p.leads.length} aplicaciones y ninguna llamada agendada`, 'Revisa que el formulario redirija al calendario.', tab('vembudo'));
    if (v.registroTag && !p.leads.length) add('critico', 'Datos', `No hay ${sub === 'leadmagnet' ? 'ninguna descarga' : sub === 'llamadas' ? 'ninguna aplicación' : 'ningún registro'}`, 'Comprueba el formulario y su etiqueta.', null);
    else if (dias != null && dias >= 3) add('importante', 'Datos', `Ningún registro nuevo en ${dias} días`, '¿Se han parado los anuncios?', null);
    if ((sub === 'vsl' || sub === 'evergreen') && p.leads.length >= 20 && !p.leads.some((x) => x.s.pct > 0)) add('importante', 'Datos', 'No se está midiendo el vídeo', 'Ningún lead tiene % visto: revisa el código de la página y que el registro redirija con ?cid={{contact.id}}.', tab('vcodigos'));
  }
  if (on('tareas') && p.tareas) {
    for (const t of p.tareas.filter((x) => !x.hecha && x.fecha && x.fecha < hoy)) add(-diasHasta(t.fecha, hoy) >= 2 ? 'critico' : 'importante', 'Tareas', `Tarea vencida: «${t.titulo}»`, `Era para el ${fmt(t.fecha)}.`, { tipo: 'tarea', id: t.id });
  }
  return ordenar(out);
}

const PESO = { critico: 0, importante: 1, aviso: 2 };
const ordenar = (list) => list.sort((a, b) => PESO[a.nivel] - PESO[b.nivel]);

// Próximo hito (para la cabecera del auditor).
export function proximoHito(l, hoy) {
  const H = hitosAuditor(l);
  return Object.values(H).filter((h) => h.d && h.d >= hoy).sort((a, b) => a.d.localeCompare(b.d))[0] || null;
}
export { diasHasta, cuando, fmt as fechaCortaAud };
