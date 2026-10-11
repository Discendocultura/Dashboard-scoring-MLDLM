import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dentroDelLimite } from '../lib/intentos.js';

const req = (ip) => new Request('https://x.dev/api/access', { headers: { 'cf-connecting-ip': ip } });

test('límite por conexión de las llamadas públicas: deja pasar hasta el máximo y frena el resto', async () => {
  for (let i = 0; i < 3; i++) assert.equal(await dentroDelLimite(req('1.2.3.4'), 'prueba', 3), true);
  assert.equal(await dentroDelLimite(req('1.2.3.4'), 'prueba', 3), false);
  assert.equal(await dentroDelLimite(req('5.6.7.8'), 'prueba', 3), true); // otra conexión, su propio contador
  assert.equal(await dentroDelLimite(req('1.2.3.4'), 'otro-tipo', 3), true); // otro tipo de llamada
  assert.equal(await dentroDelLimite(new Request('https://x.dev/'), 'prueba', 0), true); // sin IP no se limita
});
