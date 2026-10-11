import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faseInforme, datosInforme, informeHtml, sanitizeInformes, fotoTotales } from '../public/js/informe-diario.js';

const l = { name: 'Demo octubre', inicioCaptacion: '2026-10-01', fechaDirecto: '2026-10-15', cierreCarrito: '2026-10-20T23:59' };
const mBase = (o = {}) => ({
  total: 1850, vip: 146, compra: 0, encuestaActiva: true, encuesta: 900, frio: 1200, templado: 650, clase1: 400, clase2: 0, clase3: 0,
  live: 0, llamada: 0, inicioPago: 0, compraLive: 0, compraVip: 0, compraLlamada: 0, compraInicioPago: 0,
  origen: { publi: { leads: 1500 }, organico: { leads: 350 } }, bumps: [], objetivos: [{ label: 'Registros', actual: 1850, meta: 2000, pct: 0.925 }],
  pago: { unico: { n: 0 }, fraccionado: { n: 0 } },
  eco: { inversion: 1500, inversionFuente: 'meta', facturacion: 5671, facturacionVip: 5671, facturacionBumps: 0, facturacionPrograma: 0, cpl: 0.81, cplFrio: 1.25, cpVip: 10.27, roas: 3.78, cac: null, beneficio: 4171 },
  ...o,
});

test('fase del informe: captación hasta el día antes del directo, carrito hasta el cierre', () => {
  assert.equal(faseInforme(l, '2026-09-30'), null);
  assert.equal(faseInforme(l, '2026-10-01'), 'captacion');
  assert.equal(faseInforme(l, '2026-10-14'), 'captacion');
  assert.equal(faseInforme(l, '2026-10-15'), 'carrito');
  assert.equal(faseInforme(l, '2026-10-20'), 'carrito');
  assert.equal(faseInforme(l, '2026-10-21'), null);
  assert.equal(faseInforme({ inicioCaptacion: '2026-10-01' }, '2026-10-05'), 'captacion'); // sin directo aún
});

test('captación: registros (+ayer con la foto del día anterior), VIP solo si el lanzamiento la tiene', () => {
  const fotos = { '2026-10-09': { registros: 1700, vip: 130, ventas: 0 } };
  const d = datosInforme({ l: { ...l, vip: true }, m: mBase(), fase: 'captacion', dia: '2026-10-10', fotos });
  assert.match(d.asunto, /1850 registros \(\+150 ayer\) · 146 VIP · CPL 0,81 €/);
  assert.ok(d.destacados.some((x) => x.label === 'Entradas VIP' && /\+16 ayer/.test(x.sub)));
  assert.ok(d.secciones.some((s) => s.titulo.includes('Entrada VIP')));
  assert.match(d.intro, /Día 10 de captación · faltan 5 días para el directo/);
  // Sin VIP (embudo sin entrada VIP): no se habla de VIP. Sin inversión: ni CPL ni ROAS.
  const sinVip = datosInforme({ l: { ...l, vip: false }, m: mBase({ eco: { ...mBase().eco, inversion: 0, cpl: null, roas: null } }), fase: 'captacion', dia: '2026-10-10', fotos });
  const txt = JSON.stringify(sinVip);
  assert.ok(!/VIP/.test(txt), 'no debe hablar de VIP');
  assert.ok(!/CPL|ROAS/.test(txt), 'sin inversión no hay CPL ni ROAS');
});

test('carrito: ventas de ayer, por día del carrito (con fecha de compra) y facturación', () => {
  const leads = [
    { s: { compra: true, fecha_compra: '2026-10-15' } }, { s: { compra: true, fecha_compra: '2026-10-16' } }, { s: { compra: true, fecha_compra: '2026-10-16' } }, { s: {} },
  ];
  const m = mBase({ compra: 3, live: 600, compraLive: 2, eco: { ...mBase().eco, facturacion: 8000, facturacionPrograma: 2329, cac: 500, roas: 5.33 } });
  const d = datosInforme({ l: { ...l, vip: true }, m, leads, fase: 'carrito', dia: '2026-10-16', producto: 'Raíces' });
  assert.match(d.asunto, /2 ventas ayer · 3 en total · ROAS 5,33x/);
  assert.deepEqual(d.tabla.filas, [['2026-10-15', '1'], ['2026-10-16', '2']]);
  assert.match(d.intro, /Quedan 5 días de carrito/);
  assert.ok(d.secciones[0].filas.some(([a]) => a === 'Compraron de las que vieron el directo'));
  const html = informeHtml(d, { url: 'https://x.dev/' });
  assert.match(html, /Ventas por día del carrito/);
  assert.match(html, /Abrir el dashboard/);
  assert.deepEqual(fotoTotales(m), { registros: 1850, vip: 146, ventas: 3, facturacion: 8000, inversion: 1500 });
});

test('emails de la pestaña Informes: válidos, sin repetir y como mucho 10', () => {
  const s = sanitizeInformes({ emails: ['A@x.com', 'a@x.com', 'malo', ...Array.from({ length: 12 }, (_, i) => `p${i}@y.es`)], captacion: false });
  assert.equal(s.emails[0], 'a@x.com');
  assert.equal(s.emails.length, 10);
  assert.equal(s.captacion, false);
  assert.equal(s.carrito, true);
});
