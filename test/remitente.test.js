import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
});

test('emails al equipo: «Equipo Alquimia <EMAIL_REMITENTE>» y desde la cuenta de EMAIL_CUENTA (Discendo; si no existe, la principal)', async () => {
  const { remitente, cuentaEmails, CUENTA_EMAILS_DEFECTO } = await import('../lib/remitente.js');
  const { principalId } = await import('../lib/cliente.js');
  assert.equal(CUENTA_EMAILS_DEFECTO, 'discendo');
  assert.equal(remitente(), undefined);
  const { setEnv } = await import('../lib/env.js');
  setEnv({ ...ENV, EMAIL_REMITENTE: 'equipo@tenaxdigital.com' });
  try { assert.equal(remitente(), 'Equipo Alquimia <equipo@tenaxdigital.com>'); } finally { setEnv(ENV); }
  // En las pruebas no hay cliente «discendo»: sale de la principal (el email llega igual).
  assert.equal((await cuentaEmails()).id, principalId());
  setEnv({ ...ENV, EMAIL_CUENTA: 'no-existe' });
  try { assert.equal((await cuentaEmails()).id, principalId()); } finally { setEnv(ENV); }
});
