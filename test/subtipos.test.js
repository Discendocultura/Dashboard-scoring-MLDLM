import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUBTIPOS_VSL, textosVsl, subtipoValido, pestanasSugeridas, guiaEmbudo, pestanaIds } from '../public/js/embudos-def.js';
import { auditarVsl } from '../public/js/auditor.js';
import { sanitizeVsl } from '../lib/config-store.js';
import { runCliente } from '../lib/cliente.js';

const base = { registroTag: 'r', compraTag: 'c', precioPrograma: 100, compraDateField: 'f', registroDateField: 'g' };
const titulos = (v, extra = {}) => auditarVsl({ vsl: v, hoy: '2026-11-01', ...extra }).map((x) => `${x.nivel}:${x.titulo}`);

test('subtipos de embudo siempre abierto: textos y valor por defecto', () => {
  assert.equal(subtipoValido('otro'), 'vsl');
  assert.equal(textosVsl({}).corto, 'VSL');
  assert.equal(textosVsl({ subtipo: 'leadmagnet' }).registro, 'Descargas');
  assert.equal(textosVsl({ subtipo: 'llamadas' }).registro, 'Aplicaciones');
  assert.ok(Object.values(SUBTIPOS_VSL).every((t) => t.label && t.ico && t.vio && t.contenido));
  assert.ok(!pestanasSugeridas('vsl', 'leadmagnet').includes('llamadas'));
  assert.equal(pestanasSugeridas('vsl', 'llamadas'), null); // todas
  const pasos = (sub) => guiaEmbudo('vsl', pestanaIds('vsl'), undefined, sub).flatMap((s) => s.pasos).join(' ');
  assert.match(pasos('leadmagnet'), /secuencia de emails/);
  assert.match(pasos('llamadas'), /formulario de aplicación/);
  assert.match(pasos('evergreen'), /grabación completa/);
});

test('subtipos: se guardan en la configuración de la VSL', async () => {
  const v = await runCliente({ id: 'principal', principal: true }, () => sanitizeVsl({ name: 'Guía', subtipo: 'leadmagnet' }, 'guia'));
  assert.equal(v.subtipo, 'leadmagnet');
  const w = await runCliente({ id: 'principal', principal: true }, () => sanitizeVsl({ name: 'X', subtipo: 'raro' }, 'x'));
  assert.equal(w.subtipo, 'vsl');
});

test('subtipos: el auditor pide lo que importa en cada uno', () => {
  // VSL: el vídeo es crítico
  assert.ok(titulos({ ...base, vslUrl: 'https://a', ventaUrl: 'https://b' }).includes('critico:Falta el vídeo de la VSL'));
  // Lead magnet: sin vídeo no pasa nada, pero avisa de que no se mide si se abre
  const lm = titulos({ ...base, subtipo: 'leadmagnet', vslUrl: 'https://a', ventaUrl: 'https://b' });
  assert.ok(!lm.some((t) => t.includes('Falta el vídeo')));
  assert.ok(lm.includes('aviso:No se mide quién abre el lead magnet'));
  // Embudo de llamadas: el calendario es crítico y el enlace de compra no
  const ll = titulos({ ...base, subtipo: 'llamadas' });
  assert.ok(ll.includes('critico:Falta el enlace para reservar llamada'));
  assert.ok(!ll.some((t) => t.includes('enlace de compra')));
  const leads = Array.from({ length: 25 }, () => ({ fReg: '2026-10-31', s: { pct: 0 } }));
  assert.ok(titulos({ ...base, subtipo: 'llamadas', llamadaUrl: 'https://cal' }, { leads, llamadas: { configurado: true, llamadas: [] } }).includes('importante:25 aplicaciones y ninguna llamada agendada'));
  // Webinar evergreen: el vídeo es crítico, con su nombre
  assert.ok(titulos({ ...base, subtipo: 'evergreen', vslUrl: 'https://a', ventaUrl: 'https://b' }).includes('critico:Falta el vídeo del webinar'));
});
