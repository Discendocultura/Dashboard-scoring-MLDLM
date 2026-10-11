// Toda pestaña y subpestaña del dashboard tiene su icono (si no, sale el genérico, que parece un «cargando»).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const app = readFileSync('public/js/app.js', 'utf8');
const html = readFileSync('public/index.html', 'utf8');
const ICONOS = new Set([...readFileSync('public/js/icons.js', 'utf8').matchAll(/^ {2}([a-z0-9]+):/gm)].map((m) => m[1]));

test('cada pestaña tiene un icono que existe', () => {
  const vi = Object.fromEntries([...app.match(/const VIEW_ICONS = \{([^}]*)\}/)[1].matchAll(/([a-z0-9]+): '([a-z0-9]+)'/g)].map((m) => [m[1], m[2]]));
  const pestanas = new Set([...html.matchAll(/class="(?:view-tab|subview-tab)[^"]*" data-view(?:-grupo)?="([a-z]+)"/g)].map((m) => m[1]));
  assert.ok(pestanas.size > 20);
  for (const p of pestanas) {
    assert.ok(vi[p], `La pestaña «${p}» no tiene icono en VIEW_ICONS`);
    assert.ok(ICONOS.has(vi[p]), `El icono «${vi[p]}» de «${p}» no existe en icons.js`);
  }
});

test('todos los iconos que se usan existen', () => {
  const malos = [];
  for (const f of ['public/index.html', ...readdirSync('public/js').map((x) => `public/js/${x}`)]) {
    const s = readFileSync(f, 'utf8');
    for (const re of [/icon\('([a-z0-9]+)'/g, /data-tab-icon="([a-z0-9]+)"/g, /data-tb-icon="([a-z0-9]+)"/g, /data-icon-msub="([a-z0-9]+)"/g]) {
      for (const m of s.matchAll(re)) if (!ICONOS.has(m[1])) malos.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(malos, []);
});
