// Inversión y nombres de campañas / anuncios desde la API de marketing de Meta (gratuita).
// Variables: META_ACCESS_TOKEN (token de usuario del sistema con ads_read) y META_AD_ACCOUNT_ID.
import { env } from './env.js';
import * as mock from './mock.js';
import { clienteActual, envCliente } from './cliente.js';
import { dayInMadrid } from '../public/js/scoring.js';

const useMock = () => env.GHL_MOCK === '1';
// Cada cliente puede tener su token (META_ACCESS_TOKEN_<ID>) o usar el de la agencia (META_ACCESS_TOKEN),
// y su cuenta publicitaria (en el registro de clientes o META_AD_ACCOUNT_ID_<ID>).
const metaToken = () => envCliente('META_ACCESS_TOKEN') || env.META_ACCESS_TOKEN;
const metaCuenta = () => {
  const c = clienteActual();
  return c.principal ? env.META_AD_ACCOUNT_ID : c.metaAdAccount || envCliente('META_AD_ACCOUNT_ID', c);
};
export const metaConfigured = () => useMock() || Boolean(metaToken() && metaCuenta());

function metaError(status, body) {
  const err = new Error(`Meta ${status}: ${body.slice(0, 300)}`);
  err.status = 502;
  err.publicMessage = 'Error al leer la inversión de Meta';
  return err;
}

// Gasto por anuncio entre dos días (AAAA-MM-DD, ambos incluidos). `filter`: texto que debe contener
// el nombre de la campaña (para no sumar campañas de otros embudos).
// Además del gasto: impresiones, clics en el enlace, visitas a la página (landing page views) y
// registros que cuenta Meta, en total (`stats`) y por campaña / conjunto / anuncio (`statsBy`).
export async function adSpend({ since, until, filter = '' }) {
  let ads;
  // Meta no admite fechas futuras: lo que aún no ha empezado no tiene gasto, y el rango acaba hoy como mucho.
  const hoy = dayInMadrid(new Date().toISOString());
  if (until > hoy) until = hoy;
  if (since > hoy) {
    ads = [];
  } else if (useMock()) {
    ({ ads } = mock.metaInsights());
  } else {
    const version = env.META_API_VERSION || 'v24.0';
    const account = String(metaCuenta()).replace(/^act_/, '');
    let url = new URL(`https://graph.facebook.com/${version}/act_${account}/insights`);
    url.searchParams.set('level', 'ad');
    url.searchParams.set('fields', 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,inline_link_clicks,actions');
    url.searchParams.set('time_range', JSON.stringify({ since, until }));
    url.searchParams.set('limit', '500');
    url.searchParams.set('access_token', metaToken());
    ads = [];
    for (let page = 0; url && page < 20; page++) {
      const res = await fetch(url);
      if (!res.ok) throw metaError(res.status, await res.text());
      const data = await res.json();
      ads.push(...(data.data || []));
      url = data.paging?.next ? new URL(data.paging.next) : null;
    }
  }
  // Sin distinguir mayúsculas ni tildes: "captacion webinar" encuentra "Captación webinar MAYO".
  const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const f = norm(filter.trim());
  const rows = ads.filter((a) => !f || norm(a.campaign_name).includes(f));
  const names = {};
  const campaigns = new Map();
  for (const a of rows) {
    names[a.campaign_id] = a.campaign_name;
    names[a.adset_id] = a.adset_name;
    names[a.ad_id] = a.ad_name;
    const spend = Number(a.spend) || 0;
    const cmp = campaigns.get(a.campaign_id) || { id: a.campaign_id, name: a.campaign_name, spend: 0 };
    cmp.spend += spend;
    campaigns.set(a.campaign_id, cmp);
  }
  const spendBy = {};
  for (const a of rows) {
    const s = Number(a.spend) || 0;
    for (const id of [a.campaign_id, a.adset_id, a.ad_id]) spendBy[id] = (spendBy[id] || 0) + s;
  }
  const total = rows.reduce((acc, a) => acc + (Number(a.spend) || 0), 0);
  // Métricas publicitarias (las acciones de Meta llegan como [{ action_type, value }]).
  const accion = (a, tipos) => (a.actions || []).filter((x) => tipos.includes(x.action_type)).reduce((t, x) => t + (Number(x.value) || 0), 0);
  const VISITA = ['landing_page_view', 'omni_landing_page_view'];
  const REGISTRO = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'complete_registration', 'offsite_conversion.fb_pixel_complete_registration'];
  const vacio = () => ({ impresiones: 0, clics: 0, visitas: 0, registrosMeta: 0 });
  const stats = vacio();
  const statsBy = {};
  for (const a of rows) {
    const x = { impresiones: Number(a.impressions) || 0, clics: Number(a.inline_link_clicks) || 0, visitas: accion(a, VISITA), registrosMeta: accion(a, REGISTRO) };
    for (const target of [stats, ...[a.campaign_id, a.adset_id, a.ad_id].map((id) => (statsBy[id] ||= vacio()))]) {
      for (const k of Object.keys(x)) target[k] += x[k];
    }
  }
  return { total: Math.round(total * 100) / 100, names, spendBy, stats, statsBy, campaigns: [...campaigns.values()] };
}
