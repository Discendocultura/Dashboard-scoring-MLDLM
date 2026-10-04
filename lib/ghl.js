// Cliente mínimo de la API v2 de GoHighLevel (Private Integration Token, sin coste por llamada).
import * as mock from './mock.js';

const BASE = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

const useMock = () => process.env.GHL_MOCK === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function env() {
  const token = process.env.GHL_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
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
  const { token } = env();
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

function slim(c) {
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
  };
}

export async function listTags() {
  if (useMock()) return mock.listTags();
  const { locationId } = env();
  const data = await ghl(`/locations/${locationId}/tags`);
  return (data.tags || []).map((t) => t.name).sort((a, b) => a.localeCompare(b, 'es'));
}

// Una página de contactos con la etiqueta dada. `cursor` es el searchAfter de la página anterior.
export async function contactsByTag(tag, cursor) {
  if (useMock()) return mock.contactsByTag(tag, cursor);
  const { locationId } = env();
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
    contacts: raw.map(slim),
    total: data.total ?? null,
    cursor: raw.length === 100 ? raw[raw.length - 1].searchAfter || null : null,
  };
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
  const { locationId } = env();
  const data = await ghl('/contacts/search/duplicate', { query: { locationId, email: email.trim().toLowerCase() } });
  return data.contact ? slim(data.contact) : null;
}

export async function addTags(contactId, tags) {
  if (useMock()) return mock.addTags(contactId, tags);
  await ghl(`/contacts/${encodeURIComponent(contactId)}/tags`, { method: 'POST', body: { tags } });
}

export async function getCustomValue(name) {
  if (useMock()) return mock.getCustomValue(name);
  const { locationId } = env();
  const data = await ghl(`/locations/${locationId}/customValues`);
  return (data.customValues || []).find((v) => v.name === name) || null;
}

export async function saveCustomValue(name, value) {
  if (useMock()) return mock.saveCustomValue(name, value);
  const { locationId } = env();
  const existing = await getCustomValue(name);
  if (existing) {
    await ghl(`/locations/${locationId}/customValues/${existing.id}`, { method: 'PUT', body: { name, value } });
  } else {
    await ghl(`/locations/${locationId}/customValues`, { method: 'POST', body: { name, value } });
  }
}
