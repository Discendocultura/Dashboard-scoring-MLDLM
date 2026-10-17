// Plantillas de WhatsApp (de pago) enviadas desde el dashboard: totales del registro de envíos y su retorno.
// Lo usan el navegador (Leads, Setting hoy, Rendimiento) y el servidor (lib/envios-plantillas.js).

// Totales de una lista de envíos [{ at, tag, nombre, ids, precio }]:
// { enviadas, coste, porPlantilla: { tag: { nombre, enviadas, coste } }, primera: { cid: epoch del primer envío } }
export function totalesEnvios(lista = []) {
  const out = { enviadas: 0, coste: 0, porPlantilla: {}, primera: {} };
  for (const e of lista) {
    const n = e.ids?.length || 0;
    const c = n * (Number(e.precio) || 0);
    out.enviadas += n;
    out.coste += c;
    const p = (out.porPlantilla[e.tag] ||= { nombre: e.nombre || e.tag, enviadas: 0, coste: 0 });
    p.enviadas += n;
    p.coste += c;
    const t = Date.parse(e.at) || 0;
    for (const id of e.ids || []) if (!out.primera[id] || t < out.primera[id]) out.primera[id] = t;
  }
  out.coste = Math.round(out.coste * 100) / 100;
  return out;
}

// Retorno de las plantillas con los leads del embudo: a cuántas personas, cuántas respondieron (setter IA), cuántas
// compraron DESPUÉS de su primera plantilla (si se sabe el día de compra) y cuánto facturaron.
//   leads: [{ id, s }] · importe(lead) → € · dia(epoch) → 'AAAA-MM-DD'
export function retornoPlantillas(lista, leads, { importe = () => 0, dia = (t) => new Date(t).toISOString().slice(0, 10) } = {}) {
  const t = totalesEnvios(lista);
  const porId = new Map((leads || []).map((l) => [l.id, l]));
  let personas = 0; let respondieron = 0; let compraron = 0; let ingresos = 0;
  for (const [id, primera] of Object.entries(t.primera)) {
    const l = porId.get(id);
    personas++;
    if (!l) continue;
    if (l.s?.setter?.respondio) respondieron++;
    if (l.s?.compra && (!l.s.fecha_compra || l.s.fecha_compra >= dia(primera))) { compraron++; ingresos += Number(importe(l)) || 0; }
  }
  return {
    ...t, personas, respondieron, compraron, ingresos: Math.round(ingresos * 100) / 100,
    retorno: t.coste > 0 ? ingresos / t.coste : null,
    costeVenta: compraron ? t.coste / compraron : null,
  };
}

// Coste estimado de enviar `n` plantillas a `precio` € cada una.
export const costeEstimado = (n, precio) => Math.round(n * (Number(precio) || 0) * 100) / 100;
