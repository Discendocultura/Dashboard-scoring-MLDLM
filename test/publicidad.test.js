import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseDe, derivadas, arbolPublicidad, avisosAnuncios, filtrarCampanas, resultadoDe, UMBRALES } from '../public/js/publicidad.js';
import { PESTANAS, CATEGORIAS } from '../public/js/embudos-def.js';

const fila = (o) => ({ campaign_id: 'c1', campaign_name: 'DIR-reto · Frío', adset_id: 's1', adset_name: 'Conjunto 1', ad_id: 'a1', ad_name: 'Anuncio 1', spend: '100', impressions: '10000', reach: '5000', clicks: '300', inline_link_clicks: '150', actions: [], action_values: [], ...o });

test('acciones de Meta repetidas con varios nombres no se suman dos veces', () => {
  const b = baseDe(fila({ actions: [
    { action_type: 'purchase', value: '4' }, { action_type: 'omni_purchase', value: '4' }, { action_type: 'offsite_conversion.fb_pixel_purchase', value: '4' },
    { action_type: 'lead', value: '10' }, { action_type: 'complete_registration', value: '12' },
    { action_type: 'landing_page_view', value: '120' }, { action_type: 'video_view', value: '2500' },
  ], action_values: [{ action_type: 'omni_purchase', value: '108' }, { action_type: 'purchase', value: '108' }] }));
  assert.equal(b.compras, 4);
  assert.equal(b.valor, 108);
  assert.equal(b.registros, 12); // el mayor de lead / CompleteRegistration
  assert.equal(b.visitas, 120);
  const m = derivadas(b);
  assert.equal(m.cpm, 10); // 100 € / 10.000 × 1.000
  assert.equal(m.frecuencia, 2);
  assert.equal(m.ctrEnlace, 0.015);
  assert.equal(m.costeCompra, 25);
  assert.equal(m.roas, 1.08);
  assert.equal(m.hook, 0.25);
  assert.equal(m.carga, 0.8);
});

test('árbol campaña → conjunto → anuncio ordenado por gasto, con estados', () => {
  const ads = [fila({ ad_id: 'a1', spend: '30' }), fila({ ad_id: 'a2', ad_name: 'Anuncio 2', spend: '70' })];
  const r = arbolPublicidad({ campaigns: [fila({ spend: '100' })], adsets: [fila({ spend: '100' })], ads }, { a2: { estado: 'PAUSED' } });
  assert.equal(r.campanas.length, 1);
  assert.equal(r.campanas[0].hijos[0].hijos[0].id, 'a2');
  assert.equal(r.campanas[0].hijos[0].hijos[0].estado, 'PAUSED');
  assert.equal(r.total.gasto, 100);
  assert.equal(r.alcanceAproximado, false);
});

test('filtro de campañas sin mayúsculas ni tildes', () => {
  const rows = [fila({ campaign_name: 'DIR-Reto Ovulación' }), fila({ campaign_name: 'VSL-raices' })];
  assert.equal(filtrarCampanas(rows, 'dir-reto ovulacion').length, 1);
  assert.equal(filtrarCampanas(rows, '').length, 2);
});

test('avisos: frecuencia alta, CTR que cae y coste que sube → preparar anuncios ya', () => {
  const antes = [fila({ ad_id: 'a1', impressions: '10000', reach: '7000', inline_link_clicks: '200', actions: [{ action_type: 'purchase', value: '5' }] })];
  const ahora = [fila({ ad_id: 'a1', impressions: '10000', reach: '3000', inline_link_clicks: '100', actions: [{ action_type: 'purchase', value: '3' }] })];
  const r = avisosAnuncios({ actual: ahora, anterior: antes, tipo: 'directa', hoy: '2026-10-11' });
  assert.equal(r.nivel, 'urgente');
  const textos = r.avisos.map((x) => x.texto).join(' | ');
  assert.match(textos, /Frecuencia 3,3/);
  assert.match(textos, /CTR del enlace ha caído un 50/);
  assert.match(textos, /coste por venta ha subido un 67/);
  assert.match(textos, /Solo 1 anuncio con gasto/);
  assert.equal(r.avisos[0].nivel, 'alta');
});

test('avisos: anuncios sanos y suficientes → ok; pausados no cuentan; sin gasto → sindatos', () => {
  const sanos = ['a1', 'a2', 'a3'].map((id) => fila({ ad_id: id, reach: '8000' }));
  assert.equal(avisosAnuncios({ actual: sanos, anterior: sanos, tipo: 'lanzamientos' }).nivel, 'ok');
  const conPausa = avisosAnuncios({ actual: sanos, anterior: sanos, estados: { a3: { estado: 'PAUSED' } } });
  assert.equal(conPausa.nivel, 'pronto'); // quedan 2 activos: menos de UMBRALES.minActivos
  assert.equal(avisosAnuncios({ actual: [], anterior: [] }).nivel, 'sindatos');
  // Antigüedad: aviso informativo.
  const viejo = avisosAnuncios({ actual: sanos, anterior: sanos, estados: { a1: { estado: 'ACTIVE', creado: '2026-08-01T10:00:00+0200' } }, hoy: '2026-10-11' });
  assert.ok(viejo.avisos.some((x) => x.nivel === 'info' && /Lleva 71 días/.test(x.texto)));
  assert.equal(UMBRALES.frecuenciaAlta, 3);
});

test('objetivo de coste: aviso si se pasa más de un 20 %', () => {
  const ads = ['a1', 'a2', 'a3'].map((id) => fila({ ad_id: id, reach: '8000', actions: [{ action_type: 'purchase', value: '4' }] }));
  const r = avisosAnuncios({ actual: ads, anterior: ads, tipo: 'directa', objetivoCoste: 15 });
  assert.ok(r.avisos.some((x) => /por encima del objetivo/.test(x.texto)));
  assert.equal(resultadoDe('lanzamientos'), 'registros');
  assert.equal(resultadoDe('meteorico'), 'compras');
});

test('la pestaña Publicidad está en todos los tipos de embudo y en su categoría', () => {
  for (const tipo of ['lanzamientos', 'vsl', 'directa', 'meteorico']) {
    assert.ok(PESTANAS[tipo].some((p) => p.id === 'publicidad'), tipo);
    assert.ok(CATEGORIAS[tipo].some((c) => c.vistas.includes('publicidad')), tipo);
  }
});
