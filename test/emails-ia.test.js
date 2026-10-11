// Emails con IA: calendario de envíos, asuntos ganadores y prompt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarioEmails, asuntosGanadores, promptEmails, FASES_DEFECTO } from '../public/js/emails-ia.js';
import { bloqueNarrativa } from '../public/js/narrativa.js';

const l = {
  name: 'Noviembre', fechaDirecto: '2026-11-17', horaDirecto: '19:00', inicioCaptacion: '2026-11-03', clase1At: '2026-11-12T10:00', clase2At: '2026-11-14T10:00',
  precioVip: 27, aperturaCarrito: '2026-11-17T20:30', cierreCarrito: '2026-11-22T23:59', diasCarrito: 5, registroTag: 'registro-nov', compraTag: 'compra-raices', vipTag: 'vip-nov',
  oferta: { bonus: [{ nombre: 'Bonus 48 h', tipo: 'rapida', hasta: '2026-11-19T23:59' }] }, carritoEnvios: { '2026-11-20': { emails: ['08:00'] } },
};

test('calendario: registro, clases, VIP, directo, grabación, carrito día a día y último día', () => {
  const c = calendarioEmails(l);
  const at = (que) => c.find((x) => x.que.startsWith(que))?.at;
  assert.equal(c[0].at, ''); // la bienvenida, inmediata
  assert.equal(at('Ya disponible: Clase 1'), '2026-11-12T10:00');
  assert.equal(at('Mañana es el directo'), '2026-11-16T19:00');
  assert.equal(at('Empezamos en 1 hora'), '2026-11-17T18:00');
  assert.equal(at('Apertura del carrito'), '2026-11-17T20:30');
  // La grabación del vídeo de venta la cubren los del día 1 del carrito (foco en verla); sin carrito, su propio email.
  assert.equal(at('Grabación del directo'), undefined);
  assert.equal(calendarioEmails(l, ['replay']).find((x) => x.fase === 'replay').at, '2026-11-18T10:00');
  // Carrito: 3 al día (9, 15 y 20) y 4 el último (9, 13, 19 y 22)
  const horas = (d) => c.filter((x) => x.at.startsWith(d) && x.fase === 'carrito').map((x) => x.at.slice(11));
  assert.deepEqual(horas('2026-11-20'), ['09:00', '15:00', '20:00']);
  assert.deepEqual(horas('2026-11-22'), ['09:00', '13:00', '19:00', '22:00']);
  const car = c.filter((x) => x.fase === 'carrito' && x.que.startsWith('Carrito día'));
  assert.match(car[0].que, /día 1 · mensaje: «Mira la grabación[^»]*» · foco: ver la GRABACIÓN/);
  assert.equal(car[0].titulo, 'Mira la grabación: lo que no te puedes perder');
  assert.equal(new Set(car.map((x) => x.titulo)).size, car.length); // sin mensajes repetidos
  assert.match(car[0].que, /tono emocional/);
  assert.match(car.at(-1).que, /tono racional/);
  // El último día, el primero (9:00) siempre es el de preguntas frecuentes.
  assert.equal(c.find((x) => x.at === '2026-11-22T09:00').titulo, 'Último día: las preguntas frecuentes, respondidas');
  assert.equal(car.filter((x) => /preguntas frecuentes/i.test(x.titulo)).length, 1);
  assert.match(car.at(-1).que, /últimas horas: el carrito cierra hoy a las 23:59/);
  assert.match(car[3].que, /día 2 · mensaje: .+ · foco: la VENTA/);
  assert.equal(c.find((x) => x.at === '2026-11-19T09:00').titulo, 'Hoy acaba «Bonus 48 h» (23:59): aprovéchalo');
  assert.match(c.find((x) => x.at === '2026-11-19T09:00').que, /urgencia: hoy acaba «Bonus 48 h» a las 23:59/);
  // Sin VIP ni preclase si no se eligen
  const sin = calendarioEmails(l, FASES_DEFECTO.filter((f) => !['vip', 'preclase'].includes(f)));
  assert.ok(!sin.some((x) => x.fase === 'vip' || x.fase === 'preclase'));
  assert.ok(calendarioEmails({ ...l, precioVip: 0 }).every((x) => x.fase !== 'vip'));
  // Ordenado
  assert.deepEqual(c.map((x) => x.at), [...c.map((x) => x.at)].sort((a, b) => (a || '0').localeCompare(b || '0')));
});

test('asuntos ganadores: por apertura y por clics, con 100 entregas o más', () => {
  const t = asuntosGanadores([
    { asunto: 'Mañana empezamos', entregados: 900, apertura: 0.52, ctr: 0.08 },
    { asunto: 'Últimas horas', entregados: 800, apertura: 0.31, ctr: 0.12 },
    { asunto: 'Prueba', entregados: 20, apertura: 0.9, ctr: 0.5 },
  ]);
  assert.match(t, /MÁS SE ABRIERON:\n- «Mañana empezamos» · apertura 52,0 %/);
  assert.match(t, /MÁS CLICS tuvieron:\n- «Últimas horas»/);
  assert.doesNotMatch(t, /Prueba/);
  assert.equal(asuntosGanadores([]), '');
});

test('prompt: calendario, enlaces, etiquetas, ficha, narrativa, ganadores y formato de cada email', () => {
  const p = promptEmails({ launch: l, code: 'nov', producto: 'Raíces', marca: 'MLDLM', datos: ['- Directo el martes'], contexto: 'FICHA', ganadores: '- «Mañana empezamos»',
    narrativa: bloqueNarrativa({ titulo: 'El Camino', texto: 'TÍTULO: «El Camino»' }, 'email'), enlaces: { 'Página de venta': 'https://a.com/venta', 'Página de pago': '' }, directoUrl: 'https://d.com/directo?l=nov' });
  assert.match(p, /SECUENCIA DE EMAILS del lanzamiento «Noviembre» de Raíces \(MLDLM\)/);
  assert.match(p, /- Página de venta: https:\/\/a\.com\/venta/);
  assert.doesNotMatch(p, /Página de pago:/);
  assert.match(p, /«compra-raices» \(EXCLUIR de todos los emails de venta\)/);
  assert.match(p, /<marca>\nFICHA\n<\/marca>/);
  assert.match(p, /NARRATIVA DEL LANZAMIENTO: «El Camino»/);
  assert.match(p, /Asuntos y textos con el vocabulario de la narrativa/);
  assert.match(p, /ASUNTOS QUE MEJOR HAN FUNCIONADO/);
  assert.match(p, /\d+\. mar 17 nov 18:00 · Empezamos en 1 hora/);
  assert.match(p, /LOS EMAILS DEL CARRITO \(3 al día/);
  assert.match(p, /Romper UNA objeción/);
  assert.match(p, /el PRIMER email \(9:00\) es SIEMPRE el de PREGUNTAS FRECUENTES/);
  assert.match(p, /más EMOCIONALES; a medida que avanza el carrito, más RACIONALES/);
  assert.match(p, /\{\{contact\.first_name\}\}/);
  assert.match(p, /- Asunto B \(para test A\/B\)/);
  assert.match(p, /TABLA RESUMEN/);
  assert.doesNotMatch(p, /\n\n\n/);
});
