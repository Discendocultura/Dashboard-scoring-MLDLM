import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redirigirALogin, dominioLogin } from '../lib/dominio.js';

const req = (url, method = 'GET') => new Request(url, { method });

test('la pantalla de entrar siempre en la dirección principal; lo demás, en todas', () => {
  // Sin DOMINIO_LOGIN no se redirige (se activa cuando la dirección nueva ya funciona)
  assert.equal(redirigirALogin(req('https://data.discendocultura.com/'), {}), null);
  const env = { DOMINIO_LOGIN: 'alquimia.tenaxdigital.com' };
  const r = redirigirALogin(req('https://data.discendocultura.com/?reset=abc'), env);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), 'https://alquimia.tenaxdigital.com/?reset=abc');
  assert.equal(redirigirALogin(req('https://leads-mldlm.pages.dev/index.html'), env).headers.get('location'), 'https://alquimia.tenaxdigital.com/index.html');
  // Ya en la principal, en local, otras rutas o métodos: nada
  assert.equal(redirigirALogin(req('https://alquimia.tenaxdigital.com/'), env), null);
  assert.equal(redirigirALogin(req('http://localhost:3000/'), env), null);
  for (const p of ['/tracker.js', '/api/me', '/directo?l=oct', '/marca.html']) assert.equal(redirigirALogin(req(`https://data.discendocultura.com${p}`), env), null);
  assert.equal(redirigirALogin(req('https://data.discendocultura.com/', 'POST'), env), null);
  // Configurable (DOMINIO_LOGIN) y desactivable con «-»
  assert.equal(redirigirALogin(req('https://data.discendocultura.com/'), { DOMINIO_LOGIN: 'app.ejemplo.com' }).headers.get('location'), 'https://app.ejemplo.com/');
  assert.equal(redirigirALogin(req('https://data.discendocultura.com/'), { DOMINIO_LOGIN: '-' }), null);
  assert.equal(dominioLogin({ DOMINIO_LOGIN: 'https://mal/' }), '');
});
