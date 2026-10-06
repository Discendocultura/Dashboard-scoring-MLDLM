// Embudo VSL (siempre abierto): registro → vídeo → compra directa o llamada de valoración.
// Señales de cada lead, rangos de fechas (presets, mes y semanas del mes) y métricas.
// Lo usan el navegador y los tests.
import { dayInMadrid, waPhone } from './scoring.js';

export const VSL_PCTS = [25, 50, 75, 90];
// Etiqueta que pone vsl.js al ver el X% del vídeo (como en los lanzamientos: <código>_<vídeo>_<pct>).
export const vslTag = (pct) => `vsl_vsl_${pct}`;

const DAY = 86_400_000;
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
export const addDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const finDeMes = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0, 12)).toISOString().slice(0, 10);
};

// Semanas de un mes como las cuenta el equipo: 1ª (días 1-7), 2ª (8-14), 3ª (15-21), 4ª (22-28), 5ª (29-fin).
export function semanasDelMes(ym) {
  const fin = finDeMes(ym);
  const ultimo = Number(fin.slice(8));
  const out = [];
  for (let n = 1, d = 1; d <= ultimo; n++, d += 7) {
    out.push({ n, desde: `${ym}-${String(d).padStart(2, '0')}`, hasta: `${ym}-${String(Math.min(d + 6, ultimo)).padStart(2, '0')}` });
  }
  return out;
}

// Rango a partir de lo elegido en el dashboard. preset: 7d | 30d | 90d | mes-actual | mes-pasado | mes | personalizado
export function rangoDe({ preset = '30d', mes = '', semana = 0, desde = '', hasta = '' } = {}, hoy) {
  const ymHoy = hoy.slice(0, 7);
  const mesPasado = addDay(`${ymHoy}-01`, -1).slice(0, 7);
  if (preset === '7d') return { desde: addDay(hoy, -6), hasta: hoy };
  if (preset === '90d') return { desde: addDay(hoy, -89), hasta: hoy };
  if (preset === 'mes-actual' || preset === 'mes-pasado' || preset === 'mes') {
    const ym = preset === 'mes-actual' ? ymHoy : preset === 'mes-pasado' ? mesPasado : (/^\d{4}-\d{2}$/.test(mes) ? mes : ymHoy);
    const s = semana ? semanasDelMes(ym).find((w) => w.n === Number(semana)) : null;
    return s ? { desde: s.desde, hasta: s.hasta } : { desde: `${ym}-01`, hasta: finDeMes(ym) };
  }
  if (preset === 'personalizado' && isDay(desde) && isDay(hasta)) return desde <= hasta ? { desde, hasta } : { desde: hasta, hasta: desde };
  return { desde: addDay(hoy, -29), hasta: hoy };
}

const enRango = (d, r) => Boolean(d) && d >= r.desde && d <= r.hasta;

// Señales de un contacto de la VSL. `citas`: Map contactId → [{ start, resultado }] (opcional).
export function enrichVsl(c, vsl, { pais = '34', citas = null } = {}) {
  const tags = new Set((c.tags || []).map((t) => String(t).toLowerCase()));
  const has = (t) => Boolean(t) && tags.has(String(t).toLowerCase());
  const pct = [...VSL_PCTS].reverse().find((p) => tags.has(vslTag(p))) || 0;
  const misCitas = citas?.get(c.id) || [];
  const src = c.src || {};
  const pagado = /paid|cpc|ppc|ads?$/i.test(src.medium || '') || src.source === 'formulario-meta' || Boolean(src.campaign);
  const s = {
    vio: has(vsl.vioTag) || pct > 0,
    pct,
    compra: has(vsl.compraTag),
    fraccionado: has(vsl.fraccionadoTag),
    unico: has(vsl.unicoTag),
    llamada: has(vsl.llamadaTag) || misCitas.length > 0,
    vip: false, // compatibilidad con el ranking de anuncios de los lanzamientos
    origen: has(vsl.publiTag) ? 'publi' : has(vsl.organicoTag) ? 'organico' : pagado ? 'publi' : 'organico',
  };
  const fReg = dayInMadrid(c.cf?.[vsl.registroDateField] || c.dateAdded || '');
  const fCompra = s.compra ? dayInMadrid(c.cf?.[vsl.compraDateField] || '') || fReg : '';
  const estado = s.compra ? 'compro' : s.llamada ? 'llamada' : s.pct >= 75 ? 'final' : s.vio ? 'vio' : 'novio';
  return {
    ...c, s, fReg, fCompra, estado, citas: misCitas,
    phoneWa: waPhone(c.phone, pais),
    search: `${c.name} ${c.email} ${c.phone}`.toLowerCase(),
  };
}

export const ESTADOS_VSL = [
  { id: 'novio', label: 'No ha visto el vídeo', icon: '🙈', plantilla: 'vsl_novio' },
  { id: 'vio', label: 'Ha empezado el vídeo', icon: '▶️', plantilla: 'vsl_vio' },
  { id: 'final', label: 'Vio el vídeo hasta el final', icon: '🔥', plantilla: 'vsl_final' },
  { id: 'llamada', label: 'Ha agendado llamada', icon: '📞', plantilla: '' },
  { id: 'compro', label: 'Ha comprado', icon: '🎉', plantilla: '' },
];

export const importeVsl = (l, vsl) => (l.s.fraccionado && Number(vsl.precioFraccionado) ? Number(vsl.precioFraccionado) : Number(vsl.precioPrograma) || 0);

// Métricas de un rango. Registros = altas en el rango; el embudo (vio, llamada, compra) es de esas altas.
// Ventas = compras con fecha en el rango (aunque se registraran antes).
export function computeVsl(leads, rango, vsl, { inversion = null } = {}) {
  const reg = leads.filter((l) => enRango(l.fReg, rango));
  const c = (fn) => reg.filter(fn).length;
  const ventas = leads.filter((l) => enRango(l.fCompra, rango));
  const ingresos = ventas.reduce((a, l) => a + importeVsl(l, vsl), 0);
  const m = {
    registros: reg.length,
    publi: c((l) => l.s.origen === 'publi'),
    organico: c((l) => l.s.origen === 'organico'),
    vio: c((l) => l.s.vio),
    vio25: c((l) => l.s.pct >= 25),
    vio50: c((l) => l.s.pct >= 50),
    vio75: c((l) => l.s.pct >= 75),
    vio90: c((l) => l.s.pct >= 90),
    llamada: c((l) => l.s.llamada),
    compraCohorte: c((l) => l.s.compra),
    compraConLlamada: c((l) => l.s.compra && l.s.llamada),
    ventas: ventas.length,
    ventasDirectas: ventas.filter((l) => !l.s.llamada).length,
    ventasLlamada: ventas.filter((l) => l.s.llamada).length,
    ingresos,
    inversion,
  };
  m.cpl = inversion != null && m.registros ? inversion / m.registros : null;
  m.cpa = inversion != null && m.ventas ? inversion / m.ventas : null;
  m.roas = inversion ? ingresos / inversion : null;
  return m;
}

// Filas por semana del mes (1ª, 2ª…) de cada mes que toca el rango, recortadas al rango.
export function porSemanas(leads, rango, vsl) {
  const out = [];
  for (let ym = rango.desde.slice(0, 7); ym <= rango.hasta.slice(0, 7); ym = addDay(finDeMes(ym), 1).slice(0, 7)) {
    for (const w of semanasDelMes(ym)) {
      const r = { desde: w.desde > rango.desde ? w.desde : rango.desde, hasta: w.hasta < rango.hasta ? w.hasta : rango.hasta };
      if (r.desde > r.hasta) continue;
      out.push({ ym, n: w.n, ...r, m: computeVsl(leads, r, vsl) });
    }
  }
  return out;
}

// Registros y ventas por día del rango (para el gráfico).
export function porDias(leads, rango) {
  const dias = [];
  for (let d = rango.desde; d <= rango.hasta && dias.length < 400; d = addDay(d, 1)) dias.push({ d, registros: 0, ventas: 0 });
  const idx = new Map(dias.map((x, i) => [x.d, i]));
  for (const l of leads) {
    if (idx.has(l.fReg)) dias[idx.get(l.fReg)].registros++;
    if (idx.has(l.fCompra)) dias[idx.get(l.fCompra)].ventas++;
  }
  return dias;
}
