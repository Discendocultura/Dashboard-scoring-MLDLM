import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// El código que corre en el navegador no puede usar «lookbehind» en las expresiones regulares ((?<= / (?<!):
// Safari de iOS anterior a 16.4 no lo entiende y, como los módulos se importan juntos, no arrancaría nada de AlquimIA.
test('compatibilidad: sin lookbehind en el JS del navegador (iPhone con iOS < 16.4)', () => {
  const dir = new URL('../public/js/', import.meta.url);
  const malos = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    readFileSync(new URL(f, dir), 'utf8').split('\n').forEach((l, i) => {
      if (/\(\?<[=!]/.test(l.replace(/\/\/.*$/, ''))) malos.push(`${f}:${i + 1}`);
    });
  }
  for (const f of ['../public/tracker.js']) {
    readFileSync(new URL(f, import.meta.url), 'utf8').split('\n').forEach((l, i) => { if (/\(\?<[=!]/.test(l.replace(/\/\/.*$/, ''))) malos.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(malos, []);
});
