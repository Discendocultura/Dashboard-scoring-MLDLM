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
  // Si el contacto ya existe, solo se completan los datos que le falten: nunca se pisan su nombre ni
  // su móvil (cualquiera que conozca su email podría cambiárselos desde este formulario público).
  const datos = existing
    ? { email, ...(existing.firstName || existing.name ? {} : { firstName, lastName: rest.join(' ') }), ...(existing.phone ? {} : { phone: `+${digits}` }) }
    : { email, firstName, lastName: rest.join(' '), phone: `+${digits}`, source: 'Registro desde página preclase' };
  const contact = Object.keys(datos).length > 1 || !existing ? await upsertContact(datos) : existing;
  if (!contact) throw new Error('GHL no devolvió el contacto');
  await addTags(contact.id, [tag]);
  return { status: existing ? 'signed_up_existing' : 'created', contact };
}
