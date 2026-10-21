import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.GHL_MOCK = '1';
process.env.SESSION_SECRET = 'test-secret-test-secret';
const { directosAbiertos, deLaReunion } = await import('../lib/zoom-inscripcion.js');
const { autoCtx, automatizacionesDe } = await import('../public/js/automatizaciones.js');

test('zoom al registrarse: solo los directos con reunión de Zoom que no han pasado', () => {
  const futuro = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  const pasado = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
  assert.deepEqual(directosAbiertos({ fechaDirecto: futuro, horaDirecto: '19:00', zoomMeetingId: '81234567890' }).map((x) => x.k), [1]);
  assert.deepEqual(directosAbiertos({ fechaDirecto: futuro, horaDirecto: '19:00' }), [], 'sin reunión de Zoom');
  assert.deepEqual(directosAbiertos({ fechaDirecto: pasado, horaDirecto: '19:00', zoomMeetingId: '81234567890' }), [], 'ya pasó');
  assert.equal(deLaReunion('https://us06web.zoom.us/w/81234567890?tk=x', '812 3456 7890'), true);
});

test('zoom al registrarse: el webhook va en el workflow de registro solo si hay URL', () => {
  const l = { name: 'Oct', fechaDirecto: '2026-11-20', horaDirecto: '19:00', registroTag: 'registrado-webinar-201126' };
  const con = automatizacionesDe(autoCtx('lanzamientos', l, { code: 'oct', zoomWebhook: 'https://d/api/zoom-registro?c=x&k=y' })).find((x) => x.id === 'registro');
  const c = autoCtx('lanzamientos', l, { code: 'oct', zoomWebhook: 'https://d/api/zoom-registro?c=x&k=y' });
  assert.ok(con.acciones(c).some((a) => a.includes('Webhook') && a.includes('https://d/api/zoom-registro?c=x&k=y&l=oct')));
  const sin = autoCtx('lanzamientos', l, { code: 'oct' });
  assert.ok(!automatizacionesDe(sin).find((x) => x.id === 'registro').acciones(sin).some((a) => a.includes('Webhook')));
});

test('zoom-registro: la URL del webhook sale con la dirección principal (no con la antigua)', async () => {
  const { dominioLogin } = await import('../lib/dominio.js');
  assert.equal(dominioLogin({ DOMINIO_LOGIN: 'alquimia.tenaxdigital.com' }), 'alquimia.tenaxdigital.com');
  const src = (await import('node:fs')).readFileSync(new URL('../handlers/zoom-registro.js', import.meta.url), 'utf8');
  assert.match(src, /data\.discendocultura\.com' \? 'alquimia\.tenaxdigital\.com'/);
});
