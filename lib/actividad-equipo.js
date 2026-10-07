// Registro de lo que hace el equipo con cada lead (para «Rendimiento del equipo»):
// WhatsApps enviados y resultados anotados, con quién y cuándo. Uno por lanzamiento / VSL.
import { leerJSON, guardarJSON, reintentando } from './store.js';

const nombre = (code) => `lsd_equipo_${code}`;
const MAX = 8000; // los más recientes

export const leerActividadEquipo = (code) => leerJSON(nombre(code), () => []);

export async function registrarActividadEquipo(code, eventos) {
  if (!eventos.length) return;
  await reintentando(async () => {
    const lista = await leerActividadEquipo(code);
    lista.push(...eventos);
    await guardarJSON(nombre(code), lista.length > MAX ? lista.slice(-MAX) : lista, { motivo: '' });
  });
}

// De las etiquetas que se ponen (<código>_wa_enviado, <código>_res_interesada…) a eventos por código.
export function eventosDeEtiquetas(items, actor, ahora = new Date().toISOString()) {
  const porCode = new Map();
  for (const it of items) {
    for (const t of it.tags || []) {
      const m = /^(.+)_(wa_enviado|res_([a-z_]+))$/.exec(t);
      if (!m) continue;
      const ev = m[2] === 'wa_enviado' ? { t: 'wa', cid: it.id } : { t: 'res', cid: it.id, r: m[3] };
      porCode.set(m[1], [...(porCode.get(m[1]) || []), { ...ev, uid: actor.uid || '', por: actor.nombre || '', en: ahora }]);
    }
  }
  return porCode;
}
