import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listaSeguimiento, etapaDe, porEtapa, mensajeSeguimiento, MENSAJE_SEGUIMIENTO_DEF } from '../public/js/seguimiento.js';
import { sanitizeDirecta } from '../public/js/directa.js';

const d = sanitizeDirecta({ name: 'Reto', producto: 'el Reto Ovulación', compraTag: 'compra reto ovulacion evergreen', upsellPrincipal: { nombre: 'Raíces', tags: ['clienta-raices'] }, bumps: [{ tipo: 'bump', nombre: 'Guía', tag: 'bump-guia', precio: 7 }] });
const PIPE = 'e3Bgent';
const c = (id, o = {}) => ({ id, name: `Persona ${id}`, phone: '+34600000000', email: `${id}@x.com`, tags: ['compra reto ovulacion evergreen'], dateAdded: '2026-10-01T10:00:00Z', ...o });

test('seguimiento: solo compradoras sin el producto principal, con su etapa y de la más reciente a la más antigua', () => {
  const contactos = [
    c('a', { opps: [`${PIPE}:clienta`] }),
    c('b', { tags: ['compra reto ovulacion evergreen', 'clienta-raices'] }),
    c('e', { opps: [`${PIPE}:contactado`, 'otro:x'], tags: ['compra reto ovulacion evergreen', 'bump-guia'] }),
    c('f', { opps: [] }),
    { id: 'x', tags: ['otra'] },
  ];
  const l = listaSeguimiento(contactos, d, { dias: { a: '2026-10-11', e: '2026-10-05', f: '2026-09-20' }, cambios: { f: { etapa: 'nocontesta1', por: 'Ana', en: '2026-10-11T10:00:00Z' } }, wa: { a: { en: '2026-10-11T09:00:00Z', por: 'Ana' } }, pipelineId: PIPE, hoy: '2026-10-11' });
  assert.deepEqual(l.map((x) => x.id), ['a', 'e', 'f']);
  assert.equal(l[0].etapa, 'clienta');
  assert.equal(l[0].diasDesde, 0);
  assert.ok(l[0].wa);
  assert.equal(l[1].etapa, 'contactado');
  assert.deepEqual(l[1].extras, ['Guía']);
  assert.equal(l[2].etapa, 'nocontesta1'); // el cambio del dashboard manda
  assert.deepEqual(porEtapa(l), { clienta: 1, contactado: 1, nocontesta1: 1 });
  assert.equal(etapaDe({ opps: [] }, PIPE), '');
});

test('seguimiento: mensaje de WhatsApp con sus huecos', () => {
  const m = mensajeSeguimiento(MENSAJE_SEGUIMIENTO_DEF, { nombre: 'Laura', producto: 'el Reto Ovulación', principal: 'Raíces', setter: 'Ana' });
  assert.match(m, /^Hola Laura 👋 Soy Ana\. Vi que hiciste el Reto Ovulación/);
  assert.match(m, /con Raíces/);
  assert.equal(mensajeSeguimiento('Hola {nombre}, soy {setter}', {}), 'Hola, soy del equipo');
  assert.equal(sanitizeDirecta({ mensajeSeguimiento: 'x'.repeat(2000) }).mensajeSeguimiento.length, 1000);
});
