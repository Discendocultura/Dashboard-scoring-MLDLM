// Informe para el cliente: al cerrar un lanzamiento (y, si se quiere, cada semana en una VSL).
// Resultados frente a objetivos, embudo, anuncios ganadores, avatar comprador y aprendizajes.
// Se ve como página (con botón para guardarla en PDF), con enlace compartible firmado y por email.
import { getConfig } from './config-store.js';
import { adSpend, metaConfigured } from './meta.js';
import { cachePorCliente, clienteActual } from './cliente.js';
import { escapeHtml } from './http.js';
import { metricasLanzamiento, todosLosLeads } from './resumen.js';
import { rankingGanadores, perfilesCompradoras, describirAvatar, nextLaunchStart } from '../public/js/metrics.js';
import { enrichVsl, computeVsl, addDay } from '../public/js/embudo-vsl.js';
import { dayInMadrid } from '../public/js/scoring.js';
import { clasesDe, conVip, videosDe, FORMATOS } from '../public/js/videos.js';
import { conProducto, nombreProducto } from '../public/js/producto.js';

const esc = escapeHtml;
const eur = (n) => (n == null || !Number.isFinite(n) ? '–' : `${Math.round(n).toLocaleString('es-ES')} €`);
const num = (n) => (n == null ? '–' : Math.round(n).toLocaleString('es-ES'));
const pct = (a, b) => (b ? `${((a / b) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%` : '–');
const minus = (t) => String(t).charAt(0).toLowerCase() + String(t).slice(1);
const veces = (x) => `×${x.toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}`;
const hoyMadrid = () => dayInMadrid(new Date().toISOString());
const fecha = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');

// Aprendizajes en claro a partir de los datos (sin IA).
export function aprendizajesLanzamiento(m, ranking, avatar, launch) {
  const out = [];
  const lift = (m.lift || []).filter((x) => x.con >= 15 && x.veces && x.veces >= 1.5).sort((a, b) => b.veces - a.veces).slice(0, 3);
  for (const x of lift) out.push(`Quien «${minus(x.label)}» compra ${veces(x.veces)} más que quien no (${pct(x.convCon, 1)} frente a ${pct(x.convSin, 1)}).`);
  const top = ranking.find((a) => a.compras > 0);
  if (top) out.push(`El anuncio que más vendió fue «${top.label}»: ${top.compras} ventas de ${top.leads} registros${top.cac ? `, a ${eur(top.cac)} por venta` : ''}.`);
  const o = m.origen;
  if (o?.publi.leads && o?.organico.leads) {
    out.push(`Los registros de publicidad convirtieron al ${pct(o.publi.compras, o.publi.leads)} y los orgánicos al ${pct(o.organico.compras, o.organico.leads)}.`);
  }
  if (m.frio && m.templado) out.push(`El tráfico templado (ya estaba en la base de datos) compró al ${pct(m.compraTemplado, m.templado)}; el frío, al ${pct(m.compraFrio, m.frio)}.`);
  if (m.setter?.contactadas >= 10) out.push(`Las contactadas por WhatsApp compraron al ${pct(m.setter.compraContactadas, m.setter.contactadas)}; las no contactadas, al ${pct(m.setter.compraNoContactadas, m.setter.noContactadas)}.`);
  if (avatar) out.push(`Perfil que más compra: ${avatar}`);
  const noLlega = (m.objetivos || []).filter((x) => x.pct < 1);
  const llega = (m.objetivos || []).filter((x) => x.pct >= 1);
  if (llega.length) out.push(`Objetivos conseguidos: ${llega.map((x) => minus(x.label)).join(', ')}.`);
  if (noLlega.length) out.push(`Por debajo del objetivo: ${noLlega.map((x) => `${minus(x.label)} (${Math.round(x.pct * 100)}%)`).join(', ')}. Para la próxima edición conviene revisar ${noLlega.some((x) => /regist/i.test(x.label)) ? 'la captación (presupuesto y anuncios)' : 'la conversión (setteo, oferta y llamadas)'}.`);
  if (m.eco?.roas) out.push(`Cada euro invertido en anuncios generó ${m.eco.roas.toLocaleString('es-ES', { maximumFractionDigits: 1 })} € de facturación.`);
  void launch;
  return out;
}

const tabla = (cab, filas) => `<table><thead><tr>${cab.map((c, i) => `<th${i ? ' class="n"' : ''}>${c}</th>`).join('')}</tr></thead><tbody>${filas.map((f) => `<tr>${f.map((c, i) => `<td${i ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const barras = (filas) => {
  const total = filas[0]?.[1] || 0;
  return filas.map(([l, n]) => `<div class="fr"><span>${esc(l)}</span><div class="fb"><i style="width:${total ? (n / total) * 100 : 0}%"></i></div><b>${num(n)}</b><small>${pct(n, total)}</small></div>`).join('');
};

function pagina({ titulo, sub, marca, cuerpo }) {
  const c1 = marca?.color || '#860d0e';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(titulo)}</title><style>
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#241f1c;background:#f7f5f2;line-height:1.5}
main{max-width:960px;margin:0 auto;padding:28px 18px 48px}
header{background:${c1};color:#fff;padding:26px 18px}header div{max-width:960px;margin:0 auto}header h1{margin:0;font-size:26px}header p{margin:4px 0 0;opacity:.9}
section{background:#fff;border:1px solid #e3ddd6;border-radius:14px;padding:18px 20px;margin:0 0 16px;break-inside:avoid}
h2{margin:0 0 12px;font-size:18px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}.kpis div{background:#f1ede8;border-radius:10px;padding:10px 12px}.kpis span{display:block;font-size:12px;color:#7a716c}.kpis b{font-size:21px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:7px 8px;border-bottom:1px solid #eee6de;text-align:left}th{font-size:12px;color:#7a716c;text-transform:uppercase}.n{text-align:right;white-space:nowrap}
.fr{display:grid;grid-template-columns:minmax(140px,1.2fr) 3fr 70px 60px;gap:10px;align-items:center;font-size:14px;margin:6px 0}.fb{background:#f1ede8;border-radius:99px;height:12px;overflow:hidden}.fb i{display:block;height:100%;background:${c1}}.fr b,.fr small{text-align:right}.fr small{color:#7a716c}
.bar{background:#f1ede8;border-radius:99px;height:10px;overflow:hidden;margin-top:4px}.bar i{display:block;height:100%;background:${c1}}
ul{margin:0;padding-left:20px}li{margin:4px 0}.muted{color:#7a716c}
.acciones{max-width:960px;margin:12px auto 0;padding:0 18px;text-align:right}.acciones button{font:inherit;padding:9px 16px;border-radius:999px;border:1px solid #d8d0c9;background:#fff;cursor:pointer}
@media print{body{background:#fff}.acciones{display:none}section{border-color:#ddd}}
@media (max-width:600px){.fr{grid-template-columns:1fr 60px 50px}.fr .fb{grid-column:1/-1}}
</style></head><body><header><div><h1>${esc(titulo)}</h1><p>${esc(sub)}</p></div></header>
<div class="acciones"><button onclick="window.print()">Guardar en PDF / imprimir</button></div><main>${cuerpo}
<p class="muted" style="text-align:center;font-size:12px">Informe generado el ${esc(fecha(hoyMadrid()))} · ${esc(clienteActual().nombre)}</p></main></body></html>`;
}

const cache = cachePorCliente();
async function enCache(clave, fn) {
  const m = cache.get() || new Map();
  const hit = m.get(clave);
  if (hit && hit.at > Date.now() - 30 * 60_000) return hit.v;
  const v = await fn();
  m.set(clave, { at: Date.now(), v });
  cache.set(m);
  return v;
}

export async function informeLanzamiento(code) {
  return enCache(`l:${code}`, async () => {
    const config = await getConfig();
    const l = config.launches[code];
    if (!l) throw Object.assign(new Error('Lanzamiento no encontrado'), { status: 404, publicMessage: 'Lanzamiento no encontrado' });
    const { leads, m } = await metricasLanzamiento(config, code);
    let names = {};
    let spendBy = {};
    if (metaConfigured() && l.inicioCaptacion) {
      try {
        const next = nextLaunchStart(config, code);
        const hasta = next ? addDay(next, -1) : hoyMadrid();
        ({ names, spendBy } = await adSpend({ since: l.inicioCaptacion, until: hasta < l.inicioCaptacion ? l.inicioCaptacion : hasta, filter: l.metaFiltro || code }));
      } catch { /* sin Meta */ }
    }
    const ranking = rankingGanadores(leads, l, 'ad', names, spendBy).slice(0, 8);
    const preguntas = config.encuesta || [];
    const perfil = preguntas.length ? perfilesCompradoras(leads, preguntas, m.compra >= 10 ? 'compra' : 'vip') : null;
    const avatar = perfil?.avatares?.[0] ? describirAvatar(perfil.avatares[0].traits, preguntas) : '';
    const aprendizajes = aprendizajesLanzamiento(m, ranking, avatar, l);
    const prod = nombreProducto(config);
    const vs = videosDe(l);
    const funnel = [
      ['Registros', m.total],
      ...clasesDe(l).map((c, i) => [`Vieron la clase ${i + 1}`, m[c]]),
      ...(conVip(l) ? [['Compraron la entrada VIP', m.vip]] : []),
      ...(vs.length > 1 ? (m.videos || []).map((v) => [`Vieron el ${v.nombre}`, v.vieron]) : [['Asistieron al directo', m.live], ['Vieron la grabación', m.replay]]),
      ['Compraron', m.compra],
    ];
    const objetivos = (m.objetivos || []).map((o) => `<div style="margin:8px 0"><b>${esc(o.label)}</b> · ${o.unit === 'eur' ? eur(o.actual) : num(o.actual)} de ${o.unit === 'eur' ? eur(o.meta) : num(o.meta)} (${Math.round(o.pct * 100)}%)<div class="bar"><i style="width:${Math.min(100, o.pct * 100)}%"></i></div></div>`).join('');
    const cuerpo = `
      <section><h2>Resultados</h2><div class="kpis">
        <div><span>Registros</span><b>${num(m.total)}</b></div>
        ${conVip(l) ? `<div><span>Entradas VIP</span><b>${num(m.vip)}</b></div>` : ''}
        <div><span>Ventas</span><b>${num(m.compra)}</b></div>
        <div><span>Facturación</span><b>${eur(m.eco.facturacion)}</b></div>
        <div><span>Inversión</span><b>${eur(m.eco.inversion || null)}</b></div>
        <div><span>ROAS</span><b>${m.eco.roas ? m.eco.roas.toLocaleString('es-ES', { maximumFractionDigits: 1 }) : '–'}</b></div>
        <div><span>Coste por registro</span><b>${eur(m.eco.cpl)}</b></div>
        <div><span>Coste por venta</span><b>${eur(m.eco.cac)}</b></div>
      </div></section>
      ${objetivos ? `<section><h2>Resultados frente a objetivos</h2>${objetivos}</section>` : ''}
      <section><h2>Embudo</h2>${barras(funnel)}</section>
      ${ranking.length ? `<section><h2>Anuncios ganadores</h2>${tabla(['Anuncio', 'Registros', 'Ventas', 'Conversión', 'Inversión', 'Coste por venta'], ranking.map((a) => [`${esc(a.label)}${a.campaign ? `<br><small class="muted">${esc(a.campaign)}</small>` : ''}`, num(a.leads), num(a.compras), pct(a.compras, a.leads), eur(a.spend), eur(a.cac)]))}</section>` : ''}
      ${perfil?.avatares?.length ? `<section><h2>Avatar comprador</h2><ul>${perfil.avatares.slice(0, 3).map((a, i) => `<li><b>Avatar ${i + 1}</b> (compra ${veces(a.indice)} respecto a la media): ${esc(describirAvatar(a.traits, preguntas))}</li>`).join('')}</ul>
        <p class="muted" style="font-size:13px">Sacado de las respuestas a la encuesta de ${num(perfil.leads)} personas, cruzadas con quién ${perfil.objetivo === 'vip' ? 'compró la VIP' : 'compró'}.</p></section>` : ''}
      ${aprendizajes.length ? `<section><h2>Aprendizajes</h2><ul>${aprendizajes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}`;
    const html = pagina({
      titulo: `Informe · ${l.name}`,
      sub: `${FORMATOS[l.formato || 'webinar']?.label || 'Webinar'}${l.inicioCaptacion ? ` · del ${fecha(l.inicioCaptacion)}` : ''}${l.cierreCarrito ? ` al ${fecha(l.cierreCarrito)}` : ''}`,
      marca: config.marca, cuerpo,
    });
    return { html: conProducto(html, prod), asunto: conProducto(`Informe del lanzamiento «${l.name}»`, prod), resumen: { ventas: m.compra, facturacion: m.eco.facturacion, roas: m.eco.roas } };
  });
}

// VSL: la semana pasada (lunes a domingo) frente a la anterior.
export async function informeVslSemana(id, hoy = hoyMadrid()) {
  return enCache(`v:${id}:${hoy}`, async () => {
    const config = await getConfig();
    const v = config.vsls?.[id];
    if (!v) throw Object.assign(new Error('VSL no encontrada'), { status: 404, publicMessage: 'VSL no encontrada' });
    const dow = (new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = lunes
    const lunes = addDay(hoy, -dow - 7);
    const sem = { desde: lunes, hasta: addDay(lunes, 6) };
    const ant = { desde: addDay(lunes, -7), hasta: addDay(lunes, -1) };
    const leads = (await todosLosLeads(v.registroTag, [v.compraDateField, v.registroDateField])).map((c) => enrichVsl(c, { ...v, id }, { pais: config.defaultCountryCode }));
    let inv = null;
    let invAnt = null;
    let names = {};
    let spendBy = {};
    if (metaConfigured()) {
      try {
        const r = await adSpend({ since: sem.desde, until: sem.hasta, filter: v.metaFiltro || '' });
        inv = r.total; names = r.names; spendBy = r.spendBy;
        invAnt = (await adSpend({ since: ant.desde, until: ant.hasta, filter: v.metaFiltro || '' })).total;
      } catch { /* sin Meta */ }
    }
    const m = computeVsl(leads, sem, v, { inversion: inv });
    const p = computeVsl(leads, ant, v, { inversion: invAnt });
    const delta = (a, b) => (b ? ` <small class="muted">(${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}% vs semana anterior)</small>` : '');
    const deSemana = leads.filter((l) => l.fReg >= sem.desde && l.fReg <= sem.hasta);
    const ranking = rankingGanadores(deSemana, v, 'ad', names, spendBy).slice(0, 6);
    const aprend = [];
    if (p.registros) aprend.push(`Registros: ${num(m.registros)} frente a ${num(p.registros)} la semana anterior.`);
    if (m.cpl && p.cpl) aprend.push(`El coste por registro ${m.cpl > p.cpl ? 'subió' : 'bajó'} un ${Math.abs(Math.round(((m.cpl - p.cpl) / p.cpl) * 100))}% (${eur(m.cpl)}).`);
    if (m.registros) aprend.push(`De los registros de la semana, el ${pct(m.vio, m.registros)} vio el vídeo y el ${pct(m.llamada, m.registros)} agendó llamada.`);
    if (ranking[0]?.compras) aprend.push(`El anuncio con más ventas fue «${ranking[0].label}» (${ranking[0].compras}).`);
    const cuerpo = `
      <section><h2>Semana del ${esc(fecha(sem.desde))} al ${esc(fecha(sem.hasta))}</h2><div class="kpis">
        <div><span>Registros</span><b>${num(m.registros)}</b>${delta(m.registros, p.registros)}</div>
        <div><span>Ventas</span><b>${num(m.ventas)}</b>${delta(m.ventas, p.ventas)}</div>
        <div><span>Facturación</span><b>${eur(m.ingresos)}</b></div>
        <div><span>Inversión</span><b>${eur(m.inversion)}</b></div>
        <div><span>ROAS</span><b>${m.roas ? m.roas.toLocaleString('es-ES', { maximumFractionDigits: 1 }) : '–'}</b></div>
        <div><span>Coste por registro</span><b>${eur(m.cpl)}</b></div>
      </div></section>
      <section><h2>Embudo de la semana</h2>${barras([['Registros', m.registros], ['Vieron el vídeo', m.vio], ['Hasta el final', m.vio90], ['Agendaron llamada', m.llamada], ['Compraron', m.compraCohorte]])}</section>
      ${ranking.length ? `<section><h2>Anuncios ganadores</h2>${tabla(['Anuncio', 'Registros', 'Ventas', 'Inversión'], ranking.map((a) => [esc(a.label), num(a.leads), num(a.compras), eur(a.spend)]))}</section>` : ''}
      ${aprend.length ? `<section><h2>Aprendizajes</h2><ul>${aprend.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}`;
    const prod = nombreProducto(config);
    return { html: conProducto(pagina({ titulo: `Informe semanal · ${v.name}`, sub: `Semana del ${fecha(sem.desde)} al ${fecha(sem.hasta)}`, marca: config.marca, cuerpo }), prod), asunto: `Informe semanal · ${v.name}`, semana: sem };
  });
}
