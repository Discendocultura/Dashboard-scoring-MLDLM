import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTitulares, varianteDe, textosTitular, resultadosTitulares, preguntasParaTitular } from '../public/js/titulares.js';

const P = [{ id: 'q1', tipo: 'opciones' }, { id: 'q2', tipo: 'edad' }, { id: 'q3', tipo: 'texto' }];
const T = sanitizeTitulares({
  activo: true,
  general: { titular: 'General', subtitular: 'Sub general' },
  variantes: [
    { pregunta: 'q1', respuestas: ['Más de 2 años', 'Más de 2 años'], titular: 'Llevas tiempo', subtitular: '' },
    { pregunta: 'q2', respuestas: ['38 a 40 años'], titular: 'A partir de los 38', subtitular: 'Sub 38' },
    { pregunta: 'q1', respuestas: [], titular: 'Sin respuestas: fuera' },
    { pregunta: '', respuestas: ['x'], titular: 'Sin pregunta: fuera' },
  ],
});

test('titulares: limpia la configuración', () => {
  assert.equal(T.variantes.length, 2);
  assert.deepEqual(T.variantes[0].respuestas, ['Más de 2 años']);
  assert.equal(sanitizeTitulares(null).activo, false);
  assert.deepEqual(preguntasParaTitular(P).map((p) => p.id), ['q1', 'q2']);
});

test('titulares: elige la primera variante que encaja y si no, la general', () => {
  assert.equal(varianteDe(T, { cf: { q1: ['más de 2 años'], q2: '39' } }, P).titular, 'Llevas tiempo');
  assert.equal(varianteDe(T, { cf: { q1: ['6 - 12 meses'], q2: 39 } }, P).titular, 'A partir de los 38');
  assert.equal(varianteDe(T, { cf: {} }, P), null);
  assert.equal(varianteDe({ ...T, activo: false }, { cf: { q2: 39 } }, P), null);
  // Subtitular vacío en la variante → el general; sin variante → los dos generales.
  assert.deepEqual(textosTitular(T, T.variantes[0]), { titular: 'Llevas tiempo', subtitular: 'Sub general' });
  assert.deepEqual(textosTitular(T, null), { titular: 'General', subtitular: 'Sub general' });
  assert.deepEqual(textosTitular({ general: {} }, null), {});
});

test('titulares: resultados por variante (visitas y compras)', () => {
  const leads = [
    { cf: { q1: ['Más de 2 años'] }, s: { venta_visita: { n: 1 }, compra: true } },
    { cf: { q1: ['Más de 2 años'] }, s: { venta_visita: { n: 1 } } },
    { cf: { q2: '40' }, s: {} },
    { cf: {}, s: { venta_visita: { n: 1 }, compra: true } },
  ];
  const f = resultadosTitulares(T, leads, P);
  assert.deepEqual(f.map((x) => [x.id, x.leads, x.visitas, x.compras]), [[T.variantes[0].id, 2, 2, 1], [T.variantes[1].id, 1, 0, 0], ['general', 1, 1, 1]]);
});

before(async () => {
    const { setEnv } = await import('../lib/env.js');
    setEnv({ GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' });
});

test('titulares: la página de venta recibe el titular de su encuesta (o el general)', async () => {
  const mock = await import('../lib/mock.js');
  const { saveConfig, getConfig } = await import('../lib/config-store.js');
  const campo = 'jgsgct0q45CnzoAL0QG0';
  let con = null; let sin = null;
  for (let i = 0; i < 400 && !(con && sin); i++) {
    const c = mock.getContact(`mock${String(i).padStart(5, '0')}`);
    if (!c) continue;
    const v = [].concat(c.cf?.[campo] ?? []);
    if (!con && v.includes('Más de 1 año')) con = c.id;
    if (!sin && !v.includes('Más de 1 año')) sin = c.id;
  }
  assert.ok(con && sin);
  const cfg = await getConfig();
  const code = Object.keys(cfg.launches)[0];
  await saveConfig({ ...cfg, launches: { ...cfg.launches, [code]: { ...cfg.launches[code], titulares: { activo: true, general: { titular: 'Titular general', subtitular: 'Sub general' }, variantes: [{ pregunta: campo, respuestas: ['Más de 1 año'], titular: 'Si llevas más de un año…', subtitular: '' }] } } } });
  const { GET } = await import('../handlers/page.js');
  const pedir = async (cid) => (await (await GET(new Request(`http://localhost/api/page?l=${code}&pagina=venta${cid ? `&cid=${cid}` : ''}`))).json()).texts;
  assert.equal((await pedir(con)).titular, 'Si llevas más de un año…');
  assert.equal((await pedir(con)).subtitular, 'Sub general');
  assert.equal((await pedir(sin)).titular, 'Titular general');
  assert.equal((await pedir('')).titular, 'Titular general');
  // La de pago no lleva titulares.
  const pago = (await (await GET(new Request(`http://localhost/api/page?l=${code}&pagina=pago&cid=${con}`))).json()).texts;
  assert.equal(pago.titular, undefined);
});
