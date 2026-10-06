import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRich, richToHtml, richToText, videoEmbed, richToEmail } from '../public/js/richtext.js';

test('texto con formato: deja pasar el formato y quita todo lo peligroso', () => {
  const ok = '<h2>Paso 1</h2><p>Hola <b>negrita</b> e <i>cursiva</i></p><ul><li>uno</li><li>dos</li></ul><ol><li>a</li></ol><p><a href="https://ejemplo.com/x?a=1&amp;b=2">enlace</a></p>';
  assert.equal(sanitizeRich(ok), '<h2>Paso 1</h2><p>Hola <strong>negrita</strong> e <em>cursiva</em></p><ul><li>uno</li><li>dos</li></ul><ol><li>a</li></ol><p><a href="https://ejemplo.com/x?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">enlace</a></p>');
  for (const bad of [
    '<img src=x onerror=alert(1)>', '<script>alert(1)</script>', '<a href="javascript:alert(1)">x</a>', '<p onclick="alert(1)">x</p>',
    '<iframe src="https://evil.com"></iframe>', '<svg><script>alert(1)</script></svg>', '<a href="x>y" onclick=alert(1)>z</a>',
    '<img src=x onerror=alert(1)', '<<script>script>alert(1)<</script>/script>', '<style>*{}</style>', '<div data-video="javascript:alert(1)"></div>',
    '<a href="https://ok.com" onmouseover="alert(1)">x</a>', '<p style="background:url(javascript:alert(1))">x</p>',
  ]) {
    const out = sanitizeRich(bad);
    assert.doesNotMatch(out, /<(script|img|iframe|svg|style)/i, `${bad} → ${out}`);
    assert.doesNotMatch(out, /<[^>]*(\son\w+\s*=|javascript:|style\s*=)/i, `${bad} → ${out}`);
  }
  assert.equal(sanitizeRich('<p>a</p><div data-video="https://vimeo.com/123456/abcdef12"><iframe src="https://evil"></iframe>texto</div><p>b</p>'),
    '<p>a</p><div data-video="https://vimeo.com/123456/abcdef12"></div><p>b</p>');
  assert.equal(sanitizeRich('<p>sin cerrar <strong>negrita'), '<p>sin cerrar <strong>negrita</strong></p>');
  assert.equal(sanitizeRich('<p>a<ol><li>x</li></ol>b<strong></strong></p>'), '<p>a</p><ol><li>x</li></ol>b');
});

test('vídeos embebidos y texto plano de las notas antiguas', () => {
  assert.equal(videoEmbed('https://vimeo.com/123456/abcdef12'), 'https://player.vimeo.com/video/123456?h=abcdef12');
  assert.equal(videoEmbed('https://vimeo.com/123456?share=copy'), 'https://player.vimeo.com/video/123456');
  assert.equal(videoEmbed('https://player.vimeo.com/video/987?h=ff00'), 'https://player.vimeo.com/video/987?h=ff00');
  assert.equal(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(videoEmbed('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(videoEmbed('https://evil.com/vimeo.com/123'), '');
  assert.equal(richToHtml('Línea 1\nyo <3 esto & ya'), 'Línea 1<br>yo &lt;3 esto &amp; ya');
  assert.equal(richToHtml('Línea 1\nLínea 2'), 'Línea 1<br>Línea 2');
  assert.equal(richToText('<h2>Título</h2><ul><li>uno</li><li>dos &amp; tres</li></ul><div data-video="https://vimeo.com/1"></div>'), 'Título\n• uno\n• dos & tres\n🎬');
  assert.match(richToEmail('<div data-video="https://vimeo.com/1"></div>'), /href="https:\/\/vimeo.com\/1"/);
});
