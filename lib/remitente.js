// Emails de AlquimIA al equipo (avisos de la Operativa y de las tareas, accesos, recuperar la contraseña, siguientes
// pasos): salen todos desde UNA cuenta de GHL, la de EMAIL_CUENTA (por defecto, Discendo; si no existe, la principal),
// con el remitente «Equipo Alquimia <EMAIL_REMITENTE>».
// La API de GHL solo deja cambiar el nombre junto con la dirección, y la dirección tiene que ser de un dominio de envío
// verificado EN ESA CUENTA. Sin EMAIL_REMITENTE, o si GHL la rechaza, sale con el remitente por defecto de esa cuenta:
// el email llega igual.
// Cada persona tiene su contacto en cada cuenta (contactIds por cliente): el de la cuenta de emails se crea la primera vez.
import { env } from './env.js';
import { sendEmail } from './ghl.js';
import { principal, runCliente } from './cliente.js';
import { clientePorId } from './clientes.js';
import { ensureContact, guardarContactos } from './users.js';

export const NOMBRE_REMITENTE = 'Equipo Alquimia';
export const CUENTA_EMAILS_DEFECTO = 'discendo';

export function remitente() {
  const dir = String(env.EMAIL_REMITENTE || '').trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(dir) ? `${NOMBRE_REMITENTE} <${dir}>` : undefined;
}

// La cuenta (cliente) desde la que salen los emails al equipo.
export async function cuentaEmails() {
  const id = String(env.EMAIL_CUENTA || CUENTA_EMAILS_DEFECTO).trim();
  const p = principal();
  if (!id || id === p.id) return p;
  try { return (await clientePorId(id)) || p; } catch { return p; }
}

// Envía con el remitente del equipo desde la cuenta en la que se está (si GHL lo rechaza, con el de por defecto).
export async function enviarDelEquipo(contactId, msg) {
  const emailFrom = remitente();
  try {
    await sendEmail(contactId, { ...msg, ...(emailFrom ? { emailFrom } : {}) });
  } catch (e) {
    if (!emailFrom) throw e;
    console.error('Remitente rechazado por GHL (¿dominio sin verificar en esa cuenta?)', e.message || e);
    await sendEmail(contactId, msg);
  }
}

// Email a una persona del equipo desde la cuenta de emails (crea su contacto allí si aún no lo tiene y lo guarda).
export async function enviarAlEquipo(u, msg) {
  const cuenta = await cuentaEmails();
  return runCliente(cuenta, async () => {
    const ya = u.contactIds?.[cuenta.id] || '';
    const contactId = ya || await ensureContact({ ...u, contactId: '' });
    await enviarDelEquipo(contactId, msg);
    if (!ya) await guardarContactos([{ id: u.id, contactId }]);
  });
}
