// Inscribir a una lead en la reunión de Zoom de un directo (su enlace personal: así el informe de asistencia trae su
// email). La usan el registro (webhook de GHL, /api/zoom-registro), la preclase (/api/directo-zoom) y el puente al
// directo. Si ya estaba inscrita en esa reunión, no se llama a Zoom (y Zoom tampoco duplica: con el mismo email
// devuelve la inscripción que ya tenía).
import { addRegistrant, zoomConfigured } from './zoom.js';
import { entradaDe, guardarInscripcion } from './entradas.js';
import { hasTag } from './access.js';
import { getContact } from './ghl.js';
import { videosDe, esEnDirecto } from '../public/js/videos.js';
import { milestones } from '../public/js/page.js';

// ¿El enlace personal de Zoom (…/w/<id>?tk=…) es de esta reunión? Si no se ve el número, se da por bueno.
export const deLaReunion = (url, meetingId) => {
  const id = /\/w\/(\d+)/.exec(String(url || ''))?.[1];
  return !id || !meetingId || id === String(meetingId).replace(/\D/g, '');
};

const DESPUES = 4 * 3600_000; // hasta 4 h después de empezar (como la pantalla de espera)

// Los directos de un lanzamiento a los que aún se puede inscribir: [{ k, meetingId, inicio }].
export function directosAbiertos(launch, ahora = Date.now()) {
  const m = milestones(launch).videos;
  return videosDe(launch).map((v, i) => ({ k: i + 1, v, inicio: m[i]?.inicio }))
    .filter(({ k, v, inicio }) => (k === 1 || esEnDirecto(v)) && v.zoomMeetingId && inicio != null && ahora <= inicio + DESPUES)
    .map(({ k, v, inicio }) => ({ k, meetingId: v.zoomMeetingId, inicio }));
}

// → { ok, joinUrl?, ya?, motivo? }. `contact`: el de GHL (id, email, name, tags) o, si no se tiene, solo `cid` (se
// lee de GHL solo si aún no está inscrita: la preclase lo pide en cada visita).
export async function inscribirEnDirecto(code, launch, k, { cid, contact = null, confiarRegistro = false }) {
  const vid = videosDe(launch)[k - 1];
  if (!vid?.zoomMeetingId || !zoomConfigured()) return { ok: false, motivo: 'sin zoom' };
  const ya = await entradaDe(code, k, cid);
  if (ya?.join_url && deLaReunion(ya.join_url, vid.zoomMeetingId)) return { ok: true, joinUrl: ya.join_url, ya: true };
  contact ||= await getContact(cid);
  if (!contact) return { ok: false, motivo: 'contacto no encontrado' };
  if (!contact.email) return { ok: false, motivo: 'contacto sin email' };
  // confiarRegistro: el webhook del registro con &l= (firmado): GHL puede no haber puesto aún la etiqueta.
  if (!confiarRegistro && launch.registroTag && !hasTag(contact, launch.registroTag)) return { ok: false, motivo: 'sin registro' };
  const [firstName, ...rest] = (contact.name || '').split(' ');
  const joinUrl = await addRegistrant(vid.zoomMeetingId, { email: contact.email, firstName, lastName: rest.join(' ') });
  if (!joinUrl) return { ok: false, motivo: 'zoom' };
  await guardarInscripcion(code, k, cid, joinUrl);
  return { ok: true, joinUrl };
}
