import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rendimientoEquipo } from '../public/js/rendimiento.js';
import { eventosDeEtiquetas } from '../lib/actividad-equipo.js';

test('rendimiento: WhatsApps, primer contacto, tiempo de respuesta, ventas y llamadas por persona', () => {
  const ev = eventosDeEtiquetas([{ id: 'c1', tags: ['nov_wa_enviado'] }, { id: 'c2', tags: ['nov_wa_enviado', 'nov_res_interesada'] }], { uid: 'u1', nombre: 'Andrea' }, '2026-10-02T10:00:00Z').get('nov');
  assert.equal(ev.length, 3);
  const eventos = [...ev, { t: 'wa', cid: 'c1', uid: 'u2', por: 'Sara', en: '2026-10-03T10:00:00Z' }];
  const llamadas = {
    e1: { resultado: 'venta', contactId: 'c1', por: 'Sara', en: '2026-10-05T10:00:00Z' },
    e2: { resultado: 'noshow', contactId: 'c3', por: 'Sara', en: '2026-10-05T11:00:00Z' },
    e3: { resultado: 'perdido', contactId: 'c4', por: 'Sara', en: '2026-10-05T12:00:00Z' },
    _wa: { c5: { por: 'Sara', en: '2026-10-04T10:00:00Z' } },
  };
  const leads = [
    { id: 'c1', regAt: '2026-10-01T10:00:00Z', compra: true, importe: 997 },
    { id: 'c2', regAt: '2026-10-02T08:00:00Z', compra: false },
    { id: 'c3', regAt: '2026-10-01T10:00:00Z', compra: false },
  ];
  const r = rendimientoEquipo({ eventos, llamadas, leads });
  const andrea = r.personas.find((x) => x.nombre === 'Andrea');
  const sara = r.personas.find((x) => x.nombre === 'Sara');
  assert.equal(andrea.wa, 2);
  assert.equal(andrea.contactados, 2);
  assert.equal(andrea.ventas, 1); // contactó primero a c1, que compró
  assert.equal(andrea.importe, 997);
  assert.deepEqual(andrea.tiempos.sort((a, b) => a - b), [2, 24]);
  assert.equal(andrea.respuestaMediana, 13);
  assert.equal(andrea.resultados.interesada, 1);
  assert.equal(sara.wa, 2); // uno de leads y uno de llamadas
  assert.equal(sara.ventas, 0); // c1 ya lo había contactado Andrea
  assert.equal(sara.shows, 2);
  assert.equal(sara.noshows, 1);
  assert.equal(sara.cierres, 1);
  assert.equal(sara.cierreRate, 0.5);
  assert.equal(r.total.sinContactar, 1); // c3
  // Por fechas
  assert.equal(rendimientoEquipo({ eventos, llamadas, leads, rango: { desde: '2026-10-04', hasta: '2026-10-31' } }).personas.find((x) => x.nombre === 'Andrea'), undefined);
});
