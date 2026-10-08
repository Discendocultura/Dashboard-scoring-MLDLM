import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ventanaBonusMeteo, analizarOfertaMeteo, lecturaBonusMeteo } from '../public/js/oferta-meteo.js';
import { sanitizeOferta, IDS_BONUS_METEO } from '../public/js/oferta.js';
import { momentoDeCampo, dayOfDateField } from '../public/js/scoring.js';
import { madridToEpoch } from '../public/js/page.js';
import { sanitizeConfig } from '../lib/config-store.js';

const m = {
  apertura: '2026-11-27T10:00', cierre: '2026-11-27T22:00',
  paquete: sanitizeOferta({ bonus: [
    { id: 'b30', tipo: 'bar_30m', nombre: 'Sesión extra' },
    { id: 'b1h', tipo: 'bar_1h', nombre: 'Guía' },
    { id: 'bt', tipo: 'bonus', nombre: 'Comunidad' },
    { id: 'bd', tipo: 'bar_directo', nombre: 'No vale en meteórico' },
  ] }, { tipos: IDS_BONUS_METEO }),
};
const t = (hhmm) => madridToEpoch(`2026-11-27T${hhmm}`);

test('meteórico: tipos de bonus y ventanas desde la apertura', () => {
  assert.deepEqual(m.paquete.bonus.map((b) => b.tipo), ['bar_30m', 'bar_1h', 'bonus', 'bonus']);
  assert.deepEqual(ventanaBonusMeteo({ tipo: 'bar_30m' }, m), { desde: t('10:00'), hasta: t('10:30') });
  assert.deepEqual(ventanaBonusMeteo({ tipo: 'bar_1h' }, m), { desde: t('10:00'), hasta: t('11:00') });
  assert.equal(ventanaBonusMeteo({ tipo: 'bar_24h' }, m).hasta, t('22:00')); // no pasa del cierre
  assert.equal(ventanaBonusMeteo({ tipo: 'bar_1h', hasta: '2026-11-27T12:00' }, m).hasta, t('12:00'));
});

test('meteórico: impacto de los bonus por horas', () => {
  // 6 ventas en los primeros 30 min, 2 en el resto de la primera hora y 4 en las 11 h siguientes.
  const ventas = ['10:01', '10:05', '10:10', '10:20', '10:25', '10:29', '10:40', '10:55', '13:00', '16:00', '19:00', '21:30'].map(t);
  const a = analizarOfertaMeteo(m, [...ventas, t('09:00')], 13);
  const b30 = a.bonus.find((b) => b.id === 'b30');
  assert.equal(a.dentroOferta, 12);
  assert.equal(b30.ventas, 6);
  assert.ok(b30.efecto > 10); // 12/h frente a 6 ventas en 11,5 h
  assert.match(lecturaBonusMeteo(b30), /funciona/);
  assert.equal(a.bonus.find((b) => b.id === 'b1h').ventas, 8);
  assert.equal(a.horas.length, 12);
  assert.equal(a.horas[0].n, 8);
  assert.deepEqual(a.horas[0].activos, ['b30', 'b1h', 'bt', 'bd']);
  assert.deepEqual(a.horas[1].activos, ['bt', 'bd']);
  assert.equal(analizarOfertaMeteo(m, [], 5).bonus[0].sinDatos, true);
});

test('hora de la compra: solo si el campo guarda la hora', () => {
  assert.equal(momentoDeCampo('2026-11-27'), null);
  assert.equal(momentoDeCampo('2026-11-27T23:00:00.000Z'), null); // medianoche de España
  assert.equal(momentoDeCampo('2026-11-27 10:15'), t('10:15'));
  assert.equal(momentoDeCampo('2026-11-27T10:15:30'), t('10:15') + 30_000);
  assert.equal(momentoDeCampo('2026-11-27T09:15:00.000Z'), t('10:15'));
  assert.equal(dayOfDateField('2026-11-27 23:30'), '2026-11-27');
});

test('configuración: el meteórico guarda su oferta', () => {
  const cfg = sanitizeConfig({ embudos: [{ id: 'meteo', tipo: 'meteorico', nombre: 'M' }], meteoricos: { bf26: { name: 'BF', embudo: 'meteo', paquete: { entregables: [{ nombre: 'Curso', valor: '1.200' }], bonus: [{ tipo: 'bar_30m', nombre: 'X' }] } } } });
  assert.equal(cfg.meteoricos.bf26.paquete.entregables[0].valor, 1200);
  assert.equal(cfg.meteoricos.bf26.paquete.bonus[0].tipo, 'bar_30m');
});

test('auditoría: BAR 24 h en una oferta de 3 días y fin a mano fuera de la oferta', () => {
  const m3 = { apertura: '2026-11-27T10:00', cierre: '2026-11-30T10:00' };
  assert.equal(ventanaBonusMeteo({ tipo: 'bar_24h' }, m3).hasta, madridToEpoch('2026-11-28T10:00'));
  assert.equal(ventanaBonusMeteo({ tipo: 'bar_48h' }, m3).hasta, madridToEpoch('2026-11-29T10:00'));
  assert.equal(ventanaBonusMeteo({ tipo: 'bar_1h', hasta: '2026-12-05T10:00' }, m3).hasta, madridToEpoch('2026-11-30T10:00'));
});

test('auditoría: horas de compra con milisegundos, día/mes/año y horas en punto', () => {
  assert.equal(momentoDeCampo('2026-11-27T10:15:30.123'), t('10:15') + 30_123);
  assert.equal(momentoDeCampo('27/11/2026 10:15'), t('10:15'));
  assert.equal(dayOfDateField('2026-11-27 23:30:00.500'), '2026-11-27');
  assert.equal(momentoDeCampo('2026-11-27T22:00:00.000Z'), t('23:00')); // 23:00 en España: hora real
  assert.equal(momentoDeCampo('2026-11-27T23:00:00.000Z'), null); // medianoche en España
});
