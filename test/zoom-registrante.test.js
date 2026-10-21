import { test } from 'node:test';
import assert from 'node:assert/strict';
const { setEnv } = await import('../lib/env.js');
setEnv({ ZOOM_ACCOUNT_ID: 'a', ZOOM_CLIENT_ID: 'b', ZOOM_CLIENT_SECRET: 'c', GHL_MOCK: '0' });
const { addRegistrant } = await import('../lib/zoom.js');
test('zoom: si la reunión pide campos obligatorios (apellido, teléfono, ciudad…), se rellenan y se reintenta', async () => {
  const antes = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (url, o) => {
    if (String(url).includes('oauth')) return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }));
    const b = JSON.parse(o.body); bodies.push(b);
    if (!b.phone) return new Response(JSON.stringify({ code: 300, message: 'The parameter is required: phone.' }), { status: 400 });
    if (!b.city) return new Response(JSON.stringify({ code: 300, message: 'The parameter is required: city.' }), { status: 400 });
    return new Response(JSON.stringify({ join_url: 'https://zoom.us/w/1?tk=z' }), { status: 201 });
  };
  assert.equal(await addRegistrant('1', { email: 'a@b.com', firstName: 'Ana' }), 'https://zoom.us/w/1?tk=z');
  assert.equal(bodies[0].last_name, '-', 'sin apellido: «-»');
  assert.equal(bodies.length, 3);
  globalThis.fetch = antes;
});
