import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeOferta, ventanaBonus, analizarOferta, valorOferta, lecturaBonus } from '../public/js/oferta.js';
import { sanitizeConfig } from '../lib/config-store.js';

const launch = {
  fechaDirecto: '2026-10-20', horaDirecto: '19:00', cierreCarrito: '2026-10-27T23:59', formato: 'webinar',
  oferta: sanitizeOferta({
    entregables: [{ tipo: 'grabado', nombre: '8 módulos', valor: '1.200' }, { tipo: 'grupal', nombre: 'Sesiones mensuales', valor: 600 }, { tipo: 'raro', nombre: 'X' }, { nombre: '' }],
    bonus: [
      { id: 'b1', tipo: 'bar_directo', nombre: 'Sesión 1:1', valor: 150 },
      { id: 'b2', tipo: 'bar_24h', nombre: 'Guía de analíticas', valor: 47 },
      { id: 'b3', tipo: 'bar_48h', nombre: 'Masterclass', valor: 97 },
      { id: 'b4', tipo: 'bonus', nombre: 'Comunidad', valor: 0 },
    ],
  }),
};

test('oferta: limpieza, tipos y valor', () => {
  assert.equal(launch.oferta.entregables.length, 3);
  assert.equal(launch.oferta.entregables[0].valor, 1200);
  assert.equal(launch.oferta.entregables[2].tipo, 'grabado'); // tipo desconocido → grabado
  const v = valorOferta(launch.oferta, 997);
  assert.equal(v.total, 1200 + 600 + 150 + 47 + 97);
  assert.ok(v.ratio > 2);
  const c = sanitizeConfig({ launches: { oct: { name: 'Oct', oferta: launch.oferta } } });
  assert.equal(c.launches.oct.oferta.bonus.length, 4);
});

test('oferta: ventana de cada bonus según el directo y el carrito', () => {
  const d = (b) => ventanaBonus(b, launch).dias;
  assert.deepEqual(d(launch.oferta.bonus[0]), ['2026-10-20']); // en directo
  assert.deepEqual(d(launch.oferta.bonus[1]), ['2026-10-20', '2026-10-21']); // 24 h desde las 19:00
  assert.deepEqual(d(launch.oferta.bonus[2]), ['2026-10-20', '2026-10-21', '2026-10-22']);
  assert.equal(d(launch.oferta.bonus[3]).at(-1), '2026-10-27'); // todo el carrito
  // Fin a mano
  assert.deepEqual(d({ tipo: 'bar_24h', hasta: '2026-10-20T23:59' }), ['2026-10-20']);
});

test('oferta: impacto de cada bonus en las ventas de cada día', () => {
  const ventas = { '2026-10-20': 30, '2026-10-21': 12, '2026-10-22': 9, '2026-10-23': 2, '2026-10-24': 1, '2026-10-25': 1, '2026-10-26': 2, '2026-10-27': 8 };
  const vpd = { days: Object.entries(ventas).map(([day, n]) => ({ day, n, unico: 0, fracc: 0, importe: 0 })) };
  const a = analizarOferta(launch, vpd);
  assert.equal(a.total, 65);
  const b = Object.fromEntries(a.bonus.map((x) => [x.id, x]));
  assert.equal(b.b1.ventas, 30);
  assert.ok(b.b1.efecto > 3); // el día del directo vende mucho más que el resto
  assert.equal(b.b3.ventas, 51);
  assert.equal(b.b3.ventasUltimoDia, 9);
  assert.equal(b.b4.ventas, 65);
  assert.ok(a.dias[0].activos.includes('b1'));
  assert.ok(a.dias[1].caducan.includes('b2'));
  assert.match(lecturaBonus(b.b1), /funciona/);
  // Sin ventas por día
  assert.ok(analizarOferta(launch, null).bonus.every((x) => x.sinDatos));
});

test('entregables: chatbot / agente, comunidad (con su plataforma) y soporte (con su tipo)', async () => {
  const { sanitizeOferta, etiquetaEntregable } = await import('../public/js/oferta.js');
  const e = sanitizeOferta({ entregables: [
    { tipo: 'chatbot', nombre: 'Asistente', subtipo: 'skool' },
    { tipo: 'comunidad', nombre: 'Tribu', subtipo: 'skool' },
    { tipo: 'comunidad', nombre: 'Otra', subtipo: 'discord' },
    { tipo: 'soporte', nombre: '1 a 1', subtipo: 'seguimiento' },
    { tipo: 'soporte', nombre: 'Dudas', subtipo: 'email-wa' },
    { tipo: 'soporte', nombre: 'Bot' },
    { tipo: 'servicio', nombre: 'Montaje del embudo' },
  ] }).entregables;
  assert.deepEqual(e.map(etiquetaEntregable), ['Chatbot / Agente', 'Comunidad · Skool', 'Comunidad · Plataforma propia', 'Soporte · Seguimiento individual', 'Soporte · Soporte por email / WhatsApp', 'Soporte · Chatbot de soporte', 'Servicio']);
  assert.equal(e[0].subtipo, undefined);
});

test('bonus con su objetivo y garantía de la oferta', async () => {
  const { sanitizeOferta, objetivoBonus, textoGarantia } = await import('../public/js/oferta.js');
  const o = sanitizeOferta({
    bonus: [
      { nombre: 'A', objetivo: 'acelera' }, { nombre: 'B', objetivo: 'riesgo', objetivoOtro: 'x' },
      { nombre: 'C', objetivo: 'otro', objetivoOtro: 'Crear comunidad' }, { nombre: 'D', objetivo: 'inventado' },
    ],
    garantia: { dias15: 'si', otra: true, otraTexto: 'Resultados en 90 días o te devolvemos el dinero' },
  });
  assert.deepEqual(o.bonus.map(objetivoBonus), ['🚀 Acelera el resultado', '🛡️ Reduce la percepción de riesgo', '✏️ Crear comunidad', '']);
  assert.equal(o.bonus[1].objetivoOtro, '');
  assert.deepEqual(o.garantia, { dias15: true, otra: true, otraTexto: 'Resultados en 90 días o te devolvemos el dinero' });
  assert.equal(textoGarantia(o.garantia), 'Garantía de 15 días · Además: Resultados en 90 días o te devolvemos el dinero');
  assert.deepEqual(sanitizeOferta({}).garantia, { dias15: null, otra: null, otraTexto: '' });
  assert.deepEqual(sanitizeOferta({ garantia: { dias15: false, otra: false, otraTexto: 'nada' } }).garantia, { dias15: false, otra: false, otraTexto: '' });
});
