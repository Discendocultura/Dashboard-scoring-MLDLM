import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { perfilComprador, rankingAnuncios } from '../public/js/perfil-comprador.js';

before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  setEnv({ GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret', DB: crearD1Local() });
});

test('Perfil comprador: conductas con lift, encuesta sobrerrepresentada y origen por anuncio', () => {
  const launch = { formato: 'webinar', nClases: 2 };
  const L = (s, src, score = 10) => ({ s, src, score });
  const leads = [
    L({ compra: true, directo_asistio: true, directo_final: true }, { campaign: 'Frío', term: 'C1', content: 'A1' }, 80),
    L({ compra: true, directo_asistio: true }, { campaign: 'Frío', term: 'C1', content: 'A1' }, 70),
    L({ directo_asistio: true }, { campaign: 'Frío', term: 'C2', content: 'A2' }, 30),
    L({}, { campaign: 'Frío', term: 'C2', content: 'A2' }, 5),
    L({}, {}, 0),
  ];
  const encuesta = [{ p: { name: '¿Cuánto tiempo llevas buscando?' }, respondieron: 5, opciones: [{ respuesta: 'Más de 2 años', n: 3, compras: 2 }, { respuesta: 'Menos de 1 año', n: 2, compras: 0 }] }];
  const r = perfilComprador(leads, launch, { encuesta });
  assert.deepEqual([r.registros, r.compradoras, r.conversion], [5, 2, 0.4]);
  const dir = r.comportamiento.find((x) => x.que === 'Entró al directo');
  assert.deepEqual([dir.compradoras, dir.noCompradoras, dir.conversionSiLoHizo, dir.conversionSiNo], [1, 0.333, 0.667, 0]);
  assert.equal(r.comportamiento.find((x) => x.que === 'Se quedó hasta la oferta').conversionSiLoHizo, 1);
  assert.equal(r.encuesta[0].opciones[0].respuesta, 'Más de 2 años');
  assert.equal(r.encuesta[0].opciones[0].sobrerrepresentacion, 1.667); // 100 % de compradoras frente al 60 %
  assert.deepEqual(r.origen.anuncios[0], { nombre: 'A1', registros: 2, compradoras: 2, conversion: 1, puntuacionMedia: 75 });
  assert.equal(r.origen.conUtm, 4);
  assert.ok(r.puntuacionMediaCompradoras > r.puntuacionMediaResto);
});

test('Ranking de anuncios: escalar, mantener, revisar y sin datos', () => {
  const n = (id, nombre, gasto, real, hijos = []) => ({ id, nombre, m: { gasto, roas: 1 }, real, hijos });
  const arbol = { campanas: [n('c', 'Campaña', 600, { ventas: 6, ingresos: 1800, roas: 3 }, [
    n('s1', 'Conjunto ganador', 300, { ventas: 5, ingresos: 1500, directos: 1200, indirectos: 300, roas: 5, cpa: 60 }, [n('a1', 'Anuncio top', 300, { ventas: 5, ingresos: 1500, roas: 5, cpa: 60 })]),
    n('s2', 'Conjunto flojo', 280, { ventas: 1, ingresos: 300, roas: 300 / 280 }),
    n('s3', 'Conjunto malo', 100, { ventas: 0, ingresos: 0, roas: 0 }),
    n('s4', 'Conjunto nuevo', 10, { ventas: 0, ingresos: 0, roas: 0 }),
  ])] };
  const r = rankingAnuncios(arbol);
  const d = Object.fromEntries(r.map((x) => [x.nombre, x.decision]));
  assert.deepEqual([d['Conjunto ganador'], d['Anuncio top'], d['Conjunto flojo'], d['Conjunto malo'], d['Conjunto nuevo']], ['escalar', 'escalar', 'mantener', 'revisar', 'sin datos']);
  assert.equal(r.find((x) => x.nombre === 'Anuncio top').conjunto, 'Conjunto ganador');
});

test('Conector: perfil_comprador y anuncios_que_venden responden (modo de prueba)', async () => {
  const { TOOLS } = await import('../lib/mcp-tools.js');
  const s = { role: 'admin', uid: 'admin', permisos: ['*'] };
  const { getConfig, saveConfig } = await import('../lib/config-store.js');
  const actual = await getConfig({ fresh: true });
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  await saveConfig({ ...actual, embudos: [{ id: 'lanz', tipo: 'lanzamientos', nombre: 'Lanzamientos', formato: 'webinar' }], launches: { demo: { name: 'Demo', embudo: 'lanz', metaFiltro: 'Webinar', registroTag: 'registro-webinar-demo', compraTag: 'clienta-raices', inicioCaptacion: d(-20), fechaDirecto: d(-5), cierreCarrito: d(-1) } } });
  const perfil = await TOOLS.find((t) => t.name === 'perfil_comprador').run({ lanzamiento: 'demo' }, { s });
  assert.ok(perfil.registros > 0 && perfil.compradoras > 0 && perfil.comportamiento.length);
  assert.ok(!JSON.stringify(perfil).includes('@')); // sin emails
  const anuncios = await TOOLS.find((t) => t.name === 'anuncios_que_venden').run({ lanzamiento: 'demo' }, { s });
  assert.ok(anuncios.conjuntos.length && anuncios.anuncios.length);
  assert.ok('roasReal' in anuncios.total && 'sinOrigen' in anuncios.ventas);
});
