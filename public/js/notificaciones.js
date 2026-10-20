// Notificaciones: qué avisos hay, por qué canal (campanita y/o email) y qué ha elegido cada persona
// en Perfil → Notificaciones. Lo usan el servidor (para decidir si manda el email o apunta el aviso)
// y la página (para pintar las opciones y filtrar la campanita).
// · para: 'todos' | 'agencia' (equipo de la agencia) | 'admin' (admin del cliente o agencia).
// · canales: los que existen para ese aviso; defecto: los que van encendidos si la persona no ha tocado nada.
// · sugerida: avisos nuevos que proponemos (se ven con «Sugerida ✨» y se pueden quitar).
export const TIPOS_NOTIF = [
  { id: 'mencion', icono: '@', nombre: 'Te mencionan con @', desc: 'Alguien escribe @tu nombre en un comentario o en la descripción de una tarea (Operativa o Plan → Tareas).', canales: ['campana', 'email'], defecto: ['campana', 'email'], para: 'todos' },
  { id: 'asignada', icono: '📌', nombre: 'Te asignan una tarea', desc: 'Te ponen como responsable de una tarea.', canales: ['campana', 'email'], defecto: ['campana', 'email'], para: 'todos' },
  { id: 'comentario', icono: '💬', nombre: 'Comentan en tus tareas', desc: 'Alguien comenta en una tarea que tienes asignada.', canales: ['campana', 'email'], defecto: ['campana'], para: 'todos' },
  { id: 'vencida', icono: '⏰', nombre: 'Tus tareas vencidas', desc: 'Una tarea tuya pasa su fecha sin completarse.', canales: ['campana'], defecto: ['campana'], para: 'todos' },
  { id: 'pronto', icono: '📅', nombre: 'Tus tareas a punto de vencer', desc: 'Una tarea tuya vence hoy o en los próximos 2 días.', canales: ['campana'], defecto: ['campana'], para: 'todos' },
  { id: 'resumen-dia', icono: '☀️', nombre: 'Resumen de tu día', desc: 'Cada mañana, un email con tus tareas vencidas, las de hoy y las bloqueadas.', canales: ['email'], defecto: ['email'], para: 'agencia' },
  { id: 'equipo', icono: '👥', nombre: 'Tareas vencidas del equipo', desc: 'Las tareas del equipo que llevan días de retraso.', canales: ['campana'], defecto: ['campana'], para: 'admin' },
  { id: 'atascado', icono: '🧗', nombre: 'Personas atascadas', desc: 'Alguien no entra o no avanza en sus primeros pasos.', canales: ['campana'], defecto: ['campana'], para: 'agencia' },
  // Sugeridas
  { id: 'completada', icono: '✅', nombre: 'Terminan una tarea que creaste', desc: 'Para saber que lo que encargaste ya está hecho, sin tener que preguntar.', canales: ['campana', 'email'], defecto: ['campana'], para: 'todos', sugerida: true },
  { id: 'bloqueada', icono: '⛔', nombre: 'Se bloquea una tarea tuya', desc: 'Una tarea que creaste o que tienes asignada se marca como bloqueada, con el motivo.', canales: ['campana', 'email'], defecto: ['campana', 'email'], para: 'todos', sugerida: true },
  { id: 'fecha', icono: '🔁', nombre: 'Cambian la fecha de tu tarea', desc: 'Alguien mueve la fecha de una tarea que tienes asignada.', canales: ['campana', 'email'], defecto: ['campana'], para: 'todos', sugerida: true },
];
export const CANALES_NOTIF = { campana: '🔔 Campanita', email: '✉️ Email' };
const POR_ID = new Map(TIPOS_NOTIF.map((t) => [t.id, t]));
export const tipoNotif = (id) => POR_ID.get(id) || null;

// Los avisos que tienen sentido para esta persona.
export function tiposPara({ agencia = false, admin = false } = {}) {
  return TIPOS_NOTIF.filter((t) => t.para === 'todos' || (t.para === 'agencia' && agencia) || (t.para === 'admin' && (admin || agencia)));
}

// Preferencias limpias: { [tipo]: { campana: bool, email: bool } } solo con lo que la persona ha cambiado.
export function sanitizePrefsNotif(p) {
  const out = {};
  if (!p || typeof p !== 'object') return out;
  for (const [id, v] of Object.entries(p)) {
    const t = POR_ID.get(id);
    if (!t || !v || typeof v !== 'object') continue;
    const c = {};
    for (const canal of t.canales) if (typeof v[canal] === 'boolean') c[canal] = v[canal];
    if (Object.keys(c).length) out[id] = c;
  }
  return out;
}

// ¿Quiere esta persona este aviso por este canal? (si no ha elegido, lo que venga por defecto)
export function quiereNotif(prefs, id, canal) {
  const t = POR_ID.get(id);
  if (!t || !t.canales.includes(canal)) return false;
  const v = prefs?.[id]?.[canal];
  return typeof v === 'boolean' ? v : t.defecto.includes(canal);
}
