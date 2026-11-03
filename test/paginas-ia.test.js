import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { revisarHtmlPagina, firmasDe, htmlDeRespuesta } from '../public/js/revisar-codigos.js';

before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  setEnv({ GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret', DB: crearD1Local() });
});

const SCRIPT = '<script src="https://alq.pages.dev/tracker.js?c=sol" defer></script>';
const codigos = [
  ['VENTA · bloque base', `<div data-lsd-venta data-launch="auto"></div>\n${SCRIPT}`],
  ['WHATSAPP · botón flotante', '<a data-lsd-link="whatsappDudas" class="wa-flotante">WhatsApp</a>'],
  ['VENTA · barra por fases', '<div data-lsd-fase-venta="bar">BAR</div><div data-lsd-fase-venta="abierto">Abierto</div>'],
];

test('revisor: las firmas de un código', () => {
  assert.deepEqual(firmasDe(codigos[0][1]), { attrs: ['data-lsd-venta'], scripts: ['https://alq.pages.dev/tracker.js?c=sol'] });
});

test('revisor: todo bien → nada que cambiar', () => {
  const html = `<style>.x{color:red}</style>${codigos.map(([, c]) => c).join('\n')}`;
  const r = revisarHtmlPagina(html, codigos);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.html, html);
});

test('revisor: añade lo que falta, corrige el cliente del script, el WhatsApp sin enlace y la barra forzada', () => {
  const html = `<style>.fase{display:flex!important}</style>
<div data-lsd-venta></div><script src="https://alq.pages.dev/tracker.js" defer></script>
<div class="fase" data-lsd-fase-venta="bar">BAR</div><div class="fase" data-lsd-fase-venta="abierto">Abierto</div>
<a class="boton" href="#">Escríbeme por WhatsApp</a>`;
  const r = revisarHtmlPagina(html, codigos);
  assert.match(r.html, /tracker\.js\?c=sol/);
  assert.match(r.html, /<a data-lsd-link="whatsappDudas" class="boton" href="#">Escríbeme por WhatsApp<\/a>/);
  assert.match(r.html, /data-lsd-guarda/);
  assert.equal(r.cambios.length, 3, r.cambios.join('\n'));
  // Falta un bloque entero → al final, con su comentario; y sin script: se añade
  const r2 = revisarHtmlPagina('<h1>Hola</h1>', codigos.slice(0, 1));
  assert.match(r2.html, /faltaba el código tracker\.js[\s\S]*faltaba «VENTA · bloque base»[\s\S]*data-lsd-venta/);
  assert.equal(r2.cambios.length, 2);
});

test('revisor: el HTML de la respuesta de Claude', () => {
  assert.equal(htmlDeRespuesta('Aquí la tienes.\n```html\n<p>x</p>\n```\nSuerte'), '<p>x</p>');
  assert.equal(htmlDeRespuesta('<p>y</p>'), '<p>y</p>');
});

test('/api/paginas-ia: crear (modo de prueba) revisa el resultado; biblioteca del cliente y de la agencia', async () => {
  const { POST: login } = await import('../handlers/login.js');
  const cookie = (await login(new Request('http://localhost/api/login', { method: 'POST', body: '{"password":"admin"}' }))).headers.get('set-cookie').split(';')[0];
  const { GET, POST } = await import('../handlers/paginas-ia.js');
  const post = (body) => POST(new Request('http://localhost/api/paginas-ia', { method: 'POST', headers: { cookie }, body: JSON.stringify(body) }));
  const r = await (await post({ op: 'crear', prompt: 'Haz la página de venta con la marca y estos códigos… '.repeat(3), codigos })).json();
  assert.ok(r.html.includes('data-lsd-link="whatsappDudas"'));
  assert.ok(r.cambios.some((t) => /barra por fases/.test(t)));
  assert.equal((await post({ op: 'crear', prompt: 'corto', codigos })).status, 400);
  assert.equal((await post({ op: 'bloque', bloque: { nombre: 'Barra por fases', html: codigos[2][1] } })).status, 200);
  assert.equal((await post({ op: 'bloque', agencia: true, bloque: { nombre: 'BAR común', html: '<div data-lsd-bonus></div>' } })).status, 200); // la contraseña de admin es superadmin
  const lista = await (await GET(new Request('http://localhost/api/paginas-ia?bloques=1', { headers: { cookie } }))).json();
  assert.deepEqual([lista.cliente[0].nombre, lista.agencia[0].nombre], ['Barra por fases', 'BAR común']);
  assert.equal((await post({ op: 'borrar-bloque', id: lista.cliente[0].id })).status, 200);
  assert.equal((await (await GET(new Request('http://localhost/api/paginas-ia', { headers: { cookie } }))).json()).cliente.length, 0);
  assert.equal((await POST(new Request('http://localhost/api/paginas-ia', { method: 'POST', body: '{"op":"crear"}' }))).status, 401);
});
