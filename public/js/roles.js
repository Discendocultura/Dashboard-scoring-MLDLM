// Roles y permisos (configurables por la admin en Equipo → Roles y permisos).
// Admin lo tiene todo siempre. Tareas y Calendario los tiene todo el mundo.

export const PERMISOS = [
  { id: 'hoy', label: 'Setting hoy', grupo: 'Pestañas' },
  { id: 'llamadas', label: 'Llamadas', grupo: 'Pestañas' },
  { id: 'endirecto', label: 'En directo', grupo: 'Pestañas' },
  { id: 'leads', label: 'Leads', grupo: 'Pestañas' },
  { id: 'metricas', label: 'Métricas', grupo: 'Pestañas' },
  { id: 'objetivos', label: 'Objetivos y calculadora', grupo: 'Pestañas' },
  { id: 'carrito', label: 'Carrito (días, envíos y estrategia; solo lectura)', grupo: 'Pestañas' },
  { id: 'avatar', label: 'Avatar y anuncios', grupo: 'Pestañas' },
  { id: 'comparar', label: 'Comparar', grupo: 'Pestañas' },
  { id: 'rendimiento', label: 'Rendimiento del equipo', grupo: 'Pestañas' },
  { id: 'resumen', label: 'Resumen del cliente (portal de solo lectura)', grupo: 'Pestañas' },
  { id: 'config', label: 'Configuración de lanzamientos', grupo: 'Acciones' },
  { id: 'zoom', label: 'Sincronizar Zoom', grupo: 'Acciones' },
  { id: 'tareas_gestion', label: 'Crear, editar y borrar tareas y eventos', grupo: 'Acciones' },
  { id: 'mensajes', label: 'Editar mensajes de WhatsApp', grupo: 'Acciones' },
];
export const PERMISO_IDS = PERMISOS.map((p) => p.id);
// Pestañas que necesitan los datos de los leads.
export const PERMISOS_DATOS = ['hoy', 'llamadas', 'leads', 'metricas', 'objetivos', 'avatar', 'comparar'];

export const ROLES_POR_DEFECTO = [
  { id: 'tecnico', label: 'Técnico', permisos: ['hoy', 'llamadas', 'endirecto', 'leads', 'metricas', 'objetivos', 'carrito', 'avatar', 'config', 'zoom', 'mensajes'] },
  { id: 'setter', label: 'Setter', permisos: ['hoy', 'llamadas', 'endirecto', 'leads', 'carrito', 'mensajes'] },
  { id: 'equipo', label: 'Equipo', permisos: [] },
  // El propio cliente: solo ve su resumen (registros, ventas, facturación, ROAS, hitos), sin tocar nada.
  { id: 'cliente', label: 'Cliente (solo lectura)', permisos: ['resumen'] },
];
export const ROL_CLIENTE = 'cliente';

// Permisos añadidos después de que la admin guardara sus roles: qué roles los reciben de entrada
// (luego se pueden quitar en la tabla). Cada rol guarda en `vistos` los permisos que ya conocía.
export const PERMISOS_NUEVOS = {
  mensajes: (r) => (r.permisos || []).includes('hoy'), // quien hace el setteo edita los mensajes
  endirecto: (r) => (r.permisos || []).includes('hoy'), // antes iba dentro de Comercial, con Setting hoy
  // Plan → Carrito: quien hace el setteo, configura o ve las métricas (el carrito es donde más se trabaja).
  carrito: (r) => (r.permisos || []).some((p) => ['hoy', 'config', 'metricas'].includes(p)),
};
export function completarPermisosNuevos(list) {
  return (Array.isArray(list) ? list : []).map((r) => {
    const vistos = Array.isArray(r?.vistos) ? r.vistos : [];
    const extra = Object.keys(PERMISOS_NUEVOS).filter((p) => !vistos.includes(p) && PERMISOS_NUEVOS[p](r));
    return extra.length ? { ...r, permisos: [...(r.permisos || []), ...extra] } : r;
  });
}

export const ROL_ID_RE = /^[a-z][a-z0-9-]{1,23}$/;

// id a partir del nombre: «Community manager» → community-manager
export function idDeRol(label, existentes = []) {
  const base = String(label || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'rol';
  let id = /^[a-z]/.test(base) ? base : `r-${base}`;
  for (let n = 2; existentes.includes(id) || id === 'admin'; n++) id = `${base.slice(0, 18)}-${n}`;
  return id;
}

export function sanitizeRoles(list) {
  const seen = new Set(['admin']);
  const out = (Array.isArray(list) ? list : []).slice(0, 20).map((r) => ({
    id: String(r?.id || '').trim(),
    label: String(r?.label || '').trim().slice(0, 30),
    permisos: [...new Set((Array.isArray(r?.permisos) ? r.permisos : []).filter((p) => PERMISO_IDS.includes(p)))],
  })).filter((r) => ROL_ID_RE.test(r.id) && r.label && !seen.has(r.id) && seen.add(r.id));
  // El rol «Cliente» existe siempre y solo ve su resumen.
  const cli = out.find((r) => r.id === ROL_CLIENTE);
  if (cli) cli.permisos = ['resumen'];
  else out.push({ id: ROL_CLIENTE, label: 'Cliente (solo lectura)', permisos: ['resumen'] });
  return out;
}

export function permisosDeRol(roleId, roles) {
  if (roleId === 'admin') return [...PERMISO_IDS];
  return roles.find((r) => r.id === roleId)?.permisos || [];
}

export function labelRol(roleId, roles) {
  if (roleId === 'admin') return 'Admin';
  return roles.find((r) => r.id === roleId)?.label || roleId;
}
