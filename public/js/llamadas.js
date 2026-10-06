// Llamadas de valoración (calendario de GHL + pipeline «Leads Lanzamientos»).
// Lo usan el servidor (al guardar el resultado) y el navegador (pestaña Llamadas y métricas).

// Resultado que anota la setter → estado de la cita en GHL y etapa del pipeline.
export const RESULTADOS = [
  { id: 'venta', label: 'Venta', icon: '✅', cita: 'showed', etapa: 'venta', status: 'won' },
  { id: 'seguimiento', label: 'Seguimiento', icon: '🔁', cita: 'showed', etapa: 'seguimiento', status: 'open' },
  { id: 'perdido', label: 'No compra', icon: '❌', cita: 'showed', etapa: 'perdido', status: 'lost' },
  { id: 'noshow', label: 'No se presentó', icon: '🚫', cita: 'noshow', etapa: 'nocontesta', status: 'open' },
  { id: 'reagendar', label: 'Reagendar', icon: '📅', cita: 'cancelled', etapa: 'agenda', status: 'open' },
];
export const RESULTADO_IDS = RESULTADOS.map((r) => r.id);

export const MOTIVOS = ['Precio', 'No es el momento', 'Lo tiene que hablar con su pareja', 'Ya está en tratamiento', 'No le encaja el programa', 'Ya está embarazada', 'Otro'];

export const PIPELINE_POR_DEFECTO = 'Leads Lanzamientos';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Etapas del pipeline por su nombre (no por id, para que sirva aunque se recree el pipeline).
export function etapasPipeline(pipeline) {
  const out = { nocontesta: [] };
  for (const s of [...(pipeline?.stages || [])].sort((a, b) => a.position - b.position)) {
    const n = norm(s.name);
    if (/^registrad/.test(n)) out.registrado = s.id;
    else if (/^contactad/.test(n)) out.contactado = s.id;
    else if (/agenda/.test(n)) out.agenda = s.id;
    else if (/no contesta/.test(n)) out.nocontesta.push(s.id);
    else if (/seguimiento/.test(n)) out.seguimiento = s.id;
    else if (/venta|ganad/.test(n)) out.venta = s.id;
    else if (/perdid/.test(n)) out.perdido = s.id;
  }
  return out;
}

// Etapa destino de un resultado. «No se presentó» avanza No contesta 1 → 2 → 3.
export function etapaDestino(resultado, etapas, etapaActual) {
  const r = RESULTADOS.find((x) => x.id === resultado);
  if (!r) return null;
  if (r.etapa !== 'nocontesta') return etapas[r.etapa] || null;
  const nc = etapas.nocontesta;
  const i = nc.indexOf(etapaActual);
  return nc[Math.min(i + 1, nc.length - 1)] || null;
}

// ID del calendario a partir del enlace de reserva de GHL (…/widget/booking/<id>).
export function calendarioDeUrl(url) {
  return /\/widget\/booking\/([A-Za-z0-9]+)/.exec(String(url || ''))?.[1] || '';
}

// Métricas: llamadas = [{ start (ms), resultado: { resultado, motivo } | null, cancelada }]
//  · % cancelaciones: sobre todas las citas reservadas.
//  · % shows y % no shows: sobre las citas ya pasadas que tenían que hacerse (show + no show).
//  · % conversión: ventas sobre shows (llamadas realizadas).
export function metricasLlamadas(llamadas, ahora = Date.now()) {
  const pct = (n, d) => (d ? n / d : null);
  const validas = llamadas.filter((l) => !l.cancelada);
  const pasadas = validas.filter((l) => l.start < ahora);
  const con = (id) => pasadas.filter((l) => l.resultado?.resultado === id).length;
  const shows = con('venta') + con('seguimiento') + con('perdido');
  const noshow = con('noshow');
  const canceladas = llamadas.length - validas.length;
  const motivos = {};
  for (const l of pasadas) if (l.resultado?.resultado === 'perdido') motivos[l.resultado.motivo || 'Sin motivo'] = (motivos[l.resultado.motivo || 'Sin motivo'] || 0) + 1;
  return {
    reservadas: llamadas.length,
    agendadas: validas.length,
    proximas: validas.length - pasadas.length,
    pasadas: pasadas.length,
    realizadas: shows,
    shows,
    noshow,
    canceladas,
    reagendadas: con('reagendar'),
    ventas: con('venta'),
    seguimiento: con('seguimiento'),
    perdidas: con('perdido'),
    sinResultado: pasadas.filter((l) => !l.resultado).length,
    pctShow: pct(shows, shows + noshow),
    pctNoshow: pct(noshow, shows + noshow),
    pctCancel: pct(canceladas, llamadas.length),
    conversion: pct(con('venta'), shows),
    // Compatibilidad con nombres anteriores
    asistencia: pct(shows, shows + noshow),
    cierre: pct(con('venta'), shows),
    motivos: Object.entries(motivos).sort((a, b) => b[1] - a[1]),
  };
}
