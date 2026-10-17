import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoOp, estaBloqueada, ESTADOS_OP, agruparPorFecha, resumenProyecto, cargaPorPersona, asignadaA, enRango, limitesRango } from '../public/js/operativa.js';
import { visiblesPara, visiblesOperativa, proyectosQueGestiona, proyectosSoloOperativa, puedeOperativa, clienteDeTarea, ponerEstado, ponerBloqueo, camposAgencia } from '../lib/operativa.js';

const hoy = '2026-10-13';
const T = [
  { id: '1', cliente: 'mldlm', titulo: 'Vencida de Ana', fecha: '2026-10-10', asignado: { tipo: 'persona', id: 'ana' } },
  { id: '2', cliente: 'mldlm', titulo: 'Hoy, rol técnico', fecha: hoy, asignado: { tipo: 'rol', rol: 'tecnico' } },
  { id: '3', cliente: 'discendo', titulo: 'De Luis bloqueada', fecha: '2026-10-15', estado: 'bloqueado', bloqueo: 'esperando', asignado: { tipo: 'persona', id: 'luis' } },
  { id: '4', cliente: '_agencia', titulo: 'Facturas', fecha: '', asignado: { tipo: 'persona', id: 'ana' } },
  { id: '5', cliente: 'mldlm', titulo: 'Hecha', hecha: true, asignado: { tipo: 'persona', id: 'ana' } },
];

test('operativa: cada persona ve solo lo suyo (a su nombre o a su rol en ese cliente); el superadmin, todo', () => {
  const ana = { superadmin: false, user: { id: 'ana', accesos: { mldlm: 'tecnico' } } };
  assert.deepEqual(visiblesPara(T, ana).map((t) => t.id), ['1', '2', '4', '5']);
  const luis = { superadmin: false, user: { id: 'luis', accesos: { discendo: 'equipo' } } };
  assert.deepEqual(visiblesPara(T, luis).map((t) => t.id), ['3']);
  assert.equal(visiblesPara(T, { superadmin: true }).length, 5);
  assert.equal(asignadaA(T[1], 'ana', ''), false); // por rol solo con el rol de ese cliente
});

test('operativa: el admin de un proyecto entra y ve todo lo de sus proyectos (no lo interno de la agencia)', () => {
  const marta = { superadmin: false, uid: 'marta', user: { id: 'marta', accesos: { discendo: 'admin', mldlm: 'equipo' } } };
  assert.deepEqual(proyectosQueGestiona(marta), ['discendo']);
  assert.equal(puedeOperativa(marta), true);
  assert.deepEqual(visiblesOperativa(T, marta).map((t) => t.id), ['3']);
  const pepe = { superadmin: false, user: { id: 'pepe', accesos: { mldlm: 'equipo' } } };
  assert.equal(puedeOperativa(pepe), false);
  assert.equal(puedeOperativa({ superadmin: false, user: { id: 'x', agencia: true } }), true);
  // Del equipo de la agencia y admin de un proyecto: lo suyo, lo interno asignado y todo su proyecto.
  const ana = { superadmin: false, user: { id: 'ana', agencia: true, accesos: { mldlm: 'tecnico', discendo: 'admin' } } };
  assert.deepEqual(visiblesOperativa(T, ana).map((t) => t.id), ['1', '2', '3', '4', '5']);
  // Las de la lista de la agencia llevan su proyecto: la referencia tiene que cuadrar.
  assert.equal(clienteDeTarea({ proyecto: 'discendo' }, { cliente: 'discendo', code: '_agencia' }), 'discendo');
  assert.equal(clienteDeTarea({}, { cliente: 'discendo', code: '_agencia' }), '_agencia');
  assert.equal(clienteDeTarea({}, { cliente: 'discendo', code: 'L1' }), 'discendo');
});

test('operativa: estados, «Mi día» por fecha, semáforo del proyecto y carga por persona', () => {
  assert.equal(estadoOp({ hecha: true, estado: 'en-curso' }), 'hecha');
  assert.equal(estadoOp({ estado: 'revision' }), 'revision');
  assert.equal(estadoOp({ estado: 'raro' }), 'pendiente');
  // Tres columnas: los antiguos «en curso» y «bloqueado» van a Pendiente (lo bloqueado sigue marcado).
  assert.deepEqual(ESTADOS_OP.map((e) => e.id), ['pendiente', 'revision', 'hecha']);
  assert.equal(estadoOp({ estado: 'en-curso' }), 'pendiente');
  assert.equal(estadoOp(T[2]), 'pendiente');
  assert.ok(estaBloqueada(T[2]));
  assert.equal(estaBloqueada({ hecha: true, bloqueo: 'x' }), false);
  const g = agruparPorFecha(T, hoy);
  assert.deepEqual([g.vencidas.length, g.hoy.length, g.semana.length, g.sinFecha.length], [1, 1, 1, 1]);
  assert.equal(resumenProyecto(T.filter((t) => t.cliente === 'discendo'), hoy).semaforo, 'bloqueado');
  assert.equal(resumenProyecto(T.filter((t) => t.cliente === 'mldlm'), hoy).semaforo, 'retraso');
  assert.equal(resumenProyecto([], hoy).semaforo, 'vacio');
  assert.deepEqual(cargaPorPersona(T, hoy).map((x) => [x.uid, x.abiertas, x.vencidas]), [['ana', 2, 1], ['luis', 1, 0]]);
});

test('operativa: bloquear es una marca con motivo (no mueve de columna); «Hecho» apunta quién y cuándo', () => {
  const t = { titulo: 'x' };
  ponerEstado(t, 'revision', { por: 'Ana' });
  ponerBloqueo(t, 'falta el vídeo');
  assert.equal(t.bloqueo, 'falta el vídeo');
  assert.equal(estadoOp(t), 'revision');
  ponerBloqueo(t, '');
  assert.ok(!estaBloqueada(t));
  ponerBloqueo(t, 'esperando al cliente');
  ponerEstado(t, 'hecha', { por: 'Ana' });
  assert.ok(t.hecha && t.hechaPor === 'Ana' && t.hechaEn && !t.bloqueo);
  assert.throws(() => ponerBloqueo(t, 'x'), /hecha/);
  assert.throws(() => ponerEstado(t, 'bloqueado', { por: 'Ana' }), /no válido/);
  assert.throws(() => ponerEstado(t, 'en-curso', { por: 'Ana' }), /no válido/);
  const vieja = { titulo: 'y', estado: 'bloqueado', bloqueo: 'z' };
  ponerBloqueo(vieja, '');
  assert.equal(vieja.estado, 'pendiente');
  assert.throws(() => camposAgencia({ titulo: '  ' }), /título/);
  assert.deepEqual(camposAgencia({ titulo: 'Facturas', fecha: 'mal', asignado: { tipo: 'persona', id: 'ana' } }).asignado, { tipo: 'persona', id: 'ana' });
});

test('operativa: la descripción se guarda con formato limpio (negrita, listas, enlaces) y sin scripts', async () => {
  const { sanitizeRich } = await import('../public/js/richtext.js');
  const h = sanitizeRich('Antes del <strong>viernes</strong><ul><li>Titular</li></ul><a href="https://x.com">guía</a><script>alert(1)</script><a href="javascript:alert(1)">mal</a>');
  assert.match(h, /<strong>viernes<\/strong>/);
  assert.match(h, /<ul><li>Titular<\/li><\/ul>/);
  assert.match(h, /href="https:\/\/x.com"/);
  assert.ok(!/script|javascript/.test(h));
});

test('operativa: embudos de un cliente y calendario del mes (semanas de lunes a domingo)', async () => {
  const { embudosDe, semanasDelMes, mesMas } = await import('../public/js/operativa.js');
  const ts = [
    { cliente: 'mldlm', embudoId: 'lanz', embudoNombre: 'Lanzamientos', embudoTipo: 'lanzamientos' },
    { cliente: 'mldlm', embudoId: 'lanz', embudoNombre: 'Lanzamientos', embudoTipo: 'lanzamientos', hecha: true },
    { cliente: 'mldlm', embudoId: 'reto', embudoNombre: 'Reto Ovulación', embudoTipo: 'directa' },
    { cliente: 'otro', embudoId: 'vsl', embudoNombre: 'VSL' },
  ];
  assert.deepEqual(embudosDe(ts, 'mldlm').map((e) => [e.id, e.n]), [['lanz', 1], ['reto', 1]]);
  const s = semanasDelMes('2026-10');
  assert.equal(s[0][0].dia, '2026-09-28'); // lunes
  assert.equal(s[0][3].dia, '2026-10-01');
  assert.equal(s.at(-1)[6].dia, '2026-11-01');
  assert.ok(s.flat().filter((x) => x.delMes).length === 31);
  assert.equal(mesMas('2026-12', 1), '2027-01');
  assert.equal(mesMas('2026-01', -1), '2025-12');
});

test('operativa: embudo al que pertenece cada código', async () => {
  const { embudoDeCodigo } = await import('../lib/operativa.js');
  const config = { embudos: [{ id: 'lanz', nombre: 'Lanzamientos', tipo: 'lanzamientos' }, { id: 'reto', nombre: 'Reto Ovulación', tipo: 'directa' }, { id: 'vsl', nombre: 'VSL Raíces', tipo: 'vsl' }],
    launches: { oct: { embudo: 'lanz' } }, directas: { reto: { name: 'Reto' } }, vsls: { vsl: { name: 'VSL' } }, meteoricos: { m1: { lanzamiento: 'oct' } } };
  assert.deepEqual(embudoDeCodigo(config, 'oct'), { id: 'lanz', nombre: 'Lanzamientos', tipo: 'lanzamientos' });
  assert.equal(embudoDeCodigo(config, 'reto').nombre, 'Reto Ovulación');
  assert.equal(embudoDeCodigo(config, 'vsl').tipo, 'vsl');
  assert.equal(embudoDeCodigo(config, 'm1').id, 'lanz');
});

test('operativa: filtro de tiempo (hoy, semana, quincena, mes)', () => {
  const hoy = '2026-10-15'; // jueves
  assert.deepEqual(limitesRango('semana', hoy), { desde: '2026-10-12', hasta: '2026-10-18' });
  assert.deepEqual(limitesRango('mes', hoy), { desde: '2026-10-01', hasta: '2026-10-31' });
  assert.deepEqual(limitesRango('quincena', hoy), { desde: hoy, hasta: '2026-10-29' });
  assert.equal(limitesRango('', hoy), null);
  const t = (fecha, hecha = false) => ({ fecha, hecha, estado: hecha ? 'hecha' : 'pendiente' });
  assert.equal(enRango(t('2026-10-15'), 'hoy', hoy), true);
  assert.equal(enRango(t('2026-10-10'), 'hoy', hoy), true); // vencida: sigue pendiente, sale hoy
  assert.equal(enRango(t('2026-10-10', true), 'hoy', hoy), false); // hecha otro día: no
  assert.equal(enRango(t('2026-10-16'), 'hoy', hoy), false);
  assert.equal(enRango(t('2026-10-18'), 'semana', hoy), true);
  assert.equal(enRango(t('2026-10-19'), 'semana', hoy), false);
  assert.equal(enRango(t('2026-10-29'), 'quincena', hoy), true);
  assert.equal(enRango(t('2026-11-01'), 'mes', hoy), false);
  assert.equal(enRango(t(''), 'mes', hoy), false);
  assert.equal(enRango(t(''), '', hoy), true);
});

test('operativa: el perfil «Solo Operativa» entra y ve todas las tareas de su proyecto', () => {
  const olga = { superadmin: false, uid: 'olga', user: { id: 'olga', accesos: { discendo: 'operativa' } } };
  assert.deepEqual(proyectosSoloOperativa(olga), ['discendo']);
  assert.equal(puedeOperativa(olga), true);
  assert.deepEqual(proyectosQueGestiona(olga), []); // no gestiona tableros ni reparte
  assert.deepEqual(visiblesOperativa(T, olga).map((t) => t.id), ['3']);
});

test('operativa: el tablero de cada embudo es el del lanzamiento en curso', async () => {
  const { codigoVigente, idTableroEmbudo, esTableroEmbudo } = await import('../lib/operativa.js');
  const config = {
    launches: { sept: { fechaDirecto: '2026-09-10' }, oct: { fechaDirecto: '2026-10-20' }, nov: { inicioCaptacion: '2026-11-01' } },
    meteoricos: { flash: { lanzamiento: 'oct' } },
  };
  const { vigente, raiz } = codigoVigente(config, ['sept', 'oct', 'flash']);
  assert.equal(vigente, 'oct');
  assert.equal(raiz('flash'), 'oct'); // el meteórico va con su lanzamiento
  // Noviembre aún no ha empezado: manda octubre mientras esté en marcha; cuando empieza noviembre, pasa a noviembre.
  assert.equal(codigoVigente(config, ['sept', 'oct', 'nov'], '2026-10-25').vigente, 'oct');
  assert.equal(codigoVigente(config, ['sept', 'oct', 'nov'], '2026-11-02').vigente, 'nov');
  const conCierre = { launches: { oct: { inicioCaptacion: '2026-10-01', fechaDirecto: '2026-10-20', cierreCarrito: '2026-10-27T23:59' }, nov: { inicioCaptacion: '2026-11-10', fechaDirecto: '2026-11-25' } } };
  assert.equal(codigoVigente(conCierre, ['oct', 'nov'], '2026-10-26').vigente, 'oct', 'carrito de octubre abierto');
  assert.equal(codigoVigente(conCierre, ['oct', 'nov'], '2026-10-30').vigente, 'nov', 'octubre cerrado: se prepara noviembre');
  assert.equal(idTableroEmbudo('Lanzamientos Curso 2'), 'e-lanzamientos-curso-2');
  assert.ok(esTableroEmbudo('e-lanz') && !esTableroEmbudo('general'));
});
