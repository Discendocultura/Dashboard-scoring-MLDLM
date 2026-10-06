// Tareas de cada lanzamiento: fases, plantilla de tareas habituales y utilidades.
// Lo usan el navegador y el servidor (lib/tareas.js).

export const FASES = [
  { id: 'preparacion', label: 'Preparación', icon: '🧰' },
  { id: 'captacion', label: 'Captación', icon: '📣' },
  { id: 'clases', label: 'Clases previas', icon: '🎬' },
  { id: 'directo', label: 'Directo', icon: '🔴' },
  { id: 'carrito', label: 'Carrito abierto', icon: '🛒' },
  { id: 'cierre', label: 'Cierre y análisis', icon: '📊' },
];
export const FASE_IDS = FASES.map((f) => f.id);

// Tareas habituales. `base` es el hito del lanzamiento del que sale la fecha y `dias` el desfase.
export const PLANTILLA = [
  { fase: 'preparacion', titulo: 'Crear el lanzamiento en el dashboard y revisar sus etiquetas (registro, VIP, compra, encuesta, llamada, pagos, publi/orgánico)', base: 'captacion', dias: -10, rol: 'admin' },
  { fase: 'preparacion', titulo: 'Duplicar los workflows de GHL y cambiarles las etiquetas del nuevo lanzamiento', base: 'captacion', dias: -10, rol: 'admin' },
  { fase: 'preparacion', titulo: 'Crear la reunión de Zoom y pegar su ID en el dashboard', base: 'captacion', dias: -7, rol: 'admin' },
  { fase: 'preparacion', titulo: 'Revisar precios y enlaces de pago (entrada VIP, Raíces pago único y fraccionado)', base: 'captacion', dias: -7, rol: 'admin' },
  { fase: 'preparacion', titulo: 'Crear el grupo de WhatsApp y poner su enlace en el dashboard', base: 'captacion', dias: -7, rol: 'tecnico' },
  { fase: 'preparacion', titulo: 'Poner fechas del directo, clases y cierre del carrito y revisar los textos de la página preclase', base: 'captacion', dias: -5, rol: 'admin' },
  { fase: 'preparacion', titulo: 'Programar los emails del lanzamiento con las fechas nuevas', base: 'captacion', dias: -5, rol: 'tecnico' },
  { fase: 'preparacion', titulo: 'Revisar en el móvil las páginas de registro, gracias y preclase', base: 'captacion', dias: -2, rol: 'tecnico' },
  { fase: 'captacion', titulo: 'Activar las campañas de Meta y comprobar el filtro de campañas del dashboard', base: 'captacion', dias: 0, rol: 'admin' },
  { fase: 'captacion', titulo: 'Revisar registros, coste por lead y objetivos en el dashboard', base: 'captacion', dias: 3, rol: 'admin' },
  { fase: 'captacion', titulo: 'Subir los vídeos de las clases a Vimeo y pegar sus URLs en el dashboard', base: 'clase1', dias: -3, rol: 'tecnico' },
  { fase: 'clases', titulo: 'Comprobar que la clase 1 se desbloquea y se ve bien en la página preclase', base: 'clase1', dias: 0, rol: 'tecnico' },
  { fase: 'clases', titulo: 'Contactar por WhatsApp a las leads calientes de «Setteo hoy»', base: 'clase1', dias: 1, rol: 'setter' },
  { fase: 'clases', titulo: 'Comprobar que la clase 2 se desbloquea y se ve bien', base: 'clase2', dias: 0, rol: 'tecnico' },
  { fase: 'directo', titulo: 'Probar el enlace del directo y la sala de Zoom', base: 'directo', dias: -1, rol: 'admin' },
  { fase: 'directo', titulo: 'Recordatorio del directo en el grupo de WhatsApp', base: 'directo', dias: 0, rol: 'tecnico' },
  { fase: 'directo', titulo: 'Sincronizar la asistencia de Zoom en el dashboard', base: 'directo', dias: 1, rol: 'admin' },
  { fase: 'directo', titulo: 'Subir la grabación y poner la URL del replay en el dashboard', base: 'directo', dias: 1, rol: 'tecnico' },
  { fase: 'carrito', titulo: 'Seguimiento por WhatsApp/llamada a las que vieron el directo y no han comprado', base: 'directo', dias: 1, rol: 'setter' },
  { fase: 'carrito', titulo: 'Revisar ventas por día del carrito frente al objetivo', base: 'directo', dias: 2, rol: 'admin' },
  { fase: 'cierre', titulo: 'Cerrar el carrito: comprobar que los enlaces de pago ya no están accesibles', base: 'cierre', dias: 0, rol: 'admin' },
  { fase: 'cierre', titulo: 'Revisar los perfiles de compradoras y apuntar conclusiones', base: 'cierre', dias: 2, rol: 'admin' },
  { fase: 'cierre', titulo: 'Informe final del lanzamiento (métricas, objetivos y aprendizajes)', base: 'cierre', dias: 3, rol: 'admin' },
];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(day, n) {
  if (!ISO_DAY.test(day || '')) return '';
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Días de los hitos del lanzamiento (YYYY-MM-DD o '').
export function hitos(launch = {}) {
  const day = (v) => String(v || '').slice(0, 10);
  const directo = day(launch.fechaDirecto);
  return {
    captacion: day(launch.inicioCaptacion),
    clase1: day(launch.clase1At),
    clase2: day(launch.clase2At),
    directo,
    cierre: day(launch.cierreCarrito) || addDays(directo, 7),
  };
}


// ¿Puede esta sesión marcar la tarea? Admin siempre; el resto, si es suya, de su rol o sin asignar.
export function puedeMarcar(tarea, { role, uid }) {
  if (role === 'admin') return true;
  const a = tarea.asignado;
  if (!a) return true;
  if (a.tipo === 'rol') return a.rol === role;
  return Boolean(uid) && a.id === uid;
}

export const esMia = (tarea, { role, uid }) => {
  const a = tarea.asignado;
  if (!a) return false;
  return a.tipo === 'rol' ? a.rol === role : Boolean(uid) && a.id === uid;
};

// Columnas del tablero. Las tareas antiguas no tienen `estado`: se deduce de `hecha`.
export const ESTADOS_TAREA = [
  { id: 'pendiente', label: 'Por hacer', icon: '📝' },
  { id: 'en-curso', label: 'En curso', icon: '⏳' },
  { id: 'hecha', label: 'Completada', icon: '✅' },
];
export const estadoDe = (t) => (t.hecha ? 'hecha' : t.estado === 'en-curso' ? 'en-curso' : 'pendiente');

export const vencida = (tarea, today) => !tarea.hecha && Boolean(tarea.fecha) && tarea.fecha < today;

// Tareas vencidas de los demás (no asignadas al rol admin ni a una persona admin), para avisar a la admin.
// users: [{ id, nombre, rol }]. Devuelve [{ tarea, quien, rol, dias }] de la más retrasada a la menos.
export function vencidasEquipo(tareas, users, today) {
  const out = [];
  for (const t of tareas || []) {
    if (!vencida(t, today) || !t.asignado) continue;
    const u = t.asignado.tipo === 'persona' ? users.find((x) => x.id === t.asignado.id) : null;
    const rol = t.asignado.tipo === 'rol' ? t.asignado.rol : u?.rol || '';
    if (rol === 'admin') continue;
    const dias = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${t.fecha}T12:00:00Z`)) / 86_400_000);
    out.push({ tarea: t, quien: u ? u.nombre : `Rol ${{ tecnico: 'Técnico', setter: 'Setter', equipo: 'Equipo' }[rol] || rol}`, rol, dias });
  }
  return out.sort((a, b) => b.dias - a.dias);
}

// Subcategorías de «Preparación» (la fase con más tareas). Si la tarea no tiene una elegida,
// se deduce del título.
export const SUBS_PREPARACION = [
  { id: 'herramientas', label: 'Dashboard y herramientas', icon: '⚙️' },
  { id: 'oferta', label: 'Oferta y pagos', icon: '💳' },
  { id: 'contenido', label: 'Contenido y creatividades', icon: '🎬' },
  { id: 'comunicacion', label: 'Comunicación', icon: '📧' },
  { id: 'pruebas', label: 'Revisión y pruebas', icon: '🧪' },
  { id: 'equipo', label: 'Equipo y reuniones', icon: '👥' },
  { id: 'otras', label: 'Otras', icon: '📌' },
];
export const SUB_IDS = SUBS_PREPARACION.map((s) => s.id);

export function subDe(t) {
  if (SUB_IDS.includes(t.sub)) return t.sub;
  const s = String(t.titulo || '').toLowerCase();
  if (/e-?mail|whatsapp|grupo|mensaje|comunicaci|newsletter/.test(s)) return 'comunicacion';
  if (/precio|enlaces? de pago|oferta|checkout|thrivecart|hotmart/.test(s)) return 'oferta';
  if (/v[ií]deo|anuncio|guion|gui[oó]n|grabaci|grabar|edici|creativ|vimeo|imagen|copy/.test(s)) return 'contenido';
  if (/m[oó]vil|prueba|probar|testear|comprobar/.test(s)) return 'pruebas';
  if (/zoom|dashboard|workflow|etiqueta|ghl|fecha|configur|p[aá]gina|formulario|encuesta|lanzamiento/.test(s)) return 'herramientas';
  if (/reuni[oó]n|equipo|coordinaci|llamada con/.test(s)) return 'equipo';
  return 'otras';
}

// ---------- Tablero ----------
// Columnas: una por fase + las extra que cree la admin + «Completadas» al final.
export const COLOR_COLUMNAS = ['gris', 'azul', 'morado', 'rojo', 'naranja', 'amarillo', 'verde', 'rosa'];
export const COLUMNA_HECHAS = 'completadas';

// Columna en la que está una tarea.
export function columnaDe(t, extra = []) {
  if (t.hecha) return COLUMNA_HECHAS;
  if (t.columna && extra.some((c) => c.id === t.columna)) return t.columna;
  return FASE_IDS.includes(t.fase) ? t.fase : 'preparacion';
}
