import { test } from 'node:test';
import assert from 'node:assert/strict';

test('asistencia por tipo de tráfico: global, frío y templado', async () => {
  const { asistenciaPorTrafico } = await import('../public/js/metrics.js');
  const s = (o) => ({ s: { clase1_50: true, ...o }, estado: { id: 'templado' } });
  const leads = [
    s({ trafico: 'frio', directo_asistio: true }), s({ trafico: 'frio' }), s({ trafico: 'frio' }), s({ trafico: 'frio' }),
    s({ trafico: 'templado', directo_asistio: true, compra: true }), s({ trafico: 'templado', directo_asistio: true }),
  ];
  const r = asistenciaPorTrafico(leads, { fechaDirecto: '2026-11-05' }, { origen: false });
  assert.deepEqual(r.grupos.map((g) => g.total), [6, 4, 2]);
  const asist = r.pasos.find((p) => p.label === 'Asistieron al directo');
  assert.deepEqual(asist.n, { global: 3, frio: 1, templado: 2 });
  assert.deepEqual(r.pasos.find((p) => p.label === 'Compraron').n, { global: 1, frio: 0, templado: 1 });
  // Con varios vídeos, un paso por vídeo
  const plf = asistenciaPorTrafico(leads, { formato: 'plf' });
  assert.ok(plf.pasos.some((p) => p.label === 'PLC 4 en directo'));
});

test('asistencia por tipo de tráfico: también publicidad y orgánico', async () => {
  const { asistenciaPorTrafico } = await import('../public/js/metrics.js');
  const s = (o) => ({ s: { ...o }, estado: { id: 'templado' } });
  const leads = [s({ origen: 'publi', directo_asistio: true }), s({ origen: 'publi' }), s({ origen: 'organico', directo_asistio: true })];
  const r = asistenciaPorTrafico(leads, { fechaDirecto: '2026-11-05' }, { trafico: false });
  assert.deepEqual(r.grupos.map((g) => g.id), ['global', 'publi', 'organico']);
  assert.deepEqual(r.pasos.find((p) => p.label === 'Asistieron al directo').n, { global: 2, publi: 1, organico: 1 });
});
