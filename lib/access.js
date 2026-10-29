// Acceso a la página de recursos y al directo con el email del registro.
// - Tiene la etiqueta de registro del lanzamiento en curso → acceso.
// - No la tiene (sea nueva o ya esté en GHL por otro embudo) → debe registrarse: nombre y móvil.
//   Se crea o actualiza el contacto, se le añade la etiqueta de registro (cuenta como lead) → acceso.
import { addContactNote, addTags, findContactByEmail, setContactPhone, upsertContact } from './ghl.js';
import { waPhone } from '../public/js/scoring.js';

export const hasTag = (contact, tag) => (contact?.tags || []).some((t) => String(t).toLowerCase() === tag);

// Guarda el WhatsApp del formulario como teléfono de SU ficha (por id, nunca con upsert: con email y móvil
// GHL puede ignorar el móvil o tocar otro contacto que ya lo tenga). Si GHL no lo acepta (otro contacto
// ya tiene ese número y la subcuenta no permite duplicados), queda en una nota de su ficha.
async function guardarMovil(contact, movil) {
  try {
    return (await setContactPhone(contact.id, movil)) || { ...contact, phone: movil };
  } catch (e) {
    console.error('Móvil del acceso', contact.id, e.message);
    await addContactNote(contact.id, `WhatsApp que escribió al acceder a las clases: ${movil}. No se ha podido guardar como teléfono (GHL: ${String(e.message).slice(0, 160)}); seguramente ya lo tiene otro contacto.`)
      .catch((err) => console.error('Nota del móvil', err.message));
    return null;
  }
}

// sinNombre: el formulario no enseña el campo del nombre (p. ej. la página lo oculta): basta con el email y el móvil.
// antesDeAlta: se llama justo antes de registrarla (p. ej. la verificación anti-bots); si devuelve false, no se registra
// ({ status: 'verificacion' }). A quien ya está registrada no se le pide.
export async function ensureRegistered(launch, { email, name, phone, sinNombre = false }, { defaultCountryCode = '34' } = {}, antesDeAlta = null) {
  const tag = launch.registroTag;
  const existing = await findContactByEmail(email);
  const digits = waPhone(phone, defaultCountryCode);
  const movil = digits.length >= 8 ? `+${digits}` : '';
  if (existing && hasTag(existing, tag)) {
    // Login con móvil: se guarda en su ficha solo si no tiene ninguno (nunca se pisa el que ya hay).
    if (movil && !existing.phone) {
      const conMovil = await guardarMovil(existing, movil);
      return { status: 'registered', contact: conMovil || existing, movil: Boolean(conMovil) };
    }
    return { status: 'registered', contact: existing };
  }

  const cleanName = String(name || '').trim().slice(0, 80);
  if ((!cleanName && !sinNombre) || !movil) return { status: 'needs_signup', known: Boolean(existing) };
  if (antesDeAlta && !(await antesDeAlta())) return { status: 'verificacion', known: Boolean(existing) };

  const [firstName = '', ...rest] = cleanName ? cleanName.split(/\s+/) : [];
  // Si el contacto ya existe, solo se completan los datos que le falten: nunca se pisan su nombre ni
  // su móvil (cualquiera que conozca su email podría cambiárselos desde este formulario público).
  // El upsert va solo con el email (así GHL no puede emparejarlo por móvil con otro contacto); el móvil, después.
  let contact = existing;
  if (!existing) contact = await upsertContact({ email, firstName, lastName: rest.join(' '), source: 'Registro desde página preclase' });
  else if (!existing.firstName && firstName) contact = await upsertContact({ email, firstName, lastName: rest.join(' ') });
  if (!contact) throw new Error('GHL no devolvió el contacto');
  if (!existing?.phone) contact = (await guardarMovil(contact, movil)) || contact;
  await addTags(contact.id, [tag]);
  return { status: existing ? 'signed_up_existing' : 'created', contact };
}

// Nombre de pila para firmar en público (comentarios): una palabra, sin emails, enlaces ni números.
export function nombrePila(v) {
  const p = String(v || '').trim().split(/\s+/)[0] || '';
  if (!p || p.length < 2 || p.length > 30 || /[@/:<>{}\d]/.test(p)) return '';
  return p.charAt(0).toLocaleUpperCase('es') + p.slice(1);
}
