// 🏭 Fábrica: cómo se piden a Meta las creatividades (anuncio → creatividad → vídeo) con la API por lotes («batch»;
// el parámetro «ids» ya no vale desde la v26), con miniatura grande, reintento sin «spec» y fallos sueltos que no
// tumban al resto.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Simula la API por lotes de Meta: `nodo(id, fields, params)` → { code, body } de cada petición.
async function conMeta(nodo, fn) {
  const { setEnv } = await import('../lib/env.js');
  setEnv({ META_ACCESS_TOKEN: 'token-prueba', META_AD_ACCOUNT_ID: '123' });
  const orig = globalThis.fetch;
  const llamadas = [];
  globalThis.fetch = async (u, opts = {}) => {
    const url = new URL(u);
    assert.equal(url.searchParams.get('ids'), null, 'el parámetro ids ya no vale en la v26');
    assert.equal(opts.method, 'POST');
    const form = new URLSearchParams(String(opts.body));
    assert.equal(form.get('access_token'), 'token-prueba');
    const batch = JSON.parse(form.get('batch'));
    llamadas.push(batch);
    const out = batch.map((b) => {
      const [id, q] = b.relative_url.split('?');
      const p = new URLSearchParams(q);
      const r = nodo(id, p.get('fields'), p);
      return r ? (r.code ? { code: r.code, body: JSON.stringify(r.body) } : { code: 200, body: JSON.stringify(r) }) : { code: 404, body: JSON.stringify({ error: { message: `(#100) Object with ID '${id}' does not exist` } }) };
    });
    return new Response(JSON.stringify(out), { status: 200 });
  };
  try { return await fn(llamadas); } finally { globalThis.fetch = orig; }
}

test('creatividades de Meta: miniatura grande, portada del vídeo y reintento sin «spec»', async () => {
  const { creatividadesMeta } = await import('../lib/meta.js');
  await conMeta((id, f, p) => {
    if (f === 'creative') return { 111: { creative: { id: '900' } }, 222: { creative: { id: '901' } } }[id];
    if (f.includes('object_story_spec')) return id === '900' ? { code: 403, body: { error: { message: 'Sin permiso sobre la página' } } } : { object_type: 'PHOTO', image_url: 'https://cdn.test/i901.jpg', title: 'Título' };
    if (f.startsWith('object_type')) {
      assert.equal(p.get('thumbnail_width'), '720');
      return { object_type: 'VIDEO', video_id: '55', thumbnail_url: 'https://cdn.test/t900.jpg', body: 'Texto' };
    }
    if (f.startsWith('source')) return { source: 'https://cdn.test/v55.mp4', length: 31.4, thumbnails: { data: [{ uri: 'https://cdn.test/p-peq.jpg', is_preferred: false, height: 100 }, { uri: 'https://cdn.test/p-buena.jpg', is_preferred: true, height: 720 }] } };
    return null;
  }, async (llamadas) => {
    const c = await creatividadesMeta(['111', '222', 'malo']);
    assert.equal(c[111].tipo, 'video');
    assert.equal(c[111].imagen, 'https://cdn.test/p-buena.jpg');
    assert.equal(c[111].video, 'https://cdn.test/v55.mp4');
    assert.equal(c[111].duracion, 31);
    assert.equal(c[222].tipo, 'imagen');
    assert.equal(c[222].imagen, 'https://cdn.test/i901.jpg');
    assert.equal(c[222].titulo, 'Título');
    // anuncios, creatividades, creatividad sin spec, vídeos: 4 peticiones, cada una con varios nodos.
    assert.equal(llamadas.length, 4);
    assert.equal(llamadas[0].length, 2);
  });
});

test('creatividades de Meta: un anuncio que no existe no tumba al resto (y se dice por qué)', async () => {
  const { creatividadesMeta } = await import('../lib/meta.js');
  await conMeta((id, f) => {
    if (id === '999') return null;
    if (f === 'creative') return { creative: { id: `c${id}` } };
    if (f.startsWith('object_type')) return { object_type: 'PHOTO', image_url: `https://cdn.test/${id}.jpg` };
    return null;
  }, async () => {
    const avisos = [];
    const c = await creatividadesMeta(['111', '999', '222'], { avisos });
    assert.deepEqual(Object.keys(c).sort(), ['111', '222']);
    assert.equal(c[111].imagen, 'https://cdn.test/c111.jpg');
    assert.equal(avisos.length, 1);
    assert.match(avisos[0], /does not exist/);
  });
});

test('estados de Meta (activa / en pausa) también por lotes', async () => {
  const { estadosMeta } = await import('../lib/meta.js');
  await conMeta((id) => (id === '7' ? null : { effective_status: 'PAUSED', created_time: '2026-11-01T10:00:00+0000' }), async () => {
    const e = await estadosMeta(['5', '6', '7']);
    assert.deepEqual(Object.keys(e).sort(), ['5', '6']);
    assert.equal(e[5].estado, 'PAUSED');
  });
});
