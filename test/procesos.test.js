import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeBiblioteca, fusionar, buscarProcesos, documentado, tieneVideo } from '../public/js/procesos.js';
import { videoEmbed, sanitizeRich } from '../public/js/richtext.js';

test('biblioteca: limpia el HTML, la sección debe existir y el enlace a Asana solo si es de Asana', () => {
  const b = sanitizeBiblioteca({
    secciones: [{ titulo: '📣 Marketing' }, { id: 'ventas', titulo: '🤑 Ventas' }],
    procesos: [
      { id: 'a1', seccion: 'ventas', titulo: 'Devoluciones', html: '<ol><li>Paso <script>x</script>uno</li></ol><div data-video="https://vimeo.com/123"></div>', asana: 'https://app.asana.com/0/1/2' },
      { id: 'a2', seccion: 'no-existe', titulo: '', html: '', asana: 'https://malo.com' },
      { id: 'a1', titulo: 'repetido' },
    ],
  });
  assert.equal(b.secciones[0].id, 'marketing');
  assert.equal(b.procesos.length, 2);
  assert.ok(!b.procesos[0].html.includes('script'));
  assert.ok(tieneVideo(b.procesos[0]) && documentado(b.procesos[0]));
  assert.equal(b.procesos[1].seccion, 'marketing');
  assert.equal(b.procesos[1].titulo, 'Proceso sin título');
  assert.equal(b.procesos[1].asana, '');
  assert.equal(documentado(b.procesos[1]), false);
});

test('importar: añade los nuevos y sustituye los del mismo id; búsqueda sin tildes', () => {
  const actual = { secciones: [{ id: 'ventas', titulo: 'Ventas' }], procesos: [{ id: 'a1', seccion: 'ventas', titulo: 'Viejo', html: 'x' }, { id: 'm1', seccion: 'ventas', titulo: 'Mío', html: 'y' }] };
  const r = fusionar(actual, { secciones: [{ id: 'skool', titulo: 'Skool' }], procesos: [{ id: 'a1', seccion: 'ventas', titulo: 'Devoluciones', html: 'Plazo de devolución' }, { id: 'a3', seccion: 'skool', titulo: 'Evento en el calendario', html: '' }] });
  assert.deepEqual([r.nuevos, r.actualizados], [1, 1]);
  assert.deepEqual(r.biblioteca.procesos.map((p) => p.titulo), ['Devoluciones', 'Mío', 'Evento en el calendario']);
  assert.deepEqual(buscarProcesos(r.biblioteca.procesos, 'DEVOLUCION').map((p) => p.id), ['a1']);
});

test('vídeos de Bunny: se ven dentro (play → embed) y se guardan en el texto', () => {
  assert.equal(videoEmbed('https://iframe.mediadelivery.net/play/123456/00000000-1111-2222-3333-444444444444'), 'https://iframe.mediadelivery.net/embed/123456/00000000-1111-2222-3333-444444444444');
  assert.equal(videoEmbed('https://iframe.mediadelivery.net/play/abc/x'), '');
  assert.match(sanitizeRich('<div data-video="https://iframe.mediadelivery.net/play/123456/00000000-1111-2222-3333-444444444444"></div>'), /data-video/);
});
