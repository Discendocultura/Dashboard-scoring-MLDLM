// Acceso a la página de recursos y al directo con el email del registro.
// - Tiene la etiqueta de registro del lanzamiento en curso → acceso.
// - No la tiene (sea nueva o ya esté en GHL por otro embudo) → debe registrarse: nombre y móvil.
//   Se crea o actualiza el contacto, se le añade la etiqueta de registro (cuenta como lead) → acceso.
import { addTags, findContactByEmail, upsertContact } from './ghl.js';
import { waPhone } from '../public/js/scoring.js';

export const hasTag = (contact, tag) => (contact?.tags || []).some((t) => String(t).toLowerCase() === tag);

export async function ensureRegistered(launch, { email, name, phone }, { defaultCountryCode = '34' } = {}) {
  const tag = launch.registroTag;
  const existing = await findContactByEmail(email);
  if (existing && hasTag(existing, tag)) return { status: 'registered', contact: existing };

  const cleanName = String(name || '').trim().slice(0, 80);
  const digits = waPhone(phone, defaultCountryCode);
  if (!cleanName || digits.length < 8) return { status: 'needs_signup', known: Boolean(existing) };

  const [firstName, ...rest] = cleanName.split(/\s+/);
  const contact = await upsertContact({ email, firstName, lastName: rest.join(' '), phone: `+${digits}`, source: 'Registro desde página de recursos' });
  if (!contact) throw new Error('GHL no devolvió el contacto');
  await addTags(contact.id, [tag]);
  return { status: existing ? 'signed_up_existing' : 'created', contact };
}
