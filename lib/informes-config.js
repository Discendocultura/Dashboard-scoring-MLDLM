// Destinatarios de los informes de cada cliente: además de las personas con el rol «Cliente» (Equipo), los que se
// añadan a mano (socia, gestora, la propia agencia…). Clave `lsd_informes` del cliente: { destinatarios: [{ nombre, email }] }.
// Los usan el envío automático del informe y el conector de Claude («datos_informe»).
import { leerJSON, guardarJSON } from './store.js';
import { listUsers } from './users.js';
import { ROL_CLIENTE } from '../public/js/roles.js';

export const CLAVE_INFORMES = 'lsd_informes';
export const MAX_DESTINATARIOS = 20;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function sanitizeDestinatarios(lista) {
  const vistos = new Set();
  return (Array.isArray(lista) ? lista : []).map((d) => ({ nombre: String(d?.nombre ?? '').trim().slice(0, 80), email: String(d?.email ?? '').trim().toLowerCase().slice(0, 160) }))
    .filter((d) => EMAIL_RE.test(d.email) && !vistos.has(d.email) && vistos.add(d.email)).slice(0, MAX_DESTINATARIOS);
}

// «Nombre <email>», «email» o «Nombre, email» (uno por línea) → [{ nombre, email }]
export function leerLineasDestinatarios(texto) {
  return sanitizeDestinatarios(String(texto || '').split(/\n+/).map((l) => {
    const m = l.match(/[^\s<>,;]+@[^\s<>,;]+/);
    if (!m) return null;
    return { email: m[0], nombre: l.replace(m[0], '').replace(/[<>,;]/g, ' ').replace(/\s+/g, ' ').trim() };
  }).filter(Boolean));
}

export async function getInformesConfig() {
  const c = await leerJSON(CLAVE_INFORMES, () => ({}));
  return { destinatarios: sanitizeDestinatarios(c?.destinatarios) };
}
export async function guardarDestinatarios(lista, motivo = 'Destinatarios de los informes') {
  const destinatarios = sanitizeDestinatarios(lista);
  await guardarJSON(CLAVE_INFORMES, { destinatarios }, { motivo });
  return destinatarios;
}

// Todos los que reciben el informe: usuarios «Cliente» activos con email + los añadidos (sin repetir).
export async function destinatariosInforme({ fresh = false } = {}) {
  const [users, cfg] = await Promise.all([listUsers({ fresh }), getInformesConfig()]);
  const clientes = users.filter((u) => u.rol === ROL_CLIENTE && u.activo !== false && u.email);
  const ya = new Set(clientes.map((u) => String(u.email).toLowerCase()));
  return { clientes, adicionales: cfg.destinatarios.filter((d) => !ya.has(d.email)) };
}
