// Roles y permisos (configurables por la admin en Configuración → Roles y permisos).
// Admin lo tiene todo siempre. Tareas y Calendario los tiene todo el mundo.

export const PERMISOS = [
  { id: 'hoy', label: 'Setteo hoy', grupo: 'Pestañas' },
  { id: 'llamadas', label: 'Llamadas', grupo: 'Pestañas' },
  { id: 'leads', label: 'Leads', grupo: 'Pestañas' },
  { id: 'metricas', label: 'Métricas', grupo: 'Pestañas' },
  { id: 'objetivos', label: 'Objetivos', grupo: 'Pestañas' },
  { id: 'avatar', label: 'Avatar y anuncios', grupo: 'Pestañas' },
  { id: 'comparar', label: 'Comparar', grupo: 'Pestañas' },
  { id: 'config', label: 'Configuración de lanzamientos', grupo: 'Acciones' },
  { id: 'zoom', label: 'Sincronizar Zoom', grupo: 'Acciones' },
  { id: 'tareas_gestion', label: 'Crear, editar y borrar tareas y eventos', grupo: 'Acciones' },
];
export const PERMISO_IDS = PERMISOS.map((p) => p.id);
// Pestañas que necesitan los datos de los leads.
export const PERMISOS_DATOS = ['hoy', 'llamadas', 'leads', 'metricas', 'objetivos', 'avatar', 'comparar'];

export const ROLES_POR_DEFECTO = [
  { id: 'tecnico', label: 'Técnico', permisos: ['hoy', 'llamadas', 'leads', 'metricas', 'objetivos', 'avatar', 'config', 'zoom'] },
  { id: 'setter', label: 'Setter', permisos: ['hoy', 'llamadas', 'leads'] },
  { id: 'equipo', label: 'Equipo', permisos: [] },
];

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
  return (Array.isArray(list) ? list : []).slice(0, 20).map((r) => ({
    id: String(r?.id || '').trim(),
    label: String(r?.label || '').trim().slice(0, 30),
    permisos: [...new Set((Array.isArray(r?.permisos) ? r.permisos : []).filter((p) => PERMISO_IDS.includes(p)))],
  })).filter((r) => ROL_ID_RE.test(r.id) && r.label && !seen.has(r.id) && seen.add(r.id));
}

export function permisosDeRol(roleId, roles) {
  if (roleId === 'admin') return [...PERMISO_IDS];
  return roles.find((r) => r.id === roleId)?.permisos || [];
}

export function labelRol(roleId, roles) {
  if (roleId === 'admin') return 'Admin';
  return roles.find((r) => r.id === roleId)?.label || roleId;
}
