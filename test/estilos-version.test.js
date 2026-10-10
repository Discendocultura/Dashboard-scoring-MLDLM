// La página pide los estilos con su huella (/styles.css?v=<sha1>): así ningún navegador ni Cloudflare sirve
// unos estilos viejos con una página nueva. Si cambias styles.css, actualiza la huella (este test te dice cuál).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

test('index.html y marca.html piden styles.css con la huella de su contenido', () => {
  const huella = createHash('sha1').update(readFileSync(new URL('../public/styles.css', import.meta.url))).digest('hex').slice(0, 10);
  for (const f of ['index.html', 'marca.html']) {
    const html = readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
    assert.match(html, new RegExp(`/styles\\.css\\?v=${huella}"`), `${f}: cambia el ?v= de styles.css por ${huella}`);
  }
});
