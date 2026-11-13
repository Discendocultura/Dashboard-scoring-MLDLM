// Remitente de los emails de AlquimIA al equipo (avisos de la Operativa y de las tareas, accesos, recuperar la
// contraseña, siguientes pasos): «Equipo Alquimia <EMAIL_REMITENTE>».
// La API de GHL solo deja cambiar el nombre junto con la dirección, y la dirección tiene que ser de un dominio de envío
// verificado en el GHL desde el que sale (el principal). Sin EMAIL_REMITENTE, o si GHL la rechaza, sale con el
// remitente por defecto de GHL: el email llega igual.
import { env } from './env.js';
import { sendEmail } from './ghl.js';

export const NOMBRE_REMITENTE = 'Equipo Alquimia';

export function remitente() {
  const dir = String(env.EMAIL_REMITENTE || '').trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(dir) ? `${NOMBRE_REMITENTE} <${dir}>` : undefined;
}

export async function enviarDelEquipo(contactId, msg) {
  const emailFrom = remitente();
  try {
    await sendEmail(contactId, { ...msg, ...(emailFrom ? { emailFrom } : {}) });
  } catch (e) {
    if (!emailFrom) throw e;
    console.error('Remitente rechazado por GHL (¿dominio sin verificar?)', e.message || e);
    await sendEmail(contactId, msg);
  }
}
