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
  assert.equal(at('Grabación del directo'), '2026-11-18T10:00');
  assert.equal(at('Apertura del carrito'), '2026-11-17T20:30');
  // Horas de Plan → Carrito si las hay (día 3: solo 08:00)
  assert.deepEqual(c.filter((x) => x.at.startsWith('2026-11-20')).map((x) => x.at), ['2026-11-20T08:00']);
  assert.equal(c.filter((x) => x.at.startsWith('2026-11-22')).length, 3); // último día: 3 envíos
  assert.ok(c.find((x) => x.at === '2026-11-19T10:00').que.includes('Bonus 48 h'));
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
  assert.match(p, /\{\{contact\.first_name\}\}/);
  assert.match(p, /- Asunto B \(para test A\/B\)/);
  assert.match(p, /TABLA RESUMEN/);
  assert.doesNotMatch(p, /\n\n\n/);
});
