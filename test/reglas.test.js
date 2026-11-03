import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeReglas, candidatos, faltaEnRegla, tituloPropuesta } from '../public/js/reglas.js';

before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  setEnv({ GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret', DIGEST_KEY: 'clave-larga-de-prueba-123', DB: crearD1Local() });
});

const lead = (id, s, extra = {}) => ({ id, s, score: 10, estado: { id: 'templado' }, ...extra });

test('reglas: limpieza, candidatos (sin compra ni contactados) y lo que falta', () => {
  const r = sanitizeReglas([{ id: 'pago', activa: true, modo: 'auto', max: 999, accion: { tipo: 'plantilla', tag: 'Plantilla-Pago' } }, { id: 'inventada', activa: true }]);
  assert.equal(r.length, 4);
  assert.deepEqual(r[0], { id: 'pago', activa: true, modo: 'auto', max: 200, accion: { tipo: 'plantilla', tag: 'plantilla-pago', rol: 'setter' } });
  assert.equal(faltaEnRegla(r[0], []), 'Esa plantilla ya no está en Conexiones → Plantillas de WhatsApp');
  assert.equal(faltaEnRegla(r[0], [{ tag: 'plantilla-pago', nombre: 'Pago' }]), '');
  const leads = [lead('a', { inicio_pago: true }, { score: 5 }), lead('b', { inicio_pago: true, compra: true }), lead('c', { inicio_pago: true, wa_enviado: true }), lead('d', { inicio_pago: true }, { score: 50 }), lead('e', {})];
  assert.deepEqual(candidatos(leads, r[0]).map((l) => l.id), ['d', 'a']);
  assert.deepEqual(candidatos(leads, r[0], new Set(['d'])).map((l) => l.id), ['a']);
  assert.match(tituloPropuesta(r[0], 2, [{ tag: 'plantilla-pago', nombre: 'Pago' }]), /Enviar la plantilla «Pago» a 2 leads \(llegaron al pago/);
});

test('reglas: propone, aprueba de 20 en 20, no repite y respeta el máximo al día', async () => {
  const { getConfig, saveConfig } = await import('../lib/config-store.js');
  const { guardarReglas, revisarReglas, decidir, leerBandeja, continuar } = await import('../lib/reglas.js');
  const { contactsByTag, getContact } = await import('../lib/ghl.js');
  const actual = await getConfig({ fresh: true });
  const tag = 'registro-webinar-demo';
  await saveConfig({ ...actual, plantillasWa: [{ id: 'p1', nombre: 'Te quedaste a medias', tag: 'wa-tpl-medias', precio: 0.05 }],
    launches: { ...actual.launches, regl: { name: 'Reglas', registroTag: tag, inicioCaptacion: '2026-01-01', fechaDirecto: '2026-11-01', horaDirecto: '19:00', cierreCarrito: '2099-12-31T23:59' } } });
  // 23 leads que vieron la oferta del directo → regla con etiqueta (máximo 22 al día)
  const { addTags } = await import('../lib/ghl.js');
  const { tagFor } = await import('../public/js/scoring.js');
  const { contacts } = await contactsByTag(tag, null, []);
  for (const c of contacts.slice(0, 23)) await addTags(c.id, [tagFor('regl', 'directo_final')]);
  await guardarReglas([{ id: 'directo_final', activa: true, modo: 'proponer', max: 22, accion: { tipo: 'etiqueta', tag: 'setter-ia-activar' } }]);
  const r1 = await revisarReglas({ avisar: false });
  assert.equal(r1.accion, 'evaluar');
  let b = await leerBandeja();
  const it = b.items.at(-1);
  assert.ok(it && it.estado === 'pendiente' && it.leads.length >= 1 && it.leads.length <= 22, JSON.stringify(r1));
  // Otra pasada no repite a los mismos
  await revisarReglas({ avisar: false });
  b = await leerBandeja();
  assert.equal(b.items.filter((x) => x.regla === 'directo_final' && x.estado === 'pendiente').reduce((t, x) => t + x.leads.length, 0), it.leads.length);
  // ✅ → primera tanda (≤20) y el resto con «continuar»
  let d = await decidir(it.id, true, { por: 'Test' });
  assert.equal(d.estado, 'aprobada');
  while (d.restantes) d = await continuar(it.id);
  b = await leerBandeja();
  assert.equal(b.items.find((x) => x.id === it.id).estado, 'hecha');
  assert.ok((await getContact(it.leads[0].id)).tags.includes('setter-ia-activar'));
  // ❌ ya no se puede decidir otra vez
  await assert.rejects(() => decidir(it.id, false), (e) => /ya no está pendiente/.test(e.publicMessage));
  assert.ok(contactsByTag);
});

test('/api/reglas: la tarea programada pide la clave y la bandeja pide sesión', async () => {
  const { GET, POST } = await import('../handlers/reglas.js');
  assert.equal((await GET(new Request('http://localhost/api/reglas?key=mala'))).status, 401);
  assert.equal((await GET(new Request('http://localhost/api/reglas?key=clave-larga-de-prueba-123'))).status, 200);
  assert.equal((await GET(new Request('http://localhost/api/reglas'))).status, 401);
  assert.equal((await POST(new Request('http://localhost/api/reglas', { method: 'POST', body: '{"op":"decidir","id":"x","si":true}' }))).status, 401);
});
