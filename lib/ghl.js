// Cliente mínimo de la API v2 de GoHighLevel (Private Integration Token, sin coste por llamada).
import { env } from './env.js';
import * as mock from './mock.js';
import { clienteActual, envCliente, sufijo } from './cliente.js';

const BASE = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';
// Los endpoints de calendarios de GHL piden otra versión de la API.
const VERSION_CALENDARIOS = '2021-04-15';

const useMock = () => env.GHL_MOCK === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Token y subcuenta del cliente de esta petición (el principal: GHL_TOKEN y GHL_LOCATION_ID).
function creds() {
  const c = clienteActual();
  const token = envCliente('GHL_TOKEN', c);
  const locationId = c.principal ? env.GHL_LOCATION_ID : c.locationId;
  if (!token || !locationId) {
    const falta = c.principal ? 'Faltan GHL_TOKEN o GHL_LOCATION_ID en las variables de entorno' : `Falta conectar el GHL de «${c.nombre}»: añade GHL_TOKEN_${sufijo(c.id)} en Cloudflare y su subcuenta en Agencia → Clientes`;
    throw Object.assign(new Error(falta), { status: 503, publicMessage: falta });
  }
  return { token, locationId };
}
// ¿Tiene este cliente su GHL conectado? (para la lista de clientes)
export const ghlConectado = (c) => Boolean(env.GHL_MOCK === '1' || (envCliente('GHL_TOKEN', c) && (c.principal ? env.GHL_LOCATION_ID : c.locationId)));

export class GhlError extends Error {
  constructor(status, body) {
    super(`GHL ${status}: ${body.slice(0, 300)}`);
    this.status = status === 404 ? 404 : 502;
    this.publicMessage = 'Error al hablar con GoHighLevel';
  }
}

async function ghl(path, { method = 'GET', query, body, version = VERSION } = {}) {
  const { token } = creds();
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query || {})) if (v != null) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: version,
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
// Formularios instantáneos de Meta: no hay URL con UTM, pero GHL puede guardar el anuncio en la
// atribución (adId, adGroupId/adSetId, campaignId). Se usan como si fueran las UTM.
export function sourceDe(a = {}) {
  const ad = a.utmContent || a.adId || a.ad_id || '';
  const adset = a.utmTerm || a.utmKeyword || a.adGroupId || a.adSetId || a.adsetId || a.adset_id || '';
  const campaign = a.utmCampaign || a.campaignId || a.campaign_id || a.campaign || '';
  const deFormulario = !a.utmContent && !a.utmCampaign && Boolean(a.adId || a.adGroupId || a.adSetId || a.campaignId || /lead.?(form|ad)|formulario/i.test(`${a.medium || ''} ${a.sessionSource || ''} ${a.adSource || ''}`));
  return {
    source: a.utmSource || (deFormulario ? 'formulario-meta' : '') || a.sessionSource || '',
    medium: a.utmMedium || (deFormulario ? 'paid' : '') || a.medium || '',
    campaign,
    term: adset,
    content: ad,
  };
}

function source(c) {
  const a = c.lastAttributionSource && Object.keys(c.lastAttributionSource).length ? c.lastAttributionSource : c.attributionSource || {};
  return sourceDe(a);
}

// Si la configuración indica en qué campos personalizados se guardan campaña / conjunto / anuncio de los
// formularios instantáneos, completan el origen de quien no trae UTM.
export function aplicarCamposFormulario(contact, formAds = {}) {
  const cf = contact?.cf || {};
  const ad = formAds.ad && cf[formAds.ad];
  const adset = formAds.adset && cf[formAds.adset];
  const campaign = formAds.campaign && cf[formAds.campaign];
  if (!contact || (!ad && !adset && !campaign) || contact.src?.content) return contact;
  contact.src = {
    source: contact.src?.source || 'formulario-meta',
    medium: contact.src?.medium || 'paid',
    campaign: String(campaign || contact.src?.campaign || ''),
    term: String(adset || contact.src?.term || ''),
    content: String(ad || ''),
  };
  return contact;
}

export async function listTextFields() {
  if (useMock()) return mock.listTextFields();
  const { locationId } = creds();
  const data = await ghl(`/locations/${locationId}/customFields`, { query: { model: 'contact' } });
  return (data.customFields || [])
    .filter((f) => ['TEXT', 'LARGE_TEXT', 'NUMERICAL'].includes(f.dataType))
    .map((f) => ({ id: f.id, name: f.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
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

// ---------- Llamadas: pipeline de oportunidades y calendario ----------
export async function getPipelines() {
  if (useMock()) return mock.getPipelines();
  const { locationId } = creds();
  const data = await ghl('/opportunities/pipelines', { query: { locationId } });
  return data.pipelines || [];
}

// Oportunidades de un pipeline (filtrando por etapa o contacto). Devuelve { opportunities, total }.
export async function searchOpportunities({ pipelineId, pipelineStageId, contactId, limit = 100 } = {}) {
  if (useMock()) return mock.searchOpportunities({ pipelineId, pipelineStageId, contactId, limit });
  const { locationId } = creds();
  // Este endpoint usa los parámetros con guion bajo (location_id…); con camelCase responde 422.
  const data = await ghl('/opportunities/search', { query: { location_id: locationId, pipeline_id: pipelineId, pipeline_stage_id: pipelineStageId, contact_id: contactId, limit } });
  return {
    opportunities: (data.opportunities || []).map((o) => ({
      id: o.id, contactId: o.contactId, pipelineStageId: o.pipelineStageId, status: o.status, name: o.name,
      phone: o.contact?.phone || '', email: o.contact?.email || '', tags: o.contact?.tags || [],
      src: sourceDe((o.attributions || []).find((x) => x.isLast) || (o.attributions || [])[0] || {}),
    })),
    total: data.meta?.total ?? (data.opportunities || []).length,
  };
}

export async function createOpportunity({ pipelineId, pipelineStageId, contactId, name, status = 'open' }) {
  if (useMock()) return mock.createOpportunity({ pipelineId, pipelineStageId, contactId, name, status });
  const { locationId } = creds();
  const data = await ghl('/opportunities/', { method: 'POST', body: { locationId, pipelineId, pipelineStageId, contactId, name, status } });
  return data.opportunity || null;
}

export async function updateOpportunity(id, { pipelineId, pipelineStageId, status }) {
  if (useMock()) return mock.updateOpportunity(id, { pipelineStageId, status });
  await ghl(`/opportunities/${encodeURIComponent(id)}`, { method: 'PUT', body: { pipelineId, pipelineStageId, status } });
}

// Citas de un calendario entre dos instantes (ms).
export async function calendarEvents({ calendarId, startTime, endTime }) {
  if (useMock()) return mock.calendarEvents({ calendarId, startTime, endTime });
  const { locationId } = creds();
  const data = await ghl('/calendars/events', { query: { locationId, calendarId, startTime: String(startTime), endTime: String(endTime) }, version: VERSION_CALENDARIOS });
  return (data.events || []).map((e) => ({
    id: e.id, title: e.title || '', contactId: e.contactId || '', startTime: e.startTime, endTime: e.endTime,
    status: e.appointmentStatus || e.status || '', deleted: Boolean(e.deleted),
  }));
}

export async function getCalendar(calendarId) {
  if (useMock()) return mock.getCalendar(calendarId);
  const data = await ghl(`/calendars/${encodeURIComponent(calendarId)}`, { version: VERSION_CALENDARIOS });
  return data.calendar ? { id: data.calendar.id, name: data.calendar.name } : null;
}

export async function updateAppointmentStatus(eventId, appointmentStatus) {
  if (useMock()) return mock.updateAppointmentStatus(eventId, appointmentStatus);
  await ghl(`/calendars/events/appointments/${encodeURIComponent(eventId)}`, { method: 'PUT', body: { appointmentStatus }, version: VERSION_CALENDARIOS });
}

export async function addContactNote(contactId, body) {
  if (useMock()) return mock.addContactNote(contactId, body);
  await ghl(`/contacts/${encodeURIComponent(contactId)}/notes`, { method: 'POST', body: { body } });
}

// ---------- Permisos del token (Equipo → Seguridad) ----------
// Prueba, solo leyendo, cada permiso que usa el dashboard. Los de escritura no se pueden comprobar
// sin cambiar nada, así que se indica cuál hace falta marcar en la integración privada de GHL.
export const PERMISOS_GHL = [
  { id: 'contacts', nombre: 'Contactos', scope: 'contacts.readonly / contacts.write', para: 'Leads, etiquetas de cada lead, registro en el directo' },
  { id: 'tags', nombre: 'Etiquetas', scope: 'locations/tags.readonly', para: 'Elegir etiquetas en la configuración' },
  { id: 'customValues', nombre: 'Custom Values', scope: 'locations/customValues.readonly / .write', para: 'Datos del dashboard mientras no haya base de datos D1' },
  { id: 'customFields', nombre: 'Campos personalizados', scope: 'locations/customFields.readonly', para: 'Elegir campos (fecha de registro, de compra…)' },
  { id: 'opportunities', nombre: 'Pipelines y oportunidades', scope: 'opportunities.readonly / opportunities.write', para: 'Llamadas: mover a la persona de etapa' },
  { id: 'calendars', nombre: 'Calendarios', scope: 'calendars.readonly', para: 'Llamadas de valoración' },
  { id: 'calendarEvents', nombre: 'Citas', scope: 'calendars/events.readonly / .write', para: 'Ver y marcar las citas de las llamadas' },
  { id: 'conversations', nombre: 'Conversaciones (emails)', scope: 'conversations.readonly / conversations/message.write', para: 'Emails del equipo: accesos, avisos de tareas, resumen diario' },
];

export async function comprobarPermisos() {
  const pruebas = useMock() ? {} : (() => {
    const { locationId } = creds();
    const ahora = Date.now();
    return {
      contacts: () => ghl('/contacts/', { query: { locationId, limit: 1 } }),
      tags: () => ghl(`/locations/${locationId}/tags`),
      customValues: () => ghl(`/locations/${locationId}/customValues`),
      customFields: () => ghl(`/locations/${locationId}/customFields`, { query: { model: 'contact' } }),
      opportunities: () => ghl('/opportunities/pipelines', { query: { locationId } }),
      calendars: () => ghl('/calendars/', { query: { locationId }, version: VERSION_CALENDARIOS }),
      calendarEvents: async () => {
        const cals = (await ghl('/calendars/', { query: { locationId }, version: VERSION_CALENDARIOS })).calendars || [];
        if (!cals.length) return 'sin calendarios para probar';
        return ghl('/calendars/events', { query: { locationId, calendarId: cals[0].id, startTime: String(ahora - 86_400_000), endTime: String(ahora) }, version: VERSION_CALENDARIOS });
      },
      conversations: () => ghl('/conversations/search', { query: { locationId, limit: 1 } }),
    };
  })();
  const out = [];
  for (const p of PERMISOS_GHL) {
    try {
      const r = pruebas[p.id] ? await pruebas[p.id]() : null;
      out.push({ ...p, ok: true, nota: typeof r === 'string' ? r : '' });
    } catch (e) {
      const sinPermiso = /GHL (401|403)/.test(String(e.message)) || /not authorized|scope/i.test(String(e.message));
      out.push({ ...p, ok: false, error: sinPermiso ? 'Sin permiso: márcalo en la integración privada de GHL' : String(e.publicMessage || e.message).slice(0, 160) });
    }
  }
  return out;
}
