// Reglas de seguimiento: «cuando pase X con un lead, haz Y». Proponen en la bandeja de decisiones (tú apruebas o
// descartas con un clic) o actúan solas («automático»), siempre con un máximo al día por regla.
// Lo usan el servidor (lib/reglas.js) y el navegador (la bandeja y su configuración).

// Condiciones (sobre leads ya enriquecidos: l.s = señales, l.estado, l.score). Nunca a quien ya compró.
export const CONDICIONES = {
  pago: { label: 'Llegó a la página de pago y no ha comprado', corto: 'llegaron al pago y no han comprado', icono: '🛒', fn: (l) => Boolean(l.s.inicio_pago) },
  directo_final: { label: 'Se quedó al directo hasta la oferta y no ha comprado', corto: 'vieron la oferta en el directo y no han comprado', icono: '🎥', fn: (l) => Boolean(l.s.directo_final) },
  muy_caliente: { label: 'Lead muy caliente sin contactar', corto: 'muy calientes sin contactar', icono: '🔥', fn: (l) => l.estado?.id === 'muy-caliente' },
  vip_sin_compra: { label: 'Compró la VIP y aún no ha comprado el programa', corto: 'VIP que aún no han comprado', icono: '⭐', fn: (l) => Boolean(l.s.vip) },
};
export const CONDICION_IDS = Object.keys(CONDICIONES);

// Acciones: una plantilla de WhatsApp de pago (Conexiones → Plantillas), una etiqueta de GHL (p. ej. la que activa
// al setter de IA o un workflow) o una tarea de llamada para el equipo (con la lista de leads).
export const ACCIONES = {
  plantilla: 'Enviar una plantilla de WhatsApp',
  etiqueta: 'Poner una etiqueta en GHL (activa un workflow o el setter de IA)',
  tarea: 'Crear una tarea de llamada para el equipo',
};
export const MAX_DIA = 200;
const TAG_RE = /^[\p{L}\p{N} _.:-]{2,60}$/u;

// Reglas de serie (apagadas): la persona elige la acción y las enciende.
export const REGLAS_BASE = CONDICION_IDS.map((id) => ({
  id, activa: false, modo: 'proponer', max: 30,
  accion: { tipo: id === 'muy_caliente' ? 'tarea' : 'plantilla', tag: '', rol: 'setter' },
}));

export function sanitizeReglas(input) {
  const lista = Array.isArray(input) ? input : [];
  return REGLAS_BASE.map((base) => {
    const r = lista.find((x) => x?.id === base.id) || {};
    const tipo = Object.hasOwn(ACCIONES, r.accion?.tipo) ? r.accion.tipo : base.accion.tipo;
    const tag = String(r.accion?.tag || '').trim().toLowerCase().slice(0, 60);
    const max = Math.round(Number(r.max));
    return {
      id: base.id,
      activa: r.activa === true,
      modo: r.modo === 'auto' ? 'auto' : 'proponer',
      max: Number.isFinite(max) && max >= 1 ? Math.min(MAX_DIA, max) : base.max,
      accion: { tipo, tag: tipo === 'tarea' ? '' : (TAG_RE.test(tag) ? tag : ''), rol: /^[a-z0-9_-]{2,30}$/.test(String(r.accion?.rol || '')) ? r.accion.rol : 'setter' },
    };
  });
}

// ¿Está lista para funcionar? (activa y con lo que necesita su acción) → '' o el motivo
export function faltaEnRegla(r, plantillas = []) {
  if (r.accion.tipo === 'plantilla') {
    if (!r.accion.tag) return 'Elige la plantilla';
    if (!plantillas.some((p) => p.tag === r.accion.tag)) return 'Esa plantilla ya no está en Conexiones → Plantillas de WhatsApp';
  }
  if (r.accion.tipo === 'etiqueta' && !r.accion.tag) return 'Escribe la etiqueta';
  return '';
}

// Leads que cumplen la regla y aún no se han tratado: sin compra, sin contactar (si la acción escribe) y por puntuación.
export function candidatos(leads, regla, yaTratados = new Set()) {
  const c = CONDICIONES[regla.id];
  if (!c) return [];
  return leads.filter((l) => !l.s.compra && c.fn(l) && !yaTratados.has(l.id)
    && (regla.accion.tipo === 'tarea' ? !l.s.llamada && !l.s.wa_enviado : !l.s.wa_enviado))
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}

// Texto de una propuesta para la bandeja.
export function tituloPropuesta(regla, n, plantillas = []) {
  const c = CONDICIONES[regla.id];
  const que = regla.accion.tipo === 'plantilla' ? `Enviar la plantilla «${plantillas.find((p) => p.tag === regla.accion.tag)?.nombre || regla.accion.tag}»`
    : regla.accion.tipo === 'etiqueta' ? `Poner la etiqueta «${regla.accion.tag}»`
      : 'Crear una tarea de llamada';
  return `${c?.icono || '•'} ${que} a ${n} lead${n === 1 ? '' : 's'} (${c?.corto || ''})`;
}
