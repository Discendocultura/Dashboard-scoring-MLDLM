import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setEnv } from '../lib/env.js';

// Con el GHL de verdad (fetch simulado): el upsert nunca lleva el móvil y el teléfono va por id a SU ficha.
// Con email y móvil juntos, GHL podía emparejarlo por móvil con otro contacto o ignorar el móvil.
test('acceso con WhatsApp: el móvil se guarda en la ficha de esa lead, nunca en el upsert', async () => {
  setEnv({ GHL_TOKEN: 'tok', GHL_LOCATION_ID: 'loc1' });
  const { ensureRegistered } = await import('../lib/access.js');
  const real = globalThis.fetch;
  const llamadas = [];
  let telefonoOcupado = false;
  globalThis.fetch = async (url, init) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    llamadas.push({ method: init.method, path: u.pathname, body });
    const contacto = { id: 'c1', email: 'lead@example.com', firstName: 'Lea', tags: ['reg-x'] };
    if (u.pathname === '/contacts/search/duplicate') return Response.json({ contact: contacto });
    if (u.pathname === '/contacts/c1' && init.method === 'PUT') {
      if (telefonoOcupado) return new Response('{"message":"This location does not allow duplicated contacts."}', { status: 400 });
      return Response.json({ contact: { ...contacto, phone: body.phone } });
    }
    return Response.json({});
  };
  try {
    // Login de una registrada sin teléfono
    const r = await ensureRegistered({ registroTag: 'reg-x' }, { email: 'lead@example.com', phone: '612 34 56 78' });
    assert.equal(r.contact.phone, '+34612345678');
    assert.deepEqual(llamadas.find((l) => l.method === 'PUT'), { method: 'PUT', path: '/contacts/c1', body: { phone: '+34612345678' } });
    assert.ok(!llamadas.some((l) => l.path === '/contacts/upsert' && 'phone' in l.body));
    // Si GHL lo rechaza (otro contacto ya tiene ese número), entra igual y queda en una nota de su ficha
    llamadas.length = 0;
    telefonoOcupado = true;
    const r2 = await ensureRegistered({ registroTag: 'reg-x' }, { email: 'lead@example.com', phone: '612 34 56 78' });
    assert.equal(r2.status, 'registered');
    const nota = llamadas.find((l) => l.path === '/contacts/c1/notes');
    assert.ok(nota && nota.body.body.includes('+34612345678'));
  } finally {
    globalThis.fetch = real;
  }
});

test('acceso: con Turnstile, el alta sin nombre también pide la verificación de Cloudflare', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../handlers/access.js', import.meta.url), 'utf8');
  assert.match(src, /\(name \|\| alta\) \? verificar/);
});
