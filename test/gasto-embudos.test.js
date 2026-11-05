import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gruposDeGasto, repartirGasto } from '../lib/gasto-embudos.js';

const config = {
  embudos: [
    { id: 'web', nombre: 'Webinar', tipo: 'lanzamientos' },
    { id: 'vsl', nombre: 'VSL', tipo: 'vsl' },
    { id: 'tienda', nombre: 'Tienda', tipo: 'directa' },
  ],
  launches: { LR1: { embudo: 'web', metaFiltro: 'Resistencia' }, LR2: { metaFiltro: 'Resistencia Nov' } },
  vsls: { vsl: { metaFiltro: '' } },
  directas: { tienda: {} },
  meteoricos: { M1: { metaFiltro: 'Flash' }, M2: {} },
};

test('gasto por embudo: cada campaña a un solo embudo (el filtro más concreto) y lo que no encaja, a la VSL sin filtro', () => {
  const grupos = gruposDeGasto(config);
  assert.deepEqual(grupos.map((g) => g.id), ['web', 'vsl', 'tienda', '_meteoricos']);
  assert.deepEqual(grupos[0].filtros, ['Resistencia', 'Resistencia Nov']);
  assert.deepEqual(grupos[2].filtros, ['tienda']);
  const r = repartirGasto([
    { id: '1', name: 'Captación Resistencia', spend: '100' },
    { id: '2', name: 'Captación RESISTENCIA nov', spend: 50.5 },
    { id: '3', name: 'Tienda · retargeting', spend: 20 },
    { id: '4', name: 'Flash viernes', spend: 10 },
    { id: '5', name: 'Algo suelto', spend: 5 },
    { id: '6', name: 'Pausada', spend: 0 },
  ], grupos);
  const de = (id) => r.embudos.find((e) => e.id === id);
  assert.equal(de('web').gasto, 150.5);
  assert.equal(de('web').campanas, 2);
  assert.equal(de('tienda').gasto, 20);
  assert.equal(de('_meteoricos').gasto, 10);
  assert.equal(de('vsl').gasto, 5);
  assert.equal(r.otras.gasto, 0);
  assert.equal(r.total, 185.5);
  assert.equal(r.embudos[0].id, 'web'); // de más a menos gasto
});

test('gasto por embudo: sin embudo comodín, lo que no encaja va a «otras campañas»', () => {
  const r = repartirGasto([{ name: 'Captación Resistencia', spend: 30 }, { name: 'Branding', spend: 12 }], [{ id: 'web', nombre: 'Webinar', tipo: 'lanzamientos', filtros: ['resistencia'] }]);
  assert.equal(r.embudos[0].gasto, 30);
  assert.deepEqual(r.otras, { gasto: 12, campanas: 1 });
  assert.equal(r.total, 42);
});
