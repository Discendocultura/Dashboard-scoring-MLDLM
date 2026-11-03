// Conversions API de Meta: los eventos que AlquimIA puede mandar y la configuración de cada cliente (lib/meta-capi.js).
//   porDefecto: si viene encendido en un cliente nuevo. Los de calidad (cualificado, llamada, oferta) salen de la
//   tarea programada /api/meta-capi?key=… (lib/meta-capi-senales.js); las compras y el directo, al momento.
export const EVENTOS_CAPI = {
  compras: { nombre: 'Purchase', label: 'Ventas de cualquier tipo, con su valor y lo que lleva gastado esa persona (Hotmart, ThriveCart y CSV)', porDefecto: true },
  cualificado: { nombre: 'LeadCualificado', label: 'Lead cualificado (llega a «Caliente» en la puntuación de AlquimIA)', porDefecto: true },
  llamada: { nombre: 'Schedule', label: 'Llamada agendada (la reserve el lead o la agende el setter)', porDefecto: true },
  directo: { nombre: 'EntroAlDirecto', label: 'Entró al directo', porDefecto: true },
  oferta: { nombre: 'SeQuedoHastaLaOferta', label: 'Se quedó en el directo hasta la oferta', porDefecto: true },
  clase1: { nombre: 'VioClase1', label: 'Vio la clase 1 (la mitad o más) · opcional: demasiados eventos distraen a Meta', porDefecto: false },
};
export function sanitizeMetaCapi(m) {
  const pixel = String(m?.pixelId || '').replace(/\D/g, '').slice(0, 20);
  const eventos = Object.fromEntries(Object.entries(EVENTOS_CAPI).map(([k, e]) => [k, typeof m?.eventos?.[k] === 'boolean' ? m.eventos[k] : e.porDefecto]));
  const test = String(m?.testCode || '').trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
  return { pixelId: pixel, activo: m?.activo === true && pixel.length >= 8, eventos, ...(test ? { testCode: test } : {}) };
}

// CSV de clientes (navegador): filas de ventasDeCsv (public/js/thrivecart.js) + la columna del teléfono, si la hay.
export const TEL_CSV = /tel[eé]fono|phone|m[oó]vil|mobile|celular|whats/;
export function filasClientesCsv(ventas = [], cabecera = [], filasTexto = []) {
  const iTel = cabecera.findIndex((h) => TEL_CSV.test(String(h).toLowerCase()));
  const iEmail = cabecera.findIndex((h) => /e-?mail/.test(String(h).toLowerCase()));
  const telDe = new Map();
  if (iTel >= 0 && iEmail >= 0) for (const f of filasTexto.slice(1)) { const em = String(f[iEmail] || '').trim().toLowerCase(); if (em && f[iTel]) telDe.set(em, String(f[iTel]).trim()); }
  return ventas.map((v) => ({ email: v.email, telefono: telDe.get(v.email) || '', nombre: v.nombre || '', importe: v.importe, moneda: v.moneda || 'EUR', producto: v.producto || '', fecha: v.fecha, pedido: v.pedido || '', reembolso: v.tipo === 'reembolso' }));
}
