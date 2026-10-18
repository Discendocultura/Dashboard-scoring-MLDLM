import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paraChatGPT } from '../public/js/chatgpt.js';
import { PROMPTS_ANUNCIOS, objetivosDe } from '../public/js/anuncios.js';

test('prompt para ChatGPT: sin skills ni Claude, con reglas al principio y al final', () => {
  const p = 'Usa tu skill de copy de venta (emails de lanzamiento) para escribir la SECUENCIA.\nPégalo en Claude.\n<marca>\nTono cercano\n</marca>\nSi tienes la skill para programar emails en GHL, después te pediré que los programes con ella.';
  const g = paraChatGPT(p);
  assert.ok(g.startsWith('INSTRUCCIONES PARA CHATGPT'));
  assert.ok(/Como copywriter experto en lanzamientos y respuesta directa, escribe la SECUENCIA/.test(g));
  assert.ok(!/skill|Claude/.test(g));
  assert.ok(g.includes('<marca>\nTono cercano\n</marca>')); // el contexto, intacto
  assert.ok(/español de España/.test(g) && /\nRECUERDA:/.test(g));
  // Página: un único bloque html; los códigos del dashboard no se tocan
  const pag = paraChatGPT('Eres diseñador (usa tu skill de copy de venta si la tienes). <div data-lsd-x="1"></div><script src="/tracker.js"></script>', { tipo: 'codigo' });
  assert.ok(/```html```/.test(pag) && pag.includes('<div data-lsd-x="1"></div><script src="/tracker.js"></script>') && !/skill/.test(pag));
  // Imagen: que la genere, con el texto exacto
  const img = paraChatGPT('Imagen cuadrada con el texto «¡Última hora!»', { tipo: 'imagen' });
  assert.ok(/Genera la imagen ahora/.test(img) && img.includes('«¡Última hora!»'));
});

test('anuncios para ChatGPT: sin Magnific, las imágenes las genera él', () => {
  const objetivo = objetivosDe('lanzamientos')[0];
  const ctx = { objetivo, tipoTexto: 'Lanzamiento', marca: 'Marca', datos: [], urls: {}, logo: 'https://x.com/logo.png' };
  for (const p of PROMPTS_ANUNCIOS) {
    const txt = (p.gpt || p.fn)(ctx);
    assert.ok(!/MAGNIFIC|Magnific|brand_kit|simulate_cost/.test(txt), p.id);
  }
  assert.ok(/generador de imágenes/.test(PROMPTS_ANUNCIOS.find((p) => p.id === 'todo').gpt(ctx)));
});
