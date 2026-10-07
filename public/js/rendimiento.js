// Rendimiento del equipo por persona (setters y closers): WhatsApps enviados, leads contactados,
// resultados anotados, llamadas hechas, shows y cierres, ventas de sus contactadas y tiempo de
// respuesta tras el registro. Lo usan el navegador y los tests.
import { RESULTADOS } from './llamadas.js';

const SHOW = new Set(RESULTADOS.filter((r) => r.cita === 'showed').map((r) => r.id));
const mediana = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};

//  eventos: [{ t: 'wa'|'res', cid, r?, uid, por, en }]   (de /api/rendimiento)
//  llamadas: { <eventId>: { resultado, contactId, por, en }, _wa: { <cid>: { por, en } } }
//  leads: [{ id, regAt (ISO), compra, importe }]
//  rango (opcional): { desde, hasta } (AAAA-MM-DD) para contar solo lo hecho en esas fechas
export function rendimientoEquipo({ eventos = [], llamadas = {}, leads = [], rango = null }) {
  const enRango = (iso) => !rango || (iso && iso.slice(0, 10) >= rango.desde && iso.slice(0, 10) <= rango.hasta);
  const lead = new Map(leads.map((l) => [l.id, l]));
  const personas = new Map();
  // Por nombre (las llamadas solo guardan el nombre de quien anota el resultado).
  const p = (por) => {
    const k = String(por || '¿?').trim().toLowerCase();
    if (!personas.has(k)) personas.set(k, { id: k, nombre: por || '¿?', wa: 0, contactados: new Set(), resultados: {}, llamadas: 0, shows: 0, noshows: 0, cierres: 0, ventas: 0, importe: 0, tiempos: [] });
    return personas.get(k);
  };
  // WhatsApps de los leads y de las llamadas (en orden, para saber quién contactó primero a cada uno)
  const was = [
    ...eventos.filter((e) => e.t === 'wa'),
    ...Object.entries(llamadas._wa || {}).map(([cid, w]) => ({ t: 'wa', cid, por: w.por, uid: '', en: w.en })),
  ].sort((a, b) => String(a.en).localeCompare(String(b.en)));
  const primero = new Map();
  for (const e of was) if (!primero.has(e.cid)) primero.set(e.cid, e);
  for (const e of was) {
    if (!enRango(e.en)) continue;
    const x = p(e.por);
    x.wa++;
    x.contactados.add(e.cid);
  }
  for (const e of eventos.filter((x) => x.t === 'res' && enRango(x.en))) {
    const x = p(e.por);
    x.resultados[e.r] = (x.resultados[e.r] || 0) + 1;
  }
  // Primer contacto: tiempo de respuesta y ventas de quien contactó primero
  for (const [cid, e] of primero) {
    if (!enRango(e.en)) continue;
    const x = p(e.por);
    const l = lead.get(cid);
    if (!l) continue;
    const h = (Date.parse(e.en) - Date.parse(l.regAt)) / 3_600_000;
    if (Number.isFinite(h) && h >= 0) x.tiempos.push(h);
    if (l.compra) { x.ventas++; x.importe += l.importe || 0; }
  }
  // Llamadas (closers)
  for (const [id, r] of Object.entries(llamadas)) {
    if (id === '_wa' || !r?.resultado || !enRango(r.en)) continue;
    const x = p(r.por);
    if (r.resultado === 'noshow') x.noshows++;
    if (SHOW.has(r.resultado)) { x.llamadas++; x.shows++; }
    if (r.resultado === 'venta') x.cierres++;
  }
  const out = [...personas.values()].map((x) => ({
    ...x, contactados: x.contactados.size,
    showRate: x.shows + x.noshows ? x.shows / (x.shows + x.noshows) : null,
    cierreRate: x.shows ? x.cierres / x.shows : null,
    conversion: x.contactados.size ? x.ventas / x.contactados.size : null,
    respuestaMediana: mediana(x.tiempos),
    en24h: x.tiempos.length ? x.tiempos.filter((h) => h <= 24).length / x.tiempos.length : null,
  })).sort((a, b) => (b.wa + b.llamadas) - (a.wa + a.llamadas));
  const todos = out.flatMap((x) => x.tiempos);
  return {
    personas: out,
    total: {
      wa: out.reduce((a, x) => a + x.wa, 0), contactados: primero.size, llamadas: out.reduce((a, x) => a + x.llamadas, 0),
      cierres: out.reduce((a, x) => a + x.cierres, 0), respuestaMediana: mediana(todos),
      sinContactar: leads.filter((l) => !primero.has(l.id) && !l.compra).length,
    },
  };
}
