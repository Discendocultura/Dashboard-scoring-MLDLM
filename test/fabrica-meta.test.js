// 🏭 Fábrica: cómo se piden a Meta las creatividades (anuncio → creatividad → vídeo), con miniatura grande y,
// si Meta no deja leer los «spec», sin ellos.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('creatividades de Meta: miniatura grande, portada del vídeo y reintento sin «spec»', async () => {
  const { setEnv } = await import('../lib/env.js');
  setEnv({ META_ACCESS_TOKEN: 'token-prueba', META_AD_ACCOUNT_ID: '123' });
  const { creatividadesMeta } = await import('../lib/meta.js');
  const pedidas = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (u) => {
    const url = new URL(u);
    const f = url.searchParams.get('fields');
    pedidas.push(f);
    const r = (body, status = 200) => new Response(JSON.stringify(body), { status });
    if (f === 'creative') return r({ 111: { creative: { id: '900' } }, 222: { creative: { id: '901' } } });
    if (f.includes('object_story_spec')) return r({ error: { message: 'Sin permiso sobre la página', code: 10 } }, 400);
    if (f.startsWith('object_type')) {
      assert.equal(url.searchParams.get('thumbnail_width'), '720');
      return r({ 900: { object_type: 'VIDEO', video_id: '55', thumbnail_url: 'https://cdn.test/t900.jpg', body: 'Texto' }, 901: { object_type: 'PHOTO', image_url: 'https://cdn.test/i901.jpg', title: 'Título' } });
    }
    if (f.startsWith('source')) return r({ 55: { source: 'https://cdn.test/v55.mp4', length: 31.4, thumbnails: { data: [{ uri: 'https://cdn.test/p-peq.jpg', is_preferred: false, height: 100 }, { uri: 'https://cdn.test/p-buena.jpg', is_preferred: true, height: 720 }] } } });
    throw new Error(`inesperada: ${f}`);
  };
  try {
    const c = await creatividadesMeta(['111', '222', 'malo']);
    assert.equal(c[111].tipo, 'video');
    assert.equal(c[111].imagen, 'https://cdn.test/p-buena.jpg');
    assert.equal(c[111].video, 'https://cdn.test/v55.mp4');
    assert.equal(c[111].duracion, 31);
    assert.equal(c[222].tipo, 'imagen');
    assert.equal(c[222].imagen, 'https://cdn.test/i901.jpg');
    assert.equal(c[222].titulo, 'Título');
    assert.equal(pedidas.length, 4);
  } finally { globalThis.fetch = orig; }
});
