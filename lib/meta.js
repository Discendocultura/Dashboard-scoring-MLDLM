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
  // Qué es cada id (campaña, conjunto o anuncio) y de quién cuelga: para listar también lo que gasta sin vender.
  const estructura = {};
  for (const a of rows) {
    const s = Number(a.spend) || 0;
    for (const id of [a.campaign_id, a.adset_id, a.ad_id]) spendBy[id] = (spendBy[id] || 0) + s;
    estructura[a.campaign_id] ||= { nivel: 'campaign' };
    estructura[a.adset_id] ||= { nivel: 'adset', campaign: a.campaign_id };
    estructura[a.ad_id] ||= { nivel: 'ad', campaign: a.campaign_id, adset: a.adset_id };
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
  return { total: Math.round(total * 100) / 100, names, spendBy, estructura, stats, statsBy, campaigns: [...campaigns.values()] };
}

// ---------- Pestaña «Publicidad» (Campaña → Conjunto → Anuncio) y avisos de anuncios nuevos ----------
const CAMPOS_METRICAS = 'spend,impressions,reach,clicks,inline_link_clicks,actions,action_values';
const CAMPOS_NIVEL = {
  campaign: 'campaign_id,campaign_name',
  adset: 'campaign_id,campaign_name,adset_id,adset_name',
  ad: 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name',
};
const metaVersion = () => env.META_API_VERSION || 'v24.0';
export const cuentaMeta = () => String(metaCuenta() || '').replace(/^act_/, '');

// Filas de insights de la cuenta a un nivel (como mucho `maxPaginas` llamadas: el plan gratuito corta a 50).
async function insights(level, timeRange, { extra = {}, maxPaginas = 6 } = {}) {
  let url = new URL(`https://graph.facebook.com/${metaVersion()}/act_${cuentaMeta()}/insights`);
  url.searchParams.set('level', level);
  url.searchParams.set('fields', `${CAMPOS_NIVEL[level]},${CAMPOS_METRICAS}`);
  url.searchParams.set('time_range', JSON.stringify(timeRange));
  url.searchParams.set('limit', '500');
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', metaToken());
  const out = [];
  for (let page = 0; url && page < maxPaginas; page++) {
    const res = await fetch(url);
    if (!res.ok) throw metaError(res.status, await res.text());
    const data = await res.json();
    out.push(...(data.data || []));
    url = data.paging?.next ? new URL(data.paging.next) : null;
  }
  return out;
}

// Prueba: agrega los anuncios del mock por nivel (con un alcance que no suma: ~55 % de las impresiones).
function mockNivel(level, ads) {
  if (level === 'ad') return ads;
  const k = level === 'campaign' ? 'campaign_id' : 'adset_id';
  const por = new Map();
  for (const a of ads) {
    const r = por.get(a[k]) || { campaign_id: a.campaign_id, campaign_name: a.campaign_name, adset_id: a.adset_id, adset_name: a.adset_name, spend: 0, impressions: 0, reach: 0, clicks: 0, inline_link_clicks: 0, actions: [], action_values: [] };
    for (const c of ['spend', 'impressions', 'clicks', 'inline_link_clicks']) r[c] = String(Number(r[c]) + Number(a[c] || 0));
    r.reach = String(Math.round(Number(r.impressions) / 2.1));
    for (const lista of ['actions', 'action_values']) {
      for (const x of a[lista] || []) {
        const y = r[lista].find((z) => z.action_type === x.action_type);
        if (y) y.value = String(Number(y.value) + Number(x.value)); else r[lista].push({ ...x });
      }
    }
    por.set(a[k], r);
  }
  return [...por.values()];
}

// Campañas, conjuntos y anuncios entre dos días cuyo nombre de campaña contiene `filter`.
export async function publicidadMeta({ since, until, filter = '' }) {
  const hoy = dayInMadrid(new Date().toISOString());
  if (until > hoy) until = hoy;
  if (since > hoy) return { campaigns: [], adsets: [], ads: [] };
  const filtrar = (rows) => {
    const f = String(filter || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    return f ? rows.filter((r) => String(r.campaign_name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(f)) : rows;
  };
  if (useMock()) {
    const ads = mock.metaInsights().ads;
    return { campaigns: filtrar(mockNivel('campaign', ads)), adsets: filtrar(mockNivel('adset', ads)), ads: filtrar(ads) };
  }
  const tr = { since, until };
  const [campaigns, adsets, ads] = await Promise.all(['campaign', 'adset', 'ad'].map((l) => insights(l, tr)));
  return { campaigns: filtrar(campaigns), adsets: filtrar(adsets), ads: filtrar(ads) };
}

// Estado (activa, en pausa…) y fecha de creación de campañas, conjuntos y anuncios (de 50 en 50, máx. 200 ids).
export async function estadosMeta(ids = []) {
  const lista = [...new Set(ids.filter(Boolean))].slice(0, 200);
  if (!lista.length) return {};
  if (useMock()) return Object.fromEntries(lista.map((id, i) => [id, { estado: i % 7 === 6 ? 'PAUSED' : 'ACTIVE', creado: new Date(Date.now() - (10 + (i * 9) % 40) * 86_400_000).toISOString() }]));
  const out = {};
  for (let i = 0; i < lista.length; i += 50) {
    const url = new URL(`https://graph.facebook.com/${metaVersion()}/`);
    url.searchParams.set('ids', lista.slice(i, i + 50).join(','));
    url.searchParams.set('fields', 'effective_status,created_time');
    url.searchParams.set('access_token', metaToken());
    const res = await fetch(url);
    if (!res.ok) throw metaError(res.status, await res.text());
    for (const [id, x] of Object.entries(await res.json())) out[id] = { estado: x.effective_status || '', creado: x.created_time || '' };
  }
  return out;
}

// Última semana y la anterior, por anuncio (una sola llamada con bloques de 7 días). Sin filtro: toda la cuenta.
export async function tendenciaAnuncios({ filter = '' } = {}) {
  const hoy = dayInMadrid(new Date().toISOString());
  const dia = (n) => new Date(Date.parse(`${hoy}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  const corte = dia(6);
  let rows;
  if (useMock()) {
    // Prueba: la semana anterior iba mejor (más CTR, menos frecuencia), para ver los avisos.
    const semana = (a, { inicio, clics, alcance }) => {
      const imp = Math.round(Number(a.impressions) * 0.5);
      return { ...a, date_start: inicio, spend: String(Number(a.spend) * 0.5), impressions: String(imp), reach: String(Math.round(imp / alcance)), inline_link_clicks: String(Math.round(Number(a.inline_link_clicks) * clics)) };
    };
    const ads = mock.metaInsights().ads;
    rows = [...ads.map((a, i) => semana(a, { inicio: corte, clics: i % 3 ? 0.48 : 0.3, alcance: i % 4 ? 1.6 : 3.1 })), ...ads.map((a) => semana(a, { inicio: dia(13), clics: 0.5, alcance: 1.5 }))];
  } else {
    rows = await insights('ad', { since: dia(13), until: hoy }, { extra: { time_increment: '7' }, maxPaginas: 8 });
  }
  const f = String(filter || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const sel = f ? rows.filter((r) => String(r.campaign_name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(f)) : rows;
  return { actual: sel.filter((r) => r.date_start >= corte), anterior: sel.filter((r) => r.date_start < corte), desde: dia(13), corte, hoy };
}
