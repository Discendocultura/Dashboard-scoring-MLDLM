// Las páginas piden cada archivo con su huella (/styles.css?v=<sha1>, y los módulos de public/js con un
// «import map»): así ningún navegador ni Cloudflare sirve un CSS o JS viejo con una página nueva.
// Si cambias styles.css, tema.js o cualquier archivo de public/js, ejecuta: node scripts/huellas.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { htmlConHuellas, PAGINAS } from '../scripts/huellas.js';

test('index.html y marca.html piden styles.css, tema.js y cada módulo JS con la huella de su contenido', () => {
  for (const f of PAGINAS) {
    const html = readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
    assert.match(html, /<script type="importmap">/, `${f}: falta el import map (ejecuta node scripts/huellas.js)`);
    assert.ok(html === htmlConHuellas(html), `${f}: huellas desactualizadas (ejecuta node scripts/huellas.js)`);
    // El import map va antes del primer módulo (si no, el navegador lo ignora)
    assert.ok(html.indexOf('type="importmap"') < html.indexOf('type="module"'), `${f}: el import map debe ir antes del script de entrada`);
  }
});
