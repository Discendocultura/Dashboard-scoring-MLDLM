// Acceso a la página de recursos y al directo con el email del registro.
// - Ya registrada en el lanzamiento → acceso.
// - Existe en GHL pero no tiene la etiqueta de registro → se le añade (queda registrada) → acceso.
// - No existe → hacen falta nombre y teléfono para registrarla; se crea con la etiqueta → acceso.
import { addTags, findContactByEmail, upsertContact } from './ghl.js';
import { waPhone } from '../public/js/scoring.js';

const hasTag = (contact, tag) => (contact?.tags || []).some((t) => String(t).toLowerCase() === tag);

export async function ensureRegistered(launch, { email, name, phone }, { defaultCountryCode = '34' } = {}) {
  const tag = launch.registroTag;
  let contact = await findContactByEmail(email);
  if (contact && hasTag(contact, tag)) return { status: 'registered', contact };
  if (contact) {
    await addTags(contact.id, [tag]);
    return { status: 'tagged', contact };
  }
  const cleanName = String(name || '').trim().slice(0, 80);
  const digits = waPhone(phone, defaultCountryCode);
  if (!cleanName || digits.length < 8) return { status: 'needs_signup' };
  const [firstName, ...rest] = cleanName.split(/\s+/);
  contact = await upsertContact({ email, firstName, lastName: rest.join(' '), phone: `+${digits}`, source: 'Registro desde página de recursos' });
  if (!contact) throw new Error('GHL no devolvió el contacto creado');
  await addTags(contact.id, [tag]);
  return { status: 'created', contact };
}
