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

test('procesos como tareas: fechas que se repiten, estado de la fecha e importar sin perder el trabajo', async () => {
  const { siguienteFecha, proximaTrasHecho, estadoFecha, sanitizeProceso } = await import('../public/js/procesos.js');
  assert.equal(siguienteFecha('2026-01-31', { tipo: 'mensual' }), '2026-02-28');
  assert.equal(siguienteFecha('2026-10-16', { tipo: 'laborables' }), '2026-10-19'); // viernes → lunes
  assert.equal(siguienteFecha('2026-10-01', { tipo: 'dias', n: 3 }), '2026-10-04');
  assert.equal(siguienteFecha('2026-10-01', { tipo: '' }), '');
  assert.equal(proximaTrasHecho('2026-10-01', { tipo: 'semanal' }, '2026-10-13'), '2026-10-15'); // salta las que ya pasaron
  assert.equal(estadoFecha({ fecha: '2026-10-12', repetir: {} }, '2026-10-13'), 'vencida');
  assert.equal(estadoFecha({ fecha: '2026-10-13', repetir: {} }, '2026-10-13'), 'hoy');
  assert.equal(estadoFecha({ fecha: '2026-10-12', hecho: true, repetir: {} }, '2026-10-13'), '');
  const p = sanitizeProceso({ id: 'a1', titulo: 'x', fecha: 'mal', repetir: { tipo: 'dias', n: 9999 }, subtareas: [{ texto: 'uno', hecha: true }, { texto: '' }], comentarios: [{ por: 'Ana', texto: 'hola' }] });
  assert.equal(p.fecha, '');
  assert.equal(p.repetir.n, 365);
  assert.equal(p.subtareas.length, 1);
  assert.equal(p.comentarios[0].por, 'Ana');
  const r = fusionar({ procesos: [{ id: 'a1', titulo: 'Viejo', html: 'a', fecha: '2026-11-01', comentarios: [{ por: 'Ana', texto: 'ojo' }] }] }, { procesos: [{ id: 'a1', titulo: 'Nuevo', html: 'b' }] });
  assert.equal(r.biblioteca.procesos[0].titulo, 'Nuevo');
  assert.equal(r.biblioteca.procesos[0].fecha, '2026-11-01');
  assert.equal(r.biblioteca.procesos[0].comentarios.length, 1);
});

test('procesos por proyecto: los generales se ven en todos; los de un proyecto, solo en el suyo', async () => {
  const { enProyecto, sanitizeProceso } = await import('../public/js/procesos.js');
  const general = sanitizeProceso({ id: 'g', titulo: 'g', proyectos: [] });
  const disc = sanitizeProceso({ id: 'd', titulo: 'd', proyectos: ['discendo', 'discendo', 'MAL ID'] });
  assert.deepEqual(disc.proyectos, ['discendo']);
  assert.ok(enProyecto(general, 'mldlm') && enProyecto(general, '') && enProyecto(general, '_general'));
  assert.ok(enProyecto(disc, 'discendo') && enProyecto(disc, ''));
  assert.ok(!enProyecto(disc, 'mldlm') && !enProyecto(disc, '_general'));
});

test('procesos: repetir un día concreto (días de la semana, día del mes, «el primer lunes», «el último viernes»)', async () => {
  const { siguienteFecha, proximaTrasHecho, sanitizeRepetir, textoRepetir, encajaEnRepetir, primeraFechaRepetir } = await import('../public/js/procesos.js');
  // 14-10-2026 es miércoles
  assert.equal(siguienteFecha('2026-10-14', { tipo: 'semanal', dias: [1] }), '2026-10-19'); // → lunes
  assert.equal(siguienteFecha('2026-10-19', { tipo: 'semanal', dias: [1, 4] }), '2026-10-22'); // lunes → jueves
  assert.equal(siguienteFecha('2026-10-22', { tipo: 'semanal', dias: [4, 1] }), '2026-10-26'); // jueves → lunes
  assert.equal(siguienteFecha('2026-10-19', { tipo: 'quincenal', dias: [1] }), '2026-11-02');
  assert.equal(siguienteFecha('2026-10-02', { tipo: 'mensual', dia: 5 }), '2026-10-05'); // este mes, si aún no ha llegado
  assert.equal(siguienteFecha('2026-10-05', { tipo: 'mensual', dia: 5 }), '2026-11-05');
  assert.equal(siguienteFecha('2026-01-31', { tipo: 'mensual', dia: 31 }), '2026-02-28');
  assert.equal(siguienteFecha('2026-02-28', { tipo: 'mensual', dia: 31 }), '2026-03-31'); // no se queda en el 28
  assert.equal(siguienteFecha('2026-10-14', { tipo: 'mensual', dia: -1 }), '2026-10-31');
  assert.equal(siguienteFecha('2026-10-05', { tipo: 'mensual', ord: 1, dsem: 1 }), '2026-11-02'); // primer lunes
  assert.equal(siguienteFecha('2026-10-14', { tipo: 'mensual', ord: -1, dsem: 5 }), '2026-10-30'); // último viernes
  assert.equal(siguienteFecha('2026-10-30', { tipo: 'mensual', ord: -1, dsem: 5 }), '2026-11-27');
  assert.equal(proximaTrasHecho('2026-08-05', { tipo: 'mensual', dia: 5 }, '2026-10-14'), '2026-11-05');
  // Limpieza: los días solo donde tienen sentido; cada 2 semanas, uno
  assert.deepEqual(sanitizeRepetir({ tipo: 'semanal', dias: [4, 1, 1, 9] }), { tipo: 'semanal', n: 0, dias: [1, 4] });
  assert.deepEqual(sanitizeRepetir({ tipo: 'quincenal', dias: [3, 1] }), { tipo: 'quincenal', n: 0, dias: [1] });
  assert.deepEqual(sanitizeRepetir({ tipo: 'diaria', dias: [1], dia: 5 }), { tipo: 'diaria', n: 0 });
  assert.deepEqual(sanitizeRepetir({ tipo: 'mensual', dia: 40 }), { tipo: 'mensual', n: 0 });
  assert.deepEqual(sanitizeRepetir({ tipo: 'semanal' }), { tipo: 'semanal', n: 0 }); // sin día: como siempre
  assert.equal(siguienteFecha('2026-10-14', { tipo: 'semanal' }), '2026-10-21');
  assert.equal(textoRepetir({ tipo: 'semanal', dias: [1, 3, 4] }), 'Cada semana: lunes, miércoles y jueves');
  assert.equal(textoRepetir({ tipo: 'mensual', dia: 5 }), 'Cada mes, el día 5');
  assert.equal(textoRepetir({ tipo: 'mensual', ord: 1, dsem: 1 }), 'Cada mes, el primer lunes');
  assert.equal(textoRepetir({ tipo: 'quincenal', dias: [2] }), 'Cada 2 semanas, el martes');
  assert.equal(encajaEnRepetir('2026-10-14', { tipo: 'semanal', dias: [1] }), false);
  assert.equal(primeraFechaRepetir('2026-10-14', { tipo: 'semanal', dias: [1] }), '2026-10-19');
  assert.equal(primeraFechaRepetir('2026-10-05', { tipo: 'mensual', dia: 5 }), '2026-10-05');
  assert.equal(primeraFechaRepetir('2026-10-14', { tipo: 'quincenal', dias: [2] }), '2026-10-20'); // el próximo martes, sin saltarse una semana
});
