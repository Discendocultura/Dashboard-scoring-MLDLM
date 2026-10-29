import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeConfig, htmlEspera, cssEspera } from '../lib/config-store.js';
import { promptEspera } from '../public/js/prompt-espera.js';

test('pantalla de espera: diseño propio por lanzamiento (CSS + decoración), sin scripts', () => {
  const e = sanitizeConfig({ launches: { lx: { name: 'X', registroTag: 'reg-x', espera: { activa: true, css: '#lsd-espera{background:#062942}</style><script>x</script>', decoracion: '<svg onload="robar()"><a href="javascript:alert(1)">a</a><circle r="3"/></svg><script>alert(1)</script><iframe src="https://x"></iframe>' } } } }).launches.lx.espera;
  assert.equal(e.css, '#lsd-espera{background:#062942}x');
  assert.equal(e.decoracion, '<svg><a href="#alert(1)">a</a><circle r="3"/></svg>');
  const vacio = sanitizeConfig({ launches: { lx: { name: 'X', registroTag: 'reg-x' } } }).launches.lx.espera;
  assert.equal(vacio.css, undefined);
  assert.equal(vacio.decoracion, undefined);
  assert.equal(htmlEspera('<link rel="stylesheet" href="x"><p>sigue</p>'), '<p>sigue</p>', 'una etiqueta sin cierre no se come el resto');
  assert.equal(cssEspera("@import url('https://fonts.googleapis.com/css2?family=Poppins');"), "@import url('https://fonts.googleapis.com/css2?family=Poppins');");
});

// avisoAppZoom de tracker.js, con el navegador que digamos.
function avisoCon(ua, touch = 0) {
  const src = readFileSync(new URL('../public/tracker.js', import.meta.url), 'utf8');
  const trozo = /(  var APP_ZOOM = [\s\S]*?\n  function avisoAppZoom[\s\S]*?\n  \})/.exec(src)[1];
  return new Function('navigator', `${trozo}; return avisoAppZoom;`)({ userAgent: ua, maxTouchPoints: touch });
}

test('pantalla de espera: aviso de la app de Zoom con el botón de su dispositivo', () => {
  const zoom = { zoom: { directo: '87044291509' }, links: { directo: 'https://x/directo' } };
  const iphone = avisoCon('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')(zoom, 'directo');
  assert.match(iphone, /descargar la aplicación de Zoom/);
  assert.match(iphone, /Descargar para iPhone/);
  assert.match(iphone, /apps\.apple\.com/);
  assert.match(iphone, /¿Usas Android\?/);
  assert.match(avisoCon('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile')(zoom, 'directo'), /Descargar para Android<\/a>[\s\S]*¿Usas iPhone\?/);
  assert.match(avisoCon('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')(zoom, 'directo'), /Descargar para Mac<\/a>[\s\S]*¿Usas Windows\?/);
  assert.match(avisoCon('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)(zoom, 'directo'), /Descargar para iPhone/, 'iPad se hace pasar por Mac');
  assert.match(avisoCon('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')(zoom, 'directo'), /Descargar para Windows<\/a>[\s\S]*¿Usas Mac\?/);
  // Enlace directo de Zoom (sin ID de reunión): también.
  assert.match(avisoCon('Windows')({ links: { directo2: 'https://us06web.zoom.us/j/123' } }, 'directo2'), /Descargar para Windows/);
  // Directo que no es en Zoom (YouTube, otra plataforma…): sin aviso.
  assert.equal(avisoCon('Windows')({ links: { directo: 'https://youtube.com/live/x' } }, 'directo'), '');
});

test('pantalla de espera: prompt para diseñarla con Claude', () => {
  const p = promptEspera({ lanzamiento: 'La Resistencia', marca: 'Discendo', textos: { titulo: 'La resistencia empieza ya' }, narrativa: 'NARRATIVA DEL LANZAMIENTO: «La Resistencia»' });
  assert.match(p, /«La Resistencia» de Discendo/);
  assert.match(p, /La resistencia empieza ya/);
  assert.match(p, /NARRATIVA DEL LANZAMIENTO/);
  assert.match(p, /lsd-espera-deco/);
  assert.match(p, /```css/);
  assert.match(p, /Sin <script>/);
});
