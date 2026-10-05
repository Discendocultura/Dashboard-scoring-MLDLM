// Cliente mínimo de la API v2 de GoHighLevel (Private Integration Token, sin coste por llamada).
import { env } from './env.js';
import * as mock from './mock.js';

const BASE = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

const useMock = () => env.GHL_MOCK === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function creds() {
  const token = env.GHL_TOKEN;
  const locationId = env.GHL_LOCATION_ID;
  if (!token || !locationId) throw new Error('Faltan GHL_TOKEN o GHL_LOCATION_ID en las variables de entorno');
  return { token, locationId };
}

export class GhlError extends Error {
  constructor(status, body) {
    super(`GHL ${status}: ${body.slice(0, 300)}`);
    this.status = status === 404 ? 404 : 502;
    this.publicMessage = 'Error al hablar con GoHighLevel';
  }
}

async function ghl(path, { method = 'GET', query, body } = {}) {
  const { token } = creds();
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query || {})) if (v != null) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: VERSION,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    // Límite de GHL: ~100 peticiones / 10 s por subcuenta. Reintentamos con espera.
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(600 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new GhlError(res.status, await res.text());
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }
}

// `fields`: ids de campos personalizados que se envían al navegador (solo los necesarios:
// nunca mandamos todos, porque algunos pueden ser privados).
// Origen del registro: última atribución (la del registro en este embudo) o, si no hay, la primera.
function source(c) {
  const a = c.lastAttributionSource && Object.keys(c.lastAttributionSource).length ? c.lastAttributionSource : c.attributionSource || {};
  return {
    source: a.utmSource || a.sessionSource || '',
    medium: a.utmMedium || a.medium || '',
    campaign: a.campaign || a.utmCampaign || '',
    term: a.utmTerm || a.utmKeyword || '',
    content: a.utmContent || '',
  };
}

function slim(c, fields = []) {
  const cf = {};
  for (const f of c.customFields || []) if (fields.includes(f.id)) cf[f.id] = f.value;
  const first = c.firstName || '';
  const last = c.lastName || '';
  const name = `${first} ${last}`.trim() || c.contactName || c.email || '';
  return {
    id: c.id,
    firstName: first || name.split(' ')[0] || '',
    name,
    email: (c.email || '').toLowerCase(),
    phone: c.phone || '',
    tags: c.tags || [],
    dateAdded: c.dateAdded || null,
    cf,
    src: source(c),
  };
}

export async function listTags() {
  if (useMock()) return mock.listTags();
  const { locationId } = creds();
  const data = await ghl(`/locations/${locationId}/tags`);
  return (data.tags || []).map((t) => t.name).sort((a, b) => a.localeCompare(b, 'es'));
}

// Una página de contactos con la etiqueta dada. `cursor` es el searchAfter de la página anterior.
export async function contactsByTag(tag, cursor, fields = []) {
  if (useMock()) return mock.contactsByTag(tag, cursor, fields);
  const { locationId } = creds();
  const data = await ghl('/contacts/search', {
    method: 'POST',
    body: {
      locationId,
      pageLimit: 100,
      filters: [{ field: 'tags', operator: 'eq', value: tag }],
      sort: [{ field: 'dateAdded', direction: 'asc' }],
      ...(cursor ? { searchAfter: cursor } : {}),
    },
  });
  const raw = data.contacts || [];
  return {
    contacts: raw.map((c) => slim(c, fields)),
    total: data.total ?? null,
    cursor: raw.length === 100 ? raw[raw.length - 1].searchAfter || null : null,
  };
}

// Número de contactos con una etiqueta (una sola petición, sin descargar contactos).
export async function countByTag(tag) {
  if (useMock()) return mock.countByTag(tag);
  const { locationId } = creds();
  const data = await ghl('/contacts/search', {
    method: 'POST',
    body: { locationId, pageLimit: 1, filters: [{ field: 'tags', operator: 'eq', value: tag }] },
  });
  return Number(data.total) || 0;
}

// Campos personalizados de contacto de tipo fecha (para elegir la "fecha de compra").
export async function listDateFields() {
  if (useMock()) return mock.listDateFields();
  const { locationId } = creds();
  const data = await ghl(`/locations/${locationId}/customFields`, { query: { model: 'contact' } });
  return (data.customFields || [])
    .filter((f) => f.dataType === 'DATE')
    .map((f) => ({ id: f.id, name: f.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export async function getContact(id) {
  if (useMock()) return mock.getContact(id);
  try {
    const data = await ghl(`/contacts/${encodeURIComponent(id)}`);
    return data.contact ? slim(data.contact) : null;
  } catch (e) {
    if (e.status === 404 || /400|422/.test(e.message)) return null;
    throw e;
  }
}

export async function findContactByEmail(email) {
  if (useMock()) return mock.findContactByEmail(email);
  const { locationId } = creds();
  const data = await ghl('/contacts/search/duplicate', { query: { locationId, email: email.trim().toLowerCase() } });
  return data.contact ? slim(data.contact) : null;
}

// Crea el contacto (o actualiza el existente con ese email) sin tocar sus etiquetas:
// las etiquetas se añaden aparte con addTags para no borrar las que ya tenga.
export async function upsertContact({ email, firstName, lastName, phone, source }) {
  if (useMock()) return mock.upsertContact({ email, firstName, lastName, phone });
  const { locationId } = creds();
  const body = { locationId, email: email.trim().toLowerCase(), source: source || 'Dashboard lead scoring' };
  if (firstName) body.firstName = firstName;
  if (lastName) body.lastName = lastName;
  if (phone) body.phone = phone;
  const data = await ghl('/contacts/upsert', { method: 'POST', body });
  return data.contact ? slim(data.contact) : null;
}

export async function addTags(contactId, tags) {
  if (useMock()) return mock.addTags(contactId, tags);
  await ghl(`/contacts/${encodeURIComponent(contactId)}/tags`, { method: 'POST', body: { tags } });
}

// Envía un email desde GHL al contacto (se usa para el resumen diario).
export async function sendEmail(contactId, { subject, html }) {
  if (useMock()) return mock.sendEmail(contactId, { subject, html });
  await ghl('/conversations/messages', { method: 'POST', body: { type: 'Email', contactId, subject, html } });
}

export async function removeTags(contactId, tags) {
  if (useMock()) return mock.removeTags(contactId, tags);
  await ghl(`/contacts/${encodeURIComponent(contactId)}/tags`, { method: 'DELETE', body: { tags } });
}

export async function getCustomValue(name) {
  if (useMock()) return mock.getCustomValue(name);
  const { locationId } = creds();
  const data = await ghl(`/locations/${locationId}/customValues`);
  return (data.customValues || []).find((v) => v.name === name) || null;
}

export async function saveCustomValue(name, value) {
  if (useMock()) return mock.saveCustomValue(name, value);
  const { locationId } = creds();
  const existing = await getCustomValue(name);
  if (existing) {
    await ghl(`/locations/${locationId}/customValues/${existing.id}`, { method: 'PUT', body: { name, value } });
  } else {
    await ghl(`/locations/${locationId}/customValues`, { method: 'POST', body: { name, value } });
  }
}
