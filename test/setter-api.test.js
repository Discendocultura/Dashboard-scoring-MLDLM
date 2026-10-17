import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elegirProducto, textoMarca, textoLanzamiento, textoLead, datosLead, faseActual } from '../lib/setter-api.js';
import { enrichLead } from '../public/js/metrics.js';

const m = {
  respuestas: { nombre: 'Mi marca' },
  productos: [
    { id: 'p1', respuestas: { nombre: 'Raíces', paraQuien: 'Mujeres que buscan embarazo', testimonios: 'Ana: positivo al 3.er mes' } },
    { id: 'p2', respuestas: { nombre: 'Curso 2' } },
  ],
  embudos: { lanz2: 'p2' },
};
const L = {
  name: 'Octubre', registroTag: 'registrado-webinar-201026', encuestaTag: 'encuesta-oct', compraTag: 'clienta-raices', vipTag: 'vip-oct',
  inicioCaptacion: '2026-10-01', fechaDirecto: '2026-10-20', horaDirecto: '19:00', aperturaCarrito: '2026-10-20T20:30', cierreCarrito: '2026-10-27T23:59',
  clase1At: '2026-10-14T10:00', clase2At: '2026-10-16T10:00', precioPrograma: 997, precioFraccionado: 350, precioVip: 27, paginaPagoUrl: 'https://x/pago', llamadaUrl: 'https://x/llamada',
  oferta: { entregables: [{ nombre: 'Programa 3 meses', tipo: 'grabado' }], bonus: [{ id: 'b1', tipo: 'bar_24h', nombre: 'Código Rojo' }], garantia: { dias15: true } },
};
const config = { launches: { oct: L }, encuesta: [{ id: 'q1', name: '¿Cuánto tiempo llevas buscando?', tipo: 'opciones' }, { id: 'q2', name: '¿Qué crees que lo bloquea?', tipo: 'texto' }] };

test('setter: el producto se elige por proyecto (id, nombre o embudo)', () => {
  assert.equal(elegirProducto(m, { pedido: 'p2' }).id, 'p2');
  assert.equal(elegirProducto(m, { pedido: 'raíces' }).id, 'p1');
  assert.equal(elegirProducto(m, { embudo: 'lanz2' }).id, 'p2');
  assert.equal(elegirProducto(m, {}).id, 'p1');
  const t = textoMarca({ cliente: 'MLDLM', m, producto: m.productos[0], config });
  assert.match(t, /Raíces/);
  assert.match(t, /Testimonios/);
  assert.match(t, /Curso 2 \(p2\)/, 'ofrece los otros productos');
});

test('setter: lanzamiento con fase, fechas, oferta, enlaces y encuesta con opciones', () => {
  const t = textoLanzamiento({ code: 'oct', l: L, nombre: 'Raíces', preguntas: [{ ...config.encuesta[0], opciones: ['Menos de 1 año', 'Más de 1 año'] }, config.encuesta[1]], ahora: Date.parse('2026-10-22T10:00:00Z') });
  assert.match(t, /Carrito abierto/);
  assert.match(t, /997 €/);
  assert.match(t, /Código Rojo/);
  assert.match(t, /https:\/\/x\/pago/);
  assert.match(t, /«Menos de 1 año», «Más de 1 año»/);
  assert.match(t, /\(respuesta libre\)/);
  assert.equal(faseActual(L, Date.parse('2026-09-20T10:00:00Z')).id, 'preparacion');
  assert.equal(faseActual(L, Date.parse('2026-10-15T10:00:00Z')).id, 'preclase');
  assert.equal(faseActual(L, Date.parse('2026-10-30T10:00:00Z')).id, 'cerrado');
});

test('setter: lead con la MISMA puntuación que el dashboard, sin email ni teléfono', () => {
  const contact = { id: 'c1', firstName: 'Lucía', name: 'Lucía García', email: 'lucia@x.com', phone: '+34600000000', dateAdded: '2026-10-02T10:00:00Z',
    tags: ['registrado-webinar-201026', 'encuesta-oct', 'oct_clase1_90', 'oct_clase2_50', 'oct_directo_asistio', 'oct_directo_final', 'vip-oct'], cf: { q1: 'Más de 1 año', q2: 'el estrés' }, src: { campaign: 'Frío', content: 'Vídeo matrona' } };
  const d = datosLead({ contact, code: 'oct', config });
  assert.equal(d.puntos, enrichLead(contact, 'oct', config).score, 'misma fórmula que scoring.js');
  const conPago = datosLead({ contact, code: 'oct', config, extra: { inicioPago: { primera: 1, ultima: Date.now(), veces: 2 } } });
  assert.ok(conPago.puntos >= 70 && conPago.temperatura.id === 'muy-caliente', 'iniciar el pago la pone muy caliente');
  const t = textoLead({ contact, code: 'oct', config, preguntas: config.encuesta, extra: { inicioPago: { primera: 1, ultima: Date.now(), veces: 2 } } });
  assert.match(t, /Lucía/);
  assert.doesNotMatch(t, /lucia@x\.com|600000000|García/);
  assert.match(t, /«¿Cuánto tiempo llevas buscando\?»: Más de 1 año/);
  assert.match(t, /Clase 1: vista hasta el 90%/);
  assert.match(t, /se quedó hasta el final/);
  assert.match(t, /Inició el pago: sí \(2 veces\)/);
  assert.match(t, /anuncio «Vídeo matrona»/);
  assert.match(t, /Entrada VIP: sí/);
});
