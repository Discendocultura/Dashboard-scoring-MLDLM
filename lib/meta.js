// Inversión y nombres de campañas / anuncios desde la API de marketing de Meta (gratuita).
// Variables: META_ACCESS_TOKEN (token de usuario del sistema con ads_read) y META_AD_ACCOUNT_ID.
import { env } from './env.js';
import * as mock from './mock.js';

const useMock = () => env.GHL_MOCK === '1';
export const metaConfigured = () => useMock() || Boolean(env.META_ACCESS_TOKEN && env.META_AD_ACCOUNT_ID);

function metaError(status, body) {
  const err = new Error(`Meta ${status}: ${body.slice(0, 300)}`);
  err.status = 502;
  err.publicMessage = 'Error al leer la inversión de Meta';
  return err;
}

// Gasto por anuncio entre dos días (AAAA-MM-DD, ambos incluidos). `filter`: texto que debe contener
// el nombre de la campaña (para no sumar campañas de otros embudos).
export async function adSpend({ since, until, filter = '' }) {
  let ads;
  if (useMock()) {
    ({ ads } = mock.metaInsights());
  } else {
    const version = env.META_API_VERSION || 'v24.0';
    const account = String(env.META_AD_ACCOUNT_ID).replace(/^act_/, '');
    let url = new URL(`https://graph.facebook.com/${version}/act_${account}/insights`);
    url.searchParams.set('level', 'ad');
    url.searchParams.set('fields', 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend');
    url.searchParams.set('time_range', JSON.stringify({ since, until }));
    url.searchParams.set('limit', '500');
    url.searchParams.set('access_token', env.META_ACCESS_TOKEN);
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
  return { total: Math.round(total * 100) / 100, names, spendBy, campaigns: [...campaigns.values()] };
}
