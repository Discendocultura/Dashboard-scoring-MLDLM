import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setEnv } from '../lib/env.js';

test('API de emails de GHL: si una versión responde «Cannot GET», prueba otra y la recuerda', async () => {
  setEnv({ GHL_TOKEN: 'tok', GHL_LOCATION_ID: 'loc1' });
  const { listEmailCampaigns, getEmailStats } = await import('../lib/ghl.js');
  const real = globalThis.fetch;
  const vistas = [];
  globalThis.fetch = async (url, init) => {
    const v = init.headers.Version;
    vistas.push(`${new URL(url).host} ${v}`);
    if (v !== '2023-02-21') return new Response(JSON.stringify({ message: `Cannot GET ${new URL(url).pathname}`, error: 'Not Found', statusCode: 404 }), { status: 404 });
    if (String(url).includes('/stats/')) return new Response(JSON.stringify({ stats: { sent: 10, delivered: 10, opened: 5, clicked: 1 } }), { status: 200 });
    return new Response(JSON.stringify({ campaigns: [{ id: 'c1', name: 'X' }], total: 1 }), { status: 200 });
  };
  try {
    const r = await listEmailCampaigns({});
    assert.equal(r.campaigns.length, 1);
    assert.deepEqual(vistas, ['services.leadconnectorhq.com 2021-07-28', 'services.leadconnectorhq.com 2023-02-21']);
    vistas.length = 0;
    assert.equal((await getEmailStats('email-campaigns', 's1')).opened, 5);
    assert.deepEqual(vistas, ['services.leadconnectorhq.com 2023-02-21']); // ya va directa a la que funciona
    // Ninguna versión: mensaje claro
    globalThis.fetch = async (url) => new Response(JSON.stringify({ message: `Cannot GET ${new URL(url).pathname}` }), { status: 404 });
    await assert.rejects(listEmailCampaigns({}), (e) => e.sinApiEmails && /Integraciones privadas/.test(e.publicMessage));
  } finally {
    globalThis.fetch = real;
  }
});
