// Conversions API de Meta: los eventos que AlquimIA puede mandar y la configuración de cada cliente (lib/meta-capi.js).
export const EVENTOS_CAPI = {
  compras: { nombre: 'Purchase', label: 'Compras (Hotmart y ThriveCart) con su valor' },
  clase1: { nombre: 'VioClase1', label: 'Vio la clase 1 (la mitad o más)' },
  directo: { nombre: 'EntroAlDirecto', label: 'Entró al directo' },
};
export function sanitizeMetaCapi(m) {
  const pixel = String(m?.pixelId || '').replace(/\D/g, '').slice(0, 20);
  const eventos = Object.fromEntries(Object.keys(EVENTOS_CAPI).map((k) => [k, m?.eventos?.[k] !== false]));
  const test = String(m?.testCode || '').trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
  return { pixelId: pixel, activo: m?.activo === true && pixel.length >= 8, eventos, ...(test ? { testCode: test } : {}) };
}
