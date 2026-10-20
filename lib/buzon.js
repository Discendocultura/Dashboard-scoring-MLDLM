// Buzón de avisos de cada persona (la campanita): lo que pasa en el servidor y la página no puede deducir
// sola (menciones y asignaciones en la Operativa, tareas terminadas, bloqueadas o con fecha nueva).
// Va en lo común (cliente «_agencia»), una clave por persona, con los últimos avisos.
import { leerJSON, guardarJSON, reintentando, conVersion } from './store.js';
import { enPrincipal } from './cliente.js';
import { newId } from './users.js';
import { quiereNotif } from '../public/js/notificaciones.js';

const MAX = 60;
const clave = (uid) => `lsd_buzon_${uid}`;
const UID_RE = /^[a-z0-9_-]{1,40}$/i;
const corto = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

// aviso: { tipo, por, titulo, texto?, proyecto?, ir?: { tipo: 'tarea', cliente, code, id } }
export function limpiarAviso(a) {
  return {
    id: newId('n'), en: new Date().toISOString(), tipo: corto(a.tipo, 20), por: corto(a.por, 80), titulo: corto(a.titulo, 200),
    ...(a.texto ? { texto: corto(a.texto, 300) } : {}), ...(a.proyecto ? { proyecto: corto(a.proyecto, 80) } : {}),
    ...(a.ir?.id ? { ir: { tipo: a.ir.tipo === 'embudo' ? 'embudo' : 'tarea', cliente: corto(a.ir.cliente, 60), code: corto(a.ir.code, 60), id: corto(a.ir.id, 60) } } : {}),
  };
}

// Apunta el aviso en la campanita de cada persona que lo quiere (según su Perfil → Notificaciones).
export async function apuntarAviso(users, aviso) {
  let n = 0;
  await enPrincipal(async () => {
    for (const u of users) {
      if (!u?.id || !UID_RE.test(u.id) || u.activo === false || !quiereNotif(u.notifPrefs, aviso.tipo, 'campana')) continue;
      try {
        await reintentando(async () => {
          const b = await leerJSON(clave(u.id), () => []);
          const lista = Array.isArray(b) ? b : [];
          lista.push(limpiarAviso(aviso));
          await guardarJSON(clave(u.id), conVersion(lista.slice(-MAX), b), { motivo: 'aviso' });
        });
        n++;
      } catch (e) { console.error('Buzón', e.message); }
    }
  });
  return n;
}

export async function buzonDe(uid) {
  if (!UID_RE.test(String(uid || ''))) return [];
  const b = await enPrincipal(() => leerJSON(clave(uid), () => []));
  return Array.isArray(b) ? b : [];
}
